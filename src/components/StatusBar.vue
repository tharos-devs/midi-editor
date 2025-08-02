<template>
  <div class="status-bar">
    <div class="status-section">
      <span class="status-label">Position:</span>
      <span class="status-value">{{ currentPosition }}</span>
    </div>

    <div class="status-section">
      <span class="status-label">Tempo:</span>
      <span class="status-value">{{ tempo }} BPM</span>
    </div>

    <div class="status-section">
      <span class="status-label">Signature:</span>
      <span class="status-value">{{ uiStore.beatsPerMeasure }}/{{ uiStore.beatNote }}</span>
    </div>

    <div class="status-section">
      <span class="status-label">Zoom:</span>
      <span class="status-value">H: {{ Math.round(uiStore.horizontalZoom * 100) }}% - V: {{ Math.round(uiStore.verticalZoom * 100) }}%</span>
    </div>

    <div class="status-section ml-auto">
      <span class="status-label">Pistes:</span>
      <span class="status-value">{{ totalTracks }}</span>
      <ZoomH />
      <el-button size="small" @click="uiStore.resetZoom()">Reset</el-button>
      <ZoomV />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import ZoomH from '@/components/buttons/ZoomH.vue'
import ZoomV from '@/components/buttons/ZoomV.vue'

const uiStore = useUIStore()

const currentPosition = ref('1.1.1')
const tempo = ref(120)
const totalTracks = ref(4)
</script>

<style scoped>
.status-bar {
  height: 30px;
  background: var(--statusbar-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 12px;
}

.status-section {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 24px;
}

.status-section.ml-auto {
  margin-left: auto;
  margin-right: 0;
}

.status-label {
  color: var(--statusbar-fg);
  font-weight: 500;
}

.status-value {
  color: var(--panel-fg);
  font-family: monospace;
}
</style>
