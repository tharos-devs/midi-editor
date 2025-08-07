<template>
  <div class="tempo-infos">
    <!-- Labels de référence Tempo fixes à droite -->
    <div class="tempo-reference-labels">
      <div
        v-for="bpm in referenceValues"
        :key="bpm"
        class="tempo-reference-label"
        :class="{
          'label-top': isTopValue(bpm),
          'label-bottom': isBottomValue(bpm)
        }"
        :style="{ 
          // Positionnement avec clamping pour rester visible
          bottom: getPositionPercent(bpm) + '%'
        }"
        :data-bpm="bpm"
      >
        {{ bpm }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  selectedPointValue: {
    type: Number,
    default: null
  }
})

// Couleur spécifique pour le tempo (rouge-orange comme dans TempoLane)
const tempoColor = computed(() => '#FF5722')

// Valeurs de référence à afficher - alignées avec les lignes du TempoLane (80, 120, 160) + 0
const referenceValues = [0, 80, 120, 160, 200]

// Fonction pour calculer la position en pourcentage
function getPositionPercent(bpm) {
  // Cas spécial pour 0 : le placer à 2% du bas pour qu'il soit visible
  if (bpm === 0) {
    return 2
  }
  
  // Normaliser par rapport à la plage 60-200 pour les autres valeurs
  const normalized = (bpm - 60) / (200 - 60)
  // Clamper entre 3 et 98% pour laisser de l'espace pour les labels extrêmes
  return Math.max(3, Math.min(98, normalized * 100))
}

// Déterminer si c'est une valeur haute (proche du top)
function isTopValue(bpm) {
  return bpm >= 200 // 200 BPM et plus
}

// Déterminer si c'est une valeur basse (proche du bottom)
function isBottomValue(bpm) {
  return bpm === 0 || bpm <= 60 // 0 BPM ou valeurs très basses
}
</script>

<style scoped>
.tempo-infos {
  height: 100%;
  /* position: relative supprimé pour permettre l'absolute des labels */
}

/* Labels de référence Tempo fixes sur la droite - PLEINE HAUTEUR */
.tempo-reference-labels {
  position: absolute;
  left: 0; /* Positionner à partir de la gauche */
  right: 5px; /* Marge de 5px du bord droit */
  top: 0;
  bottom: 0;
  pointer-events: none;
}

.tempo-reference-label {
  position: absolute;
  right: 0;
  font-size: 9px;
  font-weight: 600;
  color: #666;
  background: transparent;
  padding: 1px 2px;
  white-space: nowrap;
  text-align: right;
  min-width: 20px;
  text-shadow: 1px 1px 1px rgba(255,255,255,0.8);
  z-index: 100;
  /* Centrage vertical par défaut */
  transform: translateY(50%);
}

/* Positionnement spécial pour les valeurs extrêmes */
.tempo-reference-label.label-top {
  /* Valeur 200 (en haut) - garder dans la div */
  transform: translateY(100%);
}

.tempo-reference-label.label-bottom {
  /* Valeur 50 (en bas) - garder dans la div */
  transform: translateY(0%);
}

.tempo-current-value {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 12px;
  font-weight: 600;
  color: v-bind(tempoColor);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid rgba(200,200,200,0.3);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .tempo-reference-label,
  .tempo-current-value {
    background: rgba(50, 50, 50, 0.9);
    color: #ccc;
    border-color: rgba(100,100,100,0.3);
    text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
  }
}
</style>