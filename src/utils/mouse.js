const ZOOM_FACTOR = 0.70; // Facteur de zoom

export function getScalingBoundingClientRect(event, element) {
  const rect = element.getBoundingClientRect()
  if (rect) {
    if (event) {
      // Pour les événements souris : diviser par le zoom
      const scaledX = (event.clientX - rect.left) / ZOOM_FACTOR
      const scaledY = (event.clientY - rect.top) / ZOOM_FACTOR
      return { x: scaledX, y: scaledY }
    } else {
      /*
      return {
        left: rect.left * (1 / ZOOM_FACTOR),
        top: rect.top * (1 / ZOOM_FACTOR),
        width: rect.width * (1 / ZOOM_FACTOR),
        height: rect.height * (1 / ZOOM_FACTOR),
        right: rect.right * (1 / ZOOM_FACTOR),
        bottom: rect.botto * (1 / ZOOM_FACTOR)
      }
      */
      return {
        left: rect.left * (1 / ZOOM_FACTOR),
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.botto
      }
    }
  }
}