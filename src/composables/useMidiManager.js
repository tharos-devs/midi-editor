// composables/useMidiManager.js - Version corrigée pour macOS
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
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

export function useMidiManager() {
  
  // Fonction pour détecter le vrai nom d'un port MIDI sur macOS
  function detectRealPortName(port) {
    // Si le nom est déjà en cache, l'utiliser
    if (portNameCache.has(port.id)) {
      return portNameCache.get(port.id)
    }

    let detectedName = port.name || `Port ${port.id}`

    // Méthodes de détection pour macOS
    try {
      // Méthode 1 : Utiliser displayName si disponible (Safari/Chrome récents)
      if (port.displayName && port.displayName !== port.name) {
        detectedName = port.displayName
      }
      
      // Méthode 2 : Parser les informations du manufacturer/version
      else if (port.manufacturer && port.version) {
        // Essayer de construire un nom plus informatif
        const manufacturerInfo = port.manufacturer.trim()
        const versionInfo = port.version.trim()
        
        if (manufacturerInfo && manufacturerInfo !== 'Unknown' && manufacturerInfo !== 'Apple Inc.') {
          detectedName = `${manufacturerInfo} ${port.name}`
        } else if (versionInfo && versionInfo !== port.name) {
          detectedName = versionInfo
        }
      }
      
      // Méthode 3 : Analyser les propriétés étendues du port
      else if (port.connection && port.state) {
        // Tenter d'accéder aux propriétés internes (Chrome/Edge)
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

      // Méthode 4 : Utiliser une heuristique basée sur l'ID du port
      if (detectedName === port.name && port.id) {
        // Sur macOS, l'ID peut contenir des informations utiles
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
      console.warn('Erreur lors de la détection du nom du port MIDI:', error)
    }

    // Nettoyer le nom détecté
    detectedName = cleanPortName(detectedName)
    
    // Mettre en cache le résultat
    portNameCache.set(port.id, detectedName)
    
    return detectedName
  }

  // Fonction pour nettoyer et améliorer les noms de ports
  function cleanPortName(name) {
    if (!name) return 'Port Inconnu'
    
    let cleanName = name.trim()
    
    // Remplacer les patterns courants non informatifs
    const replacements = [
      { pattern: /^Bus\s*(\d+)$/i, replacement: (match, num) => `Bus MIDI ${num}` },
      { pattern: /^Port\s*(\d+)$/i, replacement: (match, num) => `Port MIDI ${num}` },
      { pattern: /^IAC\s*Driver\s*/i, replacement: '' },
      { pattern: /^CoreMIDI\s*/i, replacement: '' },
      { pattern: /\s*\(.*?\)\s*$/g, replacement: '' }, // Enlever les parenthèses finales
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

  // Fonction pour forcer la re-détection des noms de ports
  async function refreshPortNames() {
    if (!midiAccess.value) return
    
    // Vider le cache
    portNameCache.clear()
    
    // Petit délai pour laisser le système se mettre à jour
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Re-scanner les périphériques
    updateMidiDevices()
    
    ElMessage.success('Noms des ports MIDI actualisés')
  }

  // Initialisation du Web MIDI API
  async function initializeMidi() {
    try {
      if (!navigator.requestMIDIAccess) {
        console.warn('Web MIDI API non supportée par ce navigateur')
        midiSupported.value = false
        return false
      }

      midiSupported.value = true
      
      // Demander l'accès MIDI avec sysex pour plus d'informations
      midiAccess.value = await navigator.requestMIDIAccess({
        sysex: false // Laisser à false pour la compatibilité
      })
      
      // Délai pour laisser le système initialiser complètement
      await new Promise(resolve => setTimeout(resolve, 200))
      
      updateMidiDevices()
      setupMidiListeners()
      
      isInitialized.value = true
      
      ElMessage.success(`MIDI initialisé: ${midiOutputs.value.length} sorties, ${midiInputs.value.length} entrées`)
      
      return true
    } catch (error) {
      console.error('Erreur lors de l\'initialisation MIDI:', error)
      midiSupported.value = false
      ElMessage.error('Impossible d\'accéder aux périphériques MIDI')
      return false
    }
  }

  // Mettre à jour la liste des périphériques avec détection de noms
  function updateMidiDevices() {
    if (!midiAccess.value) return

    // Périphériques de sortie
    const outputs = []
    for (const output of midiAccess.value.outputs.values()) {
      const detectedName = detectRealPortName(output)
      
      outputs.push({
        id: output.id,
        name: detectedName,
        originalName: output.name, // Garder le nom original pour debug
        manufacturer: output.manufacturer || 'Inconnu',
        state: output.state,
        connection: output.connection,
        type: 'output',
        port: output
      })
    }
    midiOutputs.value = outputs

    // Périphériques d'entrée
    const inputs = []
    for (const input of midiAccess.value.inputs.values()) {
      const detectedName = detectRealPortName(input)
      
      inputs.push({
        id: input.id,
        name: detectedName,
        originalName: input.name, // Garder le nom original pour debug
        manufacturer: input.manufacturer || 'Inconnu',
        state: input.state,
        connection: input.connection,
        type: 'input',
        port: input
      })
    }
    midiInputs.value = inputs

    updateStats()
    
    // Debug : afficher les noms détectés vs originaux
    console.log('Ports MIDI détectés:')
    const ioDevices = [...outputs, ...inputs]
    ioDevices.forEach(device => {
      if (device.name !== device.originalName) {
        console.log(`  ${device.type}: "${device.originalName}" → "${device.name}"`)
      } else {
        console.log(`  ${device.type}: "${device.name}"`)
      }
    })
  }

  // Mettre à jour les statistiques
  function updateStats() {
    midiStats.connectedInputs = midiInputs.value.filter(d => d.state === 'connected').length
    midiStats.connectedOutputs = midiOutputs.value.filter(d => d.state === 'connected').length
  }

  // Configurer les écouteurs d'événements MIDI
  function setupMidiListeners() {
    if (!midiAccess.value) return

    // Écouter les changements d'état des périphériques
    midiAccess.value.onstatechange = async (event) => {
      console.log(`Changement d'état MIDI: ${event.port.name} - ${event.port.state}`)
      
      // Petit délai pour laisser le système se stabiliser
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Invalider le cache pour ce port
      if (portNameCache.has(event.port.id)) {
        portNameCache.delete(event.port.id)
      }
      
      updateMidiDevices()
      
      // Notification à l'utilisateur avec le nom détecté
      const detectedName = detectRealPortName(event.port)
      const isConnected = event.port.state === 'connected'
      const deviceType = event.port.type === 'input' ? 'entrée' : 'sortie'
      const message = isConnected 
        ? `Périphérique MIDI connecté: ${detectedName} (${deviceType})`
        : `Périphérique MIDI déconnecté: ${detectedName} (${deviceType})`
      
      ElMessage.info(message)
    }

    // Écouter les messages MIDI entrants (pour statistiques)
    midiInputs.value.forEach(input => {
      if (input.port) {
        input.port.onmidimessage = (event) => {
          midiStats.totalMessages++
          midiStats.lastActivity = new Date()
          
          // Ici on pourrait traiter les messages MIDI entrants
          console.log('Message MIDI reçu:', event.data)
        }
      }
    })
  }

  // Obtenir un périphérique de sortie par ID
  function getOutputById(id) {
    if (id === 'default' && midiOutputs.value.length > 0) {
      return midiOutputs.value[0]
    }
    return midiOutputs.value.find(output => output.id === id)
  }

  // Obtenir un périphérique d'entrée par ID
  function getInputById(id) {
    return midiInputs.value.find(input => input.id === id)
  }

  // Envoyer un message MIDI
  function sendMidiMessage(outputId, message, timestamp = null) {
    const output = getOutputById(outputId)
    if (!output || !output.port) {
      console.warn(`Périphérique de sortie MIDI non trouvé: ${outputId}`)
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
      console.error('Erreur lors de l\'envoi du message MIDI:', error)
      return false
    }
  }

  // Envoyer une note MIDI
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

  // Envoyer un changement de programme
  function sendProgramChange(outputId, channel, program) {
    const message = [0xC0 + channel, program]
    return sendMidiMessage(outputId, message)
  }

  // Envoyer un changement de contrôle
  function sendControlChange(outputId, channel, controller, value) {
    const message = [0xB0 + channel, controller, value]
    return sendMidiMessage(outputId, message)
  }

  // Envoyer une sélection de banque
  function sendBankSelect(outputId, channel, bank) {
    // Bank Select MSB (CC 0)
    sendControlChange(outputId, channel, 0, Math.floor(bank / 128))
    // Bank Select LSB (CC 32)
    sendControlChange(outputId, channel, 32, bank % 128)
  }

  // Tester la connexion avec une note
  function testConnection(outputId, channel = 0) {
    return sendNote(outputId, channel, 60, 80, 500) // Do central
  }

  // Actualiser les périphériques
  async function refreshDevices() {
    if (!midiSupported.value) {
      return await initializeMidi()
    }
    
    await refreshPortNames()
    return true
  }

  // Nettoyer les ressources
  function cleanup() {
    if (midiAccess.value) {
      midiAccess.value.onstatechange = null
      
      // Nettoyer les écouteurs d'entrée
      midiInputs.value.forEach(input => {
        if (input.port) {
          input.port.onmidimessage = null
        }
      })
    }
    
    // Vider le cache des noms
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

  // Auto-initialisation
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
    refreshPortNames, // NOUVELLE FONCTION
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

// Utilitaires MIDI (inchangés)
export const MidiUtils = {
  // Convertir un numéro de note en nom
  noteNumberToName(noteNumber) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const octave = Math.floor(noteNumber / 12) - 1
    const noteName = noteNames[noteNumber % 12]
    return `${noteName}${octave}`
  },

  // Convertir un nom de note en numéro
  noteNameToNumber(noteName) {
    const noteNames = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 }
    const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/)
    if (!match) return null
    
    const [, note, octave] = match
    return (parseInt(octave) + 1) * 12 + noteNames[note]
  },

  // Obtenir le nom d'un contrôleur MIDI
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

  // Valider un canal MIDI (0-15)
  validateChannel(channel) {
    return Math.max(0, Math.min(15, Math.floor(channel)))
  },

  // Valider une valeur MIDI (0-127)
  validateMidiValue(value) {
    return Math.max(0, Math.min(127, Math.floor(value)))
  }
}