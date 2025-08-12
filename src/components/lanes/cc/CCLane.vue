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
         ref="ccLaneRef"
         :class="{ 'brush-mode': isBrushing }"
         @dblclick="addPoint" 
         @mousedown="handleContainerMouseDown"
         @mousemove="isBrushing ? onBrushMove : updateLasso"
         @mouseup="isBrushing ? stopBrush : endLassoOrDrag">

      <!-- Rectangle de sélection lasso -->
      <div v-if="isLassoMode" class="lasso-selection" :style="lassoStyle"></div>

      <!-- Points de contrôle CC - Optimisés avec suppression lignes droites -->
      <div
        v-for="point in ccPointsDisplayed"
        :key="point.id"
        class="cc-point"
        :style="ccPointStyle(point)"
        @mousedown="startDrag(point, $event)"
        @dblclick="deletePoint(point, $event)"
        :class="{ 
          selected: selectedPoint?.id === point.id,
          'multi-selected': selectedPoints.some(p => p.id === point.id)
        }"
      ></div>


      <!-- Courbe CC simple (max 100 derniers points) -->
      <svg class="cc-curve-svg" :viewBox="`0 0 ${totalWidth} 100`" preserveAspectRatio="none">
        <polyline
          v-if="currentSegmentPoints"
          :points="currentSegmentPoints"
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'
import { useProjectStore } from '@/stores/project'
import { usePlaybackCursor } from '@/composables/usePlaybackCursor'
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
const projectStore = useProjectStore()
const playbackCursor = usePlaybackCursor()
const timeSignature = useTimeSignature()
const { snapTimeToGrid } = useSnapLogic()

// Accès aux zones de remplacement depuis l'enregistrement MIDI
const activeReplaceZones = ref(window.activeReplaceZones || new Map())
const selectedPoint = ref(null)
const selectedPoints = ref([]) // Points sélectionnés en mode lasso
const isDragging = ref(false)
const dragTempPoints = ref(null) // Points temporaires pendant le drag

// Refs pour le mode brush
const ccLaneRef = ref(null)
const isBrushing = ref(false)
const isCommandPressed = ref(false)

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

// FENÊTRE GLISSANTE VRAIMENT DÉCOUPLÉE - Cache rotatif de 50 points maximum
const WINDOW_SIZE = 50
const rotatingCache = ref({
  points: [], // Buffer rotatif de max 50 points
  isActive: false,
  lastKnownStoreSize: 0
})

// CACHE AUTO-ALIMENTÉ - OPTIMISÉ POUR TEMPS RÉEL !
const addPointToCache = (newPoint) => {
  const point = {
    id: String(newPoint.id),
    time: parseFloat(newPoint.time) || 0,
    value: parseInt(newPoint.value) || 0,
    trackId: newPoint.trackId
  }
  
  const cache = rotatingCache.value.points
  
  // EN TEMPS RÉEL: Les points arrivent chronologiquement → ajout simple à la fin
  cache.push(point)
  
  // Maintenir la taille du cache à 50 max (fenêtre glissante)
  if (cache.length > WINDOW_SIZE) {
    cache.shift() // Supprimer le plus ancien
  }
  
  console.log(`📥 CACHE ADD CC${props.ccNumber}: +1 point → ${cache.length}/${WINDOW_SIZE} points`)
  
  // Debug rotation seulement quand le cache est plein
  if (cache.length >= WINDOW_SIZE) {
    const firstPoint = cache[0]
    const lastPoint = cache[cache.length - 1]
    console.log(`🔄 ROTATION CC${props.ccNumber}: Premier=${firstPoint?.time?.toFixed(3)}s Dernier=${lastPoint?.time?.toFixed(3)}s`)
  }
}

