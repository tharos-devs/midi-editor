// constants/midiConstants.js

// Messages MIDI
export const MIDI_MESSAGES = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  POLY_AFTERTOUCH: 0xA0,
  CONTROL_CHANGE: 0xB0,
  PROGRAM_CHANGE: 0xC0,
  CHANNEL_AFTERTOUCH: 0xD0,
  PITCH_BEND: 0xE0,
  SYSTEM_EXCLUSIVE: 0xF0
}

// Contrôleurs MIDI standards
export const MIDI_CONTROLLERS = {
  BANK_SELECT_MSB: 0,
  MODULATION: 1,
  BREATH_CONTROLLER: 2,
  FOOT_CONTROLLER: 4,
  PORTAMENTO_TIME: 5,
  DATA_ENTRY_MSB: 6,
  VOLUME: 7,
  BALANCE: 8,
  PAN: 10,
  EXPRESSION: 11,
  BANK_SELECT_LSB: 32,
  DATA_ENTRY_LSB: 38,
  SUSTAIN_PEDAL: 64,
  PORTAMENTO: 65,
  SOSTENUTO: 66,
  SOFT_PEDAL: 67,
  LEGATO_FOOTSWITCH: 68,
  HOLD_2: 69,
  SOUND_CONTROLLER_1: 70, // Sound Variation
  SOUND_CONTROLLER_2: 71, // Timbre/Harmonic Intensity
  SOUND_CONTROLLER_3: 72, // Release Time
  SOUND_CONTROLLER_4: 73, // Attack Time
  SOUND_CONTROLLER_5: 74, // Brightness
  SOUND_CONTROLLER_6: 75, // Decay Time
  SOUND_CONTROLLER_7: 76, // Vibrato Rate
  SOUND_CONTROLLER_8: 77, // Vibrato Depth
  SOUND_CONTROLLER_9: 78, // Vibrato Delay
  SOUND_CONTROLLER_10: 79, // Undefined
  GENERAL_PURPOSE_1: 80,
  GENERAL_PURPOSE_2: 81,
  GENERAL_PURPOSE_3: 82,
  GENERAL_PURPOSE_4: 83,
  PORTAMENTO_CONTROL: 84,
  REVERB_SEND: 91,
  TREMOLO_DEPTH: 92,
  CHORUS_SEND: 93,
  DETUNE_DEPTH: 94,
  PHASER_DEPTH: 95,
  DATA_INCREMENT: 96,
  DATA_DECREMENT: 97,
  NRPN_LSB: 98,
  NRPN_MSB: 99,
  RPN_LSB: 100,
  RPN_MSB: 101,
  ALL_SOUND_OFF: 120,
  RESET_ALL_CONTROLLERS: 121,
  LOCAL_CONTROL: 122,
  ALL_NOTES_OFF: 123,
  OMNI_MODE_OFF: 124,
  OMNI_MODE_ON: 125,
  MONO_MODE_ON: 126,
  POLY_MODE_ON: 127
}

