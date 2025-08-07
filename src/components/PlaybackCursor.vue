<template>
  <div 
    v-if="shouldShowCursor"
    class="playback-cursor"
    :class="cursorClasses"
    :style="cursorStyle"
  >
    <!-- Ligne principale du curseur -->
    <div class="cursor-line" :style="lineStyle" />
    
    <!-- Tête du curseur (optionnelle) -->
    <div 
      v-if="showHead"
      class="cursor-head"
      :style="headStyle"
    />
    
    <!-- Indicateur de temps (optionnel) -->
    <div 
      v-if="showTimeIndicator && formattedTime"
      class="time-indicator"
      :style="timeIndicatorStyle"
    >
      {{ formattedTime }}
    </div>
    
    <!-- Indicateur de tempo (optionnel) -->
    <div 
      v-if="showTempoIndicator && currentTempo"
      class="tempo-indicator"
      :style="tempoIndicatorStyle"
    >
      ♪ {{ Math.round(currentTempo) }} BPM
    </div>
  </div>
</template>

<script setup>
import { computed, watch, onMounted, onUnmounted, inject } from 'vue'
import { usePlaybackCursor } from '@/composables/usePlaybackCursor'
import { useMidiPlayer } from '@/composables/useMidiPlayer'
import { useMidiStore } from '@/stores/midi'

const props = defineProps({
  // Position actuelle en secondes (peut être overridée par le curseur interne)
  currentTime: { type: Number, default: 0 },
  
  // État de lecture
  isPlaying: { type: Boolean, default: false },
  isPaused: { type: Boolean, default: false },
  
  // Affichage
  visible: { type: Boolean, default: true },
  showHead: { type: Boolean, default: true },
  showTimeIndicator: { type: Boolean, default: false },
  showTempoIndicator: { type: Boolean, default: false },
  
  // Styles du curseur
  cursorColor: { type: String, default: '#ff4444' },
  cursorWidth: { type: Number, default: 2 },
  cursorOpacity: { type: Number, default: 0.8 },
  
  // Styles de la tête
  headSize: { type: Number, default: 8 },
  headColor: { type: String, default: null },
  
  // Animation
  animationDuration: { type: String, default: '0.05s' },
  smoothAnimation: { type: Boolean, default: true },
  
  // Z-index
  zIndex: { type: Number, default: 100 },
  
  // Hauteur du conteneur
  containerHeight: { type: Number, default: null },
  
  // Offset vertical
  verticalOffset: { type: Number, default: 0 },
  
  // Classes CSS personnalisées
  customClasses: { type: Array, default: () => [] },
  
  // Mode de synchronisation
  autoSync: { type: Boolean, default: true },
  
  // Configuration du suivi
  followCursor: { type: Boolean, default: true },
  followPadding: { type: Number, default: 50 }
})

const emit = defineEmits(['position-change', 'tempo-change', 'sync-status-change'])

// Utiliser le composable PlaybackCursor et le lecteur MIDI
const cursor = usePlaybackCursor()
const midiPlayer = useMidiPlayer()

