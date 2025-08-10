<template>
  <div class="marker-ruler" :style="{ width: totalWidth + 'px' }" @dblclick="handleRulerDoubleClick" @click="handleRulerClick">
    <div class="marker-ruler-content">
      <!-- Utilisation de GridRenderer pour les lignes de mesure et beats -->
      <div class="marker-grid-background">
        <GridRenderer
          :show-measure-lines="true"
          :show-beat-lines="false"
          :show-subdivision-lines="false"
          :show-signature-indicators="false"
          :show-measure-numbers="false"
          :show-beat-labels="false"
          :show-subdivision-labels="false"
          :container-height="20"
          :measure-z-index="2"
          class="grid-overlay"
        >
        <!-- Contenu personnalisé par-dessus la grille -->
        <template #default="">
          <!-- Marqueurs MIDI -->
          <div
            v-for="marker in markersWithPositions"
            :key="marker.id"
            class="marker-mark"
            :style="{ left: getMarkerDisplayPosition(marker) + 'px' }"
          >
            <div 
              class="marker-container"
              :class="{ 
                'selected': selectedMarkerFromParent?.id === marker.id,
                'dragging': isDragging && draggedMarker?.id === marker.id
              }"
              :title="`Marqueur: ${marker.name} à ${formatTime(marker.time)}`"
              @click.stop="selectMarker(marker)"
              @dblclick.stop="startEditMarker(marker)"
              @mousedown.stop="startDrag(marker, $event)"
            >
              <!-- Mode édition inline -->
              <input
                v-if="editingMarker?.id === marker.id"
                v-model="tempMarkerName"
                @blur="saveMarker(marker)"
                @keyup.enter="saveMarker(marker)"
                @keyup.escape="cancelEdit"
                @keydown="handleMarkerInputKeyDown"
                class="marker-input-field"
                placeholder="#Marker"
              />
              <!-- Mode affichage -->
              <span v-else class="marker-text">
                {{ marker.name }}
              </span>
            </div>
            
            <!-- Ligne de marqueur verticale -->
            <div class="marker-line" :style="{ backgroundColor: marker.color }"></div>
          </div>
          
          <!-- Indicateur de snap pendant le drag -->
          <div
            v-if="showSnapIndicator"
            class="snap-indicator"
            :style="{ left: timeToPixels(snapIndicatorTime) + 'px' }"
          >
            <div class="snap-line"></div>
          </div>
        </template>
        </GridRenderer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useMarkers } from '@/composables/useMarkers'
import { useSnapLogic } from '@/composables/useSnapLogic'
import { useUIStore } from '@/stores/ui'
import GridRenderer from '../GridRenderer.vue'

// Props depuis le parent
const props = defineProps({
  selectedMarker: { type: Object, default: null }
})

// Émissions vers le parent
const emit = defineEmits(['marker-selected', 'marker-edit'])

// Utiliser les composables
const uiStore = useUIStore()
const {
  markersWithPositions,
  totalWidth,
  pixelsToTime,
  timeToPixels,
  addMarker,
  updateMarker,
  removeMarker
} = useMarkers()

const { snapTimeToGrid } = useSnapLogic()

// État pour la gestion des marqueurs (utiliser le prop du parent)
const selectedMarkerFromParent = computed(() => props.selectedMarker)
const editingMarker = ref(null)
const tempMarkerName = ref('')

// État pour le drag des marqueurs
const isDragging = ref(false)
const draggedMarker = ref(null)
const dragStartX = ref(0)
const dragStartTime = ref(0)
const dragStartPixelX = ref(0)
const currentDragTime = ref(0)
const showSnapIndicator = ref(false)
const snapIndicatorTime = ref(0)

// Utilitaires
const formatTime = (timeInSeconds) => {
  const minutes = Math.floor(timeInSeconds / 60)
  const seconds = Math.floor(timeInSeconds % 60)
  const centiseconds = Math.floor((timeInSeconds % 1) * 100)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
}

// Sélectionner un marqueur
const selectMarker = (marker) => {
  console.log('🎯 Clic sur marqueur:', marker)
  emit('marker-selected', marker)
}