// Noms des contrôleurs pour l'affichage
export const CONTROLLER_NAMES = {
  [MIDI_CONTROLLERS.BANK_SELECT_MSB]: 'Bank Select MSB',
  [MIDI_CONTROLLERS.MODULATION]: 'Modulation',
  [MIDI_CONTROLLERS.BREATH_CONTROLLER]: 'Breath Controller',
  [MIDI_CONTROLLERS.FOOT_CONTROLLER]: 'Foot Controller',
  [MIDI_CONTROLLERS.PORTAMENTO_TIME]: 'Portamento Time',
  [MIDI_CONTROLLERS.DATA_ENTRY_MSB]: 'Data Entry MSB',
  [MIDI_CONTROLLERS.VOLUME]: 'Volume',
  [MIDI_CONTROLLERS.BALANCE]: 'Balance',
  [MIDI_CONTROLLERS.PAN]: 'Pan',
  [MIDI_CONTROLLERS.EXPRESSION]: 'Expression',
  [MIDI_CONTROLLERS.BANK_SELECT_LSB]: 'Bank Select LSB',
  [MIDI_CONTROLLERS.SUSTAIN_PEDAL]: 'Sustain Pedal',
  [MIDI_CONTROLLERS.PORTAMENTO]: 'Portamento',
  [MIDI_CONTROLLERS.SOSTENUTO]: 'Sostenuto',
  [MIDI_CONTROLLERS.SOFT_PEDAL]: 'Soft Pedal',
  [MIDI_CONTROLLERS.LEGATO_FOOTSWITCH]: 'Legato Footswitch',
  [MIDI_CONTROLLERS.HOLD_2]: 'Hold 2',
  [MIDI_CONTROLLERS.REVERB_SEND]: 'Reverb Send',
  [MIDI_CONTROLLERS.CHORUS_SEND]: 'Chorus Send',
  [MIDI_CONTROLLERS.ALL_SOUND_OFF]: 'All Sound Off',
  [MIDI_CONTROLLERS.RESET_ALL_CONTROLLERS]: 'Reset All Controllers',
  [MIDI_CONTROLLERS.LOCAL_CONTROL]: 'Local Control',
  [MIDI_CONTROLLERS.ALL_NOTES_OFF]: 'All Notes Off'
}

