<template>
  <div class="track-size">
    <!-- Bouton avec icône de redimensionnement -->
    <el-button
      :icon="List"
      size="small"
      @click="cycleSize"
      class="size-btn"
      :title="getSizeTooltip()"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { List } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'

// Store
const midiStore = useMidiStore()

// Props
const props = defineProps({
  modelValue: {
    type: Number,
    default: 30
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'size-changed'])

// Les 3 tailles disponibles
const sizes = [
  { value: 30, label: 'Compact' },
  { value: 70, label: 'Moyen' },
  { value: 100, label: 'Étendu' }
]

const currentSizeIndex = ref(0)

// Initialiser l'index basé sur la valeur actuelle
const initializeSize = () => {
  const index = sizes.findIndex(size => size.value === props.modelValue)
  currentSizeIndex.value = index >= 0 ? index : 0
}

// Fonction pour passer à la taille suivante
const cycleSize = async () => {
  currentSizeIndex.value = (currentSizeIndex.value + 1) % sizes.length
  const newSize = sizes[currentSizeIndex.value]
  
  // console.log(`🎛️ TrackSize: Changement global vers ${newSize.value}px (${newSize.label})`)
  
  try {
    // Mettre à jour TOUTES les pistes avec la nouvelle taille
    const updatePromises = midiStore.tracks.map(track => {
      return updateTrackHeight(track.id, newSize.value, currentSizeIndex.value)
    })
    
    await Promise.all(updatePromises)
    
    // Forcer la réactivité du store
    midiStore.triggerReactivity()
    
    // Émettre les événements comme avant
    emit('update:modelValue', newSize.value)
    emit('size-changed', {
      value: newSize.value,
      heightPx: newSize.value,
      label: newSize.label,
      level: currentSizeIndex.value
    })
    
    // console.log(`✅ TrackSize: ${midiStore.tracks.length} pistes mises à jour à ${newSize.value}px`)
    
  } catch (error) {
    // console.error('❌ TrackSize: Erreur lors de la mise à jour globale:', error)
  }
}

// Fonction pour mettre à jour la hauteur d'une piste
async function updateTrackHeight(trackId, height, level) {
  const trackIndex = midiStore.tracks.findIndex(t => t.id === trackId)
  if (trackIndex !== -1) {
    // Mettre à jour les propriétés de hauteur
    midiStore.tracks[trackIndex].height = height
    midiStore.tracks[trackIndex].heightLevel = level
    
    //console.log(`📏 TrackSize: Piste ${trackId} -> ${height}px (niveau ${level})`)
  }
}

// Tooltip dynamique
const getSizeTooltip = () => {
  const currentSize = sizes[currentSizeIndex.value]
  const nextIndex = (currentSizeIndex.value + 1) % sizes.length
  const nextSize = sizes[nextIndex]
  
  return `Hauteur: ${currentSize.value}px (${currentSize.label}) - Cliquer pour ${nextSize.label}`
}

// Watcher pour synchroniser avec les changements externes
watch(() => props.modelValue, (newValue) => {
  const index = sizes.findIndex(size => size.value === newValue)
  if (index >= 0 && index !== currentSizeIndex.value) {
    currentSizeIndex.value = index
  }
}, { immediate: true })

// Fonction pour synchroniser avec l'état actuel des pistes (appelée depuis l'extérieur)
const syncWithTracks = () => {
  if (midiStore.tracks.length === 0) {
    currentSizeIndex.value = 0
    return
  }
  
  // Trouver la taille la plus commune parmi les pistes
  const sizeCounts = [0, 0, 0]
  
  midiStore.tracks.forEach(track => {
    const height = track.height || 30
    const sizeIndex = sizes.findIndex(size => size.value === height)
    if (sizeIndex !== -1) {
      sizeCounts[sizeIndex]++
    }
  })
  
  // Prendre la taille la plus fréquente
  const mostCommonSize = sizeCounts.indexOf(Math.max(...sizeCounts))
  if (mostCommonSize >= 0) {
    currentSizeIndex.value = mostCommonSize
    const newValue = sizes[mostCommonSize].value
    if (newValue !== props.modelValue) {
      emit('update:modelValue', newValue)
    }
  }
}

// Exposer la fonction de synchronisation pour les composants parents
defineExpose({
  syncWithTracks
})

// Initialiser au montage
initializeSize()
</script>

<style scoped>
.track-size {
  position: relative;
  margin: 0 2px;
}

.size-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  color: var(--track-instrument);
  transition: all 0.2s ease;
}

.size-btn:hover {
  border-color: var(--menu-active-fg);
  color: var(--menu-active-fg);
  transform: scale(1.05);
}

.size-btn:active {
  transform: scale(0.95);
}
</style>