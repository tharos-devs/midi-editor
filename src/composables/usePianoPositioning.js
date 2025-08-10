// composables/usePianoPositioning.js
import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'

export function usePianoPositioning() {
  const uiStore = useUIStore()

  // Configuration des notes
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const blackKeys = [1, 3, 6, 8, 10] // C#, D#, F#, G#, A#

  // Hauteur uniforme pour toutes les lignes de notes
  const noteLineHeight = computed(() => uiStore.keyHeight + (uiStore.keyHeight / 3))

  // Calculer toutes les notes MIDI avec leurs propriétés (de haut en bas : 127 -> 0)
  const allMidiNotes = computed(() => {
    const notes = []
    for (let midi = 127; midi >= 0; midi--) {
      const octave = Math.floor(midi / 12) - 2 // CORRECTION: C-1 → C-2 pour conformité DAW (middle C = C3)
      const noteIndex = midi % 12
      const noteName = noteNames[noteIndex]
      const isBlack = blackKeys.includes(noteIndex)

      notes.push({
        midi,
        name: `${noteName}${octave}`,
        isBlack,
        noteIndex,
        octave
      })
    }
    return notes
  })

  // Filtrer les notes blanches et noires
  const whiteNotes = computed(() => {
    return allMidiNotes.value.filter(note => !note.isBlack)
  })

  const blackNotes = computed(() => {
    return allMidiNotes.value.filter(note => note.isBlack)
  })

  // Calculer la hauteur totale du piano : chaque note MIDI a sa propre ligne
  const calculatedPianoHeight = computed(() => {
    return 128 * noteLineHeight.value // 128 notes MIDI (0-127)
  })

  // Fonction pour obtenir la position Y d'une ligne de note MIDI (position du haut de la ligne)
  const getNoteLinePosition = (midi) => {
    // Les notes sont ordonnées de haut en bas : MIDI 127 en haut (Y=0), MIDI 0 en bas
    const indexFromTop = 127 - midi
    return indexFromTop * noteLineHeight.value
  }

  // Fonction pour obtenir la position Y d'une note MIDI (centre de la ligne pour la note)
  const getMidiNotePosition = (midi) => {
    const linePosition = getNoteLinePosition(midi)
    // Centrer la note dans la ligne
    const noteHeight = uiStore.keyHeight
    const padding = (noteLineHeight.value - noteHeight) / 2
    return linePosition + padding
  }

  // Fonction pour convertir une position Y en note MIDI
  const yToMidiNote = (y) => {
    // Calculer l'index de ligne depuis le haut
    const lineIndex = Math.floor(y / noteLineHeight.value)
    // Convertir en note MIDI
    const midi = 127 - lineIndex
    return Math.max(0, Math.min(127, midi))
  }

  // Fonction pour obtenir le nom d'une note
  const getNoteName = (midi) => {
    const octave = Math.floor(midi / 12) - 2 // CORRECTION: C-1 → C-2 pour conformité DAW (middle C = C3)
    const noteIndex = midi % 12
    return `${noteNames[noteIndex]}${octave}`
  }

  // Fonction pour obtenir la hauteur d'une note (toujours keyHeight)
  const getNoteHeight = () => {
    return uiStore.keyHeight
  }

  return {
    // Configuration
    noteNames,
    blackKeys,
    noteLineHeight,

    // Notes calculées
    allMidiNotes,
    whiteNotes,
    blackNotes,
    calculatedPianoHeight,

    // Fonctions de positionnement
    getNoteLinePosition,
    getMidiNotePosition,
    getNoteHeight,
    yToMidiNote,
    getNoteName
  }
}