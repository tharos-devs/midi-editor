import { ref, onMounted, onUnmounted } from 'vue'

export function useMouseInteractions(config) {
  // États réactifs
  const isDragging = ref(false)
  const isSelecting = ref(false)
  const isBrushing = ref(false)
  const isCommandPressed = ref(false)
  
  const currentItem = ref(null)
  const brushedItem = ref(null)
  const selectedItems = ref([])
  
  // Variables pour la sélection
  const selectionStartX = ref(0)
  const selectionStartY = ref(0)
  const selectionEndX = ref(0)
  const selectionEndY = ref(0)
  
  // Variables pour le drag
  const dragStart = ref({ x: 0, y: 0 })
  const dragInitialValues = ref(new Map())
  
  // Variables pour gérer proprement les états
  let mouseDownStarted = false
  let currentOperation = null // 'drag', 'select', 'brush', null
  let lastBrushedItemId = null
  
  // Système de mise à jour synchrone
  const pendingUpdates = ref(new Map())
  const isUpdating = ref(false)
  let updateFrame = null
  
  // Style du rectangle de sélection
  const getSelectionRectangle = () => {
    if (!isSelecting.value) {
      return { display: 'none' }
    }
    
    const startX = selectionStartX.value
    const startY = selectionStartY.value  
    const endX = selectionEndX.value
    const endY = selectionEndY.value
    
    const left = Math.min(startX, endX)
    const top = Math.min(startY, endY)
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)
    
    return {
      left: left + 'px',
      top: top + 'px',
      width: Math.max(2, width) + 'px',
      height: Math.max(2, height) + 'px',
    }
  }
  
  // Fonction pour nettoyer tous les états
  const resetAllStates = () => {
    isDragging.value = false
    isSelecting.value = false
    isBrushing.value = false
    isCommandPressed.value = false
    currentItem.value = null
    brushedItem.value = null
    dragInitialValues.value.clear()
    currentOperation = null
    mouseDownStarted = false
    lastBrushedItemId = null
    
    selectionStartX.value = 0
    selectionStartY.value = 0
    selectionEndX.value = 0
    selectionEndY.value = 0
    
    if (updateFrame) {
      cancelAnimationFrame(updateFrame)
      updateFrame = null
    }
    pendingUpdates.value.clear()
    isUpdating.value = false
  }
  
  // Mise à jour synchrone de toutes les barres
  const applySynchronousUpdates = () => {
    if (isUpdating.value || pendingUpdates.value.size === 0) return
    
    isUpdating.value = true
    
    const updatesToApply = new Map(pendingUpdates.value)
    pendingUpdates.value.clear()
    
    if (config.applyBatchUpdate) {
      config.applyBatchUpdate(updatesToApply)
    } else {
      for (const [itemId, value] of updatesToApply) {
        if (config.applyUpdate) {
          config.applyUpdate(itemId, value, false)
        }
      }
    }
    
    isUpdating.value = false
  }
  
  // Fonction pour programmer une mise à jour
  const scheduleUpdate = (itemId, value) => {
    pendingUpdates.value.set(itemId, value)
    
    if (updateFrame) {
      cancelAnimationFrame(updateFrame)
    }
    
    updateFrame = requestAnimationFrame(() => {
      applySynchronousUpdates()
      updateFrame = null
    })
  }
  
  // Gestionnaire mousedown
  const handleMouseDown = (event, item = null) => {
    event.preventDefault()
    event.stopPropagation()
    
    if (!config.containerRef?.value) return
    
    resetAllStates()
    mouseDownStarted = true
    
    const rect = config.containerRef.value.getBoundingClientRect()
    const relativeX = event.clientX - rect.left
    const relativeY = event.clientY - rect.top
    
    // Mode brush
    if (event.metaKey || event.ctrlKey) {
      currentOperation = 'brush'
      isBrushing.value = true
      isCommandPressed.value = true
      
      if (!item) {
        item = config.findItemAtPosition(event.clientX, event.clientY)
      }
      
      if (item) {
        brushedItem.value = item
        lastBrushedItemId = item.id
        
        const newVelocity = config.calculateValueFromPosition(event.clientY)
        scheduleUpdate(item.id, newVelocity)
        
        if (config.onBrushStart) {
          config.onBrushStart(event, item)
        }
      }
      return
    }
    
    // Mode drag
    if (item) {
      currentOperation = 'drag'
      isDragging.value = true
      currentItem.value = { ...item }
      dragStart.value = { x: event.clientX, y: event.clientY }
      
      const itemsToUpdate = selectedItems.value.includes(item.id) 
        ? selectedItems.value 
        : [item.id]
      
      dragInitialValues.value.clear()
      if (config.getCurrentItemValues) {
        const currentValues = config.getCurrentItemValues(itemsToUpdate)
        currentValues.forEach((value, key) => {
          dragInitialValues.value.set(key, value)
        })
      } else {
        dragInitialValues.value.set(item.id, { id: item.id, velocity: item.velocity, value: item.velocity })
      }
      
      if (config.onDragStart) {
        config.onDragStart(event, item, selectedItems.value)
      }
      return
    }
    
    // Mode sélection lasso
    currentOperation = 'select'
    isSelecting.value = true
    
    selectionStartX.value = relativeX
    selectionStartY.value = relativeY
    selectionEndX.value = relativeX
    selectionEndY.value = relativeY
    
    if (config.onSelectionStart) {
      config.onSelectionStart(event, { x: relativeX, y: relativeY })
    }
  }
  
  // Gestionnaire mousemove
  const handleMouseMove = (event) => {
    if (!mouseDownStarted || !config.containerRef?.value) return
    
    const rect = config.containerRef.value.getBoundingClientRect()
    const relativeX = event.clientX - rect.left
    const relativeY = event.clientY - rect.top
    
    // Mode brush
    if (currentOperation === 'brush' && isBrushing.value) {
      const item = config.findItemAtPosition(event.clientX, event.clientY)
      if (item && item.id !== lastBrushedItemId) {
        const newVelocity = config.calculateValueFromPosition(event.clientY)
        scheduleUpdate(item.id, newVelocity)
        
        brushedItem.value = item
        lastBrushedItemId = item.id
        
        if (config.onBrushMove) {
          config.onBrushMove(event, item)
        }
      } else if (item && item.id === lastBrushedItemId) {
        const newVelocity = config.calculateValueFromPosition(event.clientY)
        scheduleUpdate(item.id, newVelocity)
      }
      return
    }
    
    // Mode drag
    if (currentOperation === 'drag' && isDragging.value && currentItem.value) {
      let newValue
      if (config.calculateValueFromDelta) {
        const dragInitialEntry = dragInitialValues.value.get(currentItem.value.id)
        let initialValue
        if (dragInitialEntry && dragInitialEntry.value !== undefined) {
          initialValue = dragInitialEntry.value
        } else {
          initialValue = currentItem.value.velocity
        }
        
        newValue = config.calculateValueFromDelta(event.clientY, initialValue, dragStart.value.y)
      } else {
        newValue = config.calculateValueFromPosition(event.clientY)
      }
      
      newValue = Math.max(config.valueRange.min, Math.min(config.valueRange.max, newValue))
      
      currentItem.value = { ...currentItem.value, value: newValue, velocity: newValue }
      
      const itemsToUpdate = selectedItems.value.includes(currentItem.value.id) 
        ? selectedItems.value 
        : [currentItem.value.id]
      
      const allUpdates = new Map()
      
      itemsToUpdate.forEach(itemId => {
        let itemValue = newValue
        
        if (itemsToUpdate.length > 1 && dragInitialValues.value.has(itemId)) {
          const initialItemValue = dragInitialValues.value.get(itemId).value
          const dragEntry = dragInitialValues.value.get(currentItem.value.id)
          const initialCurrentValue = dragEntry?.value !== undefined ? dragEntry.value : currentItem.value.velocity
    
          const deltaValue = newValue - initialCurrentValue
          itemValue = Math.max(config.valueRange.min, Math.min(config.valueRange.max, initialItemValue + deltaValue))
        }
        
        allUpdates.set(itemId, itemValue)
      })
      
      for (const [itemId, value] of allUpdates) {
        scheduleUpdate(itemId, value)
      }
      
      if (config.onDragMove) {
        config.onDragMove(event, currentItem.value, 'drag')
      }
      return
    }
    
    // Mode sélection lasso
    if (currentOperation === 'select' && isSelecting.value) {
      selectionEndX.value = relativeX
      selectionEndY.value = relativeY
      
      const absoluteBounds = {
        startX: selectionStartX.value,
        startY: selectionStartY.value,
        endX: selectionEndX.value,
        endY: selectionEndY.value,
        containerLeft: rect.left,
        containerTop: rect.top
      }
      
      let itemsInSelection = []
      if (config.getItemsByBounds) {
        itemsInSelection = config.getItemsByBounds(absoluteBounds)
      }
      
      if (config.onSelectionUpdate) {
        config.onSelectionUpdate(itemsInSelection, absoluteBounds)
      }
      return
    }
  }
  
  // Gestionnaire mouseup
  const handleMouseUp = (event) => {
    if (!mouseDownStarted) return
    
    if (updateFrame) {
      cancelAnimationFrame(updateFrame)
      updateFrame = null
      applySynchronousUpdates()
    }
    
    if (currentOperation === 'brush' && isBrushing.value) {
      if (config.onBrushEnd) {
        config.onBrushEnd()
      }
      resetAllStates()
      return
    }
    
    if (currentOperation === 'drag' && isDragging.value) {
      if (config.onDragEnd) {
        const editedItems = selectedItems.value.includes(currentItem.value?.id) 
          ? selectedItems.value 
          : [currentItem.value?.id].filter(id => id !== undefined)
        config.onDragEnd(editedItems)
      }
      
      resetAllStates()
      return
    }
    
    if (currentOperation === 'select' && isSelecting.value) {
      const rect = config.containerRef.value.getBoundingClientRect()
      const absoluteBounds = {
        startX: selectionStartX.value,
        startY: selectionStartY.value,
        endX: selectionEndX.value,
        endY: selectionEndY.value,
        containerLeft: rect.left,
        containerTop: rect.top
      }
      
      let selectedItemsList = []
      if (config.getItemsByBounds) {
        selectedItemsList = config.getItemsByBounds(absoluteBounds)
      }
      
      if (!event.shiftKey) {
        selectedItems.value = selectedItemsList.map(item => item.id)
      } else {
        const newIds = selectedItemsList.map(item => item.id)
        const combined = [...new Set([...selectedItems.value, ...newIds])]
        selectedItems.value = combined
      }
      
      if (config.onSelectionEnd) {
        config.onSelectionEnd(selectedItemsList)
      }
      
      resetAllStates()
      return
    }
    
    resetAllStates()
  }
  
  // Écouteurs globaux
  const setupGlobalListeners = () => {
    const handleGlobalMouseMove = (event) => {
      if (mouseDownStarted && (isDragging.value || isSelecting.value || isBrushing.value)) {
        handleMouseMove(event)
      }
    }
    
    const handleGlobalMouseUp = (event) => {
      if (mouseDownStarted) {
        handleMouseUp(event)
      }
    }
    
    const handleMouseLeave = (event) => {
      if (mouseDownStarted && (isDragging.value || isSelecting.value || isBrushing.value)) {
        handleMouseUp(event)
      }
    }
    
    document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false })
    document.addEventListener('mouseup', handleGlobalMouseUp, { passive: false })
    document.addEventListener('mouseleave', handleMouseLeave, { passive: false })
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }
  
  let removeGlobalListeners = null
  
  onMounted(() => {
    removeGlobalListeners = setupGlobalListeners()
  })
  
  onUnmounted(() => {
    if (removeGlobalListeners) {
      removeGlobalListeners()
    }
    resetAllStates()
  })
  
  return {
    // États
    isDragging,
    isSelecting,
    isBrushing,
    isCommandPressed,
    currentItem,
    brushedItem,
    selectedItems,
    
    // Coordonnées de sélection
    selectionStartX,
    selectionStartY,
    selectionEndX,
    selectionEndY,
    
    // Méthodes
    getSelectionRectangle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetAllStates
  }
}