// Configuration initiale
onMounted(() => {
  cursor.updateConfig({
    cursorColor: props.cursorColor,
    cursorWidth: props.cursorWidth,
    cursorOpacity: props.cursorOpacity,
    headSize: props.headSize,
    headColor: props.headColor,
    showHead: props.showHead,
    showTimeIndicator: props.showTimeIndicator,
    animationDuration: props.animationDuration,
    zIndex: props.zIndex,
    followCursor: props.followCursor,
    followPadding: props.followPadding,
    smoothAnimation: props.smoothAnimation
  })
  
  // Debug initial des états
  console.log('🔍 État initial du lecteur MIDI:', {
    isPlaying: midiPlayer.isPlaying.value,
    isPaused: midiPlayer.isPaused.value,
    currentTime: midiPlayer.currentTime.value,
    autoSync: props.autoSync,
    midiPlayerObject: midiPlayer
  })
  
  // Test manuel du lecteur MIDI - clic dans la console
  window.testMidiPlayer = () => {
    console.log('🧪 Test manuel du lecteur MIDI')
    console.log('État avant:', {
      isPlaying: midiPlayer.isPlaying.value,
      canPlay: midiPlayer.canPlay?.value
    })
    
    if (midiPlayer.play) {
      midiPlayer.play()
      console.log('Commande play() envoyée')
    } else {
      console.log('❌ Méthode play() non disponible')
    }
    
    setTimeout(() => {
      console.log('État après 500ms:', {
        isPlaying: midiPlayer.isPlaying.value
      })
    }, 500)
  }
  
  // CORRECTION: Synchroniser avec le lecteur MIDI si autoSync
  if (props.autoSync) {
    setupAutoSync()
  } else {
    // Mode esclave : synchroniser avec le lecteur MIDI SANS créer de timer
    console.log('👥 Setup mode ESCLAVE - suit le lecteur MIDI sans timer')
    
    // Synchroniser l'état initial
    cursor.totalDuration.value = midiPlayer.totalDuration.value || props.currentTime
    cursor.currentTime.value = midiPlayer.currentTime.value || props.currentTime
    cursor.isPlaying.value = midiPlayer.isPlaying.value || props.isPlaying
    cursor.isPaused.value = midiPlayer.isPaused.value || props.isPaused
    
    // Écouter SEULEMENT les changements de temps (pas de timer)
    const unwatchTime = watch(() => midiPlayer.currentTime.value, (newTime) => {
      cursor.currentTime.value = newTime
    })
    
    const unwatchDuration = watch(() => midiPlayer.totalDuration.value, (newDuration) => {
      cursor.totalDuration.value = newDuration
    })
    
    onUnmounted(() => {
      unwatchTime()
      unwatchDuration()
    })
  }
})

// NOUVEAU: Configuration de la synchronisation automatique
function setupAutoSync() {
  console.log('🔗 Setup AutoSync pour le curseur MAÎTRE')
  // Synchroniser l'état initial
  cursor.totalDuration.value = midiPlayer.totalDuration.value
  cursor.currentTime.value = midiPlayer.currentTime.value
  cursor.isPlaying.value = midiPlayer.isPlaying.value
  cursor.isPaused.value = midiPlayer.isPaused.value
  
  // Écouter les changements du lecteur MIDI
  const unwatchTime = watch(() => midiPlayer.currentTime.value, (newTime) => {
    if (props.autoSync) {
      cursor.currentTime.value = newTime
      if (midiPlayer.isPlaying.value) {
        cursor.syncWithPlayer(newTime)
      }
    }
  })
  
  const unwatchPlaying = watch(() => midiPlayer.isPlaying.value, (isPlaying, oldValue) => {
    console.log('🎬 PlaybackCursor watcher - isPlaying changé:', {
      nouveau: isPlaying,
      ancien: oldValue,
      autoSync: props.autoSync,
      midiPlayerRef: !!midiPlayer.isPlaying,
      valeurDirecte: midiPlayer.isPlaying.value
    })
    
    if (props.autoSync) {
      cursor.isPlaying.value = isPlaying
      if (isPlaying) {
        console.log('🚀 PlaybackCursor - Démarrage du curseur avec temps:', midiPlayer.currentTime.value)
        cursor.syncWithPlayer(midiPlayer.currentTime.value)
        cursor.startPlayback() // CORRECTION: Démarrer explicitement le curseur
      } else {
        console.log('⏸️ PlaybackCursor - Pause du curseur')
        cursor.pausePlayback()
      }
    }
  }, { immediate: true })
  
  const unwatchPaused = watch(() => midiPlayer.isPaused.value, (isPaused) => {
    if (props.autoSync) {
      cursor.isPaused.value = isPaused
      if (isPaused) {
        cursor.pausePlayback()
      }
    }
  })
  
  const unwatchDuration = watch(() => midiPlayer.totalDuration.value, (newDuration) => {
    if (props.autoSync) {
      cursor.totalDuration.value = newDuration
    }
  })
  
  // Watcher pour détecter un stop (isPlaying=false ET isPaused=false)
  // CORRECTION: Ne pas reset si c'est un arrêt de fin de morceau
  const unwatchStop = watch(
    () => ({ 
      playing: midiPlayer.isPlaying.value, 
      paused: midiPlayer.isPaused.value,
      stoppedAtEnd: midiPlayer.stoppedAtEnd?.value 
    }),
    ({ playing, paused, stoppedAtEnd }) => {
      if (props.autoSync && !playing && !paused && !stoppedAtEnd) {
        cursor.stopPlayback()
      }
    }
  )
  
  // Nettoyer les watchers lors du démontage
  onUnmounted(() => {
    unwatchTime()
    unwatchPlaying()
    unwatchPaused()
    unwatchDuration()
    unwatchStop()
  })
}

