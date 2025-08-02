<template>
  <div 
    class="piano-grid" 
    :style="gridStyle"
    ref="containerRef"
    @mousedown="onContainerMouseDown"
    @mousemove="onContainerMouseMove"
    @mouseup="onContainerMouseUp"
    @mouseleave="onContainerMouseLeave"
  >
    <!-- Couche de fond avec les lignes - en position absolue pour dépasser les limites -->
    <div class="grid-background-fixed" :style="gridBackgroundStyle">
      <!-- Lignes horizontales pour TOUTES les notes MIDI (une ligne par note) -->
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
      ></div>

      <!-- Lignes verticales (mesures) - TOUJOURS affichées -->
      <div
        v-for="measure in measures"
        :key="`measure-${measure.number}`"
        class="measure-line"
        :class="{ 'signature-change': measure.signatureChange }"
        :style="{
          left: measure.startPixel + 'px',
          height: calculatedPianoHeight + 'px',
          top: '0px'
        }"
        :title="measure.signatureChange ? `Mesure ${measure.number} - ${measure.timeSignature.numerator}/${measure.timeSignature.denominator}` : `Mesure ${measure.number}`"
      ></div>

      <!-- Lignes verticales (temps/beats) avec signatures rythmiques dynamiques -->
      <template v-for="measure in measures" :key="`beats-container-${measure.number}`">
        <div
          v-for="beatIndex in (measure.beatsCount - 1)"
          :key="`beat-${measure.number}-${beatIndex + 1}`"
          class="beat-line"
          :style="{
            left: (measure.startPixel + beatIndex * measure.beatWidth) + 'px',
            height: calculatedPianoHeight + 'px',
            top: '0px'
          }"
          :title="`Mesure ${measure.number}, Temps ${beatIndex + 1}`"
        ></div>
      </template>

      <!-- Debug: Afficher les données des mesures -->
      <div v-if="showDebug" class="debug-info" style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; z-index: 1000;">
        <div>Nombre de mesures: {{ measures.length }}</div>
        <div v-for="measure in measures.slice(0, 3)" :key="`debug-${measure.number}`">
          Mesure {{ measure.number }}: beats={{ measure.beatsCount }}, beatWidth={{ measure.beatWidth }}, startPixel={{ measure.startPixel }}
        </div>
      </div>
    </div>

    <!-- Notes MIDI utilisant le composant mis à jour -->
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
    ></div>

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
        Ctrl+clic: sélection multiple • Shift+clic: étendre sélection • Clic+glisser: lasso
      </small>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, provide, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { usePianoPositioning } from '@/composables/usePianoPositioning'
import { useMultiSelection } from '@/composables/useMultiSelection'
import MidiNote from '@/components/MidiNote.vue'

const midiStore = useMidiStore()
const uiStore = useUIStore()
const multiSelection = useMultiSelection()

// Fournir le composable aux composants enfants
provide('multiSelection', multiSelection)

// Debug flag - activez temporairement pour voir les données
const showDebug = ref(false) // Changez à true pour activer le debug

// Utiliser le composable centralisé pour les signatures rythmiques
const timeSignatureComposable = useTimeSignature()

// Utiliser le nouveau composable pour le positionnement du piano
const {
  allMidiNotes,
  noteLineHeight,
  calculatedPianoHeight,
  getNoteLinePosition
} = usePianoPositioning()

// Refs pour le conteneur et les éléments des notes
const containerRef = ref(null)
const noteElements = ref(new Map())

// Variable pour détecter si on traîne une note
let isDraggingNote = false

// Utiliser les mesures avec signatures rythmiques au lieu des lignes fixes
const measures = computed(() => {
  const result = timeSignatureComposable?.measuresWithSignatures?.value || []
  return result
})

const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

