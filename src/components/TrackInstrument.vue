<template>
  <div 
    class="track-instrument" 
    :class="{ active: isSelected, expanded: showExtendedControls }"
    :style="{ minHeight: `${trackHeight}px` }"
  >
    <!-- Bande de couleur cliquable -->
    <div 
      class="color-band" 
      :style="{ backgroundColor: track.color }"
      @click="showColorPicker = true"
      title="Cliquer pour changer la couleur"
    ></div>

    <!-- Contenu principal -->
    <div class="track-content">
      <!-- En-tête avec informations de base -->
      <div class="track-header" @click="selectTrack">
        <div class="track-main-info">
          <div class="track-number">{{ getTrackNumber() }}</div>
          <div class="track-details">
            <input
              v-if="editingName"
              v-model="tempTrackName"
              @blur="saveTrackName"
              @keyup.enter="saveTrackName"
              @keyup.escape="cancelEditName"
              class="track-name-input"
              ref="nameInput"
            />
            <div 
              v-else
              class="track-name"
              @dblclick="startEditName"
              title="Double-cliquer pour modifier"
            >
              {{ track.name }}
            </div>
            <div class="track-instrument-name">
              {{ track.instrument?.name || track.instrument || 'Piano' }}
            </div>
          </div>
        </div>

        <div class="track-controls">
          <!-- Icône + pour toggler les contrôles -->
          <el-button
            :icon="Plus"
            size="small"
            circle
            text
            @click.stop="toggleExtendedControls"
            :class="{ active: showExtendedControls }"
            title="Contrôles avancés"
            class="toggle-btn"
          />
        </div>
      </div>

      <!-- Slider de volume horizontal -->
      <div class="volume-slider-container">
        <div class="volume-slider">
          <el-slider
            :model-value="track.volume"
            :min="0"
            :max="127"
            :show-tooltip="false"
            size="small"
            @change="onVolumeChange"
          />
        </div>
        <div class="volume-value">{{ track.volume }}</div>
      </div>

      <!-- Contrôles étendus -->
      <div v-if="showExtendedControls" class="extended-controls">
        <div class="controls-row">
          <!-- Canal MIDI et Sortie MIDI -->
          <div class="midi-controls">
            <el-select
              :model-value="track.channel + 1"
              size="small"
              placeholder="Canal"
              @change="onChannelChange"
              class="channel-select"
            >
              <el-option
                v-for="channel in 16"
                :key="channel"
                :label="`Ch${channel}`"
                :value="channel"
              />
            </el-select>

            <el-select
              :model-value="track.midiOutput || 'default'"
              size="small"
              placeholder="Sortie"
              @change="onOutputChange"
              :disabled="!midiSupported || midiOutputs.length === 0"
              class="output-select"
            >
              <el-option label="Défaut" value="default" />
              <el-option
                v-for="output in midiOutputs"
                :key="output.id"
                :label="output.name"
                :value="output.id"
              />
            </el-select>
          </div>

          <!-- Boutons Mute et Solo -->
          <div class="button-controls">
            <el-button
              :type="track.muted ? 'danger' : 'default'"
              size="small"
              @click.stop="toggleMute"
              class="control-button mute-btn"
            >
              M
            </el-button>
            <el-button
              :type="track.solo ? 'warning' : 'default'"
              size="small"
              @click.stop="toggleSolo"
              class="control-button solo-btn"
            >
              S
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sélecteur de couleur -->
    <el-dialog
      v-model="showColorPicker"
      title="Choisir une couleur"
      width="300px"
      align-center
    >
      <div class="color-picker">
        <div class="color-grid">
          <div
            v-for="color in colorPresets"
            :key="color"
            class="color-option"
            :style="{ backgroundColor: color }"
            @click="changeTrackColor(color)"
            :class="{ selected: track.color === color }"
          ></div>
        </div>
        <div class="custom-color">
          <label>Couleur personnalisée:</label>
          <input
            type="color"
            :value="track.color"
            @change="changeTrackColor($event.target.value)"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useMidiStore } from '@/stores/midi'

// Props
const props = defineProps({
  track: {
    type: Object,
    required: true
  },
  height: {
    type: Number,
    default: 48 // Hauteur par défaut
  }
})

// Émissions
const emit = defineEmits([
  'channel-changed',
  'output-changed',
  'track-selected'
])

// Store
const midiStore = useMidiStore()

// État local
const showExtendedControls = ref(false)
const showColorPicker = ref(false)
const editingName = ref(false)
const tempTrackName = ref('')
const nameInput = ref(null)

// État MIDI
const midiAccess = ref(null)
const midiOutputs = ref([])
const midiSupported = ref(false)

// Couleurs prédefinies
const colorPresets = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F39C12', '#E74C3C', '#9B59B6', '#3498DB', '#2ECC71',
  '#1ABC9C', '#34495E', '#95A5A6', '#E67E22', '#C0392B'
]

// Computed
const isSelected = computed(() => midiStore.selectedTrack === props.track.id)
const trackHeight = computed(() => {
  // Hauteur de base + espace supplémentaire si les contrôles étendus sont ouverts
  return showExtendedControls.value ? props.height + 32 : props.height
})

// Initialisation
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
  const tracks = midiStore.tracks
  const index = tracks.findIndex(t => t.id === props.track.id)
  return index + 1
}

// Gestionnaires d'événements
function selectTrack() {
  midiStore.selectTrack(props.track.id)
  emit('track-selected', props.track.id)
}

function toggleExtendedControls() {
  showExtendedControls.value = !showExtendedControls.value
}

