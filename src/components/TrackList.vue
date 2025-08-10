<template>
  <div class="track-list">
    <!-- Colonne 1: Informations de la piste sélectionnée (largeur fixe) -->
    <div 
      v-if="showTrackInfo" 
      class="track-info-column" 
      :style="{ width: uiStore.trackInfoPanelWidth + 'px' }"
    >
      <TrackInfo />
    </div>

    <!-- Colonne 2: Liste des instruments (largeur calculée) -->
    <div 
      class="track-instruments-column" 
      :style="{ width: uiStore.trackInstrumentWidth + 'px' }"
    >
      <div class="track-instruments-header">
        <h3>Pistes</h3>
        <div class="header-controls">
          <el-button
            :icon="Plus"
            size="small"
            type="primary"
            @click="addNewTrack"
          >
            Ajouter
          </el-button>
        </div>
      </div>

      <div 
        class="track-instruments-content"
        :class="{ 
          'drag-active': dragState.isDragging,
          'reorder-feedback': showReorderFeedback
        }"
        @dragover.prevent
        @drop.prevent
      >
        <div
          v-for="(track, index) in tracks"
          :key="`track-${track.id}`"
          class="track-instrument-wrapper"
          :class="{ 
            'drag-placeholder': dragState.isDragging && dragState.draggedTrackId === track.id,
            'drag-target': dragState.isDragging && dragState.draggedTrackId !== track.id
          }"
        >
          <TrackInstrument
            :track="track"
            :height="track.height || 30"
            :index="index"
            @channel-changed="onTrackChannelChanged"
            @output-changed="onTrackOutputChanged"
            @track-selected="onTrackSelected"
            @track-reorder="onTrackReorder"
            @height-changed="onTrackHeightChanged"
          />
        </div>

        <!-- Message si aucune piste -->
        <div v-if="tracks.length === 0" class="no-tracks">
          <div class="no-tracks-content">
            <el-icon size="48"><Headset /></el-icon>
            <h4>Aucune piste disponible</h4>
            <p>Chargez un fichier MIDI ou ajoutez une piste</p>
            <el-button
              type="primary"
              :icon="Plus"
              @click="addNewTrack"
              style="margin-top: 16px;"
            >
              Créer une piste
            </el-button>
          </div>
        </div>
      </div>

      <!-- Barre de statut -->
      <TrackStatusBar 
        ref="trackStatusBarRef"
        v-model="trackSize"
        @track-size-changed="onTrackSizeChanged"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { Plus, Headset } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'
import { useUIStore } from '@/stores/ui'
import TrackInfo from './TrackInfo.vue'
import TrackInstrument from './TrackInstrument.vue'
import TrackStatusBar from './TrackStatusBar.vue'
import { ElMessage } from 'element-plus'

const midiStore = useMidiStore()
const uiStore = useUIStore()

const showTrackInfo = computed(() => {
  return uiStore.showTrackInfo
})

// Computed pour récupérer les données du store
const tracks = computed(() => midiStore.tracks)

const trackSizeRef = ref(null)
const trackSize = ref(50) // Valeur 0-100
const trackHeightPx = ref(30) // Hauteur en pixels

// État du drag & drop
const dragState = reactive({
  isDragging: false,
  draggedTrackId: null,
  draggedTrackIndex: -1,
  targetIndex: -1,
  dragStartTime: 0
})

// État pour le feedback visuel
const showReorderFeedback = ref(false)

// Gestionnaires d'événements pour TrackInstrument
const onTrackChannelChanged = ({ trackId, channel }) => {
  // console.log(`🎵 Canal changé pour piste ${trackId}: ${channel}`)
}

const onTrackOutputChanged = ({ trackId, outputId }) => {
  // console.log(`🔌 Sortie changée pour piste ${trackId}: ${outputId}`)
}

const onTrackSelected = (trackId) => {
  // console.log(`🎯 Piste sélectionnée: ${trackId}`)
}

const onTrackHeightChanged = ({ trackId, height, level }) => {
  // Mettre à jour la hauteur dans le store (comme avant)
  const trackIndex = tracks.value.findIndex(t => t.id === trackId)
  if (trackIndex !== -1) {
    midiStore.tracks[trackIndex].height = height
    midiStore.tracks[trackIndex].heightLevel = level
  }
  
  // Synchroniser TrackSize avec les changements individuels
  if (trackSizeRef.value) {
    trackSizeRef.value.syncWithTracks()
  }
}

const onTrackSizeChanged = (sizeInfo) => {
  trackSize.value = sizeInfo.value
  trackHeightPx.value = sizeInfo.heightPx
}