// FONCTION SIMPLIFIÉE pour recalcul initial seulement
const updateSlidingWindow = () => {
  console.log(`🚀 TOP updateSlidingWindow CC${props.ccNumber} - RECALCUL INITIAL SEULEMENT`)
  
  if (midiStore.selectedTrack === null) {
    rotatingCache.value.points = []
    rotatingCache.value.lastKnownStoreSize = 0
    resetSVGIncremental() // RESET SVG quand pas de piste
    console.log(`❌ updateSlidingWindow CC${props.ccNumber} - PAS DE PISTE SÉLECTIONNÉE`)
    return
  }
  
  const selectedTrackId = parseInt(midiStore.selectedTrack)
  const ccController = parseInt(props.ccNumber)
  
  // ACCÈS AU STORE: Seulement pour le chargement initial
  const storeSnapshot = [...midiStore.midiCC]
  const trackCC = storeSnapshot.filter(cc => {
    const ccTrackId = parseInt(cc.trackId)
    const ccControllerNum = parseInt(cc.controller) || parseInt(cc.number) || 0
    return ccTrackId === selectedTrackId && ccControllerNum === ccController
  })
  
  const allPoints = trackCC.map(cc => ({
    id: String(cc.id),
    time: parseFloat(cc.time) || 0,
    value: parseInt(cc.value) || 0,
    trackId: cc.trackId
  })).sort((a, b) => a.time - b.time)
  
  // INITIALISER le cache avec les 50 derniers
  rotatingCache.value.points = allPoints.length > WINDOW_SIZE ? 
    allPoints.slice(-WINDOW_SIZE) : allPoints
  
  console.log(`🪟 CACHE INITIAL CC${props.ccNumber}: ${allPoints.length} en store → ${rotatingCache.value.points.length} en cache`)
  
  // RESET SVG INCRÉMENTAL pour recommencer proprement
  resetSVGIncremental()
  
  console.log(`✅ FIN updateSlidingWindow CC${props.ccNumber} - RECALCUL INITIAL TERMINÉ`)
}

// Points pour le rendu - STATIQUE, pas de computed réactif
const ccPoints = computed(() => {
  return rotatingCache.value.points
})



// Points affichés - TOUTE LA COURBE, pas seulement la fenêtre glissante
const ccPointsDisplayed = computed(() => {
  let points = []
  
  // MODE DRAG: Utiliser les points temporaires
  if (isDragging.value && dragTempPoints.value) {
    points = dragTempPoints.value
  } else {
    // MODE NORMAL: Utiliser TOUS les points du store (comme la courbe SVG)
    if (midiStore.selectedTrack === null) {
      return []
    }
    
    const selectedTrackId = parseInt(midiStore.selectedTrack)
    const ccController = parseInt(props.ccNumber)
    
    // MÊME LOGIQUE que updateSVGCurve pour cohérence
    points = midiStore.midiCC
      .filter(cc => {
        const ccTrackId = parseInt(cc.trackId)
        const ccControllerNum = parseInt(cc.controller || cc.number)
        return ccTrackId === selectedTrackId && ccControllerNum === ccController
      })
      .map(cc => ({
        id: String(cc.id),
        time: parseFloat(cc.time) || 0,
        value: parseInt(cc.value) || 0,
        trackId: cc.trackId
      }))
      .sort((a, b) => a.time - b.time)
  }
  
  // DÉDOUBLONNER par ID pour éviter l'erreur "Duplicate keys"
  const uniquePoints = []
  const seenIds = new Set()
  let duplicatesFound = 0
  
  for (const point of points) {
    if (!seenIds.has(point.id)) {
      seenIds.add(point.id)
      uniquePoints.push(point)
    } else {
      duplicatesFound++
    }
  }
  
  if (duplicatesFound > 0) {
    console.warn(`⚠️ CC${props.ccNumber} DOUBLONS DÉTECTÉS: ${duplicatesFound} points dupliqués supprimés`)
  }
  
  return uniquePoints
})

const totalWidth = computed(() => {
  return timeSignature.totalWidth?.value || 800
})

const ccPointStyle = (point) => {
  // Calcul direct simple - pas de cache compliqué
  const pixelX = timeSignature.timeToPixelsWithSignatures(point.time)
  const bottomPercent = (point.value / 127) * 100
  
  const adjustedPosition = Math.round(pixelX) - 1
  
  return {
    left: adjustedPosition + 'px',
    bottom: bottomPercent + '%',
    position: 'absolute'
  }
}

// SUPPRIMÉ - remplacé par memoizedPointsOptimized

