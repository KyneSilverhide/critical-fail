<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const MAX_BRUSH_RADIUS = 100
const MIN_BRUSH_RADIUS = 5
const DEFAULT_BRUSH_RADIUS = 30
const VIEWPORT_DEBOUNCE_MS = 150

// ── State ──────────────────────────────────────────────────────────────────
const images = ref([])
const selectedImageUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadProgress = ref(0)

const isMapActive = ref(false)
const fogEnabled = ref(false)
const viewport = ref({ x: 0, y: 0, scale: 1 })
// Strokes: normalized coords { nx, ny, nr } — all relative to image natural width
const fogStrokes = ref([])

const brushMode = ref(false)
const brushRadius = ref(DEFAULT_BRUSH_RADIUS)

// canvas refs
const canvasEl = ref(null)
const canvasContainer = ref(null)

// non-reactive internals
let mapImage = null          // HTMLImageElement
let fogCanvas = null         // offscreen canvas at natural image resolution
let resizeObserver = null
let viewportDebounceTimer = null
let pendingNormViewport = null  // normalized viewport waiting for image to load

// interaction state
let isPainting = false
const isDragging = ref(false)
let dragStart = null
let dragViewportStart = null

// ── Images ─────────────────────────────────────────────────────────────────
async function loadImages() {
  if (!sessionStore.activeSession) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) images.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0
  const formData = new FormData()
  files.forEach(file => formData.append('files', file))
  formData.append('session_id', sessionStore.activeSession.id)
  const xhr = new XMLHttpRequest()
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
  })
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      await loadImages()
    } else {
      try { uploadError.value = JSON.parse(xhr.responseText).error || 'Erreur.' }
      catch { uploadError.value = 'Erreur.' }
    }
    uploading.value = false
    uploadProgress.value = 0
    event.target.value = ''
  })
  xhr.addEventListener('error', () => {
    uploadError.value = 'Erreur de connexion.'
    uploading.value = false
    uploadProgress.value = 0
    event.target.value = ''
  })
  xhr.open('POST', `${BACKEND_URL}/api/uploads`)
  xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
  xhr.send(formData)
}

function imageFullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

// ── Canvas / Rendering ─────────────────────────────────────────────────────
function fitCanvas() {
  const canvas = canvasEl.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  const rect = container.getBoundingClientRect()
  const w = Math.round(rect.width)
  const h = Math.round(rect.height)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
}

/** Returns image layout on canvas given current viewport */
function getLayout() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return null
  const W = canvas.width
  const H = canvas.height
  const { x, y, scale } = viewport.value
  const baseScale = Math.min(W / mapImage.naturalWidth, H / mapImage.naturalHeight)
  const totalScale = baseScale * scale
  const imgW = mapImage.naturalWidth * totalScale
  const imgH = mapImage.naturalHeight * totalScale
  const offsetX = W / 2 - imgW / 2 + x
  const offsetY = H / 2 - imgH / 2 + y
  return { offsetX, offsetY, imgW, imgH, totalScale }
}

// ── Fog canvas (offscreen, at natural image resolution) ────────────────────
function ensureFogCanvas() {
  if (!mapImage) return null
  if (!fogCanvas || fogCanvas.width !== mapImage.naturalWidth || fogCanvas.height !== mapImage.naturalHeight) {
    fogCanvas = document.createElement('canvas')
    fogCanvas.width = mapImage.naturalWidth
    fogCanvas.height = mapImage.naturalHeight
    rebuildFogCanvas()
  }
  return fogCanvas
}

function rebuildFogCanvas() {
  if (!fogCanvas || !mapImage) return
  const fCtx = fogCanvas.getContext('2d')
  fCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height)

  // Fond de brouillard semi-transparent teinté (le MJ voit à travers)
  fCtx.globalCompositeOperation = 'source-over'
  fCtx.fillStyle = 'rgba(30, 20, 60, 0.45)'
  fCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height)

  // Quadrillage diagonal pour marquer visuellement les zones couvertes
  fCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  fCtx.lineWidth = 2
  const step = 40
  for (let i = -fogCanvas.height; i < fogCanvas.width; i += step) {
    fCtx.beginPath()
    fCtx.moveTo(i, 0)
    fCtx.lineTo(i + fogCanvas.height, fogCanvas.height)
    fCtx.stroke()
  }

  // Découper les zones révélées
  fCtx.globalCompositeOperation = 'destination-out'
  for (const s of fogStrokes.value) {
    paintStrokeOnFog(fCtx, s)
  }
  fCtx.globalCompositeOperation = 'source-over'
}

