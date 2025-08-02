// stores/ui.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
  // Dimensions des panneaux
  const trackListWidth = ref(300)
  const pianoKeysWidth = ref(80)
  const midiLanesHeight = ref(150)

  // Zoom
  const horizontalZoom = ref(1) // Zoom largeur (TimeLine, PianoGrid, MidiLanes)
  const verticalZoom = ref(1)   // Zoom hauteur (PianoKeys, PianoGrid)

  // Scroll positions
  const horizontalScrollPosition = ref(0)
  const verticalScrollPosition = ref(0)

  // Timeline settings (DEPRECATED - utiliser useTimeSignature à la place)
  const beatsPerMeasure = ref(4)
  const beatNote = ref(4) // 4 = quarter note
  const pixelsPerBeat = computed(() => 96 * horizontalZoom.value)
  const pixelsPerMeasure = computed(() => pixelsPerBeat.value * beatsPerMeasure.value)

  // SNAP SETTINGS - AJOUT DES PROPRIÉTÉS MANQUANTES
  const snapToGrid = ref(false) // Snap activé/désactivé
  const snapDivision = ref(4) // Division du beat (4 = doubles-croches, 2 = croches, etc.)

  // Piano settings
  const totalKeys = ref(128) // MIDI keys 0-127
  const keyHeight = computed(() => 16 * verticalZoom.value)
  
  // Note: totalPianoHeight sera maintenant calculé par le composable usePianoPositioning
  // On garde cette version pour la compatibilité, mais elle ne devrait plus être utilisée
  const totalPianoHeight = computed(() => totalKeys.value * keyHeight.value)

  const velocityDisplay = ref({
    visible: false,
    value: 0,
    name: ''
  })

  // Fonctions de synchronisation (définies par le composant parent)
  const syncFunctions = ref({
    syncHorizontalScroll: null,
    syncVerticalScroll: null
  })

  // Actions
  const setTrackListWidth = (width) => {
    trackListWidth.value = width
  }

  const setPianoKeysWidth = (width) => {
    pianoKeysWidth.value = width
  }

  const setMidiLanesHeight = (height) => {
    midiLanesHeight.value = height
  }

  const setHorizontalZoom = (zoom) => {
    horizontalZoom.value = Math.max(0.1, Math.min(10, zoom))
  }

  const setVerticalZoom = (zoom) => {
    verticalZoom.value = Math.max(0.5, Math.min(5, zoom))
  }

  const zoomIn = (direction = 'both') => {
    if (direction === 'horizontal' || direction === 'both') {
      setHorizontalZoom(horizontalZoom.value * 1.2)
    }
    if (direction === 'vertical' || direction === 'both') {
      setVerticalZoom(verticalZoom.value * 1.2)
    }
  }

  const zoomOut = (direction = 'both') => {
    if (direction === 'horizontal' || direction === 'both') {
      setHorizontalZoom(horizontalZoom.value / 1.2)
    }
    if (direction === 'vertical' || direction === 'both') {
      setVerticalZoom(verticalZoom.value / 1.2)
    }
  }

  const resetZoom = () => {
    horizontalZoom.value = 1
    verticalZoom.value = 1
  }

  const setTimeSignature = (beats, note) => {
    beatsPerMeasure.value = beats
    beatNote.value = note
  }

  // ACTIONS POUR LE SNAP
  const toggleSnapToGrid = () => {
    snapToGrid.value = !snapToGrid.value
  }

  const setSnapToGrid = (enabled) => {
    snapToGrid.value = enabled
  }

  const setSnapDivision = (division) => {
    snapDivision.value = Math.max(1, division)
  }

  const setSyncFunctions = (functions) => {
    syncFunctions.value = functions
  }

  const setHorizontalScrollPosition = (position) => {
    horizontalScrollPosition.value = position
    if (syncFunctions.value.syncHorizontalScroll) {
      syncFunctions.value.syncHorizontalScroll({ scrollLeft: position })
    }
  }

  const setVerticalScrollPosition = (position) => {
    verticalScrollPosition.value = position
    if (syncFunctions.value.syncVerticalScroll) {
      syncFunctions.value.syncVerticalScroll(position)
    }
  }

  // Utilitaires de conversion (DEPRECATED - utiliser useTimeSignature)
  const beatsToPixels = (beats) => {
    return beats * pixelsPerBeat.value
  }

  const pixelsToBeats = (pixels) => {
    return pixels / pixelsPerBeat.value
  }

  const midiNoteToY = (midiNote) => {
    // MIDI note 0 (C-1) en bas, 127 (G9) en haut
    return (127 - midiNote) * keyHeight.value
  }

  const yToMidiNote = (y) => {
    return 127 - Math.floor(y / keyHeight.value)
  }

  // Actions pour le tooltip
  const showVelocityDisplay = (value, name) => {
    velocityDisplay.value = {
      visible: true,
      value: Math.round(value),
      name: name || '' 
    }
  }

  const updateVelocityDisplay = (value, name) => {
    if (velocityDisplay.value.visible) {
      velocityDisplay.value.value = Math.round(value)
      velocityDisplay.value.name = name || ''
    }
  }

  const hideVelocityDisplay = () => {
    velocityDisplay.value.visible = false
  }

  return {
    // État
    trackListWidth,
    pianoKeysWidth,
    midiLanesHeight,
    horizontalZoom,
    verticalZoom,
    horizontalScrollPosition,
    verticalScrollPosition,
    beatsPerMeasure,
    beatNote,
    totalKeys,
    velocityDisplay,

    // SNAP STATE
    snapToGrid,
    snapDivision,

    // Computed
    pixelsPerBeat,
    pixelsPerMeasure,
    keyHeight,
    totalPianoHeight,
    syncFunctions,

    // Actions
    setTrackListWidth,
    setPianoKeysWidth,
    setMidiLanesHeight,
    setHorizontalZoom,
    setVerticalZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setTimeSignature,

    // SNAP ACTIONS
    toggleSnapToGrid,
    setSnapToGrid,
    setSnapDivision,

    setSyncFunctions,
    setHorizontalScrollPosition,
    setVerticalScrollPosition,

    showVelocityDisplay,
    updateVelocityDisplay,
    hideVelocityDisplay,

    // Utilitaires
    beatsToPixels,
    pixelsToBeats,
    midiNoteToY,
    yToMidiNote
  }
})