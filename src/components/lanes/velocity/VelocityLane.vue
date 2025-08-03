<template>
  <div 
    class="velocity-lane" 
    ref="velocityLaneRef"
    :class="{ 'brush-mode': isBrushing }"
    @mousedown="handleContainerMouseDown"
  >
    <!-- Rectangle de sélection -->
    <SelectionRectangle 
      v-if="isSelecting"
      :style="getSelectionRectangle()"
    />
        
    <!-- Grille de mesures -->
    <div class="measures-grid" :style="{ width: totalWidth + 'px' }">
      <!-- Grille de temps - EN ARRIÈRE-PLAN -->
      <GridRenderer 
        :show-measure-lines="true"
        :show-beat-lines="true"
        :show-subdivision-lines="true"
        :show-signature-indicators="false"
        :show-measure-numbers="false"
        :show-beat-labels="false"
        class="grid-background"
      />

      <!-- Zone d'affichage des vélocités - AU PREMIER PLAN -->
      <VelocityDisplayArea
        :lane-height="laneHeight"
        :usable-height="usableVelocityHeight"
        :visible-notes="visibleNotes"
        :selected-items="selectedItems"
        :preview-selected-items="previewSelectedItems"
        :is-command-pressed="isCommandPressed"
        :brushed-item="brushedItem"
        :is-dragging="isDragging"
        :current-item="currentItem"
        :velocity-bar-width="velocityBarWidth"
        @velocity-bar-mousedown="handleVelocityBarMouseDown"
        class="velocity-foreground"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useMouseInteractions } from '@/composables/useMouseInteractions'
import { useVelocityCalculations } from '@/composables/useVelocityCalculations'
import { useMidiOutput } from '@/composables/useMidiOutput' // Ajout du composable MIDI

// Composants
import SelectionRectangle from './SelectionRectangle.vue'
import VelocityDisplayArea from './VelocityDisplayArea.vue'
import GridRenderer from '@/components/GridRenderer.vue'

const props = defineProps({
  totalMeasures: {
    type: Number,
    default: 32
  },
  visibleMeasures: {
    type: Array,
    default: () => []
  }
})

const uiStore = useUIStore()
const midiStore = useMidiStore()
const velocityLaneRef = ref(null)

// Composables
const { toneToMidi, midiToTone, velocityToY, yToVelocity } = useVelocityCalculations()
const timeSignatureComposable = useTimeSignature()
const { playNote, stopNote } = useMidiOutput() // Ajout des fonctions MIDI

// ✅ Utiliser les données correctes du composable timeSignature
const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

// État local
const previewSelectedItems = ref([])
const laneHeightPx = ref(100)

// NOUVEAU: Variables pour le suivi des notes jouées
const playingNotes = ref(new Map()) // Pour tracker les notes en cours de lecture
const lastPlayedTime = ref(0) // Pour éviter le spam de notes

// Constantes
const VELOCITY_MARGIN_TOP = 0
const VELOCITY_MARGIN_BOTTOM = 0
const FIXED_BAR_WIDTH = 8
const NOTE_PLAY_THROTTLE = 50 // Throttle en ms pour éviter le spam

// NOUVEAU: Fonctions utilitaires pour la conversion de vélocité
const normalizeVelocityToMidi = (velocity) => {
  if (velocity <= 1) {
    return Math.max(1, Math.round(velocity * 127)) // Éviter vélocité 0
  }
  return Math.max(1, Math.min(127, Math.round(velocity)))
}

const normalizeVelocityToTone = (velocity) => {
  if (velocity > 1) {
    return velocity / 127
  }
  return Math.max(0, Math.min(1, velocity))
}

// NOUVEAU: Fonction pour jouer une note avec la nouvelle vélocité
const playNoteWithVelocity = (note, midiVelocity, duration = 150) => {
  const track = midiStore.getTrackById(note.trackId)
  if (!track) return

  const now = Date.now()
  
  // Throttle pour éviter de jouer trop de notes en même temps
  if (now - lastPlayedTime.value < NOTE_PLAY_THROTTLE) {
    return
  }
  lastPlayedTime.value = now

  // Créer une clé unique pour cette note
  const noteKey = `${note.id}-${note.midi}`
  
  // Arrêter la note précédente si elle joue
  if (playingNotes.value.has(noteKey)) {
    const previousNote = playingNotes.value.get(noteKey)
    stopNote({
      midi: previousNote.midi,
      channel: previousNote.channel,
      outputId: previousNote.outputId
    })
    playingNotes.value.delete(noteKey)
  }

  // Jouer la nouvelle note
  const noteInfo = {
    midi: note.midi,
    channel: track.channel || 0,
    outputId: track.midiOutput || 'default'
  }

  playNote({
    ...noteInfo,
    velocity: midiVelocity,
    duration: duration
  })

  // Tracker la note jouée
  playingNotes.value.set(noteKey, noteInfo)

  // Programmer le nettoyage
  setTimeout(() => {
    playingNotes.value.delete(noteKey)
  }, duration + 50)

  console.log(`🎵 Note vélocité jouée: ${note.midi} - Vélocité MIDI: ${midiVelocity}`)
}

