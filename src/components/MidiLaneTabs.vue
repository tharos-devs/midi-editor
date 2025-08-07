<template>
  <div class="midi-lane-tabs-container">
    <!-- Composant dédié pour ajouter des CC à gauche -->
    <AddCCLane 
      :visible-cc-lanes="visibleCCNumbers"
      @add-cc-lane="handleAddCCLane" 
    />
    
    <el-tabs 
      v-model="activeTab" 
      type="border-card" 
      @tab-click="handleTabClick"
      class="tabs-main"
    >
      <el-tab-pane
        v-for="lane in availableLanes"
        :key="lane.id"
        :label="lane.label"
        :name="lane.id"
      >
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted, shallowRef, computed, watch } from 'vue'
import { ElTabs, ElTabPane } from 'element-plus'
import TempoLane from './lanes/tempo/TempoLane.vue'
import VelocityLane from './lanes/velocity/VelocityLane.vue'
import CCLane from './lanes/cc/CCLane.vue'
import AddCCLane from '@/components/buttons/AddCCLane.vue'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'

const emit = defineEmits(['tab-selected', 'lanes-updated'])
const midiStore = useMidiStore()
const timeSignatureComposable = useTimeSignature()

// Noms communs des contrôleurs MIDI
const ccNames = {
  1: 'Modulation',
  2: 'Breath Controller', 
  4: 'Foot Controller',
  5: 'Portamento Time',
  7: 'Volume',
  8: 'Balance',
  10: 'Pan',
  11: 'Expression',
  12: 'Effect Control 1',
  13: 'Effect Control 2',
  64: 'Sustain Pedal',
  65: 'Portamento',
  66: 'Sostenuto',
  67: 'Soft Pedal',
  68: 'Legato',
  69: 'Hold 2',
  71: 'Resonance',
  72: 'Release Time',
  73: 'Attack Time',
  74: 'Brightness',
  91: 'Reverb Level',
  92: 'Tremolo Level',
  93: 'Chorus Level',
  94: 'Celeste Level',
  95: 'Phaser Level'
}


// CC lanes actuellement visibles
const visibleCCNumbers = computed(() => {
  return availableLanes.value
    .filter(lane => lane.id && lane.id.startsWith('cc'))
    .map(lane => lane.props?.ccNumber)
    .filter(ccNumber => ccNumber !== undefined)
})


// Calculer les lanes disponibles dynamiquement
const availableLanes = computed(() => {

  // Forcer la réactivité en surveillant les changements
  const currentTrack = midiStore.selectedTrack
  const lanes = [
    {
      id: 'tempo',
      label: 'Tempo',
      component: shallowRef(TempoLane),
      props: {
        measureToPixels: (measure) => measure * 120, // TODO: utiliser la vraie fonction
        // Wrapper fonctions simples pour éviter les problèmes de réactivité
        timeToPixelsWithSignatures: (time) => timeSignatureComposable.timeToPixelsWithSignatures(time),
        pixelsToTimeWithSignatures: (pixels) => timeSignatureComposable.pixelsToTimeWithSignatures(pixels)
      }
    },
    {
      id: 'velocity',
      label: 'Velocity',
      component: shallowRef(VelocityLane),
      props: {}
    }
  ]
  
  // Ajouter les lanes CC basées sur les données présentes
  const availableCC = getAvailableCC(currentTrack) // Passer la piste en paramètre

  availableCC.forEach((ccNumber) => {
    // Forcer la conversion en nombre pour éviter les problèmes de réactivité
    const ccNum = typeof ccNumber === 'number' ? ccNumber : parseInt(ccNumber) || parseInt(ccNumber[0]) || 1
    const ccName = ccNames[ccNum] || `CC${ccNum}`
    const laneProps = { 
      ccNumber: ccNum, 
      ccName,
      measureToPixels: (measure) => measure * 120, // TODO: utiliser la vraie fonction
      // Wrapper fonctions simples pour éviter les problèmes de réactivité
      timeToPixelsWithSignatures: (time) => timeSignatureComposable.timeToPixelsWithSignatures(time),
      pixelsToTimeWithSignatures: (pixels) => timeSignatureComposable.pixelsToTimeWithSignatures(pixels)
    }
    lanes.push({
      id: `cc${ccNum}`,
      label: `CC${ccNum} (${ccName})`,
      component: shallowRef(CCLane),
      props: laneProps
    })
  })

  // Émettre la liste des lanes vers le parent
  emit('lanes-updated', lanes)
  
  return lanes
})

// Fonction pour détecter les CC présents dans la piste sélectionnée
function getAvailableCC(selectedTrack = null) {
  // Utiliser le paramètre ou la valeur du store
  const trackToUse = selectedTrack !== null ? selectedTrack : midiStore.selectedTrack
  
  if (trackToUse === null || trackToUse === undefined) {
    return []
  }

  
  // CORRECTION: Convertir les types pour la comparaison
  const selectedTrackId = parseInt(trackToUse)

  // Récupérer tous les CC de la piste sélectionnée
  const trackCC = midiStore.midiCC.filter(cc => {
    const ccTrackId = parseInt(cc.trackId)
    return ccTrackId === selectedTrackId
  })
  
  // Extraire les numéros de CC uniques
  const ccNumbers = [...new Set(trackCC.map(cc => {
    const controller = cc.controller || cc.number
    return controller
  }))]

  return ccNumbers.sort((a, b) => a - b)
}

