// composables/useMidiOutput.js
import { ref, reactive } from 'vue'

// État global des sorties MIDI
const midiAccess = ref(null)
const midiOutputs = ref(new Map())
const isInitialized = ref(false)
const activeNotes = reactive(new Map()) // Pour tracker les notes qui jouent

// Initialiser l'accès MIDI
async function initializeMidi() {
  if (isInitialized.value) return true

  try {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API non supportée par ce navigateur')
      return false
    }

    midiAccess.value = await navigator.requestMIDIAccess()
    
    // Mettre à jour la liste des sorties
    updateOutputs()
    
    // Écouter les changements de périphériques
    midiAccess.value.onstatechange = () => {
      updateOutputs()
    }

    isInitialized.value = true
    return true

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation MIDI:', error)
    return false
  }
}

// Mettre à jour la liste des sorties disponibles
function updateOutputs() {
  if (!midiAccess.value) return

  const outputs = new Map()
  
  for (const output of midiAccess.value.outputs.values()) {
    outputs.set(output.id, {
      id: output.id,
      name: output.name,
      manufacturer: output.manufacturer,
      state: output.state,
      connection: output.connection,
      output: output
    })
  }

  midiOutputs.value = outputs
  
  console.log(`🎹 ${outputs.size} sortie(s) MIDI disponible(s):`, 
    Array.from(outputs.values()).map(o => o.name))
}

// Obtenir une sortie MIDI par ID
function getMidiOutput(outputId) {
  if (!outputId || outputId === 'default') {
    // Retourner la première sortie disponible
    const firstOutput = Array.from(midiOutputs.value.values())[0]
    return firstOutput?.output || null
  }
  
  const outputInfo = midiOutputs.value.get(outputId)
  return outputInfo?.output || null
}

// CORRECTION: Jouer une note MIDI avec vérification préalable
async function playNote({ midi, velocity = 64, channel = 0, outputId = 'default', duration = null }) {
  await initializeMidi()
  
  const output = getMidiOutput(outputId)
  if (!output) {
    console.warn(`❌ Sortie MIDI non trouvée: ${outputId}`)
    return null
  }

  try {
    // Créer un identifiant unique pour cette note
    const noteKey = `${outputId}-${channel}-${midi}`
    
    // CORRECTION: Vérifier si une note identique joue déjà
    if (activeNotes.has(noteKey)) {
      console.log(`⚠️ Note déjà active: ${getMidiNoteName(midi)}, arrêt de la précédente`)
      // Arrêter la note précédente
      const noteOffMessage = [
        0x80 | (channel & 0x0F),
        midi & 0x7F,
        64
      ]
      output.send(noteOffMessage)
      activeNotes.delete(noteKey)
    }

    // Construire le message Note On
    const noteOnMessage = [
      0x90 | (channel & 0x0F), // Note On + canal (0-15)
      midi & 0x7F,             // Note MIDI (0-127)
      velocity & 0x7F          // Vélocité (0-127)
    ]

    // CORRECTION: Envoyer le message Note On
    output.send(noteOnMessage)
    console.log(`🎵 Note ON envoyée: ${getMidiNoteName(midi)} (${midi}) - Canal ${channel} - Vélocité ${velocity}`)
    
    // Tracker la note active
    const noteInfo = {
      midi,
      velocity,
      channel,
      outputId,
      output,
      startTime: Date.now(),
      timeoutId: null
    }
    
    activeNotes.set(noteKey, noteInfo)

    // Si une durée est spécifiée, programmer l'arrêt automatique
    if (duration && duration > 0) {
      const timeoutId = setTimeout(() => {
        stopNote({ midi, channel, outputId })
      }, duration)
      
      // Sauvegarder l'ID du timeout pour pouvoir l'annuler si nécessaire
      noteInfo.timeoutId = timeoutId
      activeNotes.set(noteKey, noteInfo)
    }

    return noteKey

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la note MIDI:', error)
    return null
  }
}

