<!-- components/TransportControls.vue - VERSION SIMPLIFIÉE -->
<template>
  <div class="transport-controls" :class="{ compact, playing: isPlaying, paused: isPaused }">
    <!-- Affichage de la position (mesure.temps.subdivision) -->
    <div class="position-display">
      <el-icon><Location /></el-icon>
      <span class="position-text">{{ currentPositionFormatted }}</span>
    </div>

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
      <span class="current-time">{{ safeCurrentTimeFormatted }}</span>
      <span class="separator">/</span>
      <span class="total-time">{{ totalDurationFormatted }}</span>
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

    <!-- DEBUG: Affichage temporaire pour diagnostic -->
    <div v-if="showDebug" class="debug-transport">
      <div>Player: {{ isPlaying ? 'Playing' : 'Stopped' }}</div>
      <div>Cursor: {{ cursor.isPlaying.value ? 'Playing' : 'Stopped' }}</div>
      <div>Time: {{ currentTime.toFixed(2) }}s</div>
      <div>CursorTime: {{ cursor.currentTime.value.toFixed(2) }}s</div>
      <div>Position: {{ cursor.pixelPosition.value.toFixed(1) }}px</div>
      <div>Duration: {{ totalDuration.toFixed(2) }}s</div>
      <div>CanPlay: {{ canPlay ? 'Yes' : 'No' }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, provide } from 'vue'
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
  Location
} from '@element-plus/icons-vue'
import { useMidiPlayer } from '@/composables/useMidiPlayer'
import { useMidiManager } from '@/composables/useMidiManager'
import { useMidiStore } from '@/stores/midi'
import { usePlaybackCursor } from '@/composables/usePlaybackCursor'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { usePlaybackMarkerStore } from '@/stores/playbackMarker'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'
import { useKeyboardEvents } from '@/composables/useKeyboardEvents'

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
  },
  showDebug: {
    type: Boolean,
    default: false
  }
})

// Composables
const midiPlayer = useMidiPlayer()
const midiManager = useMidiManager()
const midiStore = useMidiStore()
const cursor = usePlaybackCursor()
const timeSignature = useTimeSignature()
const markerStore = usePlaybackMarkerStore()
const cursorStore = usePlaybackCursorStore()
const keyboard = useKeyboardEvents()

// Refs locales
const localPlaybackRate = ref(1)

// ============ SYNCHRONISATION SIMPLIFIÉE ============
// Synchroniser uniquement le curseur avec le lecteur MIDI
watch(() => midiPlayer.isPlaying.value, (playing) => {
  console.log('🎵 MidiPlayer.isPlaying changé:', playing, 'stoppedAtEnd:', midiPlayer.stoppedAtEnd?.value)
  
  if (playing) {
    // Démarrer le curseur avec synchronisation initiale
    cursor.syncWithPlayer(midiPlayer.currentTime.value)
    cursor.startPlayback()
  } else {
    // CORRECTION: Ne pas réinitialiser le curseur si c'est un arrêt de fin de morceau
    if (midiPlayer.stoppedAtEnd?.value) {
      console.log('🏁 TransportControls: Arrêt de fin de morceau - pas de reset du curseur')
      cursor.unsyncFromPlayer() // Juste arrêter la sync, pas le curseur
    } else {
      console.log('⏹️ TransportControls: Arrêt normal - reset du curseur')
      cursor.pausePlayback()
      cursor.unsyncFromPlayer()
    }
  }
}, { immediate: true })

// Synchroniser le temps uniquement quand nécessaire
watch(() => midiPlayer.currentTime.value, (newTime) => {
  // Synchroniser seulement si le curseur n'est pas déjà en train de jouer
  if (!cursor.isPlaying.value || Math.abs(cursor.currentTime.value - newTime) > 0.5) {
    cursor.syncWithPlayer(newTime)
  }
})

// Synchroniser la durée totale
watch(() => midiPlayer.totalDuration.value, (newDuration) => {
  if (newDuration && newDuration > 0) {
    cursor.totalDuration.value = newDuration
    console.log('📏 Durée synchronisée:', newDuration)
  }
}, { immediate: true })

