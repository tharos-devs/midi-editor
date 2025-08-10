<template>
  <div class="signature-controls">
    <el-button 
      type="default"
      size="large"
      @click="addTimeSignature"      
      :link="true"
      :icon="Plus"
    >
    </el-button>
    <el-button 
      type="default"
      size="large"
      @click="removeTimeSignature"                        
      :link="true"
      :icon="Minus"
      :disabled="!selectedSignature"
    >
    </el-button>
  </div>
</template>

<script setup>
import { Plus, Minus } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { usePlaybackCursorStore } from '@/stores/playbackCursor'

// Props du composant parent
const props = defineProps({
  selectedSignature: { type: Object, default: null }
})

// Émissions vers le parent
const emit = defineEmits(['signature-deselected'])

// Stores et composables
const midiStore = useMidiStore()
const timeSignatureComposable = useTimeSignature()
const playbackCursorStore = usePlaybackCursorStore()

// Ajouter une nouvelle signature à la position du curseur
const addTimeSignature = () => {
  const cursorTime = playbackCursorStore.currentTime
  console.log('➕ Ajout signature à la position:', cursorTime)
  
  // Convertir le temps du curseur en pixels puis trouver la mesure
  const cursorPixel = timeSignatureComposable.timeToPixelsWithSignatures(cursorTime)
  const measureInfo = timeSignatureComposable.pixelsToMeasure(cursorPixel)
  
  if (!measureInfo) {
    console.warn('❌ Impossible de trouver la mesure pour le temps:', cursorTime)
    return
  }
  
  // Trouver les données complètes de la mesure
  const measures = timeSignatureComposable.measuresWithSignatures.value
  const targetMeasure = measures.find(m => m.number === measureInfo.measure)
  
  if (!targetMeasure) {
    console.warn('❌ Impossible de trouver les données de la mesure:', measureInfo.measure)
    return
  }
  
  // Ajouter une signature 4/4 par défaut à la mesure suivante
  const nextMeasureNumber = targetMeasure.number + 1
  const nextMeasure = measures.find(m => m.number === nextMeasureNumber)
  const newSignatureTime = nextMeasure ? nextMeasure.startTime : (targetMeasure.endTime || (targetMeasure.startTime + targetMeasure.duration))
  
  const newSignature = {
    measure: nextMeasureNumber,
    numerator: 4,
    denominator: 4,
    time: newSignatureTime
  }
  
  console.log('🎵 Nouvelle signature à ajouter:', newSignature)
  
  // Ajouter via le store MIDI
  if (midiStore.addTimeSignature) {
    const signatureId = midiStore.addTimeSignature(newSignature)
    console.log('✅ Signature ajoutée avec ID:', signatureId)
  } else {
    console.warn('⚠️ Méthode addTimeSignature non disponible dans midiStore')
  }
}

// Supprimer la signature sélectionnée
const removeTimeSignature = () => {
  if (!props.selectedSignature) {
    console.warn('❌ Aucune signature sélectionnée à supprimer')
    return
  }
  
  // Ne pas permettre la suppression de la première signature (mesure 1)
  if (props.selectedSignature.number === 1) {
    console.warn('❌ Impossible de supprimer la signature de la première mesure')
    return
  }
  
  console.log('🗑️ Suppression signature:', props.selectedSignature)
  
  // Trouver l'événement de signature correspondant dans le store
  const signatureEvent = midiStore.timeSignatureEvents.find(event => 
    event.measure === props.selectedSignature.number || 
    (event.time >= props.selectedSignature.startTime && event.time <= props.selectedSignature.endTime)
  )
  
  console.log('🔍 Debug suppression:', {
    selectedSignature: props.selectedSignature,
    signatureEvent,
    hasRemoveMethod: typeof midiStore.removeTimeSignature === 'function',
    allSignatureEvents: midiStore.timeSignatureEvents
  })
  
  if (!signatureEvent) {
    console.warn('⚠️ Événement de signature non trouvé pour:', props.selectedSignature)
    return
  }
  
  if (typeof midiStore.removeTimeSignature !== 'function') {
    console.warn('⚠️ Méthode removeTimeSignature non disponible dans midiStore')
    return
  }
  
  midiStore.removeTimeSignature(signatureEvent.id)
  emit('signature-deselected')
  console.log('✅ Signature supprimée')
}

// Exposer les méthodes pour qu'elles soient accessibles depuis le parent
defineExpose({
  removeTimeSignature
})
</script>

<style scoped>
.signature-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>