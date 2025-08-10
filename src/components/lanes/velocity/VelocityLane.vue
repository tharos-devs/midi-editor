<template>
  <div 
    class="velocity-lane" 
    ref="velocityLaneRef"
    :class="{ 'brush-mode': isBrushing }"
    @mousedown="handleContainerMouseDown"
    @mousemove="isBrushing ? onBrushMove : updateLasso"
    @mouseup="isBrushing ? stopBrush : endLassoOrDrag"
  >
    <!-- Rectangle de sélection lasso -->
    <div v-if="isLassoMode" class="lasso-selection" :style="lassoStyle"></div>
        
    <!-- Grille de mesures -->
    <div class="measures-grid" :style="{ width: totalWidth + 'px' }">
      <!-- Grille de temps - EN ARRIÈRE-PLAN -->
      <GridRenderer 
        :show-measure-lines="true"
        :show-beat-lines="true"
        :show-subdivision-lines="uiStore.snapToGrid"
        :show-signature-indicators="false"
        :show-measure-numbers="false"
        :show-beat-labels="false"
        class="grid-background"
      >
        <GlobalPlaybackCursor
          :container-height="laneHeight"
          :total-width="totalWidth"
          :show-debug-info="false"
        />
      </GridRenderer>
    
      <!-- Lignes de référence de vélocité -->
      <VelocityScaleLines
        :lane-height="laneHeight"
        :usable-height="usableVelocityHeight"
        class="velocity-reference-background"
      />
      
      <!-- Velocity bars en SVG - VERSION OPTIMISÉE COMME TEMPO -->
      <svg class="velocity-bars-svg" :viewBox="`0 0 ${totalWidth} ${laneHeight}`" preserveAspectRatio="none">
        <rect
          v-for="note in (dragTempNotes || visibleNotes)"
          :key="`velocity-${note.id}`"
          class="velocity-bar-svg"
          :class="{ 
            'dragging': isDragging && selectedNote?.id === note.id,
            'single-selected': selectedNote?.id === note.id,
            'multi-selected': selectedNotes.some(n => n.id === note.id)
          }"
          :x="calculateNoteX(note)"
          :y="calculateVelocityY(note)"
          :width="velocityBarWidth"
          :height="calculateVelocityHeight(note)"
          :fill="getVelocityColor(note)"
          @mousedown="handleVelocityBarMouseDown($event, note)"
        />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { provide, ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useSnapLogic } from '@/composables/useSnapLogic'
import { useVelocityCalculations } from '@/composables/useVelocityCalculations'
import { useMidiOutput } from '@/composables/useMidiOutput' // Ajout du composable MIDI
import { useMidiManager } from '@/composables/useMidiManager' // Ajout du composable MIDI standardisé
import { useColorsStore } from '@/stores/colors' // Pour les couleurs SVG
import GlobalPlaybackCursor from '@/components/GlobalPlaybackCursor.vue'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

// Composants
import SelectionRectangle from './SelectionRectangle.vue'
import VelocityDisplayArea from './VelocityDisplayArea.vue'
import VelocityScaleLines from './VelocityScaleLines.vue'
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

const emit = defineEmits(['point-selected'])

const uiStore = useUIStore()
const midiStore = useMidiStore()
const colorsStore = useColorsStore() // Pour les couleurs SVG
const velocityLaneRef = ref(null)

const cursorStore = usePlaybackCursorStore()

// Composables
const { toneToMidi, midiToTone, velocityToY, yToVelocity } = useVelocityCalculations()
const timeSignatureComposable = useTimeSignature()
const { snapTimeToGrid } = useSnapLogic()
const { playNote, stopNote } = useMidiOutput() // Ancien composable MIDI
const midiManager = useMidiManager() // Nouveau composable MIDI standardisé

// ✅ Utiliser les données correctes du composable timeSignature
const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