function paintStrokeOnFog(fCtx, s) {
  if (!mapImage) return
  fCtx.beginPath()
  fCtx.arc(
    s.nx * mapImage.naturalWidth,
    s.ny * mapImage.naturalHeight,
    s.nr * mapImage.naturalWidth,
    0, Math.PI * 2
  )
  fCtx.fill()
}

function addStrokeToFog(stroke) {
  const fc = ensureFogCanvas()
  if (!fc) return
  const fCtx = fc.getContext('2d')
  fCtx.globalCompositeOperation = 'destination-out'
  paintStrokeOnFog(fCtx, stroke)
  fCtx.globalCompositeOperation = 'source-over'
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return
  const ctx = canvas.getContext('2d')
  const layout = getLayout()
  if (!layout) return
  const { offsetX, offsetY, imgW, imgH } = layout

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Image
  ctx.drawImage(mapImage, offsetX, offsetY, imgW, imgH)

  // Fog overlay
  if (fogEnabled.value) {
    const fc = ensureFogCanvas()
    if (fc) ctx.drawImage(fc, offsetX, offsetY, imgW, imgH)
  }
}

// ── Map image loading ──────────────────────────────────────────────────────
function loadMapImage(url) {
  if (!url) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    mapImage = img
    fogCanvas = null
    fitCanvas()
    // Appliquer le viewport normalisé reçu avant que l'image soit chargée
    if (pendingNormViewport) {
      applyNormViewport(pendingNormViewport.xn, pendingNormViewport.yn, pendingNormViewport.scale)
      pendingNormViewport = null
    }
    rebuildFogCanvas()
    render()
  }
  img.src = imageFullUrl(url)
}
// ── Coordinate helpers ─────────────────────────────────────────────────────
function getEventXY(event) {
  if (event.touches && event.touches.length > 0) {
    return { cx: event.touches[0].clientX, cy: event.touches[0].clientY }
  }
  return { cx: event.clientX, cy: event.clientY }
}

function eventToCanvas(event) {
  const canvas = canvasEl.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const { cx, cy } = getEventXY(event)
  return {
    x: (cx - rect.left) * (canvas.width / rect.width),
    y: (cy - rect.top) * (canvas.height / rect.height),
  }
}

function canvasToNorm(cx, cy) {
  const layout = getLayout()
  if (!layout || !mapImage) return null
  const { offsetX, offsetY, totalScale } = layout
  const imgX = (cx - offsetX) / totalScale
  const imgY = (cy - offsetY) / totalScale
  return {
    nx: imgX / mapImage.naturalWidth,
    ny: imgY / mapImage.naturalHeight,
  }
}

// ── Interaction ────────────────────────────────────────────────────────────
function onPointerDown(event) {
  canvasEl.value?.setPointerCapture(event.pointerId)
  const pos = eventToCanvas(event)
  if (!pos) return
  if (brushMode.value && fogEnabled.value) {
    isPainting = true
    applyBrush(pos)
  } else {
    isDragging.value = true
    const { cx, cy } = getEventXY(event)
    dragStart = { x: cx, y: cy }
    dragViewportStart = { ...viewport.value }
  }
}

function onPointerMove(event) {
  const pos = eventToCanvas(event)
  if (!pos) return
  if (isPainting && brushMode.value && fogEnabled.value) {
    applyBrush(pos)
  } else if (isDragging.value) {
  const { cx, cy } = getEventXY(event)
  viewport.value = {
    ...dragViewportStart,
    x: dragViewportStart.x + (cx - dragStart.x),
    y: dragViewportStart.y + (cy - dragStart.y),
  }
  scheduleViewportEmit()
  render()
}
}

function onPointerUp() {
  isPainting = false
  isDragging.value = false
}

function onWheel(event) {
  event.preventDefault()
  const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12
  viewport.value = {
    ...viewport.value,
    scale: Math.min(12, Math.max(0.1, +(viewport.value.scale * factor).toFixed(4))),
  }
  scheduleViewportEmit()
  render()
}

