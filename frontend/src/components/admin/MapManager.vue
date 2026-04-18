<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const MAX_BRUSH_RADIUS = 200
const MIN_BRUSH_RADIUS = 10
const DEFAULT_BRUSH_RADIUS = 40
const VIEWPORT_DEBOUNCE_MS = 300

// ── State ──────────────────────────────────────────────────────────────────
const images = ref([])
const selectedImageUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')

const isMapActive = ref(false)
const fogEnabled = ref(false)
const viewport = ref({ x: 0, y: 0, scale: 1 })
const fogStrokes = ref([])

const brushMode = ref(false)
const brushRadius = ref(DEFAULT_BRUSH_RADIUS)

// preview canvas
const previewCanvas = ref(null)
const previewImg = ref(null)
const previewContainer = ref(null)

let isPainting = false
let viewportDebounceTimer = null

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

async function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return
  uploading.value = true
  uploadError.value = ''
  try {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('session_id', sessionStore.activeSession.id)
    const res = await fetch(`${BACKEND_URL}/api/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.token}` },
      body: formData,
    })
    if (!res.ok) {
      const data = await res.json()
      uploadError.value = data.error || 'Erreur lors du téléversement.'
      return
    }
    await loadImages()
  } catch {
    uploadError.value = 'Erreur de connexion.'
  } finally {
    uploading.value = false
    event.target.value = ''
  }
}

function imageFullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

// ── Socket actions ─────────────────────────────────────────────────────────
function showMapOnTv() {
  if (!selectedImageUrl.value || !sessionStore.activeSession) return
  const socket = getSocket()
  socket.emit('show-map', {
    sessionId: sessionStore.activeSession.id,
    imageUrl: selectedImageUrl.value,
  })
}

function toggleFog() {
  const socket = getSocket()
  socket.emit('map-set-fog', {
    sessionId: sessionStore.activeSession.id,
    enabled: !fogEnabled.value,
  })
}

function resetFog() {
  const socket = getSocket()
  socket.emit('map-fog-reset', { sessionId: sessionStore.activeSession.id })
}

function emitViewport() {
  if (!sessionStore.activeSession) return
  const socket = getSocket()
  socket.emit('map-viewport-update', {
    sessionId: sessionStore.activeSession.id,
    ...viewport.value,
  })
}

function scheduleViewportEmit() {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  viewportDebounceTimer = setTimeout(emitViewport, VIEWPORT_DEBOUNCE_MS)
}

function zoomIn() {
  viewport.value = { ...viewport.value, scale: Math.min(10, +(viewport.value.scale * 1.2).toFixed(3)) }
  scheduleViewportEmit()
  renderFog()
}

function zoomOut() {
  viewport.value = { ...viewport.value, scale: Math.max(0.1, +(viewport.value.scale / 1.2).toFixed(3)) }
  scheduleViewportEmit()
  renderFog()
}

function resetViewport() {
  viewport.value = { x: 0, y: 0, scale: 1 }
  scheduleViewportEmit()
  renderFog()
}

