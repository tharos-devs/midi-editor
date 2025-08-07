// services/MidiFileImporter.js - Service d'import MIDI extrait de midi.js
import { Midi } from '@tonejs/midi'
import { normalizeTime, normalizeCCTime, normalizeNoteTime, formatTime, debugTimeDifference, quantizeCCTime } from '@/utils/precision'

export class MidiFileImporter {
  constructor() {
    this.supportedFormats = ['.mid', '.midi']
  }

  /**
   * Importe un fichier MIDI et le convertit au format interne
   * @param {ArrayBuffer} arrayBuffer - Données binaires du fichier MIDI
   * @param {string} filename - Nom du fichier
   * @returns {Object} Données MIDI formatées pour le store
   */
  async importFromFile(arrayBuffer, filename = '') {
    console.log('🚨🚨🚨 DEBUT IMPORT MIDI FILE 🚨🚨🚨')
    try {
      // Charger avec Tone.js
      const toneMidi = new Midi(arrayBuffer)
      
      // Convertir au format interne
      const midiData = this.convertToInternalFormat(toneMidi, filename)
      
      
      return {
        success: true,
        data: midiData,
        message: 'Fichier MIDI importé avec succès'
      }
    } catch (error) {
      console.error('Erreur lors de l\'import MIDI:', error)
      return {
        success: false,
        data: null,
        message: `Erreur d'import: ${error.message}`
      }
    }
  }

  /**
   * Convertit les données Tone.js vers le format interne du store
   */
  convertToInternalFormat(toneMidi, filename) {
    // Extraire les informations générales
    const midiInfo = this.extractMidiInfo(toneMidi, filename)
    
    // Extraire les événements de contrôle globaux
    const controlEvents = this.extractControlEvents(toneMidi, midiInfo)
    
    // Extraire et formater les pistes en passant les événements de contrôle
    const tracksData = this.extractTracks(toneMidi, midiInfo, controlEvents.tempoEvents)
    
    // Calculer les tableaux globaux
    const allNotes = this.getAllNotes(tracksData.tracks)
    const allCC = this.getAllControlChanges(tracksData.tracks)

    return {
      midiInfo,
      tracks: tracksData.tracks,
      notes: allNotes,
      midiCC: allCC,
      tempoEvents: controlEvents.tempoEvents,
      timeSignatureEvents: controlEvents.timeSignatureEvents,
      keySignatureEvents: controlEvents.keySignatureEvents
    }
  }

  /**
   * Extraction des informations générales du fichier MIDI
   */
  extractMidiInfo(toneMidi, filename) {
    const header = toneMidi.header

    return {
      name: filename,
      duration: toneMidi.duration,
      durationTicks: toneMidi.durationTicks,
      ticksPerQuarter: header.ticksPerQuarter || 480,
      ppq: header.ppq || 480,
      format: header.format || 1,
      numTracks: toneMidi.tracks.length,
      timeSignature: header.timeSignatures && header.timeSignatures.length > 0
        ? [header.timeSignatures[0].timeSignature[0], header.timeSignatures[0].timeSignature[1]]
        : [4, 4],
      keySignature: header.keySignatures && header.keySignatures.length > 0
        ? header.keySignatures[0].key
        : 'C',
      tempo: header.tempos && header.tempos.length > 0
        ? header.tempos[0].bpm
        : 120
    }
  }

  /**
   * Extraction des événements de contrôle globaux
   */
  extractControlEvents(toneMidi, midiInfo) {
    const header = toneMidi.header

    // Tempo Events
    const tempos = header.tempos || []
    const tempoEvents = tempos
      .map((tempo, index) => ({
        id: `tempo-${index}`,
        bpm: tempo.bpm,
        time: tempo.time,
        ticks: tempo.ticks
      }))
      .sort((a, b) => a.time - b.time)

    if (tempoEvents.length === 0) {
      tempoEvents.push({
        id: 'tempo-default',
        bpm: midiInfo.tempo || 120,
        time: 0,
        ticks: 0
      })
    }

    // Time Signature Events
    const allTimeSignatures = []
    if (header.timeSignatures && header.timeSignatures.length > 0) {
      allTimeSignatures.push(...header.timeSignatures)
    }

    const timeSignatureEvents = allTimeSignatures.map((ts, index) => {
      let numerator = 4, denominator = 4, time = 0, ticks = 0

      if (ts.timeSignature && Array.isArray(ts.timeSignature)) {
        numerator = ts.timeSignature[0] || 4
        denominator = ts.timeSignature[1] || 4
      }

      time = ts.time || 0
      ticks = ts.ticks || 0

      return {
        id: `timesig-${index}`,
        numerator,
        denominator,
        time,
        ticks
      }
    })

    if (timeSignatureEvents.length === 0) {
      timeSignatureEvents.push({
        id: 'timesig-default',
        numerator: 4,
        denominator: 4,
        time: 0,
        ticks: 0
      })
    }

    // Key Signature Events
    const keySignatures = header.keySignatures || []
    const keySignatureEvents = keySignatures.map((ks, index) => ({
      id: `keysig-${index}`,
      key: ks.key,
      scale: ks.scale,
      time: ks.time,
      ticks: ks.ticks
    }))

    return {
      tempoEvents: tempoEvents.sort((a, b) => a.time - b.time),
      timeSignatureEvents: timeSignatureEvents.sort((a, b) => a.time - b.time),
      keySignatureEvents
    }
  }

