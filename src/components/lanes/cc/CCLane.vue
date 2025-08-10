<template>
  <div class="lane-content">
    <!-- Grille de fond avec GridRenderer -->
    <div class="cc-grid-background">
      <GridRenderer 
        :show-measure-lines="true"
        :show-beat-lines="true"
        :show-subdivision-lines="uiStore.snapToGrid"
        :show-signature-indicators="false"
        :show-measure-numbers="false" 
        :show-beat-labels="false"
        :show-subdivision-labels="false"
      >
        <GlobalPlaybackCursor
          :container-height="100"
          :total-width="totalWidth"
          :show-debug-info="false"
        />
      </GridRenderer>
    </div>

    <div class="cc-curve-container" 
         @dblclick="addPoint" 
         @mousedown="startLassoOrDrag"
         @mousemove="updateLasso"
         @mouseup="endLassoOrDrag">

      <!-- Rectangle de sélection lasso -->
      <div v-if="isLassoMode" class="lasso-selection" :style="lassoStyle"></div>

      <!-- Points de contrôle CC - Optimisés avec suppression lignes droites -->
      <div
        v-for="point in ccPointsDisplayed"
        :key="`cc-${ccNumber}-${point.id}`"
        class="cc-point"
        :style="ccPointStyle(point)"
        @mousedown="startDrag(point, $event)"
        @dblclick="deletePoint(point, $event)"
        :class="{ 
          selected: selectedPoint?.id === point.id,
          'multi-selected': selectedPoints.some(p => p.id === point.id)
        }"
      ></div>


      <!-- Courbe CC optimisée avec polyline -->
      <svg class="cc-curve-svg" :viewBox="`0 0 ${totalWidth} 100`" preserveAspectRatio="none">
        <polyline
          v-if="ccPolylinePoints"
          :points="ccPolylinePoints"
          fill="none"
          :stroke="ccColor"
          stroke-width="2"
          opacity="0.8"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>

    </div>

    <!-- Lignes de référence CC (0, 32, 64, 96, 127) -->
    <div class="cc-reference-lines">
      <div
        v-for="level in [0, 32, 64, 96, 127]"
        :key="level"
        class="cc-reference-line"
        :class="{
          'cc-line-extreme': level === 0 || level === 127
        }"
        :style="{ bottom: Math.max(2, Math.min(98, (level / 127) * 100)) + '%' }"
      >
      </div>
    </div>

    <!-- Affichage de la valeur actuelle -->
    <div class="cc-info">
      <span>CC{{ ccNumber }} - {{ ccName }}</span>
      <span v-if="selectedPoint" class="cc-value">Value: {{ selectedPoint.value }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useSnapLogic } from '@/composables/useSnapLogic'
import GridRenderer from '@/components/GridRenderer.vue'
import GlobalPlaybackCursor from '@/components/GlobalPlaybackCursor.vue'

const props = defineProps({
  ccNumber: {
    type: Number,
    required: true
  },
  ccName: {
    type: String,
    default: ''
  },
  totalMeasures: Number,
  visibleMeasures: Array,
  measureToPixels: Function,
  // Fonctions injectées du parent pour cohérence
  timeToPixelsWithSignatures: Function,
  pixelsToTimeWithSignatures: Function
})

const emit = defineEmits(['point-selected'])

const uiStore = useUIStore()
const midiStore = useMidiStore()
const timeSignature = useTimeSignature()
const { snapTimeToGrid } = useSnapLogic()
const selectedPoint = ref(null)
const selectedPoints = ref([]) // Points sélectionnés en mode lasso
const isDragging = ref(false)
const dragTempPoints = ref(null) // Points temporaires pendant le drag

// Variables pour le mode lasso
const isLassoMode = ref(false)
const lassoStart = ref({ x: 0, y: 0 })
const lassoEnd = ref({ x: 0, y: 0 })
// Mode de déplacement en groupe
const isGroupDragging = ref(false)