// Gestionnaire principal de réorganisation des pistes
const onTrackReorder = async (reorderData) => {
  const { draggedTrackId, targetIndex, position } = reorderData
  
  // console.log(`🎯 Réorganisation demandée:`, {
  //   draggedTrackId,
  //   targetIndex,
  //   position,
  //   currentTracks: tracks.value.map(t => `${t.id}:${t.name}`)
  // })

  // Mettre à jour l'état du drag
  dragState.isDragging = true
  dragState.draggedTrackId = draggedTrackId
  dragState.targetIndex = targetIndex

  try {
    // Trouver l'index actuel de la piste déplacée
    const currentIndex = tracks.value.findIndex(track => track.id === draggedTrackId)
    
    if (currentIndex === -1) {
      // console.error(`❌ Piste ${draggedTrackId} non trouvée`)
      dragState.isDragging = false
      return
    }

    // Calculer le nouvel index final
    let finalIndex = targetIndex
    
    // Si on déplace vers le bas et que la piste actuelle est au-dessus de la cible,
    // il faut ajuster l'index final
    if (currentIndex < targetIndex) {
      finalIndex = targetIndex - 1
    }
    
    // Éviter de déplacer au même endroit
    if (currentIndex === finalIndex) {
      // console.log(`⚠️  Pas de changement nécessaire (index ${currentIndex} -> ${finalIndex})`)
      dragState.isDragging = false
      return
    }

    // console.log(`📦 Déplacement: index ${currentIndex} -> ${finalIndex}`)

    // Utiliser la fonction du store pour réorganiser
    const success = await midiStore.reorderTrack(draggedTrackId, finalIndex)
    
    if (success) {
      ElMessage.success({
        message: `Piste déplacée à la position ${finalIndex + 1}`,
        duration: 2000,
        showClose: true
      })
      /*
      // console.log(`✅ Piste ${draggedTrackId} déplacée avec succès`)
      // console.log(`📋 Nouvel ordre:`, tracks.value.map(t => `${t.id}:${t.name}`))
      */

      // Déclencher une animation de feedback
      triggerReorderFeedback()
      
    } else {
      ElMessage.error({
        message: 'Erreur lors du déplacement de la piste',
        duration: 3000,
        showClose: true
      })
      // console.error(`❌ Échec du déplacement de la piste ${draggedTrackId}`)
    }
    
  } catch (error) {
    // console.error('❌ Erreur lors de la réorganisation:', error)
    ElMessage.error({
      message: 'Erreur lors du déplacement de la piste',
      duration: 3000,
      showClose: true
    })
  } finally {
    // Nettoyer l'état du drag après un délai
    setTimeout(() => {
      dragState.isDragging = false
      dragState.draggedTrackId = null
      dragState.targetIndex = -1
    }, 300)
  }
}

// Fonction pour déclencher un feedback visuel après réorganisation
const triggerReorderFeedback = () => {
  showReorderFeedback.value = true
  setTimeout(() => {
    showReorderFeedback.value = false
  }, 600)
}

// Watcher pour surveiller les changements d'état du drag
watch(() => dragState.isDragging, (isDragging) => {
  if (isDragging) {
    dragState.dragStartTime = Date.now()
    // console.log('🚀 Début du drag & drop')
  } else {
    const dragDuration = Date.now() - dragState.dragStartTime
    // console.log(`🏁 Fin du drag & drop (durée: ${dragDuration}ms)`)
  }
})

// Ajouter une nouvelle piste
const addNewTrack = async () => {
  const trackNumber = tracks.value.length + 1
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F39C12', '#E74C3C', '#9B59B6', '#3498DB', '#2ECC71',
    '#1ABC9C', '#34495E', '#95A5A6', '#E67E22', '#C0392B'
  ]
  
  try {
    // Créer une nouvelle piste
    const newTrack = {
      id: Date.now(), // ID temporaire basé sur le timestamp
      name: `Nouvelle Piste ${trackNumber}`,
      channel: Math.min(trackNumber - 1, 15), // Canal MIDI (0-15)
      instrument: { name: 'Acoustic Grand Piano', number: 0 },
      notes: [],
      controlChanges: {},
      pitchBends: [],
      volume: 100,
      pan: 64,
      bank: 0,
      midiOutput: 'default',
      muted: false,
      solo: false,
      color: colors[(trackNumber - 1) % colors.length]
    }
    
    // Ajouter la piste au store
    midiStore.tracks.push(newTrack)
    
    // Sélectionner la nouvelle piste
    midiStore.selectTrack(newTrack.id)
    
    // Forcer la réactivité
    midiStore.triggerReactivity()
    
    ElMessage.success({
      message: `Piste "${newTrack.name}" créée avec succès`,
      duration: 2000
    })
    
    // console.log(`✅ Nouvelle piste créée:`, newTrack)
    
  } catch (error) {
    // console.error('❌ Erreur lors de la création de la piste:', error)
    ElMessage.error({
      message: 'Erreur lors de la création de la piste',
      duration: 3000
    })
  }
}

// Fonction utilitaire pour obtenir le nom d'une piste
const getTrackName = (trackId) => {
  const track = tracks.value.find(t => t.id === trackId)
  return track ? track.name : `Piste ${trackId}`
}

// Debug: surveiller les changements d'ordre des pistes
if (process.env.NODE_ENV === 'development') {
  watch(tracks, (newTracks, oldTracks) => {
    if (oldTracks && newTracks.length === oldTracks.length) {
      const oldOrder = oldTracks.map(t => t.id).join(',')
      const newOrder = newTracks.map(t => t.id).join(',')
      /*
      if (oldOrder !== newOrder) {
        // console.log('🔄 Ordre des pistes changé:')
        // console.log('Ancien:', oldTracks.map((t, i) => `${i + 1}.${t.name}`))
        // console.log('Nouveau:', newTracks.map((t, i) => `${i + 1}.${t.name}`)
      }
      */
    }
  }, { deep: true })
}
</script>