function applyBrush(pos) {
  const norm = canvasToNorm(pos.x, pos.y)
  if (!norm) return
  const layout = getLayout()
  if (!layout) return
  // nr = brush radius in canvas px / image width in canvas px → normalized radius
  const nr = brushRadius.value / layout.imgW
  const stroke = { nx: norm.nx, ny: norm.ny, nr }
  fogStrokes.value.push(stroke)
  addStrokeToFog(stroke)
  render()
  const socket = getSocket()
  socket.emit('map-fog-clear', {
    sessionId: sessionStore.activeSession.id,
    strokes: [stroke],
  })
}

// ── Socket actions ─────────────────────────────────────────────────────────
function showMapOnTv() {
  if (!selectedImageUrl.value || !sessionStore.activeSession) return
  const socket = getSocket()
  socket.emit('show-map', { sessionId: sessionStore.activeSession.id, imageUrl: selectedImageUrl.value })
  socket.emit('map-set-fog', { sessionId: sessionStore.activeSession.id, enabled: true })
}

function toggleFog() {
  const socket = getSocket()
  socket.emit('map-set-fog', { sessionId: sessionStore.activeSession.id, enabled: !fogEnabled.value })
}

function resetFog() {
  const socket = getSocket()
  socket.emit('map-fog-reset', { sessionId: sessionStore.activeSession.id })
}

function emitViewport() {
  if (!sessionStore.activeSession || !mapImage) return
  const norm = toNormViewport()
  const socket = getSocket()
  socket.emit('map-viewport-update', {
    sessionId: sessionStore.activeSession.id,
    xn: norm.xn,
    yn: norm.yn,
    scale: norm.scale,
  })
}
function scheduleViewportEmit() {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  viewportDebounceTimer = setTimeout(emitViewport, VIEWPORT_DEBOUNCE_MS)
}

/** Retourne baseScale de l'image sur le canvas courant */
function getBaseScale() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return 1
  return Math.min(canvas.width / mapImage.naturalWidth, canvas.height / mapImage.naturalHeight)
}

/** Convertit viewport local (pixels canvas) → normalisé pour émission */
function toNormViewport() {
  const bs = getBaseScale()
  const baseW = mapImage.naturalWidth * bs
  const baseH = mapImage.naturalHeight * bs
  return {
    xn: viewport.value.x / (baseW || 1),
    yn: viewport.value.y / (baseH || 1),
    scale: viewport.value.scale,
  }
}

/** Applique un viewport normalisé reçu → pixels locaux */
function applyNormViewport(xn, yn, scale) {
  if (!mapImage || !canvasEl.value) {
    pendingNormViewport = { xn: xn ?? 0, yn: yn ?? 0, scale: scale ?? 1 }
    return
  }
  const bs = getBaseScale()
  viewport.value = {
    x: (xn ?? 0) * mapImage.naturalWidth * bs,
    y: (yn ?? 0) * mapImage.naturalHeight * bs,
    scale: scale ?? 1,
  }
}

function zoomIn() {
  viewport.value = { ...viewport.value, scale: Math.min(12, +(viewport.value.scale * 1.25).toFixed(4)) }
  scheduleViewportEmit()
  render()
}

function zoomOut() {
  viewport.value = { ...viewport.value, scale: Math.max(0.1, +(viewport.value.scale / 1.25).toFixed(4)) }
  scheduleViewportEmit()
  render()
}

function resetViewport() {
  viewport.value = { x: 0, y: 0, scale: 1 }
  scheduleViewportEmit()
  render()
}

// ── Socket event handlers ──────────────────────────────────────────────────
function handleMapState(data) {
  if (!data) return
  isMapActive.value = true
  fogEnabled.value = data.fogEnabled
  // Support ancien format {x,y} ET nouveau format normalisé {xn,yn}
  const xn = data.viewport?.xn ?? (data.viewport?.x ?? 0)
  const yn = data.viewport?.yn ?? (data.viewport?.y ?? 0)
  const scale = data.viewport?.scale ?? 1
  applyNormViewport(xn, yn, scale)
  fogStrokes.value = Array.isArray(data.fogStrokes) ? data.fogStrokes : []
  fogCanvas = null
  const newUrl = data.mapUrl
  if (newUrl !== selectedImageUrl.value) {
    selectedImageUrl.value = newUrl
    loadMapImage(newUrl)
  } else {
    rebuildFogCanvas()
    render()
  }
}