// SYSTÈME DE DESSIN INCRÉMENTAL - Segments fixes + segment en cours
const svgSegments = ref([]) // Segments terminés (fixes)
const currentSegmentPoints = ref('') // Segment en cours (temps réel)
let currentSegmentBuffer = [] // Buffer pour le segment en cours
let lastRenderedPointCount = 0 // Nombre de points déjà rendus

// DESSIN INCRÉMENTAL: Ajouter seulement les nouveaux points
const updateSVGIncremental = () => {
  if (midiStore.selectedTrack === null) {
    svgSegments.value = []
    currentSegmentPoints.value = ''
    currentSegmentBuffer = []
    lastRenderedPointCount = 0
    return
  }
  
  const selectedTrackId = parseInt(midiStore.selectedTrack)
  const allPoints = midiStore.midiCC
    .filter(cc => {
      const ccTrackId = parseInt(cc.trackId)
      const ccController = parseInt(cc.controller || cc.number)
      return ccTrackId === selectedTrackId && ccController === parseInt(props.ccNumber)
    })
    .sort((a, b) => parseFloat(a.time) - parseFloat(b.time))
  
  if (allPoints.length < 2) {
    svgSegments.value = []
    currentSegmentPoints.value = ''
    currentSegmentBuffer = []
    lastRenderedPointCount = 0
    return
  }
  
  console.log(`🎨 INCRÉMENTAL CC${props.ccNumber}: ${allPoints.length} total, ${lastRenderedPointCount} déjà rendus`)
  
  // NOUVEAUX POINTS: Seulement ceux pas encore rendus
  const newPoints = allPoints.slice(lastRenderedPointCount)
  
  if (newPoints.length === 0) {
    console.log(`🎨 INCRÉMENTAL CC${props.ccNumber}: Aucun nouveau point`)
    return
  }
  
  console.log(`🎨 INCRÉMENTAL CC${props.ccNumber}: ${newPoints.length} nouveaux points à dessiner`)
  
  // PROFILING: Mesurer seulement les nouveaux points
  const svgStart = performance.now()
  
  // Ajouter les nouveaux points au buffer du segment courant
  newPoints.forEach(point => {
    const x = Math.round(timeSignature.timeToPixelsWithSignatures(point.time) * 10) / 10
    const y = Math.round((100 - (point.value / 127) * 100) * 10) / 10
    currentSegmentBuffer.push({ x, y, point })
  })
  
  // Construire le segment en cours avec tous les points du buffer
  if (currentSegmentBuffer.length > 0) {
    // Si c'est le premier point du segment, inclure le dernier point du segment précédent pour continuité
    let segmentPoints = [...currentSegmentBuffer]
    
    // Si on a des segments précédents, prendre le dernier point pour continuité
    if (svgSegments.value.length > 0 && lastRenderedPointCount > 0) {
      const lastSegment = svgSegments.value[svgSegments.value.length - 1]
      if (lastSegment && lastSegment.lastPoint) {
        segmentPoints = [lastSegment.lastPoint, ...segmentPoints]
      }
    }
    
    currentSegmentPoints.value = segmentPoints.map(p => `${p.x},${p.y}`).join(' ')
  }
  
  // TOUS LES 50 POINTS: Finaliser le segment courant et en commencer un nouveau
  if (currentSegmentBuffer.length >= 50) {
    console.log(`🎯 SEGMENT COMPLET CC${props.ccNumber}: ${currentSegmentBuffer.length} points → Finalisation`)
    
    // Finaliser le segment courant
    if (currentSegmentPoints.value) {
      const lastPoint = currentSegmentBuffer[currentSegmentBuffer.length - 1]
      svgSegments.value.push({
        id: `segment-${svgSegments.value.length}-${Date.now()}`,
        points: currentSegmentPoints.value,
        lastPoint: lastPoint // Pour continuité avec le segment suivant
      })
    }
    
    // Réinitialiser pour le prochain segment
    currentSegmentPoints.value = ''
    currentSegmentBuffer = []
  }
  
  // Mettre à jour le compteur
  lastRenderedPointCount = allPoints.length
  
  const svgEnd = performance.now()
  const svgDuration = svgEnd - svgStart
  
  if (svgDuration > 2) {
    console.warn(`⚡ PERF INCRÉMENTAL CC${props.ccNumber}: ${svgDuration.toFixed(1)}ms pour ${newPoints.length} nouveaux points - LENT!`)
  }
}