// Couleurs spécifiques selon le CC
const ccColors = {
  1: '#2196F3',   // Modulation - Bleu
  7: '#4CAF50',   // Volume - Vert
  10: '#FF9800',  // Pan - Orange
  11: '#9C27B0', // Expression - Violet
}

const ccColor = computed(() => ccColors[props.ccNumber] || '#607D8B')

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
    height: height + 'px'
  }
})

// Points de contrôle CC depuis les données réelles
// Identifiant unique pour cette instance de CCLane  
const instanceId = `CCLane-${props.ccNumber}-${Math.random().toString(36).substring(2, 11)}`

const ccPoints = computed(() => {
  if (midiStore.selectedTrack === null || midiStore.selectedTrack === undefined) return []
  
  const selectedTrackId = parseInt(midiStore.selectedTrack)
  
  const trackCC = midiStore.midiCC.filter(cc => {
    const ccTrackId = parseInt(cc.trackId)
    const ccController = parseInt(cc.controller) || parseInt(cc.number) || 0
    const matches = ccTrackId === selectedTrackId && ccController === parseInt(props.ccNumber)
    
    // Debug désactivé pour performance
    
    return matches
  })
  
  const points = trackCC.map(cc => ({
    id: cc.id,
    time: parseFloat(cc.time) || 0,
    value: parseInt(cc.value) || 0,
    trackId: cc.trackId,
    lastModified: cc.lastModified
  })).sort((a, b) => a.time - b.time)
  
  // Debug désactivé
  
  return points
})



// Points optimisés : supprimer les points redondants pour les lignes droites
const ccPointsOptimized = computed(() => {
  const points = ccPoints.value
  if (points.length <= 2) return points

  // Optimisation: supprimer les points qui forment des lignes droites
  const optimizedPoints = [points[0]] // Toujours garder le premier point
  
  for (let i = 1; i < points.length - 1; i++) {
    const prevPoint = points[i - 1]
    const currentPoint = points[i]
    const nextPoint = points[i + 1]
    
    // Calculer si les 3 points forment une ligne droite
    const slope1 = (currentPoint.value - prevPoint.value) / (currentPoint.time - prevPoint.time)
    const slope2 = (nextPoint.value - currentPoint.value) / (nextPoint.time - currentPoint.time)
    
    // Si les pentes sont différentes ou si c'est un point important, le garder
    if (Math.abs(slope1 - slope2) > 0.01 || currentPoint.value === 0 || currentPoint.value === 127) {
      optimizedPoints.push(currentPoint)
    }
  }
  
  // Toujours garder le dernier point
  if (points.length > 1) {
    optimizedPoints.push(points[points.length - 1])
  }
  
  return optimizedPoints
})

// Points affichés : logique simplifiée et claire
const ccPointsDisplayed = computed(() => {
  // MODE DRAG: Utiliser les points temporaires
  if (isDragging.value && dragTempPoints.value) {
    return dragTempPoints.value.sort((a, b) => a.time - b.time)
  }
  
  // MODE NORMAL: Utiliser les points optimisés du store
  return ccPointsOptimized.value
})

const totalWidth = computed(() => {
  return timeSignature.totalWidth?.value || 800
})

const ccPointStyle = (point) => {
  const pixelX = timeSignature.timeToPixelsWithSignatures(point.time)
  const adjustedPosition = Math.round(pixelX) - 1
    
  return {
    left: adjustedPosition + 'px',
    bottom: (point.value / 127) * 100 + '%'
  }
}

