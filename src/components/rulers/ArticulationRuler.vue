<template>
  <div class="articulation-ruler" :style="{ width: totalWidth + 'px' }" @dblclick="handleRulerDoubleClick" @click="handleRulerClick">
    <div class="articulation-ruler-content">
      <!-- Utilisation de GridRenderer pour les lignes de mesure et beats -->
      <div class="articulation-grid-background">
        <GridRenderer
          :show-measure-lines="true"
          :show-beat-lines="true"
          :show-subdivision-lines="true"
          :show-signature-indicators="false"
          :show-measure-numbers="false"
          :show-beat-labels="false"
          :show-subdivision-labels="false"
          :container-height="36"
          :measure-z-index="2"
          class="grid-overlay"
        >
          <!-- Contenu personnalisé par-dessus la grille -->
          <template #default="">
            <!-- Marqueurs MIDI -->
            <div
              v-for="articulation in articulationsWithPositions"
              :key="articulation.id"
              class="articulation-mark"
              :style="{ left: getArticulationDisplayPosition(articulation) + 'px' }"
            >
              <div 
                class="articulation-container"
                :class="{ 
                  'selected': selectedArticulationFromParent?.id === articulation.id,
                  'dragging': isDragging && draggedArticulation?.id === articulation.id
                }"
                :style="{ width: getArticulationDisplayWidth(articulation) + 'px' }"
                :title="`Articulation: ${articulation.name} à ${formatTime(articulation.time)}`"
                @click.stop="selectArticulation(articulation, $event)"
                @dblclick.stop="startEditArticulation(articulation)"
                @mousedown.stop="handleMouseDown(articulation, $event)"
              >
                <!-- Poignée de drag droite -->
                <div 
                  class="drag-handle-right"
                  :class="{ 'drag-handle-dragging': isRightDragging && draggedArticulation?.id === articulation.id }"
                  @mousedown.stop="startRightDrag(articulation, $event)"
                ></div>
                <!-- Mode édition inline -->
                <input
                  v-if="editingArticulation?.id === articulation.id"
                  v-model="tempArticulationName"
                  @blur="saveArticulation(articulation)"
                  @keyup.enter="saveArticulation(articulation)"
                  @keyup.escape="cancelEdit"
                  @keydown="handleArticulationInputKeyDown"
                  class="articulation-input-field"
                  placeholder="#Articulation"
                />
                <!-- Mode affichage -->
                <span 
                  v-else 
                  class="articulation-text" 
                  :style="{ 
                    '--articulation-custom-color': articulation.color,
                    '--articulation-text-color': getContrastTextColor(articulation.color)
                  }"
                >
                  {{ articulation.name }}
                </span>
              </div>
              
              <!-- Ligne de marqueur verticale -->
              <div class="articulation-line" :style="{ backgroundColor: articulation.color }"></div>
            </div>
            
            <!-- Indicateur de snap pendant le drag -->
            <div
              v-if="showSnapIndicator"
              class="snap-indicator"
              :style="{ left: timeToPixels(snapIndicatorTime) + 'px' }"
            >
              <div class="snap-line"></div>
            </div>
       
            <GlobalPlaybackCursor
              :total-width="totalWidthWithSignature"
            />
          </template>
        </GridRenderer>
      </div>
    </div>

    <!-- Dropdown de sélection de type d'articulation -->
    <div
      v-if="showTypeDropdown"
      class="articulation-type-dropdown"
      :style="{
        position: 'fixed',
        left: dropdownPosition.x + 'px',
        top: dropdownPosition.y + 'px',
        zIndex: 1000
      }"
    >
      <div class="dropdown-content">
        <div class="dropdown-header">Choisir le type :</div>
        <div
          v-for="articulationType in projectStore.getAvailableArticulationTypes()"
          :key="articulationType.uuid"
          class="dropdown-item"
          @click="selectArticulationType(articulationType)"
        >
          {{ articulationType.name }}
        </div>
        <div v-if="projectStore.getAvailableArticulationTypes().length === 0" class="dropdown-item disabled">
          Aucun type configuré
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useArticulations } from '@/composables/useArticulations'
import { useSnapLogic } from '@/composables/useSnapLogic'
import { useMidiPlayer } from '@/composables/useMidiPlayer'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useProjectStore } from '@/stores/project'
import GlobalPlaybackCursor from '@/components/GlobalPlaybackCursor.vue'
import GridRenderer from '../GridRenderer.vue'

