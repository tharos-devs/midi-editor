<template>
  <div 
    class="timeline" 
    :style="{ width: totalWidth + 'px' }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @click="onTimelineClick"
    @wheel="onWheel"
    ref="timelineElement"
  >
    <div class="timeline-ruler">
      <!-- Utilisation du GridRenderer -->
      <div class="timeline-grid-background">
        <GridRenderer 
          :show-measure-lines="true"
          :show-beat-lines="true"
          :show-subdivision-lines="true"
          :show-signature-indicators="true"
          :show-measure-numbers="true" 
          :show-beat-labels="true"
          :show-subdivision-labels="false"
          :signature-indicator-style="{ top: '-18px', fontSize: '10px' }"
          :measure-number-style="{ top: '6px', fontSize: '14px', fontWeight: 'bold' }"
        >
          <!-- Slot pour les fonds colorés selon signature (optionnel) -->
          <template #default="{ measures }">
            <!-- Curseur de lecture -->
            <GlobalPlaybackCursor :total-width="totalWidth" />
            
            <!-- Marqueur de position P -->
            <PlaybackMarker />

            <!-- Drapeaux de loop -->
            <div
              v-if="isLoopEnabled"
              class="loop-region"
              :style="{ 
                left: Math.min(loopStartPixels, loopEndPixels) + 'px',
                width: Math.abs(loopEndPixels - loopStartPixels) + 'px'
              }"
            ></div>

            <!-- Drapeau de début de loop -->
            <div
              v-if="isLoopEnabled"
              class="loop-flag loop-start-flag"
              :class="{ 'dragging': isDraggingLoopFlag && draggedLoopType === 'start' }"
              :style="{ left: loopStartPixels + 'px' }"
              @mousedown.stop="startLoopDrag('start', $event)"
              title="Début de boucle"
            >
              <div class="flag-pole"></div>
              <div class="flag-icon">▶</div>
            </div>

            <!-- Drapeau de fin de loop -->
            <div
              v-if="isLoopEnabled"
              class="loop-flag loop-end-flag"
              :class="{ 
                'dragging': isDraggingLoopFlag && draggedLoopType === 'end'
              }"
              :style="{ left: (loopEndPixels - 24) + 'px' }"
              @mousedown.stop="startLoopDrag('end', $event)"
              title="Fin de boucle"
            >
              <div class="flag-pole"></div>
              <div class="flag-icon">◀</div>
            </div>

            <!-- Indicateur de snap pour les drapeaux de loop -->
            <div
              v-if="showLoopSnapIndicator"
              class="loop-snap-indicator"
              :style="{ left: timeToPixelsWithSignatures(loopSnapIndicatorTime) + 'px' }"
            >
              <div class="snap-line"></div>
            </div>

            <div
              v-for="measure in measures"
              :key="`bg-${measure.number}`"
              class="measure-background"
              :class="`sig-${measure.timeSignature.numerator}-${measure.timeSignature.denominator}`"
              :style="{
                position: 'absolute',
                left: measure.startPixel + 'px',
                width: measure.measureWidth + 'px',
                height: '100%',
                top: '0px',
                zIndex: 0
              }"
            />
          </template>
        </GridRenderer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { provide, computed, ref, reactive, onBeforeUnmount, nextTick } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useUIStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { useSnapLogic } from '@/composables/useSnapLogic'
import GridRenderer from '@/components/GridRenderer.vue'
import { useMidiPlayer } from '@/composables/useMidiPlayer'
import GlobalPlaybackCursor from '@/components/GlobalPlaybackCursor.vue'
import PlaybackMarker from '@/components/PlaybackMarker.vue'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

// Utiliser le composable de signature rythmique et les stores
const timeSignatureComposable = useTimeSignature()
const { pixelsToTimeWithSignatures, timeToPixelsWithSignatures } = timeSignatureComposable
const uiStore = useUIStore()
const projectStore = useProjectStore()
const midiPlayer = useMidiPlayer()
const cursorStore = usePlaybackCursorStore()
const { snapTimeToGrid } = useSnapLogic()

// États pour le zoom par glissement
const isDragging = ref(false)
const startY = ref(0)
const startZoomPercent = ref(50)
const currentZoomPercent = ref(50)
const mousePosition = ref({ x: 0, y: 0 })
const dragStartMouseX = ref(0) // Position X de la souris au début du drag
const dragStartTime = ref(0) // Temps du début du drag pour détecter clic vs drag
const timelineElement = ref(null) // Référence à l'élément timeline

