<!-- components/GlobalPlaybackCursor.vue - Curseur SVG ultra-performant -->
<template>
  <svg 
    v-if="cursorStore.totalDuration > 0 || cursorStore.currentTime >= 0"
    class="global-playback-cursor-svg"
    :viewBox="`0 0 ${totalWidth} ${containerHeight || 100}`"
    preserveAspectRatio="none"
  >
    <!-- Ligne du curseur SVG -->
    <line
      class="cursor-line-svg"
      :x1="cursorX"
      :y1="0"
      :x2="cursorX"
      :y2="containerHeight || 100"
      stroke="#ff0000"
      stroke-width="3"
      stroke-linecap="round"
      :opacity="cursorStore.totalDuration > 0 ? 1 : 0"
    />
    
    <!-- Ombre/effet lumineux -->
    <line
      class="cursor-glow-svg"
      :x1="cursorX"
      :y1="0"
      :x2="cursorX"
      :y2="containerHeight || 100"
      stroke="#ff0000"
      stroke-width="8"
      stroke-linecap="round"
      opacity="0.3"
      filter="url(#cursor-blur)"
    />
    
    <!-- Définition du filtre blur -->
    <defs>
      <filter id="cursor-blur">
        <feGaussianBlur stdDeviation="2"/>
      </filter>
    </defs>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

const props = defineProps({
  containerHeight: { type: Number, default: 100 },
  totalWidth: { type: Number, default: 5000 } // Largeur totale fixe ou fournie par parent
})

const emit = defineEmits(['position-change'])

const cursorStore = usePlaybackCursorStore()

// Position X du curseur - utiliser directement pixelPosition du store 
// qui fait déjà tous les calculs de tempo/signature
const cursorX = computed(() => {
  return Math.round(cursorStore.pixelPosition)
})

// Émission pour l'auto-scroll
let lastEmittedPosition = 0
setInterval(() => {
  if (cursorStore.isPlaying && Math.abs(cursorStore.pixelPosition - lastEmittedPosition) > 10) {
    lastEmittedPosition = cursorStore.pixelPosition
    emit('position-change', {
      pixelPosition: cursorStore.pixelPosition,
      currentTime: cursorStore.currentTime
    })
  }
}, 100) // Émettre toutes les 100ms pendant la lecture
</script>

<style scoped>
/* ✅ CURSEUR SVG ULTRA-PERFORMANT */
.global-playback-cursor-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
  z-index: 9999;
  overflow: visible; /* Important pour que le curseur reste visible même en dehors */
}

.cursor-line-svg {
  transition: opacity 0.3s ease;
  will-change: auto; /* Pas d'animation sur la position, juste sur l'opacité */
}

.cursor-glow-svg {
  will-change: auto;
}

/* Optimisation GPU */
.global-playback-cursor-svg {
  transform: translateZ(0); /* Force GPU layer */
}
</style>