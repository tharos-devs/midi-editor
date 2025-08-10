// composables/useMarkers.js
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'

export function useMarkers() {
  const projectStore = useProjectStore()
  const uiStore = useUIStore()
  const midiStore = useMidiStore()

  // Configuration par défaut
  const BASE_PIXELS_PER_QUARTER = 40

  // Calculer les pixels par noire avec le zoom
  const PIXELS_PER_QUARTER = computed(() => {
    const basePixels = BASE_PIXELS_PER_QUARTER * uiStore.horizontalZoom
    return Math.round(basePixels * 100) / 100 // Précision à 2 décimales
  })

  // Convertir temps (secondes) en pixels
  const timeToPixels = (time) => {
    if (!midiStore.isLoaded) return 0
    const ppq = midiStore.midiInfo.ppq || 480
    const tempo = midiStore.getCurrentTempo || 120
    // Convertir secondes -> ticks -> quarters -> pixels
    const ticks = (time * tempo * ppq) / 60
    const quarters = ticks / ppq
    return quarters * PIXELS_PER_QUARTER.value
  }

  // Convertir pixels en temps (secondes)
  const pixelsToTime = (pixels) => {
    if (!midiStore.isLoaded) return 0
    const ppq = midiStore.midiInfo.ppq || 480
    const tempo = midiStore.getCurrentTempo || 120
    // Convertir pixels -> quarters -> ticks -> secondes
    const quarters = pixels / PIXELS_PER_QUARTER.value
    const ticks = quarters * ppq
    return (ticks / ppq) * (60 / tempo)
  }

  // Calculer les marqueurs avec leurs positions en pixels
  const markersWithPositions = computed(() => {
    return projectStore.markers.map(marker => ({
      ...marker,
      pixelPosition: timeToPixels(marker.time)
    }))
  })

  // Calculer la largeur totale basée sur la durée du projet ou un minimum
  const totalWidth = computed(() => {
    const duration = midiStore.duration || 120 // 2 minutes par défaut
    const minWidth = 2000 // Largeur minimale
    const calculatedWidth = timeToPixels(duration)
    return Math.max(minWidth, calculatedWidth)
  })

  // Trouver le marqueur le plus proche d'une position en pixels
  const getMarkerAtPixel = (pixelX, tolerance = 10) => {
    return markersWithPositions.value.find(marker => 
      Math.abs(marker.pixelPosition - pixelX) <= tolerance
    )
  }

  return {
    // État
    markers: computed(() => projectStore.markers),
    markersWithPositions,
    totalWidth,
    
    // Conversions
    timeToPixels,
    pixelsToTime,
    
    // Utilitaires
    getMarkerAtPixel,
    
    // Actions du store
    addMarker: projectStore.addMarker,
    removeMarker: projectStore.removeMarker,
    updateMarker: projectStore.updateMarker
  }
}