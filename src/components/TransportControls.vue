<!-- components/TransportControls.vue -->
<template>
  <div class="transport-controls">
    <div class="transport-buttons">
      <!-- Bouton Rewind -->
      <el-button
        :icon="DArrowLeft"
        :disabled="!canPlay"
        @click="handleRewind"
        title="Retour au début (R)"
        circle
        size="small"
      />

      <!-- Bouton Stop -->
      <el-button
        :icon="SwitchButton"
        :disabled="!canPlay"
        @click="handleStop"
        title="Arrêter (S)"
        circle
        size="small"
        type="danger"
      />

      <!-- Bouton Play/Pause -->
      <el-button
        :icon="isPlaying ? VideoPause : VideoPlay"
        :disabled="!canPlay"
        @click="handlePlayPause"
        :title="isPlaying ? 'Pause (Espace)' : 'Lecture (Espace)'"
        circle
        type="primary"
      />

      <!-- Bouton Loop (optionnel) -->
      <el-button
        :icon="Refresh"
        :disabled="!canPlay"
        @click="toggleLoop"
        :title="isLooping ? 'Désactiver la boucle (L)' : 'Activer la boucle (L)'"
        :type="isLooping ? 'success' : 'default'"
        circle
        size="small"
      />
    </div>

    <!-- Affichage du temps -->
    <div class="time-display">
      <span class="current-time">{{ currentTimeFormatted }}</span>
      <span class="separator">/</span>
      <span class="total-time">{{ totalDurationFormatted }}</span>
    </div>

    <!-- Barre de progression (optionnelle) -->
    <div 
      v-if="showProgressBar" 
      class="progress-bar"
      @click="handleProgressClick"
      ref="progressBarRef"
    >
      <div class="progress-background">
        <div 
          class="progress-fill"
          :style="{ width: progress + '%' }"
        />
        <div 
          class="progress-handle"
          :style="{ left: progress + '%' }"
        />
      </div>
    </div>

    <!-- Indicateur de tempo (optionnel) -->
    <div v-if="showTempo" class="tempo-display">
      <el-icon><Timer /></el-icon>
      <span>{{ Math.round(currentTempo) }} BPM</span>
    </div>

    <!-- Contrôles de vitesse (optionnel) -->
    <div v-if="showPlaybackRate" class="playback-rate">
      <el-select
        v-model="localPlaybackRate"
        size="small"
        style="width: 80px"
        @change="handlePlaybackRateChange"
      >
        <el-option label="0.5x" :value="0.5" />
        <el-option label="0.75x" :value="0.75" />
        <el-option label="1x" :value="1" />
        <el-option label="1.25x" :value="1.25" />
        <el-option label="1.5x" :value="1.5" />
        <el-option label="2x" :value="2" />
      </el-select>
    </div>

    <!-- Indicateur de statut MIDI -->
    <div class="midi-status">
      <el-icon 
        :class="['status-icon', midiStatusClass]"
        :title="midiStatusText"
      >
        <component :is="midiStatusIcon" />
      </el-icon>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  VideoPlay, 
  VideoPause, 
  SwitchButton, 
  DArrowLeft, 
  Refresh, 
  Timer,
  Connection,
  Close,
  Warning,
  Star
} from '@element-plus/icons-vue'
import { useMidiPlayer } from '@/composables/useMidiPlayer'
import { useMidiManager } from '@/composables/useMidiManager'
import { useMidiStore } from '@/stores/midi'

// Props
const props = defineProps({
  showProgressBar: {
    type: Boolean,
    default: false
  },
  showTempo: {
    type: Boolean,
    default: false
  },
  showPlaybackRate: {
    type: Boolean,
    default: false
  },
  compact: {
    type: Boolean,
    default: true
  }
})

// Composables
const midiPlayer = useMidiPlayer()
const midiManager = useMidiManager()
const midiStore = useMidiStore()

// Refs locales
const progressBarRef = ref(null)
const localPlaybackRate = ref(1)

// Destructurer les propriétés du lecteur
const {
  isPlaying,
  isPaused,
  currentTime,
  totalDuration,
  currentTimeFormatted,
  totalDurationFormatted,
  progress,
  canPlay,
  playbackRate,
  isLooping,
  play,
  pause,
  stop,
  rewind,
  seekTo,
  toggleLoop
} = midiPlayer

// Computed
const currentTempo = computed(() => {
  return midiStore.getTempoAtTime(currentTime.value)
})