// Instruments General MIDI (GM)
export const GM_INSTRUMENTS = {
  // Piano (1-8)
  1: 'Acoustic Grand Piano',
  2: 'Bright Acoustic Piano',
  3: 'Electric Grand Piano',
  4: 'Honky-tonk Piano',
  5: 'Electric Piano 1',
  6: 'Electric Piano 2',
  7: 'Harpsichord',
  8: 'Clavi',
  
  // Chromatic Percussion (9-16)
  9: 'Celesta',
  10: 'Glockenspiel',
  11: 'Music Box',
  12: 'Vibraphone',
  13: 'Marimba',
  14: 'Xylophone',
  15: 'Tubular Bells',
  16: 'Dulcimer',
  
  // Organ (17-24)
  17: 'Drawbar Organ',
  18: 'Percussive Organ',
  19: 'Rock Organ',
  20: 'Church Organ',
  21: 'Reed Organ',
  22: 'Accordion',
  23: 'Harmonica',
  24: 'Tango Accordion',
  
  // Guitar (25-32)
  25: 'Acoustic Guitar (nylon)',
  26: 'Acoustic Guitar (steel)',
  27: 'Electric Guitar (jazz)',
  28: 'Electric Guitar (clean)',
  29: 'Electric Guitar (muted)',
  30: 'Overdriven Guitar',
  31: 'Distortion Guitar',
  32: 'Guitar harmonics',
  
  // Bass (33-40)
  33: 'Acoustic Bass',
  34: 'Electric Bass (finger)',
  35: 'Electric Bass (pick)',
  36: 'Fretless Bass',
  37: 'Slap Bass 1',
  38: 'Slap Bass 2',
  39: 'Synth Bass 1',
  40: 'Synth Bass 2',
  
  // Strings (41-48)
  41: 'Violin',
  42: 'Viola',
  43: 'Cello',
  44: 'Contrabass',
  45: 'Tremolo Strings',
  46: 'Pizzicato Strings',
  47: 'Orchestral Harp',
  48: 'Timpani',
  
  // Ensemble (49-56)
  49: 'String Ensemble 1',
  50: 'String Ensemble 2',
  51: 'SynthStrings 1',
  52: 'SynthStrings 2',
  53: 'Choir Aahs',
  54: 'Voice Oohs',
  55: 'Synth Voice',
  56: 'Orchestra Hit',
  
  // Brass (57-64)
  57: 'Trumpet',
  58: 'Trombone',
  59: 'Tuba',
  60: 'Muted Trumpet',
  61: 'French Horn',
  62: 'Brass Section',
  63: 'SynthBrass 1',
  64: 'SynthBrass 2',
  
  // Reed (65-72)
  65: 'Soprano Sax',
  66: 'Alto Sax',
  67: 'Tenor Sax',
  68: 'Baritone Sax',
  69: 'Oboe',
  70: 'English Horn',
  71: 'Bassoon',
  72: 'Clarinet',
  
  // Pipe (73-80)
  73: 'Piccolo',
  74: 'Flute',
  75: 'Recorder',
  76: 'Pan Flute',
  77: 'Blown Bottle',
  78: 'Shakuhachi',
  79: 'Whistle',
  80: 'Ocarina',
  
  // Synth Lead (81-88)
  81: 'Lead 1 (square)',
  82: 'Lead 2 (sawtooth)',
  83: 'Lead 3 (calliope)',
  84: 'Lead 4 (chiff)',
  85: 'Lead 5 (charang)',
  86: 'Lead 6 (voice)',
  87: 'Lead 7 (fifths)',
  88: 'Lead 8 (bass + lead)',
  
  // Synth Pad (89-96)
  89: 'Pad 1 (new age)',
  90: 'Pad 2 (warm)',
  91: 'Pad 3 (polysynth)',
  92: 'Pad 4 (choir)',
  93: 'Pad 5 (bowed)',
  94: 'Pad 6 (metallic)',
  95: 'Pad 7 (halo)',
  96: 'Pad 8 (sweep)',
  
  // Synth Effects (97-104)
  97: 'FX 1 (rain)',
  98: 'FX 2 (soundtrack)',
  99: 'FX 3 (crystal)',
  100: 'FX 4 (atmosphere)',
  101: 'FX 5 (brightness)',
  102: 'FX 6 (goblins)',
  103: 'FX 7 (echoes)',
  104: 'FX 8 (sci-fi)',
  
  // Ethnic (105-112)
  105: 'Sitar',
  106: 'Banjo',
  107: 'Shamisen',
  108: 'Koto',
  109: 'Kalimba',
  110: 'Bag pipe',
  111: 'Fiddle',
  112: 'Shanai',
  
  // Percussive (113-120)
  113: 'Tinkle Bell',
  114: 'Agogo',
  115: 'Steel Drums',
  116: 'Woodblock',
  117: 'Taiko Drum',
  118: 'Melodic Tom',
  119: 'Synth Drum',
  120: 'Reverse Cymbal',
  
  // Sound Effects (121-128)
  121: 'Guitar Fret Noise',
  122: 'Breath Noise',
  123: 'Seashore',
  124: 'Bird Tweet',
  125: 'Telephone Ring',
  126: 'Helicopter',
  127: 'Applause',
  128: 'Gunshot'
}

// Catégories d'instruments
export const INSTRUMENT_CATEGORIES = {
  PIANO: { start: 1, end: 8, name: 'Piano' },
  CHROMATIC_PERCUSSION: { start: 9, end: 16, name: 'Percussion chromatique' },
  ORGAN: { start: 17, end: 24, name: 'Orgue' },
  GUITAR: { start: 25, end: 32, name: 'Guitare' },
  BASS: { start: 33, end: 40, name: 'Basse' },
  STRINGS: { start: 41, end: 48, name: 'Cordes' },
  ENSEMBLE: { start: 49, end: 56, name: 'Ensemble' },
  BRASS: { start: 57, end: 64, name: 'Cuivres' },
  REED: { start: 65, end: 72, name: 'Anches' },
  PIPE: { start: 73, end: 80, name: 'Flûtes' },
  SYNTH_LEAD: { start: 81, end: 88, name: 'Synthé Lead' },
  SYNTH_PAD: { start: 89, end: 96, name: 'Synthé Pad' },
  SYNTH_EFFECTS: { start: 97, end: 104, name: 'Effets Synthé' },
  ETHNIC: { start: 105, end: 112, name: 'Ethnique' },
  PERCUSSIVE: { start: 113, end: 120, name: 'Percussions' },
  SOUND_EFFECTS: { start: 121, end: 128, name: 'Effets sonores' }
}