function handleFogUpdated({ enabled }) {
  fogEnabled.value = enabled
  render()
}

function handleFogPatch({ strokes }) {
  if (!Array.isArray(strokes)) return
  ensureFogCanvas()
  for (const s of strokes) {
    fogStrokes.value.push(s)
    addStrokeToFog(s)
  }
  render()
}

function handleFogReset() {
  fogStrokes.value = []
  rebuildFogCanvas()
  render()
}

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  if (data.tvMode === 'map' && data.mapState) handleMapState(data.mapState)
  if (data.tvMode === 'map') isMapActive.value = true
}

function handleTvModeChanged(payload) {
  if (payload?.mode === 'map') {
    isMapActive.value = true
    if (payload.mapState) handleMapState(payload.mapState)
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  loadImages()
  resizeObserver = new ResizeObserver(() => { fitCanvas(); render() })
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)

  const socket = getSocket()
  socket.on('map-state', handleMapState)
  socket.on('map-fog-updated', handleFogUpdated)
  socket.on('map-fog-patch', handleFogPatch)
  socket.on('map-fog-reset', handleFogReset)
  socket.on('admin-state', handleAdminState)
  socket.on('tv-mode-changed', handleTvModeChanged)
})

onUnmounted(() => {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  if (resizeObserver) resizeObserver.disconnect()
  const socket = getSocket()
  socket.off('map-state', handleMapState)
  socket.off('map-fog-updated', handleFogUpdated)
  socket.off('map-fog-patch', handleFogPatch)
  socket.off('map-fog-reset', handleFogReset)
  socket.off('admin-state', handleAdminState)
  socket.off('tv-mode-changed', handleTvModeChanged)
})

watch(() => selectedImageUrl.value, (url) => { if (url && !mapImage) loadMapImage(url) })
watch(fogEnabled, () => render())
</script>

<template>
  <div class="map-manager">
    <h3 class="section-title">🗺️ Gestionnaire de Carte</h3>

    <!-- Upload -->
    <div class="upload-area">
      <label class="upload-btn" :class="{ disabled: uploading }">
        <span>{{ uploading ? `Envoi… ${uploadProgress}%` : '📁 Téléverser des images' }}</span>
        <input type="file" accept="image/*" multiple class="file-input" :disabled="uploading" @change="handleFileUpload" />
      </label>
      <div v-if="uploading" class="progress-track">
        <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
        <span class="progress-label">{{ uploadProgress }}%</span>
      </div>
      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>

    <!-- Gallery -->
    <div v-if="images.length === 0" class="empty-gallery">
      <p>Aucune image téléversée pour cette session.</p>
    </div>
    <div v-else class="gallery">
      <div
        v-for="img in images"
        :key="img.id"
        class="gallery-item"
        :class="{ selected: selectedImageUrl === img.url }"
        @click="selectedImageUrl = img.url; loadMapImage(img.url)"
      >
        <img :src="imageFullUrl(img.url)" :alt="img.url" class="gallery-thumb" />
        <button class="show-btn" @click.stop="selectedImageUrl = img.url; loadMapImage(img.url); showMapOnTv()">
          🗺️ Carte TV
        </button>
      </div>
    </div>

    <!-- Map Controls -->
    <template v-if="isMapActive && selectedImageUrl">
      <div class="control-section">
        <h4 class="subsection-title">🌫️ Brouillard de guerre</h4>
        <div class="inline-actions">
          <button class="action-btn" :class="{ active: fogEnabled }" @click="toggleFog">
            {{ fogEnabled ? '🌫️ Désactiver' : '☀️ Activer' }}
          </button>
          <button class="action-btn danger-btn" :disabled="!fogEnabled" @click="resetFog">
            🔄 Réinitialiser
          </button>
        </div>
        <template v-if="fogEnabled">
          <div class="brush-controls">
            <label class="brush-label">
              <input v-model="brushMode" type="checkbox" />
              🖌️ Mode pinceau
            </label>
            <label v-if="brushMode" class="brush-label">
              Rayon : {{ brushRadius }}px
              <input v-model.number="brushRadius" type="range" :min="MIN_BRUSH_RADIUS" :max="MAX_BRUSH_RADIUS" class="brush-slider" />
            </label>
          </div>
        </template>
      </div>

      <!-- Viewport Controls -->
      <div class="control-section">
        <h4 class="subsection-title">🔍 Viewport TV</h4>
        <p class="viewport-info">
          x: {{ viewport.x.toFixed(0) }}, y: {{ viewport.y.toFixed(0) }}, zoom: {{ viewport.scale.toFixed(2) }}×
        </p>
        <div class="inline-actions">
          <button class="action-btn" @click="zoomIn">＋ Zoom</button>
          <button class="action-btn" @click="zoomOut">－ Zoom</button>
          <button class="action-btn" @click="resetViewport">↺ Réinitialiser</button>
        </div>
      </div>

      <!-- Unified canvas — image + fog + viewport -->
      <div class="control-section">
        <h4 class="subsection-title">👁️ Vue TV en temps réel</h4>
        <p class="hint-text">
          {{ brushMode && fogEnabled ? '🖌️ Glissez pour révéler la carte.' : '↕ Glissez pour naviguer · molette pour zoomer' }}
        </p>
        <div
          ref="canvasContainer"
          class="canvas-container"
          :style="{ cursor: brushMode && fogEnabled ? 'crosshair' : isDragging ? 'grabbing' : 'grab' }"
        >
          <canvas
            ref="canvasEl"
            class="map-canvas"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel.prevent="onWheel"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.map-manager { display: flex; flex-direction: column; gap: 1rem; }

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