// CORRECTION: Arrêter une note MIDI avec vérification
async function stopNote({ midi, channel = 0, outputId = 'default' }) {
  const output = getMidiOutput(outputId)
  if (!output) return false

  try {
    const noteKey = `${outputId}-${channel}-${midi}`
    
    // CORRECTION: Vérifier si la note est vraiment active avant d'envoyer Note Off
    if (!activeNotes.has(noteKey)) {
      console.log(`⚠️ Tentative d'arrêt d'une note non active: ${getMidiNoteName(midi)} (${midi})`)
      // On envoie quand même le Note Off au cas où
    }

    // Construire le message Note Off
    const noteOffMessage = [
      0x80 | (channel & 0x0F), // Note Off + canal (0-15)
      midi & 0x7F,             // Note MIDI (0-127)
      64                       // Vélocité de relâchement (standard)
    ]

    // Envoyer le message Note Off
    output.send(noteOffMessage)
    console.log(`🎵 Note OFF envoyée: ${getMidiNoteName(midi)} (${midi}) - Canal ${channel}`)
    
    // Nettoyer les données de la note active
    const noteInfo = activeNotes.get(noteKey)
    if (noteInfo && noteInfo.timeoutId) {
      clearTimeout(noteInfo.timeoutId)
    }
    activeNotes.delete(noteKey)
    
    return true

  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt de la note MIDI:', error)
    return false
  }
}

// Arrêter toutes les notes d'un canal
async function stopAllNotesOnChannel(channel = 0, outputId = 'default') {
  const output = getMidiOutput(outputId)
  if (!output) return false

  try {
    // Envoyer All Notes Off (CC 123)
    const allNotesOffMessage = [
      0xB0 | (channel & 0x0F), // Control Change + canal
      123,                     // All Notes Off
      0                        // Valeur 0
    ]

    output.send(allNotesOffMessage)
    
    // Nettoyer les notes actives pour ce canal
    for (const [key, noteInfo] of activeNotes.entries()) {
      if (noteInfo.channel === channel && noteInfo.outputId === outputId) {
        if (noteInfo.timeoutId) {
          clearTimeout(noteInfo.timeoutId)
        }
        activeNotes.delete(key)
      }
    }
    
    console.log(`🔇 Toutes les notes arrêtées sur le canal ${channel}`)
    return true

  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt de toutes les notes:', error)
    return false
  }
}

// Envoyer un Control Change
async function sendControlChange({ cc, value, channel = 0, outputId = 'default' }) {
  await initializeMidi()
  
  const output = getMidiOutput(outputId)
  if (!output) return false

  try {
    const ccMessage = [
      0xB0 | (channel & 0x0F), // Control Change + canal
      cc & 0x7F,               // Numéro de contrôleur (0-127)
      value & 0x7F             // Valeur (0-127)
    ]

    output.send(ccMessage)
    console.log(`🎛️ CC envoyé: CC${cc} = ${value} sur canal ${channel}`)
    return true

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du Control Change:', error)
    return false
  }
}

// Envoyer un Program Change
async function sendProgramChange({ program, channel = 0, outputId = 'default' }) {
  await initializeMidi()
  
  const output = getMidiOutput(outputId)
  if (!output) return false

  try {
    const programMessage = [
      0xC0 | (channel & 0x0F), // Program Change + canal
      program & 0x7F           // Numéro de programme (0-127)
    ]

    output.send(programMessage)
    console.log(`🎹 Program Change envoyé: Program ${program} sur canal ${channel}`)
    return true

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du Program Change:', error)
    return false
  }
}

