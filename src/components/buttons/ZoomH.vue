<template>
  <div ref="buttonWrapper" class="relative h-full flex items-center slider">
    <!-- Slider au-dessus du bouton -->
    <transition name="fade">
      <div
        v-if="showSlider"
        class="slider-popup z-50"
        :style="popupStyle"
        ref="sliderPopup"
      >
        <div class="slider-wrapper">
          <!-- Infobulle affichée pendant le déplacement -->
          <div
            v-if="showTooltip"
            class="zoom-tooltip"
            :style="{ left: `${tooltipOffset}px` }"
          >
            {{ sliderValue }}%
          </div>

          <!-- Slider horizontal -->
          <el-slider
            ref="sliderRef"
            v-model="sliderValue"
            :min="0"
            :max="100"
            :show-tooltip="false"
            style="width: 100px"
            @input="onSliderInput"
            @change="onSliderRelease"
          />
        </div>
      </div>
    </transition>

    <!-- Bouton carré -->
    <el-button
      :icon="DCaret"
      size="small"
      @click="toggleSlider"
      class="zoom-btn large-icon"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, nextTick } from 'vue'
import { DCaret } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()

const showSlider = ref(false)
const showTooltip = ref(false)
const sliderValue = ref(50)
const previousValue = ref(50)
const tooltipOffset = ref(0)

const buttonWrapper = ref(null)
const sliderPopup = ref(null)
const sliderRef = ref(null)

const popupStyle = reactive({
  position: 'fixed',
  left: '0px',
  bottom: '0px'
})

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
    // Positionner horizontalement au-dessus du bouton, centré
    popupStyle.left = `${rect.left + rect.width / 2 - 50}px`
    popupStyle.bottom = `${window.innerHeight - rect.top + 8}px`
  }
}

const onSliderInput = (val) => {
  showTooltip.value = true
  updateTooltipOffset(val)

  if (val > previousValue.value) {
    uiStore.zoomIn('horizontal')
  } else if (val < previousValue.value) {
    uiStore.zoomOut('horizontal')
  }
  previousValue.value = val
}

const onSliderRelease = () => {
  showTooltip.value = false
}

const updateTooltipOffset = (val) => {
  // Calcul approximatif de la position horizontale du curseur
  const percent = (val - 0) / (100 - 0)
  tooltipOffset.value = percent * 100 - 15
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
</script>

<style scoped>
.slider {
  z-index: 100;
  margin: 0 2px 0 2px;
}
.zoom-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  transform: rotate(90deg);
  font-size: 20px;
}

.slider-popup {
  background-color: #ffffff;
  opacity: 1;
  padding: 6px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.slider-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.zoom-tooltip {
  position: absolute;
  top: -28px;
  background-color: #333;
  color: #fff;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 4px;
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.large-icon :deep(.el-icon) {
  font-size: 20px;
}
</style>
