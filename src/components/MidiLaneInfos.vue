<template>
  <div class="midi-lane-infos">
    <!-- Composant spécialisé pour les lanes de vélocité -->
    <VelocityInfo v-if="isVelocityLane" />

    <!-- Composant spécialisé pour les MIDI CC (à venir) -->
    <!-- <MidiCCInfo v-else-if="isMidiCCLane" /> -->

    <!-- Informations statiques de la lane si aucun composant spécialisé -->
    <div v-else-if="selectedLane" class="lane-info">
      <div class="lane-name">{{ selectedLane.label }}</div>
      <div v-if="selectedLane.description" class="lane-description">
        {{ selectedLane.description }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import VelocityInfo from '@/components/lanes/velocity/VelocityInfos.vue'
// import MidiCCInfo from './MidiCCInfo.vue' // à venir

const props = defineProps({
  selectedLane: {
    type: Object,
    default: null
  }
})

// Computed pour détecter le type de lane
const isVelocityLane = computed(() => {
  return props.selectedLane && 
         (props.selectedLane.type === 'velocity' || 
          props.selectedLane.label?.toLowerCase().includes('velocity') ||
          props.selectedLane.label?.toLowerCase().includes('velocité'))
})

const isMidiCCLane = computed(() => {
  return props.selectedLane && 
         (props.selectedLane.type === 'cc' || 
          props.selectedLane.type === 'midi-cc' ||
          props.selectedLane.label?.toLowerCase().includes('cc'))
})
</script>

<style scoped>
.midi-lane-infos {
  height: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: var(--midi-lane-infos-bg, #f0f0f0);
}

/* Informations statiques de la lane */
.lane-info {
  text-align: center;
  color: var(--midi-lane-info-fg, #666);
}

.lane-name {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.lane-description {
  font-size: 9px;
  opacity: 0.7;
  line-height: 1.2;
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  .midi-lane-infos {
    --midi-lane-infos-bg: #2a2a2a;
    --midi-lane-info-fg: #ccc;
  }
}
</style>