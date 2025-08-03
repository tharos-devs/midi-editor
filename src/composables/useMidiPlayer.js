// composables/useMidiPlayer.js - CORRECTIONS POUR LA RÉACTIVITÉ

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
    ccEventsSent: 0,
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

  // Cache des événements de lecture
  const playbackEvents = ref([])
  const currentEventIndex = ref(0)
  const lastEventsPrepareTime = ref(0)

  // NOUVEAU : Signature des données pour détecter les changements
  const dataSignature = ref('')

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

  // CORRECTION 1: Fonction pour générer une signature des données
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

  // CORRECTION 2: Fonction pour vérifier si les données ont changé
  function hasDataChanged() {
    const newSignature = generateDataSignature()
    if (newSignature !== dataSignature.value) {
      dataSignature.value = newSignature
      return true
    }
    return false
  }

  // CORRECTION 3: Surveiller les changements avec détection fine
  watch(() => midiStore.isLoaded, (newVal) => {
    if (newVal) {
      preparePlaybackEvents()
    } else {
      stop()
      playbackEvents.value = []
    }
  })

  // CORRECTION 4: Surveiller spécifiquement les propriétés qui affectent la lecture
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
      console.log('🔄 Détection changement pistes, régénération événements')
      preparePlaybackEvents()
    }
  }, { deep: true })

  // CORRECTION 5: Surveiller les versions pour forcer la mise à jour
  watch(() => midiStore.tracksVersion, () => {
    if (midiStore.isLoaded) {
      console.log('🔄 Version pistes changée, régénération événements')
      preparePlaybackEvents()
    }
  })

  watch(() => midiStore.notesVersion, () => {
    if (midiStore.isLoaded) {
      console.log('🔄 Version notes changée, régénération événements')
      preparePlaybackEvents()
    }
  })

  watch(() => midiStore.ccVersion, () => {
    if (midiStore.isLoaded) {
      console.log('🔄 Version CC changée, régénération événements')
      preparePlaybackEvents()
    }
  })

  // CORRECTION 6: Fonction play améliorée avec vérification des changements
  function play() {
    // Vérifier si les données ont changé depuis la dernière préparation
    if (hasDataChanged() || playbackEvents.value.length === 0) {
      console.log('🔄 Données changées détectées, régénération des événements avant lecture')
      preparePlaybackEvents()
    }

    if (!canPlay.value) {
      console.warn('⚠️ Impossible de lire : conditions non remplies')
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

      // CORRECTION 7: Toujours envoyer la configuration initiale avec les valeurs actuelles
      sendInitialMidiSetupFromCurrentData()
    }

    isPlaying.value = true
    startPlaybackTimer()

    return true
  }

  function sendInitialMidiSetupFromCurrentData() {
    if (!canSendMidi.value) {
      console.warn('⚠️ MIDI non disponible pour l\'initialisation')
      return
    }

    const availableOutputs = midiManager.availableOutputs?.value ?? []
    let setupCount = 0

    console.log('🎛️ Initialisation MIDI avec données actuelles...')
    console.log(`📋 ${availableOutputs.length} sortie(s) MIDI disponible(s):`)
    availableOutputs.forEach((output, i) => {
      console.log(`  ${i + 1}. "${output.name}" (ID: ${output.id})`)
    })

    midiStore.tracks.forEach(track => {
      if (track.muted) {
        console.log(`🔇 Piste ${track.name} ignorée (mutée)`)
        return
      }

      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))
      const output = resolveMidiOutput(track.midiOutput, availableOutputs)

      if (!output) {
        console.warn(`⚠️ Aucune sortie trouvée pour la piste ${track.name}`)
        return
      }

      console.log(`🎵 Configuration piste "${track.name}" -> "${output.name}" canal ${trackChannel + 1}`)

      // Program Change
      if (track.instrument?.number !== undefined) {
        if (midiManager.sendProgramChange(output.id, trackChannel, track.instrument.number)) {
          setupCount++
          console.log(`  📯 Program Change: ${track.instrument.number}`)
        }
      }

      // Bank Select
      if (track.bank !== undefined && track.bank !== 0) {
        if (midiManager.sendBankSelect(output.id, trackChannel, track.bank)) {
          setupCount++
          console.log(`  🏦 Bank Select: ${track.bank}`)
        }
      }

      // Volume avec valeur actuelle
      const currentVolume = Math.max(0, Math.min(127, parseInt(track.volume) || 100))
      if (midiManager.sendControlChange(output.id, trackChannel, 7, currentVolume)) {
        setupCount++
        console.log(`  🔊 Volume (CC7): ${currentVolume}`)
      }

      // Pan avec valeur actuelle
      const currentPan = Math.max(0, Math.min(127, parseInt(track.pan) || 64))
      if (midiManager.sendControlChange(output.id, trackChannel, 10, currentPan)) {
        setupCount++
        console.log(`  🎛️ Pan (CC10): ${currentPan}`)
      }

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
              if (midiManager.sendControlChange(output.id, trackChannel, ccNum, ccValue)) {
                setupCount++
                console.log(`  🎛️ CC${ccNum}: ${ccValue}`)
              }
            }
          }
        })
      }
    })

    console.log(`✅ Configuration MIDI terminée (${setupCount} messages envoyés)`)
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

    console.log('🔄 Génération des événements de lecture...')

    const events = []
    const availableOutputs = midiManager.availableOutputs?.value ?? []
    const generationTime = Date.now()

    if (availableOutputs.length === 0) {
      console.error('❌ Aucune sortie MIDI disponible pour la génération des événements')
      return
    }

    // Debug des sorties disponibles
    console.log(`📋 Sorties MIDI disponibles (${availableOutputs.length}):`)
    availableOutputs.forEach((output, i) => {
      console.log(`  ${i + 1}. "${output.name}" (ID: ${output.id})`)
    })

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
        console.log(`🔇 Piste ${track.name} ignorée (mutée)`)
        return
      }

      const trackChannel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))
      const resolvedOutput = resolveMidiOutput(track.midiOutput, availableOutputs)

      if (!resolvedOutput) {
        console.warn(`⚠️ Aucune sortie trouvée pour la piste ${track.name}, événements ignorés`)
        return
      }

      console.log(`🎵 Traitement piste "${track.name}" -> "${resolvedOutput.name}" (Canal ${trackChannel + 1})`)

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
          outputId: resolvedOutput.id, // ✅ Utiliser l'ID résolu
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

    console.log(`✅ ${events.length} événements générés (${totalNotes} notes, ${totalCC} CC)`)

    // Debug des événements générés par sortie
    const eventsByOutput = events.reduce((acc, event) => {
      if (event.outputId) {
        acc[event.outputId] = (acc[event.outputId] || 0) + 1
      }
      return acc
    }, {})

    console.log('📊 Événements par sortie:')
    Object.entries(eventsByOutput).forEach(([outputId, count]) => {
      const output = availableOutputs.find(o => o.id === outputId)
      const outputName = output ? output.name : 'Inconnue'
      console.log(`  "${outputName}" (${outputId}): ${count} événements`)
    })
  }

  // Le reste des fonctions reste identique...
  function pause() {
    if (!isPlaying.value) return

    isPlaying.value = false
    isPaused.value = true
    pauseTime = performance.now() - playStartTime
    stopPlaybackTimer()

    stopAllNotes()
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

    // Appliquer l'état MIDI incluant les CC avec données actuelles
    applyCurrentMidiStateAtTime(currentTime.value)

    if (wasPlaying) {
      play()
    }
  }

  // CORRECTION 12: Nouvelle fonction pour appliquer l'état avec données actuelles
  function applyCurrentMidiStateAtTime(time) {
    stopAllNotes()
    sendInitialMidiSetupFromCurrentData() // Utiliser les données actuelles

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
    const maxEventsPerRound = 50

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
          success = true
          break
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
    console.log('🔄 Régénération forcée des événements')
    preparePlaybackEvents()
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
    console.log(`🔄 Migration: "${trackMidiOutput}" trouvé par nom, ID=${output.id}`)
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
    forceRefreshEvents,

    // Nouvelles fonctions
    maintainCurrentCCState,

    // Utilitaires
    formatTime
  }
}