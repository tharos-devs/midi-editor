import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    theme: 'light'
  }),
  actions: {
    setTheme(mode) {
      this.theme = mode
      localStorage.setItem('element-theme', mode)
      if (mode === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    },
    applyTheme() {
      const saved = localStorage.getItem('element-theme')
      this.setTheme(saved || this.theme)
    }
  }
})