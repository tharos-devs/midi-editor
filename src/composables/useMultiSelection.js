// useMultiSelection.js
import { ref, computed } from 'vue'
import { useMidiStore } from '@/stores/midi'

export function useMultiSelection() {
  const midiStore = useMidiStore()
  
  // États pour la sélection multiple
  const selectedNotes = ref(new Set())
  const isLassoActive = ref(false)
  const lassoStart = ref({ x: 0, y: 0 })
  const lassoEnd = ref({ x: 0, y: 0 })
  
  // Variables internes
  let lassoMinSize = 5 // Taille minimale pour éviter les sélections accidentelles
  
  // Style du rectangle de sélection lasso
  const lassoStyle = computed(() => {
    if (!isLassoActive.value) {
      return { display: 'none' }
    }
    
    const startX = lassoStart.value.x
    const startY = lassoStart.value.y
    const endX = lassoEnd.value.x
    const endY = lassoEnd.value.y
    
    const left = Math.min(startX, endX)
    const top = Math.min(startY, endY)
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)
    
    return {
      position: 'fixed',
      left: left + 'px',
      top: top + 'px',
      width: Math.max(2, width) + 'px',
      height: Math.max(2, height) + 'px',
      border: '2px dashed #2196F3',
      background: 'rgba(33, 150, 243, 0.1)',
      pointerEvents: 'none',
      zIndex: 1000
    }
  })
  
  // Vérifier si une note est sélectionnée
  const isNoteSelected = (noteId) => {
    return selectedNotes.value.has(noteId)
  }
  
  // Sélectionner/désélectionner une note
  const toggleNoteSelection = (noteId, multiSelect = false) => {
    if (!multiSelect) {
      selectedNotes.value.clear()
    }
    
    if (selectedNotes.value.has(noteId)) {
      selectedNotes.value.delete(noteId)
    } else {
      selectedNotes.value.add(noteId)
    }
    
    // Mettre à jour le store pour compatibilité
    if (selectedNotes.value.size === 1) {
      midiStore.selectedNote = Array.from(selectedNotes.value)[0]
    } else {
      midiStore.selectedNote = null
    }
  }
  
  // Sélectionner une note unique
  const selectNote = (noteId) => {
    selectedNotes.value.clear()
    selectedNotes.value.add(noteId)
    midiStore.selectedNote = noteId
  }
  
  // Désélectionner toutes les notes
  const clearSelection = () => {
    selectedNotes.value.clear()
    midiStore.selectedNote = null
  }
  
  // Ajouter plusieurs notes à la sélection
  const addNotesToSelection = (noteIds) => {
    noteIds.forEach(id => selectedNotes.value.add(id))
    
    if (selectedNotes.value.size === 1) {
      midiStore.selectedNote = Array.from(selectedNotes.value)[0]
    } else {
      midiStore.selectedNote = null
    }
  }
  
  // Démarrer la sélection lasso
  const startLasso = (event) => {
    isLassoActive.value = true
    lassoStart.value = { x: event.clientX, y: event.clientY }
    lassoEnd.value = { x: event.clientX, y: event.clientY }
  }
  
  // Mettre à jour la sélection lasso
  const updateLasso = (event) => {
    if (!isLassoActive.value) return
    
    lassoEnd.value = { x: event.clientX, y: event.clientY }
  }
  
  // Vérifier si le lasso est assez grand pour être considéré comme intentionnel
  const isLassoSignificant = () => {
    const width = Math.abs(lassoEnd.value.x - lassoStart.value.x)
    const height = Math.abs(lassoEnd.value.y - lassoStart.value.y)
    return width > lassoMinSize || height > lassoMinSize
  }
  
  // Terminer la sélection lasso et sélectionner les notes
  const endLasso = (event, noteElements, keepExisting = false) => {
    if (!isLassoActive.value) {
      return
    }
    
    // D'abord, désactiver le lasso
    isLassoActive.value = false
    
    // Vérifier si le lasso est assez significatif
    if (!isLassoSignificant()) {
      return
    }
    
    const lassoRect = {
      left: Math.min(lassoStart.value.x, lassoEnd.value.x),
      top: Math.min(lassoStart.value.y, lassoEnd.value.y),
      right: Math.max(lassoStart.value.x, lassoEnd.value.x),
      bottom: Math.max(lassoStart.value.y, lassoEnd.value.y)
    }
    
    // Trouver les notes dans la zone de sélection
    const notesInLasso = []
    noteElements.forEach((element, noteId) => {
      if (!element) return
      
      const rect = element.getBoundingClientRect()
      const noteRect = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      }
      
      // Vérifier si la note intersecte avec le lasso
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
    
    // Mettre à jour la sélection
    if (!keepExisting) {
      selectedNotes.value.clear()
    }
    
    notesInLasso.forEach(noteId => {
      selectedNotes.value.add(noteId)
    })
    
    // Mettre à jour le store
    if (selectedNotes.value.size === 1) {
      midiStore.selectedNote = Array.from(selectedNotes.value)[0]
    } else {
      midiStore.selectedNote = null
    }
  }
  
  // Annuler la sélection lasso
  const cancelLasso = () => {
    isLassoActive.value = false
  }
  
  // Obtenir toutes les notes sélectionnées
  const getSelectedNotes = () => {
    return Array.from(selectedNotes.value)
  }
  
  // Vérifier si plusieurs notes sont sélectionnées
  const hasMultipleSelection = computed(() => {
    return selectedNotes.value.size > 1
  })
  
  return {
    // États
    selectedNotes: computed(() => selectedNotes.value),
    isLassoActive,
    lassoStyle,
    hasMultipleSelection,
    lassoStart,
    lassoEnd,
    
    // Méthodes
    isNoteSelected,
    toggleNoteSelection,
    selectNote,
    clearSelection,
    addNotesToSelection,
    startLasso,
    updateLasso,
    endLasso,
    cancelLasso,
    getSelectedNotes,
    isLassoSignificant
  }
}