<template>
  <div class="viewport-container">
    <div class="midi-editor">
      <!-- Menu Bar -->
      <MenuBar />

      <!-- Tool Bar -->
      <ToolBar />

      <!-- Main Content Area -->
      <div class="main-content">
        <!-- Left Column: Track List -->
        <div class="left-column" :style="{ width: uiStore.trackListTotalWidth + 'px' }">
          <TrackList />
        </div>

        <!-- Vertical Splitter -->
        <div
          class="vertical-splitter"
          @mousedown="startResizeTrackList"
        ></div>

        <!-- Right Column: Editor Area -->
        <div class="right-column" @wheel="handleGlobalWheel">
            <!-- Timeline -->
            <div class="timeline-container">
            <div class="timeline-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }">
              <SelectRulers />    
            </div>
            <div class="timeline-scroll sync-scroll-x">
              <TimeLine />
            </div>
          </div>

          <!-- MarkerRuler -->
          <div v-if="projectStore.showMarkerRuler" class="marker-container">
            <div class="marker-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }">
              <MarkerControls 
                ref="markerControlsRef"
                :selected-marker="selectedMarker"
                @marker-deselected="selectedMarker = null"
              />
            </div>
            <div class="marker-scroll sync-scroll-x">
              <MarkerRuler 
                ref="markerRulerRef"
                :selected-marker="selectedMarker"
                @marker-selected="handleMarkerSelection"
                @marker-edit="handleMarkerEdit"
              />
            </div>
          </div>            

          <!-- TimeSignatureRuler -->
          <div v-if="projectStore.showSignatureRuler" class="timesignature-container">
            <div class="timesignature-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }">
              <SignatureControls 
                ref="signatureControlsRef"
                :selected-signature="selectedSignature"
                @signature-deselected="selectedSignature = null"
              />
            </div>
            <div class="timesignature-scroll sync-scroll-x">
              <TimeSignatureRuler 
                ref="timeSignatureRulerRef"
                :selected-signature="selectedSignature"
                @signature-selected="handleSignatureSelection"
                @signature-edit="handleSignatureEdit"
              />
            </div>
          </div>        

          <!-- Piano + Grid Area -->
          <div class="piano-grid-container">
            <div class="piano-keys-container sync-scroll-y" ref="pianoKeysContainerRef">
              <PianoKeys />
            </div>
            <div class="piano-grid-scroll sync-scroll-x sync-scroll-y" ref="pianoGridContainerRef">
              <PianoGrid />
            </div>
          </div>

          <!-- Horizontal Splitter - Conditionné par le bouton Edit -->
          <div
            v-show="transportControlsRef?.showEditor"
            class="horizontal-splitter"
            @mousedown="startResizeMidiLanes"
          ></div>

          <!-- MIDI Lanes - Conditionné par le bouton Edit -->
          <div 
            v-show="transportControlsRef?.showEditor" 
            class="midi-lanes-container" 
            :style="{ height: uiStore.midiLanesHeight + 'px' }">
            <div class="midi-lanes-content">
              <!-- Spacer gauche -->
              <div class="midi-lanes-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }">
                <MidiLaneInfos 
                  :selected-lane="selectedLane"
                  :cc-number="selectedCCNumber"
                  :cc-name="selectedCCName"
                  :selected-point-value="selectedPointValue"
                  :selected-point-id="selectedPointId"
                  @update-point-value="handlePointValueUpdate"
                />
              </div>
              
              <!-- Partie droite avec tabs et contenu -->
              <div class="midi-lanes-right">
                <div class="midi-lanes-tabs">
                  <MidiLaneTabs 
                    ref="midiLaneTabsRef" 
                    @tab-selected="handleLaneSelection"
                    @lanes-updated="handleLanesUpdated"
                  />
                </div>
                <div class="midi-lanes-scroll sync-scroll-x">
                  <MidiLanes 
                    :selected-lane="selectedLane" 
                    @point-selected="handlePointSelection"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Scroll Controller - Auto-scroll indépendant -->
          <div class="scroll-controller-container">
            <div class="scroll-controller-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }"></div>
            <div class="scroll-controller-wrapper">
              <ScrollController 
                @scroll-change="handleScrollControllerChange"
                ref="scrollControllerRef"
              />
            </div>
          </div>       
        </div>
      </div>

      <!-- Status Bar -->
      <StatusBar />

      <!-- Transport Controls -->
      <TransportControls 
        ref="transportControlsRef"
        :show-progress-bar="true"
        :show-tempo="true"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from './stores/ui'
