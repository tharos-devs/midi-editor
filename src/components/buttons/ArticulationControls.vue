<template>
  <div class="articulation-controls">
    <el-button 
      size="large" 
      type="default"
      @click="showDialog = true"
      :link="true"
      :icon="Edit"
      class="large-icon-button"
    >
    </el-button>
    <el-button 
      size="large" 
      type="default"
      @click="addArticulationAction"
      :link="true"
      :icon="Plus"
      class="large-icon-button"      
    >
    </el-button>
    <el-button 
      size="large" 
      type="default" 
      @click="removeArticulationAction"
      :link="true"
      :icon="Minus"
      :disabled="!selectedArticulationFromParent"
      class="large-icon-button"      
    >
    </el-button>
    <ExpressionMapEditor
      v-model="showDialog"
      :initial-data="projectStore.articulationTypes"
      @save="handleSave"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Edit, Plus, Minus } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useArticulations } from '@/composables/useArticulations'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'
import { useProjectStore } from '@/stores/project'
import ExpressionMapEditor from '@/components/ArticulationEditor.vue'

const showDialog = ref(false)
const projectStore = useProjectStore()

// Props
const props = defineProps({
  selectedArticulation: { type: Object, default: null }
})

// Émissions
const emit = defineEmits(['articulation-deselected'])

// Utiliser le composable des marqueurs et le store du curseur
const { addArticulation, removeArticulation, pixelsToTime, articulationsWithPositions } = useArticulations()
const playbackCursorStore = usePlaybackCursorStore()

// Computed pour le marqueur sélectionné
const selectedArticulationFromParent = computed(() => props.selectedArticulation)

// Actions
const addArticulationAction = () => {
  // Vérifier si des types d'articulation sont configurés
  const availableTypes = projectStore.articulationTypes || []
  if (availableTypes.length === 0) {
    console.warn('⚠️ Aucun type d\'articulation configuré dans l\'Expression Map')
    console.info('💡 Pour créer des articulations, configurez d\'abord des types dans l\'Expression Map :')
    console.info('   1. Cliquez sur le bouton "Crayon" dans les contrôles d\'articulation')
    return
  }

  // Ajouter un marqueur à la position du curseur de lecture
  const cursorTime = playbackCursorStore.currentTime || 0
  
  // Obtenir le nombre de marqueurs existants pour générer le nom
  const articulationNumber = articulationsWithPositions.value.length + 1
  const articulationName = `#${articulationNumber}`
  
  addArticulation(cursorTime, articulationName)
  console.log('➕ Articulation ajouté à la position:', cursorTime, 's -', articulationName)
}

const removeArticulationAction = () => {
  if (!selectedArticulationFromParent.value) return
  
  console.log('🗑️ Suppression articulation:', selectedArticulationFromParent.value.name)
  
  const success = removeArticulation(selectedArticulationFromParent.value.id)
  if (success) {
    console.log('✅ Articulation supprimé avec succès')
    emit('articulation-deselected')
  } else {
    console.error('❌ Échec suppression articulation')
  }
}

const handleSave = (articulationTypesData) => {
  console.log('💾 Sauvegarde des types d\'articulations:', articulationTypesData)
  projectStore.updateArticulationTypes(articulationTypesData)
}

// Exposer la méthode pour l'appel depuis l'extérieur (touches Delete/Backspace)
defineExpose({
  removeArticulation: () => {
    if (selectedArticulationFromParent.value) {
      removeArticulationAction()
      return true
    }
    return false
  }
})
</script>

<style scoped>
.articulation-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* Réduire l'espace entre les boutons avec margin négative */
.articulation-controls .el-button {
  margin: 0 !important;
}

.large-icon-button :deep(.el-icon) {
  font-size: 16px !important;
}
</style>