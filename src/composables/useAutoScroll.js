// composables/useAutoScroll.js
import { nextTick } from 'vue'
import { usePianoPositioning } from '@/composables/usePianoPositioning'
import { useUIStore } from '@/stores/ui'

export function useAutoScroll() {
  const { getNoteLinePosition, noteLineHeight } = usePianoPositioning()
  const uiStore = useUIStore()

  /**
   * Centre automatiquement la vue sur les notes d'une piste
   * @param {Array} notes - Les notes MIDI de la piste
   * @param {HTMLElement} scrollContainer - L'élément de scroll (.piano-grid-scroll)
   */
  const scrollToNotes = async (notes, scrollContainer) => {
    if (!notes || notes.length === 0 || !scrollContainer) {
      console.warn('❌ scrollToNotes: conditions non remplies')
      return
    }

    // Attendre que le DOM soit mis à jour
    await nextTick()

    // Trouver les notes les plus hautes et plus basses
    const midiNumbers = notes.map(note => note.midi).filter(midi => midi != null)
    
    if (midiNumbers.length === 0) {
      console.warn('❌ Aucune note MIDI valide trouvée')
      return
    }

    const highestNote = Math.max(...midiNumbers)
    const lowestNote = Math.min(...midiNumbers)

    // Calculer les positions en pixels
    const highestNotePosition = getNoteLinePosition(highestNote)
    const lowestNotePosition = getNoteLinePosition(lowestNote)

    // Calculer la position centrale
    const centerPosition = (highestNotePosition + lowestNotePosition) / 2

    // Obtenir la hauteur visible du conteneur
    const containerHeight = scrollContainer.clientHeight

    // Calculer la position de scroll pour centrer la vue
    const targetScrollTop = centerPosition - (containerHeight / 2)

    // SOLUTION: Désactiver temporairement la synchronisation du scroll
    const originalSyncFunction = uiStore.syncFunctions?.syncVerticalScroll
    
    // Scroller tous les éléments synchronisés en même temps
    const syncScrollElements = document.querySelectorAll('.sync-scroll-y')
    
    const finalScrollTop = Math.max(0, targetScrollTop)
    
    // Appliquer le scroll à tous les éléments synchronisés
    syncScrollElements.forEach((element, index) => {
       element.scrollTo({
        top: finalScrollTop,
        behavior: 'smooth'
      })
    })
  }

  /**
   * Centre la vue sur une note spécifique
   * @param {number} midiNote - Le numéro MIDI de la note
   * @param {HTMLElement} scrollContainer - L'élément de scroll
   */
const scrollToNote = async (midiNote, scrollContainer) => {
    if (midiNote == null || !scrollContainer) {
      return
    }

    await nextTick()

    const notePosition = getNoteLinePosition(midiNote)
    const containerHeight = scrollContainer.clientHeight
    const targetScrollTop = notePosition - (containerHeight / 2)

    scrollContainer.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    })
  }

  return {
    scrollToNotes,
    scrollToNote
  }
}
