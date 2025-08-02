<template>
  <div class="velocity-display-area">
    <!-- Lignes horizontales de l'échelle de vélocité -->
    <VelocityScaleLines 
      :lane-height="laneHeight"
      :usable-height="usableHeight"
    />

    <!-- Barres de vélocité -->
    <VelocityBar
      v-for="note in visibleNotes"
      :key="`velocity-bar-${note.id}`"
      :note="note"
      :lane-height="laneHeight"
      :usable-height="usableHeight"
      :velocity-bar-width="velocityBarWidth"
      :is-selected="selectedItems.includes(note.id)"
      :is-single-selected="selectedItems.includes(note.id) && selectedItems.length === 1"
      :is-in-selection="previewSelectedItems.includes(note.id)"
      :is-brushed="isCommandPressed && brushedItem && brushedItem.id === note.id"
      :is-dragging="isDragging && currentItem && currentItem.id === note.id"
      @mousedown="(e) => $emit('velocity-bar-mousedown', e, note)"
      @click="(e) => $emit('velocity-bar-click', e, note)"
    />
  </div>
</template>

<script setup>
import VelocityScaleLines from './VelocityScaleLines.vue'
import VelocityBar from './VelocityBar.vue'

defineProps({
  laneHeight: {
    type: Number,
    required: true
  },
  usableHeight: {
    type: Number,
    required: true
  },
  visibleNotes: {
    type: Array,
    required: true
  },
  selectedItems: {
    type: Array,
    required: true
  },
  previewSelectedItems: {
    type: Array,
    required: true
  },
  isCommandPressed: {
    type: Boolean,
    default: false
  },
  brushedItem: {
    type: Object,
    default: null
  },
  isDragging: {
    type: Boolean,
    default: false
  },
  currentItem: {
    type: Object,
    default: null
  },
  velocityBarWidth: {
    type: Number,
    required: true
  }
})

defineEmits(['velocity-bar-mousedown', 'velocity-bar-click'])
</script>

<style scoped>
.velocity-display-area {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>