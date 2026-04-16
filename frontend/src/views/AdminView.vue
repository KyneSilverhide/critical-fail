<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../stores/auth.js'
import { sessionStore } from '../stores/session.js'
import { getSocket, resetSocket } from '../socket.js'
import SessionManager from '../components/admin/SessionManager.vue'
import PlayerList from '../components/admin/PlayerList.vue'
import MessageTool from '../components/admin/MessageTool.vue'
import CriticalFailTool from '../components/admin/CriticalFailTool.vue'
import SessionJournal from '../components/admin/SessionJournal.vue'
import TvControls from '../components/admin/TvControls.vue'
import VoteManager from '../components/admin/VoteManager.vue'
import ImageManager from '../components/admin/ImageManager.vue'
import MerchantManager from '../components/admin/MerchantManager.vue'
import SearchTool from '../components/admin/SearchTool.vue'

const router = useRouter()
const activeTab = ref('sessions')

const tabs = [
  { key: 'sessions', label: 'Sessions', icon: '📋' },
  { key: 'message', label: 'Message', icon: '✉️' },
  { key: 'dice', label: 'Critical Fail', icon: '🎲' },
  { key: 'journal', label: 'Journal', icon: '📜' },
  { key: 'tv', label: 'TV', icon: '📺' },
  { key: 'vote', label: 'Vote', icon: '🗳️' },
  { key: 'images', label: 'Images', icon: '🖼️' },
  { key: 'merchants', label: 'Marchands', icon: '🏪' },
  { key: 'search', label: 'Recherche', icon: '🔍' },
]

function logout() {
  resetSocket()
  authStore.logout()
  router.push('/')
}

onMounted(() => {
  const socket = getSocket(authStore.token)

  socket.on('player-joined', (player) => {
    sessionStore.addPlayer(player)
  })

  socket.on('player-left', (data) => {
    sessionStore.removePlayer(data.playerId)
  })

  socket.on('players-snapshot', ({ sessionId, players }) => {
    if (sessionStore.activeSession?.id !== sessionId) return
    sessionStore.setPlayers(players)
  })

  socket.on('hp-updated', ({ playerId, newHp }) => {
    sessionStore.updatePlayerHp(playerId, newHp)
  })

  socket.on('conditions-updated', ({ playerId, conditions }) => {
    sessionStore.updatePlayerConditions(playerId, conditions)
  })

  socket.on('concentration-updated', ({ playerId, isConcentrating }) => {
    sessionStore.updatePlayerConcentration(playerId, isConcentrating)
  })
})

watch(
  () => sessionStore.activeSession?.id,
  (sessionId) => {
    if (!sessionId) return
    const socket = getSocket(authStore.token)
    socket.emit('admin-join', sessionId)
  },
  { immediate: true }
)

onUnmounted(() => {
  const socket = getSocket()
  socket.off('player-joined')
  socket.off('player-left')
  socket.off('players-snapshot')
  socket.off('hp-updated')
  socket.off('conditions-updated')
  socket.off('concentration-updated')
})
</script>

<template>
  <div class="admin-wrapper">
    <header class="admin-header">
      <div class="header-top">
        <h1 class="page-title">🎲 Tableau de Bord <span class="title-accent">MJ</span></h1>
        <button class="logout-btn" @click="logout">Déconnexion</button>
      </div>
      <p class="admin-name" v-if="authStore.admin">{{ authStore.admin.username }}</p>

      <nav class="admin-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="nav-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </header>

    <main class="admin-main">
      <div v-show="activeTab === 'sessions'">
        <SessionManager />
        <PlayerList v-if="sessionStore.activeSession" />
      </div>
      <div v-show="activeTab === 'message'">
        <MessageTool />
      </div>
      <div v-show="activeTab === 'dice'">
        <CriticalFailTool />
      </div>
      <div v-show="activeTab === 'journal'">
        <SessionJournal />
      </div>
      <div v-show="activeTab === 'tv'">
        <TvControls v-if="sessionStore.activeSession" />
        <p v-else class="no-session-msg">Aucune session active. Créez ou sélectionnez une session.</p>
      </div>
      <div v-show="activeTab === 'vote'">
        <VoteManager v-if="sessionStore.activeSession" />
        <p v-else class="no-session-msg">Aucune session active. Créez ou sélectionnez une session.</p>
      </div>
      <div v-show="activeTab === 'images'">
        <ImageManager v-if="sessionStore.activeSession" />
        <p v-else class="no-session-msg">Aucune session active. Créez ou sélectionnez une session.</p>
      </div>
      <div v-show="activeTab === 'merchants'">
        <MerchantManager v-if="sessionStore.activeSession" />
        <p v-else class="no-session-msg">Aucune session active. Créez ou sélectionnez une session.</p>
      </div>
      <div v-show="activeTab === 'search'">
        <SearchTool />
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.admin-header {
  padding: 1.5rem 1.5rem 0;
  background: linear-gradient(180deg, var(--color-surface-alt) 0%, transparent 100%);
  border-bottom: 1px solid var(--color-border);
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.page-title {
  font-family: var(--font-title);
  font-size: 1.4rem;
  color: var(--color-parchment);
}

.title-accent { color: var(--color-gold-bright); }

.admin-name {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  margin-bottom: 1rem;
}

.logout-btn {
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

.logout-btn:hover {
  border-color: var(--color-red);
  color: #ff6b6b;
}

.admin-nav {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.nav-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 0.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover { color: var(--color-parchment); }

.nav-btn.active {
  color: var(--color-gold-bright);
  border-bottom-color: var(--color-gold-bright);
}

.admin-main {
  flex: 1;
  padding: 1.5rem;
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

.no-session-msg {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  font-size: 0.9rem;
  padding: 1rem 0;
}
</style>
