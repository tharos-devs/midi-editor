// composables/useTimeSignature.js
import { computed } from 'vue'
import { useMidiStore } from '@/stores/midi'
import { useUIStore } from '@/stores/ui'

export function useTimeSignature() {
  const midiStore = useMidiStore()
  const uiStore = useUIStore()

  // Configuration par défaut
  const DEFAULT_SIGNATURE = { numerator: 4, denominator: 4 }
  const DEFAULT_MEASURES = 32
  const BASE_PIXELS_PER_QUARTER = 40

  // Calculer les pixels par noire avec le zoom
  const PIXELS_PER_QUARTER = computed(() => {
    const basePixels = BASE_PIXELS_PER_QUARTER * uiStore.horizontalZoom
    // Arrondir pour éviter les nombres flottants problématiques
    return Math.round(basePixels * 100) / 100 // Précision à 2 décimales
  })

  // Convertir ticks en temps (secondes) en utilisant les informations du MIDI
  const ticksToTime = (ticks) => {
    if (!midiStore.isLoaded) return 0
    const ppq = midiStore.midiInfo.ppq || 480
    const tempo = midiStore.getCurrentTempo || 120
    return (ticks / ppq) * (60 / tempo)
  }

  // Convertir temps (secondes) en ticks
  const timeToTicks = (time) => {
    if (!midiStore.isLoaded) return 0
    const ppq = midiStore.midiInfo.ppq || 480
    const tempo = midiStore.getCurrentTempo || 120
    return (time * tempo * ppq) / 60
  }

  // Calculer la durée d'une mesure en ticks selon la signature rythmique
  const getMeasureDurationInTicks = (numerator, denominator, tempo = 120) => {
    const ppq = midiStore.midiInfo.ppq || 480
    const quarterNotesPerMeasure = numerator * (4 / denominator)
    return quarterNotesPerMeasure * ppq
  }

  // Calculer la durée d'une mesure en pixels
  const getMeasureWidthInPixels = (numerator, denominator) => {
    const quarterNotesPerMeasure = numerator * (4 / denominator)
    return quarterNotesPerMeasure * PIXELS_PER_QUARTER.value
  }

  // Calculer la largeur d'une subdivision (beat) en pixels
  const getBeatWidthInPixels = (denominator) => {
    const quarterNotesPerBeat = 4 / denominator
    return quarterNotesPerBeat * PIXELS_PER_QUARTER.value
  }

  // Créer une map des sections avec leurs signatures
  const getTimeSignatureSections = computed(() => {
    if (!midiStore.isLoaded || !midiStore.timeSignatureEvents?.length) {
      return [{
        startTime: 0,
        endTime: Infinity,
        signature: DEFAULT_SIGNATURE
      }]
    }

    const events = midiStore.timeSignatureEvents
    // CORRECTION: Utiliser la durée basée sur le dernier événement MIDI
    const totalDuration = getLastMidiEventTime.value || midiStore.midiInfo.duration || 60

    const processedEvents = []

    events.forEach((event) => {
      let eventTime = event.time
      if ((eventTime === 0 || eventTime === undefined) && event.ticks !== undefined) {
        eventTime = ticksToTime(event.ticks)
      }
      let numerator = event.numerator || event.timeSignature?.[0] || event[0] || 4
      let denominator = event.denominator || event.timeSignature?.[1] || event[1] || 4
      if (Array.isArray(event) && event.length >= 2) {
        numerator = event[0]
        denominator = event[1]
      }
      processedEvents.push({
        time: eventTime,
        numerator: numerator,
        denominator: denominator,
        originalEvent: event
      })
    })

    processedEvents.sort((a, b) => a.time - b.time)

    const uniqueEvents = []
    const eventsByTime = {}

    processedEvents.forEach(event => {
      const timeKey = event.time.toFixed(3)
      if (!eventsByTime[timeKey]) {
        eventsByTime[timeKey] = []
      }
      eventsByTime[timeKey].push(event)
    })

    Object.keys(eventsByTime).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(timeKey => {
      const eventsAtTime = eventsByTime[timeKey]
      const lastEvent = eventsAtTime[eventsAtTime.length - 1]
      uniqueEvents.push(lastEvent)
    })

    const sections = []

    if (uniqueEvents.length > 0 && uniqueEvents[0].time > 0.01) {
      sections.push({
        startTime: 0,
        endTime: uniqueEvents[0].time,
        signature: DEFAULT_SIGNATURE
      })
    }

    for (let i = 0; i < uniqueEvents.length; i++) {
      const event = uniqueEvents[i]
      const nextEvent = uniqueEvents[i + 1]
      const startTime = event.time
      const endTime = nextEvent ? nextEvent.time : totalDuration
      if (endTime > startTime + 0.01) {
        sections.push({
          startTime: startTime,
          endTime: endTime,
          signature: {
            numerator: event.numerator,
            denominator: event.denominator
          }
        })
      }
    }

    if (sections.length === 0) {
      sections.push({
        startTime: 0,
        endTime: totalDuration,
        signature: DEFAULT_SIGNATURE
      })
    }

    return sections
  })

  // Obtenir la signature rythmique active à un temps donné (en secondes)
  const getTimeSignatureAtTime = (timeInSeconds) => {
    const sections = getTimeSignatureSections.value
    for (const section of sections) {
      if (timeInSeconds >= section.startTime && timeInSeconds < section.endTime) {
        return section.signature
      }
    }
    return sections.length > 0 ? sections[sections.length - 1].signature : DEFAULT_SIGNATURE
  }

  // NOUVEAU: Trouver le dernier événement MIDI (notes + control changes + tous événements)
  const getLastMidiEventTime = computed(() => {
    console.log('🔍 getLastMidiEventTime appelé - isLoaded:', midiStore.isLoaded)
    
    if (!midiStore.isLoaded) {
      console.log('🔍 MIDI non chargé, retour durée par défaut:', midiStore.midiInfo.duration || 0)
      return midiStore.midiInfo.duration || 0
    }
    
    let lastTime = 0
    
    // 1. Vérifier les notes (noteOn + noteOff)
    if (midiStore.notes?.length) {
      for (const note of midiStore.notes) {
        const noteEndTime = note.time + (note.duration || 0)
        if (noteEndTime > lastTime) {
          lastTime = noteEndTime
        }
      }
    }
    
    // 2. Vérifier les Control Changes (CC)
    if (midiStore.midiCC?.length) {
      for (const cc of midiStore.midiCC) {
        if (cc.time > lastTime) {
          lastTime = cc.time
        }
      }
    }
    
    // 3. Vérifier les événements de tempo
    if (midiStore.tempoEvents?.length) {
      for (const tempo of midiStore.tempoEvents) {
        if (tempo.time > lastTime) {
          lastTime = tempo.time
        }
      }
    }
    
    // 4. Vérifier les événements de signature temporelle
    if (midiStore.timeSignatureEvents?.length) {
      for (const timeSig of midiStore.timeSignatureEvents) {
        if (timeSig.time > lastTime) {
          lastTime = timeSig.time
        }
      }
    }
    
    // 5. Vérifier les événements de signature tonale
    if (midiStore.keySignatureEvents?.length) {
      for (const keySig of midiStore.keySignatureEvents) {
        if (keySig.time > lastTime) {
          lastTime = keySig.time
        }
      }
    }
    
    const finalTime = Math.max(lastTime, midiStore.midiInfo.duration || 0)
    
    console.log('🎵 Calcul du dernier événement MIDI:', {
      notes: midiStore.notes?.length || 0,
      controlChanges: midiStore.midiCC?.length || 0,
      tempoEvents: midiStore.tempoEvents?.length || 0,
      timeSignatureEvents: midiStore.timeSignatureEvents?.length || 0,
      keySignatureEvents: midiStore.keySignatureEvents?.length || 0,
      lastEventTime: lastTime.toFixed(3) + 's',
      midiFileDuration: (midiStore.midiInfo.duration || 0).toFixed(3) + 's',
      finalResult: finalTime.toFixed(3) + 's'
    })
    
    return finalTime
  })

  // CORRIGÉ: Calculer les mesures jusqu'à la fin de la mesure contenant la dernière note
  const calculateTotalMeasures = computed(() => {
    console.log('📏 calculateTotalMeasures appelé:', {
      isLoaded: midiStore.isLoaded,
      midiInfoDuration: midiStore.midiInfo.duration || 0
    })
    
    if (!midiStore.isLoaded) {
      console.log('📏 MIDI non chargé, utilisation default:', DEFAULT_MEASURES + ' mesures')
      return DEFAULT_MEASURES
    }
    
    // Utiliser la fin du dernier événement MIDI au lieu de midiInfo.duration
    const lastEventTime = getLastMidiEventTime.value
    const sections = getTimeSignatureSections.value
    const tempo = midiStore.getCurrentTempo || 120
    
    let totalMeasures = 0
    let currentTime = 0
    
    for (const section of sections) {
      const sectionStart = Math.max(section.startTime, currentTime)
      const sectionEnd = Math.min(section.endTime, lastEventTime)
      
      if (sectionEnd > sectionStart) {
        const quarterNotesPerMeasure = section.signature.numerator * (4 / section.signature.denominator)
        const measureDuration = quarterNotesPerMeasure * (60 / tempo)
        
        // Calculer combien de mesures COMPLÈTES sont nécessaires pour couvrir cette section
        const measuresInSection = Math.ceil((sectionEnd - sectionStart) / measureDuration)
        totalMeasures += measuresInSection
        currentTime = sectionStart + (measuresInSection * measureDuration)
        
        console.log('📏 Section signature:', {
          signature: `${section.signature.numerator}/${section.signature.denominator}`,
          durée: (sectionEnd - sectionStart).toFixed(3) + 's',
          mesuresCalculées: measuresInSection,
          duréeCouverte: (measuresInSection * measureDuration).toFixed(3) + 's'
        })
      }
    }
    
    const result = Math.max(totalMeasures, 1)
    console.log('📊 Calcul total mesures:', {
      baseSur: 'Dernière note + mesures complètes',
      totalMesures: result,
      tempsCouvert: currentTime.toFixed(3) + 's'
    })
    
    return result
  })

  const getTimeSignatureAtTicks = (ticks) => {
    return getTimeSignatureAtTime(ticksToTime(ticks))
  }

  const measuresWithSignatures = computed(() => {
    if (!midiStore.isLoaded) {
      const totalMeasures = calculateTotalMeasures.value
      return generateDefaultMeasures(totalMeasures)
    }
    
    let sections = getTimeSignatureSections.value
    const tempo = midiStore.getCurrentTempo || 120
    // CORRECTION: Utiliser la durée basée sur le dernier événement MIDI au lieu de midiInfo.duration
    const totalDuration = getLastMidiEventTime.value
    console.log('📐 measuresWithSignatures utilise totalDuration =', totalDuration.toFixed(3) + 's (source: getLastMidiEventTime)')
    
    // CORRECTION CRUCIALE: Étendre la dernière section jusqu'à la nouvelle durée
    if (sections.length > 0 && totalDuration > sections[sections.length - 1].endTime) {
      const oldEndTime = sections[sections.length - 1].endTime
      sections = [...sections]  // Copie pour éviter la mutation
      sections[sections.length - 1] = {
        ...sections[sections.length - 1],
        endTime: totalDuration
      }
      console.log('🔧 Section finale étendue:', {
        de: oldEndTime.toFixed(3) + 's',
        à: totalDuration.toFixed(3) + 's',
        extension: (totalDuration - oldEndTime).toFixed(3) + 's'
      })
    } else {
      console.log('🔧 Pas d\'extension nécessaire:', {
        sectionsLength: sections.length,
        totalDuration: totalDuration.toFixed(3) + 's',
        lastSectionEnd: sections.length > 0 ? sections[sections.length - 1].endTime.toFixed(3) + 's' : 'N/A'
      })
    }
    
    const measures = []
    let measureNumber = 1
    let cumulativePixels = 0
    
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex]
      const sectionStartTime = section.startTime
      const sectionEndTime = Math.min(section.endTime, totalDuration)
      const sectionDuration = sectionEndTime - sectionStartTime
      
      if (sectionDuration <= 0) continue
      
      const quarterNotesPerMeasure = section.signature.numerator * (4 / section.signature.denominator)
      const measureDurationSeconds = quarterNotesPerMeasure * (60.0 / tempo) // Précision forcée
      
      // ✅ Calcul précis de la largeur
      const measureWidth = Math.round((quarterNotesPerMeasure * PIXELS_PER_QUARTER.value) * 100) / 100
      const beatWidth = Math.round((measureWidth / section.signature.numerator) * 100) / 100
      
      const measuresInSection = Math.ceil(sectionDuration / measureDurationSeconds)
      
      console.log(`🔢 Section ${sectionIndex}: ${section.signature.numerator}/${section.signature.denominator}, durée: ${sectionDuration.toFixed(2)}s, mesureDuration: ${measureDurationSeconds.toFixed(2)}s, mesuresCalculées: ${measuresInSection}`)
      
      for (let i = 0; i < measuresInSection; i++) {
        const measureStartTime = sectionStartTime + (i * measureDurationSeconds)
        const measureEndTime = Math.min(measureStartTime + measureDurationSeconds, sectionEndTime)
        
        if (measureStartTime >= totalDuration) break
        
        const measureDurationTicks = getMeasureDurationInTicks(
          section.signature.numerator, 
          section.signature.denominator, 
          tempo
        )
        
        const measure = {
          number: measureNumber,
          startPixel: Math.round(cumulativePixels * 100) / 100, // Précision contrôlée
          startTicks: timeToTicks(measureStartTime),
          startTime: measureStartTime,  
          endTime: measureEndTime,
          measureWidth: measureWidth,
          beatWidth: beatWidth,
          beatsCount: section.signature.numerator,
          beats: Array.from({ length: section.signature.numerator }, (_, i) => i + 1),
          timeSignature: { ...section.signature },
          signatureChange: (sectionIndex > 0 && i === 0) || measureNumber === 1,
          durationTicks: measureDurationTicks,
          endTicks: timeToTicks(measureEndTime)
        }

        measures.push(measure)
        measureNumber++
        cumulativePixels += measureWidth
        
        // Debug: log chaque mesure générée
        console.log(`📏 Mesure ${measure.number}: ${measure.startTime.toFixed(2)}s-${measure.endTime.toFixed(2)}s, largeur: ${measureWidth.toFixed(0)}px, cumul: ${cumulativePixels.toFixed(0)}px (section ${sectionIndex}, index ${i})`)
      }
    }
    
    return measures
  })

  // CONVERSIONS TEMPS/PIXELS - Version simplifiée basée sur le tempo constant
  const timeToPixels = (timeInSeconds) => {
    if (timeInSeconds <= 0) return 0
    
    const tempo = midiStore.getCurrentTempo || 120
    const quarterNotesPerSecond = tempo / 60
    const quarterNotes = timeInSeconds * quarterNotesPerSecond
    return quarterNotes * PIXELS_PER_QUARTER.value
  }

  const pixelsToTime = (pixels) => {
    if (pixels <= 0) return 0
    
    const tempo = midiStore.getCurrentTempo || 120
    const quarterNotesPerSecond = tempo / 60
    const quarterNotes = pixels / PIXELS_PER_QUARTER.value
    return quarterNotes / quarterNotesPerSecond
  }

  // CONVERSION TEMPS/PIXELS AVEC SIGNATURES - Pour une précision maximale
  const timeToPixelsWithSignatures = (timeInSeconds) => {
    if (timeInSeconds <= 0) return 0
    
    const measures = measuresWithSignatures.value
    
    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i]
      
      if (timeInSeconds >= measure.startTime && timeInSeconds < measure.endTime) {
        const timeInMeasure = timeInSeconds - measure.startTime
        const measureProgress = timeInMeasure / (measure.endTime - measure.startTime)
        const pixelsInMeasure = measureProgress * measure.measureWidth
        return measure.startPixel + pixelsInMeasure
      }
    }
    
    // Si le temps dépasse toutes les mesures, extrapoler
    if (measures.length > 0 && timeInSeconds >= measures[measures.length - 1].endTime) {
      const lastMeasure = measures[measures.length - 1]
      const extraTime = timeInSeconds - lastMeasure.endTime
      const extraPixels = timeToPixels(extraTime) // Utiliser la conversion simple pour l'extrapolation
      return lastMeasure.startPixel + lastMeasure.measureWidth + extraPixels
    }
    
    return 0
  }

  const pixelsToTimeWithSignatures = (pixels) => {
    if (pixels <= 0) return 0
    
    const measures = measuresWithSignatures.value
    
    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i]
      
      if (pixels >= measure.startPixel && pixels < measure.startPixel + measure.measureWidth) {
        const pixelsInMeasure = pixels - measure.startPixel
        const measureProgress = pixelsInMeasure / measure.measureWidth
        const timeInMeasure = measureProgress * (measure.endTime - measure.startTime)
        return measure.startTime + timeInMeasure
      }
    }
    
    // Si les pixels dépassent toutes les mesures, extrapoler
    if (measures.length > 0 && pixels >= measures[measures.length - 1].startPixel + measures[measures.length - 1].measureWidth) {
      const lastMeasure = measures[measures.length - 1]
      const extraPixels = pixels - (lastMeasure.startPixel + lastMeasure.measureWidth)
      const extraTime = pixelsToTime(extraPixels) // Utiliser la conversion simple pour l'extrapolation
      return lastMeasure.endTime + extraTime
    }
    
    return 0
  }
  
  const durationToPixels = (startTime, duration) => {
    if (duration <= 0) return 1

    if (midiStore.isLoaded && midiStore.midiInfo.ppq) {
      const tempo = midiStore.getCurrentTempo || 120

      // Méthode 1: Conversion directe temps → noires
      const quarterNotesMethod1 = (duration * tempo) / 60
      const pixelsMethod1 = quarterNotesMethod1 * PIXELS_PER_QUARTER.value

      // Utiliser la méthode 1 (la plus directe)
      const finalPixels = Math.max(1, Math.round(pixelsMethod1 * 100) / 100)

      return finalPixels
    }
    
    return Math.max(1, timeToPixels(duration))
  }

  const pixelsToDuration = (startPixels, widthPixels) => {
    const startTime = pixelsToTimeWithSignatures(startPixels)
    const endTime = pixelsToTimeWithSignatures(startPixels + widthPixels)
    return endTime - startTime
  }

  // Générer des mesures par défaut (4/4)
  const generateDefaultMeasures = (totalMeasures) => {
    const measures = []
    const signature = DEFAULT_SIGNATURE
    const tempo = midiStore.getCurrentTempo || 120
    const quarterNotesPerMeasure = signature.numerator * (4 / signature.denominator)
    const measureDurationSeconds = quarterNotesPerMeasure * (60 / tempo)
    
    // ✅ Calculer avec la même logique que les mesures avec signatures
    const measureWidth = (measureDurationSeconds / 60) * tempo * PIXELS_PER_QUARTER.value
    const beatWidth = measureWidth / signature.numerator
    
    for (let measureNumber = 1; measureNumber <= totalMeasures; measureNumber++) {
      const startTime = (measureNumber - 1) * measureDurationSeconds
      measures.push({
        number: measureNumber,
        startPixel: (measureNumber - 1) * measureWidth,
        startTicks: timeToTicks(startTime),
        startTime: startTime,
        endTime: startTime + measureDurationSeconds,
        measureWidth: measureWidth,
        beatWidth: beatWidth,
        beatsCount: signature.numerator,
        beats: Array.from({ length: signature.numerator }, (_, i) => i + 1),
        timeSignature: { ...signature },
        signatureChange: measureNumber === 1,
        durationTicks: getMeasureDurationInTicks(signature.numerator, signature.denominator, tempo),
        endTicks: timeToTicks(startTime + measureDurationSeconds)
      })
    }
    return measures
  }

  // Largeur totale de la timeline
  const totalWidth = computed(() => {
    const measures = measuresWithSignatures.value
    if (measures.length === 0) return DEFAULT_MEASURES * PIXELS_PER_QUARTER.value * 4
    const lastMeasure = measures[measures.length - 1]
    const width = lastMeasure.startPixel + lastMeasure.measureWidth
    
    console.log('📏 TotalWidth calculé:', {
      measuresCount: measures.length,
      lastMeasureEnd: lastMeasure.endTime?.toFixed(3) + 's',
      lastMeasureStart: lastMeasure.startPixel?.toFixed(0) + 'px',
      lastMeasureWidth: lastMeasure.measureWidth?.toFixed(0) + 'px',
      newWidth: width.toFixed(0) + 'px',
      oldWidth: '2640px',
      changed: width !== 2640 ? '✅ CHANGED' : '❌ SAME'
    })
    
    return width
  })

  // Signature rythmique actuelle
  const currentSignature = computed(() => {
    if (midiStore.isLoaded && midiStore.midiInfo.timeSignature) {
      const ts = midiStore.midiInfo.timeSignature
      return Array.isArray(ts) 
        ? { numerator: ts[0], denominator: ts[1] }
        : ts
    }
    return DEFAULT_SIGNATURE
  })

  // Utilitaires pour la conversion
  const measureToPixels = (measureNumber) => {
    const measure = measuresWithSignatures.value.find(m => m.number === measureNumber)
    return measure ? measure.startPixel : (measureNumber - 1) * PIXELS_PER_QUARTER.value * 4
  }

  const pixelsToMeasure = (pixels) => {
    const measures = measuresWithSignatures.value
    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i]
      if (pixels >= measure.startPixel && pixels < measure.startPixel + measure.measureWidth) {
        return {
          measure: measure.number,
          beatPosition: (pixels - measure.startPixel) / measure.beatWidth,
          signature: measure.timeSignature
        }
      }
    }
    return null
  }

  const getAllMeasureLines = computed(() => {
    return measuresWithSignatures.value.map(measure => ({
      measureNumber: measure.number,
      position: measure.startPixel,
      timeSignature: measure.timeSignature,
      signatureChange: measure.signatureChange
    }))
  })

  const getAllBeatLines = computed(() => {
    const beatLines = []
    measuresWithSignatures.value.forEach(measure => {
      const measureDuration = measure.endTime - measure.startTime
      
      for (let beat = 2; beat <= measure.beatsCount; beat++) {
        // ✅ Calculer le temps exact du beat
        const beatRatio = (beat - 1) / measure.beatsCount
        const beatTime = measure.startTime + (beatRatio * measureDuration)
        
        // ✅ Convertir en pixels de manière cohérente avec les notes
        const beatPosition = timeToPixelsWithSignatures(beatTime)
        
        beatLines.push({
          measureNumber: measure.number,
          beatNumber: beat,
          position: beatPosition,
          timeSignature: measure.timeSignature,
          beatTime: beatTime
        })
      }
    })
    return beatLines
  })

  return {
    // États et propriétés calculées
    measuresWithSignatures,
    totalWidth,
    currentSignature,
    calculateTotalMeasures,
    PIXELS_PER_QUARTER,

    // Fonctions de conversion temps/pixels simples (tempo constant)
    timeToPixels,
    pixelsToTime,

    // Fonctions de conversion temps/pixels avec signatures rythmiques (précision maximale)
    timeToPixelsWithSignatures,
    pixelsToTimeWithSignatures,
    durationToPixels,
    pixelsToDuration,

    // Fonctions de conversion ticks/temps
    ticksToTime,
    timeToTicks,

    // Utilitaires de mesures
    measureToPixels,
    pixelsToMeasure,
    getAllMeasureLines,
    getAllBeatLines,
    getTimeSignatureAtTime,
    
    // Accès aux sections de signatures
    getTimeSignatureSections,
    
    // Calcul de la vraie fin du morceau (tous événements MIDI)
    getLastMidiEventTime
  }
}