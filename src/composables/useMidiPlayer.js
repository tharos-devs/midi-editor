// composables/useMidiPlayer.js - CORRECTION POUR SYNCHRONISATION CURSEUR

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMidiStore } from '@/stores/midi'
import { useMidiManager } from '@/composables/useMidiManager'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'
import { useTimeSignature } from '@/composables/useTimeSignature'

// CORRECTION: Instance singleton partagée
let sharedInstance = null

export function useMidiPlayer() {
  // Retourner l'instance partagée si elle existe
  if (sharedInstance) {
    return sharedInstance
  }
  
  // Créer la nouvelle instance
  const midiStore = useMidiStore()
  const midiManager = useMidiManager()
  const cursorStore = usePlaybackCursorStore()
  const timeSignatureComposable = useTimeSignature()

  // État du lecteur
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const currentTime = ref(0)
  const playbackRate = ref(1)
  const loopStart = ref(0)
  const loopEnd = ref(0)
  const isLooping = ref(false)
  const stoppedAtEnd = ref(false) // Flag pour différencier stop normal vs fin de morceau

  // Gestion du tempo
  const currentTempo = ref(120)
  const tempoEvents = ref([])

  // Debug - compteurs d'événements
  const debugStats = ref({
    eventsScheduled: 0,
    eventsExecuted: 0,
    midiMessagesSent: 0,
    ccEventsSent: 0,
    errors: 0
  })

  // Contrôle de la lecture
  let playbackTimer = null
  let scheduledEvents = []
  let lastUpdateTime = 0
  let pauseTime = 0

  // CORRECTION: Flag pour éviter les boucles de synchronisation
  let isSyncingWithCursor = false

  // Configuration de lecture
  const lookAheadTime = 25.0 // ms
  const scheduleAheadTime = 100.0 // ms

  // Cache des événements de lecture
  const playbackEvents = ref([])
  const currentEventIndex = ref(0)
  const lastEventsPrepareTime = ref(0)

  // Signature des données pour détecter les changements
  const dataSignature = ref('')

  const canSendMidi = computed(() => {
    const managerInitialized = midiManager.isInitialized?.value ?? false
    const midiSupported = midiManager.midiSupported?.value ?? false
    const hasOutputs = (midiManager.availableOutputs?.value?.length ?? 0) > 0

    return managerInitialized && midiSupported && hasOutputs
  })

  // Getters calculés - CORRECTION: Utiliser la vraie fin de tous les événements MIDI
  const totalDuration = computed(() => {
    // Utiliser la durée calculée qui prend en compte TOUS les événements MIDI (notes, CC, etc.)
    return timeSignatureComposable.getLastMidiEventTime?.value || midiStore.getTotalDuration
  })
  const isLoaded = computed(() => midiStore.isLoaded)

  const canPlay = computed(() => {
    // Permettre la lecture si :
    // - Il y a un fichier MIDI chargé ET des événements de playback, OU
    // - Il y a des notes dans le store (même sans fichier chargé) ET MIDI est disponible
    const hasLoadedFile = isLoaded.value && playbackEvents.value.length > 0
    const hasManualNotes = midiStore.notes.length > 0
    
    return (hasLoadedFile || hasManualNotes) && canSendMidi.value
  })

  const currentTimeFormatted = computed(() => formatTime(currentTime.value))
  const totalDurationFormatted = computed(() => formatTime(totalDuration.value))
  const progress = computed(() => {
    if (totalDuration.value === 0) return 0
    return Math.min(100, (currentTime.value / totalDuration.value) * 100)
  })

  // Fonction pour générer une signature des données
  function generateDataSignature() {
    const tracks = midiStore.tracks
    const signature = tracks.map(track => ({
      id: track.id,
      volume: track.volume,
      pan: track.pan,
      channel: track.channel,
      midiOutput: track.midiOutput,
      muted: track.muted,
      solo: track.solo,
      notesCount: track.notes ? track.notes.length : 0,
      ccCount: track.controlChanges ? Object.keys(track.controlChanges).length : 0,
      lastModified: track.lastModified || 0
    }))

    return JSON.stringify(signature)
  }

  // Fonction pour vérifier si les données ont changé
  function hasDataChanged() {
    const newSignature = generateDataSignature()
    if (newSignature !== dataSignature.value) {
      dataSignature.value = newSignature
      return true
    }
    return false
  }

  // Synchroniser les tempos avec le store
  watch(() => midiStore.tempoEvents, (newTempoEvents) => {
    if (newTempoEvents && Array.isArray(newTempoEvents)) {
      tempoEvents.value = [...newTempoEvents].sort((a, b) => a.time - b.time)
      
      // Mettre à jour le tempo initial
      if (tempoEvents.value.length > 0 && tempoEvents.value[0].time === 0) {
        currentTempo.value = tempoEvents.value[0].bpm
      } else if (midiStore.midiInfo?.tempo) {
        currentTempo.value = midiStore.midiInfo.tempo
      }
      
      // Tempos synchronisés
    }
  }, { immediate: true, deep: true })

  // Calculer le tempo à un moment donné
  function getTempoAtTime(time) {
    if (!tempoEvents.value.length) {
      return currentTempo.value
    }

    let tempo = midiStore.midiInfo?.tempo || 120
    
    for (const tempoEvent of tempoEvents.value) {
      if (tempoEvent.time <= time) {
        tempo = tempoEvent.bpm
      } else {
        break
      }
    }
    
    return tempo
  }

  // CORRECTION: Synchronisation supprimée pour éviter la dépendance circulaire
  // La synchronisation se fait maintenant via les watchers dans PlaybackCursor.vue
  
  /*
  // Ancienne synchronisation avec playbackCursor (commentée)
  watch(() => playbackCursor.currentTime.value, (newTime) => {
    if (isSyncingWithCursor) return
    if (isPlaying.value && playbackCursor.isPlaying.value) {
      isSyncingWithCursor = true
      currentTime.value = newTime
      currentTempo.value = getTempoAtTime(newTime)
      isSyncingWithCursor = false
    }
  })
  */

  // Surveiller les changements de chargement
  watch(() => midiStore.isLoaded, (newVal) => {
    if (newVal) {
      preparePlaybackEvents()
    } else {
      stop()
      playbackEvents.value = []
    }
  })

  // Surveiller les changements de pistes
  watch(() => midiStore.tracks.map(t => ({
    id: t.id,
    volume: t.volume,
    pan: t.pan,
    channel: t.channel,
    midiOutput: t.midiOutput,
    muted: t.muted,
    solo: t.solo,
    lastModified: t.lastModified
  })), (newTrackData) => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  }, { deep: true })

  // Surveiller les versions pour forcer la mise à jour
  watch(() => midiStore.tracksVersion, () => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  })

  watch(() => midiStore.notesVersion, () => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  })

  watch(() => midiStore.ccVersion, () => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  })

  // CORRECTION: Fonction play qui délègue le timing au curseur
  function play() {
    console.log('🎬 PLAY appelé:', {
      canPlay: canPlay.value,
      isLoaded: midiStore.isLoaded,
      playbackEventsLength: playbackEvents.value.length,
      canSendMidi: canSendMidi.value,
      stoppedAtEnd: stoppedAtEnd.value,
      currentTime: currentTime.value.toFixed(2) + 's'
    })
    
    // DEBUG: Examiner les notes de la piste 1
    const track1 = midiStore.tracks.find(t => t.id === 1)
    if (track1 && track1.notes) {
      const lastNotes = track1.notes.slice(-3) // Dernières 3 notes
      console.log('🎵 PISTE 1 - Dernières notes:', lastNotes.map(note => ({
        time: note.time?.toFixed(2) + 's',
        duration: note.duration?.toFixed(2) + 's', 
        endTime: (note.time + note.duration)?.toFixed(2) + 's',
        midi: note.midi
      })))
      
      const maxEndTime = Math.max(...track1.notes.map(note => note.time + note.duration))
      console.log('🎵 PISTE 1 - Fin réelle de la dernière note:', maxEndTime.toFixed(2) + 's')
    }
    
    // DEBUG: Comparer durée MIDI vs vraie fin des notes
    let realEndTime = 0
    midiStore.tracks.forEach(track => {
      if (track.notes && track.notes.length > 0) {
        const trackEndTime = Math.max(...track.notes.map(note => note.time + note.duration))
        realEndTime = Math.max(realEndTime, trackEndTime)
      }
    })
    
    console.log('🎵 COMPARAISON DURÉES:', {
      totalDurationMIDI: totalDuration.value.toFixed(2) + 's',
      realEndTime: realEndTime.toFixed(2) + 's',
      différence: (realEndTime - totalDuration.value).toFixed(2) + 's',
      problème: realEndTime > totalDuration.value ? '⚠️ NOTES DÉPASSENT' : '✅ OK'
    })
    
    // Vérifier si les données ont changé
    if (hasDataChanged() || playbackEvents.value.length === 0) {
      console.log('🔄 Données changées détectées, régénération des événements avant lecture')
      preparePlaybackEvents()
    }

    if (!canPlay.value) {
      console.warn('⚠️ Impossible de lire : conditions non remplies', {
        isLoaded: midiStore.isLoaded,
        playbackEventsLength: playbackEvents.value.length,
        canSendMidi: canSendMidi.value
      })
      return false
    }

    // CORRECTION CRITIQUE: Synchroniser avec le curseur store avant de commencer
    // Ceci résout le problème de désynchronisation après seek manuel
    const cursorTime = cursorStore.currentTime
    if (Math.abs(currentTime.value - cursorTime) > 0.1) {
      console.log(`🔄 Synchronisation player MIDI: ${currentTime.value.toFixed(2)}s → ${cursorTime.toFixed(2)}s`)
      currentTime.value = cursorTime
      
      // Recalculer l'index des événements pour la nouvelle position
      let eventIndex = 0
      for (let i = 0; i < playbackEvents.value.length; i++) {
        if (playbackEvents.value[i].time <= cursorTime) {
          eventIndex = i + 1
        } else {
          break
        }
      }
      currentEventIndex.value = eventIndex
      
      // Appliquer l'état MIDI à cette position
      applyCurrentMidiStateAtTime(cursorTime)
    }

    // Configuration initiale
    if (isPaused.value) {
      isPaused.value = false
    } else {
      if (currentTime.value === 0) {
        currentEventIndex.value = 0
      }
      sendInitialMidiSetupFromCurrentData()
    }

    isPlaying.value = true
    stoppedAtEnd.value = false // Reset la flag quand on relance

    // CORRECTION: Initialiser seulement si pas encore initialisé
    if (cursorStore.totalDuration === 0 || cursorStore.totalDuration !== totalDuration.value) {
      cursorStore.initialize()
      cursorStore.totalDuration = totalDuration.value
    }
    cursorStore.startPlayback()

    // Démarrer le timer d'événements MIDI
    startEventScheduler()

    // Lecture démarrée
    return true
  }

  function sendInitialMidiSetupFromCurrentData() {
    if (!canSendMidi.value) {
      console.warn('⚠️ MIDI non disponible pour l\'initialisation')
      return
    }

    const availableOutputs = midiManager.availableOutputs?.value ?? []

    midiStore.tracks.forEach(track => {
      if (track.muted) {
        return
      }

      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))
      const output = resolveMidiOutput(track.midiOutput, availableOutputs)

      if (!output) {
        console.warn(`⚠️ Aucune sortie trouvée pour la piste ${track.name}`)
        return
      }

      // Program Change
      if (track.instrument?.number !== undefined) {
        midiManager.sendProgramChange(output.id, trackChannel, track.instrument.number)
      }

      // Bank Select
      if (track.bank !== undefined && track.bank !== 0) {
        midiManager.sendBankSelect(output.id, trackChannel, track.bank)
      }

      // Volume avec valeur actuelle
      const currentVolume = Math.max(0, Math.min(127, parseInt(track.volume) || 100))
      midiManager.sendControlChange(output.id, trackChannel, 7, currentVolume)

      // Pan avec valeur actuelle
      const currentPan = Math.max(0, Math.min(127, parseInt(track.pan) || 64))
      midiManager.sendControlChange(output.id, trackChannel, 10, currentPan)

      // Autres Control Changes initiaux
      const controlChanges = track.controlChanges || {}
      if (controlChanges && typeof controlChanges === 'object') {
        Object.entries(controlChanges).forEach(([ccNumber, ccEvents]) => {
          if (Array.isArray(ccEvents) && ccEvents.length > 0) {
            const initialCC = ccEvents[0]
            const ccNum = parseInt(ccNumber)
            const ccValue = Math.max(0, Math.min(127, parseInt(initialCC.value) || 0))

            // Éviter de redéfinir Volume (7) et Pan (10) déjà envoyés
            if (ccNum !== 7 && ccNum !== 10) {
              midiManager.sendControlChange(output.id, trackChannel, ccNum, ccValue)
            }
          }
        })
      }
    })
  }

  function preparePlaybackEvents() {
    if (!midiStore.isLoaded) {
      console.warn('⚠️ MIDI non chargé, impossible de préparer les événements')
      return
    }

    if (!canSendMidi.value) {
      console.warn('⚠️ MIDI non disponible, impossible de préparer les événements')
      return
    }

    const events = []
    const availableOutputs = midiManager.availableOutputs?.value ?? []
    const generationTime = Date.now()

    if (availableOutputs.length === 0) {
      console.error('❌ Aucune sortie MIDI disponible pour la génération des événements')
      return
    }

    // Ajouter les événements de tempo
    midiStore.tempoEvents.forEach(tempoEvent => {
      events.push({
        time: tempoEvent.time,
        type: 'tempo',
        bpm: tempoEvent.bpm,
        trackId: null,
        generatedAt: generationTime
      })
    })

    // Traiter toutes les pistes
    const currentTracks = [...midiStore.tracks]
    let totalNotes = 0
    let totalCC = 0

    currentTracks.forEach((track, trackIndex) => {
      if (track.muted) {        
        return
      }

      const trackChannel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))
      const resolvedOutput = resolveMidiOutput(track.midiOutput, availableOutputs)

      if (!resolvedOutput) {
        return
      }

      // Traiter les notes
      const trackNotes = track.notes || []
      totalNotes += trackNotes.length

      trackNotes.forEach((note, noteIndex) => {
        const midiNote = Math.max(0, Math.min(127, parseInt(note.midi) || 60))
        const velocity = Math.max(1, Math.min(127, Math.round((parseFloat(note.velocity) || 0.8) * 127)))
        const noteTime = parseFloat(note.time) || 0
        const noteDuration = parseFloat(note.duration) || 0.5

        // Note On
        events.push({
          time: noteTime,
          type: 'noteOn',
          trackId: track.id,
          trackName: track.name,
          channel: trackChannel,
          outputId: resolvedOutput.id,
          outputName: resolvedOutput.name,
          note: midiNote,
          velocity: velocity,
          noteData: { ...note },
          generatedAt: generationTime
        })

        // Note Off
        events.push({
          time: noteTime + noteDuration,
          type: 'noteOff',
          trackId: track.id,
          trackName: track.name,
          channel: trackChannel,
          outputId: resolvedOutput.id,
          outputName: resolvedOutput.name,
          note: midiNote,
          velocity: 0,
          noteData: { ...note },
          generatedAt: generationTime
        })
      })

      // Traiter les Control Changes
      const controlChanges = track.controlChanges || {}
      if (controlChanges && typeof controlChanges === 'object') {
        Object.entries(controlChanges).forEach(([ccNumber, ccEvents]) => {
          const ccNum = parseInt(ccNumber)

          if (Array.isArray(ccEvents) && ccEvents.length > 0) {
            totalCC += ccEvents.length
            ccEvents.forEach((ccEvent, ccIndex) => {
              const ccTime = parseFloat(ccEvent.time) || 0
              const ccValue = parseInt(ccEvent.value) || 0

              events.push({
                time: ccTime,
                type: 'controlChange',
                trackId: track.id,
                trackName: track.name,
                channel: trackChannel,
                outputId: resolvedOutput.id,
                outputName: resolvedOutput.name,
                controller: ccNum,
                value: ccValue,
                ccData: { ...ccEvent },
                generatedAt: generationTime
              })
            })
          }
        })
      }

      // Pitch Bends
      const pitchBends = track.pitchBends || []
      if (Array.isArray(pitchBends) && pitchBends.length > 0) {
        pitchBends.forEach((pbEvent, pbIndex) => {
          const pbTime = parseFloat(pbEvent.time) || 0
          const pbValue = parseInt(pbEvent.value) || 0

          events.push({
            time: pbTime,
            type: 'pitchBend',
            trackId: track.id,
            trackName: track.name,
            channel: trackChannel,
            outputId: resolvedOutput.id,
            outputName: resolvedOutput.name,
            value: pbValue,
            pbData: { ...pbEvent },
            generatedAt: generationTime
          })
        })
      }
    })

    // Trier les événements par temps
    events.sort((a, b) => a.time - b.time)

    playbackEvents.value = events
    lastEventsPrepareTime.value = generationTime
    dataSignature.value = generateDataSignature()

    // Événements préparés
  }

  function pause() {
    if (!isPlaying.value) return

    isPlaying.value = false
    isPaused.value = true
    
    // Pause du curseur global
    cursorStore.pausePlayback()
    
    // Arrêter le scheduler d'événements
    stopEventScheduler()

    stopAllNotes()
    maintainCurrentCCState()

    // Lecture mise en pause
  }

  function stop() {
    console.log('⏹️ MIDI PLAYER: Stop normal appelé')
    console.trace('⚠️ STACK TRACE - qui appelle stop() ?')
    isPlaying.value = false
    isPaused.value = false
    currentTime.value = 0
    currentEventIndex.value = 0
    stoppedAtEnd.value = false // Reset la flag
    
    // Stop du curseur global
    cursorStore.stopPlayback()
    
    // Arrêter le scheduler d'événements
    stopEventScheduler()
    
    // Remettre le tempo initial
    currentTempo.value = midiStore.midiInfo?.tempo || 120

    stopAllNotes()
    resetAllControllers()

    // Lecture arrêtée
  }

  // Stop en fin de morceau (garde la position)
  function stopAtEnd() {
    isPlaying.value = false
    isPaused.value = false
    stoppedAtEnd.value = true // MARQUER comme arrêt de fin de morceau
    // NE PAS remettre currentTime.value = 0
    // NE PAS remettre currentEventIndex.value = 0
    
    // CORRECTION CRITIQUE: Synchroniser le curseur store AVANT stopAtEnd
    console.log('🔄 Synchronisation curseur store avant stopAtEnd:', {
      playerTime: currentTime.value.toFixed(2) + 's',
      cursorTime: cursorStore.currentTime.toFixed(2) + 's'
    })
    cursorStore.seekTo(currentTime.value, false, true) // Désactiver auto-scroll pour stopAtEnd
    
    // Stop du curseur global SANS reset
    cursorStore.stopAtEnd()
    
    // Arrêter le scheduler d'événements
    stopEventScheduler()
    
    // Garder le tempo actuel
    stopAllNotes()
    resetAllControllers()
    
    console.log('🏁 Fin de morceau - position gardée à', currentTime.value.toFixed(2) + 's')
  }

  function seekTo(time) {
    const wasPlaying = isPlaying.value

    if (wasPlaying) {
      pause()
    }

    // CORRECTION: Ne pas limiter le temps lors du seek manuel
    // Laisser l'utilisateur positionner le curseur où il veut sur la timeline
    const clampedTime = Math.max(0, time) // Seulement >= 0, pas de limite max
    currentTime.value = clampedTime

    // Mettre à jour le tempo selon la nouvelle position
    // Utiliser min pour le tempo car on ne peut pas avoir de tempo au-delà de la fin
    const tempoTime = Math.min(totalDuration.value, clampedTime)
    currentTempo.value = getTempoAtTime(tempoTime)

    // CORRECTION: Synchroniser le curseur store avec le temps non limité
    cursorStore.seekTo(clampedTime, false)

    // Trouver l'index de l'événement correspondant
    let eventIndex = 0
    for (let i = 0; i < playbackEvents.value.length; i++) {
      if (playbackEvents.value[i].time <= clampedTime) {
        eventIndex = i + 1
      } else {
        break
      }
    }
    currentEventIndex.value = eventIndex

    applyCurrentMidiStateAtTime(clampedTime)

    if (wasPlaying) {
      play()
    }

    // Seek terminé
  }

  function applyCurrentMidiStateAtTime(time) {
    stopAllNotes()
    sendInitialMidiSetupFromCurrentData()

    const ccState = new Map()
    const pbState = new Map()

    // Analyser tous les événements jusqu'au temps donné
    playbackEvents.value.forEach(event => {
      if (event.time > time) return

      if (event.type === 'controlChange') {
        const key = `${event.outputId}-${event.channel}-${event.controller}`
        ccState.set(key, event)
      } else if (event.type === 'pitchBend') {
        const key = `${event.outputId}-${event.channel}`
        pbState.set(key, event)
      }
    })

    // Appliquer l'état des CC
    ccState.forEach(event => {
      if (midiManager.sendControlChange) {
        midiManager.sendControlChange(event.outputId, event.channel, event.controller, event.value)
      }
    })

    // Appliquer l'état des Pitch Bends
    pbState.forEach(event => {
      const bendValue = Math.round(event.value + 8192)
      const lsb = bendValue & 0x7F
      const msb = (bendValue >> 7) & 0x7F
      const message = [0xE0 + event.channel, lsb, msb]

      midiManager.sendMidiMessage(event.outputId, message)
    })
  }

  function rewind() {
    seekTo(0)
    
    // Remettre le scroll horizontal à 0 pour visualiser la première mesure
    const syncElements = document.querySelectorAll('.sync-scroll-x')
    syncElements.forEach(element => {
      element.scrollLeft = 0
    })
    
    // Synchroniser aussi le ScrollController
    const scrollControllerElement = document.querySelector('.scroll-controller')
    if (scrollControllerElement) {
      scrollControllerElement.scrollLeft = 0
    }
  }

  // CORRECTION: Timer complet du lecteur MIDI (timing + événements)
  let playStartTime = 0
  let playStartMusicTime = 0
  
  function startEventScheduler() {
    if (playbackTimer) return

    playStartTime = performance.now()
    playStartMusicTime = currentTime.value
    
    // Timer démarré

    playbackTimer = setInterval(() => {
      if (!isPlaying.value) return

      // Calculer le temps de musique actuel basé sur le temps réel écoulé
      const now = performance.now()
      const realTimeElapsed = (now - playStartTime) / 1000
      const currentPlayTime = playStartMusicTime + realTimeElapsed
      
      // Mettre à jour le temps courant
      currentTime.value = currentPlayTime
      currentTempo.value = getTempoAtTime(currentPlayTime)

      // CORRECTION: Vérifier la fin de TimeLine plutôt que la durée MIDI
      // Calculer le temps correspondant à la fin de la TimeLine
      const { pixelsToTimeWithSignatures, totalWidth } = timeSignatureComposable
      const timelineEndTime = pixelsToTimeWithSignatures ? pixelsToTimeWithSignatures(totalWidth.value) : totalDuration.value
      
      // Utiliser le maximum entre durée MIDI et fin de TimeLine
      const effectiveEndTime = Math.max(totalDuration.value, timelineEndTime)
      
      // Vérifier la fin de morceau
      if (currentPlayTime >= effectiveEndTime) {
        console.log('🏁 FIN DE MORCEAU DÉTECTÉE:', {
          currentPlayTime: currentPlayTime.toFixed(2) + 's',
          totalDuration: totalDuration.value.toFixed(2) + 's',
          timelineEndTime: timelineEndTime.toFixed(2) + 's',
          effectiveEndTime: effectiveEndTime.toFixed(2) + 's',
          timelineWidth: totalWidth.value + 'px',
          isLooping: isLooping.value,
          action: isLooping.value && loopEnd.value > loopStart.value ? 'LOOP' : 'STOP_AT_END'
        })
        
        if (isLooping.value && loopEnd.value > loopStart.value) {
          seekTo(loopStart.value)
        } else {
          stopAtEnd() // CORRECTION: Garder la position en fin de morceau
        }
        return
      }

      // Programmer les événements MIDI à venir
      scheduleUpcomingEvents(currentPlayTime)
    }, lookAheadTime)
  }

  function stopEventScheduler() {
    if (playbackTimer) {
      clearInterval(playbackTimer)
      playbackTimer = null
    }
  }

  function scheduleUpcomingEvents(currentPlayTime) {
    const scheduleTime = currentPlayTime + (scheduleAheadTime / 1000)
    let eventsScheduledThisRound = 0
    const maxEventsPerRound = 50

    while (currentEventIndex.value < playbackEvents.value.length && eventsScheduledThisRound < maxEventsPerRound) {
      const event = playbackEvents.value[currentEventIndex.value]

      if (event.time > scheduleTime) {
        break
      }

      if (event.time < currentPlayTime - 0.1) {
        currentEventIndex.value++
        continue
      }

      const delay = Math.max(0, (event.time - currentPlayTime) * 1000)

      if (delay < 16) {
        requestAnimationFrame(() => {
          executeEvent(event)
        })
      } else {
        setTimeout(() => {
          executeEvent(event)
        }, delay)
      }

      debugStats.value.eventsScheduled++
      eventsScheduledThisRound++
      currentEventIndex.value++
    }
  }

  function executeEvent(event) {
    if (!isPlaying.value) return

    // Vérifier les pistes mutées/solo avec données actuelles
    const track = midiStore.getTrackById(event.trackId)
    if (track && track.muted) return

    const soloTracks = midiStore.tracks.filter(t => t.solo)
    if (soloTracks.length > 0 && track && !track.solo && event.type !== 'tempo') return

    try {
      let success = false
      let message = null

      switch (event.type) {
        case 'noteOn':
          if (event.velocity > 0) {
            message = [0x90 + event.channel, event.note, event.velocity]
            success = midiManager.sendMidiMessage(event.outputId, message)

            if (success) {
              debugStats.value.midiMessagesSent++
            }
          }
          break

        case 'noteOff':
          message = [0x80 + event.channel, event.note, 0]
          success = midiManager.sendMidiMessage(event.outputId, message)

          if (success) {
            debugStats.value.midiMessagesSent++
          }
          break

        case 'controlChange':
          const ccChannel = event.channel
          const ccController = event.controller
          const ccValue = event.value

          message = [0xB0 + ccChannel, ccController, ccValue]
          success = midiManager.sendMidiMessage(event.outputId, message)

          if (success) {
            debugStats.value.ccEventsSent++
          }
          break

        case 'pitchBend':
          const bendValue = Math.round(event.value + 8192)
          const lsb = bendValue & 0x7F
          const msb = (bendValue >> 7) & 0x7F
          message = [0xE0 + event.channel, lsb, msb]
          success = midiManager.sendMidiMessage(event.outputId, message)
          break

        case 'tempo':
          // Le tempo est géré par le curseur maintenant
          currentTempo.value = event.bpm
          success = true
          console.log(`🎵 Changement de tempo: ${event.bpm} BPM à ${event.time.toFixed(2)}s`)
          break
      }

      if (success) {
        debugStats.value.eventsExecuted++
      }
    } catch (error) {
      console.error('💥 Erreur lors de l\'exécution de l\'événement:', error, event)
      debugStats.value.errors++
    }
  }

  function maintainCurrentCCState() {
    if (!canSendMidi.value) return

    const ccStateMap = new Map()

    playbackEvents.value.forEach(event => {
      if (event.type === 'controlChange' && event.time <= currentTime.value) {
        const key = `${event.outputId}-${event.channel}-${event.controller}`
        ccStateMap.set(key, event)
      }
    })

    ccStateMap.forEach(event => {
      if (midiManager.sendControlChange) {
        midiManager.sendControlChange(event.outputId, event.channel, event.controller, event.value)
      }
    })
  }

  function stopAllNotes() {
    if (!canSendMidi.value) return

    const availableOutputs = midiManager.availableOutputs?.value ?? []

    midiStore.tracks.forEach(track => {
      const trackMidiOutput = track.midiOutput || 'default'
      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))

      let finalOutputId = trackMidiOutput

      if (trackMidiOutput && trackMidiOutput !== 'default') {
        const output = availableOutputs.find(o => o.id === trackMidiOutput || o.name === trackMidiOutput)
        if (output) {
          finalOutputId = output.id
        }
      }

      if (finalOutputId === 'default' && availableOutputs.length > 0) {
        finalOutputId = availableOutputs[0].id
      }

      if (midiManager.sendControlChange) {
        midiManager.sendControlChange(finalOutputId, trackChannel, 123, 0) // All Notes Off
        midiManager.sendControlChange(finalOutputId, trackChannel, 120, 0) // All Sound Off
      }
    })
  }

  function resetAllControllers() {
    if (!canSendMidi.value) return

    const availableOutputs = midiManager.availableOutputs?.value ?? []

    midiStore.tracks.forEach(track => {
      const trackMidiOutput = track.midiOutput || 'default'
      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))

      let finalOutputId = trackMidiOutput

      if (trackMidiOutput && trackMidiOutput !== 'default') {
        const output = availableOutputs.find(o => o.id === trackMidiOutput || o.name === trackMidiOutput)
        if (output) {
          finalOutputId = output.id
        }
      }

      if (finalOutputId === 'default' && availableOutputs.length > 0) {
        finalOutputId = availableOutputs[0].id
      }

      if (midiManager.sendControlChange) {
        midiManager.sendControlChange(finalOutputId, trackChannel, 121, 0) // Reset All Controllers
      }
    })
  }

  function setLoop(start, end) {
    loopStart.value = start
    loopEnd.value = end
    isLooping.value = end > start
  }

  function toggleLoop() {
    if (loopEnd.value > loopStart.value) {
      isLooping.value = !isLooping.value
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  function forceRefreshEvents() {
    preparePlaybackEvents()
  }

  function resolveMidiOutput(trackMidiOutput, availableOutputs) {
    if (!availableOutputs || availableOutputs.length === 0) {
      console.warn('⚠️ Aucune sortie MIDI disponible')
      return null
    }

    // Cas spécial : 'default' ou vide
    if (!trackMidiOutput || trackMidiOutput === 'default') {
      return availableOutputs[0] // Première sortie disponible
    }

    // 1. Recherche exacte par ID
    let output = availableOutputs.find(o => o.id === trackMidiOutput)
    if (output) {
      return output
    }

    // 2. Recherche par nom (pour compatibilité)
    output = availableOutputs.find(o => o.name === trackMidiOutput)
    if (output) {
      return output
    }

    // 3. Recherche partielle
    output = availableOutputs.find(o => 
      o.name.toLowerCase().includes(String(trackMidiOutput).toLowerCase())
    )
    if (output) {
      console.log(`🔄 Correspondance partielle: "${trackMidiOutput}" -> "${output.name}"`)
      return output
    }

    console.error(`❌ Sortie "${trackMidiOutput}" introuvable, utilisation de la première disponible`)
    return availableOutputs[0] // Fallback
  }

  onUnmounted(() => {
    stop()
    stopEventScheduler()
  })

  // NOUVEAU: Fonction pour arrêter toutes les notes d'une piste
  function stopAllNotesForTrack(trackId) {
    if (!isPlaying.value) return
    
    console.log(`🔇 Arrêt de toutes les notes pour la piste ${trackId}`)
    
    // Parcourir toutes les sorties MIDI et envoyer noteOff sur tous les canaux/notes
    const availableOutputs = midiManager.availableOutputs?.value ?? []
    const track = midiStore.getTrackById(trackId)
    
    if (track && availableOutputs.length > 0) {
      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))
      const output = resolveMidiOutput(track.midiOutput, availableOutputs)
      
      if (output && output.connection) {
        // Envoyer All Notes Off (CC 123) sur le canal de la piste
        try {
          const allNotesOffMessage = [0xB0 + trackChannel, 123, 0] // Control Change: All Notes Off
          output.connection.send(allNotesOffMessage)
          console.log(`🔇 All Notes Off envoyé sur piste ${trackId}, canal ${trackChannel}`)
          
          // Aussi envoyer All Sound Off (CC 120) pour être sûr
          const allSoundOffMessage = [0xB0 + trackChannel, 120, 0]
          output.connection.send(allSoundOffMessage)
          console.log(`🔇 All Sound Off envoyé sur piste ${trackId}, canal ${trackChannel}`)
        } catch (error) {
          console.error(`❌ Erreur lors de l'arrêt des notes pour piste ${trackId}:`, error)
        }
      }
    }
  }

  // NOUVEAU: Listener pour les événements de mute
  function handleTrackMuted(event) {
    const { trackId } = event.detail
    stopAllNotesForTrack(trackId)
  }

  onMounted(() => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
    
    // NOUVEAU: Écouter les événements de mute
    window.addEventListener('track-muted', handleTrackMuted)
  })
  
  onUnmounted(() => {
    stop()
    stopEventScheduler()
    
    // NOUVEAU: Nettoyer le listener
    window.removeEventListener('track-muted', handleTrackMuted)
  })

  const instance = {
    // État
    isPlaying,
    isPaused,
    currentTime,
    totalDuration,
    playbackRate,
    isLooping,
    loopStart,
    loopEnd,
    canPlay,
    stoppedAtEnd,
    progress,
    debugStats,
    
    // État du tempo
    currentTempo,
    tempoEvents,

    // Getters formatés
    currentTimeFormatted,
    totalDurationFormatted,

    // Actions principales
    play,
    pause,
    stop,
    stopAtEnd,
    rewind,
    seekTo,

    // Configuration
    setLoop,
    toggleLoop,
    preparePlaybackEvents,
    forceRefreshEvents,

    // Nouvelles fonctions
    maintainCurrentCCState,
    getTempoAtTime,

    // Utilitaires
    formatTime
  }
  
  // Sauvegarder l'instance pour la réutiliser
  sharedInstance = instance
  return instance
}