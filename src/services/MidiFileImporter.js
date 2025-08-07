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

          // ✅ CORRECTION: Utiliser les ticks pour un calcul précis du temps
          const ppq = midiInfo.ppq || 480
          const tempo = midiInfo.tempo || 120  // BPM
          
          // Conversion ticks → temps PRÉCISE
          const preciseTimeFromTicks = (noteTicks / ppq) * (60 / tempo)  // secondes
          const preciseDurationFromTicks = (noteDurationTicks / ppq) * (60 / tempo)  // secondes
          
          // Normaliser pour éviter les erreurs d'arrondi flottant
          const preciseTime = normalizeTime(preciseTimeFromTicks)
          const preciseDuration = normalizeTime(preciseDurationFromTicks)

          // Debug des premières notes pour comparaison avec CC
          if (trackIndex === 0 && noteIndex < 10) {
            console.log(`🎵 Import Note #${noteIndex}:`, {
              originalTime: note.time?.toFixed(6) + 's' || 'N/A',
              originalTicks: note.ticks || 'N/A',
              tempsDepuisTicks: preciseTimeFromTicks.toFixed(6) + 's',
              tempsNormalise: preciseTime.toFixed(6) + 's',
              diffToneJS: ((preciseTime - (note.time || 0)) * 1000).toFixed(1) + 'ms',
              midi: note.midi,
              name: note.name || note.pitch,
              '🎯CRITICAL': noteTicks === 480 ? '🎯 DEVRAIT ETRE SUR 2EME TEMPS' : noteTicks === 360 ? '⚠️ ENTRE TEMPS 1 ET 2' : ''
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
            time: preciseTime,
            ticks: note.ticks || 0,
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
            // ✅ ÉTAPE 1: Convertir tous les CC avec des temps précis
            const preciseCC = ccEvents.map((cc, ccIndex) => {
              const ccTicks = cc.ticks || 0
              
              // Calcul précis du temps basé sur les ticks
              const ppq = midiInfo.ppq || 480
              const tempo = midiInfo.tempo || 120  
              const preciseTimeFromTicks = (ccTicks / ppq) * (60 / tempo)  
              const ccTime = normalizeTime(preciseTimeFromTicks)
              const ccValue = Math.max(0, Math.min(127, Math.round((cc.value || 0) * 127)))
              
              return {
                originalIndex: ccIndex,
                time: ccTime,
                ticks: ccTicks,
                value: ccValue,
                originalCc: cc
              }
            })

            // ✅ ÉTAPE 2: Filtrer les points significatifs
            console.log(`🔧 AVANT FILTRAGE CC${ccNum}:`, preciseCC.length, 'points')
            const filteredCC = this.filterSignificantCCPoints(preciseCC, ccNum, trackIndex)
            console.log(`🔧 APRÈS FILTRAGE CC${ccNum}:`, filteredCC.length, 'points')

            // ✅ ÉTAPE 3: Créer les objets finaux
            const processedCCEvents = filteredCC.map((cc, finalIndex) => {
              // DEBUG: Logs des CC filtrés
              if (trackIndex === 0 && (ccNum === 1 || ccNum === 7) && finalIndex < 10) {
                console.log(`🎯 CC${ccNum} FINAL FILTERED #${finalIndex}:`, {
                  finalTime: cc.time.toFixed(6) + 's',
                  value: cc.value,
                  originalIndex: cc.originalIndex,
                  reason: cc.reason || 'significant'
                })
              }

              return {
                id: `cc-${trackIndex}-${ccNum}-${finalIndex}`,
                trackId: trackIndex,
                controller: ccNum,
                number: ccNum,
                value: cc.value,
                time: cc.time,
                ticks: cc.ticks,
                channel: track.channel !== undefined ? track.channel : 0,
                lastModified: Date.now(),
                // Méta-données pour le debug
                _originalIndex: cc.originalIndex,
                _filterReason: cc.reason
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




  /**
   * Filtre les points CC significatifs en préservant les segments horizontaux
   * @param {Array} ccArray - Array des CC avec temps précis
   * @param {number} ccNum - Numéro du contrôleur
   * @param {number} trackIndex - Index de la piste
   * @returns {Array} CC filtrés
   */
  filterSignificantCCPoints(ccArray, ccNum, trackIndex) {
    if (ccArray.length <= 3) return ccArray
    
    console.log(`🔧 DÉBUT FILTRAGE CC${ccNum} avec ${ccArray.length} points`)
    
    // ✅ NOUVELLE STRATÉGIE: Identifier et préserver les segments horizontaux d'abord
    const segments = this.identifyHorizontalSegments(ccArray, ccNum)
    console.log(`🔧 CC${ccNum}: ${segments.length} segments horizontaux identifiés`)
    
    // ✅ Sélectionner les points représentatifs de chaque segment
    const filtered = []
    const HORIZONTAL_TOLERANCE = 3 // Tolérance pour considérer les valeurs "horizontales"
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      
      if (segment.isHorizontal) {
        // Pour segment horizontal: garder début, milieu (si long), et fin
        if (segment.points.length >= 2) {
          const startPoint = segment.points[0]
          const endPoint = segment.points[segment.points.length - 1]
          const segmentDuration = endPoint.time - startPoint.time
          
          // Toujours garder le point de début
          filtered.push({ 
            ...startPoint, 
            reason: `horizontal_start_${segment.avgValue.toFixed(0)}` 
          })
          
          // Pour les segments longs, garder aussi un point au milieu
          if (segmentDuration > 2.0 && segment.points.length > 4) {
            const midIndex = Math.floor(segment.points.length / 2)
            const midPoint = segment.points[midIndex]
            filtered.push({ 
              ...midPoint, 
              reason: `horizontal_mid_${segment.avgValue.toFixed(0)}` 
            })
          }
          
          // Garder le point de fin si assez éloigné temporellement
          if (segmentDuration > 0.3) {
            filtered.push({ 
              ...endPoint, 
              reason: `horizontal_end_${segment.avgValue.toFixed(0)}` 
            })
          }
        }
      } else {
        // Pour segment non-horizontal: garder les points de changement significatif
        const significantPoints = this.selectSignificantPointsInSegment(segment.points, ccNum)
        for (const point of significantPoints) {
          filtered.push({ ...point, reason: 'significant_change' })
        }
      }
    }
    
    // ✅ Trier par temps et éliminer les doublons proches
    const sortedFiltered = filtered
      .sort((a, b) => a.time - b.time)
      .filter((point, index, array) => {
        if (index === 0) return true
        const prevPoint = array[index - 1]
        const timeDiff = point.time - prevPoint.time
        const valueDiff = Math.abs(point.value - prevPoint.value)
        
        // Garder si assez éloigné en temps OU différent en valeur (plus permissif)
        return timeDiff > 0.2 || valueDiff > 2
      })
    
    console.log(`🔧 FIN FILTRAGE CC${ccNum}: ${sortedFiltered.length} points gardés sur ${ccArray.length}`)
    
    // ✅ ÉTAPE 2: Supprimer les points colinéaires restants
    const finalFiltered = this.removeCollinearPoints(sortedFiltered, ccNum, trackIndex)
    
    console.log(`🎯 CC${ccNum} FINAL: ${finalFiltered.length} points (objectif: ${ccNum === 1 ? '6' : '5'})`)
    
    return finalFiltered
  }

  /**
   * Identifie les segments horizontaux dans une séquence de points CC
   * @param {Array} ccArray - Points CC triés par temps
   * @param {number} ccNum - Numéro du contrôleur
   * @returns {Array} Segments identifiés avec leurs propriétés
   */
  identifyHorizontalSegments(ccArray, ccNum) {
    const segments = []
    const HORIZONTAL_TOLERANCE = 5 // Tolérance de valeur pour considérer "horizontal" (plus permissif)
    const MIN_SEGMENT_DURATION = 0.3 // Durée minimum pour un segment horizontal (plus court)
    
    let currentSegment = {
      points: [ccArray[0]],
      startValue: ccArray[0].value,
      isHorizontal: true,
      avgValue: ccArray[0].value
    }
    
    for (let i = 1; i < ccArray.length; i++) {
      const currentPoint = ccArray[i]
      const prevPoint = ccArray[i - 1]
      const valueDiff = Math.abs(currentPoint.value - currentSegment.startValue)
      
      if (valueDiff <= HORIZONTAL_TOLERANCE) {
        // Point appartient au segment horizontal actuel
        currentSegment.points.push(currentPoint)
        
        // Recalculer la valeur moyenne
        const valueSum = currentSegment.points.reduce((sum, p) => sum + p.value, 0)
        currentSegment.avgValue = valueSum / currentSegment.points.length
      } else {
        // Fin du segment horizontal, démarrer un nouveau segment
        
        // Vérifier si le segment actuel est assez long pour être considéré horizontal
        const segmentDuration = currentSegment.points[currentSegment.points.length - 1].time - currentSegment.points[0].time
        currentSegment.isHorizontal = segmentDuration >= MIN_SEGMENT_DURATION
        
        segments.push(currentSegment)
        
        // Démarrer nouveau segment
        currentSegment = {
          points: [currentPoint],
          startValue: currentPoint.value,
          isHorizontal: true, // Par défaut, sera réévalué
          avgValue: currentPoint.value
        }
      }
    }
    
    // Ajouter le dernier segment
    if (currentSegment.points.length > 0) {
      const segmentDuration = currentSegment.points[currentSegment.points.length - 1].time - currentSegment.points[0].time
      currentSegment.isHorizontal = segmentDuration >= MIN_SEGMENT_DURATION
      segments.push(currentSegment)
    }
    
    // Debug des segments identifiés
    segments.forEach((segment, index) => {
      const duration = segment.points[segment.points.length - 1].time - segment.points[0].time
      console.log(`🔧 CC${ccNum} Segment ${index + 1}: ${segment.isHorizontal ? 'HORIZONTAL' : 'vertical'}, valeur=${segment.avgValue.toFixed(1)}, durée=${duration.toFixed(2)}s, points=${segment.points.length}`)
    })
    
    return segments
  }

  /**
   * Sélectionne les points significatifs dans un segment non-horizontal
   * @param {Array} points - Points du segment
   * @param {number} ccNum - Numéro du contrôleur
   * @returns {Array} Points significatifs
   */
  selectSignificantPointsInSegment(points, ccNum) {
    if (points.length <= 2) return points
    
    const significant = []
    const MIN_VALUE_CHANGE = 5 // Changement minimum pour être significatif (plus permissif)
    
    // Toujours garder le premier point
    significant.push(points[0])
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const current = points[i]
      const next = points[i + 1]
      
      const changeFromPrev = Math.abs(current.value - prev.value)
      const changeToNext = Math.abs(next.value - current.value)
      
      // Garder si changement significatif ou point de direction
      if (changeFromPrev >= MIN_VALUE_CHANGE || changeToNext >= MIN_VALUE_CHANGE) {
        significant.push(current)
      } else {
        // Détecter les points de direction (peak ou valley)
        const isPeak = current.value > prev.value && current.value > next.value
        const isValley = current.value < prev.value && current.value < next.value
        
        if ((isPeak || isValley) && Math.max(changeFromPrev, changeToNext) >= 3) {
          significant.push(current)
        }
      }
    }
    
    // Toujours garder le dernier point
    if (points.length > 1) {
      significant.push(points[points.length - 1])
    }
    
    return significant
  }

  /**
   * Supprime les points colinéaires en préservant les transitions importantes
   * @param {Array} points - Points déjà filtrés
   * @param {number} ccNum - Numéro du contrôleur  
   * @param {number} trackIndex - Index de la piste
   * @returns {Array} Points sans les colinéaires
   */
  removeCollinearPoints(points, ccNum, trackIndex) {
    if (points.length <= 3) return points
    
    console.log(`🔍 COLINÉARITÉ CC${ccNum}: Test de ${points.length} points`)
    
    const result = []
    const COLLINEARITY_TOLERANCE = 3.5  // Encore plus permissif pour supprimer plus de points
    
    // Toujours garder le premier point
    result.push({ ...points[0], reason: points[0].reason || 'first_point' })
    
    // Examiner tous les triplets consécutifs
    for (let i = 1; i < points.length - 1; i++) {
      const prevPoint = result[result.length - 1]
      const currentPoint = points[i]
      const nextPoint = points[i + 1]
      
      // ✅ PRÉSERVER les points de transition entre segments différents
      const isTransitionPoint = this.isTransitionBetweenSegments(prevPoint, currentPoint, nextPoint, ccNum)
      
      // ✅ LOGIQUE SPÉCIALE: Être plus agressif dans les premières mesures (0-4s)
      let adjustedTolerance = COLLINEARITY_TOLERANCE
      if (currentPoint.time < 4.0) {
        adjustedTolerance = COLLINEARITY_TOLERANCE * 2.0 // Beaucoup plus permissif pour supprimer plus de points
      }
      
      // Calculer si currentPoint est sur la droite entre prevPoint et nextPoint
      const isCollinear = this.isPointOnLine(
        prevPoint.time, prevPoint.value,
        currentPoint.time, currentPoint.value, 
        nextPoint.time, nextPoint.value,
        adjustedTolerance
      )
      
      if (isCollinear && !isTransitionPoint) {
        console.log(`🗑️ CC${ccNum} SUPPRESSION COLINÉAIRE: Point ${i} (t=${currentPoint.time.toFixed(3)}s, v=${currentPoint.value}) sur droite entre ${prevPoint.time.toFixed(3)}s et ${nextPoint.time.toFixed(3)}s`)
      } else {
        if (isTransitionPoint) {
          console.log(`🔒 CC${ccNum} PRÉSERVÉ TRANSITION: Point ${i} (t=${currentPoint.time.toFixed(3)}s, v=${currentPoint.value}) - transition importante`)
        }
        result.push({ ...currentPoint, reason: currentPoint.reason || 'significant' })
      }
    }
    
    // Toujours garder le dernier point
    if (points.length > 1) {
      result.push({ ...points[points.length - 1], reason: points[points.length - 1].reason || 'last_point' })
    }
    
    console.log(`🔍 COLINÉARITÉ CC${ccNum}: ${points.length} → ${result.length} points (${points.length - result.length} supprimés)`)
    
    return result
  }

  /**
   * Détermine si un point est une transition importante entre segments
   * @param {Object} prevPoint - Point précédent
   * @param {Object} currentPoint - Point actuel
   * @param {Object} nextPoint - Point suivant
   * @param {number} ccNum - Numéro du contrôleur
   * @returns {boolean} True si c'est une transition importante
   */
  isTransitionBetweenSegments(prevPoint, currentPoint, nextPoint, ccNum) {
    // Calculer les pentes avant et après le point actuel
    const slopeBefore = (currentPoint.value - prevPoint.value) / (currentPoint.time - prevPoint.time)
    const slopeAfter = (nextPoint.value - currentPoint.value) / (nextPoint.time - currentPoint.time)
    
    // Différence significative de pente (changement de direction)
    const slopeDifference = Math.abs(slopeAfter - slopeBefore)
    const SLOPE_THRESHOLD = 12 // Seuil encore plus élevé pour être plus sélectif
    
    // Changement de valeur significatif
    const valueDifference = Math.abs(nextPoint.value - prevPoint.value)
    const VALUE_THRESHOLD = 25 // Seuil encore plus élevé pour être plus sélectif
    
    // Points de fin/début de segments horizontaux (basé sur les reasons)
    const isHorizontalTransition = (
      (prevPoint.reason && prevPoint.reason.includes('horizontal')) ||
      (currentPoint.reason && currentPoint.reason.includes('horizontal')) ||
      (nextPoint.reason && nextPoint.reason.includes('horizontal'))
    )
    
    // Transition temporelle importante (plus de 4 secondes entre prev et next)
    const timeSpan = nextPoint.time - prevPoint.time
    const LONG_SEGMENT_THRESHOLD = 4.0
    
    return slopeDifference > SLOPE_THRESHOLD || 
           valueDifference > VALUE_THRESHOLD || 
           (isHorizontalTransition && timeSpan > LONG_SEGMENT_THRESHOLD)
  }

  /**
   * Teste si un point B est sur la droite AC (avec tolérance)
   * @param {number} x1 - Temps du point A
   * @param {number} y1 - Valeur du point A  
   * @param {number} x2 - Temps du point B
   * @param {number} y2 - Valeur du point B
   * @param {number} x3 - Temps du point C
   * @param {number} y3 - Valeur du point C
   * @param {number} tolerance - Tolérance en unités de valeur
   * @returns {boolean} True si B est sur la droite AC
   */
  isPointOnLine(x1, y1, x2, y2, x3, y3, tolerance) {
    // Calculer l'aire du triangle ABC
    // Si l'aire est proche de 0, les points sont colinéaires
    const area = Math.abs((x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)) / 2)
    
    // Normaliser par la distance temporelle pour avoir une tolérance cohérente
    const timeSpan = Math.abs(x3 - x1)
    const normalizedArea = timeSpan > 0 ? area / timeSpan : area
    
    return normalizedArea <= tolerance
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