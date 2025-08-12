<template>
  <div class="lane-content">
    <!-- Grille de fond avec GridRenderer -->
    <div class="tempo-grid-background">
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

    <div class="tempo-curve-container" 
         ref="tempoLaneRef"
         :class="{ 'brush-mode': isBrushing }"
         @dblclick="addPoint" 
         @mousedown="handleContainerMouseDown"
         @mousemove="isBrushing ? onBrushMove : updateLasso"
         @mouseup="isBrushing ? stopBrush : endLassoOrDrag">

      <!-- Rectangle de sélection lasso -->
      <div v-if="isLassoMode" class="lasso-selection" :style="lassoStyle"></div>

      <!-- Points tempo - Optimisés avec suppression lignes droites -->
      <div
        v-for="point in tempoPointsDisplayed"
        :key="`tempo-${point.id}`"
        class="tempo-point"
        :style="tempoPointStyle(point)"
        @mousedown="startDrag(point, $event)"
        @dblclick="deletePoint(point, $event)"
        :class="{ 
          selected: selectedPoint?.id === point.id,
          'multi-selected': selectedPoints.some(p => p.id === point.id)
        }"
      ></div>


      <!-- Courbe Tempo optimisée avec polyline -->
      <svg class="tempo-curve-svg" :viewBox="`0 0 ${totalWidth} 100`" preserveAspectRatio="none">
        <polyline
          v-if="tempoPolylinePoints"
          :points="tempoPolylinePoints"
          fill="none"
          :stroke="tempoColor"
          stroke-width="2"
          opacity="0.8"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>

    </div>

    <!-- Lignes de référence Tempo (BPM 10, 50, 100, 150, 200) - intervalles avec minimum professionnel -->
    <div class="tempo-reference-lines">
      <div
        v-for="bpm in [MIN_TEMPO_BPM, 50, 100, 150, 200]"
        :key="bpm"
        class="tempo-reference-line"
        :style="{ bottom: Math.max(2, Math.min(98, (bpm / 200) * 100)) + '%' }"
      >
      </div>
    </div>

    <!-- Affichage de la valeur actuelle -->
    <div class="tempo-info">
      <span>Tempo</span>
      <span v-if="selectedPoint" class="tempo-value">{{ selectedPoint.bpm || selectedPoint.value }} BPM</span>
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
  totalMeasures: Number,
  visibleMeasures: Array,
  measureToPixels: Function,
  // Fonctions injectées du parent pour cohérence
  timeToPixelsWithSignatures: Function,
  pixelsToTimeWithSignatures: Function
})

const emit = defineEmits(['tempo-selected'])

const uiStore = useUIStore()
const midiStore = useMidiStore()
const timeSignature = useTimeSignature()
const { snapTimeToGrid } = useSnapLogic()
const selectedPoint = ref(null)

// Refs pour le mode brush
const tempoLaneRef = ref(null)
const isBrushing = ref(false)
const isCommandPressed = ref(false)

// Tempo minimum comme les DAW professionnels (Logic Pro, Cubase, etc.)
const MIN_TEMPO_BPM = 10
const selectedPoints = ref([]) // Points sélectionnés en mode lasso
const isDragging = ref(false)
const dragTempPoints = ref(null) // Points temporaires pendant le drag
const isDragModeSet = ref(false) // Mode drag déterminé (vertical/horizontal)
const isDragVertical = ref(false) // True si drag vertical

// Variables pour le mode lasso
const isLassoMode = ref(false)
const lassoStart = ref({ x: 0, y: 0 })
const lassoEnd = ref({ x: 0, y: 0 })
// Mode de déplacement en groupe
const isGroupDragging = ref(false)



// Couleur spécifique pour les points tempo
const tempoColor = '#FF5722' // Rouge-orange pour le tempo

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

// Points tempo depuis les données réelles
// Identifiant unique pour cette instance de TempoLane  
const instanceId = `TempoLane-${Math.random().toString(36).substring(2, 11)}`

const tempoPoints = computed(() => {
  // Les événements tempo sont globaux, pas liés à une piste
  const points = midiStore.tempoEvents.map(tempo => ({
    id: tempo.id,
    time: tempo.time,
    value: tempo.bpm, // BPM au lieu de value
    bpm: tempo.bpm,
    ticks: tempo.ticks,
    lastModified: tempo.lastModified
  })).sort((a, b) => a.time - b.time)
  
  
  return points
})



