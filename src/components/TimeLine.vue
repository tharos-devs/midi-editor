<template>
  <div 
    class="timeline" 
    :style="{ width: totalWidth + 'px' }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @wheel="onWheel"
  >
    <div class="timeline-ruler">
      <!-- Utilisation du GridRenderer -->
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
</template>

<script setup>
import { computed, ref, reactive, onBeforeUnmount, nextTick } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useUIStore } from '@/stores/ui'
import GridRenderer from '@/components/GridRenderer.vue'

// Utiliser le composable de signature rythmique et le store UI
const timeSignatureComposable = useTimeSignature()
const uiStore = useUIStore()

// États pour le zoom par glissement
const isDragging = ref(false)
const startY = ref(0)
const startZoomPercent = ref(50)
const currentZoomPercent = ref(50)
const mousePosition = ref({ x: 0, y: 0 })
const dragStartMouseX = ref(0) // Position X de la souris au début du drag

const measuresWithSignatures = computed(() => {
  return timeSignatureComposable?.measuresWithSignatures?.value || []
})

const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

const measures = computed(() => {
  return timeSignatureComposable?.measuresWithSignatures?.value || []
})

// Gestion de la molette - uniquement pour deltaY (vertical) avec zoom focal
const onWheel = (event) => {
  // Empêcher le scroll par défaut
  event.preventDefault()
  
  // Vérifier qu'il s'agit bien d'un mouvement vertical
  // Si deltaX est plus important que deltaY, on ignore (mouvement horizontal)
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return
  }
  
  // Récupérer la position de la souris relative à la timeline
  const rect = event.currentTarget.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  
  // Calculer la position relative (0 à 1) dans la timeline
  const relativePosition = mouseX / totalWidth.value
  
  // Sauvegarder la largeur actuelle avant le zoom
  const oldWidth = totalWidth.value
  
  // Déterminer la direction (deltaY positif = scroll vers le bas = zoom out)
  const delta = event.deltaY
  const zoomStep = 0.1 // Ajustez cette valeur pour modifier la vitesse de zoom
  
  if (delta < 0) {
    // Scroll vers le haut = zoom in
    uiStore.zoomIn('horizontal')
    currentZoomPercent.value = Math.min(100, currentZoomPercent.value + zoomStep)
  } else {
    // Scroll vers le bas = zoom out
    uiStore.zoomOut('horizontal')
    currentZoomPercent.value = Math.max(0, currentZoomPercent.value - zoomStep)
  }
  
  // Attendre le prochain tick pour que la nouvelle largeur soit calculée
  nextTick(() => {
    // Calculer la nouvelle position en pixels où devrait se trouver le point focal
    const newMouseX = relativePosition * totalWidth.value
    
    // Calculer le décalage nécessaire pour maintenir le point sous la souris
    const offset = newMouseX - mouseX
    
    // Faire défiler la timeline pour compenser (si le parent a un scroll)
    const timelineParent = event.currentTarget.parentElement
    if (timelineParent && timelineParent.scrollLeft !== undefined) {
      timelineParent.scrollLeft += offset
    }
  })
}

// Gestion des événements de souris avec zoom focal
const onMouseDown = (event) => {
  // Empêcher la sélection de texte pendant le glissement
  event.preventDefault()
  
  isDragging.value = true
  startY.value = event.clientY
  startZoomPercent.value = currentZoomPercent.value
  
  // Sauvegarder la position X de la souris relative à la timeline
  const rect = event.currentTarget.getBoundingClientRect()
  dragStartMouseX.value = event.clientX - rect.left
  
  // Ajouter les événements globaux
  document.addEventListener('mousemove', onGlobalMouseMove)
  document.addEventListener('mouseup', onGlobalMouseUp)
  
  // Changer le curseur
  document.body.style.cursor = 'ns-resize'
}

const onMouseMove = (event) => {
  // Ce handler n'est plus nécessaire pour le tooltip mais peut servir à d'autres fins
}

const onGlobalMouseMove = (event) => {
  if (!isDragging.value) return
  
  // Calculer la différence verticale
  const deltaY = startY.value - event.clientY // Inversé : haut = zoom in
  const sensitivity = 0.2 // Ajustez cette valeur pour modifier la sensibilité
  
  // Calculer le nouveau pourcentage de zoom (limité entre 0 et 100)
  const newZoomPercent = Math.max(0, Math.min(100, startZoomPercent.value + (deltaY * sensitivity)))
  
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

const onMouseUp = () => {
  finishDragging()
}

const onMouseLeave = () => {
  if (isDragging.value) {
    finishDragging()
  }
}

const onGlobalMouseUp = () => {
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

// Nettoyage
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onGlobalMouseMove)
  document.removeEventListener('mouseup', onGlobalMouseUp)
  document.body.style.cursor = ''
})

// Exposition sécurisée des données
defineExpose({
  measuresWithSignatures: measures,
  totalWidth,
  getAllMeasureLines: timeSignatureComposable?.getAllMeasureLines || computed(() => []),
  getAllBeatLines: timeSignatureComposable?.getAllBeatLines || computed(() => [])
})
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
}

/* Styles pour les fonds de mesures selon leur signature */
.measure-background {
  opacity: 0.1;
}

/* Curseur pendant le glissement */
.timeline:active {
  cursor: ns-resize;
}
</style>