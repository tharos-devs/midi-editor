<template>
  <div class="velocity-infos">
    <!-- Labels de référence Velocity fixes à droite -->
    <div class="velocity-reference-labels">
      <div
        v-for="velocity in referenceValues"
        :key="velocity"
        class="velocity-reference-label"
        :class="{
          'label-top': isTopValue(velocity),
          'label-bottom': isBottomValue(velocity)
        }"
        :style="{ 
          bottom: getPositionPercent(velocity) + '%',
          transform: velocity === 127 ? 'translateY(100%)' : 
                    velocity === 0 ? 'translateY(0%)' :
                    velocity === 96 ? 'translateY(40%)' : 
                    velocity === 32 ? 'translateY(60%)' : 
                    'translateY(50%)'
        }"
        :data-velocity="velocity"
      >
        {{ velocity }}
      </div>
    </div>

    <!-- Champ de saisie manuelle de la vélocité -->
    <div 
      v-if="uiStore.velocityDisplay?.visible" 
      class="velocity-input-container"
    >
      <div class="velocity-title">Velocité</div>
      <div class="velocity-note">{{ uiStore.velocityDisplay.name || '--' }}</div>
      <el-input-number
        v-model="velocityInputValue"
        :min="0"
        :max="127"
        :step="1"
        size="small"
        class="velocity-input"
        @change="updateVelocity"
        @blur="updateVelocity"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useMidiStore } from '@/stores/midi'

const uiStore = useUIStore()
const midiStore = useMidiStore()

const props = defineProps({
  selectedBarValue: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['velocity-update'])

// Valeurs de référence pour les labels (correspondant aux lignes existantes)
const referenceValues = [0, 32, 64, 96, 127]

// Valeur d'entrée pour le champ de saisie
const velocityInputValue = ref(0)

// Synchroniser la valeur d'entrée avec la valeur sélectionnée
watch(() => uiStore.velocityDisplay?.value, (newValue) => {
  if (newValue !== null && newValue !== undefined) {
    velocityInputValue.value = Math.round(newValue)
  }
}, { immediate: true })

// Fonction pour calculer la position en pourcentage (0-127 -> 0-100%)
function getPositionPercent(velocity) {
  return (velocity / 127) * 100
}

// Déterminer si c'est une valeur haute (proche du top)
function isTopValue(velocity) {
  return velocity >= 127
}

// Déterminer si c'est une valeur basse (proche du bottom)  
function isBottomValue(velocity) {
  return velocity === 0
}

// Mettre à jour la vélocité
function updateVelocity() {
  if (uiStore.velocityDisplay?.noteId) {
    emit('velocity-update', {
      noteId: uiStore.velocityDisplay.noteId,
      velocity: velocityInputValue.value
    })
  }
}

// Fonction de formatage conservée pour compatibilité
const formatVelocity = (value) => {
  if (value === null || value === undefined) return '--'
  return Math.round(value).toString()
}
</script>

<style scoped>
.velocity-infos {
  height: 100%;
  position: relative;
}

/* Labels de référence Velocity fixes sur la droite */
.velocity-reference-labels {
  position: absolute;
  left: 0;
  right: 5px;
  top: 0;
  bottom: 0;
  pointer-events: none;
}

.velocity-reference-label {
  position: absolute;
  right: 0;
  font-size: 9px;
  font-weight: 600;
  color: #666;
  background: transparent;
  padding: 1px 2px;
  white-space: nowrap;
  text-align: right;
  min-width: 16px;
  text-shadow: 1px 1px 1px rgba(255,255,255,0.8);
  z-index: 100;
}

/* Positionnement spécial pour les valeurs extrêmes */
.velocity-reference-label.label-top {
  /* Valeur 127 (en haut) - garder dans la div */
  transform: translateY(100%) !important;
}

.velocity-reference-label.label-bottom {
  /* Valeur 0 (en bas) - garder dans la div */
  transform: translateY(0%) !important;
}

/* Conteneur pour le champ de saisie */
.velocity-input-container {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.95);
  color: #000;
  padding: 8px 12px;
  border-radius: 6px;
  text-align: center;
  min-width: 120px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 200;
}

.velocity-title {
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.8;
  margin-bottom: 2px;
  letter-spacing: 0.5px;
}

.velocity-note {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
}

.velocity-input {
  width: 100%;
}

.velocity-input :deep(.el-input-number) {
  width: 100%;
}

.velocity-input :deep(.el-input__wrapper) {
  padding: 2px 8px;
}

.velocity-input :deep(.el-input__inner) {
  font-size: 14px;
  font-weight: bold;
  text-align: center;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .velocity-reference-label {
    background: rgba(50, 50, 50, 0.9);
    color: #ccc;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
  }
  
  .velocity-input-container {
    background: rgba(50, 50, 50, 0.95);
    color: #ccc;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  }
}
</style>