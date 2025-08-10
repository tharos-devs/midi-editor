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
          <div class="track-name-container">
            <input
              v-if="editingName"
              v-model="tempTrackName"
              @blur="saveTrackName"
              @keyup.enter="saveTrackName"
              @keyup.escape="cancelEditName"
              @keydown="handleInputKeyDown"
              class="track-name-input"
              placeholder="Nom de la piste"
              ref="nameInput"
            />
            <div 
              v-else
              class="track-name-display"
              @dblclick="startEditName"
              title="Double-cliquer pour modifier"
            >
              {{ selectedTrackInfo.name }}
            </div>
          </div>
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

        <div class="control-group">
          <label>Entrée MIDI:</label>
          <el-select
            :model-value="selectedTrackInfo.midiInput || 'none'"
            size="small"
            @change="onInputChange"
            :disabled="!midiManager.midiSupported?.value || midiManager.availableInputs?.value?.length === 0"
          >
            <el-option
              label="Aucune entrée"
              value="none"
            />
            <el-option
              label="Tous les inputs"
              value="all"
            />
            <el-option
              v-for="input in midiManager.availableInputs?.value || []"
              :key="input.id"
              :label="input.name"
              :value="input.id"
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
              @input="updateTrackPan"
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
            M
          </el-button>
          <el-button
            :type="selectedTrackInfo.solo ? 'warning' : 'default'"
            size="small"
            @click="toggleSolo"
            class="control-button"
          >
            S
          </el-button>
          <el-button
            :type="selectedTrackInfo.record ? 'danger' : 'default'"
            size="small"
            @click="toggleRecord"
            class="control-button"
            title="Enregistrement"
          >
            R
          </el-button>
          <el-button
            :type="selectedTrackInfo.monitor ? 'info' : 'default'"
            size="small"
            @click="toggleMonitor"
            class="control-button"
            title="Monitoring"
          >
            I
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
                :model-value="selectedTrackInfo.volume"
                :min="0"
                :max="127"
                :show-tooltip="true"
                vertical
                height="120px"
                @input="updateTrackVolume"
                @change="updateTrackVolume"
              />
            
            <!--
              <CustomSlider
                :model-value="selectedTrackInfo.volume"
                :min="0"
                :max="127"
                :show-tooltip="true"
                vertical
                height="120px"
                @input="updateTrackVolume"
                @change="updateTrackVolume"
              />
            -->
              <div class="volume-labels">
                <span class="label-top">127</span>
                <span class="label-middle">64</span>
                <span class="label-bottom">0</span>
              </div>
            </div>
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Mute, VideoPlay, Headset } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'
import { useMidiManager } from '@/composables/useMidiManager'
import { useMidiRecording } from '@/composables/useMidiRecording'
import VuMeter from './VuMeter.vue'
// import CustomSlider from './ui/CustomSlider.vue'

// Store et composables
const midiStore = useMidiStore()
const midiManager = useMidiManager()
const midiRecording = useMidiRecording()

// Variables réactives locales pour éviter les conflits
const localVolume = ref(0)
const localPan = ref(64)
const localMuted = ref(false)
const localSolo = ref(false)

// Variables pour l'édition du nom
const editingName = ref(false)
const tempTrackName = ref('')
const nameInput = ref(null)


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

// Watcher pour synchroniser les valeurs locales avec le store
watch(selectedTrackInfo, (newTrack) => {
  if (newTrack) {
    localVolume.value = newTrack.volume || 127
    localPan.value = newTrack.pan || 64
    localMuted.value = newTrack.muted || false
    localSolo.value = newTrack.solo || false
  }
}, { immediate: true })

// Watcher pour détecter les changements externes
watch(() => selectedTrackInfo.value?.volume, (newVolume) => {
  if (newVolume !== undefined && newVolume !== localVolume.value) {
    localVolume.value = newVolume
  }
})

watch(() => selectedTrackInfo.value?.pan, (newPan) => {
  if (newPan !== undefined && newPan !== localPan.value) {
    localPan.value = newPan
  }
})

watch(() => selectedTrackInfo.value?.muted, (newMuted) => {
  if (newMuted !== undefined && newMuted !== localMuted.value) {
    localMuted.value = newMuted
  }
})