import { useMidiStore } from './stores/midi'
import { useProjectStore } from './stores/project'
import { useKeyboardEvents } from './composables/useKeyboardEvents'
import MenuBar from './components/MenuBar.vue'
import ToolBar from './components/ToolBar.vue'
import TrackList from './components/TrackList.vue'
import TimeLine from './components/TimeLine.vue'
import PianoKeys from './components/PianoKeys.vue'
import PianoGrid from './components/PianoGrid.vue'
import MidiLaneTabs from './components/MidiLaneTabs.vue'
import MidiLanes from './components/MidiLanes.vue'
import MidiLaneInfos from './components/MidiLaneInfos.vue'
import StatusBar from './components/StatusBar.vue'
import TimeSignatureRuler from './components/rulers/TimeSignatureRuler.vue'
import MarkerRuler from './components/rulers/MarkerRuler.vue'
import TransportControls from './components/TransportControls.vue'
import ScrollController from './components/ScrollController.vue'
import SelectRulers from './components/buttons/SelectRulers.vue'
import SignatureControls from './components/buttons/SignatureControls.vue'
import MarkerControls from './components/buttons/MarkerControls.vue'

const uiStore = useUIStore()
const midiStore = useMidiStore()
const projectStore = useProjectStore()
const { shortcuts } = useKeyboardEvents()

// Les états des rulers sont maintenant dans le projectStore

// Lane sélectionnée
const selectedLane = ref(null)
const selectedCCNumber = ref(null)
const selectedCCName = ref('')
const selectedPointValue = ref(null)
const selectedPointId = ref(null)

// Refs pour le scroll vertical piano/grid
const pianoGridContainerRef = ref(null)
const pianoKeysContainerRef = ref(null)

// Ref pour le ScrollController
const scrollControllerRef = ref(null)

// Ref pour MidiLaneTabs
const midiLaneTabsRef = ref(null)

// Ref pour TransportControls
const transportControlsRef = ref(null)

// Ref pour TimeSignatureRuler  
const timeSignatureRulerRef = ref(null)

// Ref pour MarkerRuler
const markerRulerRef = ref(null)

// État pour la gestion des signatures rythmiques
const selectedSignature = ref(null)

// État pour la gestion des marqueurs
const selectedMarker = ref(null)

// Redimensionnement
let isResizingTrackList = false
let isResizingMidiLanes = false
let startX = 0
let startY = 0
let startWidth = 0
let startHeight = 0

// Les fonctions de toggle des rulers sont maintenant dans le projectStore
// handleShowSignatureRuler -> projectStore.toggleSignatureRuler
// handleShowMarkerRuler -> projectStore.toggleMarkerRuler

// Gestion de la sélection de lane
const handleLaneSelection = (lane) => {
  selectedLane.value = lane
  
  // Extraire les informations CC si c'est une lane CC
  if (lane.id && lane.id.startsWith('cc')) {
    // S'assurer que ccNumber est bien un nombre
    const ccNum = lane.props?.ccNumber
    selectedCCNumber.value = typeof ccNum === 'number' ? ccNum : parseInt(ccNum) || null
    selectedCCName.value = lane.props?.ccName
  } else {
    selectedCCNumber.value = null
    selectedCCName.value = ''
  }
  
  // Reset de la valeur du point
  selectedPointValue.value = null
  selectedPointId.value = null
}

// Gestion de la sélection de point CC
const handlePointSelection = (pointData) => {
  if (pointData === null) {
    // Déselection
    selectedPointValue.value = null
    selectedPointId.value = null
  } else if (typeof pointData === 'object' && pointData.value !== undefined) {
    // Sélection avec objet complet - valider que value est un nombre
    const value = typeof pointData.value === 'number' && !isNaN(pointData.value) 
                  ? pointData.value 
                  : 0
    selectedPointValue.value = value
    selectedPointId.value = pointData.id
  } else {
    // Compatibilité avec l'ancien format (juste la valeur)
    const value = typeof pointData === 'number' && !isNaN(pointData) 
                  ? pointData 
                  : 0
    selectedPointValue.value = value
    selectedPointId.value = null
  }
}

