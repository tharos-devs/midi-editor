// composables/useMidiPlayer.js - CORRECTION POUR SYNCHRONISATION CURSEUR

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMidiStore } from '@/stores/midi'
import { useProjectStore } from '@/stores/project'
import { useMidiManager } from '@/composables/useMidiManager'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'
import { useTimeSignature } from '@/composables/useTimeSignature'

// CC qui supportent l'interpolation linéaire (selon standards DAW)
const CONTINUOUS_CC_LIST = [
  1,   // Modulation Wheel
  2,   // Breath Control
  7,   // Channel Volume
  10,  // Pan
  11,  // Expression Controller
  71,  // Filter Resonance
  74,  // Filter Cutoff/Brightness
  91,  // Reverb Send Level
  93   // Chorus Send Level
]

// CC en mode stepped/switch (pas d'interpolation)
const STEPPED_CC_LIST = [
  64,  // Sustain Pedal (0-63=OFF, 64-127=ON)
  65,  // Portamento On/Off
  66,  // Sostenuto On/Off
  67,  // Soft Pedal On/Off
  68,  // Legato On/Off
  69   // Hold 2 On/Off
  // CC 120-127 sont automatiquement en stepped (Channel Mode Messages)
]

// Fonction pour déterminer si un CC doit être interpolé
function shouldInterpolateCC(ccNumber) {
  // CC 120-127 sont toujours stepped (Channel Mode Messages)
  if (ccNumber >= 120 && ccNumber <= 127) return false
  
  // Vérifier si explicitement dans la liste stepped
  if (STEPPED_CC_LIST.includes(ccNumber)) return false
  
  // Vérifier si explicitement dans la liste continue
  if (CONTINUOUS_CC_LIST.includes(ccNumber)) return true
  
  // Par défaut, la plupart des CC sont continus sauf les switches
  return true
}

// CORRECTION: Instance singleton partagée
let sharedInstance = null

