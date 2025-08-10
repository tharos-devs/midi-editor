<template>
  <div class="piano-keys" :style="{ height: calculatedPianoHeight + 'px' }">
    <!-- Touches blanches d'abord -->
    <div
      v-for="(note, index) in whiteNotes"
      :key="'white-' + note.midi"
      class="piano-key white-key"
      :class="[
        isCNote(note.name) ? 'c-note' : '',
        activeNotes.has(note.midi) ? 'active' : ''
      ]"
      :style="whiteKeyStyle(note, index)"
      :note="note.name"
      @mousedown="handleMouseDown(note)"
      @mouseup="handleMouseUp(note)"
      @mouseleave="handleMouseLeave(note)"
    >
      <span class="note-label" v-if="isCNote(note.name)">{{ note.name }}</span>
    </div>

    <!-- Touches noires par-dessus -->
    <div
      v-for="note in blackNotes"
      :key="'black-' + note.midi"
      :class="[
        'piano-key black-key',
        activeNotes.has(note.midi) ? 'active' : ''
      ]"
      :style="blackKeyStyle(note)"
      :noteName="note.name"
      @mousedown="handleMouseDown(note)"
      @mouseup="handleMouseUp(note)"
      @mouseleave="handleMouseLeave(note)"
    >
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { usePianoPositioning } from '@/composables/usePianoPositioning'
import { useMidiManager } from '@/composables/useMidiManager'

const uiStore = useUIStore()
const midiStore = useMidiStore()
const midiManager = useMidiManager()

// Garder trace des notes actives pour pouvoir les arrêter
const activeNotes = ref(new Set())

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
  return /^C-?[0-9]+$/.test(noteName) // Inclure C-2, C-1, C0, C1, etc. (conformité DAW)
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

// Fonctions pour jouer les notes au clic
const playNote = (note) => {
  // Utiliser la piste sélectionnée ou la première piste disponible
  let targetTrackId = midiStore.selectedTrack
  
  if ((targetTrackId === null || targetTrackId === undefined) && midiStore.tracks.length > 0) {
    targetTrackId = midiStore.tracks[0].id
    console.log(`🎹 Aucune piste sélectionnée, utilisation de la première piste: ${targetTrackId}`)
  }
  
  if (targetTrackId === null || targetTrackId === undefined) {
    console.warn('⚠️ Aucune piste disponible pour jouer la note')
    return
  }

  console.log('🔍 DEBUG recherche piste:', {
    targetTrackId,
    tracksLength: midiStore.tracks.length,
    tracks: midiStore.tracks.map(t => ({ id: t.id, name: t.name, type: typeof t.id }))
  })

  const track = midiStore.tracks.find(t => t.id === targetTrackId)
  if (!track) {
    console.warn('⚠️ Piste introuvable:', targetTrackId)
    console.log('🔍 Comparaison détaillée:', midiStore.tracks.map(t => ({
      trackId: t.id,
      targetId: targetTrackId,
      match: t.id === targetTrackId,
      strictMatch: t.id === targetTrackId,
      typeTrack: typeof t.id,
      typeTarget: typeof targetTrackId
    })))
    return
  }

  // Paramètres MIDI de la piste
  const channel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))
  const outputId = track.midiOutput || 'default'
  const velocity = 90 // Vélocité fixe pour les clics

  // Envoyer noteOn
  const success = midiManager.sendNoteOn(outputId, channel, note.midi, velocity)
  
  if (success) {
    activeNotes.value.add(note.midi)
    console.log(`🎹 Note jouée: ${note.name} (MIDI ${note.midi}) sur canal ${channel + 1}, sortie ${outputId}`)
  } else {
    console.warn(`⚠️ Échec envoi noteOn: ${note.name}`)
  }
}

const stopNote = (note) => {
  if (!activeNotes.value.has(note.midi)) return

  // Utiliser la piste sélectionnée ou la première piste disponible
  let targetTrackId = midiStore.selectedTrack
  if ((targetTrackId === null || targetTrackId === undefined) && midiStore.tracks.length > 0) {
    targetTrackId = midiStore.tracks[0].id
  }
  if (targetTrackId === null || targetTrackId === undefined) return

  const track = midiStore.tracks.find(t => t.id === targetTrackId)
  if (!track) return

  const channel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))
  const outputId = track.midiOutput || 'default'

  // Envoyer noteOff
  const success = midiManager.sendNoteOff(outputId, channel, note.midi)
  
  if (success) {
    activeNotes.value.delete(note.midi)
    console.log(`🎹 Note arrêtée: ${note.name} (MIDI ${note.midi})`)
  }
}

// Gestionnaires d'événements
const handleMouseDown = (note) => {
  playNote(note)
}

const handleMouseUp = (note) => {
  stopNote(note)
}

const handleMouseLeave = (note) => {
  // Arrêter la note si on sort de la touche
  stopNote(note)
}

// Cleanup au démontage du composant
onUnmounted(() => {
  // Arrêter toutes les notes actives
  let targetTrackId = midiStore.selectedTrack
  if ((targetTrackId === null || targetTrackId === undefined) && midiStore.tracks.length > 0) {
    targetTrackId = midiStore.tracks[0].id
  }
  
  if (targetTrackId) {
    const track = midiStore.tracks.find(t => t.id === targetTrackId)
    if (track) {
      const channel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))
      const outputId = track.midiOutput || 'default'
      
      activeNotes.value.forEach(midiNote => {
        midiManager.sendNoteOff(outputId, channel, midiNote)
      })
      
      activeNotes.value.clear()
      console.log('🧹 Notes actives nettoyées au démontage de PianoKeys')
    }
  }
})
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

.white-key.active {
  background: #e0e8ff;
  transform: scale(0.98);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
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

.black-key.active {
  background: #4a90e2;
  transform: scale(0.98);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
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