const activeTab = ref('tempo') // Utiliser l'ID au lieu d'un index - démarrer sur Tempo

function handleTabClick(tab) {
  const selectedLane = availableLanes.value.find(lane => lane.id === tab.paneName)
  if (selectedLane) {
    emit('tab-selected', selectedLane)
  }
}

// Gérer l'ajout depuis le composant AddCCLane
function handleAddCCLane(ccNumber) {
  console.log('🎛️ MidiLaneTabs: handleAddCCLane appelé avec:', ccNumber)
  console.log('🎛️ MidiLaneTabs: selectedTrack:', midiStore.selectedTrack)
  addCCLane(ccNumber)
}

// Fonction pour sélectionner l'onglet tempo par défaut
function selectTempoTab() {
  const tempoLane = availableLanes.value.find(lane => lane.id === 'tempo')
  if (tempoLane) {
    activeTab.value = 'tempo'
    emit('tab-selected', tempoLane)
    return true
  } else {
    console.warn('⚠️ Lane tempo non trouvée')
    return false
  }
}

// Fonction pour sélectionner l'onglet vélocité par défaut
function selectVelocityTab() {
  const velocityLane = availableLanes.value.find(lane => lane.id === 'velocity')
  if (velocityLane) {
    activeTab.value = 'velocity'
    emit('tab-selected', velocityLane)
    return true
  } else {
    console.warn('⚠️ Lane vélocité non trouvée')
    return false
  }
}

// Sélectionner l'onglet tempo par défaut au montage
onMounted(() => {
  // Toujours essayer de sélectionner l'onglet tempo en premier
  if (!selectTempoTab() && availableLanes.value.length > 0) {
    // Si pas de tempo (cas étrange), prendre le premier disponible
    emit('tab-selected', availableLanes.value[0])
  }
  
})

watch(() => midiStore.isLoaded, (newLoaded, oldLoaded) => {
  if (newLoaded && !oldLoaded) {
    // Attendre que les lanes soient recalculées puis sélectionner tempo
    setTimeout(() => {
      selectTempoTab()
    }, 100)
  }
})


// Fonction pour ajouter un nouveau lane CC
function addCCLane(ccNumber) {
  console.log('🎛️ addCCLane: début avec ccNumber:', ccNumber)
  console.log('🎛️ addCCLane: midiStore.selectedTrack:', midiStore.selectedTrack)
  
  if (midiStore.selectedTrack === null || midiStore.selectedTrack === undefined) {
    console.warn('⚠️ Aucune piste sélectionnée pour ajouter CC lane')
    return false
  }
  
  // Vérifier si le CC lane existe déjà
  const existingLane = availableLanes.value.find(lane => lane.id === `cc${ccNumber}`)
  if (existingLane) {
    // Le lane existe déjà, le sélectionner
    activeTab.value = `cc${ccNumber}`
    emit('tab-selected', existingLane)
    return true
  }
  
  // Créer un point CC initial pour que le lane apparaisse
  const selectedTrack = midiStore.getTrackById(midiStore.selectedTrack)
  // Forcer la conversion du ccNumber en nombre pour le store
  const ccNum = typeof ccNumber === 'number' ? ccNumber : 
                Array.isArray(ccNumber) ? parseInt(ccNumber[0]) : 
                parseInt(ccNumber) || 1
  
  console.log('🎛️ Création point CC initial:', {
    trackId: midiStore.selectedTrack,
    controller: ccNum,
    time: 0.0,
    value: 64,
    channel: selectedTrack?.channel || 0
  })
  
  const createdCCId = midiStore.addCC({
    trackId: midiStore.selectedTrack,
    controller: ccNum,
    time: 0.0, // Point initial à t=0
    value: 64,  // Valeur moyenne
    channel: selectedTrack?.channel || 0
  })
  
  console.log('🎛️ CC créé avec ID:', createdCCId)
  
  // Attendre le prochain tick pour que la réactivité se propage
  setTimeout(() => {
    // Le lane devrait maintenant être disponible
    const newLane = availableLanes.value.find(lane => lane.id === `cc${ccNum}`)
    if (newLane) {
      activeTab.value = `cc${ccNum}`
      emit('tab-selected', newLane)
    } else {
    }
  }, 50)
  
  return true
}

// Exposer les fonctions pour l'usage depuis le parent
defineExpose({
  addCCLane
})
</script>

<style scoped>
.midi-lane-tabs-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.tabs-main {
  flex: 1;
  min-width: 0; /* Important pour éviter les problèmes de flexbox avec le scroll */
}

/* Supprimer le padding par défaut d'Element Plus qui fait déborder les onglets */
:deep(.el-tabs--border-card > .el-tabs__content) {
  padding: 0;
}

</style>
