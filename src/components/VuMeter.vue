<template>
  <div class="vu-meter-wrapper" ref="wrapperRef">
    <div class="vu-meter">
      <!-- Graduations à gauche -->
      <div class="scale" v-if="graduationSide === 'left'">
        <div
          v-for="(label, index) in scaleLabels"
          :key="index"
          class="tick"
          :style="{ bottom: `${(index / (scaleLabels.length - 1)) * 100}%` }"
        >
          {{ label }}
        </div>
      </div>

      <!-- Barres L/R -->
      <div class="bar-pair">
        <div class="bar">
          <div
            class="fill"
            :style="{ height: `${leftHeight}%`, backgroundColor: leftColor }"
          ></div>
          <div class="peak" :style="{ bottom: `${leftPeakHeight}%` }" />
        </div>
        <div class="bar">
          <div
            class="fill"
            :style="{ height: `${rightHeight}%`, backgroundColor: rightColor }"
          ></div>
          <div class="peak" :style="{ bottom: `${rightPeakHeight}%` }" />
        </div>
      </div>

      <!-- Graduations à droite -->
      <div class="scale" v-if="graduationSide === 'right'">
        <div
          v-for="(label, index) in scaleLabels"
          :key="index"
          class="tick"
          :style="{ bottom: `${(index / (scaleLabels.length - 1)) * 100}%` }"
        >
          {{ label }}
        </div>
      </div>
    </div>

    <!-- Labels L/R en bas -->
    <div class="labels">
      <span>L</span>
      <span>R</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watchEffect, onMounted } from 'vue'

const props = defineProps({
  midiVolume: { type: Number, required: true },
  midiPan: { type: Number, required: true },
  referenceValue: { type: Number, default: 100 },
  ticks: { type: Number, default: 7 },
  graduationSide: { type: String, default: 'right' },
  logarithmic: { type: Boolean, default: true },
})

const maxMidi = 127
const decayRate = 20
const peakDecayRate = 10

// Calcul du pan (0 = gauche, 1 = droite)
const pan = computed(() => Math.min(Math.max(props.midiPan / 127, 0), 1))
const gainLeft = computed(() => Math.cos(pan.value * 0.5 * Math.PI))
const gainRight = computed(() => Math.sin(pan.value * 0.5 * Math.PI))

const leftValue = ref(props.midiVolume * gainLeft.value)
const rightValue = ref(props.midiVolume * gainRight.value)

const displayLeft = ref(leftValue.value)
const displayRight = ref(rightValue.value)
const peakLeft = ref(leftValue.value)
const peakRight = ref(rightValue.value)

watchEffect(() => {
  leftValue.value = props.midiVolume * gainLeft.value
  rightValue.value = props.midiVolume * gainRight.value
})

let lastTime = performance.now()
function animate() {
  const now = performance.now()
  const dt = (now - lastTime) / 1000
  lastTime = now

  const maxDrop = (maxMidi * decayRate * dt) / 40
  const peakDrop = (maxMidi * peakDecayRate * dt) / 40

  displayLeft.value = Math.max(leftValue.value, displayLeft.value - maxDrop)
  displayRight.value = Math.max(rightValue.value, displayRight.value - maxDrop)

  peakLeft.value = Math.max(leftValue.value, peakLeft.value - peakDrop)
  peakRight.value = Math.max(rightValue.value, peakRight.value - peakDrop)

  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

function valueToHeight(value, log = props.logarithmic) {
  value = Math.max(1, value)
  if (!log) return (value / maxMidi) * 100
  const min = Math.log10(1)
  const max = Math.log10(maxMidi)
  return ((Math.log10(value) - min) / (max - min)) * 100
}

const leftHeight = computed(() => valueToHeight(displayLeft.value))
const rightHeight = computed(() => valueToHeight(displayRight.value))
const leftPeakHeight = computed(() => valueToHeight(peakLeft.value))
const rightPeakHeight = computed(() => valueToHeight(peakRight.value))

function interpolateColor(dB) {
  const norm = Math.min(Math.max((dB + 40) / 46, 0), 1)
  const red = Math.round(255 * norm)
  const green = Math.round(255 * (1 - norm))
  return `rgb(${red},${green},0)`
}

const leftColor = computed(() => {
  const ratio = displayLeft.value / props.referenceValue
  const dB = 20 * Math.log10(ratio || 1e-6)
  return interpolateColor(dB)
})

const rightColor = computed(() => {
  const ratio = displayRight.value / props.referenceValue
  const dB = 20 * Math.log10(ratio || 1e-6)
  return interpolateColor(dB)
})

const scaleLabels = computed(() => {
  const labels = []
  for (let i = 0; i < props.ticks; i++) {
    const ratio = 1 - i / (props.ticks - 1)
    if (!props.logarithmic) {
      const value = Math.round(ratio * maxMidi)
      labels.push(`${value}`)
    } else {
      const linearValue = 1 + ratio * (maxMidi - 1)
      const dB = 20 * Math.log10(linearValue / props.referenceValue)
      labels.push(dB >= 0 ? `+${dB.toFixed(0)}` : `${dB.toFixed(0)}`)
    }
  }
  return labels
})

</script>

<style scoped>
/* ✅ Conteneur principal avec dimensions fixes */
.vu-meter-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 40px; /* Augmenté pour inclure les graduations */
  height: auto; /* Hauteur automatique pour inclure les labels */
  position: relative;
  flex-shrink: 0; /* Empêche la compression */
}

/* ✅ Conteneur principal du VuMeter */
.vu-meter {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  height: 120px; /* Hauteur exacte du slider */
  width: 100%;
  position: relative;
}

/* ✅ Graduations (gauche ou droite) */
.scale {
  position: relative;
  width: 25px; /* Largeur pour les graduations */
  height: 100%;
  font-size: 8px;
  color: var(--track-details, #999);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* ✅ Ticks des graduations */
.tick {
  position: absolute;
  transform: translateY(50%);
  white-space: nowrap;
  text-align: left;
}

/* ✅ Conteneur des barres L/R */
.bar-pair {
  display: flex;
  flex-direction: row;
  gap: 1px;
  height: 100%;
  flex-shrink: 0;
}

/* ✅ Barres individuelles */
.bar {
  position: relative;
  width: 6px; /* Légèrement plus large */
  height: 100%;
  background: var(--lane-bg, #222);
  border: 1px solid var(--border-color, #444);
  border-radius: 1px;
  overflow: hidden;
}

/* ✅ Remplissage des barres */
.fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  transition: height 0.05s ease-out;
  border-radius: 1px 1px 0 0;
}

/* ✅ Pics de niveau */
.peak {
  position: absolute;
  left: 0;
  width: 100%;
  height: 2px;
  background: #00ffff;
  opacity: 0.9;
  border-radius: 1px;
  box-shadow: 0 0 2px #00ffff;
}

/* ✅ Labels L/R en dessous des barres */
.labels {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: 9px;
  color: var(--track-details, #888);
  margin-top: 6px; /* Espacement depuis les barres */
  height: 16px;
  align-items: center;
  width: 14px; /* Largeur correspondant aux barres */
}

/* ✅ Responsive pour les petites tailles */
@media (max-width: 768px) {
  .vu-meter-wrapper {
    width: 50px;
  }
  
  .scale {
    width: 20px;
    font-size: 7px;
  }
  
  .bar {
    width: 5px;
  }
}
</style>