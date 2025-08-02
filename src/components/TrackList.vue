<template>
  <div class="track-list">
    <div class="track-list-header">
      <h3>Pistes</h3>
      <el-button :icon="Plus" size="small" type="primary" @click="addNewTrack">
        Ajouter
      </el-button>
    </div>

    <div class="track-list-content">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="track-item"
        :class="{ active: selectedTrack === track.id }"
        @click="selectTrack(track.id)"
      >
        <div class="track-color-indicator" :style="{ backgroundColor: track.color }"></div>
        
        <div class="track-info">
          <div class="track-name">{{ track.name }}</div>
          <div class="track-instrument">{{ track.instrument?.name || track.instrument || 'Piano' }}</div>
          <div class="track-details">
            Ch{{ track.channel + 1 }} • Vol{{ track.volume }} • {{ track.notes.length }} notes
          </div>
        </div>
        
        <div class="track-controls">
          <el-button
            :icon="VideoPlay"
            size="small"
            text
            :class="{ active: track.solo }"
            @click.stop="toggleSolo(track.id)"
            title="Solo"
          />
          <el-button
            :icon="Mute"
            size="small"
            text
            :class="{ active: track.muted }"
            @click.stop="toggleMute(track.id)"
            title="Mute"
          />
          <el-button
            :icon="Close"
            size="small"
            text
            type="danger"
            @click.stop="deleteSelectedTrack(track.id)"
            title="Supprimer"
          />
        </div>
      </div>

      <!-- Message si aucune piste -->
      <div v-if="tracks.length === 0" class="no-tracks">
        <p>Aucune piste disponible</p>
        <p class="hint">Chargez un fichier MIDI ou ajoutez une piste</p>
      </div>
    </div>

    <!-- Informations sur la piste sélectionnée -->
    <div v-if="selectedTrackInfo" class="selected-track-info">
      <h4>Piste sélectionnée</h4>
      <div class="track-stats">
        <div class="stat">
          <span class="label">Notes :</span>
          <span class="value">{{ selectedTrackNotes.length }}</span>
        </div>
        <div class="stat">
          <span class="label">Événements CC :</span>
          <span class="value">{{ selectedTrackCCCount }}</span>
        </div>
        <div class="stat">
          <span class="label">Canal :</span>
          <span class="value">{{ selectedTrackInfo.channel + 1 }}</span>
        </div>
        <div class="stat">
          <span class="label">Instrument :</span>
          <span class="value">{{ selectedTrackInfo.instrument?.name || selectedTrackInfo.instrument || 'Piano' }}</span>
        </div>
        <div class="stat">
          <span class="label">Durée :</span>
          <span class="value">{{ formatDuration(getTrackDuration(selectedTrackInfo.id)) }}</span>
        </div>
      </div>
      
      <!-- Contrôles de volume et pan -->
      <div class="track-controls-extended">
        <div class="control-group">
          <label>Volume:</label>
          <el-slider
            :model-value="selectedTrackInfo.volume"
            :min="0"
            :max="127"
            :show-tooltip="true"
            size="small"
            @change="updateTrackVolume"
          />
        </div>
        <div class="control-group">
          <label>Pan:</label>
          <el-slider
            :model-value="selectedTrackInfo.pan"
            :min="0"
            :max="127"
            :show-tooltip="true"
            size="small"
            @change="updateTrackPan"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Plus, VideoPlay, Mute, Close } from '@element-plus/icons-vue'
import { useMidiStore } from '@/stores/midi'
import { ElMessageBox, ElMessage } from 'element-plus'

const midiStore = useMidiStore()

// Computed pour récupérer les données du store
const tracks = computed(() => midiStore.tracks)
const selectedTrack = computed(() => midiStore.selectedTrack)
const selectedTrackInfo = computed(() => midiStore.getSelectedTrackData)
const selectedTrackNotes = computed(() => {
  if (selectedTrack.value !== null) {
    return midiStore.getTrackNotes(selectedTrack.value)
  }
  return []
})

const selectedTrackCCCount = computed(() => {
  if (selectedTrack.value !== null) {
    const controlChanges = midiStore.getControlChangesForTrack(selectedTrack.value)
    return Object.values(controlChanges).reduce((total, ccArray) => total + ccArray.length, 0)
  }
  return 0
})

// Sélectionner une piste via le store
const selectTrack = (id) => {
  midiStore.selectTrack(id)
}

// Basculer le mode solo d'une piste
const toggleSolo = (trackId) => {
  midiStore.toggleTrackSolo(trackId)
}

// Basculer le mode mute d'une piste
const toggleMute = (trackId) => {
  midiStore.toggleTrackMute(trackId)
}

// Mettre à jour le volume d'une piste
const updateTrackVolume = (volume) => {
  if (selectedTrack.value !== null) {
    midiStore.updateTrackVolume(selectedTrack.value, volume)
  }
}

