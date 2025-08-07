<template>
  <div class="add-cc-lane-button-container">
    <el-select
      v-model="selectedCC"
      placeholder="+"
      size="small"
      class="add-cc-select"
      @change="handleCCSelection"
      popper-class="add-cc-dropdown"
      multiple
      collapse-tags
      :max-collapse-tags="1"
    >
      <template #prefix>
        <el-icon class="add-icon">
          <CirclePlus />
        </el-icon>
      </template>
      
      <el-option
        v-for="ccOption in availableCCOptions"
        :key="ccOption.number"
        :label="`CC${ccOption.number} - ${ccOption.name}`"
        :value="ccOption.number"
        :disabled="ccOption.disabled"
      >
        <div class="cc-option-content">
          <span class="cc-label">CC{{ ccOption.number }} - {{ ccOption.name }}</span>
          <span v-if="ccOption.disabled" class="cc-disabled-text">(déjà visible)</span>
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElSelect, ElOption, ElIcon } from 'element-plus'
import { CirclePlus } from '@element-plus/icons-vue'

const props = defineProps({
  visibleCCLanes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-cc-lane'])

const selectedCC = ref([])

// Noms des contrôleurs MIDI communs
const ccNames = {
  1: 'Modulation',
  2: 'Breath Controller', 
  4: 'Foot Controller',
  5: 'Portamento Time',
  7: 'Volume',
  8: 'Balance',
  10: 'Pan',
  11: 'Expression',
  12: 'Effect Control 1',
  13: 'Effect Control 2',
  64: 'Sustain Pedal',
  65: 'Portamento',
  66: 'Sostenuto',
  67: 'Soft Pedal',
  68: 'Legato',
  69: 'Hold 2',
  71: 'Resonance',
  72: 'Release Time',
  73: 'Attack Time',
  74: 'Brightness',
  91: 'Reverb Level',
  92: 'Tremolo Level',
  93: 'Chorus Level',
  94: 'Celeste Level',
  95: 'Phaser Level'
}

// Options disponibles pour le select
const availableCCOptions = computed(() => {
  const visibleCCs = props.visibleCCLanes || []
  
  // Liste des CC les plus courants
  const commonCCs = [1, 2, 4, 5, 7, 8, 10, 11, 12, 13, 64, 65, 66, 67, 68, 69, 71, 72, 73, 74, 91, 92, 93, 94, 95]
  
  return commonCCs.map(ccNumber => ({
    number: ccNumber,
    name: ccNames[ccNumber] || `Controller ${ccNumber}`,
    disabled: visibleCCs.includes(ccNumber)
  }))
})

// Gérer la sélection d'un CC (mode multiple)
const handleCCSelection = (ccNumbers) => {
  if (ccNumbers && ccNumbers.length > 0) {
    // Prendre le dernier élément ajouté
    const lastAdded = ccNumbers[ccNumbers.length - 1]
    console.log(`➕ AddCCLane: Sélection CC${lastAdded}`)
    emit('add-cc-lane', lastAdded)
    
    // Réinitialiser la sélection pour que le placeholder réapparaisse
    setTimeout(() => {
      selectedCC.value = []
    }, 100)
  }
}
</script>

<style scoped>
.add-cc-lane-button-container {
  flex-shrink: 0;
}

.add-cc-select {
  width: 55px;
}

/* Supprimer le border pour une intégration visuelle harmonieuse */
:deep(.add-cc-select .el-select__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

:deep(.add-cc-select .el-select__wrapper:hover) {
  border: none !important;
  box-shadow: none !important;
}

:deep(.add-cc-select .el-select__wrapper.is-focus) {
  border: none !important;
  box-shadow: none !important;
}

:deep(.add-cc-select .el-input__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

:deep(.add-cc-select .el-input__inner) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

.add-icon {
  font-size: 18px !important;
  margin-right: 2px;
}

.cc-option-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.cc-label {
  font-weight: 500;
}

.cc-disabled-text {
  font-size: 11px;
  color: #909399;
  font-style: italic;
}
</style>