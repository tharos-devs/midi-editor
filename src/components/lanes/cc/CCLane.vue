<template>
  <div class="lane-content">
    <div class="cc-curve-container">
      <!-- Points de contrôle CC -->
      <div
        v-for="point in ccPoints"
        :key="`cc-${ccNumber}-${point.id}`"
        class="cc-point"
        :style="ccPointStyle(point)"
        @mousedown="startDrag(point, $event)"
        :class="{ selected: selectedPoint?.id === point.id }"
      ></div>

      <!-- Ligne de courbe -->
      <svg class="cc-curve-svg" :viewBox="`0 0 ${totalWidth} 100`">
        <polyline
          :points="curvePoints"
          fill="none"
          :stroke="ccColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <!-- Grille de mesures -->
    <div class="lane-grid">
      <div
        v-for="measure in visibleMeasures"
        :key="`cc-measure-${measure}`"
        class="lane-measure-line"
        :style="{ left: measureToPixels(measure) + 'px' }"
      ></div>
    </div>

    <!-- Lignes de référence CC -->
    <div class="cc-reference-lines">
      <div
        v-for="level in [32, 64, 96, 127]"
        :key="level"
        class="cc-reference-line"
        :style="{ bottom: (level / 127) * 100 + '%' }"
      >
        <span class="cc-label">{{ level }}</span>
      </div>
    </div>

    <!-- Affichage de la valeur actuelle -->
    <div class="cc-info">
      <span>CC{{ ccNumber }} - {{ ccName }}</span>
      <span v-if="selectedPoint" class="cc-value">Value: {{ selectedPoint.value }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'

const props = defineProps({
  ccNumber: {
    type: Number,
    required: true
  },
  ccName: {
    type: String,
    default: ''
  },
  totalMeasures: Number,
  visibleMeasures: Array,
  measureToPixels: Function
})

const uiStore = useUIStore()
const midiStore = useMidiStore()
const selectedPoint = ref(null)
const isDragging = ref(false)

// Couleurs spécifiques selon le CC
const ccColors = {
  1: '#2196F3',   // Modulation - Bleu
  7: '#4CAF50',   // Volume - Vert
  10: '#FF9800',  // Pan - Orange
  11: '#9C27B0', // Expression - Violet
}

const ccColor = computed(() => ccColors[props.ccNumber] || '#607D8B')

// Points de contrôle CC (exemples)
const ccPoints = ref([
  { id: 1, beat: 0, value: 0 },
  { id: 2, beat: 2, value: 80 },
  { id: 3, beat: 4, value: 40 },
  { id: 4, beat: 6, value: 100 },
  { id: 5, beat: 8, value: 60 },
])

const selectedTrackCC = computed(() => midiStore.getSelectedTrackCC)

const totalWidth = computed(() => props.totalMeasures * uiStore.pixelsPerMeasure)

const ccPointStyle = (point) => {
  return {
    left: uiStore.beatsToPixels(point.beat) + 'px',
    bottom: (point.value / 127) * 100 + '%'
  }
}

// Génération des points pour la courbe SVG
const curvePoints = computed(() => {
  return ccPoints.value
    .sort((a, b) => a.beat - b.beat)
    .map(point => {
      const x = uiStore.beatsToPixels(point.beat)
      const y = 100 - (point.value / 127) * 100
      return `${x},${y}`
    })
    .join(' ')
})

let dragStartX = 0
let dragStartY = 0
let originalBeat = 0
let originalValue = 0

const startDrag = (point, event) => {
  selectedPoint.value = point
  isDragging.value = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  originalBeat = point.beat
  originalValue = point.value

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  event.preventDefault()
}

const onDrag = (event) => {
  if (!isDragging.value || !selectedPoint.value) return

  const deltaX = event.clientX - dragStartX
  const deltaY = event.clientY - dragStartY

  // Conversion des pixels en beats et en valeur CC
  const beatDelta = uiStore.pixelsToBeats(deltaX)
  const valueDelta = -(deltaY / 2) // Inversion Y et réduction sensibilité

  selectedPoint.value.beat = Math.max(0, originalBeat + beatDelta)
  selectedPoint.value.value = Math.max(0, Math.min(127, originalValue + valueDelta))
}

const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// Ajouter un point en double-cliquant
const addPoint = (event) => {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const beat = uiStore.pixelsToBeats(x)
  const value = Math.round((1 - y / rect.height) * 127)

  const newPoint = {
    id: Date.now(),
    beat: Math.max(0, beat),
    value: Math.max(0, Math.min(127, value))
  }

  ccPoints.value.push(newPoint)
  selectedPoint.value = newPoint
}

onMounted(() => {
  // Ajouter l'écouteur de double-clic sur le conteneur
  const container = document.querySelector('.cc-curve-container')
  if (container) {
    container.addEventListener('dblclick', addPoint)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<style scoped>
.lane-content {
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #fafafa;
}

.cc-curve-container {
  position: relative;
  height: 100%;
  cursor: crosshair;
}

.cc-point {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: v-bind(ccColor);
  border: 2px solid white;
  transform: translate(-50%, 50%);
  cursor: grab;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 10;
}

.cc-point:hover {
  transform: translate(-50%, 50%) scale(1.2);
}

.cc-point.selected {
  border-color: #FF5722;
  box-shadow: 0 0 8px rgba(255, 87, 34, 0.5);
}

.cc-point:active {
  cursor: grabbing;
}

.cc-curve-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.cc-reference-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.cc-reference-line {
  position: absolute;
  left: 0;
  width: 100%;
  border-top: 1px dashed #ccc;
}

.cc-label {
  position: absolute;
  left: 4px;
  top: -12px;
  font-size: 10px;
  color: #666;
  background: #fafafa;
  padding: 0 2px;
}

.cc-info {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #666;
  pointer-events: none;
}

.cc-value {
  margin-left: 12px;
  color: v-bind(ccColor);
  font-weight: 500;
}

.lane-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.lane-measure-line {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid #e0e0e0;
}
</style>