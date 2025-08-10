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

  // État de l'enregistrement
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
      
      // Log minimal seulement en cas de problème
      if (!success) {
        console.log(`❌ Monitoring MIDI échec: Track ${trackId} → ${outputId}`)
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
    
    // VÉRIFICATIONS CRITIQUES : Plusieurs niveaux de protection avec logs détaillés
    if (sessionId !== recordingSessionId) {
      console.log(`🚫 MIDI ignoré: session obsolète (${sessionId} vs ${recordingSessionId})`)
      return
    }
    
    if (recordingBlocked.value) {
      console.log(`🚫 MIDI ignoré: enregistrement bloqué (trackId=${trackId})`)
      return
    }
    
    if (!isRecording.value) {
      console.log(`🚫 MIDI ignoré: enregistrement arrêté (trackId=${trackId})`)
      return
    }
    
    // VÉRIFICATION CRITIQUE: Vérifier si le lecteur MIDI est en pause
    if (midiPlayer.isPaused?.value) {
      console.log(`🚫 MIDI ignoré: lecteur en pause (trackId=${trackId})`)
      return
    }
    
    // Obtenir le temps actuel depuis une variable globale mise à jour par le player
    let recordTime = window.currentPlaybackTime || 0

    // Décoder le message MIDI
    const status = data[0] & 0xF0
    const channel = data[0] & 0x0F
    const note = data[1]
    const velocity = data[2]
    
    // ENREGISTREMENT : Seulement si la piste a Record activé ET enregistrement global en cours
    const track = midiStore.tracks.find(t => t.id === trackId)
    const shouldRecord = track?.record && isRecording.value && !recordingBlocked.value
    
    if (!shouldRecord) {
      // Si on ne devrait pas enregistrer, ne pas traiter l'événement du tout
      return
    }
    
    // MODE REPLACE : Pas de suppression continue ici, seulement au moment de la réception d'événements
    
    console.log(`🔍 Debug Record: trackId=${trackId} track.record=${track?.record} isRecording=${isRecording.value} shouldRecord=${shouldRecord}`)
    
    console.log(`🎤 ENREGISTREMENT: Status=${status.toString(16)} Channel=${channel + 1} Note=${note} Vel=${velocity} Time=${recordTime.toFixed(3)}s`)

    switch (status) {
      case 0x90: // Note On
        if (velocity > 0) {
          handleNoteOn(trackId, channel, note, velocity, recordTime, timestamp)
        } else {
          // Velocity 0 = Note Off
          handleNoteOff(trackId, channel, note, recordTime, timestamp)
        }
        break

      case 0x80: // Note Off
        handleNoteOff(trackId, channel, note, recordTime, timestamp)
        break

      case 0xB0: // Control Change
        handleControlChange(trackId, channel, data[1], data[2], recordTime, timestamp)
        break

      case 0xE0: // Pitch Bend
        const pitchValue = (data[2] << 7) + data[1] - 8192
        handlePitchBend(trackId, channel, pitchValue, recordTime, timestamp)
        break
    }
  }

  // Map pour tracker les notes en cours
  const activeNotes = ref(new Map())

  function handleNoteOn(trackId, channel, note, velocity, recordTime, timestamp) {
    // VÉRIFICATION CRITIQUE: Bloquer si enregistrement arrêté
    if (recordingBlocked.value || !isRecording.value) {
      console.log(`🚫 handleNoteOn BLOQUÉ: recordingBlocked=${recordingBlocked.value}, isRecording=${isRecording.value}`)
      return
    }
    
    const noteKey = `${trackId}-${channel}-${note}`
    
    // MODE REPLACE : Supprimer les événements existants au moment précis de la réception d'une note MIDI
    if (projectStore.userPreferences.keyboard.recordingMode === 'replace') {
      console.log(`🗑️ Replace: suppression notes existantes au moment de réception à ${recordTime.toFixed(3)}s`)
      const timeWindow = 0.05 // 50ms de fenêtre
      clearEventsAtTime(trackId, 'note', recordTime, timeWindow)
    }
    
    // Vérifier si c'est le premier événement Note pour cette piste
    const eventTracker = window.eventTrackers?.get(trackId) || new Set()
    const isFirstNoteEvent = !eventTracker.has('note')
    
    if (isFirstNoteEvent) {
      console.log(`🎵 Premier événement Note reçu pour piste ${trackId} à ${recordTime.toFixed(3)}s`)
      
      // Marquer que cette piste reçoit maintenant des événements Note
      eventTracker.add('note')
      window.eventTrackers?.set(trackId, eventTracker)
    }
    
    // Si une note identique est déjà active, la terminer d'abord
    if (activeNotes.value.has(noteKey)) {
      const existingNote = activeNotes.value.get(noteKey)
      const duration = Math.max(0.1, recordTime - existingNote.startTime)
      finalizeNote(existingNote.id, duration)
    }

    // Créer une nouvelle note
    const noteId = createNoteId()
    const noteData = {
      id: noteId,
      trackId: trackId,
      midi: note,
      velocity: velocity / 127, // Convertir en format 0-1
      time: recordTime,
      startTime: recordTime,
      channel: channel,
      timestamp: timestamp
    }

    // Stocker la note active
    activeNotes.value.set(noteKey, noteData)

    console.log(`🎵 Note On enregistrée: ${note} (${noteId}) à ${recordTime.toFixed(3)}s`)
  }

  function handleNoteOff(trackId, channel, note, recordTime, timestamp) {
    // VÉRIFICATION CRITIQUE: Bloquer si enregistrement arrêté
    if (recordingBlocked.value || !isRecording.value) {
      console.log(`🚫 handleNoteOff BLOQUÉ: recordingBlocked=${recordingBlocked.value}, isRecording=${isRecording.value}`)
      return
    }
    
    const noteKey = `${trackId}-${channel}-${note}`
    
    if (activeNotes.value.has(noteKey)) {
      const noteData = activeNotes.value.get(noteKey)
      const currentTime = window.currentPlaybackTime || 0
      const duration = Math.max(0.1, currentTime - noteData.startTime)
      
      // Finaliser la note
      finalizeNote(noteData.id, duration)
      
      // Supprimer de la map des notes actives
      activeNotes.value.delete(noteKey)

      console.log(`🎵 Note Off enregistrée: ${note} durée=${duration.toFixed(3)}s`)
    }
  }

  function finalizeNote(noteId, duration) {
    // VÉRIFICATION CRITIQUE: Bloquer si enregistrement arrêté
    if (recordingBlocked.value || !isRecording.value) {
      console.log(`🚫 finalizeNote BLOQUÉ: recordingBlocked=${recordingBlocked.value}, isRecording=${isRecording.value}`)
      return
    }
    
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

    // TRACE: Log avant ajout direct au store
    console.log(`➕ DIRECT PUSH vers midiStore.notes:`, {
      noteId: completeNote.id,
      midi: completeNote.midi,
      time: completeNote.time,
      duration: completeNote.duration,
      recordingBlocked: recordingBlocked.value,
      isRecording: isRecording.value,
      stack: new Error().stack.split('\n').slice(1, 3).join('\n')
    })
    
    // Ajouter au store
    midiStore.notes.push(completeNote)
    
    console.log(`✅ Note enregistrée: ${completeNote.midi} durée=${duration.toFixed(3)}s`)
    
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
    // VÉRIFICATION CRITIQUE: Bloquer si enregistrement arrêté
    if (recordingBlocked.value || !isRecording.value) {
      console.log(`🚫 handleControlChange BLOQUÉ: recordingBlocked=${recordingBlocked.value}, isRecording=${isRecording.value}`)
      return
    }
    
    // MODE REPLACE : Supprimer les événements existants au moment précis de la réception d'un CC MIDI
    if (projectStore.userPreferences.keyboard.recordingMode === 'replace') {
      console.log(`🗑️ Replace: suppression CC${controller} existants au moment de réception à ${recordTime.toFixed(3)}s`)
      const timeWindow = 0.05 // 50ms de fenêtre
      clearEventsAtTime(trackId, 'cc', recordTime, timeWindow, controller)
    }
    
    // Vérifier si c'est le premier événement CC de ce numéro pour cette piste
    const eventTracker = window.eventTrackers?.get(trackId) || new Set()
    const ccKey = `cc${controller}`
    const isFirstCCEvent = !eventTracker.has(ccKey)
    
    if (isFirstCCEvent) {
      console.log(`🎛️ Premier événement CC${controller} reçu pour piste ${trackId} à ${recordTime.toFixed(3)}s`)
      
      // Marquer que cette piste reçoit maintenant des événements CC de ce numéro
      eventTracker.add(ccKey)
      window.eventTrackers?.set(trackId, eventTracker)
    }
    
    // Créer l'événement CC avec les bons types
    const ccEvent = {
      id: createNoteId(),
      trackId: trackId, // Garder en number
      controller: controller.toString(), // String pour cohérence avec CCLane
      value: value.toString(), // String pour cohérence
      time: recordTime.toString(), // String pour cohérence
      channel: channel,
      lastModified: Date.now()
    }

    // Utiliser la méthode du store au lieu de push direct
    midiStore.addCC({
      trackId: trackId,
      controller: controller.toString(),
      time: recordTime,
      value: value,
      channel: channel
    })

    console.log(`✅ CC enregistré: CC${controller}=${value}`)

    // Ajouter aux événements enregistrés
    recordedEvents.value.push({
      type: 'cc',
      timestamp: Date.now(),
      data: ccEvent
    })
  }

  function handlePitchBend(trackId, channel, pitchValue, recordTime, timestamp) {
    // Pour l'instant, on peut logger les pitch bends
    console.log(`🎚️ Pitch Bend: ${pitchValue} à ${recordTime.toFixed(3)}s`)
    
    // TODO: Implémenter le stockage des pitch bends si nécessaire
  }

  // Configuration des listeners d'input MIDI (MONITORING + ENREGISTREMENT)
  function setupMidiInputListening() {
    // Nettoyer les anciens listeners
    clearMidiInputListeners()

    console.log('🎤 Configuration des listeners MIDI pour enregistrement/monitoring...')
    console.log('🔍 État enregistrement:', { 
      isRecording: isRecording.value, 
      recordingBlocked: recordingBlocked.value 
    })

    // Parcourir toutes les pistes pour configurer les inputs
    midiStore.tracks.forEach(track => {
      const inputId = track.midiInput
      console.log(`📍 Piste ${track.id}: input="${inputId}" record=${track.record} monitor=${track.monitor}`)
      
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
        console.log(`⏭️ Piste ${track.id} ignorée (Record et Monitor désactivés ou enregistrement bloqué)`)
        return
      }

      console.log(`🎧 Configuration input pour piste ${track.id} (record=${shouldSetupRecord}, monitor=${shouldSetupMonitor})...`)

      // Déterminer si on a besoin d'enregistrement ou seulement monitoring
      const monitoringOnly = !shouldSetupRecord && shouldSetupMonitor

      if (inputId === 'all') {
        // Écouter tous les inputs
        const availableInputs = midiManager.availableInputs?.value || []
        console.log(`🎧 Piste ${track.id}: écoute TOUS les inputs (${availableInputs.length} disponibles)`)
        availableInputs.forEach(input => {
          setupInputListener(track.id, input.input, monitoringOnly)
        })
      } else {
        // Écouter un input spécifique
        const input = midiManager.availableInputs?.value?.find(i => i.id === inputId)
        if (input?.input) {
          console.log(`🎧 Piste ${track.id}: écoute input spécifique "${input.name}"`)
          setupInputListener(track.id, input.input, monitoringOnly)
        } else {
          console.error(`❌ Input MIDI "${inputId}" non trouvé pour piste ${track.id}`)
        }
      }
    })
  }

  // Configuration automatique du monitoring (appelé dès qu'une piste change d'input)
  function setupMidiMonitoring() {
    console.log('🔊 Configuration du monitoring MIDI...')
    setupMidiInputListening()
  }

  function setupInputListener(trackId, midiInput, monitoringOnly = false) {
    const listenerKey = `${trackId}-${midiInput.id}`
    
    // Éviter les doublons
    if (midiInputListeners.value.has(listenerKey)) {
      console.log(`⚠️ Listener déjà configuré: ${listenerKey}`)
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
      console.log(`🎧 Listener MONITORING configuré: piste ${trackId} <- input "${midiInput.name}"`)
    } else {
      // Listener complet (monitoring + enregistrement)
      const currentSessionId = recordingSessionId
      listener = (event) => handleMidiMessage(trackId, event, currentSessionId)
      console.log(`🎤 Listener COMPLET configuré: piste ${trackId} <- input "${midiInput.name}" (session=${currentSessionId})`)
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
    const listenerCount = midiInputListeners.value.size
    console.log(`🧹 Nettoyage de ${listenerCount} listeners MIDI...`)
    
    midiInputListeners.value.forEach((config, key) => {
      console.log(`🧹 Suppression listener: ${key} (piste ${config.trackId})`)
      config.input.removeEventListener('midimessage', config.listener)
    })
    midiInputListeners.value.clear()
    console.log(`✅ ${listenerCount} listeners MIDI nettoyés`)
  }

  // Armer/Désarmer l'enregistrement
  function setRecordArmed(armed) {
    isRecordArmed.value = armed
    console.log(`🎤 Enregistrement ${armed ? 'armé' : 'désarmé'}`)
  }

  function toggleRecordArmed() {
    setRecordArmed(!isRecordArmed.value)
  }

  // Supprimer les événements dans un petit intervalle au moment précis de la réception (mode Replace)
  function clearEventsAtTime(trackId, eventType, currentTime, timeWindow, ccNumber = null) {
    const fromTime = currentTime - timeWindow
    const toTime = currentTime + timeWindow
    
    console.log(`🗑️ Replace instant: suppression ${eventType} dans fenêtre ${fromTime.toFixed(3)}s → ${toTime.toFixed(3)}s`)
    
    if (eventType === 'note') {
      // Supprimer les notes existantes dans la fenêtre temporelle
      const notesToKeep = midiStore.notes.filter(note => {
        // Garder si ce n'est pas la bonne piste
        if (note.trackId !== trackId) return true
        
        // Garder si la note est complètement en dehors de la fenêtre
        const noteEndTime = note.time + (note.duration || 0)
        return noteEndTime <= fromTime || note.time >= toTime
      })
      
      const notesRemoved = midiStore.notes.length - notesToKeep.length
      midiStore.notes = notesToKeep
      
      if (notesRemoved > 0) {
        console.log(`🗑️ Replace instant: ${notesRemoved} notes supprimées de la piste ${trackId} à ${currentTime.toFixed(3)}s`)
      }
      
    } else if (eventType === 'cc' && ccNumber !== null) {
      // Supprimer les CC dans la fenêtre temporelle
      const ccToKeep = midiStore.midiCC.filter(cc => {
        // Garder si ce n'est pas la bonne piste
        if (parseInt(cc.trackId) !== trackId) return true
        
        // Garder si ce n'est pas le bon numéro de CC
        if (parseInt(cc.controller) !== ccNumber) return true
        
        // Garder si le CC est en dehors de la fenêtre
        const ccTime = parseFloat(cc.time)
        return ccTime < fromTime || ccTime >= toTime
      })
      
      const ccRemoved = midiStore.midiCC.length - ccToKeep.length
      midiStore.midiCC = ccToKeep
      
      if (ccRemoved > 0) {
        console.log(`🗑️ Replace instant: ${ccRemoved} CC${ccNumber} supprimés de la piste ${trackId} à ${currentTime.toFixed(3)}s`)
      }
    }
    
    // Déclencher la réactivité seulement si quelque chose a changé
    if (eventType === 'note' || eventType === 'cc') {
      midiStore.triggerReactivity('selective-replace')
    }
  }

  // Ancienne fonction pour compatibilité (mode replace global - non utilisée maintenant)
  function clearExistingEvents(startTime, endTime, mode = 'merge', recordingTrackIds = []) {
    // Cette fonction n'est plus utilisée en mode replace sélectif
    console.log(`🗑️ Ancienne fonction clearExistingEvents appelée - non utilisée en mode sélectif`)
  }

  // Démarrer l'enregistrement
  function startRecording(trackId = null, mode = 'merge') {
    console.log(`🔴 DÉBUT ENREGISTREMENT...`)
    
    // Incrémenter l'ID de session pour invalider les anciens listeners
    recordingSessionId++
    console.log(`🆔 Nouvelle session d'enregistrement: ${recordingSessionId}`)
    
    // Débloquer l'enregistrement et le démarrer
    recordingBlocked.value = false
    isRecording.value = true
    recordingTrackId.value = trackId
    recordedEvents.value = []
    activeNotes.value.clear()

    // Initialiser les trackers d'enregistrement sélectif pour tous les modes
    window.recordStartTime = window.currentPlaybackTime || 0
    // Collecter les IDs des pistes qui ont Record activé
    window.recordingTrackIds = midiStore.tracks
      .filter(track => track.record)
      .map(track => track.id)
    
    // Initialiser les trackers d'événements reçus (pour Merge et Replace)
    window.eventTrackers = new Map() // trackId -> Set de types d'événements reçus
    
    if (mode === 'replace') {
      console.log(`🗑️ Mode Replace: Pistes armées pour enregistrement sélectif:`, window.recordingTrackIds)
    } else {
      console.log(`🎵 Mode Merge: Pistes armées pour enregistrement sélectif:`, window.recordingTrackIds)
    }

    // Configurer les listeners
    setupMidiInputListening()

    console.log(`🔴 Enregistrement démarré${trackId ? ` sur track ${trackId}` : ''} (mode: ${mode})`)
  }

  // Arrêter l'enregistrement
  function stopRecording(mode = 'merge') {
    console.log(`⏹️ STOP RECORDING: Arrêt de l'enregistrement en cours...`)
    
    // CRITIQUE: BLOQUER l'enregistrement IMMÉDIATEMENT avant toute autre action
    recordingBlocked.value = true
    isRecording.value = false
    
    // Incrémenter l'ID de session pour invalider TOUS les listeners existants
    recordingSessionId++
    console.log(`🆔 Session invalidée: ${recordingSessionId} (tous anciens listeners ignorés)`)
    
    console.log(`🚫 Enregistrement BLOQUÉ - plus aucun événement ne sera traité`)
    
    // Calculer la zone temporelle d'enregistrement
    const startTime = window.recordStartTime || 0
    const stopTime = window.currentPlaybackTime || 0
    
    console.log(`⏹️ Zone d'enregistrement: ${startTime.toFixed(3)}s → ${stopTime.toFixed(3)}s`)
    
    // En mode Replace: la suppression a été faite au moment de la réception des premiers événements
    if (mode === 'replace') {
      console.log(`🗑️ Mode Replace: suppressions effectuées lors de la réception des événements (curseur qui passe)`)
    }
    
    // Finaliser toutes les notes actives AVANT de bloquer complètement
    console.log(`⏹️ Finalisation FORCÉE des notes actives à ${stopTime.toFixed(3)}s`)
    
    activeNotes.value.forEach((noteData, noteKey) => {
      const duration = Math.max(0.1, stopTime - noteData.startTime)
      
      // Finaliser SANS vérifier recordingBlocked car on est en train d'arrêter
      const completeNote = {
        id: noteData.id,
        trackId: noteData.trackId,
        midi: noteData.midi,
        velocity: noteData.velocity,
        time: noteData.time,
        duration: duration
      }
      
      // TRACE: Log avant ajout direct au store (finalisation forcée)
      console.log(`➕ DIRECT PUSH FORCÉ vers midiStore.notes:`, {
        noteId: completeNote.id,
        midi: completeNote.midi,
        time: completeNote.time,
        duration: completeNote.duration,
        recordingBlocked: recordingBlocked.value,
        isRecording: isRecording.value,
        reason: "finalisation_forcee_stop",
        stack: new Error().stack.split('\n').slice(1, 3).join('\n')
      })
      
      // Ajouter directement au store
      midiStore.notes.push(completeNote)
      console.log(`🎵 Note finalisée FORCÉE: ${completeNote.midi} durée=${duration.toFixed(3)}s`)
      
      // Ajouter aux événements enregistrés
      recordedEvents.value.push({
        type: 'note',
        timestamp: Date.now(),
        data: completeNote
      })
    })
    activeNotes.value.clear()
    
    // Déclencher la réactivité pour les notes finalisées
    midiStore.triggerReactivity('midi-recording-note')
    
    // IMPORTANT: Nettoyer COMPLÈTEMENT les listeners d'enregistrement
    console.log(`🧹 Nettoyage COMPLET des listeners d'enregistrement...`)
    clearMidiInputListeners()
    
    // Nettoyer les trackers d'enregistrement sélectif IMMÉDIATEMENT
    if (window.recordStartTime !== undefined) {
      console.log(`🧹 Nettoyage des trackers d'enregistrement sélectif (mode: ${mode})`)
      delete window.recordStartTime
      delete window.recordingTrackIds
      delete window.eventTrackers
      delete window.replacementTrackers
    }
    
    recordingTrackId.value = null
    
    // IMMEDIATE: Reconfigurer les listeners pour monitoring uniquement SANS délai
    console.log(`🔄 Reconfiguration IMMÉDIATE des listeners pour monitoring uniquement`)
    setupMidiInputListening()

    const eventCount = recordedEvents.value.length
    console.log(`✅ Enregistrement complètement arrêté - ${eventCount} événements capturés (mode: ${mode})`)

    return recordedEvents.value
  }

  // Propriétés calculées
  const recordedEventCount = computed(() => recordedEvents.value.length)
  const hasActiveNotes = computed(() => activeNotes.value.size > 0)

  // Gestionnaires d'événements globaux
  function handleRecordingStart(event) {
    const mode = event.detail?.mode || projectStore.userPreferences.keyboard.recordingMode || 'merge'
    console.log('🎤 Événement de début d\'enregistrement reçu:', event.detail, 'mode:', mode)
    startRecording(null, mode)
  }

  function handleRecordingStop(event) {
    console.log('🎤 Événement d\'arrêt d\'enregistrement reçu')
    if (isRecording.value) {
      const mode = event.detail?.mode || projectStore.userPreferences.keyboard.recordingMode || 'merge'
      const events = stopRecording(mode)
      
      // Déclencher plusieurs réactivités pour s'assurer que tout se met à jour
      midiStore.triggerReactivity('midi-recording-stop')
      midiStore.forceCCUpdate() // Forcer spécifiquement la mise à jour des CC
      
      // Émettre un événement pour que les composants se mettent à jour
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('midi-cc-updated', {
          detail: { eventCount: events.length }
        }))
      }, 100) // Petit délai pour laisser le temps au store de se stabiliser
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
    console.log('🔄 Inputs MIDI ou états Record/Monitor changés, reconfiguration...')
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