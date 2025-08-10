<template>
  <div class="signature-ruler" :style="{ width: totalWidth + 'px' }" @click="handleRulerClick">
    <div class="signature-ruler-content">
      <!-- Utilisation de GridRenderer pour les lignes de mesure et beats -->
      <div class="signature-grid-background">
        <GridRenderer
          :show-measure-lines="true"
          :show-beat-lines="false"
          :show-subdivision-lines="false"
          :show-signature-indicators="false"
          :show-measure-numbers="false"
          :show-beat-labels="false"
          :show-subdivision-labels="false"
          :container-height="20"
          :measure-z-index="2"
          class="grid-overlay"
        >
        <!-- Contenu personnalisé par-dessus la grille -->
        <template #default="{ measures }">
          <!-- Signatures rythmiques et subdivisions personnalisées -->
          <div
            v-for="measure in measures"
            :key="measure.number"
            class="signature-mark"
            :style="{ left: measure.startPixel + 'px' }"
          >
            <!-- Signature rythmique (pour les changements ou la première mesure) -->
            <div 
              v-if="measure.signatureChange || measure.number === 1"
              class="time-signature-container"
              :class="{ 'selected': selectedSignatureFromParent?.number === measure.number }"
              :title="`Signature rythmique: ${measure.timeSignature.numerator}/${measure.timeSignature.denominator}`"
              @click.stop="selectSignature(measure)"
              @dblclick="startEditSignature(measure)"
            >
              <!-- Mode édition inline -->
              <input
                v-if="editingSignature?.number === measure.number"
                v-model="tempSignatureValue"
                @blur="saveSignature(measure)"
                @keyup.enter="saveSignature(measure)"
                @keyup.escape="cancelEdit"
                @keydown="handleSignatureInputKeyDown"
                @keypress="validateSignatureKeypress"
                class="signature-input-field"
                placeholder="4/4"
              />
              <!-- Mode affichage -->
              <span v-else class="time-signature-text">
                {{ measure.timeSignature.numerator }}/{{ measure.timeSignature.denominator }}
              </span>
            </div>
            
            <!-- Lignes de subdivisions (beats) - géré par GridRenderer -->
            <!-- Les beats sont maintenant affichés par GridRenderer si nécessaire -->
          </div>
        </template>
        </GridRenderer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useTimeSignature } from '@/composables/useTimeSignature'
import { useMidiStore } from '@/stores/midi'
import GridRenderer from '../GridRenderer.vue'

// Props depuis le parent
const props = defineProps({
  selectedSignature: { type: Object, default: null }
})

// Émissions vers le parent
const emit = defineEmits(['signature-selected', 'signature-edit'])

// Utiliser le composable de signature rythmique
const {
  measuresWithSignatures,
  totalWidth
} = useTimeSignature()

// Debug: Log des mesures pour voir si elles ont des signature changes
computed(() => {
  console.log('🎼 Mesures avec signatures:', measuresWithSignatures.value.slice(0, 5).map(m => ({
    number: m.number,
    signatureChange: m.signatureChange,
    timeSignature: m.timeSignature
  })))
})

const midiStore = useMidiStore()

// État pour la gestion des signatures (utiliser le prop du parent)
const selectedSignatureFromParent = computed(() => props.selectedSignature)
const editingSignature = ref(null)
const tempSignatureValue = ref('')

// Validation des signatures rythmiques selon les règles musicales
const validateTimeSignature = (numerator, denominator) => {
  const validNumerators = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16]
  const validDenominators = [1, 2, 4, 8, 16, 32]
  
  return validNumerators.includes(numerator) && validDenominators.includes(denominator)
}

// Sélectionner une signature
const selectSignature = (measure) => {
  console.log('🎯 Clic sur signature:', measure)
  emit('signature-selected', measure)
}

// Gérer le clic sur l'espace vide du ruler
const handleRulerClick = () => {
  // Si on clique directement sur le ruler (pas sur une signature)
  console.log('🎯 Clic sur l\'espace vide du ruler')
  emit('signature-selected', null)
}

// Commencer l'édition d'une signature inline
const startEditSignature = (measure) => {
  console.log('🔧 Début édition signature:', measure)
  
  editingSignature.value = measure
  tempSignatureValue.value = `${measure.timeSignature.numerator}/${measure.timeSignature.denominator}`
  
  nextTick(() => {
    // Trouver l'input qui vient d'être rendu
    const inputElement = document.querySelector('.signature-input-field')
    if (inputElement) {
      inputElement.focus()
      inputElement.select()
      console.log('✅ Input signature focalisé pour édition')
    } else {
      console.warn('❌ Input signature non trouvé pour focus')
    }
  })
}

// Annuler l'édition
const cancelEdit = () => {
  editingSignature.value = null
  tempSignatureValue.value = ''
}

