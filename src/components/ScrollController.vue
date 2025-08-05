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

// Auto-scroll basé sur la position du curseur
watch(() => cursorStore.pixelPosition, (newPixelPosition, oldPixelPosition) => {
  if (!scrollContainer.value) return
  
  // CORRECTION: Auto-scroll pendant la lecture OU après un seek manuel significatif
  const isSignificantSeekJump = Math.abs(newPixelPosition - (oldPixelPosition || 0)) > 100
  const shouldAutoScroll = cursorStore.isPlaying || isSignificantSeekJump
  
  if (!shouldAutoScroll) {
    console.log('📍 ScrollController: Auto-scroll ignoré (mouvement mineur)')
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
      console.log('🔧 Auto-scroll en fin (mode NORMAL):', {
        curseur: newPixelPosition.toFixed(1) + 'px',
        idéal: idealScrollLeft.toFixed(1) + 'px', 
        maxScroll: maxScrollLeft.toFixed(1) + 'px',
        appliqué: newScrollLeft.toFixed(1) + 'px',
        limité: idealScrollLeft > maxScrollLeft ? '⚠️ LIMITÉ' : '✅ OK'
      })
    }
  }
  
  // Auto-scroll si nécessaire
  if (Math.abs(newScrollLeft - currentScrollLeft) > 1) {
    const scrollBehavior = cursorStore.isPlaying ? 'smooth' : 'instant'
    
    container.scrollTo({
      left: newScrollLeft,
      behavior: scrollBehavior
    })
    
    console.log(`📍 ScrollController: Auto-scroll ${scrollBehavior} vers ${newScrollLeft.toFixed(1)}px (curseur: ${newPixelPosition.toFixed(1)}px)`)
    
    // Émettre l'événement pour synchroniser tous les composants
    emit('scroll-change', {
      scrollLeft: newScrollLeft,
      source: 'auto-scroll',
      cursorPosition: newPixelPosition
    })
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