// États pour le drag des drapeaux de loop
const isDraggingLoopFlag = ref(false)
const draggedLoopType = ref(null) // 'start' ou 'end'
const loopDragStartX = ref(0)
const loopDragStartTime = ref(0)
const showLoopSnapIndicator = ref(false)
const loopSnapIndicatorTime = ref(0)

const measuresWithSignatures = computed(() => {
  return timeSignatureComposable?.measuresWithSignatures?.value || []
})

const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

const timeToPixel = computed(() => {
  const duration = cursorStore.totalDuration || 1
  if (!totalWidth.value || !duration) {
    console.warn('⚠️ TimeLine: Données manquantes pour timeToPixel')
    return (time) => time * 50 // Fallback
  }
  
  return (timeInSeconds) => {
    if (!timeInSeconds || timeInSeconds < 0) return 0
    return (timeInSeconds / duration) * totalWidth.value
  }
})

const measures = computed(() => {
  return timeSignatureComposable?.measuresWithSignatures?.value || []
})

const pixelsPerSecond = computed(() => {
  return totalWidth.value / (cursorStore.totalDuration || 1)
})

// Positions des drapeaux de loop
const loopStartPixels = computed(() => {
  return timeToPixelsWithSignatures ? timeToPixelsWithSignatures(projectStore.userPreferences.playback.loopStart) : 0
})

const loopEndPixels = computed(() => {
  return timeToPixelsWithSignatures ? timeToPixelsWithSignatures(projectStore.userPreferences.playback.loopEnd) : 0
})

const isLoopEnabled = computed(() => {
  return projectStore.userPreferences.playback.loopEnabled
})


// Fonction pour convertir une position X en temps (utilise les signatures temporelles et le zoom)
const pixelsToTime = (pixels) => {
  if (pixelsToTimeWithSignatures) {
    return pixelsToTimeWithSignatures(pixels)
  }
  
  // Fallback simple si la fonction n'est pas disponible
  const duration = cursorStore.totalDuration || 1
  return Math.max(0, Math.min(duration, (pixels / totalWidth.value) * duration))
}

// Gestion du zoom focal spécifique à TimeLine (SEULEMENT vertical)
const onWheel = (event) => {
  // Vérifier qu'il s'agit bien d'un mouvement vertical (zoom)
  // Le scroll horizontal est géré par WheelHandler global
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    // Scroll horizontal - NE PAS gérer, laisser WheelHandler s'occuper
    return
  }
  
  // Zoom focal sur TimeLine
  event.preventDefault()
  
  // Récupérer la position de la souris relative à la timeline
  const rect = event.currentTarget.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  
  // Calculer la position relative (0 à 1) dans la timeline
  const relativePosition = mouseX / totalWidth.value
  
  // Sauvegarder la largeur actuelle avant le zoom
  const oldWidth = totalWidth.value
  
  // Déterminer la direction (deltaY positif = scroll vers le bas = zoom out)
  const delta = event.deltaY
  
  if (delta < 0) {
    // Scroll vers le haut = zoom in
    uiStore.zoomIn('horizontal')
    currentZoomPercent.value = Math.min(100, currentZoomPercent.value + 10)
  } else {
    // Scroll vers le bas = zoom out
    uiStore.zoomOut('horizontal')
    currentZoomPercent.value = Math.max(0, currentZoomPercent.value - 10)
  }
  
  // Zoom focal : maintenir le point sous la souris à la même position
  nextTick(() => {
    // Calculer la nouvelle position en pixels où devrait se trouver le point focal
    const newMouseX = relativePosition * totalWidth.value
    
    // Calculer le décalage nécessaire pour maintenir le point sous la souris
    const offset = newMouseX - mouseX
    
    // Faire défiler la timeline pour compenser
    const timelineParent = event.currentTarget.parentElement
    if (timelineParent && timelineParent.scrollLeft !== undefined) {
      timelineParent.scrollLeft += offset
    }
  })
}

