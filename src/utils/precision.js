// utils/precision.js - Utilitaires pour la précision temporelle standardisée
/**
 * Constante de précision temporelle pour tout le projet
 * 6 décimales = précision en microsecondes
 */
export const TIME_PRECISION = 6

/**
 * Normalise un temps à la précision standard (6 décimales)
 * @param {number} time - Temps en secondes
 * @returns {number} Temps normalisé
 */
export function normalizeTime(time) {
  if (typeof time !== 'number' || isNaN(time)) {
    return 0
  }
  return Math.round(time * Math.pow(10, TIME_PRECISION)) / Math.pow(10, TIME_PRECISION)
}

/**
 * Formate un temps pour l'affichage avec précision constante
 * @param {number} time - Temps en secondes
 * @returns {string} Temps formaté
 */
export function formatTime(time) {
  return normalizeTime(time).toFixed(TIME_PRECISION)
}

/**
 * Normalise un objet CC avec précision temporelle
 * @param {object} cc - Objet Control Change
 * @returns {object} CC avec temps normalisé
 */
export function normalizeCCTime(cc) {
  return {
    ...cc,
    time: normalizeTime(cc.time)
  }
}

/**
 * Normalise un objet Note avec précision temporelle
 * @param {object} note - Objet Note
 * @returns {object} Note avec temps normalisé
 */
export function normalizeNoteTime(note) {
  return {
    ...note,
    time: normalizeTime(note.time),
    duration: normalizeTime(note.duration)
  }
}

/**
 * Conversion ticks vers temps avec précision normalisée
 * @param {number} ticks - Ticks MIDI
 * @param {number} ppq - Pulses per quarter note
 * @param {number} tempo - Tempo en BPM
 * @returns {number} Temps normalisé
 */
export function ticksToTimeNormalized(ticks, ppq = 480, tempo = 120) {
  const rawTime = (ticks / ppq) * (60 / tempo)
  return normalizeTime(rawTime)
}

/**
 * Conversion temps vers ticks avec précision normalisée
 * @param {number} time - Temps en secondes
 * @param {number} ppq - Pulses per quarter note  
 * @param {number} tempo - Tempo en BPM
 * @returns {number} Ticks MIDI
 */
export function timeToTicksNormalized(time, ppq = 480, tempo = 120) {
  const normalizedTime = normalizeTime(time)
  return Math.round((normalizedTime * tempo * ppq) / 60)
}

/**
 * Quantifie un temps sur la grille temporelle la plus proche
 * @param {number} time - Temps en secondes
 * @param {number} gridSize - Taille de grille (ex: 0.125 = 1/8 de note à 120 BPM)
 * @returns {number} Temps quantifié
 */
export function quantizeTime(time, gridSize = 0.125) {
  if (typeof time !== 'number' || isNaN(time)) {
    return 0
  }
  return Math.round(time / gridSize) * gridSize
}

/**
 * Quantifie un temps CC sur la grille en fonction du tempo
 * @param {number} time - Temps en secondes
 * @param {number} tempo - Tempo en BPM (défaut 120)
 * @param {number} subdivision - Subdivision (4 = noire, 8 = croche, 16 = double-croche)
 * @returns {number} Temps quantifié
 */
export function quantizeCCTime(time, tempo = 120, subdivision = 16) {
  // Calculer la durée d'une subdivision à ce tempo
  const quarterNoteDuration = 60 / tempo // Durée d'une noire en secondes
  const gridSize = quarterNoteDuration / (subdivision / 4) // Taille de grille
  
  return normalizeTime(quantizeTime(time, gridSize))
}

/**
 * Debug: Compare deux temps et affiche la différence
 * @param {number} time1 - Premier temps
 * @param {number} time2 - Deuxième temps
 * @param {string} label - Label pour le debug
 */
export function debugTimeDifference(time1, time2, label = 'Time comparison') {
  const diff = Math.abs(time1 - time2)
  const diffMs = diff * 1000
  console.log(`🔍 ${label}:`, {
    time1: formatTime(time1) + 's',
    time2: formatTime(time2) + 's', 
    difference: diffMs.toFixed(3) + 'ms',
    normalized1: formatTime(normalizeTime(time1)) + 's',
    normalized2: formatTime(normalizeTime(time2)) + 's'
  })
}