// Gestion de la mise à jour manuelle de la valeur d'un point CC
const handlePointValueUpdate = (updateData) => {
  console.log('🎛️ App.vue: Mise à jour manuelle point:', updateData)
  
  // Ici on peut émettre l'événement vers MidiLanes ou directement vers le store
  // Pour l'instant, on peut passer par MidiLanes avec un événement personnalisé
  const midiLanesDiv = document.querySelector('.midi-lanes-scroll')
  if (midiLanesDiv) {
    const customEvent = new CustomEvent('update-point-value', {
      detail: updateData,
      bubbles: true
    })
    console.log('🔄 App.vue: Émission événement DOM:', customEvent.type, 'vers', midiLanesDiv.className)
    midiLanesDiv.dispatchEvent(customEvent)
  } else {
    console.error('❌ App.vue: Element .midi-lanes-scroll non trouvé')
  }
}

// Gestion de la mise à jour des lanes visibles depuis MidiLaneTabs  
const handleLanesUpdated = (lanes) => {
  // Cette fonction peut être utilisée pour d'autres logiques si nécessaire
  console.log('🎛️ App.vue: Lanes mises à jour:', lanes.length)
}

// ===== GESTION DES SIGNATURES RYTHMIQUES =====

// Validation des signatures rythmiques selon les règles musicales
const validateTimeSignature = (numerator, denominator) => {
  const validNumerators = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16]
  const validDenominators = [1, 2, 4, 8, 16, 32]
  
  return validNumerators.includes(numerator) && validDenominators.includes(denominator)
}

// Gestion de la sélection d'une signature
const handleSignatureSelection = (signature) => {
  console.log('🎵 App.vue reçoit sélection signature:', signature)
  selectedSignature.value = signature
  console.log('🎵 selectedSignature.value mis à jour:', selectedSignature.value)
}

// Gestion de l'édition d'une signature (double-clic)
const handleSignatureEdit = (signature) => {
  console.log('✏️ App.vue reçoit édition signature:', signature)
  // Cette fonctionnalité sera implémentée dans TimeSignatureRuler
}

// ===== GESTION DES MARQUEURS =====

// Gestion de la sélection d'un marqueur
const handleMarkerSelection = (marker) => {
  console.log('🎯 App.vue reçoit sélection marqueur:', marker)
  selectedMarker.value = marker
  console.log('🎯 selectedMarker.value mis à jour:', selectedMarker.value)
}

// Gestion de l'édition d'un marqueur (double-clic)
const handleMarkerEdit = (marker) => {
  console.log('✏️ App.vue reçoit édition marqueur:', marker)
  // Cette fonctionnalité est implémentée dans MarkerRuler
}


// Synchronisation du scroll horizontal (générique via classe)
let scrollSyncing = false
function syncHorizontalScroll(e) {
  if (scrollSyncing) return
  scrollSyncing = true
  const source = e.target
  const scrollLeft = source.scrollLeft
  
  // Synchroniser tous les éléments avec la classe sync-scroll-x
  document.querySelectorAll('.sync-scroll-x').forEach(div => {
    if (div !== source) div.scrollLeft = scrollLeft
  })
  
  // Synchroniser aussi le ScrollController si ce n'est pas lui la source
  if (scrollControllerRef.value && !source.closest('.scroll-controller-wrapper')) {
    scrollControllerRef.value.scrollTo(scrollLeft)
  }
  
  scrollSyncing = false
}

// Gestion du scroll depuis le ScrollController
function handleScrollControllerChange(scrollData) {
  if (scrollSyncing) return
  scrollSyncing = true
  
  const scrollLeft = scrollData.scrollLeft
  
  // Synchroniser tous les éléments avec la classe sync-scroll-x
  document.querySelectorAll('.sync-scroll-x').forEach((div) => {
    div.scrollLeft = scrollLeft
  })
  
  scrollSyncing = false
}