// Points optimisés : supprimer les points redondants pour les lignes droites
const tempoPointsOptimized = computed(() => {
  const points = tempoPoints.value
  if (points.length <= 2) return points

  // Optimisation: supprimer les points qui forment des lignes droites
  const optimizedPoints = [points[0]] // Toujours garder le premier point
  
  for (let i = 1; i < points.length - 1; i++) {
    const prevPoint = points[i - 1]
    const currentPoint = points[i]
    const nextPoint = points[i + 1]
    
    // Calculer si les 3 points forment une ligne droite
    const slope1 = (currentPoint.bpm - prevPoint.bpm) / (currentPoint.time - prevPoint.time)
    const slope2 = (nextPoint.bpm - currentPoint.bpm) / (nextPoint.time - currentPoint.time)
    
    // Si les pentes sont différentes ou si c'est un point important, le garder
    if (Math.abs(slope1 - slope2) > 0.01 || currentPoint.bpm === 60 || currentPoint.bpm === 200) {
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
const tempoPointsDisplayed = computed(() => {
  // MODE DRAG: Utiliser les points temporaires
  if (isDragging.value && dragTempPoints.value) {
    return dragTempPoints.value.sort((a, b) => a.time - b.time)
  }
  
  // MODE NORMAL: Utiliser les points optimisés du store
  return tempoPointsOptimized.value
})

const totalWidth = computed(() => {
  return timeSignature.totalWidth?.value || 800
})

const tempoPointStyle = (point) => {
  const pixelX = timeSignature.timeToPixelsWithSignatures(point.time)
  const adjustedPosition = Math.round(pixelX) - 1
  
  // Adapter l'affichage pour les BPM (plage typique 60-200)
  const normalizedBPM = Math.max(0, Math.min(200, point.bpm || point.value))
  const percentage = (normalizedBPM / 200) * 100 // Normaliser 0-200 BPM sur 0-100%
  const clampedPercentage = Math.max(0, Math.min(100, percentage))
    
  return {
    left: adjustedPosition + 'px',
    bottom: clampedPercentage + '%'
  }
}

// Génération optimisée de la polyline pour performance maximale
const tempoPolylinePoints = computed(() => {
  const displayedPoints = tempoPointsDisplayed.value
  if (displayedPoints.length < 2) return null
  
  const points = displayedPoints.map(point => {
    const x = timeSignature.timeToPixelsWithSignatures(point.time)
    // Adapter pour les BPM
    const normalizedBPM = Math.max(0, Math.min(200, point.bpm || point.value))
    const percentage = (normalizedBPM / 200) * 100
    const y = 100 - Math.max(0, Math.min(100, percentage)) // Inversion Y pour SVG
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  
  return points
})

let dragStartX = 0
let dragStartY = 0
let originalTime = 0
let originalValue = 0

// Variables pour le drag

const startDrag = (point, event) => {
  console.log('🎯 TempoLane startDrag APPELÉ!', point.id, { metaKey: event.metaKey, ctrlKey: event.ctrlKey })
  
  // Mode brush (CMD/Ctrl + clic) - gérer directement ici
  if (event.metaKey || event.ctrlKey) {
    console.log('🎨 TempoLane startDrag: Mode brush détecté - activation directe')
    event.preventDefault()
    event.stopPropagation()
    
    // Activer le mode brush
    isBrushing.value = true
    isCommandPressed.value = true
    lastBrushedPointId = null
    
    // Calculer la nouvelle valeur BPM depuis la position Y
    const newBPM = calculateBPMFromPosition(event.clientY)
    updateTempoPoint(point.id, newBPM)
    lastBrushedPointId = point.id
    
    // Émettre la sélection
    emit('point-selected', {
      id: String(point.id),
      value: Math.round(newBPM),
      type: 'tempo'
    })
    
    // CRUCIAL: Ajouter les listeners pour le brush
    document.addEventListener('mousemove', onBrushMove)
    document.addEventListener('mouseup', stopBrush)
    
    return
  }
  
  // Si le point fait partie de la sélection multiple, démarrer un drag de groupe
  const isPartOfMultiSelection = selectedPoints.value.some(p => p.id === point.id)
  
  if (isPartOfMultiSelection && selectedPoints.value.length > 1) {
    // Mode drag de groupe
    isGroupDragging.value = true
    selectedPoint.value = point
  } else {
    // Mode drag simple
    selectedPoint.value = point
    selectedPoints.value = []
    isGroupDragging.value = false
  }
  
  isDragging.value = true
  
  // CORRECTION: Reset mode drag au début de chaque nouveau drag
  isDragModeSet.value = false
  isDragVertical.value = false
  
  // Ajouter la classe dragging pour forcer le curseur
  const container = document.querySelector('.tempo-curve-container')
  if (container) {
    container.classList.add('dragging')
  }
  
  // Émettre une seule fois au début
  emit('tempo-selected', { id: String(point.id), value: point.bpm || point.value })
  
  // Variables de départ pour référence (non utilisées mais conservées)
  dragStartX = event.clientX
  dragStartY = event.clientY
  originalTime = point.time
  originalValue = point.value

  // Créer une copie des points OPTIMISÉS pour la manipulation temporaire
  const basePoints = tempoPointsOptimized.value
  dragTempPoints.value = [...basePoints]

  document.addEventListener('mousemove', onDrag, { passive: false })
  document.addEventListener('mouseup', stopDrag, { passive: true })
  event.preventDefault()
  event.stopPropagation()
}

const onDrag = (event) => {
  if (!isDragging.value || !selectedPoint.value || !dragTempPoints.value) return

  // Calculer la position EXACTE sous la souris (comme CC)
  const container = document.querySelector('.tempo-curve-container')
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // Conversion directe sans passer par les deltas
  let newTime = props.pixelsToTimeWithSignatures ? 
    props.pixelsToTimeWithSignatures(mouseX) : 
    (timeSignature.pixelsToTimeWithSignatures ? 
      timeSignature.pixelsToTimeWithSignatures(mouseX) : 
      mouseX / 240)
  
  newTime = Math.max(0, newTime)
  
  // Appliquer le snap si activé
  if (uiStore.snapToGrid) {
    newTime = snapTimeToGrid(newTime)
  }
  
  // CORRECTION: Ne recalculer le BPM que si on drag significativement en Y
  const originalValue = selectedPoint.value.value
  
  // Calculer si le drag est principalement vertical (une seule fois au début)
  if (!isDragModeSet.value) {
    const deltaX = Math.abs(event.clientX - dragStartX)
    const deltaY = Math.abs(event.clientY - dragStartY)
    if (deltaY > 20 && deltaY > deltaX * 1.5) {
      isDragVertical.value = true
      isDragModeSet.value = true
    } else if (deltaX > 20 || deltaY > 20) {
      isDragVertical.value = false
      isDragModeSet.value = true
    }
  }
  
  let newValue = originalValue // Valeur par défaut
  
  if (isDragVertical.value) {
    // CORRECTION: Calcul de delta persistant - pas de reset magnétique
    const containerHeight = rect.height
    const deltaY = event.clientY - dragStartY // Delta depuis le début du drag
    const deltaTempo = -(deltaY / containerHeight) * 200 // Inverser (haut = plus rapide)
    newValue = Math.max(MIN_TEMPO_BPM, Math.min(200, Math.round(originalValue + deltaTempo)))
  }
  
  
  // Calculer les deltas une seule fois
  const deltaTime = newTime - originalTime
  const deltaValue = newValue - originalValue
  
  if (isGroupDragging.value && selectedPoints.value.length > 1) {
    // Mode drag de groupe: mettre à jour tous les points sélectionnés
    selectedPoints.value.forEach(selectedP => {
      const tempPointIndex = dragTempPoints.value.findIndex(p => p.id === selectedP.id)
      if (tempPointIndex !== -1) {
        const originalPoint = tempoPointsOptimized.value.find(p => p.id === selectedP.id)
        if (originalPoint) {
          let newPointTime = originalPoint.time + deltaTime
          let newPointValue = originalPoint.value + deltaValue
          
          // Contraintes avec tempo minimum
          newPointTime = Math.max(0, newPointTime)
          newPointValue = Math.max(MIN_TEMPO_BPM, Math.min(200, newPointValue))
          
          dragTempPoints.value[tempPointIndex] = {
            ...dragTempPoints.value[tempPointIndex],
            time: newPointTime,
            value: newPointValue,
            bpm: newPointValue
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
        value: newValue,
        bpm: newValue
      }
      
    }
  }
  
  // Émettre la nouvelle valeur avec l'ID du point
  if (selectedPoint.value) {
    emit('tempo-selected', { id: String(selectedPoint.value.id), value: newValue })
  }
}

const stopDrag = async () => {
  // Nettoyer les event listeners immédiatement
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  
  const realDrag = isDragging.value && selectedPoint.value && dragTempPoints.value
  
  if (realDrag) {
    if (isGroupDragging.value && selectedPoints.value.length > 1) {
      // Mode groupe: mettre à jour tous les points sélectionnés
      const updatePromises = selectedPoints.value.map(async (selectedP) => {
        const tempPoint = dragTempPoints.value.find(p => p.id === selectedP.id)
        if (tempPoint) {
          return midiStore.updateTempoEvent(tempPoint.id, {
            time: tempPoint.time,
            bpm: tempPoint.value
          })
        }
      })
      
      await Promise.all(updatePromises.filter(Boolean))
      
    } else {
      // Mode simple: mettre à jour uniquement le point sélectionné
      const draggedPointId = selectedPoint.value.id
      const tempPoint = dragTempPoints.value.find(p => p.id === draggedPointId)
      
      if (tempPoint) {
        
        const result = await midiStore.updateTempoEvent(draggedPointId, {
          time: tempPoint.time,
          bpm: tempPoint.value
        })
        
      }
    }
  }
  
  // NETTOYAGE FINAL
  isDragging.value = false
  isGroupDragging.value = false
  dragTempPoints.value = null
  
  // Supprimer la classe dragging
  const container = document.querySelector('.tempo-curve-container')
  if (container) {
    container.classList.remove('dragging')
  }
  
  // Ne pas réinitialiser la valeur - garder le point sélectionné
  // emit('point-selected', null)
  
}



// Ajouter un point en double-cliquant
const addPoint = (event) => {
  event.preventDefault()
  event.stopPropagation()
  
  console.log('🎵 Double-clic sur Tempo lane')
  
  // Les événements tempo sont globaux, pas besoin de piste sélectionnée
  
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // Conversion en temps et BPM
  let time = timeSignature.pixelsToTimeWithSignatures 
    ? timeSignature.pixelsToTimeWithSignatures(x)
    : x / 240 // fallback
  
  // Appliquer le snap si activé  
  if (uiStore.snapToGrid) {
    time = snapTimeToGrid(time)
  }
  
  // Convertir Y en BPM (plage MIN_TEMPO_BPM-200)
  const relativeY = y / rect.height
  const bpm = Math.round((1 - relativeY) * 200) // Convertir en BPM 0-200
  const clampedBPM = Math.max(MIN_TEMPO_BPM, Math.min(200, bpm))

  // Créer le nouveau tempo dans le store
  console.log(`🎵 Ajout Tempo:`, { 
    time: Math.max(0, time), 
    bpm: clampedBPM,
    x, y 
  })
  
  const newTempoId = midiStore.addTempoEvent({
    time: Math.max(0, time),
    bpm: clampedBPM,
    ticks: 0 // Sera recalculé si nécessaire
  })
  
  console.log(`🎵 Tempo ajouté avec ID:`, newTempoId)
}

// Supprimer un point existant avec double-clic
const deletePoint = (point, event) => {
  event.preventDefault()
  event.stopPropagation()
  
  
  if (point.id) {
    // Supprimer du store
    const success = midiStore.deleteTempoEvent(point.id)
    if (success) {
      
      // Désélectionner si c'était le point sélectionné
      if (selectedPoint.value?.id === point.id) {
        selectedPoint.value = null
        emit('tempo-selected', null)
      }
    } else {
      console.error(`❌ Échec suppression Tempo:`, point.id)
    }
  }
}

// ===========================================
// FONCTIONS POUR LE MODE LASSO ET SÉLECTION MULTIPLE
// ===========================================

// Variables pour le mode brush
let lastBrushedPointId = null
let lastBrushedTime = null

// Fonction pour trouver un point à une position donnée
const findItemAtPosition = (clientX, clientY) => {
  if (!tempoLaneRef.value) return null
  
  const rect = tempoLaneRef.value.getBoundingClientRect()
  const relativeX = clientX - rect.left
  const relativeY = clientY - rect.top
  const tolerance = 20 // pixels - augmenté pour faciliter la détection
  
  console.log('🔍 findItemAtPosition:', { 
    relativeX, relativeY, tolerance, 
    pointsCount: tempoPointsDisplayed.value?.length || 0,
    rectHeight: rect.height 
  })
  
  for (const point of tempoPointsDisplayed.value) {
    try {
      const pointX = timeSignature.timeToPixelsWithSignatures
        ? timeSignature.timeToPixelsWithSignatures(point.time)
        : point.time * 240 // fallback
      
      const pointY = (1 - (point.bpm / 200)) * rect.height
      
      const distance = Math.sqrt(
        Math.pow(relativeX - pointX, 2) + 
        Math.pow(relativeY - pointY, 2)
      )
      
      console.log('🔍 Point check:', { 
        pointId: point.id, pointTime: point.time, pointBPM: point.bpm,
        pointX, pointY, distance, tolerance 
      })
      
      if (distance <= tolerance) {
        console.log('✅ Point trouvé!', point)
        return point
      }
    } catch (error) {
      continue
    }
  }
  return null
}

// Calculer la valeur BPM depuis la position Y
const calculateBPMFromPosition = (clientY) => {
  if (!tempoLaneRef.value) return 120
  
  const rect = tempoLaneRef.value.getBoundingClientRect()
  const mouseY = clientY - rect.top
  const relativeY = mouseY / rect.height
  
  // Convertir en BPM (plage MIN_TEMPO_BPM-200, inversé car Y=0 est en haut)
  const bpm = Math.round((1 - relativeY) * 200)
  return Math.max(MIN_TEMPO_BPM, Math.min(200, bpm))
}

// Gestionnaire des touches pour le curseur brush
const handleKeyDown = (event) => {
  if ((event.metaKey || event.ctrlKey) && !isCommandPressed.value) {
    isCommandPressed.value = true
    if (tempoLaneRef.value) {
      tempoLaneRef.value.classList.add('brush-mode')
    }
  }
}

const handleKeyUp = (event) => {
  if ((!event.metaKey && !event.ctrlKey) || event.key === 'Meta' || event.key === 'Control') {
    isCommandPressed.value = false
    if (tempoLaneRef.value) {
      tempoLaneRef.value.classList.remove('brush-mode')
    }
  }
}

// Écouter les événements clavier
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
})

// Gestionnaire principal des événements de container
const handleContainerMouseDown = (event) => {
  console.log('🎵 TempoLane handleContainerMouseDown appelé', { metaKey: event.metaKey, ctrlKey: event.ctrlKey })
  console.log('🎵 Points tempo disponibles:', tempoPointsDisplayed.value?.length || 0)
  
  // Mode brush (CMD/Ctrl + clic)
  if (event.metaKey || event.ctrlKey) {
    console.log('🎨 TempoLane: Mode brush activé dans handleContainer!')
    event.preventDefault()
    event.stopPropagation()
    
    isBrushing.value = true
    isCommandPressed.value = true
    lastBrushedPointId = null
    
    // Créer un nouveau point tempo à la position du clic
    const rect = tempoLaneRef.value.getBoundingClientRect()
    const relativeX = event.clientX - rect.left
    const clickTime = timeSignature.pixelsToTimeWithSignatures 
      ? timeSignature.pixelsToTimeWithSignatures(relativeX)
      : relativeX / 240 // fallback
    
    const newBPM = calculateBPMFromPosition(event.clientY)
    console.log('🎨 Brush: Création point tempo', { clickTime, newBPM })
    
    // Ajouter le point au store
    const newPointId = midiStore.addTempoEvent({
      time: clickTime,
      bpm: newBPM
    })
    
    lastBrushedPointId = newPointId
    
    emit('tempo-selected', {
      id: String(newPointId),
      value: newBPM,
      type: 'tempo'
    })
    
    // Ajouter les listeners pour le brush
    document.addEventListener('mousemove', onBrushMove)
    document.addEventListener('mouseup', stopBrush)
    
    return
  }
  
  // Logique normale (lasso/drag)
  startLassoOrDrag(event)
}

// Fonctions pour le mode brush
const onBrushMove = (event) => {
  if (!isBrushing.value) return
  
  console.log('🖌️ TempoLane onBrushMove appelé!')
  
  try {
    if (event.cancelable) {
      event.preventDefault()
    }
  } catch (e) {
    // Ignore l'erreur si preventDefault n'est pas possible
  }
  
  // Créer un nouveau point tempo à chaque mouvement de souris
  const rect = tempoLaneRef.value.getBoundingClientRect()
  const relativeX = event.clientX - rect.left
  const currentTime = timeSignature.pixelsToTimeWithSignatures 
    ? timeSignature.pixelsToTimeWithSignatures(relativeX)
    : relativeX / 240 // fallback
  
  const newBPM = calculateBPMFromPosition(event.clientY)
  
  // Créer un point seulement si on a bougé suffisamment (éviter trop de points)
  const minTimeDistance = 0.1 // secondes minimum entre les points
  const shouldCreatePoint = !lastBrushedTime || Math.abs(currentTime - lastBrushedTime) >= minTimeDistance
  
  if (shouldCreatePoint) {
    console.log('🖌️ Brush: Création point en mouvement', { currentTime, newBPM })
    
    const newPointId = midiStore.addTempoEvent({
      time: currentTime,
      bpm: newBPM
    })
    
    lastBrushedPointId = newPointId
    lastBrushedTime = currentTime
    
    emit('tempo-selected', {
      id: String(newPointId),
      value: newBPM,
      type: 'tempo'
    })
  }
}

const stopBrush = (event) => {
  if (event) {
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
  lastBrushedPointId = null
  lastBrushedTime = null
}

// Fonction pour mettre à jour un point tempo
const updateTempoPoint = (pointId, time, bpm) => {
  const clampedBPM = Math.max(MIN_TEMPO_BPM, Math.min(200, bpm))
  console.log(`🎵 TempoLane updateTempoPoint: ${pointId} -> ${clampedBPM} BPM`)
  
  midiStore.updateTempoEvent(pointId, {
    time: time,
    bpm: clampedBPM
  })
}

// Démarrer le lasso ou le drag selon ce qui est cliqué  
const startLassoOrDrag = (event) => {
  // Si on clique sur un point, ne pas faire de lasso
  if (event.target.classList.contains('tempo-point')) {
    return // Laisser le point gérer son propre drag
  }
  
  // Si on clique sur une zone vide, déselectionner le point actuel
  if (selectedPoint.value) {
    selectedPoint.value = null
    emit('tempo-selected', null)
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
  
  const container = document.querySelector('.tempo-curve-container')
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
  tempoPointsDisplayed.value.forEach(point => {
    const pointPixelX = timeSignature.timeToPixelsWithSignatures(point.time)
    const bpm = point.bpm || point.value
    // Conversion Y : même logique que tempoPointStyle
    const percentage = (bpm / 200) * 100 // 0-200 BPM → 0-100%
    
    // Convertir les coordonnées du point en pixels absolus dans le container
    const containerRect = document.querySelector('.tempo-curve-container').getBoundingClientRect()
    const adjustedX = Math.round(pointPixelX) - 1
    // Convertir percentage (bottom %) en position depuis le top
    const adjustedY = containerRect.height - (percentage / 100 * containerRect.height)
    
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

// Supprimer tous les points sélectionnés
const deleteSelectedPoints = () => {
  if (selectedPoints.value.length === 0) return
  
  console.log(`🗑️ Suppression de ${selectedPoints.value.length} points sélectionnés`)
  
  selectedPoints.value.forEach(point => {
    midiStore.deleteTempoEvent(point.id)
  })
  
  selectedPoints.value = []
  selectedPoint.value = null
  emit('tempo-selected', null)
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
    emit('tempo-selected', null)
  }
}

// WATCH pour traquer les changements du store après drag
watch(() => midiStore.tempoEvents, (newTempo, oldTempo) => {
  console.log('🎵 STORE CHANGE détecté:', {
    oldLength: oldTempo?.length || 0,
    newLength: newTempo?.length || 0,
    timestamp: Date.now()
  })
  
  if (newTempo.length > 0) {
    console.log('🎵 Tempo events updated in store:', 
      newTempo.slice(0, 2).map(tempo => ({ id: tempo.id, time: tempo.time, bpm: tempo.bpm })))
  }
}, { deep: true })

// Gérer la mise à jour manuelle de la valeur d'un point depuis l'interface
const handleManualPointValueUpdate = async (event) => {
  const updateData = event.detail
  console.log(`📝 TempoLane: Réception mise à jour manuelle:`, updateData)
  
  if (updateData.pointId) {
    // Appliquer la validation tempo minimum
    const validatedBPM = Math.max(MIN_TEMPO_BPM, Math.min(200, updateData.newValue))
    
    try {
      // Mettre à jour directement dans le store avec la valeur validée
      await midiStore.updateTempoEvent(updateData.pointId, {
        bpm: validatedBPM
      })
      
      // Mettre à jour la sélection actuelle si c'est le point sélectionné
      if (selectedPoint.value && selectedPoint.value.id === updateData.pointId) {
        emit('tempo-selected', { id: String(updateData.pointId), bpm: validatedBPM })
      }
      
      console.log(`✅ Point Tempo ${updateData.pointId} mis à jour: ${validatedBPM} BPM (demandé: ${updateData.newValue})`)
    } catch (error) {
      console.error(`❌ Erreur mise à jour Tempo:`, error)
    }
  }
}

onMounted(() => {
  // Créer un point par défaut à 0s avec 120 BPM s'il n'y en a pas
  // Attendre que le store soit complètement chargé avant de vérifier
  setTimeout(() => {
    if (tempoPoints.value.length === 0) {
      console.log('🎵 Création point tempo par défaut: 0s, 120 BPM')
      midiStore.addTempoEvent({
        time: 0.0,
        bpm: 120,
        ticks: 0
      })
    } else {
      console.log('🎵 Points tempo existants détectés:', tempoPoints.value.length)
    }
  }, 100) // Attendre 100ms pour que le store soit chargé
  
  // Nettoyer automatiquement le store au premier chargement
  if (tempoPoints.value.length > 20) { // Seulement si beaucoup de points
    console.log(`🧹 Auto-nettoyage du store Tempo: ${tempoPoints.value.length} points`)
    // midiStore.optimizeTempoEvents() // À implémenter si nécessaire
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
  document.removeEventListener('mousemove', onBrushMove)
  document.removeEventListener('mouseup', stopBrush)
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

.tempo-grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: 0.6;
}

.tempo-curve-container {
  position: relative;
  height: 100%;
  cursor: default;
  z-index: 5;
}

.tempo-curve-container.brush-mode {
  cursor: crosshair;
}

/* Empêcher le changement de curseur pendant le drag */
.tempo-curve-container.dragging {
  cursor: pointer !important;
}

.tempo-curve-container.dragging .tempo-point {
  cursor: pointer !important;
}

.tempo-curve-container.dragging .tempo-point:hover {
  cursor: pointer !important;
}

.tempo-point {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: v-bind(tempoColor);
  border: 2px solid white;
  transform: translate(-50%, 50%);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  z-index: 15;
  opacity: 1.0;
}

.tempo-point:hover {
  transform: translate(-50%, 50%) scale(1.2);
}

.tempo-point.selected {
  border-color: #FF5722;
  box-shadow: 0 0 8px rgba(255, 87, 34, 0.5);
}

.tempo-point.multi-selected {
  border-color: #2196F3;
  box-shadow: 0 0 8px rgba(33, 150, 243, 0.5);
  background: #2196F3;
}

.tempo-point:active {
  cursor: pointer;
}

.lasso-selection {
  border: 2px dashed #2196F3;
  background: rgba(33, 150, 243, 0.1);
  pointer-events: none;
  z-index: 20;
}

.tempo-curve-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: v-bind(totalWidth + 'px');
  height: 100%;
  pointer-events: none;
}

.tempo-reference-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  contain: layout;
}

.tempo-reference-line {
  position: absolute;
  left: 0;
  width: 100%;
  border-top: 1px dashed #888;
  opacity: 0.6;
}


.tempo-info {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #666;
  pointer-events: auto;
}

.tempo-value {
  margin-left: 12px;
  color: v-bind(tempoColor);
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