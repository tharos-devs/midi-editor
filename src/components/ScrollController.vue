<!-- ScrollController.vue - Composant maître pour gérer le scroll horizontal -->
<template>
  <div 
    class="scroll-controller"
    ref="scrollContainer"
    @scroll="handleScroll"
  >
    <!-- Div fantôme pour créer la scrollbar avec la bonne largeur -->
    <div 
      class="scroll-content"
      :style="{ 
        width: totalWidth + 'px', 
        height: '1px',
        minWidth: totalWidth + 'px'
      }"
    />
    
    <!-- Curseur invisible pour l'auto-scroll -->
    <div 
      class="invisible-cursor"
      :style="{ left: cursorPixelPosition + 'px' }"
      ref="invisibleCursor"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

const scrollContainer = ref(null)
const invisibleCursor = ref(null)
const timeSignatureComposable = useTimeSignature()
const cursorStore = usePlaybackCursorStore()

const emit = defineEmits(['scroll-change'])

// Largeur totale basée sur les signatures temporelles
const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

// Position du curseur en pixels depuis le store
const cursorPixelPosition = computed(() => {
  return cursorStore.pixelPosition || 0
})

// Gestion du scroll manuel
function handleScroll(event) {
  const scrollLeft = event.target.scrollLeft
  
  // Émettre l'événement pour synchroniser tous les composants
  emit('scroll-change', {
    scrollLeft,
    source: 'manual'
  })
}

// Auto-scroll continu et fluide pour éviter les saccades
let continuousScrollAnimationId = null
let targetScrollLeft = null
let lastScrollUpdate = 0
const SCROLL_UPDATE_THROTTLE = 20 // 50fps - plus réactif pour éviter les problèmes de suivi

// Animation continue pour scroll fluide
function updateContinuousScroll() {
  if (!scrollContainer.value || targetScrollLeft === null || !cursorStore.isPlaying) {
    continuousScrollAnimationId = null
    return
  }
  
  const container = scrollContainer.value
  const currentScroll = container.scrollLeft
  const distance = targetScrollLeft - currentScroll
  
  // Si on est proche de la cible, on arrête
  if (Math.abs(distance) < 1) {
    continuousScrollAnimationId = null
    return
  }
  
  // Mouvement fluide et réactif (15% de la distance à chaque frame)
  const newScrollLeft = currentScroll + distance * 0.15
  container.scrollLeft = newScrollLeft
  
  // Continuer l'animation
  continuousScrollAnimationId = requestAnimationFrame(updateContinuousScroll)
}

watch(() => cursorStore.pixelPosition, (newPixelPosition, oldPixelPosition) => {
  if (!scrollContainer.value) return
  
  // Throttling pour éviter trop de calculs
  const now = performance.now()
  if (cursorStore.isPlaying && now - lastScrollUpdate < SCROLL_UPDATE_THROTTLE) {
    return
  }
  lastScrollUpdate = now
  
  // CORRECTION: Auto-scroll pendant la lecture OU après un seek manuel significatif
  const isSignificantSeekJump = Math.abs(newPixelPosition - (oldPixelPosition || 0)) > 100
  const shouldAutoScroll = cursorStore.isPlaying || isSignificantSeekJump
  
  if (!shouldAutoScroll) {
    if (Math.floor(newPixelPosition / 200) % 5 === 0) {
      console.log(`📍 Auto-scroll ignoré: curseur=${newPixelPosition.toFixed(0)}px, isPlaying=${cursorStore.isPlaying}, jump=${Math.abs(newPixelPosition - (oldPixelPosition || 0)).toFixed(0)}px`)
    }
    return
  }
  
  const container = scrollContainer.value
  const containerWidth = container.clientWidth
  const currentScrollLeft = container.scrollLeft
  
  // Calcul de l'auto-scroll avec padding
  const padding = 100
  const leftBound = currentScrollLeft + padding
  const rightBound = currentScrollLeft + containerWidth - padding
  
  // CORRECTION CRITIQUE: Calculer la limite maximale de scroll
  const maxScrollLeft = Math.max(0, timeSignatureComposable.totalWidth.value - containerWidth)
  
  let newScrollLeft = currentScrollLeft
  
  if (newPixelPosition < leftBound) {
    newScrollLeft = Math.max(0, newPixelPosition - padding)
  } else if (newPixelPosition > rightBound) {
    // CORRECTION CRITIQUE: En fin de timeline, rester au scroll maximum
    // Ne pas faire revenir le curseur au début !
    const idealScrollLeft = newPixelPosition - containerWidth + padding
    
    // NOUVELLE LOGIQUE: Si on est très proche de la fin de la timeline, 
    // utiliser le scroll maximum au lieu du calcul normal
    const totalTimelineWidth = timeSignatureComposable.totalWidth.value
    const nearEndThreshold = totalTimelineWidth - Math.min(200, containerWidth * 0.2) // 200px ou 20% de la largeur écran
    const isNearEnd = newPixelPosition >= nearEndThreshold
    
    // CORRECTION SUPPLÉMENTAIRE: Si le scroll calculé nous ramènerait vers le début, forcer le max
    const wouldScrollBackward = idealScrollLeft < currentScrollLeft * 0.8
    
    if (isNearEnd || wouldScrollBackward) {
      // Forcer le scroll maximum pour éviter le retour au début
      newScrollLeft = maxScrollLeft
      console.log('🔧 Auto-scroll en fin (mode FIN):', {
        curseur: newPixelPosition.toFixed(1) + 'px',
        procheFinDetection: nearEndThreshold.toFixed(1) + 'px',
        scrollArriere: wouldScrollBackward ? '⚠️ DÉTECTÉ' : '✅ OK',
        scrollActuel: currentScrollLeft.toFixed(1) + 'px',
        maxScrollForce: maxScrollLeft.toFixed(1) + 'px',
        mode: wouldScrollBackward ? '🛑 ANTI-RETOUR' : '🏁 FIN DE TIMELINE'
      })
    } else {
      // Logique normale
      newScrollLeft = Math.min(idealScrollLeft, maxScrollLeft)
      // Debug réduit
      if (Math.floor(newPixelPosition / 500) % 2 === 0) {
        console.log('🔧 Auto-scroll:', newPixelPosition.toFixed(0) + 'px → ' + newScrollLeft.toFixed(0) + 'px')
      }
    }
  }
  
  // Utiliser le scroll continu pour éviter les saccades
  if (Math.abs(newScrollLeft - currentScrollLeft) > 1) {
    if (cursorStore.isPlaying) {
      // Définir la nouvelle cible pour le scroll continu
      targetScrollLeft = newScrollLeft
      
      // Démarrer l'animation continue si pas déjà en cours
      if (!continuousScrollAnimationId) {
        continuousScrollAnimationId = requestAnimationFrame(updateContinuousScroll)
      }
    } else {
      // Scroll instantané pour les sauts (seek)
      targetScrollLeft = null // Arrêter le scroll continu
      if (continuousScrollAnimationId) {
        cancelAnimationFrame(continuousScrollAnimationId)
        continuousScrollAnimationId = null
      }
      container.scrollTo({
        left: newScrollLeft,
        behavior: 'instant'
      })
    }
    
    // Log réduit pour éviter le spam
    if (Math.floor(newPixelPosition / 100) % 10 === 0) {
      console.log(`📍 ScrollController: Auto-scroll vers ${newScrollLeft.toFixed(0)}px (curseur: ${newPixelPosition.toFixed(0)}px)`)
    }
    
    // Émettre l'événement pour synchroniser tous les composants
    emit('scroll-change', {
      scrollLeft: newScrollLeft,
      source: 'auto-scroll',
      cursorPosition: newPixelPosition
    })
  }
})

