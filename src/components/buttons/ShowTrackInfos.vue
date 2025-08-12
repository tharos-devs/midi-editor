<template>
  <el-button
    size="large"
    @click="uiStore.toggleTrackInfo()"
    title="Afficher/Masquer les informations de piste"
  >
   <span style="font-size:20px;">i</span>
  </el-button>
</template>

<script setup>
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
</script>