// Sauvegarder la signature
const saveSignature = async (measure) => {
  let newValue = (tempSignatureValue.value || '').trim()
  const currentValue = `${measure.timeSignature.numerator}/${measure.timeSignature.denominator}`
  
  // Si pas de changement, annuler
  if (!newValue || newValue === currentValue) {
    cancelEdit()
    return
  }
  
  // Valider le format de saisie (numerateur/denominateur)
  const signatureMatch = newValue.match(/^(\d+)\/(\d+)$/)
  if (!signatureMatch) {
    console.warn('Format invalide. Utilisez le format numerateur/denominateur (ex: 4/4)')
    return
  }

  const numerator = parseInt(signatureMatch[1])
  const denominator = parseInt(signatureMatch[2])

  // Valider selon les règles musicales
  if (!validateTimeSignature(numerator, denominator)) {
    console.warn('Signature rythmique invalide. Vérifiez les valeurs autorisées.')
    return
  }

  console.log('✅ Nouvelle signature validée:', { numerator, denominator })
  
  // Émettre l'événement d'édition vers le parent
  emit('signature-edit', {
    measure: measure,
    oldSignature: measure.timeSignature,
    newSignature: { numerator, denominator }
  })

  // Mettre à jour le store MIDI directement
  await updateSignatureInStore(measure, numerator, denominator)
  
  // Terminer l'édition
  cancelEdit()
}

