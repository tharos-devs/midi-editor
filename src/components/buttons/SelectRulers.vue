<template>
  <div class="selectrulers-container">
    <el-dropdown trigger="click" @command="handleSelectCommand">
      <el-button style="height: 40px;">
        <el-icon size="large" ><List /></el-icon>
      </el-button>
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
import { computed } from 'vue'
import { List, Check, Refrigerator, LocationInformation } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'

const uiStore = useUIStore()
const projectStore = useProjectStore()

function handleSelectCommand(val) {
  if (val === 'signatures') {
    projectStore.toggleSignatureRuler()
  } else if (val === 'marker') {
    projectStore.toggleMarkerRuler()
  }
}

// Computed pour les options sélectionnées basé sur le store
const selectedOptions = computed(() => {
  const selected = []
  const showSig = projectStore.showSignatureRuler
  const showMark = projectStore.showMarkerRuler

  if (showSig) {
    selected.push('signatures')
  }
  if (showMark) {
    selected.push('marker')
  }
  
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
</script>

<style scoped>
.dropdown-item-with-check {
  display: grid;
  grid-template-columns: 25px 20px 1fr;
  align-items: left;
  width: 100%;
}
.label-column {
  margin-left: 3px;
}
</style>