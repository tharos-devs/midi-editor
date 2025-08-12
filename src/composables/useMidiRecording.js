// composables/useMidiRecording.js - Gestion de l'enregistrement MIDI en temps réel

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMidiStore } from '@/stores/midi'
import { useProjectStore } from '@/stores/project'
import { useMidiManager } from '@/composables/useMidiManager'
import { useMidiPlayer } from '@/composables/useMidiPlayer'

export function useMidiRecording() {
  const midiStore = useMidiStore()
  const projectStore = useProjectStore()
  const midiManager = useMidiManager()
  const midiPlayer = useMidiPlayer()

  // ===== ÉTAT INITIAL DE L'ENREGISTREMENT =====
  // État de base
  const isRecording = ref(false)
  const recordingTrackId = ref(null)
  const recordedEvents = ref([])
  const midiInputListeners = ref(new Map())
  
  // État global d'armement d'enregistrement
  const isRecordArmed = ref(false)
  
  // Flag global pour bloquer complètement l'enregistrement
  const recordingBlocked = ref(false)
  
  // ID de session d'enregistrement pour invalider les anciens listeners
  let recordingSessionId = 0

  // Throttling pour les événements de mise à jour temps réel
  let lastCCUpdateEvent = 0
  let lastCCReactivity = 0
  const CC_UPDATE_THROTTLE = 50 // 20 FPS - réduire la fréquence d'événements
  const CC_REACTIVITY_THROTTLE = 100 // Limiter les triggerReactivity à 10 FPS

  // ===== ÉTAT DYNAMIQUE DE SESSION =====
  // Map pour tracker les notes en cours
  const activeNotes = ref(new Map())
  
  // UNIFIED REPLACE SYSTEM: Single system for all event types
  const activeReplaceZones = ref(new Map()) // key -> { startTime, trackId, type, eventKey }

  // Variables globales nécessaires (restaurées pour compatibilité)
  const initializeGlobalState = () => {
    // Temps de début d'enregistrement
    window.currentPlaybackTime = window.currentPlaybackTime || 0
    window.recordStartTime = window.currentPlaybackTime
    
    // Pistes en cours d'enregistrement
    window.recordingTrackIds = midiStore.tracks
      .filter(track => track.record)
      .map(track => track.id)
    
    // Trackers d'événements reçus par piste
    window.eventTrackers = new Map() // trackId -> Set de types d'événements reçus
  }

  const cleanupGlobalState = () => {
    // Nettoyage complet des variables globales
    if (window.recordStartTime !== undefined) {
      delete window.recordStartTime
    }
    if (window.recordingTrackIds !== undefined) {
      delete window.recordingTrackIds
    }
    if (window.eventTrackers !== undefined) {
      delete window.eventTrackers
    }
    // Note: window.currentPlaybackTime est maintenu par le player
  }

  // FONCTION DE RÉINITIALISATION COMPLÈTE
  const resetRecordingState = () => {
    // 1. Nettoyer l'état local
    recordingBlocked.value = false
    isRecording.value = false
    recordingTrackId.value = null
    recordedEvents.value.length = 0
    
    // 2. Nettoyer les états dynamiques
    activeNotes.value.clear()
    activeReplaceZones.value.clear()
    
    // 3. Nettoyer les variables globales
    cleanupGlobalState()
    
    // 4. Nettoyer les listeners MIDI
    clearMidiInputListeners()
    
    // Note: recordingSessionId sera incrémenté dans startRecording()
  }

  // Fonctions utilitaires
  function createNoteId() {
    return 'recorded-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  }

  // Gestion du monitoring MIDI (passthrough input → output)
  function handleMidiMonitoring(trackId, midiData) {
    // Trouver la piste correspondante
    const track = midiStore.tracks.find(t => t.id === trackId)
    if (!track || !track.monitor) return // ✅ CORRECTION: Ne monitorer que si activé

    // Vérifier si la piste a une sortie configurée
    const outputId = track.midiOutput || 'default'
    const trackChannel = track.channel || 0

    // Rediriger le message MIDI vers la sortie de la piste
    if (midiManager.midiSupported?.value) {
      // Modifier le canal MIDI si nécessaire
      const modifiedData = [...midiData]
      const status = midiData[0] & 0xF0
      const originalChannel = midiData[0] & 0x0F
      
      // Appliquer le canal de la piste si c'est un message avec canal
      if (status >= 0x80 && status <= 0xEF) {
        modifiedData[0] = status | trackChannel
      }

      // Envoyer vers la sortie MIDI
      const success = midiManager.sendMidiMessage(outputId, modifiedData)
      
      if (!success) {
        console.error(`❌ Monitoring MIDI échec: Track ${trackId} → ${outputId}`)
      }
    }
  }

  // Gérer les événements MIDI entrants
  function handleMidiMessage(trackId, event, sessionId = 0) {
    const data = event.data
    const timestamp = event.timeStamp || performance.now()
    
    // ÉMISSION D'ÉVÉNEMENT D'ACTIVITÉ MIDI pour les indicateurs visuels
    window.dispatchEvent(new CustomEvent('midi-activity', {
      detail: { trackId, timestamp }
    }))
    
    // MONITORING MIDI : Rediriger vers la sortie seulement si Monitor activé
    handleMidiMonitoring(trackId, data)
    
    // Décoder le message MIDI pour debug
    const status = data[0] & 0xF0
    const channel = data[0] & 0x0F
    const param1 = data[1]
    const param2 = data[2]
    
    // CC messages received and processed
    
    // VÉRIFICATIONS CRITIQUES
    if (sessionId !== recordingSessionId) return
    if (recordingBlocked.value) return
    if (!isRecording.value) return
    if (midiPlayer.isPaused?.value) return
    
    // Obtenir le temps actuel depuis une variable globale mise à jour par le player
    let recordTime = window.currentPlaybackTime || 0

    // ENREGISTREMENT : Seulement si la piste a Record activé ET enregistrement global en cours
    const track = midiStore.tracks.find(t => t.id === trackId)
    const shouldRecord = track?.record && isRecording.value && !recordingBlocked.value
    
    if (!shouldRecord) {
      return
    }

    switch (status) {
      case 0x90: // Note On
        if (param2 > 0) { // velocity > 0
          handleNoteOn(trackId, channel, param1, param2, recordTime, timestamp)
        } else {
          // Velocity 0 = Note Off
          handleNoteOff(trackId, channel, param1, recordTime, timestamp)
        }
        break

      case 0x80: // Note Off
        handleNoteOff(trackId, channel, param1, recordTime, timestamp)
        break

      case 0xB0: // Control Change
        handleControlChange(trackId, channel, param1, param2, recordTime, timestamp)
        break

      case 0xE0: // Pitch Bend
        const pitchValue = (param2 << 7) + param1 - 8192
        handlePitchBend(trackId, channel, pitchValue, recordTime, timestamp)
        break
    }
  }

  function handleNoteOn(trackId, channel, note, velocity, recordTime, timestamp) {
    if (recordingBlocked.value || !isRecording.value) return
    
    const noteKey = `${trackId}-${channel}-${note}`
    
    // REPLACE MODE: Start replace zone
    if (projectStore.userPreferences.keyboard.recordingMode === 'replace') {
      activeReplaceZones.value.set(noteKey, {
        startTime: recordTime,
        trackId: trackId,
        type: 'note',
        eventKey: noteKey,
        note: note,
        channel: channel
      })
    }
    
    // Marquer les événements reçus pour le tracking
    const eventTracker = window.eventTrackers?.get(trackId) || new Set()
    if (!eventTracker.has('note')) {
      eventTracker.add('note')
      window.eventTrackers?.set(trackId, eventTracker)
    }
    
    // If identical note is already active, finish it first
    if (activeNotes.value.has(noteKey)) {
      const existingNote = activeNotes.value.get(noteKey)
      const duration = Math.max(0.1, recordTime - existingNote.startTime)
      finalizeNote(existingNote.id, duration)
    }

    // Create new note
    const noteId = createNoteId()
    const noteData = {
      id: noteId,
      trackId: trackId,
      midi: note,
      velocity: velocity / 127,
      time: recordTime,
      startTime: recordTime,
      channel: channel,
      timestamp: timestamp
    }

    activeNotes.value.set(noteKey, noteData)
  }

  function handleNoteOff(trackId, channel, note, recordTime, timestamp) {
    if (recordingBlocked.value || !isRecording.value) return
    
    const noteKey = `${trackId}-${channel}-${note}`
    
    // REPLACE MODE: Clear events in time range and close zone
    if (projectStore.userPreferences.keyboard.recordingMode === 'replace') {
      const replaceZone = activeReplaceZones.value.get(noteKey)
      if (replaceZone) {
        clearEventsInTimeRange(trackId, replaceZone.startTime, recordTime, 'note', { note, channel })
        activeReplaceZones.value.delete(noteKey)
      }
    }
    
    if (activeNotes.value.has(noteKey)) {
      const noteData = activeNotes.value.get(noteKey)
      const duration = Math.max(0.1, recordTime - noteData.startTime)
      
      finalizeNote(noteData.id, duration)
      activeNotes.value.delete(noteKey)
    }
  }

  function finalizeNote(noteId, duration) {
    if (recordingBlocked.value || !isRecording.value) return
    
    const noteData = [...activeNotes.value.values()].find(n => n.id === noteId)
    if (!noteData) return

    // Créer la note complète
    const completeNote = {
      id: noteId,
      trackId: noteData.trackId,
      midi: noteData.midi,
      velocity: noteData.velocity,
      time: noteData.time,
      duration: duration
    }

    // Ajouter au store
    midiStore.notes.push(completeNote)
    
    // Ajouter aux événements enregistrés pour le suivi
    recordedEvents.value.push({
      type: 'note',
      timestamp: Date.now(),
      data: completeNote
    })

    // Déclencher la réactivité
    midiStore.triggerReactivity('midi-recording-note')
  }

  function handleControlChange(trackId, channel, controller, value, recordTime, timestamp) {
    const perfStart = performance.now()
    
    if (recordingBlocked.value || !isRecording.value) {
      return
    }
    
    const ccKey = `${trackId}-${channel}-${controller}`
    
    // REPLACE MODE DÉSACTIVÉ: Cause trop de problèmes de performance
    // Mode merge uniquement pendant l'enregistrement pour performance maximale
    if (false && projectStore.userPreferences.keyboard.recordingMode === 'replace') {
      // Code replace désactivé temporairement
    }
    
    // Marquer les événements CC reçus pour le tracking
    const eventTracker = window.eventTrackers?.get(trackId) || new Set()
    const ccTrackKey = `cc${controller}`
    if (!eventTracker.has(ccTrackKey)) {
      eventTracker.add(ccTrackKey)
      window.eventTrackers?.set(trackId, eventTracker)
    }
    
    // Add new CC event OPTIMISÉ POUR L'ENREGISTREMENT
    const newCCId = midiStore.addCC({
      trackId: trackId,
      controller: controller.toString(),
      time: recordTime,
      value: value,
      channel: channel
    }, 'recording') // Paramètre pour indiquer le contexte d'enregistrement

    recordedEvents.value.push({
      type: 'cc',
      timestamp: Date.now(),
      data: { trackId, controller, value, time: recordTime }
    })
    
    // RÉACTIVITÉ THROTTLÉE: Éviter les recalculations trop fréquentes
    const now = performance.now()
    if (now - lastCCReactivity > CC_REACTIVITY_THROTTLE) {
      lastCCReactivity = now
      midiStore.triggerReactivity('midi-recording-cc')
    }
    
    // TEMPS RÉEL THROTTLÉ: Émettre événement seulement si pas trop fréquent
    if (now - lastCCUpdateEvent > CC_UPDATE_THROTTLE) {
      lastCCUpdateEvent = now
      window.dispatchEvent(new CustomEvent('midi-cc-updated', {
        detail: { controller, value, recordTime, trackId }
      }))
    }
    
    // PROFILING AVANCÉ: Mesurer tous les temps
    const perfEnd = performance.now()
    const duration = perfEnd - perfStart
    
    // Compter le nombre total de CC pour correlation avec performance
    const totalCCCount = midiStore.midiCC.length
    
    if (duration > 2) { // Seuil abaissé pour plus de détails
      console.warn(`⚡ PERF CC${controller}: ${duration.toFixed(1)}ms (${totalCCCount} CC total) - LENT!`)
    }
    
    // Log périodique pour tracker la dégradation
    if (totalCCCount % 200 === 0) {
      console.log(`📈 PERF TREND CC${controller}: ${duration.toFixed(1)}ms @ ${totalCCCount} CC total`)
    }
  }

  function handlePitchBend(trackId, channel, pitchValue, recordTime, timestamp) {
    // TODO: Implémenter le stockage des pitch bends si nécessaire
  }

  // Configuration des listeners d'input MIDI (MONITORING + ENREGISTREMENT)
  function setupMidiInputListening() {
    clearMidiInputListeners()

    // Parcourir toutes les pistes pour configurer les inputs
    midiStore.tracks.forEach(track => {
      const inputId = track.midiInput
      
      if (!inputId || inputId === 'none') {
        if (track.record && !recordingBlocked.value) {
          console.warn(`⚠️ Piste ${track.id} a Record activé mais aucun input MIDI configuré !`)
        }
        return
      }

      // ✅ CORRECTION: Ne configurer les listeners que si Record OU Monitor activé
      // Mais pour Record, vérifier aussi que l'enregistrement n'est pas bloqué
      const shouldSetupRecord = track.record && !recordingBlocked.value
      const shouldSetupMonitor = track.monitor
      
      if (!shouldSetupRecord && !shouldSetupMonitor) {
        return
      }

      // Déterminer si on a besoin d'enregistrement ou seulement monitoring
      const monitoringOnly = !shouldSetupRecord && shouldSetupMonitor

      if (inputId === 'all') {
        // Écouter tous les inputs
        const availableInputs = midiManager.availableInputs?.value || []
        availableInputs.forEach(input => {
          setupInputListener(track.id, input.input, monitoringOnly)
        })
      } else {
        // Écouter un input spécifique
        const input = midiManager.availableInputs?.value?.find(i => i.id === inputId)
        if (input?.input) {
          setupInputListener(track.id, input.input, monitoringOnly)
        } else {
          console.error(`❌ Input MIDI "${inputId}" non trouvé pour piste ${track.id}`)
        }
      }
    })
  }

  // Configuration automatique du monitoring (appelé dès qu'une piste change d'input)
  function setupMidiMonitoring() {
    setupMidiInputListening()
  }

  function setupInputListener(trackId, midiInput, monitoringOnly = false) {
    const listenerKey = `${trackId}-${midiInput.id}`
    
    // Éviter les doublons
    if (midiInputListeners.value.has(listenerKey)) {
      return
    }

    // Créer un listener différent selon le mode
    let listener
    if (monitoringOnly) {
      // Listener UNIQUEMENT pour le monitoring
      listener = (event) => {
        // ÉMISSION D'ÉVÉNEMENT D'ACTIVITÉ MIDI pour les indicateurs visuels
        window.dispatchEvent(new CustomEvent('midi-activity', {
          detail: { trackId, timestamp: event.timeStamp || performance.now() }
        }))
        
        handleMidiMonitoring(trackId, event.data)
      }
    } else {
      // Listener complet (monitoring + enregistrement)
      const currentSessionId = recordingSessionId
      listener = (event) => handleMidiMessage(trackId, event, currentSessionId)
    }
    
    midiInput.addEventListener('midimessage', listener)
    midiInputListeners.value.set(listenerKey, {
      input: midiInput,
      listener: listener,
      trackId: trackId,
      sessionId: monitoringOnly ? -1 : recordingSessionId,
      monitoringOnly: monitoringOnly
    })
  }

  function clearMidiInputListeners() {
    midiInputListeners.value.forEach((config, key) => {
      config.input.removeEventListener('midimessage', config.listener)
    })
    midiInputListeners.value.clear()
  }

  // Armer/Désarmer l'enregistrement
  function setRecordArmed(armed) {
    isRecordArmed.value = armed
  }

  function toggleRecordArmed() {
    setRecordArmed(!isRecordArmed.value)
  }


  // OPTIMISÉ: Clear events in time range - éviter le filtrage complet du tableau
  function clearEventsInTimeRange(trackId, fromTime, toTime, eventType = 'all', params = {}) {
    if (fromTime >= toTime) return
    
    let updated = false
    
    // Clear notes if specified or all
    if (eventType === 'all' || eventType === 'note') {
      const originalLength = midiStore.notes.length
      midiStore.notes = midiStore.notes.filter(note => {
        if (note.trackId !== trackId) return true
        if (params.note !== undefined && note.midi !== params.note) return true
        if (params.channel !== undefined && note.channel !== params.channel) return true
        
        const noteEndTime = note.time + (note.duration || 0)
        return noteEndTime <= fromTime || note.time >= toTime
      })
      updated = updated || (midiStore.notes.length !== originalLength)
    }
    
    // OPTIMISATION CC: Utiliser findIndex + splice au lieu de filter complet
    if (eventType === 'all' || eventType === 'cc') {
      const perfStart = performance.now()
      let removedCount = 0
      
      // SOLUTION OPTIMISÉE: Parcours inverse pour éviter les problèmes d'index lors des suppressions
      for (let i = midiStore.midiCC.length - 1; i >= 0; i--) {
        const cc = midiStore.midiCC[i]
        
        if (parseInt(cc.trackId) !== trackId) continue
        if (params.controller !== undefined && parseInt(cc.controller) !== params.controller) continue
        if (params.channel !== undefined && cc.channel !== params.channel) continue
        
        const ccTime = parseFloat(cc.time)
        
        // Si le CC est dans la zone de temps à supprimer
        if (ccTime >= fromTime && ccTime < toTime) {
          midiStore.midiCC.splice(i, 1)
          removedCount++
        }
      }
      
      const perfEnd = performance.now()
      const duration = perfEnd - perfStart
      
      if (removedCount > 0) {
        updated = true
        console.log(`🗑️ REPLACE MODE: Supprimé ${removedCount} CC en ${duration.toFixed(1)}ms (${fromTime.toFixed(3)}s-${toTime.toFixed(3)}s)`)
      }
      
      // Log performance si lent
      if (duration > 1) {
        console.warn(`⚡ PERF clearEventsInTimeRange: ${duration.toFixed(1)}ms pour ${midiStore.midiCC.length} CC - OPTIMIZE!`)
      }
    }
    
    if (updated) {
      midiStore.triggerReactivity('replace-clear')
    }
  }

  // REMOVED: Complex atomic CC replace - functionality moved to clearEventsInTimeRange

  // REMOVED: Replaced by unified clearEventsInTimeRange function

  // REMOVED: Legacy function - no longer needed

  // DÉMARRER L'ENREGISTREMENT avec état initial cohérent
  function startRecording(trackId = null, mode = 'merge') {
    // 🚧 GARDE: Empêcher les appels multiples simultanés
    if (isRecording.value) {
      console.warn('⚠️ RECORD START: Enregistrement déjà en cours, ignoré', {
        currentSessionId: recordingSessionId,
        requestedMode: mode
      })
      return false
    }
    
    // 1. Incrémenter AVANT la réinitialisation pour nouvelle session
    recordingSessionId++
    console.log('🟢 RECORD START: Démarrage session', recordingSessionId)
    
    // 2. RÉINITIALISATION COMPLÈTE - Toujours partir du même état
    resetRecordingState()
    
    // 3. RÉINITIALISER LES THROTTLES POUR PERFORMANCE OPTIMALE
    lastCCUpdateEvent = 0
    lastCCReactivity = 0
    
    // 4. INITIALISATION DE L'ÉTAT D'ENREGISTREMENT
    recordingBlocked.value = false
    isRecording.value = true
    recordingTrackId.value = trackId
    
    // 5. INITIALISATION DES VARIABLES GLOBALES
    initializeGlobalState()
    
    // 6. CONFIGURATION DES LISTENERS MIDI
    setupMidiInputListening()
    
    console.log('🟢 RECORD START: État initialisé', { 
      sessionId: recordingSessionId,
      mode,
      trackId,
      recordingTracks: window.recordingTrackIds?.length || 0
    })
    
    return true
  }

  // Finalize replace zones - CORRECT: sauvegarder les nouveaux CC avant suppression
  function finalizeReplaceZones() {
    if (projectStore.userPreferences.keyboard.recordingMode !== 'replace') return
    if (activeReplaceZones.value.size === 0) return
    
    const stopTime = window.currentPlaybackTime || 0
    
    // Process CC zones (extend to stop time) - NETTOYAGE EN BLOC OPTIMISÉ
    activeReplaceZones.value.forEach((zone, key) => {
      if (zone.type === 'cc') {
        const perfStart = performance.now()
        
        // OPTIMISATION: Suppression en bloc des anciens CC dans la zone de temps
        clearEventsInTimeRange(zone.trackId, zone.startTime, stopTime, 'cc', { 
          controller: zone.controller, 
          channel: zone.channel 
        })
        
        const perfEnd = performance.now()
        console.log(`🔧 Finalisation zone CC${zone.controller}: ${zone.startTime.toFixed(3)}s à ${stopTime.toFixed(3)}s - nettoyé en ${(perfEnd - perfStart).toFixed(1)}ms`)
      }
    })
    
    activeReplaceZones.value.clear()
    
    // FORCER la mise à jour de l'interface après finalizeReplaceZones
    console.log('🔄 Émission midi-cc-updated FORCÉ après replace')
    window.dispatchEvent(new CustomEvent('midi-cc-updated', {
      detail: { forceAll: true, eventCount: midiStore.midiCC.length }
    }))
  }

  // ARRÊTER L'ENREGISTREMENT et restaurer état monitoring
  function stopRecording(mode = 'merge') {
    // 🚧 GARDE: Vérifier qu'un enregistrement est bien en cours
    if (!isRecording.value) {
      console.warn('⚠️ RECORD STOP: Aucun enregistrement en cours, ignoré')
      return []
    }
    
    console.log('🔴 RECORD STOP: Finalisation en cours...', {
      sessionId: recordingSessionId,
      eventsRecorded: recordedEvents.value.length
    })
    
    // 1. FINALISER LES ZONES DE REMPLACEMENT
    finalizeReplaceZones()
    
    // 2. BLOQUER IMMÉDIATEMENT L'ENREGISTREMENT
    recordingBlocked.value = true
    isRecording.value = false
    
    // 3. FINALISER LES NOTES ACTIVES
    const stopTime = window.currentPlaybackTime || 0
    const eventsToSave = [...recordedEvents.value] // Copie pour retour
    
    activeNotes.value.forEach((noteData) => {
      const duration = Math.max(0.1, stopTime - noteData.startTime)
      const completeNote = {
        id: noteData.id,
        trackId: noteData.trackId,
        midi: noteData.midi,
        velocity: noteData.velocity,
        time: noteData.time,
        duration: duration
      }
      
      midiStore.notes.push(completeNote)
      eventsToSave.push({
        type: 'note',
        timestamp: Date.now(),
        data: completeNote
      })
    })
    
    // 4. NETTOYER COMPLÈTEMENT L'ÉTAT
    recordingTrackId.value = null
    
    // 5. DÉCLENCHER RÉACTIVITÉ AVANT RESET
    midiStore.triggerReactivity('midi-recording-stop')
    
    // 6. ÉMETTRE ÉVÉNEMENT POUR MISE À JOUR DES ONGLETS CC
    // STOP: Émettre sans filtrage de contrôleur pour forcer toutes les lanes
    window.dispatchEvent(new CustomEvent('midi-cc-updated', {
      detail: { 
        eventCount: eventsToSave.length,
        forceAll: true  // Flag spécial pour forcer toutes les lanes
      }
    }))
    
    // 7. RESTAURER L'ÉTAT INITIAL POUR PROCHAIN ENREGISTREMENT
    // Note: On ne fait PAS resetRecordingState() car on veut garder les listeners de monitoring
    activeNotes.value.clear()
    activeReplaceZones.value.clear()
    recordedEvents.value.length = 0
    cleanupGlobalState()
    recordingSessionId++
    
    // 8. RECONFIGURER LES LISTENERS POUR MONITORING UNIQUEMENT
    clearMidiInputListeners()
    setupMidiInputListening()
    
    console.log('🔴 RECORD STOP: Terminé', { eventsCount: eventsToSave.length })
    return eventsToSave
  }

  // Propriétés calculées
  const recordedEventCount = computed(() => recordedEvents.value.length)
  const hasActiveNotes = computed(() => activeNotes.value.size > 0)

  // Gestionnaires d'événements globaux
  function handleRecordingStart(event) {
    const mode = event.detail?.mode || projectStore.userPreferences.keyboard.recordingMode || 'merge'
    startRecording(null, mode)
  }

  function handleRecordingStop(event) {
    if (isRecording.value) {
      const mode = event.detail?.mode || projectStore.userPreferences.keyboard.recordingMode || 'merge'
      stopRecording(mode)
    }
  }

  // Configuration des événements et monitoring
  onMounted(() => {
    window.addEventListener('midi-recording-start', handleRecordingStart)
    window.addEventListener('midi-recording-stop', handleRecordingStop)
    
    // Démarrer le monitoring automatiquement si des inputs sont configurés
    setupMidiMonitoring()
  })

  // Watcher pour reconfigurer le monitoring quand les inputs ou états Record/Monitor changent
  watch(() => midiStore.tracks.map(t => ({
    midiInput: t.midiInput,
    record: t.record,
    monitor: t.monitor
  })), () => {
    setupMidiMonitoring()
  }, { deep: true })

  // Nettoyage
  onUnmounted(() => {
    window.removeEventListener('midi-recording-start', handleRecordingStart)
    window.removeEventListener('midi-recording-stop', handleRecordingStop)
    
    clearMidiInputListeners()
    if (isRecording.value) {
      stopRecording()
    }
  })

  // Expose replace zones globally for UI components
  window.activeReplaceZones = activeReplaceZones

  return {
    // État
    isRecording,
    isRecordArmed,
    recordingTrackId,
    recordedEvents,
    recordedEventCount,
    hasActiveNotes,

    // Actions
    startRecording,
    stopRecording,
    setRecordArmed,
    toggleRecordArmed,
    setupMidiInputListening,
    setupMidiMonitoring,
    clearMidiInputListeners,

    // Utilitaires
    handleMidiMessage
  }
}