// Génération optimisée de la polyline pour performance maximale
const ccPolylinePoints = computed(() => {
  const displayedPoints = ccPointsDisplayed.value
  if (displayedPoints.length < 2) return null
  
  const points = displayedPoints.map(point => {
    const x = timeSignature.timeToPixelsWithSignatures(point.time)
    const y = 100 - (point.value / 127) * 100
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  
  return points
})

let dragStartX = 0
let dragStartY = 0
let originalTime = 0
let originalValue = 0

const startDrag = (point, event) => {
  console.log('🎯 START DRAG - Point cliqué:', {
    pointId: point.id,
    pointTime: point.time,
    pointValue: point.value,
    currentSelectedId: selectedPoint.value?.id,
    selectedPointsCount: selectedPoints.value.length
  })
  
  // Si le point fait partie de la sélection multiple, démarrer un drag de groupe
  const isPartOfMultiSelection = selectedPoints.value.some(p => p.id === point.id)
  
  if (isPartOfMultiSelection && selectedPoints.value.length > 1) {
    // Mode drag de groupe
    isGroupDragging.value = true
    selectedPoint.value = point // Le point sur lequel on a cliqué reste le point de référence
    console.log(`🎯 Début drag de groupe: ${selectedPoints.value.length} points`)
  } else {
    // Mode drag simple
    selectedPoint.value = point
    selectedPoints.value = [] // Vider la sélection multiple
    isGroupDragging.value = false
  }
  
  isDragging.value = true
  
  // Ajouter la classe dragging pour forcer le curseur
  const container = document.querySelector('.cc-curve-container')
  if (container) {
    container.classList.add('dragging')
  }
  
  // Émettre la sélection du point vers le parent avec l'ID et la valeur
  emit('point-selected', { id: String(point.id), value: point.value })
  
  dragStartX = event.clientX
  dragStartY = event.clientY
  originalTime = point.time
  originalValue = point.value

  // Créer une copie des points OPTIMISÉS pour la manipulation temporaire
  const basePoints = ccPointsOptimized.value
  dragTempPoints.value = [...basePoints]
  
  console.log('🎯 START DRAG - Copie créée:', {
    basePointsCount: basePoints.length,
    tempPointsCount: dragTempPoints.value.length,
    pointInBase: basePoints.some(p => p.id === point.id),
    pointInTemp: dragTempPoints.value.some(p => p.id === point.id),
    groupDragging: isGroupDragging.value
  })

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  event.preventDefault()
  event.stopPropagation() // Empêcher startLassoOrDrag d'être appelé
}

const onDrag = (event) => {
  if (!isDragging.value || !selectedPoint.value || !dragTempPoints.value) return

  // SOLUTION RADICALE: Calculer la position EXACTE sous la souris
  const container = document.querySelector('.cc-curve-container')
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  
  // Position absolue de la souris dans le container
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // Conversion directe sans passer par les deltas - utiliser fonction injectée
  let newTime = props.pixelsToTimeWithSignatures ? 
    props.pixelsToTimeWithSignatures(mouseX) : 
    (timeSignature.pixelsToTimeWithSignatures ? 
      timeSignature.pixelsToTimeWithSignatures(mouseX) : 
      mouseX / 240)
  
  newTime = Math.max(0, newTime)
  
  // APPLIQUER LE SNAP si activé
  if (uiStore.snapToGrid) {
    newTime = snapTimeToGrid(newTime)
  }
  
  // Conversion Y: 0 en haut = 127, height en bas = 0
  const containerHeight = rect.height
  const relativeY = mouseY / containerHeight
  const newValue = Math.max(0, Math.min(127, Math.round((1 - relativeY) * 127)))
  
  // Calculer les deltas par rapport à la position initiale
  const deltaTime = newTime - originalTime
  const deltaValue = newValue - originalValue
  
  if (isGroupDragging.value && selectedPoints.value.length > 1) {
    // Mode drag de groupe: mettre à jour tous les points sélectionnés
    console.log(`🎯 GROUP DRAG - Delta temps: ${deltaTime.toFixed(3)}s, Delta valeur: ${deltaValue}`)
    
    selectedPoints.value.forEach(selectedP => {
      const tempPointIndex = dragTempPoints.value.findIndex(p => p.id === selectedP.id)
      if (tempPointIndex !== -1) {
        const originalPoint = ccPointsOptimized.value.find(p => p.id === selectedP.id)
        if (originalPoint) {
          let newPointTime = originalPoint.time + deltaTime
          let newPointValue = originalPoint.value + deltaValue
          
          // Contraintes
          newPointTime = Math.max(0, newPointTime)
          newPointValue = Math.max(0, Math.min(127, newPointValue))
          
          dragTempPoints.value[tempPointIndex] = {
            ...dragTempPoints.value[tempPointIndex],
            time: newPointTime,
            value: newPointValue
          }
        }
      }
    })
  } else {
    // Mode drag simple: mettre à jour uniquement le point sélectionné
    const tempPointIndex = dragTempPoints.value.findIndex(p => p.id === selectedPoint.value.id)
    if (tempPointIndex !== -1) {
      dragTempPoints.value[tempPointIndex] = {
        ...dragTempPoints.value[tempPointIndex],
        time: newTime,
        value: newValue
      }
    }
  }
  
  // Émettre la nouvelle valeur avec l'ID du point
  if (selectedPoint.value) {
    emit('point-selected', { id: String(selectedPoint.value.id), value: newValue })
  }
}

const stopDrag = async () => {
  console.log('🔄 STOP DRAG - État avant:', {
    isDragging: isDragging.value,
    selectedPointId: selectedPoint.value?.id,
    tempPointsCount: dragTempPoints.value?.length,
    groupDragging: isGroupDragging.value,
    selectedPointsCount: selectedPoints.value.length
  })
  
  // Nettoyer les event listeners immédiatement
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  
  const realDrag = isDragging.value && selectedPoint.value && dragTempPoints.value
  
  if (realDrag) {
    if (isGroupDragging.value && selectedPoints.value.length > 1) {
      // Mode groupe: mettre à jour tous les points sélectionnés
      console.log(`🔄 STOP GROUP DRAG - Mise à jour ${selectedPoints.value.length} points`)
      
      const updatePromises = selectedPoints.value.map(async (selectedP) => {
        const tempPoint = dragTempPoints.value.find(p => p.id === selectedP.id)
        if (tempPoint) {
          console.log(`🔄 Mise à jour point groupe ${tempPoint.id}: temps=${tempPoint.time}, valeur=${tempPoint.value}`)
          return midiStore.updateCC(tempPoint.id, {
            time: tempPoint.time,
            value: tempPoint.value
          })
        }
      })
      
      await Promise.all(updatePromises.filter(Boolean))
      console.log('🔄 STOP GROUP DRAG - Tous les points mis à jour')
      
    } else {
      // Mode simple: mettre à jour uniquement le point sélectionné
      const draggedPointId = selectedPoint.value.id
      const tempPoint = dragTempPoints.value.find(p => p.id === draggedPointId)
      
      if (tempPoint) {
        console.log('🔄 STOP DRAG - Mise à jour store:', {
          pointId: tempPoint.id,
          newTime: tempPoint.time,
          newValue: tempPoint.value
        })
        
        await midiStore.updateCC(draggedPointId, {
          time: tempPoint.time,
          value: tempPoint.value
        })
        
        console.log('🔄 STOP DRAG - Store mis à jour')
      }
    }
  }
  
  // NETTOYAGE FINAL
  isDragging.value = false
  isGroupDragging.value = false
  // NE PAS déselectionner le point - le garder sélectionné après le drag
  // selectedPoint.value = null
  dragTempPoints.value = null
  
  // Supprimer la classe dragging
  const container = document.querySelector('.cc-curve-container')
  if (container) {
    container.classList.remove('dragging')
  }
  
  // Ne pas réinitialiser la valeur - garder le point sélectionné
  // emit('point-selected', null)
  
  console.log('🔄 STOP DRAG - Nettoyage terminé')
}



// Ajouter un point en double-cliquant
const addPoint = (event) => {
  event.preventDefault()
  event.stopPropagation()
  
  console.log('🎛️ Double-clic sur CC lane - selectedTrack:', midiStore.selectedTrack)
  
  if (midiStore.selectedTrack === null || midiStore.selectedTrack === undefined) {
    console.warn('⚠️ Pas de piste sélectionnée pour ajouter CC')
    return
  }
  
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // Conversion en temps et valeur
  let time = timeSignature.pixelsToTimeWithSignatures 
    ? timeSignature.pixelsToTimeWithSignatures(x)
    : x / 240 // fallback
  
  // Appliquer le snap si activé  
  if (uiStore.snapToGrid) {
    time = snapTimeToGrid(time)
  }
    
  const value = Math.round((1 - y / rect.height) * 127)

  // Obtenir les informations de la piste pour le canal
  const selectedTrack = midiStore.getTrackById(midiStore.selectedTrack)

  // Créer le nouveau CC dans le store
  console.log(`🎛️ Ajout CC${props.ccNumber}:`, { 
    trackId: midiStore.selectedTrack, 
    time: Math.max(0, time), 
    value: Math.max(0, Math.min(127, value)),
    x, y 
  })
  
  const newCCId = midiStore.addCC({
    trackId: midiStore.selectedTrack,
    controller: props.ccNumber,
    time: Math.max(0, time),
    value: Math.max(0, Math.min(127, value)),
    channel: selectedTrack?.channel || 0
  })
  
  console.log(`🎛️ CC${props.ccNumber} ajouté avec ID:`, newCCId)
}

// Supprimer un point existant avec double-clic
const deletePoint = (point, event) => {
  event.preventDefault()
  event.stopPropagation()
  
  console.log(`🗑️ Double-clic pour supprimer CC${props.ccNumber} point:`, {
    pointId: point.id,
    time: point.time,
    value: point.value
  })
  
  if (point.id) {
    // Supprimer du store
    const success = midiStore.deleteControlChange(point.id)
    if (success) {
      console.log(`✅ Point CC${props.ccNumber} supprimé:`, point.id)
      
      // Désélectionner si c'était le point sélectionné
      if (selectedPoint.value?.id === point.id) {
        selectedPoint.value = null
        emit('point-selected', null)
      }
    } else {
      console.error(`❌ Échec suppression CC${props.ccNumber}:`, point.id)
    }
  }
}

// ===========================================
// FONCTIONS POUR LE MODE LASSO ET SÉLECTION MULTIPLE
// ===========================================

// Démarrer le lasso ou le drag selon ce qui est cliqué
const startLassoOrDrag = (event) => {
  // Si on clique sur un point, ne pas faire de lasso
  if (event.target.classList.contains('cc-point')) {
    return // Laisser le point gérer son propre drag
  }
  
  // Si on clique sur une zone vide, déselectionner le point actuel
  if (selectedPoint.value) {
    selectedPoint.value = null
    emit('point-selected', null)
    console.log('🎯 Déselection point par clic zone vide')
  }
  
  // Si on clique sur une zone vide, démarrer le lasso
  event.preventDefault()
  event.stopPropagation()
  
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  console.log('🎯 Début lasso à:', { x, y })
  
  isLassoMode.value = true
  lassoStart.value = { x, y }
  lassoEnd.value = { x, y }
  
  // Vider la sélection précédente
  selectedPoints.value = []
  
  // Empêcher le drag par défaut
  document.addEventListener('mousemove', updateLasso)
  document.addEventListener('mouseup', endLassoOrDrag)
}

// Mettre à jour le rectangle de sélection
const updateLasso = (event) => {
  if (!isLassoMode.value) return
  
  const container = document.querySelector('.cc-curve-container')
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  lassoEnd.value = { x, y }
}

// Terminer le lasso et sélectionner les points
const endLassoOrDrag = () => {
  if (!isLassoMode.value) return
  
  console.log('🎯 Fin lasso')
  
  // Calculer le rectangle de sélection
  const left = Math.min(lassoStart.value.x, lassoEnd.value.x)
  const top = Math.min(lassoStart.value.y, lassoEnd.value.y)
  const right = Math.max(lassoStart.value.x, lassoEnd.value.x)
  const bottom = Math.max(lassoStart.value.y, lassoEnd.value.y)
  
  // Sélectionner tous les points dans le rectangle
  const pointsInSelection = []
  ccPointsDisplayed.value.forEach(point => {
    const pointPixelX = timeSignature.timeToPixelsWithSignatures(point.time)
    const pointPixelY = (1 - point.value / 127) * 100 // Conversion Y inverse pour l'affichage
    
    // Convertir les coordonnées du point en pixels absolus dans le container
    const containerRect = document.querySelector('.cc-curve-container').getBoundingClientRect()
    const adjustedX = Math.round(pointPixelX) - 1 // Même calcul que ccPointStyle
    const adjustedY = pointPixelY / 100 * containerRect.height
    
    if (adjustedX >= left && adjustedX <= right && adjustedY >= top && adjustedY <= bottom) {
      pointsInSelection.push(point)
    }
  })
  
  selectedPoints.value = pointsInSelection
  console.log(`🎯 ${pointsInSelection.length} points sélectionnés`)
  
  // Nettoyer le mode lasso
  isLassoMode.value = false
  document.removeEventListener('mousemove', updateLasso)
  document.removeEventListener('mouseup', endLassoOrDrag)
}

// Supprimer tous les points sélectionnés ET tous les points dans la zone temporelle
const deleteSelectedPoints = () => {
  if (selectedPoints.value.length === 0) return
  
  // Calculer la zone temporelle de la sélection
  const selectedTimes = selectedPoints.value.map(p => p.time)
  const minTime = Math.min(...selectedTimes)
  const maxTime = Math.max(...selectedTimes)
  
  console.log(`🗑️ Suppression de ${selectedPoints.value.length} points sélectionnés`)
  console.log(`📍 Zone temporelle: ${minTime.toFixed(3)}s à ${maxTime.toFixed(3)}s`)
  
  // Récupérer TOUS les points CC (pas seulement ceux affichés) dans la zone temporelle
  const ourTrackId = parseInt(midiStore.selectedTrack)
  const allCCPoints = midiStore.midiCC.filter(cc => 
    parseInt(cc.trackId) === ourTrackId && 
    parseInt(cc.controller) === props.ccNumber &&
    parseFloat(cc.time) >= minTime &&
    parseFloat(cc.time) <= maxTime
  )
  
  console.log(`🗑️ Trouvé ${allCCPoints.length} points CC dans la zone temporelle (incluant cachés)`)
  
  // Supprimer TOUS les points dans la zone temporelle
  allCCPoints.forEach(point => {
    midiStore.deleteControlChange(point.id)
    console.log(`🗑️ Supprimé CC point ID=${point.id} temps=${point.time} valeur=${point.value}`)
  })
  
  selectedPoints.value = []
  selectedPoint.value = null
  emit('point-selected', null)
  
  console.log(`✅ Suppression terminée: ${allCCPoints.length} points supprimés au total`)
}

// Gérer les touches clavier pour la sélection multiple
const handleKeydown = (event) => {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelectedPoints()
  }
  
  if (event.key === 'Escape') {
    selectedPoints.value = []
    selectedPoint.value = null
    emit('point-selected', null)
  }
}

// WATCH pour traquer les changements du store après drag
watch(() => midiStore.midiCC, (newCC, oldCC) => {
  console.log('🎛️ STORE CHANGE détecté:', {
    oldLength: oldCC?.length || 0,
    newLength: newCC?.length || 0,
    timestamp: Date.now()
  })
  
  // Vérifier si notre CC specifique a changé
  const ourTrackId = parseInt(midiStore.selectedTrack)
  const ourCC = newCC.filter(cc => 
    parseInt(cc.trackId) === ourTrackId && cc.controller === props.ccNumber
  )
  
  if (ourCC.length > 0) {
    console.log('🎛️ CC' + props.ccNumber + ' updated in store:', 
      ourCC.slice(0, 2).map(cc => ({ id: cc.id, time: cc.time, value: cc.value })))
  }
}, { deep: true })

// Gérer la mise à jour manuelle de la valeur d'un point depuis l'interface
const handleManualPointValueUpdate = async (event) => {
  const updateData = event.detail
  console.log(`📝 CCLane: Réception mise à jour manuelle:`, updateData)
  
  if (updateData.pointId) {
    try {
      // Mettre à jour directement dans le store
      await midiStore.updateCC(updateData.pointId, {
        value: updateData.newValue
      })
      
      // Mettre à jour la sélection actuelle si c'est le point sélectionné
      if (selectedPoint.value && selectedPoint.value.id === updateData.pointId) {
        emit('point-selected', { id: String(updateData.pointId), value: updateData.newValue })
      }
      
      console.log(`✅ Point CC${props.ccNumber} ${updateData.pointId} mis à jour: ${updateData.newValue}`)
    } catch (error) {
      console.error(`❌ Erreur mise à jour CC${props.ccNumber}:`, error)
    }
  }
}

onMounted(() => {
  // Nettoyer automatiquement le store au premier chargement
  if (ccPoints.value.length > 20) { // Seulement si beaucoup de points
    console.log(`🧹 Auto-nettoyage du store CC${props.ccNumber}: ${ccPoints.value.length} points`)
    midiStore.optimizeMidiCC()
  }
  
  // Ajouter les listeners clavier pour le lasso
  document.addEventListener('keydown', handleKeydown)
  
  // Écouter les événements de mise à jour manuelle de valeur
  document.addEventListener('update-point-value', handleManualPointValueUpdate)
})


onUnmounted(() => {
  // Nettoyer les event listeners et les données temporaires
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('update-point-value', handleManualPointValueUpdate)
  
  dragTempPoints.value = null
})
</script>

<style scoped>
.lane-content {
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #fafafa;
}

.cc-grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: 0.6;
}

