<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'

const tvMode = ref('lobby')

function setMode(mode) {
  const socket = getSocket()
  socket.emit('set-tv-mode', { sessionId: sessionStore.activeSession.id, mode })
}

function handleModeChanged({ mode }) {
  tvMode.value = mode
}

onMounted(() => {
  const socket = getSocket()
  socket.on('tv-mode-changed', handleModeChanged)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('tv-mode-changed', handleModeChanged)
})
</script>

<template>
  <div class="tv-controls">
    <!-- Mode TV section -->
    <section class="control-section">
      <h2 class="section-title">📺 Mode TV</h2>
      <div class="mode-indicator">
        Mode actuel :
        <span class="mode-badge">{{ tvMode }}</span>
      </div>
      <div class="mode-buttons">
        <button
          class="action-btn"
          :class="{ active: tvMode === 'lobby' }"
          @click="setMode('lobby')"
        >
          🔗 Lobby (QR)
        </button>
        <button
          class="action-btn"
          :class="{ active: tvMode === 'combat' }"
          @click="setMode('combat')"
        >
          ⚔️ Combat
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tv-controls {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.control-section {
  background: linear-gradient(160deg, #1e1408, #150e05);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

.mode-indicator {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  color: var(--color-text-dim);
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.mode-badge {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  background: rgba(240,192,64,0.1);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.5rem;
}

.mode-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.action-btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(160deg, #4a2010, #2e1008);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover { background: linear-gradient(160deg, #6b3020, #4a1e10); }
.action-btn.active {
  background: linear-gradient(160deg, #6b3020, #4a1e10);
  border-color: var(--color-gold-bright);
  box-shadow: 0 0 10px rgba(240,192,64,0.2);
}
</style>
