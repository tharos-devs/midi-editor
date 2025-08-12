<template>
  <el-dialog
    v-model="dialogVisible"
    title="Articulation Editor"
    width="1100px"
    :before-close="handleClose"
  >
    <div class="articulation-editor">
      <!-- Actions bar -->
      <div class="actions-bar" style="margin-bottom: 16px;">
        <el-button type="primary" @click="addArticulation">
          <el-icon><Plus /></el-icon>
          Ajouter Articulation
        </el-button>
        <el-button type="danger" @click="deleteSelectedArticulations" :disabled="!hasSelectedArticulations">
          <el-icon><Delete /></el-icon>
          Supprimer Articulation
        </el-button>
        <el-divider direction="vertical" />
        <el-button @click="saveToFile">
          <el-icon><Download /></el-icon>
          Sauvegarder
        </el-button>
        <el-button @click="loadFromFile">
          <el-icon><Upload /></el-icon>
          Charger
        </el-button>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileLoad"
        />
      </div>

      <!-- Two column layout -->
      <el-row :gutter="20" style="height: 500px;">
        <!-- Left column: Articulations -->
        <el-col :span="15" style="height: 100%; display: flex; flex-direction: column;">
          <h4 style="margin-top: 0; margin-bottom: 16px;">Articulations</h4>
          <div style="flex: 1; overflow: hidden;">
            <el-table
              ref="articulationTable"
              :data="articulationData"
              row-key="id"
              @selection-change="handleArticulationSelectionChange"
              @row-click="selectArticulation"
              :row-class-name="getRowClassName"
              style="width: 100%; height: 100%"
              size="small"
              :max-height="460"
            >
            <el-table-column type="selection" width="20" />
            
            <!-- Drag handle column -->
            <el-table-column label="" width="30">
              <template #default="{ $index }">
                <div 
                  class="drag-handle"
                  @mousedown="startDrag($index, $event)"
                  @dragstart.prevent
                >
                  <el-icon><DCaret /></el-icon>
                </div>
              </template>
            </el-table-column>
            
            <el-table-column label="Color" width="40">
              <template #default="{ row }">
                <el-color-picker
                  v-model="row.color"
                  size="small"
                  :predefine="predefineColors"
                />
              </template>
            </el-table-column>
            
            <el-table-column label="Name" width="130">
              <template #default="{ row }">
                <el-input
                  v-model="row.name"
                  placeholder="Nom"
                  size="small"
                />
              </template>
            </el-table-column>

            <el-table-column label="Input" width="80">
              <template #default="{ row }">
                <el-input
                  v-model="row.input"
                  placeholder="C4"
                  size="small"
                  @blur="validateInput(row)"
                />
              </template>
            </el-table-column>

            <el-table-column label="Triggers" width="170">
              <template #default="{ row }">
                <div class="activation-summary">
                  {{ formatActivationSummary(row.triggers) }}
                </div>
              </template>
            </el-table-column>

            <el-table-column label="Type" width="90">
              <template #default="{ row }">
                <div class="action-display">
                  <el-checkbox v-model="row.isPermanent" size="small"/>
                  <span class="action-text" v-html="row.isPermanent ? 'Permanent' : 'Instantané'">
                  </span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="Actions" width="60">
              <template #default="{ row, $index }">
                <el-button
                  type="danger"
                  size="small"
                  @click.stop="deleteArticulation($index)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-table-column>
            </el-table>
          </div>
        </el-col>

        <!-- Right column: Triggers -->
        <el-col :span="9" style="height: 100%; display: flex; flex-direction: column;">
          <div class="articulations-panel">
            <h4 style="margin-top: 0; margin-bottom: 16px;">Déclencheurs</h4>
            <div class="triggers-actions" style="margin-bottom: 16px;">
              <el-button 
                type="primary" 
                size="small" 
                @click="addTrigger"
                :disabled="!selectedArticulation"
              >
                <el-icon><Plus /></el-icon>
                Ajouter
              </el-button>
              <el-button 
                type="danger" 
                size="small" 
                @click="deleteSelectedTriggers" 
                :disabled="!hasSelectedTriggers"
              >
                <el-icon><Delete /></el-icon>
                Supprimer
              </el-button>
            </div>
          </div>
          
          <div style="flex: 1; overflow: hidden;">
            <el-table
              :data="currentTriggers"
              row-key="id"
              @selection-change="handleTriggerSelectionChange"
              style="width: 100%; height: 100%"
              :empty-text="selectedArticulation ? 'Aucun déclencheur' : 'Sélectionnez une articulation'"
              size="small"
              :max-height="400"
            >
            <el-table-column type="selection" width="50" />
            
            <el-table-column label="Activation" width="130">
              <template #default="{ row }">
                <el-select
                  v-model="row.activation"
                  placeholder="Type"
                  size="small"
                  @change="onActivationChange(row)"
                >
                  <el-option label="Note on-off" value="note" />
                  <el-option label="Control Change" value="controller" />
                  <el-option label="Program Change" value="program" />
                  <el-option label="Channel Change" value="channel" />
                </el-select>
              </template>
            </el-table-column>

            <el-table-column label="Sequence" width="120">
              <template #default="{ row }">
                <div v-if="row.activation === 'controller'" class="controller-inputs">
                  <el-input
                    v-model="row.sequence.controller"
                    placeholder="CC"
                    size="small"
                    style="width: 50px; margin-right: 4px;"
                    type="number"
                    :min="0"
                    :max="127"
                  />
                  <el-input
                    v-model="row.sequence.value"
                    placeholder="Val"
                    size="small"
                    style="width: 50px;"
                    type="number"
                    :min="0"
                    :max="127"
                  />
                </div>
                <el-input
                  v-else-if="row.activation === 'note'"
                  v-model="row.sequence"
                  placeholder="C4"
                  size="small"
                  @blur="validateNoteInput(row)"
                />
                <el-input
                  v-else
                  v-model="row.sequence"
                  placeholder="0-127"
                  size="small"
                  type="number"
                  :min="0"
                  :max="127"
                />
              </template>
            </el-table-column>

            <el-table-column label="" width="60">
              <template #default="{ row, $index }">
                <el-button
                  type="danger"
                  size="small"
                  @click="deleteTrigger($index)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-table-column>
            </el-table>
          </div>
        </el-col>
      </el-row>

      <!-- Drag indicator -->
      <div 
        v-if="dragState.isDragging" 
        class="drag-indicator"
        :style="{ 
          top: dragState.indicatorY + 'px',
          left: '14px',
          right: '50%'
        }"
      ></div>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">Annuler</el-button>
        <el-button type="primary" @click="handleSave">Sauvegarder</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, Download, Upload, DCaret } from '@element-plus/icons-vue'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  initialData: {
    type: Array,
    default: () => []
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'save'])

