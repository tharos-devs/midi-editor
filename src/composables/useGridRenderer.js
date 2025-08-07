// useGridRenderer.js
import { computed } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useUIStore } from '@/stores/ui'

/**
 * Composable générique pour le rendu des grilles temporelles
 * Centralise la logique de création des lignes verticales (mesures et beats)
 */
export function useGridRenderer(options = {}) {
  const {
    // Options de configuration
    showMeasureLines = true,
    showBeatLines = true,
    showSubdivisionLines = true,
    showSignatureIndicators = false,
    showMeasureNumbers = false,
    showBeatLabels = false,
    showSubdivisionLabels = false,
    // Hauteur du conteneur (pour les lignes de mesure et de beat)
    // Si non spécifié, utilise 100% de la hauteur du viewport
    // Hauteur du conteneur (pour les lignes verticales)
    containerHeight = null,
    // Classes CSS personnalisées
    measureLineClass = 'measure-line',
    beatLineClass = 'beat-line',
    subdivisionLineClass = 'subdivision-line',
    signatureChangeClass = 'signature-change',
    // Z-index pour les couches
    measureZIndex = 4,
    beatZIndex = 3,
    subdivisionZIndex = 1,
    signatureZIndex = 5
  } = options

  const timeSignatureComposable = useTimeSignature()
  const uiStore = useUIStore()

  // Récupérer les données des mesures
  const measures = computed(() => {
    return timeSignatureComposable?.measuresWithSignatures?.value || []
  })

  const totalWidth = computed(() => {
    return timeSignatureComposable?.totalWidth?.value || 800
  })

  // Fonction pour calculer le nombre de subdivisions selon snapDivision
  const getSubdivisionCount = computed(() => {
    if (!uiStore.snapToGrid || !showSubdivisionLines) {
      return 0
    }

    const snapValue = uiStore.snapDivision

    // Ne pas afficher les subdivisions si la division est trop grosse (1/1, 1/2)
    if (snapValue === '1' || snapValue === '2') {
      return 0
    }

    let subdivisionCount = 0

    if (typeof snapValue === 'string' && snapValue.endsWith('T')) {
      // Triolets: pour afficher les subdivisions de triolets
      const baseValue = parseInt(snapValue.replace('T', ''))
      if (baseValue < 4) {
        return 0
      }
      // Pour les triolets, on divise chaque beat en 3 parties égales multipliées par la base
      // 1/4T -> 3 subdivisions par beat (triolet de noires)
      // 1/8T -> 6 subdivisions par beat (triolet de croches)
      subdivisionCount = (baseValue / 4) * 3
    } else {
      const numValue = parseInt(snapValue)
      if (numValue < 4) {
        return 0
      }
      // Division normale: 1/4 -> 4 subdivisions, 1/8 -> 8, 1/16 -> 16, etc.
      subdivisionCount = numValue
    }

    return subdivisionCount
  })

  /**
   * Génère les lignes de subdivisions
   */
  const subdivisionLines = computed(() => {
    if (!showSubdivisionLines) {
      return []
    }

    const subdivisionCount = getSubdivisionCount.value

    if (subdivisionCount === 0) {
      return []
    }

    const subdivisions = []
    const isTriolet = typeof uiStore.snapDivision === 'string' && uiStore.snapDivision.endsWith('T')

    measures.value.forEach(measure => {


      for (let beatIndex = 0; beatIndex < measure.beatsCount; beatIndex++) {
        const beatStartPixel = measure.startPixel + beatIndex * measure.beatWidth
        const subdivisionWidth = measure.beatWidth / subdivisionCount

        // Créer les subdivisions pour ce beat (exclure la première qui coïncide avec le beat)
        for (let subIndex = 1; subIndex < subdivisionCount; subIndex++) {
          const subdivisionPixel = beatStartPixel + subIndex * subdivisionWidth

          // Pour les triolets, marquer chaque subdivision comme "forte" 
          // Pour les divisions normales, marquer chaque 4ème subdivision comme "forte"
          let isStrongSubdivision = false
          if (isTriolet) {
            // Pour les triolets, pas de subdivision "forte" spéciale
            isStrongSubdivision = false
          } else {
            // Pour les divisions normales, chaque 4ème est forte
            isStrongSubdivision = subIndex % 4 === 0
          }

          subdivisions.push({
            id: `subdivision-${measure.number}-${beatIndex + 1}-${subIndex}`,
            type: 'subdivision',
            measure: measure.number,
            beat: beatIndex + 1,
            subdivision: subIndex,
            isStrong: isStrongSubdivision,
            isTriolet: isTriolet,
            style: {
              position: 'absolute',
              left: subdivisionPixel + 'px',
              top: '0px',
              height: containerHeight ? containerHeight + 'px' : '100%',
              minHeight: containerHeight ? containerHeight + 'px' : '100vh',
              zIndex: subdivisionZIndex
            },
            classes: [
              subdivisionLineClass,
              isStrongSubdivision ? 'strong-subdivision' : 'weak-subdivision',
              isTriolet ? 'triplet-subdivision' : 'normal-subdivision'
            ],
            tooltip: isTriolet
              ? `Mesure ${measure.number}, Temps ${beatIndex + 1}, Triolet ${subIndex}`
              : `Mesure ${measure.number}, Temps ${beatIndex + 1}, Subdivision ${subIndex}`,
            data: {
              measure,
              beatIndex: beatIndex + 1,
              subdivisionIndex: subIndex,
              absolutePixel: subdivisionPixel,
              isStrong: isStrongSubdivision,
              isTriolet: isTriolet
            }
          })
        }
      }
    })

    return subdivisions
  })

  /**
   * Génère les lignes de mesures avec leurs propriétés de style
   */
  const measureLines = computed(() => {
    if (!showMeasureLines) return []

    return measures.value.map(measure => ({
      id: `measure-${measure.number}`,
      type: 'measure',
      measure: measure.number,
      isSignatureChange: measure.signatureChange,
      timeSignature: measure.timeSignature,
      style: {
        position: 'absolute',
        left: measure.startPixel + 'px',
        top: '0px',
        height: containerHeight ? containerHeight + 'px' : '100%',
        minHeight: containerHeight ? containerHeight + 'px' : '100vh',
        zIndex: measure.signatureChange ? signatureZIndex : measureZIndex
      },
      classes: [
        measureLineClass,
        measure.signatureChange ? signatureChangeClass : null
      ].filter(Boolean),
      tooltip: measure.signatureChange
        ? `Mesure ${measure.number} - ${measure.timeSignature.numerator}/${measure.timeSignature.denominator}`
        : `Mesure ${measure.number}`,
      data: measure
    }))
  })

  /**
   * Génère les lignes de beats (subdivisions) avec leurs propriétés de style
   */
  const beatLines = computed(() => {
    if (!showBeatLines) return []

    const beats = []

    measures.value.forEach(measure => {
      // Créer les beats (en excluant le premier beat puisqu'il coïncide avec la ligne de mesure)
      for (let beatIndex = 1; beatIndex < measure.beatsCount; beatIndex++) {
        // ✅ CORRECTION: Utiliser la même logique que getAllBeatLines dans useTimeSignature
        const measureDuration = measure.endTime - measure.startTime
        const beatRatio = beatIndex / measure.beatsCount  // beatIndex + 1 - 1 = beatIndex
        const beatTime = measure.startTime + (beatRatio * measureDuration)
        
        // ✅ Calculer la position avec timeToPixelsWithSignatures comme les notes
        const { timeToPixelsWithSignatures } = timeSignatureComposable || {}
        let beatPosition = measure.startPixel + beatIndex * measure.beatWidth // fallback géométrique
        
        if (timeToPixelsWithSignatures) {
          try {
            beatPosition = timeToPixelsWithSignatures(beatTime)
          } catch (e) {
            console.warn('Erreur timeToPixelsWithSignatures pour beat:', e)
            // Garder la position géométrique comme fallback
          }
        }
        
        // DEBUG: Comparer l'ancienne vs nouvelle méthode pour mesure 1
        if (measure.number === 1 && beatIndex === 1) {
          const oldPosition = measure.startPixel + beatIndex * measure.beatWidth
          console.log(`🔧 CORRECTION BEAT POSITION - Beat ${beatIndex + 1} mesure ${measure.number}:`, {
            beatTime: beatTime.toFixed(3) + 's',
            anciennePosition: oldPosition.toFixed(1) + 'px',
            nouvellePosition: beatPosition.toFixed(1) + 'px',
            correction: (beatPosition - oldPosition).toFixed(1) + 'px'
          })
        }
        beats.push({
          id: `beat-${measure.number}-${beatIndex + 1}`,
          type: 'beat',
          measure: measure.number,
          beat: beatIndex + 1,
          style: {
            position: 'absolute',
            left: beatPosition + 'px', // ✅ CORRECTION: Utiliser beatPosition calculé avec timeToPixelsWithSignatures
            top: '0px',
            height: containerHeight ? containerHeight + 'px' : '100%',
            minHeight: containerHeight ? containerHeight + 'px' : '100vh',
            zIndex: beatZIndex
          },
          classes: [beatLineClass],
          tooltip: `Mesure ${measure.number}, Temps ${beatIndex + 1}`,
          data: {
            measure,
            beatIndex: beatIndex + 1,
            absolutePixel: beatPosition, // ✅ CORRECTION: Position corrigée
            beatTime: beatTime // Ajouter le temps du beat pour référence
          }
        })
      }
    })

    return beats
  })

  /**
   * Combine toutes les lignes dans l'ordre de rendu
   */
  const allGridLines = computed(() => {
    return [
      ...subdivisionLines.value, // Les subdivisions en arrière-plan
      ...beatLines.value,        // Les beats au milieu
      ...measureLines.value      // Les mesures au premier plan
    ].sort((a, b) => a.style.zIndex - b.style.zIndex)
  })

  /**
   * Indicateurs de signature rythmique
   */
  const signatureIndicators = computed(() => {
    if (!showSignatureIndicators) return []

    return measures.value
      .filter(measure => measure.signatureChange)
      .map(measure => ({
        id: `signature-${measure.number}`,
        type: 'signature',
        measure: measure.number,
        numerator: measure.timeSignature.numerator,
        denominator: measure.timeSignature.denominator,
        style: {
          position: 'absolute',
          left: (measure.startPixel + 3) + 'px',
          top: '-20px',
          zIndex: 10
        },
        text: `${measure.timeSignature.numerator}/${measure.timeSignature.denominator}`,
        data: measure
      }))
  })

  /**
   * Numéros de mesures
   */
  const measureNumbers = computed(() => {
    if (!showMeasureNumbers) return []

    return measures.value.map(measure => ({
      id: `number-${measure.number}`,
      type: 'number',
      measure: measure.number,
      style: {
        position: 'absolute',
        left: (measure.startPixel + 4) + 'px',
        top: '4px',
        zIndex: 10
      },
      text: measure.number.toString(),
      data: measure
    }))
  })

  /**
   * Labels des beats
   */
  const beatLabels = computed(() => {
    if (!showBeatLabels) {
      return []
    }

    const labels = []

    measures.value.forEach(measure => {
      // Créer les labels pour tous les beats sauf le premier
      for (let beatIndex = 1; beatIndex < measure.beatsCount; beatIndex++) {
        const beatPixel = measure.startPixel + beatIndex * measure.beatWidth
        
        labels.push({
          id: `beat-label-${measure.number}-${beatIndex + 1}`,
          type: 'beat-label',
          measure: measure.number,
          beat: beatIndex + 1,
          style: {
            position: 'absolute',
            left: (beatPixel + 2) + 'px',
            top: '10px',
            zIndex: 5,
            fontSize: '10px'
          },
          text: `${beatIndex + 1}`, // Format simplifié : juste 2, 3, 4
          data: {
            measure,
            beatIndex: beatIndex + 1,
            absolutePixel: beatPixel
          }
        })
      }
    })

    return labels
  })

  /**
   * Labels des subdivisions
   */
  const subdivisionLabels = computed(() => {
    if (!showSubdivisionLabels) return []

    const labels = []
    
    subdivisionLines.value.forEach(subdivision => {
      const subdivisionPixel = parseFloat(subdivision.style.left)
      
      labels.push({
        id: `subdivision-label-${subdivision.measure}-${subdivision.beat}-${subdivision.subdivision}`,
        type: 'subdivision-label',
        measure: subdivision.measure,
        beat: subdivision.beat,
        subdivision: subdivision.subdivision,
        style: {
          position: 'absolute',
          left: (subdivisionPixel + 2) + 'px', // Légèrement décalé à droite
          top: '4px', // Aligné avec les numéros de mesures
          zIndex: 3,
          fontSize: '8px'
        },
        text: `${subdivision.beat}.${subdivision.subdivision}`, // Format plus court : 1.2, 1.3, etc.
        data: subdivision.data
      })
    })

    return labels
  })

  /**
   * Style du conteneur principal
   */
  const containerStyle = computed(() => ({
    width: totalWidth.value + 'px',
    height: containerHeight ? containerHeight + 'px' : '100%',
    position: 'absolute',
    top: '0px',
    left: '0px'
  }))

  /**
   * Utilitaires pour filtrer les lignes visibles dans un viewport
   */
  const getVisibleLines = (startPixel, endPixel, lineType = 'all') => {
    const isVisible = (line) => {
      const linePixel = parseFloat(line.style.left)
      return linePixel >= startPixel && linePixel <= endPixel
    }

    switch (lineType) {
      case 'measures':
        return measureLines.value.filter(isVisible)
      case 'beats':
        return beatLines.value.filter(isVisible)
      case 'subdivisions':
        return subdivisionLines.value.filter(isVisible)
      default:
        return allGridLines.value.filter(isVisible)
    }
  }

  /**
   * Trouver la mesure à une position pixel donnée
   */
  const getMeasureAtPixel = (pixel) => {
    return measures.value.find(measure =>
      pixel >= measure.startPixel &&
      pixel < (measure.startPixel + measure.measureWidth)
    )
  }

  /**
   * Trouver le beat le plus proche d'une position pixel
   */
  const getNearestBeat = (pixel) => {
    let nearestBeat = null
    let minDistance = Infinity

    measures.value.forEach(measure => {
      for (let beatIndex = 0; beatIndex < measure.beatsCount; beatIndex++) {
        const beatPixel = measure.startPixel + beatIndex * measure.beatWidth
        const distance = Math.abs(pixel - beatPixel)

        if (distance < minDistance) {
          minDistance = distance
          nearestBeat = {
            measure: measure.number,
            beat: beatIndex + 1,
            pixel: beatPixel,
            distance
          }
        }
      }
    })

    return nearestBeat
  }

  /**
   * Trouver la subdivision la plus proche d'une position pixel
   */
  const getNearestSubdivision = (pixel) => {
    let nearestSubdivision = null
    let minDistance = Infinity

    // Inclure les beats comme subdivisions de base
    measures.value.forEach(measure => {
      for (let beatIndex = 0; beatIndex < measure.beatsCount; beatIndex++) {
        const beatPixel = measure.startPixel + beatIndex * measure.beatWidth
        const distance = Math.abs(pixel - beatPixel)

        if (distance < minDistance) {
          minDistance = distance
          nearestSubdivision = {
            measure: measure.number,
            beat: beatIndex + 1,
            subdivision: 0,
            pixel: beatPixel,
            distance,
            type: 'beat'
          }
        }
      }
    })

    // Vérifier les subdivisions
    subdivisionLines.value.forEach(subdivision => {
      const subdivisionPixel = parseFloat(subdivision.style.left)
      const distance = Math.abs(pixel - subdivisionPixel)

      if (distance < minDistance) {
        minDistance = distance
        nearestSubdivision = {
          measure: subdivision.measure,
          beat: subdivision.beat,
          subdivision: subdivision.subdivision,
          pixel: subdivisionPixel,
          distance,
          type: 'subdivision',
          isStrong: subdivision.isStrong
        }
      }
    })

    return nearestSubdivision
  }

  return {
    // Données des lignes
    measures,
    measureLines,
    beatLines,
    subdivisionLines,
    allGridLines,
    signatureIndicators,
    measureNumbers,
    beatLabels,
    subdivisionLabels,

    // Dimensions
    totalWidth,
    containerStyle,

    // Utilitaires
    getVisibleLines,
    getMeasureAtPixel,
    getNearestBeat,
    getNearestSubdivision,
    getSubdivisionCount,

    // Données brutes pour compatibilité
    measuresData: measures
  }
}