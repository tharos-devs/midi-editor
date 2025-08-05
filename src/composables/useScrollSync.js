// composables/useScrollSync.js - Synchronisation du scroll entre composants
import { ref, onMounted, onUnmounted } from 'vue'

export function useScrollSync() {
  // État du scroll
  const scrollLeft = ref(0)
  const isScrolling = ref(false)
  const scrollSource = ref('none') // 'manual', 'auto-scroll', ou 'sync'
  
  // Références aux conteneurs
  const containerRef = ref(null)
  
  // Fonction pour synchroniser le scroll d'un conteneur
  function syncScroll(newScrollLeft, source = 'sync') {
    if (!containerRef.value || isScrolling.value) return
    
    // Éviter les boucles infinies
    if (source === 'sync' && Math.abs(containerRef.value.scrollLeft - newScrollLeft) < 1) {
      return
    }
    
    isScrolling.value = true
    scrollSource.value = source
    
    // Appliquer le scroll
    containerRef.value.scrollLeft = newScrollLeft
    scrollLeft.value = newScrollLeft
    
    // Débloquer après un court délai
    setTimeout(() => {
      isScrolling.value = false
      scrollSource.value = 'none'
    }, 50)
  }
  
  // Fonction pour gérer le scroll manuel
  function handleScroll(event) {
    if (isScrolling.value && scrollSource.value === 'sync') return
    
    const newScrollLeft = event.target.scrollLeft
    scrollLeft.value = newScrollLeft
    
    // Émettre l'événement pour les autres composants
    return {
      scrollLeft: newScrollLeft,
      source: 'manual'
    }
  }
  
  // Fonction pour obtenir la position de scroll actuelle
  function getScrollLeft() {
    return containerRef.value ? containerRef.value.scrollLeft : 0
  }
  
  // Fonction pour scroller vers une position spécifique
  function scrollTo(position, behavior = 'instant') {
    if (!containerRef.value) return
    
    containerRef.value.scrollTo({
      left: position,
      behavior
    })
  }
  
  return {
    // État
    scrollLeft,
    isScrolling,
    scrollSource,
    
    // Références
    containerRef,
    
    // Méthodes
    syncScroll,
    handleScroll,
    getScrollLeft,
    scrollTo
  }
}