  /**
   * Extraction et formatage des pistes
   */
  extractTracks(toneMidi, midiInfo, tempoEvents = []) {
    const tracks = []

    toneMidi.tracks.forEach((track, trackIndex) => {
      const trackData = {
        id: trackIndex,
        name: track.name || `Piste ${trackIndex + 1}`,
        channel: track.channel !== undefined ? track.channel : 0,
        instrument: track.instrument ? {
          name: track.instrument.name || 'Piano',
          number: track.instrument.number || 0
        } : { name: 'Piano', number: 0 },
        notes: [],
        controlChanges: {},
        pitchBends: [],
        volume: 100,
        pan: 64,
        bank: 0,
        midiOutput: 'default',
        muted: false,
        solo: false,
        color: this.getTrackColor(trackIndex),
        lastModified: Date.now()
      }

      // Traitement des notes
      if (track.notes && track.notes.length > 0) {
        track.notes.forEach((note, noteIndex) => {
          const noteTicks = note.ticks || 0
          const noteDurationTicks = note.durationTicks || 0

          // PRÉCISION: Normaliser les temps à 6 décimales pour éviter les erreurs d'arrondi
          const preciseTime = normalizeTime(note.time || 0)
          const preciseEndTime = normalizeTime((note.time || 0) + (note.duration || 0))
          const preciseDuration = normalizeTime(preciseEndTime - preciseTime)
          
          // 🎼 QUANTISATION TEMPORELLE: Aligner les notes sur la grille rythmique
          const shouldQuantize = true // TODO: Option dans les settings
          let finalTime = preciseTime
          
          if (shouldQuantize && trackIndex === 0) { // Quantifier seulement la piste principale pour test
            // Quantifier sur 1/16èmes à 120 BPM (0.125s par 16ème)
            const sixteenthNoteDuration = 0.125 // 60 / (120 * 4)
            const quantizedTime = Math.round(preciseTime / sixteenthNoteDuration) * sixteenthNoteDuration
            
            // Log seulement si différence significative
            if (Math.abs(quantizedTime - preciseTime) > 0.01) {
              console.log(`🎼 QUANTISATION ${note.name || note.pitch}:`, {
                tempsOriginal: preciseTime.toFixed(3) + 's',
                tempsQuantifié: quantizedTime.toFixed(3) + 's',
                différence: (quantizedTime - preciseTime).toFixed(3) + 's',
                grille: '1/16 @ 120 BPM'
              })
            }
            
            finalTime = normalizeTime(quantizedTime)
          }

          // Debug des premières notes pour comparaison avec CC
          if (trackIndex === 0 && noteIndex < 10) {
            console.log(`🎵 Import Note #${noteIndex}:`, {
              originalTime: note.time?.toFixed(3) + 's' || 'N/A',
              originalTicks: note.ticks || 'N/A',
              convertedTime: preciseTime.toFixed(3) + 's',
              finalTime: finalTime.toFixed(3) + 's',
              quantized: shouldQuantize && Math.abs(finalTime - preciseTime) > 0.01 ? '✅ OUI' : '❌ NON',
              difference: ((finalTime - (note.time || 0)) * 1000).toFixed(1) + 'ms',
              midi: note.midi,
              name: note.name || note.pitch
            })
          }

          const noteData = {
            id: `${trackIndex}-${noteIndex}`,
            trackId: trackIndex,
            name: note.name || '',
            midi: note.midi || 0,
            pitch: note.pitch || '',
            octave: note.octave || 0,
            velocity: note.velocity || 0,
            duration: preciseDuration,
            durationTicks: note.durationTicks || 0,
            time: finalTime, // Utiliser le temps quantifié au lieu de preciseTime
            ticks: note.ticks || 0,
            originalTime: preciseTime, // Conserver le temps original pour référence
            channel: track.channel !== undefined ? track.channel : 0,
            tempoAtStart: this.getTempoAtTicks(noteTicks, midiInfo),
            lastModified: Date.now()
          }

          trackData.notes.push(noteData)
        })
      }

      // Traitement des Control Changes
      if (track.controlChanges && typeof track.controlChanges === 'object') {
        trackData.controlChanges = {}

        Object.entries(track.controlChanges).forEach(([ccNumber, ccEvents]) => {
          const ccNum = parseInt(ccNumber)

          if (Array.isArray(ccEvents) && ccEvents.length > 0) {
            const processedCCEvents = ccEvents.map((cc, ccIndex) => {
              const ccTicks = cc.ticks || 0
              
              // PRÉCISION: Normaliser le temps CC à 6 décimales (pas de quantification)
              const ccTime = normalizeTime(cc.time || 0)
              const ccValue = Math.max(0, Math.min(127, Math.round((cc.value || 0) * 127)))
              
              
              // DEBUG SIMPLE: Temps bruts des premiers CC1 ET CC7
              if (trackIndex === 0 && (ccNum === 1 || ccNum === 7) && ccIndex < 10) {
                console.log(`🚨 CC${ccNum} RAW DATA #${ccIndex}:`, {
                  time: cc.time,
                  ticks: cc.ticks,
                  value: cc.value,
                  trackIndex,
                  controller: ccNum
                })
              }

              // Debug final avant stockage
              if (trackIndex === 0 && ccNum === 1 && ccIndex < 3) {
                console.log(`🔍 CC final object creation:`, {
                  ccTime: ccTime,
                  ccTicks: ccTicks,
                  originalCcTime: cc.time,
                  finalTime: ccTime
                })
              }

              return {
                id: `cc-${trackIndex}-${ccNum}-${ccIndex}`,
                trackId: trackIndex,
                controller: ccNum, // Utiliser 'controller' au lieu de 'number'
                number: ccNum, // Garder aussi 'number' pour compatibilité
                value: ccValue,
                time: ccTime,
                ticks: ccTicks,
                channel: track.channel !== undefined ? track.channel : 0,
                lastModified: Date.now()
              }
            })

            trackData.controlChanges[ccNum] = processedCCEvents
          } else {
            trackData.controlChanges[ccNum] = []
          }
        })
      } else {
        trackData.controlChanges = {}
      }

      // Traitement des Pitch Bends
      if (track.pitchBends && track.pitchBends.length > 0) {
        trackData.pitchBends = track.pitchBends.map((pb, index) => ({
          id: `pb-${trackIndex}-${index}`,
          trackId: trackIndex,
          value: pb.value || 0,
          time: pb.time || 0,
          ticks: pb.ticks || 0,
          lastModified: Date.now()
        }))
      } else {
        trackData.pitchBends = []
      }

      tracks.push(trackData)
    })

    return { tracks }
  }




