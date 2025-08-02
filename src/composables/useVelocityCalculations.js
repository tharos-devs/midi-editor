// composables/useVelocityCalculations.js

/**
 * Composable pour les calculs de conversion et de positionnement des vélocités
 */
export function useVelocityCalculations() {
  
  // CONVERSIONS TONE.JS ↔ MIDI
  const toneToMidi = (toneVelocity) => {
    if (typeof toneVelocity !== 'number') return 64
    return Math.round(Math.max(0, Math.min(1, toneVelocity)) * 127)
  }

  const midiToTone = (midiVelocity) => {
    if (typeof midiVelocity !== 'number') return 0.5
    return Math.max(0, Math.min(127, midiVelocity)) / 127
  }

  // CONVERSIONS POSITION Y ↔ VELOCITY
  // Correction: 127 en haut (marginTop) et 0 en bas
  const velocityToY = (midiVelocity, usableHeight, marginTop) => {
    const clampedVelocity = Math.max(0, Math.min(127, midiVelocity))
    const ratio = clampedVelocity / 127
    
    // 127 = marginTop (haut), 0 = marginTop + usableHeight (bas)
    const yFromTop = marginTop + (usableHeight * (1 - ratio))
    return yFromTop
  }

  const yToVelocity = (yPosition, usableHeight, marginTop) => {
    const relativeY = yPosition - marginTop
    
    // Clamp strict pour éviter les valeurs négatives lors de sortie de fenêtre
    const clampedRelativeY = Math.max(0, Math.min(usableHeight, relativeY))
    
    // 127 en haut (relativeY = 0), 0 en bas (relativeY = usableHeight)
    const ratio = Math.max(0, Math.min(1, 1 - (clampedRelativeY / usableHeight)))
    return Math.max(0, Math.min(127, Math.round(ratio * 127)))
  }

  // CALCUL DE DELTA AVEC SENSIBILITÉ AJUSTABLE
  const calculateVelocityDelta = (deltaY, usableHeight, sensitivity = 1.0) => {
    return -(deltaY / usableHeight) * 127 * sensitivity
  }

  // VALIDATION ET CLAMPAGE
  const clampVelocity = (velocity) => {
    return Math.max(0, Math.min(127, Math.round(velocity)))
  }

  // INTERPOLATION POUR DES TRANSITIONS FLUIDES
  const interpolateVelocity = (from, to, factor) => {
    return from + (to - from) * Math.max(0, Math.min(1, factor))
  }

  return {
    toneToMidi,
    midiToTone,
    velocityToY,
    yToVelocity,
    calculateVelocityDelta,
    clampVelocity,
    interpolateVelocity
  }
}