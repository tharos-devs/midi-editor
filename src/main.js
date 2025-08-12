// main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(ElementPlus)
/*
function applyCustomTheme(mode) {
  // Supprimer les anciens liens
  document.querySelectorAll('link[data-theme-custom]').forEach(link => link.remove())
  // Ajouter le bon fichier
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = mode === 'dark'
    ? '/src/themes/theme-dark.css'
    : '/src/themes/theme-light.css'
  link.setAttribute('data-theme-custom', 'true')
  document.head.appendChild(link)
}
*/
// Appliquer le thème au démarrage (après app.use(pinia))
/*
const settingsStore = useSettingsStore()
settingsStore.applyTheme()
applyCustomTheme(settingsStore.theme)

// Méthode globale pour changer le thème
app.config.globalProperties.$setElementTheme = (mode) => {
  settingsStore.setTheme(mode)
  applyCustomTheme(mode)
}

// Enregistrer tous les icônes Element Plus
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
*/
app.mount('#app')