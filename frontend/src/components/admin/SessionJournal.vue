<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { authStore } from '../../stores/auth.js'
import { getSocket } from '../../socket.js'

const BACKEND_URL = window.__RUNTIME_CONFIG__.VITE_BACKEND_URL

const events = ref([])
const summary = ref('')
const loadingSummary = ref(false)
const hasSession = computed(() => !!sessionStore.activeSession)

const EVENT_ICONS = {
  join: '🚪',
  leave: '🏃',
  damage: '💥',
  heal: '💚',
  death: '💀',
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function handleSessionEvent(event) {
  events.value.push({ ...event, createdAt: event.createdAt || new Date() })
}

async function generateSummary() {
  if (!hasSession.value) return
  loadingSummary.value = true
  summary.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/journal`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json()
    if (data.summary) {
      summary.value = data.summary
      // Merge full event list from server
      events.value = data.events.map(e => ({ ...e, eventType: e.event_type, createdAt: e.created_at }))
    }
  } catch {
    summary.value = 'Erreur lors de la génération du résumé.'
  } finally {
    loadingSummary.value = false
  }
}

onMounted(() => {
  const socket = getSocket(authStore.token)
  socket.on('session-event', handleSessionEvent)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('session-event', handleSessionEvent)
})
</script>

<template>
  <div class="journal">
    <h2 class="section-title">✦ Journal de Session</h2>

    <div v-if="!hasSession" class="no-session">
      <p>Aucune session active.</p>
    </div>

    <template v-else>
      <div class="journal-actions">
        <button class="summary-btn" @click="generateSummary" :disabled="loadingSummary">
          {{ loadingSummary ? 'Génération…' : '📄 Générer le résumé' }}
        </button>
      </div>

      <div v-if="summary" class="summary-box">
        <pre class="summary-text">{{ summary }}</pre>
      </div>

      <div v-if="events.length === 0" class="empty-journal">
        <p class="empty-icon">📜</p>
        <p class="empty-text">Aucun événement enregistré.</p>
      </div>

      <div v-else class="events-list">
        <div
          v-for="(evt, idx) in events"
          :key="idx"
          class="event-item"
          :class="evt.eventType || evt.event_type"
        >
          <span class="event-icon">{{ EVENT_ICONS[evt.eventType || evt.event_type] || '📌' }}</span>
          <span class="event-desc">{{ evt.description }}</span>
          <span class="event-time">{{ formatTime(evt.createdAt || evt.created_at) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.journal {
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
}

.no-session {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  text-align: center;
  padding: 2rem 0;
}

.journal-actions {
  display: flex;
  justify-content: flex-end;
}

.summary-btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(160deg, #2a3a4a, #1a2a3a);
  border: 1px solid #3a5a7a;
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.summary-btn:hover:not(:disabled) {
  background: linear-gradient(160deg, #3a4a5a, #2a3a4a);
}

.summary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.summary-box {
  background: linear-gradient(160deg, #1a1a08, #111108);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.summary-text {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-parchment);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
}

.empty-journal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
}

.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  color: var(--color-text-dim);
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 400px;
  overflow-y: auto;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: rgba(255,255,255,0.03);
  border-left: 3px solid var(--color-border);
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-parchment);
}

.event-item.damage { border-left-color: #e03030; }
.event-item.death { border-left-color: #888; background: rgba(100,100,100,0.1); }
.event-item.heal { border-left-color: #2fb896; }
.event-item.join { border-left-color: var(--color-gold-dark); }
.event-item.leave { border-left-color: #f0a500; }

.event-icon { font-size: 1rem; flex-shrink: 0; }
.event-desc { flex: 1; }
.event-time {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  color: var(--color-border);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
