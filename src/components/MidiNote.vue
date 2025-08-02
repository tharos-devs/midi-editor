<template>
  <div
    class="midi-note"
    :class="{
      selected: isSelected,
      'multi-selected': isSelected && hasMultipleSelection,
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
      <!-- Indicateur de sélection multiple -->
      <span v-if="isSelected && hasMultipleSelection" class="multi-indicator">{{ selectedCount }}</span>
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
import { ref, computed, inject } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { usePianoPositioning } from '@/composables/usePianoPositioning'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useSnapLogic } from '@/composables/useSnapLogic'

const props = defineProps({
  note: Object
})

const emit = defineEmits(['register-element'])

const uiStore = useUIStore()
const midiStore = useMidiStore()

// Injecter le composable de sélection multiple depuis le parent
const multiSelection = inject('multiSelection')

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
let initialSelectedNotes = []
let initialNotesData = new Map()

const isSelected = computed(() => {
  return multiSelection?.isNoteSelected(props.note.id) || false
})

const hasMultipleSelection = computed(() => {
  return multiSelection?.hasMultipleSelection.value || false
})

const selectedCount = computed(() => {
  return multiSelection?.selectedNotes.value.size || 0
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

// Enregistrer l'élément auprès du parent
const registerElement = () => {
  if (noteRef.value) {
    emit('register-element', props.note.id, noteRef.value)
  }
}

// Surveiller les changements de ref
import { watch, onMounted } from 'vue'
onMounted(() => {
  registerElement()
})

watch(noteRef, () => {
  registerElement()
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

  // Gestion de la sélection
  const isMultiSelect = e.ctrlKey || e.metaKey
  const isShiftSelect = e.shiftKey
  
  if (multiSelection) {
    if (isMultiSelect) {
      // Ctrl+clic : toggle la sélection de cette note
      multiSelection.toggleNoteSelection(props.note.id, true)
    } else if (isShiftSelect) {
      // Shift+clic : ajouter à la sélection existante
      if (!multiSelection.isNoteSelected(props.note.id)) {
        multiSelection.toggleNoteSelection(props.note.id, true)
      }
    } else {
      // Clic normal : sélectionner uniquement cette note si elle n'est pas déjà sélectionnée
      if (!multiSelection.isNoteSelected(props.note.id)) {
        multiSelection.selectNote(props.note.id)
      }
    }
  }

  // Commencer le drag seulement si pas de modificateur ou si la note est sélectionnée
  if (!isMultiSelect || multiSelection.isNoteSelected(props.note.id)) {
    startDrag(e)
  }
}

const startDrag = (e) => {
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  initialTime = props.note.start || props.note.time
  initialMidi = props.note.midi

  // Sauvegarder les données initiales de toutes les notes sélectionnées
  if (multiSelection) {
    initialSelectedNotes = multiSelection.getSelectedNotes()
    initialNotesData.clear()
    
    initialSelectedNotes.forEach(noteId => {
      const note = midiStore.notes.find(n => n.id === noteId)
      if (note) {
        initialNotesData.set(noteId, {
          time: note.start || note.time,
          midi: note.midi,
          duration: note.duration
        })
      }
    })
  }

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
}

const onDrag = (e) => {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStartX
  const deltaY = e.clientY - dragStartY

  // Calcul des deltas
  const currentNotePixel = timeToPixelsWithSignatures(initialTime)
  const newPixel = currentNotePixel + deltaX
  const constrainedPixel = Math.max(0, newPixel)
  const snappedPixel = snapPixelsToGrid(constrainedPixel)
  const newTime = pixelsToTimeWithSignatures(snappedPixel)
  
  const deltaMidi = Math.round(-deltaY / (noteLineHeight.value * uiStore.verticalZoom))
  const deltaTime = newTime - initialTime

  // Appliquer les changements à toutes les notes sélectionnées
  if (multiSelection && initialSelectedNotes.length > 0) {
    initialSelectedNotes.forEach(noteId => {
      const initialData = initialNotesData.get(noteId)
      if (initialData) {
        const newNoteTime = Math.max(0, initialData.time + deltaTime)
        const newNoteMidi = Math.max(0, Math.min(127, initialData.midi + deltaMidi))
        
        updateNoteData(noteId, {
          ...(props.note.start !== undefined ? { start: newNoteTime } : { time: newNoteTime }),
          midi: newNoteMidi
        })
      }
    })
  } else {
    // Fallback pour une seule note
    const newMidi = Math.max(0, Math.min(127, initialMidi + deltaMidi))
    updateNoteData(props.note.id, {
      ...(props.note.start !== undefined ? { start: newTime } : { time: newTime }),
      midi: newMidi
    })
  }

  // Afficher l'indicateur de snap
  if (uiStore.snapToGrid && Math.abs(constrainedPixel - snappedPixel) > 1) {
    showSnapIndicator.value = true
    updateSnapIndicator(snappedPixel, props.note.midi + deltaMidi)
  } else {
    showSnapIndicator.value = false
  }
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  showSnapIndicator.value = false
  initialSelectedNotes = []
  initialNotesData.clear()

  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const startResize = (e) => {
  e.preventDefault()
  e.stopPropagation()

  // Pour le redimensionnement, on ne travaille qu'avec les notes sélectionnées
  if (multiSelection && !multiSelection.isNoteSelected(props.note.id)) {
    multiSelection.selectNote(props.note.id)
  }

  isResizing.value = true
  dragStartX = e.clientX
  initialTime = props.note.start || props.note.time
  initialDuration = props.note.duration

  // Sauvegarder les durées initiales de toutes les notes sélectionnées
  if (multiSelection) {
    initialSelectedNotes = multiSelection.getSelectedNotes()
    initialNotesData.clear()
    
    initialSelectedNotes.forEach(noteId => {
      const note = midiStore.notes.find(n => n.id === noteId)
      if (note) {
        initialNotesData.set(noteId, {
          time: note.start || note.time,
          duration: note.duration
        })
      }
    })
  }

  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

const onResize = (e) => {
  if (!isResizing.value) return

  const deltaX = e.clientX - dragStartX
  
  // Calculer le ratio de changement basé sur la note courante
  const currentEndPixel = timeToPixelsWithSignatures(initialTime + initialDuration)
  const newEndPixel = Math.max(
    timeToPixelsWithSignatures(initialTime) + 8,
    currentEndPixel + deltaX
  )
  
  const snappedEndPixel = snapPixelsToGrid(newEndPixel)
  const newEndTime = pixelsToTimeWithSignatures(snappedEndPixel)
  let newDuration = newEndTime - initialTime
  
  const minDuration = getMinNoteDuration(initialTime)
  newDuration = Math.max(minDuration, newDuration)

  if (uiStore.snapToGrid) {
    newDuration = snapNoteDuration(initialTime, newDuration)
  }

  // Calculer le ratio de changement
  const durationRatio = newDuration / initialDuration

  // Appliquer le redimensionnement à toutes les notes sélectionnées
  if (multiSelection && initialSelectedNotes.length > 0) {
    initialSelectedNotes.forEach(noteId => {
      const initialData = initialNotesData.get(noteId)
      if (initialData) {
        let scaledDuration = initialData.duration * durationRatio
        const noteMinDuration = getMinNoteDuration(initialData.time)
        scaledDuration = Math.max(noteMinDuration, scaledDuration)
        
        if (uiStore.snapToGrid) {
          scaledDuration = snapNoteDuration(initialData.time, scaledDuration)
        }
        
        updateNoteData(noteId, { duration: scaledDuration })
      }
    })
  } else {
    updateNoteData(props.note.id, { duration: newDuration })
  }

  // Afficher l'indicateur de snap
  if (uiStore.snapToGrid && Math.abs(newEndPixel - snappedEndPixel) > 1) {
    showSnapIndicator.value = true
  } else {
    showSnapIndicator.value = false
  }
}

const stopResize = () => {
  if (!isResizing.value) return

  isResizing.value = false
  showSnapIndicator.value = false
  showResizeCursor.value = false
  initialSelectedNotes = []
  initialNotesData.clear()

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
const updateNoteData = (noteId, updates) => {
  const noteInStore = midiStore.notes.find(n => n.id === noteId)
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

.midi-note.multi-selected {
  border-color: #FF9800;
  box-shadow: 0 0 8px rgba(255, 152, 0, 0.6);
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
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
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

.multi-indicator {
  font-size: 9px;
  font-weight: bold;
  color: #FF9800;
  background: rgba(0,0,0,0.3);
  padding: 1px 3px;
  border-radius: 2px;
  margin-left: 2px;
  min-width: 12px;
  text-align: center;
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