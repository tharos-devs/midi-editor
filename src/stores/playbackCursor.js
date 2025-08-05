// stores/playbackCursor.js - Store global pour le curseur de lecture
import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useMidiStore } from './midi'
import { useUIStore } from './ui'
import { useTimeSignature } from '@/composables/useTimeSignature'

export const usePlaybackCursorStore = defineStore('playbackCursor', () => {
  const midiStore = useMidiStore()
  const uiStore = useUIStore()
  const { timeToPixelsWithSignatures } = useTimeSignature()

  // État global du curseur
  const currentTime = ref(0)
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const totalDuration = ref(0)
  
  // Timer interne
  let internalTimer = null
  let timerStartTime = 0
  let timerStartMusicTime = 0

  // Configuration
  const config = ref({
    latencyCompensation: 0.050 // 50ms
  })

  // Position en pixels calculée
  const pixelPosition = computed(() => {
    if (!timeToPixelsWithSignatures || currentTime.value <= 0) return 0
    
    // Compensation de latence seulement pendant la lecture (soustraire la latence)
    const adjustedTime = (isPlaying.value && currentTime.value > 0) 
      ? currentTime.value - config.value.latencyCompensation 
      : currentTime.value
    
    return Math.max(0, timeToPixelsWithSignatures(adjustedTime))
  })

  // Démarrer le curseur
  function startPlayback() {
    if (isPlaying.value) return
    
    console.log('🚀 STORE: Démarrage curseur global')
    isPlaying.value = true
    isPaused.value = false
    
    startTimer()
  }

  // Arrêter le curseur
  function pausePlayback() {
    if (!isPlaying.value) return
    
    console.log('⏸️ STORE: Pause curseur global')
    isPlaying.value = false
    isPaused.value = true
    
    stopTimer()
  }

  // Stop complet
  function stopPlayback() {
    console.log('⏹️ STORE: Stop curseur global')
    console.trace('⚠️ STACK TRACE - qui appelle stopPlayback ?')
    isPlaying.value = false
    isPaused.value = false
    currentTime.value = 0
    
    stopTimer()
  }

  // Stop en fin de morceau (garde la position)
  function stopAtEnd() {
    const finalPosition = currentTime.value
    console.log('🏁 STORE: Fin de morceau - arrêt sans reset à', finalPosition.toFixed(2) + 's')
    isPlaying.value = false
    isPaused.value = false
    // NE PAS remettre currentTime.value = 0
    
    stopTimer()
    
    // Vérification que la position reste intacte
    setTimeout(() => {
      if (currentTime.value !== finalPosition) {
        console.warn('⚠️ POSITION CHANGÉE APRÈS stopAtEnd!', {
          avant: finalPosition.toFixed(2) + 's',
          après: currentTime.value.toFixed(2) + 's'
        })
      } else {
        console.log('✅ Position maintenue après stopAtEnd:', currentTime.value.toFixed(2) + 's')
      }
    }, 100)
  }

  // Seek
  function seekTo(time, fromTimelineClick = false) {
    // S'assurer que la durée totale est à jour - CORRECTION: utiliser la vraie durée
    const { getLastMidiEventTime } = useTimeSignature()
    const realDuration = getLastMidiEventTime?.value || midiStore.getTotalDuration
    
    if (realDuration && realDuration > 0) {
      totalDuration.value = realDuration
    }
    
    // CORRECTION: Ne pas limiter le temps lors du seek manuel
    // Laisser l'utilisateur positionner le curseur où il veut sur la timeline
    const clampedTime = Math.max(0, time) // Seulement >= 0, pas de limite max
    currentTime.value = clampedTime
    
    // Debug: totalWidth utilisé par le store au moment du seek
    const { totalWidth: timeSignatureTotalWidth } = useTimeSignature()
    console.log(`🎯 Seek${fromTimelineClick ? ' (Timeline Click)' : ''}: ${clampedTime.toFixed(6)}s → ${pixelPosition.value.toFixed(1)}px`, {
      storeTotalWidth: timeSignatureTotalWidth?.value || 'undefined',
      pixelPos: pixelPosition.value.toFixed(1),
      tempsOriginal: time.toFixed(6) + 's',
      durée: totalDuration.value?.toFixed(6) + 's',
      limité: time > (totalDuration.value || 0) ? '⚠️ NON LIMITÉ' : '✅ DANS LIMITES',
      source: fromTimelineClick ? 'TIMELINE_CLICK' : 'PLAYER_SEEK'
    })
    
    // CORRECTION: Déclencher l'auto-scroll SEULEMENT si le curseur est hors de la zone visible
    // après un seek manuel pour s'assurer qu'il reste visible
    setTimeout(() => {
      const scrollController = document.querySelector('.scroll-controller')
      const timelineScroll = document.querySelector('.timeline-scroll')
      const referenceElement = scrollController || timelineScroll
      
      if (referenceElement) {
        const containerWidth = referenceElement.clientWidth
        const currentScrollLeft = referenceElement.scrollLeft
        const cursorPos = pixelPosition.value
        
        const leftBound = currentScrollLeft
        const rightBound = currentScrollLeft + containerWidth
        const isVisible = cursorPos >= leftBound && cursorPos <= rightBound
        
        console.log('🔍 Vérification visibilité curseur:', {
          curseur: cursorPos.toFixed(1) + 'px',
          scroll: currentScrollLeft.toFixed(1) + 'px',
          zoneVisible: leftBound.toFixed(1) + '-' + rightBound.toFixed(1) + 'px',
          visible: isVisible ? '✅ VISIBLE' : '❌ HORS ÉCRAN'
        })
        
        if (!isVisible) {
          // Calculer les limites de scroll possibles
          const maxScrollLeft = Math.max(0, 2640 - containerWidth) // Timeline 2640px - largeur écran
          const idealScrollLeft = Math.max(0, cursorPos - containerWidth / 2) // Curseur au centre
          const newScrollLeft = Math.min(idealScrollLeft, maxScrollLeft) // Ne pas dépasser le max
          
          console.log('🔧 Ajustement scroll pour visibilité:', {
            idéal: idealScrollLeft.toFixed(1) + 'px',
            maximum: maxScrollLeft.toFixed(1) + 'px',
            appliqué: newScrollLeft.toFixed(1) + 'px'
          })
          
          // Forcer le scroll sur TOUS les éléments synchronisés
          const scrollController = document.querySelector('.scroll-controller')
          if (scrollController) {
            scrollController.scrollLeft = newScrollLeft
            console.log('✅ Scroll appliqué sur ScrollController')
          }
          
          document.querySelectorAll('.sync-scroll-x').forEach((element, index) => {
            element.scrollLeft = newScrollLeft
            console.log(`✅ Scroll appliqué sur élément ${index}: ${element.className}`)
          })
          
          // Vérification après application
          setTimeout(() => {
            const finalScrollLeft = referenceElement.scrollLeft
            const finalRightBound = finalScrollLeft + containerWidth
            const finalVisible = cursorPos >= finalScrollLeft && cursorPos <= finalRightBound
            
            console.log('🔍 Vérification finale:', {
              scrollDemandé: newScrollLeft.toFixed(1) + 'px',
              scrollObtenu: finalScrollLeft.toFixed(1) + 'px',
              différence: (newScrollLeft - finalScrollLeft).toFixed(1) + 'px',
              curseurMaintenant: finalVisible ? '✅ VISIBLE' : '❌ TOUJOURS HORS ÉCRAN',
              zoneFinale: finalScrollLeft.toFixed(1) + '-' + finalRightBound.toFixed(1) + 'px',
              curseurPos: cursorPos.toFixed(1) + 'px'
            })
            
            // CORRECTION ULTIME: Si le curseur est encore invisible après scroll max,
            // c'est qu'il est à la toute fin. Reculer le curseur légèrement.
            if (!finalVisible && cursorPos >= 2640 - 10) { // Si très proche de la fin
              console.log('🔧 CORRECTION ULTIME: Curseur trop proche de la fin, ajustement visuel')
              // Reculer le curseur de quelques pixels pour qu'il soit visible
              const adjustedPosition = Math.max(0, finalRightBound - 20) // 20px avant le bord droit
              console.log('📍 Position ajustée:', adjustedPosition.toFixed(1) + 'px')
              
              // Pas idéal mais nécessaire pour la visibilité
              // TODO: Améliorer l'UX en ajustant la largeur de la timeline
            }
          }, 50)
        }
      }
    }, 100)
    
    if (isPlaying.value) {
      startTimer() // Redémarrer le timer avec le nouveau temps
    }
  }
  
  // Fonction pour déclencher l'auto-scroll vers la position du curseur
  function triggerAutoScroll() {
    // CORRECTION: Désactiver complètement l'auto-scroll lors des clics manuels
    // L'auto-scroll ne devrait se déclencher que pendant la lecture automatique
    if (!isPlaying.value) {
      console.log(`📍 Auto-scroll ignoré: pas en lecture (seek manuel)`)
      return
    }
    
    const cursorPixelPos = pixelPosition.value
    
    // CORRECTION: Utiliser le ScrollController comme référence principale
    const scrollController = document.querySelector('.scroll-controller')
    const firstElement = document.querySelector('.sync-scroll-x')
    
    // Priorité au ScrollController pour la position de scroll
    const referenceElement = scrollController || firstElement
    
    if (!referenceElement) {
      console.warn('Aucun élément de référence trouvé pour l\'auto-scroll')
      return
    }
    
    const containerWidth = referenceElement.clientWidth
    const currentScrollLeft = referenceElement.scrollLeft
    
    // Calculer les limites de la zone visible avec padding
    const padding = 100
    const leftBound = currentScrollLeft + padding
    const rightBound = currentScrollLeft + containerWidth - padding
    
    // Vérifier si le curseur est hors de la zone visible
    if (cursorPixelPos < leftBound || cursorPixelPos > rightBound) {
      // Positionner le curseur à 30% de la zone visible (plus de marge à droite)
      const cursorOffsetFromLeft = containerWidth * 0.3
      const newScrollLeft = Math.max(0, cursorPixelPos - cursorOffsetFromLeft)
      
      console.log(`📍 Auto-scroll: ${currentScrollLeft.toFixed(0)}px → ${newScrollLeft.toFixed(0)}px (curseur: ${cursorPixelPos.toFixed(0)}px, largeur: ${containerWidth}px)`)
      
      // Approche plus directe: forcer le scroll sur TOUS les éléments immédiatement
      document.querySelectorAll('.sync-scroll-x').forEach(element => {
        element.scrollLeft = newScrollLeft
        console.log(`🔧 Scroll forcé sur ${element.className}: ${newScrollLeft}px`)
      })
      
      // Forcer aussi le ScrollController
      const scrollController = document.querySelector('.scroll-controller')
      if (scrollController) {
        scrollController.scrollLeft = newScrollLeft
        console.log(`🔧 Scroll forcé sur ScrollController: ${newScrollLeft}px`)
      }
      
      console.log(`📍 Auto-scroll appliqué: curseur à ${cursorPixelPos.toFixed(0)}px, nouveau scroll: ${newScrollLeft.toFixed(0)}px`)
    } else {
      console.log(`📍 Curseur visible (${cursorPixelPos.toFixed(0)}px dans zone ${leftBound.toFixed(0)}-${rightBound.toFixed(0)}px)`)
    }
  }

  // Timer interne
  function startTimer() {
    if (internalTimer) clearInterval(internalTimer)
    
    timerStartTime = performance.now()
    timerStartMusicTime = currentTime.value
    
    internalTimer = setInterval(() => {
      if (!isPlaying.value) return
      
      const now = performance.now()
      const realTimeElapsed = (now - timerStartTime) / 1000
      const newMusicTime = timerStartMusicTime + realTimeElapsed
      
      if (newMusicTime <= totalDuration.value) {
        currentTime.value = newMusicTime
        
        // Debug périodique
        if (Math.floor(newMusicTime * 10) % 20 === 0) {
          console.log('🎯 CURSEUR GLOBAL:', {
            temps: newMusicTime.toFixed(2) + 's',
            pixels: pixelPosition.value.toFixed(1) + 'px'
          })
        }
      } else {
        // Fin de morceau
        currentTime.value = totalDuration.value
        stopAtEnd()
      }
    }, 16) // 60fps
  }

  function stopTimer() {
    if (internalTimer) {
      clearInterval(internalTimer)
      internalTimer = null
    }
  }

  // Initialisation
  function initialize() {
    // CORRECTION: Utiliser la vraie durée qui inclut TOUS les événements MIDI
    const { getLastMidiEventTime } = useTimeSignature()
    totalDuration.value = getLastMidiEventTime?.value || midiStore.getTotalDuration || 0
    
    // S'assurer que le curseur est visible même après un restart
    // CORRECTION: Ne pas forcer à 0 si le curseur a une position (après stopAtEnd)
    if (currentTime.value === 0 && !isPlaying.value) {
      // Force la réactivité de la position seulement si vraiment à 0
      const originalTime = currentTime.value
      currentTime.value = 0.001
      setTimeout(() => {
        // Vérifier si le temps n'a pas changé entre temps (par exemple par stopAtEnd)
        if (currentTime.value === 0.001) {
          currentTime.value = originalTime // Garder la position originale
        }
      }, 10)
    }
    
    console.log('🎯 STORE: Curseur initialisé - durée:', totalDuration.value + 's', 'position:', currentTime.value.toFixed(2) + 's')
  }

  // Watcher pour debug pixelPosition (logs réduits)
  watch(() => pixelPosition.value, (newPos, oldPos) => {
    // Log seulement pour les changements significatifs
    if (Math.abs(newPos - (oldPos || 0)) > 1) {
      console.log('📍 Curseur: ' + newPos?.toFixed(1) + 'px (' + currentTime.value.toFixed(2) + 's)')
    }
  })

  return {
    // État
    currentTime,
    isPlaying,
    isPaused,
    totalDuration,
    pixelPosition,
    config,
    
    // Actions
    startPlayback,
    pausePlayback,
    stopPlayback,
    stopAtEnd,
    seekTo,
    initialize
  }
})