<template>
  <div class="marker-controls">
    <el-button 
      size="large" 
      type="default"
      @click="addMarkerAction"
      :link="true"
      :icon="Plus"
    >
    </el-button>
    <el-button 
      size="large" 
      type="default" 
      @click="removeMarkerAction"
      :link="true"
      :icon="Minus"
      :disabled="!selectedMarkerFromParent"
    >
    </el-button>
  </div>
</template>

<script setup>
import { Plus, Minus } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useMarkers } from '@/composables/useMarkers'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

// Props
const props = defineProps({
  selectedMarker: { type: Object, default: null }
})

// Émissions
const emit = defineEmits(['marker-deselected'])

// Utiliser le composable des marqueurs et le store du curseur
const { addMarker, removeMarker, pixelsToTime, markersWithPositions } = useMarkers()
const playbackCursorStore = usePlaybackCursorStore()

// Computed pour le marqueur sélectionné
const selectedMarkerFromParent = computed(() => props.selectedMarker)

// Actions
const addMarkerAction = () => {
  // Ajouter un marqueur à la position du curseur de lecture
  const cursorTime = playbackCursorStore.currentTime || 0
  
  // Obtenir le nombre de marqueurs existants pour générer le nom
  const markerNumber = markersWithPositions.value.length + 1
  const markerName = `#${markerNumber}`
  
  addMarker(cursorTime, markerName)
  console.log('➕ Marqueur ajouté à la position:', cursorTime, 's -', markerName)
}

const removeMarkerAction = () => {
  if (!selectedMarkerFromParent.value) return
  
  console.log('🗑️ Suppression marqueur:', selectedMarkerFromParent.value.name)
  
  const success = removeMarker(selectedMarkerFromParent.value.id)
  if (success) {
    console.log('✅ Marqueur supprimé avec succès')
    emit('marker-deselected')
  } else {
    console.error('❌ Échec suppression marqueur')
  }
}

// Exposer la méthode pour l'appel depuis l'extérieur (touches Delete/Backspace)
defineExpose({
  removeMarker: () => {
    if (selectedMarkerFromParent.value) {
      removeMarkerAction()
      return true
    }
    return false
  }
})
</script>

<style scoped>
.marker-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>