.cc-curve-container {
  position: relative;
  height: 100%;
  cursor: crosshair;
  z-index: 5;
}

/* Empêcher le changement de curseur pendant le drag */
.cc-curve-container.dragging {
  cursor: pointer !important;
}

.cc-curve-container.dragging .cc-point {
  cursor: pointer !important;
}

.cc-curve-container.dragging .cc-point:hover {
  cursor: pointer !important;
}

.cc-point {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: v-bind(ccColor);
  border: 2px solid white;
  transform: translate(-50%, 50%);
  cursor: pointer; /* CORRECTION: pointer au lieu de grab */
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  z-index: 15;
  opacity: 1.0;
}

.cc-point:hover {
  transform: translate(-50%, 50%) scale(1.2);
}

.cc-point.selected {
  border-color: #FF5722;
  box-shadow: 0 0 8px rgba(255, 87, 34, 0.5);
}

.cc-point.multi-selected {
  border-color: #2196F3;
  box-shadow: 0 0 8px rgba(33, 150, 243, 0.5);
  background: #2196F3;
}

.cc-point:active {
  cursor: pointer; /* Garder pointer même en actif */
}

.lasso-selection {
  border: 2px dashed #2196F3;
  background: rgba(33, 150, 243, 0.1);
  pointer-events: none;
  z-index: 20;
}

.cc-curve-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: v-bind(totalWidth + 'px');
  height: 100%;
  pointer-events: none;
}

.cc-reference-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  /* Créer un contexte de positionnement pour sticky */
  contain: layout;
}

.cc-reference-line {
  position: absolute;
  left: 0;
  width: 100%;
  border-top: 1px dashed #888;
  opacity: 0.6;
}

.cc-reference-line.cc-line-extreme {
  border-top: 2px dashed #888;
  opacity: 0.8;
}


.cc-info {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #666;
  pointer-events: auto; /* Permettre les clics pour le bouton */
}

.cc-value {
  margin-left: 12px;
  color: v-bind(ccColor);
  font-weight: 500;
}



.lane-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.lane-measure-line {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid #e0e0e0;
}

</style>