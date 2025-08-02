<template>
  <div class="menu-bar">
    <el-menu mode="horizontal" :default-active="'1'" class="menu">
      <el-sub-menu index="1">
        <template #title>Fichier</template>
        <el-menu-item index="1-1" @click="openMidiFile">
          <el-icon><DocumentAdd /></el-icon>
          Charger MIDI
        </el-menu-item>
        <el-menu-item index="1-2" @click="newProject">
          <el-icon><Document /></el-icon>
          Nouveau
        </el-menu-item>
        <el-menu-item index="1-3">
          <el-icon><FolderOpened /></el-icon>
          Ouvrir
        </el-menu-item>
        <el-menu-item index="1-4" @click="saveMidiFile" :disabled="!midiStore.isLoaded">
          <el-icon><DocumentCopy /></el-icon>
          Enregistrer
        </el-menu-item>
        <!-- Ajout du menu Préférence -->
        <el-sub-menu index="1-5">
          <template #title>Préférence</template>
          <el-sub-menu index="1-5-1">
            <template #title>Thème</template>
            <el-menu-item index="1-5-1-1" @click="setTheme('light')">
              Thème clair
            </el-menu-item>
            <el-menu-item index="1-5-1-2" @click="setTheme('dark')">
              Thème foncé
            </el-menu-item>
          </el-sub-menu>
        </el-sub-menu>
      </el-sub-menu>
      <el-menu-item index="2">Édition</el-menu-item>
      <el-menu-item index="3">Affichage</el-menu-item>
      <el-menu-item index="4">Piste</el-menu-item>
      <el-menu-item index="5">MIDI</el-menu-item>
      <el-menu-item index="6">Fenêtre</el-menu-item>
      <el-menu-item index="7">Aide</el-menu-item>
    </el-menu>

    <!-- Input file caché pour sélectionner le fichier MIDI -->
    <input
      ref="fileInput"
      type="file"
      accept=".mid,.midi"
      style="display: none"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup>
import { ref, getCurrentInstance } from 'vue'
import { DocumentAdd, Document, FolderOpened, DocumentCopy } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMidiStore } from '@/stores/midi'
import { useSettingsStore } from '@/stores/settings'

const fileInput = ref(null)
const midiStore = useMidiStore()
const settingsStore = useSettingsStore()

const openMidiFile = () => {
  fileInput.value?.click()
}

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  try {
    const result = await midiStore.loadMidiFile(await file.arrayBuffer(), file.name)
    
    if (result.success) {
      ElMessage({
        message: `Fichier MIDI "${file.name}" chargé avec succès`,
        type: 'success',
      })
      
    } else {
      ElMessage({
        message: result.message || 'Erreur lors du chargement du fichier MIDI',
        type: 'error',
      })
    }
  } catch (error) {
    console.error('Erreur lors du chargement du fichier MIDI:', error)
    ElMessage({
      message: 'Erreur lors du chargement du fichier MIDI',
      type: 'error',
    })
  }

  // Reset input
  event.target.value = ''
}

const newProject = async () => {
  // Vérifier s'il y a des données non sauvegardées
  if (midiStore.isLoaded) {
    try {
      await ElMessageBox.confirm(
        'Créer un nouveau projet supprimera toutes les données actuelles. Continuer ?',
        'Nouveau projet',
        {
          confirmButtonText: 'Créer',
          cancelButtonText: 'Annuler',
          type: 'warning'
        }
      )
    } catch {
      return // Utilisateur a annulé
    }
  }
  
  // Réinitialiser le store
  midiStore.resetStore()
  
  ElMessage({
    message: 'Nouveau projet créé',
    type: 'success'
  })
}

const saveMidiFile = () => {
  if (!midiStore.isLoaded) {
    ElMessage({
      message: 'Aucun fichier MIDI à sauvegarder',
      type: 'warning'
    })
    return
  }

  try {
    // Récupérer l'objet Tone.js Midi
    const toneMidi = midiStore.exportToToneMidi()
    
    if (!toneMidi) {
      ElMessage({
        message: 'Impossible d\'exporter le fichier MIDI',
        type: 'error'
      })
      return
    }

    // Convertir en ArrayBuffer
    const arrayBuffer = toneMidi.toArray()
    
    // Créer un blob et déclencher le téléchargement
    const blob = new Blob([arrayBuffer], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = midiStore.filename || 'export.mid'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    URL.revokeObjectURL(url)
    
    ElMessage({
      message: 'Fichier MIDI sauvegardé avec succès',
      type: 'success'
    })
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error)
    ElMessage({
      message: 'Erreur lors de la sauvegarde du fichier MIDI',
      type: 'error'
    })
  }
}

const setTheme = (mode) => {
  settingsStore.setTheme(mode)
}
</script>

<style scoped>
.menu-bar {
  height: 40px;
  border-bottom: 1px solid var(--border-color);
  background: var(--menu-bg);
}

.menu {
  height: 100%;
  border-bottom: none;
  background: var(--menu-bg);
  color: var(--menu-fg);
}

.menu :deep(.el-menu-item.is-disabled) {
  color: #c0c4cc;
}
</style>