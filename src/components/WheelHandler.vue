<!-- WheelHandler.vue - Gestion centralisée des événements wheel -->
<template>
  <div 
    class="wheel-handler"
    @wheel="handleWheel"
    ref="wheelContainer"
  >
    <!-- Contenu transparent qui capture les événements wheel -->
    <slot />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useUIStore } from '@/stores/ui'

const wheelContainer = ref(null)
const uiStore = useUIStore()

const emit = defineEmits(['wheel-scroll'])

function handleWheel(event) {
  const deltaX = event.deltaX
  const deltaY = event.deltaY
  
  // Déterminer si c'est un scroll horizontal ou vertical
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
    
    console.log('🖱️ WheelHandler - Scroll horizontal global:', deltaX)
  } else {
    // ✅ SCROLL VERTICAL - Laisser les composants gérer eux-mêmes
    
    if (isPianoGrid) {
      // PianoGrid : Laisser passer le scroll vertical naturel (navigation notes)
      console.log('🎼 WheelHandler - PianoGrid scroll vertical autorisé')
      return // NE PAS empêcher - laisser le scroll naturel
    } else if (isTimeLine) {
      // TimeLine : Laisser gérer son zoom focal
      console.log('📏 WheelHandler - TimeLine zoom focal autorisé')
      return // NE PAS empêcher - laisser TimeLine gérer
    } else {
      // Autres composants : Pas de comportement vertical spécial
      console.log('🚫 WheelHandler - Scroll vertical bloqué sur autres composants')
      event.preventDefault() // Empêcher le scroll sur les autres composants
    }
  }
}
</script>

<style scoped>
.wheel-handler {
  position: relative;
  width: 100%;
  height: 100%;
  /* Transparent, ne change pas l'apparence */
  background: transparent;
  /* Capture les événements wheel */
  pointer-events: auto;
}

/* Le contenu à l'intérieur garde ses événements normaux */
.wheel-handler > * {
  pointer-events: auto;
}
</style>