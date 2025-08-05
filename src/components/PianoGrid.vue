<template>
  <div 
    class="piano-grid" 
    :style="gridStyle"
    ref="containerRef"
    @mousedown="onContainerMouseDown"
    @mousemove="onContainerMouseMove"
    @mouseup="onContainerMouseUp"
    @mouseleave="onContainerMouseLeave"
    @dblclick="onContainerDoubleClick"
    @wheel="onWheel"
  >
    <!-- Couche de fond avec les lignes horizontales uniquement -->
    <div class="grid-background-fixed" :style="gridBackgroundStyle">
      <!-- Lignes horizontales pour TOUTES les notes MIDI -->
      <div
        v-for="note in allMidiNotes"
        :key="note.midi"
        class="note-line"
        :class="{
          'white-note-line': !note.isBlack,
          'black-note-line': note.isBlack
        }"
        :style="{
          top: getNoteLinePosition(note.midi) + 'px',
          height: noteLineHeight + 'px',
          width: totalWidth + 'px',
          left: '0px'
        }"
        :title="note.name"
      />
    </div>

    <!-- GridRenderer pour les lignes verticales -->
    <GridRenderer
      :showMeasureLines="true"
      :showBeatLines="true"
      :showSignatureIndicators="false"
      :showMeasureNumbers="false"
    >
      <!-- Curseur de lecture GLOBAL -->
      <GlobalPlaybackCursor
        :container-height="calculatedPianoHeight"
        :show-debug-info="false"
      />

    </GridRenderer>

    <!-- Notes MIDI -->
    <div class="notes-layer">
      <MidiNote
        v-for="note in selectedTrackNotes"
        :key="note.id"
        :note="note"
        @register-element="registerNoteElement"
      />
    </div>

    <!-- Rectangle de sélection lasso -->
    <div 
      v-if="multiSelection.isLassoActive.value"
      class="lasso-rectangle"
      :style="multiSelection.lassoStyle.value"
    />

    <!-- Informations de sélection -->
    <div 
      v-if="multiSelection.hasMultipleSelection.value" 
      class="selection-info"
    >
      {{ multiSelection.selectedNotes.value.size }} notes sélectionnées
      <button @click="clearSelection" class="clear-selection-btn">×</button>
    </div>

    <!-- Raccourcis clavier (info) -->
    <div v-if="multiSelection.selectedNotes.value.size > 0" class="keyboard-shortcuts">
      <small>
        Ctrl+clic: sélection multiple • Shift+clic: étendre sélection • Clic+glisser: lasso • Double-clic: ajouter note
      </small>
    </div>

    <!-- Debug info (conservé) -->
    <div v-if="showDebug" class="debug-info" style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; z-index: 1000;">
      <div>GridRenderer utilisé pour les lignes verticales</div>
    </div>
  </div>
</template>

