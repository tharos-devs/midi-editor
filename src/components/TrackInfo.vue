<template>
  <div class="track-info" v-if="selectedTrackInfo">
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
            :disabled="!midiManager.midiSupported?.value || midiManager.availableOutputs?.value?.length === 0"
          >
            <el-option
              label="Sortie par défaut"
              value="default"
            />
            <el-option
              v-for="output in midiManager.availableOutputs?.value || []"
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
              v-model="selectedTrackInfo.pan"
              :min="0"
              :max="127"
              :show-tooltip="true"
              size="small"
              @input="updateTrackPan"
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

      <!-- Volume vertical avec VuMeter à gauche -->
      <div class="info-section volume-section">
        <label>Volume:</label>
        <div class="volume-control">
          <div class="volume-value">{{ selectedTrackInfo.volume }}</div>
          
          <!-- Conteneur horizontal pour VuMeter + Slider -->
          <div class="volume-meters">
            <!-- VuMeter à gauche avec hauteur fixe -->
            <div class="vumeter-container">
              <VuMeter
                v-if="false"
                :midiVolume="selectedTrackInfo.volume"
                :midiPan="selectedTrackInfo.pan"
                :referenceValue="100"
                :logarithmic="true"
                :ticks="7"
                graduationSide="left"
              />
            </div>
            
            <!-- Slider vertical à droite avec labels alignés -->
            <div class="slider-container">
              <el-slider
                v-model="selectedTrackInfo.volume"
                :min="0"
                :max="127"
                :show-tooltip="true"
                vertical
                height="120px"
                @input="updateTrackVolume"
              />
              <div class="volume-labels">
                <span class="label-top">127</span>
                <span class="label-middle">64</span>
                <span class="label-bottom">0</span>
              </div>
            </div>
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
import { useMidiStore } from '@/stores/midi'
import { useMidiManager } from '@/composables/useMidiManager'
import VuMeter from './VuMeter.vue'

// Store
const midiStore = useMidiStore()
const midiManager = useMidiManager()

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

onMounted(async () => {
  if (!midiManager.isInitialized?.value) {
    await midiManager.initializeMidi()
  }
})

onUnmounted(() => {
  // Plus rien à nettoyer, useMidiManager gère tout
})

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
  if (value === 64) {
    return '<C>'
  } else if (value < 64) {
    const leftAmount = 64 - value
    return `Pan: G${leftAmount}`
  } else {
    const rightAmount = value - 64
    return `Pan: D${rightAmount}`
  }
}

// Gestionnaires d'événements
async function updateTrackName(newName) {
  if (!selectedTrackInfo.value || !newName.trim()) return
  await midiStore.updateTrackName(selectedTrackInfo.value.id, newName.trim())
}

function onChannelChange(newChannel) {
  if (!selectedTrackInfo.value) return
  const channelIndex = newChannel - 1
  midiStore.updateTrackChannel(selectedTrackInfo.value.id, channelIndex)
}

function onOutputChange(outputId) {
  if (!selectedTrackInfo.value) return
  
  console.log(`🎹 Changement sortie MIDI: "${outputId}"`)
  
  const output = midiManager.findMidiOutput(outputId)
  if (!output && outputId !== 'default') {
    console.warn(`⚠️ Sortie "${outputId}" introuvable, utilisation de 'default'`)
    outputId = 'default'
  }
  
  midiStore.updateTrackMidiOutput(selectedTrackInfo.value.id, outputId)
  
  const outputName = outputId === 'default' 
    ? 'Sortie par défaut'
    : output?.name || 'Sortie inconnue'
    
  console.log(`✅ Sortie MIDI mise à jour: ${outputName}`)
}