// Gestionnaire des touches pour l'input de signature
const handleSignatureInputKeyDown = (event) => {
  console.log('🔍 TimeSignatureRuler input keydown:', event.key)
  
  // Empêcher la propagation pour Delete/Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    console.log('✅ TimeSignatureRuler: Arrêt propagation', event.key)
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

// Validation des touches pressées - empêcher les caractères non autorisés
const validateSignatureKeypress = (event) => {
  const char = event.key
  const currentValue = tempSignatureValue.value || ''
  
  // Autoriser les chiffres
  if (char >= '0' && char <= '9') {
    return true
  }
  
  // Autoriser le slash seulement s'il n'y en a pas déjà un
  if (char === '/' && !currentValue.includes('/')) {
    return true
  }
  
  // Autoriser les touches de contrôle (Backspace, Delete, flèches, etc.)
  if (event.ctrlKey || event.metaKey || 
      ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'].includes(char)) {
    return true
  }
  
  // Empêcher tous les autres caractères
  event.preventDefault()
  return false
}

// Gestionnaire global de clic pour sortir du mode édition
const handleGlobalClick = (event) => {
  if (!editingSignature.value) return
  
  // Vérifier si le clic est sur l'input d'édition ou ses parents
  const clickedElement = event.target
  const isInputClick = clickedElement.classList.contains('signature-input-field') ||
                      clickedElement.closest('.time-signature-container')
  
  if (!isInputClick) {
    // Clic en dehors de l'input, sauvegarder et sortir du mode édition
    console.log('🔄 Clic global détecté, sortie du mode édition signature')
    const currentMeasure = editingSignature.value
    if (currentMeasure) {
      saveSignature(currentMeasure)
    }
  }
}

// Mettre à jour la signature dans le store MIDI
const updateSignatureInStore = async (measure, numerator, denominator) => {
  const measureNumber = measure.number
  
  // Trouver l'événement de signature correspondant dans le store
  let signatureEvent = midiStore.timeSignatureEvents.find(event => 
    event.measure === measureNumber || 
    (event.time >= measure.startTime && event.time <= measure.endTime)
  )
  
  if (signatureEvent) {
    // Mettre à jour la signature existante
    if (midiStore.updateTimeSignature) {
      const success = midiStore.updateTimeSignature(signatureEvent.id, {
        numerator,
        denominator
      })
      if (success) {
        console.log('✅ Signature mise à jour dans le store:', { numerator, denominator })
        // Déclencher une mise à jour forcée des composables pour recalculer les mesures
        midiStore.triggerReactivity(`signature-edit-${measureNumber}`)
      } else {
        console.warn('❌ Échec de mise à jour de la signature dans le store')
      }
    }
  } else if (measureNumber > 1) {
    // Créer une nouvelle signature pour cette mesure
    if (midiStore.addTimeSignature) {
      const newSignatureId = midiStore.addTimeSignature({
        numerator,
        denominator,
        time: measure.startTime,
        ticks: measure.startTicks || 0,
        measure: measureNumber
      })
      if (newSignatureId) {
        console.log('✅ Nouvelle signature créée dans le store:', { id: newSignatureId, numerator, denominator })
        // Déclencher une mise à jour forcée des composables pour recalculer les mesures
        midiStore.triggerReactivity(`signature-add-${measureNumber}`)
      }
    }
  } else {
    console.warn('⚠️ Impossible de modifier la signature de la mesure 1 - elle doit toujours exister')
  }
}



// TimeSignatureRuler n'a plus de logique wheel - géré par WheelHandler global

// Ajouter/retirer le gestionnaire global
onMounted(() => {
  document.addEventListener('click', handleGlobalClick, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick, true)
})

// Exposition des données pour les composants parents
defineExpose({
  measuresWithSignatures,
  totalWidth
})
</script>

<style scoped>
.signature-ruler {
  height: 20px;
  position: relative;
  background: linear-gradient(
    to bottom,
    var(--signature-ruler-bg, #f8f9fa) 0%,
    var(--signature-ruler-bg-gradient, #e9ecef) 100%
  );
  min-width: 100%;
  border-bottom: 1px solid var(--signature-ruler-border, #dee2e6);
  border-top: 1px solid var(--signature-ruler-border, #dee2e6);
  overflow: hidden;
}

.signature-ruler-content {
  height: 100%;
  position: relative;
  overflow: hidden;
}

.signature-grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: 0.6;
  pointer-events: none;
}

/* Overlay pour GridRenderer */
.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none; /* Permet aux clics de passer à travers */
}

/* Styles pour les éléments personnalisés */
.signature-mark {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 3; /* Au-dessus de GridRenderer */
  pointer-events: auto; /* Permettre les clics sur les marques de signature */
}

.time-signature-container {
  position: absolute;
  top: 50%;
  left: 6px;
  transform: translateY(-50%);
  z-index: 5;
  pointer-events: auto;
  min-width: 24px;
}

.time-signature-container.selected .time-signature-text {
  background: var(--signature-text-selected-bg, #007bff);
  color: var(--signature-text-selected-text, #fff);
  border-color: var(--signature-text-selected-border, #0056b3);
}

.time-signature-text {
  font-size: 13px;
  font-weight: bold;
  color: var(--signature-text, #000);
  transition: all 0.2s ease;
  padding: 2px 3px;
  cursor: pointer;
  user-select: none;
  text-align: center;
  display: inline-block;
  min-width: 24px;
}

.time-signature-text:hover {
  color: var(--signature-text-hover, #007bff);
  background: var(--signature-text-bg-hover, rgba(255, 255, 255, 1));
}

.signature-input-field {
  background: var(--panel-bg);
  border: 1px solid var(--menu-active-fg);
  padding: 0 3px;
  font-size: 12px;
  font-weight: bold;
  color: var(--signature-input-text, #000);
  width: 40px;
  text-align: center;
  outline: none;
  box-sizing: border-box;
  height: 20px;
  line-height: 18px;
}


/* Personnalisation des lignes de GridRenderer pour TimeSignatureRuler */
.grid-overlay :deep(.measure-line) {
  background: var(--signature-measure-bar, #333);
  width: 2px;
}

.grid-overlay :deep(.measure-line.signature-change) {
  background: var(--signature-measure-bar-change, #007bff);
  width: 3px;
  box-shadow: 1px 0 2px var(--signature-measure-shadow, rgba(0, 123, 255, 0.3));
}

/* Variables CSS personnalisées */
:root {
  --signature-text-bg: rgba(255, 255, 255, 0.9);
  --signature-text-bg-hover: rgba(255, 255, 255, 1);
  --signature-text-border: rgba(0, 0, 0, 0.1);
  --signature-text-selected-bg: #007bff;
  --signature-text-selected-text: #fff;
  --signature-text-selected-border: #0056b3;
  --signature-input-border: #007bff;
  --signature-input-border-focus: #0056b3;
  --signature-input-bg: #fff;
  --signature-input-text: #333;
  --signature-input-shadow: rgba(0, 123, 255, 0.25);
  --signature-measure-bar-change: #007bff;
  --signature-measure-shadow: rgba(0, 123, 255, 0.3);
}

/* Mode sombre */
@media (prefers-color-scheme: dark) {
  :root {
    --signature-ruler-bg: #2d3748;
    --signature-ruler-bg-gradient: #1a202c;
    --signature-ruler-border: #4a5568;
    --signature-text: #e2e8f0;
    --signature-text-hover: #63b3ed;
    --signature-text-bg: rgba(45, 55, 72, 0.9);
    --signature-text-bg-hover: rgba(45, 55, 72, 1);
    --signature-text-border: rgba(255, 255, 255, 0.1);
    --signature-text-selected-bg: #63b3ed;
    --signature-text-selected-text: #1a202c;
    --signature-text-selected-border: #4299e1;
    --signature-input-border: #63b3ed;
    --signature-input-border-focus: #4299e1;
    --signature-input-bg: #2d3748;
    --signature-input-text: #e2e8f0;
    --signature-input-shadow: rgba(99, 179, 237, 0.25);
    --signature-measure-bar-change: #63b3ed;
    --signature-measure-shadow: rgba(99, 179, 237, 0.3);
  }
}
</style>