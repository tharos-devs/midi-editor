// composables/useArticulations.js
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'

export function useArticulations() {
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

  // Calculer les articulations avec leurs positions et largeurs en pixels pour la piste sélectionnée
  const articulationsWithPositions = computed(() => {
    const selectedTrackId = midiStore.selectedTrack
    if (selectedTrackId === null || selectedTrackId === undefined) return []

    const trackArticulations = projectStore.getArticulationsByTrack(selectedTrackId)
    return trackArticulations.map(articulation => {
      // Durée par défaut d'une croche si pas de durée définie - utiliser le tempo du projet
      const tempo = midiStore.getCurrentTempo || 120
      const eighthNoteDuration = (60 / tempo) / 2
      const duration = articulation.duration || eighthNoteDuration
      const pixelWidth = Math.max(8, timeToPixels(duration)) // Largeur minimum de 8px
      
      return {
        ...articulation,
        pixelPosition: timeToPixels(articulation.time),
        pixelWidth: pixelWidth
      }
    })
  })

  // Calculer la largeur totale basée sur la durée du projet ou un minimum
  const totalWidth = computed(() => {
    const duration = midiStore.duration || 120 // 2 minutes par défaut
    const minWidth = 2000 // Largeur minimale
    const calculatedWidth = timeToPixels(duration)
    return Math.max(minWidth, calculatedWidth)
  })

  // Trouver le marqueur le plus proche d'une position en pixels
  const getArticulationAtPixel = (pixelX, tolerance = 10) => {
    return articulationsWithPositions.value.find(articulation => 
      Math.abs(articulation.pixelPosition - pixelX) <= tolerance
    )
  }

  return {
    // État
    articulations: computed(() => {
      const selectedTrackId = midiStore.selectedTrack
      return (selectedTrackId !== null && selectedTrackId !== undefined) ? projectStore.getArticulationsByTrack(selectedTrackId) : []
    }),
    articulationsWithPositions,
    totalWidth,
    
    // Conversions
    timeToPixels,
    pixelsToTime,
    
    // Utilitaires
    getArticulationAtPixel,
    
    // Actions du store (wrapper pour inclure la piste)
    addArticulation: (time, name, color) => {
      const result = projectStore.addArticulation(time, name, midiStore.selectedTrack, color)
      console.log('🎯 useArticulations addArticulation:', { time, name, trackId: midiStore.selectedTrack, color, result })
      return result
    },
    removeArticulation: projectStore.removeArticulation,
    updateArticulation: projectStore.updateArticulation
  }
}