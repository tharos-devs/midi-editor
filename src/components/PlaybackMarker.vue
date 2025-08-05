<!-- components/PlaybackMarker.vue - Marqueur visuel P dans la timeline -->
<template>
  <div
    v-if="markerStore.hasMarker"
    class="playback-marker"
    :style="{
      left: markerStore.markerPixelPosition + 'px',
      top: '0px'
    }"
    :title="`Marqueur de position: ${markerStore.formatMarkerTime()}`"
  >
    <!-- Ligne verticale -->
    <div class="marker-line"></div>
    
    <!-- Lettre P -->
    <div class="marker-label">P</div>
    
    <!-- Indicateur triangulaire en haut -->
    <div class="marker-triangle"></div>
  </div>
</template>

<script setup>
import { usePlaybackMarkerStore } from '@/stores/playbackMarker'
import { watch } from 'vue'

const markerStore = usePlaybackMarkerStore()

// Debug: surveiller les changements de position
watch(() => markerStore.markerPixelPosition, (newPos, oldPos) => {
  if (newPos !== null) {
    console.log('🅿️ PlaybackMarker position mise à jour:', {
      ancienne: oldPos,
      nouvelle: newPos,
      temps: markerStore.markerTime
    })
  }
}, { immediate: true })
</script>

<style scoped>
.playback-marker {
  position: absolute;
  z-index: 15; /* Au-dessus du curseur de lecture mais sous les notes */
  pointer-events: none;
  height: 100%;
}

.marker-line {
  position: absolute;
  left: 0;
  top: 0;
  width: 2px;
  height: 100%;
  background: #22c55e; /* Vert */
  opacity: 0.8;
}

.marker-label {
  position: absolute;
  left: -8px;
  top: 20px;
  width: 16px;
  height: 16px;
  background: #22c55e;
  color: white;
  font-size: 12px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  border: 2px solid white;
}

.marker-triangle {
  position: absolute;
  left: -4px;
  top: 0;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 8px solid #22c55e;
  opacity: 0.9;
}

/* Animation subtile pour attirer l'attention */
.playback-marker {
  animation: markerPulse 2s ease-in-out infinite;
}

@keyframes markerPulse {
  0%, 100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
}

/* Mode hover pour plus de visibilité */
.playback-marker:hover .marker-label {
  transform: scale(1.1);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}
</style>