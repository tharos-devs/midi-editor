<template>
  <div class="timeline" :style="{ width: totalWidth + 'px' }">
    <div class="timeline-ruler">
      <!-- Utilisation du GridRenderer -->
      <GridRenderer 
        :show-measure-lines="true"
        :show-beat-lines="true"
        :show-subdivision-lines="true"
        :show-signature-indicators="true"
        :show-measure-numbers="true" 
        :show-beat-labels="true"
        :show-subdivision-labels="false"
        :signature-indicator-style="{ top: '-18px', fontSize: '10px' }"
        :measure-number-style="{ top: '6px', fontSize: '14px', fontWeight: 'bold' }"
      >
        <!-- Slot pour les fonds colorés selon signature (optionnel) -->
        <template #default="{ measures }">
          <div
            v-for="measure in measures"
            :key="`bg-${measure.number}`"
            class="measure-background"
            :class="`sig-${measure.timeSignature.numerator}-${measure.timeSignature.denominator}`"
            :style="{
              position: 'absolute',
              left: measure.startPixel + 'px',
              width: measure.measureWidth + 'px',
              height: '100%',
              top: '0px',
              zIndex: 0
            }"
          />
        </template>
      </GridRenderer>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import GridRenderer from '@/components/GridRenderer.vue'

// Utiliser le composable de signature rythmique
const timeSignatureComposable = useTimeSignature()

const measuresWithSignatures = computed(() => {
  return timeSignatureComposable?.measuresWithSignatures?.value || []
})

const totalWidth = computed(() => {
  return timeSignatureComposable?.totalWidth?.value || 800
})

const measures = computed(() => {
  return timeSignatureComposable?.measuresWithSignatures?.value || []
})

// Exposition sécurisée des données
defineExpose({
  measuresWithSignatures: measures,
  totalWidth,
  getAllMeasureLines: timeSignatureComposable?.getAllMeasureLines || computed(() => []),
  getAllBeatLines: timeSignatureComposable?.getAllBeatLines || computed(() => [])
})
</script>

<style scoped>
.timeline {
  height: 100%;
  position: relative;
  background: linear-gradient(to bottom, #fafafa 0%, #f0f0f0 100%);
  min-width: 100%;
  border-bottom: 1px solid #ddd;
}

.timeline-ruler {
  height: 100%;
  position: relative;
  overflow: visible;
}

/* Styles pour les fonds de mesures selon leur signature */
.measure-background {
  opacity: 0.1;
}
</style>