// ✅ Utiliser les mesures calculées avec signatures rythmiques
const measuresWithSignatures = computed(() => {
  if (timeSignatureComposable?.measuresWithSignatures?.value) {
    return timeSignatureComposable.measuresWithSignatures.value
  }
  
  // Fallback uniquement si le composable n'est pas disponible
  console.warn('VelocityLane: measuresWithSignatures non disponible, utilisation du fallback')
  const simpleMeasures = []
  const basePixelsPerBeat = 60
  const pixelsPerBeat = basePixelsPerBeat * uiStore.horizontalZoom
  
  for (let i = 0; i < props.totalMeasures; i++) {
    const measure = {
      number: i + 1,
      timeSignature: { numerator: 4, denominator: 4 },
      startTime: i * 4,
      duration: 4,
      startPixel: i * 4 * pixelsPerBeat,
      beatWidth: pixelsPerBeat,
      beats: [1, 2, 3, 4],
      signatureChange: i === 0,
      measureWidth: 4 * pixelsPerBeat,
      beatsCount: 4
    }
    simpleMeasures.push(measure)
  }
  return simpleMeasures
})

const selectedTrackNotes = computed(() => {
  if (midiStore.selectedTrack === null || midiStore.selectedTrack === undefined) {
    return []
  }
  return (midiStore.notes || []).filter(note => note.trackId === midiStore.selectedTrack)
})

const visibleNotes = computed(() => {
  const result = selectedTrackNotes.value.map(note => {
    const toneVelocity = note.velocity !== undefined ? note.velocity : 0.5
    const midiVelocity = toneToMidi(toneVelocity)
    
    return { 
      ...note, 
      velocity: midiVelocity,
      originalVelocity: toneVelocity
    }
  })
   
  return result
})

const laneHeight = computed(() => Math.max(40, laneHeightPx.value - 1))
const usableVelocityHeight = computed(() => Math.max(20, laneHeight.value - VELOCITY_MARGIN_TOP - VELOCITY_MARGIN_BOTTOM))
const velocityBarWidth = computed(() => FIXED_BAR_WIDTH)

const findItemAtPosition = (clientX, clientY) => {
  if (!velocityLaneRef.value) return null
  
  const rect = velocityLaneRef.value.getBoundingClientRect()
  const relativeX = clientX - rect.left
  const barWidth = velocityBarWidth.value
  const tolerance = Math.max(4, barWidth * 0.5)
  
  for (const note of visibleNotes.value) {
    try {
      const noteStartTime = note.start || note.time || 0
      const leftPosition = timeSignatureComposable.timeToPixelsWithSignatures(noteStartTime)

      if (relativeX >= (leftPosition - tolerance) && relativeX <= (leftPosition + barWidth + tolerance)) {
        return { 
          ...note, 
          id: note.id, 
          velocity: note.velocity,
          value: note.velocity
        }
      }
    } catch (error) {
      console.warn('Erreur findItemAtPosition:', error, note)
      continue
    }
  }
  return null
}

const calculateVelocityFromPosition = (clientY) => {
  if (!velocityLaneRef.value) return 64
  const rect = velocityLaneRef.value.getBoundingClientRect()
  const relativeY = clientY - rect.top
  return yToVelocity(relativeY, usableVelocityHeight.value, VELOCITY_MARGIN_TOP)
}

const calculateVelocityFromDelta = (currentY, initialMidiValue, startY) => {
  if (!velocityLaneRef.value) return initialMidiValue

  const deltaY = currentY - startY
  const pixelRange = usableVelocityHeight.value
  
  const sensitivity = 1.2
  const velocityDelta = -(deltaY / pixelRange) * 127 * sensitivity
  const newMidiVelocity = initialMidiValue + velocityDelta
    
  return Math.max(0, Math.min(127, Math.round(newMidiVelocity)))
}

