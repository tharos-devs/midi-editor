// composables/useMidiManager.js - Version avec logging amélioré
import { ref, reactive, computed, onMounted, onUnmounted, readonly } from 'vue'
import { ElMessage } from 'element-plus'

// État global pour les périphériques MIDI
const midiAccess = ref(null)
const midiInputs = ref([])
const midiOutputs = ref([])
const midiSupported = ref(false)
const isInitialized = ref(false)

// Cache pour les noms de ports détectés
const portNameCache = reactive(new Map())

// Statistiques de connexion
const midiStats = reactive({
  connectedInputs: 0,
  connectedOutputs: 0,
  totalMessages: 0,
  lastActivity: null
})

// Contexte pour les logs (sera rempli par l'application)
const logContext = reactive({
  trackName: 'Inconnue',
  trackNumber: 1,
  instrumentName: 'Instrument',
  channel: 0
})

export function useMidiManager() {
  // Fonction pour détecter le vrai nom d'un port MIDI sur macOS
  function detectRealPortName(port) {
    if (portNameCache.has(port.id)) {
      return portNameCache.get(port.id)
    }

    let detectedName = port.name || `Port ${port.id}`

    try {
      if (port.displayName && port.displayName !== port.name) {
        detectedName = port.displayName
      }
      else if (port.manufacturer && port.version) {
        const manufacturerInfo = port.manufacturer.trim()
        const versionInfo = port.version.trim()

        if (manufacturerInfo && manufacturerInfo !== 'Unknown' && manufacturerInfo !== 'Apple Inc.') {
          detectedName = `${manufacturerInfo} ${port.name}`
        } else if (versionInfo && versionInfo !== port.name) {
          detectedName = versionInfo
        }
      }
      else if (port.connection && port.state) {
        const portKeys = Object.getOwnPropertyNames(port)
        for (const key of portKeys) {
          if (key.includes('name') || key.includes('display') || key.includes('title')) {
            try {
              const value = port[key]
              if (typeof value === 'string' && value !== port.name && value.length > 0) {
                detectedName = value
                break
              }
            } catch (e) {
              // Propriété non accessible
            }
          }
        }
      }

      if (detectedName === port.name && port.id) {
        const idParts = port.id.split(/[-_\s]+/)
        for (const part of idParts) {
          if (part.length > 3 &&
            !part.match(/^\d+$/) &&
            !part.toLowerCase().includes('bus') &&
            !part.toLowerCase().includes('port')) {
            detectedName = part
            break
          }
        }
      }

    } catch (error) {
      console.error('❌ Erreur lors de la détection du nom du port MIDI:', error)
    }

    detectedName = cleanPortName(detectedName)
    portNameCache.set(port.id, detectedName)

    return detectedName
  }

  function cleanPortName(name) {
    if (!name) return 'Port Inconnu'

    let cleanName = name.trim()

    const replacements = [
      { pattern: /^Bus\s*(\d+)$/i, replacement: (match, num) => `Bus MIDI ${num}` },
      { pattern: /^Port\s*(\d+)$/i, replacement: (match, num) => `Port MIDI ${num}` },
      { pattern: /^IAC\s*Driver\s*/i, replacement: '' },
      { pattern: /^CoreMIDI\s*/i, replacement: '' },
      { pattern: /\s*\(.*?\)\s*$/g, replacement: '' },
    ]

    for (const { pattern, replacement } of replacements) {
      if (typeof replacement === 'function') {
        cleanName = cleanName.replace(pattern, replacement)
      } else {
        cleanName = cleanName.replace(pattern, replacement)
      }
    }

    return cleanName.trim() || 'Port MIDI'
  }

  async function refreshPortNames() {
    if (!midiAccess.value) return

    portNameCache.clear()
    await new Promise(resolve => setTimeout(resolve, 100))
    updateMidiDevices()

    ElMessage.success('Noms des ports MIDI actualisés')
  }

  async function initializeMidi() {
    try {
      if (!navigator.requestMIDIAccess) {
        midiSupported.value = false
        return false
      }

      midiSupported.value = true

      midiAccess.value = await navigator.requestMIDIAccess({
        sysex: false
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      updateMidiDevices()
      setupMidiListeners()

      isInitialized.value = true

      ElMessage.success(`MIDI initialisé: ${midiOutputs.value.length} sorties, ${midiInputs.value.length} entrées`)

      return true
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation MIDI:', error)
      midiSupported.value = false
      ElMessage.error('Impossible d\'accéder aux périphériques MIDI')
      return false
    }
  }

  function updateMidiDevices() {
    if (!midiAccess.value) return

    const outputs = []
    for (const output of midiAccess.value.outputs.values()) {
      const detectedName = detectRealPortName(output)

      outputs.push({
        id: output.id,
        name: detectedName,
        originalName: output.name,
        manufacturer: output.manufacturer || 'Inconnu',
        state: output.state,
        connection: output.connection,
        type: 'output',
        port: output
      })
    }
    midiOutputs.value = outputs

    const inputs = []
    for (const input of midiAccess.value.inputs.values()) {
      const detectedName = detectRealPortName(input)

      inputs.push({
        id: input.id,
        name: detectedName,
        originalName: input.name,
        manufacturer: input.manufacturer || 'Inconnu',
        state: input.state,
        connection: input.connection,
        type: 'input',
        port: input
      })
    }
    midiInputs.value = inputs

    updateStats()
  }

  function updateStats() {
    midiStats.connectedInputs = midiInputs.value.filter(d => d.state === 'connected').length
    midiStats.connectedOutputs = midiOutputs.value.filter(d => d.state === 'connected').length
  }

  function setupMidiListeners() {
    if (!midiAccess.value) return

    midiAccess.value.onstatechange = async (event) => {
      await new Promise(resolve => setTimeout(resolve, 100))

      if (portNameCache.has(event.port.id)) {
        portNameCache.delete(event.port.id)
      }

      updateMidiDevices()

      const detectedName = detectRealPortName(event.port)
      const isConnected = event.port.state === 'connected'
      const deviceType = event.port.type === 'input' ? 'entrée' : 'sortie'
      const message = isConnected
        ? `Périphérique MIDI connecté: ${detectedName} (${deviceType})`
        : `Périphérique MIDI déconnecté: ${detectedName} (${deviceType})`

      ElMessage.info(message)
    }

    // Configurer les écouteurs pour les messages entrants avec le nouveau système de logging
    midiInputs.value.forEach(input => {
      if (input.port) {
        input.port.onmidimessage = (event) => {
          midiStats.totalMessages++
          midiStats.lastActivity = new Date()
        }
      }
    })
  }

  // Fonctions d'envoi avec logging amélioré
  function getOutputById(id) {
    if (id === 'default' && midiOutputs.value.length > 0) {
      return midiOutputs.value[0]
    }
    return midiOutputs.value.find(output => output.id === id)
  }

  function getInputById(id) {
    return midiInputs.value.find(input => input.id === id)
  }

  function sendMidiMessage(outputId, message, timestamp = null) {
    const output = getOutputById(outputId)
    if (!output || !output.port) {
      console.warn(`❌ Périphérique de sortie MIDI non trouvé: ${outputId}`)
      return false
    }

    try {
      if (timestamp) {
        output.port.send(message, timestamp)
      } else {
        output.port.send(message)
      }

      return true
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi du message MIDI:', error)
      return false
    }
  }

  function sendNote(outputId, channel, note, velocity, duration = 500) {
    const noteOn = [0x90 + channel, note, velocity]
    const noteOff = [0x80 + channel, note, 0]

    if (sendMidiMessage(outputId, noteOn)) {
      setTimeout(() => {
        sendMidiMessage(outputId, noteOff)
      }, duration)
      return true
    }
    return false
  }

  function sendProgramChange(outputId, channel, program) {
    const message = [0xC0 + channel, program]
    return sendMidiMessage(outputId, message)
  }

  function sendControlChange(outputId, channel, controller, value) {
    const message = [0xB0 + channel, controller, value]
    return sendMidiMessage(outputId, message)
  }

  function sendBankSelect(outputId, channel, bank) {
    sendControlChange(outputId, channel, 0, Math.floor(bank / 128))
    sendControlChange(outputId, channel, 32, bank % 128)
  }

  function testConnection(outputId, channel = 0) {
    return sendNote(outputId, channel, 60, 80, 500)
  }

  async function refreshDevices() {
    if (!midiSupported.value) {
      return await initializeMidi()
    }

    await refreshPortNames()
    return true
  }

  function cleanup() {
    if (midiAccess.value) {
      midiAccess.value.onstatechange = null

      midiInputs.value.forEach(input => {
        if (input.port) {
          input.port.onmidimessage = null
        }
      })
    }

    portNameCache.clear()
  }

  // Getters calculés
  const hasConnectedOutputs = computed(() =>
    midiOutputs.value.some(output => output.state === 'connected')
  )

  const hasConnectedInputs = computed(() =>
    midiInputs.value.some(input => input.state === 'connected')
  )

  const availableOutputs = computed(() =>
    midiOutputs.value.filter(output => output.state === 'connected')
  )

  const availableInputs = computed(() =>
    midiInputs.value.filter(input => input.state === 'connected')
  )

  const midiStatus = computed(() => {
    if (!midiSupported.value) return 'unsupported'
    if (!isInitialized.value) return 'initializing'
    if (midiOutputs.value.length === 0) return 'no-devices'
    if (!hasConnectedOutputs.value) return 'disconnected'
    return 'connected'
  })

  const midiStatusText = computed(() => {
    switch (midiStatus.value) {
      case 'unsupported': return 'MIDI non supporté'
      case 'initializing': return 'Initialisation...'
      case 'no-devices': return 'Aucun périphérique'
      case 'disconnected': return 'Déconnecté'
      case 'connected': return 'Connecté'
      default: return 'Inconnu'
    }
  })

  onMounted(() => {
    initializeMidi()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    // État
    midiAccess: readonly(midiAccess),
    midiInputs: readonly(midiInputs),
    midiOutputs: readonly(midiOutputs),
    midiSupported: readonly(midiSupported),
    isInitialized: readonly(isInitialized),
    midiStats: readonly(midiStats),

    // Getters
    hasConnectedOutputs,
    hasConnectedInputs,
    availableOutputs,
    availableInputs,
    midiStatus,
    midiStatusText,

    // Actions
    initializeMidi,
    updateMidiDevices,
    refreshDevices,
    refreshPortNames,
    getOutputById,
    getInputById,
    sendMidiMessage,
    sendNote,
    sendProgramChange,
    sendControlChange,
    sendBankSelect,
    testConnection,
    cleanup
  }
}

// Utilitaires MIDI
export const MidiUtils = {
  noteNumberToName(noteNumber) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const octave = Math.floor(noteNumber / 12) - 1
    const noteName = noteNames[noteNumber % 12]
    return `${noteName}${octave}`
  },

  noteNameToNumber(noteName) {
    const noteNames = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 }
    const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/)
    if (!match) return null

    const [, note, octave] = match
    return (parseInt(octave) + 1) * 12 + noteNames[note]
  },

  getControllerName(ccNumber) {
    const controllerNames = {
      0: 'Bank Select MSB',
      1: 'Modulation',
      2: 'Breath Controller',
      4: 'Foot Controller',
      5: 'Portamento Time',
      6: 'Data Entry MSB',
      7: 'Volume',
      8: 'Balance',
      10: 'Pan',
      11: 'Expression',
      32: 'Bank Select LSB',
      64: 'Sustain Pedal',
      65: 'Portamento',
      66: 'Sostenuto',
      67: 'Soft Pedal',
      68: 'Legato Footswitch',
      69: 'Hold 2',
      120: 'All Sound Off',
      121: 'Reset All Controllers',
      122: 'Local Control',
      123: 'All Notes Off'
    }
    return controllerNames[ccNumber] || `CC ${ccNumber}`
  },

  validateChannel(channel) {
    return Math.max(0, Math.min(15, Math.floor(channel)))
  },

  validateMidiValue(value) {
    return Math.max(0, Math.min(127, Math.floor(value)))
  }
}