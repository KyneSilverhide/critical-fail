<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSocket, resetSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import MessageCard from '../components/player/MessageCard.vue'

const router = useRouter()
const messages = ref([])
const playerInfo = ref(sessionStore.playerInfo || { name: 'Aventurier' })
const sessionName = ref(sessionStore.activeSession?.name || 'Session')

function leaveSession() {
  const socket = getSocket()
  socket.emit('leave-session')
  resetSocket()
  sessionStore.setActiveSession(null)
  sessionStore.playerInfo = null
  router.push('/')
}

onMounted(() => {
  if (!sessionStore.activeSession) {
    router.push('/join')
    return
  }

  const socket = getSocket()

  socket.on('new-message', (msg) => {
    messages.value.push({ ...msg, kind: 'message' })
  })

  socket.on('dice-result', (data) => {
    messages.value.push({ ...data, kind: 'dice' })
  })
})

onUnmounted(() => {
  const socket = getSocket()
  if (socket) {
    socket.off('new-message')
    socket.off('dice-result')
  }
})
</script>

<template>
  <div class="inbox-wrapper">
    <header class="inbox-header">
      <div class="header-top">
        <div class="player-info">
          <span class="player-icon">⚔️</span>
          <div>
            <p class="player-name">{{ playerInfo?.name || 'Aventurier' }}</p>
            <p class="session-name">{{ sessionName }}</p>
          </div>
        </div>
        <button class="leave-btn" @click="leaveSession">Quitter</button>
      </div>
    </header>

    <main class="inbox-main">
      <div v-if="messages.length === 0" class="inbox-empty">
        <p class="empty-icon">📜</p>
        <p class="empty-text">En attente de messages du MJ…</p>
        <p class="empty-sub">Restez vigilant, aventurier.</p>
      </div>

      <div v-else class="messages-list">
        <MessageCard
          v-for="(msg, idx) in messages"
          :key="idx"
          :message="msg"
        />
      </div>
    </main>

    <footer class="app-footer">
      <p>Forgé dans les abysses ⚔️</p>
    </footer>
  </div>
</template>

<style scoped>
.inbox-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.inbox-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(180deg, #1a0f05 0%, transparent 100%);
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.player-icon { font-size: 1.5rem; }

.player-name {
  font-family: var(--font-heading);
  font-size: 1rem;
  color: var(--color-parchment);
  letter-spacing: 0.05em;
}

.session-name {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.leave-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;
}

.leave-btn:hover {
  border-color: var(--color-red);
  color: #ff6b6b;
}

.inbox-main {
  flex: 1;
  padding: 1.5rem;
}

.inbox-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 0.75rem;
}

.empty-icon { font-size: 3rem; opacity: 0.5; }

.empty-text {
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.1em;
  color: var(--color-text-dim);
  text-align: center;
}

.empty-sub {
  font-family: var(--font-body);
  font-style: italic;
  color: var(--color-border);
  font-size: 0.9rem;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.app-footer {
  padding: 1.5rem;
  text-align: center;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-border);
}
</style>
