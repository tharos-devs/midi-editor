<template>
  <div class="color-picker-wrapper">
    <!-- Trigger (bande de couleur ou autre élément) -->
    <div 
      class="color-trigger" 
      :style="{ backgroundColor: modelValue }"
      @click.stop="showDialog = true"
      :title="triggerTooltip"
    >
      <slot name="trigger">
        <!-- Trigger par défaut : bande de couleur -->
        <div class="default-color-band"></div>
      </slot>
    </div>

    <!-- Dialog de sélection de couleur -->
    <el-dialog
      v-model="showDialog"
      :title="dialogTitle"
      width="300px"
      align-center
      append-to-body
      :z-index="3000"
      destroy-on-close
    >
      <div class="color-picker">
        <div class="color-grid">
          <div
            v-for="color in colorPresets"
            :key="color"
            class="color-option"
            :style="{ backgroundColor: color }"
            @click="selectColor(color)"
            :class="{ selected: modelValue === color }"
          ></div>
        </div>
        <div class="custom-color">
          <label>Couleur personnalisée:</label>
          <input
            type="color"
            :value="modelValue"
            @change="selectColor($event.target.value)"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// Props
const props = defineProps({
  modelValue: {
    type: String,
    default: '#4ECDC4'
  },
  dialogTitle: {
    type: String,
    default: 'Choisir une couleur'
  },
  triggerTooltip: {
    type: String,
    default: 'Cliquer pour changer la couleur'
  },
  colorPresets: {
    type: Array,
    default: () => [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F39C12', '#E74C3C', '#9B59B6', '#3498DB', '#2ECC71',
      '#1ABC9C', '#34495E', '#95A5A6', '#E67E22', '#C0392B'
    ]
  }
})

// Émissions
const emit = defineEmits(['update:modelValue', 'change'])

// État local
const showDialog = ref(false)

// Méthodes
function selectColor(color) {
  emit('update:modelValue', color)
  emit('change', color)
  showDialog.value = false
}
</script>

<style scoped>
.color-picker-wrapper {
  display: inline-block;
}

.color-trigger {
  cursor: pointer;
  transition: all 0.2s ease;
}

.default-color-band {
  width: 6px;
  height: 100%;
  min-width: 6px;
  transition: width 0.2s ease;
}

.color-trigger:hover .default-color-band {
  width: 8px;
}

.color-picker {
  padding: 16px 0;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: var(--menu-active-fg);
}

.color-option.selected {
  border-color: var(--menu-active-fg);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.custom-color {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.custom-color label {
  font-size: 12px;
  color: var(--track-instrument);
}

.custom-color input[type="color"] {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>