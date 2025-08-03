<template>
  <div class="track-status-bar">
    <div class="status-left">
    </div>

    <div class="status-center">
    </div>

    <div class="status-right">
      <!-- Contrôle de taille des pistes -->
      <TrackSize 
        ref="trackSizeRef"
        v-model="trackSize" 
        @size-changed="onTrackSizeChanged"
      />
      
      <!-- Indicateur de statut -->
      <div class="status-indicator">
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMidiStore } from '@/stores/midi'
import TrackSize from './buttons/TrackSize.vue'

// Props
const props = defineProps({
  modelValue: {
    type: Number,
    default: 50
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'track-size-changed'])

const midiStore = useMidiStore()

// État local
const trackSize = ref(props.modelValue)

// Computed
const trackCount = computed(() => midiStore.tracks.length)
const selectedTrackName = computed(() => {
  const selectedTrack = midiStore.getSelectedTrackData
  return selectedTrack?.name || ''
})

const totalNotes = computed(() => {
  return midiStore.tracks.reduce((total, track) => {
    return total + (track.notes?.length || 0)
  }, 0)
})

// Gestionnaires d'événements
const onTrackSizeChanged = (sizeInfo) => {
  trackSize.value = sizeInfo.value
  emit('track-size-changed', sizeInfo)
}

// Synchroniser avec le modelValue externe
watch(() => props.modelValue, (newValue) => {
  if (newValue !== trackSize.value) {
    trackSize.value = newValue
  }
})
</script>

<style scoped>
.track-status-bar {
  height: 32px;
  background: var(--lane-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 11px;
  color: var(--track-details);
  flex-shrink: 0;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.status-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.track-count {
  font-weight: 500;
  color: var(--panel-fg);
}

.selected-track {
  color: var(--track-instrument);
  font-style: italic;
}

.notes-info {
  color: var(--track-instrument);
  font-weight: 500;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-text {
  color: var(--track-details);
  font-size: 10px;
}

/* Responsive */
@media (max-width: 768px) {
  .track-status-bar {
    flex-direction: column;
    height: auto;
    padding: 6px 12px;
    gap: 4px;
  }
  
  .status-left,
  .status-center,
  .status-right {
    flex: none;
    width: 100%;
    justify-content: center;
  }
  
  .status-left {
    justify-content: flex-start;
  }
  
  .status-right {
    justify-content: flex-end;
  }
}
</style>