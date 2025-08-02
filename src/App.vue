<template>
  <div id="app" class="midi-editor">
    <!-- Menu Bar -->
    <MenuBar />

    <!-- Tool Bar -->
    <ToolBar />

    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Left Column: Track List -->
      <div class="left-column" :style="{ width: uiStore.trackListTotalWidth + 'px' }">
        <TrackList />
      </div>

      <!-- Vertical Splitter -->
      <div
        class="vertical-splitter"
        @mousedown="startResizeTrackList"
      ></div>

      <!-- Right Column: Editor Area -->
      <div class="right-column">
        <!-- Timeline -->
        <div class="timeline-container">
          <div class="timeline-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }"></div>
          <div class="timeline-scroll sync-scroll-x">
            <TimeLine />
          </div>
        </div>
        <!-- TimeSignatureRuler -->
        <div class="timesignature-container">
          <div class="timesignature-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }"></div>
          <div class="timesignature-scroll sync-scroll-x">
            <TimeSignatureRuler />
          </div>
        </div>        

        <!-- Piano + Grid Area -->
        <div class="piano-grid-container">
          <div class="piano-keys-container sync-scroll-y" ref="pianoKeysContainerRef">
            <PianoKeys />
          </div>
          <div class="piano-grid-scroll sync-scroll-x sync-scroll-y" ref="pianoGridContainerRef">
            <PianoGrid />
          </div>
        </div>

        <!-- Horizontal Splitter -->
        <div
          class="horizontal-splitter"
          @mousedown="startResizeMidiLanes"
        ></div>

        <!-- MIDI Lanes -->
        <div class="midi-lanes-container" :style="{ height: uiStore.midiLanesHeight + 'px' }">
          <div class="midi-lanes-content">
            <!-- Spacer gauche -->
            <div class="midi-lanes-spacer" :style="{ width: uiStore.pianoKeysWidth + 'px' }">
              <MidiLaneInfos :selected-lane="selectedLane" />
            </div>
            
            <!-- Partie droite avec tabs et contenu -->
            <div class="midi-lanes-right">
              <div class="midi-lanes-tabs">
                <MidiLaneTabs @tab-selected="handleLaneSelection" />
              </div>
              <div class="midi-lanes-scroll sync-scroll-x">
                <MidiLanes :selected-lane="selectedLane" />
              </div>
            </div>
          </div>
        </div>       
      </div>
    </div>

    <!-- Status Bar -->
    <StatusBar />

    <!-- Transport Controls -->
    <TransportControls />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from './stores/ui'
import MenuBar from './components/MenuBar.vue'
import ToolBar from './components/ToolBar.vue'
import TrackList from './components/TrackList.vue'
import TimeLine from './components/TimeLine.vue'
import PianoKeys from './components/PianoKeys.vue'
import PianoGrid from './components/PianoGrid.vue'
import MidiLaneTabs from './components/MidiLaneTabs.vue'
import MidiLanes from './components/MidiLanes.vue'
import MidiLaneInfos from './components/MidiLaneInfos.vue'
import StatusBar from './components/StatusBar.vue'
import TimeSignatureRuler from './components/rulers/TimeSignatureRuler.vue'
import TransportControls from './components/TransportControls.vue'

const uiStore = useUIStore()

// Lane sélectionnée
const selectedLane = ref(null)

// Refs pour le scroll vertical piano/grid
const pianoGridContainerRef = ref(null)
const pianoKeysContainerRef = ref(null)

// Redimensionnement
let isResizingTrackList = false
let isResizingMidiLanes = false
let startX = 0
let startY = 0
let startWidth = 0
let startHeight = 0

// Gestion de la sélection de lane
const handleLaneSelection = (lane) => {
  selectedLane.value = lane
}

// Synchronisation du scroll horizontal (générique via classe)
let scrollSyncing = false
function syncHorizontalScroll(e) {
  if (scrollSyncing) return
  scrollSyncing = true
  const source = e.target
  const scrollLeft = source.scrollLeft
  document.querySelectorAll('.sync-scroll-x').forEach(div => {
    if (div !== source) div.scrollLeft = scrollLeft
  })
  scrollSyncing = false
}

// Synchronisation du scroll vertical (générique via classe)
let scrollSyncingY = false
function syncVerticalScrollGeneric(e) {
  if (scrollSyncingY) return
  scrollSyncingY = true
  const source = e.target
  const scrollTop = source.scrollTop
  document.querySelectorAll('.sync-scroll-y').forEach(div => {
    if (div !== source) div.scrollTop = scrollTop
  })
  scrollSyncingY = false
}

// Redimensionnement TrackList
const startResizeTrackList = (e) => {
  e.preventDefault()
  isResizingTrackList = true
  startX = e.clientX
  startWidth = uiStore.trackListTotalWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeTrackList)
  document.addEventListener('mouseup', stopResizeTrackList)
}