function startEditName() {
  editingName.value = true
  tempTrackName.value = props.track.name
  nextTick(() => {
    if (nameInput.value) {
      nameInput.value.focus()
      nameInput.value.select()
    }
  })
}

function saveTrackName() {
  if (tempTrackName.value.trim() && tempTrackName.value !== props.track.name) {
    midiStore.updateTrackName(props.track.id, tempTrackName.value.trim())
    ElMessage.success('Nom de la piste mis à jour')
  }
  editingName.value = false
}

function cancelEditName() {
  editingName.value = false
  tempTrackName.value = props.track.name
}

function changeTrackColor(color) {
  midiStore.updateTrackColor(props.track.id, color)
  showColorPicker.value = false
  ElMessage.success('Couleur de la piste mise à jour')
}

function onVolumeChange(volume) {
  midiStore.updateTrackVolume(props.track.id, volume)
}

function onChannelChange(newChannel) {
  const channelIndex = newChannel - 1
  midiStore.updateTrackChannel(props.track.id, channelIndex)
  
  emit('channel-changed', {
    trackId: props.track.id,
    channel: channelIndex
  })
  
  ElMessage.success(`Canal MIDI changé vers ${newChannel}`)
}

function onOutputChange(outputId) {
  midiStore.updateTrackMidiOutput(props.track.id, outputId)
  
  emit('output-changed', {
    trackId: props.track.id,
    outputId: outputId
  })
  
  const outputName = outputId === 'default' 
    ? 'Sortie par défaut'
    : midiOutputs.value.find(o => o.id === outputId)?.name || 'Inconnu'
  
  ElMessage.success(`Sortie MIDI changée vers ${outputName}`)
}

function toggleMute() {
  midiStore.toggleTrackMute(props.track.id)
}

function toggleSolo() {
  midiStore.toggleTrackSolo(props.track.id)
}
</script>

<style scoped>
.track-instrument {
  display: flex;
  background: var(--track-bg);
  overflow: hidden;
  transition: all 0.2s ease;
  cursor: pointer;
  /* Supprimé min-height fixe, maintenant géré par :style */
}

.track-instrument:hover {
  background: var(--lane-bg);
  border-color: var(--menu-active-fg);
}

.track-instrument.active {
  border-color: var(--menu-active-fg);
  background: var(--track-active-bg);
  box-shadow: 0 0 0 1px var(--menu-active-fg);
}

.track-instrument.expanded {
  cursor: default;
}

.color-band {
  width: 6px;
  min-width: 6px;
  cursor: pointer;
  transition: width 0.2s ease;
}

.color-band:hover {
  width: 8px;
}

.track-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  justify-content: center; /* Centre le contenu verticalement */
}

.track-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-bottom: 6px;
}

.track-main-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-number {
  color: var(--track-name);
  font-size: 14px;
  font-weight: bold;
  min-width: 20px;
  text-align: center;
}

.track-details {
  flex: 1;
  min-width: 0;
}

.track-name {
  font-weight: 500;
  font-size: 13px;
  color: var(--track-name);
  margin-bottom: 1px;
  cursor: text;
  padding: 1px 2px;
  border-radius: 2px;
  transition: background-color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-name:hover {
  background: var(--lane-bg);
}

.track-name-input {
  background: var(--panel-bg);
  border: 1px solid var(--menu-active-fg);
  border-radius: 2px;
  padding: 1px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--track-name);
  width: 100%;
}

.track-instrument-name {
  font-size: 10px;
  color: var(--track-instrument);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-controls {
  display: flex;
  align-items: center;
}

.toggle-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--track-instrument);
}

.toggle-btn.active {
  background: var(--menu-active-fg);
  border-color: var(--menu-active-fg);
  color: white;
}

.toggle-btn:hover {
  border-color: var(--menu-active-fg);
  color: var(--menu-active-fg);
}

.toggle-btn.active:hover {
  background: var(--menu-active-bg);
}

.volume-slider-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.volume-slider {
  flex: 1;
}

.volume-value {
  font-size: 10px;
  color: var(--track-details);
  min-width: 24px;
  text-align: right;
}

.extended-controls {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  padding: 8px;
  margin-top: 4px;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.midi-controls {
  flex: 1;
  display: flex;
  gap: 6px;
}

.channel-select,
.output-select {
  flex: 1;
  min-width: 60px;
}

.button-controls {
  display: flex;
  gap: 4px;
}

.control-button {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 10px;
  font-weight: bold;
}

.mute-btn.el-button--danger {
  background-color: #f56565;
  border-color: #f56565;
  color: white;
}

.solo-btn.el-button--warning {
  background-color: #ed8936;
  border-color: #ed8936;
  color: white;
}

.color-picker {
  padding: 16px 0;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: var(--menu-active-fg);
}

.color-option.selected {
  border-color: var(--menu-active-fg);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.custom-color {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.custom-color label {
  font-size: 12px;
  color: var(--track-instrument);
}

.custom-color input[type="color"] {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* Styles pour les composants Element Plus */
:deep(.el-select) {
  --el-select-border-color-hover: var(--menu-active-fg);
}

:deep(.el-select .el-input__wrapper) {
  font-size: 10px;
}

:deep(.el-slider__runway) {
  height: 4px;
}

:deep(.el-slider__button) {
  width: 12px;
  height: 12px;
}

:deep(.el-button--small) {
  font-size: 10px;
}

/* Responsive */
@media (max-width: 768px) {
  .controls-row {
    flex-direction: column;
    gap: 6px;
  }
  
  .midi-controls {
    width: 100%;
  }
  
  .button-controls {
    justify-content: center;
  }
}
</style>