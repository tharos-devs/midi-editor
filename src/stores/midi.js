// stores/midi.js - STORE REFACTORISÉ SANS LOGIQUE D'IMPORT
import { defineStore } from 'pinia'
import { ref, computed, markRaw, nextTick } from 'vue'

export const useMidiStore = defineStore('midi', () => {
  // ==========================================
  // ÉTAT RÉACTIF - données uniquement
  // ==========================================
  
  const notes = ref([])
  const tracks = ref([])
  const midiInfo = ref({})
  const midiCC = ref([])
  const tempoEvents = ref([])
  const timeSignatureEvents = ref([])
  const keySignatureEvents = ref([])
  const selectedTrack = ref(null)
  const selectedNote = ref(null)

  // Contrôleurs de réactivité
  const lastModified = ref(Date.now())
  const notesVersion = ref(0)
  const tracksVersion = ref(0)
  const ccVersion = ref(0)

  // État du fichier
  const isLoaded = ref(false)
  const filename = ref('')

  // ==========================================
  // FONCTIONS UTILITAIRES DE RÉACTIVITÉ
  // ==========================================

  function triggerReactivity() {
    lastModified.value = Date.now()
    notesVersion.value++
    tracksVersion.value++
    ccVersion.value++

    // Forcer Vue à détecter le changement
    notes.value = [...notes.value]
    tracks.value = [...tracks.value]
    midiCC.value = [...midiCC.value]
  }

  // ==========================================
  // FONCTIONS DE CONVERSION TEMPORELLE
  // ==========================================

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

  // ==========================================
  // GESTION DE L'ÉTAT DU STORE
  // ==========================================

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
    isLoaded.value = false
    filename.value = ''

    // Réinitialiser les compteurs de version
    lastModified.value = Date.now()
    notesVersion.value = 0
    tracksVersion.value = 0
    ccVersion.value = 0
  }

  // ==========================================
  // ACTIONS DE SÉLECTION
  // ==========================================

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

  // ==========================================
  // ACTIONS DE MODIFICATION DES PISTES
  // ==========================================

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

  async function updateTrackVolume(trackId, volume) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const newVolume = Math.max(0, Math.min(127, Math.round(volume)))

      const updatedTrack = {
        ...tracks.value[trackIndex],
        volume: newVolume,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity()
      await nextTick()

      console.log(`✅ Volume mis à jour pour la piste ${trackId}: ${newVolume}`)
      return true
    }

    console.error(`❌ Piste ${trackId} non trouvée pour mise à jour volume`)
    return false
  }

  async function updateTrackName(trackId, name) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.name = name
      track.lastModified = Date.now()
      triggerReactivity()
      await nextTick()
      return true
    }
    return false
  }

  async function updateTrackPan(trackId, pan) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const newPan = Math.max(0, Math.min(127, Math.round(pan)))

      console.log(`📝 Store: Mise à jour Pan piste ${trackId}: ${tracks.value[trackIndex].pan} → ${newPan}`)

      const updatedTrack = {
        ...tracks.value[trackIndex],
        pan: newPan,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity()
      await nextTick()

      console.log(`✅ Store: Pan mis à jour pour piste ${trackId}: ${newPan}`)
      return true
    }

    console.error(`❌ Store: Piste ${trackId} non trouvée pour mise à jour Pan`)
    return false
  }

  function updateTrackChannel(trackId, channel) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.channel = Math.max(0, Math.min(15, channel))
      track.lastModified = Date.now()
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackMidiOutput(trackId, outputId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.midiOutput = outputId
      track.lastModified = Date.now()
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
      track.lastModified = Date.now()
      triggerReactivity()
      return true
    }
    return false
  }

  function updateTrackBank(trackId, bank) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.bank = Math.max(0, Math.min(127, bank))
      track.lastModified = Date.now()
      triggerReactivity()
      return true
    }
    return false
  }

  async function updateTrackColor(trackId, color) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.color = color
      track.lastModified = Date.now()
      triggerReactivity()
      await nextTick()
      return true
    }
    return false
  }

  // ==========================================
  // GESTION DES NOTES
  // ==========================================

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

      triggerReactivity()
      await nextTick()
      return true
    }
    return false
  }

  async function updateMultipleNotes(noteUpdatesMap) {
    if (!noteUpdatesMap || noteUpdatesMap.size === 0) return 0

    const updatedNotes = []
    let hasChanges = false

    for (const [noteId, updates] of noteUpdatesMap) {
      const noteIndex = notes.value.findIndex(note => note.id === noteId)
      if (noteIndex !== -1) {
        const oldNote = notes.value[noteIndex]
        const updatedNote = {
          ...oldNote,
          ...updates,
          lastModified: Date.now()
        }

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
      triggerReactivity()
      await nextTick()
    }

    return updatedNotes.length
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

  // ==========================================
  // GESTION DES CONTROL CHANGES
  // ==========================================

  async function addControlChange(trackId, ccNumber, time, value) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) {
      return false
    }

    if (!track.controlChanges) {
      track.controlChanges = {}
    }

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

    track.controlChanges[ccNumber].push(newCC)
    track.controlChanges[ccNumber].sort((a, b) => a.time - b.time)

    midiCC.value.push(newCC)
    midiCC.value.sort((a, b) => a.time - b.time)

    triggerReactivity()
    await nextTick()

    return ccId
  }

  async function updateControlChange(ccId, updates) {
    const globalCCIndex = midiCC.value.findIndex(cc => cc.id === ccId)
    if (globalCCIndex === -1) {
      return false
    }

    const oldCC = midiCC.value[globalCCIndex]
    const updatedCC = {
      ...oldCC,
      ...updates,
      lastModified: Date.now(),
      value: updates.value !== undefined ? Math.max(0, Math.min(127, parseInt(updates.value))) : oldCC.value,
      number: updates.number !== undefined ? parseInt(updates.number) : oldCC.number
    }

    midiCC.value[globalCCIndex] = updatedCC

    const track = tracks.value.find(t => t.id === oldCC.trackId)
    if (track && track.controlChanges && track.controlChanges[oldCC.number]) {
      const trackCCIndex = track.controlChanges[oldCC.number].findIndex(cc => cc.id === ccId)
      if (trackCCIndex !== -1) {
        track.controlChanges[oldCC.number][trackCCIndex] = updatedCC

        if (updates.number !== undefined && updates.number !== oldCC.number) {
          track.controlChanges[oldCC.number].splice(trackCCIndex, 1)

          if (!track.controlChanges[updates.number]) {
            track.controlChanges[updates.number] = []
          }
          track.controlChanges[updates.number].push(updatedCC)
          track.controlChanges[updates.number].sort((a, b) => a.time - b.time)
        }
      }
    }

    triggerReactivity()
    await nextTick()
    return true
  }

  async function deleteControlChange(ccId) {
    const globalCCIndex = midiCC.value.findIndex(cc => cc.id === ccId)
    if (globalCCIndex === -1) {
      return false
    }

    const ccToDelete = midiCC.value[globalCCIndex]
    midiCC.value.splice(globalCCIndex, 1)

    const track = tracks.value.find(t => t.id === ccToDelete.trackId)
    if (track && track.controlChanges && track.controlChanges[ccToDelete.number]) {
      const trackCCIndex = track.controlChanges[ccToDelete.number].findIndex(cc => cc.id === ccId)
      if (trackCCIndex !== -1) {
        track.controlChanges[ccToDelete.number].splice(trackCCIndex, 1)
      }
    }

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

  // ==========================================
  // GESTION AVANCÉE DES PISTES
  // ==========================================

  async function reorderTrack(trackId, newIndex) {
    const currentIndex = tracks.value.findIndex(t => t.id === trackId)

    if (currentIndex === -1) {
      console.error(`❌ Piste ${trackId} non trouvée`)
      return false
    }

    const maxIndex = tracks.value.length - 1
    if (newIndex < 0 || newIndex > maxIndex) {
      console.error(`❌ Index invalide: ${newIndex} (doit être entre 0 et ${maxIndex})`)
      return false
    }

    if (currentIndex === newIndex) {
      return true
    }

    try {
      const newTracks = [...tracks.value]
      const [movedTrack] = newTracks.splice(currentIndex, 1)
      newTracks.splice(newIndex, 0, movedTrack)

      tracks.value = newTracks
      triggerReactivity()
      await nextTick()

      return true
    } catch (error) {
      console.error(`❌ Erreur lors de la réorganisation:`, error)
      return false
    }
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
      solo: false,
      lastModified: Date.now()
    }

    originalTrack.notes.forEach(note => {
      const newNoteId = `${newTrackId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const duplicatedNote = {
        ...note,
        id: newNoteId,
        trackId: newTrackId,
        lastModified: Date.now()
      }

      duplicatedTrack.notes.push(duplicatedNote)
      notes.value.push(duplicatedNote)
    })

    Object.entries(originalTrack.controlChanges || {}).forEach(([ccNumber, ccEvents]) => {
      duplicatedTrack.controlChanges[ccNumber] = ccEvents.map(cc => {
        const newCCId = `cc-${newTrackId}-${ccNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const duplicatedCC = {
          ...cc,
          id: newCCId,
          trackId: newTrackId,
          lastModified: Date.now()
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

  // ==========================================
  // GETTERS COMPUTED
  // ==========================================

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

  const getTrackNumbers = computed(() => {
    return tracks.value.map((track, index) => ({
      trackId: track.id,
      number: index + 1,
      name: track.name
    }))
  })

  // ==========================================
  // FONCTIONS UTILITAIRES
  // ==========================================

  function getTrackIndex(trackId) {
    return tracks.value.findIndex(t => t.id === trackId)
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
    const trackNotes = getTrackNotes.value(trackId)
    if (trackNotes.length === 0) return 0

    return trackNotes.reduce((maxEnd, note) => {
      const noteEnd = note.time + note.duration
      return Math.max(maxEnd, noteEnd)
    }, 0)
  }

  function validateTrackOrder() {
    const trackIds = tracks.value.map(t => t.id)
    const uniqueIds = new Set(trackIds)

    if (trackIds.length !== uniqueIds.size) {
      console.error('❌ IDs de pistes dupliqués détectés!')
      return false
    }

    console.log('✅ Ordre des pistes validé')
    return true
  }

  function getUpdatedNote(noteId) {
    return notes.value.find(n => n.id === noteId)
  }

  // ==========================================
  // EXPORT DES DONNÉES (pour compatibilité)
  // ==========================================

  function exportToToneMidi() {
    // Cette fonction pourrait être utilisée pour exporter vers Tone.js
    // si nécessaire pour la compatibilité avec d'autres parties du code
    console.warn('exportToToneMidi: Cette fonction est deprecated, utilisez les données du store directement')
    return null
  }

  // ==========================================
  // RETURN DU STORE
  // ==========================================

  return {
    // État réactif
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

    // Outils de réactivité
    lastModified,
    notesVersion,
    tracksVersion,
    ccVersion,
    triggerReactivity,

    // Fonctions de gestion d'état
    resetStore,
    selectTrack,
    selectNote,
    clearSelection,

    // Fonctions de conversion temporelle
    ticksToTimeAccurate,
    timeToTicksAccurate,
    getTempoAtTime,
    getTempoAtTicks,

    // Actions de modification des pistes
    toggleTrackMute,
    toggleTrackSolo,
    updateTrackVolume,
    updateTrackName,
    updateTrackPan,
    updateTrackChannel,
    updateTrackMidiOutput,
    updateTrackProgram,
    updateTrackBank,
    updateTrackColor,
    reorderTrack,
    duplicateTrack,
    removeEmptyTracks,

    // Actions de modification des notes
    updateNote,
    updateMultipleNotes,
    addNote,
    deleteNote,
    deleteNotes,
    duplicateNote,

    // Actions de modification des Control Changes
    addControlChange,
    updateControlChange,
    deleteControlChange,
    updateMultipleControlChanges,

    // Getters
    getTrackById,
    getNoteById,
    getSelectedTrackData,
    getSelectedNoteData,
    getTrackNotes,
    getNotesInTimeRange,
    getControlChangeById,
    getTrackControlChanges,
    getControlChangesInTimeRange,
    getControlChangesByNumber,
    getTrackControlChangesByNumber,
    getTotalDuration,
    getCurrentTempo,
    getTrackCount,
    getNoteCount,
    getControlChangeCount,
    getMutedTracks,
    getSoloTracks,
    getControlChangesForTrack,
    getTrackNumbers,

    // Utilitaires
    getTrackIndex,
    getTracksWithMetadata,
    getTrackDuration,
    validateTrackOrder,
    getUpdatedNote,
    exportToToneMidi // Deprecated
  }
})