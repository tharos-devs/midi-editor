<template>
  <el-slider
    v-bind="$attrs"
    v-on="$listeners"
    class="custom-slider"
    vertical
  />
</template>

<script>
export default {
  name: 'CustomSlider',
  inheritAttrs: false
}
</script>

<style scoped>.custom-slider {
  height: 200px;
  width: 40px;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Slider track */
:deep(.el-slider__runway) {
  width: 4px;
  background-color: transparent;
  margin: 0 auto;
}

/* Active bar (filled part) */
:deep(.el-slider__bar) {
  background-color: transparent;
}

/* Thumb / Handle */
:deep(.el-slider__button) {
  width: 40px;
  height: 40px;
  background: white;
  border: none;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  margin-left: -18px;
}

/* Two gray lines inside the thumb */
:deep(.el-slider__button)::after {
  content: '';
  display: block;
  width: 20px;
  height: 2px;
  background-color: #ccc;
  margin: 8px auto 0;
  box-shadow: 0 6px 0 0 #ccc;
}
</style>
