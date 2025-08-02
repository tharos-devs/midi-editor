<template>
  <div class="time-grid">
    <!-- Lignes verticales pour les mesures -->
    <div
      v-for="measure in measures"
      :key="`measure-${measure.number}`"
      class="measure-line"
      :class="{
        'signature-change': measure.signatureChange,
        'visible-measure': visibleMeasures.includes(measure.number)
      }"
      :style="{ left: measure.startPixel + 'px' }"
    >
      <div
        v-if="measure.signatureChange"
        class="time-signature-indicator"
      >
        {{ measure.timeSignature.numerator }}/{{ measure.timeSignature.denominator }}
      </div>
    </div>

    <!-- Lignes verticales pour les temps (beats) -->
    <template v-for="measure in measures" :key="`beats-${measure.number}`">
      <div
        v-for="beat in measure.beats.slice(1)"
        :key="`beat-${measure.number}-${beat}`"
        class="beat-line"
        :style="{
          left: (measure.startPixel + (beat - 1) * measure.beatWidth) + 'px'
        }"
      />
    </template>
  </div>
</template>

<script setup>
defineProps({
  measures: {
    type: Array,
    required: true
  },
  visibleMeasures: {
    type: Array,
    required: true
  }
})
</script>

<style scoped>
.time-grid {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  top: 0;
  left: 0;
}

/* Lignes de mesures */
.measure-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px; /* Augmenté pour être plus visible */
  background: var(--velocity-measure-line, #e0e0e0);
  pointer-events: none;
  z-index: 3;
  min-height: 100%; /* Assure la hauteur complète */
}

.measure-line.signature-change {
  z-index: 4;
}

.measure-line.visible-measure {

  width: 2px;
}

/* Lignes de temps (beats) */
.beat-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--velocity-beat-line, #f0f0f0);
  pointer-events: none;
  z-index: 2;
  min-height: 100%; /* Assure la hauteur complète */
}

/* Indicateur de signature rythmique */
.time-signature-indicator {
  position: absolute;
  top: -20px;
  left: 3px; /* Ajusté pour la nouvelle largeur */
  background: var(--velocity-signature-indicator-bg, #2196F3);
  color: var(--velocity-signature-indicator-fg, #fff);
  font-size: 10px;
  font-weight: bold;
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
  z-index: 10;
  font-family: monospace;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .time-grid {
    --velocity-measure-line: #555555; /* Plus visible en mode sombre */
    --velocity-beat-line: #333333; /* Plus visible en mode sombre */
    --velocity-signature-change: #64B5F6; /* Bleu plus clair */
    --velocity-visible-measure: #888888; /* Plus visible */
    --velocity-signature-indicator-bg: #2196F3;
    --velocity-signature-indicator-fg: #fff;
  }
}
</style>