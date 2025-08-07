<template>
  <div class="status-bar">
    <div class="status-section ml-auto">
      <ZoomH />
      <el-button size="small" @click="uiStore.resetZoom()">Reset</el-button>
      <ZoomV />
    </div>
  </div>
</template>

<script setup>
import { useUIStore } from '@/stores/ui'
import ZoomH from '@/components/buttons/ZoomH.vue'
import ZoomV from '@/components/buttons/ZoomV.vue'

const uiStore = useUIStore()

</script>

<style scoped>
.status-bar {
  height: 30px;
  background: var(--statusbar-bg);
  border: 1px solid var(--el-border-color);
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