// Gestion des événements de souris avec zoom focal
const onMouseDown = (event) => {
  // CORRECTION AMÉLIORÉE: Vérification plus robuste des clics sur les drapeaux
  const clickedElement = event.target
  const isLoopFlag = clickedElement?.classList?.contains('loop-flag') || 
                     clickedElement?.closest?.('.loop-flag') ||
                     clickedElement?.classList?.contains('flag-pole') ||
                     clickedElement?.classList?.contains('flag-icon')
  
  if (isLoopFlag) {
    // Le clic est sur un drapeau de loop ou ses enfants, ignorer complètement
    console.log('🎯 Clic sur drapeau détecté, arrêt complet de l\'événement')
    event.stopImmediatePropagation()
    event.preventDefault()
    return false
  }
  
  // CORRECTION: Vérifier si on est en train de dragger un drapeau
  if (isDraggingLoopFlag.value) {
    // Un drag de drapeau est déjà en cours, ignorer
    console.log('🎯 Drag de drapeau en cours, ignorer le zoom focal')
    return false
  }
  
  // Empêcher la sélection de texte pendant le glissement
  event.preventDefault()
  
  isDragging.value = false // Ne pas marquer comme dragging immédiatement
  startY.value = event.clientY
  startZoomPercent.value = currentZoomPercent.value
  dragStartTime.value = Date.now() // Enregistrer le temps du début
  
  // Sauvegarder la position X de la souris relative à la timeline
  const rect = event.currentTarget.getBoundingClientRect()
  dragStartMouseX.value = event.clientX - rect.left
  
  // Ajouter les événements globaux
  document.addEventListener('mousemove', onGlobalMouseMove)
  document.addEventListener('mouseup', onGlobalMouseUp)
}

const onMouseMove = (event) => {
  // Ce handler n'est plus nécessaire pour le tooltip mais peut servir à d'autres fins
}