// Envoyer un Pitch Bend
async function sendPitchBend({ value, channel = 0, outputId = 'default' }) {
  await initializeMidi()
  
  const output = getMidiOutput(outputId)
  if (!output) return false

  try {
    // Convertir la valeur (-8192 à +8191) en deux bytes
    const pitchValue = Math.max(-8192, Math.min(8191, value)) + 8192
    const lsb = pitchValue & 0x7F
    const msb = (pitchValue >> 7) & 0x7F

    const pitchBendMessage = [
      0xE0 | (channel & 0x0F), // Pitch Bend + canal
      lsb,                     // LSB
      msb                      // MSB
    ]

    output.send(pitchBendMessage)
    console.log(`🎵 Pitch Bend envoyé: ${value} sur canal ${channel}`)
    return true

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du Pitch Bend:', error)
    return false
  }
}

// Conversion MIDI note vers nom
function getMidiNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midi / 12) - 1
  const noteName = noteNames[midi % 12]
  return `${noteName}${octave}`
}

// Obtenir les informations sur les notes actives
function getActiveNotes() {
  return Array.from(activeNotes.values())
}

// CORRECTION: Nettoyer toutes les notes actives (panic) avec gestion des timeouts
async function panicStop() {
  console.log('🚨 PANIC: Arrêt de toutes les notes MIDI')
  
  // Arrêter tous les timeouts en cours
  for (const noteInfo of activeNotes.values()) {
    if (noteInfo.timeoutId) {
      clearTimeout(noteInfo.timeoutId)
    }
  }
  
  // Arrêter toutes les notes actives
  for (const noteInfo of activeNotes.values()) {
    await stopNote({
      midi: noteInfo.midi,
      channel: noteInfo.channel,
      outputId: noteInfo.outputId
    })
  }
  
  // Envoyer All Notes Off sur tous les canaux de toutes les sorties
  for (const outputInfo of midiOutputs.value.values()) {
    for (let channel = 0; channel < 16; channel++) {
      await stopAllNotesOnChannel(channel, outputInfo.id)
    }
  }
  
  activeNotes.clear()
}

// Obtenir la liste des sorties disponibles
function getAvailableOutputs() {
  return Array.from(midiOutputs.value.values())
}

// Tester une sortie MIDI
async function testOutput(outputId) {
  console.log(`🧪 Test de la sortie MIDI: ${outputId}`)
  
  // Jouer une note de test (C4)
  const noteKey = await playNote({
    midi: 60,
    velocity: 80,
    channel: 0,
    outputId,
    duration: 500
  })
  
  return noteKey !== null
}

// CORRECTION: Fonction pour forcer l'arrêt d'une note spécifique (utile pour debug)
async function forceStopNote({ midi, channel = 0, outputId = 'default' }) {
  const output = getMidiOutput(outputId)
  if (!output) return false

  // Envoyer plusieurs Note Off pour être sûr
  for (let velocity = 0; velocity <= 127; velocity += 64) {
    const noteOffMessage = [
      0x80 | (channel & 0x0F),
      midi & 0x7F,
      velocity
    ]
    output.send(noteOffMessage)
  }
  
  // Nettoyer les données
  const noteKey = `${outputId}-${channel}-${midi}`
  const noteInfo = activeNotes.get(noteKey)
  if (noteInfo && noteInfo.timeoutId) {
    clearTimeout(noteInfo.timeoutId)
  }
  activeNotes.delete(noteKey)
  
  console.log(`🔧 Arrêt forcé de la note: ${getMidiNoteName(midi)}`)
  return true
}

// Composable principal
export function useMidiOutput() {
  return {
    // État
    midiAccess,
    midiOutputs,
    isInitialized,
    activeNotes,
    
    // Fonctions d'initialisation
    initializeMidi,
    updateOutputs,
    
    // Fonctions de lecture
    playNote,
    stopNote,
    stopAllNotesOnChannel,
    panicStop,
    forceStopNote, // Nouvelle fonction pour le debug
    
    // Fonctions de contrôle
    sendControlChange,
    sendProgramChange,
    sendPitchBend,
    
    // Utilitaires
    getMidiOutput,
    getMidiNoteName,
    getActiveNotes,
    getAvailableOutputs,
    testOutput
  }
}