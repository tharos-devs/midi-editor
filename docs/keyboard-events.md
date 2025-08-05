# 🎹 Système d'événements clavier centralisé

Le composable `useKeyboardEvents` fournit une gestion centralisée et élégante des raccourcis clavier dans l'application.

## 🚀 Utilisation de base

```vue
<script setup>
import { useKeyboardEvents } from '@/composables/useKeyboardEvents'

const keyboard = useKeyboardEvents()

// Configuration des raccourcis
onMounted(() => {
  // Raccourci simple
  keyboard.shortcuts.space(() => {
    console.log('Espace pressé!')
    return true // Arrête la propagation
  })
  
  // Raccourci avec conditions
  keyboard.shortcuts.save(() => {
    saveDocument()
    return true
  }, {
    condition: (event, state) => !state.isInputFocused,
    description: 'Sauvegarder le document'
  })
})
</script>
```

## 📋 Raccourcis pré-définis

### Transport
- `keyboard.shortcuts.play()` - Espace (Play/Pause)
- `keyboard.shortcuts.stop()` - S (Stop)
- `keyboard.shortcuts.rewind()` - R (Retour au début)
- `keyboard.shortcuts.loop()` - L (Toggle boucle)
- `keyboard.shortcuts.marker()` - P (Marqueur de position)

### Navigation
- `keyboard.shortcuts.seekLeft()` - Shift+Flèche gauche (Reculer 5s)
- `keyboard.shortcuts.seekRight()` - Shift+Flèche droite (Avancer 5s)

### Édition
- `keyboard.shortcuts.undo()` - Ctrl+Z
- `keyboard.shortcuts.redo()` - Ctrl+Y
- `keyboard.shortcuts.save()` - Ctrl+S
- `keyboard.shortcuts.copy()` - Ctrl+C
- `keyboard.shortcuts.paste()` - Ctrl+V
- `keyboard.shortcuts.cut()` - Ctrl+X
- `keyboard.shortcuts.selectAll()` - Ctrl+A

### Utilitaires
- `keyboard.shortcuts.delete()` - Delete
- `keyboard.shortcuts.backspace()` - Backspace
- `keyboard.shortcuts.enter()` - Enter
- `keyboard.shortcuts.escape()` - Escape

## 🛠️ API avancée

### Enregistrement manuel de raccourcis

```js
// Raccourci simple
const cleanup = keyboard.onKey('KeyF', () => {
  console.log('F pressé!')
})

// Avec modificateurs
keyboard.onKey('ctrl+alt+KeyD', () => {
  toggleDebugMode()
})

// Avec options avancées
keyboard.onKey('KeyE', callback, {
  context: keyboard.CONTEXTS.EDITOR,     // Priorité dans l'éditeur
  condition: (event, state) => !state.isModalOpen,
  ignoreInputs: true,                    // Ignorer si input focusé
  stopPropagation: true,                 // Arrêter la propagation
  description: 'Activer l\'édition'      // Description pour le debug
})

// Nettoyage manuel
cleanup()
```

### Contextes et priorités

```js
const { CONTEXTS } = keyboard

// Par ordre de priorité (décroissant)
CONTEXTS.INPUT    // 30 - Champs de saisie (priorité max)
CONTEXTS.MODAL    // 20 - Modals et dialogs  
CONTEXTS.EDITOR   // 10 - Éditeur de notes
CONTEXTS.GLOBAL   //  0 - Raccourcis globaux (défaut)
```

### Gestion d'état

```js
// État global
keyboard.state.value = {
  isEnabled: true,
  activeModifiers: { ctrl: false, alt: false, shift: false, meta: false },
  lastPressed: 'KeyP',
  pressedAt: 1640995200000
}

// Contrôles globaux
keyboard.enable()   // Activer tous les raccourcis
keyboard.disable()  // Désactiver tous les raccourcis

// Debug
keyboard.getActiveShortcuts() // Liste tous les raccourcis actifs
```

## 🔧 Exemples pratiques

### Composant d'édition

```vue
<script setup>
import { useKeyboardEvents } from '@/composables/useKeyboardEvents'

const keyboard = useKeyboardEvents()
const selectedNotes = ref([])

onMounted(() => {
  // Suppression de notes
  keyboard.shortcuts.delete(() => {
    if (selectedNotes.value.length > 0) {
      deleteSelectedNotes()
      return true
    }
    return false // Laisser passer si rien à supprimer
  }, {
    context: keyboard.CONTEXTS.EDITOR,
    description: 'Supprimer les notes sélectionnées'
  })
  
  // Duplication
  keyboard.onKey('ctrl+KeyD', () => {
    duplicateSelectedNotes()
    return true
  }, {
    context: keyboard.CONTEXTS.EDITOR,
    condition: () => selectedNotes.value.length > 0
  })
})
</script>
```

### Modal avec raccourcis

```vue
<script setup>
import { useKeyboardEvents } from '@/composables/useKeyboardEvents'

const keyboard = useKeyboardEvents()
const isModalOpen = ref(false)

watch(isModalOpen, (open) => {
  if (open) {
    // Raccourcis spécifiques au modal
    keyboard.shortcuts.escape(() => {
      closeModal()
      return true
    }, {
      context: keyboard.CONTEXTS.MODAL
    })
    
    keyboard.shortcuts.enter(() => {
      confirmModal()
      return true
    }, {
      context: keyboard.CONTEXTS.MODAL
    })
  }
})
</script>
```

## 🐛 Debug et diagnostics

```js
// Afficher tous les raccourcis actifs
console.table(keyboard.getActiveShortcuts())

// Surveiller l'état
watch(keyboard.state, (state) => {
  console.log('État clavier:', state)
})

// Les logs automatiques
// ⌨️  Raccourci enregistré: Space Play/Pause
// ⌨️  Gestionnaire global des événements clavier installé  
// ⌨️  Listeners locaux nettoyés
```

## ⚠️ Bonnes pratiques

1. **Nettoyage automatique** : Les listeners sont automatiquement nettoyés lors du démontage des composants
2. **Éviter les conflits** : Utiliser les `condition` pour éviter les conflits avec les inputs
3. **Priorités** : Utiliser les `CONTEXTS` pour gérer les priorités entre composants
4. **Descriptions** : Toujours ajouter des descriptions pour faciliter le debug
5. **Tests de condition** : Vérifier les conditions avant d'exécuter les actions

## 🔄 Migration depuis l'ancien système

**Avant :**
```js
function handleKeyPress(event) {
  if (event.code === 'Space') {
    event.preventDefault()
    playPause()
  }
}

document.addEventListener('keydown', handleKeyPress)
```

**Après :**
```js
const keyboard = useKeyboardEvents()

keyboard.shortcuts.play(() => {
  playPause()
  return true
})
```

## 🎯 Avantages

- ✅ **Gestion centralisée** des événements clavier
- ✅ **Priorités automatiques** selon le contexte
- ✅ **Nettoyage automatique** des listeners  
- ✅ **API simple et élégante**
- ✅ **Debug intégré** avec logs et état
- ✅ **Évite les conflits** entre composants
- ✅ **Support des modificateurs** (Ctrl, Alt, Shift, Meta)
- ✅ **Conditions flexibles** pour l'activation des raccourcis