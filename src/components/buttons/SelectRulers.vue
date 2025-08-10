<template>
  <div class="selectrulers-container" :style="{ marginTop: '10px', marginLeft: Number(uiStore.pianoKeysWidth - 35) + 'px' }">
    <el-dropdown trigger="click" @command="handleSelectCommand">
      <el-icon size="large" class="icon-ruler"><List /></el-icon>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item 
            v-for="opt in options" 
            :key="opt.value"
            :command="opt.value"
          >
            <div class="dropdown-item-with-check">
              <div class="check-column">
                <el-icon 
                  v-if="selectedOptions.includes(opt.value)" 
                  size="large"
                  class="icon-check"
                >
                  <Check />
                </el-icon>
              </div>
              <div class="icon-column">
                <el-icon v-if="opt.icon" size="large">
                  <component :is="opt.icon" />
                </el-icon>
              </div>
              <div class="label-column">{{ opt.label }}</div>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { List, Check, Refrigerator, LocationInformation } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'

const uiStore = useUIStore()
const projectStore = useProjectStore()

function handleSelectCommand(val) {
  console.log('🎯 SelectRulers: Clic sur', val)
  console.log('🎯 projectStore disponible:', !!projectStore)
  console.log('🎯 État avant:', {
    showSignature: projectStore.showSignatureRuler,
    showMarker: projectStore.showMarkerRuler
  })
  
  if (val === 'signatures') {
    console.log('🎼 Toggle Signature Ruler')
    projectStore.toggleSignatureRuler()
  } else if (val === 'marker') {
    console.log('📍 Toggle Marker Ruler')
    projectStore.toggleMarkerRuler()
  }
  
  console.log('🎯 État après:', {
    showSignature: projectStore.showSignatureRuler,
    showMarker: projectStore.showMarkerRuler
  })
}

// Computed pour les options sélectionnées basé sur le store
const selectedOptions = computed(() => {
  const selected = []
  const showSig = projectStore.showSignatureRuler
  const showMark = projectStore.showMarkerRuler
  
  console.log('🔍 SelectRulers computed:', { showSig, showMark })
  
  if (showSig) {
    selected.push('signatures')
  }
  if (showMark) {
    selected.push('marker')
  }
  
  console.log('🔍 Selected options:', selected)
  return selected
})

const options = [
  {
    value: 'marker',
    label: 'Marker',
    icon: LocationInformation
  },  
  {
    value: 'signatures',
    label: 'Signature',
    icon: Refrigerator
  }
]

onMounted(() => {
  console.log('🚀 SelectRulers monté')
  console.log('🚀 projectStore:', projectStore)
  console.log('🚀 showSignatureRuler exists:', 'showSignatureRuler' in projectStore)
  console.log('🚀 toggleSignatureRuler exists:', 'toggleSignatureRuler' in projectStore)
  console.log('🚀 Valeurs initiales:', {
    showSignature: projectStore.showSignatureRuler,
    showMarker: projectStore.showMarkerRuler
  })
})
</script>

<style scoped>

.dropdown-item-with-check {
  display: grid;
  grid-template-columns: 25px 20px 1fr;
  align-items: left;
  width: 100%;
}
.icon-ruler {
  margin: 3px;
}
.icon-ruler:hover {
  opacity: 0.7;
}
.label-column {
  margin-left: 3px;
}
</style>