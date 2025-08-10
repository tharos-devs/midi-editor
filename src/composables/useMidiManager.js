// composables/useMidiManager.js - VERSION CORRIGÉE COMPLÈTE

import { ref, computed, onMounted, onUnmounted } from 'vue'

export function useMidiManager() {
  // État réactif
  const midiAccess = ref(null)
  const availableInputs = ref([])
  const availableOutputs = ref([])
  const isInitialized = ref(false)
  const midiSupported = ref(false)
  const lastError = ref(null)

  // Initialisation
  onMounted(async () => {
    await initializeMidi()
  })

  onUnmounted(() => {
    cleanup()
  })

  // ✅ CORRECTION: Fonction robuste pour trouver une sortie MIDI
  function findMidiOutput(outputId, outputs = null) {
    const outputList = outputs || availableOutputs.value || []

    if (!outputId || outputList.length === 0) {
      return null
    }

    // Cas spécial : 'default'
    if (outputId === 'default') {
      return outputList.length > 0 ? outputList[0] : null
    }

    // 1. Recherche exacte par ID
    let output = outputList.find(o => o.id === outputId)
    if (output) {
      // console.log(`🎯 Sortie trouvée par ID: ${output.name} (${output.id})`)
      return output
    }

    // 2. Recherche par nom (fallback pour anciennes configurations)
    output = outputList.find(o => o.name === outputId)
    if (output) {
      // console.log(`🎯 Sortie trouvée par nom: ${output.name} (${output.id})`)
      return output
    }

    // 3. Recherche partielle par nom
    output = outputList.find(o =>
      o.name.toLowerCase().includes(String(outputId).toLowerCase()) ||
      String(outputId).toLowerCase().includes(o.name.toLowerCase())
    )
    if (output) {
      console.log(`🎯 Sortie trouvée par correspondance partielle: ${output.name} (${output.id})`)
      return output
    }

    console.error(`❌ Sortie MIDI "${outputId}" non trouvée parmi:`,
      outputList.map(o => `${o.name} (${o.id})`))
    return null
  }

  // Initialisation MIDI
  async function initializeMidi() {
    if (!navigator.requestMIDIAccess) {
      console.warn('⚠️ Web MIDI API non supportée par ce navigateur')
      midiSupported.value = false
      return false
    }

    try {
      midiSupported.value = true

      const access = await navigator.requestMIDIAccess({ sysex: false })
      midiAccess.value = access

      // Écouter les changements de périphériques
      access.addEventListener('statechange', handleMidiStateChange)

      // Lister les périphériques initiaux
      updateAvailableDevices()

      isInitialized.value = true

      return true
    } catch (error) {
      console.error('💥 Erreur lors de l\'initialisation MIDI:', error)
      lastError.value = error.message
      isInitialized.value = false
      return false
    }
  }

  // Gestion des changements de périphériques
  function handleMidiStateChange(event) {
    updateAvailableDevices()
  }

  // Mise à jour de la liste des périphériques
  function updateAvailableDevices() {
    if (!midiAccess.value) return

    // Inputs
    const inputs = []
    for (const input of midiAccess.value.inputs.values()) {
      if (input.state === 'connected') {
        inputs.push({
          id: input.id,
          name: input.name || 'Input sans nom',
          manufacturer: input.manufacturer || '',
          type: input.type || 'input',
          state: input.state,
          input: input
        })
      }
    }
    availableInputs.value = inputs

    // Outputs
    const outputs = []
    for (const output of midiAccess.value.outputs.values()) {
      if (output.state === 'connected') {
        outputs.push({
          id: output.id,
          name: output.name || 'Output sans nom',
          manufacturer: output.manufacturer || '',
          type: output.type || 'output',
          state: output.state,
          output: output
        })
      }
    }
    availableOutputs.value = outputs
  }

  // ✅ CORRECTION: sendControlChange amélioré
  function sendControlChange(outputId, channel, controller, value) {
    if (!isInitialized.value || !midiAccess.value) {
      console.warn('⚠️ MIDI non initialisé')
      return false
    }

    const output = findMidiOutput(outputId)

    if (!output || !output.output) {
      console.error(`❌ Impossible d'envoyer CC${controller}: sortie "${outputId}" introuvable`)
      return false
    }

    try {
      const clampedChannel = Math.max(0, Math.min(15, parseInt(channel) || 0))
      const clampedController = Math.max(0, Math.min(127, parseInt(controller) || 0))
      const clampedValue = Math.max(0, Math.min(127, parseInt(value) || 0))

      const message = [0xB0 + clampedChannel, clampedController, clampedValue]

     //  console.log(`🎛️ Envoi CC: "${output.name}" Canal=${clampedChannel + 1} CC${clampedController}=${clampedValue}`)

      output.output.send(message)
      return true

    } catch (error) {
      // console.error(`💥 Erreur envoi CC${controller}:`, error)
      return false
    }
  }

  // ✅ CORRECTION: sendMidiMessage amélioré  
  function sendMidiMessage(outputId, message) {
    if (!isInitialized.value || !midiAccess.value) {
      // console.warn('⚠️ MIDI non initialisé')
      return false
    }

    const output = findMidiOutput(outputId)

    if (!output || !output.output) {
      // console.error(`❌ Sortie MIDI "${outputId}" non trouvée pour message`, message)
      return false
    }

    try {
      output.output.send(message)
      return true
    } catch (error) {
      // console.error(`💥 Erreur envoi message MIDI:`, error, { outputId, message })
      return false
    }
  }

  // ✅ CORRECTION: sendProgramChange amélioré
  function sendProgramChange(outputId, channel, program) {
    if (!isInitialized.value || !midiAccess.value) {
      // console.warn('⚠️ MIDI non initialisé')
      return false
    }

    const output = findMidiOutput(outputId)

    if (!output || !output.output) {
      // console.error(`❌ Impossible d'envoyer Program Change: sortie "${outputId}" introuvable`)
      return false
    }

    try {
      const clampedChannel = Math.max(0, Math.min(15, parseInt(channel) || 0))
      const clampedProgram = Math.max(0, Math.min(127, parseInt(program) || 0))

      const message = [0xC0 + clampedChannel, clampedProgram]

      // console.log(`📯 Envoi Program Change: "${output.name}" Canal=${clampedChannel + 1} Program=${clampedProgram}`)

      output.output.send(message)
      return true

    } catch (error) {
      console.error(`💥 Erreur envoi Program Change:`, error)
      return false
    }
  }

  // ✅ CORRECTION: sendBankSelect amélioré
  function sendBankSelect(outputId, channel, bank) {
    if (!isInitialized.value || !midiAccess.value) {
      console.warn('⚠️ MIDI non initialisé')
      return false
    }

    const output = findMidiOutput(outputId)

    if (!output || !output.output) {
      console.error(`❌ Impossible d'envoyer Bank Select: sortie "${outputId}" introuvable`)
      return false
    }

    try {
      const clampedChannel = Math.max(0, Math.min(15, parseInt(channel) || 0))
      const clampedBank = Math.max(0, Math.min(127, parseInt(bank) || 0))

      // Bank Select MSB (CC0) 
      const message = [0xB0 + clampedChannel, 0, clampedBank]

      // console.log(`🏦 Envoi Bank Select: "${output.name}" Canal=${clampedChannel + 1} Bank=${clampedBank}`)

      output.output.send(message)
      return true

    } catch (error) {
      console.error(`💥 Erreur envoi Bank Select:`, error)
      return false
    }
  }

  // ✅ CORRECTION: Fonction pour envoyer Note On
  function sendNoteOn(outputId, channel, note, velocity) {
    const clampedChannel = Math.max(0, Math.min(15, channel))
    const clampedNote = Math.max(0, Math.min(127, note))
    const clampedVelocity = Math.max(1, Math.min(127, velocity))
    
    // 0x90 = Note On
    const message = [0x90 + clampedChannel, clampedNote, clampedVelocity]
    return sendMidiMessage(outputId, message)
  }

  // ✅ CORRECTION: Fonction pour envoyer Note Off
  function sendNoteOff(outputId, channel, note, velocity = 0) {
    const clampedChannel = Math.max(0, Math.min(15, channel))
    const clampedNote = Math.max(0, Math.min(127, note))
    const clampedVelocity = Math.max(0, Math.min(127, velocity))
    
    // 0x80 = Note Off
    const message = [0x80 + clampedChannel, clampedNote, clampedVelocity]
    return sendMidiMessage(outputId, message)
  }

  // Fonction de test MIDI
  function testMidiOutput(outputId, channel = 0, note = 60, velocity = 100, duration = 500) {
    if (!isInitialized.value) {
      console.warn('⚠️ MIDI non initialisé')
      return false
    }

    const output = findMidiOutput(outputId)
    if (!output) {
      console.error(`❌ Sortie "${outputId}" non trouvée pour test`)
      return false
    }

    try {
      const clampedChannel = Math.max(0, Math.min(15, channel))
      const clampedNote = Math.max(0, Math.min(127, note))
      const clampedVelocity = Math.max(1, Math.min(127, velocity))

      console.log(`🧪 Test MIDI: "${output.name}" Canal=${clampedChannel + 1} Note=${clampedNote} Vel=${clampedVelocity}`)

      // Note On
      const noteOnMessage = [0x90 + clampedChannel, clampedNote, clampedVelocity]
      output.output.send(noteOnMessage)

      // Note Off après la durée spécifiée
      setTimeout(() => {
        const noteOffMessage = [0x80 + clampedChannel, clampedNote, 0]
        output.output.send(noteOffMessage)
      }, duration)

      return true
    } catch (error) {
      console.error('💥 Erreur test MIDI:', error)
      return false
    }
  }

  // Fonctions utilitaires
  function getAllNotesOff(outputId, channel) {
    if (!isInitialized.value) return false

    const output = findMidiOutput(outputId)
    if (!output) return false

    try {
      const clampedChannel = Math.max(0, Math.min(15, channel || 0))

      // All Notes Off (CC 123)
      const allNotesOffMessage = [0xB0 + clampedChannel, 123, 0]
      output.output.send(allNotesOffMessage)

      // All Sound Off (CC 120)
      const allSoundOffMessage = [0xB0 + clampedChannel, 120, 0]
      output.output.send(allSoundOffMessage)

      console.log(`🔇 All Notes/Sound Off envoyé à "${output.name}" Canal=${clampedChannel + 1}`)
      return true
    } catch (error) {
      console.error('💥 Erreur All Notes Off:', error)
      return false
    }
  }

  function resetAllControllers(outputId, channel) {
    if (!isInitialized.value) return false

    const output = findMidiOutput(outputId)
    if (!output) return false

    try {
      const clampedChannel = Math.max(0, Math.min(15, channel || 0))

      // Reset All Controllers (CC 121)
      const resetMessage = [0xB0 + clampedChannel, 121, 0]
      output.output.send(resetMessage)

      console.log(`🔄 Reset All Controllers envoyé à "${output.name}" Canal=${clampedChannel + 1}`)
      return true
    } catch (error) {
      console.error('💥 Erreur Reset Controllers:', error)
      return false
    }
  }

  // ✅ CORRECTION: Fonction de debug pour lister les sorties
  function debugMidiOutputs() {
    console.log('🔍 Debug - Sorties MIDI disponibles:')
    const outputs = availableOutputs.value || []

    if (outputs.length === 0) {
      console.log('  ❌ Aucune sortie MIDI disponible')
      return
    }

    outputs.forEach((output, index) => {
      console.log(`  ${index + 1}. "${output.name}" (ID: ${output.id})`)
      console.log(`     - Type: ${output.type}`)
      console.log(`     - État: ${output.state}`)
      console.log(`     - Manufacturer: ${output.manufacturer || 'N/A'}`)
    })
  }

  // Nettoyage
  function cleanup() {
    if (midiAccess.value) {
      midiAccess.value.removeEventListener('statechange', handleMidiStateChange)
    }

    midiAccess.value = null
    availableInputs.value = []
    availableOutputs.value = []
    isInitialized.value = false
  }

  // Propriétés calculées
  const hasOutputs = computed(() => availableOutputs.value.length > 0)
  const hasInputs = computed(() => availableInputs.value.length > 0)
  const outputCount = computed(() => availableOutputs.value.length)
  const inputCount = computed(() => availableInputs.value.length)

  // Getters pour les sorties
  const getOutputById = computed(() => (id) => {
    return findMidiOutput(id)
  })

  const getOutputByName = computed(() => (name) => {
    return availableOutputs.value.find(output => output.name === name) || null
  })

  const getDefaultOutput = computed(() => {
    return availableOutputs.value.length > 0 ? availableOutputs.value[0] : null
  })

  return {
    // État
    midiAccess,
    availableInputs,
    availableOutputs,
    isInitialized,
    midiSupported,
    lastError,

    // Propriétés calculées
    hasOutputs,
    hasInputs,
    outputCount,
    inputCount,

    // Getters
    getOutputById,
    getOutputByName,
    getDefaultOutput,

    // Fonctions principales
    initializeMidi,
    sendMidiMessage,
    sendControlChange,
    sendProgramChange,
    sendBankSelect,
    sendNoteOn,
    sendNoteOff,
    testMidiOutput,
    getAllNotesOff,
    resetAllControllers,

    // Utilitaires
    findMidiOutput,
    debugMidiOutputs,
    updateAvailableDevices,
    cleanup
  }
}