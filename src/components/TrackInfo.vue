<template>
  <div class="track-info" v-if="selectedTrackInfo">>
    <div class="track-info-header">
      <h3>Informations de la piste</h3>
    </div>

    <div class="track-info-content">
      <!-- Numéro et nom de la piste -->
      <div class="info-section">
        <div class="track-number">
          <label>Piste #:</label>
          <span class="track-number-display">{{ getTrackNumber() }}</span>
        </div>
        
        <div class="track-name-edit">
          <label>Nom:</label>
          <el-input
            :model-value="selectedTrackInfo.name"
            size="small"
            @change="updateTrackName"
            placeholder="Nom de la piste"
          />
        </div>
      </div>

      <!-- Paramètres MIDI -->
      <div class="info-section">
        <div class="control-group">
          <label>Canal MIDI:</label>
          <el-select
            :model-value="selectedTrackInfo.channel + 1"
            size="small"
            @change="onChannelChange"
          >
            <el-option
              v-for="channel in 16"
              :key="channel"
              :label="`Canal ${channel}`"
              :value="channel"
            />
          </el-select>
        </div>

        <div class="control-group">
          <label>Sortie MIDI:</label>
          <el-select
            :model-value="selectedTrackInfo.midiOutput || 'default'"
            size="small"
            @change="onOutputChange"
            :disabled="!midiSupported || midiOutputs.length === 0"
          >
            <el-option
              label="Sortie par défaut"
              value="default"
            />
            <el-option
              v-for="output in midiOutputs"
              :key="output.id"
              :label="output.name"
              :value="output.id"
            />
          </el-select>
        </div>
      </div>

      <!-- Panoramique -->
      <div class="info-section">
        <div class="control-group horizontal">
          <label>Panoramique:</label>
          <div class="pan-control">
            <span class="pan-label">G</span>
            <el-slider
              :model-value="selectedTrackInfo.pan"
              :min="0"
              :max="127"
              :show-tooltip="true"
              size="small"
              @change="updateTrackPan"
              :format-tooltip="formatPanTooltip"
            />
            <span class="pan-label">D</span>
          </div>
        </div>
      </div>

      <!-- Boutons Mute et Solo -->
      <div class="info-section">
        <div class="button-group">
          <el-button
            :type="selectedTrackInfo.muted ? 'danger' : 'default'"
            size="small"
            @click="toggleMute"
            class="control-button"
          >
            <el-icon><Mute /></el-icon>
            Mute
          </el-button>
          <el-button
            :type="selectedTrackInfo.solo ? 'warning' : 'default'"
            size="small"
            @click="toggleSolo"
            class="control-button"
          >
            <el-icon><VideoPlay /></el-icon>
            Solo
          </el-button>
        </div>
      </div>

      <!-- Volume vertical -->
      <div class="info-section volume-section">
        <label>Volume:</label>
        <div class="volume-control">
          <div class="volume-value">{{ selectedTrackInfo.volume }}</div>
          <el-slider
            :model-value="selectedTrackInfo.volume"
            :min="0"
            :max="127"
            :show-tooltip="true"
            vertical
            height="120px"
            @change="updateTrackVolume"
          />
          <div class="volume-labels">
            <span>127</span>
            <span>64</span>
            <span>0</span>
          </div>
        </div>
      </div>

      <!-- Statistiques de la piste -->
      <div class="info-section stats-section">
        <div class="track-stats">
          <div class="stat">
            <span class="label">Notes:</span>
            <span class="value">{{ selectedTrackNotes.length }}</span>
          </div>
          <div class="stat">
            <span class="label">CC Events:</span>
            <span class="value">{{ selectedTrackCCCount }}</span>
          </div>
          <div class="stat">
            <span class="label">Durée:</span>
            <span class="value">{{ formatDuration(getTrackDuration()) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Message si aucune piste sélectionnée -->
  <div v-else class="no-track-selected">
    <div class="no-track-content">
      <el-icon size="48"><Headset /></el-icon>
      <h4>Aucune piste sélectionnée</h4>
      <p>Sélectionnez une piste pour voir ses informations</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Mute, VideoPlay, Headset } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useMidiStore } from '@/stores/midi'

// Store
const midiStore = useMidiStore()

// État local pour MIDI
const midiAccess = ref(null)
const midiOutputs = ref([])
const midiSupported = ref(false)

// Computed
const selectedTrackInfo = computed(() => midiStore.getSelectedTrackData)
const selectedTrackNotes = computed(() => {
  const selectedTrack = midiStore.selectedTrack
  if (selectedTrack !== null) {
    return midiStore.getTrackNotes(selectedTrack)
  }
  return []
})

const selectedTrackCCCount = computed(() => {
  const selectedTrack = midiStore.selectedTrack
  if (selectedTrack !== null) {
    const controlChanges = midiStore.getControlChangesForTrack(selectedTrack)
    return Object.values(controlChanges).reduce((total, ccArray) => total + ccArray.length, 0)
  }
  return 0
})

// Initialisation MIDI
onMounted(async () => {
  await initializeMidiAccess()
})

onUnmounted(() => {
  if (midiAccess.value) {
    midiAccess.value.onstatechange = null
  }
})

// Fonctions MIDI
async function initializeMidiAccess() {
  try {
    if (!navigator.requestMIDIAccess) {
      midiSupported.value = false
      return
    }

    midiSupported.value = true
    midiAccess.value = await navigator.requestMIDIAccess()
    updateMidiOutputs()
    
    midiAccess.value.onstatechange = () => {
      updateMidiOutputs()
    }
    
  } catch (error) {
    console.error('Erreur lors de l\'initialisation MIDI:', error)
    midiSupported.value = false
  }
}

