<template>
  <div class="piano-keys" :style="{ height: calculatedPianoHeight + 'px' }">
    <!-- Touches blanches d'abord -->
    <div
      v-for="(note, index) in whiteNotes"
      :key="'white-' + note.midi"
      class="piano-key white-key"
      :class="isCNote(note.name) ? 'c-note' : ''"
      :style="whiteKeyStyle(note, index)"
      :note="note.name"
    >
      <span class="note-label" v-if="isCNote(note.name)">{{ note.name }}</span>
    </div>

    <!-- Touches noires par-dessus -->
    <div
      v-for="note in blackNotes"
      :key="'black-' + note.midi"
      class="piano-key black-key"
      :style="blackKeyStyle(note)"
      :noteName="note.name"
    >
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import { usePianoPositioning } from '@/composables/usePianoPositioning'

const uiStore = useUIStore()

// Utiliser le même composable que PianoGrid
const {
  allMidiNotes,
  whiteNotes,
  blackNotes,
  calculatedPianoHeight,
  getNoteLinePosition,
  noteLineHeight,
  getNoteName
} = usePianoPositioning()

const isCNote = (noteName) => {
  return /^C-?[0-9]+$/.test(noteName) // Inclure C-1, C0, C1, C2, etc.
}

const whiteKeyStyle = (note, index) => {
  // Dans whiteNotes, l'index 0 est la note la plus aiguë, le dernier index la plus grave
  const totalWhiteKeys = whiteNotes.value.length
  const keyIndexFromBottom = totalWhiteKeys - 1 - index // Inverser pour avoir 0 en bas
  
  // Hauteur d'une touche blanche : diviser la hauteur totale par le nombre de touches blanches
  const whiteKeyHeight = calculatedPianoHeight.value / totalWhiteKeys
  
  // Position depuis le bas
  const bottomPosition = keyIndexFromBottom * whiteKeyHeight
  const topPosition = calculatedPianoHeight.value - bottomPosition - whiteKeyHeight
  
  return {
    top: topPosition + 'px',
    height: whiteKeyHeight + 'px',
    left: '0px',
    width: '100%',
    zIndex: 1
  }
}

const blackKeyStyle = (note) => {
  // Les touches noires gardent leur position basée sur les lignes MIDI
  const linePosition = getNoteLinePosition(note.midi)
  
  return {
    top: linePosition + 'px',
    height: noteLineHeight.value + 'px',
    left: '0px',
    width: '60%',
    zIndex: 2
  }
}
</script>

<style scoped>
.piano-keys {
  position: relative;
  width: 100%;
  background: var(--piano-bg, #23272b); /* fond général du panneau */
}

.piano-key {
  position: absolute;
  border: 1px solid var(--piano-key-border, #444);
  display: flex;
  align-items: center;
  cursor: pointer;
  box-sizing: border-box;
}

/* Touches blanches : couleurs réalistes, non modifiées par le thème */
.white-key {
  background: #fff;
  border-color: #ddd;
}

.white-key:hover {
  background: #f0f0f0;
}

/* Touches noires : couleurs réalistes, non modifiées par le thème */
.black-key {
  background: #222;
  border-color: #000;
  border-radius: 0 3px 3px 0;
}

.black-key:hover {
  background: #444;
}

.note-label {
  font-size: 13px;
  color: var(--piano-label, #b0b0b0);
  padding-right: 8px;
  padding-bottom: 4px;
  margin-left: auto;
  align-self: flex-end;
  user-select: none;
}

/* Indicateur pour les C */
.c-note {
  background-color: var(--piano-c-note-bg, #ecf3f9);
}
</style>