// Synchroniser le tempo
watch(() => midiStore.getCurrentTempo, (newTempo) => {
  cursor.currentTempo.value = newTempo
}, { immediate: true })

// ============ PROVISION DES DONNÉES ============
provide('midiPlayer', midiPlayer)
provide('playbackCursor', cursor)

// Destructurer les propriétés du lecteur
const {
  isPlaying,
  isPaused,
  currentTime,
  totalDuration,
  currentTimeFormatted,
  totalDurationFormatted,
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

// Computed pour le tempo en temps réel
const currentTempo = computed(() => {
  // Priorité au tempo du lecteur MIDI s'il est en cours de lecture
  if (isPlaying.value && midiPlayer.currentTempo?.value) {
    return midiPlayer.currentTempo.value
  }
  
  // Sinon, calculer le tempo basé sur la position actuelle
  return midiStore.getTempoAtTime ? midiStore.getTempoAtTime(currentTime.value) : 120
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

// Computed pour un temps sécurisé qui ne dépasse jamais la durée totale
const safeCurrentTimeFormatted = computed(() => {
  const safeTime = Math.min(currentTime.value, totalDuration.value)
  const mins = Math.floor(safeTime / 60)
  const secs = Math.floor(safeTime % 60)
  const ms = Math.floor((safeTime % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
})

// NOUVEAU: Computed pour la position mesure.temps.subdivision
const currentPositionFormatted = computed(() => {
  if (!midiStore.isLoaded || !timeSignature) {
    return '0000.00.00'
  }

  const time = currentTime.value
  
  // Utiliser les fonctions de timeSignature pour calculer la position
  const measures = timeSignature.measuresWithSignatures?.value || []
  if (measures.length === 0) {
    return '0000.00.00'
  }

  // Trouver la mesure courante
  let currentMeasure = null
  let measureIndex = 0
  
  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i]
    const measureStartTime = measure.startTime || 0
    const measureEndTime = measure.endTime || measureStartTime + 2 // fallback 2s par mesure
    
    if (time >= measureStartTime && time < measureEndTime) {
      currentMeasure = measure
      measureIndex = i
      break
    }
  }

  if (!currentMeasure) {
    // Si pas trouvé, prendre la dernière mesure
    currentMeasure = measures[measures.length - 1]
    measureIndex = measures.length - 1
  }

  const measureNumber = (measureIndex + 1).toString().padStart(4, '0')
  
  // Calculer le temps dans la mesure
  const measureStartTime = currentMeasure.startTime || 0
  const timeInMeasure = time - measureStartTime
  const signature = currentMeasure.timeSignature || { numerator: 4, denominator: 4 }
  
  // Calculer la durée d'un temps (quarter note en secondes)
  const tempo = currentTempo.value || 120
  const quarterNoteDuration = 60 / tempo
  const beatDuration = quarterNoteDuration * (4 / signature.denominator)
  
  // Calculer le temps et subdivision
  const beatNumber = Math.floor(timeInMeasure / beatDuration) + 1
  const timeInBeat = timeInMeasure % beatDuration
  const subdivisionNumber = Math.floor((timeInBeat / beatDuration) * 16) + 1 // 16 subdivisions par temps
  
  const beatFormatted = Math.min(beatNumber, signature.numerator).toString().padStart(2, '0')
  const subdivisionFormatted = Math.min(subdivisionNumber, 16).toString().padStart(2, '0')
  
  return `${measureNumber}.${beatFormatted}.${subdivisionFormatted}`
})

// ============ MÉTHODES SIMPLIFIÉES ============
function handlePlayPause() {
  console.log('🎮 PlayPause clicked:', {
    canPlay: canPlay.value,
    isPlaying: isPlaying.value,
    stoppedAtEnd: midiPlayer.stoppedAtEnd?.value
  })
  
  if (!canPlay.value) {
    console.warn('❌ Impossible de jouer')
    return
  }
  
  if (isPlaying.value) {
    pause()
  } else {
    // CORRECTION: Reset stoppedAtEnd quand on relance manuellement
    if (midiPlayer.stoppedAtEnd?.value) {
      console.log('🔄 Reset stoppedAtEnd pour permettre le redémarrage')
      midiPlayer.stoppedAtEnd.value = false
    }
    
    // Si marqueur P présent, démarrer à cette position
    if (markerStore.hasMarker) {
      console.log('🅿️ Démarrage depuis le marqueur P à:', markerStore.markerTime.toFixed(2) + 's')
      seekTo(markerStore.markerTime)
    }
    
    play()
  }
}

function handleStop() {
  console.log('⏹️ Stop clicked')
  stop()
}

function handleRewind() {
  console.log('⏪ Rewind clicked')
  rewind()
}


function handlePlaybackRateChange(newRate) {
  playbackRate.value = newRate
}

function handlePlaybackMarker() {
  // Utiliser la position du curseur store global qui suit les clics timeline
  const cursorTime = cursorStore.currentTime
  console.log('🅿️ Touche P pressée à la position:', cursorTime.toFixed(2) + 's')
  console.log('🅿️ Debug curseur:', {
    composableCursor: cursor.currentTime.value.toFixed(2) + 's',
    storeCursor: cursorStore.currentTime.toFixed(2) + 's', 
    playerTime: currentTime.value.toFixed(2) + 's'
  })
  markerStore.toggleMarker(cursorTime)
}

// Configuration des raccourcis clavier avec le nouveau système
function setupKeyboardShortcuts() {
  // Transport controls
  keyboard.shortcuts.play(() => {
    if (!canPlay.value) return false
    handlePlayPause()
    return true // Arrêter la propagation
  })
  
  keyboard.shortcuts.stop(() => {
    if (!canPlay.value) return false
    handleStop()
    return true
  }, {
    condition: (event) => !event.ctrlKey && !event.metaKey // Éviter conflit avec Ctrl+S (save)
  })
  
  keyboard.shortcuts.rewind(() => {
    if (!canPlay.value) return false
    handleRewind()
    return true
  }, {
    condition: (event) => !event.ctrlKey && !event.metaKey // Éviter conflit avec Ctrl+R (refresh)
  })
  
  keyboard.shortcuts.loop(() => {
    if (!canPlay.value) return false
    toggleLoop()
    return true
  }, {
    condition: (event) => !event.ctrlKey && !event.metaKey
  })
  
  keyboard.shortcuts.marker(() => {
    if (!canPlay.value) return false
    handlePlaybackMarker()
    return true
  }, {
    condition: (event) => !event.ctrlKey && !event.metaKey
  })
  
  // Navigation temporelle
  keyboard.shortcuts.seekLeft(() => {
    if (!canPlay.value) return false
    const newTime = Math.max(0, currentTime.value - 5)
    seekTo(newTime)
    return true
  })
  
  keyboard.shortcuts.seekRight(() => {
    if (!canPlay.value) return false
    const newTime = Math.min(totalDuration.value, currentTime.value + 5)
    seekTo(newTime)
    return true
  })
}

// Lifecycle
onMounted(() => {
  console.log('🚀 TransportControls monté')
  
  // Initialisation du curseur si MIDI déjà chargé
  if (midiStore.isLoaded && midiStore.midiInfo?.duration) {
    cursor.totalDuration.value = midiStore.midiInfo.duration
    console.log('🔧 Curseur initialisé avec durée:', midiStore.midiInfo.duration)
  }
  
  // Configuration des raccourcis clavier
  setupKeyboardShortcuts()
  console.log('⌨️  Raccourcis TransportControls configurés')
  
  localPlaybackRate.value = playbackRate.value
})

onUnmounted(() => {
  cursor.stopPlayback()
  // Le nettoyage des listeners est automatique grâce au composable
})
</script>

<style scoped>
.transport-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  user-select: none;
  box-sizing: border-box;
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

.position-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: monospace;
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 100px;
}

.position-text {
  min-width: 80px;
  text-align: center;
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

/* DEBUG */
.debug-transport {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.9);
  color: #00ff00;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 10px;
  z-index: 9999;
  border: 1px solid #00ff00;
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
  animation: pulse-time 1s ease-in-out infinite alternate;
}

.transport-controls.paused .current-time {
  color: var(--el-color-warning);
}

@keyframes pulse-time {
  from { opacity: 0.8; }
  to { opacity: 1; }
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
  .position-display,
  .playback-rate {
    display: none;
  }
}
</style>