<style scoped>
.track-list {
  height: 100%;
  display: flex;
  background: var(--panel-bg);
  transition: none; /* Suppression de la transition pour éviter l'effet élastique */
}

.track-info-column {
  flex-shrink: 0;
  background: var(--panel-bg);
  border-right: 1px solid var(--border-color);
}

.track-instruments-column {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 100px;
  max-width: 400px;
  transition: none; /* Suppression de la transition pour éviter l'effet élastique */
}

.track-instruments-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--lane-bg);
  color: var(--panel-fg);
  flex-shrink: 0;
}

.track-instruments-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.track-instruments-content {
  flex: 1;
  overflow-y: auto;
  transition: background-color 0.3s ease;
  padding: 4px;
}

.track-instrument-wrapper {
  margin-bottom: 4px;
  transition: all 0.2s ease;
  border-radius: 4px;
}

.track-instrument-wrapper:last-child {
  margin-bottom: 0;
}

/* Styles pour le drag & drop */
.track-instruments-content.drag-active {
  background: rgba(64, 158, 255, 0.05);
  border: 2px dashed rgba(64, 158, 255, 0.3);
}

.track-instrument-wrapper.drag-placeholder {
  opacity: 0.3;
  transform: scale(0.95);
  filter: grayscale(50%);
  border: 2px dashed rgba(64, 158, 255, 0.5);
}

.track-instrument-wrapper.drag-target {
  transition: all 0.2s ease;
  cursor: pointer;
}

.track-instrument-wrapper.drag-target:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
  background: rgba(64, 158, 255, 0.1);
  border-radius: 6px;
}

/* Animation de feedback après réorganisation */
.track-instruments-content.reorder-feedback {
  animation: reorderSuccess 0.6s ease;
}

@keyframes reorderSuccess {
  0% {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.5);
  }
  50% {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
  }
  100% {
    background: transparent;
    border-color: transparent;
  }
}

.no-tracks {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.no-tracks-content {
  text-align: center;
  color: var(--track-details);
  max-width: 300px;
}

.no-tracks-content .el-icon {
  margin-bottom: 16px;
  color: var(--track-instrument);
}

.no-tracks-content h4 {
  margin: 0 0 8px 0;
  color: var(--panel-fg);
  font-size: 18px;
  font-weight: 600;
}

.no-tracks-content p {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.5;
}

/* Indicateurs visuels pour le drag & drop */
.track-instruments-content.drag-active::before {
  content: '↕️ Glissez pour réorganiser les pistes';
  display: block;
  text-align: center;
  padding: 8px;
  background: rgba(64, 158, 255, 0.1);
  color: var(--menu-active-fg);
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  margin-bottom: 8px;
  border: 1px solid rgba(64, 158, 255, 0.3);
}

/* Amélioration du curseur pendant le drag */
.track-instruments-content.drag-active * {
  cursor: grabbing !important;
}

/* Responsive */
@media (max-width: 1024px) {
  .track-info-column {
    width: 280px;
    min-width: 280px;
  }
}

@media (max-width: 768px) {
  .track-list {
    flex-direction: column;
  }
  
  .track-info-column {
    width: 100%;
    min-width: auto;
    max-height: 40vh;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  
  .track-instruments-header {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  
  .header-controls {
    justify-content: center;
  }
  
  .track-instruments-content {
    padding: 8px;
  }
}

/* Personnalisation de la scrollbar */
.track-instruments-content::-webkit-scrollbar {
  width: 8px;
}

.track-instruments-content::-webkit-scrollbar-track {
  background: var(--lane-bg);
  border-radius: 4px;
}

.track-instruments-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.track-instruments-content::-webkit-scrollbar-thumb:hover {
  background: var(--menu-active-fg);
}

/* Animations */
.track-instrument-wrapper {
  transition: all 0.2s ease;
}

.track-instruments-content {
  scroll-behavior: smooth;
}

/* Focus et accessibilité */
.track-list:focus-within {
  outline: 2px solid var(--menu-active-fg);
  outline-offset: -2px;
}

/* Amélioration des performances pour les longues listes */
.track-instrument-wrapper {
  contain: layout style paint;
}

/* Animation d'entrée pour les nouvelles pistes */
@keyframes trackFadeIn {
  from {
    opacity: 0;
    transform: translateX(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.track-instrument-wrapper:last-child {
  animation: trackFadeIn 0.3s ease-out;
}

/* Styles spéciaux pour le drag actif */
.drag-ghost {
  opacity: 0.5;
  transform: rotate(5deg);
  z-index: 1000;
  pointer-events: none;
}

/* Indicateur de position de drop */
.drop-indicator {
  height: 4px;
  background: var(--menu-active-fg);
  border-radius: 2px;
  margin: 2px 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.drop-indicator.active {
  opacity: 1;
}
</style>