async function updateTrackPan(pan) {
  if (!selectedTrackInfo.value) return
  
  const clampedPan = Math.max(0, Math.min(127, Math.round(pan)))
  console.log(`🎛️ Mise à jour Pan pour piste ${selectedTrackInfo.value.id}: ${clampedPan}`)
  
  const success = await midiStore.updateTrackPan(selectedTrackInfo.value.id, clampedPan)
  
  if (success) {
    if (midiManager.isInitialized?.value && midiManager.midiSupported?.value) {
      const track = selectedTrackInfo.value
      let trackMidiOutput = track.midiOutput || 'default'
      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))
      
      const resolvedOutput = midiManager.findMidiOutput(trackMidiOutput)
      if (resolvedOutput) {
        trackMidiOutput = resolvedOutput.id
        console.log(`🎛️ Envoi CC10 Pan: "${resolvedOutput.name}" Canal=${trackChannel + 1} Valeur=${clampedPan}`)
        
        const ccSent = midiManager.sendControlChange(trackMidiOutput, trackChannel, 10, clampedPan)
        
        if (ccSent) {
          console.log(`✅ Pan CC10 envoyé avec succès`)
        } else {
          console.error(`❌ Échec envoi Pan CC10`)
        }
      } else {
        console.warn(`⚠️ Sortie MIDI "${track.midiOutput}" non trouvée pour envoi Pan`)
      }
    } else {
      console.warn('⚠️ MIDI non disponible pour envoi Pan')
    }
  }
}

async function updateTrackVolume(volume) {
  if (!selectedTrackInfo.value) return
  
  const clampedVolume = Math.max(0, Math.min(127, Math.round(volume)))
  console.log(`🔊 Mise à jour Volume pour piste ${selectedTrackInfo.value.id}: ${clampedVolume}`)
  
  const success = await midiStore.updateTrackVolume(selectedTrackInfo.value.id, clampedVolume)
  
  if (success) {
    if (midiManager.isInitialized?.value && midiManager.midiSupported?.value) {
      const track = selectedTrackInfo.value
      let trackMidiOutput = track.midiOutput || 'default'
      const trackChannel = Math.max(0, Math.min(15, track.channel || 0))
      
      const resolvedOutput = midiManager.findMidiOutput(trackMidiOutput)
      if (resolvedOutput) {
        trackMidiOutput = resolvedOutput.id
        console.log(`🔊 Envoi CC7 Volume: "${resolvedOutput.name}" Canal=${trackChannel + 1} Valeur=${clampedVolume}`)
        
        const ccSent = midiManager.sendControlChange(trackMidiOutput, trackChannel, 7, clampedVolume)
        
        if (ccSent) {
          console.log(`✅ Volume CC7 envoyé avec succès`)
        } else {
          console.error(`❌ Échec envoi Volume CC7`)
        }
      } else {
        console.warn(`⚠️ Sortie MIDI "${track.midiOutput}" non trouvée pour envoi Volume`)
      }
    }
  }
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
  margin-bottom: 10px;
  padding-bottom: 10px;
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
  padding-bottom: 20px;
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

/* ✅ CORRECTION 1: Conteneur horizontal aligné pour VuMeter + Slider */
.volume-meters {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  height: 120px;
  width: 100%;
  margin: 0 auto;
}

/* ✅ CORRECTION 1: Conteneur pour le VuMeter avec hauteur exacte du slider */
.vumeter-container {
  height: 120px; /* Même hauteur que le slider */
  display: flex;
  align-items: flex-start; /* Alignement en haut */
  flex-shrink: 0; /* Empêche la compression */
}

/* ✅ CORRECTION 1: Conteneur pour le slider et ses labels avec alignement */
.slider-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  height: 120px;
  position: relative;
}

/* ✅ CORRECTION 2: Labels du volume correctement positionnés */
.volume-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 120px;
  font-size: 10px;
  color: var(--track-details);
  position: relative;
  width: 30px;
  padding: 2px 0; /* Petit padding pour éviter le débordement */
}

/* ✅ CORRECTION 2: Positionnement précis des labels */
.label-top {
  position: absolute;
  top: 0;
  transform: translateY(-50%);
}

.label-middle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.label-bottom {
  position: absolute;
  bottom: 0;
  transform: translateY(50%);
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