const midiStatusClass = computed(() => {
  switch (midiManager.midiStatus) {
    case 'connected': return 'status-connected'
    case 'disconnected': return 'status-disconnected'
    case 'no-devices': return 'status-warning'
    case 'unsupported': return 'status-error'
    default: return 'status-unknown'
  }
})

const midiStatusIcon = computed(() => {
  switch (midiManager.midiStatus) {
    case 'connected': return Connection
    case 'disconnected': return Close
    case 'no-devices': 
    case 'unsupported': return Warning
    default: return Connection
  }
})

const midiStatusText = computed(() => {
  return midiManager.midiStatusText
})

// Méthodes
function handlePlayPause() {
  if (isPlaying.value) {
    pause()
  } else {
    play()
  }
}

function handleStop() {
  stop()
}

function handleRewind() {
  rewind()
}

function handleProgressClick(event) {
  if (!canPlay.value || !progressBarRef.value) return
  
  const rect = progressBarRef.value.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const percentage = clickX / rect.width
  const targetTime = percentage * totalDuration.value
  
  seekTo(targetTime)
}

function handlePlaybackRateChange(newRate) {
  playbackRate.value = newRate
}

// Gestion des raccourcis clavier
function handleKeyPress(event) {
  if (!canPlay.value) return
  
  // Éviter les conflits avec les champs de saisie
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return
  }
  
  switch (event.code) {
    case 'Space':
      event.preventDefault()
      handlePlayPause()
      break
    case 'KeyS':
      if (!event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        handleStop()
      }
      break
    case 'KeyR':
      if (!event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        handleRewind()
      }
      break
    case 'KeyL':
      if (!event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        toggleLoop()
      }
      break
    case 'ArrowLeft':
      if (event.shiftKey) {
        event.preventDefault()
        seekTo(Math.max(0, currentTime.value - 5)) // Reculer de 5 secondes
      }
      break
    case 'ArrowRight':
      if (event.shiftKey) {
        event.preventDefault()
        seekTo(Math.min(totalDuration.value, currentTime.value + 5)) // Avancer de 5 secondes
      }
      break
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('keydown', handleKeyPress)
  localPlaybackRate.value = playbackRate.value
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyPress)
})
</script>

<style scoped>
.transport-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  user-select: none;
}

.transport-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.time-display {
  display: flex;
  align-items: center;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  min-width: 140px;
}

.separator {
  margin: 0 6px;
  color: var(--el-text-color-secondary);
}

.current-time {
  color: var(--el-color-primary);
}

.total-time {
  color: var(--el-text-color-regular);
}

.progress-bar {
  flex: 1;
  min-width: 100px;
  height: 20px;
  cursor: pointer;
  padding: 4px 0;
}

.progress-background {
  position: relative;
  width: 100%;
  height: 4px;
  background: var(--el-border-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--el-color-primary);
  border-radius: 2px;
  transition: width 0.1s ease;
}

.progress-handle {
  position: absolute;
  top: -4px;
  width: 12px;
  height: 12px;
  background: var(--el-color-primary);
  border: 2px solid var(--el-bg-color);
  border-radius: 50%;
  transform: translateX(-50%);
  transition: left 0.1s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.progress-bar:hover .progress-handle {
  background: var(--el-color-primary-light-3);
}

.tempo-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  min-width: 70px;
}

.playback-rate {
  display: flex;
  align-items: center;
}

.midi-status {
  display: flex;
  align-items: center;
}

.status-icon {
  font-size: 16px;
  transition: color 0.3s ease;
}

.status-connected {
  color: var(--el-color-success);
}

.status-disconnected {
  color: var(--el-color-danger);
}

.status-warning {
  color: var(--el-color-warning);
}

.status-error {
  color: var(--el-color-danger);
}

.status-unknown {
  color: var(--el-text-color-secondary);
}

/* Mode compact */
.transport-controls.compact {
  padding: 4px 8px;
  gap: 8px;
}

.transport-controls.compact .time-display {
  font-size: 12px;
  min-width: 120px;
}

/* Animations */
.transport-buttons .el-button {
  transition: all 0.2s ease;
}

.transport-buttons .el-button:hover {
  transform: translateY(-1px);
}

.transport-buttons .el-button:active {
  transform: translateY(0);
}

/* États de lecture */
.transport-controls.playing .current-time {
  color: var(--el-color-success);
}

.transport-controls.paused .current-time {
  color: var(--el-color-warning);
}

/* Responsive */
@media (max-width: 768px) {
  .transport-controls {
    gap: 8px;
    padding: 6px;
  }
  
  .time-display {
    font-size: 12px;
    min-width: 100px;
  }
  
  .tempo-display,
  .playback-rate {
    display: none;
  }
}
</style>