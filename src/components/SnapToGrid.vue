<template>
  <div class="snap-to-grid">
    <el-button
      :type="uiStore.snapToGrid ? 'primary' : 'default'"
      :icon="Grid"
      size="small"
      @click="toggleSnap"
      class="snap-button"
    >
      Snap
    </el-button>
    
    <el-select
      v-model="uiStore.snapDivision"
      size="small"
      style="width: 80px"
      class="snap-select"
      placeholder="1/4"
    >
      <el-option-group label="Notes">
        <el-option label="1/1" value="1" />
        <el-option label="1/2" value="2" />
        <el-option label="1/4" value="4" />
        <el-option label="1/8" value="8" />
        <el-option label="1/16" value="16" />
        <el-option label="1/32" value="32" />
        <el-option label="1/64" value="64" />
      </el-option-group>
      <el-option-group label="Triolets">
        <el-option label="1/4T" value="4T" />
        <el-option label="1/8T" value="8T" />
        <el-option label="1/16T" value="16T" />
        <el-option label="1/32T" value="32T" />
      </el-option-group>
    </el-select>
  </div>
</template>

<script setup>
import { useUIStore } from '@/stores/ui'
import { Grid } from '@element-plus/icons-vue'

const uiStore = useUIStore()

const toggleSnap = () => {
  uiStore.snapToGrid = !uiStore.snapToGrid
}
</script>

<style scoped>
.snap-to-grid {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snap-button {
  min-width: 60px;
}

.snap-select {
  transition: opacity 0.2s ease;
}

/* Style visuel pour indiquer l'état mais sans désactiver */
.snap-select:not(.snap-active) {
  opacity: 0.7;
}

.snap-select.snap-active {
  opacity: 1;
}
</style>