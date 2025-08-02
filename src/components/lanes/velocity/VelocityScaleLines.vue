<template>
  <div class="velocity-scale-lines">
    <div
      v-for="level in velocityLevels"
      :key="level"
      class="velocity-scale-line-bg"
      :class="{ 
        'max-velocity': level === 127, 
        'min-velocity': level === 0 
      }"
      :style="getVelocityScaleLineStyle(level)"
    />
  </div>
</template>

<script setup>
import { useVelocityCalculations } from '@/composables/useVelocityCalculations'

const props = defineProps({
  laneHeight: {
    type: Number,
    required: true
  },
  usableHeight: {
    type: Number,
    required: true
  }
})

const { velocityToY } = useVelocityCalculations()

// Niveaux de vélocité à afficher
const velocityLevels = [127, 96, 64, 32, 0]
const VELOCITY_MARGIN_TOP = 5

const getVelocityScaleLineStyle = (level) => {
  const topPosition = velocityToY(level, props.usableHeight, VELOCITY_MARGIN_TOP)
  return {
    top: topPosition + 'px',
    bottom: 'auto'
  }
}
</script>

<style scoped>
.velocity-scale-lines {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.velocity-scale-line-bg {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--velocity-scale-line, #d0d0d0);
  pointer-events: none;
}

.velocity-scale-line-bg.max-velocity,
.velocity-scale-line-bg.min-velocity {
  background: var(--velocity-scale-line-strong, #888);
  height: 2px;
}
</style>