  getTempoAtTicks(ticks, midiInfo, tempoEvents = []) {
    if (tempoEvents.length === 0) {
      return midiInfo.tempo || 120
    }

    let currentTempo = midiInfo.tempo || 120

    for (const tempoEvent of tempoEvents) {
      if (tempoEvent.ticks <= ticks) {
        currentTempo = tempoEvent.bpm
      } else {
        break
      }
    }

    return currentTempo
  }

  /**
   * Génère les tableaux globaux de notes
   */
  getAllNotes(tracks) {
    const allNotes = []
    
    tracks.forEach(track => {
      if (track.notes && track.notes.length > 0) {
        allNotes.push(...track.notes)
      }
    })

    return allNotes.sort((a, b) => a.time - b.time)
  }

  /**
   * Génère le tableau global des Control Changes
   */
  getAllControlChanges(tracks) {
    const allCC = []
    
    tracks.forEach((track, trackIndex) => {
      if (track.controlChanges && typeof track.controlChanges === 'object') {
        const ccKeys = Object.keys(track.controlChanges)
        // console.log(`🎛️ Piste ${trackIndex} (${track.name}): ${ccKeys.length} types de CC:`, ccKeys)
        
        Object.values(track.controlChanges).forEach(ccArray => {
          if (Array.isArray(ccArray)) {
            // console.log(`  → ${ccArray.length} événements CC pour ce type`)
            allCC.push(...ccArray)
          }
        })
      }
    })

    // console.log(`🎛️ Total CC extraits du fichier MIDI: ${allCC.length}`)
    return allCC.sort((a, b) => a.time - b.time)
  }

  /**
   * Génère une couleur pour une piste
   */
  getTrackColor(index) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
    return colors[index % colors.length]
  }

  /**
   * Valide si un fichier est un MIDI valide
   */
  validateMidiFile(arrayBuffer) {
    try {
      // Vérifier les premiers bytes (header MIDI)
      const view = new DataView(arrayBuffer)
      const header = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1), 
        view.getUint8(2),
        view.getUint8(3)
      )
      
      return header === 'MThd'
    } catch (error) {
      return false
    }
  }

  /**
   * Obtient des informations de base sur le fichier MIDI sans l'importer complètement
   */
  async getFileInfo(arrayBuffer) {
    try {
      if (!this.validateMidiFile(arrayBuffer)) {
        throw new Error('Fichier MIDI invalide')
      }

      const toneMidi = new Midi(arrayBuffer)
      
      return {
        success: true,
        info: {
          duration: toneMidi.duration,
          trackCount: toneMidi.tracks.length,
          format: toneMidi.header.format || 1,
          ppq: toneMidi.header.ppq || 480,
          tempo: toneMidi.header.tempos?.[0]?.bpm || 120,
          timeSignature: toneMidi.header.timeSignatures?.[0]?.timeSignature || [4, 4],
          hasNotes: toneMidi.tracks.some(track => track.notes && track.notes.length > 0),
          hasControlChanges: toneMidi.tracks.some(track => track.controlChanges && Object.keys(track.controlChanges).length > 0)
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

// Export par défaut
export default MidiFileImporter