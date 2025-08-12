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
              :style="{ width: getMarkerDisplayWidth(marker) + 'px' }"
              :title="`Marqueur: ${marker.name} à ${formatTime(marker.time)}`"
              @click.stop="selectMarker(marker)"
              @dblclick.stop="startEditMarker(marker)"
              @mousedown.stop="handleMouseDown(marker, $event)"
            >
              <!-- Poignée de drag droite -->
              <div 
                class="drag-handle-right"
                :class="{ 'drag-handle-dragging': isRightDragging && draggedMarker?.id === marker.id }"
                @mousedown.stop="startRightDrag(marker, $event)"
              ></div>
              
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
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import GridRenderer from '../GridRenderer.vue'

// Props depuis le parent
const props = defineProps({
  selectedMarker: { type: Object, default: null }
})

// Émissions vers le parent
const emit = defineEmits(['marker-selected', 'marker-edit'])

// Utiliser les composables
const uiStore = useUIStore()
const midiStore = useMidiStore()
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

// Utiliser les bonnes fonctions de conversion comme les notes MIDI
const { timeToPixelsWithSignatures, pixelsToTimeWithSignatures, timeToPixels: timeToPixelsTS, PIXELS_PER_QUARTER } = useTimeSignature()

// Calculer la largeur d'une croche (1/8 de noire) alignée avec les subdivisions
const getEighthNoteWidth = computed(() => {
  // Calculer la durée d'une croche en secondes
  const tempo = midiStore.getCurrentTempo || 120
  const quarterNoteDuration = 60 / tempo // Durée d'une noire en secondes
  const eighthNoteDuration = quarterNoteDuration / 2 // Durée d'une croche
  
  // Convertir cette durée en pixels de manière consistante
  const pixelsPerEighthNote = timeToPixelsTS(eighthNoteDuration)
  
  // Arrondir à la précision de la grille pour un alignement parfait
  return Math.round(pixelsPerEighthNote * 100) / 100
})

// État pour la gestion des marqueurs (utiliser le prop du parent)
const selectedMarkerFromParent = computed(() => props.selectedMarker)
const editingMarker = ref(null)
const tempMarkerName = ref('')

// État pour le drag des marqueurs
const isDragging = ref(false)
const isRightDragging = ref(false)
const draggedMarker = ref(null)
const dragStartX = ref(0)
const dragStartTime = ref(0)
const dragStartPixelX = ref(0)
const currentDragTime = ref(0) // Pour le drag normal: nouveau temps, pour le resize: nouvelle durée
const currentDragPosition = ref(0) // Position temporaire en pixels pendant le drag
const currentDragHandlePosition = ref(0) // Position de la poignée pendant le right drag (en px depuis le bord gauche)
const showSnapIndicator = ref(false)
const snapIndicatorTime = ref(0)

// SUPPRIMÉ - pas de redimensionnement dans l'original

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
  let time = pixelsToTime(pixelX)
  
  // Snapper le temps à la grille pour un alignement parfait
  if (uiStore.snapToGrid) {
    time = snapTimeToGrid(time)
  }
  
  console.log('🎯 Double-clic sur l\'espace vide du ruler à', pixelX, 'px =', time, 's (snappé)')
  
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

// Gérer le mousedown sur le marqueur (drag de position seulement)
const handleMouseDown = (marker, event) => {
  // Ne pas démarrer le drag si on est en mode édition
  if (editingMarker.value) {
    return
  }
  
  // Drag normal (tout le marqueur) - la poignée droite gère son propre drag
  startDrag(marker, event)
}

// Calculer la position d'affichage d'un marqueur (normale ou en cours de drag)
const getMarkerDisplayPosition = (marker) => {
  if (isDragging.value && draggedMarker.value?.id === marker.id && !isRightDragging.value) {
    // Utiliser la position temporaire en pixels pendant le drag de position
    return Math.max(0, currentDragPosition.value)
  }
  // Position normale
  return marker.pixelPosition
}

// Calculer la largeur d'affichage d'un marqueur (normale ou en cours de redimensionnement)
const getMarkerDisplayWidth = (marker) => {
  if (isRightDragging.value && draggedMarker.value?.id === marker.id) {
    // CORRECTION: Utiliser la largeur finale snappée, pas la durée brute
    // Ça évite le décalage entre la poignée et le bord droit du container
    const finalWidth = Math.max(8, timeToPixelsTS(currentDragTime.value))
    return finalWidth
  }
  // Largeur basée sur la durée du marqueur ou largeur par défaut
  const duration = marker.duration || (60 / (midiStore.getCurrentTempo || 120)) / 2 // Durée d'une croche par défaut
  return Math.max(8, timeToPixelsTS(duration))
}