// Reactive data
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const articulationData = ref([])
const selectedArticulations = ref([])
const selectedTriggers = ref([])
const selectedArticulation = ref(null)
const fileInput = ref(null)
const articulationTable = ref(null)
let nextArticulationId = 1
let nextTriggerId = 1

// Drag and drop state
const dragState = reactive({
  isDragging: false,
  dragIndex: -1,
  startY: 0,
  indicatorY: 0,
  tableRect: null,
  rowHeight: 0
})

// Predefined colors for color picker
const predefineColors = [
  '#ff4500',
  '#ff8c00', 
  '#ffd700',
  '#90ee90',
  '#00ced1',
  '#1e90ff',
  '#c71585',
  '#ff69b4',
  '#ba55d3',
  '#20b2aa'
]

// Note progression helper
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const getNextNote = (currentNote) => {
  if (!currentNote) return 'C1'
  
  const match = currentNote.match(/^([A-G][#b]?)(-?\d+)$/)
  if (!match) return 'C1'
  
  let noteName = match[1].replace('b', '#') // Convert flats to sharps for consistency
  let octave = parseInt(match[2])
  
  // Convert note name to index
  let noteIndex = noteNames.indexOf(noteName)
  if (noteIndex === -1) {
    // Handle flats
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' }
    noteName = flatToSharp[noteName] || 'C'
    noteIndex = noteNames.indexOf(noteName)
  }
  
  // Increment note
  noteIndex++
  if (noteIndex >= 12) {
    noteIndex = 0
    octave++
  }
  
  return noteNames[noteIndex] + octave
}

// Computed
const hasSelectedArticulations = computed(() => selectedArticulations.value.length > 0)
const hasSelectedTriggers = computed(() => selectedTriggers.value.length > 0)

const currentTriggers = computed(() => {
  return selectedArticulation.value ? selectedArticulation.value.triggers : []
})

// Drag and Drop Methods
const startDrag = (index, event) => {
  event.preventDefault()
  event.stopPropagation()
  
  dragState.isDragging = true
  dragState.dragIndex = index
  dragState.startY = event.clientY
  
  // Get table bounds
  const tableEl = articulationTable.value?.$el?.querySelector('.el-table__body-wrapper')
  if (tableEl) {
    dragState.tableRect = tableEl.getBoundingClientRect()
    // Estimate row height from first row
    const firstRow = tableEl.querySelector('tr')
    dragState.rowHeight = firstRow ? firstRow.offsetHeight : 32
  }
  
  // Add event listeners
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'grabbing'
}

const onDragMove = (event) => {
  if (!dragState.isDragging || !dragState.tableRect) return
  
  const relativeY = event.clientY - dragState.tableRect.top
  const rowIndex = Math.floor(relativeY / dragState.rowHeight)
  const clampedIndex = Math.max(0, Math.min(articulationData.value.length - 1, rowIndex))
  
  // Update indicator position
  dragState.indicatorY = dragState.tableRect.top + (clampedIndex * dragState.rowHeight) + window.scrollY
  
  // Visual feedback for the target position
  updateDragIndicator(clampedIndex)
}

const updateDragIndicator = (targetIndex) => {
  // Remove previous highlights
  const rows = articulationTable.value?.$el?.querySelectorAll('.el-table__row')
  if (rows) {
    rows.forEach(row => row.classList.remove('drag-target-before', 'drag-target-after'))
    
    if (targetIndex >= 0 && targetIndex < rows.length) {
      if (targetIndex < dragState.dragIndex) {
        rows[targetIndex].classList.add('drag-target-before')
      } else if (targetIndex > dragState.dragIndex) {
        rows[targetIndex].classList.add('drag-target-after')
      }
    }
  }
}

const onDragEnd = (event) => {
  if (!dragState.isDragging || !dragState.tableRect) return
  
  const relativeY = event.clientY - dragState.tableRect.top
  const targetIndex = Math.floor(relativeY / dragState.rowHeight)
  const clampedTargetIndex = Math.max(0, Math.min(articulationData.value.length - 1, targetIndex))
  
  // Perform the reorder if target is different from source
  if (clampedTargetIndex !== dragState.dragIndex) {
    reorderArticulation(dragState.dragIndex, clampedTargetIndex)
  }
  
  // Cleanup
  dragState.isDragging = false
  dragState.dragIndex = -1
  dragState.tableRect = null
  
  // Remove event listeners
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  
  // Remove visual feedback
  const rows = articulationTable.value?.$el?.querySelectorAll('.el-table__row')
  if (rows) {
    rows.forEach(row => row.classList.remove('drag-target-before', 'drag-target-after'))
  }
}

const reorderArticulation = (fromIndex, toIndex) => {
  if (fromIndex === toIndex) return
  
  // Save the current selected articulation ID for restoration
  const selectedId = selectedArticulation.value?.id
  
  // Perform the array reordering
  const item = articulationData.value.splice(fromIndex, 1)[0]
  articulationData.value.splice(toIndex, 0, item)
  
  // Restore the selected articulation
  if (selectedId) {
    selectedArticulation.value = articulationData.value.find(art => art.id === selectedId)
  }
}

// Methods
const createNewArticulation = (previousNote = null) => {
  const nextNote = previousNote ? getNextNote(previousNote) : 'C1'
  const defaultColors = ['#ff4500', '#ff8c00', '#ffd700', '#90ee90', '#00ced1', '#1e90ff', '#c71585', '#ff69b4', '#ba55d3', '#20b2aa']
  const colorIndex = (nextArticulationId - 1) % defaultColors.length
  
  return {
    id: nextArticulationId++,
    uuid: `arttype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // UUID unique pour chaque type
    name: '',
    input: nextNote,
    color: defaultColors[colorIndex],
    isPermanent: false,
    triggers: []
  }
}

const createNewTrigger = () => ({
  id: nextTriggerId++,
  activation: 'note',
  sequence: ''
})

const addArticulation = () => {
  const lastArticulation = articulationData.value[articulationData.value.length - 1]
  const previousNote = lastArticulation ? lastArticulation.input : null
  articulationData.value.push(createNewArticulation(previousNote))
}

const deleteArticulation = (index) => {
  const articulation = articulationData.value[index]
  if (selectedArticulation.value && selectedArticulation.value.id === articulation.id) {
    selectedArticulation.value = null
  }
  articulationData.value.splice(index, 1)
}

const deleteSelectedArticulations = () => {
  const selectedIds = selectedArticulations.value.map(row => row.id)
  articulationData.value = articulationData.value.filter(
    row => !selectedIds.includes(row.id)
  )
  if (selectedArticulation.value && selectedIds.includes(selectedArticulation.value.id)) {
    selectedArticulation.value = null
  }
  selectedArticulations.value = []
}

const selectArticulation = (row) => {
  selectedArticulation.value = row
  selectedTriggers.value = []
}

const getRowClassName = ({ row }) => {
  return selectedArticulation.value && selectedArticulation.value.id === row.id ? 'selected-row' : ''
}

const addTrigger = () => {
  if (!selectedArticulation.value) return
  selectedArticulation.value.triggers.push(createNewTrigger())
}

const deleteTrigger = (index) => {
  if (!selectedArticulation.value) return
  selectedArticulation.value.triggers.splice(index, 1)
}

const deleteSelectedTriggers = () => {
  if (!selectedArticulation.value) return
  const selectedIds = selectedTriggers.value.map(row => row.id)
  selectedArticulation.value.triggers = selectedArticulation.value.triggers.filter(
    row => !selectedIds.includes(row.id)
  )
  selectedTriggers.value = []
}

const handleArticulationSelectionChange = (selection) => {
  selectedArticulations.value = selection
}

const handleTriggerSelectionChange = (selection) => {
  selectedTriggers.value = selection
}

const onActivationChange = (row) => {
  if (row.activation === 'controller') {
    row.sequence = { controller: '', value: '' }
  } else {
    row.sequence = ''
  }
}

const formatActivationSummary = (triggers) => {
  if (!triggers || triggers.length === 0) {
    return '-'
  }
  
  return triggers.map(trigger => {
    switch (trigger.activation) {
      case 'note':
        return trigger.sequence || 'Note'
      case 'controller':
        if (trigger.sequence && typeof trigger.sequence === 'object') {
          const cc = trigger.sequence.controller
          const val = trigger.sequence.value
          return `CC${cc || '?'}:${val || '?'}`
        }
        return 'Controller'
      case 'program':
        return `PC${trigger.sequence || '?'}`
      case 'channel':
        return `Ch${trigger.sequence || '?'}`
      default:
        return trigger.activation || '?'
    }
  }).join('|')
}

const validateInput = (row) => {
  const noteRegex = /^[A-G][#b]?-?[0-9]$/i
  if (row.input && !noteRegex.test(row.input)) {
    ElMessage.warning('Format de note invalide. Utilisez le format C4, F#3, Bb-1, etc.')
  }
}

const validateNoteInput = (row) => {
  const noteRegex = /^[A-G][#b]?-?[0-9]$/i
  if (row.sequence && !noteRegex.test(row.sequence)) {
    ElMessage.warning('Format de note invalide. Utilisez le format C4, F#3, Bb-1, etc.')
  }
}

const saveToFile = () => {
  const dataStr = JSON.stringify(articulationData.value, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  
  const link = document.createElement('a')
  link.href = URL.createObjectURL(dataBlob)
  link.download = 'articulation-map.json'
  link.click()
  
  URL.revokeObjectURL(link.href)
  ElMessage.success('Articulation map sauvegardée')
}

const loadFromFile = () => {
  fileInput.value?.click()
}

const handleFileLoad = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (Array.isArray(data)) {
        articulationData.value = data.map(item => ({
          ...item,
          id: nextArticulationId++,
          uuid: item.uuid || `arttype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Ajouter UUID si manquant
          color: item.color || '#ff4500', // Default color if not present
          triggers: (item.triggers || []).map(trigger => ({
            ...trigger,
            id: nextTriggerId++
          }))
        }))
        selectedArticulation.value = null
        ElMessage.success('Articulation map chargée')
      } else {
        ElMessage.error('Format de fichier invalide')
      }
    } catch (error) {
      ElMessage.error('Erreur lors du chargement du fichier')
    }
  }
  reader.readAsText(file)
  
  // Reset input
  event.target.value = ''
}

