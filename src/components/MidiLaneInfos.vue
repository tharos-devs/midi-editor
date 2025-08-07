<template>
  <div class="midi-lane-infos">
    <!-- Spacer pour compenser la hauteur des onglets MidiLaneTabs -->
    <div class="midi-lane-tabs-spacer">
      <!-- Zone de saisie pour éditer la valeur du point sélectionné -->
      <div v-if="isTempoLane && selectedPointValue !== null && selectedPointValue !== undefined" class="cc-value-editor">
        <el-input
          v-model="editableValue"
          type="number"
          :min="60"
          :max="200"
          size="small"
          class="cc-value-input"
          @change="handleTempoValueChange"
          @keyup.enter="handleTempoValueChange"
          @blur="handleTempoValueChange"
        />
      </div>
      
      <div v-else-if="isMidiCCLane && selectedPointValue !== null && selectedPointValue !== undefined" class="cc-value-editor">
        <el-input
          v-model="editableValue"
          type="number"
          :min="0"
          :max="127"
          size="small"
          class="cc-value-input"
          @change="handleValueChange"
          @keyup.enter="handleValueChange"
          @blur="handleValueChange"
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
import { ElInput } from 'element-plus'
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
  }
})

const emit = defineEmits(['update-point-value'])

// Valeur éditable pour l'input
const editableValue = ref(0)

// Synchroniser la valeur éditable avec la prop
watch(() => props.selectedPointValue, (newValue) => {
  if (newValue !== null && newValue !== undefined) {
    editableValue.value = newValue
  }
}, { immediate: true })

// Gérer les changements de valeur pour les CC
const handleValueChange = (newValue) => {
  if (props.selectedPointId && newValue !== null && newValue !== undefined && newValue !== '') {
    // Convertir en nombre et valider
    const numValue = parseInt(newValue, 10)
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(0, Math.min(127, numValue))
      console.log(`📝 Mise à jour manuelle CC${props.ccNumber}: ${props.selectedPointId} -> ${clampedValue}`)
      
      // Mettre à jour la valeur dans l'input si elle a été corrigée
      if (clampedValue !== numValue) {
        editableValue.value = clampedValue
      }
      
      emit('update-point-value', {
        pointId: props.selectedPointId,
        newValue: clampedValue
      })
    } else {
      // Si la valeur n'est pas valide, remettre l'ancienne valeur
      editableValue.value = props.selectedPointValue
    }
  }
}

// Gérer les changements de valeur pour le tempo
const handleTempoValueChange = (newValue) => {
  if (props.selectedPointId && newValue !== null && newValue !== undefined && newValue !== '') {
    // Convertir en nombre et valider
    const numValue = parseInt(newValue, 10)
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(60, Math.min(200, numValue))
      console.log(`📝 Mise à jour manuelle Tempo: ${props.selectedPointId} -> ${clampedValue} BPM`)
      
      // Mettre à jour la valeur dans l'input si elle a été corrigée
      if (clampedValue !== numValue) {
        editableValue.value = clampedValue
      }
      
      emit('update-point-value', {
        pointId: props.selectedPointId,
        newValue: clampedValue
      })
    } else {
      // Si la valeur n'est pas valide, remettre l'ancienne valeur
      editableValue.value = props.selectedPointValue
    }
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
  width: 50px;
}

:deep(.cc-value-input .el-input__wrapper) {
  width: 50px;
  height: 24px;
}

:deep(.cc-value-input .el-input__inner) {
  font-size: 10px;
  height: 24px;
  line-height: 24px;
  padding: 0 4px;
  text-align: center;
}

/* Container principal aligné avec le contenu MidiLanes */
.midi-lane-content {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
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