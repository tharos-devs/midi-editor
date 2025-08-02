// composables/useMidiPlayer.js - VERSION CORRIGÉE POUR LES CONTROL CHANGES
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMidiStore } from '@/stores/midi'
import { useMidiManager } from '@/composables/useMidiManager'

export function useMidiPlayer() {
  const midiStore = useMidiStore()
  const midiManager = useMidiManager()

  // État du lecteur
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const currentTime = ref(0)
  const playbackRate = ref(1)
  const loopStart = ref(0)
  const loopEnd = ref(0)
  const isLooping = ref(false)

  // Debug - compteurs d'événements
  const debugStats = ref({
    eventsScheduled: 0,
    eventsExecuted: 0,
    midiMessagesSent: 0,
    ccEventsSent: 0, // NOUVEAU : compteur spécifique pour les CC
    errors: 0
  })

  // Contrôle de la lecture
  let playbackTimer = null
  let scheduledEvents = []
  let lastUpdateTime = 0
  let playStartTime = 0
  let pauseTime = 0

  // Configuration de lecture
  const lookAheadTime = 25.0 // ms
  const scheduleAheadTime = 100.0 // ms

  // Cache des événements de lecture - CORRECTION : Forcer la réactivité
  const playbackEvents = ref([])
  const currentEventIndex = ref(0)
  const lastEventsPrepareTime = ref(0) // Pour détecter les changements

  const canSendMidi = computed(() => {
    const managerInitialized = midiManager.isInitialized?.value ?? false
    const midiSupported = midiManager.midiSupported?.value ?? false
    const hasOutputs = (midiManager.availableOutputs?.value?.length ?? 0) > 0

    return managerInitialized && midiSupported && hasOutputs
  })

  // Getters calculés
  const totalDuration = computed(() => midiStore.getTotalDuration)
  const isLoaded = computed(() => midiStore.isLoaded)

  const canPlay = computed(() => {
    return isLoaded.value &&
      playbackEvents.value.length > 0 &&
      canSendMidi.value
  })

  const currentTimeFormatted = computed(() => formatTime(currentTime.value))
  const totalDurationFormatted = computed(() => formatTime(totalDuration.value))
  const progress = computed(() => {
    if (totalDuration.value === 0) return 0
    return Math.min(100, (currentTime.value / totalDuration.value) * 100)
  })

  // CORRECTION 1: Surveiller les changements pour regénérer les événements
  watch(() => midiStore.isLoaded, (newVal) => {
    if (newVal) {
      preparePlaybackEvents()
    } else {
      stop()
      playbackEvents.value = []
    }
  })

  // CORRECTION 2: Surveiller les modifications des notes en temps réel
  watch(() => midiStore.notes, (newNotes) => {
    if (midiStore.isLoaded && newNotes.length > 0) {
      preparePlaybackEvents()
    }
  }, { deep: true })

  // CORRECTION 3: Surveiller les modifications des pistes
  watch(() => midiStore.tracks, (newTracks) => {
    if (midiStore.isLoaded && newTracks.length > 0) {
      preparePlaybackEvents()
    }
  }, { deep: true })

  // NOUVEAU : Surveiller spécifiquement les Control Changes
  watch(() => midiStore.midiCC, (newCC) => {
    if (midiStore.isLoaded && newCC.length > 0) {
      preparePlaybackEvents()
    }
  }, { deep: true })

  // NOUVEAU : Surveiller les modifications des Control Changes dans les pistes
  watch(() => midiStore.tracks.map(t => t.controlChanges), (newCCData) => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  }, { deep: true })

  watch(() => midiManager.isInitialized?.value ?? false, (newVal) => {
    if (newVal && midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  })

  // CORRECTION 4: Fonction pour forcer la régénération des événements
  function forceRefreshEvents() {
    preparePlaybackEvents()
  }

  // CORRECTION 5: Préparer les événements avec gestion améliorée des Control Changes
  function preparePlaybackEvents() {
    if (!midiStore.isLoaded) {
      return
    }

    if (!canSendMidi.value) {
      return
    }

    const events = []
    const availableOutputs = midiManager.availableOutputs?.value ?? []

    // Ajouter les événements de tempo
    midiStore.tempoEvents.forEach(tempoEvent => {
      events.push({
        time: tempoEvent.time,
        type: 'tempo',
        bpm: tempoEvent.bpm,
        trackId: null
      })
    })

    // Traiter TOUTES les pistes avec un focus sur les CC
    const tracksToProcess = [...midiStore.tracks] // Créer une copie pour éviter les références

    tracksToProcess.forEach((track, trackIndex) => {
      if (track.muted) {
        return
      }

      const trackMidiOutput = track.midiOutput || 'default'
      const trackChannel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))

      let finalOutputId = trackMidiOutput
      let finalOutput = null

      // Recherche de sortie avec fallback robuste
      if (trackMidiOutput && trackMidiOutput !== 'default') {
        finalOutput = availableOutputs.find(o => o.id === trackMidiOutput)
        if (!finalOutput) {
          finalOutput = availableOutputs.find(o => o.name === trackMidiOutput)
          if (finalOutput) {
            finalOutputId = finalOutput.id
          }
        }
      }

      if (!finalOutput && availableOutputs.length > 0) {
        finalOutput = availableOutputs[0]
        finalOutputId = finalOutput.id
      }

      if (!finalOutput) {
        return
      }

      // Traiter les notes avec données en temps réel
      const trackNotes = track.notes || []

      trackNotes.forEach((note, noteIndex) => {
        // CORRECTION 9: Utiliser les données en temps réel, pas les données cachées
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
          outputId: finalOutputId,
          outputName: finalOutput.name,
          note: midiNote,
          velocity: velocity,
          noteData: { ...note } // Copie des données de la note
        })

        // Note Off
        events.push({
          time: noteTime + noteDuration,
          type: 'noteOff',
          trackId: track.id,
          trackName: track.name,
          channel: trackChannel,
          outputId: finalOutputId,
          outputName: finalOutput.name,
          note: midiNote,
          velocity: 0,
          noteData: { ...note }
        })
      })

      // Traitement correct des Control Changes
      const controlChanges = track.controlChanges || {}

      if (controlChanges && typeof controlChanges === 'object') {
        Object.entries(controlChanges).forEach(([ccNumber, ccEvents]) => {
          const ccNum = parseInt(ccNumber)

          if (Array.isArray(ccEvents) && ccEvents.length > 0) {
            ccEvents.forEach((ccEvent, ccIndex) => {
              const ccTime = parseFloat(ccEvent.time) || 0
              const ccValue = parseInt(ccEvent.value) || 0

              events.push({
                time: ccTime,
                type: 'controlChange',
                trackId: track.id,
                trackName: track.name,
                channel: trackChannel,
                outputId: finalOutputId,
                outputName: finalOutput.name,
                controller: ccNum,
                value: ccValue,
                ccData: { ...ccEvent }
              })
            })
          }
        })
      }

      // Pitch Bends avec meilleur traitement
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
            outputId: finalOutputId,
            outputName: finalOutput.name,
            value: pbValue,
            pbData: { ...pbEvent }
          })
        })
      }
    })

    // Trier les événements par temps
    events.sort((a, b) => a.time - b.time)

    // Forcer la mise à jour réactive
    playbackEvents.value = events
    lastEventsPrepareTime.value = Date.now()
  }

  // Démarrage avec vérification des événements à jour
  function play() {
    // Vérifier si on a besoin de régénérer les événements
    if (playbackEvents.value.length === 0) {
      preparePlaybackEvents()
    }

    if (!canPlay.value) {
      return false
    }

    if (isPaused.value) {
      isPaused.value = false
      playStartTime = performance.now() - pauseTime
    } else {
      playStartTime = performance.now()

      if (currentTime.value === 0) {
        currentEventIndex.value = 0
      }

      sendInitialMidiSetup()
    }

    isPlaying.value = true
    startPlaybackTimer()

    return true
  }

  function pause() {
    if (!isPlaying.value) return

    isPlaying.value = false
    isPaused.value = true
    pauseTime = performance.now() - playStartTime
    stopPlaybackTimer()

    stopAllNotes()
    // Maintenir les CC lors de la pause
    maintainCurrentCCState()
  }

  function stop() {
    isPlaying.value = false
    isPaused.value = false
    currentTime.value = 0
    currentEventIndex.value = 0
    stopPlaybackTimer()

    stopAllNotes()
    resetAllControllers()
  }

  function seekTo(time) {
    const wasPlaying = isPlaying.value

    if (wasPlaying) {
      pause()
    }

    currentTime.value = Math.max(0, Math.min(totalDuration.value, time))

    // Trouver l'index de l'événement correspondant
    let eventIndex = 0
    for (let i = 0; i < playbackEvents.value.length; i++) {
      if (playbackEvents.value[i].time <= currentTime.value) {
        eventIndex = i + 1
      } else {
        break
      }
    }
    currentEventIndex.value = eventIndex

    // Appliquer l'état MIDI incluant les CC
    applyMidiStateAtTime(currentTime.value)

    if (wasPlaying) {
      play()
    }
  }

  function rewind() {
    seekTo(0)
  }

  // Timer de lecture
  function startPlaybackTimer() {
    if (playbackTimer) return

    playbackTimer = setInterval(() => {
      if (!isPlaying.value) return

      const now = performance.now()
      const elapsed = (now - playStartTime) / 1000 * playbackRate.value
      currentTime.value = elapsed

      if (currentTime.value >= totalDuration.value) {
        if (isLooping.value && loopEnd.value > loopStart.value) {
          seekTo(loopStart.value)
        } else {
          stop()
        }
        return
      }

      scheduleUpcomingEvents()
    }, lookAheadTime)
  }

  function stopPlaybackTimer() {
    if (playbackTimer) {
      clearInterval(playbackTimer)
      playbackTimer = null
    }
  }

  function scheduleUpcomingEvents() {
    const scheduleTime = currentTime.value + (scheduleAheadTime / 1000)
    let eventsScheduledThisRound = 0

    while (currentEventIndex.value < playbackEvents.value.length) {
      const event = playbackEvents.value[currentEventIndex.value]

      if (event.time > scheduleTime) {
        break
      }

      if (event.time < currentTime.value - 0.1) {
        currentEventIndex.value++
        continue
      }

      const delay = Math.max(0, (event.time - currentTime.value) * 1000)

      setTimeout(() => {
        executeEvent(event)
      }, delay)

      debugStats.value.eventsScheduled++
      eventsScheduledThisRound++
      currentEventIndex.value++
    }
  }

  function executeEvent(event) {
    if (!isPlaying.value) return

    // Vérifier les pistes mutées/solo
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
            } else {
              console.error(`❌ Failed Note ON: ${event.outputName}`)
            }
          }
          break

        case 'noteOff':
          message = [0x80 + event.channel, event.note, 0]
          success = midiManager.sendMidiMessage(event.outputId, message)

          if (success) {
            debugStats.value.midiMessagesSent++
          } else {
            console.error(`❌ Failed Note OFF: ${event.outputName}`)
          }
          break

        case 'controlChange':
          // CORRECTION : Envoi effectif des Control Changes
          const ccChannel = event.channel
          const ccController = event.controller
          const ccValue = event.value

          message = [0xB0 + ccChannel, ccController, ccValue]
          success = midiManager.sendMidiMessage(event.outputId, message)
          break

        case 'pitchBend':
          const bendValue = Math.round(event.value + 8192)
          const lsb = bendValue & 0x7F
          const msb = (bendValue >> 7) & 0x7F
          message = [0xE0 + event.channel, lsb, msb]
          success = midiManager.sendMidiMessage(event.outputId, message)
          break

        case 'tempo':
          success = true
          break
      }
    } catch (error) {
      console.error('💥 Error executing event:', error, event)
      debugStats.value.errors++
    }
  }

  function scheduleUpcomingEvents() {
    const scheduleTime = currentTime.value + (scheduleAheadTime / 1000)
    let eventsScheduledThisRound = 0
    const maxEventsPerRound = 50 // Limiter pour éviter le throttling

    while (currentEventIndex.value < playbackEvents.value.length && eventsScheduledThisRound < maxEventsPerRound) {
      const event = playbackEvents.value[currentEventIndex.value]

      if (event.time > scheduleTime) {
        break
      }

      if (event.time < currentTime.value - 0.1) {
        currentEventIndex.value++
        continue
      }

      const delay = Math.max(0, (event.time - currentTime.value) * 1000)

      // Utiliser requestAnimationFrame pour les événements très proches
      if (delay < 16) { // < 16ms = environ 1 frame à 60fps
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

  function sendInitialMidiSetup() {
    if (!canSendMidi.value) {
      return
    }

    const availableOutputs = midiManager.availableOutputs?.value ?? []
    let setupCount = 0

    midiStore.tracks.forEach(track => {
      if (track.muted) return

      const trackMidiOutput = track.midiOutput || 'default'
      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))

      let finalOutputId = trackMidiOutput
      let output = null

      if (trackMidiOutput && trackMidiOutput !== 'default') {
        output = availableOutputs.find(o => o.id === trackMidiOutput)
        if (!output) {
          output = availableOutputs.find(o => o.name === trackMidiOutput)
          if (output) {
            finalOutputId = output.id
          }
        }
      }

      if (!output && availableOutputs.length > 0) {
        output = availableOutputs[0]
        finalOutputId = output.id
      }

      if (!output) {
        return
      }

      // Program Change
      if (track.instrument?.number !== undefined) {
        if (midiManager.sendProgramChange && midiManager.sendProgramChange(finalOutputId, trackChannel, track.instrument.number)) {
          setupCount++
        }
      }

      // Bank Select
      if (track.bank !== undefined && track.bank !== 0) {
        if (midiManager.sendBankSelect && midiManager.sendBankSelect(finalOutputId, trackChannel, track.bank)) {
          setupCount++
        }
      }

      // Volume
      if (track.volume !== undefined) {
        const volume = Math.max(0, Math.min(127, track.volume))
        if (midiManager.sendControlChange && midiManager.sendControlChange(finalOutputId, trackChannel, 7, volume)) {
          setupCount++
        }
      }

      // Pan
      if (track.pan !== undefined) {
        const pan = Math.max(0, Math.min(127, track.pan))
        if (midiManager.sendControlChange && midiManager.sendControlChange(finalOutputId, trackChannel, 10, pan)) {
          setupCount++
        }
      }

      // Appliquer les CC initiaux de la piste
      const controlChanges = track.controlChanges || {}
      if (controlChanges && typeof controlChanges === 'object') {
        Object.entries(controlChanges).forEach(([ccNumber, ccEvents]) => {
          if (Array.isArray(ccEvents) && ccEvents.length > 0) {
            // Prendre la première valeur de chaque CC pour l'état initial
            const initialCC = ccEvents[0]
            const ccNum = parseInt(ccNumber)
            const ccValue = Math.max(0, Math.min(127, parseInt(initialCC.value) || 0))

            if (midiManager.sendControlChange && midiManager.sendControlChange(finalOutputId, trackChannel, ccNum, ccValue)) {
              setupCount++
            }
          }
        })
      }
    })
  }

  // NOUVELLE FONCTION : Maintenir l'état des CC lors de la pause
  function maintainCurrentCCState() {
    if (!canSendMidi.value) return

    const availableOutputs = midiManager.availableOutputs?.value ?? []
    const ccStateMap = new Map()

    // Analyser tous les événements CC jusqu'au temps courant
    playbackEvents.value.forEach(event => {
      if (event.type === 'controlChange' && event.time <= currentTime.value) {
        const key = `${event.outputId}-${event.channel}-${event.controller}`
        ccStateMap.set(key, event)
      }
    })

    // Appliquer l'état courant des CC
    let maintainedCount = 0
    ccStateMap.forEach(event => {
      if (midiManager.sendControlChange) {
        const success = midiManager.sendControlChange(event.outputId, event.channel, event.controller, event.value)
        if (success) {
          maintainedCount++
        }
      }
    })
  }

  // Améliorer applyMidiStateAtTime pour inclure les CC
  function applyMidiStateAtTime(time) {
    stopAllNotes()
    sendInitialMidiSetup()

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
    let ccAppliedCount = 0
    ccState.forEach(event => {
      if (midiManager.sendControlChange) {
        const success = midiManager.sendControlChange(event.outputId, event.channel, event.controller, event.value)
        if (success) {
          ccAppliedCount++
        }
      }
    })

    // Appliquer l'état des Pitch Bends
    let pbAppliedCount = 0
    pbState.forEach(event => {
      const bendValue = Math.round(event.value + 8192)
      const lsb = bendValue & 0x7F
      const msb = (bendValue >> 7) & 0x7F
      const message = [0xE0 + event.channel, lsb, msb]

      if (midiManager.sendMidiMessage(event.outputId, message)) {
        pbAppliedCount++
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

  onUnmounted(() => {
    stop()
    stopPlaybackTimer()
  })

  onMounted(() => {
    if (midiStore.isLoaded) {
      preparePlaybackEvents()
    }
  })

  return {
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
    progress,
    debugStats,

    // Getters formatés
    currentTimeFormatted,
    totalDurationFormatted,

    // Actions principales
    play,
    pause,
    stop,
    rewind,
    seekTo,

    // Configuration
    setLoop,
    toggleLoop,
    preparePlaybackEvents,
    forceRefreshEvents, // Fonction pour forcer la mise à jour

    // NOUVELLES FONCTIONS pour la gestion des CC
    maintainCurrentCCState,

    // Utilitaires
    formatTime
  }
}