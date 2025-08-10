<template>
  <div class="midi-lane-infos">
    <!-- Spacer pour compenser la hauteur des onglets MidiLaneTabs -->
    <div class="midi-lane-tabs-spacer">
      <!-- Zone de saisie pour éditer la valeur du point sélectionné -->
      <div v-if="isTempoLane && selectedPointValue !== null && selectedPointValue !== undefined" class="cc-value-editor">
        <el-input-number
          v-model="editableTempoValue"
          :controls="false"
          :min="10"
          :max="200"
          size="small"
          class="cc-value-input no-spinner"
          @change="handleTempoValueChange"
          @keydown="handleKeyDown"
        />
      </div>
      
      <div v-else-if="isMidiCCLane && selectedPointValue !== null && selectedPointValue !== undefined" class="cc-value-editor">
        <el-input-number
          v-model="editableCCValue"
          :min="0"
          :max="127"
          :controls="false"
          size="small"
          class="cc-value-input"
          @change="handleValueChange"
          @keydown="handleKeyDown"
        />
      </div>
      
      <div v-else-if="isVelocityLane && selectedPointValue !== null && selectedPointValue !== undefined" class="cc-value-editor">
        <el-input-number
          v-model="editableVelocityValue"
          :min="0"
          :max="127"
          :controls="false"
          size="small"
          class="cc-value-input"
          @change="handleVelocityValueChange"
          @keydown="handleKeyDown"
        />
      </div>
    </div>
    
    <!-- Container principal aligné avec le contenu MidiLanes -->
    <div class="midi-lane-content">
      <!-- Composant spécialisé pour les lanes de tempo -->
      <TempoInfo 
        v-if="isTempoLane" 
        :selected-point-value="selectedPointValue"
      />

      <!-- Composant spécialisé pour les lanes de vélocité -->
      <VelocityInfo v-else-if="isVelocityLane" />

      <!-- Composant spécialisé pour les MIDI CC -->
      <CCInfo 
        v-else-if="isMidiCCLane" 
        :cc-number="ccNumber"
        :cc-name="ccName"
        :selected-point-value="selectedPointValue"
      />

      <!-- Informations statiques de la lane si aucun composant spécialisé -->
      <div v-else-if="selectedLane" class="lane-info">
        <div class="lane-name">{{ selectedLane.label }}</div>
        <div v-if="selectedLane.description" class="lane-description">
          {{ selectedLane.description }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import TempoInfo from '@/components/lanes/tempo/TempoInfos.vue'
import VelocityInfo from '@/components/lanes/velocity/VelocityInfos.vue'
import CCInfo from '@/components/lanes/cc/CCInfos.vue'

const props = defineProps({
  selectedLane: {
    type: Object,
    default: null
  },
  ccNumber: {
    type: Number,
    default: null
  },
  ccName: {
    type: String,
    default: ''
  },
  selectedPointValue: {
    type: Number,
    default: null
  },
  selectedPointId: {
    type: String,
    default: null
  },
  // Les vélocités utilisent maintenant selectedPointValue et selectedPointId
})

const emit = defineEmits(['update-point-value'])

// Valeurs éditables séparées pour éviter les conflits
const editableTempoValue = ref(0)
const editableCCValue = ref(0)
const editableVelocityValue = ref(0)

// Maintenir les pointId localement pour éviter la perte lors des mises à jour du store
// Un ID local par type de lane pour éviter les conflits
const localSelectedTempoId = ref(null)
const localSelectedCCId = ref(null) 
const localSelectedVelocityId = ref(null)


// Watch sur la valeur pour les mises à jour en temps réel (drag)
watch(() => props.selectedPointValue, (newValue) => {
  if (newValue !== null && newValue !== undefined) {
    if (isVelocityLane.value) {
      editableVelocityValue.value = newValue
    } else if (isTempoLane.value) {
      editableTempoValue.value = newValue
    } else if (isMidiCCLane.value) {
      editableCCValue.value = newValue
    }
  }
})

// Synchronisation manuelle uniquement lors du changement de point
watch(() => props.selectedPointId, (newPointId) => {
  // Nouveau point sélectionné avec une valeur
  if (newPointId && props.selectedPointValue !== null && props.selectedPointValue !== undefined) {
    // Synchroniser selon le type de lane actuel et mettre à jour l'ID local approprié
    if (isTempoLane.value) {
      if (newPointId !== localSelectedTempoId.value) {
        localSelectedTempoId.value = newPointId
      }
      editableTempoValue.value = props.selectedPointValue
    } else if (isMidiCCLane.value) {
      if (newPointId !== localSelectedCCId.value) {
        localSelectedCCId.value = newPointId
      }
      editableCCValue.value = props.selectedPointValue
    } else if (isVelocityLane.value) {
      if (newPointId !== localSelectedVelocityId.value) {
        localSelectedVelocityId.value = newPointId
      }
      editableVelocityValue.value = props.selectedPointValue
    }
  }
  // Ignorer les déselections temporaires pour maintenir l'édition multiple
})

// Nettoyer les sélections locales quand on change de lane
watch(() => props.selectedLane?.id, (newLaneId, oldLaneId) => {
  if (newLaneId !== oldLaneId && oldLaneId !== undefined) {
    localSelectedTempoId.value = null
    localSelectedCCId.value = null
    localSelectedVelocityId.value = null
  }
})

// Gérer les changements de valeur pour les CC
const handleValueChange = (newValue) => {
  // Utiliser l'ID local qui persiste même si props.selectedPointId devient null temporairement
  const pointId = localSelectedCCId.value || props.selectedPointId
  
  if (pointId && newValue !== null && newValue !== undefined) {
    // Valider dans la plage 0-127 pour les CC (0 accepté)
    const validValue = Math.max(0, Math.min(127, newValue))
    
    emit('update-point-value', {
      pointId: pointId,
      newValue: validValue
    })
  }
}

// Gérer les changements de valeur pour les vélocités
const handleVelocityValueChange = (newValue) => {
  // Utiliser l'ID local qui persiste même si props.selectedPointId devient null temporairement
  const pointId = localSelectedVelocityId.value || props.selectedPointId
  
  
  if (pointId && newValue !== null && newValue !== undefined) {
    // Valider dans la plage 0-127 pour les vélocités (0 accepté)
    const validValue = Math.max(0, Math.min(127, newValue))
    
    emit('update-point-value', {
      pointId: pointId,
      newValue: validValue,
      type: 'velocity'
    })
  }
}

// Gérer les changements de valeur pour le tempo
const handleTempoValueChange = (newValue) => {
  // Utiliser l'ID local qui persiste même si props.selectedPointId devient null temporairement
  const pointId = localSelectedTempoId.value || props.selectedPointId
  
  if (pointId && newValue !== null && newValue !== undefined) {
    // Forcer minimum 10 BPM pour le tempo
    const validValue = Math.max(10, Math.min(200, newValue))
    
    emit('update-point-value', {
      pointId: pointId,
      newValue: validValue,
      type: 'tempo'
    })
  }
}


// Computed pour détecter le type de lane
const isTempoLane = computed(() => {
  return props.selectedLane && 
         (props.selectedLane.type === 'tempo' || 
          props.selectedLane.id === 'tempo' ||
          props.selectedLane.label?.toLowerCase().includes('tempo'))
})

const isVelocityLane = computed(() => {
  return props.selectedLane && 
         (props.selectedLane.type === 'velocity' || 
          props.selectedLane.label?.toLowerCase().includes('velocity') ||
          props.selectedLane.label?.toLowerCase().includes('velocité'))
})

const isMidiCCLane = computed(() => {
  return props.selectedLane && 
         (props.selectedLane.type === 'cc' || 
          props.selectedLane.type === 'midi-cc' ||
          props.selectedLane.label?.toLowerCase().includes('cc') ||
          props.selectedLane.id?.startsWith('cc'))
})

// Gérer les événements clavier pour empêcher l'interception
const handleKeyDown = (event) => {
  // Laisser passer Delete, Backspace et les flèches pour l'édition
  const editingKeys = ['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab']
  
  if (editingKeys.includes(event.key)) {
    // Empêcher la propagation vers les gestionnaires globaux
    event.stopPropagation()
    console.log('🔧 Laissant passer la touche:', event.key, 'pour l\'input-number')
  }
}
</script>

<style scoped>
.midi-lane-infos {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--midi-lane-infos-bg, #f0f0f0);
}

/* Spacer pour compenser la hauteur des onglets MidiLaneTabs */
.midi-lane-tabs-spacer {
  height: 40px; /* Hauteur approximative des onglets */
  flex-shrink: 0;
  background: var(--midi-lane-infos-bg, #f0f0f0);
  border-bottom: 1px solid rgba(0,0,0,0.1);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Zone de saisie pour éditer la valeur du point sélectionné */
.cc-value-editor {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(200,200,200,0.3);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.cc-value-label {
  font-size: 10px;
  font-weight: 600;
  color: #666;
  white-space: nowrap;
}

.cc-value-input {
  width: 60px;
}

:deep(.cc-value-input .el-input__wrapper) {
  width: 50px;
  height: 24px;
}

:deep(.cc-value-input .el-input__inner) {
  font-size: 13px;
  height: 24px;
  line-height: 24px;
  padding: 0 4px;
  text-align: center;
}

/* Container principal aligné avec le contenu MidiLanes */
.midi-lane-content {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  position: relative;
}

/* Informations statiques de la lane */
.lane-info {
  text-align: center;
  color: var(--midi-lane-info-fg, #666);
}

.lane-name {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.lane-description {
  font-size: 9px;
  opacity: 0.7;
  line-height: 1.2;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .midi-lane-infos {
    --midi-lane-infos-bg: #2a2a2a;
    --midi-lane-info-fg: #ccc;
  }
}

</style>