// Gestionnaire de clic direct - plus simple
const onTimelineClick = (event) => {
  // Ne traiter le clic que si ce n'était pas un drag
  if (!isDragging.value) {
    // APPROCHE DIFFÉRENTE: Calculer la position absolue directement par rapport au document
    // puis soustraire la position de l'élément timeline dans le document
    
    const timelineRect = timelineElement.value.getBoundingClientRect()
    const clickXInViewport = event.clientX
    
    // Position du clic relative à l'élément timeline visible
    const relativeX = clickXInViewport - timelineRect.left
    
    // CORRECTION FINALE: Utiliser le ScrollController comme source de vérité
    // car il est le maître de la synchronisation
    const scrollController = document.querySelector('.scroll-controller')
    const timelineParent = timelineElement.value?.parentElement
    const syncElement = document.querySelector('.sync-scroll-x')
    
    // Priorité: ScrollController > timeline parent > premier sync element
    let scrollLeft = 0
    if (scrollController) {
      scrollLeft = scrollController.scrollLeft
    } else if (timelineParent) {
      scrollLeft = timelineParent.scrollLeft
    } else if (syncElement) {
      scrollLeft = syncElement.scrollLeft
    }
    
    // Debug: vérifier toutes les sources de scroll ET la largeur totale
    const currentTotalWidth = totalWidth.value
    const allScrollValues = {
      clickXInViewport: clickXInViewport.toFixed(1),
      timelineLeft: timelineRect.left.toFixed(1),
      relativeX: relativeX.toFixed(1),
      timelineParent: timelineParent?.scrollLeft || 0,
      timeline: timelineElement.value?.scrollLeft || 0,
      firstSyncElement: syncElement?.scrollLeft || 0,
      scrollController: scrollController?.scrollLeft || 0,
      used: scrollLeft,
      parentElement: timelineParent?.className || 'none',
      totalWidth: currentTotalWidth
    }
    
    console.log('📏 Sources de scroll:', allScrollValues)
    
    // CORRECTION MAJEURE: Le problème du double-comptage !
    // Si timelineLeft change quand on scroll, c'est que relativeX inclut déjà le scroll
    // Dans ce cas, il ne faut PAS ajouter scrollLeft car cela double-compte !
    
    // Test simple: est-ce que la TimeLine bouge quand on scroll ?
    const isTimelineMovingWithScroll = scrollLeft > 0
    
    let absolutePixelPosition
    if (isTimelineMovingWithScroll) {
      // La TimeLine bouge avec le scroll → relativeX est déjà correct
      absolutePixelPosition = relativeX
      console.log('🔧 CALCUL POSITION (SANS scrollLeft):', {
        clickViewport: clickXInViewport.toFixed(1) + 'px',
        timelineLeft: timelineRect.left.toFixed(1) + 'px',
        relativeX: relativeX.toFixed(1) + 'px',
        scrollLeft: scrollLeft.toFixed(1) + 'px (IGNORÉ)',
        absolute: absolutePixelPosition.toFixed(1) + 'px',
        raison: 'TimeLine bouge avec scroll'
      })
    } else {
      // La TimeLine est fixe → il faut ajouter scrollLeft
      absolutePixelPosition = relativeX + scrollLeft
      console.log('🔧 CALCUL POSITION (AVEC scrollLeft):', {
        clickViewport: clickXInViewport.toFixed(1) + 'px',
        timelineLeft: timelineRect.left.toFixed(1) + 'px',
        relativeX: relativeX.toFixed(1) + 'px',
        scrollLeft: scrollLeft.toFixed(1) + 'px',
        absolute: absolutePixelPosition.toFixed(1) + 'px',
        raison: 'TimeLine fixe'
      })
    }
    
    // DIAGNOSTIC ET CORRECTION: Vérifier la cohérence du calcul
    const depassement = absolutePixelPosition > totalWidth.value
    console.log('🔍 DIAGNOSTIC calcul pixels:', {
      relativeX: relativeX.toFixed(1),
      scrollLeft: scrollLeft.toFixed(1),
      somme: absolutePixelPosition.toFixed(1),
      largeurTotale: totalWidth.value,
      dépassement: depassement ? '⚠️ DÉPASSE' : '✅ OK',
      ratioScroll: (scrollLeft / totalWidth.value * 100).toFixed(1) + '%'
    })
    
    // CORRECTION SIMPLE: La position relative est déjà correcte !
    // Le problème était d'ajouter scrollLeft inutilement
    if (depassement) {
      const anciennePosition = absolutePixelPosition
      
      // INSIGHT: relativeX est déjà la position correcte dans la timeline !
      // On n'a pas besoin d'ajouter scrollLeft pour les clics dans la timeline
      absolutePixelPosition = Math.min(relativeX, totalWidth.value - 1)
      
      console.log('🔧 CORRECTION SIMPLE:', {
        clicOriginal: anciennePosition.toFixed(1) + 'px',
        relativeX: relativeX.toFixed(1) + 'px',
        timelineMax: totalWidth.value.toFixed(1) + 'px',
        positionFinale: absolutePixelPosition.toFixed(1) + 'px',
        économie: (anciennePosition - absolutePixelPosition).toFixed(1) + 'px'
      })
    }
    
    let targetTime = pixelsToTime(absolutePixelPosition)
    
    // TEST DE COHÉRENCE: Vérifier la conversion aller-retour
    const { timeToPixelsWithSignatures } = timeSignatureComposable
    if (timeToPixelsWithSignatures) {
      const backToPixels = timeToPixelsWithSignatures(targetTime)
      const pixelsDiff = Math.abs(absolutePixelPosition - backToPixels)
      console.log('🔬 Test cohérence conversion:', {
        clicPixels: absolutePixelPosition.toFixed(1),
        calculatedTime: targetTime.toFixed(3) + 's',
        backToPixels: backToPixels.toFixed(1),
        difference: pixelsDiff.toFixed(1) + 'px',
        coherent: pixelsDiff < 5 ? '✅' : '❌'
      })
    }
    
    // SUPPRESSION TEMPORAIRE: Enlever toute limitation pour test
    // Laisser le curseur se positionner exactement où l'utilisateur clique
    const midiDuration = midiPlayer.totalDuration.value || 0
    console.log('🔍 Temps calculé (SANS LIMITATION):', {
      tempsCalculé: targetTime.toFixed(6) + 's',
      duréeMIDI: midiDuration.toFixed(6) + 's',
      différence: (targetTime - midiDuration).toFixed(3) + 's',
      status: 'AUCUNE LIMITATION APPLIQUÉE'
    })
    
    // Debug: largeur AVANT le seekTo
    console.log('🔍 AVANT seekTo:', {
      totalWidth: totalWidth.value,
      targetTime: targetTime.toFixed(6) + 's', // Plus de précision !
      expectedPixels: absolutePixelPosition.toFixed(1) + 'px'
    })
    
    // CORRECTION: Utiliser une précision maximale pour éviter les arrondis
    const preciseTime = Math.round(targetTime * 1000000) / 1000000 // 6 décimales
    
    // CORRECTION: Appeler aussi midiPlayer.seekTo pour mettre à jour le tempo
    midiPlayer.seekTo(preciseTime)
    
    // NOUVEAU: Positionner le curseur directement sans passer par le player
    // pour éviter les recalculs multiples qui causent le déphasage
    cursorStore.seekTo(preciseTime, true) // true = fromTimelineClick
    
    // Debug: largeur APRÈS le seekTo (avec un délai pour voir les changements)
    setTimeout(() => {
      console.log('🔍 APRÈS seekTo (+50ms):', {
        totalWidth: totalWidth.value,
        changed: totalWidth.value !== currentTotalWidth ? '⚠️ CHANGED' : '✅ STABLE'
      })
    }, 50)
  }
}