// Animation fluide et naturelle pour l'autoscroll
function animateScrollWithTempo(container, startScroll, endScroll) {
  if (scrollAnimationFrame.value) {
    cancelAnimationFrame(scrollAnimationFrame.value)
  }
  
  const distance = endScroll - startScroll
  const startTime = performance.now()
  
  // Durée adaptive selon la distance
  const baseDistance = 100 // pixels
  const baseDuration = 50 // ms pour 100px
  const maxDuration = 150 // ms maximum
  const duration = Math.min(maxDuration, Math.abs(distance) / baseDistance * baseDuration)
  
  function animate(currentTime) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // Easing plus doux pour éviter les saccades
    const easeOutCubic = 1 - Math.pow(1 - progress, 3)
    const currentScroll = startScroll + distance * easeOutCubic
    
    container.scrollLeft = currentScroll
    
    if (progress < 1 && cursorStore.isPlaying) {
      scrollAnimationFrame.value = requestAnimationFrame(animate)
    } else {
      scrollAnimationFrame.value = null
    }
  }
  
  scrollAnimationFrame.value = requestAnimationFrame(animate)
}

// Référence pour l'animation (gardée pour compatibilité)
const scrollAnimationFrame = ref(null)

// Arrêter le scroll continu quand la lecture s'arrête
watch(() => cursorStore.isPlaying, (isPlaying) => {
  if (!isPlaying) {
    targetScrollLeft = null
    if (continuousScrollAnimationId) {
      cancelAnimationFrame(continuousScrollAnimationId)
      continuousScrollAnimationId = null
    }
  }
})

// Méthode publique pour scroll programmatique
function scrollTo(scrollLeft) {
  if (scrollContainer.value) {
    scrollContainer.value.scrollLeft = scrollLeft
  }
}

// Exposer la méthode pour le parent
defineExpose({
  scrollTo
})
</script>

<style scoped>
.scroll-controller {
  width: 100%;
  height: 14px; /* Hauteur réduite */
  overflow-x: scroll; /* Forcer la scrollbar */
  overflow-y: hidden;
  background: var(--panel-bg, #f5f5f5);
  border-top: 1px solid var(--border-color, #ddd);
  position: relative;
  box-sizing: border-box;
}

.scroll-content {
  background: transparent;
  height: 1px; /* Hauteur minimale pour déclencher la scrollbar */
  min-height: 1px;
  position: relative;
  box-sizing: border-box;
}

.invisible-cursor {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}

/* Personnalisation de la scrollbar */
.scroll-controller::-webkit-scrollbar {
  height: 12px;
}

.scroll-controller::-webkit-scrollbar-track {
  background: var(--scrollbar-track, #f1f1f1);
  border-radius: 6px;
}

.scroll-controller::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb, #888);
  border-radius: 6px;
}

.scroll-controller::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover, #555);
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .scroll-controller {
    --panel-bg: #2d2d2d;
    --border-color: #444;
    --scrollbar-track: #3d3d3d;
    --scrollbar-thumb: #666;
    --scrollbar-thumb-hover: #888;
  }
}
</style>