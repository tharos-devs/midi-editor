<template>
    <el-button
    :icon="Plus"
    size="large"
    @click="addNewTrack"
    >
    </el-button>
</template>

<script setup>
import { computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'

const midiStore = useMidiStore()

// Computed pour récupérer les données du store
const tracks = computed(() => midiStore.tracks)

// Ajouter une nouvelle piste
const addNewTrack = async () => {
  const trackNumber = tracks.value.length + 1
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F39C12', '#E74C3C', '#9B59B6', '#3498DB', '#2ECC71',
    '#1ABC9C', '#34495E', '#95A5A6', '#E67E22', '#C0392B'
  ]
  
  try {
    // Créer une nouvelle piste
    const newTrack = {
      id: Date.now(), // ID temporaire basé sur le timestamp
      name: `Nouvelle Piste ${trackNumber}`,
      channel: Math.min(trackNumber - 1, 15), // Canal MIDI (0-15)
      instrument: { name: 'Acoustic Grand Piano', number: 0 },
      notes: [],
      controlChanges: {},
      pitchBends: [],
      volume: 100,
      pan: 64,
      bank: 0,
      midiOutput: 'default',
      muted: false,
      solo: false,
      color: colors[(trackNumber - 1) % colors.length]
    }
    
    // Ajouter la piste au store
    midiStore.tracks.push(newTrack)
    
    // Sélectionner la nouvelle piste
    midiStore.selectTrack(newTrack.id)
    
    // Forcer la réactivité
    midiStore.triggerReactivity()   
  } catch (error) {
    // console.error('❌ Erreur lors de la création de la piste:', error)
    ElMessage.error({
      message: 'Erreur lors de la création de la piste',
      duration: 3000
    })
  }
}

</script>