const onGlobalMouseMove = (event) => {
  // Détecter si on a commencé à vraiment dragger (mouvement vertical significatif)
  const deltaY = Math.abs(event.clientY - startY.value)
  
  // Calculer deltaX correctement en utilisant la position de départ
  let deltaX = 0
  if (timelineElement.value) {
    const rect = timelineElement.value.getBoundingClientRect()
    const currentMouseX = event.clientX - rect.left
    deltaX = Math.abs(currentMouseX - dragStartMouseX.value)
  }
  
  // Si mouvement vertical > horizontal et > seuil, c'est un drag pour zoom
  if (deltaY > 5 && deltaY > deltaX) {
    if (!isDragging.value) {
      isDragging.value = true
      document.body.style.cursor = 'ns-resize'
    }
  }
  
  if (!isDragging.value) return
  
  // Calculer la différence verticale
  const deltaYReal = startY.value - event.clientY // Inversé : haut = zoom in
  const sensitivity = 0.2 // Ajustez cette valeur pour modifier la sensibilité
  
  // Calculer le nouveau pourcentage de zoom (limité entre 0 et 100)
  const newZoomPercent = Math.max(0, Math.min(100, startZoomPercent.value + (deltaYReal * sensitivity)))
  
  // Appliquer le zoom si la valeur a changé
  if (Math.abs(newZoomPercent - currentZoomPercent.value) > 0.5) {
    // Calculer la position relative du point focal avant le zoom
    const relativePosition = dragStartMouseX.value / totalWidth.value
    
    // Sauvegarder la largeur actuelle
    const oldWidth = totalWidth.value
    
    if (newZoomPercent > currentZoomPercent.value) {
      uiStore.zoomIn('horizontal')
    } else if (newZoomPercent < currentZoomPercent.value) {
      uiStore.zoomOut('horizontal')
    }
    currentZoomPercent.value = newZoomPercent
    
    // Appliquer le zoom focal après le changement
    nextTick(() => {
      // Calculer la nouvelle position en pixels où devrait se trouver le point focal
      const newFocalX = relativePosition * totalWidth.value
      
      // Calculer le décalage nécessaire pour maintenir le point focal
      const offset = newFocalX - dragStartMouseX.value
      
      // Faire défiler la timeline pour compenser
      const timelineElement = document.querySelector('.timeline')
      if (timelineElement) {
        const timelineParent = timelineElement.parentElement
        if (timelineParent && timelineParent.scrollLeft !== undefined) {
          timelineParent.scrollLeft += offset
        }
      }
    })
  }
}

const onMouseUp = (event) => {
  finishDragging()
}

const onMouseLeave = () => {
  if (isDragging.value) {
    finishDragging()
  }
}

const onGlobalMouseUp = (event) => {
  finishDragging()
}

const finishDragging = () => {
  isDragging.value = false
  
  // Retirer les événements globaux
  document.removeEventListener('mousemove', onGlobalMouseMove)
  document.removeEventListener('mouseup', onGlobalMouseUp)
  
  // Restaurer le curseur
  document.body.style.cursor = ''
}

// ===================== FONCTIONS DE LOOP =====================