// RÉINITIALISATION complète (changement de piste, etc.)
const resetSVGIncremental = () => {
  console.log(`🔄 RESET SVG INCRÉMENTAL CC${props.ccNumber}`)
  svgSegments.value = []
  currentSegmentPoints.value = ''
  currentSegmentBuffer = []
  lastRenderedPointCount = 0
}

// VERSION SIMPLE: SVG sans complexité pour performance maximale
const updateSVGSimple = () => {
  if (midiStore.selectedTrack === null) {
    currentSegmentPoints.value = ''
    return
  }
  
  const selectedTrackId = parseInt(midiStore.selectedTrack)
  
  // SEULEMENT LES 100 DERNIERS POINTS pour éviter la lenteur
  const allPoints = midiStore.midiCC
    .filter(cc => {
      const ccTrackId = parseInt(cc.trackId)
      const ccController = parseInt(cc.controller || cc.number)
      return ccTrackId === selectedTrackId && ccController === parseInt(props.ccNumber)
    })
    .sort((a, b) => parseFloat(a.time) - parseFloat(b.time))
    .slice(-100) // Seulement les 100 derniers points
  
  if (allPoints.length < 2) {
    currentSegmentPoints.value = ''
    return
  }
  
  console.log(`🎨 SVG SIMPLE CC${props.ccNumber}: ${allPoints.length} points (max 100)`)
  
  // Conversion directe sans optimisation complexe
  const svgPoints = allPoints.map(point => {
    const x = Math.round(timeSignature.timeToPixelsWithSignatures(point.time))
    const y = Math.round(100 - (point.value / 127) * 100)
    return `${x},${y}`
  })
  
  currentSegmentPoints.value = svgPoints.join(' ')
}

let dragStartX = 0
let dragStartY = 0
let originalTime = 0
let originalValue = 0