// ADAPTATION AU NOUVEAU STORE MIDI
// Remplacer getSelectedTrackNotes par une computed qui utilise les nouvelles getters
const selectedTrackNotes = computed(() => {
  // Si aucune piste sélectionnée, retourner un tableau vide
  if (midiStore.selectedTrack === null) {
    return []
  }
  
  // Utiliser la nouvelle getter getTrackNotes du store
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

// Enregistrer les éléments des notes pour la sélection lasso
const registerNoteElement = (noteId, element) => {
  if (element) {
    noteElements.value.set(noteId, element)
  } else {
    noteElements.value.delete(noteId)
  }
}

// Gestionnaire de clic sur le conteneur
const onContainerMouseDown = (event) => {
  // Vérifier si on clique sur une note
  const clickedElement = event.target.closest('.midi-note')
  if (clickedElement) {
    isDraggingNote = true
    return
  }

  // Si on clique dans une zone vide
  isDraggingNote = false

  // Gérer la sélection
  const isMultiSelect = event.ctrlKey || event.metaKey
  const isShiftSelect = event.shiftKey

  if (!isMultiSelect && !isShiftSelect) {
    // Clic normal dans le vide : désélectionner tout
    multiSelection.clearSelection()
  }

  // Démarrer la sélection lasso seulement si pas de modificateur ou avec Shift
  if (!isMultiSelect) {
    multiSelection.startLasso(event)
    
    // Empêcher la sélection de texte et le comportement par défaut
    event.preventDefault()
    document.body.style.userSelect = 'none'
  }
}

const onContainerMouseMove = (event) => {
  // Seulement si le lasso est actif et qu'on ne traîne pas une note
  if (multiSelection.isLassoActive.value && !isDraggingNote) {
    multiSelection.updateLasso(event)
  }
}

const onContainerMouseUp = (event) => {
  // Seulement si le lasso est actif et qu'on ne traîne pas une note
  if (multiSelection.isLassoActive.value && !isDraggingNote) {
    // Finaliser la sélection lasso
    const keepExisting = event.shiftKey
    multiSelection.endLasso(event, noteElements.value, keepExisting)
    
    // Restaurer le curseur
    document.body.style.userSelect = ''
  }
  
  // Reset du flag de traînage de note
  isDraggingNote = false
}

const onContainerMouseLeave = (event) => {
  // Annuler le lasso si on sort du conteneur et que le lasso est actif
  if (multiSelection.isLassoActive.value && !isDraggingNote) {
    multiSelection.cancelLasso()
    document.body.style.userSelect = ''
  }
}

// Fonction pour effacer la sélection
const clearSelection = () => {
  multiSelection.clearSelection()
}

// Gestionnaires de raccourcis clavier
const handleKeyDown = (event) => {
  // Échapper pour annuler la sélection
  if (event.key === 'Escape') {
    multiSelection.clearSelection()
    if (multiSelection.isLassoActive.value) {
      multiSelection.cancelLasso()
      document.body.style.userSelect = ''
    }
  }
  
  // Ctrl+A pour sélectionner toutes les notes
  if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
    event.preventDefault()
    const allNoteIds = selectedTrackNotes.value.map(note => note.id)
    multiSelection.clearSelection()
    multiSelection.addNotesToSelection(allNoteIds)
  }
  
  // Suppr pour supprimer les notes sélectionnées
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const selectedNoteIds = multiSelection.getSelectedNotes()
    if (selectedNoteIds.length > 0) {
      event.preventDefault()
      // Ici vous pouvez ajouter la logique pour supprimer les notes
      // midiStore.deleteNotes(selectedNoteIds)
      multiSelection.clearSelection()
    }
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.body.style.userSelect = ''
})
</script>

<style scoped>
.piano-grid {
  position: relative;
  background: var(--panel-bg);
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

/* Les couleurs des touches du piano ne sont pas modifiées */
.white-note-line {
  background: var(--piano-white-key-bg, rgba(255, 255, 255, 0.9));
}

.black-note-line {
  background: var(--piano-black-key-bg, rgba(240, 240, 240, 0.9));
}

.measure-line {
  position: absolute;
  top: 0;
  border-left: 2px solid var(--timeline-measure, #666);
  pointer-events: none;
  z-index: 2;
}



.beat-line {
  position: absolute;
  top: 0;
  border-left: 1px solid var(--piano-beat-line, #ccc);
  pointer-events: none;
  z-index: 2;
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
  max-width: 300px;
}

/* Curseur pendant la sélection lasso */
.piano-grid.lasso-active {
  cursor: crosshair;
}
</style>