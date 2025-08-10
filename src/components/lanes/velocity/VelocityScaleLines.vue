<template>
  <div class="velocity-scale-lines">
    <!-- Lignes de référence -->
    <div
      v-for="level in velocityLevels"
      :key="level"
      class="velocity-scale-line-bg"
      :class="{ 
        'max-velocity': level === 127, 
        'l-96': level === 96, 
        'min-velocity': level === 0 
      }"
      :style="getVelocityScaleLineStyle(level)"
    />
    
    <!-- Labels de référence (style MIDI CC) -->
    <div class="velocity-reference-labels">
      <div
        v-for="level in velocityLevels"
        :key="`label-${level}`"
        class="velocity-reference-label"
        :class="{
          'label-top': level === 127,
          'label-bottom': level === 0
        }"
        :style="{ 
          bottom: (level / 127) * 100 + '%',
          transform: level === 127 ? 'translateY(100%)' : 
                    level === 0 ? 'translateY(0%)' :
                    level === 96 ? 'translateY(40%)' : 
                    level === 32 ? 'translateY(60%)' : 
                    'translateY(50%)'
        }"
        :data-level="level"
      >
        {{ level }}
      </div>
    </div>
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
const VELOCITY_MARGIN_TOP = 0

const getVelocityScaleLineStyle = (level) => {
  const topPosition = velocityToY(level, props.usableHeight, VELOCITY_MARGIN_TOP)
  // S'assurer que les lignes extrêmes sont visibles
  const clampedPosition = Math.max(2, Math.min(props.usableHeight - 2, topPosition))
  return {
    top: clampedPosition + 'px',
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
  height: 0;
  border-top: 1px dashed #888;
  opacity: 0.6;
  pointer-events: none;
}

.velocity-scale-line-bg.max-velocity,
.velocity-scale-line-bg.min-velocity {
  border-top: 2px dashed #888;
  opacity: 0.8;
}

/* Remonter uniquement la ligne des 0 de 1px */
.velocity-scale-line-bg.min-velocity {
  transform: translateY(-1px);
}
.velocity-scale-line-bg.l-96 {
  transform: translateY(2px);
}

/* Labels de référence Velocity fixes sur la droite - STYLE MIDI CC */
.velocity-reference-labels {
  position: absolute;
  left: 0;
  right: 5px;
  top: 0;
  bottom: 0;
  pointer-events: none;
}

.velocity-reference-label {
  position: absolute;
  right: 0;
  font-size: 9px;
  font-weight: 600;
  color: #666;
  background: transparent;
  padding: 1px 2px;
  white-space: nowrap;
  text-align: right;
  min-width: 16px;
  text-shadow: 1px 1px 1px rgba(255,255,255,0.8);
  z-index: 100;
}

/* Positionnement spécial pour les valeurs extrêmes */
.velocity-reference-label.label-top {
  /* Valeur 127 (en haut) - garder dans la div */
  transform: translateY(100%) !important;
}

.velocity-reference-label.label-bottom {
  /* Valeur 0 (en bas) - garder dans la div */
  transform: translateY(0%) !important;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .velocity-reference-label {
    background: rgba(50, 50, 50, 0.9);
    color: #ccc;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
  }
}
</style>