watch(() => selectedTrackInfo.value?.solo, (newSolo) => {
  if (newSolo !== undefined && newSolo !== localSolo.value) {
    localSolo.value = newSolo
  }
})

onMounted(async () => {
  if (!midiManager.isInitialized?.value) {
    await midiManager.initializeMidi()
  }
  
  // Configurer le monitoring MIDI au démarrage
  midiRecording.setupMidiMonitoring()
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

// Gestionnaires d'événements avec débounce pour éviter les conflits
let volumeTimeout = null
let panTimeout = null

function startEditName() {
  if (!selectedTrackInfo.value) return
  editingName.value = true
  tempTrackName.value = selectedTrackInfo.value.name
  nextTick(() => {
    if (nameInput.value) {
      nameInput.value.focus()
      nameInput.value.select()
    }
  })
}

async function saveTrackName() {
  if (!selectedTrackInfo.value) return
  if (tempTrackName.value.trim() && tempTrackName.value !== selectedTrackInfo.value.name) {
    await midiStore.updateTrackName(selectedTrackInfo.value.id, tempTrackName.value.trim())
  }
  editingName.value = false
}

function cancelEditName() {
  if (!selectedTrackInfo.value) return
  editingName.value = false
  tempTrackName.value = selectedTrackInfo.value.name
}

function handleInputKeyDown(event) {
  console.log('🔍 TrackInfo input keydown:', event.key)
  
  // Empêcher la propagation pour Delete/Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    console.log('✅ TrackInfo: Arrêt propagation', event.key)
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

function onChannelChange(newChannel) {
  if (!selectedTrackInfo.value) return
  const channelIndex = newChannel - 1
  midiStore.updateTrackChannel(selectedTrackInfo.value.id, channelIndex)
}

function onOutputChange(outputId) {
  if (!selectedTrackInfo.value) return
  
  // console.log(`🎹 Changement sortie MIDI: "${outputId}"`)
  
  const output = midiManager.findMidiOutput(outputId)
  if (!output && outputId !== 'default') {
    // console.warn(`⚠️ Sortie "${outputId}" introuvable, utilisation de 'default'`)
    outputId = 'default'
  }
  
  midiStore.updateTrackMidiOutput(selectedTrackInfo.value.id, outputId)
  
  const outputName = outputId === 'default' 
    ? 'Sortie par défaut'
    : output?.name || 'Sortie inconnue'
    
  // console.log(`✅ Sortie MIDI mise à jour: ${outputName}`)
}

function onInputChange(inputId) {
  if (!selectedTrackInfo.value) return
  
  console.log(`🎤 Changement entrée MIDI: "${inputId}"`)
  
  // Mettre à jour le store avec la nouvelle entrée MIDI
  midiStore.updateTrackMidiInput(selectedTrackInfo.value.id, inputId)
  
  // Reconfigurer le monitoring MIDI
  midiRecording.setupMidiMonitoring()
  
  const inputName = inputId === 'none' 
    ? 'Aucune entrée'
    : inputId === 'all'
    ? 'Tous les inputs'
    : midiManager.availableInputs.value.find(i => i.id === inputId)?.name || 'Entrée inconnue'
    
  console.log(`✅ Entrée MIDI mise à jour: ${inputName}`)
}

async function updateTrackPan(pan) {
  if (!selectedTrackInfo.value) return
  
  const clampedPan = Math.max(0, Math.min(127, Math.round(pan)))
  localPan.value = clampedPan
  
  // Débouncer pour éviter trop d'appels
  if (panTimeout) clearTimeout(panTimeout)
  panTimeout = setTimeout(async () => {
    // console.log(`🎛️ Mise à jour Pan pour piste ${selectedTrackInfo.value.id}: ${clampedPan}`)
    
    const success = await midiStore.updateTrackPan(selectedTrackInfo.value.id, clampedPan)
    
    if (success) {
      await sendMidiCC(10, clampedPan) // CC10 pour Pan
    }
  }, 50) // 50ms de débounce
}

async function updateTrackVolume(volume) {
  if (!selectedTrackInfo.value) return
  
  const clampedVolume = Math.max(0, Math.min(127, Math.round(volume)))
  localVolume.value = clampedVolume
  
  // Débouncer pour éviter trop d'appels
  if (volumeTimeout) clearTimeout(volumeTimeout)
  volumeTimeout = setTimeout(async () => {
    // console.log(`🔊 Mise à jour Volume pour piste ${selectedTrackInfo.value.id}: ${clampedVolume}`)
    
    const success = await midiStore.updateTrackVolume(selectedTrackInfo.value.id, clampedVolume)
    
    if (success) {
      await sendMidiCC(7, clampedVolume) // CC7 pour Volume
    }
  }, 50) // 50ms de débounce
}

async function sendMidiCC(ccNumber, value) {
  if (midiManager.isInitialized?.value && midiManager.midiSupported?.value && selectedTrackInfo.value) {
    const track = selectedTrackInfo.value
    let trackMidiOutput = track.midiOutput || 'default'
    const trackChannel = Math.max(0, Math.min(15, track.channel || 0))
    
    const resolvedOutput = midiManager.findMidiOutput(trackMidiOutput)
    if (resolvedOutput) {
      trackMidiOutput = resolvedOutput.id
      const ccName = ccNumber === 7 ? 'Volume' : 'Pan'
      // console.log(`🎛️ Envoi CC${ccNumber} ${ccName}: "${resolvedOutput.name}" Canal=${trackChannel + 1} Valeur=${value}`)
      
      const ccSent = midiManager.sendControlChange(trackMidiOutput, trackChannel, ccNumber, value)
      
      /*
      if (ccSent) {
        console.log(`✅ ${ccName} CC${ccNumber} envoyé avec succès`)
      } else {
        console.error(`❌ Échec envoi ${ccName} CC${ccNumber}`)
      }
      */    
    } else {
      // console.warn(`⚠️ Sortie MIDI "${track.midiOutput}" non trouvée pour envoi CC${ccNumber}`)
    }
  } else {
    // console.warn(`⚠️ MIDI non disponible pour envoi CC${ccNumber}`)
  }
}

function toggleMute() {
  if (!selectedTrackInfo.value) return
  localMuted.value = !localMuted.value
  midiStore.toggleTrackMute(selectedTrackInfo.value.id)
}

function toggleSolo() {
  if (!selectedTrackInfo.value) return
  localSolo.value = !localSolo.value
  midiStore.toggleTrackSolo(selectedTrackInfo.value.id)
}

function toggleRecord() {
  if (!selectedTrackInfo.value) return
  const newRecordState = !selectedTrackInfo.value.record
  midiStore.toggleTrackRecord(selectedTrackInfo.value.id)
  
  // Auto-activer le monitoring quand Record est activé
  if (newRecordState && !selectedTrackInfo.value.monitor) {
    midiStore.toggleTrackMonitor(selectedTrackInfo.value.id)
  }
  // Auto-désactiver le monitoring quand Record est désactivé
  else if (!newRecordState && selectedTrackInfo.value.monitor) {
    midiStore.toggleTrackMonitor(selectedTrackInfo.value.id)
  }
}

function toggleMonitor() {
  if (!selectedTrackInfo.value) return
  midiStore.toggleTrackMonitor(selectedTrackInfo.value.id)
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

.track-name-container {
  width: 100%;
}

.track-name-display {
  padding: 1px 3px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: var(--lane-bg);
  font-size: 12px;
  font-weight: 500;
  color: var(--track-name);
  cursor: text;
  transition: background-color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  height: 18px;
  display: flex;
  align-items: center;
}

.track-name-display:hover {
  background: var(--panel-bg);
}

.track-name-input {
  background: var(--panel-bg);
  border: 1px solid var(--menu-active-fg);
  border-radius: 2px;
  padding: 1px 3px;
  font-size: 12px;
  font-weight: 500;
  color: var(--track-name);
  width: 100%;
  line-height: 1.2;
  height: 18px;
  outline: none;
  box-sizing: border-box;
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
  gap: 2px;
}

.control-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 24px;
  max-width: 28px;
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