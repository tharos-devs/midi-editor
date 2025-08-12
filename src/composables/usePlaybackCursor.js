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
  
  // CACHE PERFORMANCE pour timeToPixelsWithSignatures
  const positionCache = ref(new Map())
  const lastCacheClean = ref(0)
  
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
    // 3. Calcul basé sur la durée avec pixels par seconde AVEC ZOOM
    else if (totalDuration.value > 0) {
      const basePixelsPerSecond = 100
      const zoomFactor = uiStore.horizontalZoom || 1
      const pixelsPerSecond = basePixelsPerSecond * zoomFactor
      width = totalDuration.value * pixelsPerSecond
      source = 'calculated-with-zoom'
    }
    // 4. Fallback depuis le store MIDI AVEC ZOOM
    else if (midiStore.midiInfo?.duration && midiStore.midiInfo.duration > 0) {
      const zoomFactor = uiStore.horizontalZoom || 1
      width = midiStore.midiInfo.duration * 100 * zoomFactor
      source = 'midi-store-with-zoom'
    }
    // 5. Fallback minimal
    else {
      width = 2000
      source = 'fallback'
    }
    
    // Debug occasionnel
    if (Math.floor(Date.now() / 1000) % 30 === 0) {
      console.log('📏 TotalWidth:', width, 'px')
    }
    return width
  })

  // ============ FONCTION DE CONVERSION TEMPS->PIXEL PASSIVE ============
  const timeToPixelFunction = computed(() => {
    // PRIORITÉ: Fonction injectée qui a la logique métier (tempo, signatures)
    if (injectedTimeToPixel && typeof injectedTimeToPixel === 'function') {
      return injectedTimeToPixel
    }
    
    if (injectedTimeToPixel?.value && typeof injectedTimeToPixel.value === 'function') {
      return injectedTimeToPixel.value
    }
    
    // Fallback simple SANS logique métier - juste conversion linéaire
    return createDefaultConverter()
  })

  // ============ FONCTION DE CONVERSION AVEC ZOOM ============
  function createDefaultConverter() {
    return (timeInSeconds) => {
      if (!timeInSeconds || timeInSeconds < 0) return 0
      
      const totalWidth = totalWidthValue.value
      const duration = totalDuration.value || 1
      
      if (!totalWidth || totalWidth <= 0 || !duration || duration <= 0) {
        return 0
      }
      
      // Conversion linéaire qui prend en compte le zoom via totalWidth
      return (timeInSeconds / duration) * totalWidth
    }
  }

  // ============ POSITION DU CURSEUR ============  
  const pixelPosition = computed(() => {
    try {
      const timeValue = currentTime.value || 0
      
      // Debug pour comprendre pourquoi les fonctions de conversion ne sont pas appelées
      if (Math.floor(timeValue * 10) % 50 === 0 && timeValue > 0) { // Log fréquent pour diagnostic
        console.log('🔍 CURSEUR pixelPosition appelé:', timeValue.toFixed(2) + 's')
      }
      
      if (timeValue < 0) {
        return 0
      }
      
      // CURSEUR 100% PASSIF - utilise les fonctions métier existantes
      
      // 1. PRIORITÉ: timeToPixelsWithSignatures avec CACHE DE PERFORMANCE
      if (typeof timeToPixelsWithSignatures === 'function') {
        // Cache avec précision de 0.01s pour éviter les calculs répétés
        const cacheKey = Math.round(timeValue * 100) / 100
        
        if (positionCache.value.has(cacheKey)) {
          return Math.max(0, positionCache.value.get(cacheKey))
        }
        
        const perfStart = performance.now()
        const position = timeToPixelsWithSignatures(timeValue)
        const perfEnd = performance.now()
        const duration = perfEnd - perfStart
        
        // Stocker dans le cache
        positionCache.value.set(cacheKey, position)
        
        // Nettoyer le cache périodiquement pour éviter la fuite mémoire
        const now = Date.now()
        if (now - lastCacheClean.value > 5000) { // Toutes les 5s
          if (positionCache.value.size > 1000) {
            positionCache.value.clear()
            console.log('🧹 CURSEUR: Cache position nettoyé')
          }
          lastCacheClean.value = now
        }
        
        // Debug des performances
        if (duration > 1) {
          console.warn(`⚡ PERF CURSEUR timeToPixels: ${duration.toFixed(1)}ms pour ${timeValue.toFixed(2)}s`)
        }
        
        // Debug occasionnel pour vérifier quelle fonction est utilisée
        if (Math.floor(timeValue * 10) % 200 === 0 && timeValue > 0) {
          console.log(`✅ CURSEUR: ${timeValue.toFixed(2)}s → ${position.toFixed(1)}px (cache:${positionCache.value.size})`)
        }
        
        return Math.max(0, position)
      }
      
      // 2. Fallback: timeToPixels simple
      if (typeof timeToPixels === 'function') {
        const position = timeToPixels(timeValue)
        if (Math.floor(timeValue * 10) % 200 === 0 && timeValue > 0) {
          console.log('⚠️ CURSEUR utilise timeToPixels (fallback):', timeValue.toFixed(2) + 's → ' + position.toFixed(1) + 'px')
        }
        return Math.max(0, position)
      }
      
      // 3. Fonction injectée
      if (injectedTimeToPixel?.value && typeof injectedTimeToPixel.value === 'function') {
        const position = injectedTimeToPixel.value(timeValue)
        if (Math.floor(timeValue * 10) % 200 === 0 && timeValue > 0) {
          console.log('⚠️ CURSEUR utilise injection:', timeValue.toFixed(2) + 's → ' + position.toFixed(1) + 'px')
        }
        return Math.max(0, position)
      }
      
      if (injectedTimeToPixel && typeof injectedTimeToPixel === 'function') {
        const position = injectedTimeToPixel(timeValue)
        if (Math.floor(timeValue * 10) % 200 === 0 && timeValue > 0) {
          console.log('⚠️ CURSEUR utilise injection directe:', timeValue.toFixed(2) + 's → ' + position.toFixed(1) + 'px')
        }
        return Math.max(0, position)
      }
      
      // 4. Fallback linéaire simple (PAS BON - pas de logique métier)
      const durationValue = totalDuration.value || 1
      const widthValue = totalWidthValue.value
      
      if (durationValue <= 0 || widthValue <= 0) {
        return 0
      }
      
      const position = (timeValue / durationValue) * widthValue
      if (Math.floor(timeValue * 10) % 200 === 0 && timeValue > 0) {
        console.log('❌ CURSEUR utilise fallback linéaire (PROBLÈME):', timeValue.toFixed(2) + 's → ' + position.toFixed(1) + 'px')
      }
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
    
    // Debug désactivé
    
    return shouldShow
  })

  // ============ TIMER INTERNE COMPLÈTEMENT SUPPRIMÉ ============
  // Le curseur est maintenant 100% passif et ne calcule jamais son propre temps
  function startInternalTimer() {
    console.log('🚫 startInternalTimer DÉSACTIVÉ - curseur 100% passif')
    // Ne fait plus rien - le curseur suit uniquement les mises à jour de MidiPlayer
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
    // Debug occasionnel uniquement
    if (Math.floor(playerTime * 10) % 100 === 0) {
      console.log('🔗 Sync curseur:', playerTime.toFixed(2) + 's')
    }
    
    if (!skipRecalculation) {
      // Mise à jour immédiate du temps
      currentTime.value = playerTime
      isSyncedWithPlayer.value = true
    } else {
      // Synchronisation simple sans recalcul de position
      currentTime.value = playerTime
      isSyncedWithPlayer.value = true
    }
  }

  function unsyncFromPlayer() {
    if (isSyncedWithPlayer.value) {
      isSyncedWithPlayer.value = false
      console.log('🔓 Désynchronisation du lecteur')
    }
    
    // NE PAS arrêter le timer interne ici - il continue de façon autonome
  }

  // ============ SUPPRIMÉ: GESTION DES TEMPOS ============
  // Le curseur ne calcule plus les tempos - c'est MidiPlayer qui s'en charge
  // Cette fonction est obsolète - MidiPlayer gère l'interpolation et les signatures
  function getTempoAtTime(time) {
    console.warn('⚠️ OBSOLÈTE: getTempoAtTime ne devrait plus être utilisé - utiliser MidiPlayer')
    return 120 // Fallback simple
  }

  // FONCTION SUPPRIMÉE: convertAdjustedTimeToOriginalTime - causait des problèmes de synchronisation

  // FONCTION SUPPRIMÉE: calculateAdjustedTimeForCursor - causait des problèmes de synchronisation

  // SUPPRIMÉ: Mise à jour automatique du tempo - MidiPlayer s'en charge

  // NOUVEAU: Watcher pour les changements de zoom horizontal
  watch(() => uiStore.horizontalZoom, (newZoom, oldZoom) => {
    if (Math.abs(newZoom - oldZoom) > 0.1) {
      // Le zoom a changé, forcer le recalcul de la position
      // Déclencher une re-évaluation de totalWidthValue et pixelPosition
      // qui utiliseront automatiquement le nouveau zoom
      console.log('🔍 Zoom horizontal changé:', oldZoom, '→', newZoom)
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
      
      // Mode suiveur uniquement
      
      // CORRECTION FINALE: TOUJOURS mode suiveur, jamais de timer interne
      console.log('🎵 CURSEUR EN MODE 100% PASSIF - aucun timer interne')
      // Le curseur ne calcule jamais son propre temps - il suit uniquement MidiPlayer
      
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
    
    // CORRECTION FINALE: Jamais de timer interne même après seek
    console.log('🎵 SEEK: Mode 100% passif - pas de timer interne')
    
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
    
    // Debug désactivé
    
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
    timeToPixelFunction,
    
    // NOUVEAU: Accès au timer interne pour le forcer à s'arrêter
    internalTimer,
    stopInternalTimer
  }
}