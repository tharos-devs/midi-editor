// stores/midi.js - CORRECTIONS POUR LES CONTROL CHANGES RÉACTIFS
import { defineStore } from 'pinia'
import { ref, computed, markRaw, nextTick } from 'vue'
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

  // CORRECTION 1: Ajouter un timestamp de dernière modification pour forcer la réactivité
  const lastModified = ref(Date.now())
  const notesVersion = ref(0)
  const tracksVersion = ref(0)
  const ccVersion = ref(0) // NOUVEAU : Version pour les CC

  // Données Tone.js
  const toneMidi = ref(null)
  const isLoaded = ref(false)
  const filename = ref('')

  // CORRECTION 2: Fonction pour forcer la mise à jour réactive
  function triggerReactivity() {
    lastModified.value = Date.now()
    notesVersion.value++
    tracksVersion.value++
    ccVersion.value++ // NOUVEAU : Incrémenter la version CC
    
    // Forcer Vue à détecter le changement
    notes.value = [...notes.value]
    tracks.value = [...tracks.value]
    midiCC.value = [...midiCC.value] // NOUVEAU : Forcer la réactivité des CC
  }

  // === FONCTIONS DE CONVERSION PRÉCISES (inchangées) ===
  function ticksToTimeAccurate(ticks) {
    if (!isLoaded.value || tempoEvents.value.length === 0) {
      const ppq = midiInfo.value.ppq || 480
      const tempo = midiInfo.value.tempo || 120
      return (ticks / ppq) * (60 / tempo)
    }

    let currentTime = 0
    let currentTicks = 0
    let currentTempo = midiInfo.value.tempo || 120
    const ppq = midiInfo.value.ppq || 480

    for (const tempoEvent of tempoEvents.value) {
      const eventTicks = tempoEvent.ticks || 0

      if (eventTicks > ticks) {
        const ticksDiff = ticks - currentTicks
        const timeDiff = (ticksDiff / ppq) * (60 / currentTempo)
        return currentTime + timeDiff
      } else {
        const ticksDiff = eventTicks - currentTicks
        const timeDiff = (ticksDiff / ppq) * (60 / currentTempo)
        currentTime += timeDiff
        currentTicks = eventTicks
        currentTempo = tempoEvent.bpm
      }
    }

    const remainingTicks = ticks - currentTicks
    const remainingTime = (remainingTicks / ppq) * (60 / currentTempo)
    return currentTime + remainingTime
  }

  function timeToTicksAccurate(time) {
    if (!isLoaded.value || tempoEvents.value.length === 0) {
      const ppq = midiInfo.value.ppq || 480
      const tempo = midiInfo.value.tempo || 120
      return (time * tempo * ppq) / 60
    }

    let currentTime = 0
    let currentTicks = 0
    let currentTempo = midiInfo.value.tempo || 120
    const ppq = midiInfo.value.ppq || 480

    for (const tempoEvent of tempoEvents.value) {
      const eventTime = tempoEvent.time || 0

      if (eventTime > time) {
        const timeDiff = time - currentTime
        const ticksDiff = (timeDiff * currentTempo * ppq) / 60
        return currentTicks + ticksDiff
      } else {
        const timeDiff = eventTime - currentTime
        const ticksDiff = (timeDiff * currentTempo * ppq) / 60
        currentTicks += ticksDiff
        currentTime = eventTime
        currentTempo = tempoEvent.bpm
      }
    }

    const remainingTime = time - currentTime
    const remainingTicks = (remainingTime * currentTempo * ppq) / 60
    return currentTicks + remainingTicks
  }

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

  // CORRECTION 3: Améliorer updateMultipleNotes pour la réactivité
  const updateMultipleNotes = async (noteUpdatesMap) => {
    if (!noteUpdatesMap || noteUpdatesMap.size === 0) return

    const updatedNotes = []
    let hasChanges = false

    for (const [noteId, updates] of noteUpdatesMap) {
      const noteIndex = notes.value.findIndex(note => note.id === noteId)
      if (noteIndex !== -1) {
        const oldNote = notes.value[noteIndex]
        
        // Créer une nouvelle note avec les mises à jour
        const updatedNote = {
          ...oldNote,
          ...updates,
          lastModified: Date.now()
        }

        // Remplacer la note dans le tableau principal
        notes.value[noteIndex] = updatedNote
        updatedNotes.push(updatedNote)
        hasChanges = true

        // Mettre à jour aussi dans la piste correspondante
        const track = tracks.value.find(t => t.id === updatedNote.trackId)
        if (track) {
          const trackNoteIndex = track.notes.findIndex(n => n.id === noteId)
          if (trackNoteIndex !== -1) {
            track.notes[trackNoteIndex] = updatedNote
          }
        }
      }
    }

    if (hasChanges) {
      // CORRECTION 4: Forcer la réactivité après les modifications
      triggerReactivity()
      
      // Attendre le prochain tick pour que Vue traite les changements
      await nextTick()
    }

    return updatedNotes.length
  }

  // Fonction principale de chargement (inchangée)
  async function loadMidiFile(arrayBuffer, name = '') {
    try {
      resetStore()

      const midiData = new Midi(arrayBuffer)
      toneMidi.value = markRaw(midiData)
      filename.value = name

      extractMidiInfo()
      extractControlEvents()
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

  // Extraction des informations générales du fichier (inchangée)
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

  // Extraction des événements de contrôle globaux (inchangée)
  function extractControlEvents() {
    if (!toneMidi.value) return

    const midi = toneMidi.value
    const header = midi.header

    const tempos = header.tempos || []
    tempoEvents.value = tempos
      .map((tempo, index) => ({
        id: `tempo-${index}`,
        bpm: tempo.bpm,
        time: tempo.time,
        ticks: tempo.ticks
      }))
      .sort((a, b) => a.time - b.time)

    if (tempoEvents.value.length === 0) {
      tempoEvents.value.push({
        id: 'tempo-default',
        bpm: midiInfo.value.tempo || 120,
        time: 0,
        ticks: 0
      })
    }

    const allTimeSignatures = []

    if (header.timeSignatures && header.timeSignatures.length > 0) {
      allTimeSignatures.push(...header.timeSignatures)
    }

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

    const keySignatures = header.keySignatures || []
    keySignatureEvents.value = keySignatures.map((ks, index) => ({
      id: `keysig-${index}`,
      key: ks.key,
      scale: ks.scale,
      time: ks.time,
      ticks: ks.ticks
    }))
  }

  // CORRECTION MAJEURE : Extraction des pistes avec meilleur traitement des CC
  function extractTracks() {
    if (!toneMidi.value) return

    const midi = toneMidi.value
    const extractedTracks = []
    const allNotes = []
    const allCC = [] // NOUVEAU : Tableau pour tous les CC

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
        controlChanges: {}, // CORRECTION : S'assurer que c'est toujours un objet
        pitchBends: [],
        volume: 100,
        pan: 64,
        bank: 0,
        midiOutput: 'default',
        muted: false,
        solo: false,
        color: getTrackColor(trackIndex)
      }

      // Traitement des notes
      if (track.notes && track.notes.length > 0) {
        track.notes.forEach((note, noteIndex) => {
          const noteTicks = note.ticks || 0
          const noteDurationTicks = note.durationTicks || 0

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
            duration: preciseDuration,
            durationTicks: note.durationTicks || 0,
            time: preciseTime,
            ticks: note.ticks || 0,
            channel: track.channel !== undefined ? track.channel : 0,
            tempoAtStart: getTempoAtTicks(noteTicks)
          }

          trackData.notes.push(noteData)
          allNotes.push(noteData)
        })
      }

      // Traitement amélioré des Control Changes
      let trackCCCount = 0
      
      if (track.controlChanges && typeof track.controlChanges === 'object') {
        // S'assurer que trackData.controlChanges est initialisé
        trackData.controlChanges = {}
        
        Object.entries(track.controlChanges).forEach(([ccNumber, ccEvents]) => {
          const ccNum = parseInt(ccNumber)
         
          if (Array.isArray(ccEvents) && ccEvents.length > 0) {
            // Traitement des événements CC pour cette piste
            const processedCCEvents = ccEvents.map((cc, ccIndex) => {
              const ccTime = cc.time || 0
              const ccTicks = cc.ticks || 0
              const ccValue = Math.max(0, Math.min(127, Math.round((cc.value || 0) * 127)))

              const ccEventData = {
                id: `cc-${trackIndex}-${ccNum}-${ccIndex}`,
                trackId: trackIndex,
                number: ccNum,
                value: ccValue,
                time: ccTime,
                ticks: ccTicks,
                lastModified: Date.now()
              }

              return ccEventData
            })
            
            // Assigner les CC traités à la piste
            trackData.controlChanges[ccNum] = processedCCEvents
          } else {
            // S'assurer qu'il y a au moins un tableau vide
            trackData.controlChanges[ccNum] = []
          }
        })
      } else {
        // S'assurer que controlChanges est toujours un objet, même vide
        trackData.controlChanges = {}
      }

      // Traitement des Pitch Bends avec améliorations
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

      extractedTracks.push(trackData)
    })

    // Mise à jour des données du store
    tracks.value = extractedTracks
    notes.value = allNotes
    midiCC.value = allCC.sort((a, b) => a.time - b.time) // CORRECTION : Trier par temps

    if (tracks.value.length > 0) {
      selectedTrack.value = tracks.value[0].id
    }

    // Debug détaillé des CC par piste
    tracks.value.forEach(track => {
      const ccControllers = Object.keys(track.controlChanges || {}).length
      const ccEvents = Object.values(track.controlChanges || {}).reduce((sum, ccArray) => sum + ccArray.length, 0)
    })

    // Forcer la réactivité après l'extraction
    triggerReactivity()
  }

  function getTrackColor(index) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
    return colors[index % colors.length]
  }

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
    
    // CORRECTION 5: Réinitialiser les compteurs de version
    lastModified.value = Date.now()
    notesVersion.value = 0
    tracksVersion.value = 0
    ccVersion.value = 0 // NOUVEAU : Réinitialiser la version CC
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
      triggerReactivity()
    }
  }

  function toggleTrackSolo(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.solo = !track.solo
      triggerReactivity()
    }
  }

  function updateTrackVolume(trackId, volume) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.volume = Math.max(0, Math.min(127, volume))
      triggerReactivity()
    }
  }

  // Gestion des Control Changes
  async function addControlChange(trackId, ccNumber, time, value) {

    const track = tracks.value.find(t => t.id === trackId)
    if (!track) {
      return false
    }

    // S'assurer que controlChanges existe
    if (!track.controlChanges) {
      track.controlChanges = {}
    }

    // S'assurer que le tableau pour ce CC existe
    if (!track.controlChanges[ccNumber]) {
      track.controlChanges[ccNumber] = []
    }

    const ccId = `cc-${trackId}-${ccNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const ticks = timeToTicksAccurate(time)

    const newCC = {
      id: ccId,
      trackId: trackId,
      number: parseInt(ccNumber),
      value: Math.max(0, Math.min(127, parseInt(value))),
      time: time,
      ticks: ticks,
      lastModified: Date.now()
    }

    // Ajouter à la piste
    track.controlChanges[ccNumber].push(newCC)
    track.controlChanges[ccNumber].sort((a, b) => a.time - b.time)

    // Ajouter au tableau global
    midiCC.value.push(newCC)
    midiCC.value.sort((a, b) => a.time - b.time)

    // Forcer la réactivité
    triggerReactivity()
    await nextTick()

    return ccId
  }

  async function updateControlChange(ccId, updates) {
    // Trouver dans le tableau global
    const globalCCIndex = midiCC.value.findIndex(cc => cc.id === ccId)
    if (globalCCIndex === -1) {
      return false
    }

    const oldCC = midiCC.value[globalCCIndex]
    const updatedCC = { 
      ...oldCC, 
      ...updates, 
      lastModified: Date.now(),
      // S'assurer que les valeurs critiques restent dans les limites
      value: updates.value !== undefined ? Math.max(0, Math.min(127, parseInt(updates.value))) : oldCC.value,
      number: updates.number !== undefined ? parseInt(updates.number) : oldCC.number
    }

    // Mettre à jour dans le tableau global
    midiCC.value[globalCCIndex] = updatedCC

    // Mettre à jour dans la piste correspondante
    const track = tracks.value.find(t => t.id === oldCC.trackId)
    if (track && track.controlChanges && track.controlChanges[oldCC.number]) {
      const trackCCIndex = track.controlChanges[oldCC.number].findIndex(cc => cc.id === ccId)
      if (trackCCIndex !== -1) {
        track.controlChanges[oldCC.number][trackCCIndex] = updatedCC
        
        // Si le numéro de CC a changé, déplacer vers le bon tableau
        if (updates.number !== undefined && updates.number !== oldCC.number) {
          // Supprimer de l'ancien
          track.controlChanges[oldCC.number].splice(trackCCIndex, 1)
          
          // Ajouter au nouveau
          if (!track.controlChanges[updates.number]) {
            track.controlChanges[updates.number] = []
          }
          track.controlChanges[updates.number].push(updatedCC)
          track.controlChanges[updates.number].sort((a, b) => a.time - b.time)
        }
      }
    }

    // Forcer la réactivité
    triggerReactivity()
    await nextTick()

    return true
  }

  async function deleteControlChange(ccId) {
    // Trouver dans le tableau global
    const globalCCIndex = midiCC.value.findIndex(cc => cc.id === ccId)
    if (globalCCIndex === -1) {
      console.error(`❌ CC ${ccId} not found`)
      return false
    }

    const ccToDelete = midiCC.value[globalCCIndex]
    
    // Supprimer du tableau global
    midiCC.value.splice(globalCCIndex, 1)

    // Supprimer de la piste correspondante
    const track = tracks.value.find(t => t.id === ccToDelete.trackId)
    if (track && track.controlChanges && track.controlChanges[ccToDelete.number]) {
      const trackCCIndex = track.controlChanges[ccToDelete.number].findIndex(cc => cc.id === ccId)
      if (trackCCIndex !== -1) {
        track.controlChanges[ccToDelete.number].splice(trackCCIndex, 1)
      }
    }

    // Forcer la réactivité
    triggerReactivity()
    await nextTick()

    return true
  }

  async function updateMultipleControlChanges(ccUpdatesMap) {
    if (!ccUpdatesMap || ccUpdatesMap.size === 0) return 0

    let updatedCount = 0
    for (const [ccId, updates] of ccUpdatesMap) {
      if (await updateControlChange(ccId, updates)) {
        updatedCount++
      }
    }

    return updatedCount
  }

  // Getters computed (inchangés mais avec ajouts pour les CC)
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

  // NOUVEAUX GETTERS pour les Control Changes
  const getControlChangeById = computed(() => (id) => {
    return midiCC.value.find(cc => cc.id === id)
  })

  const getTrackControlChanges = computed(() => (trackId) => {
    return midiCC.value.filter(cc => cc.trackId === trackId)
  })

  const getControlChangesInTimeRange = computed(() => (startTime, endTime) => {
    return midiCC.value.filter(cc =>
      cc.time >= startTime && cc.time <= endTime
    )
  })

  const getControlChangesByNumber = computed(() => (ccNumber) => {
    return midiCC.value.filter(cc => cc.number === ccNumber)
  })

  const getTrackControlChangesByNumber = computed(() => (trackId, ccNumber) => {
    return midiCC.value.filter(cc => cc.trackId === trackId && cc.number === ccNumber)
  })

  const getTotalDuration = computed(() => {
    return midiInfo.value.duration || 0
  })

  const getCurrentTempo = computed(() => {
    return midiInfo.value.tempo || 120
  })

  const getTrackCount = computed(() => {
    return tracks.value.length
  })

  const getNoteCount = computed(() => {
    return notes.value.length
  })

  const getControlChangeCount = computed(() => {
    return midiCC.value.length
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

  function exportToToneMidi() {
    return toneMidi.value
  }

  // CORRECTION 6: Améliorer updateNote pour la réactivité
  async function updateNote(noteId, updates) {

    const noteIndex = notes.value.findIndex(n => n.id === noteId)
    if (noteIndex !== -1) {
      const oldNote = notes.value[noteIndex]
      const updatedNote = { 
        ...oldNote, 
        ...updates, 
        lastModified: Date.now() 
      }
      
      // Mettre à jour dans le tableau global
      notes.value[noteIndex] = updatedNote

      // Mettre à jour dans la piste correspondante
      const track = tracks.value.find(t => t.id === oldNote.trackId)
      if (track) {
        const trackNoteIndex = track.notes.findIndex(n => n.id === noteId)
        if (trackNoteIndex !== -1) {
          track.notes[trackNoteIndex] = updatedNote
        }
      }

      // Forcer la réactivité
      triggerReactivity()
      
      // Attendre le prochain tick
      await nextTick()
      
      return true
    }

    return false
  }

  async function addNote(trackId, noteData) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) {
      return false
    }

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
      lastModified: Date.now(),
      ...noteData
    }

    track.notes.push(newNote)
    notes.value.push(newNote)

    // Forcer la réactivité
    triggerReactivity()
    await nextTick()

    return noteId
  }

  async function deleteNote(noteId) {
    const noteIndex = notes.value.findIndex(n => n.id === noteId)
    if (noteIndex !== -1) {
      const note = notes.value[noteIndex]
      notes.value.splice(noteIndex, 1)

      const track = tracks.value.find(t => t.id === note.trackId)
      if (track) {
        const trackNoteIndex = track.notes.findIndex(n => n.id === noteId)
        if (trackNoteIndex !== -1) {
          track.notes.splice(trackNoteIndex, 1)
        }
      }

      if (selectedNote.value === noteId) {
        selectedNote.value = null
      }

      // Forcer la réactivité
      triggerReactivity()
      await nextTick()

      return true
    }

    return false
  }

  async function deleteNotes(noteIds) {
    let deletedCount = 0

    for (const noteId of noteIds) {
      if (await deleteNote(noteId)) {
        deletedCount++
      }
    }

    return deletedCount
  }

  async function duplicateNote(noteId, timeOffset = 1) {
    const originalNote = notes.value.find(n => n.id === noteId)
    if (!originalNote) {
      return null
    }

    const duplicatedNoteData = {
      ...originalNote,
      time: originalNote.time + timeOffset,
      ticks: originalNote.ticks + timeToTicksAccurate(timeOffset)
    }

    delete duplicatedNoteData.id

    return await addNote(originalNote.trackId, duplicatedNoteData)
  }

  async function updateNotes(noteIds, updates) {
    let updatedCount = 0

    for (const noteId of noteIds) {
      if (await updateNote(noteId, updates)) {
        updatedCount++
      }
    }

    return updatedCount
  }

  function getUpdatedNote(noteId) {
    return notes.value.find(n => n.id === noteId)
  }

  function updateTrackChannel(trackId, channel) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.channel = Math.max(0, Math.min(15, channel))
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackMidiOutput(trackId, outputId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.midiOutput = outputId
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackProgram(trackId, program) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      if (!track.instrument) {
        track.instrument = { name: 'Piano', number: 0 }
      }
      track.instrument.number = Math.max(0, Math.min(127, program))
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackBank(trackId, bank) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.bank = Math.max(0, Math.min(127, bank))
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackPan(trackId, pan) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.pan = Math.max(0, Math.min(127, pan))
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackColor(trackId, color) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.color = color
      triggerReactivity()
      return true
    }
    return false
  }  

  function getTracksWithMetadata() {
    return tracks.value.map(track => ({
      ...track,
      noteCount: track.notes.length,
      duration: getTrackDuration(track.id),
      ccCount: Object.values(track.controlChanges).reduce((total, ccArray) => total + ccArray.length, 0),
      pbCount: track.pitchBends.length
    }))
  }

  function getTrackDuration(trackId) {
    const trackNotes = getTrackNotes(trackId)
    if (trackNotes.length === 0) return 0

    return trackNotes.reduce((maxEnd, note) => {
      const noteEnd = note.time + note.duration
      return Math.max(maxEnd, noteEnd)
    }, 0)
  }

  function reorderTrack(trackId, newIndex) {
    const currentIndex = tracks.value.findIndex(t => t.id === trackId)
    if (currentIndex === -1 || currentIndex === newIndex) return false

    const track = tracks.value.splice(currentIndex, 1)[0]
    tracks.value.splice(newIndex, 0, track)

    triggerReactivity()
    return true
  }

  async function duplicateTrack(trackId) {
    const originalTrack = tracks.value.find(t => t.id === trackId)
    if (!originalTrack) return null

    const newTrackId = Date.now()
    const duplicatedTrack = {
      ...originalTrack,
      id: newTrackId,
      name: `${originalTrack.name} (Copie)`,
      notes: [],
      controlChanges: {},
      pitchBends: [...originalTrack.pitchBends],
      muted: false,
      solo: false
    }

    // Dupliquer les notes
    originalTrack.notes.forEach(note => {
      const newNoteId = `${newTrackId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const duplicatedNote = {
        ...note,
        id: newNoteId,
        trackId: newTrackId
      }

      duplicatedTrack.notes.push(duplicatedNote)
      notes.value.push(duplicatedNote)
    })

    // Dupliquer les Control Changes
    Object.entries(originalTrack.controlChanges || {}).forEach(([ccNumber, ccEvents]) => {
      duplicatedTrack.controlChanges[ccNumber] = ccEvents.map(cc => {
        const newCCId = `cc-${newTrackId}-${ccNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const duplicatedCC = {
          ...cc,
          id: newCCId,
          trackId: newTrackId
        }
        
        midiCC.value.push(duplicatedCC)
        return duplicatedCC
      })
    })

    tracks.value.push(duplicatedTrack)
    
    triggerReactivity()
    await nextTick()
    
    return newTrackId
  }

  function removeEmptyTracks() {
    const emptyTracks = tracks.value.filter(track =>
      track.notes.length === 0 &&
      Object.keys(track.controlChanges).length === 0 &&
      track.pitchBends.length === 0
    )

    emptyTracks.forEach(track => {
      const index = tracks.value.findIndex(t => t.id === track.id)
      if (index !== -1) {
        tracks.value.splice(index, 1)
      }
    })

    if (emptyTracks.length > 0) {
      triggerReactivity()
    }

    return emptyTracks.length
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

    // CORRECTION 7: Exposer les nouveaux outils de réactivité
    lastModified,
    notesVersion,
    tracksVersion,
    ccVersion, // NOUVEAU : Version des CC
    triggerReactivity,

    // Actions existantes
    loadMidiFile,
    resetStore,
    selectTrack,
    selectNote,
    clearSelection,
    toggleTrackMute,
    toggleTrackSolo,
    updateTrackVolume,
    exportToToneMidi,

    // Fonctions de conversion
    ticksToTimeAccurate,
    timeToTicksAccurate,
    getTempoAtTime,
    getTempoAtTicks,

    // Actions de modification des notes (améliorées)
    updateNote,
    addNote,
    deleteNote,
    deleteNotes,
    duplicateNote,
    updateNotes,
    getUpdatedNote,
    updateMultipleNotes,

    // NOUVELLES FONCTIONS pour les Control Changes
    addControlChange,
    updateControlChange,
    deleteControlChange,
    updateMultipleControlChanges,

    // Fonctions pour les pistes
    updateTrackChannel,
    updateTrackMidiOutput,
    updateTrackProgram,
    updateTrackBank,
    updateTrackPan,
    updateTrackColor,  

    getTracksWithMetadata,
    getTrackDuration,
    reorderTrack,
    duplicateTrack,
    removeEmptyTracks,

    // Getters existants
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
    getControlChangesForTrack,

    // NOUVEAUX GETTERS pour les Control Changes
    getControlChangeById,
    getTrackControlChanges,
    getControlChangesInTimeRange,
    getControlChangesByNumber,
    getTrackControlChangesByNumber,
    getControlChangeCount   
  }
})