// Gestion globale de la wheel pour le scroll horizontal
function handleGlobalWheel(event) {
  const deltaX = event.deltaX
  const deltaY = event.deltaY
  
  // Déterminer si c'est un scroll horizontal
  const isHorizontalScroll = Math.abs(deltaX) > Math.abs(deltaY)
  
  // Identifier sur quel composant on est
  const target = event.target
  const isPianoGrid = target.closest('.piano-grid-scroll') || target.closest('.piano-grid')
  const isTimeLine = target.closest('.timeline-scroll') || target.closest('.timeline')
  
  if (isHorizontalScroll) {
    // ✅ SCROLL HORIZONTAL GLOBAL - Synchroniser tous les composants
    event.preventDefault()
    
    // Trouver le premier élément scrollable sync-scroll-x
    const syncElements = document.querySelectorAll('.sync-scroll-x')
    if (syncElements.length > 0) {
      const firstElement = syncElements[0]
      
      // Appliquer le scroll
      firstElement.scrollLeft += deltaX
      
      // Déclencher la synchronisation avec les autres
      const syncEvent = new Event('scroll', { bubbles: true })
      firstElement.dispatchEvent(syncEvent)
    }
  } else {
    // ✅ SCROLL VERTICAL - Laisser les composants spécialisés gérer
    
    if (isPianoGrid) {
      // PianoGrid : Laisser passer le scroll vertical (il a sa propre gestion)
      return // NE PAS empêcher
    } else if (isTimeLine) {
      // TimeLine : Laisser gérer son zoom focal
      return // NE PAS empêcher
    } else {
      // Autres composants : Pas de comportement vertical spécial
      event.preventDefault() // Empêcher le scroll sur les autres composants
    }
  }
}

// Synchronisation du scroll vertical (générique via classe)
let scrollSyncingY = false
function syncVerticalScrollGeneric(e) {
  if (scrollSyncingY) return
  scrollSyncingY = true
  const source = e.target
  const scrollTop = source.scrollTop
  document.querySelectorAll('.sync-scroll-y').forEach(div => {
    if (div !== source) div.scrollTop = scrollTop
  })
  scrollSyncingY = false
}

// Redimensionnement TrackList
const startResizeTrackList = (e) => {
  e.preventDefault()
  isResizingTrackList = true
  startX = e.clientX
  startWidth = uiStore.trackListTotalWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeTrackList)
  document.addEventListener('mouseup', stopResizeTrackList)
}

const resizeTrackList = (e) => {
  if (!isResizingTrackList) return
  e.preventDefault()
  const deltaX = e.clientX - startX
  const newWidth = Math.max(300, Math.min(800, startWidth + deltaX))
  uiStore.setTrackListWidth(newWidth)
}

const stopResizeTrackList = () => {
  isResizingTrackList = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeTrackList)
  document.removeEventListener('mouseup', stopResizeTrackList)
}

// Redimensionnement MidiLanes
const startResizeMidiLanes = (e) => {
  e.preventDefault()
  isResizingMidiLanes = true
  startY = e.clientY
  startHeight = uiStore.midiLanesHeight
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeMidiLanes)
  document.addEventListener('mouseup', stopResizeMidiLanes)
}

const resizeMidiLanes = (e) => {
  if (!isResizingMidiLanes) return
  e.preventDefault()
  const deltaY = startY - e.clientY
  const newHeight = Math.max(100, Math.min(400, startHeight + deltaY))
  uiStore.setMidiLanesHeight(newHeight)
}

const stopResizeMidiLanes = () => {
  isResizingMidiLanes = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeMidiLanes)
  document.removeEventListener('mouseup', stopResizeMidiLanes)
}

// Ref vers le composant SignatureControls pour accéder à ses méthodes
const signatureControlsRef = ref(null)

// Ref vers le composant MarkerControls pour accéder à ses méthodes
const markerControlsRef = ref(null)


// Gestionnaire global pour les clics (désélection)
const handleGlobalClick = (event) => {
  // Si le clic n'est pas sur une signature ou les contrôles, déselectionner
  if (!event.target.closest('.time-signature-text') && 
      !event.target.closest('.signature-controls') &&
      !event.target.closest('.signature-mark')) {
    selectedSignature.value = null
  }
  
  // Si le clic n'est pas sur un marqueur ou les contrôles, déselectionner
  if (!event.target.closest('.marker-text') &&
      !event.target.closest('.marker-controls') &&
      !event.target.closest('.marker-mark')) {
    selectedMarker.value = null
  }
}