// Commencer le drag d'un drapeau de loop
const startLoopDrag = (type, event) => {
  console.log(`🎯 Début drag drapeau ${type}`)
  
  // CORRECTION: Empêcher complètement la propagation
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  
  isDraggingLoopFlag.value = true
  draggedLoopType.value = type
  loopDragStartX.value = event.clientX
  
  // Sauvegarder le temps initial
  if (type === 'start') {
    loopDragStartTime.value = projectStore.userPreferences.playback.loopStart
  } else {
    loopDragStartTime.value = projectStore.userPreferences.playback.loopEnd
  }
  
  // Ajouter les gestionnaires globaux pour le drag
  document.addEventListener('mousemove', onLoopDrag, { passive: false })
  document.addEventListener('mouseup', stopLoopDrag, { passive: false })
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
  
  console.log(`✅ Drag drapeau ${type} initialisé`)
}

// Gérer le déplacement du drapeau de loop
const onLoopDrag = (event) => {
  if (!isDraggingLoopFlag.value || !draggedLoopType.value) return
  
  // CORRECTION: Empêcher la propagation pendant le drag
  event.preventDefault()
  event.stopPropagation()
  
  const deltaX = event.clientX - loopDragStartX.value
  const rect = timelineElement.value?.getBoundingClientRect()
  
  if (!rect) return
  
  // Calculer la nouvelle position temporelle
  const currentTime = loopDragStartTime.value
  const currentPixels = timeToPixelsWithSignatures(currentTime)
  const newPixels = currentPixels + deltaX
  const constrainedPixels = Math.max(0, Math.min(totalWidth.value, newPixels))
  
  // Convertir en temps
  const rawTime = pixelsToTimeWithSignatures(constrainedPixels)
  let finalTime = Math.max(0, rawTime)
  
  // Appliquer le snap si activé
  if (uiStore.snapToGrid) {
    const snappedTime = snapTimeToGrid(rawTime)
    const snappedPixels = timeToPixelsWithSignatures(snappedTime)
    
    // Montrer l'indicateur de snap si différence significative
    if (Math.abs(constrainedPixels - snappedPixels) > 3) {
      showLoopSnapIndicator.value = true
      loopSnapIndicatorTime.value = snappedTime
    } else {
      showLoopSnapIndicator.value = false
    }
    
    finalTime = Math.max(0, snappedTime)
  } else {
    showLoopSnapIndicator.value = false
  }
  
  // Contraintes pour éviter l'inversion des drapeaux
  if (draggedLoopType.value === 'start') {
    const loopEnd = projectStore.userPreferences.playback.loopEnd
    finalTime = Math.min(finalTime, loopEnd - 0.1) // Au moins 0.1s de différence
  } else {
    const loopStart = projectStore.userPreferences.playback.loopStart
    finalTime = Math.max(finalTime, loopStart + 0.1) // Au moins 0.1s de différence
  }
  
  // Mettre à jour le store en temps réel
  if (draggedLoopType.value === 'start') {
    projectStore.updateUserPreferences('playback', { loopStart: finalTime })
  } else {
    projectStore.updateUserPreferences('playback', { loopEnd: finalTime })
  }
  
  console.log(`🎯 Drag ${draggedLoopType.value}: ${finalTime.toFixed(3)}s`)
}

// Arrêter le drag du drapeau de loop
const stopLoopDrag = (event) => {
  if (!isDraggingLoopFlag.value) return
  
  console.log(`✅ Fin drag drapeau ${draggedLoopType.value}`)
  
  // CORRECTION: Empêcher la propagation lors de l'arrêt
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }
  
  // Nettoyer l'état
  isDraggingLoopFlag.value = false
  draggedLoopType.value = null
  loopDragStartX.value = 0
  loopDragStartTime.value = 0
  showLoopSnapIndicator.value = false
  loopSnapIndicatorTime.value = 0
  
  // Retirer les gestionnaires globaux
  document.removeEventListener('mousemove', onLoopDrag)
  document.removeEventListener('mouseup', stopLoopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Nettoyage
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onGlobalMouseMove)
  document.removeEventListener('mouseup', onGlobalMouseUp)
  
  // Nettoyer les gestionnaires de loop si nécessaire
  if (isDraggingLoopFlag.value) {
    document.removeEventListener('mousemove', onLoopDrag)
    document.removeEventListener('mouseup', stopLoopDrag)
  }
  
  document.body.style.cursor = ''
})