// Noms des notes
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Gammes et accords de base
export const SCALES = {
  MAJOR: [0, 2, 4, 5, 7, 9, 11],
  MINOR: [0, 2, 3, 5, 7, 8, 10],
  DORIAN: [0, 2, 3, 5, 7, 9, 10],
  PHRYGIAN: [0, 1, 3, 5, 7, 8, 10],
  LYDIAN: [0, 2, 4, 6, 7, 9, 11],
  MIXOLYDIAN: [0, 2, 4, 5, 7, 9, 10],
  LOCRIAN: [0, 1, 3, 5, 6, 8, 10],
  CHROMATIC: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  PENTATONIC_MAJOR: [0, 2, 4, 7, 9],
  PENTATONIC_MINOR: [0, 3, 5, 7, 10],
  BLUES: [0, 3, 5, 6, 7, 10]
}

export const CHORDS = {
  MAJOR: [0, 4, 7],
  MINOR: [0, 3, 7],
  DIMINISHED: [0, 3, 6],
  AUGMENTED: [0, 4, 8],
  MAJOR_7: [0, 4, 7, 11],
  MINOR_7: [0, 3, 7, 10],
  DOMINANT_7: [0, 4, 7, 10],
  DIMINISHED_7: [0, 3, 6, 9],
  HALF_DIMINISHED_7: [0, 3, 6, 10],
  MAJOR_9: [0, 4, 7, 11, 14],
  MINOR_9: [0, 3, 7, 10, 14],
  SUS2: [0, 2, 7],
  SUS4: [0, 5, 7]
}

// Signatures rythmiques courantes
export const TIME_SIGNATURES = {
  '4/4': { numerator: 4, denominator: 4, name: '4/4 (Common time)' },
  '3/4': { numerator: 3, denominator: 4, name: '3/4 (Waltz)' },
  '2/4': { numerator: 2, denominator: 4, name: '2/4 (March)' },
  '6/8': { numerator: 6, denominator: 8, name: '6/8 (Compound duple)' },
  '9/8': { numerator: 9, denominator: 8, name: '9/8 (Compound triple)' },
  '12/8': { numerator: 12, denominator: 8, name: '12/8 (Compound quadruple)' },
  '5/4': { numerator: 5, denominator: 4, name: '5/4 (Quintuple)' },
  '7/8': { numerator: 7, denominator: 8, name: '7/8 (Irregular)' },
  '2/2': { numerator: 2, denominator: 2, name: '2/2 (Cut time)' }
}

// Tonalités
export const KEY_SIGNATURES = {
  'C': { sharps: 0, flats: 0, name: 'C Major / A minor' },
  'G': { sharps: 1, flats: 0, name: 'G Major / E minor' },
  'D': { sharps: 2, flats: 0, name: 'D Major / B minor' },
  'A': { sharps: 3, flats: 0, name: 'A Major / F# minor' },
  'E': { sharps: 4, flats: 0, name: 'E Major / C# minor' },
  'B': { sharps: 5, flats: 0, name: 'B Major / G# minor' },
  'F#': { sharps: 6, flats: 0, name: 'F# Major / D# minor' },
  'C#': { sharps: 7, flats: 0, name: 'C# Major / A# minor' },
  'F': { sharps: 0, flats: 1, name: 'F Major / D minor' },
  'Bb': { sharps: 0, flats: 2, name: 'Bb Major / G minor' },
  'Eb': { sharps: 0, flats: 3, name: 'Eb Major / C minor' },
  'Ab': { sharps: 0, flats: 4, name: 'Ab Major / F minor' },
  'Db': { sharps: 0, flats: 5, name: 'Db Major / Bb minor' },
  'Gb': { sharps: 0, flats: 6, name: 'Gb Major / Eb minor' },
  'Cb': { sharps: 0, flats: 7, name: 'Cb Major / Ab minor' }
}

