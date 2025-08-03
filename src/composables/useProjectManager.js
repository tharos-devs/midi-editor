// composables/useProjectManager.js - Composable pour la gestion de projets
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'

export function useProjectManager() {
  const projectStore = useProjectStore()
  
  // État réactif pour l'interface
  const isOperationInProgress = ref(false)
  const operationStatus = ref('')
  const operationProgress = ref(0)

  // ==========================================
  // ACTIONS DE MENU
  // ==========================================

  /**
   * Nouveau projet
   */
  async function handleNewProject() {
    try {
      isOperationInProgress.value = true
      operationStatus.value = 'Création du nouveau projet...'
      operationProgress.value = 50

      // Vérifier les modifications non sauvegardées
      if (projectStore.hasUnsavedChanges) {
        const shouldContinue = await confirmUnsavedChanges('créer un nouveau projet')
        if (!shouldContinue) {
          return { success: false, message: 'Création annulée' }
        }
      }

      operationProgress.value = 80
      const result = await projectStore.createNewProject()
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Ouvrir un projet
   */
  async function handleOpenProject() {
    try {
      // Vérifier les modifications non sauvegardées
      if (projectStore.hasUnsavedChanges) {
        const shouldContinue = await confirmUnsavedChanges('ouvrir un autre projet')
        if (!shouldContinue) {
          return { success: false, message: 'Ouverture annulée' }
        }
      }

      // Ouvrir le sélecteur de fichier
      const file = await openProjectFileSelector()
      if (!file) {
        return { success: false, message: 'Aucun fichier sélectionné' }
      }

      isOperationInProgress.value = true
      operationStatus.value = 'Chargement du projet...'
      operationProgress.value = 30

      // Charger le projet
      operationProgress.value = 70
      const result = await projectStore.loadProject(file)
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Sauvegarder le projet
   */
  async function handleSaveProject() {
    try {
      if (!projectStore.canSave) {
        return { 
          success: false, 
          message: 'Aucune modification à sauvegarder' 
        }
      }

      isOperationInProgress.value = true
      operationStatus.value = 'Sauvegarde en cours...'
      operationProgress.value = 50

      const result = await projectStore.saveProject()
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Sauvegarder sous un nouveau nom
   */
  async function handleSaveAsProject() {
    try {
      if (!projectStore.canSaveAs) {
        return { 
          success: false, 
          message: 'Aucun projet à sauvegarder' 
        }
      }

      // Demander le nom du fichier
      const filename = await promptForFilename(projectStore.projectMetadata.name)
      if (!filename) {
        return { success: false, message: 'Sauvegarde annulée' }
      }

      isOperationInProgress.value = true
      operationStatus.value = 'Sauvegarde sous nouveau nom...'
      operationProgress.value = 50

      const result = await projectStore.saveProjectAs(filename)
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Importer un fichier MIDI
   */
  async function handleImportMidi() {
    try {
      // Vérifier les modifications non sauvegardées
      if (projectStore.hasUnsavedChanges) {
        const shouldContinue = await confirmUnsavedChanges('importer un fichier MIDI')
        if (!shouldContinue) {
          return { success: false, message: 'Import annulé' }
        }
      }

      // Ouvrir le sélecteur de fichier MIDI
      const file = await openMidiFileSelector()
      if (!file) {
        return { success: false, message: 'Aucun fichier sélectionné' }
      }

      isOperationInProgress.value = true
      operationStatus.value = 'Lecture du fichier MIDI...'
      operationProgress.value = 20

      // Lire le fichier
      const arrayBuffer = await readFileAsArrayBuffer(file)
      
      operationStatus.value = 'Import et création du projet...'
      operationProgress.value = 60

      // Importer et créer le projet
      const result = await projectStore.importMidiAsNewProject(arrayBuffer, file.name)
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Fermer le projet
   */
  async function handleCloseProject() {
    try {
      isOperationInProgress.value = true
      operationStatus.value = 'Fermeture du projet...'
      operationProgress.value = 50

      const result = await projectStore.closeProject()
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Exporter les données MIDI
   */
  async function handleExportMidi() {
    try {
      if (!projectStore.isLoaded) {
        return { 
          success: false, 
          message: 'Aucun projet chargé' 
        }
      }

      const filename = await promptForFilename(
        projectStore.projectMetadata.name + '-export',
        'Nom du fichier d\'export'
      )
      
      if (!filename) {
        return { success: false, message: 'Export annulé' }
      }

      isOperationInProgress.value = true
      operationStatus.value = 'Export des données MIDI...'
      operationProgress.value = 50

      const result = await projectStore.exportMidiData(filename)
      
      operationProgress.value = 100
      setTimeout(() => {
        isOperationInProgress.value = false
        operationStatus.value = ''
        operationProgress.value = 0
      }, 500)

      return result
    } catch (error) {
      isOperationInProgress.value = false
      operationStatus.value = ''
      operationProgress.value = 0
      
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  // ==========================================
  // UTILITAIRES DE DIALOGUE
  // ==========================================

  /**
   * Dialogue de confirmation pour modifications non sauvegardées
   */
  async function confirmUnsavedChanges(action) {
    return new Promise((resolve) => {
      const result = window.confirm(
        `Le projet "${projectStore.projectMetadata.name}" a des modifications non sauvegardées.\n\n` +
        `Voulez-vous vraiment ${action} ?\n\n` +
        'Les modifications non sauvegardées seront perdues.'
      )
      resolve(result)
    })
  }

  /**
   * Sélecteur de fichier projet
   */
  function openProjectFileSelector() {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.myproject'
      input.multiple = false

      input.onchange = (event) => {
        const file = event.target.files[0]
        resolve(file || null)
      }

      input.oncancel = () => {
        resolve(null)
      }

      input.click()
    })
  }

  /**
   * Sélecteur de fichier MIDI
   */
  function openMidiFileSelector() {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.mid,.midi'
      input.multiple = false

      input.onchange = (event) => {
        const file = event.target.files[0]
        resolve(file || null)
      }

      input.oncancel = () => {
        resolve(null)
      }

      input.click()
    })
  }

  /**
   * Demande le nom d'un fichier
   */
  async function promptForFilename(defaultName = '', title = 'Nom du fichier') {
    return new Promise((resolve) => {
      const filename = window.prompt(title, defaultName)
      resolve(filename && filename.trim() ? filename.trim() : null)
    })
  }

  /**
   * Lit un fichier comme ArrayBuffer
   */
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve(event.target.result)
      reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'))
      reader.readAsArrayBuffer(file)
    })
  }

  // ==========================================
  // GESTION DES MARQUEURS
  // ==========================================

  /**
   * Ajouter un marqueur à la position actuelle
   */
  async function addMarkerAtCurrentPosition(time = null) {
    const position = time !== null ? time : projectStore.uiState.timeline.playheadPosition
    const name = await promptForFilename(`Marqueur ${projectStore.markers.length + 1}`, 'Nom du marqueur')
    
    if (!name) {
      return { success: false, message: 'Ajout de marqueur annulé' }
    }

    const markerId = projectStore.addMarker(position, name)
    
    return {
      success: true,
      message: `Marqueur "${name}" ajouté à ${position.toFixed(2)}s`,
      markerId
    }
  }

  /**
   * Aller à un marqueur
   */
  function goToMarker(markerId) {
    const marker = projectStore.markers.find(m => m.id === markerId)
    if (marker) {
      projectStore.updateTimelineState({ playheadPosition: marker.time })
      return true
    }
    return false
  }

  // ==========================================
  // INFO ET STATISTIQUES
  // ==========================================

  /**
   * Obtient des informations détaillées sur le projet
   */
  const detailedProjectInfo = computed(() => {
    if (!projectStore.isLoaded) return null

    return {
      basic: projectStore.projectInfo,
      metadata: projectStore.projectMetadata,
      stats: {
        ...projectStore.projectStats,
        markers: projectStore.markers.length,
        lastModified: projectStore.projectMetadata.modified,
        created: projectStore.projectMetadata.created
      },
      ui: {
        timeline: projectStore.uiState.timeline,
        selectedTrack: projectStore.uiState.selectedItems.trackId,
        selectedNotes: projectStore.uiState.selectedItems.noteIds.length
      }
    }
  })

  /**
   * Obtient les raccourcis clavier disponibles
   */
  const keyboardShortcuts = computed(() => [
    { key: 'Ctrl+N', action: 'Nouveau projet', handler: handleNewProject },
    { key: 'Ctrl+O', action: 'Ouvrir projet', handler: handleOpenProject },
    { key: 'Ctrl+S', action: 'Sauvegarder', handler: handleSaveProject },
    { key: 'Ctrl+Shift+S', action: 'Sauvegarder sous', handler: handleSaveAsProject },
    { key: 'Ctrl+I', action: 'Importer MIDI', handler: handleImportMidi },
    { key: 'Ctrl+W', action: 'Fermer projet', handler: handleCloseProject }
  ])

  // ==========================================
  // ÉTAT COMPUTED POUR L'INTERFACE
  // ==========================================

  const menuState = computed(() => ({
    canNew: !isOperationInProgress.value,
    canOpen: !isOperationInProgress.value,
    canSave: projectStore.canSave && !isOperationInProgress.value,
    canSaveAs: projectStore.canSaveAs && !isOperationInProgress.value,
    canClose: projectStore.isLoaded && !isOperationInProgress.value,
    canImportMidi: !isOperationInProgress.value,
    canExportMidi: projectStore.isLoaded && !isOperationInProgress.value
  }))

  const statusInfo = computed(() => ({
    isLoaded: projectStore.isLoaded,
    hasUnsavedChanges: projectStore.hasUnsavedChanges,
    projectName: projectStore.projectTitle,
    operationInProgress: isOperationInProgress.value,
    operationStatus: operationStatus.value,
    operationProgress: operationProgress.value
  }))

  // ==========================================
  // RETURN DU COMPOSABLE
  // ==========================================

  return {
    // État réactif
    isOperationInProgress,
    operationStatus,
    operationProgress,

    // Actions principales
    handleNewProject,
    handleOpenProject,
    handleSaveProject,
    handleSaveAsProject,
    handleImportMidi,
    handleCloseProject,
    handleExportMidi,

    // Gestion des marqueurs
    addMarkerAtCurrentPosition,
    goToMarker,

    // Computed properties
    detailedProjectInfo,
    keyboardShortcuts,
    menuState,
    statusInfo,

    // Utilitaires
    confirmUnsavedChanges,
    openProjectFileSelector,
    openMidiFileSelector,
    promptForFilename,

    // Accès au store pour usage avancé
    projectStore
  }
}

// ==============================================
// COMPOSABLE POUR LES PARAMÈTRES UI
// ==============================================

export function useProjectUI() {
  const projectStore = useProjectStore()

  /**
   * Gestion de la timeline
   */
  const timeline = computed({
    get: () => projectStore.uiState.timeline,
    set: (value) => projectStore.updateTimelineState(value)
  })

  /**
   * Gestion des panneaux
   */
  function togglePanel(panelName) {
    const panel = projectStore.uiState.panels[panelName]
    if (panel) {
      projectStore.updatePanelState(panelName, { visible: !panel.visible })
    }
  }

  function resizePanel(panelName, dimension, size) {
    projectStore.updatePanelState(panelName, { [dimension]: size })
  }

  /**
   * Gestion de la sélection
   */
  function selectTrack(trackId) {
    projectStore.updateSelection({ trackId, noteIds: [], ccIds: [] })
  }

  function selectNotes(noteIds) {
    projectStore.updateSelection({ noteIds })
  }

  function selectControlChanges(ccIds) {
    projectStore.updateSelection({ ccIds })
  }

  function clearSelection() {
    projectStore.updateSelection({ trackId: null, noteIds: [], ccIds: [] })
  }

  /**
   * Navigation temporelle
   */
  function setPlayheadPosition(time) {
    projectStore.updateTimelineState({ playheadPosition: time })
  }

  function setZoom(zoom) {
    projectStore.updateTimelineState({ zoom: Math.max(0.1, Math.min(10, zoom)) })
  }

  function setScrollPosition(scrollX, scrollY) {
    projectStore.updateTimelineState({ scrollX, scrollY })
  }

  /**
   * Configuration de la grille
   */
  function setGridSize(size) {
    projectStore.updateTimelineState({ gridSize: size })
  }

  function toggleSnapToGrid() {
    projectStore.updateTimelineState({ 
      snapToGrid: !projectStore.uiState.timeline.snapToGrid 
    })
  }

  function setViewMode(mode) {
    projectStore.updateTimelineState({ viewMode: mode })
  }

  return {
    // État réactif
    timeline,
    panels: computed(() => projectStore.uiState.panels),
    selection: computed(() => projectStore.uiState.selectedItems),

    // Actions des panneaux
    togglePanel,
    resizePanel,

    // Actions de sélection
    selectTrack,
    selectNotes,
    selectControlChanges,
    clearSelection,

    // Navigation
    setPlayheadPosition,
    setZoom,
    setScrollPosition,

    // Configuration
    setGridSize,
    toggleSnapToGrid,
    setViewMode,

    // Store pour accès direct
    projectStore
  }
}

// ==============================================
// COMPOSABLE POUR LES PRÉFÉRENCES
// ==============================================

export function useProjectPreferences() {
  const projectStore = useProjectStore()

  /**
   * Préférences de lecture
   */
  const playbackPrefs = computed({
    get: () => projectStore.userPreferences.playback,
    set: (value) => projectStore.updateUserPreferences('playback', value)
  })

  /**
   * Préférences d'affichage
   */
  const displayPrefs = computed({
    get: () => projectStore.userPreferences.display,
    set: (value) => projectStore.updateUserPreferences('display', value)
  })

  /**
   * Préférences du clavier
   */
  const keyboardPrefs = computed({
    get: () => projectStore.userPreferences.keyboard,
    set: (value) => projectStore.updateUserPreferences('keyboard', value)
  })

  /**
   * Préférences d'automation
   */
  const automationPrefs = computed({
    get: () => projectStore.userPreferences.automation,
    set: (value) => projectStore.updateUserPreferences('automation', value)
  })

  /**
   * Actions spécifiques
   */
  function toggleMetronome() {
    const current = projectStore.userPreferences.playback.metronome
    projectStore.updateUserPreferences('playback', { metronome: !current })
  }

  function setTheme(theme) {
    projectStore.updateUserPreferences('display', { theme })
  }

  function setNoteColorMode(mode) {
    projectStore.updateUserPreferences('display', { noteColors: mode })
  }

  function setDefaultOctave(octave) {
    projectStore.updateUserPreferences('keyboard', { octave: Math.max(0, Math.min(10, octave)) })
  }

  function setDefaultVelocity(velocity) {
    projectStore.updateUserPreferences('keyboard', { velocity: Math.max(1, Math.min(127, velocity)) })
  }

  function setDefaultCCNumber(ccNumber) {
    projectStore.updateUserPreferences('automation', { defaultCCNumber: Math.max(0, Math.min(127, ccNumber)) })
  }

  return {
    // Préférences réactives
    playbackPrefs,
    displayPrefs,
    keyboardPrefs,
    automationPrefs,

    // Actions rapides
    toggleMetronome,
    setTheme,
    setNoteColorMode,
    setDefaultOctave,
    setDefaultVelocity,
    setDefaultCCNumber,

    // Store pour accès direct
    projectStore
  }
}

// ==============================================
// EXEMPLE D'UTILISATION DANS UN COMPOSANT
// ==============================================

/*
// components/MenuBar.vue
<template>
  <div class="menu-bar">
    <!-- Indicateur de statut -->
    <div class="status-indicator">
      <span v-if="statusInfo.isLoaded" class="project-name">
        {{ statusInfo.projectName }}
      </span>
      <span v-if="statusInfo.operationInProgress" class="operation-status">
        {{ statusInfo.operationStatus }} ({{ statusInfo.operationProgress }}%)
      </span>
    </div>

    <!-- Menu Fichier -->
    <div class="menu-section">
      <button 
        @click="handleNewProject" 
        :disabled="!menuState.canNew"
        title="Ctrl+N"
      >
        <Icon name="file-plus" />
        Nouveau
      </button>
      
      <button 
        @click="handleOpenProject" 
        :disabled="!menuState.canOpen"
        title="Ctrl+O"
      >
        <Icon name="folder-open" />
        Ouvrir
      </button>
      
      <button 
        @click="handleSaveProject" 
        :disabled="!menuState.canSave"
        title="Ctrl+S"
        :class="{ 'has-changes': statusInfo.hasUnsavedChanges }"
      >
        <Icon name="save" />
        Sauvegarder
      </button>
      
      <button 
        @click="handleSaveAsProject" 
        :disabled="!menuState.canSaveAs"
        title="Ctrl+Shift+S"
      >
        <Icon name="save-as" />
        Sauvegarder sous...
      </button>
    </div>

    <!-- Menu Import/Export -->
    <div class="menu-section">
      <button 
        @click="handleImportMidi" 
        :disabled="!menuState.canImportMidi"
        title="Ctrl+I"
      >
        <Icon name="upload" />
        Importer MIDI
      </button>
      
      <button 
        @click="handleExportMidi" 
        :disabled="!menuState.canExportMidi"
      >
        <Icon name="download" />
        Exporter MIDI
      </button>
    </div>

    <!-- Progression si opération en cours -->
    <div v-if="statusInfo.operationInProgress" class="progress-bar">
      <div 
        class="progress-fill" 
        :style="{ width: `${statusInfo.operationProgress}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup>
import { useProjectManager } from '@/composables/useProjectManager'

const {
  handleNewProject,
  handleOpenProject,
  handleSaveProject,
  handleSaveAsProject,
  handleImportMidi,
  handleExportMidi,
  menuState,
  statusInfo
} = useProjectManager()

// Gestion des notifications
async function handleAction(actionFn, successMessage) {
  const result = await actionFn()
  
  if (result.success) {
    // Afficher notification de succès
    console.log('✅', successMessage || result.message)
  } else {
    // Afficher notification d'erreur
    console.error('❌', result.message)
  }
}
</script>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-right: auto;
}

.project-name {
  font-weight: bold;
  color: var(--text-primary);
}

.operation-status {
  font-size: 0.9em;
  color: var(--text-secondary);
}

.menu-section {
  display: flex;
  gap: 0.5rem;
}

button {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

button:hover:not(:disabled) {
  background: var(--bg-hover);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.has-changes {
  border-color: var(--accent-color);
  background: var(--accent-color-faded);
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--bg-secondary);
}

.progress-fill {
  height: 100%;
  background: var(--accent-color);
  transition: width 0.3s ease;
}
</style>
*/