const isNoteInSelectionBounds = (note, bounds) => {
  try {
    const noteStartTime = note.start || note.time || 0
    const leftPosition = timeSignatureComposable.timeToPixelsWithSignatures(noteStartTime)
    const noteLeft = leftPosition
    const noteRight = noteLeft + velocityBarWidth.value
    
    const selectionLeft = Math.min(bounds.startX, bounds.endX)
    const selectionRight = Math.max(bounds.startX, bounds.endX)
    const selectionTop = Math.min(bounds.startY, bounds.endY)
    const selectionBottom = Math.max(bounds.startY, bounds.endY)
    
    const horizontalOverlap = noteLeft <= selectionRight && noteRight >= selectionLeft
    const verticalOverlap = selectionTop <= laneHeight.value && selectionBottom >= 0
    
    return horizontalOverlap && verticalOverlap
  } catch (error) {
    console.warn('Erreur lors de la vérification des bounds:', error, note)
    return false
  }
}

const updateCache = new Map()

// MODIFIÉ: Fonction de mise à jour avec lecture de note
const updateNoteVelocity = (noteId, midiVelocity, isTemporary = false) => {
  const clampedMidi = Math.max(0, Math.min(127, Math.round(midiVelocity)))
  const toneVelocity = midiToTone(clampedMidi)
  
  const cacheKey = `${noteId}-${clampedMidi}`
  if (updateCache.has(cacheKey) && isTemporary) {
    return
  }
  updateCache.set(cacheKey, Date.now())
  
  if (updateCache.size > 100) {
    const now = Date.now()
    for (const [key, timestamp] of updateCache) {
      if (now - timestamp > 1000) {
        updateCache.delete(key)
      }
    }
  }
  
  // NOUVEAU: Jouer la note avec la nouvelle vélocité
  const note = midiStore.notes?.find(n => n.id === noteId)
  if (note && !isTemporary) {
    // Jouer la note avec la nouvelle vélocité
    playNoteWithVelocity(note, clampedMidi, 200)
  }
  
  if (typeof midiStore.updateNote === 'function') {
    if (!isTemporary) {
      nextTick(() => {
        midiStore.updateNote(noteId, { velocity: toneVelocity })
      })
    } else {
      midiStore.updateNote(noteId, { velocity: toneVelocity })
    }
  }
}

// Configuration du composable useMouseInteractions
const mouseInteractions = useMouseInteractions({
  containerRef: velocityLaneRef,
  valueRange: { min: 0, max: 127 },
  updateMode: 'realtime',
  
  onDragStart: (event, item, selection) => {
    if (typeof uiStore.showVelocityDisplay === 'function') {
      uiStore.showVelocityDisplay(Math.round(item.velocity || 0), item.name)
    }
    
    // NOUVEAU: Jouer la note au début du drag
    if (item && !selection.length) { // Seulement si pas de sélection multiple
      const midiVelocity = normalizeVelocityToMidi(item.velocity || 64)
      playNoteWithVelocity(item, midiVelocity, 150)
    }
  },

  onDragMove: (event, item, mode) => {
    if (typeof uiStore.updateVelocityDisplay === 'function') {
      uiStore.updateVelocityDisplay(Math.round(item.value || 0), item.name)
    }
    
    // NOUVEAU: Jouer la note pendant le drag (avec throttle)
    if (item && mode !== 'selection') {
      const midiVelocity = normalizeVelocityToMidi(item.value || 64)
      playNoteWithVelocity(item, midiVelocity, 100)
    }
  },

  onDragEnd: (editedItems) => {
    if (typeof uiStore.hideVelocityDisplay === 'function') {
      uiStore.hideVelocityDisplay()
    }
    
    // NOUVEAU: Jouer toutes les notes éditées à la fin
    editedItems.forEach(item => {
      if (item && item.value !== undefined) {
        const midiVelocity = normalizeVelocityToMidi(item.value)
        setTimeout(() => {
          playNoteWithVelocity(item, midiVelocity, 300)
        }, Math.random() * 100) // Petit décalage aléatoire pour éviter le conflit
      }
    })
  },
  
  onSelectionStart: (event, position) => {
    previewSelectedItems.value = []
  },
  
  onSelectionUpdate: (newSelection, bounds) => {
    const selectedNoteIds = newSelection.map(note => note.id)
    previewSelectedItems.value = [...selectedNoteIds]
  },
  
  onSelectionEnd: (selection) => {
    previewSelectedItems.value = []
    
    // NOUVEAU: Jouer un preview des notes sélectionnées
    if (selection.length > 0 && selection.length <= 5) { // Limite pour éviter le chaos
      selection.forEach((note, index) => {
        setTimeout(() => {
          const midiVelocity = normalizeVelocityToMidi(note.velocity || 64)
          playNoteWithVelocity(note, midiVelocity, 200)
        }, index * 80) // Décalage pour entendre les notes séparément
      })
    }
  },
  
  findItemAtPosition,
  calculateValueFromPosition: calculateVelocityFromPosition,
  calculateValueFromDelta: calculateVelocityFromDelta,
  applyUpdate: updateNoteVelocity,

  getItemsByBounds: (bounds) => {
    return visibleNotes.value.filter(note => isNoteInSelectionBounds(note, bounds))
  },

  getCurrentItemValues: (itemIds) => {
    const currentValues = new Map()
    
    itemIds.forEach(itemId => {
      const storeNote = midiStore.notes?.find(note => note.id === itemId)
      if (storeNote) {
        const toneVelocity = storeNote.velocity !== undefined ? storeNote.velocity : 0.5
        const midiVelocity = toneToMidi(toneVelocity)
        
        currentValues.set(itemId, {
          id: storeNote.id,
          velocity: midiVelocity,
          value: midiVelocity
        })
      }
    })
    
    return currentValues
  }
})

