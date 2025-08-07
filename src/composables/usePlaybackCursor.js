// composables/usePlaybackCursor.js - VERSION CORRIGÉE POUR LA SYNCHRONISATION
import { ref, computed, watch, onMounted, onUnmounted, inject } from 'vue'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useUIStore } from '@/stores/ui'

export function usePlaybackCursor() {
  const midiStore = useMidiStore()
  const uiStore = useUIStore()
  const { timeToPixelsWithSignatures, timeToPixels, totalWidth: timeSignatureTotalWidth } = useTimeSignature()

  // ============ ÉTAT INTERNE ============
  const currentTime = ref(0)
  const totalDuration = ref(0)
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const currentTempo = ref(120)
  
  // CORRECTION MAJEURE: Timer interne pour le défilement autonome
  const internalTimer = ref(null)
  const lastUpdateTime = ref(0)
  const timerStartTime = ref(0)
  const timerStartMusicTime = ref(0)
  
  // Synchronisation avec le lecteur
  const isSyncedWithPlayer = ref(false)
  
  // Configuration du curseur
  const cursorConfig = ref({
    cursorColor: '#ff0000', // Rouge plus vif
    cursorWidth: 4, // Plus large
    cursorOpacity: 1, // Totalement opaque
    headSize: 12, // Plus gros
    headColor: '#ff0000',
    showHead: true,
    showTimeIndicator: false,
    animationDuration: '0.05s',
    zIndex: 9999, // Z-index très élevé
    followCursor: true,
    followPadding: 50,
    smoothAnimation: true,
    latencyCompensation: 0.050 // 50ms de compensation par défaut
  })

  // ============ INJECTION AVEC FALLBACKS ============
  const injectedTimeToPixel = inject('timeToPixel', null)
  const injectedTotalWidth = inject('totalWidth', null)
  
  // console.log('💉 Injections reçues:', {
  //   hasTimeToPixel: !!injectedTimeToPixel,
  //   timeToPixelType: typeof injectedTimeToPixel?.value,
  //   timeToPixelValue: injectedTimeToPixel?.value,
  //   hasTotalWidth: !!injectedTotalWidth,
  //   totalWidthValue: injectedTotalWidth?.value || injectedTotalWidth
  // })

  // ============ INITIALISATION DE LA DURÉE ============
  onMounted(() => {
    // console.log('🎯 PlaybackCursor monté')
    
    // CORRECTION TEMPORAIRE: Augmenter le zoom si trop faible
    if (uiStore.horizontalZoom < 3) {
      // console.log('🔧 Zoom trop faible détecté:', uiStore.horizontalZoom, '→ Augmentation à 3x')
      uiStore.setHorizontalZoom(3)
    }
    
    // Diagnostic supprimé - trop verbeux
    
    // Initialiser depuis le store MIDI
    if (midiStore.midiInfo?.duration) {
      totalDuration.value = midiStore.midiInfo.duration
      // console.log('📏 Durée initialisée:', totalDuration.value)
    }
    
    // Watcher pour mise à jour de la durée
    watch(() => midiStore.midiInfo?.duration, (newDuration) => {
      if (newDuration && newDuration > 0 && newDuration !== totalDuration.value) {
        totalDuration.value = newDuration
        // console.log('📏 Durée mise à jour:', newDuration)
      }
    }, { immediate: true })
  })

  // ============ LARGEUR TOTALE AVEC FALLBACKS ROBUSTES ============
  const totalWidthValue = computed(() => {
    let width = 0
    let source = 'unknown'
    
    // 0. Valeur du composable timeSignature (prioritaire)
    if (timeSignatureTotalWidth?.value && timeSignatureTotalWidth.value > 0) {
      width = timeSignatureTotalWidth.value
      source = 'timeSignature-composable'
    }
    // 1. Valeur injectée (ref)
    else if (injectedTotalWidth?.value && injectedTotalWidth.value > 0) {
      width = injectedTotalWidth.value
      source = 'injected-ref'
    }
    // 2. Valeur injectée directe
    else if (typeof injectedTotalWidth === 'number' && injectedTotalWidth > 0) {
      width = injectedTotalWidth
      source = 'injected-direct'
    }
    // 3. Calcul basé sur la durée avec pixels par seconde par défaut
    else if (totalDuration.value > 0) {
      const pixelsPerSecond = 100 // Valeur par défaut augmentée pour meilleure visibilité
      width = totalDuration.value * pixelsPerSecond
      source = 'calculated'
    }
    // 4. Fallback depuis le store MIDI
    else if (midiStore.midiInfo?.duration && midiStore.midiInfo.duration > 0) {
      width = midiStore.midiInfo.duration * 100
      source = 'midi-store'
    }
    // 5. Fallback minimal
    else {
      width = 2000
      source = 'fallback'
    }
    
    console.log('📏 TotalWidth calculé:', width, 'px (source:', source + ')')
    return width
  })

  // ============ FONCTION DE CONVERSION TEMPS->PIXEL ROBUSTE ============
  const timeToPixelFunction = computed(() => {
    // 1. Fonction injectée
    if (injectedTimeToPixel && typeof injectedTimeToPixel === 'function') {
      return injectedTimeToPixel
    }
    
    // 2. Fonction dans une ref
    if (injectedTimeToPixel?.value && typeof injectedTimeToPixel.value === 'function') {
      return injectedTimeToPixel.value
    }
    
    // 3. Fonction par défaut TOUJOURS DISPONIBLE
    return createDefaultConverter()
  })

  // ============ FONCTION DE CONVERSION SIMPLIFIÉE ============
  function createDefaultConverter() {
    return (timeInSeconds) => {
      if (!timeInSeconds || timeInSeconds < 0) return 0
      
      const totalWidth = totalWidthValue.value
      const duration = totalDuration.value || 1
      
      if (!totalWidth || totalWidth <= 0 || !duration || duration <= 0) {
        return 0
      }
      
      // Conversion linéaire simple
      return (timeInSeconds / duration) * totalWidth
    }
  }

  // ============ POSITION DU CURSEUR ============
  const pixelPosition = computed(() => {
    try {
      const timeValue = currentTime.value || 0
      
      if (timeValue < 0) {
        return 0
      }
      
      // CORRECTION: Utiliser TOUJOURS timeToPixelsWithSignatures en priorité
      // pour être cohérent avec TimeLine
      if (typeof timeToPixelsWithSignatures === 'function') {
        // Compensation de latence: seulement si temps > 0 ET en cours de lecture
        let adjustedTime = timeValue
        if (timeValue > 0 && internalTimer.value !== null) {
          adjustedTime = timeValue + cursorConfig.value.latencyCompensation
        }
        
        const position = timeToPixelsWithSignatures(adjustedTime)
        
        // Debug moins verbeux MAIS plus d'infos sur les calculs
        if (Math.floor(timeValue * 5) % 10 === 0) { // Log tous les 2s
          console.log('🎯 Position (signatures):', {
            time: timeValue.toFixed(2) + 's',
            pixels: position.toFixed(1) + 'px',
            totalWidth: totalWidthValue.value,
            ratio: (position / totalWidthValue.value * 100).toFixed(1) + '%'
          })
        }
        
        return Math.max(0, position)
      }
      
      // Fallback: Utiliser timeToPixels simple si timeToPixelsWithSignatures n'est pas disponible
      if (typeof timeToPixels === 'function') {
        const position = timeToPixels(timeValue)
        
        console.log('🎯 Position via timeToPixels (fallback):', timeValue.toFixed(2) + 's →', position.toFixed(1) + 'px')
        
        return Math.max(0, position)
      }
      
      // Utiliser la fonction injectée si disponible (prend en compte les signatures temporelles)
      console.log('🔍 Test injection:', {
        hasInjection: !!injectedTimeToPixel,
        hasValue: !!injectedTimeToPixel?.value,
        valueType: typeof injectedTimeToPixel?.value,
        isFunction: typeof injectedTimeToPixel?.value === 'function'
      })
      
      if (injectedTimeToPixel && typeof injectedTimeToPixel.value === 'function') {
        const position = injectedTimeToPixel.value(timeValue)
        console.log('🎯 Position via injection:', timeValue.toFixed(2) + 's →', position.toFixed(1) + 'px')
        return Math.max(0, position)
      }
      
      // Test direct de l'injection sans .value
      if (injectedTimeToPixel && typeof injectedTimeToPixel === 'function') {
        const position = injectedTimeToPixel(timeValue)
        console.log('🎯 Position via injection directe:', timeValue.toFixed(2) + 's →', position.toFixed(1) + 'px')
        return Math.max(0, position)
      }
      
      // Fallback avec conversion simple
      const durationValue = totalDuration.value || 1
      const widthValue = totalWidthValue.value
      
      if (durationValue <= 0 || widthValue <= 0) {
        return 0
      }
      
      const position = (timeValue / durationValue) * widthValue
      console.log('🎯 Position via fallback:', timeValue.toFixed(2) + 's →', position.toFixed(1) + 'px')
      return Math.max(0, position)
    } catch (error) {
      console.error('❌ Erreur calcul position curseur:', error)
      return 0
    }
  })

  // ============ VISIBILITÉ DU CURSEUR ============
  const shouldShowCursor = computed(() => {
    const hasTime = currentTime.value >= 0
    const hasDuration = totalDuration.value > 0
    const hasWidth = totalWidthValue.value > 0
    const hasPosition = pixelPosition.value >= 0
    
    const shouldShow = hasTime && hasDuration && hasWidth && hasPosition
    
    // Debug périodique de la visibilité
    if (Math.floor(Date.now() / 1000) % 5 === 0) { // Log toutes les 5 secondes
      console.log('👁️ Visibilité curseur:', {
        shouldShow,
        hasTime,
        hasDuration,
        hasWidth,
        hasPosition,
        currentTime: currentTime.value,
        totalDuration: totalDuration.value,
        totalWidth: totalWidthValue.value,
        pixelPos: pixelPosition.value
      })
    }
    
    return shouldShow
  })

  // ============ TIMER INTERNE POUR LE DÉFILEMENT ============
  function startInternalTimer() {
    console.log('🔥 startInternalTimer appelé - isPlaying:', isPlaying.value)
    
    if (internalTimer.value) {
      console.log('⚠️ Timer déjà actif, arrêt du précédent')
      clearInterval(internalTimer.value)
    }
    
    timerStartTime.value = performance.now()
    timerStartMusicTime.value = currentTime.value
    lastUpdateTime.value = performance.now()
    
    console.log('⏰ Démarrage timer interne à', currentTime.value.toFixed(2) + 's')
    console.log('📊 Paramètres:', {
      totalDuration: totalDuration.value,
      startTime: timerStartMusicTime.value,
      isPlaying: isPlaying.value
    })
    
    internalTimer.value = setInterval(() => {
      if (!isPlaying.value) {
        console.log('⏸️ Timer en pause, isPlaying=false')
        return
      }
      
      const now = performance.now()
      const realTimeElapsed = (now - timerStartTime.value) / 1000
      const newMusicTime = timerStartMusicTime.value + realTimeElapsed
      
      // Log du premier tick
      if (Math.abs(newMusicTime - timerStartMusicTime.value) < 0.1) {
        console.log('✅ Premier tick du timer - newMusicTime:', newMusicTime.toFixed(2))
      }
      
      // Vérifier qu'on ne dépasse pas la durée totale
      if (newMusicTime <= totalDuration.value) {
        currentTime.value = newMusicTime
        lastUpdateTime.value = now
        
        // Debug plus détaillé pour diagnostiquer les sauts
        const timeDiff = newMusicTime - timerStartMusicTime.value
        if (timeDiff > 0.1 && Math.floor(newMusicTime * 20) % 4 === 0) { // Log fréquent au début
          console.log('🎯 CURSEUR DÉFILE:', {
            musicTime: newMusicTime.toFixed(3) + 's',
            realTime: realTimeElapsed.toFixed(3) + 's',
            pixelPos: pixelPosition.value.toFixed(1) + 'px',
            diff: timeDiff.toFixed(3) + 's'
          })
        }
      } else {
        // Fin de morceau - utiliser stopAtEnd pour garder la position
        currentTime.value = totalDuration.value
        stopAtEnd()
        console.log('🔚 Fin de morceau atteinte par le curseur')
      }
    }, 16) // ~60fps - équilibré entre fluidité et performance
  }

  function stopInternalTimer() {
    if (internalTimer.value) {
      clearInterval(internalTimer.value)
      internalTimer.value = null
      console.log('⏹️ Timer interne arrêté')
    }
  }

  // ============ SYNCHRONISATION AVEC LE LECTEUR ============
  function syncWithPlayer(playerTime, skipRecalculation = false) {
    console.log('🔗 Sync curseur avec lecteur:', playerTime.toFixed(2) + 's', skipRecalculation ? '(skip recalc)' : '')
    
    if (!skipRecalculation) {
      // DEBUG: position AVANT et APRÈS la mise à jour du temps
      const positionBefore = pixelPosition.value
      
      // Mise à jour immédiate du temps
      currentTime.value = playerTime
      isSyncedWithPlayer.value = true
      
      // DEBUG: position APRÈS la mise à jour
      const positionAfter = pixelPosition.value
      if (Math.abs(positionAfter - positionBefore) > 10) {
        console.log('⚠️ RECALCUL SUSPECT:', {
          time: playerTime.toFixed(2) + 's',
          positionBefore: positionBefore.toFixed(1) + 'px',
          positionAfter: positionAfter.toFixed(1) + 'px',
          difference: (positionAfter - positionBefore).toFixed(1) + 'px',
          totalWidth: totalWidthValue.value
        })
      }
    } else {
      // Synchronisation simple sans recalcul de position
      currentTime.value = playerTime
      isSyncedWithPlayer.value = true
      console.log('🔄 Sync sans recalcul:', playerTime.toFixed(3) + 's')
    }
    
    // Redémarrer le timer interne avec le nouveau temps
    if (isPlaying.value) {
      startInternalTimer()
    }
  }

  function unsyncFromPlayer() {
    if (isSyncedWithPlayer.value) {
      isSyncedWithPlayer.value = false
      console.log('🔓 Désynchronisation du lecteur')
    }
    
    // NE PAS arrêter le timer interne ici - il continue de façon autonome
  }

  // ============ GESTION DES TEMPOS ============
  function getTempoAtTime(time) {
    const tempoEvents = midiStore.tempoEvents || []
    
    console.log('🎵 getTempoAtTime appelé:', {
      time: time.toFixed(2) + 's',
      tempoEventsCount: tempoEvents.length,
      tempoEvents: tempoEvents.slice(0, 3) // Afficher les 3 premiers
    })
    
    if (tempoEvents.length === 0) {
      const defaultTempo = midiStore.midiInfo?.tempo || 120
      console.log('🎵 Aucun événement tempo, utilisation par défaut:', defaultTempo)
      return defaultTempo
    }
    
    let tempo = midiStore.midiInfo?.tempo || 120
    let activeEvent = null
    
    for (const tempoEvent of tempoEvents) {
      if (tempoEvent.time <= time) {
        tempo = tempoEvent.bpm
        activeEvent = tempoEvent
      } else {
        break
      }
    }
    
    if (activeEvent) {
      console.log('🎵 Tempo trouvé:', tempo, 'BPM à', activeEvent.time + 's')
    }
    
    return tempo
  }

  // Mise à jour automatique du tempo selon le temps actuel
  watch(currentTime, (newTime) => {
    const newTempo = getTempoAtTime(newTime)
    if (Math.abs(currentTempo.value - newTempo) > 0.1) {
      currentTempo.value = newTempo
    }
  })

  // ============ CONTRÔLES DE LECTURE ============
  function startPlayback() {
    console.log('🚀 startPlayback appelé - État actuel:', {
      isPlaying: isPlaying.value,
      isPaused: isPaused.value,
      currentTime: currentTime.value,
      totalDuration: totalDuration.value
    })
    
    if (!isPlaying.value) {
      isPlaying.value = true
      isPaused.value = false
      startInternalTimer()
      console.log('▶️ Lecture démarrée par curseur - isPlaying maintenant:', isPlaying.value)
    } else {
      console.log('⚠️ startPlayback appelé mais déjà en cours de lecture')
    }
  }

  function pausePlayback() {
    if (isPlaying.value) {
      isPlaying.value = false
      isPaused.value = true
      stopInternalTimer()
      console.log('⏸️ Lecture mise en pause par curseur')
    }
  }

  function stopPlayback() {
    isPlaying.value = false
    isPaused.value = false
    currentTime.value = 0
    stopInternalTimer()
    console.log('⏹️ Lecture arrêtée par curseur')
  }

  // Stop en fin de morceau - garde la position finale
  function stopAtEnd() {
    isPlaying.value = false
    isPaused.value = false
    // NE PAS remettre currentTime.value = 0 - garder la position finale
    stopInternalTimer()
    console.log('🏁 Fin de morceau - position gardée à', currentTime.value.toFixed(2) + 's')
  }

  function seekTo(time) {
    const clampedTime = Math.max(0, Math.min(totalDuration.value, time))
    currentTime.value = clampedTime
    
    // Redémarrer le timer si en cours de lecture
    if (isPlaying.value) {
      startInternalTimer()
    }
    
    console.log('🎯 Seek vers:', clampedTime.toFixed(2) + 's')
  }

  // ============ STYLES CALCULÉS ============
  const cursorStyle = computed(() => {
    const style = {
      position: 'absolute',
      left: `${pixelPosition.value}px`,
      top: '0px',
      height: '100%',
      width: `${cursorConfig.value.cursorWidth}px`,
      zIndex: cursorConfig.value.zIndex,
      pointerEvents: 'none',
      transition: getTransition(),
      transform: `translateX(-${Math.floor(cursorConfig.value.cursorWidth / 2)}px)`,
      opacity: shouldShowCursor.value ? 1 : 0,
      visibility: shouldShowCursor.value ? 'visible' : 'hidden'
    }
    
    // Log périodique du style pour diagnostic
    if (Math.floor(Date.now() / 1000) % 3 === 0) { // Log toutes les 3 secondes
      console.log('🎨 Style curseur:', {
        left: style.left,
        opacity: style.opacity,
        visibility: style.visibility,
        zIndex: style.zIndex,
        shouldShow: shouldShowCursor.value
      })
    }
    
    return style
  })

  const lineStyle = computed(() => ({
    width: '100%',
    height: '100%',
    background: cursorConfig.value.cursorColor,
    opacity: cursorConfig.value.cursorOpacity,
    borderRadius: `${cursorConfig.value.cursorWidth / 2}px`,
    boxShadow: getBoxShadow()
  }))

  const headStyle = computed(() => ({
    position: 'absolute',
    top: '0px',
    left: '50%',
    width: `${cursorConfig.value.headSize}px`,
    height: `${cursorConfig.value.headSize}px`,
    background: cursorConfig.value.headColor || cursorConfig.value.cursorColor,
    borderRadius: '50%',
    transform: 'translateX(-50%)',
    opacity: cursorConfig.value.cursorOpacity,
    border: '2px solid rgba(255, 255, 255, 0.8)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
  }))

  function getTransition() {
    if (!cursorConfig.value.smoothAnimation) return 'none'
    
    if (isPlaying.value) {
      return `left ${cursorConfig.value.animationDuration} linear`
    }
    
    return 'left 0.1s ease-out'
  }

  function getBoxShadow() {
    if (isPlaying.value) {
      const glowSize = cursorConfig.value.cursorWidth * 2
      return `0 0 ${glowSize}px ${cursorConfig.value.cursorColor}`
    }
    
    return '0 0 2px rgba(0, 0, 0, 0.3)'
  }

  // ============ CLASSES CSS ============
  const cursorClasses = computed(() => [
    'playback-cursor',
    {
      'playing': isPlaying.value,
      'paused': isPaused.value,
      'stopped': !isPlaying.value && !isPaused.value,
      'synced': isSyncedWithPlayer.value,
      'tempo-aware': (midiStore.tempoEvents || []).length > 0
    }
  ])

  // ============ TEMPS FORMATÉ ============
  const formattedTime = computed(() => {
    const mins = Math.floor(currentTime.value / 60)
    const secs = Math.floor(currentTime.value % 60)
    const ms = Math.floor((currentTime.value % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  })

  // ============ SUIVI DU CURSEUR (SCROLL) ============
  function calculateScrollOffset(containerWidth, currentScrollLeft, padding = null) {
    const usedPadding = padding || cursorConfig.value.followPadding
    const leftBound = currentScrollLeft + usedPadding
    const rightBound = currentScrollLeft + containerWidth - usedPadding

    if (pixelPosition.value < leftBound) {
      return Math.max(0, pixelPosition.value - usedPadding)
    } else if (pixelPosition.value > rightBound) {
      return pixelPosition.value - containerWidth + usedPadding
    }

    return currentScrollLeft
  }

  // ============ CONFIGURATION ============
  function updateConfig(newConfig) {
    cursorConfig.value = { ...cursorConfig.value, ...newConfig }
  }

  function resetConfig() {
    cursorConfig.value = {
      cursorColor: '#ff4444',
      cursorWidth: 2,
      cursorOpacity: 0.8,
      headSize: 8,
      headColor: null,
      showHead: true,
      showTimeIndicator: false,
      animationDuration: '0.05s',
      zIndex: 100,
      followCursor: true,
      followPadding: 50,
      smoothAnimation: true,
      latencyCompensation: 0.050
    }
  }

  // Ajustement de la compensation de latence
  function setLatencyCompensation(milliseconds) {
    cursorConfig.value.latencyCompensation = milliseconds / 1000
    console.log('🔧 Compensation latence:', milliseconds + 'ms')
  }

  // ============ CRÉATION D'UN CONVERTISSEUR TEMPS->PIXEL ============
  function createTimeToPixelConverter(duration, width) {
    return (timeInSeconds) => {
      if (!timeInSeconds || timeInSeconds < 0 || !duration || duration <= 0 || !width) return 0
      return (timeInSeconds / duration) * width
    }
  }

  // ============ NETTOYAGE ============
  onUnmounted(() => {
    stopInternalTimer()
    console.log('🧹 PlaybackCursor démonté')
  })

  // ============ DEBUG ============
  const debugInfo = computed(() => ({
    currentTime: currentTime.value,
    pixelPosition: pixelPosition.value,
    totalWidth: totalWidthValue.value,
    totalDuration: totalDuration.value,
    currentTempo: currentTempo.value,
    isSynced: isSyncedWithPlayer.value,
    shouldShow: shouldShowCursor.value,
    isPlaying: isPlaying.value,
    hasInternalTimer: !!internalTimer.value,
    tempoEventsCount: (midiStore.tempoEvents || []).length,
    hasTimeToPixel: !!timeToPixelFunction.value,
    midiLoaded: midiStore.isLoaded
  }))

  return {
    // État
    currentTime,
    totalDuration,
    isPlaying,
    isPaused,
    currentTempo,
    
    // Position et visibilité
    pixelPosition,
    shouldShowCursor,
    
    // Styles
    cursorStyle,
    lineStyle,
    headStyle,
    cursorClasses,
    
    // Temps formaté
    formattedTime,
    
    // Synchronisation
    syncWithPlayer,
    unsyncFromPlayer,
    isSyncedWithPlayer,
    
    // Contrôles directs
    startPlayback,
    pausePlayback,
    stopPlayback,
    stopAtEnd,
    seekTo,
    
    // Utilitaires
    calculateScrollOffset,
    getTempoAtTime,
    createTimeToPixelConverter,
    
    // Configuration
    cursorConfig,
    updateConfig,
    resetConfig,
    setLatencyCompensation,
    
    // Debug
    debugInfo,
    
    // Valeurs calculées
    totalWidthValue,
    timeToPixelFunction
  }
}