// Exposition sécurisée des données
defineExpose({
  measuresWithSignatures: measures,
  totalWidth,
  getAllMeasureLines: timeSignatureComposable?.getAllMeasureLines || computed(() => []),
  getAllBeatLines: timeSignatureComposable?.getAllBeatLines || computed(() => [])
})

provide('timeToPixel', timeToPixel)
provide('totalWidth', totalWidth)
provide('pixelsPerSecond', pixelsPerSecond)
</script>

<style scoped>
.timeline {
  height: 100%;
  position: relative;
  background: linear-gradient(to bottom, #fafafa 0%, #f0f0f0 100%);
  min-width: 100%;
  border-bottom: 1px solid #ddd;
  user-select: none; /* Empêcher la sélection de texte */
}

.timeline-ruler {
  height: 100%;
  position: relative;
  overflow: visible;
  /* Assurer que les événements remontent à la timeline */
  pointer-events: none;
}

.timeline-ruler > * {
  pointer-events: none;
}

/* Styles pour les fonds de mesures selon leur signature */
.measure-background {
  opacity: 0.1;
}

.timeline-grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: 0.6;
  pointer-events: none;
}

/* Curseur pendant le glissement */
.timeline:active {
  cursor: ns-resize;
}

/* ===================== STYLES POUR LES DRAPEAUX DE LOOP ===================== */

/* Zone de loop (rectangle de fond) */
.loop-region {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--loop-region-bg, rgba(76, 175, 80, 0.15));
  border: 1px solid var(--loop-region-border, rgba(76, 175, 80, 0.4));
  border-top: none;
  border-bottom: none;
  z-index: 2;
  pointer-events: none;
}

/* Drapeaux de loop */
.loop-flag {
  position: absolute;
  top: 75%;
  transform: translateY(-50%);
  height: 12px;
  width: 16px;
  z-index: 100;
  cursor: ew-resize;
  user-select: none;
  pointer-events: auto;
}

.loop-flag:hover {
  transform: translateY(-50%) scale(1.1);
}

.loop-flag.dragging {
  z-index: 150;
  transform: translateY(-50%) scale(1.2);
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
}

/* Mât du drapeau - maintenant invisible */
.flag-pole {
  display: none;
}

/* Icône du drapeau */
.flag-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 8px;
  color: var(--loop-flag-icon, #4CAF50);
  font-weight: bold;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid var(--loop-flag-icon, #4CAF50);
  min-width: 10px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* Couleurs spécifiques pour chaque drapeau */
.loop-start-flag .flag-icon {
  color: var(--loop-start-color, #4CAF50);
  border-color: var(--loop-start-color, #4CAF50);
}

.loop-end-flag .flag-icon {
  color: var(--loop-end-color, #F44336);
  border-color: var(--loop-end-color, #F44336);
}


/* Indicateur de snap pour les drapeaux de loop */
.loop-snap-indicator {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 20;
  pointer-events: none;
}

.loop-snap-indicator .snap-line {
  width: 2px;
  height: 100%;
  background: var(--loop-snap-color, #FF9800);
  border-radius: 1px;
  opacity: 0.9;
  box-shadow: 0 0 4px rgba(255, 152, 0, 0.6);
  animation: loopSnapPulse 0.3s ease-in-out;
}

@keyframes loopSnapPulse {
  0% { 
    opacity: 0.5; 
    transform: scaleX(0.5);
  }
  50% { 
    opacity: 1; 
    transform: scaleX(1.5);
  }
  100% { 
    opacity: 0.9; 
    transform: scaleX(1);
  }
}

/* Variables CSS pour le thème */
:root {
  --loop-region-bg: rgba(76, 175, 80, 0.15);
  --loop-region-border: rgba(76, 175, 80, 0.4);
  --loop-flag-pole: #4CAF50;
  --loop-flag-icon: #4CAF50;
  --loop-start-color: #4CAF50;
  --loop-end-color: #F44336;
  --loop-snap-color: #FF9800;
  --timeline-bg: #fafafa;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --loop-region-bg: rgba(76, 175, 80, 0.2);
    --loop-region-border: rgba(76, 175, 80, 0.5);
    --loop-flag-pole: #66BB6A;
    --loop-flag-icon: #66BB6A;
    --loop-start-color: #66BB6A;
    --loop-end-color: #EF5350;
    --loop-snap-color: #FFB74D;
    --timeline-bg: #1a2332;
  }
}
</style>