// SUPPRIMÉ - pas de fonction getMarkerDisplayWidth dans l'original

// Commencer le drag depuis le bord droit (redimensionnement du marqueur)
const startRightDrag = (marker, event) => {
  // Ne pas démarrer le drag si on est en mode édition
  if (editingMarker.value) {
    return
  }

  console.log('🎯 Début redimensionnement marqueur:', marker.name, 'durée actuelle:', marker.duration)
  
  isRightDragging.value = true
  isDragging.value = true
  draggedMarker.value = marker
  dragStartX.value = event.clientX
  dragStartTime.value = marker.time
  dragStartPixelX.value = marker.pixelPosition
  // CORRECTION: Initialiser avec la durée actuelle du marqueur, pas le temps
  const currentDuration = marker.duration || (60 / (midiStore.getCurrentTempo || 120)) / 2
  currentDragTime.value = currentDuration
  
  // Sélectionner le marqueur en cours de drag
  emit('marker-selected', marker)
  
  // Ajouter les gestionnaires globaux
  document.addEventListener('mousemove', onRightDrag)
  document.addEventListener('mouseup', stopRightDrag)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
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
  // CORRECTION: Initialiser currentDragPosition avec la position actuelle
  currentDragPosition.value = marker.pixelPosition
  
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
  let finalPixelX = constrainedPixelX
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
    finalPixelX = snappedPixelX
  } else {
    showSnapIndicator.value = false
  }
  
  // Mettre à jour les deux variables pour éviter l'effet élastique
  currentDragTime.value = finalTime
  currentDragPosition.value = finalPixelX
  
  console.log(`🎯 Drag marqueur à ${constrainedPixelX}px = ${finalTime.toFixed(3)}s${uiStore.snapToGrid ? ' (snappé)' : ''}`)
}