onMounted(async () => {
  // Initialisation d'un nouveau projet si aucun fichier n'est chargé
  if (!midiStore.isLoaded) {
    console.log('🎵 Initialisation nouveau projet au démarrage')
    await projectStore.createNewProject('Nouveau Projet')
  }

  // Scroll horizontal
  document.querySelectorAll('.sync-scroll-x').forEach(div => {
    div.addEventListener('scroll', syncHorizontalScroll)
  })
  // Scroll vertical générique
  document.querySelectorAll('.sync-scroll-y').forEach(div => {
    div.addEventListener('scroll', syncVerticalScrollGeneric)
  })

  // Exposer les fonctions de synchronisation au store
  uiStore.setSyncFunctions({
    syncHorizontalScroll,
    syncVerticalScroll: syncVerticalScrollGeneric
  })

  // Ajouter le gestionnaire global de clic
  document.addEventListener('click', handleGlobalClick)
  
  // Ajouter les raccourcis Delete et Backspace pour supprimer les signatures et marqueurs
  const handleSignatureDeletion = () => {
    if (selectedSignature.value && signatureControlsRef.value?.removeTimeSignature) {
      signatureControlsRef.value.removeTimeSignature()
      return true // Arrêter la propagation
    }
    return false // Laisser passer à d'autres handlers
  }
  
  const handleMarkerDeletion = () => {
    if (selectedMarker.value && markerControlsRef.value?.removeMarker) {
      markerControlsRef.value.removeMarker()
      return true // Arrêter la propagation
    }
    return false // Laisser passer à d'autres handlers
  }
  
  const handleGlobalDeletion = () => {
    // Essayer d'abord les marqueurs, puis les signatures
    return handleMarkerDeletion() || handleSignatureDeletion()
  }
  
  shortcuts.delete(handleGlobalDeletion, {
    description: 'Supprimer marqueur ou signature rythmique',
    ignoreInputs: true
  })
  
  shortcuts.backspace(handleGlobalDeletion, {
    description: 'Supprimer marqueur ou signature rythmique',
    ignoreInputs: true
  })
  
  // Test avec gestionnaire direct aussi (redondant mais au cas où)
  document.addEventListener('keydown', handleDirectDelete)
})

// Gestionnaire direct Delete/Backspace (redondant mais au cas où le système de raccourcis échoue)
const handleDirectDelete = (event) => {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    // Vérification plus robuste pour les inputs
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
                     event.target.contentEditable === 'true' ||
                     // Vérifier aussi les éléments parents (au cas où l'event bubblerait)
                     event.target.closest('input, textarea, select, [contenteditable="true"]')
    
    console.log('🔍 Delete/Backspace key:', {
      key: event.key,
      target: event.target.tagName,
      isInInput,
      hasSelectedSignature: !!selectedSignature.value,
      hasSelectedMarker: !!selectedMarker.value
    })
    
    if (!isInInput) {
      // Essayer d'abord les marqueurs, puis les signatures
      if (selectedMarker.value && markerControlsRef.value?.removeMarker) {
        console.log('🗑️ Suppression marqueur via gestionnaire direct')
        event.preventDefault()
        event.stopPropagation()
        markerControlsRef.value.removeMarker()
      } else if (selectedSignature.value && signatureControlsRef.value?.removeTimeSignature) {
        console.log('🗑️ Suppression signature via gestionnaire direct')
        event.preventDefault()
        event.stopPropagation()
        signatureControlsRef.value.removeTimeSignature()
      }
    } else {
      console.log('✅ Dans un input, laissant passer l\'événement')
    }
  }
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleDirectDelete)
  document.querySelectorAll('.sync-scroll-x').forEach(div => {
    div.removeEventListener('scroll', syncHorizontalScroll)
  })
  document.querySelectorAll('.sync-scroll-y').forEach(div => {
    div.removeEventListener('scroll', syncVerticalScrollGeneric)
  })
  document.removeEventListener('mousemove', resizeTrackList)
  document.removeEventListener('mouseup', stopResizeTrackList)
  document.removeEventListener('mousemove', resizeMidiLanes)
  document.removeEventListener('mouseup', stopResizeMidiLanes)
  
  // Supprimer le gestionnaire global de clic
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<style scoped>
/* Container parent qui limite strictement la zone visible */

