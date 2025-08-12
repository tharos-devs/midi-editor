
<template>
  <button
    v-bind="$attrs"
    :title="tooltip"
    :disabled="disabled"
    class="media-button"
    :class="{ disabled }"
    :style="buttonStyle"
    @click="handleClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <svg 
      :viewBox="iconViewBox" 
      xmlns="http://www.w3.org/2000/svg"
      class="media-icon"
      v-html="iconSvg"
    ></svg>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  icon: {
    type: String,
    required: true,
    validator: (value) => [
      'play-button', 'stop-button', 'record-button', 'rewind-button', 
      'forward-button', 'loop-button', 'begin-button', 'end-button',
      'play-icon', 'stop-icon', 'record-icon', 'rewind-icon',
      'forward-icon', 'loop-icon', 'begin-icon', 'end-icon'
    ].includes(value)
  },
  color: {
    type: String,
    default: '#000000'
  },
  hoverColor: {
    type: String,
    default: '#888888'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  tooltip: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['click'])

const isHovered = ref(false)

// Définition des icônes SVG
const iconDefinitions = {
  'play-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="22,18 22,42 42,30" fill="currentColor"/>
    `
  },
  'stop-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <rect x="18" y="18" width="24" height="24" fill="currentColor"/>
    `
  },
  'record-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="30" cy="30" r="12" fill="currentColor"/>
    `
  },
  'rewind-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="32,18 20,30 32,42" fill="currentColor"/>
      <polygon points="42,18 30,30 42,42" fill="currentColor"/>
    `
  },
  'forward-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="18,18 30,30 18,42" fill="currentColor"/>
      <polygon points="28,18 40,30 28,42" fill="currentColor"/>
    `
  },
  'loop-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M18,30 Q18,18 30,18 Q42,18 42,30" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="42,28 47,33 37,33" fill="currentColor"/>
      <path d="M42,30 Q42,42 30,42 Q18,42 18,30" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="18,32 13,27 23,27" fill="currentColor"/>
    `
  },
  'begin-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <rect x="18" y="18" width="6" height="24" fill="currentColor"/>
      <polygon points="40,18 24,30 40,42" fill="currentColor"/>
    `
  },
  'end-button': {
    viewBox: '0 0 60 60',
    content: `
      <rect width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>
      <rect x="36" y="18" width="6" height="24" fill="currentColor"/>
      <polygon points="20,18 36,30 20,42" fill="currentColor"/>
    `
  },
  // Versions sans cadre
  'play-icon': {
    viewBox: '0 0 38 40',
    content: `
      <polygon points="10,8 10,32 28,20" fill="currentColor"/>
    `
  },
  'stop-icon': {
    viewBox: '0 0 40 40',
    content: `
      <rect x="8" y="8" width="24" height="24" fill="currentColor"/>
    `
  },
  'record-icon': {
    viewBox: '0 0 40 40',
    content: `
      <circle cx="20" cy="20" r="12" fill="currentColor"/>
    `
  },
  'rewind-icon': {
    viewBox: '0 0 42 40',
    content: `
      <polygon points="22,8 10,20 22,32" fill="currentColor"/>
      <polygon points="32,8 20,20 32,32" fill="currentColor"/>
    `
  },
  'forward-icon': {
    viewBox: '0 0 38 40',
    content: `
      <polygon points="8,8 20,20 8,32" fill="currentColor"/>
      <polygon points="18,8 30,20 18,32" fill="currentColor"/>
    `
  },
  'loop-icon': {
    viewBox: '0 0 40 40',
    content: `
      <path d="M8,20 Q8,8 20,8 Q32,8 32,20" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="32,18 37,23 27,23" fill="currentColor"/>
      <path d="M32,20 Q32,32 20,32 Q8,32 8,20" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="8,22 3,17 13,17" fill="currentColor"/>
    `
  },
  'begin-icon': {
    viewBox: '0 0 40 40',
    content: `
      <rect x="8" y="8" width="5" height="24" fill="currentColor"/>
      <polygon points="30,8 13,20 30,32" fill="currentColor"/>
    `
  },
  'end-icon': {
    viewBox: '0 0 40 40',
    content: `
      <rect x="27" y="8" width="5" height="24" fill="currentColor"/>
      <polygon points="10,8 27,20 10,32" fill="currentColor"/>
    `
  }
}
const iconViewBox = computed(() => {
  const definition = iconDefinitions[props.icon]
  return definition ? definition.viewBox : '0 0 60 75'
})

const iconSvg = computed(() => {
  const definition = iconDefinitions[props.icon]
  return definition ? definition.content : ''
})

const buttonStyle = computed(() => {
  const currentColor = props.disabled 
    ? '#cccccc' 
    : (isHovered.value ? props.hoverColor : props.color)
  
  return {
    color: currentColor
  }
})

const handleClick = (event) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>
<style scoped>
.media-button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  display: inline-block;
  transition: color 0.2s ease;
  outline: none;
}

.media-button:focus {
  outline: none;
}

.media-button.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.media-icon {
  width: 100%;
  height: 100%;
  display: block;
}
</style>