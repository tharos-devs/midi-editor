// composables/useMidiImport.js - Fonction d'import MIDI pour l'interface
import { ref } from 'vue'
import MidiFileImporter from '@/services/MidiFileImporter'
import { useMidiStore } from '@/stores/midi'

export function useMidiFileImport() {
  const midiStore = useMidiStore()
  const midiFileImporter = new MidiFileImporter()
  
  // État réactif pour l'interface
  const isImporting = ref(false)
  const importProgress = ref(0)
  const importStatus = ref('')

  /**
   * Fonction principale d'import MIDI appelée par le menu
   * @param {File|null} file - Fichier sélectionné (optionnel si on veut ouvrir un sélecteur)
   * @returns {Promise<Object>} Résultat de l'import
   */
  async function importMidiFile(file = null) {
    try {
      // Si aucun fichier fourni, ouvrir le sélecteur
      if (!file) {
        file = await openFileSelector()
        if (!file) {
          return { success: false, message: 'Aucun fichier sélectionné' }
        }
      }

      isImporting.value = true
      importStatus.value = 'Lecture du fichier...'
      importProgress.value = 20

      // Lire le fichier
      const arrayBuffer = await readFileAsArrayBuffer(file)
      
      importStatus.value = 'Validation du fichier MIDI...'
      importProgress.value = 40

      // Valider le fichier MIDI
      if (!midiFileImporter.validateMidiFile(arrayBuffer)) {
        throw new Error('Le fichier sélectionné n\'est pas un fichier MIDI valide')
      }

      importStatus.value = 'Import en cours...'
      importProgress.value = 60

      // Importer avec le service
      const importResult = await midiFileImporter.importFromFile(arrayBuffer, file.name)
      
      if (!importResult.success) {
        throw new Error(importResult.message)
      }

      importStatus.value = 'Création du nouveau projet...'
      importProgress.value = 80

      // Créer un nouveau projet dans le store
      await createNewProjectFromMidiData(importResult.data, file.name)

      importStatus.value = 'Import terminé!'
      importProgress.value = 100

      // Nettoyer après un délai
      setTimeout(() => {
        isImporting.value = false
        importProgress.value = 0
        importStatus.value = ''
      }, 1000)

      return {
        success: true,
        message: `Fichier MIDI "${file.name}" importé avec succès`,
        data: importResult.data
      }

    } catch (error) {
      console.error('Erreur lors de l\'import MIDI:', error)
      
      isImporting.value = false
      importProgress.value = 0
      importStatus.value = ''

      return {
        success: false,
        message: error.message
      }
    }
  }

  /**
   * Créer un nouveau projet dans le store à partir des données MIDI importées
   */
  async function createNewProjectFromMidiData(midiData, filename) {
    // Réinitialiser le store
    midiStore.resetStore()

    // Charger les données importées
    midiStore.midiInfo = midiData.midiInfo
    midiStore.tracks = midiData.tracks
    midiStore.notes = midiData.notes
    midiStore.midiCC = midiData.midiCC
    midiStore.tempoEvents = midiData.tempoEvents
    midiStore.timeSignatureEvents = midiData.timeSignatureEvents
    midiStore.keySignatureEvents = midiData.keySignatureEvents

    // DEBUG: Vérifier combien de CC ont été stockés
    // console.log(`🎛️ CC stockés dans midiStore.midiCC: ${midiStore.midiCC.length}`)
    if (midiStore.midiCC.length > 0) {
      // console.log('🎛️ Premier CC:', midiStore.midiCC[0])
      // console.log('🎛️ Structure CC:', Object.keys(midiStore.midiCC[0]))
    }
    
    // Configurer l'état du store
    midiStore.filename = filename
    midiStore.isLoaded = true
    
    // Sélectionner la première piste par défaut
    if (midiData.tracks.length > 0) {
      console.log('🎯 Sélection piste par défaut:', midiData.tracks[0].id)
      console.log('🎯 Pistes disponibles:', midiData.tracks.map(t => ({ id: t.id, name: t.name })))
      midiStore.selectedTrack = midiData.tracks[0].id
      console.log('🎯 selectedTrack après sélection:', midiStore.selectedTrack)
    }

    // Forcer la réactivité
    midiStore.triggerReactivity('midi-file-load')
    
    // Forcer spécifiquement la réactivité des CC
    console.log('🎛️ Forcing CC reactivity after load...')
    midiStore.forceCCUpdate()
    
    // Debug des CC lanes
    setTimeout(() => {
      midiStore.debugCCLanes()
    }, 200)
    /*
    console.log(`✅ Nouveau projet créé à partir de "${filename}"`)
    console.log(`📊 Pistes: ${midiData.tracks.length}, Notes: ${midiData.notes.length}, CC: ${midiData.midiCC.length}`)
    */
  }

  /**
   * Ouvre un sélecteur de fichier pour les fichiers MIDI
   */
  function openFileSelector() {
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
   * Lit un fichier comme ArrayBuffer
   */
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (event) => {
        resolve(event.target.result)
      }
      
      reader.onerror = () => {
        reject(new Error('Erreur lors de la lecture du fichier'))
      }
      
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Obtient un aperçu des informations du fichier MIDI avant import complet
   */
  async function previewMidiFile(file) {
    try {
      const arrayBuffer = await readFileAsArrayBuffer(file)
      const preview = await midiFileImporter.getFileInfo(arrayBuffer)
      
      return {
        success: true,
        filename: file.name,
        size: file.size,
        ...preview
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Import avec dialogue de confirmation si le projet actuel a des modifications
   */
  async function importMidiWithConfirmation(file = null) {
    // Vérifier s'il y a des modifications non sauvegardées
    if (midiStore.isLoaded && hasUnsavedChanges()) {
      const confirmed = await confirmOverwrite()
      if (!confirmed) {
        return { success: false, message: 'Import annulé par l\'utilisateur' }
      }
    }

    return await importMidiFile(file)
  }

  /**
   * Vérifie s'il y a des modifications non sauvegardées
   */
  function hasUnsavedChanges() {
    // Cette logique dépend de votre implémentation
    // Pour l'instant, on assume qu'il y a des changements si un projet est chargé
    return midiStore.isLoaded && midiStore.lastModified > 0
  }

  /**
   * Dialogue de confirmation pour écraser le projet actuel
   */
  async function confirmOverwrite() {
    return new Promise((resolve) => {
      const confirmed = window.confirm(
        'Un projet est déjà ouvert. Voulez-vous vraiment importer un nouveau fichier MIDI ?\n\n' +
        'Toutes les modifications non sauvegardées seront perdues.'
      )
      resolve(confirmed)
    })
  }

  return {
    // État réactif
    isImporting,
    importProgress, 
    importStatus,

    // Fonctions principales
    importMidiFile,
    importMidiWithConfirmation,
    previewMidiFile,
    
    // Utilitaires
    openFileSelector,
    hasUnsavedChanges
  }
}

// ==============================================
// EXEMPLE D'UTILISATION DANS UN COMPOSANT MENU
// ==============================================

/*
// components/MenuBar.vue
<template>
  <div class="menu-bar">
    <div class="menu-item" @click="handleImportMidi">
      <Icon name="upload" />
      Importer MIDI
    </div>
    
    <!-- Indicateur de progression -->
    <div v-if="isImporting" class="import-progress">
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{ width: `${importProgress}%` }"
        ></div>
      </div>
      <span class="progress-text">{{ importStatus }}</span>
    </div>
  </div>
</template>

<script setup>
import { useMidiImport } from '@/composables/useMidiImport'

const {
  isImporting,
  importProgress,
  importStatus,
  importMidiWithConfirmation
} = useMidiImport()

async function handleImportMidi() {
  const result = await importMidiWithConfirmation()
  
  if (result.success) {
    // Notification de succès
    console.log('✅', result.message)
    // Vous pouvez ici déclencher une notification toast
  } else {
    // Notification d'erreur
    console.error('❌', result.message)
    // Vous pouvez ici afficher une modal d'erreur
  }
}
</script>
*/