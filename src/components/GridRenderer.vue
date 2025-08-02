<template>
  <div class="grid-renderer" :style="containerStyle">
    <!-- Lignes de subdivisions (arrière-plan) -->
    <div
      v-for="line in subdivisionLines"
      :key="line.id"
      :class="['grid-line', 'subdivision-line', ...line.classes]"
      :style="line.style"
      :title="line.tooltip"
      v-bind="line.data && includeDataAttributes ? getDataAttributes(line.data) : {}"
    />

    <!-- Lignes de beats (milieu) -->
    <div
      v-for="line in beatLines"
      :key="line.id"
      :class="['grid-line', 'beat-line', ...line.classes]"
      :style="line.style"
      :title="line.tooltip"
      v-bind="line.data && includeDataAttributes ? getDataAttributes(line.data) : {}"
    />

    <!-- Lignes de mesures (premier plan) -->
    <div
      v-for="line in measureLines"
      :key="line.id"
      :class="['grid-line', 'measure-line', ...line.classes]"
      :style="line.style"
      :title="line.tooltip"
      v-bind="line.data && includeDataAttributes ? getDataAttributes(line.data) : {}"
    >
      <!-- Indicateur de signature rythmique -->
      <div
        v-if="line.isSignatureChange && showSignatureIndicators"
        class="signature-indicator"
        :style="signatureIndicatorStyle"
      >
        {{ line.timeSignature.numerator }}/{{ line.timeSignature.denominator }}
      </div>

      <!-- Numéro de mesure -->
      <div
        v-if="showMeasureNumbers"
        class="measure-number"
        :style="measureNumberStyle"
      >
        {{ line.measure }}
      </div>
    </div>

    <!-- Labels des beats -->
    <div
      v-for="label in beatLabels"
      :key="label.id"
      class="beat-label"
      :style="label.style"
      :title="`Beat ${label.beat} of measure ${label.measure}`"
    >
      {{ label.text }}
    </div>

    <!-- Labels des subdivisions -->
    <div
      v-for="label in subdivisionLabels"
      :key="label.id"
      class="subdivision-label"
      :style="label.style"
    >
      {{ label.text }}
    </div>

    <!-- Slot pour contenu personnalisé -->
    <slot 
      :measures="measures"
      :measureLines="measureLines"
      :beatLines="beatLines"
      :subdivisionLines="subdivisionLines"
      :totalWidth="totalWidth"
      :getMeasureAtPixel="getMeasureAtPixel"
      :getNearestBeat="getNearestBeat"
      :getNearestSubdivision="getNearestSubdivision"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGridRenderer } from '@/composables/useGridRenderer'

const props = defineProps({
  // Configuration de base
  showMeasureLines: { type: Boolean, default: true },
  showBeatLines: { type: Boolean, default: true },
  showSubdivisionLines: { type: Boolean, default: true },
  showSignatureIndicators: { type: Boolean, default: false },
  showMeasureNumbers: { type: Boolean, default: false },
  showBeatLabels: { type: Boolean, default: false },
  showSubdivisionLabels: { type: Boolean, default: false },
  
  // Dimensions
  containerHeight: { type: Number, default: null },
  
  // Styles personnalisés pour les éléments spéciaux
  signatureIndicatorStyle: { type: Object, default: () => ({}) },
  measureNumberStyle: { type: Object, default: () => ({}) },
  
  // Options avancées
  includeDataAttributes: { type: Boolean, default: false },
  
  // Z-index personnalisés
  measureZIndex: { type: Number, default: 4 },
  beatZIndex: { type: Number, default: 3 },
  subdivisionZIndex: { type: Number, default: 1 },
  signatureZIndex: { type: Number, default: 5 }
})

// Utiliser le composable avec les props
const gridRenderer = useGridRenderer({
  showMeasureLines: props.showMeasureLines,
  showBeatLines: props.showBeatLines,
  showSubdivisionLines: props.showSubdivisionLines,
  showSignatureIndicators: props.showSignatureIndicators,
  showMeasureNumbers: props.showMeasureNumbers,
  showBeatLabels: props.showBeatLabels,
  showSubdivisionLabels: props.showSubdivisionLabels,
  containerHeight: props.containerHeight,
  measureZIndex: props.measureZIndex,
  beatZIndex: props.beatZIndex,
  subdivisionZIndex: props.subdivisionZIndex,
  signatureZIndex: props.signatureZIndex
})

const {
  measures,
  measureLines,
  beatLines,
  subdivisionLines,
  beatLabels,
  subdivisionLabels,
  totalWidth,
  containerStyle,
  getMeasureAtPixel,
  getNearestBeat,
  getNearestSubdivision
} = gridRenderer

