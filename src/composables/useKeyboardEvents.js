// composables/useKeyboardEvents.js - Gestion centralisée des événements clavier
import { ref, onMounted, onUnmounted } from 'vue'

// Store global des listeners
const keyboardListeners = new Map()
const globalKeyboardState = ref({
  isEnabled: true,
  activeModifiers: {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  },
  lastPressed: null,
  pressedAt: null
})

// Types de contextes pour les priorités
const CONTEXTS = {
  GLOBAL: 0,      // Raccourcis globaux (transport, etc.)
  EDITOR: 10,     // Édition de notes, grille piano
  MODAL: 20,      // Modals, dialogs
  INPUT: 30       // Champs de saisie (priorité max)
}

export function useKeyboardEvents() {
  // État local du composable
  const localListeners = new Map()
  
  // Gestionnaire global des événements (un seul par application)
  function handleGlobalKeyDown(event) {
    if (!globalKeyboardState.value.isEnabled) return
    
    // Éviter les conflits avec les champs de saisie
    const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
                          event.target.contentEditable === 'true'
    
    // Si un input est focus, ne pas traiter l'événement du tout
    // sauf si c'est explicitement demandé par le listener
    if (isInputFocused) {
      console.log('🔍 useKeyboardEvents: Input focusé, laissant passer', event.key)
      return // Laisser l'input gérer l'événement normalement
    }
    
    // Mettre à jour l'état des modificateurs
    globalKeyboardState.value.activeModifiers = {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey
    }
    
    globalKeyboardState.value.lastPressed = event.code
    globalKeyboardState.value.pressedAt = Date.now()
    
    // Créer la clé de l'événement
    const eventKey = createEventKey(event)
    
    // Trouver tous les listeners pour cette clé, triés par contexte (priorité)
    const matchingListeners = []
    for (const [key, listener] of keyboardListeners.entries()) {
      if (key.startsWith(eventKey + '::')) {
        matchingListeners.push(listener)
      }
    }
    
    // Trier par contexte (priorité décroissante)
    matchingListeners.sort((a, b) => b.context - a.context)
    
    // Exécuter le premier listener qui peut traiter l'événement
    for (const listener of matchingListeners) {
      // Vérifier les conditions du listener
      if (listener.condition && !listener.condition(event, globalKeyboardState.value)) {
        continue
      }
      
      // Exécuter le callback
      try {
        const result = listener.callback(event, globalKeyboardState.value)
        
        // Si le listener retourne true, arrêter la propagation
        if (result === true || listener.stopPropagation) {
          event.preventDefault()
          event.stopPropagation()
          break
        }
      } catch (error) {
        console.error('🔥 Erreur dans le listener clavier:', error, listener)
      }
    }
  }
  
  // Gestionnaire pour keyup (mettre à jour les modificateurs)
  function handleGlobalKeyUp(event) {
    globalKeyboardState.value.activeModifiers = {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey
    }
  }
  
  // Créer une clé unique pour l'événement
  function createEventKey(event) {
    const modifiers = []
    if (event.ctrlKey) modifiers.push('ctrl')
    if (event.altKey) modifiers.push('alt')
    if (event.shiftKey) modifiers.push('shift')
    if (event.metaKey) modifiers.push('meta')
    
    const modifierKey = modifiers.length > 0 ? modifiers.join('+') + '+' : ''
    return modifierKey + event.code
  }
  
  // Enregistrer un listener
  function onKey(keyCombo, callback, options = {}) {
    const config = {
      context: options.context || CONTEXTS.GLOBAL,
      condition: options.condition || null,
      ignoreInputs: options.ignoreInputs !== false, // true par défaut
      stopPropagation: options.stopPropagation || false,
      description: options.description || '',
      callback
    }
    
    // Créer une clé unique pour ce listener
    const listenerKey = `${keyCombo}::${Date.now()}::${Math.random()}`
    
    // Stocker dans les maps globale et locale
    keyboardListeners.set(listenerKey, config)
    localListeners.set(listenerKey, config)
    
    // console.log('⌨️  Raccourci enregistré:', keyCombo, config.description)
    
    // Retourner une fonction de nettoyage
    return () => {
      keyboardListeners.delete(listenerKey)
      localListeners.delete(listenerKey)
      // console.log('⌨️  Raccourci supprimé:', keyCombo)
    }
  }
  
  // Raccourcis pour les touches communes
  const shortcuts = {
    space: (callback, options) => onKey('Space', callback, options),
    enter: (callback, options) => onKey('Enter', callback, options),
    escape: (callback, options) => onKey('Escape', callback, options),
    
    // Transport
    play: (callback, options) => onKey('Space', callback, { description: 'Play/Pause', ...options }),
    stop: (callback, options) => onKey('KeyS', callback, { description: 'Stop', ...options }),
    rewind: (callback, options) => onKey('KeyR', callback, { description: 'Rewind', ...options }),
    loop: (callback, options) => onKey('KeyL', callback, { description: 'Toggle Loop', ...options }),
    marker: (callback, options) => onKey('KeyP', callback, { description: 'Toggle Playback Marker', ...options }),
    record: (callback, options) => onKey('KeyF', callback, { description: 'Toggle Record Armed', ...options }),
    
    // Navigation
    seekLeft: (callback, options) => onKey('shift+ArrowLeft', callback, { description: 'Seek -5s', ...options }),
    seekRight: (callback, options) => onKey('shift+ArrowRight', callback, { description: 'Seek +5s', ...options }),
    
    // Édition
    undo: (callback, options) => onKey('ctrl+KeyZ', callback, { description: 'Undo', ...options }),
    redo: (callback, options) => onKey('ctrl+KeyY', callback, { description: 'Redo', ...options }),
    save: (callback, options) => onKey('ctrl+KeyS', callback, { description: 'Save', ...options }),
    
    // Sélection
    selectAll: (callback, options) => onKey('ctrl+KeyA', callback, { description: 'Select All', ...options }),
    copy: (callback, options) => onKey('ctrl+KeyC', callback, { description: 'Copy', ...options }),
    paste: (callback, options) => onKey('ctrl+KeyV', callback, { description: 'Paste', ...options }),
    cut: (callback, options) => onKey('ctrl+KeyX', callback, { description: 'Cut', ...options }),
    
    // Suppression
    delete: (callback, options) => onKey('Delete', callback, { description: 'Delete', ...options }),
    backspace: (callback, options) => onKey('Backspace', callback, { description: 'Backspace', ...options })
  }
  
  // Utilitaires
  function enable() {
    globalKeyboardState.value.isEnabled = true
    // console.log('⌨️  Événements clavier activés')
  }
  
  function disable() {
    globalKeyboardState.value.isEnabled = false
    // console.log('⌨️  Événements clavier désactivés')
  }
  
  function getActiveShortcuts() {
    const shortcuts = []
    for (const [key, listener] of keyboardListeners.entries()) {
      const [keyCombo] = key.split('::')
      shortcuts.push({
        key: keyCombo,
        description: listener.description,
        context: listener.context
      })
    }
    return shortcuts.sort((a, b) => a.key.localeCompare(b.key))
  }
  
  // Installation du gestionnaire global (une seule fois)
  onMounted(() => {
    // Vérifier si les listeners globaux sont déjà installés
    if (!document._keyboardEventsInstalled) {
      document.addEventListener('keydown', handleGlobalKeyDown, true)
      document.addEventListener('keyup', handleGlobalKeyUp, true)
      document._keyboardEventsInstalled = true
      // console.log('⌨️  Gestionnaire global des événements clavier installé')
    }
  })
  
  // Nettoyage des listeners locaux
  onUnmounted(() => {
    // Supprimer tous les listeners locaux
    for (const key of localListeners.keys()) {
      keyboardListeners.delete(key)
    }
    localListeners.clear()
    // console.log('⌨️  Listeners locaux nettoyés')
  })
  
  return {
    // API principale
    onKey,
    shortcuts,
    
    // Utilitaires
    enable,
    disable,
    getActiveShortcuts,
    
    // État
    state: globalKeyboardState,
    
    // Contextes pour les priorités
    CONTEXTS
  }
}