<template>
  <div class="menu-bar">
    <el-menu mode="horizontal" :default-active="'files'" class="menu">
      <el-sub-menu index="files">
        <template #title>Fichier</template>
        <el-menu-item 
          index="import-midi-file" 
          @click="handleImportMidiFile"
          :disabled="isImporting"
        >
          <el-icon><DocumentAdd /></el-icon>
         {{ isImporting ? importStatus : 'Importer MIDI' }}
        </el-menu-item>
      </el-sub-menu>
    </el-menu>
  </div>
</template>

<script setup>
import { useMidiFileImport } from '@/composables/useMidiFileImport'
import { DocumentAdd } from '@element-plus/icons-vue'

const { 
  isImporting, 
  importStatus, 
  importMidiWithConfirmation 
} = useMidiFileImport()

async function handleImportMidiFile() {
  const result = await importMidiWithConfirmation()
  if (result.success) {
    // Succès - nouvelle projet créé
  } else {
    // Erreur ou annulation
  }
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