const timeToPixel = computed(() => {
  if (!totalWidth.value || !cursorStore.totalDuration) {
    return () => 0
  }
  return (timeInSeconds) => {
    if (!timeInSeconds || timeInSeconds < 0) return 0
    return (timeInSeconds / cursorStore.totalDuration) * totalWidth.value
  }
})

// État local
const previewSelectedItems = ref([])
const laneHeightPx = ref(100)

// Variables pour le drag direct (comme CCLane)
const selectedNote = ref(null)
const selectedNotes = ref([]) // Notes sélectionnées en mode lasso
const isDragging = ref(false)
const isBrushing = ref(false)
const isCommandPressed = ref(false)
const dragTempNotes = ref(null) // Notes temporaires pendant le drag

// Variables pour le mode lasso
const isLassoMode = ref(false)
const lassoStart = ref({ x: 0, y: 0 })
const lassoEnd = ref({ x: 0, y: 0 })
const isGroupDragging = ref(false)

// Style pour le rectangle de sélection lasso
const lassoStyle = computed(() => {
  const left = Math.min(lassoStart.value.x, lassoEnd.value.x)
  const top = Math.min(lassoStart.value.y, lassoEnd.value.y)
  const width = Math.abs(lassoEnd.value.x - lassoStart.value.x)
  const height = Math.abs(lassoEnd.value.y - lassoStart.value.y)
  
  return {
    position: 'absolute',
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: height + 'px',
    border: '2px dashed #2196F3',
    background: 'rgba(33, 150, 243, 0.1)',
    pointerEvents: 'none',
    zIndex: 20
  }
})

// NOUVEAU: Variables pour le suivi des notes jouées
const playingNotes = ref(new Map()) // Pour tracker les notes en cours de lecture
const lastPlayedTime = ref(0) // Pour éviter le spam de notes

// Constantes
const VELOCITY_MARGIN_TOP = 0
const VELOCITY_MARGIN_BOTTOM = 0
const FIXED_BAR_WIDTH = 6
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
    midiManager.sendNoteOff(previousNote.outputId, previousNote.channel, previousNote.midi)
    playingNotes.value.delete(noteKey)
  }

  // Jouer la nouvelle note avec la méthode standardisée
  const channel = Math.max(0, Math.min(15, parseInt(track.channel) || 0))
  const outputId = track.midiOutput || 'default'
  
  const success = midiManager.sendNoteOn(outputId, channel, note.midi, midiVelocity)
  
  if (success) {
    // Mémoriser la note en cours de lecture
    const noteInfo = { midi: note.midi, channel, outputId }
    playingNotes.value.set(noteKey, noteInfo)
    
    // Auto-arrêt après la durée spécifiée
    setTimeout(() => {
      if (playingNotes.value.has(noteKey)) {
        midiManager.sendNoteOff(outputId, channel, note.midi)
        playingNotes.value.delete(noteKey)
      }
    }, duration)
  }

  // console.log(`🎵 Note vélocité jouée: ${note.midi} - Vélocité MIDI: ${midiVelocity}`)
}

// ✅ Utiliser les mesures calculées avec signatures rythmiques
const measuresWithSignatures = computed(() => {
  if (timeSignatureComposable?.measuresWithSignatures?.value) {
    return timeSignatureComposable.measuresWithSignatures.value
  }
  
  // Fallback uniquement si le composable n'est pas disponible
  // console.warn('VelocityLane: measuresWithSignatures non disponible, utilisation du fallback')
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
  const notes = (midiStore.notes || []).filter(note => note.trackId === midiStore.selectedTrack)
  
  // DEBUG: Tracer les recalculs
  const targetNote = notes.find(n => n.id === '1754730238010.4827')
  if (targetNote) {
    console.log('🔍 selectedTrackNotes RECALCULÉ - Note ciblée:', {
      noteId: targetNote.id,
      velocity: targetNote.velocity,
      totalNotes: notes.length
    })
  }
  
  return notes
})