const startDrag = (point, event) => {
  console.log('🎯 CCLane startDrag APPELÉ!', point.id, { metaKey: event.metaKey, ctrlKey: event.ctrlKey })
  
  // Mode brush (CMD/Ctrl + clic) - gérer directement ici
  if (event.metaKey || event.ctrlKey) {
    console.log('🎨 CCLane startDrag: Mode brush détecté - activation directe')
    event.preventDefault()
    event.stopPropagation()
    
    // Activer le mode brush
    isBrushing.value = true
    isCommandPressed.value = true
    lastBrushedPointId = null
    
    // Calculer la nouvelle valeur CC depuis la position Y
    const newCC = calculateCCFromPosition(event.clientY)
    updateCCPoint(point.id, newCC)
    lastBrushedPointId = point.id
    
    // Émettre la sélection
    emit('point-selected', {
      id: String(point.id),
      value: Math.round(newCC),
      type: `cc${props.ccNumber}`
    })
    
    // CRUCIAL: Ajouter les listeners pour le brush
    document.addEventListener('mousemove', onBrushMove)
    document.addEventListener('mouseup', stopBrush)
    
    return
  }
  
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

  // Créer une copie des points du cache pour la manipulation temporaire
  const basePoints = ccPoints.value
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
        const originalPoint = ccPoints.value.find(p => p.id === selectedP.id)
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

// Variables pour le mode brush
let lastBrushedPointId = null
let lastBrushedTime = null

// Fonction pour trouver un point CC à une position donnée
const findItemAtPosition = (clientX, clientY) => {
  if (!ccLaneRef.value) return null
  
  const rect = ccLaneRef.value.getBoundingClientRect()
  const relativeX = clientX - rect.left
  const relativeY = clientY - rect.top
  const tolerance = 10 // pixels
  
  for (const point of ccPointsDisplayed.value) {
    try {
      const pointX = timeSignature.timeToPixelsWithSignatures
        ? timeSignature.timeToPixelsWithSignatures(point.time)
        : point.time * 240 // fallback
      
      const pointY = (1 - (point.value / 127)) * rect.height
      
      const distance = Math.sqrt(
        Math.pow(relativeX - pointX, 2) + 
        Math.pow(relativeY - pointY, 2)
      )
      
      if (distance <= tolerance) {
        return point
      }
    } catch (error) {
      continue
    }
  }
  return null
}

// Calculer la valeur CC depuis la position Y
const calculateCCFromPosition = (clientY) => {
  if (!ccLaneRef.value) return 64
  
  const rect = ccLaneRef.value.getBoundingClientRect()
  const mouseY = clientY - rect.top
  const relativeY = mouseY / rect.height
  
  // Convertir en CC (plage 0-127, inversé car Y=0 est en haut)
  const ccValue = Math.round((1 - relativeY) * 127)
  return Math.max(0, Math.min(127, ccValue))
}

// Gestionnaire des touches pour le curseur brush
const handleKeyDown = (event) => {
  if ((event.metaKey || event.ctrlKey) && !isCommandPressed.value) {
    isCommandPressed.value = true
    if (ccLaneRef.value) {
      ccLaneRef.value.classList.add('brush-mode')
    }
  }
}

const handleKeyUp = (event) => {
  if ((!event.metaKey && !event.ctrlKey) || event.key === 'Meta' || event.key === 'Control') {
    isCommandPressed.value = false
    if (ccLaneRef.value) {
      ccLaneRef.value.classList.remove('brush-mode')
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
  console.log('🎛️ CCLane handleContainerMouseDown appelé', { metaKey: event.metaKey, ctrlKey: event.ctrlKey })
  console.log('🎛️ CCLane selectedTrack:', midiStore.selectedTrack)
  
  // Mode brush (CMD/Ctrl + clic)
  if (event.metaKey || event.ctrlKey) {
    console.log('🎨 CCLane: Mode brush activé dans handleContainer!')
    event.preventDefault()
    event.stopPropagation()
    
    isBrushing.value = true
    isCommandPressed.value = true
    lastBrushedPointId = null
    
    // Créer un nouveau point CC à la position du clic
    const rect = ccLaneRef.value.getBoundingClientRect()
    const relativeX = event.clientX - rect.left
    const clickTime = timeSignature.pixelsToTimeWithSignatures 
      ? timeSignature.pixelsToTimeWithSignatures(relativeX)
      : relativeX / 240 // fallback
    
    const newCC = calculateCCFromPosition(event.clientY)
    
    // MODE REPLACE : Supprimer les CC existants à ce moment précis
    if (projectStore.userPreferences?.keyboard?.recordingMode === 'replace') {
      const timeWindow = 0.05 // 50ms de tolérance
      const ccToKeep = midiStore.midiCC.filter(cc => {
        if (parseInt(cc.trackId) !== midiStore.selectedTrack) return true
        if (parseInt(cc.controller) !== parseInt(props.ccNumber)) return true
        
        const ccTime = parseFloat(cc.time)
        return Math.abs(ccTime - clickTime) > timeWindow
      })
      
      if (ccToKeep.length < midiStore.midiCC.length) {
        midiStore.midiCC = ccToKeep
      }
    }
    
    // Ajouter le point au store
    const newPointId = midiStore.addCC({
      trackId: midiStore.selectedTrack,
      controller: props.ccNumber,
      time: clickTime,
      value: Math.round(newCC),
      channel: midiStore.tracks.find(t => t.id === midiStore.selectedTrack)?.channel || 0
    })
    
    console.log('🎨 ✅ BRUSH POINT CRÉÉ:', { id: newPointId, time: clickTime, value: Math.round(newCC) })
    lastBrushedPointId = newPointId
    
    // Vérifier si le point apparaît dans les points visibles
    nextTick(() => {
      const visibleCount = ccPointsDisplayed.value?.length || 0
      console.log('🎨 Points CC visibles après création:', visibleCount)
      console.log('🎨 Dernier point créé visible?', ccPointsDisplayed.value?.find(p => p.id === newPointId))
    })
    
    emit('point-selected', {
      id: String(newPointId),
      value: Math.round(newCC),
      type: `cc${props.ccNumber}`
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
  
  console.log('🖌️ CCLane onBrushMove appelé!')
  
  try {
    if (event.cancelable) {
      event.preventDefault()
    }
  } catch (e) {
    // Ignore l'erreur si preventDefault n'est pas possible
  }
  
  // Créer un nouveau point CC à chaque mouvement de souris
  const rect = ccLaneRef.value.getBoundingClientRect()
  const relativeX = event.clientX - rect.left
  const currentTime = timeSignature.pixelsToTimeWithSignatures 
    ? timeSignature.pixelsToTimeWithSignatures(relativeX)
    : relativeX / 240 // fallback
  
  const newCC = calculateCCFromPosition(event.clientY)
  
  // Créer un point seulement si on a bougé suffisamment (éviter trop de points)
  // En mode replace, augmenter la densité des points pour une meilleure capture
  const minTimeDistance = projectStore.userPreferences?.keyboard?.recordingMode === 'replace' ? 0.05 : 0.1 // secondes minimum entre les points
  const shouldCreatePoint = !lastBrushedTime || Math.abs(currentTime - lastBrushedTime) >= minTimeDistance
  
  if (shouldCreatePoint) {
    // MODE REPLACE : Supprimer les CC existants à ce moment précis
    if (projectStore.userPreferences?.keyboard?.recordingMode === 'replace') {
      const timeWindow = 0.05 // 50ms de tolérance
      const ccToKeep = midiStore.midiCC.filter(cc => {
        if (parseInt(cc.trackId) !== midiStore.selectedTrack) return true
        if (parseInt(cc.controller) !== parseInt(props.ccNumber)) return true
        
        const ccTime = parseFloat(cc.time)
        return Math.abs(ccTime - currentTime) > timeWindow
      })
      
      if (ccToKeep.length < midiStore.midiCC.length) {
        midiStore.midiCC = ccToKeep
      }
    }
    console.log('🖌️ Brush: Création point CC en mouvement', { currentTime, newCC, ccNumber: props.ccNumber })
    
    const newPointId = midiStore.addCC({
      trackId: midiStore.selectedTrack,
      controller: props.ccNumber,
      time: currentTime,
      value: Math.round(newCC),
      channel: midiStore.tracks.find(t => t.id === midiStore.selectedTrack)?.channel || 0
    })
    
    console.log('🖌️ ✅ BRUSH MOVE POINT CRÉÉ:', { id: newPointId, time: currentTime, value: Math.round(newCC) })
    
    lastBrushedPointId = newPointId
    lastBrushedTime = currentTime
    
    emit('point-selected', {
      id: String(newPointId),
      value: Math.round(newCC),
      type: `cc${props.ccNumber}`
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

// Fonction pour mettre à jour un point CC
const updateCCPoint = (pointId, time, value) => {
  const clampedValue = Math.max(0, Math.min(127, value))
  console.log(`🎛️ CCLane updateCCPoint: ${pointId} -> ${clampedValue}`)
  
  midiStore.updateCC(pointId, {
    time: time,
    value: clampedValue
  })
}

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

// Watcher optimisé - seulement pour les changements majeurs
watch(() => midiStore.midiCC.length, (newLength, oldLength) => {
  // Réaction seulement aux changements significatifs de taille
  if (Math.abs(newLength - oldLength) > 5) {
    // Auto-optimisation si trop de CC
    if (newLength > 1000) {
      midiStore.optimizeMidiCC()
    }
  }
}, { flush: 'post' })

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

// SYSTÈME DE BATCH AVEC COMPTEUR VISIBLE
let pointsSinceLastUpdate = 0
const BATCH_SIZE = 50

// Buffer pour accumuler les nouveaux points
let pendingPoints = []

// Throttling pour la mise à jour SVG
let lastSVGUpdate = 0

function handleMidiCCUpdated(event) {
  const shouldUpdate = event.detail?.forceAll || 
                      event.detail?.controller === parseInt(props.ccNumber)
  
  if (shouldUpdate) {
    if (event.detail?.forceAll) {
      // ARRÊT ENREGISTREMENT: Traiter les points en attente
      console.log(`🔄 FORCE UPDATE CC${props.ccNumber} (arrêt enregistrement) - ${pendingPoints.length} points en attente`)
      
      // Traiter tous les points en attente
      pendingPoints.forEach(point => addPointToCache(point))
      pendingPoints = []
      pointsSinceLastUpdate = 0
      
      updateSVGSimple()  // Mettre à jour SVG simple
      return
    }
    
    // TEMPS RÉEL SIMPLE: Throttling agressif pour performance maximale
    if (event.detail && event.detail.controller === parseInt(props.ccNumber)) {
      console.log(`🎨 CC${props.ccNumber} TEMPS RÉEL: Nouveau point reçu`)
      
      // THROTTLE SVG AGRESSIF: Mettre à jour SVG seulement tous les 500ms (2 FPS)
      const now = performance.now()
      const SVG_UPDATE_THROTTLE = 500 // 500ms = 2 FPS pour performance maximale
      
      if (!lastSVGUpdate || now - lastSVGUpdate > SVG_UPDATE_THROTTLE) {
        console.log(`🎨 CC${props.ccNumber} SVG UPDATE: ${now - (lastSVGUpdate || 0)}ms depuis dernière mise à jour`)
        updateSVGSimple()  // Version simplifiée
        lastSVGUpdate = now
      } else {
        console.log(`🎨 CC${props.ccNumber} SVG SKIP: Throttlé (${now - lastSVGUpdate}ms < ${SVG_UPDATE_THROTTLE}ms)`)
      }
      
      // Garder le système de cache pour les optimisations internes
      const selectedTrackId = parseInt(midiStore.selectedTrack)
      const ccController = parseInt(props.ccNumber)
      
      // Créer un point directement depuis l'événement
      const newPoint = {
        id: `temp-${Date.now()}-${Math.random().toString(36).substring(2,8)}`,
        trackId: selectedTrackId,
        controller: ccController,
        time: event.detail.recordTime || performance.now() / 1000,
        value: event.detail.value || 64
      }
      
      pendingPoints.push(newPoint)
      pointsSinceLastUpdate++
      console.log(`📊 CC${props.ccNumber} COMPTEUR: ${pointsSinceLastUpdate}/${BATCH_SIZE} points (${pendingPoints.length} en attente)`)
      
      // DÉCLENCHEMENT BATCH: Seulement pour le cache rotatif (optimisation interne)
      if (pointsSinceLastUpdate >= BATCH_SIZE) {
        console.log(`🎯 CC${props.ccNumber} DÉCLENCHEMENT BATCH CACHE: ${pointsSinceLastUpdate} points → TRAITEMENT DU BUFFER DE ${pendingPoints.length} POINTS`)
        
        // Traiter TOUT le buffer d'un coup (pour le cache)
        pendingPoints.forEach(point => addPointToCache(point))
        console.log(`✅ CC${props.ccNumber} BATCH CACHE TERMINÉ: Cache maintenant à ${rotatingCache.value.points.length}/${WINDOW_SIZE} points`)
        
        pendingPoints = []
        pointsSinceLastUpdate = 0
      }
    }
  }
}

onMounted(() => {
  // INITIALISER la fenêtre glissante ET courbe SVG simple au montage
  updateSlidingWindow()
  updateSVGSimple()
  
  // Ajouter les listeners clavier pour le lasso
  document.addEventListener('keydown', handleKeydown)
  
  // Écouter les événements de mise à jour manuelle de valeur
  document.addEventListener('update-point-value', handleManualPointValueUpdate)
  
  // TEMPS RÉEL: Écouter les mises à jour CC pendant l'enregistrement
  window.addEventListener('midi-cc-updated', handleMidiCCUpdated)
})


onUnmounted(() => {
  // Nettoyer les event listeners et les données temporaires
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onBrushMove)
  document.removeEventListener('mouseup', stopBrush)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('update-point-value', handleManualPointValueUpdate)
  
  // Nettoyer le listener d'enregistrement temps réel
  window.removeEventListener('midi-cc-updated', handleMidiCCUpdated)
  
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
  cursor: default;
  z-index: 5;
}

.cc-curve-container.brush-mode {
  cursor: crosshair;
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