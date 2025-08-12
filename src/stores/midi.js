// stores/midi.js - AMÉLIORATIONS POUR LA RÉACTIVITÉ
import { defineStore } from 'pinia'
import { ref, computed, markRaw, nextTick, watch } from 'vue'

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
  // FONCTIONS UTILITAIRES DE RÉACTIVITÉ AMÉLIORÉES
  // ==========================================

  function triggerReactivity(reason = 'unknown') {
    const timestamp = Date.now()
    lastModified.value = timestamp
    notesVersion.value++
    tracksVersion.value++
    ccVersion.value++

    // OPTIMISATION: Éviter les recopies coûteuses pendant l'enregistrement MIDI
    if (reason === 'midi-recording-cc') {
      // Pendant l'enregistrement CC, seulement incrémenter les versions
      // Les composants utilisent des caches optimisés, pas besoin de recopie
      console.log('🚀 PERF: triggerReactivity throttlé pour recording CC')
      return
    }

    // Forcer Vue à détecter le changement avec une nouvelle référence (seulement si nécessaire)
    notes.value = [...notes.value]
    tracks.value = tracks.value.map(track => ({ ...track }))  // Shallow copy des tracks
    midiCC.value = [...midiCC.value]
  }

  function forceTrackUpdate(trackId, reason = 'unknown') {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const updatedTrack = { 
        ...tracks.value[trackIndex], 
        lastModified: Date.now() 
      }
      
      // Remplacer la référence pour déclencher la réactivité
      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🎯 Mise à jour forcée piste ${trackId}: ${reason}`)
      triggerReactivity(`force-track-${trackId}-${reason}`)
    }
  }

  // ==========================================
  // ACTIONS DE MODIFICATION DES PISTES AMÉLIORÉES
  // ==========================================

  function toggleTrackMute(trackId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const track = tracks.value[trackIndex]
      const newMutedState = !track.muted
      
      // Créer une nouvelle référence d'objet
      const updatedTrack = {
        ...track,
        muted: newMutedState,
        lastModified: Date.now()
      }
      
      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🔇 Mute piste ${trackId}: ${newMutedState}`)
      triggerReactivity(`mute-${trackId}`)
      
      // NOUVEAU: Émettre un événement pour que le lecteur MIDI puisse réagir
      // Si on mute pendant la lecture, il faut couper les notes en cours
      if (newMutedState && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('track-muted', { 
          detail: { trackId, track: updatedTrack } 
        }))
      }
      
      return true
    }
    return false
  }

  function toggleTrackSolo(trackId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const track = tracks.value[trackIndex]
      const newSoloState = !track.solo
      
      // Créer une nouvelle référence d'objet
      const updatedTrack = {
        ...track,
        solo: newSoloState,
        lastModified: Date.now()
      }
      
      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🎤 Solo piste ${trackId}: ${newSoloState}`)
      triggerReactivity(`solo-${trackId}`)
      
      return true
    }
    return false
  }

  function toggleTrackRecord(trackId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const track = tracks.value[trackIndex]
      const newRecordState = !track.record
      
      // Créer une nouvelle référence d'objet
      const updatedTrack = {
        ...track,
        record: newRecordState,
        lastModified: Date.now()
      }
      
      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🔴 Record piste ${trackId}: ${newRecordState}`)
      triggerReactivity(`record-${trackId}`)
      
      return true
    }
    return false
  }

  function toggleTrackMonitor(trackId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const track = tracks.value[trackIndex]
      const newMonitorState = !track.monitor
      
      // Créer une nouvelle référence d'objet
      const updatedTrack = {
        ...track,
        monitor: newMonitorState,
        lastModified: Date.now()
      }
      
      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`📡 Monitor piste ${trackId}: ${newMonitorState}`)
      triggerReactivity(`monitor-${trackId}`)
      
      return true
    }
    return false
  }

  async function updateTrackVolume(trackId, volume) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const newVolume = Math.max(0, Math.min(127, Math.round(volume)))
      const currentTrack = tracks.value[trackIndex]

      // Éviter les mises à jour inutiles
      if (currentTrack.volume === newVolume) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        volume: newVolume,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🔊 Volume piste ${trackId}: ${currentTrack.volume} → ${newVolume}`)
      triggerReactivity(`volume-${trackId}`)
      
      await nextTick()
      return true
    }

    console.error(`❌ Piste ${trackId} non trouvée pour mise à jour volume`)
    return false
  }

  async function updateTrackPan(trackId, pan) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const newPan = Math.max(0, Math.min(127, Math.round(pan)))
      const currentTrack = tracks.value[trackIndex]

      // Éviter les mises à jour inutiles
      if (currentTrack.pan === newPan) {
        return true
      }

      // console.log(`📝 Store: Mise à jour Pan piste ${trackId}: ${currentTrack.pan} → ${newPan}`)

      const updatedTrack = {
        ...currentTrack,
        pan: newPan,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🎛️ Pan piste ${trackId}: ${currentTrack.pan} → ${newPan}`)
      triggerReactivity(`pan-${trackId}`)
      
      await nextTick()
      return true
    }

    console.error(`❌ Store: Piste ${trackId} non trouvée pour mise à jour Pan`)
    return false
  }

  async function updateTrackName(trackId, name) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      
      if (currentTrack.name === name) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        name: name,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity(`name-${trackId}`)
      await nextTick()
      return true
    }
    return false
  }

  function updateTrackChannel(trackId, channel) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      const newChannel = Math.max(0, Math.min(15, channel))
      
      if (currentTrack.channel === newChannel) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        channel: newChannel,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity(`channel-${trackId}`)
      return true
    }
    return false
  }

  function updateTrackMidiOutput(trackId, outputId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      
      if (currentTrack.midiOutput === outputId) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        midiOutput: outputId,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity(`output-${trackId}`)
      return true
    }
    return false
  }

  function updateTrackMidiInput(trackId, inputId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      
      if (currentTrack.midiInput === inputId) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        midiInput: inputId,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity(`input-${trackId}`)
      return true
    }
    return false
  }

  // ✅ FONCTION MANQUANTE AJOUTÉE
  async function updateTrackProgram(trackId, program) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      const newProgram = Math.max(0, Math.min(127, Math.round(program)))
      
      if (currentTrack.program === newProgram) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        program: newProgram,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🎹 Program piste ${trackId}: ${currentTrack.program} → ${newProgram}`)
      triggerReactivity(`program-${trackId}`)
      
      await nextTick()
      return true
    }

    console.error(`❌ Piste ${trackId} non trouvée pour mise à jour program`)
    return false
  }

  // ✅ FONCTION MANQUANTE AJOUTÉE
  async function updateTrackBank(trackId, bank) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      const newBank = Math.max(0, Math.min(16383, Math.round(bank))) // Bank Select peut aller jusqu'à 16383
      
      if (currentTrack.bank === newBank) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        bank: newBank,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      
      // console.log(`🏦 Bank piste ${trackId}: ${currentTrack.bank} → ${newBank}`)
      triggerReactivity(`bank-${trackId}`)
      
      await nextTick()
      return true
    }

    console.error(`❌ Piste ${trackId} non trouvée pour mise à jour bank`)
    return false
  }

  async function updateTrackColor(trackId, color) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      const currentTrack = tracks.value[trackIndex]
      
      if (currentTrack.color === color) {
        return true
      }

      const updatedTrack = {
        ...currentTrack,
        color: color,
        lastModified: Date.now()
      }

      tracks.value.splice(trackIndex, 1, updatedTrack)
      triggerReactivity(`color-${trackId}`)
      await nextTick()
      return true
    }
    return false
  }

  // ✅ FONCTIONS MANQUANTES AJOUTÉES

  function reorderTrack(trackId, newIndex) {
    const currentIndex = tracks.value.findIndex(t => t.id === trackId)
    if (currentIndex === -1 || currentIndex === newIndex) {
      return false
    }

    const track = tracks.value[currentIndex]
    const newTracks = [...tracks.value]
    
    // Supprimer de l'ancienne position
    newTracks.splice(currentIndex, 1)
    
    // Insérer à la nouvelle position
    newTracks.splice(newIndex, 0, track)
    
    tracks.value = newTracks
    
    // console.log(`🔄 Piste ${trackId} déplacée de ${currentIndex} vers ${newIndex}`)
    triggerReactivity(`reorder-${trackId}`)
    
    return true
  }

  function duplicateTrack(trackId) {
    const trackIndex = tracks.value.findIndex(t => t.id === trackId)
    if (trackIndex === -1) {
      return null
    }

    const originalTrack = tracks.value[trackIndex]
    const newTrackId = Date.now() + Math.random() // ID unique
    
    const duplicatedTrack = {
      ...originalTrack,
      id: newTrackId,
      name: `${originalTrack.name} (Copie)`,
      lastModified: Date.now()
    }

    // Insérer après la piste originale
    const newTracks = [...tracks.value]
    newTracks.splice(trackIndex + 1, 0, duplicatedTrack)
    tracks.value = newTracks

    // console.log(`📋 Piste ${trackId} dupliquée vers ${newTrackId}`)
    triggerReactivity(`duplicate-${trackId}`)

    return newTrackId
  }

  function removeEmptyTracks() {
    const tracksToRemove = []
    
    tracks.value.forEach(track => {
      const trackNotes = getTrackNotes.value(track.id)
      const trackCCs = getControlChangesForTrack.value(track.id)
      const hasContent = trackNotes.length > 0 || Object.keys(trackCCs).length > 0
      
      if (!hasContent) {
        tracksToRemove.push(track.id)
      }
    })

    if (tracksToRemove.length > 0) {
      tracks.value = tracks.value.filter(track => !tracksToRemove.includes(track.id))
      
      // console.log(`🗑️ ${tracksToRemove.length} piste(s) vide(s) supprimée(s)`)
      triggerReactivity(`remove-empty-tracks`)
    }

    return tracksToRemove.length
  }

  // ✅ ACTIONS DE MODIFICATION DES NOTES AJOUTÉES

  async function updateNote(noteId, updates) {
    const noteIndex = notes.value.findIndex(n => n.id === noteId)
    if (noteIndex === -1) {
      // Essayer une comparaison plus flexible (string vs number)
      const flexibleMatch = notes.value.findIndex(n => String(n.id) === String(noteId))
      if (flexibleMatch !== -1) {
        const currentNote = notes.value[flexibleMatch]
        Object.assign(currentNote, updates, { lastModified: Date.now() })
        triggerReactivity(`note-update-${noteId}`)
        await nextTick()
        return true
      }
      console.log(`❌ updateNote: Note ${noteId} non trouvée dans le store`)
      return false
    }

    const currentNote = notes.value[noteIndex]
    
    // Modifier directement les propriétés au lieu de remplacer l'objet
    // Cela préserve l'objet et assure la réactivité Vue
    Object.assign(currentNote, updates, { lastModified: Date.now() })
    
    triggerReactivity(`note-update-${noteId}`)
    
    await nextTick()
    return true
  }

  async function updateMultipleNotes(noteIds, updates) {
    let updatedCount = 0
    
    for (const noteId of noteIds) {
      const success = await updateNote(noteId, updates)
      if (success) updatedCount++
    }

    // console.log(`🎵 ${updatedCount}/${noteIds.length} notes mises à jour`)
    return updatedCount
  }

  function addNote(noteData) {
    // TRACE: Logger toutes les additions de notes avec stack trace
    console.log(`➕ STORE addNote appelé:`, {
      noteData,
      trackId: noteData.trackId,
      midi: noteData.midi,
      time: noteData.time,
      stack: new Error().stack.split('\n').slice(1, 4).join('\n')
    })
    
    const newNote = {
      id: Date.now() + Math.random(),
      ...noteData,
      lastModified: Date.now()
    }

    notes.value.push(newNote)
    
    console.log(`✅ Note ajoutée au store:`, newNote)
    triggerReactivity(`add-note-${newNote.id}`)
    
    return newNote.id
  }

  function deleteNote(noteId) {
    const noteIndex = notes.value.findIndex(n => n.id === noteId)
    if (noteIndex === -1) {
      return false
    }

    notes.value.splice(noteIndex, 1)
    
    // console.log(`❌ Note ${noteId} supprimée`)
    triggerReactivity(`delete-note-${noteId}`)
    
    return true
  }

  function deleteNotes(noteIds) {
    let deletedCount = 0
    
    for (const noteId of noteIds) {
      if (deleteNote(nodeId)) {
        deletedCount++
      }
    }

    // console.log(`❌ ${deletedCount}/${noteIds.length} notes supprimées`)
    return deletedCount
  }

  function duplicateNote(noteId) {
    const note = notes.value.find(n => n.id === noteId)
    if (!note) {
      return null
    }

    const newNoteId = addNote({
      ...note,
      time: note.time + 0.1 // Décaler légèrement pour éviter la superposition
    })

    // console.log(`📋 Note ${noteId} dupliquée vers ${newNoteId}`)
    return newNoteId
  }

  // ✅ ACTIONS DE MODIFICATION DES CONTROL CHANGES AJOUTÉES

  function addControlChange(ccData, context = 'manual') {
    // ID plus unique pour éviter les doublons dans l'enregistrement rapide
    const timestamp = Date.now()
    const microTime = Math.floor(performance.now() * 1000) // microsecondes
    const random = Math.floor(Math.random() * 1000000)
    const uniqueId = `cc-${timestamp}-${microTime}-${random}`
    
    const newCC = {
      id: uniqueId,
      ...ccData,
      lastModified: timestamp
    }

    midiCC.value.push(newCC)
    
    // OPTIMISATION: Utiliser triggerReactivity optimisé pendant l'enregistrement
    if (context === 'recording') {
      triggerReactivity('midi-recording-cc')
    } else {
      triggerReactivity(`add-cc-${newCC.id}`)
    }
    
    return newCC.id
  }

  // Alias pour compatibilité avec CCLane
  function addCC(ccData, context = 'manual') {
    return addControlChange(ccData, context)
  }

  async function updateControlChange(ccId, updates) {
    const ccIndex = midiCC.value.findIndex(cc => cc.id === ccId)
    if (ccIndex === -1) {
      return false
    }

    const currentCC = midiCC.value[ccIndex]
    const updatedCC = {
      ...currentCC,
      ...updates,
      lastModified: Date.now()
    }

    midiCC.value.splice(ccIndex, 1, updatedCC)
    
    // console.log(`🎛️ Control Change ${ccId} mis à jour:`, updates)
    triggerReactivity(`cc-update-${ccId}`)
    
    await nextTick()
    return true
  }

  // Alias pour compatibilité avec CCLane
  function updateCC(ccId, updates) {
    return updateControlChange(ccId, updates)
  }

  function deleteControlChange(ccId) {
    const ccIndex = midiCC.value.findIndex(cc => cc.id === ccId)
    if (ccIndex === -1) {
      return false
    }

    midiCC.value.splice(ccIndex, 1)
    
    // console.log(`❌ Control Change ${ccId} supprimé`)
    triggerReactivity(`delete-cc-${ccId}`)
    
    return true
  }

  // ==========================================
  // TEMPO EVENTS CRUD FUNCTIONS
  // ==========================================

  function addTempoEvent(tempoData) {
    const tempoEvent = {
      id: tempoData.id || `tempo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      bpm: Math.max(20, Math.min(300, tempoData.bpm || 120)), // Limiter entre 20 et 300 BPM
      time: tempoData.time || 0,
      ticks: tempoData.ticks || 0,
      lastModified: Date.now()
    }

    tempoEvents.value.push(tempoEvent)
    tempoEvents.value.sort((a, b) => a.time - b.time) // Maintenir l'ordre chronologique

    triggerReactivity(`add-tempo-${tempoEvent.id}`)
    return tempoEvent.id
  }

  function updateTempoEvent(tempoId, updates) {
    console.log('🎯 DEBUG updateTempoEvent CALLED:', { tempoId, updates })
    
    const tempoIndex = tempoEvents.value.findIndex(tempo => tempo.id === tempoId)
    if (tempoIndex === -1) {
      console.log('🎯 ERREUR: Tempo non trouvé:', tempoId)
      return false
    }

    const currentTempo = tempoEvents.value[tempoIndex]
    console.log('🎯 TEMPO ACTUEL:', currentTempo)
    
    // CORRECTION: Si on essaie de mettre un tempo à 0s et qu'il y a un tempo virtuel à 0s
    if (updates.time === 0) {
      const virtualTempo = tempoEvents.value.find(t => t.id === 'virtual-0s' && t.virtual)
      if (virtualTempo && virtualTempo.id !== tempoId) {
        // Supprimer le tempo virtuel pour permettre au tempo réel de prendre sa place
        const virtualIndex = tempoEvents.value.findIndex(t => t.id === 'virtual-0s')
        if (virtualIndex !== -1) {
          tempoEvents.value.splice(virtualIndex, 1)
          console.log('🎵 Tempo virtuel supprimé pour permettre le placement à 0s')
        }
      }
    }
    
    const updatedTempo = {
      ...currentTempo,
      ...updates,
      bpm: updates.bpm !== undefined ? Math.max(0, Math.min(300, updates.bpm)) : currentTempo.bpm,
      lastModified: Date.now()
    }
    
    console.log('🎯 TEMPO UPDATED:', updatedTempo)

    tempoEvents.value.splice(tempoIndex, 1, updatedTempo)
    tempoEvents.value.sort((a, b) => a.time - b.time) // Re-trier après modification
    
    console.log('🎯 TEMPOS APRÈS UPDATE:', tempoEvents.value.map(t => ({ id: t.id, time: t.time, bpm: t.bpm })))

    triggerReactivity(`tempo-update-${tempoId}`)
    return true
  }

  function deleteTempoEvent(tempoId) {
    const tempoIndex = tempoEvents.value.findIndex(tempo => tempo.id === tempoId)
    if (tempoIndex === -1) {
      return false
    }

    tempoEvents.value.splice(tempoIndex, 1)
    
    triggerReactivity(`delete-tempo-${tempoId}`)
    return true
  }

  // ==========================================
  // TIME SIGNATURE EVENTS CRUD FUNCTIONS
  // ==========================================
  function addTimeSignature(signatureData) {
    const signatureEvent = {
      id: signatureData.id || `timesig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      numerator: Math.max(1, Math.min(16, signatureData.numerator || 4)), // Limiter entre 1 et 16
      denominator: [1, 2, 4, 8, 16, 32].includes(signatureData.denominator) ? signatureData.denominator : 4, // Valeurs valides seulement
      time: signatureData.time || 0,
      ticks: signatureData.ticks || 0,
      measure: signatureData.measure || 1,
      lastModified: Date.now()
    }
    
    timeSignatureEvents.value.push(signatureEvent)
    timeSignatureEvents.value.sort((a, b) => a.time - b.time) // Maintenir l'ordre chronologique
    triggerReactivity(`add-timesig-${signatureEvent.id}`)
    console.log('✅ Signature rythmique ajoutée:', signatureEvent)
    return signatureEvent.id
  }

  function updateTimeSignature(signatureId, updates) {
    const signatureIndex = timeSignatureEvents.value.findIndex(sig => sig.id === signatureId)
    if (signatureIndex === -1) {
      return false
    }
    
    const currentSignature = timeSignatureEvents.value[signatureIndex]
    const updatedSignature = {
      ...currentSignature,
      ...updates,
      numerator: updates.numerator ? Math.max(1, Math.min(16, updates.numerator)) : currentSignature.numerator,
      denominator: updates.denominator && [1, 2, 4, 8, 16, 32].includes(updates.denominator) ? updates.denominator : currentSignature.denominator,
      lastModified: Date.now()
    }
    
    timeSignatureEvents.value.splice(signatureIndex, 1, updatedSignature)
    timeSignatureEvents.value.sort((a, b) => a.time - b.time) // Re-trier après modification
    triggerReactivity(`timesig-update-${signatureId}`)
    console.log('✅ Signature rythmique mise à jour:', updatedSignature)
    return true
  }

  function removeTimeSignature(signatureId) {
    const signatureIndex = timeSignatureEvents.value.findIndex(sig => sig.id === signatureId)
    if (signatureIndex === -1) {
      console.warn('❌ Signature rythmique non trouvée:', signatureId)
      return false
    }
    
    const signature = timeSignatureEvents.value[signatureIndex]
    
    // Empêcher la suppression de la première signature (mesure 1)
    if (signature.measure === 1 || signature.time === 0) {
      console.warn('❌ Impossible de supprimer la première signature rythmique')
      return false
    }
    
    timeSignatureEvents.value.splice(signatureIndex, 1)
    triggerReactivity(`delete-timesig-${signatureId}`)
    console.log('✅ Signature rythmique supprimée:', signature)
    return true
  }

  // 🚀 NETTOYAGE DÉFINITIF DES CC REDONDANTS
  function optimizeMidiCC() {
    const originalCount = midiCC.value.length
    
    if (originalCount === 0) return { removed: 0, remaining: 0 }
    
    // Grouper par piste et contrôleur
    const ccByTrackAndController = {}
    
    midiCC.value.forEach(cc => {
      const key = `${cc.trackId}-${cc.controller}`
      if (!ccByTrackAndController[key]) {
        ccByTrackAndController[key] = []
      }
      ccByTrackAndController[key].push(cc)
    })
    
    // Optimiser chaque groupe séparément
    const optimizedCC = []
    
    Object.values(ccByTrackAndController).forEach(ccGroup => {
      // DEBUG: Analyser CC7 spécifiquement
      const isCC7 = ccGroup.length > 0 && ccGroup[0].controller === 7
      if (isCC7) {
        console.log(`🎛️ AVANT FILTRAGE CC7: ${ccGroup.length} points`)
        ccGroup.forEach((cc, i) => {
          if (i < 10 || cc.time > 12) { // Premiers points + points proches de la mesure 7
            console.log(`  CC7 #${i}: time=${cc.time.toFixed(6)}s, value=${cc.value}, ticks=${cc.ticks}`)
          }
        })
      }
      
      if (ccGroup.length <= 2) {
        // Moins de 3 points : garder tous
        optimizedCC.push(...ccGroup)
        return
      }
      
      // Trier par temps
      ccGroup.sort((a, b) => a.time - b.time)
      
      // Algorithme radical de simplification
      const simplified = []
      let i = 0
      
      while (i < ccGroup.length) {
        simplified.push(ccGroup[i]) // Garder ce point
        
        // Chercher la plus longue ligne droite
        if (i < ccGroup.length - 1) {
          let j = i + 1
          let lastValidJ = i + 1 // Garder le dernier point valide trouvé
          
          while (j < ccGroup.length - 1) {
            const startPoint = ccGroup[i]
            const midPoint = ccGroup[j]
            const endPoint = ccGroup[j + 1]
            
            // Calculer valeur attendue sur ligne droite
            const expectedValue = startPoint.value + 
              (endPoint.value - startPoint.value) * 
              (midPoint.time - startPoint.time) / (endPoint.time - startPoint.time)
            
            // Tolérance TRÈS stricte pour ligne droite (réduite de 1.0 à 0.1)
            if (Math.abs(midPoint.value - expectedValue) <= 0.1) {
              lastValidJ = j + 1 // Mettre à jour le dernier point valide (endPoint)
              j++ // Point aligné, continuer
            } else {
              break // Plus aligné, arrêter
            }
          }
          
          // CORRECTION: Ajouter le dernier point de la ligne droite si on en a trouvé une
          if (lastValidJ > i + 1) {
            simplified.push(ccGroup[lastValidJ - 1]) // Ajouter le point final de la ligne droite
          }
          
          i = j // Sauter tous les points intermédiaires
        } else {
          i++
        }
      }
      
      // DEBUG: Analyser CC7 après filtrage
      if (isCC7) {
        console.log(`🎛️ APRÈS FILTRAGE CC7: ${simplified.length} points gardés`)
        simplified.forEach((cc, i) => {
          console.log(`  CC7 gardé #${i}: time=${cc.time.toFixed(6)}s, value=${cc.value}`)
        })
      }
      
      optimizedCC.push(...simplified)
    })
    
    // Remplacer les données
    midiCC.value = optimizedCC
    
    const removedCount = originalCount - optimizedCC.length
    console.log(`🚀 OPTIMISATION MIDI CC: ${removedCount} points supprimés (${originalCount} → ${optimizedCC.length})`)
    
    triggerReactivity('optimize-midi-cc')
    
    return {
      removed: removedCount,
      remaining: optimizedCC.length,
      percentage: ((removedCount / originalCount) * 100).toFixed(1)
    }
  }

  async function updateMultipleControlChanges(ccIds, updates) {
    let updatedCount = 0
    
    for (const ccId of ccIds) {
      const success = await updateControlChange(ccId, updates)
      if (success) updatedCount++
    }

    // console.log(`🎛️ ${updatedCount}/${ccIds.length} Control Changes mis à jour`)
    return updatedCount
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

    // Store: données brutes, pas d'interpolation (fait dans MidiPlayer)
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
    console.log('🔄 🚨 RESET STORE MIDI 🚨 - CC avant reset:', midiCC.value.length)
    notes.value = []
    tracks.value = []
    midiInfo.value = {}
    midiCC.value = []
    console.log('🔄 Après reset - CC count:', midiCC.value.length)
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

    console.log('🔄 Store réinitialisé')
  }

  function forceCCUpdate() {
    ccVersion.value++
    midiCC.value = [...midiCC.value]
    triggerReactivity('force-cc-update')
  }

  // ==========================================
  // ACTIONS DE SÉLECTION
  // ==========================================

  function selectTrack(trackId) {
    if (selectedTrack.value !== trackId) {
      selectedTrack.value = trackId
      selectedNote.value = null
      // console.log(`🎯 Piste sélectionnée: ${trackId}`)
    }
  }

  function selectNote(noteId) {
    const note = notes.value.find(n => n.id === noteId)
    if (note) {
      selectedNote.value = noteId
      selectedTrack.value = note.trackId
      // console.log(`🎵 Note sélectionnée: ${noteId}`)
    }
  }

  function clearSelection() {
    selectedTrack.value = null
    selectedNote.value = null
    // console.log('🚫 Sélection effacée')
  }

  // ==========================================
  // GETTERS COMPUTED AMÉLIORÉS
  // ==========================================

  const getTrackById = computed(() => (id) => {
    return tracks.value.find(track => track.id === id)
  })

  const getNoteById = computed(() => (id) => {
    return notes.value.find(note => note.id === id)
  })

  const getSelectedTrackData = computed(() => {
    if (selectedTrack.value !== null) {
      const track = tracks.value.find(t => t.id === selectedTrack.value)
      return track || null
    }
    return null
  })

  const getSelectedNoteData = computed(() => {
    return selectedNote.value !== null
      ? notes.value.find(n => n.id === selectedNote.value)
      : null
  })

  const getTrackNotes = computed(() => (trackId) => {
    return notes.value.filter(note => note.trackId === trackId)
  })

  const getControlChangesForTrack = computed(() => (trackId) => {
    const track = tracks.value.find(t => t.id === trackId)
    return track ? track.controlChanges || {} : {}
  })

  // ✅ GETTERS MANQUANTS AJOUTÉS

  const getNotesInTimeRange = computed(() => (startTime, endTime, trackId = null) => {
    let filteredNotes = notes.value.filter(note => {
      const noteEnd = note.time + note.duration
      return note.time < endTime && noteEnd > startTime
    })

    if (trackId !== null) {
      filteredNotes = filteredNotes.filter(note => note.trackId === trackId)
    }

    return filteredNotes
  })

  const getControlChangeById = computed(() => (id) => {
    return midiCC.value.find(cc => cc.id === id)
  })

  const getTrackControlChanges = computed(() => (trackId) => {
    return midiCC.value.filter(cc => cc.trackId === trackId)
  })

  const getControlChangesInTimeRange = computed(() => (startTime, endTime, trackId = null) => {
    let filteredCCs = midiCC.value.filter(cc => {
      return cc.time >= startTime && cc.time <= endTime
    })

    if (trackId !== null) {
      filteredCCs = filteredCCs.filter(cc => cc.trackId === trackId)
    }

    return filteredCCs
  })

  const getControlChangesByNumber = computed(() => (ccNumber) => {
    return midiCC.value.filter(cc => cc.number === ccNumber)
  })

  const getTrackControlChangesByNumber = computed(() => (trackId, ccNumber) => {
    return midiCC.value.filter(cc => cc.trackId === trackId && cc.number === ccNumber)
  })

  const getMutedTracks = computed(() => {
    return tracks.value.filter(track => track.muted)
  })

  const getSoloTracks = computed(() => {
    return tracks.value.filter(track => track.solo)
  })

  const getTrackNumbers = computed(() => {
    return tracks.value.map((track, index) => ({
      id: track.id,
      number: index + 1,
      name: track.name
    }))
  })

  // Getters de statistiques
  const getTrackCount = computed(() => tracks.value.length)
  const getNoteCount = computed(() => notes.value.length)
  const getControlChangeCount = computed(() => midiCC.value.length)
  const getTotalDuration = computed(() => midiInfo.value.duration || 0)
  
  const getCurrentTempo = computed(() => midiInfo.value.tempo || 120)

  // ✅ UTILITAIRES MANQUANTS AJOUTÉS

  function getTrackIndex(trackId) {
    return tracks.value.findIndex(t => t.id === trackId)
  }

  const getTracksWithMetadata = computed(() => {
    return tracks.value.map((track, index) => ({
      ...track,
      index,
      noteCount: getTrackNotes.value(track.id).length,
      ccCount: getTrackControlChanges.value(track.id).length
    }))
  })

  function getTrackDuration(trackId) {
    const trackNotes = getTrackNotes.value(trackId)
    if (trackNotes.length === 0) return 0
    
    return trackNotes.reduce((maxDuration, note) => {
      const noteEnd = note.time + note.duration
      return Math.max(maxDuration, noteEnd)
    }, 0)
  }

  function validateTrackOrder() {
    const issues = []
    
    tracks.value.forEach((track, index) => {
      if (!track.id) {
        issues.push(`Piste à l'index ${index} sans ID`)
      }
      if (!track.name) {
        issues.push(`Piste ${track.id} sans nom`)
      }
    })

    return issues
  }

  function getUpdatedNote(noteId, updates) {
    const note = getNoteById.value(noteId)
    if (!note) return null
    
    return {
      ...note,
      ...updates,
      lastModified: Date.now()
    }
  }

  // ==========================================
  // UTILITAIRES DE DEBUG
  // ==========================================

  function debugTrackState(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      console.log(`🐛 État piste ${trackId}:`, {
        name: track.name,
        volume: track.volume,
        pan: track.pan,
        muted: track.muted,
        solo: track.solo,
        channel: track.channel,
        program: track.program,
        bank: track.bank,
        lastModified: new Date(track.lastModified).toLocaleTimeString()
      })
    } else {
      console.log(`🐛 Piste ${trackId} non trouvée`)
    }
  }

  function debugStoreState() {
    console.log('🐛 État du store:', {
      tracksCount: tracks.value.length,
      notesCount: notes.value.length,
      ccCount: midiCC.value.length,
      selectedTrack: selectedTrack.value,
      selectedNote: selectedNote.value,
      lastModified: new Date(lastModified.value).toLocaleTimeString(),
      versionsTrack: tracksVersion.value,
      versionsNote: notesVersion.value,
      versionsCC: ccVersion.value
    })
  }

  function debugCCLanes() {
    console.log('\n🎛️ === DEBUG CC LANES ===')
    console.log(`Total CC dans le store: ${midiCC.value.length}`)
    console.log(`Piste sélectionnée: ${selectedTrack.value}`)
    
    if (midiCC.value.length > 0) {
      console.log('Premier CC:', midiCC.value[0])
      console.log('Structure du premier CC:', Object.keys(midiCC.value[0]))
      
      // Grouper par piste
      const ccByTrack = {}
      midiCC.value.forEach(cc => {
        if (!ccByTrack[cc.trackId]) ccByTrack[cc.trackId] = []
        ccByTrack[cc.trackId].push(cc)
      })
      
      console.log('CC par piste:')
      Object.entries(ccByTrack).forEach(([trackId, ccs]) => {
        const controllers = [...new Set(ccs.map(cc => cc.controller))].sort((a,b) => a-b)
        console.log(`  Piste ${trackId}: ${ccs.length} CC, controllers: [${controllers.join(', ')}]`)
      })
    }
    
    if (selectedTrack.value !== null) {
      const trackCC = midiCC.value.filter(cc => cc.trackId === selectedTrack.value)
      const controllers = [...new Set(trackCC.map(cc => cc.controller))].sort((a,b) => a-b)
      console.log(`\nPiste sélectionnée ${selectedTrack.value}: ${trackCC.length} CC, controllers: [${controllers.join(', ')}]`)
    }
    console.log('=== FIN DEBUG CC ===\n')
  }

  // ==========================================
  // FONCTION DEPRECATED (pour compatibilité)
  // ==========================================

  function exportToToneMidi() {
    console.warn('⚠️ exportToToneMidi est deprecated. Utilisez une fonction d\'export dédiée.')
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
    forceTrackUpdate,

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
    toggleTrackRecord,
    toggleTrackMonitor,
    updateTrackVolume,
    updateTrackName,
    updateTrackPan,
    updateTrackChannel,
    updateTrackMidiOutput,
    updateTrackMidiInput,
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
    addCC, // Alias
    updateControlChange,
    updateCC, // Alias
    deleteControlChange,
    updateMultipleControlChanges,
    optimizeMidiCC, // Nettoyage définitif des CC redondants

    // Actions de modification des Tempo Events
    addTempoEvent,
    updateTempoEvent,
    deleteTempoEvent,

    // Actions de modification des Time Signature Events
    addTimeSignature,
    updateTimeSignature,
    removeTimeSignature,

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
    debugTrackState,
    debugStoreState,
    debugCCLanes, // Debug CC lanes
    forceCCUpdate, // Force CC reactivity
    exportToToneMidi // Deprecated
  }
})