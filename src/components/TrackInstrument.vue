<template>
  <div 
    class="track-instrument" 
    :class="{ active: isSelected, expanded: showExtendedControls }"
    :style="{ height: `${trackHeight}px`, minHeight: showExtendedControls ? '140px' : 'auto' }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
  >
    <!-- Bande de couleur cliquable -->
    <div 
      class="color-band" 
      :style="{ backgroundColor: track.color }"
      @click.stop="showColorPicker = true"
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
          </div>
        </div>

        <div class="track-controls">
          <!-- Boutons Mute et Solo -->
          <el-button
            :type="localMuted ? 'danger' : 'default'"
            size="small"
            @click.stop="toggleMute"
            class="control-button mute-btn"
            title="Muet"
          >
            M
          </el-button>
          <el-button
            :type="localSolo ? 'warning' : 'default'"
            size="small"
            @click.stop="toggleSolo"
            class="control-button solo-btn"
            title="Solo"
          >
            S
          </el-button>
          
          <!-- Icône + pour toggler la hauteur (toujours visible) -->
          <el-button
            :icon="Plus"
            size="small"
            circle
            text
            @click.stop="toggleTrackHeight"
            :class="{ active: currentHeightLevel > 0 }"
            :title="`Hauteur: ${getHeightLevelText()}`"
            class="toggle-btn"
          />
        </div>
      </div>

      <!-- Slider de volume horizontal (visible si hauteur >= 70px) -->
      <div v-if="props.height >= 70" class="volume-slider-container">
        <div class="volume-slider">
          <el-slider
            :model-value="localVolume"
            :min="0"
            :max="127"
            :show-tooltip="false"
            size="small"
            @input="onVolumeChange"
            @change="onVolumeChange"
          />
        </div>
        <div class="volume-value">{{ localVolume }}</div>
      </div>

      <!-- Contrôles étendus (visible si hauteur >= 100px) -->
      <div v-if="props.height >= 100" class="extended-controls">
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
        </div>
      </div>
    </div>

    <!-- Sélecteur de couleur -->
    <el-dialog
      v-model="showColorPicker"
      title="Choisir une couleur"
      width="300px"
      align-center
      append-to-body
      :z-index="3000"
      destroy-on-close
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'

// Props
const props = defineProps({
  track: {
    type: Object,
    required: true
  },
  height: {
    type: Number,
    default: 30 // Hauteur par défaut
  },
  index: {
    type: Number,
    default: 0
  }
})

// Émissions
const emit = defineEmits([
  'channel-changed',
  'output-changed',
  'track-selected',
  'track-reorder',
  'height-changed' // Nouvelle émission pour changer la hauteur
])

// Store
const midiStore = useMidiStore()

// État local
const showExtendedControls = ref(false)
const showColorPicker = ref(false)
const editingName = ref(false)
const tempTrackName = ref('')
const nameInput = ref(null)

// Variables réactives locales pour éviter les conflits
const localVolume = ref(127)
const localMuted = ref(false)
const localSolo = ref(false)

// Système de hauteur avec 3 niveaux : 30px, 70px, 100px
const heightLevels = [30, 70, 100]
const currentHeightLevel = ref(0) // Index dans heightLevels (0, 1, 2)

// État MIDI
const midiAccess = ref(null)
const midiOutputs = ref([])
const midiSupported = ref(false)

// État drag & drop
const isDragging = ref(false)
const dragOverClass = ref('')

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
  // Utiliser la hauteur de la piste si elle existe, sinon utiliser currentHeightLevel
  if (props.track.height) {
    return props.track.height
  }
  return heightLevels[currentHeightLevel.value]
})

// Watcher pour synchroniser les valeurs locales avec les props
watch(() => props.track, (newTrack) => {
  if (newTrack) {
    localVolume.value = newTrack.volume || 127
    localMuted.value = newTrack.muted || false
    localSolo.value = newTrack.solo || false
  }
}, { immediate: true, deep: true })

// Watchers pour détecter les changements externes
watch(() => props.track.volume, (newVolume) => {
  if (newVolume !== undefined && newVolume !== localVolume.value) {
    localVolume.value = newVolume
  }
})

watch(() => props.track.muted, (newMuted) => {
  if (newMuted !== undefined && newMuted !== localMuted.value) {
    localMuted.value = newMuted
  }
})

