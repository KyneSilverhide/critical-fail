<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSocket, resetSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import MessageCard from '../components/player/MessageCard.vue'

const router = useRouter()
const messages = ref([])
const playerInfo = ref(sessionStore.playerInfo || { name: 'Aventurier', hp: 20, maxHp: 20, ac: 10 })
const sessionName = ref(sessionStore.activeSession?.name || 'Session')
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

// HP tracking
const currentHp = ref(playerInfo.value?.hp ?? 20)
const maxHp = ref(playerInfo.value?.maxHp ?? 20)
const pendingHp = ref(currentHp.value)
const hpSending = ref(false)
const hpSent = ref(false)

const hpPercent = computed(() => Math.min(100, Math.max(0, (pendingHp.value / maxHp.value) * 100)))
const hpBarColor = computed(() => {
  const pct = hpPercent.value
  if (pct > 50) return '#2fb896'
  if (pct > 20) return '#f0a500'
  return '#e03030'
})

// Conditions D&D 5e 2014
const DND_CONDITIONS = [
  { id: 'blinded', label: 'Aveuglé', icon: '👁️' },
  { id: 'charmed', label: 'Charmé', icon: '💕' },
  { id: 'deafened', label: 'Assourdi', icon: '🔇' },
  { id: 'exhaustion', label: 'Épuisé', icon: '😴' },
  { id: 'frightened', label: 'Effrayé', icon: '😱' },
  { id: 'grappled', label: 'Agrippé', icon: '🤝' },
  { id: 'incapacitated', label: 'Incapacité', icon: '🚫' },
  { id: 'invisible', label: 'Invisible', icon: '👻' },
  { id: 'paralyzed', label: 'Paralysé', icon: '⚡' },
  { id: 'petrified', label: 'Pétrifié', icon: '🪨' },
  { id: 'poisoned', label: 'Empoisonné', icon: '☠️' },
  { id: 'prone', label: 'À terre', icon: '⬇️' },
  { id: 'restrained', label: 'Entravé', icon: '⛓️' },
  { id: 'stunned', label: 'Étourdi', icon: '💫' },
  { id: 'unconscious', label: 'Inconscient', icon: '💤' },
]

const activeConditions = ref([])

function toggleCondition(conditionId) {
  const idx = activeConditions.value.indexOf(conditionId)
  if (idx === -1) {
    activeConditions.value.push(conditionId)
  } else {
    activeConditions.value.splice(idx, 1)
  }
  const socket = getSocket()
  socket.emit('update-conditions', { conditions: activeConditions.value })
}

function adjustHp(delta) {
  pendingHp.value = Math.max(0, Math.min(maxHp.value, pendingHp.value + delta))
}

function sendHpUpdate() {
  const socket = getSocket()
  hpSending.value = true
  socket.emit('update-hp', { newHp: pendingHp.value })
}

function leaveSession() {
  const socket = getSocket()
  socket.emit('leave-session')
  resetSocket()
  sessionStore.setActiveSession(null)
  sessionStore.playerInfo = null
  router.push('/')
}

const handleNewMessage = (msg) => messages.value.push({ ...msg, kind: 'message' })
const handleDiceResult = (data) => messages.value.push({ ...data, kind: 'dice' })
const handleHpConfirmed = (data) => {
  currentHp.value = data.newHp
  pendingHp.value = data.newHp
  if (sessionStore.playerInfo) sessionStore.playerInfo.hp = data.newHp
  hpSending.value = false
  hpSent.value = true
  setTimeout(() => { hpSent.value = false }, 2000)
}

onMounted(() => {
  if (!sessionStore.activeSession) { router.push('/join'); return }
  const socket = getSocket()
  socket.on('new-message', handleNewMessage)
  socket.on('dice-result', handleDiceResult)
  socket.on('hp-update-confirmed', handleHpConfirmed)
})

onUnmounted(() => {
  const socket = getSocket()
  if (socket) {
    socket.off('new-message', handleNewMessage)
    socket.off('dice-result', handleDiceResult)
    socket.off('hp-update-confirmed', handleHpConfirmed)
  }
})
</script>

<template>
  <div class="inbox-wrapper">
    <header class="inbox-header">
      <div class="header-top">
        <div class="player-info">
          <div class="player-avatar-wrap">
            <img
              v-if="playerInfo?.avatarUrl"
              :src="playerInfo.avatarUrl.startsWith('/uploads/') ? BACKEND_URL + playerInfo.avatarUrl : playerInfo.avatarUrl"
              :alt="playerInfo?.name"
              class="player-avatar"
            />
            <span v-else class="player-icon">⚔️</span>
          </div>
          <div>
            <p class="player-name">{{ playerInfo?.name || 'Aventurier' }}</p>
            <p v-if="playerInfo?.dndClass" class="player-class">{{ playerInfo.dndClass }}</p>
            <p class="session-name">{{ sessionName }}</p>
          </div>
        </div>
        <button class="leave-btn" @click="leaveSession">Quitter</button>
      </div>

      <!-- HP Panel -->
      <div class="hp-panel">
        <div class="hp-header-row">
          <span class="hp-label">❤️ Points de Vie</span>
          <span class="ac-badge">🛡️ CA {{ playerInfo?.ac ?? 10 }}</span>
        </div>
        <div class="hp-bar-track">
          <div class="hp-bar-fill" :style="{ width: hpPercent + '%', background: hpBarColor }" />
        </div>
        <div class="hp-controls">
          <button class="hp-btn minus" @click="adjustHp(-1)">−</button>
          <div class="hp-value-wrap">
            <input
              v-model.number="pendingHp"
              type="number"
              class="hp-input"
              :min="0" :max="maxHp"
            />
            <span class="hp-max">/ {{ maxHp }}</span>
          </div>
          <button class="hp-btn plus" @click="adjustHp(1)">+</button>
          <button
            class="hp-send-btn"
            :class="{ sent: hpSent }"
            :disabled="hpSending || pendingHp === currentHp"
            @click="sendHpUpdate"
          >
            {{ hpSent ? '✓ Envoyé' : hpSending ? '…' : '📡 Mettre à jour' }}
          </button>
        </div>
      </div>

      <!-- Conditions Panel -->
      <div class="conditions-panel">
        <span class="conditions-label">⚡ Conditions</span>
        <div class="conditions-grid">
          <button
            v-for="cond in DND_CONDITIONS"
            :key="cond.id"
            class="condition-btn"
            :class="{ active: activeConditions.includes(cond.id) }"
            @click="toggleCondition(cond.id)"
          >
            <span class="cond-icon">{{ cond.icon }}</span>
            <span class="cond-label">{{ cond.label }}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="inbox-main">
      <div v-if="messages.length === 0" class="inbox-empty">
        <p class="empty-icon">📜</p>
        <p class="empty-text">En attente de messages du MJ…</p>
        <p class="empty-sub">Restez vigilant, aventurier.</p>
      </div>
      <div v-else class="messages-list">
        <MessageCard v-for="(msg, idx) in messages" :key="idx" :message="msg" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.inbox-wrapper { display: flex; flex-direction: column; min-height: 100vh; }

