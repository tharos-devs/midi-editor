// composables/useNoteUtils.js

export function useNoteUtils() {
  // Notes chromatiques
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

  /**
   * Convertit un numéro de note MIDI en nom de note avec octave
   * @param {number} midiNote - Numéro MIDI (0-127)
   * @param {boolean} useFlats - Utiliser les bémols au lieu des dièses
   * @returns {string} - Nom de la note (ex: "C4", "F#2")
   */
  const midiToNoteName = (midiNote, useFlats = false) => {
    if (midiNote < 0 || midiNote > 127) {
      return 'Invalid'
    }

    const noteNames = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES
    const noteIndex = midiNote % 12
    const octave = Math.floor(midiNote / 12) - 2 // CORRECTION: MIDI note 60 = C3 (conformité DAW)

    return `${noteNames[noteIndex]}${octave}`
  }

  /**
   * Convertit un nom de note en numéro MIDI
   * @param {string} noteName - Nom de la note (ex: "C4", "F#2")
   * @returns {number} - Numéro MIDI ou -1 si invalide
   */
  const noteNameToMidi = (noteName) => {
    const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/)
    if (!match) return -1

    const [, note, octaveStr] = match
    const octave = parseInt(octaveStr)

    let noteIndex = NOTE_NAMES.indexOf(note)
    if (noteIndex === -1) {
      noteIndex = NOTE_NAMES_FLAT.indexOf(note)
    }
    if (noteIndex === -1) return -1

    return (octave + 2) * 12 + noteIndex // CORRECTION: Ajuster pour le nouveau système d'octaves
  }

  /**
   * Extrait les informations détaillées d'une note MIDI
   * @param {number} midiNote - Numéro MIDI (0-127)
   * @param {boolean} useFlats - Utiliser les bémols
   * @returns {object} - { pitch, octave, noteName, noteIndex }
   */
  const getMidiNoteInfo = (midiNote, useFlats = false) => {
    if (midiNote < 0 || midiNote > 127) {
      return {
        pitch: null,
        octave: null,
        noteName: 'Invalid',
        noteIndex: -1,
        midiNote: midiNote
      }
    }

    const noteNames = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES
    const noteIndex = midiNote % 12
    const octave = Math.floor(midiNote / 12) - 2 // CORRECTION: Conformité DAW
    const pitch = noteNames[noteIndex]
    const noteName = `${pitch}${octave}`

    return {
      pitch,
      octave,
      noteName,
      noteIndex,
      midiNote
    }
  }

  /**
   * Convertit une fréquence en note MIDI (approximative)
   * @param {number} frequency - Fréquence en Hz
   * @returns {number} - Note MIDI approximative
   */
  const frequencyToMidi = (frequency) => {
    if (frequency <= 0) return 0
    // A4 = 440Hz = MIDI note 69
    return Math.round(69 + 12 * Math.log2(frequency / 440))
  }

  /**
   * Convertit une note MIDI en fréquence
   * @param {number} midiNote - Numéro MIDI
   * @returns {number} - Fréquence en Hz
   */
  const midiToFrequency = (midiNote) => {
    // A4 = 440Hz = MIDI note 69
    return 440 * Math.pow(2, (midiNote - 69) / 12)
  }

  /**
   * Vérifie si une note est une touche noire du piano
   * @param {number} midiNote - Numéro MIDI
   * @returns {boolean} - true si c'est une touche noire
   */
  const isBlackKey = (midiNote) => {
    const noteIndex = midiNote % 12
    return [1, 3, 6, 8, 10].includes(noteIndex) // C#, D#, F#, G#, A#
  }

  /**
   * Vérifie si une note est une touche blanche du piano
   * @param {number} midiNote - Numéro MIDI
   * @returns {boolean} - true si c'est une touche blanche
   */
  const isWhiteKey = (midiNote) => {
    return !isBlackKey(midiNote)
  }

  /**
   * Obtient la couleur de la touche pour l'affichage
   * @param {number} midiNote - Numéro MIDI
   * @returns {string} - 'white' ou 'black'
   */
  const getKeyColor = (midiNote) => {
    return isBlackKey(midiNote) ? 'black' : 'white'
  }

  /**
   * Formate une note pour l'affichage selon le contexte
   * @param {number} midiNote - Numéro MIDI
   * @param {string} format - 'short' | 'long' | 'frequency'
   * @param {boolean} useFlats - Utiliser les bémols
   * @returns {string} - Note formatée
   */
  const formatNoteDisplay = (midiNote, format = 'short', useFlats = false) => {
    const noteInfo = getMidiNoteInfo(midiNote, useFlats)

    switch (format) {
      case 'short':
        return noteInfo.noteName
      
      case 'long':
        return `${noteInfo.noteName} (MIDI ${midiNote})`
      
      case 'frequency':
        const freq = midiToFrequency(midiNote)
        return `${noteInfo.noteName} (${freq.toFixed(1)}Hz)`
      
      default:
        return noteInfo.noteName
    }
  }

  return {
    // Fonctions principales
    midiToNoteName,
    noteNameToMidi,
    getMidiNoteInfo,
    
    // Conversions fréquence
    frequencyToMidi,
    midiToFrequency,
    
    // Utilitaires piano
    isBlackKey,
    isWhiteKey,
    getKeyColor,
    
    // Formatage
    formatNoteDisplay,
    
    // Constantes
    NOTE_NAMES,
    NOTE_NAMES_FLAT
  }
}