// Forçage de réactivité - flag qui change à chaque mise à jour
const forceReactivity = ref(0)

const visibleNotes = computed(() => {
  // Dépendre du flag de forçage pour déclencher le recalcul
  forceReactivity.value
  
  const result = selectedTrackNotes.value.map(note => {
    const toneVelocity = note.velocity !== undefined ? note.velocity : 0.5
    const midiVelocity = toneToMidi(toneVelocity)
    
    // DEBUG: Tracer les conversions pour toute note avec cet ID
    if (note.id === '1754730238010.4827') {
      console.log('🔍 VelocityLane visibleNotes - RECALCUL FORCÉ - Note mise à jour:', {
        noteId: note.id,
        storeTone: note.velocity,
        calculatedTone: toneVelocity,
        calculatedMidi: midiVelocity,
        forceFlag: forceReactivity.value
      })
    }
    
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
  const mouseY = clientY - rect.top
  const containerHeight = rect.height
  const relativeY = mouseY / containerHeight
  
  // Même logique que MIDI CC : simple et efficace
  return Math.max(0, Math.min(127, Math.round((1 - relativeY) * 127)))
}

const calculateVelocityFromDelta = (currentY, initialMidiValue, startY) => {
  if (!velocityLaneRef.value) return initialMidiValue
  
  const rect = velocityLaneRef.value.getBoundingClientRect()
  const deltaY = currentY - startY
  const containerHeight = rect.height
  
  // Calcul de delta basé sur la hauteur du container (comme MIDI CC)
  const deltaVelocity = -(deltaY / containerHeight) * 127
  return Math.max(0, Math.min(127, Math.round(initialMidiValue + deltaVelocity)))
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

// ✅ FONCTIONS SVG POUR LES BARRES DE VÉLOCITÉ (comme TempoLane)
const calculateNoteX = (note) => {
  const noteTime = note.time || note.start || 0
  try {
    if (timeSignatureComposable.timeToPixelsWithSignatures) {
      return Math.round(timeSignatureComposable.timeToPixelsWithSignatures(noteTime))
    } else {
      const basePixelsPerBeat = 60
      const zoomedPixelsPerBeat = basePixelsPerBeat * uiStore.horizontalZoom
      return Math.round(noteTime * zoomedPixelsPerBeat)
    }
  } catch (error) {
    return 0
  }
}

const calculateVelocityY = (note) => {
  const midiVelocity = note.velocity !== undefined ? note.velocity : 100
  const clampedVelocity = Math.max(0, Math.min(127, Math.round(midiVelocity)))
  
  // Pour vélocité 0, positionner la barre tout en bas
  if (clampedVelocity === 0) {
    return usableVelocityHeight.value - 4 // 4px de hauteur en bas
  }
  
  const barTopY = velocityToY(clampedVelocity, usableVelocityHeight.value, 0)
  return Math.round(barTopY)
}

const calculateVelocityHeight = (note) => {
  const midiVelocity = note.velocity !== undefined ? note.velocity : 100
  const clampedVelocity = Math.max(0, Math.min(127, Math.round(midiVelocity)))
  
  // Pour vélocité 0, utiliser une hauteur minimum pour pouvoir sélectionner
  if (clampedVelocity === 0) {
    return 4 // Hauteur minimum de 4px pour rester cliquable
  }
  
  const barTopY = velocityToY(clampedVelocity, usableVelocityHeight.value, 0)
  const barBottomY = velocityToY(0, usableVelocityHeight.value, 0)
  const barHeight = Math.max(4, barBottomY - barTopY) // Minimum 4px
  return Math.round(barHeight)
}

const getVelocityColor = (note) => {
  const midiVelocity = note.velocity !== undefined ? note.velocity : 100
  const clampedVelocity = Math.max(0, Math.min(127, Math.round(midiVelocity)))
  
  if (isDragging.value && selectedNote.value?.id === note.id) {
    return '#2196F3' // Bleu pour le drag
  }
  if (selectedNote.value?.id === note.id) {
    return '#2196F3' // Bleu pour sélection unique
  }
  if (selectedNotes.value.some(n => n.id === note.id)) {
    return '#000000' // Noir pour sélection multiple
  }
  if (clampedVelocity === 0) {
    return '#ff4444' // Rouge pour vélocité nulle
  }
  
  // Couleur par défaut basée sur la vélocité
  return colorsStore.getVelocityColor(clampedVelocity)
}

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


// Variables pour le drag
let dragStartX = 0
let dragStartY = 0
let originalTime = 0
let originalVelocity = 0
let originalVelocities = new Map() // Pour stocker les vélocités initiales de chaque note en mode groupe

// Fonction pour démarrer le drag d'une note
const startNoteDrag = (note, event) => {
  // Si la note fait partie de la sélection multiple, démarrer un drag de groupe
  const isPartOfMultiSelection = selectedNotes.value.some(n => n.id === note.id)
  
  if (isPartOfMultiSelection && selectedNotes.value.length > 1) {
    // Mode drag de groupe
    isGroupDragging.value = true
    selectedNote.value = note
    
    // Stocker les vélocités initiales de toutes les notes sélectionnées
    originalVelocities.clear()
    selectedNotes.value.filter(selectedNote => selectedNote && selectedNote.id).forEach(selectedNote => {
      originalVelocities.set(selectedNote.id, selectedNote.velocity)
    })
    
    console.log(`🎵 Début drag de groupe: ${selectedNotes.value.length} notes`)
  } else {
    // Mode drag simple
    selectedNote.value = note
    selectedNotes.value = []
    isGroupDragging.value = false
    originalVelocities.clear()
  }
  
  isDragging.value = true
  
  // Émettre la sélection vers MidiLaneInfos
  console.log('🎯 VelocityLane: Émission point-selected pour note:', {
    noteId: note.id,
    velocity: note.velocity,
    existsInStore: !!midiStore.notes?.find(n => n.id === note.id)
  })
  
  emit('point-selected', {
    id: String(note.id),
    value: Math.round(note.velocity || 0),
    type: 'velocity'
  })
  
  dragStartX = event.clientX
  dragStartY = event.clientY
  originalTime = note.start || note.time || 0
  originalVelocity = note.velocity

  // Créer une copie des notes visibles pour la manipulation temporaire
  dragTempNotes.value = [...visibleNotes.value]

  // Jouer la note au début du drag
  const midiVelocity = normalizeVelocityToMidi(note.velocity || 100)
  playNoteWithVelocity(note, midiVelocity, 150)

  document.addEventListener('mousemove', onNoteDrag, { passive: false })
  document.addEventListener('mouseup', stopNoteDrag, { passive: true })
  event.preventDefault()
  event.stopPropagation()
}

// Fonction pour détecter les collisions lasso
const isNoteInLassoBounds = (note, bounds) => {
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

// Gestionnaires d'événements
const handleVelocityBarMouseDown = (event, note) => {
  if (!velocityLaneRef.value) {
    startNoteDrag(note, event)
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
    
    // Émettre la sélection
    console.log('🎯 VelocityLane: Émission point-selected (handleVelocityBarMouseDown):', {
      noteId: note.id,
      velocity: note.velocity,
      existsInStore: !!midiStore.notes?.find(n => n.id === note.id)
    })
    
    emit('point-selected', {
      id: String(note.id),
      value: Math.round(targetVelocity),
      type: 'velocity'
    })
    
    return
  }
  
  // Sinon, comportement normal (drag)
  startNoteDrag(note, event)
}

// Fonction de drag des notes
const onNoteDrag = (event) => {
  if (!isDragging.value || !selectedNote.value || !dragTempNotes.value) return

  if (isGroupDragging.value && selectedNotes.value.length > 1) {
    // Mode drag de groupe: calculer le delta par rapport à la position initiale
    if (!velocityLaneRef.value) return
    
    const rect = velocityLaneRef.value.getBoundingClientRect()
    const deltaY = event.clientY - dragStartY
    const containerHeight = rect.height
    
    // Calcul du delta de vélocité basé sur le déplacement vertical
    const deltaVelocity = -(deltaY / containerHeight) * 127
    
    selectedNotes.value.filter(selectedN => selectedN && selectedN.id).forEach(selectedN => {
      const tempNoteIndex = dragTempNotes.value.findIndex(n => n && n.id === selectedN.id)
      if (tempNoteIndex !== -1) {
        // Utiliser la vélocité initiale stockée pour cette note
        const originalNoteVelocity = originalVelocities.get(selectedN.id) || selectedN.velocity
        
        // Appliquer le delta à partir de la vélocité initiale
        let newNoteVelocity = originalNoteVelocity + deltaVelocity
        newNoteVelocity = Math.max(0, Math.min(127, newNoteVelocity))
        
        dragTempNotes.value[tempNoteIndex] = {
          ...dragTempNotes.value[tempNoteIndex],
          velocity: newNoteVelocity
        }
        
        // Pas de mise à jour store pendant le drag, juste visual
      }
    })
    
    // Pour l'émission, utiliser la valeur de la note de référence
    const referenceOriginalVelocity = originalVelocities.get(selectedNote.value.id) || originalVelocity
    const displayVelocity = Math.max(0, Math.min(127, referenceOriginalVelocity + deltaVelocity))
    
    emit('point-selected', {
      id: String(selectedNote.value.id),
      value: Math.round(displayVelocity),
      type: 'velocity'
    })
    
    // Jouer la note pendant le drag (avec throttle)
    const midiVelocity = normalizeVelocityToMidi(displayVelocity)
    playNoteWithVelocity(selectedNote.value, midiVelocity, 100)
  } else {
    // Mode drag simple: utiliser aussi le système de delta pour la fluidité
    if (selectedNote.value?.id && dragTempNotes.value) {
      const newVelocity = calculateVelocityFromDelta(event.clientY, originalVelocity, dragStartY)
      const tempNoteIndex = dragTempNotes.value.findIndex(n => n && n.id === selectedNote.value.id)
      if (tempNoteIndex !== -1) {
        dragTempNotes.value[tempNoteIndex] = {
          ...dragTempNotes.value[tempNoteIndex],
          velocity: newVelocity
        }
        
        // Pas de mise à jour store pendant le drag, juste visual
        
        // Émettre la mise à jour vers MidiLaneInfos
        emit('point-selected', {
          id: String(selectedNote.value.id),
          value: Math.round(newVelocity),
          type: 'velocity'
        })
        
        // Jouer la note pendant le drag (avec throttle)
        const midiVelocity = normalizeVelocityToMidi(newVelocity)
        playNoteWithVelocity(selectedNote.value, midiVelocity, 100)
      }
    }
  }
}

// Fonction pour arrêter le drag
const stopNoteDrag = async () => {
  document.removeEventListener('mousemove', onNoteDrag)
  document.removeEventListener('mouseup', stopNoteDrag)
  
  const realDrag = isDragging.value && selectedNote.value && dragTempNotes.value
  
  if (realDrag) {
    if (isGroupDragging.value && selectedNotes.value.length > 1) {
      // Mode groupe: finaliser toutes les notes
      const updatePromises = selectedNotes.value.map(async (selectedN) => {
        const tempNote = dragTempNotes.value?.find(n => n.id === selectedN.id)
        if (tempNote) {
          const toneVelocity = midiToTone(tempNote.velocity)
          return midiStore.updateNote(tempNote.id, { velocity: toneVelocity })
        }
      })
      
      await Promise.all(updatePromises.filter(Boolean))
      
      // Jouer toutes les notes éditées
      const tempNotesSnapshot = dragTempNotes.value ? [...dragTempNotes.value] : [] // Copie pour éviter les null
      selectedNotes.value.filter(note => note && note.id).forEach((note, index) => {
        setTimeout(() => {
          const tempNote = tempNotesSnapshot.find(n => n && n.id === note.id)
          if (tempNote) {
            const midiVelocity = normalizeVelocityToMidi(tempNote.velocity)
            playNoteWithVelocity(tempNote, midiVelocity, 300)
          }
        }, index * 50)
      })
    } else {
      // Mode simple: finaliser la note
      if (selectedNote.value?.id && dragTempNotes.value) {
        const tempNote = dragTempNotes.value.find(n => n && n.id === selectedNote.value.id)
        if (tempNote) {
          const toneVelocity = midiToTone(tempNote.velocity)
          await midiStore.updateNote(tempNote.id, { velocity: toneVelocity })
          
          // Jouer la note finalisée
          const midiVelocity = normalizeVelocityToMidi(tempNote.velocity)
          playNoteWithVelocity(tempNote, midiVelocity, 300)
        }
      }
    }
  }
  
  // Nettoyage
  isDragging.value = false
  isGroupDragging.value = false
  dragTempNotes.value = null
  originalVelocities.clear()
}

// Variables pour le mode brush
let lastBrushedNoteId = null

const handleContainerMouseDown = (event) => {
  // Mode brush (CMD/Ctrl + clic)
  if (event.metaKey || event.ctrlKey) {
    event.preventDefault()
    event.stopPropagation()
    
    isBrushing.value = true
    isCommandPressed.value = true
    lastBrushedNoteId = null
    
    const foundNote = findItemAtPosition(event.clientX, event.clientY)
    if (foundNote) {
      const newVelocity = calculateVelocityFromPosition(event.clientY)
      updateNoteVelocity(foundNote.id, newVelocity)
      lastBrushedNoteId = foundNote.id
      
      // Jouer la note
      const midiVelocity = normalizeVelocityToMidi(newVelocity)
      playNoteWithVelocity(foundNote, midiVelocity, 250)
      
      emit('point-selected', {
        id: String(foundNote.id),
        value: Math.round(newVelocity),
        type: 'velocity'
      })
    }
    
    // Ajouter les listeners pour le brush (sans passive pour permettre preventDefault)
    document.addEventListener('mousemove', onBrushMove)
    document.addEventListener('mouseup', stopBrush)
    
    return
  }
  
  // Vérifier si on clique sur une note
  const foundNote = findItemAtPosition(event.clientX, event.clientY)
  if (foundNote) {
    startNoteDrag(foundNote, event)
    return
  }
  
  // Si on clique sur une zone vide, démarrer le lasso
  startLassoSelection(event)
}

// Fonctions pour le mode brush
const onBrushMove = (event) => {
  if (!isBrushing.value) return
  
  // Tentative sécurisée de preventDefault
  try {
    if (event.cancelable) {
      event.preventDefault()
    }
  } catch (e) {
    // Ignore l'erreur si preventDefault n'est pas possible
  }
  
  const foundNote = findItemAtPosition(event.clientX, event.clientY)
  if (foundNote && foundNote.id !== lastBrushedNoteId) {
    const newVelocity = calculateVelocityFromPosition(event.clientY)
    updateNoteVelocity(foundNote.id, newVelocity)
    lastBrushedNoteId = foundNote.id
    
    // Jouer la note
    const midiVelocity = normalizeVelocityToMidi(newVelocity)
    playNoteWithVelocity(foundNote, midiVelocity, 100)
    
    
    emit('point-selected', {
      id: String(foundNote.id),
      value: Math.round(newVelocity),
      type: 'velocity'
    })
  }
}

const stopBrush = (event) => {
  if (event) {
    // Tentative sécurisée de preventDefault
    try {
      if (event.cancelable) {
        event.preventDefault()
      }
    } catch (e) {
      // Ignore l'erreur si preventDefault n'est pas possible
    }
  }
  
  document.removeEventListener('mousemove', onBrushMove)
  document.removeEventListener('mouseup', stopBrush)
  
  isBrushing.value = false
  isCommandPressed.value = false
  lastBrushedNoteId = null
  
  console.log('🎨 Mode brush arrêté')
}

// Fonctions pour le mode lasso
const startLassoSelection = (event) => {
  // Désélectionner la note actuelle
  if (selectedNote.value) {
    selectedNote.value = null
    emit('point-selected', null)
  }
  
  event.preventDefault()
  event.stopPropagation()
  
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  isLassoMode.value = true
  lassoStart.value = { x, y }
  lassoEnd.value = { x, y }
  
  // Vider la sélection précédente
  selectedNotes.value = []
  previewSelectedItems.value = []
  
  document.addEventListener('mousemove', updateLasso)
  document.addEventListener('mouseup', endLassoOrDrag)
}

let lassoAnimationFrame = null

const updateLasso = (event) => {
  if (!isLassoMode.value) return
  
  // Utiliser requestAnimationFrame pour une fluidité optimale
  if (lassoAnimationFrame) return
  
  lassoAnimationFrame = requestAnimationFrame(() => {
    const container = velocityLaneRef.value
    if (!container) {
      lassoAnimationFrame = null
      return
    }
    
    const rect = container.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    
    lassoEnd.value = { x, y }
    lassoAnimationFrame = null
  })
}

const endLassoOrDrag = () => {
  if (!isLassoMode.value) return
  
  // Calculer le rectangle de sélection
  const bounds = {
    startX: lassoStart.value.x,
    startY: lassoStart.value.y,
    endX: lassoEnd.value.x,
    endY: lassoEnd.value.y
  }
  
  // Sélectionner toutes les notes dans le rectangle
  const notesInSelection = visibleNotes.value.filter(note => isNoteInLassoBounds(note, bounds))
  
  selectedNotes.value = notesInSelection
  console.log(`🎵 ${notesInSelection.length} notes sélectionnées`)
  
  // Émettre la sélection 
  if (notesInSelection.length > 0) {
    // Pour la multi-sélection, utiliser la première note comme référence
    const referenceNote = notesInSelection[0]
    selectedNote.value = referenceNote
    emit('point-selected', {
      id: String(referenceNote.id),
      value: Math.round(referenceNote.velocity || 0),
      type: 'velocity'
    })
  } else {
    selectedNote.value = null
    emit('point-selected', null)
  }
  
  // Jouer un aperçu des notes sélectionnées
  if (notesInSelection.length > 0 && notesInSelection.length <= 5) {
    notesInSelection.forEach((note, index) => {
      setTimeout(() => {
        const midiVelocity = normalizeVelocityToMidi(note.velocity || 100)
        playNoteWithVelocity(note, midiVelocity, 200)
      }, index * 80)
    })
  }
  
  // Nettoyer le mode lasso
  isLassoMode.value = false
  previewSelectedItems.value = []
  
  // Nettoyer l'animation frame si nécessaire
  if (lassoAnimationFrame) {
    cancelAnimationFrame(lassoAnimationFrame)
    lassoAnimationFrame = null
  }
  
  document.removeEventListener('mousemove', updateLasso)
  document.removeEventListener('mouseup', endLassoOrDrag)
}

// Fonction pour supprimer les notes sélectionnées
const deleteSelectedNotes = () => {
  if (selectedNotes.value.length === 0) return
  
  console.log(`🗑️ Suppression de ${selectedNotes.value.length} notes sélectionnées`)
  
  selectedNotes.value.forEach(note => {
    midiStore.deleteNote(note.id)
  })
  
  selectedNotes.value = []
  selectedNote.value = null
  emit('point-selected', null)
}

// Gérer les touches clavier pour la sélection multiple
const handleKeydown = (event) => {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelectedNotes()
  }
  
  if (event.key === 'Escape') {
    selectedNotes.value = []
    selectedNote.value = null
    emit('point-selected', null)
  }
}

// CORRECTION: Fonction de nettoyage avec méthode MIDI standardisée
const stopAllPlayingNotes = () => {
  for (const [noteKey, noteInfo] of playingNotes.value.entries()) {
    midiManager.sendNoteOff(noteInfo.outputId, noteInfo.channel, noteInfo.midi)
  }
  playingNotes.value.clear()
}

// VelocityLane n'a plus de logique wheel - géré par WheelHandler global

// Gérer la mise à jour manuelle de la valeur d'une vélocité depuis l'interface
const handleManualPointValueUpdate = async (event) => {
  const updateData = event.detail
  console.log(`📝 VelocityLane: Réception mise à jour manuelle:`, updateData)
  
  if (updateData.pointId && updateData.type === 'velocity') {
    try {
      // Mettre à jour directement dans le store
      const toneVelocity = midiToTone(updateData.newValue)
      console.log('🔍 VelocityLane: Conversion MIDI -> Tone:', {
        pointId: updateData.pointId,
        midiValue: updateData.newValue,
        toneValue: toneVelocity
      })
      
      // Mettre à jour la note dans le store
      const updateResult = await midiStore.updateNote(updateData.pointId, {
        velocity: toneVelocity
      })
      
      // Forcer la réactivité et attendre la mise à jour
      forceReactivity.value++
      await nextTick()
      
      // Réémettre la sélection avec la nouvelle valeur
      emit('point-selected', {
        id: String(updateData.pointId),
        value: updateData.newValue,
        type: 'velocity'
      })
      
    } catch (error) {
      console.error(`❌ Erreur mise à jour vélocité:`, error)
      console.error('Stack trace:', error.stack)
    }
  }
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
  
  // Ajouter les listeners clavier pour le lasso
  document.addEventListener('keydown', handleKeydown)
  
  // Écouter les événements de mise à jour manuelle de valeur
  document.addEventListener('update-point-value', handleManualPointValueUpdate)
})

onUnmounted(() => {
  // NOUVEAU: Arrêter toutes les notes en cours
  stopAllPlayingNotes()
  
  if (resizeObserver && velocityLaneRef.value) {
    resizeObserver.unobserve(velocityLaneRef.value)
  }
  
  // Nettoyer tous les event listeners
  document.removeEventListener('mousemove', onNoteDrag)
  document.removeEventListener('mouseup', stopNoteDrag)
  document.removeEventListener('mousemove', updateLasso)
  document.removeEventListener('mouseup', endLassoOrDrag)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('update-point-value', handleManualPointValueUpdate)
  
  // Nettoyer les données temporaires
  dragTempNotes.value = null
  updateCache.clear()
})

provide('timeToPixel', timeToPixel)
provide('totalWidth', totalWidth)
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

/* Lignes de référence en arrière-plan */
.velocity-reference-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

/* ✅ STYLES SVG POUR LES BARRES DE VÉLOCITÉ */
.velocity-bars-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 10;
}

.velocity-bar-svg {
  cursor: pointer;
  transition: opacity 0.1s ease;
}

.velocity-bar-svg:hover {
  opacity: 0.8;
}

.velocity-bar-svg.dragging {
  cursor: ns-resize;
  opacity: 1;
}

.velocity-bar-svg.single-selected {
  opacity: 1;
}

.velocity-bar-svg.multi-selected {
  opacity: 1;
}

.velocity-lane.brush-mode {
  cursor: crosshair;
}

/* Rectangle de sélection lasso */
.lasso-selection {
  border: 2px dashed #2196F3;
  background: rgba(33, 150, 243, 0.1);
  pointer-events: none;
  z-index: 20;
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
  opacity: 0.6;
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