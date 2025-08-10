<template>
  <div class="cc-infos">
    <!-- Labels de référence CC fixes à droite -->
    <div class="cc-reference-labels">
      <div
        v-for="level in [0, 32, 64, 96, 127]"
        :key="level"
        class="cc-reference-label"
        :class="{
          'label-top': level === 127,
          'label-bottom': level === 0
        }"
        :style="{ 
          bottom: (level / 127) * 100 + '%',
          transform: level === 127 ? 'translateY(100%)' : 
                    level === 0 ? 'translateY(0%)' :
                    level === 96 ? 'translateY(40%)' : 
                    level === 32 ? 'translateY(60%)' : 
                    'translateY(50%)'
        }"
        :data-level="level"
      >
        {{ level }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  ccNumber: {
    type: Number,
    required: true
  },
  ccName: {
    type: String,
    default: ''
  },
  selectedPointValue: {
    type: Number,
    default: null
  }
})

// Couleurs spécifiques selon le CC
const ccColors = {
  1: '#2196F3',   // Modulation - Bleu
  7: '#4CAF50',   // Volume - Vert
  10: '#FF9800',  // Pan - Orange
  11: '#9C27B0', // Expression - Violet
}

const ccColor = computed(() => ccColors[props.ccNumber] || '#607D8B')
</script>

<style scoped>
.cc-infos {
  height: 100%;
  /* position: relative supprimé pour permettre l'absolute des labels */
}

/* Labels de référence CC fixes sur la droite - PLEINE HAUTEUR */
.cc-reference-labels {
  position: absolute;
  left: 0; /* CORRECTION: positionner à partir de la gauche */
  right: 5px; /* Marge de 5px du bord droit */
  top: 0;
  bottom: 0;
  pointer-events: none;
}

.cc-reference-label {
  position: absolute;
  right: 0;
  /* Transform défini dynamiquement dans le template */
  font-size: 9px;
  font-weight: 600;
  color: #666;
  /* STYLE MINIMALISTE: fond transparent, pas de cadre */
  background: transparent;
  padding: 1px 2px;
  white-space: nowrap;
  text-align: right;
  min-width: 16px;
  /* Légère ombre pour la lisibilité */
  text-shadow: 1px 1px 1px rgba(255,255,255,0.8);
  z-index: 100;
}

/* Positionnement spécial pour les valeurs extrêmes */
.cc-reference-label.label-top {
  /* Valeur 127 (en haut) - garder dans la div */
  transform: translateY(100%) !important;
}

.cc-reference-label.label-bottom {
  /* Valeur 0 (en bas) - garder dans la div */
  transform: translateY(0%) !important;
}

.cc-current-value {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 12px;
  font-weight: 600;
  color: v-bind(ccColor);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid rgba(200,200,200,0.3);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .cc-name {
    color: #ccc;
  }
  
  .cc-reference-label,
  .cc-current-value {
    background: rgba(50, 50, 50, 0.9);
    color: #ccc;
    border-color: rgba(100,100,100,0.3);
  }
}
</style>