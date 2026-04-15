<script setup>
import { ref, onMounted, watch } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'

const BACKEND_URL = window.__RUNTIME_CONFIG__.VITE_BACKEND_URL

const sessionName = ref('')
const loading = ref(false)
const error = ref('')
const qrCodeUrl = ref(null)
const joinUrl = ref('')
const tvUrl = ref('')
const tvCopied = ref(false)

async function loadSessionQrCode(sessionId) {
  const cached = sessionStore.getQrCode(sessionId)
  if (cached) {
    qrCodeUrl.value = cached
    return
  }

  const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/qrcode`, {
    headers: { Authorization: `Bearer ${authStore.token}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Erreur lors du chargement du QR code.')
  }

  qrCodeUrl.value = data.qrCodeDataUrl
  sessionStore.setQrCode(sessionId, data.qrCodeDataUrl)
}

async function createSession() {
  if (!sessionName.value.trim()) {
    error.value = 'Veuillez saisir un nom de session.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ name: sessionName.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Erreur lors de la création.'
      return
    }
    sessionStore.setActiveSession(data.session)
    qrCodeUrl.value = data.qrCodeDataUrl
    sessionStore.setQrCode(data.session.id, data.qrCodeDataUrl)
    joinUrl.value = `${window.location.origin}/join/${data.session.code}`
    tvUrl.value = `${window.location.origin}/tv/${data.session.code}`
    sessionName.value = ''
    await loadSessions()
  } catch {
    error.value = 'Erreur de connexion au serveur.'
  } finally {
    loading.value = false
  }
}

async function loadSessions() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json()
    if (res.ok) sessionStore.setSessions(data)
  } catch {}
}