function updateMidiOutputs() {
  if (!midiAccess.value) return
  
  const outputs = []
  for (const output of midiAccess.value.outputs.values()) {
    outputs.push({
      id: output.id,
      name: output.name || `Périphérique ${output.id}`,
      output: output
    })
  }
  
  midiOutputs.value = outputs
}

// Fonctions utilitaires
function getTrackNumber() {
  if (!selectedTrackInfo.value) return 0
  const tracks = midiStore.tracks
  const index = tracks.findIndex(t => t.id === selectedTrackInfo.value.id)
  return index + 1
}

function getTrackDuration() {
  if (!selectedTrackInfo.value) return 0
  const trackNotes = selectedTrackNotes.value
  if (trackNotes.length === 0) return 0
  
  const lastNote = trackNotes.reduce((latest, note) => {
    const noteEnd = note.time + note.duration
    return noteEnd > latest ? noteEnd : latest
  }, 0)
  
  return lastNote
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function formatPanTooltip(value) {
  if (value < 64) {
    return `G ${64 - value}`
  } else if (value > 64) {
    return `D ${value - 64}`
  }
  return 'Centre'
}

// Gestionnaires d'événements
function updateTrackName(newName) {
  if (!selectedTrackInfo.value || !newName.trim()) return
  midiStore.updateTrackName(selectedTrackInfo.value.id, newName.trim())
  ElMessage.success('Nom de la piste mis à jour')
}

function onChannelChange(newChannel) {
  if (!selectedTrackInfo.value) return
  const channelIndex = newChannel - 1
  midiStore.updateTrackChannel(selectedTrackInfo.value.id, channelIndex)
  ElMessage.success(`Canal MIDI changé vers ${newChannel}`)
}

function onOutputChange(outputId) {
  if (!selectedTrackInfo.value) return
  midiStore.updateTrackMidiOutput(selectedTrackInfo.value.id, outputId)
  
  const outputName = outputId === 'default' 
    ? 'Sortie par défaut'
    : midiOutputs.value.find(o => o.id === outputId)?.name || 'Inconnu'
  
  ElMessage.success(`Sortie MIDI changée vers ${outputName}`)
}

function updateTrackPan(pan) {
  if (!selectedTrackInfo.value) return
  midiStore.updateTrackPan(selectedTrackInfo.value.id, pan)
}

function updateTrackVolume(volume) {
  if (!selectedTrackInfo.value) return
  midiStore.updateTrackVolume(selectedTrackInfo.value.id, volume)
}

function toggleMute() {
  if (!selectedTrackInfo.value) return
  midiStore.toggleTrackMute(selectedTrackInfo.value.id)
}

function toggleSolo() {
  if (!selectedTrackInfo.value) return
  midiStore.toggleTrackSolo(selectedTrackInfo.value.id)
}
</script>

<style scoped>
.track-info {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border-right: 1px solid var(--border-color);
}

.track-info-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--lane-bg);
}

.track-info-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--panel-fg);
}

.track-info-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.info-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.info-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.track-number {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.track-number-display {
  font-weight: bold;
  color: var(--menu-active-fg);
  background: var(--lane-bg);
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 30px;
  text-align: center;
}

.track-name-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.control-group.horizontal {
  flex-direction: column;
}

.control-group label {
  font-size: 12px;
  color: var(--track-instrument);
  font-weight: 500;
}

.pan-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pan-label {
  font-size: 10px;
  color: var(--track-details);
  min-width: 12px;
  text-align: center;
}

.button-group {
  display: flex;
  gap: 8px;
}

.control-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.volume-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.volume-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.volume-value {
  font-weight: bold;
  color: var(--panel-fg);
  background: var(--lane-bg);
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 40px;
  text-align: center;
  font-size: 12px;
}

.volume-labels {
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-size: 10px;
  color: var(--track-details);
  margin-left: 8px;
}

.stats-section {
  background: var(--lane-bg);
  padding: 12px;
  border-radius: 6px;
}

.track-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.stat .label {
  color: var(--track-instrument);
}

.stat .value {
  font-weight: 500;
  color: var(--panel-fg);
}

.no-track-selected {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  border-right: 1px solid var(--border-color);
}

.no-track-content {
  text-align: center;
  color: var(--track-details);
}

.no-track-content .el-icon {
  margin-bottom: 16px;
  color: var(--track-instrument);
}

.no-track-content h4 {
  margin: 0 0 8px 0;
  color: var(--panel-fg);
  font-size: 16px;
}

.no-track-content p {
  margin: 0;
  font-size: 14px;
}

/* Styles pour les composants Element Plus */
:deep(.el-select) {
  width: 100%;
}

:deep(.el-input) {
  --el-input-border-color-hover: var(--menu-active-fg);
}

:deep(.el-select) {
  --el-select-border-color-hover: var(--menu-active-fg);
}

:deep(.el-slider) {
  --el-slider-main-bg-color: var(--menu-active-fg);
  --el-slider-runway-bg-color: var(--lane-bg);
}

:deep(.el-button--danger) {
  --el-button-bg-color: #f56565;
  --el-button-border-color: #f56565;
}

:deep(.el-button--warning) {
  --el-button-bg-color: #ed8936;
  --el-button-border-color: #ed8936;
}
</style>