.subsection-title {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 0.4rem;
}

.upload-area { display: flex; flex-direction: column; gap: 0.4rem; }

.upload-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  width: fit-content;
}
.upload-btn:hover { background: var(--gradient-accent-action-hover); }
.upload-btn.disabled { opacity: 0.65; cursor: not-allowed; pointer-events: none; }
.file-input { display: none; }

.upload-error { color: var(--color-danger); font-family: var(--font-body); font-size: 0.8rem; }
.empty-gallery { font-family: var(--font-body); color: var(--color-text-dim); font-size: 0.85rem; }

.progress-track {
  position: relative; height: 10px;
  background: var(--surface-track);
  border: 1px solid var(--color-border);
  border-radius: 6px; overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  border-radius: 6px; transition: width 0.15s ease;
}
.progress-label {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  font-family: var(--font-heading); font-size: 0.6rem;
  color: var(--color-text-dim); pointer-events: none;
}

.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.75rem; }
.gallery-item {
  display: flex; flex-direction: column; gap: 0.35rem; align-items: center;
  cursor: pointer; border: 2px solid transparent; border-radius: 8px;
  padding: 0.2rem; transition: border-color 0.2s;
}
.gallery-item.selected { border-color: var(--color-gold-bright); }
.gallery-thumb { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-border); }
.show-btn {
  width: 100%; padding: 0.3rem 0.25rem;
  background: var(--surface-gold-soft); border: 1px solid var(--color-gold-dark);
  border-radius: 6px; color: var(--color-gold);
  font-family: var(--font-heading); font-size: 0.6rem;
  letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s;
  text-align: center; white-space: nowrap;
}
.show-btn:hover { background: var(--surface-gold-soft-strong); border-color: var(--color-gold-bright); color: var(--color-gold-bright); }

.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;
}
.inline-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }

.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-gold-bright);
  font-family: var(--font-heading); font-size: 0.72rem; letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn.active { background: var(--gradient-accent-action-hover); border-color: var(--color-gold-bright); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: var(--admin-danger-border, var(--color-danger-border)); color: var(--admin-danger-text, var(--color-danger)); background: var(--gradient-danger-action); }

.brush-controls { display: flex; flex-direction: column; gap: 0.4rem; }
.brush-label { display: flex; align-items: center; gap: 0.4rem; color: var(--color-text-dim); font-family: var(--font-heading); font-size: 0.7rem; }
.brush-slider { flex: 1; accent-color: var(--color-gold); }

.viewport-info { font-family: var(--font-heading); font-size: 0.68rem; color: var(--color-text-dim); letter-spacing: 0.06em; margin: 0; }
.hint-text { font-family: var(--font-body); font-size: 0.75rem; color: var(--color-text-dim); margin: 0; }

/* ── Main canvas container ── */
.canvas-container {
  width: 100%;
  height: 65vh;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  background: #000;
  user-select: none;
}

.map-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