async function closeSession(id) {
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${id}/close`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (sessionStore.activeSession?.id === id) {
      sessionStore.setActiveSession(null)
      qrCodeUrl.value = null
    }
    await loadSessions()
  } catch {}
}

function selectSession(session) {
  sessionStore.setActiveSession(session)
  joinUrl.value = `${window.location.origin}/join/${session.code}`
  tvUrl.value = `${window.location.origin}/tv/${session.code}`
}

async function copyTvUrl() {
  try {
    await navigator.clipboard.writeText(tvUrl.value)
    tvCopied.value = true
    setTimeout(() => { tvCopied.value = false }, 2000)
  } catch {}
}

watch(
  () => sessionStore.activeSession,
  (session) => {
    if (!session) {
      qrCodeUrl.value = null
      joinUrl.value = ''
      return
    }
    joinUrl.value = `${window.location.origin}/join/${session.code}`
    tvUrl.value = `${window.location.origin}/tv/${session.code}`
    loadSessionQrCode(session.id).catch(() => {
      qrCodeUrl.value = null
    })
  },
  { immediate: true }
)

onMounted(loadSessions)
</script>

<template>
  <div class="session-manager">
    <section class="create-section">
      <h2 class="section-title">✦ Nouvelle Session</h2>
      <div class="create-form">
        <input
          v-model="sessionName"
          type="text"
          class="form-input"
          placeholder="Nom de la session…"
          @keyup.enter="createSession"
        />
        <button class="create-btn" @click="createSession" :disabled="loading">
          {{ loading ? '…' : 'Créer' }}
        </button>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
    </section>

    <section v-if="sessionStore.activeSession" class="active-session">
      <h2 class="section-title">✦ Session Active</h2>
      <div class="session-card active">
        <p class="session-name">{{ sessionStore.activeSession.name }}</p>
        <p class="session-code">{{ sessionStore.activeSession.code }}</p>
        <p class="join-url">
          <a :href="joinUrl" target="_blank">{{ joinUrl }}</a>
        </p>
        <div v-if="qrCodeUrl" class="qr-section">
          <img :src="qrCodeUrl" alt="QR Code" class="qr-code" />
          <p class="qr-hint">Scannez pour rejoindre</p>
        </div>

        <!-- TV Screen link -->
        <div class="tv-section">
          <div class="tv-header">
            <span class="tv-label">📺 Écran TV</span>
            <a :href="tvUrl" target="_blank" class="tv-open-btn">Ouvrir →</a>
          </div>
          <div class="tv-url-row">
            <span class="tv-url">{{ tvUrl }}</span>
            <button class="tv-copy-btn" @click="copyTvUrl">
              {{ tvCopied ? '✓ Copié' : '📋 Copier' }}
            </button>
          </div>
          <p class="tv-hint">Ouvrez ce lien sur votre TV ou second écran.</p>
        </div>

        <button class="close-btn" @click="closeSession(sessionStore.activeSession.id)">
          Fermer la session
        </button>
      </div>
    </section>

    <section v-if="sessionStore.sessions.length" class="sessions-list">
      <h2 class="section-title">✦ Sessions</h2>
      <div
        v-for="s in sessionStore.sessions"
        :key="s.id"
        class="session-card"
        :class="{ active: sessionStore.activeSession?.id === s.id, closed: s.status === 'closed' }"
        @click="s.status === 'active' && selectSession(s)"
      >
        <div class="session-card-inner">
          <div>
            <p class="session-name">{{ s.name }}</p>
            <p class="session-code">{{ s.code.slice(0, 8) }}…</p>
          </div>
          <span class="session-status" :class="s.status">{{ s.status }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.session-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.75rem;
}

.create-form {
  display: flex;
  gap: 0.5rem;
}

.form-input {
  flex: 1;
  background: #1e1508;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.65rem 1rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.95rem;
  outline: none;
}

.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.create-btn {
  padding: 0.65rem 1.25rem;
  background: linear-gradient(160deg, #4a2010, #2e1008);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.create-btn:hover:not(:disabled) {
  background: linear-gradient(160deg, #6b3020, #4a1e10);
}

.create-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.form-error {
  color: #ff6b6b;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.session-card {
  background: linear-gradient(160deg, #2a1e10, #1e1408);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.session-card.active {
  border-color: var(--color-gold-dark);
  cursor: default;
}

.session-card.closed {
  opacity: 0.5;
  cursor: not-allowed;
}

.session-card:not(.active):not(.closed):hover {
  border-color: var(--color-gold-dark);
}

.session-card-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.session-name {
  font-family: var(--font-heading);
  font-size: 0.95rem;
  color: var(--color-parchment);
}

.session-code {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin-top: 0.2rem;
}

.session-status {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 20px;
}

.session-status.active {
  color: #2fb896;
  background: rgba(47,184,150,0.1);
  border: 1px solid #2fb896;
}

.session-status.closed {
  color: var(--color-text-dim);
  background: rgba(90,70,50,0.1);
  border: 1px solid var(--color-border);
}

.join-url {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-gold);
  margin: 0.5rem 0;
  word-break: break-all;
}

.join-url a { color: var(--color-gold); }

.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1rem 0;
  gap: 0.5rem;
}

.qr-code {
  width: 180px;
  height: 180px;
  border: 3px solid var(--color-gold-dark);
  border-radius: 8px;
  background: white;
  padding: 4px;
}

.qr-hint {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.close-btn {
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.6rem;
  background: none;
  border: 1px solid #8b2a2a;
  border-radius: 6px;
  color: #ff6b6b;
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(139,42,42,0.15);
}

.tv-section {
  margin-top: 0.75rem;
  background: linear-gradient(160deg, #0e1a2a, #091220);
  border: 1px solid rgba(137,196,255,0.25);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tv-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #89c4ff;
}

.tv-open-btn {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  color: #89c4ff;
  text-decoration: none;
  border: 1px solid rgba(137,196,255,0.3);
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  transition: all 0.2s;
}
.tv-open-btn:hover { background: rgba(137,196,255,0.1); }

.tv-url-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tv-url {
  flex: 1;
  font-family: monospace;
  font-size: 0.7rem;
  color: rgba(137,196,255,0.7);
  word-break: break-all;
}

.tv-copy-btn {
  padding: 0.2rem 0.55rem;
  background: rgba(137,196,255,0.08);
  border: 1px solid rgba(137,196,255,0.25);
  border-radius: 6px;
  color: #89c4ff;
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.tv-copy-btn:hover { background: rgba(137,196,255,0.15); }

.tv-hint {
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--color-text-dim);
}
</style>
