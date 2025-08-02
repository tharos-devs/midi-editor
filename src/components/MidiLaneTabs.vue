<template>
  <el-tabs v-model="activeTab" type="border-card" @tab-click="handleTabClick">
    <el-tab-pane
      v-for="lane in availableLanes"
      :key="lane.id"
      :label="lane.label"
      :name="lane.id"
    >
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref, onMounted, shallowRef } from 'vue'
import { ElTabs, ElTabPane } from 'element-plus'
import VelocityLane from './lanes/velocity/VelocityLane.vue'
// import CCLane from './lanes/cc/CCLane.vue'

const emit = defineEmits(['tab-selected'])

const availableLanes = ref([
  {
    id: 'velocity',
    label: 'Velocity',
    component: shallowRef(VelocityLane),
    props: {}
  },
  /*
  {
    id: 'cc1',
    label: 'CC1 (Mod)',
    component: CCLane,
    props: { ccNumber: 1, ccName: 'Modulation' }
  },
  {
    id: 'cc7',
    label: 'CC7 (Vol)',
    component: CCLane,
    props: { ccNumber: 7, ccName: 'Volume' }
  }
  */
])

const activeTab = ref('velocity') // Utiliser l'ID au lieu d'un index

function handleTabClick(tab) {
  const selectedLane = availableLanes.value.find(lane => lane.id === tab.paneName)
  if (selectedLane) {
    emit('tab-selected', selectedLane)
  }
}

// Sélectionner la première lane par défaut au montage
onMounted(() => {
  if (availableLanes.value.length > 0) {
    emit('tab-selected', availableLanes.value[0])
  }
})
</script>