// Gérer le redimensionnement du marqueur depuis le bord droit
const onRightDrag = (event) => {
  if (!isRightDragging.value || !draggedMarker.value) return
  
  const deltaX = event.clientX - dragStartX.value
  
  // Durée initiale du marqueur
  const initialDuration = draggedMarker.value.duration || (60 / (midiStore.getCurrentTempo || 120)) / 2
  const initialWidthPixels = timeToPixelsTS(initialDuration)
  
  // Nouvelle largeur en pixels
  const newWidthPixels = initialWidthPixels + deltaX
  const minWidthPixels = 8 // Largeur minimale
  const constrainedWidthPixels = Math.max(minWidthPixels, newWidthPixels)
  
  // Convertir la nouvelle largeur en durée (utiliser la fonction simple pour les durées)
  let finalDuration = constrainedWidthPixels / PIXELS_PER_QUARTER.value * (60 / (midiStore.getCurrentTempo || 120))
  
  // Appliquer le snap si activé
  if (uiStore.snapToGrid) {
    const snappedEndTime = snapTimeToGrid(draggedMarker.value.time + finalDuration)
    const snappedDuration = snappedEndTime - draggedMarker.value.time
    
    const snappedWidthPixels = timeToPixelsTS(snappedDuration)
    
    // Pas d'indicateur de snap pour le redimensionnement - la poignée reste au bon endroit
    showSnapIndicator.value = false
    
    finalDuration = Math.max(0.01, snappedDuration) // Durée minimum de 0.01s
  } else {
    showSnapIndicator.value = false
    finalDuration = Math.max(0.01, finalDuration) // Durée minimum de 0.01s
  }
  
  // Stocker la durée temporaire pour l'affichage
  currentDragTime.value = finalDuration
  
  // DEBUG: Log des valeurs calculées
  const calculatedWidth = timeToPixelsTS(finalDuration)
  console.log(`🎯 RightDrag: deltaX=${deltaX}px, initialW=${initialWidthPixels.toFixed(1)}px, newW=${constrainedWidthPixels.toFixed(1)}px, finalW=${calculatedWidth.toFixed(1)}px, duration=${finalDuration.toFixed(3)}s`)
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
  currentDragPosition.value = 0
  currentDragHandlePosition.value = 0
  showSnapIndicator.value = false
  snapIndicatorTime.value = 0
  
  // Retirer les gestionnaires globaux
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Arrêter le redimensionnement droit et finaliser la durée
const stopRightDrag = () => {
  if (!isRightDragging.value || !draggedMarker.value) return
  
  console.log(`✅ Fin redimensionnement marqueur: ${draggedMarker.value.name} durée ${currentDragTime.value.toFixed(3)}s`)
  
  // Mettre à jour la durée finale du marqueur
  const success = updateMarker(draggedMarker.value.id, { 
    duration: currentDragTime.value 
  })
  
  if (success) {
    console.log('✅ Durée du marqueur mise à jour')
  } else {
    console.warn('❌ Échec de mise à jour de la durée du marqueur')
  }
  
  // Nettoyer l'état du drag
  isDragging.value = false
  isRightDragging.value = false
  draggedMarker.value = null
  dragStartX.value = 0
  dragStartTime.value = 0
  dragStartPixelX.value = 0
  currentDragTime.value = 0
  currentDragPosition.value = 0
  currentDragHandlePosition.value = 0
  showSnapIndicator.value = false
  snapIndicatorTime.value = 0
  
  // Retirer les gestionnaires globaux
  document.removeEventListener('mousemove', onRightDrag)
  document.removeEventListener('mouseup', stopRightDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ===================== FONCTIONS DE REDIMENSIONNEMENT =====================

// Commencer le redimensionnement d'un marqueur
const startResize = (marker, event) => {
  // Ne pas démarrer le redimensionnement si on est en mode édition
  if (editingMarker.value) {
    return
  }

  console.log('🔧 Début redimensionnement marqueur:', marker.name)
  
  isResizing.value = true
  resizedMarker.value = marker
  resizeStartX.value = event.clientX
  resizeStartTime.value = marker.time
  resizeStartDuration.value = marker.duration || 1.0
  currentResizeDuration.value = marker.duration || 1.0
  
  // Sélectionner le marqueur en cours de redimensionnement
  emit('marker-selected', marker)
  
  // Ajouter les gestionnaires globaux
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

// Gérer le redimensionnement du marqueur
const onResize = (event) => {
  if (!isResizing.value || !resizedMarker.value) return
  
  const deltaX = event.clientX - resizeStartX.value
  
  // Calculer la nouvelle durée
  const deltaTime = pixelsToTime(Math.abs(deltaX)) * (deltaX < 0 ? -1 : 1)
  let newDuration = Math.max(0.1, resizeStartDuration.value + deltaTime) // Durée minimum de 0.1s
  
  // Appliquer le snap si activé
  if (uiStore.snapToGrid) {
    const endTime = resizeStartTime.value + newDuration
    const snappedEndTime = snapTimeToGrid(endTime)
    const snappedDuration = Math.max(0.1, snappedEndTime - resizeStartTime.value)
    
    const snappedEndPixel = timeToPixels(resizeStartTime.value + snappedDuration)
    const currentEndPixel = timeToPixels(resizeStartTime.value + newDuration)
    
    // Montrer l'indicateur de snap si il y a une différence significative
    if (Math.abs(currentEndPixel - snappedEndPixel) > 3) {
      showSnapIndicator.value = true
      snapIndicatorTime.value = snappedEndTime
    } else {
      showSnapIndicator.value = false
    }
    
    newDuration = snappedDuration
  } else {
    showSnapIndicator.value = false
  }
  
  currentResizeDuration.value = newDuration
  
  console.log(`🔧 Redimensionnement marqueur: ${newDuration.toFixed(3)}s${uiStore.snapToGrid ? ' (snappé)' : ''}`)
}

// Arrêter le redimensionnement et finaliser la durée
const stopResize = () => {
  if (!isResizing.value || !resizedMarker.value) return
  
  console.log(`✅ Fin redimensionnement marqueur: ${resizedMarker.value.name} durée ${currentResizeDuration.value.toFixed(3)}s`)
  
  // Mettre à jour la durée finale du marqueur
  const success = updateMarker(resizedMarker.value.id, { 
    duration: currentResizeDuration.value 
  })
  
  if (success) {
    console.log('✅ Durée du marqueur mise à jour')
  } else {
    console.warn('❌ Échec de mise à jour de la durée du marqueur')
  }
  
  // Nettoyer l'état du redimensionnement
  isResizing.value = false
  resizedMarker.value = null
  resizeStartX.value = 0
  resizeStartTime.value = 0
  resizeStartDuration.value = 0
  currentResizeDuration.value = 0
  showSnapIndicator.value = false
  snapIndicatorTime.value = 0
  showResizeCursor.value = false
  
  // Retirer les gestionnaires globaux
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
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
    document.removeEventListener('mousemove', onRightDrag)
    document.removeEventListener('mouseup', stopRightDrag)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  // Nettoyer les gestionnaires de redimensionnement
  if (isResizing.value) {
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
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
  margin-top: 1px;
  /* Largeur définie dynamiquement par :style */
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
  width: 100%; /* S'adapter à la largeur du container parent */
  background: var(--marker-text-bg, #000);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}

/* Désactiver les transitions pendant le drag pour éviter l'effet élastique */
.marker-container.dragging .marker-text {
  transition: none;
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

/* Poignée de drag droite */
.drag-handle-right {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  background: var(--marker-drag-handle, rgba(0, 255, 0, 0.3));
  cursor: ew-resize;
  border-radius: 0 2px 2px 0;
  transition: background-color 0.2s, width 0.2s;
  z-index: 10;
}

.drag-handle-right:hover {
  background: var(--marker-drag-handle-hover, rgba(0, 255, 0, 0.5));
  width: 10px;
}

/* CORRECTION: Pendant le drag, désactiver les transitions de la poignée pour éviter l'effet élastique */
.drag-handle-right.drag-handle-dragging {
  transition: none;
}

/* Poignée de redimensionnement - comme MidiNote */
.resize-handle {
  position: absolute;
  right: 0; /* Exactement au bord droit (plus de bordure) */
  top: 0;
  bottom: 0;
  width: 8px;
  background: var(--marker-resize-handle, rgba(255, 0, 0, 0.5)); /* ROUGE pour debug */
  cursor: ew-resize;
  border-radius: 0 2px 2px 0; /* Même border-radius que le parent */
  transition: background-color 0.2s, width 0.2s;
  z-index: 10; /* Z-INDEX PLUS ÉLEVÉ */
}

.resize-handle.resize-hover,
.resize-handle:hover {
  background: var(--marker-resize-handle-hover, rgba(255, 255, 255, 0.4));
  width: 10px;
}

.marker-mark.selected .resize-handle {
  background: var(--marker-resize-handle-selected, rgba(255, 255, 255, 0.3));
}

.marker-mark.resizing .resize-handle {
  background: var(--marker-resize-handle-active, rgba(255, 152, 0, 0.6));
}

/* Lignes de marqueurs */
.marker-line {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background-color: #4ECDC4;
  opacity: 0.8;
  z-index: 2;
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
  --marker-bg: rgba(78, 205, 196, 0.2);
  --marker-border: rgba(78, 205, 196, 0.5);
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
  --marker-selected-border: #4ECDC4;
  --marker-selected-bg: rgba(78, 205, 196, 0.3);
  --marker-resize-handle: rgba(255, 255, 255, 0.2);
  --marker-resize-handle-hover: rgba(255, 255, 255, 0.4);
  --marker-resize-handle-selected: rgba(255, 255, 255, 0.3);
  --marker-resize-handle-active: rgba(255, 152, 0, 0.6);
  --marker-drag-handle: rgba(0, 255, 0, 0.3);
  --marker-drag-handle-hover: rgba(0, 255, 0, 0.5);
  --snap-indicator-color: #FF9800;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --marker-ruler-bg: #1a2332;
    --marker-ruler-bg-gradient: #0f1419;
    --marker-ruler-border: #2d3748;
    --marker-bg: rgba(79, 209, 199, 0.3);
    --marker-border: rgba(79, 209, 199, 0.6);
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
    --marker-selected-border: #4fd1c7;
    --marker-selected-bg: rgba(79, 209, 199, 0.4);
    --marker-resize-handle: rgba(79, 209, 199, 0.4);
    --marker-resize-handle-hover: rgba(79, 209, 199, 0.6);
    --marker-resize-handle-selected: rgba(79, 209, 199, 0.5);
    --marker-resize-handle-active: rgba(237, 137, 54, 0.7);
    --marker-drag-handle: rgba(79, 209, 199, 0.4);
    --marker-drag-handle-hover: rgba(79, 209, 199, 0.6);
    --snap-indicator-color: #ed8936;
  }
}
</style>