const handleSave = () => {
  emit('save', articulationData.value)
  dialogVisible.value = false
}

const handleClose = () => {
  dialogVisible.value = false
}

// Initialize data
if (props.initialData.length > 0) {
  articulationData.value = props.initialData.map(item => ({
    ...item,
    id: nextArticulationId++,
    uuid: item.uuid || `arttype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Ajouter UUID si manquant
    color: item.color || '#ff4500', // Default color if not present
    triggers: (item.triggers || []).map(trigger => ({
      ...trigger,
      id: nextTriggerId++
    }))
  }))
} else {
  // Add one empty articulation by default
  addArticulation()
}
</script>

<style scoped>
.articulation-editor {
  min-height: 500px;
  position: relative;
}

.actions-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.triggers-actions {
  display: flex;
  gap: 8px;
}

.controller-inputs {
  display: flex;
  align-items: center;
}

.activation-summary {
  font-size: 12px;
  color: #606266;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-text {
  font-size: 12px;
}

.drag-handle {
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #c0c4cc;
  transition: color 0.2s;
}

.drag-handle:hover {
  color: #409EFF;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-indicator {
  position: fixed;
  height: 2px;
  background-color: #409EFF;
  border-radius: 1px;
  z-index: 9999;
  pointer-events: none;
  box-shadow: 0 0 4px rgba(64, 158, 255, 0.5);
}

:deep(.el-table__row.drag-target-before) {
  border-top: 2px solid #409EFF;
}

:deep(.el-table__row.drag-target-after) {
  border-bottom: 2px solid #409EFF;
}

:deep(.el-table .cell) {
  padding: 2px 4px;
  font-size: 12px;
}

:deep(.el-table) {
  font-size: 12px;
}

:deep(.el-input__inner) {
  font-size: 12px;
}

:deep(.el-select) {
  width: 100%;
}

:deep(.selected-row) {
  background-color: #f0f9ff;
}

:deep(.selected-row:hover > td) {
  background-color: #f0f9ff !important;
}
</style>