// Gérer le clic simple sur l'espace vide du ruler
const handleRulerClick = (event) => {
  // Si on clique directement sur le ruler (pas sur un marqueur)
  console.log('🎯 Clic simple sur l\'espace vide du ruler')
  
  // Désélectionner le marqueur actuel
  emit('marker-selected', null)
}

// Gérer le double-clic sur l'espace vide du ruler pour ajouter un marqueur
const handleRulerDoubleClick = (event) => {
  // Si on double-clique directement sur le ruler (pas sur un marqueur)
  const rect = event.currentTarget.getBoundingClientRect()
  const pixelX = event.clientX - rect.left
  const time = pixelsToTime(pixelX)
  
  console.log('🎯 Double-clic sur l\'espace vide du ruler à', pixelX, 'px =', time, 's')
  
  // Créer un nouveau marqueur à cette position
  const markerNumber = markersWithPositions.value.length + 1
  const markerName = `#${markerNumber}`
  addMarker(time, markerName)
  
  // Désélectionner le marqueur actuel
  emit('marker-selected', null)
}

// Commencer l'édition d'un marqueur inline
const startEditMarker = (marker) => {
  console.log('🔧 Début édition marqueur:', marker)
  
  editingMarker.value = marker
  tempMarkerName.value = marker.name
  
  nextTick(() => {
    // Trouver l'input qui vient d'être rendu
    const inputElement = document.querySelector('.marker-input-field')
    if (inputElement) {
      inputElement.focus()
      inputElement.select()
      console.log('✅ Input focalisé pour édition')
    } else {
      console.warn('❌ Input non trouvé pour focus')
    }
  })
}

// Annuler l'édition
const cancelEdit = () => {
  editingMarker.value = null
  tempMarkerName.value = ''
}

// Sauvegarder le marqueur
const saveMarker = async (marker) => {
  const newName = (tempMarkerName.value || '').trim()
  const currentName = marker.name
  
  // Si pas de changement, annuler
  if (!newName || newName === currentName) {
    cancelEdit()
    return
  }
  
  console.log('✅ Nouveau nom de marqueur validé:', newName)
  
  // Émettre l'événement d'édition vers le parent
  emit('marker-edit', {
    marker: marker,
    oldName: currentName,
    newName: newName
  })

  // Mettre à jour le marqueur dans le store
  const success = updateMarker(marker.id, { name: newName })
  
  if (success) {
    console.log('✅ Marqueur mis à jour dans le store')
  } else {
    console.warn('❌ Échec de mise à jour du marqueur dans le store')
  }
  
  // Terminer l'édition
  cancelEdit()
}

