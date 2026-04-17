<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'

const tvMode = ref('lobby')
const activeDoomClock = ref(null)
const doomTitle = ref('Doom Clock')
const doomMinutes = ref(2)
const doomSeconds = ref(0)
const now = ref(Date.now())
const activeTensionScale = ref(null)
const tensionTitle = ref('Échelle de tension')
const tensionSteps = ref(6)
const tensionDiscreet = ref(false)
let clockTickInterval = null

function setMode(mode) {
  const socket = getSocket()
  socket.emit('set-tv-mode', { sessionId: sessionStore.activeSession.id, mode })
}

function startDoomClock() {
  const socket = getSocket()
  const durationSeconds = (Math.max(0, parseInt(doomMinutes.value) || 0) * 60) + (Math.max(0, parseInt(doomSeconds.value) || 0))
  if (durationSeconds <= 0) return
  socket.emit('start-doom-clock', {
    sessionId: sessionStore.activeSession.id,
    title: doomTitle.value,
    durationSeconds,
  })
}

function stopDoomClock() {
  const socket = getSocket()
  socket.emit('stop-doom-clock', { sessionId: sessionStore.activeSession.id })
}

function createTensionScale() {
  const socket = getSocket()
  socket.emit('create-tension-scale', {
    sessionId: sessionStore.activeSession.id,
    title: tensionTitle.value,
    steps: tensionSteps.value,
    isDiscreet: tensionDiscreet.value,
  })
}

function incrementTensionScale() {
  const socket = getSocket()
  socket.emit('increment-tension-scale', { sessionId: sessionStore.activeSession.id })
}

function endTensionScale() {
  const socket = getSocket()
  socket.emit('end-tension-scale', { sessionId: sessionStore.activeSession.id })
}

const doomRemaining = computed(() => {
  if (!activeDoomClock.value?.endAt) return 0
  return Math.max(0, Math.floor((new Date(activeDoomClock.value.endAt).getTime() - now.value) / 1000))
})

const doomRemainingLabel = computed(() => {
  const mins = Math.floor(doomRemaining.value / 60)
  const secs = doomRemaining.value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

const tensionRatio = computed(() => {
  if (!activeTensionScale.value?.steps) return 0
  return Math.round((activeTensionScale.value.level / activeTensionScale.value.steps) * 100)
})

function handleModeChanged({ mode }) {
  tvMode.value = mode
}

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  tvMode.value = data.tvMode || 'lobby'
  activeDoomClock.value = data.doomClock || null
  activeTensionScale.value = data.tensionScale || null
}

function handleDoomClockStarted(data) {
  activeDoomClock.value = data
}

function handleDoomClockStopped() {
  activeDoomClock.value = null
}

function handleTensionScaleUpdated(data) {
  activeTensionScale.value = data
}

function handleTensionScaleEnded() {
  activeTensionScale.value = null
}

onMounted(() => {
  clockTickInterval = window.setInterval(() => { now.value = Date.now() }, 250)
  const socket = getSocket()
  socket.on('tv-mode-changed', handleModeChanged)
  socket.on('admin-state', handleAdminState)
  socket.on('doom-clock-started', handleDoomClockStarted)
  socket.on('doom-clock-stopped', handleDoomClockStopped)
  socket.on('tension-scale-updated', handleTensionScaleUpdated)
  socket.on('tension-scale-ended', handleTensionScaleEnded)
})

onUnmounted(() => {
  if (clockTickInterval) window.clearInterval(clockTickInterval)
  const socket = getSocket()
  socket.off('tv-mode-changed', handleModeChanged)
  socket.off('admin-state', handleAdminState)
  socket.off('doom-clock-started', handleDoomClockStarted)
  socket.off('doom-clock-stopped', handleDoomClockStopped)
  socket.off('tension-scale-updated', handleTensionScaleUpdated)
  socket.off('tension-scale-ended', handleTensionScaleEnded)
})
</script>

<template>
  <div class="tv-controls">
    <section class="control-section">
      <h2 class="section-title">📺 Mode TV</h2>
      <div class="mode-indicator">
        Mode actuel :
        <span class="mode-badge">{{ tvMode }}</span>
      </div>
      <div class="mode-buttons">
        <button class="action-btn" :class="{ active: tvMode === 'lobby' }" @click="setMode('lobby')">🔗 Lobby</button>
        <button class="action-btn" :class="{ active: tvMode === 'combat' }" @click="setMode('combat')">⚔️ Combat</button>
        <button class="action-btn" :class="{ active: tvMode === 'doom' }" @click="setMode('doom')">⏱️ Doom</button>
        <button class="action-btn" :class="{ active: tvMode === 'tension' }" @click="setMode('tension')">📈 Tension</button>
      </div>
    </section>

    <section class="control-section">
      <h2 class="section-title">⏱️ Doom Clock</h2>
      <div class="form-row">
        <input v-model="doomTitle" class="form-input" type="text" placeholder="Titre du compte à rebours" />
      </div>
      <div class="form-row split">
        <input v-model.number="doomMinutes" class="form-input" type="number" min="0" max="120" placeholder="Minutes" />
        <input v-model.number="doomSeconds" class="form-input" type="number" min="0" max="59" placeholder="Secondes" />
      </div>
      <div class="inline-actions">
        <button class="action-btn" @click="startDoomClock">Lancer</button>
        <button class="action-btn danger-btn" :disabled="!activeDoomClock" @click="stopDoomClock">Arrêter</button>
      </div>
      <p v-if="activeDoomClock" class="status-line">
        {{ activeDoomClock.title }} — {{ doomRemainingLabel }}
      </p>
    </section>

    <section class="control-section">
      <h2 class="section-title">📈 Échelle de tension</h2>
      <div class="form-row">
        <input v-model="tensionTitle" class="form-input" type="text" placeholder="Titre de l'échelle" />
      </div>
      <div class="form-row split">
        <input v-model.number="tensionSteps" class="form-input" type="number" min="2" max="20" placeholder="Étapes" />
        <label class="checkbox-label"><input v-model="tensionDiscreet" type="checkbox" /> Mode discret</label>
      </div>
      <div class="inline-actions">
        <button class="action-btn" @click="createTensionScale">Créer</button>
        <button class="action-btn" :disabled="!activeTensionScale" @click="incrementTensionScale">+1</button>
        <button class="action-btn danger-btn" :disabled="!activeTensionScale" @click="endTensionScale">Terminer</button>
      </div>
      <p v-if="activeTensionScale" class="status-line">
        {{ activeTensionScale.title }} — {{ activeTensionScale.level }} / {{ activeTensionScale.steps }} ({{ tensionRatio }}%)
      </p>
    </section>
  </div>
</template>

<style scoped>
.tv-controls { display: flex; flex-direction: column; gap: 1rem; }
.control-section {
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.mode-indicator {
  font-family: var(--font-heading);
  font-size: 0.72rem;
  color: var(--color-text-dim);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.mode-badge {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  background: rgba(240,192,64,0.1);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.5rem;
}
.mode-buttons, .inline-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }
.form-row { display: flex; gap: 0.45rem; }
.form-row.split > * { flex: 1; }
.form-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.85rem;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
}
.action-btn {
  padding: 0.45rem 0.85rem;
  background: linear-gradient(160deg, #4a2010, #2e1008);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: linear-gradient(160deg, #6b3020, #4a1e10); }
.action-btn.active {
  background: linear-gradient(160deg, #6b3020, #4a1e10);
  border-color: var(--color-gold-bright);
}
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: #8b2a2a; color: #ff6b6b; background: linear-gradient(160deg, #4a1010, #2e0808); }
.status-line {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
}
</style>