const resizeTrackList = (e) => {
  if (!isResizingTrackList) return
  e.preventDefault()
  const deltaX = e.clientX - startX
  const newWidth = Math.max(300, Math.min(800, startWidth + deltaX))
  uiStore.setTrackListWidth(newWidth)
}

const stopResizeTrackList = () => {
  isResizingTrackList = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeTrackList)
  document.removeEventListener('mouseup', stopResizeTrackList)
}

// Redimensionnement MidiLanes
const startResizeMidiLanes = (e) => {
  e.preventDefault()
  isResizingMidiLanes = true
  startY = e.clientY
  startHeight = uiStore.midiLanesHeight
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeMidiLanes)
  document.addEventListener('mouseup', stopResizeMidiLanes)
}

const resizeMidiLanes = (e) => {
  if (!isResizingMidiLanes) return
  e.preventDefault()
  const deltaY = startY - e.clientY
  const newHeight = Math.max(100, Math.min(400, startHeight + deltaY))
  uiStore.setMidiLanesHeight(newHeight)
}

const stopResizeMidiLanes = () => {
  isResizingMidiLanes = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeMidiLanes)
  document.removeEventListener('mouseup', stopResizeMidiLanes)
}

onMounted(() => {
  // Scroll horizontal
  document.querySelectorAll('.sync-scroll-x').forEach(div => {
    div.addEventListener('scroll', syncHorizontalScroll)
  })
  // Scroll vertical générique
  document.querySelectorAll('.sync-scroll-y').forEach(div => {
    div.addEventListener('scroll', syncVerticalScrollGeneric)
  })

  // Exposer les fonctions de synchronisation au store
  uiStore.setSyncFunctions({
    syncHorizontalScroll,
    syncVerticalScroll: syncVerticalScrollGeneric
  })
})

onUnmounted(() => {
  document.querySelectorAll('.sync-scroll-x').forEach(div => {
    div.removeEventListener('scroll', syncHorizontalScroll)
  })
  document.querySelectorAll('.sync-scroll-y').forEach(div => {
    div.removeEventListener('scroll', syncVerticalScrollGeneric)
  })
  document.removeEventListener('mousemove', resizeTrackList)
  document.removeEventListener('mouseup', stopResizeTrackList)
  document.removeEventListener('mousemove', resizeMidiLanes)
  document.removeEventListener('mouseup', stopResizeMidiLanes)
})
</script>

<style scoped>
.midi-editor {
  height: calc(100vh);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-column {
  background: var(--left-column-bg, #f5f5f5);
  border-right: 1px solid var(--border-color, #ddd);
  min-width: 300px;
  max-width: 800px;
  flex-shrink: 0;
}

.vertical-splitter {
  width: 4px;
  background: var(--splitter-bg, #ddd);
  cursor: col-resize;
  user-select: none;
  position: relative;
  z-index: 10;
}

.vertical-splitter:hover {
  background: var(--splitter-hover-bg, #999);
}

.right-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Timeline */
.timeline-container {
  height: 40px;
  display: flex;
  border-bottom: 1px solid var(--border-color, #ddd);
  background: var(--timeline-bg, #fafafa);
}

.timeline-spacer {
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--timeline-spacer-bg, #f0f0f0);
}

.timeline-scroll {
  flex: 1;
  overflow: hidden;
}

/* TimeSignatureRuler */
.timesignature-container {
  height: 20px;
  display: flex;
  border-bottom: 1px solid var(--border-color, #ddd);
  background: var(--timesignature-bg, #fafafa);
}

.timesignature-spacer {
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--timesignature-spacer-bg, #f0f0f0);
}

.timesignature-scroll {
  flex: 1;
  overflow: hidden;
}

/* Piano + Grid Area */
.piano-grid-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.piano-keys-container {
  width: v-bind('uiStore.pianoKeysWidth + "px"');
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #ddd);
  background: var(--piano-keys-bg, #f8f8f8);
  overflow: hidden;
}

.piano-grid-scroll {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
}

.horizontal-splitter {
  height: 4px;
  background: var(--splitter-bg, #ddd);
  cursor: row-resize;
  user-select: none;
  position: relative;
  z-index: 10;
}

.horizontal-splitter:hover {
  background: var(--splitter-hover-bg, #999);
}

/* MIDI Lanes */
.midi-lanes-container {
  border-top: 1px solid var(--border-color, #ddd);
  background: var(--midi-lanes-bg, #fafafa);
  min-height: 100px;
  max-height: 400px;
}

.midi-lanes-content {
  display: flex;
  height: 100%;
}

.midi-lanes-spacer {
  flex-shrink: 0;
  background: var(--midi-lanes-spacer-bg, #f0f0f0);
  border-right: 1px solid var(--border-color, #ddd);
  height: 100%;
}

.midi-lanes-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.midi-lanes-tabs {
  flex-shrink: 0;
  height: 40px;
  border-bottom: 1px solid var(--border-color, #ddd);
}

.midi-lanes-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>