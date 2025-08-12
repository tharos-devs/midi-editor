<template>
  <div class="tool-bar">
    <div class="tool-group">
      <SnapToGrid />
    </div>

    <div class="tool-separator"></div>

    <div class="tool-group">
      <el-button
        size="small"
        :type="'danger'"
        @click="reconnectMidi"
        title="Panic MIDI - Reconnecter les périphériques"
      >
        Panic
      </el-button>
    </div>    
  </div>
</template>

<script setup>
import { useMidiManager } from '@/composables/useMidiManager' 
import SnapToGrid from './SnapToGrid.vue'

const midiManager = useMidiManager()

async function reconnectMidi() {
  console.log('🔄 Reconnexion MIDI forcée...')
  
  if (midiManager.cleanup) {
    midiManager.cleanup()
  }
  
  const success = await midiManager.initializeMidi()
  
  if (success) {
    console.log('✅ Reconnexion MIDI réussie')
  } else {
    console.error('❌ Échec de la reconnexion MIDI')
  }
  
  return success
}

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

.tool-group:last-child {
  margin-left: auto;
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