<script setup>
import { provide, computed, ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { usePianoPositioning } from '@/composables/usePianoPositioning'
import { useMultiSelection } from '@/composables/useMultiSelection'
import { useSnapLogic } from '@/composables/useSnapLogic'
import MidiNote from '@/components/MidiNote.vue'
import GridRenderer from '@/components/GridRenderer.vue'
import GlobalPlaybackCursor from '@/components/GlobalPlaybackCursor.vue'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

const midiStore = useMidiStore()
const uiStore = useUIStore()
const multiSelection = useMultiSelection()
const cursorStore = usePlaybackCursorStore()

const showDebug = ref(false)
const timeSignatureComposable = useTimeSignature()

const {
  allMidiNotes,
  noteLineHeight,
  calculatedPianoHeight,
  getNoteLinePosition,
  yToMidiNote,
  getNoteName
} = usePianoPositioning()

const {
  pixelsToTimeWithSignatures,
  timeToPixelsWithSignatures
} = timeSignatureComposable

const {
  snapTimeToGrid,
  getMinNoteDuration
} = useSnapLogic()

const containerRef = ref(null)
const noteElements = ref(new Map())

let isLassoInProgress = false
let isDraggingNote = false

const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

const timeToPixel = computed(() => {
  // Utiliser la fonction qui prend en compte les signatures temporelles et changements de tempo
  return timeToPixelsWithSignatures || ((timeInSeconds) => {
    if (!timeInSeconds || timeInSeconds < 0) return 0
    const duration = midiStore.getTotalDuration || 1
    return (timeInSeconds / duration) * totalWidth.value
  })
})

const selectedTrackNotes = computed(() => {
  if (midiStore.selectedTrack === null) {
    return []
  }
  return midiStore.getTrackNotes(midiStore.selectedTrack)
})

const gridStyle = computed(() => ({
  width: totalWidth.value + 'px',
  height: calculatedPianoHeight.value + 'px'
}))

const gridBackgroundStyle = computed(() => ({
  width: totalWidth.value + 'px',
  height: calculatedPianoHeight.value + 'px'
}))

// Fonction pour créer une nouvelle note au double-clic
const onContainerDoubleClick = (event) => {
  // Empêcher la propagation pour éviter les conflits
  event.preventDefault()
  event.stopPropagation()

  // Ne pas créer de note si aucune piste n'est sélectionnée
  if (midiStore.selectedTrack === null) {
    console.warn('Aucune piste sélectionnée pour ajouter une note')
    return
  }

  // Calculer la position de la souris relative au conteneur
  const containerRect = containerRef.value.getBoundingClientRect()
  const relativeX = event.clientX - containerRect.left
  const relativeY = event.clientY - containerRect.top

  // Convertir la position X en temps
  let noteTime = pixelsToTimeWithSignatures(relativeX)
  
  // Appliquer le snap si activé
  if (uiStore.snapToGrid) {
    noteTime = snapTimeToGrid(noteTime)
  }

  // S'assurer que le temps est positif
  noteTime = Math.max(0, noteTime)

  // Convertir la position Y en note MIDI
  const midiNumber = yToMidiNote(relativeY)
  
  // Valider que la note MIDI est dans la plage valide
  if (midiNumber < 0 || midiNumber > 127) {
    console.warn('Note MIDI hors de la plage valide:', midiNumber)
    return
  }

  // Obtenir la durée minimale pour cette position temporelle
  const minDuration = getMinNoteDuration(noteTime)
  
  // Durée par défaut : une noire (1 beat)
  const currentTempo = midiStore.getCurrentTempo
  const defaultDuration = 60 / currentTempo // Durée d'une noire en secondes
  
  // Utiliser la durée la plus grande entre le minimum et la durée par défaut
  const noteDuration = Math.max(minDuration, defaultDuration)

  // Obtenir les informations de la piste sélectionnée
  const selectedTrack = midiStore.getTrackById(midiStore.selectedTrack)
  
  // Créer les données de la nouvelle note
  const newNoteData = {
    trackId: midiStore.selectedTrack,
    midi: midiNumber,
    time: noteTime,
    duration: noteDuration,
    velocity: 64, // Vélocité par défaut
    name: getNoteName(midiNumber),
    channel: selectedTrack?.channel || 0
  }

  // Ajouter la note au store
  const newNoteId = midiStore.addNote(newNoteData)
  
  if (newNoteId) {
    /*
    console.log(`🎵 Nouvelle note créée:`, {
      id: newNoteId,
      midi: midiNumber,
      name: getNoteName(midiNumber),
      time: noteTime.toFixed(3),
      duration: noteDuration.toFixed(3),
      track: selectedTrack?.name || `Track ${midiStore.selectedTrack}`
    })
    */
    // Sélectionner la note nouvellement créée
    multiSelection.selectNote(newNoteId)
  } else {
    console.error('Erreur lors de la création de la note')
  }
}

// ... Le reste du code reste identique
const registerNoteElement = (noteId, element) => {
  if (element) {
    noteElements.value.set(noteId, element)
  } else {
    noteElements.value.delete(noteId)
  }
}

const onContainerMouseDown = (event) => {
  const clickedElement = event.target.closest('.midi-note')
  if (clickedElement) {
    isDraggingNote = true
    return
  }

  isDraggingNote = false
  const isMultiSelect = event.ctrlKey || event.metaKey
  const isShiftSelect = event.shiftKey

  if (!isMultiSelect && !isShiftSelect) {
    multiSelection.clearSelection()
  }

  if (!isMultiSelect) {
    isLassoInProgress = true
    multiSelection.startLasso(event)
    event.preventDefault()
    document.body.style.userSelect = 'none'
  }
}

const onContainerMouseMove = (event) => {
  if (isLassoInProgress && !isDraggingNote) {
    multiSelection.updateLasso(event)
    updateLassoSelection(event, false)
  }
}

const onContainerMouseUp = (event) => {
  if (isLassoInProgress && !isDraggingNote) {
    const keepExisting = event.shiftKey
    updateLassoSelection(event, true, keepExisting)
    multiSelection.endLasso(event, noteElements.value, keepExisting)
    isLassoInProgress = false
    document.body.style.userSelect = ''
  }
  isDraggingNote = false
}

const onContainerMouseLeave = (event) => {
  if (isLassoInProgress) {
    multiSelection.cancelLasso()
    isLassoInProgress = false
    document.body.style.userSelect = ''
  }
}

const updateLassoSelection = (event, finalize = false, keepExisting = false) => {
  if (!multiSelection.isLassoActive.value) return

  const containerRect = containerRef.value.getBoundingClientRect()
  
  const lassoRect = {
    left: Math.min(multiSelection.lassoStart.value.x, event.clientX),
    top: Math.min(multiSelection.lassoStart.value.y, event.clientY),
    right: Math.max(multiSelection.lassoStart.value.x, event.clientX),
    bottom: Math.max(multiSelection.lassoStart.value.y, event.clientY)
  }

  const notesInLasso = []
  
  noteElements.value.forEach((element, noteId) => {
    if (!element) return

    const noteRect = element.getBoundingClientRect()
    
    const intersects = !(
      noteRect.right < lassoRect.left ||
      noteRect.left > lassoRect.right ||
      noteRect.bottom < lassoRect.top ||
      noteRect.top > lassoRect.bottom
    )

    if (intersects) {
      notesInLasso.push(noteId)
    }
  })

  if (finalize) {
    if (!keepExisting) {
      multiSelection.clearSelection()
    }
    
    notesInLasso.forEach(noteId => {
      if (!multiSelection.isNoteSelected(noteId)) {
        multiSelection.toggleNoteSelection(noteId, true)
      }
    })
  }
}

const clearSelection = () => {
  multiSelection.clearSelection()
}

// Gestion wheel spécifique à PianoGrid - SEULEMENT scroll vertical
function onWheel(event) {
  const deltaX = event.deltaX
  const deltaY = event.deltaY
  
  // Déterminer si c'est un scroll horizontal ou vertical
  const isHorizontalScroll = Math.abs(deltaX) > Math.abs(deltaY)
  
  if (isHorizontalScroll) {
    // Scroll horizontal - NE PAS gérer, laisser WheelHandler global s'occuper
    return
  } else {
    // Scroll vertical - PianoGrid gère sa propre navigation dans les notes
    // NE PAS faire event.preventDefault() pour laisser le scroll naturel
    console.log('🎼 PianoGrid scroll vertical:', deltaY)
    
    // Le comportement de scroll vertical est naturel (pas besoin de code supplémentaire)
    // Le navigateur appliquera automatiquement le scroll sur le conteneur avec overflow-y
  }
}

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    multiSelection.clearSelection()
    if (isLassoInProgress) {
      multiSelection.cancelLasso()
      isLassoInProgress = false
      document.body.style.userSelect = ''
    }
  }
  
  if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
    event.preventDefault()
    const allNoteIds = selectedTrackNotes.value.map(note => note.id)
    multiSelection.clearSelection()
    multiSelection.addNotesToSelection(allNoteIds)
  }
  
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const selectedNoteIds = multiSelection.getSelectedNotes()
    if (selectedNoteIds.length > 0) {
      event.preventDefault()
      
      // Supprimer toutes les notes sélectionnées
      selectedNoteIds.forEach(noteId => {
        midiStore.deleteNote(noteId)
      })
      
      multiSelection.clearSelection()
      // console.log(`🗑️ ${selectedNoteIds.length} note(s) supprimée(s)`)
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.body.style.userSelect = ''
})

