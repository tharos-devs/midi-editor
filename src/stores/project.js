// stores/project.js - Store principal du projet avec sauvegarde/chargement
import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import ProjectFileManager from '@/services/ProjectFileManager'
import MidiImporter from '@/services/MidiFileImporter'
import { useMidiStore } from '@/stores/midi'

export const useProjectStore = defineStore('project', () => {
  // Services
  const projectFileManager = new ProjectFileManager()
  const midiImporter = new MidiImporter()
  const midiStore = useMidiStore()

  // ==========================================
  // ÉTAT DU PROJET
  // ==========================================
  
  // Métadonnées du projet
  const projectMetadata = ref({
    version: "1.0.0",
    created: null,
    modified: null,
    name: "",
    description: "",
    tags: [],
    author: "",
    bpm: 120,
    timeSignature: [4, 4],
    keySignature: "C"
  })

  // État de l'interface utilisateur
  const uiState = ref({
    timeline: {
      zoom: 1.0,
      scrollX: 0,
      scrollY: 0,
      playheadPosition: 0,
      snapToGrid: true,
      gridSize: 0.25,
      viewMode: "notes"
    },
    panels: {
      trackList: { width: 300, visible: true },
      pianoRoll: { height: 400, visible: true },
      mixer: { width: 250, visible: false },
      inspector: { width: 200, visible: true }
    },
    selectedItems: {
      trackId: null,
      noteIds: [],
      ccIds: []
    },
    windows: []
  })

  // Préférences utilisateur
  const userPreferences = ref({
    playback: {
      metronome: true,
      countIn: 2,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0
    },
    display: {
      theme: "dark",
      noteColors: "velocity",
      showNoteNames: true,
      showGrid: true,
      rulers: {
        showSignatureRuler: true,
        showMarkerRuler: false
      }
    },
    keyboard: {
      octave: 4,
      velocity: 80,
      recordingMode: "replace"
    },
    automation: {
      defaultCCNumber: 7,
      smoothing: true,
      resolution: "high"
    }
  })

  // Marqueurs et régions
  const markers = ref([])

  // Paramètres audio
  const audioSettings = ref({
    sampleRate: 44100,
    bufferSize: 512,
    outputDevice: "default",
    inputDevice: null,
    latency: 128
  })

  // État de chargement et modifications
  const isLoaded = ref(false)
  const hasUnsavedChanges = ref(false)
  const currentFilename = ref('')
  const lastSavedDate = ref(null)

  // ==========================================
  // COMPUTED PROPERTIES
  // ==========================================

  const projectTitle = computed(() => {
    const name = projectMetadata.value.name || 'Projet sans nom'
    const unsaved = hasUnsavedChanges.value ? ' *' : ''
    return name + unsaved
  })

  const projectDuration = computed(() => {
    return midiStore.getTotalDuration || 0
  })

  const projectStats = computed(() => {
    return {
      tracks: midiStore.getTrackCount,
      notes: midiStore.getNoteCount,
      controlChanges: midiStore.getControlChangeCount,
      duration: projectDuration.value,
      bpm: projectMetadata.value.bpm
    }
  })

  // Computed pour les rulers
  const rulersVisibility = computed(() => userPreferences.value.display?.rulers || { showSignatureRuler: true, showMarkerRuler: false })
  const showSignatureRuler = computed(() => userPreferences.value.display?.rulers?.showSignatureRuler ?? true)
  const showMarkerRuler = computed(() => userPreferences.value.display?.rulers?.showMarkerRuler ?? false)

  // ==========================================
  // WATCHERS POUR DÉTECTER LES CHANGEMENTS
  // ==========================================

  // Surveiller les changements dans le store MIDI
  watch(
    () => midiStore.lastModified,
    () => {
      if (isLoaded.value) {
        markAsModified()
      }
    }
  )

  // Surveiller les changements dans l'UI
  watch(
    uiState,
    () => {
      if (isLoaded.value) {
        markAsModified()
      }
    },
    { deep: true }
  )

  // Surveiller les changements dans les préférences
  watch(
    userPreferences,
    () => {
      if (isLoaded.value) {
        markAsModified()
      }
    },
    { deep: true }
  )

  // ==========================================
  // ACTIONS PRINCIPALES
  // ==========================================

  /**
   * Crée un nouveau projet vide
   */
  async function createNewProject(name = "Nouveau Projet") {
    try {
      // Créer un projet vide
      const emptyProject = projectFileManager.createEmptyProject(name)
      
      // Charger les données dans les stores
      await loadProjectData(emptyProject)
      
      // Marquer comme non modifié (nouveau projet)
      hasUnsavedChanges.value = false
      currentFilename.value = ''
      lastSavedDate.value = null
      
      // S'assurer qu'il y a un point tempo par défaut
      if (midiStore.tempoEvents.length === 0) {
        console.log('🎵 Ajout point tempo par défaut lors création projet')
        midiStore.addTempoEvent({
          time: 0.0,
          bpm: 120,
          ticks: 0
        })
      }
      
      // S'assurer qu'il y a les CC par défaut (CC1, CC7, CC11) pour la piste 0
      if (midiStore.tracks.length > 0) {
        const trackId = midiStore.tracks[0].id
        const defaultCCs = [
          { controller: 1, name: 'Modulation' },
          { controller: 7, name: 'Volume' }, 
          { controller: 11, name: 'Expression' }
        ]
        
        defaultCCs.forEach(({ controller, name }) => {
          const existingCC = midiStore.midiCC.find(cc => 
            parseInt(cc.trackId) === parseInt(trackId) && cc.controller === controller
          )
          
          if (!existingCC) {
            console.log(`🎛️ Ajout CC${controller} (${name}) par défaut pour piste ${trackId}`)
            midiStore.addCC({
              trackId: trackId,
              controller: controller,
              time: 0.0,
              value: 64,
              channel: midiStore.tracks[0].channel || 0
            })
          }
        })
        
        // CORRECTION: Sélectionner automatiquement la première piste
        console.log('🎯 Sélection automatique de la première piste lors du nouveau projet')
        midiStore.selectTrack(trackId)
      }
      
      // Debug: Vérifier l'état final
      await nextTick() // Attendre que la réactivité se propage
      console.log('🚨 DEBUG Après nouveau projet:', {
        projectIsLoaded: isLoaded.value,
        midiStoreIsLoaded: midiStore.isLoaded,
        tracksCount: midiStore.tracks?.length || 0,
        selectedTrack: midiStore.selectedTrack,
        hasTimeSignatureEvents: midiStore.timeSignatureEvents?.length || 0,
        hasTempoEvents: midiStore.tempoEvents?.length || 0,
        canSave: canSave.value,
        canSaveAs: canSaveAs.value,
        midiInfo: midiStore.midiInfo
      })
      
      console.log(`✅ Nouveau projet "${name}" créé`)
      
      return {
        success: true,
        message: `Nouveau projet "${name}" créé avec succès`
      }
    } catch (error) {
      console.error('Erreur lors de la création du projet:', error)
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Import MIDI et création d'un nouveau projet
   */
  async function importMidiAsNewProject(arrayBuffer, filename) {
    try {
      // Importer les données MIDI
      const importResult = await midiImporter.importFromFile(arrayBuffer, filename)
      
      if (!importResult.success) {
        throw new Error(importResult.message)
      }

      // Debug: vérifier les CC directement après l'import
      console.log('📊 APRÈS IMPORT MIDI - CC count:', importResult.data.midiCC?.length || 0)
      if (importResult.data.midiCC?.length > 0) {
        console.log('📊 Premiers CC de l\'import:')
        importResult.data.midiCC.slice(0, 3).forEach((cc, i) => {
          console.log(`  CC #${i}: controller=${cc.controller}, time=${cc.time}s, value=${cc.value}`)
        })
      }

      // Créer un projet basé sur les données MIDI
      const projectName = filename.replace(/\.(mid|midi)$/i, '')
      const projectData = {
        metadata: {
          name: projectName,
          description: `Projet créé à partir du fichier MIDI "${filename}"`,
          tags: ["midi-import"],
          bpm: importResult.data.midiInfo.tempo,
          timeSignature: importResult.data.midiInfo.timeSignature,
          keySignature: importResult.data.midiInfo.keySignature
        },
        midiData: importResult.data,
        uiState: projectFileManager.getDefaultUIState(),
        userPreferences: projectFileManager.getDefaultUserPreferences(),
        markers: [],
        audioSettings: projectFileManager.getDefaultAudioSettings()
      }

      // Charger le projet (indiquer que c'est un import MIDI)
      await loadProjectData(projectData, true)
      
      // Marquer comme non sauvegardé
      hasUnsavedChanges.value = true
      currentFilename.value = ''
      
      console.log(`✅ Projet créé à partir de "${filename}"`)
      
      return {
        success: true,
        message: `Projet créé à partir de "${filename}" avec succès`
      }
    } catch (error) {
      console.error('Erreur lors de l\'import:', error)
      return {
        success: false,
        message: `Erreur d'import: ${error.message}`
      }
    }
  }

  /**
   * Sauvegarde le projet actuel
   */
  async function saveProject(filename = null) {
    try {
      if (!isLoaded.value) {
        throw new Error('Aucun projet chargé')
      }

      // Utiliser le nom de fichier actuel si pas de nouveau nom
      const saveFilename = filename || currentFilename.value || projectMetadata.value.name || 'projet'
      
      // Construire les données du projet
      const projectData = {
        metadata: {
          ...projectMetadata.value,
          modified: new Date().toISOString()
        },
        midiData: {
          midiInfo: midiStore.midiInfo,
          tracks: midiStore.tracks,
          notes: midiStore.notes,
          midiCC: midiStore.midiCC,
          tempoEvents: midiStore.tempoEvents,
          timeSignatureEvents: midiStore.timeSignatureEvents,
          keySignatureEvents: midiStore.keySignatureEvents
        },
        uiState: uiState.value,
        userPreferences: userPreferences.value,
        markers: markers.value,
        audioSettings: audioSettings.value
      }

      // Sauvegarder avec le gestionnaire de fichiers
      const result = await projectFileManager.saveProject(projectData, saveFilename)
      
      if (result.success) {
        hasUnsavedChanges.value = false
        currentFilename.value = saveFilename
        lastSavedDate.value = new Date()
        projectMetadata.value.modified = new Date().toISOString()
      }
      
      return result
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      return {
        success: false,
        message: `Erreur de sauvegarde: ${error.message}`
      }
    }
  }

  /**
   * Sauvegarde sous un nouveau nom
   */
  async function saveProjectAs(filename) {
    return await saveProject(filename)
  }

  /**
   * Charge un projet depuis un fichier
   */
  async function loadProject(file) {
    try {
      // Charger avec le gestionnaire de fichiers
      const result = await projectFileManager.loadProject(file)
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      // Charger les données dans les stores
      await loadProjectData(result.data)
      
      // Mettre à jour l'état
      hasUnsavedChanges.value = false
      currentFilename.value = file.name.replace(/\.myproject$/i, '')
      lastSavedDate.value = new Date(result.data.metadata.modified)
      
      console.log(`✅ Projet "${file.name}" chargé`)
      
      return {
        success: true,
        message: `Projet "${file.name}" chargé avec succès`
      }
    } catch (error) {
      console.error('Erreur lors du chargement:', error)
      return {
        success: false,
        message: `Erreur de chargement: ${error.message}`
      }
    }
  }

  /**
   * Charge les données d'un projet dans les stores
   * @param {Object} projectData - Données du projet
   * @param {boolean} isFromMidiImport - True si c'est un import MIDI direct (pas .myproject)
   */
  async function loadProjectData(projectData, isFromMidiImport = false) {
    // Réinitialiser le store MIDI
    midiStore.resetStore()
    
    // Charger les métadonnées
    projectMetadata.value = {
      version: projectData.metadata.version || "1.0.0",
      created: projectData.metadata.created || new Date().toISOString(),
      modified: projectData.metadata.modified || new Date().toISOString(),
      name: projectData.metadata.name || "Projet sans nom",
      description: projectData.metadata.description || "",
      tags: projectData.metadata.tags || [],
      author: projectData.metadata.author || "",
      bpm: projectData.metadata.bpm || 120,
      timeSignature: projectData.metadata.timeSignature || [4, 4],
      keySignature: projectData.metadata.keySignature || "C"
    }
    
    // Charger les données MIDI dans le store
    if (projectData.midiData) {
      midiStore.midiInfo = projectData.midiData.midiInfo || projectData.midiData.info || {}
      midiStore.tracks = projectData.midiData.tracks || []
      midiStore.notes = projectData.midiData.notes || []
      midiStore.midiCC = projectData.midiData.midiCC || projectData.midiData.controlChanges || []
      
      // Debug: Analyser les CC chargés
      if (midiStore.midiCC.length > 0) {
        if (isFromMidiImport) {
          console.log('🎵 🚨 CC chargés depuis IMPORT MIDI 🚨')
        } else {
          console.log('🎛️ 🚨 CC chargés depuis .myproject 🚨')
        }
        console.log(`Total CC: ${midiStore.midiCC.length}`)
        console.log('Premiers CC:')
        midiStore.midiCC.slice(0, 5).forEach((cc, i) => {
          console.log(`  CC #${i}: controller=${cc.controller || cc.number}, time=${cc.time}s, value=${cc.value}, trackId=${cc.trackId}`)
        })
        
        // Debug spécifique pour les CC à 127 (mesure 2)
        const highValueCC = midiStore.midiCC.filter(cc => cc.value >= 120)
        if (highValueCC.length > 0) {
          console.log('🎯 CC proches de 127 (mesure 2):')
          highValueCC.slice(0, 5).forEach((cc, i) => {
            console.log(`  CC127 #${i}: time=${cc.time}s, value=${cc.value}, expectedTime=1.000s, diff=${((cc.time - 1.0) * 1000).toFixed(1)}ms`)
          })
        }
        
        if (!isFromMidiImport) {
          console.log('⚠️ Correction temporelle DÉSACTIVÉE - utilisation des temps bruts (.myproject)')
        } else {
          console.log('✅ Import MIDI - pas de correction temporelle nécessaire')
        }
      }
      midiStore.tempoEvents = projectData.midiData.tempoEvents || []
      midiStore.timeSignatureEvents = projectData.midiData.timeSignatureEvents || []
      midiStore.keySignatureEvents = projectData.midiData.keySignatureEvents || []
      
      // Mettre à jour l'état du store MIDI
      midiStore.isLoaded = true
      midiStore.filename = projectMetadata.value.name
      
      // Sélectionner la première piste si disponible
      if (midiStore.tracks.length > 0) {
        const trackId = midiStore.tracks[0].id
        midiStore.selectTrack(trackId)
        console.log('🎵 Piste sélectionnée automatiquement:', {
          trackId: trackId,
          trackName: midiStore.tracks[0].name,
          selectedTrackAfter: midiStore.selectedTrack,
          tracksArray: midiStore.tracks.map(t => ({ id: t.id, name: t.name }))
        })
        
        // Attendre le prochain tick pour s'assurer que la réactivité s'est propagée
        await nextTick()
        console.log('🔄 Après nextTick - selectedTrack:', midiStore.selectedTrack)
      } else {
        console.warn('⚠️ Aucune piste disponible pour la sélection automatique')
      }
      
      // Forcer la réactivité
      midiStore.triggerReactivity()
    }
    
    // Charger l'état de l'UI
    uiState.value = {
      ...projectFileManager.getDefaultUIState(),
      ...projectData.uiState
    }
    
    // Synchroniser la sélection entre les stores
    if (projectData.uiState?.selectedItems) {
      midiStore.selectedTrack = projectData.uiState.selectedItems.trackId || midiStore.selectedTrack
      if (projectData.uiState.selectedItems.noteIds && projectData.uiState.selectedItems.noteIds.length > 0) {
        midiStore.selectedNote = projectData.uiState.selectedItems.noteIds[0]
      }
    }
    
    // Charger les préférences utilisateur
    userPreferences.value = {
      ...projectFileManager.getDefaultUserPreferences(),
      ...projectData.userPreferences
    }
    
    // Charger les marqueurs
    markers.value = projectData.markers || []
    
    // Charger les paramètres audio
    audioSettings.value = {
      ...projectFileManager.getDefaultAudioSettings(),
      ...projectData.audioSettings
    }
    
    // Marquer comme chargé
    isLoaded.value = true
    
    console.log(`📊 Projet chargé: ${midiStore.tracks.length} pistes, ${midiStore.notes.length} notes`)
  }

  /**
   * Ferme le projet actuel
   */
  async function closeProject() {
    try {
      // Vérifier les modifications non sauvegardées
      if (hasUnsavedChanges.value) {
        const shouldSave = await confirmSaveBeforeClose()
        if (shouldSave === null) {
          return { success: false, message: 'Fermeture annulée' }
        }
        if (shouldSave && !(await saveProject()).success) {
          return { success: false, message: 'Erreur lors de la sauvegarde' }
        }
      }
      
      // Réinitialiser tous les stores
      resetProject()
      
      console.log('✅ Projet fermé')
      
      return {
        success: true,
        message: 'Projet fermé avec succès'
      }
    } catch (error) {
      console.error('Erreur lors de la fermeture:', error)
      return {
        success: false,
        message: `Erreur: ${error.message}`
      }
    }
  }

  /**
   * Réinitialise complètement le projet
   */
  function resetProject() {
    // Réinitialiser le store MIDI
    midiStore.resetStore()
    
    // Réinitialiser les métadonnées
    projectMetadata.value = {
      version: "1.0.0",
      created: null,
      modified: null,
      name: "",
      description: "",
      tags: [],
      author: "",
      bpm: 120,
      timeSignature: [4, 4],
      keySignature: "C"
    }
    
    // Réinitialiser l'état UI
    uiState.value = projectFileManager.getDefaultUIState()
    
    // Réinitialiser les préférences
    userPreferences.value = projectFileManager.getDefaultUserPreferences()
    
    // Réinitialiser les autres données
    markers.value = []
    audioSettings.value = projectFileManager.getDefaultAudioSettings()
    
    // Réinitialiser l'état
    isLoaded.value = false
    hasUnsavedChanges.value = false
    currentFilename.value = ''
    lastSavedDate.value = null
  }

  /**
   * Marque le projet comme modifié
   */
  function markAsModified() {
    hasUnsavedChanges.value = true
    projectMetadata.value.modified = new Date().toISOString()
  }

  // ==========================================
  // ACTIONS DE L'INTERFACE UTILISATEUR
  // ==========================================

  /**
   * Met à jour l'état de la timeline
   */
  function updateTimelineState(updates) {
    uiState.value.timeline = {
      ...uiState.value.timeline,
      ...updates
    }
    markAsModified()
  }

  /**
   * Met à jour l'état des panneaux
   */
  function updatePanelState(panelName, updates) {
    if (uiState.value.panels[panelName]) {
      uiState.value.panels[panelName] = {
        ...uiState.value.panels[panelName],
        ...updates
      }
      markAsModified()
    }
  }

  /**
   * Met à jour la sélection
   */
  function updateSelection(selection) {
    uiState.value.selectedItems = {
      ...uiState.value.selectedItems,
      ...selection
    }
    
    // Synchroniser avec le store MIDI
    if (selection.trackId !== undefined) {
      midiStore.selectedTrack = selection.trackId
    }
    if (selection.noteIds && selection.noteIds.length > 0) {
      midiStore.selectedNote = selection.noteIds[0]
    }
    
    markAsModified()
  }

  /**
   * Ajoute un marqueur
   */
  function addMarker(time, name, color = '#4ECDC4') {
    const marker = {
      id: `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name || `Marqueur ${markers.value.length + 1}`,
      time: time,
      color: color
    }
    
    markers.value.push(marker)
    markers.value.sort((a, b) => a.time - b.time)
    
    markAsModified()
    return marker.id
  }

  /**
   * Supprime un marqueur
   */
  function removeMarker(markerId) {
    const index = markers.value.findIndex(m => m.id === markerId)
    if (index !== -1) {
      markers.value.splice(index, 1)
      markAsModified()
      return true
    }
    return false
  }

  /**
   * Met à jour un marqueur existant
   */
  function updateMarker(markerId, updates) {
    const marker = markers.value.find(m => m.id === markerId)
    if (marker) {
      Object.assign(marker, updates)
      if (updates.time !== undefined) {
        // Trier à nouveau si le temps a changé
        markers.value.sort((a, b) => a.time - b.time)
      }
      markAsModified()
      return true
    }
    return false
  }

  /**
   * Met à jour les préférences utilisateur
   */
  function updateUserPreferences(category, updates) {
    if (userPreferences.value[category]) {
      userPreferences.value[category] = {
        ...userPreferences.value[category],
        ...updates
      }
      markAsModified()
    }
  }

  // Fonctions spécifiques pour les rulers
  function toggleSignatureRuler() {
    // S'assurer que la structure existe
    if (!userPreferences.value.display.rulers) {
      userPreferences.value.display.rulers = { showSignatureRuler: true, showMarkerRuler: false }
    }
    userPreferences.value.display.rulers.showSignatureRuler = !userPreferences.value.display.rulers.showSignatureRuler
    markAsModified()
    console.log('🎼 Signature ruler:', userPreferences.value.display.rulers.showSignatureRuler ? 'visible' : 'masqué')
  }

  function toggleMarkerRuler() {
    // S'assurer que la structure existe
    if (!userPreferences.value.display.rulers) {
      userPreferences.value.display.rulers = { showSignatureRuler: true, showMarkerRuler: false }
    }
    userPreferences.value.display.rulers.showMarkerRuler = !userPreferences.value.display.rulers.showMarkerRuler
    markAsModified()
    console.log('📍 Marker ruler:', userPreferences.value.display.rulers.showMarkerRuler ? 'visible' : 'masqué')
  }

  function setRulersVisibility(rulersConfig) {
    userPreferences.value.display.rulers = {
      ...userPreferences.value.display.rulers,
      ...rulersConfig
    }
    markAsModified()
  }

  /**
   * Met à jour les métadonnées du projet
   */
  function updateProjectMetadata(updates) {
    projectMetadata.value = {
      ...projectMetadata.value,
      ...updates,
      modified: new Date().toISOString()
    }
    markAsModified()
  }

  // ==========================================
  // UTILITAIRES ET DIALOGUES
  // ==========================================

  /**
   * Vérifie s'il y a des modifications non sauvegardées
   */
  function checkUnsavedChanges() {
    return hasUnsavedChanges.value
  }

  /**
   * Dialogue de confirmation pour sauvegarder avant fermeture
   */
  async function confirmSaveBeforeClose() {
    return new Promise((resolve) => {
      const result = window.confirm(
        `Le projet "${projectMetadata.value.name}" a des modifications non sauvegardées.\n\n` +
        'Voulez-vous sauvegarder avant de fermer ?\n\n' +
        'OK = Sauvegarder\n' +
        'Annuler = Fermer sans sauvegarder'
      )
      resolve(result)
    })
  }

  /**
   * Obtient des informations sur un fichier projet
   */
  async function getProjectFileInfo(file) {
    return await projectFileManager.getProjectInfo(file)
  }

  /**
   * Export des données MIDI uniquement
   */
  async function exportMidiData(filename) {
    if (!isLoaded.value) {
      return {
        success: false,
        message: 'Aucun projet chargé'
      }
    }

    const midiData = {
      midiInfo: midiStore.midiInfo,
      tracks: midiStore.tracks,
      notes: midiStore.notes,
      midiCC: midiStore.midiCC,
      tempoEvents: midiStore.tempoEvents,
      timeSignatureEvents: midiStore.timeSignatureEvents,
      keySignatureEvents: midiStore.keySignatureEvents
    }

    return await projectFileManager.exportMidiDataOnly(midiData, filename || 'export-midi')
  }

  // ==========================================
  // GETTERS COMPUTED AVANCÉS
  // ==========================================

  const canSave = computed(() => {
    // Permettre la sauvegarde si il y a du contenu MIDI (même pour un nouveau projet avec pistes vides)
    return midiStore.isLoaded || (midiStore.tracks && midiStore.tracks.length > 0)
  })

  const canSaveAs = computed(() => {
    // Permettre "Sauvegarder sous" dès qu'il y a du contenu
    return midiStore.isLoaded || (midiStore.tracks && midiStore.tracks.length > 0)
  })

  const projectInfo = computed(() => {
    if (!isLoaded.value) return null
    
    return {
      name: projectMetadata.value.name,
      filename: currentFilename.value,
      hasUnsavedChanges: hasUnsavedChanges.value,
      lastSaved: lastSavedDate.value,
      created: projectMetadata.value.created,
      modified: projectMetadata.value.modified,
      stats: projectStats.value
    }
  })

  const recentMarkers = computed(() => {
    return markers.value
      .slice()
      .sort((a, b) => b.time - a.time)
      .slice(0, 5)
  })

  // ==========================================
  // GESTION DES RACCOURCIS CLAVIER
  // ==========================================

  /**
   * Gestionnaire de raccourcis clavier
   */
  function handleKeyboardShortcut(event) {
    const { ctrlKey, metaKey, key } = event
    const isCtrl = ctrlKey || metaKey

    if (isCtrl) {
      switch (key.toLowerCase()) {
        case 'n':
          event.preventDefault()
          createNewProject()
          break
        case 'o':
          event.preventDefault()
          // Déclencher l'ouverture de fichier
          document.dispatchEvent(new CustomEvent('project:open'))
          break
        case 's':
          event.preventDefault()
          if (event.shiftKey) {
            // Ctrl+Shift+S = Sauvegarder sous
            document.dispatchEvent(new CustomEvent('project:saveAs'))
          } else {
            // Ctrl+S = Sauvegarder
            saveProject()
          }
          break
        case 'w':
          event.preventDefault()
          closeProject()
          break
      }
    }
  }

  // ==========================================
  // RETURN DU STORE
  // ==========================================

  return {
    // État réactif
    projectMetadata,
    uiState,
    userPreferences,
    markers,
    audioSettings,
    isLoaded,
    hasUnsavedChanges,
    currentFilename,
    lastSavedDate,

    // Computed properties
    projectTitle,
    projectDuration,
    projectStats,
    canSave,
    canSaveAs,
    projectInfo,
    recentMarkers,
    rulersVisibility,
    showSignatureRuler,
    showMarkerRuler,

    // Actions principales
    createNewProject,
    importMidiAsNewProject,
    saveProject,
    saveProjectAs,
    loadProject,
    closeProject,
    resetProject,
    markAsModified,

    // Actions UI
    updateTimelineState,
    updatePanelState,
    updateSelection,
    addMarker,
    removeMarker,
    updateMarker,
    updateUserPreferences,
    updateProjectMetadata,
    toggleSignatureRuler,
    toggleMarkerRuler,
    setRulersVisibility,

    // Utilitaires
    checkUnsavedChanges,
    getProjectFileInfo,
    exportMidiData,
    handleKeyboardShortcut,

    // Services (pour accès direct si nécessaire)
    projectFileManager,
    midiImporter
  }
})