// Synchronisation des props avec le curseur (si autoSync désactivé)
watch(() => props.currentTime, (newTime) => {
  if (!props.autoSync) {
    cursor.currentTime.value = newTime
  }
})

watch(() => props.isPlaying, (playing) => {
  if (!props.autoSync) {
    cursor.isPlaying.value = playing
  }
})

watch(() => props.isPaused, (paused) => {
  if (!props.autoSync) {
    cursor.isPaused.value = paused
  }
})

// Mise à jour de la configuration quand les props changent
watch(() => ({
  cursorColor: props.cursorColor,
  cursorWidth: props.cursorWidth,
  cursorOpacity: props.cursorOpacity,
  headSize: props.headSize,
  headColor: props.headColor,
  animationDuration: props.animationDuration,
  smoothAnimation: props.smoothAnimation
}), (newConfig) => {
  cursor.updateConfig(newConfig)
}, { deep: true })

// ============ PROPRIÉTÉS CALCULÉES ============

// Visibilité finale du curseur
const shouldShowCursor = computed(() => {
  return props.visible && cursor.shouldShowCursor.value
})

// Classes CSS combinées
const cursorClasses = computed(() => [
  ...cursor.cursorClasses.value,
  ...props.customClasses,
  {
    'auto-sync': props.autoSync,
    'manual-sync': !props.autoSync
  }
])

// Style principal du curseur avec offset vertical
const cursorStyle = computed(() => ({
  ...cursor.cursorStyle.value,
  top: `${props.verticalOffset}px`,
  height: props.containerHeight ? `${props.containerHeight}px` : '100%'
}))

// Utiliser les styles du composable
const lineStyle = computed(() => cursor.lineStyle.value)
const headStyle = computed(() => cursor.headStyle.value)

// Style de l'indicateur de temps
const timeIndicatorStyle = computed(() => ({
  position: 'absolute',
  top: `${-(props.headSize + 25)}px`,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0, 0, 0, 0.9)',
  color: '#fff',
  padding: '3px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
}))

// Style de l'indicateur de tempo
const tempoIndicatorStyle = computed(() => ({
  position: 'absolute',
  top: `${-(props.headSize + 50)}px`,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(68, 68, 255, 0.9)',
  color: '#fff',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '10px',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  border: '1px solid rgba(255, 255, 255, 0.3)'
}))

// ============ GETTERS POUR EXPOSITION ============
const currentTime = computed(() => cursor.currentTime.value)
const pixelPosition = computed(() => cursor.pixelPosition.value)
const totalWidthValue = computed(() => cursor.totalWidthValue.value)
const formattedTime = computed(() => cursor.formattedTime.value)
const currentTempo = computed(() => cursor.currentTempo.value)
const isSyncedWithPlayer = computed(() => cursor.isSyncedWithPlayer.value)

// ============ ÉMISSION D'ÉVÉNEMENTS ============
watch(() => cursor.pixelPosition.value, (newPosition, oldPosition) => {
  // Émission normale avec seuil réduit
  const threshold = cursor.isPlaying.value ? 5 : 0.5 // 5px pendant la lecture pour l'auto-scroll
  if (Math.abs(newPosition - oldPosition) > threshold) {
    console.log('📡 Émission position-change:', newPosition.toFixed(1) + 'px')
    emit('position-change', {
      pixelPosition: newPosition,
      currentTime: cursor.currentTime.value
    })
  }
})

