<template>
  <div
    class="velocity-bar interactive-item"
    :class="barClasses"
    :style="barStyle"
    @mousedown="$emit('mousedown', $event)"
    @click="$emit('click', $event)"
  >
    <div 
      class="velocity-bar-fill" 
      :style="fillStyle"
    />
  </div>
</template>

<script setup>
import { computed, watchEffect, ref } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useVelocityCalculations } from '@/composables/useVelocityCalculations'
import { useColorsStore } from '@/stores/colors'
import { useUIStore } from '@/stores/ui'

const props = defineProps({
  note: {
    type: Object,
    required: true
  },
  laneHeight: {
    type: Number,
    required: true
  },
  usableHeight: {
    type: Number,
    required: true
  },
  velocityBarWidth: {
    type: Number,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  },
  isSingleSelected: {
    type: Boolean,
    default: false
  },
  isInSelection: {
    type: Boolean,
    default: false
  },
  isBrushed: {
    type: Boolean,
    default: false
  },
  isDragging: {
    type: Boolean,
    default: false
  }
})

defineEmits(['mousedown', 'click'])

const { timeToPixelsWithSignatures } = useTimeSignature()
const { velocityToY } = useVelocityCalculations()
const colorsStore = useColorsStore()
const uiStore = useUIStore()

// Constantes
const VELOCITY_MARGIN_TOP = 0

// Cache pour optimiser les calculs de position
const cachedPosition = ref(null)
const lastNoteTime = ref(null)
const lastZoom = ref(null)

// Fonction de calcul de position alignée avec MidiNote.vue
const calculateLeftPosition = () => {
  const noteTime = props.note.time || props.note.start || 0
  const currentZoom = uiStore.horizontalZoom
  
  // Si le temps ET le zoom n'ont pas changé, utiliser le cache
  if (lastNoteTime.value === noteTime && 
      lastZoom.value === currentZoom && 
      cachedPosition.value !== null) {
    return cachedPosition.value
  }
  
  try {
    let position
    
    if (timeToPixelsWithSignatures) {
      // Utiliser exactement la même méthode que MidiNote.vue
      position = timeToPixelsWithSignatures(noteTime)
    } else {
      // Fallback identique à MidiNote.vue
      const basePixelsPerBeat = 60
      const zoomedPixelsPerBeat = basePixelsPerBeat * currentZoom
      position = noteTime * zoomedPixelsPerBeat
    }
    
    // Arrondir à l'entier le plus proche pour éviter les décalages de sous-pixel
    position = Math.round(position) - 1
      
    // Mettre à jour le cache
    cachedPosition.value = position
    lastNoteTime.value = noteTime
    lastZoom.value = currentZoom
    
    return position
  } catch (error) {
    console.warn('Erreur calculateLeftPosition:', error)
    return Math.round(cachedPosition.value || 0)
  }
}

// Classes CSS dynamiques avec mémoisation
const barClasses = computed(() => {
  const classes = {
    'dragging': props.isDragging,
    'brushed': props.isBrushed && !props.isDragging,
    'single-selected': props.isSingleSelected && !props.isDragging && !props.isBrushed,
    'selected': props.isSelected && !props.isSingleSelected && !props.isDragging && !props.isBrushed,
    'in-selection': props.isInSelection && !props.isSelected && !props.isDragging && !props.isBrushed
  }
  
  return classes
})

const barStyle = computed(() => {
  const leftPosition = calculateLeftPosition()
  const barWidth = props.velocityBarWidth
    
  return {
    left: leftPosition + 'px',
    width: barWidth + 'px',
    height: '100%',
    position: 'absolute',
    bottom: '0',
    // Assurer un positionnement pixel-perfect
    transform: 'translateZ(0)',
    zIndex: props.isDragging ? 15 : 
            props.isBrushed ? 12 : 
            props.isSingleSelected ? 10 : 
            props.isSelected ? 8 : 
            props.isInSelection ? 6 : 5,
    cursor: props.isDragging ? 'ns-resize' : 'pointer',
    willChange: props.isDragging || props.isBrushed ? 'transform' : 'auto'
  }
})


// Cache pour les calculs de fill style
const cachedFillStyle = ref(null)
const lastVelocity = ref(null)
const lastHeight = ref(null)
const lastState = ref(null)

// Style du fill - VERSION ULTRA SIMPLE POUR DEBUG
const fillStyle = computed(() => {
  const midiVelocity = props.note.velocity !== undefined ? props.note.velocity : 100
  const clampedVelocity = Math.max(0, Math.min(127, Math.round(midiVelocity)))
  
  
  // CALCUL DIRECT SANS AUCUN CACHE - comme TempoLane
  const barTopY = velocityToY(clampedVelocity, props.usableHeight, VELOCITY_MARGIN_TOP)
  const barBottomY = velocityToY(0, props.usableHeight, VELOCITY_MARGIN_TOP)
  const barHeightPx = Math.max(2, barBottomY - barTopY)
  const heightPercentage = (barHeightPx / props.laneHeight) * 100

  return {
    height: heightPercentage + '%',
    width: '100%',
    backgroundColor: getBackgroundColor(clampedVelocity),
    transition: props.isDragging ? 'none' : 'height 0.1s ease, background-color 0.1s ease'
  }
})

// Fonction optimisée pour la couleur de fond
const getBackgroundColor = (clampedVelocity) => {
  if (props.isDragging) {
    return '#2196F3' // Bleu pour le drag
  }
  if (props.isBrushed) {
    return '#FF6B35' // Orange pour le brush
  }
  if (props.isSingleSelected) {
    return '#2196F3' // Bleu pour sélection unique
  }
  if (props.isSelected) {
    return '#000000' // Noir pour sélection multiple
  }
  if (props.isInSelection) {
    return '#4CAF50' // Vert pour preview de sélection
  }
  if (clampedVelocity === 0) {
    return '#ff4444' // Rouge pour vélocité nulle
  }
  
  // Couleur par défaut basée sur la vélocité
  return colorsStore.getVelocityColor(clampedVelocity)
}

// Nettoyer le cache quand les props changent significativement
watchEffect(() => {
  // Invalider le cache de position si le temps ou le zoom change
  const noteTime = props.note.time || props.note.start || 0
  if (noteTime !== lastNoteTime.value || 
      uiStore.horizontalZoom !== lastZoom.value) {
    cachedPosition.value = null
  }
  
})
</script>

<style scoped>
.velocity-bar {
  border-radius: 2px;
  box-sizing: border-box;
  pointer-events: auto;
  min-height: 100%;
  border: 2px solid transparent;
  transition: all 0.1s ease;
  contain: layout style paint;
  will-change: auto;
  /* Assurer un positionnement précis au pixel près */
  image-rendering: crisp-edges;
}

.velocity-bar.dragging {
  cursor: ns-resize !important;
  z-index: 15 !important;
}

.velocity-bar.brushed {
  z-index: 12 !important;
}

.velocity-bar.single-selected {
  z-index: 10 !important;
}

.velocity-bar.selected {
  z-index: 8 !important;
}

.velocity-bar.in-selection {
  z-index: 6 !important;
}

.velocity-bar-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 1px;
  min-height: 2px;
  pointer-events: none;
  will-change: height, background-color;
  transform: translateZ(0);
  contain: layout style paint;
  transition: inherit;
  /* Assurer un rendu précis */
  image-rendering: crisp-edges;
}
</style>