watch(() => props.track.solo, (newSolo) => {
  if (newSolo !== undefined && newSolo !== localSolo.value) {
    localSolo.value = newSolo
  }
})

// Initialisation
onMounted(async () => {
  // Déterminer le niveau de hauteur initial basé sur la hauteur de la piste
  if (props.track.height) {
    const levelIndex = heightLevels.indexOf(props.track.height)
    if (levelIndex !== -1) {
      currentHeightLevel.value = levelIndex
    }
  }
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

function toggleTrackHeight() {
  // Faire défiler les niveaux de hauteur : 0 -> 1 -> 2 -> 0
  currentHeightLevel.value = (currentHeightLevel.value + 1) % heightLevels.length
  
  const newHeight = heightLevels[currentHeightLevel.value]
  
  console.log(`📏 Hauteur piste ${props.track.name}: niveau ${currentHeightLevel.value} (${newHeight}px)`)
  
  // Émettre l'événement pour informer le parent
  emit('height-changed', {
    trackId: props.track.id,
    height: newHeight,
    level: currentHeightLevel.value
  })
}

function getHeightLevelText() {
  const levels = ['Compacte (30px)', 'Normale (70px)', 'Étendue (100px)']
  return levels[currentHeightLevel.value]
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

async function saveTrackName() {
  if (tempTrackName.value.trim() && tempTrackName.value !== props.track.name) {
    await midiStore.updateTrackName(props.track.id, tempTrackName.value.trim())
  }
  editingName.value = false
}

function cancelEditName() {
  editingName.value = false
  tempTrackName.value = props.track.name
}

async function changeTrackColor(color) {
  await midiStore.updateTrackColor(props.track.id, color)
  showColorPicker.value = false
}

// Gestionnaires avec débounce pour le volume
let volumeTimeout = null

async function onVolumeChange(volume) {
  const clampedVolume = Math.max(0, Math.min(127, Math.round(volume)))
  localVolume.value = clampedVolume
  
  // Débouncer pour éviter trop d'appels
  if (volumeTimeout) clearTimeout(volumeTimeout)
  volumeTimeout = setTimeout(async () => {
    console.log(`🔊 TrackInstrument: Mise à jour Volume piste ${props.track.id}: ${clampedVolume}`)
    await midiStore.updateTrackVolume(props.track.id, clampedVolume)
    await sendMidiCC(7, clampedVolume) // CC7 pour Volume
  }, 50) // 50ms de débounce
}

async function sendMidiCC(ccNumber, value) {
  if (midiSupported.value && midiAccess.value) {
    const trackChannel = Math.max(0, Math.min(15, props.track.channel || 0))
    let trackMidiOutput = props.track.midiOutput || 'default'
    
    // Trouver la sortie MIDI appropriée
    let targetOutput = null
    if (trackMidiOutput === 'default' && midiOutputs.value.length > 0) {
      targetOutput = midiOutputs.value[0].output
    } else {
      const outputInfo = midiOutputs.value.find(output => output.id === trackMidiOutput)
      targetOutput = outputInfo?.output
    }
    
    if (targetOutput) {
      const ccName = ccNumber === 7 ? 'Volume' : 'Pan'
      console.log(`🎛️ TrackInstrument: Envoi CC${ccNumber} ${ccName}: Canal=${trackChannel + 1} Valeur=${value}`)
      
      try {
        targetOutput.send([0xB0 + trackChannel, ccNumber, value])
        console.log(`✅ TrackInstrument: ${ccName} CC${ccNumber} envoyé avec succès`)
      } catch (error) {
        console.error(`❌ TrackInstrument: Erreur envoi ${ccName} CC${ccNumber}:`, error)
      }
    } else {
      console.warn(`⚠️ TrackInstrument: Sortie MIDI "${trackMidiOutput}" non trouvée pour envoi CC${ccNumber}`)
    }
  } else {
    console.warn(`⚠️ TrackInstrument: MIDI non disponible pour envoi CC${ccNumber}`)
  }
}

function onChannelChange(newChannel) {
  const channelIndex = newChannel - 1
  midiStore.updateTrackChannel(props.track.id, channelIndex)
  
  emit('channel-changed', {
    trackId: props.track.id,
    channel: channelIndex
  })
}

function onOutputChange(outputId) {
  midiStore.updateTrackMidiOutput(props.track.id, outputId)
  
  emit('output-changed', {
    trackId: props.track.id,
    outputId: outputId
  })
}

function toggleMute() {
  localMuted.value = !localMuted.value
  midiStore.toggleTrackMute(props.track.id)
}

function toggleSolo() {
  localSolo.value = !localSolo.value
  midiStore.toggleTrackSolo(props.track.id)
}

// Fonctions drag & drop
function onDragStart(event) {
  isDragging.value = true
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', props.track.id.toString())
  
  // Ajouter une classe CSS pour l'élément en cours de drag
  event.target.classList.add('dragging')
  
  console.log('🚀 Début du drag pour la piste:', props.track.name, 'ID:', props.track.id)
}

function onDragEnd(event) {
  isDragging.value = false
  dragOverClass.value = ''
  
  // Retirer la classe CSS
  event.target.classList.remove('dragging')
  
  console.log('🏁 Fin du drag pour la piste:', props.track.name)
}

function onDragOver(event) {
  if (isDragging.value) return // Ne pas permettre le drop sur soi-même
  
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  
  // Déterminer la position du drop (au-dessus ou en-dessous)
  const rect = event.currentTarget.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const dropPosition = event.clientY < midY ? 'before' : 'after'
  
  dragOverClass.value = `drag-over-${dropPosition}`
}

function onDrop(event) {
  event.preventDefault()
  
  const draggedTrackId = parseInt(event.dataTransfer.getData('text/plain'))
  if (draggedTrackId === props.track.id) return // Ne pas se déplacer sur soi-même
  
  // Déterminer la position du drop
  const rect = event.currentTarget.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const dropPosition = event.clientY < midY ? 'before' : 'after'
  
  // Calculer le nouvel index
  let targetIndex = props.index
  if (dropPosition === 'after') {
    targetIndex += 1
  }
  
  console.log('📦 Drop détecté:', {
    draggedTrackId,
    targetTrackId: props.track.id,
    dropPosition,
    targetIndex
  })
  
  // Émettre l'événement de réorganisation
  emit('track-reorder', {
    draggedTrackId,
    targetIndex,
    position: dropPosition
  })
  
  // Nettoyer les classes CSS
  dragOverClass.value = ''
}
</script>

<style scoped>
.track-instrument {
  display: flex;
  background: var(--track-bg);
  overflow: hidden;
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid transparent;
  position: relative;
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

/* Styles pour le drag & drop */
.track-instrument.dragging {
  opacity: 0.5;
  z-index: 1000;
}

.track-instrument.drag-over-before::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--menu-active-fg);
  border-radius: 2px;
  z-index: 10;
}

.track-instrument.drag-over-after::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--menu-active-fg);
  border-radius: 2px;
  z-index: 10;
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
  padding: 2px 8px;
  justify-content: flex-start;
}

