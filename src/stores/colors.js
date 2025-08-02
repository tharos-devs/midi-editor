// stores/colors.js
import { defineStore } from 'pinia'

export const useColorsStore = defineStore('colors', () => {

  const lerp = (a, b, t) => a + (b - a) * t

  const interpolateColor = (color1, color2, t) => {
    const c1 = parseInt(color1.slice(1), 16)
    const c2 = parseInt(color2.slice(1), 16)

    const r1 = (c1 >> 16) & 0xff
    const g1 = (c1 >> 8) & 0xff
    const b1 = c1 & 0xff

    const r2 = (c2 >> 16) & 0xff
    const g2 = (c2 >> 8) & 0xff
    const b2 = c2 & 0xff

    const r = Math.round(lerp(r1, r2, t))
    const g = Math.round(lerp(g1, g2, t))
    const b = Math.round(lerp(b1, b2, t))

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }

  const colorStops = [
    { value: 0, color: '#4F39F6' },
    { value: 12, color: '#155DFC' },
    { value: 23, color: '#2984D1' },
    { value: 34, color: '#2C92B8' },
    { value: 45, color: '#2A9689' },
    { value: 56, color: '#2D9966' },
    { value: 67, color: '#2AA63E' },
    { value: 78, color: '#5EA529' },
    { value: 89, color: '#D0872E' },
    { value: 100, color: '#E1712B' },
    { value: 111, color: '#F54927' },
    { value: 122, color: '#E7180B' }
  ]

  const getVelocityColor = (velocity) => {
    velocity = Math.max(0, Math.min(velocity, 127))

    for (let i = 0; i < colorStops.length - 1; i++) {
      const stop1 = colorStops[i]
      const stop2 = colorStops[i + 1]

      if (velocity >= stop1.value && velocity <= stop2.value) {
        const t = (velocity - stop1.value) / (stop2.value - stop1.value)
        return interpolateColor(stop1.color, stop2.color, t)
      }
    }

    return colorStops[colorStops.length - 1].color
  }

  return {
    getVelocityColor
  }
})