// ── Painting ───────────────────────────────────────────────────────────────
function canvasCoords(event) {
  const canvas = previewCanvas.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const clientX = event.touches ? event.touches[0].clientX : event.clientX
  const clientY = event.touches ? event.touches[0].clientY : event.clientY
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

function startPaint(event) {
  if (!brushMode.value || !fogEnabled.value) return
  isPainting = true
  paint(event)
}

function paint(event) {
  if (!isPainting || !brushMode.value) return
  event.preventDefault()
  const coords = canvasCoords(event)
  if (!coords) return
  const stroke = { x: coords.x, y: coords.y, r: brushRadius.value }
  fogStrokes.value.push(stroke)
  renderFog()

  // Emit batch of 1 stroke immediately
  const socket = getSocket()
  socket.emit('map-fog-clear', {
    sessionId: sessionStore.activeSession.id,
    strokes: [stroke],
  })
}

function stopPaint() {
  isPainting = false
}

// ── Fog rendering ──────────────────────────────────────────────────────────
function renderFog() {
  const canvas = previewCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!fogEnabled.value) return

  // Fill with semi-transparent black
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Erase revealed areas
  ctx.globalCompositeOperation = 'destination-out'
  for (const stroke of fogStrokes.value) {
    ctx.beginPath()
    ctx.arc(stroke.x, stroke.y, stroke.r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function onPreviewImageLoaded() {
  const img = previewImg.value
  const canvas = previewCanvas.value
  if (!img || !canvas) return
  canvas.width = img.naturalWidth || img.offsetWidth || 800
  canvas.height = img.naturalHeight || img.offsetHeight || 600
  renderFog()
}

// ── Socket event handlers ──────────────────────────────────────────────────
function handleMapState(data) {
  if (!data) return
  isMapActive.value = true
  selectedImageUrl.value = data.mapUrl
  fogEnabled.value = data.fogEnabled
  viewport.value = data.viewport || { x: 0, y: 0, scale: 1 }
  fogStrokes.value = Array.isArray(data.fogStrokes) ? data.fogStrokes : []
  nextTick(renderFog)
}

function handleFogUpdated({ enabled }) {
  fogEnabled.value = enabled
  nextTick(renderFog)
}

function handleFogPatch({ strokes }) {
  if (Array.isArray(strokes)) {
    fogStrokes.value.push(...strokes)
    renderFog()
  }
}

function handleFogReset() {
  fogStrokes.value = []
  renderFog()
}

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  if (data.tvMode === 'map' && data.mapState) {
    handleMapState(data.mapState)
  }
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
  const socket = getSocket()
  socket.off('map-state', handleMapState)
  socket.off('map-fog-updated', handleFogUpdated)
  socket.off('map-fog-patch', handleFogPatch)
  socket.off('map-fog-reset', handleFogReset)
  socket.off('admin-state', handleAdminState)
  socket.off('tv-mode-changed', handleTvModeChanged)
})

watch(fogEnabled, () => nextTick(renderFog))
</script>

<template>
  <div class="map-manager">
    <h3 class="section-title">🗺️ Gestionnaire de Carte</h3>

    <!-- Upload -->
    <div class="upload-area">
      <label class="upload-btn">
        <span>{{ uploading ? '…' : '📁 Téléverser des images' }}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          class="file-input"
          :disabled="uploading"
          @change="handleFileUpload"
        />
      </label>
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
        @click="selectedImageUrl = img.url"
      >
        <img :src="imageFullUrl(img.url)" :alt="img.url" class="gallery-thumb" />
        <button class="show-btn" @click.stop="selectedImageUrl = img.url; showMapOnTv()">
          🗺️ Carte TV
        </button>
      </div>
    </div>

    <!-- Map Controls (only when a map is active on TV) -->
    <template v-if="isMapActive && selectedImageUrl">
      <div class="control-section">
        <h4 class="subsection-title">🌫️ Brouillard de guerre</h4>
        <div class="inline-actions">
          <button
            class="action-btn"
            :class="{ active: fogEnabled }"
            @click="toggleFog"
          >
            {{ fogEnabled ? '🌫️ Brouillard ON' : '☀️ Brouillard OFF' }}
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
            <label class="brush-label" v-if="brushMode">
              Rayon: {{ brushRadius }}px
              <input
                v-model.number="brushRadius"
                type="range"
                :min="MIN_BRUSH_RADIUS"
                :max="MAX_BRUSH_RADIUS"
                class="brush-slider"
              />
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

      <!-- Fog Preview Canvas -->
      <div class="control-section">
        <h4 class="subsection-title">👁️ Aperçu (pinceau)</h4>
        <p class="hint-text">{{ fogEnabled && brushMode ? 'Cliquez/glissez pour révéler la carte.' : fogEnabled ? 'Activez le pinceau pour peindre.' : 'Activez le brouillard pour peindre.' }}</p>
        <div
          ref="previewContainer"
          class="preview-container"
          :style="{ cursor: brushMode && fogEnabled ? 'crosshair' : 'default' }"
        >
          <img
            ref="previewImg"
            :src="imageFullUrl(selectedImageUrl)"
            class="preview-img"
            alt="Aperçu carte"
            @load="onPreviewImageLoaded"
          />
          <canvas
            ref="previewCanvas"
            class="preview-fog-canvas"
            @mousedown="startPaint"
            @mousemove="paint"
            @mouseup="stopPaint"
            @mouseleave="stopPaint"
            @touchstart.prevent="startPaint"
            @touchmove.prevent="paint"
            @touchend="stopPaint"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.map-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

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

.upload-area {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.file-input { display: none; }

.upload-error {
  color: var(--color-danger);
  font-family: var(--font-body);
  font-size: 0.8rem;
}

.empty-gallery {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  font-size: 0.85rem;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.75rem;
}

.gallery-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: center;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 0.2rem;
  transition: border-color 0.2s;
}
.gallery-item.selected { border-color: var(--color-gold-bright); }

.gallery-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.show-btn {
  width: 100%;
  padding: 0.3rem 0.25rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  white-space: nowrap;
}
.show-btn:hover { background: var(--surface-gold-soft-strong); border-color: var(--color-gold-bright); color: var(--color-gold-bright); }

.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inline-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }

.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn.active { background: var(--gradient-accent-action-hover); border-color: var(--color-gold-bright); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: var(--admin-danger-border, var(--color-danger-border)); color: var(--admin-danger-text, var(--color-danger)); background: var(--gradient-danger-action); }

.brush-controls {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.brush-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
}

.brush-slider {
  flex: 1;
  accent-color: var(--color-gold);
}

.viewport-info {
  font-family: var(--font-heading);
  font-size: 0.68rem;
  color: var(--color-text-dim);
  letter-spacing: 0.06em;
  margin: 0;
}

.hint-text {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0;
}

.preview-container {
  position: relative;
  width: 100%;
  max-height: 350px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: #000;
}

.preview-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 350px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.preview-fog-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}
</style>
