// services/ProjectFileManager.js - Gestionnaire de fichiers projet propriétaires
export class ProjectFileManager {
  constructor() {
    this.currentVersion = "1.0.0"
    this.fileExtension = ".myproject"
    this.supportedVersions = ["1.0.0"]
  }

  /**
   * Sauvegarde un projet dans le format propriétaire
   * @param {Object} projectData - Données du projet
   * @param {string} filename - Nom du fichier (sans extension)
   * @returns {Promise<Object>} Résultat de la sauvegarde
   */
  async saveProject(projectData, filename) {
    try {
      // Construire le fichier projet
      const projectFile = this.buildProjectFile(projectData, filename)
      
      // Valider la structure
      this.validateProjectStructure(projectFile)
      
      // Convertir en JSON
      const jsonString = JSON.stringify(projectFile, null, 2)
      
      // Créer le blob
      const blob = new Blob([jsonString], { type: 'application/json' })
      
      // Télécharger le fichier
      const success = await this.downloadFile(blob, filename + this.fileExtension)
      
      return {
        success,
        message: success ? 'Projet sauvegardé avec succès' : 'Erreur lors de la sauvegarde',
        filename: filename + this.fileExtension,
        size: blob.size
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      return {
        success: false,
        message: `Erreur de sauvegarde: ${error.message}`
      }
    }
  }

  /**
   * Charge un projet depuis un fichier
   * @param {File} file - Fichier projet à charger
   * @returns {Promise<Object>} Données du projet ou erreur
   */
  async loadProject(file) {
    try {
      // Valider l'extension du fichier
      if (!this.isValidProjectFile(file.name)) {
        throw new Error(`Extension de fichier invalide. Attendu: ${this.fileExtension}`)
      }
      
      // Lire le contenu du fichier
      const content = await this.readFileAsText(file)
      
      // Parser le JSON
      let projectData
      try {
        projectData = JSON.parse(content)
      } catch (parseError) {
        throw new Error('Fichier projet corrompu ou format JSON invalide')
      }
      
      // Valider la structure
      this.validateProjectFile(projectData)
      
      // Migration si nécessaire
      if (projectData.metadata.version !== this.currentVersion) {
        projectData = await this.migrateProject(projectData)
      }
      
      return {
        success: true,
        data: projectData,
        message: `Projet "${file.name}" chargé avec succès`
      }
    } catch (error) {
      console.error('Erreur lors du chargement:', error)
      return {
        success: false,
        error: error.message,
        message: `Erreur de chargement: ${error.message}`
      }
    }
  }

  /**
   * Construit la structure du fichier projet
   * @param {Object} projectData - Données du projet
   * @param {string} filename - Nom du fichier
   * @returns {Object} Structure du fichier projet
   */
  buildProjectFile(projectData, filename) {
    const now = new Date().toISOString()
    
    return {
      // Métadonnées du projet
      metadata: {
        version: this.currentVersion,
        created: projectData.metadata?.created || now,
        modified: now,
        name: projectData.metadata?.name || filename,
        description: projectData.metadata?.description || "",
        tags: projectData.metadata?.tags || [],
        author: projectData.metadata?.author || "",
        bpm: projectData.midiData?.midiInfo?.tempo || 120,
        timeSignature: projectData.midiData?.midiInfo?.timeSignature || [4, 4],
        keySignature: projectData.midiData?.midiInfo?.keySignature || "C"
      },

      // Données MIDI transformées et enrichies
      midiData: {
        info: projectData.midiData?.midiInfo || {},
        tracks: this.sanitizeTracks(projectData.midiData?.tracks || []),
        notes: projectData.midiData?.notes || [],
        controlChanges: projectData.midiData?.midiCC || [],
        tempoEvents: projectData.midiData?.tempoEvents || [],
        timeSignatureEvents: projectData.midiData?.timeSignatureEvents || [],
        keySignatureEvents: projectData.midiData?.keySignatureEvents || []
      },

      // État de l'interface utilisateur
      uiState: {
        timeline: {
          zoom: projectData.uiState?.timeline?.zoom || 1.0,
          scrollX: projectData.uiState?.timeline?.scrollX || 0,
          scrollY: projectData.uiState?.timeline?.scrollY || 0,
          playheadPosition: projectData.uiState?.timeline?.playheadPosition || 0,
          snapToGrid: projectData.uiState?.timeline?.snapToGrid !== false,
          gridSize: projectData.uiState?.timeline?.gridSize || 0.25,
          viewMode: projectData.uiState?.timeline?.viewMode || "notes"
        },
        panels: {
          trackList: { 
            width: projectData.uiState?.panels?.trackList?.width || 300, 
            visible: projectData.uiState?.panels?.trackList?.visible !== false 
          },
          pianoRoll: { 
            height: projectData.uiState?.panels?.pianoRoll?.height || 400, 
            visible: projectData.uiState?.panels?.pianoRoll?.visible !== false 
          },
          mixer: { 
            width: projectData.uiState?.panels?.mixer?.width || 250, 
            visible: projectData.uiState?.panels?.mixer?.visible || false 
          },
          inspector: { 
            width: projectData.uiState?.panels?.inspector?.width || 200, 
            visible: projectData.uiState?.panels?.inspector?.visible !== false 
          }
        },
        selectedItems: {
          trackId: projectData.uiState?.selectedItems?.trackId || null,
          noteIds: projectData.uiState?.selectedItems?.noteIds || [],
          ccIds: projectData.uiState?.selectedItems?.ccIds || []
        },
        windows: projectData.uiState?.windows || []
      },

      // Préférences utilisateur spécifiques au projet
      userPreferences: {
        playback: {
          metronome: projectData.userPreferences?.playback?.metronome !== false,
          countIn: projectData.userPreferences?.playback?.countIn || 2,
          loopEnabled: projectData.userPreferences?.playback?.loopEnabled || false,
          loopStart: projectData.userPreferences?.playback?.loopStart || 0,
          loopEnd: projectData.userPreferences?.playback?.loopEnd || 0
        },
        display: {
          theme: projectData.userPreferences?.display?.theme || "dark",
          noteColors: projectData.userPreferences?.display?.noteColors || "velocity",
          showNoteNames: projectData.userPreferences?.display?.showNoteNames !== false,
          showGrid: projectData.userPreferences?.display?.showGrid !== false
        },
        keyboard: {
          octave: projectData.userPreferences?.keyboard?.octave || 4,
          velocity: projectData.userPreferences?.keyboard?.velocity || 80,
          recordingMode: projectData.userPreferences?.keyboard?.recordingMode || "replace"
        },
        automation: {
          defaultCCNumber: projectData.userPreferences?.automation?.defaultCCNumber || 7,
          smoothing: projectData.userPreferences?.automation?.smoothing !== false,
          resolution: projectData.userPreferences?.automation?.resolution || "high"
        }
      },

      // Marqueurs et régions
      markers: projectData.markers || [],

      // Données de rendu audio
      audioSettings: {
        sampleRate: projectData.audioSettings?.sampleRate || 44100,
        bufferSize: projectData.audioSettings?.bufferSize || 512,
        outputDevice: projectData.audioSettings?.outputDevice || "default",
        inputDevice: projectData.audioSettings?.inputDevice || null,
        latency: projectData.audioSettings?.latency || 128
      },

      // Historique pour undo/redo (limité pour éviter des fichiers trop lourds)
      history: {
        actions: [], // Pas sauvegardé pour l'instant
        currentIndex: -1,
        maxSize: projectData.history?.maxSize || 100
      }
    }
  }

  /**
   * Nettoie les données des pistes pour la sauvegarde
   * @param {Array} tracks - Pistes à nettoyer
   * @returns {Array} Pistes nettoyées
   */
  sanitizeTracks(tracks) {
    return tracks.map(track => ({
      ...track,
      // S'assurer que les propriétés critiques existent
      notes: track.notes || [],
      controlChanges: track.controlChanges || {},
      pitchBends: track.pitchBends || [],
      // Nettoyer les propriétés qui ne doivent pas être sauvegardées
      lastModified: Date.now()
    }))
  }

  /**
   * Valide la structure d'un fichier projet
   * @param {Object} projectData - Données du projet à valider
   */
  validateProjectFile(projectData) {
    const requiredFields = ['metadata', 'midiData', 'uiState']
    
    for (const field of requiredFields) {
      if (!projectData[field]) {
        throw new Error(`Champ requis manquant: ${field}`)
      }
    }

    // Valider la version
    if (!projectData.metadata.version) {
      throw new Error('Version du projet manquante')
    }

    if (!this.supportedVersions.includes(projectData.metadata.version)) {
      throw new Error(`Version non supportée: ${projectData.metadata.version}`)
    }

    // Valider la structure des données MIDI
    if (!projectData.midiData.info && !projectData.midiData.tracks) {
      throw new Error('Données MIDI invalides ou manquantes')
    }
  }

  /**
   * Valide la structure avant sauvegarde
   * @param {Object} projectFile - Fichier projet à valider
   */
  validateProjectStructure(projectFile) {
    // Vérifications de base
    if (!projectFile.metadata || !projectFile.midiData) {
      throw new Error('Structure de projet invalide')
    }

    // Vérifier que les données MIDI sont cohérentes
    const tracks = projectFile.midiData.tracks || []
    const notes = projectFile.midiData.notes || []
    
    // Vérifier que toutes les notes référencent des pistes existantes
    const trackIds = new Set(tracks.map(t => t.id))
    const orphanedNotes = notes.filter(note => !trackIds.has(note.trackId))
    
    if (orphanedNotes.length > 0) {
      console.warn(`${orphanedNotes.length} notes orphelines détectées et seront supprimées`)
      // Filtrer les notes orphelines
      projectFile.midiData.notes = notes.filter(note => trackIds.has(note.trackId))
    }
  }

  /**
   * Migre un projet d'une ancienne version vers la version actuelle
   * @param {Object} oldProjectData - Données du projet ancien
   * @returns {Promise<Object>} Données migrées
   */
  async migrateProject(oldProjectData) {
    console.log(`🔄 Migration du projet de ${oldProjectData.metadata.version} vers ${this.currentVersion}`)
    
    let migratedData = { ...oldProjectData }
    
    // Migrations spécifiques par version
    // Pour l'instant, une seule version existe, mais prêt pour l'avenir
    
    // Mettre à jour la version
    migratedData.metadata.version = this.currentVersion
    migratedData.metadata.modified = new Date().toISOString()
    
    console.log(`✅ Migration terminée`)
    return migratedData
  }

  /**
   * Export rapide des données MIDI uniquement (pour compatibilité)
   * @param {Object} midiData - Données MIDI
   * @param {string} filename - Nom du fichier
   * @returns {Promise<Object>} Résultat de l'export
   */
  async exportMidiDataOnly(midiData, filename) {
    try {
      const lightProject = {
        metadata: {
          version: this.currentVersion,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          name: filename,
          description: "Export données MIDI uniquement",
          tags: ["export", "midi-only"]
        },
        midiData: midiData,
        uiState: this.getDefaultUIState(),
        userPreferences: this.getDefaultUserPreferences(),
        markers: [],
        audioSettings: this.getDefaultAudioSettings()
      }

      return await this.saveProject(lightProject, filename)
    } catch (error) {
      return {
        success: false,
        message: `Erreur d'export: ${error.message}`
      }
    }
  }

  /**
   * Utilitaires pour fichiers
   */
  async downloadFile(blob, filename) {
    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return true
    } catch (error) {
      console.error('Erreur lors du téléchargement:', error)
      return false
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve(event.target.result)
      reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'))
      reader.readAsText(file)
    })
  }

  isValidProjectFile(filename) {
    return filename.toLowerCase().endsWith(this.fileExtension)
  }

  /**
   * États par défaut
   */
  getDefaultUIState() {
    return {
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
    }
  }

  getDefaultUserPreferences() {
    return {
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
        showGrid: true
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
    }
  }

  getDefaultAudioSettings() {
    return {
      sampleRate: 44100,
      bufferSize: 512,
      outputDevice: "default",
      inputDevice: null,
      latency: 128
    }
  }

  /**
   * Utilitaires d'information
   */
  async getProjectInfo(file) {
    try {
      const content = await this.readFileAsText(file)
      const projectData = JSON.parse(content)
      
      return {
        success: true,
        info: {
          name: projectData.metadata?.name || file.name,
          version: projectData.metadata?.version || "unknown",
          created: projectData.metadata?.created,
          modified: projectData.metadata?.modified,
          description: projectData.metadata?.description,
          tags: projectData.metadata?.tags || [],
          author: projectData.metadata?.author,
          trackCount: projectData.midiData?.tracks?.length || 0,
          noteCount: projectData.midiData?.notes?.length || 0,
          ccCount: projectData.midiData?.controlChanges?.length || 0,
          duration: projectData.midiData?.info?.duration || 0,
          bpm: projectData.midiData?.info?.tempo || 120
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Créer un projet vide
   */
  createEmptyProject(name = "Nouveau Projet") {
    return {
      metadata: {
        version: this.currentVersion,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        name: name,
        description: "",
        tags: [],
        author: "",
        bpm: 120,
        timeSignature: [4, 4],
        keySignature: "C"
      },
      midiData: {
        info: {
          name: name,
          duration: 0,
          durationTicks: 0,
          ticksPerQuarter: 480,
          ppq: 480,
          format: 1,
          numTracks: 0,
          timeSignature: [4, 4],
          keySignature: "C",
          tempo: 120
        },
        tracks: [],
        notes: [],
        controlChanges: [],
        tempoEvents: [{
          id: 'tempo-default',
          bpm: 120,
          time: 0,
          ticks: 0
        }],
        timeSignatureEvents: [{
          id: 'timesig-default',
          numerator: 4,
          denominator: 4,
          time: 0,
          ticks: 0
        }],
        keySignatureEvents: []
      },
      uiState: this.getDefaultUIState(),
      userPreferences: this.getDefaultUserPreferences(),
      markers: [],
      audioSettings: this.getDefaultAudioSettings(),
      history: {
        actions: [],
        currentIndex: -1,
        maxSize: 100
      }
    }
  }
}

export default ProjectFileManager