.inbox-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(180deg, #1a0f05 0%, transparent 100%);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header-top { display: flex; align-items: center; justify-content: space-between; }

.player-info { display: flex; align-items: center; gap: 0.75rem; }
.player-icon { font-size: 1.5rem; }
.player-avatar-wrap {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-gold-dark);
  flex-shrink: 0;
  background: rgba(255,255,255,0.07);
  display: flex;
  align-items: center;
  justify-content: center;
}
.player-avatar { width: 100%; height: 100%; object-fit: cover; }
.player-name { font-family: var(--font-heading); font-size: 1rem; color: var(--color-parchment); letter-spacing: 0.05em; }
.player-class {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: rgba(180,120,20,0.15);
  border: 1px solid rgba(180,120,20,0.4);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  display: inline-block;
  margin: 0.1rem 0;
}
.session-name { font-family: var(--font-heading); font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--color-text-dim); }

.leave-btn {
  background: none; border: 1px solid var(--color-border); border-radius: 6px;
  padding: 0.4rem 0.75rem; color: var(--color-text-dim); font-family: var(--font-heading);
  font-size: 0.7rem; letter-spacing: 0.1em; cursor: pointer; text-transform: uppercase; transition: all 0.2s;
}
.leave-btn:hover { border-color: var(--color-red); color: #ff6b6b; }

/* HP Panel */
.hp-panel {
  background: linear-gradient(160deg, #1e130a, #150e06);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.hp-header-row { display: flex; justify-content: space-between; align-items: center; }
.hp-label { font-family: var(--font-heading); font-size: 0.7rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--color-text-dim); }
.ac-badge {
  font-family: var(--font-heading); font-size: 0.7rem; letter-spacing: 0.1em;
  color: #89c4ff; background: rgba(137,196,255,0.1); border: 1px solid rgba(137,196,255,0.35);
  border-radius: 20px; padding: 0.15rem 0.6rem;
}

.hp-bar-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.hp-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease, background 0.4s ease; }

.hp-controls { display: flex; align-items: center; gap: 0.5rem; }
.hp-btn {
  width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.05); color: var(--color-parchment); font-size: 1.2rem;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; line-height: 1;
}
.hp-btn.minus:hover { border-color: #e03030; color: #e03030; }
.hp-btn.plus:hover { border-color: #2fb896; color: #2fb896; }

.hp-value-wrap { display: flex; align-items: baseline; gap: 0.25rem; flex: 1; justify-content: center; }
.hp-input {
  width: 56px; text-align: center; background: transparent; border: none; outline: none;
  font-family: var(--font-heading); font-size: 1.4rem; font-weight: 700; color: var(--color-parchment);
}
.hp-max { font-family: var(--font-heading); font-size: 0.9rem; color: var(--color-text-dim); }

.hp-send-btn {
  padding: 0.3rem 0.8rem; border-radius: 6px; border: 1px solid var(--color-gold-dark);
  background: rgba(180,120,20,0.15); color: var(--color-gold); font-family: var(--font-heading);
  font-size: 0.65rem; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer;
  transition: all 0.2s; white-space: nowrap;
}
.hp-send-btn:hover:not(:disabled) { background: rgba(180,120,20,0.3); }
.hp-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hp-send-btn.sent { border-color: #2fb896; background: rgba(47,184,150,0.15); color: #2fb896; }

.inbox-main { flex: 1; padding: 1.5rem; }
.inbox-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; gap: 0.75rem; }
.empty-icon { font-size: 3rem; opacity: 0.5; }
.empty-text { font-family: var(--font-heading); font-size: 1rem; letter-spacing: 0.1em; color: var(--color-text-dim); text-align: center; }
.empty-sub { font-family: var(--font-body); color: var(--color-border); font-size: 0.9rem; }
.messages-list { display: flex; flex-direction: column; gap: 1rem; }

/* Conditions Panel */
.conditions-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.conditions-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.conditions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.condition-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.55rem;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.03);
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.2s;
}

.condition-btn:hover {
  border-color: #f0a500;
  color: #f0a500;
}

.condition-btn.active {
  border-color: #e03030;
  background: rgba(224,48,48,0.15);
  color: #ff6060;
}

.cond-icon { font-size: 0.85rem; }
.cond-label { white-space: nowrap; }
</style>
