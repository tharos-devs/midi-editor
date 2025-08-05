<template>
  <div class="signature-ruler" :style="{ width: totalWidth + 'px' }" >
    <div class="signature-ruler-content">
      <!-- Utilisation de GridRenderer pour les lignes de mesure et beats -->
      <GridRenderer
        :show-measure-lines="true"
        :show-beat-lines="false"
        :show-subdivision-lines="false"
        :show-signature-indicators="false"
        :show-measure-numbers="false"
        :show-beat-labels="false"
        :show-subdivision-labels="false"
        :container-height="20"
        :measure-z-index="2"
        class="grid-overlay"
      >
        <!-- Contenu personnalisé par-dessus la grille -->
        <template #default="{ measures }">
          <!-- Signatures rythmiques et subdivisions personnalisées -->
          <div
            v-for="measure in measures"
            :key="measure.number"
            class="signature-mark"
            :style="{ left: measure.startPixel + 'px' }"
          >
            <!-- Signature rythmique (seulement pour les changements) -->
            <div 
              v-if="measure.signatureChange"
              class="time-signature-text"
              :title="`Signature rythmique: ${measure.timeSignature.numerator}/${measure.timeSignature.denominator}`"
            >
              {{ measure.timeSignature.numerator }}/{{ measure.timeSignature.denominator }}
            </div>
            
            <!-- Lignes de subdivisions (beats) - géré par GridRenderer -->
            <!-- Les beats sont maintenant affichés par GridRenderer si nécessaire -->
          </div>
        </template>
      </GridRenderer>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import GridRenderer from '../GridRenderer.vue'

// Utiliser le composable de signature rythmique
const {
  measuresWithSignatures,
  totalWidth
} = useTimeSignature()

// TimeSignatureRuler n'a plus de logique wheel - géré par WheelHandler global

// Exposition des données pour les composants parents
defineExpose({
  measuresWithSignatures,
  totalWidth
})
</script>

<style scoped>
.signature-ruler {
  height: 20px;
  position: relative;
  background: linear-gradient(
    to bottom,
    var(--signature-ruler-bg, #f8f9fa) 0%,
    var(--signature-ruler-bg-gradient, #e9ecef) 100%
  );
  min-width: 100%;
  border-bottom: 1px solid var(--signature-ruler-border, #dee2e6);
  border-top: 1px solid var(--signature-ruler-border, #dee2e6);
  overflow: hidden;
}

.signature-ruler-content {
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* Overlay pour GridRenderer */
.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

/* Styles pour les éléments personnalisés */
.signature-mark {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 3; /* Au-dessus de GridRenderer */
}

.time-signature-text {
  position: absolute;
  top: 50%;
  left: 6px;
  transform: translateY(-50%);
  font-size: 13px;
  font-weight: bold;
  color: var(--signature-text, #333);
  z-index: 5;
  transition: color 0.2s ease;
  padding: 1px 3px;
  border-radius: 2px;
  border: 1px solid var(--signature-text-border, rgba(0, 0, 0, 0.1));
}

.time-signature-text:hover {
  color: var(--signature-text-hover, #007bff);
  background: var(--signature-text-bg-hover, rgba(255, 255, 255, 1));
}

/* Personnalisation des lignes de GridRenderer pour TimeSignatureRuler */
.grid-overlay :deep(.measure-line) {
  background: var(--signature-measure-bar, #333);
  width: 2px;
}

.grid-overlay :deep(.measure-line.signature-change) {
  background: var(--signature-measure-bar-change, #007bff);
  width: 3px;
  box-shadow: 1px 0 2px var(--signature-measure-shadow, rgba(0, 123, 255, 0.3));
}

/* Variables CSS personnalisées */
:root {
  --signature-text-bg: rgba(255, 255, 255, 0.9);
  --signature-text-bg-hover: rgba(255, 255, 255, 1);
  --signature-text-border: rgba(0, 0, 0, 0.1);
  --signature-measure-bar-change: #007bff;
  --signature-measure-shadow: rgba(0, 123, 255, 0.3);
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --signature-ruler-bg: #2d3748;
    --signature-ruler-bg-gradient: #1a202c;
    --signature-ruler-border: #4a5568;
    --signature-text: #e2e8f0;
    --signature-text-hover: #63b3ed;
    --signature-text-bg: rgba(45, 55, 72, 0.9);
    --signature-text-bg-hover: rgba(45, 55, 72, 1);
    --signature-text-border: rgba(255, 255, 255, 0.1);
    --signature-measure-bar-change: #63b3ed;
    --signature-measure-shadow: rgba(99, 179, 237, 0.3);
  }
}
</style>