const timeSignatureComposable = useTimeSignature()

// Props depuis le parent
const props = defineProps({
  selectedArticulation: { type: Object, default: null }
})

const totalWidthWithSignature = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

// Émissions vers le parent
const emit = defineEmits(['articulation-selected', 'articulation-edit'])

// Utiliser les composables
const uiStore = useUIStore()
const midiStore = useMidiStore()
const projectStore = useProjectStore()
const {
  articulationsWithPositions,
  totalWidth,
  timeToPixels,
  addArticulation,
  updateArticulation,
  removeArticulation
} = useArticulations()

const { snapTimeToGrid } = useSnapLogic()
const { getArticulationsWithTriggers, triggerArticulationEvents } = useMidiPlayer()

// Fonction utilitaire pour calculer si une couleur nécessite du texte blanc ou noir
const getContrastTextColor = (backgroundColor) => {
  if (!backgroundColor || backgroundColor === 'transparent') return '#000000'
  
  let r, g, b
  
  // Gérer format hex (#RRGGBB ou #RGB)
  if (backgroundColor.startsWith('#')) {
    let color = backgroundColor.replace('#', '')
    
    // Support pour les couleurs courtes #RGB
    if (color.length === 3) {
      color = color.split('').map(char => char + char).join('')
    }
    
    r = parseInt(color.substr(0, 2), 16)
    g = parseInt(color.substr(2, 2), 16)
    b = parseInt(color.substr(4, 2), 16)
  }
  // Gérer format rgb() ou rgba()
  else if (backgroundColor.startsWith('rgb')) {
    const values = backgroundColor.match(/\d+/g)
    if (values && values.length >= 3) {
      r = parseInt(values[0])
      g = parseInt(values[1])
      b = parseInt(values[2])
    } else {
      return '#000000' // Fallback
    }
  }
  else {
    return '#000000' // Fallback pour formats non supportés
  }
  
  // Calculer la luminosité selon la formule W3C
  // https://www.w3.org/WAI/GL/wiki/Relative_luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  
  // Si luminosité > 0.5, utiliser texte noir, sinon blanc
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

// Fonction pour tester les triggers d'une articulation
const testArticulationTriggers = (articulation) => {
  console.log('🎵 Test triggers pour articulation:', articulation.name)
  console.log('🔍 Articulation complète:', articulation)
  console.log('🔍 TypeId de l\'articulation:', articulation.typeId)
  
  // Vérifier qu'il y a des types d'articulation configurés
  const availableTypes = projectStore.getAvailableArticulationTypes()
  if (availableTypes.length === 0) {
    console.warn('⚠️ Aucun type d\'articulation configuré - impossible de tester les triggers')
    console.info('💡 Configurez des types d\'articulation dans l\'Expression Map pour activer les triggers')
    return
  }
  
  // Récupérer toutes les articulations avec triggers
  const articulationsWithTriggers = getArticulationsWithTriggers()
  
  // Trouver notre articulation dans la liste
  const articulationWithTriggers = articulationsWithTriggers.find(a => a.id === articulation.id)
  
  if (!articulationWithTriggers) {
    console.warn('⚠️ Articulation non trouvée dans la liste des triggers ou pas de triggers configurés')
    console.log('🎯 Articulations avec triggers disponibles:', articulationsWithTriggers.map(a => a.name))
    
    // Vérifier si l'articulation n'a pas de typeId assigné
    if (!articulation.typeId) {
      console.info('💡 Cette articulation n\'a pas de type assigné (typeId: null)')
      console.info('🔧 Solutions possibles :')
      console.info('   1. Utilisez Ctrl+clic sur l\'articulation pour assigner un type')
      console.info('   2. Ou double-cliquez pour créer une nouvelle articulation avec auto-assignation')
      
      // Proposer l'auto-assignation si un type du même nom existe
      const matchingType = availableTypes.find(type => type.name === articulation.name)
      if (matchingType) {
        console.info('🎯 Type correspondant trouvé dans l\'Expression Map:', matchingType.name)
        console.info('⚡ Auto-assignation du typeId...')
        
        const success = updateArticulation(articulation.id, { 
          typeId: matchingType.uuid,
          color: matchingType.color 
        })
        
        if (success) {
          console.log('✅ TypeId auto-assigné avec succès!')
          // Retry the trigger test
          setTimeout(() => testArticulationTriggers(articulation), 100)
          return
        }
      }
    } else {
      console.info('💡 Vérifiez que le type d\'articulation "' + articulation.name + '" existe dans l\'Expression Map avec des triggers')
    }
    return
  }
  
  console.log('✅ Articulation avec triggers trouvée:', articulationWithTriggers)
  console.log('🎛️ Triggers à envoyer:', articulationWithTriggers.triggers)
  
  // Envoyer les triggers
  triggerArticulationEvents(articulationWithTriggers)
}

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
const selectedArticulationFromParent = computed(() => props.selectedArticulation)
const editingArticulation = ref(null)
const tempArticulationName = ref('')

// État pour le drag des marqueurs
const isDragging = ref(false)
const isRightDragging = ref(false)
const draggedArticulation = ref(null)
const dragStartX = ref(0)
const dragStartTime = ref(0)
const dragStartPixelX = ref(0)
const currentDragTime = ref(0)
const currentDragPosition = ref(0) // Position temporaire en pixels pendant le drag
const currentDragHandlePosition = ref(0) // Position de la poignée pendant le right drag (en px depuis le bord gauche)
const showSnapIndicator = ref(false)
const snapIndicatorTime = ref(0)

// État pour le dropdown de sélection de type d'articulation
const showTypeDropdown = ref(false)
const dropdownArticulation = ref(null)
const dropdownPosition = ref({ x: 0, y: 0 })

// Utilitaires
const formatTime = (timeInSeconds) => {
  const minutes = Math.floor(timeInSeconds / 60)
  const seconds = Math.floor(timeInSeconds % 60)
  const centiseconds = Math.floor((timeInSeconds % 1) * 100)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
}

// Sélectionner un marqueur
const selectArticulation = (articulation, event = null) => {
  // Si Ctrl/Cmd + clic, afficher le dropdown de sélection de type
  if (event && (event.ctrlKey || event.metaKey)) {
    showArticulationTypeDropdown(articulation, event)
    return
  }
  
  console.log('🎯 Clic sur marqueur:', articulation)
  
  // Tester les triggers de cette articulation
  testArticulationTriggers(articulation)
  
  emit('articulation-selected', articulation)
}

// Gérer le clic simple sur l'espace vide du ruler
const handleRulerClick = () => {
  // Si on clique directement sur le ruler (pas sur un marqueur)
  console.log('🎯 Clic simple sur l\'espace vide du ruler')
  
  // Désélectionner le marqueur actuel
  emit('articulation-selected', null)
}

// Gérer le double-clic sur l'espace vide du ruler pour ajouter une articulation
const handleRulerDoubleClick = (event) => {
  // Si on double-clique directement sur le ruler (pas sur une articulation)
  const rect = event.currentTarget.getBoundingClientRect()
  const pixelX = event.clientX - rect.left
  let time = pixelsToTimeWithSignatures(pixelX)
  
  // Snapper le temps à la grille pour un alignement parfait
  if (uiStore.snapToGrid) {
    time = snapTimeToGrid(time)
  }
  
  console.log('🎯 Double-clic sur l\'espace vide du ruler à', pixelX, 'px =', time, 's (snappé)')
  console.log('🎯 Piste sélectionnée:', midiStore.selectedTrack)
  
  // Vérifier qu'une piste est sélectionnée
  if (midiStore.selectedTrack === null || midiStore.selectedTrack === undefined) {
    console.warn('⚠️ Aucune piste sélectionnée, impossible d\'ajouter une articulation')
    return
  }
  
  console.log('✅ Piste sélectionnée OK, vérification des types d\'articulation...')
  
  // Vérifier qu'il y a des types d'articulation configurés
  const availableTypes = projectStore.getAvailableArticulationTypes()
  if (availableTypes.length === 0) {
    console.warn('⚠️ Aucun type d\'articulation configuré dans l\'Expression Map')
    console.info('💡 Pour créer des articulations, configurez d\'abord des types dans l\'Expression Map :')
    console.info('   1. Cliquez sur le bouton "Crayon" dans les contrôles d\'articulation')
    console.info('   2. Ajoutez des types d\'articulation avec leurs triggers')
    console.info('   3. Sauvegardez l\'Expression Map')
    console.info('   4. Revenez double-cliquer sur la timeline pour créer des articulations')
    return
  }
  
  console.log('✅ Types d\'articulation disponibles:', availableTypes.length)
  
  // Créer une nouvelle articulation à cette position
  // Utiliser le premier type d'articulation disponible
  const firstType = availableTypes[0]
  const result = addArticulation(time, firstType.name)
  
  // Assigner immédiatement le typeId et la couleur si l'articulation a été créée
  if (result) {
    updateArticulation(result.id, { 
      typeId: firstType.uuid,
      color: firstType.color 
    })
    console.log('✅ Articulation créée avec typeId et couleur assignés:', firstType.uuid, firstType.color)
  }
  
  console.log('🎯 Résultat addArticulation:', result)
  
  // Désélectionner l'articulation actuelle
  emit('articulation-selected', null)
}

// Commencer l'édition d'un marqueur inline
const startEditArticulation = (articulation) => {
  console.log('🔧 Début édition marqueur:', articulation)
  
  editingArticulation.value = articulation
  tempArticulationName.value = articulation.name
  
  nextTick(() => {
    // Trouver l'input qui vient d'être rendu
    const inputElement = document.querySelector('.articulation-input-field')
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
  editingArticulation.value = null
  tempArticulationName.value = ''
}

// Sauvegarder le marqueur
const saveArticulation = async (articulation) => {
  const newName = (tempArticulationName.value || '').trim()
  const currentName = articulation.name
  
  // Si pas de changement, annuler
  if (!newName || newName === currentName) {
    cancelEdit()
    return
  }
  
  console.log('✅ Nouveau nom de marqueur validé:', newName)
  
  // Émettre l'événement d'édition vers le parent
  emit('articulation-edit', {
    articulation: articulation,
    oldName: currentName,
    newName: newName
  })

  // Mettre à jour le marqueur dans le store
  const success = updateArticulation(articulation.id, { name: newName })
  
  if (success) {
    console.log('✅ Marqueur mis à jour dans le store')
  } else {
    console.warn('❌ Échec de mise à jour du marqueur dans le store')
  }
  
  // Terminer l'édition
  cancelEdit()
}

// Gestionnaire des touches pour l'input de marqueur
const handleArticulationInputKeyDown = (event) => {
  console.log('🔍 ArticulationRuler input keydown:', event.key)
  
  // Empêcher la propagation pour Delete/Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    console.log('✅ ArticulationRuler: Arrêt propagation', event.key)
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

// ===================== FONCTIONS DE DRAG =====================

// Gérer le mousedown sur l'articulation (drag de position seulement)
const handleMouseDown = (articulation, event) => {
  // Ne pas démarrer le drag si on est en mode édition
  if (editingArticulation.value) {
    return
  }
  
  // Drag normal (toute l'articulation) - la poignée droite gère son propre drag
  startDrag(articulation, event)
}

// Calculer la position d'affichage d'une articulation (normale ou en cours de drag)
const getArticulationDisplayPosition = (articulation) => {
  if (isDragging.value && draggedArticulation.value?.id === articulation.id && !isRightDragging.value) {
    // Utiliser la position temporaire en pixels pendant le drag de position
    return Math.max(0, currentDragPosition.value)
  }
  // Position normale
  return articulation.pixelPosition
}

// Calculer la largeur d'affichage d'une articulation (normale ou en cours de redimensionnement)
const getArticulationDisplayWidth = (articulation) => {
  if (isRightDragging.value && draggedArticulation.value?.id === articulation.id) {
    // Utiliser la durée temporaire pendant le redimensionnement
    return Math.max(8, timeToPixelsTS(currentDragTime.value))
  }
  // Largeur basée sur la durée de l'articulation ou largeur par défaut (identique aux marqueurs)
  const duration = articulation.duration || (60 / (midiStore.getCurrentTempo || 120)) / 2 // Durée d'une croche par défaut
  return Math.max(8, timeToPixelsTS(duration))
}

// Commencer le drag depuis le bord droit (redimensionnement de l'articulation)
const startRightDrag = (articulation, event) => {
  // Ne pas démarrer le drag si on est en mode édition
  if (editingArticulation.value) {
    return
  }

  console.log('🎯 Début redimensionnement articulation:', articulation.name, 'durée actuelle:', articulation.duration)
  
  isRightDragging.value = true
  isDragging.value = true
  draggedArticulation.value = articulation
  dragStartX.value = event.clientX
  dragStartTime.value = articulation.time
  dragStartPixelX.value = articulation.pixelPosition
  // CORRECTION: Initialiser avec la durée actuelle de l'articulation, pas le temps
  const currentDuration = articulation.duration || (60 / (midiStore.getCurrentTempo || 120)) / 2
  currentDragTime.value = currentDuration
  
  // Sélectionner l'articulation en cours de drag
  emit('articulation-selected', articulation)
  
  // Ajouter les gestionnaires globaux
  document.addEventListener('mousemove', onRightDrag)
  document.addEventListener('mouseup', stopRightDrag)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

// Commencer le drag d'un marqueur
const startDrag = (articulation, event) => {
  // Ne pas démarrer le drag si on est en mode édition
  if (editingArticulation.value) {
    return
  }

  console.log('🎯 Début drag marqueur:', articulation.name)
  
  isDragging.value = true
  draggedArticulation.value = articulation
  dragStartX.value = event.clientX
  dragStartTime.value = articulation.time
  dragStartPixelX.value = articulation.pixelPosition
  currentDragTime.value = articulation.time
  // CORRECTION: Initialiser currentDragPosition avec la position actuelle
  currentDragPosition.value = articulation.pixelPosition
  
  // Sélectionner le marqueur en cours de drag
  emit('articulation-selected', articulation)
  
  // Ajouter les gestionnaires globaux
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
}

// Gérer le déplacement du marqueur
const onDrag = (event) => {
  if (!isDragging.value || !draggedArticulation.value) return
  
  const deltaX = event.clientX - dragStartX.value
  const rect = event.currentTarget?.getBoundingClientRect?.() || 
              document.querySelector('.articulation-ruler')?.getBoundingClientRect()
  
  if (!rect) return
  
  // Calculer la nouvelle position en pixels basée sur la position initiale
  const newPixelX = dragStartPixelX.value + deltaX
  const constrainedPixelX = Math.max(0, Math.min(totalWidth.value - 2, newPixelX))
  
  // Convertir en temps
  const rawTime = pixelsToTimeWithSignatures(constrainedPixelX)
  
  // Appliquer le snap si activé
  let finalTime = Math.max(0, rawTime)
  let finalPixelX = constrainedPixelX
  if (uiStore.snapToGrid) {
    const snappedTime = snapTimeToGrid(rawTime)
    const snappedPixelX = timeToPixelsTS(snappedTime)
    
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

// Gérer le redimensionnement de l'articulation depuis le bord droit
const onRightDrag = (event) => {
  if (!isRightDragging.value || !draggedArticulation.value) return
  
  const deltaX = event.clientX - dragStartX.value
  
  // Durée initiale de l'articulation
  const initialDuration = draggedArticulation.value.duration || (60 / (midiStore.getCurrentTempo || 120)) / 2
  const initialWidthPixels = timeToPixelsTS(initialDuration)
  
  // Nouvelle largeur en pixels
  const newWidthPixels = initialWidthPixels + deltaX
  const minWidthPixels = 8 // Largeur minimale
  const constrainedWidthPixels = Math.max(minWidthPixels, newWidthPixels)
  
  // Convertir la nouvelle largeur en durée (utiliser la fonction simple pour les durées)
  let finalDuration = constrainedWidthPixels / PIXELS_PER_QUARTER.value * (60 / (midiStore.getCurrentTempo || 120))
  
  // Appliquer le snap si activé
  if (uiStore.snapToGrid) {
    const snappedEndTime = snapTimeToGrid(draggedArticulation.value.time + finalDuration)
    const snappedDuration = snappedEndTime - draggedArticulation.value.time
    
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
  
  console.log(`🎯 Redimensionnement articulation: durée ${finalDuration.toFixed(3)}s${uiStore.snapToGrid ? ' (snappé)' : ''}`)
}

// Arrêter le drag et finaliser la position
const stopDrag = () => {
  if (!isDragging.value || !draggedArticulation.value) return
  
  console.log(`✅ Fin drag marqueur: ${draggedArticulation.value.name} à ${currentDragTime.value.toFixed(3)}s`)
  
  // Mettre à jour la position finale du marqueur
  const success = updateArticulation(draggedArticulation.value.id, { 
    time: currentDragTime.value 
  })
  
  if (success) {
    console.log('✅ Position du marqueur mise à jour')
  } else {
    console.warn('❌ Échec de mise à jour de la position du marqueur')
  }
  
  // Nettoyer l'état du drag
  isDragging.value = false
  draggedArticulation.value = null
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
  if (!isRightDragging.value || !draggedArticulation.value) return
  
  console.log(`✅ Fin redimensionnement articulation: ${draggedArticulation.value.name} durée ${currentDragTime.value.toFixed(3)}s`)
  
  // Mettre à jour la durée finale de l'articulation
  const success = updateArticulation(draggedArticulation.value.id, { 
    duration: currentDragTime.value 
  })
  
  if (success) {
    console.log('✅ Durée de l\'articulation mise à jour')
  } else {
    console.warn('❌ Échec de mise à jour de la durée de l\'articulation')
  }
  
  // Nettoyer l'état du drag
  isDragging.value = false
  isRightDragging.value = false
  draggedArticulation.value = null
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

// Fonctions pour le dropdown de sélection de type d'articulation
const showArticulationTypeDropdown = (articulation, event) => {
  const availableTypes = projectStore.getAvailableArticulationTypes()
  
  if (availableTypes.length === 0) {
    console.log('⚠️ Aucun type d\'articulation configuré dans l\'expression map')
    return
  }
  
  console.log('🎯 Affichage dropdown types articulations:', availableTypes.map(t => ({ name: t.name, uuid: t.uuid })))
  
  dropdownArticulation.value = articulation
  
  // Calculer la hauteur approximative du dropdown
  const itemHeight = 28 // hauteur approximative d'un item + padding
  const headerHeight = 32 // hauteur du header
  const dropdownHeight = Math.min(200, headerHeight + (availableTypes.length * itemHeight))
  
  // Positionner vers le haut pour éviter de sortir de l'écran
  dropdownPosition.value = {
    x: event.clientX,
    y: event.clientY - dropdownHeight - 5 // 5px d'espacement
  }
  showTypeDropdown.value = true
}

const selectArticulationType = (articulationType) => {
  if (!dropdownArticulation.value) return
  
  console.log('🎵 Changement type articulation:', dropdownArticulation.value.name, '->', articulationType.name)
  console.log('🎵 Assignation typeId:', articulationType.uuid)
  
  // Mettre à jour le nom, typeId et couleur de l'articulation
  const success = updateArticulation(dropdownArticulation.value.id, { 
    name: articulationType.name,
    typeId: articulationType.uuid,
    color: articulationType.color 
  })
  
  if (success) {
    console.log('✅ Type d\'articulation, typeId et couleur mis à jour')
    console.log('🎨 Nouvelle couleur:', articulationType.color)
    // Vérification que la couleur a bien été mise à jour
    nextTick(() => {
      console.log('🔍 Couleur dans l\'articulation après mise à jour:', dropdownArticulation.value?.color)
    })
  } else {
    console.warn('❌ Échec de mise à jour du type d\'articulation')
  }
  
  // Fermer le dropdown
  hideArticulationTypeDropdown()
}

const hideArticulationTypeDropdown = () => {
  showTypeDropdown.value = false
  dropdownArticulation.value = null
  dropdownPosition.value = { x: 0, y: 0 }
}

// Gestionnaire global de clic pour sortir du mode édition et fermer le dropdown
const handleGlobalClick = (event) => {
  // Fermer le dropdown si on clique en dehors
  if (showTypeDropdown.value) {
    const clickedElement = event.target
    const isDropdownClick = clickedElement.closest('.articulation-type-dropdown')
    
    if (!isDropdownClick) {
      hideArticulationTypeDropdown()
    }
  }
  
  if (!editingArticulation.value) return
  
  // Vérifier si le clic est sur l'input d'édition ou ses parents
  const clickedElement = event.target
  const isInputClick = clickedElement.classList.contains('articulation-input-field') ||
                      clickedElement.closest('.articulation-container')
  
  if (!isInputClick) {
    // Clic en dehors de l'input, sauvegarder et sortir du mode édition
    console.log('🔄 Clic global détecté, sortie du mode édition')
    const currentArticulation = editingArticulation.value
    if (currentArticulation) {
      saveArticulation(currentArticulation)
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
})

// Exposition des données pour les composants parents
defineExpose({
  articulationsWithPositions,
  totalWidth,
  removeArticulation: (articulationId) => {
    const success = removeArticulation(articulationId)
    if (success) {
      emit('articulation-selected', null)
    }
    return success
  }
})
</script>

<style scoped>
.articulation-ruler {
  height: 36px;
  position: relative;
  background-color: #e0e0e0;
  min-width: 100%;
  border-bottom: 1px solid var(--articulation-ruler-border, #dee2e6);
  border-top: 1px solid var(--articulation-ruler-border, #dee2e6);
  overflow: hidden;
}

.articulation-ruler-content {
  height: 100%;
  position: relative;
  overflow: hidden;
}

.articulation-grid-background {
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
.articulation-mark {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 3; /* Au-dessus de GridRenderer */
  pointer-events: auto; /* Permettre les clics sur les marques de marqueur */
}

.articulation-container {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  pointer-events: auto;
  /* Largeur définie dynamiquement par :style comme MarkerRuler */
  /* Suppression du margin-top pour un centrage parfait */
}

.articulation-container.selected .articulation-text {
  background: var(--articulation-text-selected-bg, #007bff);
  color: var(--articulation-text-selected-text, #fff);
  border-color: var(--articulation-text-selected-border, #007bff);
}

.articulation-container.dragging {
  opacity: 0.8;
  z-index: 10;
}

.articulation-container.dragging .articulation-text {
  background: var(--articulation-text-dragging-bg, #FF9800);
  color: var(--articulation-text-dragging-text, #fff);
  border-color: var(--articulation-text-dragging-border, #F57C00);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.articulation-text {
  font-size: 13px;
  color: var(--articulation-text-color, #fff);
  background: var(--articulation-custom-color, #4ECDC4);
  transition: all 0.2s ease;
  padding: 1px 4px;
  cursor: pointer;
  user-select: none;
  text-align: left;
  display: inline-block;
  width: 100%; /* S'adapter à la largeur du container parent comme MarkerRuler */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}

/* Désactiver les transitions pendant le drag pour éviter l'effet élastique */
.articulation-container.dragging .articulation-text {
  transition: none;
}

.articulation-text:hover {
  opacity: 0.7;
}

.articulation-input-field {
  background: var(--panel-bg);
  border: 1px solid var(--menu-active-fg);
  padding: 0 3px;
  font-size: 12px;
  font-weight: bold;
  color: var(--articulation-input-text, #000);
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
  background: var(--articulation-drag-handle, rgba(0, 255, 0, 0.3));
  cursor: ew-resize;
  border-radius: 0 2px 2px 0;
  transition: background-color 0.2s, width 0.2s;
  z-index: 10;
}

.drag-handle-right:hover {
  background: var(--articulation-drag-handle-hover, rgba(0, 255, 0, 0.5));
  width: 10px;
}

/* CORRECTION: Pendant le drag, désactiver les transitions de la poignée pour éviter l'effet élastique */
.drag-handle-right.drag-handle-dragging {
  transition: none;
}

.articulation-line {
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

/* Personnalisation des lignes de GridRenderer pour ArticulationRuler */
.grid-overlay :deep(.measure-line) {
  background: var(--articulation-measure-bar, #999);
  width: 2px;
  opacity: 0.8;
}

.grid-overlay :deep(.beat-line) {
  background: var(--grid-beat-line, #bbb);
  width: 1px;
  opacity: 0.6;
}

/* Dropdown de sélection de type d'articulation */
.articulation-type-dropdown {
  pointer-events: auto;
}

.dropdown-content {
  background: var(--panel-bg, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 150px;
  max-height: 200px;
  overflow-y: auto;
}

.dropdown-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: bold;
  color: var(--text-color, #666);
  border-bottom: 1px solid var(--border-color, #eee);
  background: var(--panel-bg-darker, #f5f5f5);
}

.dropdown-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-color, #333);
  transition: background-color 0.2s;
}

.dropdown-item:hover:not(.disabled) {
  background: var(--hover-bg, #f0f0f0);
}

.dropdown-item.disabled {
  color: var(--text-color-muted, #999);
  cursor: default;
  font-style: italic;
}

/* Variables CSS personnalisées */
:root {
  --articulation-ruler-bg: #f0f8ff;
  --articulation-ruler-bg-gradient: #e6f3ff;
  --articulation-ruler-border: #b3d9ff;
  --articulation-text-bg: rgba(255, 255, 255, 0.9);
  --articulation-text-bg-hover: rgba(255, 255, 255, 1);
  --articulation-text-border: rgba(46, 125, 50, 0.3);
  --articulation-text-border-hover: #4ECDC4;
  --articulation-text: #2E7D32;
  --articulation-text-hover: #1B5E20;
  --articulation-text-selected-bg: #4ECDC4;
  --articulation-text-selected-text: #fff;
  --articulation-text-selected-border: #26A69A;
  --articulation-text-dragging-bg: #FF9800;
  --articulation-text-dragging-text: #fff;
  --articulation-text-dragging-border: #F57C00;
  --articulation-input-text: #333;
  --articulation-measure-bar: #ccc;
  --articulation-drag-handle: rgba(0, 255, 0, 0.3);
  --articulation-drag-handle-hover: rgba(0, 255, 0, 0.5);
  --snap-indicator-color: #FF9800;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --articulation-ruler-bg: #1a2332;
    --articulation-ruler-bg-gradient: #0f1419;
    --articulation-ruler-border: #2d3748;
    --articulation-text: #4fd1c7;
    --articulation-text-hover: #81e6d9;
    --articulation-text-bg: rgba(26, 35, 50, 0.9);
    --articulation-text-bg-hover: rgba(26, 35, 50, 1);
    --articulation-text-border: rgba(79, 209, 199, 0.3);
    --articulation-text-border-hover: #4fd1c7;
    --articulation-text-selected-bg: #4fd1c7;
    --articulation-text-selected-text: #1a202c;
    --articulation-text-selected-border: #38b2ac;
    --articulation-text-dragging-bg: #ed8936;
    --articulation-text-dragging-text: #1a202c;
    --articulation-text-dragging-border: #dd6b20;
    --articulation-input-text: #e2e8f0;
    --articulation-measure-bar: #4a5568;
    --articulation-drag-handle: rgba(79, 209, 199, 0.4);
    --articulation-drag-handle-hover: rgba(79, 209, 199, 0.6);
    --snap-indicator-color: #ed8936;
  }
}
</style>