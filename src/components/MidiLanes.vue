<template>
  <div class="midi-lanes" :style="{ width: totalWidth + 'px' }">
    <component
      v-if="selectedLane"
      :is="selectedLane.component"
      v-bind="selectedLane.props"
      :total-measures="totalMeasures"
      :visible-measures="visibleMeasures"
      :key="selectedLane.id || selectedLane.component"
    />
    <div v-else class="no-lane-selected">
      Sélectionnez une lane pour l'afficher
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'

const props = defineProps({
  selectedLane: {
    type: Object,
    default: null
  }
})

// Utiliser le composable useTimeSignature pour obtenir les données correctes
const timeSignatureComposable = useTimeSignature()

// Calculer le nombre total de mesures dynamiquement
const totalMeasures = computed(() => {
  try {
    return timeSignatureComposable?.calculateTotalMeasures?.value || 32
  } catch (error) {
    console.warn('Erreur lors du calcul du nombre total de mesures:', error)
    return 32
  }
})

// Obtenir la largeur totale depuis le composable
const totalWidth = computed(() => {
  try {
    return timeSignatureComposable?.totalWidth?.value || 800
  } catch (error) {
    console.warn('Erreur lors du calcul de la largeur totale:', error)
    return 800
  }
})

// Générer la liste des mesures visibles
const visibleMeasures = computed(() => {
  try {
    const total = totalMeasures.value
    return Array.from({ length: total }, (_, i) => i + 1)
  } catch (error) {
    console.warn('Erreur lors de la génération des mesures visibles:', error)
    return Array.from({ length: 32 }, (_, i) => i + 1)
  }
})
</script>

<style scoped>
.midi-lanes {
  height: 100%;
  background: var(--midi-lanes-bg, #fafafa);
  min-width: 100%;
  position: relative;
  overflow: hidden;
}

.no-lane-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--midi-lanes-empty-fg, #999);
  font-size: 14px;
}
</style>