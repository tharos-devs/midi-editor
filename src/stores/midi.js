// stores/midi.js - Version corrigée avec gestion des changements de tempo
import { defineStore } from 'pinia'
import { ref, computed, markRaw } from 'vue'
import { Midi } from '@tonejs/midi'

export const useMidiStore = defineStore('midi', () => {
  // État réactif
  const notes = ref([])
  const tracks = ref([])
  const midiInfo = ref({})
  const midiCC = ref([])
  const tempoEvents = ref([])
  const timeSignatureEvents = ref([])
  const keySignatureEvents = ref([])
  const selectedTrack = ref(null)
  const selectedNote = ref(null)
  
  // Données Tone.js
  const toneMidi = ref(null)
  const isLoaded = ref(false)
  const filename = ref('')

  // === NOUVELLES FONCTIONS DE CONVERSION PRÉCISES ===
  
  /**
   * Convertit des ticks en temps en tenant compte des changements de tempo
   */
  function ticksToTimeAccurate(ticks) {
    if (!isLoaded.value || tempoEvents.value.length === 0) {
      // Fallback avec tempo fixe
      const ppq = midiInfo.value.ppq || 480
      const tempo = midiInfo.value.tempo || 120
      return (ticks / ppq) * (60 / tempo)
    }

    let currentTime = 0
    let currentTicks = 0
    let currentTempo = midiInfo.value.tempo || 120
    const ppq = midiInfo.value.ppq || 480

    // Parcourir tous les événements de tempo jusqu'aux ticks demandés
    for (const tempoEvent of tempoEvents.value) {
      const eventTicks = tempoEvent.ticks || 0
      
      if (eventTicks > ticks) {
        // L'événement de tempo est après nos ticks, calculer avec le tempo actuel
        const ticksDiff = ticks - currentTicks
        const timeDiff = (ticksDiff / ppq) * (60 / currentTempo)
        return currentTime + timeDiff
      } else {
        // Calculer le temps jusqu'à cet événement de tempo
        const ticksDiff = eventTicks - currentTicks
        const timeDiff = (ticksDiff / ppq) * (60 / currentTempo)
        currentTime += timeDiff
        currentTicks = eventTicks
        currentTempo = tempoEvent.bpm
      }
    }

    // Calculer le reste avec le dernier tempo
    const remainingTicks = ticks - currentTicks
    const remainingTime = (remainingTicks / ppq) * (60 / currentTempo)
    return currentTime + remainingTime
  }

  /**
   * Convertit du temps en ticks en tenant compte des changements de tempo
   */
  function timeToTicksAccurate(time) {
    if (!isLoaded.value || tempoEvents.value.length === 0) {
      // Fallback avec tempo fixe
      const ppq = midiInfo.value.ppq || 480
      const tempo = midiInfo.value.tempo || 120
      return (time * tempo * ppq) / 60
    }

    let currentTime = 0
    let currentTicks = 0
    let currentTempo = midiInfo.value.tempo || 120
    const ppq = midiInfo.value.ppq || 480

    // Parcourir tous les événements de tempo jusqu'au temps demandé
    for (const tempoEvent of tempoEvents.value) {
      const eventTime = tempoEvent.time || 0
      
      if (eventTime > time) {
        // L'événement de tempo est après notre temps, calculer avec le tempo actuel
        const timeDiff = time - currentTime
        const ticksDiff = (timeDiff * currentTempo * ppq) / 60
        return currentTicks + ticksDiff
      } else {
        // Calculer les ticks jusqu'à cet événement de tempo
        const timeDiff = eventTime - currentTime
        const ticksDiff = (timeDiff * currentTempo * ppq) / 60
        currentTicks += ticksDiff
        currentTime = eventTime
        currentTempo = tempoEvent.bpm
      }
    }

    // Calculer le reste avec le dernier tempo
    const remainingTime = time - currentTime
    const remainingTicks = (remainingTime * currentTempo * ppq) / 60
    return currentTicks + remainingTicks
  }

  /**
   * Obtient le tempo à un moment donné (en secondes)
   */
  function getTempoAtTime(time) {
    if (!isLoaded.value || tempoEvents.value.length === 0) {
      return midiInfo.value.tempo || 120
    }

    let currentTempo = midiInfo.value.tempo || 120

    for (const tempoEvent of tempoEvents.value) {
      if (tempoEvent.time <= time) {
        currentTempo = tempoEvent.bpm
      } else {
        break
      }
    }

    return currentTempo
  }

  /**
   * Obtient le tempo à un moment donné (en ticks)
   */
  function getTempoAtTicks(ticks) {
    if (!isLoaded.value || tempoEvents.value.length === 0) {
      return midiInfo.value.tempo || 120
    }

    let currentTempo = midiInfo.value.tempo || 120

    for (const tempoEvent of tempoEvents.value) {
      if (tempoEvent.ticks <= ticks) {
        currentTempo = tempoEvent.bpm
      } else {
        break
      }
    }

    return currentTempo
  }

const updateMultipleNotes = (noteUpdatesMap) => {
  // noteUpdatesMap est une Map où:
  // - clé = noteId 
  // - valeur = objet avec les propriétés à mettre à jour (ex: { velocity: 0.5 })
  
  if (!noteUpdatesMap || noteUpdatesMap.size === 0) return
  
  // Sauvegarder l'état avant modification pour l'undo/redo
  if (typeof saveStateForUndo === 'function') {
    saveStateForUndo()
  }
  
  // Grouper toutes les modifications et les appliquer d'un coup
  const updatedNotes = []
  
  for (const [noteId, updates] of noteUpdatesMap) {
    const noteIndex = notes.value.findIndex(note => note.id === noteId)
    if (noteIndex !== -1) {
      // Créer une nouvelle note avec les mises à jour
      const updatedNote = {
        ...notes.value[noteIndex],
        ...updates,
        lastModified: Date.now()
      }
      
      // Remplacer la note dans le tableau
      notes.value[noteIndex] = updatedNote
      updatedNotes.push(updatedNote)
    }
  }
  
  // Émettre un seul événement pour toutes les mises à jour
  if (updatedNotes.length > 0) {
    // Déclencher les réactions Vue en une seule fois
    notes.value = [...notes.value]
    
    // Émettre les événements nécessaires
    if (typeof onNotesUpdated === 'function') {
      onNotesUpdated(updatedNotes)
    }
  }
}

  // Fonction principale de chargement
  async function loadMidiFile(arrayBuffer, name = '') {
    try {
      // Réinitialiser l'état
      resetStore()
      
      // Charger avec Tone.js et marquer comme non-réactif
      const midiData = new Midi(arrayBuffer)
      toneMidi.value = markRaw(midiData)
      filename.value = name
      
      // Extraire les informations du fichier
      extractMidiInfo()
      
      // Extraire les événements de contrôle AVANT les pistes pour avoir les tempos
      extractControlEvents()
      
      // Extraire les pistes et notes avec les conversions correctes
      extractTracks()
      
      isLoaded.value = true

      return {
        success: true,
        message: 'Fichier MIDI chargé avec succès'
      }
    } catch (error) {
      console.error('Erreur lors du chargement du fichier MIDI:', error)
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  // Extraction des informations générales du fichier
  function extractMidiInfo() {
    if (!toneMidi.value) return
    
    const midi = toneMidi.value
    const header = midi.header
    
    midiInfo.value = {
      name: filename.value,
      duration: midi.duration,
      durationTicks: midi.durationTicks,
      ticksPerQuarter: header.ticksPerQuarter || 480,
      ppq: header.ppq || 480,
      format: header.format || 1,
      numTracks: midi.tracks.length,
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

  // Extraction des événements de contrôle globaux (doit être appelé AVANT extractTracks)
  function extractControlEvents() {
    if (!toneMidi.value) return
    
    const midi = toneMidi.value
    const header = midi.header
    
    // Événements de tempo - CRUCIAL pour les conversions précises
    const tempos = header.tempos || []
    tempoEvents.value = tempos
      .map((tempo, index) => ({
        id: `tempo-${index}`,
        bpm: tempo.bpm,
        time: tempo.time,
        ticks: tempo.ticks
      }))
      .sort((a, b) => a.time - b.time) // Trier par temps
    
    // Ajouter un tempo par défaut si aucun événement
    if (tempoEvents.value.length === 0) {
      tempoEvents.value.push({
        id: 'tempo-default',
        bpm: midiInfo.value.tempo || 120,
        time: 0,
        ticks: 0
      })
    }

    // Extraction des signatures rythmiques (code existant simplifié)
    const allTimeSignatures = []
    
    if (header.timeSignatures && header.timeSignatures.length > 0) {
      allTimeSignatures.push(...header.timeSignatures)
    }
    
    // Nettoyer et standardiser
    const processedSignatures = allTimeSignatures.map((ts, index) => {
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
    
    // Si aucune signature trouvée, ajouter une signature par défaut
    if (processedSignatures.length === 0) {
      processedSignatures.push({
        id: 'timesig-default',
        numerator: 4,
        denominator: 4,
        time: 0,
        ticks: 0
      })
    }
    
    timeSignatureEvents.value = processedSignatures.sort((a, b) => a.time - b.time)

    // Signatures de clé
    const keySignatures = header.keySignatures || []
    keySignatureEvents.value = keySignatures.map((ks, index) => ({
      id: `keysig-${index}`,
      key: ks.key,
      scale: ks.scale,
      time: ks.time,
      ticks: ks.ticks
    }))
  }

  // Extraction des pistes et notes avec conversions précises
  function extractTracks() {
    if (!toneMidi.value) return
    
    const midi = toneMidi.value
    const extractedTracks = []
    const allNotes = []

    midi.tracks.forEach((track, trackIndex) => {
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
        muted: false,
        solo: false,
        color: getTrackColor(trackIndex)
      }
      
      // Extraire les notes avec conversions précises
      if (track.notes && track.notes.length > 0) {
        track.notes.forEach((note, noteIndex) => {
          const noteTicks = note.ticks || 0
          const noteDurationTicks = note.durationTicks || 0
          
          // Utiliser nos fonctions de conversion précises
          const preciseTime = ticksToTimeAccurate(noteTicks)
          const preciseDuration = ticksToTimeAccurate(noteTicks + noteDurationTicks) - preciseTime

          const noteData = {
            id: `${trackIndex}-${noteIndex}`,
            trackId: trackIndex,
            name: note.name || '',
            midi: note.midi || 0,
            pitch: note.pitch || '',
            octave: note.octave || 0,
            velocity: note.velocity || 0,
            
            // Utiliser nos conversions précises
            duration: preciseDuration,
            durationTicks: note.durationTicks || 0,
            time: preciseTime,
            ticks: note.ticks || 0,
            
            channel: track.channel !== undefined ? track.channel : 0,
            
            // Informations de tempo au moment de la note
            tempoAtStart: getTempoAtTicks(noteTicks)
          }
          
          trackData.notes.push(noteData)
          allNotes.push(noteData)
        })
      }
      
      // Extraire les control changes (inchangé)
      if (track.controlChanges) {
        Object.entries(track.controlChanges).forEach(([ccNumber, ccEvents]) => {
          if (ccEvents && ccEvents.length > 0) {
            trackData.controlChanges[ccNumber] = ccEvents.map((cc, index) => ({
              id: `cc-${trackIndex}-${ccNumber}-${index}`,
              trackId: trackIndex,
              number: parseInt(ccNumber),
              value: cc.value || 0,
              time: cc.time || 0,
              ticks: cc.ticks || 0
            }))
          }
        })
      }
      
      // Extraire les pitch bends (inchangé)
      if (track.pitchBends && track.pitchBends.length > 0) {
        trackData.pitchBends = track.pitchBends.map((pb, index) => ({
          id: `pb-${trackIndex}-${index}`,
          trackId: trackIndex,
          value: pb.value || 0,
          time: pb.time || 0,
          ticks: pb.ticks || 0
        }))
      }
      
      extractedTracks.push(trackData)
    })
    
    tracks.value = extractedTracks
    notes.value = allNotes
    
    // Sélectionner la première piste par défaut
    if (tracks.value.length > 0) {
      selectedTrack.value = tracks.value[0].id
    }

    // Messages CC globaux
    const allCC = []
    tracks.value.forEach(track => {
      Object.values(track.controlChanges).forEach(ccArray => {
        allCC.push(...ccArray)
      })
    })
    midiCC.value = allCC.sort((a, b) => a.time - b.time)
  }

  // Utilitaire pour les couleurs de pistes
  function getTrackColor(index) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
    return colors[index % colors.length]
  }

  // Réinitialisation du store
  function resetStore() {
    notes.value = []
    tracks.value = []
    midiInfo.value = {}
    midiCC.value = []
    tempoEvents.value = []
    timeSignatureEvents.value = []
    keySignatureEvents.value = []
    selectedTrack.value = null
    selectedNote.value = null
    toneMidi.value = null
    isLoaded.value = false
    filename.value = ''
  }

  // Actions de sélection (inchangées)
  function selectTrack(trackId) {
    selectedTrack.value = trackId
    selectedNote.value = null
  }

  function selectNote(noteId) {
    const note = notes.value.find(n => n.id === noteId)
    if (note) {
      selectedNote.value = noteId
      selectedTrack.value = note.trackId
    }
  }

  function clearSelection() {
    selectedTrack.value = null
    selectedNote.value = null
  }

  // Actions de modification (inchangées)
  function toggleTrackMute(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.muted = !track.muted
    }
  }

  function toggleTrackSolo(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.solo = !track.solo
    }
  }

  function updateTrackVolume(trackId, volume) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.volume = Math.max(0, Math.min(127, volume))
    }
  }

  // Getters computed (inchangés mais avec les nouvelles fonctions de conversion)
  const getTrackById = computed(() => (id) => {
    return tracks.value.find(track => track.id === id)
  })

  const getNoteById = computed(() => (id) => {
    return notes.value.find(note => note.id === id)
  })

  const getSelectedTrackData = computed(() => {
    return selectedTrack.value !== null 
      ? tracks.value.find(t => t.id === selectedTrack.value)
      : null
  })

  const getSelectedNoteData = computed(() => {
    return selectedNote.value !== null 
      ? notes.value.find(n => n.id === selectedNote.value)
      : null
  })

  const getTrackNotes = computed(() => (trackId) => {
    return notes.value.filter(note => note.trackId === trackId)
  })

  const getNotesInTimeRange = computed(() => (startTime, endTime) => {
    return notes.value.filter(note => 
      note.time >= startTime && note.time <= endTime
    )
  })

  const getTotalDuration = computed(() => {
    return midiInfo.value.duration || 0
  })

  // Nouveau getter pour le tempo actuel (qui peut changer)
  const getCurrentTempo = computed(() => {
    return midiInfo.value.tempo || 120
  })

  const getTrackCount = computed(() => {
    return tracks.value.length
  })

  const getNoteCount = computed(() => {
    return notes.value.length
  })

  const getMutedTracks = computed(() => {
    return tracks.value.filter(track => track.muted)
  })

  const getSoloTracks = computed(() => {
    return tracks.value.filter(track => track.solo)
  })

  const getControlChangesForTrack = computed(() => (trackId) => {
    const track = tracks.value.find(t => t.id === trackId)
    return track ? track.controlChanges : {}
  })

  // Export pour utilisation externe
  function exportToToneMidi() {
    return toneMidi.value
  }

  // Actions de modification des notes
function updateNote(noteId, updates) {
  // Mettre à jour dans le tableau global des notes
  const noteIndex = notes.value.findIndex(n => n.id === noteId)
  if (noteIndex !== -1) {
    const oldNote = notes.value[noteIndex]
    notes.value[noteIndex] = { ...oldNote, ...updates }
    
    // Mettre à jour aussi dans la piste correspondante
    const track = tracks.value.find(t => t.id === oldNote.trackId)
    if (track) {
      const trackNoteIndex = track.notes.findIndex(n => n.id === noteId)
      if (trackNoteIndex !== -1) {
        track.notes[trackNoteIndex] = { ...track.notes[trackNoteIndex], ...updates }
      }
    }
    
    return true
  }

  return false
}

function addNote(trackId, noteData) {
  const track = tracks.value.find(t => t.id === trackId)
  if (!track) {
    // console.warn(`Piste ${trackId} non trouvée`)
    return false
  }
  
  // Générer un ID unique pour la nouvelle note
  const noteId = `${trackId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const newNote = {
    id: noteId,
    trackId: trackId,
    name: noteData.name || '',
    midi: noteData.midi || 60,
    pitch: noteData.pitch || 'C4',
    octave: noteData.octave || 4,
    velocity: noteData.velocity || 0.8,
    duration: noteData.duration || 0.5,
    durationTicks: noteData.durationTicks || 240,
    time: noteData.time || 0,
    ticks: noteData.ticks || 0,
    channel: track.channel || 0,
    tempoAtStart: getTempoAtTicks(noteData.ticks || 0),
    ...noteData
  }
  
  // Ajouter à la piste
  track.notes.push(newNote)
  
  // Ajouter au tableau global
  notes.value.push(newNote)
  
  return noteId
}

function deleteNote(noteId) {
  // Supprimer du tableau global
  const noteIndex = notes.value.findIndex(n => n.id === noteId)
  if (noteIndex !== -1) {
    const note = notes.value[noteIndex]
    notes.value.splice(noteIndex, 1)
    
    // Supprimer de la piste correspondante
    const track = tracks.value.find(t => t.id === note.trackId)
    if (track) {
      const trackNoteIndex = track.notes.findIndex(n => n.id === noteId)
      if (trackNoteIndex !== -1) {
        track.notes.splice(trackNoteIndex, 1)
      }
    }
    
    // Désélectionner si c'était la note sélectionnée
    if (selectedNote.value === noteId) {
      selectedNote.value = null
    }
    
    return true
  }
  
  return false
}

function deleteNotes(noteIds) {
  let deletedCount = 0
  
  noteIds.forEach(noteId => {
    if (deleteNote(noteId)) {
      deletedCount++
    }
  })
  
  return deletedCount
}

function duplicateNote(noteId, timeOffset = 1) {
  const originalNote = notes.value.find(n => n.id === noteId)
  if (!originalNote) {
    return null
  }
  
  const duplicatedNoteData = {
    ...originalNote,
    time: originalNote.time + timeOffset,
    ticks: originalNote.ticks + timeToTicksAccurate(timeOffset)
  }
  
  delete duplicatedNoteData.id // L'ID sera généré automatiquement
  
  return addNote(originalNote.trackId, duplicatedNoteData)
}

// Fonction utilitaire pour mettre à jour plusieurs notes en une fois
function updateNotes(noteIds, updates) {
  let updatedCount = 0
  
  noteIds.forEach(noteId => {
    if (updateNote(noteId, updates)) {
      updatedCount++
    }
  })
  
  return updatedCount
}

// Fonction pour récupérer une note mise à jour (utile pour la réactivité)
function getUpdatedNote(noteId) {
  return notes.value.find(n => n.id === noteId)
}

  return {
    // État
    notes,
    tracks,
    midiInfo,
    midiCC,
    tempoEvents,
    timeSignatureEvents,
    keySignatureEvents,
    selectedTrack,
    selectedNote,
    isLoaded,
    filename,
    
    // Actions
    loadMidiFile,
    resetStore,
    selectTrack,
    selectNote,
    clearSelection,
    toggleTrackMute,
    toggleTrackSolo,
    updateTrackVolume,
    exportToToneMidi,
    
    // Nouvelles fonctions de conversion précises
    ticksToTimeAccurate,
    timeToTicksAccurate,
    getTempoAtTime,
    getTempoAtTicks,

    // Nouvelles actions de modification des notes
    updateNote,
    addNote,
    deleteNote,
    deleteNotes,
    duplicateNote,
    updateNotes,
    getUpdatedNote,    
    
    // Getters
    getTrackById,
    getNoteById,
    getSelectedTrackData,
    getSelectedNoteData,
    getTrackNotes,
    getNotesInTimeRange,
    getTotalDuration,
    getCurrentTempo,
    getTrackCount,
    getNoteCount,
    getMutedTracks,
    getSoloTracks,
    getControlChangesForTrack
  }
})