.track-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  height: 28px;
  min-height: 28px;
  flex-shrink: 0;
}

.track-main-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-number {
  color: var(--track-name);
  font-size: 14px;
  font-weight: bold;
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.track-details {
  flex: 1;
  min-width: 0;
}

.track-name {
  font-weight: 500;
  font-size: 12px;
  color: var(--track-name);
  cursor: text;
  padding: 1px 3px;
  border-radius: 2px;
  transition: background-color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  margin-right: 5px;
}

.track-name:hover {
  background: var(--lane-bg);
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
}

.track-controls {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  margin-right: 5px;
}

.track-controls > * {
  margin-right: -7px;
}

.control-button {
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 9px;
  font-weight: bold;
  border-radius: 3px;
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
  margin: 6px 0 4px 0;
  padding: 0 4px;
  flex-shrink: 0;
}

.volume-slider {
  flex: 1;
}

.volume-value {
  font-size: 10px;
  color: var(--track-details);
  min-width: 24px;
  text-align: right;
  font-weight: 500;
}

.extended-controls {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  /*
  padding: 8px;
  margin-top: 2px;
  */
  flex-shrink: 0;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.controls-row:last-child {
  margin-bottom: 0;
}

.midi-controls {
  flex: 1;
  display: flex;
  gap: 6px;
}

.channel-select {
  max-width: 70px
}

.channel-select,
.output-select {
  flex: 1;
 
}

.pan-control {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pan-control label {
  font-size: 10px;
  color: var(--track-details);
  min-width: 30px;
}

.pan-control .el-slider {
  flex: 1;
}

.pan-value {
  font-size: 10px;
  color: var(--track-details);
  min-width: 24px;
  text-align: right;
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
</style>