// Tempos communs
export const TEMPO_MARKINGS = {
  LARGHISSIMO: { bpm: 24, name: 'Larghissimo (très très lent)' },
  GRAVE: { bpm: 40, name: 'Grave (lent et solennel)' },
  LARGO: { bpm: 50, name: 'Largo (lent et large)' },
  LARGHETTO: { bpm: 60, name: 'Larghetto (un peu moins lent que largo)' },
  ADAGIO: { bpm: 70, name: 'Adagio (lent)' },
  ANDANTE: { bpm: 90, name: 'Andante (allant)' },
  MODERATO: { bpm: 110, name: 'Moderato (modéré)' },
  ALLEGRETTO: { bpm: 120, name: 'Allegretto (un peu vif)' },
  ALLEGRO: { bpm: 140, name: 'Allegro (vif)' },
  VIVACE: { bpm: 170, name: 'Vivace (vif et léger)' },
  PRESTO: { bpm: 190, name: 'Presto (très vif)' },
  PRESTISSIMO: { bpm: 220, name: 'Prestissimo (le plus vif possible)' }
}

// Canaux de batterie GM (canal 10, notes 35-81)
export const GM_DRUM_MAP = {
  35: 'Acoustic Bass Drum',
  36: 'Bass Drum 1',
  37: 'Side Stick',
  38: 'Acoustic Snare',
  39: 'Hand Clap',
  40: 'Electric Snare',
  41: 'Low Floor Tom',
  42: 'Closed Hi Hat',
  43: 'High Floor Tom',
  44: 'Pedal Hi-Hat',
  45: 'Low Tom',
  46: 'Open Hi-Hat',
  47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom',
  49: 'Crash Cymbal 1',
  50: 'High Tom',
  51: 'Ride Cymbal 1',
  52: 'Chinese Cymbal',
  53: 'Ride Bell',
  54: 'Tambourine',
  55: 'Splash Cymbal',
  56: 'Cowbell',
  57: 'Crash Cymbal 2',
  58: 'Vibraslap',
  59: 'Ride Cymbal 2',
  60: 'Hi Bongo',
  61: 'Low Bongo',
  62: 'Mute Hi Conga',
  63: 'Open Hi Conga',
  64: 'Low Conga',
  65: 'High Timbale',
  66: 'Low Timbale',
  67: 'High Agogo',
  68: 'Low Agogo',
  69: 'Cabasa',
  70: 'Maracas',
  71: 'Short Whistle',
  72: 'Long Whistle',
  73: 'Short Guiro',
  74: 'Long Guiro',
  75: 'Claves',
  76: 'Hi Wood Block',
  77: 'Low Wood Block',
  78: 'Mute Cuica',
  79: 'Open Cuica',
  80: 'Mute Triangle',
  81: 'Open Triangle'
}

// Couleurs par défaut pour les pistes
export const TRACK_COLORS = [
  '#FF6B6B', // Rouge
  '#4ECDC4', // Teal
  '#45B7D1', // Bleu
  '#96CEB4', // Vert menthe
  '#FFEAA7', // Jaune
  '#DDA0DD', // Prune
  '#98D8C8', // Vert d'eau
  '#F7DC6F', // Jaune doré
  '#BB8FCE', // Lavande
  '#85C1E9', // Bleu ciel
  '#F8C471', // Orange
  '#82E0AA', // Vert clair
  '#F1948A', // Rose
  '#85C6F8', // Bleu pervenche
  '#D7BDE2', // Violet clair
  '#A9DFBF'  // Vert sauge
]

