<template>
  <div
    class="midi-note"
    :class="{
      selected: isSelected,
      dragging: isDragging,
      resizing: isResizing
    }"
    :style="noteStyle"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    ref="noteRef"
  >
    <!-- Contenu de la note -->
    <div class="note-content">
      <span class="note-name">{{ noteName }}</span>
    </div>

    <!-- Handle de redimensionnement - toujours visible -->
    <div
      class="resize-handle"
      :class="{ 'resize-hover': showResizeCursor }"
      @mousedown.stop="startResize"
    ></div>

    <!-- Indicateur de snap -->
    <div v-if="showSnapIndicator" class="snap-indicator" :style="snapIndicatorStyle"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { usePianoPositioning } from '@/composables/usePianoPositioning'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useSnapLogic } from '@/composables/useSnapLogic'

const props = defineProps({
  note: Object
})

const uiStore = useUIStore()
const midiStore = useMidiStore()

// Utiliser les composables
const {
  getMidiNotePosition,
  getNoteHeight,
  yToMidiNote,
  getNoteName,
  noteLineHeight
} = usePianoPositioning()

const {
  timeToPixelsWithSignatures,
  pixelsToTimeWithSignatures,
  PIXELS_PER_QUARTER
} = useTimeSignature()

const {
  snapTimeToGrid,
  snapPixelsToGrid,
  snapNoteDuration,
  getMinNoteDuration
} = useSnapLogic()

const noteRef = ref(null)
const isDragging = ref(false)
const isResizing = ref(false)
const showSnapIndicator = ref(false)
const showResizeCursor = ref(false)
const snapIndicatorStyle = ref({})

// Variables pour le dragging
let dragStartX = 0
let dragStartY = 0
let initialTime = 0
let initialMidi = 0
let initialDuration = 0

const isSelected = computed(() => {
  return midiStore.selectedNote === props.note.id
})

const noteName = computed(() => {
  return props.note.name || getNoteName(props.note.midi)
})