// Gestionnaire des touches pour l'input de marqueur
const handleMarkerInputKeyDown = (event) => {
  console.log('🔍 MarkerRuler input keydown:', event.key)
  
  // Empêcher la propagation pour Delete/Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    console.log('✅ MarkerRuler: Arrêt propagation', event.key)
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

// ===================== FONCTIONS DE DRAG =====================

// Calculer la position d'affichage d'un marqueur (normale ou en cours de drag)
const getMarkerDisplayPosition = (marker) => {
  if (isDragging.value && draggedMarker.value?.id === marker.id) {
    // Utiliser la position temporaire pendant le drag
    return Math.max(0, timeToPixels(currentDragTime.value))
  }
  // Position normale
  return marker.pixelPosition
}

// Commencer le drag d'un marqueur
const startDrag = (marker, event) => {
  // Ne pas démarrer le drag si on est en mode édition
  if (editingMarker.value) {
    return
  }

  console.log('🎯 Début drag marqueur:', marker.name)
  
  isDragging.value = true
  draggedMarker.value = marker
  dragStartX.value = event.clientX
  dragStartTime.value = marker.time
  dragStartPixelX.value = marker.pixelPosition
  currentDragTime.value = marker.time
  
  // Sélectionner le marqueur en cours de drag
  emit('marker-selected', marker)
  
  // Ajouter les gestionnaires globaux
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
}

// Gérer le déplacement du marqueur
const onDrag = (event) => {
  if (!isDragging.value || !draggedMarker.value) return
  
  const deltaX = event.clientX - dragStartX.value
  const rect = event.currentTarget?.getBoundingClientRect?.() || 
              document.querySelector('.marker-ruler')?.getBoundingClientRect()
  
  if (!rect) return
  
  // Calculer la nouvelle position en pixels basée sur la position initiale
  const newPixelX = dragStartPixelX.value + deltaX
  const constrainedPixelX = Math.max(0, Math.min(totalWidth.value - 2, newPixelX))
  
  // Convertir en temps
  const rawTime = pixelsToTime(constrainedPixelX)
  
  // Appliquer le snap si activé
  let finalTime = Math.max(0, rawTime)
  if (uiStore.snapToGrid) {
    const snappedTime = snapTimeToGrid(rawTime)
    const snappedPixelX = timeToPixels(snappedTime)
    
    // Montrer l'indicateur de snap si il y a une différence significative
    if (Math.abs(constrainedPixelX - snappedPixelX) > 3) {
      showSnapIndicator.value = true
      snapIndicatorTime.value = snappedTime
    } else {
      showSnapIndicator.value = false
    }
    
    finalTime = Math.max(0, snappedTime)
  } else {
    showSnapIndicator.value = false
  }
  
  currentDragTime.value = finalTime
  
  console.log(`🎯 Drag marqueur à ${constrainedPixelX}px = ${finalTime.toFixed(3)}s${uiStore.snapToGrid ? ' (snappé)' : ''}`)
}

// Arrêter le drag et finaliser la position
const stopDrag = () => {
  if (!isDragging.value || !draggedMarker.value) return
  
  console.log(`✅ Fin drag marqueur: ${draggedMarker.value.name} à ${currentDragTime.value.toFixed(3)}s`)
  
  // Mettre à jour la position finale du marqueur
  const success = updateMarker(draggedMarker.value.id, { 
    time: currentDragTime.value 
  })
  
  if (success) {
    console.log('✅ Position du marqueur mise à jour')
  } else {
    console.warn('❌ Échec de mise à jour de la position du marqueur')
  }
  
  // Nettoyer l'état du drag
  isDragging.value = false
  draggedMarker.value = null
  dragStartX.value = 0
  dragStartTime.value = 0
  dragStartPixelX.value = 0
  currentDragTime.value = 0
  showSnapIndicator.value = false
  snapIndicatorTime.value = 0
  
  // Retirer les gestionnaires globaux
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Gestionnaire global de clic pour sortir du mode édition
const handleGlobalClick = (event) => {
  if (!editingMarker.value) return
  
  // Vérifier si le clic est sur l'input d'édition ou ses parents
  const clickedElement = event.target
  const isInputClick = clickedElement.classList.contains('marker-input-field') ||
                      clickedElement.closest('.marker-container')
  
  if (!isInputClick) {
    // Clic en dehors de l'input, sauvegarder et sortir du mode édition
    console.log('🔄 Clic global détecté, sortie du mode édition')
    const currentMarker = editingMarker.value
    if (currentMarker) {
      saveMarker(currentMarker)
    }
  }
}

// Ajouter/retirer le gestionnaire global
onMounted(() => {
  document.addEventListener('click', handleGlobalClick, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick, true)
  
  // Nettoyer les gestionnaires de drag
  if (isDragging.value) {
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
})

// Exposition des données pour les composants parents
defineExpose({
  markersWithPositions,
  totalWidth,
  removeMarker: (markerId) => {
    const success = removeMarker(markerId)
    if (success) {
      emit('marker-selected', null)
    }
    return success
  }
})
</script>

<style scoped>
.marker-ruler {
  height: 20px;
  position: relative;
  background: linear-gradient(
    to bottom,
    var(--marker-ruler-bg, #f8f9fa) 0%,
    var(--marker-ruler-bg-gradient, #e9ecef) 100%
  );
  min-width: 100%;
  border-bottom: 1px solid var(--marker-ruler-border, #dee2e6);
  border-top: 1px solid var(--marker-ruler-border, #dee2e6);
  overflow: hidden;
}

.marker-ruler-content {
  height: 100%;
  position: relative;
  overflow: hidden;
}

.marker-grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: 0.6;
  pointer-events: none;
}

/* Overlay pour GridRenderer */
.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none; /* Permet aux clics de passer à travers */
}

/* Styles pour les éléments personnalisés */
.marker-mark {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 3; /* Au-dessus de GridRenderer */
  pointer-events: auto; /* Permettre les clics sur les marques de marqueur */
}

.marker-container {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  pointer-events: auto;
  min-width: 60px;
  margin-top: 1px;
}

.marker-container.selected .marker-text {
  background: var(--marker-text-selected-bg, #007bff);
  color: var(--marker-text-selected-text, #fff);
  border-color: var(--marker-text-selected-border, #007bff);
}

.marker-container.dragging {
  opacity: 0.8;
  z-index: 10;
}

.marker-container.dragging .marker-text {
  background: var(--marker-text-dragging-bg, #FF9800);
  color: var(--marker-text-dragging-text, #fff);
  border-color: var(--marker-text-dragging-border, #F57C00);
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.marker-text {
  font-size: 13px;
  color: var(--marker-text, #fff);
  transition: all 0.2s ease;
  padding: 1px 4px;
  cursor: pointer;
  user-select: none;
  text-align: left;
  display: inline-block;
  min-width: 60px;
  background: var(--marker-text-bg, #000);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.marker-text:hover {
  opacity: 0.7;
}

.marker-input-field {
  background: var(--panel-bg);
  border: 1px solid var(--menu-active-fg);
  padding: 0 3px;
  font-size: 12px;
  font-weight: bold;
  color: var(--marker-input-text, #000);
  width: 80px;
  text-align: left;
  outline: none;
  box-sizing: border-box;
  height: 20px;
  line-height: 18px;
}

.marker-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 100%;
  background-color: #4ECDC4;
  opacity: 0.8;
  z-index: 2;
}

/* Indicateur de snap */
.snap-indicator {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 15;
  pointer-events: none;
}

.snap-line {
  width: 2px;
  height: 100%;
  background: var(--snap-indicator-color, #FF9800);
  border-radius: 1px;
  opacity: 0.9;
  box-shadow: 0 0 4px rgba(255, 152, 0, 0.6);
  animation: snapPulse 0.3s ease-in-out;
}

@keyframes snapPulse {
  0% { 
    opacity: 0.5; 
    transform: scaleX(0.5);
  }
  50% { 
    opacity: 1; 
    transform: scaleX(1.2);
  }
  100% { 
    opacity: 0.9; 
    transform: scaleX(1);
  }
}

/* Personnalisation des lignes de GridRenderer pour MarkerRuler */
.grid-overlay :deep(.measure-line) {
  background: var(--marker-measure-bar, #ccc);
  width: 1px;
  opacity: 0.5;
}

/* Variables CSS personnalisées */
:root {
  --marker-ruler-bg: #f0f8ff;
  --marker-ruler-bg-gradient: #e6f3ff;
  --marker-ruler-border: #b3d9ff;
  --marker-text-bg: rgba(255, 255, 255, 0.9);
  --marker-text-bg-hover: rgba(255, 255, 255, 1);
  --marker-text-border: rgba(46, 125, 50, 0.3);
  --marker-text-border-hover: #4ECDC4;
  --marker-text: #2E7D32;
  --marker-text-hover: #1B5E20;
  --marker-text-selected-bg: #4ECDC4;
  --marker-text-selected-text: #fff;
  --marker-text-selected-border: #26A69A;
  --marker-text-dragging-bg: #FF9800;
  --marker-text-dragging-text: #fff;
  --marker-text-dragging-border: #F57C00;
  --marker-input-text: #333;
  --marker-measure-bar: #ccc;
  --snap-indicator-color: #FF9800;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --marker-ruler-bg: #1a2332;
    --marker-ruler-bg-gradient: #0f1419;
    --marker-ruler-border: #2d3748;
    --marker-text: #4fd1c7;
    --marker-text-hover: #81e6d9;
    --marker-text-bg: rgba(26, 35, 50, 0.9);
    --marker-text-bg-hover: rgba(26, 35, 50, 1);
    --marker-text-border: rgba(79, 209, 199, 0.3);
    --marker-text-border-hover: #4fd1c7;
    --marker-text-selected-bg: #4fd1c7;
    --marker-text-selected-text: #1a202c;
    --marker-text-selected-border: #38b2ac;
    --marker-text-dragging-bg: #ed8936;
    --marker-text-dragging-text: #1a202c;
    --marker-text-dragging-border: #dd6b20;
    --marker-input-text: #e2e8f0;
    --marker-measure-bar: #4a5568;
    --snap-indicator-color: #ed8936;
  }
}
</style>