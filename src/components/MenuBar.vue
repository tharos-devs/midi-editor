<template>
  <div class="menu-bar">
    <!-- Menu Fichier avec dropdown natif -->
    <div class="dropdown" @click="toggleDropdown" v-click-outside="closeDropdown">
      <button class="dropdown-button" :class="{ active: isDropdownOpen }">
        Fichier
        <span class="arrow" :class="{ open: isDropdownOpen }">▼</span>
      </button>
      
      <div class="dropdown-menu" v-show="isDropdownOpen">
        <button 
          class="dropdown-item" 
          @click="executeAction(handleNewProject)" 
          :disabled="!menuState.canNew"
        >
          Nouveau
        </button>
        <button 
          class="dropdown-item" 
          @click="executeAction(handleOpenProject)" 
          :disabled="!menuState.canOpen"
        >
          Ouvrir
        </button>
        <button 
          class="dropdown-item" 
          @click="executeAction(handleSaveProject)" 
          :disabled="!menuState.canSave"
        >
          Sauvegarder
        </button>
        <button 
          class="dropdown-item" 
          @click="executeAction(handleSaveAsProject)" 
          :disabled="!menuState.canSaveAs"
        >
          Sauvegarder sous...
        </button>
        <hr class="dropdown-divider">
        <button 
          class="dropdown-item" 
          @click="executeAction(handleImportMidi)" 
          :disabled="!menuState.canImportMidi"
        >
          Importer MIDI
        </button>
        <button 
          class="dropdown-item" 
          @click="executeAction(handleExportMidi)" 
          :disabled="!menuState.canExportMidi"
        >
          Exporter MIDI
        </button>
      </div>
    </div>

    <!-- Statut projet -->
    <div class="status-indicator">
      <span v-if="statusInfo.isLoaded" class="project-name">
        {{ statusInfo.projectName }}
      </span>
      <span v-if="statusInfo.operationInProgress" class="operation-status">
        {{ statusInfo.operationStatus }} ({{ statusInfo.operationProgress }}%)
      </span>
    </div>

    <!-- Barre de progression -->
    <div v-if="statusInfo.operationInProgress" class="progress-bar">
      <div class="progress-fill" :style="{ width: `${statusInfo.operationProgress}%` }"></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useProjectManager } from '@/composables/useProjectManager'

const {
  handleNewProject,
  handleOpenProject,
  handleSaveProject,
  handleSaveAsProject,
  handleImportMidi,
  handleExportMidi,
  menuState,
  statusInfo
} = useProjectManager()

const isDropdownOpen = ref(false)

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

const closeDropdown = () => {
  isDropdownOpen.value = false
}

const executeAction = (action) => {
  closeDropdown()
  action()
}

// Directive pour fermer le dropdown en cliquant ailleurs
const vClickOutside = {
  beforeMount(el, binding) {
    el.clickOutsideEvent = function(event) {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el) {
    document.removeEventListener('click', el.clickOutsideEvent)
  }
}
</script>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  background: var(--bg-secondary, #f8f9fa);
  min-height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color, #e9ecef);
  position: relative;
}

.dropdown {
  position: relative;
  margin-right: 16px;
}

.dropdown-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 8px 12px;
  color: var(--text-primary, #333);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.dropdown-button:hover,
.dropdown-button.active {
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.05));
}

.arrow {
  font-size: 10px;
  transition: transform 0.2s;
}

.arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  background: white;
  border: 1px solid var(--border-color, #e9ecef);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 180px;
  z-index: 1000;
  padding: 4px 0;
}

.dropdown-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  padding: 8px 16px;
  text-align: left;
  color: var(--text-primary, #333);
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.dropdown-item:hover:not(:disabled) {
  background-color: var(--bg-hover, #f8f9fa);
}

.dropdown-item:disabled {
  color: var(--text-disabled, #999);
  cursor: not-allowed;
}

.dropdown-divider {
  margin: 4px 0;
  border: none;
  border-top: 1px solid var(--border-color, #e9ecef);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.project-name {
  font-weight: 600;
  color: var(--text-primary, #333);
  font-size: 14px;
}

.operation-status {
  font-size: 13px;
  color: var(--text-secondary, #666);
  font-style: italic;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--bg-secondary, #f8f9fa);
}

.progress-fill {
  height: 100%;
  background: var(--primary, #007bff);
  transition: width 0.3s ease;
}

/* Variables CSS par défaut si non définies */
:root {
  --bg-secondary: #f8f9fa;
  --bg-hover: rgba(0, 0, 0, 0.05);
  --text-primary: #333;
  --text-secondary: #666;
  --text-disabled: #999;
  --border-color: #e9ecef;
  --primary: #007bff;
}
</style>