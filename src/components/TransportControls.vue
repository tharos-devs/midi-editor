<!-- components/TransportControls.vue - VERSION SIMPLIFIÉE -->
<template>
  <el-row>
    <el-col :span="2">
    </el-col>
    <el-col :span="20" class="transport-controls" :class="{ playing: isPlaying, paused: isPaused }">
      <!-- Affichage de la position (mesure.temps.subdivision) -->
      <div class="position-display">
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

        <!-- Mode d'enregistrement -->
        <el-select
          v-model="recordMode"
          size="small"
          style="width: 80px"
          title="Mode d'enregistrement"
        >
          <el-option label="Merge" value="merge" title="Ajouter aux données existantes" />
          <el-option label="Replace" value="replace" title="Remplacer les données existantes" />
        </el-select>

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

      <!-- Contrôle vitesse curseur -->
      <div class="cursor-speed-control">
        <el-tooltip content="Vitesse d'affichage du curseur" placement="top">
          <el-select
            v-model="localCursorSpeedRatio"
            size="small"
            style="width: 90px"
            @change="handleCursorSpeedChange"
          >
            <el-option label="0.1x" :value="0.1" />
            <el-option label="0.25x" :value="0.25" />
            <el-option label="0.5x" :value="0.5" />
            <el-option label="0.75x" :value="0.75" />
            <el-option label="1x" :value="1.0" />
            <el-option label="1.5x" :value="1.5" />
            <el-option label="2x" :value="2.0" />
          </el-select>
        </el-tooltip>
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
    </el-col>
    <el-col :span="2" align="right" style="padding-right: 20px">
      <el-button :type="showEditor ? 'primary' : 'default'" @click="handleShowEditor">Edit</el-button>
    </el-col>
  </el-row>
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
} from '@element-plus/icons-vue'
import { useMidiPlayer } from '@/composables/useMidiPlayer'
import { useMidiManager } from '@/composables/useMidiManager'
import { useMidiStore } from '@/stores/midi'
import { useProjectStore } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
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
  }
})

// Composables
const midiPlayer = useMidiPlayer()
const midiManager = useMidiManager()
const midiStore = useMidiStore()
const projectStore = useProjectStore()
const uiStore = useUIStore()
const cursor = usePlaybackCursor()
const timeSignature = useTimeSignature()
const markerStore = usePlaybackMarkerStore()
const cursorStore = usePlaybackCursorStore()
const keyboard = useKeyboardEvents()
const showEditor = ref(true)

// Refs locales
const localPlaybackRate = ref(1)
const localCursorSpeedRatio = ref(1.0)

// Mode d'enregistrement
const recordMode = computed({
  get: () => projectStore.userPreferences.keyboard.recordingMode,
  set: (value) => projectStore.updateUserPreferences('keyboard', { recordingMode: value })
})


// ============ SYNCHRONISATION SIMPLIFIÉE ============
// Synchroniser uniquement le curseur avec le lecteur MIDI
watch(() => midiPlayer.isPlaying.value, (playing) => {
  if (playing) {
    // Démarrer le curseur - PAS de syncWithPlayer car le MidiPlayer met à jour directement le store
    cursor.startPlayback()
  } else {
    // CORRECTION: Ne pas réinitialiser le curseur si c'est un arrêt de fin de morceau
    if (midiPlayer.stoppedAtEnd?.value) {
      cursor.unsyncFromPlayer() // Juste arrêter la sync, pas le curseur
    } else {
      cursor.pausePlayback()
      cursor.unsyncFromPlayer()
    }
  }
}, { immediate: true })

// CORRECTION FINALE: Synchronisation continue du curseur avec le temps musical de MidiPlayer
watch(() => midiPlayer.currentTime.value, (newTime) => {
  const hasTempoChanges = midiStore.tempoEvents.length > 0
  
  // Debug désactivé - trop verbeux
  
  // TOUJOURS synchroniser le curseur avec le temps musical du MidiPlayer
  // Le MidiPlayer calcule déjà le temps musical avec les changements de tempo
  cursor.currentTime.value = newTime
  
  // Si changements de tempo, arrêter le timer interne du curseur
  if (hasTempoChanges && cursor.internalTimer?.value) {
    cursor.stopInternalTimer()
    // Timer curseur arrêté - suit MidiPlayer
  }
}, { immediate: true })

