<template>
  <div class="tool-bar">
    <div class="tool-separator"></div>

    <div class="tool-group">
      <SnapToGrid />
    </div>
  </div>
</template>

<script setup>
import SnapToGrid from './SnapToGrid.vue'

</script>

<style scoped>
.tool-bar {
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--panel-bg);
  gap: 16px;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-separator {
  width: 1px;
  height: 30px;
  background: var(--border-color);
  margin: 0 8px;
}

.tool-label {
  font-size: 12px;
  color: var(--track-details);
  white-space: nowrap;
}
</style>