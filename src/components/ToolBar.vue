<template>
  <div class="tool-bar">
    <!--
    <div class="tool-group">
      <div class="transport-controls" v-if="midiStore.isLoaded">
        <el-button :icon="VideoPlay" size="small" @click="playMidi">
          Lecture
        </el-button>
        <el-button :icon="VideoPause" size="small" @click="stopMidi">
          Stop
        </el-button>

      </div>
    </div>
    -->
    <div class="tool-group">
      <el-button
        :icon="InfoFilled"
        size="small"
        :type="uiStore.showTrackInfo ? 'primary' : 'default'"
        @click="uiStore.toggleTrackInfo()"
        title="Afficher/Masquer les informations de piste"
      >
       {{ uiStore.showTrackInfo ? 'Masquer' : 'Afficher' }} Info Piste
      </el-button>
    </div>

    <div class="tool-separator"></div>

    <div class="tool-group">
      <SnapToGrid />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
/*
import { ElMessage } from 'element-plus'
import { VideoPlay, VideoPause } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'
import { useMidiManager } from '@/composables/useMidiManager'
*/
import SnapToGrid from './SnapToGrid.vue'

const uiStore = useUIStore()
/*
const midiStore = useMidiStore()
const {
  hasConnectedOutputs
} = useMidiManager()

// Contrôles de lecture
function playMidi() {
  if (!midiStore.isLoaded) {
    ElMessage.warning('Aucun fichier MIDI chargé')
    return
  }
  
  if (!hasConnectedOutputs.value) {
    ElMessage.warning('Aucun périphérique MIDI connecté')
    return
  }
  
  // Ici vous implémenteriez la lecture MIDI
  ElMessage.info('Fonction de lecture à implémenter')
}

function stopMidi() {
  // Ici vous implémenteriez l'arrêt de la lecture
  ElMessage.info('Lecture arrêtée')
}

function resetPosition() {
  // Ici vous implémenteriez le reset de la position
  ElMessage.info('Position réinitialisée')
}
*/

</script>

<style scoped>
.tool-bar {
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--panel-bg);
  gap: 16px;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-separator {
  width: 1px;
  height: 30px;
  background: var(--border-color);
  margin: 0 8px;
}

.tool-label {
  font-size: 12px;
  color: var(--track-details);
  white-space: nowrap;
}
</style>