// Mettre à jour le pan d'une piste (fonction à ajouter au store)
const updateTrackPan = (pan) => {
  if (selectedTrack.value !== null) {
    const track = midiStore.getTrackById(selectedTrack.value)
    if (track) {
      track.pan = Math.max(0, Math.min(127, pan))
    }
  }
}

// Calculer la durée d'une piste
const getTrackDuration = (trackId) => {
  const trackNotes = midiStore.getTrackNotes(trackId)
  if (trackNotes.length === 0) return 0
  
  const lastNote = trackNotes.reduce((latest, note) => {
    const noteEnd = note.time + note.duration
    return noteEnd > latest ? noteEnd : latest
  }, 0)
  
  return lastNote
}

// Formater la durée en minutes:secondes
const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// Ajouter une nouvelle piste (fonction basique - nécessite extension du store)
const addNewTrack = () => {
  const trackNumber = tracks.value.length + 1
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ]
  
  // Créer une nouvelle piste (cette fonctionnalité nécessiterait d'étendre le store)
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
    muted: false,
    solo: false,
    color: colors[(trackNumber - 1) % colors.length]
  }
  
  // Ajouter la piste au store (nécessite d'étendre le store avec une action addTrack)
  midiStore.tracks.push(newTrack)
  midiStore.selectTrack(newTrack.id)
  
  ElMessage.success('Nouvelle piste ajoutée')
}

// Supprimer une piste avec confirmation
const deleteSelectedTrack = async (trackId) => {
  const track = midiStore.getTrackById(trackId)
  if (!track) return

  const noteCount = track.notes.length

  let message = `Êtes-vous sûr de vouloir supprimer la piste "${track.name}" ?`
  if (noteCount > 0) {
    message += `\n\nCette action supprimera également ${noteCount} note(s).`
  }

  try {
    await ElMessageBox.confirm(
      message,
      'Confirmer la suppression',
      {
        confirmButtonText: 'Supprimer',
        cancelButtonText: 'Annuler',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    // Supprimer la piste (nécessite d'étendre le store avec une action deleteTrack)
    const trackIndex = midiStore.tracks.findIndex(t => t.id === trackId)
    if (trackIndex !== -1) {
      midiStore.tracks.splice(trackIndex, 1)
      
      // Supprimer aussi les notes de cette piste
      midiStore.notes = midiStore.notes.filter(note => note.trackId !== trackId)
      
      // Désélectionner si c'était la piste sélectionnée
      if (midiStore.selectedTrack === trackId) {
        midiStore.clearSelection()
      }
    }

    ElMessage.success('Piste supprimée')

  } catch {
    // L'utilisateur a annulé
  }
}
</script>

<style scoped>
.track-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.track-list-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--panel-bg);
  color: var(--panel-fg);
}

.track-list-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.track-list-content {
  flex: 1;
  overflow-y: auto;
}

.track-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--track-border);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
  position: relative;
  background: var(--track-bg);
  color: var(--track-name);
}

.track-item:hover {
  background: var(--lane-bg);
}

.track-item.active {
  background: var(--track-active-bg);
  border-color: var(--menu-active-fg);
}

.track-color-indicator {
  width: 4px;
  height: 40px;
  border-radius: 2px;
  margin-right: 12px;
  flex-shrink: 0;
}

.track-info {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}

.track-name {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--track-name);
}

.track-instrument {
  font-size: 11px;
  color: var(--track-instrument);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 1px;
}

.track-details {
  font-size: 10px;
  color: var(--track-details);
}

.track-controls {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.track-controls .el-button {
  padding: 4px;
  min-width: auto;
  background: transparent;
  color: var(--panel-fg);
}

.track-controls .el-button.active {
  background: var(--menu-active-fg);
  color: #fff;
}

.track-controls .el-button.active:hover {
  background: var(--menu-active-bg);
}

.no-tracks {
  padding: 32px 16px;
  text-align: center;
  color: var(--track-details);
}

.no-tracks p {
  margin: 8px 0;
}

.no-tracks .hint {
  font-size: 12px;
  color: #ccc;
}

.selected-track-info {
  border-top: 1px solid var(--border-color);
  padding: 16px;
  background: var(--lane-bg);
  color: var(--panel-fg);
}

.selected-track-info h4 {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
}

.track-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.stat {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.stat .label {
  color: var(--track-instrument);
}

.stat .value {
  font-weight: 500;
}

.track-controls-extended {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-size: 11px;
  color: var(--track-instrument);
  min-width: 40px;
}

.control-group :deep(.el-slider) {
  flex: 1;
}

/* Animations pour les transitions */
.track-item {
  transition: all 0.2s ease;
}

.track-controls .el-button {
  transition: all 0.2s ease;
}
</style>