// Extraire les propriétés du composable
const {
  isDragging,
  isSelecting,
  isBrushing,
  isCommandPressed,
  currentItem,
  brushedItem,
  selectedItems,
  getSelectionRectangle,
  handleMouseDown
} = mouseInteractions

// Gestionnaires d'événements
const handleVelocityBarMouseDown = (event, note) => {
  if (!velocityLaneRef.value) {
    handleMouseDown(event, note)
    return
  }
  
  const rect = velocityLaneRef.value.getBoundingClientRect()
  const relativeY = event.clientY - rect.top
  const currentVelocityY = velocityToY(note.velocity, usableVelocityHeight.value, VELOCITY_MARGIN_TOP)
  
  // Si clic au-dessus de la barre - ajustement immédiat
  if (relativeY >= VELOCITY_MARGIN_TOP && relativeY < currentVelocityY) {
    const targetVelocity = calculateVelocityFromPosition(event.clientY)
    updateNoteVelocity(note.id, targetVelocity)
    
    // NOUVEAU: Jouer la note avec la nouvelle vélocité
    const midiVelocity = normalizeVelocityToMidi(targetVelocity)
    playNoteWithVelocity(note, midiVelocity, 250)
    
    if (typeof uiStore.showVelocityDisplay === 'function') {
      uiStore.showVelocityDisplay(Math.round(targetVelocity), note.name)
      setTimeout(() => {
        if (typeof uiStore.hideVelocityDisplay === 'function') {
          uiStore.hideVelocityDisplay()
        }
      }, 1000)
    }
    
    return
  }
  
  // Sinon, comportement normal (drag)
  handleMouseDown(event, note)
}

const handleContainerMouseDown = (event) => {
  const foundItem = findItemAtPosition(event.clientX, event.clientY)
  
  if (!foundItem) {
    handleMouseDown(event, null)
  }
}

// NOUVEAU: Fonction de nettoyage pour arrêter toutes les notes
const stopAllPlayingNotes = () => {
  for (const [noteKey, noteInfo] of playingNotes.value.entries()) {
    stopNote({
      midi: noteInfo.midi,
      channel: noteInfo.channel,
      outputId: noteInfo.outputId
    })
  }
  playingNotes.value.clear()
}

// Lifecycle
let resizeObserver = null

onMounted(() => {
  if (velocityLaneRef.value) {
    laneHeightPx.value = velocityLaneRef.value.clientHeight || 100
    resizeObserver = new window.ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === velocityLaneRef.value) {
          laneHeightPx.value = entry.contentRect.height || 100
        }
      }
    })
    resizeObserver.observe(velocityLaneRef.value)
  }
})

onUnmounted(() => {
  // NOUVEAU: Arrêter toutes les notes en cours
  stopAllPlayingNotes()
  
  if (resizeObserver && velocityLaneRef.value) {
    resizeObserver.unobserve(velocityLaneRef.value)
  }
  
  if (uiStore.hideVelocityDisplay) {
    uiStore.hideVelocityDisplay()
  }
  
  updateCache.clear()
})
</script>

<style scoped>
.velocity-lane {
  position: relative;
  height: 100%;
  background: var(--velocity-lane-bg, #fafafa);
  overflow: hidden;
  user-select: none;
  cursor: default;
}

.velocity-lane.brush-mode {
  cursor: crosshair;
}

.measures-grid {
  position: relative;
  height: 100%;
}

/* GridRenderer en arrière-plan */
.grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none; /* Permet aux événements de passer au travers */
}

/* VelocityDisplayArea au premier plan */
.velocity-foreground {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: auto; /* Restaure les événements pour les barres de vélocité */
}

@media (max-width: 768px) {
  .velocity-lane {
    min-height: 80px;
  }
}

@media (prefers-color-scheme: dark) {
  .velocity-lane {
    --velocity-lane-bg: #1e1e1e;
  }
}
</style>