// Utilitaire pour convertir les données en attributs data-*
const getDataAttributes = (data) => {
  const attrs = {}
  if (data.number !== undefined) attrs['data-measure'] = data.number
  if (data.startPixel !== undefined) attrs['data-start-pixel'] = data.startPixel
  if (data.timeSignature) {
    attrs['data-time-signature'] = `${data.timeSignature.numerator}/${data.timeSignature.denominator}`
  }
  if (data.beatIndex !== undefined) attrs['data-beat'] = data.beatIndex
  if (data.subdivisionIndex !== undefined) attrs['data-subdivision'] = data.subdivisionIndex
  if (data.isStrong !== undefined) attrs['data-strong'] = data.isStrong
  return attrs
}

// Exposer les méthodes utilitaires
defineExpose({
  measures,
  measureLines,
  beatLines,
  subdivisionLines,
  totalWidth,
  getMeasureAtPixel,
  getNearestBeat,
  getNearestSubdivision,
  gridRenderer
})
</script>

<style scoped>
.grid-renderer {
  position: relative;
  pointer-events: none;
  overflow: visible;
  width: 100%;
  height: 100%;
  box-shadow: inset 0 -8px 12px -6px var(--grid-shadow, rgba(0, 0, 0, 0.15));
}

.grid-line {
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
}

/* === LIGNES DE MESURES === */
.measure-line {
  width: 3px;
  background: var(--grid-measure-line, #666);
  border: none;
}

.measure-line.signature-change {
  width: 3px;
  background: var(--grid-signature-change, #2196F3);
  box-shadow: 2px 0 4px var(--grid-signature-shadow, rgba(33, 150, 243, 0.3));
}

/* === LIGNES DE BEATS === */
.beat-line {
  width: 1px;
  background: var(--grid-beat-line, #888);
  border: none;
}

/* === LIGNES DE SUBDIVISIONS === */
.subdivision-line {
  width: 1px;
  border: none;
  background: var(--grid-subdivision-weak, #ddd);
  opacity: 0.6;
}

/* Subdivisions faibles (la plupart) */
.subdivision-line.weak-subdivision {
  background: var(--grid-subdivision-weak, #ddd);
  opacity: 0.5;
  width: 1px;
}

/* Subdivisions fortes (chaque 4ème) */
.subdivision-line.strong-subdivision {
  background: var(--grid-subdivision-strong, #aaa);
  width: 1px;
  opacity: 0.8;
}

/* Subdivisions de triolets - couleur distinctive */
.subdivision-line.triplet-subdivision {
  background: var(--grid-triplet-subdivision, #f0a030);
  opacity: 0.7;
}

/* === ÉLÉMENTS DE TEXTE === */

/* Indicateur de signature rythmique */
.signature-indicator {
  position: absolute;
  top: -20px;
  left: 3px;
  background: var(--grid-signature-bg, #2196F3);
  color: var(--grid-signature-fg, #fff);
  font-size: 10px;
  font-weight: bold;
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
  z-index: 10;
  font-family: monospace;
}

/* Numéro de mesure */
.measure-number {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 12px;
  font-weight: bold;
  color: var(--grid-measure-number, #333);
  text-shadow: 1px 1px 2px var(--grid-measure-number-shadow, rgba(255, 255, 255, 0.8));
  z-index: 10;
}

/* Label de beat */
.beat-label {
  position: absolute;
  font-size: 10px;
  color: var(--grid-beat-label, #666);
  font-weight: bold; /* Plus visible */
  z-index: 5;
}

/* Label de subdivision */
.subdivision-label {
  position: absolute;
  font-size: 8px;
  color: var(--grid-subdivision-label, #999);
  font-weight: normal;
  z-index: 3;
  white-space: nowrap;
}

/* === VARIABLES CSS POUR LES THÈMES === */
:root {
  --grid-measure-line: #666;
  --grid-beat-line: #888;
  --grid-subdivision-weak: #ddd;
  --grid-subdivision-strong: #aaa;
  --grid-triplet-subdivision: #f0a030;
  --grid-signature-change: #2196F3;
  --grid-signature-shadow: rgba(33, 150, 243, 0.3);
  --grid-signature-bg: #2196F3;
  --grid-signature-fg: #fff;
  --grid-measure-number: #333;
  --grid-measure-number-shadow: rgba(255, 255, 255, 0.8);
  --grid-beat-label: #666;
  --grid-subdivision-label: #999;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --grid-measure-line: #888;
    --grid-beat-line: #666;
    --grid-subdivision-weak: #333;
    --grid-subdivision-strong: #555;
    --grid-triplet-subdivision: #cc8800;
    --grid-signature-change: #64B5F6;
    --grid-signature-shadow: rgba(100, 181, 246, 0.3);
    --grid-measure-number: #ddd;
    --grid-measure-number-shadow: rgba(0, 0, 0, 0.8);
    --grid-beat-label: #aaa;
    --grid-subdivision-label: #777;
  }
}
</style>