// Fonction pour obtenir la couleur basée sur la vélocité
const getVelocityColor = (velocity) => {
  const normalizedVelocity = Math.max(0, Math.min(1, velocity))
  const hue = (1 - normalizedVelocity) * 120
  const saturation = 70
  const lightness = 50 + (normalizedVelocity * 20)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

const noteStyle = computed(() => {
  // Position verticale
  const baseNoteY = getMidiNotePosition(props.note.midi)
  const baseNoteHeight = getNoteHeight()
  const noteHeight = baseNoteHeight * 1.35
  
  const heightDifference = noteHeight - baseNoteHeight
  const noteY = baseNoteY - (heightDifference / 2)

  // Position horizontale
  const noteStartTime = props.note.start || props.note.time
  const leftPixels = timeToPixelsWithSignatures(noteStartTime)

  // Calcul de la largeur
  const cleanDuration = Math.round(props.note.duration * 1000000) / 1000000
  const tempo = midiStore.getCurrentTempo || 120
  const quarterNotesCount = cleanDuration / (60 / tempo)
  const exactPixels = quarterNotesCount * PIXELS_PER_QUARTER.value
  const widthPixels = Math.round(exactPixels * 100) / 100
 
  // Largeur minimale
  const minWidthPixels = Math.max(PIXELS_PER_QUARTER.value * 0.1, 8)

  return {
    left: leftPixels + 'px',
    top: noteY + 'px',
    width: Math.max(widthPixels, minWidthPixels) + 'px',
    height: noteHeight + 'px',
    backgroundColor: getVelocityColor(props.note.velocity),
    zIndex: isSelected.value ? 100 : 10
  }
})

const onMouseMove = (e) => {
  if (isDragging.value || isResizing.value) return

  const rect = noteRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const resizeZoneWidth = Math.max(PIXELS_PER_QUARTER.value * 0.2, 6)

  showResizeCursor.value = x >= rect.width - resizeZoneWidth
}

const onMouseLeave = () => {
  if (!isDragging.value && !isResizing.value) {
    showResizeCursor.value = false
  }
}

const onMouseDown = (e) => {
  e.preventDefault()
  e.stopPropagation()

  // Vérifier si on est sur la zone de redimensionnement
  const rect = noteRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const resizeZoneWidth = Math.max(PIXELS_PER_QUARTER.value * 0.2, 6)

  if (x >= rect.width - resizeZoneWidth) {
    startResize(e)
    return
  }

  // Sélectionner la note
  midiStore.selectNote(props.note.id)

  // Commencer le drag
  startDrag(e)
}

const startDrag = (e) => {
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  initialTime = props.note.start || props.note.time
  initialMidi = props.note.midi

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
}

const onDrag = (e) => {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStartX
  const deltaY = e.clientY - dragStartY

  // Position horizontale avec snap
  const currentNotePixel = timeToPixelsWithSignatures(initialTime)
  const newPixel = currentNotePixel + deltaX
  const constrainedPixel = Math.max(0, newPixel)
  
  // Appliquer le snap aux pixels si activé
  const snappedPixel = snapPixelsToGrid(constrainedPixel)
  const newTime = pixelsToTimeWithSignatures(snappedPixel)

  // Position verticale (calcul MIDI)
  const deltaMidi = Math.round(-deltaY / (noteLineHeight.value * uiStore.verticalZoom))
  const newMidi = Math.max(0, Math.min(127, initialMidi + deltaMidi))

  // Afficher l'indicateur de snap si activé
  if (uiStore.snapToGrid && Math.abs(constrainedPixel - snappedPixel) > 1) {
    showSnapIndicator.value = true
    updateSnapIndicator(snappedPixel, newMidi)
  } else {
    showSnapIndicator.value = false
  }

  // Mettre à jour la position en temps réel
  updateNoteData({
    ...(props.note.start !== undefined ? { start: newTime } : { time: newTime }),
    midi: newMidi
  })
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  showSnapIndicator.value = false

  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const startResize = (e) => {
  e.preventDefault()
  e.stopPropagation()

  isResizing.value = true
  dragStartX = e.clientX
  initialTime = props.note.start || props.note.time
  initialDuration = props.note.duration

  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

const onResize = (e) => {
  if (!isResizing.value) return

  const deltaX = e.clientX - dragStartX
  
  // Calculer la nouvelle position de fin en pixels
  const currentEndPixel = timeToPixelsWithSignatures(initialTime + initialDuration)
  const newEndPixel = Math.max(
    timeToPixelsWithSignatures(initialTime) + 8, // Largeur minimale
    currentEndPixel + deltaX
  )
  
  // Appliquer le snap si activé
  const snappedEndPixel = snapPixelsToGrid(newEndPixel)
  const newEndTime = pixelsToTimeWithSignatures(snappedEndPixel)
  let newDuration = newEndTime - initialTime
  
  // Contrainte minimale
  const minDuration = getMinNoteDuration(initialTime)
  newDuration = Math.max(minDuration, newDuration)

  // Appliquer le snap de durée si activé
  if (uiStore.snapToGrid) {
    newDuration = snapNoteDuration(initialTime, newDuration)
  }

  // Afficher l'indicateur de snap
  if (uiStore.snapToGrid && Math.abs(newEndPixel - snappedEndPixel) > 1) {
    showSnapIndicator.value = true
    // L'indicateur pourrait montrer la position de fin snappée
  } else {
    showSnapIndicator.value = false
  }

  // Mettre à jour la durée en temps réel
  updateNoteData({ duration: newDuration })
}

const stopResize = () => {
  if (!isResizing.value) return

  isResizing.value = false
  showSnapIndicator.value = false
  showResizeCursor.value = false

  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Mettre à jour l'indicateur de snap
const updateSnapIndicator = (snappedPixel, midi) => {
  const noteY = getMidiNotePosition(midi)
  const noteHeight = getNoteHeight() * 1.35
  
  snapIndicatorStyle.value = {
    left: snappedPixel + 'px',
    top: (noteY - (noteHeight - getNoteHeight()) / 2) + 'px',
    width: '2px',
    height: noteHeight + 'px'
  }
}

// Fonction pour mettre à jour les données de la note
const updateNoteData = (updates) => {
  const noteInStore = midiStore.notes.find(n => n.id === props.note.id)
  if (noteInStore) {
    Object.assign(noteInStore, updates)
  }
}

// Cleanup au démontage
import { onUnmounted } from 'vue'
onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.midi-note {
  position: absolute;
  border: 1px solid rgba(0,0,0,0.2);
  border-radius: 3px;
  cursor: grab;
  transition: box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  box-sizing: border-box;
  min-width: 8px;
}

.midi-note:hover {
  filter: brightness(1.1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.midi-note.selected {
  border-color: #2196F3;
  box-shadow: 0 0 8px rgba(33, 150, 243, 0.6);
  filter: brightness(1.2);
}

.midi-note.dragging {
  cursor: grabbing;
  z-index: 1000 !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.midi-note.resizing {
  cursor: ew-resize;
}

.note-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  pointer-events: none;
}

.note-name {
  font-size: 11px;
  font-weight: bold;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  background: rgba(255,255,255,0.2);
  cursor: ew-resize;
  border-radius: 0 2px 2px 0;
  transition: background-color 0.2s, width 0.2s;
}

.resize-handle.resize-hover,
.resize-handle:hover {
  background: rgba(255,255,255,0.4);
  width: 10px;
}

.midi-note.selected .resize-handle {
  background: rgba(255,255,255,0.3);
}

.snap-indicator {
  position: fixed;
  border: 2px solid #FF9800;
  background: rgba(255, 152, 0, 0.3);
  pointer-events: none;
  border-radius: 2px;
  z-index: 999;
  transition: all 0.1s ease;
}
</style>