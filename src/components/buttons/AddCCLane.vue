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
          <Plus />
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
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElSelect, ElOption, ElIcon } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const props = defineProps({
  visibleCCLanes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-cc-lane'])

const selectedCC = ref([])

const midiCC = [
  { "cc": 0, "name": "Bank Select", "usage": "Changer de banque de sons (coarse)" },
  { "cc": 1, "name": "Modulation Wheel", "usage": "Vibrato / modulation" },
  { "cc": 2, "name": "Breath Controller", "usage": "Contrôleur de souffle" },
  { "cc": 3, "name": "Undefined", "usage": "" },
  { "cc": 4, "name": "Foot Controller", "usage": "Pédale de contrôle" },
  { "cc": 5, "name": "Portamento Time", "usage": "Temps de portamento" },
  { "cc": 6, "name": "Data Entry MSB", "usage": "Modifier valeur de paramètres" },
  { "cc": 7, "name": "Channel Volume", "usage": "Volume principal" },
  { "cc": 8, "name": "Balance", "usage": "Balance gauche/droite" },
  { "cc": 9, "name": "Undefined", "usage": "" },
  { "cc": 10, "name": "Pan", "usage": "Panorama gauche/droite" },
  { "cc": 11, "name": "Expression Controller", "usage": "Expression (volume fin)" },
  { "cc": 12, "name": "Effect Control 1", "usage": "Contrôle effet 1" },
  { "cc": 13, "name": "Effect Control 2", "usage": "Contrôle effet 2" },
  { "cc": 14, "name": "Undefined", "usage": "" },
  { "cc": 15, "name": "Undefined", "usage": "" },
  { "cc": 16, "name": "General Purpose Controller 1", "usage": "" },
  { "cc": 17, "name": "General Purpose Controller 2", "usage": "" },
  { "cc": 18, "name": "General Purpose Controller 3", "usage": "" },
  { "cc": 19, "name": "General Purpose Controller 4", "usage": "" },
  { "cc": 20, "name": "Undefined", "usage": "" },
  { "cc": 21, "name": "Undefined", "usage": "" },
  { "cc": 22, "name": "Undefined", "usage": "" },
  { "cc": 23, "name": "Undefined", "usage": "" },
  { "cc": 24, "name": "Undefined", "usage": "" },
  { "cc": 25, "name": "Undefined", "usage": "" },
  { "cc": 26, "name": "Undefined", "usage": "" },
  { "cc": 27, "name": "Undefined", "usage": "" },
  { "cc": 28, "name": "Undefined", "usage": "" },
  { "cc": 29, "name": "Undefined", "usage": "" },
  { "cc": 30, "name": "Undefined", "usage": "" },
  { "cc": 31, "name": "Undefined", "usage": "" },
  { "cc": 32, "name": "Bank Select", "usage": "Changer de banque de sons (fine)" },
  { "cc": 33, "name": "Modulation Wheel", "usage": "Vibrato / modulation" },
  { "cc": 34, "name": "Breath Controller", "usage": "Contrôleur de souffle" },
  { "cc": 35, "name": "Undefined", "usage": "" },
  { "cc": 36, "name": "Foot Controller", "usage": "Pédale de contrôle" },
  { "cc": 37, "name": "Portamento Time", "usage": "Temps de portamento" },
  { "cc": 38, "name": "Data Entry LSB", "usage": "Modifier valeur de paramètres" },
  { "cc": 39, "name": "Channel Volume", "usage": "Volume principal" },
  { "cc": 40, "name": "Balance", "usage": "Balance gauche/droite" },
  { "cc": 41, "name": "Undefined", "usage": "" },
  { "cc": 42, "name": "Pan", "usage": "Panorama gauche/droite" },
  { "cc": 43, "name": "Expression Controller", "usage": "Expression (volume fin)" },
  { "cc": 44, "name": "Effect Control 1", "usage": "Contrôle effet 1" },
  { "cc": 45, "name": "Effect Control 2", "usage": "Contrôle effet 2" },
  { "cc": 46, "name": "Undefined", "usage": "" },
  { "cc": 47, "name": "Undefined", "usage": "" },
  { "cc": 48, "name": "General Purpose Controller 1", "usage": "" },
  { "cc": 49, "name": "General Purpose Controller 2", "usage": "" },
  { "cc": 50, "name": "General Purpose Controller 3", "usage": "" },
  { "cc": 51, "name": "General Purpose Controller 4", "usage": "" },
  { "cc": 52, "name": "Undefined", "usage": "" },
  { "cc": 53, "name": "Undefined", "usage": "" },
  { "cc": 54, "name": "Undefined", "usage": "" },
  { "cc": 55, "name": "Undefined", "usage": "" },
  { "cc": 56, "name": "Undefined", "usage": "" },
  { "cc": 57, "name": "Undefined", "usage": "" },
  { "cc": 58, "name": "Undefined", "usage": "" },
  { "cc": 59, "name": "Undefined", "usage": "" },
  { "cc": 60, "name": "Undefined", "usage": "" },
  { "cc": 61, "name": "Undefined", "usage": "" },
  { "cc": 62, "name": "Undefined", "usage": "" },
  { "cc": 63, "name": "Undefined", "usage": "" },
  { "cc": 64, "name": "Damper Pedal (Sustain)", "usage": "Pédale de sustain (0-63 off, 64-127 on)" },
  { "cc": 65, "name": "Portamento On/Off", "usage": "" },
  { "cc": 66, "name": "Sostenuto", "usage": "" },
  { "cc": 67, "name": "Soft Pedal", "usage": "" },
  { "cc": 68, "name": "Legato Footswitch", "usage": "" },
  { "cc": 69, "name": "Hold 2", "usage": "" },
  { "cc": 70, "name": "Sound Controller 1", "usage": "Généralement Sound Variation" },
  { "cc": 71, "name": "Sound Controller 2", "usage": "Généralement Resonance" },
  { "cc": 72, "name": "Sound Controller 3", "usage": "Généralement Release Time" },
  { "cc": 73, "name": "Sound Controller 4", "usage": "Généralement Attack Time" },
  { "cc": 74, "name": "Sound Controller 5", "usage": "Généralement Brightness" },
  { "cc": 75, "name": "Sound Controller 6", "usage": "" },
  { "cc": 76, "name": "Sound Controller 7", "usage": "" },
  { "cc": 77, "name": "Sound Controller 8", "usage": "" },
  { "cc": 78, "name": "Sound Controller 9", "usage": "" },
  { "cc": 79, "name": "Sound Controller 10", "usage": "" },
  { "cc": 80, "name": "General Purpose Controller 5", "usage": "" },
  { "cc": 81, "name": "General Purpose Controller 6", "usage": "" },
  { "cc": 82, "name": "General Purpose Controller 7", "usage": "" },
  { "cc": 83, "name": "General Purpose Controller 8", "usage": "" },
  { "cc": 84, "name": "Portamento Control", "usage": "" },
  { "cc": 85, "name": "Undefined", "usage": "" },
  { "cc": 86, "name": "Undefined", "usage": "" },
  { "cc": 87, "name": "Undefined", "usage": "" },
  { "cc": 88, "name": "Undefined", "usage": "" },
  { "cc": 89, "name": "Undefined", "usage": "" },
  { "cc": 90, "name": "Undefined", "usage": "" },
  { "cc": 91, "name": "Effects 1 Depth", "usage": "Généralement Reverb Depth" },
  { "cc": 92, "name": "Effects 2 Depth", "usage": "Généralement Tremolo Depth" },
  { "cc": 93, "name": "Effects 3 Depth", "usage": "Généralement Chorus Depth" },
  { "cc": 94, "name": "Effects 4 Depth", "usage": "Généralement Detune Depth" },
  { "cc": 95, "name": "Effects 5 Depth", "usage": "Généralement Phaser Depth" },
  { "cc": 96, "name": "Data Increment", "usage": "" },
  { "cc": 97, "name": "Data Decrement", "usage": "" },
  { "cc": 98, "name": "Non-Registered Parameter Number", "usage": "" },
  { "cc": 99, "name": "Non-Registered Parameter Number", "usage": "" },
  { "cc": 100, "name": "Registered Parameter Number", "usage": "" },
  { "cc": 101, "name": "Registered Parameter Number", "usage": "" },
  { "cc": 102, "name": "Undefined", "usage": "" },
  { "cc": 103, "name": "Undefined", "usage": "" },
  { "cc": 104, "name": "Undefined", "usage": "" },
  { "cc": 105, "name": "Undefined", "usage": "" },
  { "cc": 106, "name": "Undefined", "usage": "" },
  { "cc": 107, "name": "Undefined", "usage": "" },
  { "cc": 108, "name": "Undefined", "usage": "" },
  { "cc": 109, "name": "Undefined", "usage": "" },
  { "cc": 110, "name": "Undefined", "usage": "" },
  { "cc": 111, "name": "Undefined", "usage": "" },
  { "cc": 112, "name": "Undefined", "usage": "" },
  { "cc": 113, "name": "Undefined", "usage": "" },
  { "cc": 114, "name": "Undefined", "usage": "" },
  { "cc": 115, "name": "Undefined", "usage": "" },
  { "cc": 116, "name": "Undefined", "usage": "" },
  { "cc": 117, "name": "Undefined", "usage": "" },
  { "cc": 118, "name": "Undefined", "usage": "" },
  { "cc": 119, "name": "Undefined", "usage": "" },
  { "cc": 120, "name": "All Sound Off", "usage": "" },
  { "cc": 121, "name": "Reset All Controllers", "usage": "" },
  { "cc": 122, "name": "Local Control On/Off", "usage": "" },
  { "cc": 123, "name": "All Notes Off", "usage": "" },
  { "cc": 124, "name": "Omni Mode Off", "usage": "" },
  { "cc": 125, "name": "Omni Mode On", "usage": "" },
  { "cc": 126, "name": "Mono Mode On", "usage": "" },
  { "cc": 127, "name": "Poly Mode On", "usage": "" }
]


// Options disponibles pour le select
const availableCCOptions = computed(() => {
  const visibleCCs = props.visibleCCLanes || []

  return midiCC.map(x => ({
    number: x.cc,
    name: x.name || `Controller ${x.cc + 1}`,
    disabled: visibleCCs.includes(x.cc)
  }))
})

// Gérer la sélection d'un CC (mode multiple)
const handleCCSelection = (ccNumbers) => {
  if (ccNumbers && ccNumbers.length > 0) {
    // Prendre le dernier élément ajouté
    const lastAdded = ccNumbers[ccNumbers.length - 1]
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
  font-size: 17px !important;
  margin-right: -1px;
  color: #000;
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
</style>