.midi-editor {
  height: calc(100vh);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  user-select: none; /* Empêche la sélection de texte */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* ========================================== */

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-column {
  background: var(--left-column-bg, #f5f5f5);
  border-right: 1px solid var(--border-color, #ddd);
  min-width: 400px;
  max-width: 600px;
  flex-shrink: 0;
}

.vertical-splitter {
  width: 4px;
  background: var(--splitter-bg, #ddd);
  cursor: col-resize;
  user-select: none;
  position: relative;
  z-index: 10;
}

.vertical-splitter:hover {
  background: var(--splitter-hover-bg, #999);
}

.right-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Timeline */
.timeline-container {
  height: 40px;
  display: flex;
  border-bottom: 1px solid var(--border-color, #ddd);
  background: var(--timeline-bg, #fafafa);
}

.timeline-spacer {
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--timeline-spacer-bg, #f0f0f0);
}

.timeline-scroll {
  flex: 1;
  overflow: hidden;
}

/* TimeSignatureRuler */
.timesignature-container {
  height: 20px;
  display: flex;
  border-bottom: 1px solid var(--border-color, #ddd);
  background: var(--timesignature-bg, #fafafa);
  z-index: 1;
}

.timesignature-spacer {
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--timesignature-spacer-bg, #f0f0f0);
}

.timesignature-scroll {
  flex: 1;
  overflow: hidden;
}

/* MarkerRuler */
.marker-container {
  height: 20px;
  display: flex;
  border-bottom: 1px solid var(--border-color, #ddd);
  background: var(--timesignature-bg, #fafafa);
  z-index: 1;
}

.marker-spacer {
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--timesignature-spacer-bg, #f0f0f0);
}

.marker-scroll {
  flex: 1;
  overflow: hidden;
}

/* Piano + Grid Area */
.piano-grid-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.piano-keys-container {
  width: v-bind('uiStore.pianoKeysWidth + "px"');
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--piano-keys-bg, #f8f8f8);
  overflow: hidden;
}

.piano-grid-scroll {
  flex: 1;
  overflow-x: hidden; /* Masquer complètement le scroll horizontal */
  overflow-y: auto;
  /* Firefox - scrollbar uniquement verticale */
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb, #888) var(--scrollbar-track, #f1f1f1);
}

/* WebKit - Scrollbar verticale uniquement */
.piano-grid-scroll::-webkit-scrollbar {
  width: 12px; /* Largeur de la scrollbar verticale */
}

.piano-grid-scroll::-webkit-scrollbar-track {
  background: var(--scrollbar-track, #f1f1f1);
}

.piano-grid-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb, #888);
  border-radius: 6px;
}

.piano-grid-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover, #555);
}

.piano-grid-scroll::-webkit-scrollbar-corner {
  background: transparent;
}

.horizontal-splitter {
  height: 4px;
  background: var(--splitter-bg, #ddd);
  cursor: row-resize;
  user-select: none;
  position: relative;
  z-index: 10;
}

.horizontal-splitter:hover {
  background: var(--splitter-hover-bg, #999);
}

/* MIDI Lanes */
.midi-lanes-container {
  border-top: 1px solid var(--border-color, #ddd);
  background: var(--midi-lanes-bg, #fafafa);
  min-height: 100px;
  max-height: 400px;
}

.midi-lanes-content {
  display: flex;
  height: 100%;
}

.midi-lanes-spacer {
  flex-shrink: 0;
  background: var(--midi-lanes-spacer-bg, #f0f0f0);
  border-right: 1px solid var(--border-color, #ddd);
  height: 100%;
}

.midi-lanes-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.midi-lanes-tabs {
  flex-shrink: 0;
  height: 40px;
  border-bottom: 1px solid var(--border-color, #ddd);
}

.midi-lanes-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  /* Masquer la scrollbar horizontale sur WebKit (Chrome, Safari, Edge) */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE et Edge */
}

.midi-lanes-scroll::-webkit-scrollbar {
  height: 0px; /* Masquer la scrollbar horizontale sur WebKit */
}

.midi-lanes-scroll::-webkit-scrollbar-track {
  background: transparent;
}

/* Scroll Controller */
.scroll-controller-container {
  display: flex;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color, #ddd);
}

.scroll-controller-spacer {
  flex-shrink: 0;
  background: var(--scroll-controller-spacer-bg, #f0f0f0);
  border-right: 1px solid var(--border-color, #ddd);
}

.scroll-controller-wrapper {
  flex: 1;
  overflow: hidden; /* Important pour que le ScrollController puisse dépasser */
}

</style>