// Fonctions utilitaires
export const MidiUtils = {
  // Convertir un numéro de programme en nom d'instrument
  programToInstrumentName(program) {
    return GM_INSTRUMENTS[program + 1] || `Program ${program}`
  },

  // Obtenir la catégorie d'un instrument
  getInstrumentCategory(program) {
    const programNumber = program + 1
    for (const [category, info] of Object.entries(INSTRUMENT_CATEGORIES)) {
      if (programNumber >= info.start && programNumber <= info.end) {
        return { category, ...info }
      }
    }
    return null
  },

  // Convertir un numéro de note MIDI en nom
  midiNoteToName(midiNote) {
    const octave = Math.floor(midiNote / 12) - 2 // CORRECTION: Conformité DAW
    const noteIndex = midiNote % 12
    return `${NOTE_NAMES[noteIndex]}${octave}`
  },

  // Convertir un nom de note en numéro MIDI
  noteNameToMidi(noteName) {
    const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/)
    if (!match) return null
    
    const [, note, octave] = match
    const noteIndex = NOTE_NAMES.indexOf(note) !== -1 
      ? NOTE_NAMES.indexOf(note)
      : NOTE_NAMES_FLAT.indexOf(note)
    
    if (noteIndex === -1) return null
    
    return (parseInt(octave) + 2) * 12 + noteIndex // CORRECTION: Ajuster pour le nouveau système d'octaves
  },

  // Obtenir le nom d'un contrôleur MIDI
  getControllerName(ccNumber) {
    return CONTROLLER_NAMES[ccNumber] || `CC ${ccNumber}`
  },

  // Valider un canal MIDI (0-15)
  validateChannel(channel) {
    return Math.max(0, Math.min(15, Math.floor(channel)))
  },

  // Valider une valeur MIDI (0-127)
  validateMidiValue(value) {
    return Math.max(0, Math.min(127, Math.floor(value)))
  },

  // Obtenir les notes d'une gamme
  getScaleNotes(rootNote, scaleType) {
    const scale = SCALES[scaleType]
    if (!scale) return []
    
    const rootMidi = typeof rootNote === 'string' 
      ? this.noteNameToMidi(rootNote + '4') 
      : rootNote
    
    if (rootMidi === null) return []
    
    return scale.map(interval => rootMidi + interval)
  },

  // Obtenir les notes d'un accord
  getChordNotes(rootNote, chordType) {
    const chord = CHORDS[chordType]
    if (!chord) return []
    
    const rootMidi = typeof rootNote === 'string' 
      ? this.noteNameToMidi(rootNote + '4') 
      : rootNote
    
    if (rootMidi === null) return []
    
    return chord.map(interval => rootMidi + interval)
  },

  // Calculer la fréquence d'une note MIDI
  midiNoteToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12)
  },

  // Obtenir une couleur de piste par index
  getTrackColor(index) {
    return TRACK_COLORS[index % TRACK_COLORS.length]
  },

  // Déterminer si une note est sur une touche noire du piano
  isBlackKey(midiNote) {
    const noteIndex = midiNote % 12
    return [1, 3, 6, 8, 10].includes(noteIndex) // C#, D#, F#, G#, A#
  },

  // Obtenir le nom du tempo en fonction du BPM
  getTempoMarking(bpm) {
    const tempos = Object.entries(TEMPO_MARKINGS).sort((a, b) => a[1].bpm - b[1].bpm)
    
    for (let i = 0; i < tempos.length; i++) {
      if (bpm <= tempos[i][1].bpm + 10) {
        return tempos[i][1]
      }
    }
    
    return { bpm: bpm, name: `♩ = ${bpm}` }
  }
}

// Export par défaut
export default {
  MIDI_MESSAGES,
  MIDI_CONTROLLERS,
  CONTROLLER_NAMES,
  GM_INSTRUMENTS,
  INSTRUMENT_CATEGORIES,
  NOTE_NAMES,
  NOTE_NAMES_FLAT,
  SCALES,
  CHORDS,
  TIME_SIGNATURES,
  KEY_SIGNATURES,
  TEMPO_MARKINGS,
  GM_DRUM_MAP,
  TRACK_COLORS,
  MidiUtils
}