// Synchroniser la durée totale
watch(() => midiPlayer.totalDuration.value, (newDuration) => {
  if (newDuration && newDuration > 0) {
    cursor.totalDuration.value = newDuration
  }
}, { immediate: true })

// SUPPRIMÉ: Plus de synchronisation de tempo - MidiPlayer s'en charge

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

// Computed pour le tempo - UTILISE DIRECTEMENT MidiPlayer
const currentTempo = computed(() => {
  // MidiPlayer est la seule source de vérité pour le tempo
  // Il gère déjà l'interpolation et les changements de tempo/signatures
  return midiPlayer.currentTempo?.value || 120
})

// Computed pour un temps sécurisé qui ne dépasse jamais la durée totale
const safeCurrentTimeFormatted = computed(() => {
  const safeTime = Math.min(currentTime.value, totalDuration.value)
  const mins = Math.floor(safeTime / 60)
  const secs = Math.floor(safeTime % 60)
  const ms = Math.floor((safeTime % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
})

// NOUVEAU: Computed pour la position mesure.temps.subdivision basé sur le cursor
const currentPositionFormatted = computed(() => {
  if (!midiStore.isLoaded || !timeSignature) {
    return '0000.00.00'
  }

  const time = cursorStore.currentTime
  
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
  if (!canPlay.value) {
    return
  }
  
  if (isPlaying.value) {
    pause()
  } else {
    // CORRECTION: Reset stoppedAtEnd quand on relance manuellement
    if (midiPlayer.stoppedAtEnd?.value) {
      midiPlayer.stoppedAtEnd.value = false
    }
    
    
    // Si marqueur P présent, démarrer à cette position
    if (markerStore.hasMarker) {
      seekTo(markerStore.markerTime)
    }
    
    play()
  }
}

function handleStop() {
  stop()
}

function handleRewind() {
  rewind()
}



function handlePlaybackRateChange(newRate) {
  playbackRate.value = newRate
}

function handleCursorSpeedChange(newRatio) {
  uiStore.setCursorSpeedRatio(newRatio)
  console.log('🎯 Vitesse curseur:', newRatio + 'x')
}

function handlePlaybackMarker() {
  // Utiliser la position du curseur store global qui suit les clics timeline
  const cursorTime = cursorStore.currentTime
  // console.log('🅿️ Touche P pressée à la position:', cursorTime.toFixed(2) + 's')
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

function handleShowEditor() {
  showEditor.value = !showEditor.value
  console.log('🎛️ Editor mode:', showEditor.value)
}

// Exposer showEditor pour le parent
defineExpose({
  showEditor
})

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
  // console.log('⌨️  Raccourcis TransportControls configurés')
  
  localPlaybackRate.value = playbackRate.value
  localCursorSpeedRatio.value = uiStore.cursorSpeedRatio
})

onUnmounted(() => {
  cursor.stopPlayback()
  // Le nettoyage des listeners est automatique grâce au composable
})
</script>

<style scoped>
.transport-controls {
  margin: 0 auto;
}

.transport-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 0 5px 0;
  background: var(--el-bg-color);
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
  font-size: 18px;
  font-weight: bold;
  color: var(--el-text-color-regular);
  min-width: 140px;
  padding: 3px 0 0 8px;
}

.separator {
  margin: 0 6px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.current-time {
  color: var(--el-color-primary);
  font-family: 'Courier New', monospace;
  min-width: 65px;
  text-align: right;
  flex-shrink: 0;
}

.total-time {
  color: var(--el-text-color-regular);
  font-family: 'Courier New', monospace;
  min-width: 65px;
  text-align: left;
  flex-shrink: 0;
}

.tempo-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 18px;
  color: var(--el-text-color-regular);
  min-width: 70px;
}

.position-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 18px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  padding: 10px 8px;
  min-width: 100px;
}

.position-text {
  font-family: 'Courier New', monospace;
  min-width: 85px;
  text-align: center;
  flex-shrink: 0;
}

.playback-rate {
  display: flex;
  align-items: center;
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