export function useMidiPlayer() {
  // Retourner l'instance partagée si elle existe
  if (sharedInstance) {
    return sharedInstance
  }
  
  // Créer la nouvelle instance
  const midiStore = useMidiStore()
  const projectStore = useProjectStore()
  const midiManager = useMidiManager()
  const cursorStore = usePlaybackCursorStore()
  const timeSignatureComposable = useTimeSignature()
  
  console.log('🎵 MIDI PLAYER INIT - tempoEvents déjà chargés:', {
    count: midiStore.tempoEvents?.length || 0,
    events: midiStore.tempoEvents?.map(e => `${e.bpm}BPM@${e.time.toFixed(2)}s`) || []
  })

  // État du lecteur
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const currentTime = ref(0)
  const playbackRate = ref(1)
  // CORRECTION: Synchroniser les variables de loop avec le store
  const loopStart = computed({
    get: () => projectStore.userPreferences.playback.loopStart,
    set: (value) => projectStore.updateUserPreferences('playback', { loopStart: value })
  })
  const loopEnd = computed({
    get: () => projectStore.userPreferences.playback.loopEnd,
    set: (value) => projectStore.updateUserPreferences('playback', { loopEnd: value })
  })
  const isLooping = computed({
    get: () => projectStore.userPreferences.playback.loopEnabled,
    set: (value) => projectStore.updateUserPreferences('playback', { loopEnabled: value })
  })
  const stoppedAtEnd = ref(false) // Flag pour différencier stop normal vs fin de morceau

  // Gestion du tempo
  const currentTempo = ref(120) // Valeur par défaut, sera mise à jour avec le premier tempo du morceau
  const tempoEvents = ref([])
  
  // Fonction pour initialiser le tempo avec le premier tempo du morceau
  function initializeTempoFromMidi() {
    if (tempoEvents.value.length > 0) {
      const sorted = tempoEvents.value.sort((a, b) => a.time - b.time)
      const firstTempo = sorted[0].bpm
      currentTempo.value = firstTempo
      
      // NOUVEAU: Créer un tempo virtuel à 0s si le premier tempo n'y est pas
      if (sorted[0].time > 0) {
        // Ajouter un tempo virtuel à 0s avec la valeur du premier tempo
        const virtualTempo = { 
          id: 'virtual-0s', 
          time: 0, 
          bpm: firstTempo, 
          virtual: true,
          readonly: false // Permettre la modification
        }
        tempoEvents.value = [virtualTempo, ...sorted]
        console.log('🎵 Tempo virtuel créé à 0s:', firstTempo, 'BPM')
      }
      
      console.log('🎵 Tempo initialisé avec le premier tempo du morceau:', firstTempo, 'BPM')
    } else if (midiStore.midiInfo?.tempo) {
      currentTempo.value = midiStore.midiInfo.tempo
      console.log('🎵 Tempo initialisé avec midiInfo.tempo:', midiStore.midiInfo.tempo, 'BPM')
    }
  }

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
  const MIN_TEMPO_BPM = 10 // Tempo minimum comme les DAW professionnels (Logic Pro, Cubase, etc.)

  // Cache des événements de lecture
  const playbackEvents = ref([])
  const currentEventIndex = ref(0)
  const lastEventsPrepareTime = ref(0)

  // Signature des données pour détecter les changements
  const dataSignature = ref('')

  // Gestion des articulations par piste
  const lastProcessedArticulationTime = ref(0)
  const triggeredArticulations = ref(new Set())
  const articulationLatencyCompensation = ref(1) // 1ms par défaut

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
    // - Il y a un fichier MIDI chargé (même si MIDI pas encore prêt), OU
    // - Il y a des notes dans le store, OU
    // - Nouveau projet vide (permettre navigation temporelle)
    const hasLoadedFile = isLoaded.value
    const hasManualNotes = midiStore.notes.length > 0
    const isNewProject = !isLoaded.value && midiStore.notes.length === 0
    
    // CORRECTION: Permettre la navigation temporelle même si MIDI pas prêt
    // La lecture MIDI sera désactivée automatiquement dans executeEvent si canSendMidi est false
    return hasLoadedFile || hasManualNotes || isNewProject
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
      
      console.log(`🎵 MIDI PLAYER - TEMPO EVENTS LOADED:`, {
        count: tempoEvents.value.length,
        events: tempoEvents.value.map(e => `${e.bpm}BPM@${e.time.toFixed(2)}s`)
      })
      
      // CORRECTION: Initialiser le tempo avec le premier tempo du morceau
      initializeTempoFromMidi()
      
      // Tempos synchronisés
    }
  }, { immediate: true, deep: true })

  // Utiliser la fonction existante de useTimeSignature pour obtenir la signature à un temps donné

  // Obtenir les articulations avec leurs triggers pour toutes les pistes actives
  function getArticulationsWithTriggers() {
    if (!projectStore.articulationsByTrack || !projectStore.articulationTypes) {
      return []
    }

    const result = []
    const availableOutputs = midiManager.availableOutputs?.value ?? []

    const articulationTypesCount = projectStore.articulationTypes?.length || 0
    
    console.log('🎵 DEBUG articulationTypes disponibles:', articulationTypesCount)

    // Parcourir toutes les pistes pour trouver celles qui ont des articulations
    const allTracks = midiStore.tracks || []
    console.log('🎵 DEBUG Parcours de', allTracks.length, 'pistes')
    
    for (const track of allTracks) {
      console.log('🎵 DEBUG vérification piste:', track.id)
      
      // Ignorer les pistes mutées ou inexistantes
      if (!track || track.muted) continue
      
      // Vérifier les pistes solo
      const soloTracks = midiStore.tracks.filter(t => t.solo)
      if (soloTracks.length > 0 && !track.solo) continue

      // Obtenir les articulations de cette piste via la fonction du store
      const trackArticulations = projectStore.getArticulationsByTrack(track.id)
      
      trackArticulations.forEach(articulation => {
        // Trouver le type d'articulation correspondant par UUID
        const articulationTypes = projectStore.articulationTypes || []
        const articulationType = articulationTypes.find(
          type => type.uuid === articulation.typeId
        )

        console.log('🎵 DEBUG articulation:', articulation.name, 'typeId:', articulation.typeId, 'type trouvé:', !!articulationType)
        if (articulationType) {
          console.log('🎵 DEBUG triggers du type:', articulationType.triggers?.length || 0)
          console.log('🎵 DEBUG triggers complets:', articulationType.triggers)
        } else if (articulation.typeId) {
          console.log('🎵 DEBUG types disponibles:', articulationTypes.map(t => ({ name: t.name, uuid: t.uuid })))
          console.log('🎵 DEBUG articulation avec typeId mais type non trouvé - typeId supprimé?')
        } else {
          console.log('🎵 DEBUG articulation sans typeId assigné - utilisez Ctrl+click pour assigner un type')
        }

        if (articulationType && articulationType.triggers && articulationType.triggers.length > 0) {
          // Debug de la piste et ses sorties
          console.log('🎵 DEBUG Piste complète:', track)
          console.log('🎵 DEBUG track.midiOutput:', track.midiOutput)
          console.log('🎵 DEBUG availableOutputs:', availableOutputs.map(o => ({ name: o.name, id: o.id })))
          
          // Résoudre la sortie MIDI pour cette piste
          const output = resolveMidiOutput(track.midiOutput, availableOutputs)
          
          console.log('🎵 DEBUG sortie MIDI résolue:', output?.name || 'aucune')
          console.log('🎵 DEBUG output complet:', output)
          
          result.push({
            ...articulation,
            triggers: articulationType.triggers,
            trackId: track.id,
            track: track,
            midiOutput: output
          })
        }
      })
    }

    return result.sort((a, b) => a.time - b.time)
  }

  // Calculer le tempo à un moment donné avec interpolation
  function getTempoAtTime(time) {
    if (!tempoEvents.value.length) {
      return Math.max(MIN_TEMPO_BPM, currentTempo.value || 120)
    }

    // S'assurer que les événements sont triés par temps
    const sortedEvents = [...tempoEvents.value].sort((a, b) => a.time - b.time)
    
    // CORRECTION: Si avant le premier événement, utiliser TOUJOURS le premier tempo
    // même si le premier tempo n'est pas à 0s - c'est le tempo initial du morceau
    if (time <= sortedEvents[0].time) {
      return Math.max(MIN_TEMPO_BPM, sortedEvents[0].bpm)
    }
    
    // Si après le dernier événement
    if (time >= sortedEvents[sortedEvents.length - 1].time) {
      return Math.max(MIN_TEMPO_BPM, sortedEvents[sortedEvents.length - 1].bpm)
    }
    
    // Trouver les deux points pour interpolation
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      if (time >= sortedEvents[i].time && time <= sortedEvents[i + 1].time) {
        const prevEvent = sortedEvents[i]
        const nextEvent = sortedEvents[i + 1]
        
        // INTERPOLATION LINÉAIRE avec application du minimum sur les deux points
        const prevTempo = Math.max(MIN_TEMPO_BPM, prevEvent.bpm)
        const nextTempo = Math.max(MIN_TEMPO_BPM, nextEvent.bpm)
        
        const timeDiff = nextEvent.time - prevEvent.time
        const tempoDiff = nextTempo - prevTempo
        const timeRatio = (time - prevEvent.time) / timeDiff
        
        return prevTempo + (tempoDiff * timeRatio)
      }
    }
    
    // Fallback: utiliser le dernier tempo valide
    let tempo = midiStore.midiInfo?.tempo || 120
    for (const tempoEvent of sortedEvents) {
      if (tempoEvent.time <= time) {
        tempo = tempoEvent.bpm
      } else {
        break
      }
    }
    
    return Math.max(MIN_TEMPO_BPM, tempo)
  }

  // Fonction pour obtenir la valeur d'un CC à un moment donné avec interpolation
  function getCCValueAtTime(ccNumber, time, trackId) {
    const trackCCEvents = midiStore.midiCC.filter(cc => 
      cc.trackId === trackId && 
      parseInt(cc.controller) === ccNumber
    ).sort((a, b) => parseFloat(a.time) - parseFloat(b.time))
    
    if (!trackCCEvents.length) return null
    
    // Si pas d'interpolation pour ce CC, retourner la dernière valeur
    if (!shouldInterpolateCC(ccNumber)) {
      let lastValue = parseInt(trackCCEvents[0].value) || 0
      for (const ccEvent of trackCCEvents) {
        if (parseFloat(ccEvent.time) <= time) {
          lastValue = parseInt(ccEvent.value) || 0
        } else {
          break
        }
      }
      return lastValue
    }
    
    // Interpolation linéaire pour les CC continus
    if (time <= parseFloat(trackCCEvents[0].time)) {
      return parseInt(trackCCEvents[0].value) || 0
    }
    
    if (time >= parseFloat(trackCCEvents[trackCCEvents.length - 1].time)) {
      return parseInt(trackCCEvents[trackCCEvents.length - 1].value) || 0
    }
    
    // Trouver les deux points pour interpolation
    for (let i = 0; i < trackCCEvents.length - 1; i++) {
      const currentEvent = trackCCEvents[i]
      const nextEvent = trackCCEvents[i + 1]
      const currentTime = parseFloat(currentEvent.time)
      const nextTime = parseFloat(nextEvent.time)
      
      if (time >= currentTime && time <= nextTime) {
        const currentValue = parseInt(currentEvent.value) || 0
        const nextValue = parseInt(nextEvent.value) || 0
        
        // Interpolation linéaire
        const timeDiff = nextTime - currentTime
        const valueDiff = nextValue - currentValue
        const timeRatio = (time - currentTime) / timeDiff
        
        return Math.max(0, Math.min(127, Math.round(currentValue + (valueDiff * timeRatio))))
      }
    }
    
    return parseInt(trackCCEvents[trackCCEvents.length - 1].value) || 0
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
    if (midiStore.isLoaded && canSendMidi.value) {
      preparePlaybackEvents()
    }
  })

  // NOUVEAU: Watch sur les changements de tempo
  watch(() => midiStore.tempoEvents, () => {
    if (midiStore.isLoaded) {
      console.log('🎵 Changements de tempo détectés, régénération des événements')
      preparePlaybackEvents()
    }
  }, { deep: true })

  // NOUVEAU: Fonction pour réveiller le navigateur avant la lecture
  async function wakeUpBrowser() {
    return new Promise((resolve) => {
      // Forcer plusieurs cycles d'animation pour réveiller le navigateur
      let cycles = 0
      const maxCycles = 5
      
      function warmupCycle() {
        cycles++
        if (cycles >= maxCycles) {
          console.log('✅ Navigateur réveillé après', maxCycles, 'cycles')
          resolve()
          return
        }
        
        // Forcer un calcul pour maintenir le processeur actif
        performance.now()
        requestAnimationFrame(warmupCycle)
      }
      
      console.log('🔄 Réveil du navigateur...', maxCycles, 'cycles')
      requestAnimationFrame(warmupCycle)
    })
  }

  // NOUVEAU: Pré-réchauffement moteur de rendu pour éviter les sauts du premier play
  async function warmupRenderingEngine() {
    return new Promise((resolve) => {
      let warmupCycles = 0
      const maxWarmupCycles = 10
      const startTime = performance.now()
      
      function renderWarmupCycle() {
        warmupCycles++
        
        // Simuler quelques opérations qui pourraient causer des interruptions
        const now = performance.now()
        const elapsed = now - startTime
        
        // Forcer quelques calculs DOM/styles (sans impact visuel)
        document.body.offsetHeight // Force reflow
        
        // Simuler le type de calculs qu'on fait dans la boucle de lecture
        const fakeTime = elapsed / 1000
        const fakeCurrentTime = fakeTime * (183 / 120) // Simulation calcul tempo
        
        if (warmupCycles >= maxWarmupCycles) {
          console.log('✅ Moteur de rendu réchauffé après', maxWarmupCycles, 'cycles')
          resolve()
          return
        }
        
        requestAnimationFrame(renderWarmupCycle)
      }
      
      console.log('🔄 Réchauffement moteur de rendu...', maxWarmupCycles, 'cycles')
      requestAnimationFrame(renderWarmupCycle)
    })
  }

  // CORRECTION: Fonction play qui délègue le timing au curseur
  async function play() {
    // Debug simple uniquement
    if (Math.floor(Date.now() / 1000) % 10 === 0) {
      console.log('🎬 PLAY appelé')
    }

    
    // NOTE: L'enregistrement ne se déclenche plus automatiquement avec Play
    // Utiliser le bouton Record dédié pour démarrer l'enregistrement
    
    // NOUVEAU: Faire toutes les opérations lourdes AVANT le réveil du navigateur
    console.log('🔄 Préparation des données MIDI...')
    
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
      // Sync player MIDI au temps curseur
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

    // Configuration initiale - FAIRE AVANT LE RÉVEIL DU NAVIGATEUR
    if (isPaused.value) {
      isPaused.value = false
    } else {
      if (currentTime.value === 0) {
        currentEventIndex.value = 0
      }
      
      // NOUVEAU: Initialiser les valeurs de loop si le bouton loop est activé
      if (isLooping.value && (loopEnd.value <= loopStart.value || loopStart.value < 0)) {
        // Initialiser des valeurs de loop par défaut intelligentes
        const defaultLoopEnd = Math.min(totalDuration.value / 4, 8.0) // 1/4 de la durée ou 8s max
        loopStart.value = 0
        loopEnd.value = Math.max(1.0, defaultLoopEnd) // Au minimum 1 seconde
        
        console.log(`🔄 Initialisation auto des valeurs de loop: ${loopStart.value}s - ${loopEnd.value}s`)
      }
      
      console.log('🔄 Configuration MIDI initiale...')
      sendInitialMidiSetupFromCurrentData()
    }
    
    // MAINTENANT: Réveiller le navigateur après toutes les opérations lourdes
    console.log('🔄 Réveil du navigateur (après préparation)...')
    await wakeUpBrowser()
    
    // NOUVEAU: Pré-réchauffement spécifique pour éviter les sauts du premier play
    console.log('🔄 Pré-réchauffement moteur de rendu...')
    await warmupRenderingEngine()

    isPlaying.value = true
    stoppedAtEnd.value = false // Reset la flag quand on relance
    
    // Réinitialiser l'état des articulations au début de la lecture
    resetArticulationState()

    // CORRECTION: Initialiser seulement si pas encore initialisé
    if (cursorStore.totalDuration === 0 || cursorStore.totalDuration !== totalDuration.value) {
      cursorStore.initialize()
      cursorStore.totalDuration = totalDuration.value
    }
    cursorStore.startPlayback()

    // NOTE: L'enregistrement MIDI ne se déclenche plus automatiquement lors du play
    // Utiliser le bouton Record dédié pour démarrer l'enregistrement

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
      console.warn('⚠️ MIDI non disponible, préparation des événements de navigation uniquement')
      // Continuer pour permettre la navigation temporelle même sans MIDI
    }
    

    const events = []
    const availableOutputs = midiManager.availableOutputs?.value ?? []
    const generationTime = Date.now()

    if (availableOutputs.length === 0) {
      console.warn('⚠️ Aucune sortie MIDI disponible, génération des événements de navigation uniquement')
      // Continuer pour permettre la navigation temporelle même sans sorties MIDI
    }

    // Ajouter les événements de tempo (gardés pour affichage)
    midiStore.tempoEvents.forEach(tempoEvent => {
      events.push({
        time: tempoEvent.time,
        type: 'tempo',
        bpm: tempoEvent.bpm,
        trackId: null,
        generatedAt: generationTime
      })
    })

    // Événements de tempo précalculés

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
        // Si pas de sortie MIDI, ignorer cette piste pour le MIDI mais continuer pour la navigation
        console.log(`⚠️ Piste ${track.id} ignorée (pas de sortie MIDI disponible)`)
        return
      }

      // Traiter les notes - utiliser le store global filtré par trackId
      const trackNotes = midiStore.notes.filter(note => note.trackId === track.id) || []
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

      // Traiter les Control Changes avec interpolation selon le type de CC
      const trackCCEvents = midiStore.midiCC.filter(cc => cc.trackId === track.id)
      
      // Grouper les événements CC par numéro de contrôleur
      const ccGroups = {}
      trackCCEvents.forEach(ccEvent => {
        const ccNum = parseInt(ccEvent.controller) || 1
        if (!ccGroups[ccNum]) ccGroups[ccNum] = []
        ccGroups[ccNum].push(ccEvent)
      })
      
      // Traiter chaque groupe de CC
      Object.entries(ccGroups).forEach(([ccNumStr, ccEvents]) => {
        const ccNum = parseInt(ccNumStr)
        const sortedEvents = ccEvents.sort((a, b) => parseFloat(a.time) - parseFloat(b.time))
        
        if (shouldInterpolateCC(ccNum) && sortedEvents.length >= 2) {
          // CC continu avec interpolation - générer des événements intermédiaires
          const INTERPOLATION_RESOLUTION = 0.05 // Événement toutes les 50ms pour les CC continus
          
          for (let i = 0; i < sortedEvents.length - 1; i++) {
            const currentEvent = sortedEvents[i]
            const nextEvent = sortedEvents[i + 1]
            const startTime = parseFloat(currentEvent.time)
            const endTime = parseFloat(nextEvent.time)
            const startValue = parseInt(currentEvent.value) || 0
            const endValue = parseInt(nextEvent.value) || 0
            
            // Ajouter l'événement de départ
            events.push({
              time: startTime,
              type: 'controlChange',
              trackId: track.id,
              trackName: track.name,
              channel: trackChannel,
              outputId: resolvedOutput.id,
              outputName: resolvedOutput.name,
              controller: ccNum,
              value: startValue,
              ccData: { ...currentEvent },
              generatedAt: generationTime
            })
            totalCC++
            
            // Générer les événements interpolés uniquement si les valeurs sont différentes
            if (startValue !== endValue && endTime - startTime > INTERPOLATION_RESOLUTION) {
              const timeDiff = endTime - startTime
              const valueDiff = endValue - startValue
              const steps = Math.ceil(timeDiff / INTERPOLATION_RESOLUTION)
              
              for (let step = 1; step < steps; step++) {
                const interpolatedTime = startTime + (step * timeDiff / steps)
                const interpolatedValue = Math.max(0, Math.min(127, 
                  Math.round(startValue + (valueDiff * step / steps))
                ))
                
                events.push({
                  time: interpolatedTime,
                  type: 'controlChange',
                  trackId: track.id,
                  trackName: track.name,
                  channel: trackChannel,
                  outputId: resolvedOutput.id,
                  outputName: resolvedOutput.name,
                  controller: ccNum,
                  value: interpolatedValue,
                  ccData: { ...currentEvent, interpolated: true },
                  generatedAt: generationTime
                })
                totalCC++
              }
            }
          }
          
          // Ajouter le dernier événement
          const lastEvent = sortedEvents[sortedEvents.length - 1]
          events.push({
            time: parseFloat(lastEvent.time),
            type: 'controlChange',
            trackId: track.id,
            trackName: track.name,
            channel: trackChannel,
            outputId: resolvedOutput.id,
            outputName: resolvedOutput.name,
            controller: ccNum,
            value: parseInt(lastEvent.value) || 0,
            ccData: { ...lastEvent },
            generatedAt: generationTime
          })
          totalCC++
          
        } else {
          // CC stepped ou événement unique - pas d'interpolation
          sortedEvents.forEach(ccEvent => {
            events.push({
              time: parseFloat(ccEvent.time) || 0,
              type: 'controlChange',
              trackId: track.id,
              trackName: track.name,
              channel: trackChannel,
              outputId: resolvedOutput.id,
              outputName: resolvedOutput.name,
              controller: ccNum,
              value: parseInt(ccEvent.value) || 0,
              ccData: { ...ccEvent },
              generatedAt: generationTime
            })
            totalCC++
          })
        }
      })

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

    // Trier les événements par temps AVANT le précalcul
    events.sort((a, b) => a.time - b.time)

    // Garder les événements sans précalcul de tempo - la synchronisation se fera en temps réel
    // SUPPRIMÉ: précalculs de tempo qui perturbent la synchronisation

    playbackEvents.value = events
    lastEventsPrepareTime.value = generationTime
    dataSignature.value = generateDataSignature()

    // Debug événements désactivé pour performance

    // Événements préparés
  }

  function pause() {
    if (!isPlaying.value) return

    isPlaying.value = false
    isPaused.value = true
    
    // Arrêter l'enregistrement MIDI lors de la pause (finalise les zones replace)
    window.dispatchEvent(new CustomEvent('midi-recording-stop', {
      detail: { 
        mode: projectStore.userPreferences.keyboard.recordingMode || 'merge'
      }
    }))
    console.log(`⏸️ Événement d'arrêt d'enregistrement MIDI émis lors de la pause`)
    
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
    // NE PAS remettre à 0 - garder la position d'arrêt
    // currentTime.value = 0
    currentEventIndex.value = 0
    stoppedAtEnd.value = false // Reset la flag
    
    // Réinitialiser l'état des articulations lors de l'arrêt
    resetArticulationState()
    
    // Émettre un événement pour arrêter l'enregistrement MIDI
    window.dispatchEvent(new CustomEvent('midi-recording-stop', {
      detail: { 
        mode: projectStore.userPreferences.keyboard.recordingMode || 'merge'
      }
    }))
    console.log(`⏹️ Événement d'arrêt d'enregistrement MIDI émis`)
    
    // Stop du curseur global
    cursorStore.stopPlayback()
    
    // Arrêter le scheduler d'événements
    stopEventScheduler()
    
    // CORRECTION: Garder le tempo actuel au moment de l'arrêt
    const currentTempoAtStop = getTempoAtTime(cursorStore.currentTime) || currentTempo.value || 120
    currentTempo.value = currentTempoAtStop
    
    console.log('🎵 Tempo maintenu à l\'arrêt:', currentTempoAtStop, 'BPM', 'à la position', cursorStore.currentTime.toFixed(3) + 's')

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
    const newTempo = getTempoAtTime(tempoTime)
    currentTempo.value = newTempo
    
    console.log(`🎵 SEEK: Temps ${clampedTime.toFixed(2)}s → Tempo ${newTempo} BPM`)

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
    
    // Réinitialiser l'état des articulations avec la nouvelle position
    resetArticulationState()
    lastProcessedArticulationTime.value = clampedTime

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
  
  // Calculer le temps musical en intégrant les changements de tempo
  function calculateMusicalTimeFromRealTime(startMusicalTime, realElapsedTime) {
    if (!tempoEvents.value || tempoEvents.value.length === 0) {
      // Pas de changements de tempo, relation 1:1
      return startMusicalTime + realElapsedTime
    }
    
    // Calcul optimisé - validation légère seulement
    const result = calculateMusicalTimeFromRealTimeInternal(startMusicalTime, realElapsedTime)
    
    // Log seulement les erreurs vraiment critiques (>2s de différence)
    if (Math.abs(result - (startMusicalTime + realElapsedTime)) > 2.0) {
      console.warn('⚠️ Temps musical critique:', Math.abs(result - (startMusicalTime + realElapsedTime)).toFixed(1) + 's diff')
    }
    
    return result
  }
  
  function calculateMusicalTimeFromRealTimeInternal(startMusicalTime, realElapsedTime) {
    // CORRECTION: Implémenter le calcul correct avec changements de tempo
    let currentMusicalTime = startMusicalTime
    let remainingRealTime = realElapsedTime
    
    // Obtenir les événements de tempo triés par temps
    const sortedTempoEvents = [...tempoEvents.value].sort((a, b) => a.time - b.time)
    
    // Trouver le tempo de départ
    let currentTempo = 120 // BPM par défaut
    for (let i = sortedTempoEvents.length - 1; i >= 0; i--) {
      if (sortedTempoEvents[i].time <= startMusicalTime) {
        currentTempo = sortedTempoEvents[i].bpm
        break
      }
    }
    
    // Traiter chaque segment de tempo
    for (const tempoEvent of sortedTempoEvents) {
      if (tempoEvent.time <= startMusicalTime) continue // Tempo déjà appliqué
      if (remainingRealTime <= 0) break // Plus de temps à traiter
      
      // Calculer la portion de temps réel pour ce segment
      const segmentEndTime = tempoEvent.time
      const segmentDuration = segmentEndTime - currentMusicalTime
      
      // Calculer le temps réel nécessaire pour parcourir ce segment au tempo actuel
      const realTimeForSegment = segmentDuration * (120 / currentTempo) // 120 BPM = tempo de référence
      
      if (realTimeForSegment >= remainingRealTime) {
        // Le temps réel restant ne dépasse pas ce segment
        currentMusicalTime += remainingRealTime * (currentTempo / 120)
        remainingRealTime = 0
        break
      } else {
        // Le temps réel traverse ce segment complètement
        currentMusicalTime = segmentEndTime
        remainingRealTime -= realTimeForSegment
        currentTempo = tempoEvent.bpm
      }
    }
    
    // S'il reste du temps réel, l'appliquer avec le dernier tempo
    if (remainingRealTime > 0) {
      currentMusicalTime += remainingRealTime * (currentTempo / 120)
    }
    
    return currentMusicalTime
  }
  
  // Fonction inverse: convertir un intervalle de temps musical en temps réel
  function convertMusicalDurationToRealTime(startMusicalTime, endMusicalTime) {
    if (startMusicalTime >= endMusicalTime) return 0
    
    // Obtenir les événements de tempo triés par temps
    const sortedTempoEvents = [...tempoEvents.value].sort((a, b) => a.time - b.time)
    
    let currentTime = startMusicalTime
    let totalRealTime = 0
    
    // Trouver le tempo de départ
    let currentTempo = 120 // BPM par défaut
    for (let i = sortedTempoEvents.length - 1; i >= 0; i--) {
      if (sortedTempoEvents[i].time <= startMusicalTime) {
        currentTempo = sortedTempoEvents[i].bpm
        break
      }
    }
    
    // Traiter chaque segment de tempo
    for (const tempoEvent of sortedTempoEvents) {
      if (tempoEvent.time <= startMusicalTime) continue // Déjà traité
      if (currentTime >= endMusicalTime) break // Fini
      
      const segmentStart = currentTime
      const segmentEnd = Math.min(tempoEvent.time, endMusicalTime)
      const segmentDuration = segmentEnd - segmentStart
      
      if (segmentDuration > 0) {
        // Convertir cette portion en temps réel avec le tempo actuel
        const realTimeForSegment = segmentDuration * (120 / currentTempo)
        totalRealTime += realTimeForSegment
        
        currentTime = segmentEnd
        if (currentTime >= endMusicalTime) break
      }
      
      // Passer au nouveau tempo
      currentTempo = tempoEvent.bpm
    }
    
    // S'il reste du temps musical, le traiter avec le dernier tempo
    if (currentTime < endMusicalTime) {
      const remainingDuration = endMusicalTime - currentTime
      totalRealTime += remainingDuration * (120 / currentTempo)
    }
    
    return totalRealTime
  }
  
  // FONCTION SUPPRIMÉE: calculateMusicalTimeFromRealTime - causait des problèmes de synchronisation
  
  // FONCTION SUPPRIMÉE: applyTempoChangesToEvents - causait des problèmes de synchronisation
  
  // FONCTION SUPPRIMÉE: calculateAdjustedTime - causait des problèmes de synchronisation
  
  
  
  
  function startEventScheduler() {
    if (playbackTimer) return

    playStartTime = performance.now()
    playStartMusicTime = currentTime.value
    
    // Debug: vérifier les variables d'initialisation
    console.log(`🚀 INIT PLAYBACK:`, {
      playStartTime: playStartTime,
      playStartMusicTime: playStartMusicTime.toFixed(3) + 's',
      currentTimeValue: currentTime.value.toFixed(3) + 's'
    })
    
    // Debug: vérifier le tempo initial au démarrage - TOUJOURS utiliser getTempoAtTime(0)
    const startTempo = getTempoAtTime(0) || midiStore.midiInfo?.tempo || 60
    console.log(`🎬 DÉMARRAGE PLAYBACK - Tempo initial: ${startTempo} BPM (tempoEvents: ${tempoEvents.value.length})`)
    console.log(`🎵 DEBUG TEMPO:`, {
      currentTempo: currentTempo.value,
      getTempoAtTime0: getTempoAtTime(0),
      midiInfoTempo: midiStore.midiInfo?.tempo,
      firstTempoEvent: tempoEvents.value[0]
    })
    
    // Timer démarré

    // Compteur pour limiter les logs de debug aux premiers cycles
    let debugCycleCount = 0

    // NOUVELLE APPROCHE: Accumuler le temps par deltas stables
    let lastPerformanceTime = performance.now()
    let accumulatedRealTime = playStartMusicTime
    
    const playbackLoop = () => {
      if (!isPlaying.value) return

      // Mesurer les performances pour identifier les blocages
      const cycleStartTime = performance.now()

      // NOUVEAU: Accumuler le temps par deltas limités pour éviter les sauts
      const now = performance.now()
      const rawDelta = (now - lastPerformanceTime) / 1000
      
      // Limiter le delta max pour éviter les sauts (max 50ms par cycle)
      const maxDelta = 0.050
      const safeDelta = Math.min(rawDelta, maxDelta)
      
      // Accumuler le temps avec le delta sécurisé
      accumulatedRealTime += safeDelta
      const realTimeElapsed = accumulatedRealTime - playStartMusicTime
      
      // Debug pour voir la différence entre temps brut et temps accumulé
      // Debug temporel désactivé pour performance
      
      lastPerformanceTime = now
      
      // Convertir le temps réel en temps musical avec les changements de tempo
      const beforeCalc = performance.now()
      const currentPlayTime = calculateMusicalTimeFromRealTime(playStartMusicTime, realTimeElapsed)
      const afterCalc = performance.now()
      
      // Debug seulement en cas de problème majeur  
      if (debugCycleCount < 5 && (afterCalc - beforeCalc) > 10) {
        console.warn(`⚠️ CYCLE LENT ${debugCycleCount}: ${(afterCalc - beforeCalc).toFixed(1)}ms`)
        debugCycleCount++
      }
      
      // Mettre à jour le temps courant
      const beforeUpdate = performance.now()
      currentTime.value = currentPlayTime
      currentTempo.value = getTempoAtTime(currentPlayTime)
      
      // Mettre à jour les variables globales pour l'enregistrement MIDI
      window.currentPlaybackTime = currentPlayTime
      window.currentTempo = currentTempo.value
      
      // Synchroniser le curseur store avec le temps musical calculé (qui tient compte du tempo)
      cursorStore.updateTime(currentPlayTime)
      
      // Vérifier et déclencher les articulations pendant la lecture
      checkAndTriggerArticulations(currentPlayTime)
      
      const afterUpdate = performance.now()
      
      // Performance monitoring ultra-léger
      const totalCycleTime = afterUpdate - cycleStartTime
      if (totalCycleTime > 50) { // Seulement si vraiment critique (>50ms)
        console.warn(`⚠️ CYCLE CRITIQUE: ${totalCycleTime.toFixed(0)}ms`)
      }

      // CORRECTION: Vérifier la fin de TimeLine plutôt que la durée MIDI
      // Calculer le temps correspondant à la fin de la TimeLine
      const { pixelsToTimeWithSignatures, totalWidth } = timeSignatureComposable
      const timelineEndTime = pixelsToTimeWithSignatures ? pixelsToTimeWithSignatures(totalWidth.value) : totalDuration.value
      
      // Utiliser le maximum entre durée MIDI et fin de TimeLine
      const effectiveEndTime = Math.max(totalDuration.value, timelineEndTime)
      
      // Vérifier la fin de morceau OU la fin de la zone de loop
      const shouldLoop = isLooping.value && loopEnd.value > loopStart.value
      const endTime = shouldLoop ? loopEnd.value : effectiveEndTime
      
      if (currentPlayTime >= endTime) {
        if (shouldLoop) {
          // Retour au début de la loop
          console.log(`🔄 Retour au début de loop: ${loopStart.value}s`)
          seekTo(loopStart.value)
          return
        } else {
          // Fin de morceau normale
          stopAtEnd() 
        }
        return
      }

      // Programmer les événements MIDI à venir
      scheduleUpcomingEvents(currentPlayTime)
      
      // Programmer le prochain cycle avec requestAnimationFrame pour plus de stabilité
      playbackTimer = requestAnimationFrame(playbackLoop)
    }
    
    // Démarrer la boucle
    playbackTimer = requestAnimationFrame(playbackLoop)
  }

  function stopEventScheduler() {
    if (playbackTimer) {
      cancelAnimationFrame(playbackTimer)
      playbackTimer = null
    }
  }

  function scheduleUpcomingEvents(currentPlayTime) {
    const scheduleTime = currentPlayTime + (scheduleAheadTime / 1000)
    let eventsScheduledThisRound = 0
    const maxEventsPerRound = 50
    
    // Debug désactivé pour performance

    while (currentEventIndex.value < playbackEvents.value.length && eventsScheduledThisRound < maxEventsPerRound) {
      const event = playbackEvents.value[currentEventIndex.value]

      if (event.time > scheduleTime) {
        break
      }

      if (event.time < currentPlayTime - 0.1) {
        currentEventIndex.value++
        continue
      }

      // CORRECTION: Calculer le délai en temps réel en tenant compte des changements de tempo
      const realDelay = convertMusicalDurationToRealTime(currentPlayTime, event.time) * 1000
      const delay = Math.max(0, realDelay)
      

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

    // Vérifier si on peut envoyer du MIDI - ignorer silencieusement si pas possible
    if (!canSendMidi.value && event.type !== 'tempo') {
      return // Navigation temporelle fonctionne même sans MIDI
    }

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
          // Mettre à jour le tempo pour l'affichage  
          currentTempo.value = event.bpm
          success = true
          // Log tempo désactivé pour performance
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
    // Si les valeurs de loop ne sont pas définies, les initialiser intelligemment
    if (loopEnd.value <= loopStart.value) {
      // Calculer une région de loop par défaut basée sur les mesures
      const { timeToPixelsWithSignatures, pixelsToTimeWithSignatures } = timeSignatureComposable || {}
      
      let defaultLoopEnd = 8.0 // Fallback: 8 secondes
      
      if (pixelsToTimeWithSignatures && timeToPixelsWithSignatures) {
        // Essayer de calculer 4 mesures
        try {
          // Estimer le temps pour 4 mesures (en assumant 4/4 à 120 BPM par défaut)
          const estimatedFourMeasures = (4 * 4 * 60) / (currentTempo.value || 120) // 4 mesures * 4 temps * 60s / BPM
          defaultLoopEnd = Math.min(totalDuration.value, estimatedFourMeasures)
        } catch (error) {
          console.warn('Impossible de calculer la durée des mesures, utilisation de la valeur par défaut')
        }
      } else {
        // Utiliser 1/4 de la durée totale ou 8s maximum
        defaultLoopEnd = Math.min(totalDuration.value / 4, 8.0)
      }
      
      loopStart.value = 0
      loopEnd.value = Math.max(1.0, defaultLoopEnd) // Au minimum 1 seconde
      
      console.log(`🔄 Initialisation des valeurs de loop: ${loopStart.value}s - ${loopEnd.value}s (durée totale: ${totalDuration.value}s)`)
    }
    
    // Basculer l'état du loop
    isLooping.value = !isLooping.value
    console.log(`🔄 Loop ${isLooping.value ? 'activé' : 'désactivé'}: ${loopStart.value}s - ${loopEnd.value}s`)
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

  // ============ FONCTIONS DE GESTION DES ARTICULATIONS ============

  /**
   * Vérifie et déclenche les articulations en cours de lecture
   */
  function checkAndTriggerArticulations(currentPlayTime) {
    const articulationsWithTriggers = getArticulationsWithTriggers()
    
    // Debug: Log seulement s'il y a des articulations
    if (articulationsWithTriggers.length > 0) {
      console.log('🎵 checkAndTriggerArticulations à', currentPlayTime.toFixed(2) + 's, articulations trouvées:', articulationsWithTriggers.length)
    }
    
    if (articulationsWithTriggers.length === 0) {
      return
    }

    // Calculer le temps anticipé : déclencher la compensation AVANT l'articulation
    const compensationTime = articulationLatencyCompensation.value / 1000 // ms -> s
    
    // Ne traiter que si le temps avance
    if (currentPlayTime <= lastProcessedArticulationTime.value) {
      return
    }

    articulationsWithTriggers.forEach(articulation => {
      const articulationTime = articulation.time
      const articulationEndTime = articulation.time + (articulation.duration || 0.1)
      
      // Temps de déclenchement anticipé : compensationTime AVANT l'articulation
      const triggerTime = articulationTime - compensationTime

      console.log('🎵 DEBUG articulation:', articulation.name, 'à', articulationTime.toFixed(3), 'trigger à', triggerTime.toFixed(3), 'current:', currentPlayTime.toFixed(3))

      // Vérifier si on entre dans la zone d'articulation (avec anticipation)
      if (
        currentPlayTime >= triggerTime &&
        currentPlayTime <= articulationEndTime &&
        lastProcessedArticulationTime.value < articulationTime &&
        !triggeredArticulations.value.has(articulation.id)
      ) {
        console.log('🎵 Déclenchement articulation:', articulation.name, 'à', articulationTime.toFixed(3) + 's')
        console.log('🎵 Triggers:', articulation.triggers)
        console.log('🎵 Canal MIDI:', articulation.track.channel, 'Sortie:', articulation.midiOutput.name)
        triggerArticulationEvents(articulation)
        triggeredArticulations.value.add(articulation.id)
      }
    })

    lastProcessedArticulationTime.value = currentPlayTime
  }

  /**
   * Déclenche les événements MIDI d'une articulation
   */
  function triggerArticulationEvents(articulation) {
    if (!articulation.triggers || articulation.triggers.length === 0) {
      console.warn('⚠️ Articulation sans triggers:', articulation.name)
      return
    }

    if (!articulation.track || !articulation.midiOutput) {
      console.warn('⚠️ Articulation sans piste ou sortie MIDI:', articulation.name)
      console.log('🎯 DEBUG articulation.track:', articulation.track)
      console.log('🎯 DEBUG articulation.midiOutput:', articulation.midiOutput)
      return
    }

    if (articulation.midiOutput.state !== 'connected') {
      console.warn('⚠️ Sortie MIDI non connectée pour l\'articulation:', articulation.name)
      console.log('🎯 DEBUG midiOutput.state:', articulation.midiOutput.state)
      console.log('🎯 DEBUG midiOutput complet:', articulation.midiOutput)
      return
    }

    const midiChannel = articulation.track.channel || 0
    const output = articulation.midiOutput

    console.log('🎛️ Envoi triggers articulation', articulation.name, 'piste', articulation.track.name, 'canal', midiChannel, 'sortie', output.name)

    // Envoyer chaque trigger avec un petit délai
    articulation.triggers.forEach((trigger, index) => {
      setTimeout(() => {
        sendArticulationTriggerEvent(trigger, midiChannel, output)
      }, index * 2) // 2ms entre chaque trigger
    })
  }

  /**
   * Envoie un événement MIDI selon le type de trigger
   */
  function sendArticulationTriggerEvent(trigger, channel, output) {
    try {
      switch (trigger.activation) {
        case 'note':
          sendArticulationNoteEvent(trigger.sequence, channel, output)
          break
          
        case 'controller':
          sendArticulationControllerEvent(trigger.sequence, channel, output)
          break
          
        case 'program':
          sendArticulationProgramChangeEvent(trigger.sequence, channel, output)
          break
          
        default:
          console.warn('⚠️ Type de trigger non supporté:', trigger.activation)
      }
    } catch (error) {
      console.error('❌ Erreur envoi trigger MIDI:', error)
    }
  }

  /**
   * Envoie un événement Note On/Off pour articulation
   */
  function sendArticulationNoteEvent(noteString, channel, output) {
    const noteNumber = parseArticulationNoteString(noteString)
    if (noteNumber === null) {
      console.warn('⚠️ Note invalide pour articulation:', noteString)
      return
    }

    console.log('🎹 Envoi Note On articulation:', noteString, '(', noteNumber, ') canal', channel)
    
    try {
      // Note On
      const noteOnMessage = [0x90 + channel, noteNumber, 100] // Vélocité 100 pour les triggers
      sendMidiMessage(output, noteOnMessage)

      // Note Off après 50ms (trigger court)
      setTimeout(() => {
        const noteOffMessage = [0x80 + channel, noteNumber, 0]
        sendMidiMessage(output, noteOffMessage)
      }, 50)
    } catch (error) {
      console.error('❌ Erreur envoi note articulation:', error)
    }
  }

  /**
   * Fonction utilitaire pour envoyer un message MIDI
   */
  function sendMidiMessage(output, message) {
    if (typeof output.send === 'function') {
      output.send(message)
    } else if (output.output && typeof output.output.send === 'function') {
      output.output.send(message) // Structure wrapper utilisée dans useMidiManager
    } else if (output.connection && typeof output.connection.send === 'function') {
      output.connection.send(message)
    } else if (output.port && typeof output.port.send === 'function') {
      output.port.send(message)
    } else {
      throw new Error('Aucune méthode d\'envoi MIDI trouvée sur l\'objet output')
    }
  }

  /**
   * Envoie un Control Change pour articulation
   */
  function sendArticulationControllerEvent(controllerData, channel, output) {
    if (!controllerData || typeof controllerData !== 'object') {
      console.warn('⚠️ Données controller invalides pour articulation:', controllerData)
      return
    }

    const controller = parseInt(controllerData.controller)
    const value = parseInt(controllerData.value)

    if (isNaN(controller) || isNaN(value)) {
      console.warn('⚠️ CC invalide pour articulation:', controllerData)
      return
    }

    console.log('🎛️ Envoi CC articulation', controller, '=', value, 'canal', channel)
    
    try {
      const ccMessage = [0xB0 + channel, controller, value]
      sendMidiMessage(output, ccMessage)
    } catch (error) {
      console.error('❌ Erreur envoi CC articulation:', error)
    }
  }

  /**
   * Envoie un Program Change pour articulation
   */
  function sendArticulationProgramChangeEvent(program, channel, output) {
    const programNumber = parseInt(program)
    if (isNaN(programNumber) || programNumber < 0 || programNumber > 127) {
      console.warn('⚠️ Program Change invalide pour articulation:', program)
      return
    }

    console.log('🎪 Envoi Program Change articulation:', programNumber, 'canal', channel)

    try {
      const pcMessage = [0xC0 + channel, programNumber]
      sendMidiMessage(output, pcMessage)
    } catch (error) {
      console.error('❌ Erreur envoi Program Change articulation:', error)
    }
  }

  /**
   * Parse une chaîne de note (ex: "C4", "F#3") en numéro MIDI
   */
  function parseArticulationNoteString(noteString) {
    if (!noteString || typeof noteString !== 'string') return null

    console.log('🔍 DEBUG parseArticulationNoteString:', noteString)
    const match = noteString.match(/^([A-G])([#b]?)(-?\d+)$/i)
    console.log('🔍 DEBUG regex match:', match)
    if (!match) return null

    const [, noteName, accidental, octaveStr] = match
    const octave = parseInt(octaveStr)
    
    console.log('🔍 DEBUG noteName:', noteName)
    console.log('🔍 DEBUG accidental:', accidental)
    console.log('🔍 DEBUG octaveStr:', octaveStr)
    console.log('🔍 DEBUG octave parsed:', octave)

    if (isNaN(octave)) {
      console.log('🔍 DEBUG octave isNaN, returning null')
      return null
    }

    // Conversion nom de note -> numéro MIDI
    const noteValues = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 }
    let noteValue = noteValues[noteName.toUpperCase()]
    
    console.log('🔍 DEBUG noteValue lookup:', noteName.toUpperCase(), '->', noteValue)

    if (noteValue === undefined) {
      console.log('🔍 DEBUG noteValue undefined, returning null')
      return null
    }

    // Appliquer les altérations
    if (accidental === '#') noteValue += 1
    else if (accidental === 'b') noteValue -= 1

    // Calculer le numéro MIDI - supporter les deux conventions
    // Convention scientifique: C4 = 60, formule: (octave + 1) * 12 + noteValue
    // Convention Yamaha: C3 = 60, formule: (octave + 2) * 12 + noteValue
    const midiNumberScientific = (octave + 1) * 12 + noteValue
    const midiNumberYamaha = (octave + 2) * 12 + noteValue
    
    console.log('🔍 DEBUG midiNumber scientifique (C4=60):', midiNumberScientific)
    console.log('🔍 DEBUG midiNumber Yamaha (C3=60):', midiNumberYamaha)
    
    // Utiliser la convention qui donne un résultat valide
    let midiNumber = midiNumberScientific
    if (midiNumberScientific < 0 || midiNumberScientific > 127) {
      if (midiNumberYamaha >= 0 && midiNumberYamaha <= 127) {
        midiNumber = midiNumberYamaha
        console.log('🔍 DEBUG utilisation convention Yamaha')
      }
    } else {
      console.log('🔍 DEBUG utilisation convention scientifique')
    }
    
    console.log('🔍 DEBUG midiNumber calculé:', midiNumber)
    console.log('🔍 DEBUG valide (0-127)?', midiNumber >= 0 && midiNumber <= 127)

    return (midiNumber >= 0 && midiNumber <= 127) ? midiNumber : null
  }

  /**
   * Remet à zéro l'état des articulations
   */
  function resetArticulationState() {
    lastProcessedArticulationTime.value = 0
    triggeredArticulations.value.clear()
    console.log('🔄 Reset état articulations')
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
          sendMidiMessage(output, allNotesOffMessage)
          console.log(`🔇 All Notes Off envoyé sur piste ${trackId}, canal ${trackChannel}`)
          
          // Aussi envoyer All Sound Off (CC 120) pour être sûr
          const allSoundOffMessage = [0xB0 + trackChannel, 120, 0]
          sendMidiMessage(output, allSoundOffMessage)
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

  // NOUVELLE FONCTION: Démarrer l'enregistrement sans lecture automatique
  function record() {
    console.log('🔴 RECORD: Démarrage enregistrement manuel')
    
    // Si pas encore en lecture, démarrer la lecture en mode enregistrement
    if (!isPlaying.value) {
      // Émettre l'événement de démarrage d'enregistrement AVANT de lancer la lecture
      window.dispatchEvent(new CustomEvent('midi-recording-start', {
        detail: { 
          mode: projectStore.userPreferences.keyboard.recordingMode || 'merge',
          manualRecord: true // Indiquer que c'est un enregistrement manuel
        }
      }))
      
      // Démarrer la lecture pour l'enregistrement
      play()
    } else {
      // Si déjà en lecture, juste déclencher l'enregistrement
      window.dispatchEvent(new CustomEvent('midi-recording-start', {
        detail: { 
          mode: projectStore.userPreferences.keyboard.recordingMode || 'merge',
          manualRecord: true
        }
      }))
    }
  }

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
    record,
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

    // Fonctions d'articulation
    getArticulationsWithTriggers,
    triggerArticulationEvents,

    // Utilitaires
    formatTime
  }
  
  // Sauvegarder l'instance pour la réutiliser
  sharedInstance = instance
  return instance
}