provide('multiSelection', multiSelection)
provide('timeToPixel', timeToPixel)
provide('totalWidth', totalWidth)
</script>

<style scoped>
.piano-grid {
  position: relative;
  background: var(--panel-bg);
  cursor: crosshair;
}

.piano-grid:hover {
  cursor: crosshair;
}

.grid-background-fixed {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.note-line {
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  border-top: 1px solid var(--piano-beat-line);
  border-bottom: 1px solid var(--piano-beat-line);
}

.white-note-line {
  background: var(--piano-white-key-bg, rgba(255, 255, 255, 0.9));
}

.black-note-line {
  background: var(--piano-black-key-bg, rgba(240, 240, 240, 0.9));
}

/* Styles spécifiques pour les lignes de GridRenderer dans le piano */
:deep(.piano-measure-line) {
  border-left: 2px solid var(--timeline-measure, #666);
}

:deep(.piano-measure-line.signature-change) {
  border-left: 3px solid var(--timeline-signature, #d63384);
  box-shadow: 2px 0 4px var(--timeline-signature-shadow, rgba(214, 51, 132, 0.3));
}

:deep(.piano-beat-line) {
  border-left: 1px solid var(--piano-beat-line, #ccc);
}

.notes-layer {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}

.notes-layer > * {
  pointer-events: auto;
}

.debug-info {
  font-family: monospace;
  font-size: 12px;
  max-width: 400px;
  border-radius: 4px;
}

.lasso-rectangle {
  position: fixed;
  border: 2px dashed #2196F3;
  background: rgba(33, 150, 243, 0.1);
  pointer-events: none;
  z-index: 1000;
  border-radius: 2px;
}

.selection-info {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(33, 150, 243, 0.9);
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.clear-selection-btn {
  background: none;
  border: none;
  color: white;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.clear-selection-btn:hover {
  background: rgba(255,255,255,0.2);
}

.keyboard-shortcuts {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  z-index: 1001;
  max-width: 400px;
}

.piano-grid.lasso-active {
  cursor: crosshair;
}
</style>