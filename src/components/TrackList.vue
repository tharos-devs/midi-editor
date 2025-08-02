
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

      <div class="track-instruments-content">
        <div
          v-for="track in tracks"
          :key="track.id"
          class="track-instrument-wrapper"
          :style="{ minHeight: `${trackHeight}px` }"
        >
          <TrackInstrument
            :track="track"
            @channel-changed="onTrackChannelChanged"
            @output-changed="onTrackOutputChanged"
            @track-selected="onTrackSelected"
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
        v-model="trackSizeValue"
        @track-size-changed="onTrackSizeChanged"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plus, Headset } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'
import { useUIStore } from '@/stores/ui'
import { ElMessage } from 'element-plus'
import TrackInfo from './TrackInfo.vue'
import TrackInstrument from './TrackInstrument.vue'
import TrackStatusBar from './TrackStatusBar.vue'

const midiStore = useMidiStore()
const uiStore = useUIStore()

const showTrackInfo = computed(() => {
  return uiStore.showTrackInfo
})

// État local
const trackSizeValue = ref(50) // Valeur par défaut pour la taille des pistes

// Computed pour récupérer les données du store
const tracks = computed(() => midiStore.tracks)

// Computed pour calculer la hauteur des pistes en pixels
const trackHeight = computed(() => {
  // Convertir la valeur du slider (0-100) en hauteur (40-120px)
  const minHeight = 40
  const maxHeight = 120
  return Math.round(minHeight + (trackSizeValue.value / 100) * (maxHeight - minHeight))
})

// Gestionnaires d'événements pour TrackInstrument
const onTrackChannelChanged = ({ trackId, channel }) => {
  console.log(`Canal MIDI changé pour la piste ${trackId}: ${channel + 1}`)
  // Logique additionnelle si nécessaire
}

const onTrackOutputChanged = ({ trackId, outputId }) => {
  console.log(`Sortie MIDI changée pour la piste ${trackId}: ${outputId}`)
  // Logique additionnelle si nécessaire
}

const onTrackSelected = (trackId) => {
  console.log(`Piste sélectionnée: ${trackId}`)
  // Logique additionnelle si nécessaire
}

const onTrackSizeChanged = (sizeInfo) => {
  console.log(`Taille des pistes changée: ${sizeInfo.size} (${sizeInfo.heightPx}px)`)
  // La hauteur est automatiquement mise à jour via le computed trackHeight
}

// Ajouter une nouvelle piste
// Ajouter une nouvelle piste
const addNewTrack = () => {
  const trackNumber = tracks.value.length + 1
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F39C12', '#E74C3C', '#9B59B6', '#3498DB', '#2ECC71',
    '#1ABC9C', '#34495E', '#95A5A6', '#E67E22', '#C0392B'
  ]
  
  // Créer une nouvelle piste
  const newTrack = {
    id: Date.now(), // ID temporaire
    name: `Nouvelle Piste ${trackNumber}`,
    channel: Math.min(trackNumber - 1, 15),
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
  midiStore.selectTrack(newTrack.id)
  
  ElMessage.success('Nouvelle piste ajoutée')
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
  min-width: 0;
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
}

.track-instrument-wrapper {
  margin-bottom: 8px;
}

.track-instrument-wrapper:last-child {
  margin-bottom: 0;
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
</style>"