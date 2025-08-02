import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useTimeSignature } from './useTimeSignature'

export function useSnapLogic() {
  const uiStore = useUIStore()
  const {
    timeToPixelsWithSignatures,
    pixelsToTimeWithSignatures,
    measuresWithSignatures,
    PIXELS_PER_QUARTER
  } = useTimeSignature()

  // Conversion des valeurs de snap en subdivision
  const getSnapSubdivision = (snapValue) => {
    if (typeof snapValue === 'string' && snapValue.endsWith('T')) {
      // Triolets: 1/4T = division par 4 puis par 3
      const baseValue = parseInt(snapValue.replace('T', ''))
      return baseValue * (3/2) // Facteur de triolet
    }
    return parseInt(snapValue) || 4
  }

  // Calcul de la durée de snap en temps selon la mesure
  const getSnapDurationInTime = (time, snapDivision) => {
    const measures = measuresWithSignatures.value
    let targetMeasure = null
    
    // Trouver la mesure correspondante
    for (const measure of measures) {
      if (time >= measure.startTime && time < measure.endTime) {
        targetMeasure = measure
        break
      }
    }
    
    if (!targetMeasure) {
      // Fallback sur la dernière mesure
      targetMeasure = measures[measures.length - 1]
      if (!targetMeasure) {
        // Fallback absolu: 4/4 à 120 BPM
        const beatDuration = 60 / 120
        return beatDuration / snapDivision
      }
    }
    
    // Calculer la durée d'un beat dans cette mesure
    const measureDuration = targetMeasure.endTime - targetMeasure.startTime
    const beatDuration = measureDuration / targetMeasure.beatsCount
    
    // Gérer les triolets
    if (typeof uiStore.snapDivision === 'string' && uiStore.snapDivision.endsWith('T')) {
      const baseValue = parseInt(uiStore.snapDivision.replace('T', ''))
      // Pour les triolets: diviser le beat par la valeur de base, puis diviser par 3
      return (beatDuration / baseValue) * (2/3)
    }
    
    // Division normale
    return beatDuration / snapDivision
  }

  // Snap d'un temps à la grille
  const snapTimeToGrid = (time) => {
    if (!uiStore.snapToGrid) return time
    
    const snapDivision = getSnapSubdivision(uiStore.snapDivision)
    const snapDuration = getSnapDurationInTime(time, snapDivision)
    
    const measures = measuresWithSignatures.value
    let targetMeasure = null
    
    // Trouver la mesure correspondante
    for (const measure of measures) {
      if (time >= measure.startTime && time < measure.endTime) {
        targetMeasure = measure
        break
      }
    }
    
    if (!targetMeasure) return time
    
    // Calculer la position relative dans la mesure
    const timeInMeasure = time - targetMeasure.startTime
    
    // Snapper à la subdivision la plus proche
    const snapIndex = Math.round(timeInMeasure / snapDuration)
    const snappedTime = targetMeasure.startTime + (snapIndex * snapDuration)
    
    // S'assurer que le temps reste dans les limites de la mesure
    return Math.max(
      targetMeasure.startTime,
      Math.min(snappedTime, targetMeasure.endTime - snapDuration)
    )
  }

  // Snap de pixels en tenant compte du zoom et des mesures
  const snapPixelsToGrid = (pixels) => {
    if (!uiStore.snapToGrid) return pixels
    
    // Convertir en temps, snapper, puis reconvertir en pixels
    const time = pixelsToTimeWithSignatures(pixels)
    const snappedTime = snapTimeToGrid(time)
    return timeToPixelsWithSignatures(snappedTime)
  }

  // Calcul de la taille de snap en pixels à une position donnée
  const getSnapSizeInPixels = computed(() => {
    if (!uiStore.snapToGrid) return 1
    
    const snapDivision = getSnapSubdivision(uiStore.snapDivision)
    
    // Utiliser le zoom horizontal pour calculer la taille de base
    const basePixelsPerQuarter = PIXELS_PER_QUARTER.value
    
    if (typeof uiStore.snapDivision === 'string' && uiStore.snapDivision.endsWith('T')) {
      // Triolets: la taille est différente
      const baseValue = parseInt(uiStore.snapDivision.replace('T', ''))
      return (basePixelsPerQuarter / baseValue) * (2/3)
    }
    
    return basePixelsPerQuarter / snapDivision
  })

  // Fonction pour obtenir la durée minimale d'une note selon le snap
  const getMinNoteDuration = (time) => {
    if (!uiStore.snapToGrid) {
      // Mode libre: durée minimale très petite
      return 0.001
    }
    
    const snapDivision = getSnapSubdivision(uiStore.snapDivision)
    return getSnapDurationInTime(time, snapDivision)
  }

  // Snap de durée de note
  const snapNoteDuration = (startTime, duration) => {
    if (!uiStore.snapToGrid) return duration
    
    const endTime = startTime + duration
    const snappedEndTime = snapTimeToGrid(endTime)
    const snappedDuration = snappedEndTime - startTime
    
    // S'assurer que la durée n'est pas inférieure au minimum
    const minDuration = getMinNoteDuration(startTime)
    return Math.max(snappedDuration, minDuration)
  }

  return {
    snapTimeToGrid,
    snapPixelsToGrid,
    snapNoteDuration,
    getSnapSizeInPixels,
    getMinNoteDuration,
    getSnapDurationInTime
  }
}