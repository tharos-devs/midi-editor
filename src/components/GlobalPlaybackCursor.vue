<!-- components/GlobalPlaybackCursor.vue - Curseur global simplifié -->
<template>
  <div 
    v-if="cursorStore.totalDuration > 0 || cursorStore.currentTime >= 0"
    class="global-playback-cursor"
    :style="cursorStyle"
  >
    <!-- Ligne du curseur -->
    <div class="cursor-line" />
    
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

const props = defineProps({
  containerHeight: { type: Number, default: null }
})

const emit = defineEmits(['position-change'])

const cursorStore = usePlaybackCursorStore()

// Style du curseur
const cursorStyle = computed(() => {
  // CORRECTION: Le curseur doit se positionner par rapport au contenu scrollé
  // La position pixelPosition est absolue dans le contenu total
  // Elle doit rester telle quelle car le conteneur parent gère le scroll
  
  const style = {
    position: 'absolute',
    left: `${cursorStore.pixelPosition}px`, // Position absolue dans le contenu total
    top: '0px',
    height: props.containerHeight ? `${props.containerHeight}px` : '100%',
    width: '3px',
    zIndex: 9999,
    pointerEvents: 'none',
    transform: 'translateX(-1.5px)', // Centrer
    opacity: cursorStore.totalDuration > 0 ? 1 : 0,
    transition: 'opacity 0.3s ease'
  }
  
  
  return style
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
.global-playback-cursor {
  position: absolute;
  pointer-events: none;
  user-select: none;
}

.cursor-line {
  width: 100%;
  height: 100%;
  background: #ff0000;
  border-radius: 1.5px;
  box-shadow: 0 0 4px rgba(255, 0, 0, 0.6);
}


</style>