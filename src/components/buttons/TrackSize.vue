<template>
  <div ref="buttonWrapper" class="relative h-full flex items-center track-size">
    <!-- Slider affiché au-dessus du bouton -->
    <transition name="fade">
      <div
        v-if="showSlider"
        class="slider-popup z-50"
        :style="popupStyle"
        ref="sliderPopup"
      >
        <div class="slider-wrapper">
          <!-- Info-bulle dynamique -->
          <div
            v-if="showTooltip"
            class="size-tooltip"
            :style="{ marginBottom: `${tooltipOffset}px` }"
          >
            {{ getSizeLabel(sliderValue) }}
          </div>

          <!-- Slider vertical -->
          <el-slider
            ref="sliderRef"
            v-model="sliderValue"
            vertical
            :min="0"
            :max="100"
            :show-tooltip="false"
            style="height: 120px"
            @input="onSliderInput"
            @change="onSliderRelease"
          />
        </div>
      </div>
    </transition>

    <!-- Bouton avec icône de redimensionnement -->
    <el-button
      :icon="List"
      size="small"
      @click="toggleSlider"
      class="size-btn"
      title="Ajuster la hauteur des pistes"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, nextTick, computed, watchEffect } from 'vue'
import { List } from '@element-plus/icons-vue'

// Props
const props = defineProps({
  modelValue: {
    type: Number,
    default: 50
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'size-changed'])

const showSlider = ref(false)
const showTooltip = ref(false)
const sliderValue = ref(props.modelValue)
const previousValue = ref(props.modelValue)
const tooltipOffset = ref(0)

const buttonWrapper = ref(null)
const sliderPopup = ref(null)
const sliderRef = ref(null)

const popupStyle = reactive({
  position: 'fixed',
  left: '0px',
  bottom: '0px'
})

// Computed pour obtenir le label de taille
const getSizeLabel = (value) => {
  if (value <= 20) return 'Très petit'
  if (value <= 40) return 'Petit'
  if (value <= 60) return 'Moyen'
  if (value <= 80) return 'Grand'
  return 'Très grand'
}

const toggleSlider = () => {
  showSlider.value = !showSlider.value
  if (showSlider.value) {
    updatePopupPosition()
    nextTick(() => {
      document.addEventListener('mousedown', onClickOutside)
    })
  } else {
    document.removeEventListener('mousedown', onClickOutside)
  }
}

const updatePopupPosition = () => {
  const rect = buttonWrapper.value?.getBoundingClientRect()
  if (rect) {
    popupStyle.left = `${rect.left + rect.width / 2 - 20}px`
    popupStyle.bottom = `${window.innerHeight - rect.top + 8}px`
  }
}

const onSliderInput = (val) => {
  showTooltip.value = true
  updateTooltipOffset(val)
  
  // Émettre les changements
  emit('update:modelValue', val)
  emit('size-changed', {
    value: val,
    size: getSizeLabel(val),
    heightPx: getHeightFromValue(val)
  })
  
  previousValue.value = val
}

const onSliderRelease = () => {
  showTooltip.value = false
}

const updateTooltipOffset = (val) => {
  // Calcul de la position verticale du curseur
  const percent = (val - 0) / (100 - 0)
  tooltipOffset.value = percent * 120 - 10
}

// Convertir la valeur du slider en hauteur en pixels
const getHeightFromValue = (value) => {
  // Plage de 40px à 120px
  const minHeight = 10
  const maxHeight = 120
  return Math.round(minHeight + (value / 100) * (maxHeight - minHeight))
}

const onClickOutside = (event) => {
  const btn = buttonWrapper.value
  const popup = sliderPopup.value

  if (!btn?.contains(event.target) && !popup?.contains(event.target)) {
    showSlider.value = false
    document.removeEventListener('mousedown', onClickOutside)
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})

// Synchroniser avec le modelValue externe
const syncWithProp = () => {
  if (props.modelValue !== sliderValue.value) {
    sliderValue.value = props.modelValue
  }
}

// Watcher pour les changements de props
watchEffect(() => {
  syncWithProp()
})
</script>

<style scoped>
.track-size {
  z-index: 100;
  margin: 0 2px;
}

.size-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  color: var(--track-instrument);
}

.size-btn:hover {
  border-color: var(--menu-active-fg);
  color: var(--menu-active-fg);
}

.slider-popup {
  background: var(--panel-bg);
  opacity: 1;
  padding: 8px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  width: 35px
}

.slider-wrapper {
  position: relative;
  display: flex;
  align-items: flex-start;
}

.size-tooltip {
  position: absolute;
  left: -50px;
  transform: translateY(-50%);
  background-color: var(--menu-active-fg);
  color: white;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  font-weight: 500;
}

.size-tooltip::after {
  content: '';
  position: absolute;
  right: -5px;
  top: 50%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-left-color: var(--menu-active-fg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Styles personnalisés pour le slider vertical */
:deep(.el-slider.is-vertical) {
  width: 6px;
}

:deep(.el-slider.is-vertical .el-slider__runway) {
  width: 6px;
  background: var(--lane-bg);
}

:deep(.el-slider.is-vertical .el-slider__bar) {
  width: 6px;
  background: var(--menu-active-fg);
}

:deep(.el-slider.is-vertical .el-slider__button) {
  width: 14px;
  height: 14px;
  border: 2px solid var(--menu-active-fg);
  background: white;
}

:deep(.el-slider.is-vertical .el-slider__button:hover) {
  transform: scale(1.2);
}
</style>