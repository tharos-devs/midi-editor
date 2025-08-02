<template>
  <div 
    class="selection-rectangle"
  />
</template>

<script setup>
</script>

<style scoped>
.selection-rectangle {
  position: absolute;
  border: 2px dashed rgba(0, 120, 215, 0.8); /* Bleu Windows-style */
  background-color: rgba(0, 120, 215, 0.1); /* Fond léger bleu translucide */
  pointer-events: none;
  z-index: 9999;
  box-sizing: border-box;
  min-width: 5px;
  min-height: 5px;
  border-radius: 2px; /* Coins très légèrement arrondis */
}
</style>