// stores/playbackMarker.js - Gestion de l'indicateur de position P
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useTimeSignature } from '@/composables/useTimeSignature'

export const usePlaybackMarkerStore = defineStore('playbackMarker', () => {
  // État
  const markerTime = ref(null) // Position en secondes du marqueur P, null = pas de marqueur
  
  // Récupérer la fonction de conversion directement
  const { timeToPixelsWithSignatures } = useTimeSignature()
  
  // Computed pour la position en pixels
  const markerPixelPosition = computed(() => {
    if (markerTime.value === null || !timeToPixelsWithSignatures) {
      return null
    }
    return Math.max(0, timeToPixelsWithSignatures(markerTime.value))
  })
  
  // Computed pour savoir si le marqueur est actif
  const hasMarker = computed(() => markerTime.value !== null)
  
  // Actions
  function setMarker(time) {
    markerTime.value = time
    console.log('🅿️ Marqueur P placé à:', time.toFixed(2) + 's', '→', markerPixelPosition.value?.toFixed(1) + 'px')
  }
  
  function clearMarker() {
    console.log('🅿️ Marqueur P supprimé')
    markerTime.value = null
  }
  
  function toggleMarker(currentTime) {
    if (hasMarker.value) {
      clearMarker()
    } else {
      setMarker(currentTime)
    }
  }
  
  // Formater le temps du marqueur pour affichage
  function formatMarkerTime() {
    if (!hasMarker.value) return ''
    const time = markerTime.value
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    const ms = Math.floor((time % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }
  
  return {
    // État
    markerTime,
    markerPixelPosition,
    hasMarker,
    
    // Actions
    setMarker,
    clearMarker,
    toggleMarker,
    formatMarkerTime
  }
})