watch(() => cursor.currentTempo.value, (newTempo, oldTempo) => {
  if (Math.abs(newTempo - oldTempo) > 0.1) {
    emit('tempo-change', newTempo)
  }
})

watch(() => cursor.isSyncedWithPlayer.value, (synced) => {
  emit('sync-status-change', synced)
})

// ============ MÉTHODES PUBLIQUES ============
function syncWithPlayer(time) {
  cursor.syncWithPlayer(time)
}

function unsyncFromPlayer() {
  cursor.unsyncFromPlayer()
}

function seekTo(time) {
  cursor.currentTime.value = time
}

function calculateScrollOffset(containerWidth, currentScrollLeft, padding) {
  return cursor.calculateScrollOffset(containerWidth, currentScrollLeft, padding)
}

function updateCursorConfig(config) {
  cursor.updateConfig(config)
}

// Nettoyage
onUnmounted(() => {
  cursor.unsyncFromPlayer()
})

// Exposer les propriétés et méthodes utiles
defineExpose({
  // Propriétés de position
  pixelPosition,
  currentTime,
  shouldShowCursor,
  formattedTime,
  currentTempo,
  totalWidthValue,
  
  // État de synchronisation
  isSyncedWithPlayer,
  
  // Méthodes de contrôle
  syncWithPlayer,
  unsyncFromPlayer,
  seekTo,
  calculateScrollOffset,
  updateCursorConfig,
  
  // Accès au composable complet
  cursor
})
</script>

<style scoped>
.playback-cursor {
  position: absolute;
  pointer-events: none;
  user-select: none;
  z-index: 1000;
}

.cursor-line {
  transition: all 0.1s ease-out;
}

.cursor-head {
  transition: all 0.1s ease-out;
}

/* États du curseur */
.playback-cursor.playing .cursor-line {
  filter: brightness(1.2);
}

.playback-cursor.playing .cursor-head {
  animation: pulse-glow 1s ease-in-out infinite alternate;
}

.playback-cursor.paused .cursor-line {
  opacity: 0.6;
  animation: pulse-fade 1s ease-in-out infinite alternate;
}

.playback-cursor.stopped .cursor-line {
  opacity: 0.4;
}

.playback-cursor.synced .cursor-line {
  box-shadow: 0 0 8px rgba(0, 255, 0, 0.3);
}

.playback-cursor.tempo-aware .cursor-head::after {
  content: '♪';
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* Animations */
@keyframes pulse-glow {
  from {
    box-shadow: 0 0 4px currentColor;
  }
  to {
    box-shadow: 0 0 12px currentColor, 0 0 20px currentColor;
  }
}

@keyframes pulse-fade {
  from {
    opacity: 0.4;
    transform: translateX(-50%) scaleX(1);
  }
  to {
    opacity: 0.8;
    transform: translateX(-50%) scaleX(1.1);
  }
}

/* Indicateurs */
.time-indicator {
  animation: fade-in 0.3s ease-out;
}

.tempo-indicator {
  animation: fade-in 0.3s ease-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* Responsive */
@media (max-width: 768px) {
  .time-indicator,
  .tempo-indicator {
    font-size: 9px;
    padding: 2px 4px;
  }
}

/* Thèmes */
:root {
  --cursor-primary: #ff4444;
  --cursor-playing-glow: rgba(255, 68, 68, 0.6);
  --cursor-sync-glow: rgba(0, 255, 0, 0.3);
}

@media (prefers-color-scheme: dark) {
  :root {
    --cursor-primary: #ff6666;
    --cursor-playing-glow: rgba(255, 102, 102, 0.6);
  }
}

/* États spéciaux */
.playback-cursor.auto-sync {
  border-left: 2px solid rgba(0, 255, 0, 0.1);
}

.playback-cursor.manual-sync {
  border-left: 2px solid rgba(255, 255, 0, 0.1);
}

/* Performance optimizations */
.playback-cursor * {
  will-change: transform, opacity;
}

.playing .cursor-line {
  will-change: box-shadow, filter;
}
</style>