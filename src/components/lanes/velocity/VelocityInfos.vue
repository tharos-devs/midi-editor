<template>
  <div 
    v-if="uiStore.velocityDisplay?.visible" 
    class="velocity-info"
  >
    <div class="velocity-title">Velocité</div>
    <div class="velocity-note">{{ uiStore.velocityDisplay.name || '--' }}</div>
    <div class="velocity-value">{{ formatVelocity(uiStore.velocityDisplay.value) }}</div>
  </div>
</template>

<script setup>
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()

const formatVelocity = (value) => {
  if (value === null || value === undefined) return '--'
  return Math.round(value).toString()
}
</script>

<style scoped>
.velocity-info {
  /* background: rgba(33, 150, 243, 0.9); */
  color: #000;
  padding: 8px 12px;
  border-radius: 6px;
  text-align: center;
  min-width: 80px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.velocity-title {
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.8;
  margin-bottom: 2px;
  letter-spacing: 0.5px;
}

.velocity-note {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 2px;
}

.velocity-value {
  font-size: 16px;
  font-weight: bold;
  line-height: 1.2;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .velocity-info {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  }
}
</style>