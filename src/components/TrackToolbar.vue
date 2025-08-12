<template>
  <div class="track-toolbar">
    <div class="track-toolbar-controls">
      <ShowTrackInfos />
    </div>
    <div class="track-toolbar-controls">
      <SelectRulers />
      <AddTrack />
    </div>
  </div>
</template>

<script setup>
import AddTrack from './buttons/AddTrack.vue'
import SelectRulers from './buttons/SelectRulers.vue'
import ShowTrackInfos from './buttons/ShowTrackInfos.vue'
</script>

<style scoped>
.track-toolbar {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--lane-bg);
  color: var(--panel-fg);
  flex-shrink: 0;
}

.track-toolbar-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>