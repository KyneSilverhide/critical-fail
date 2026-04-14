<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'

const router = useRouter()
const route = useRoute()

const sessionCode = ref(route.params.code || '')
const playerName = ref('')
const error = ref('')
const loading = ref(false)

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

async function joinSession() {
  if (!sessionCode.value || !playerName.value) {
    error.value = 'Veuillez remplir tous les champs.'
    return
  }
  loading.value = true
  error.value = ''

  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionCode.value}`)
    if (!res.ok) {
      error.value = 'Session introuvable ou fermée.'
      loading.value = false
      return
    }

    const socket = getSocket()

    socket.emit('join-session', {
      code: sessionCode.value,
      playerName: playerName.value,
    })

    socket.once('session-joined', (data) => {
      sessionStore.setActiveSession(data.session)
      sessionStore.playerInfo = { id: data.playerId, name: playerName.value }
      router.push('/player')
    })

    socket.once('error', (err) => {
      error.value = err.message || 'Erreur lors de la connexion.'
      loading.value = false
    })

  } catch {
    error.value = 'Erreur de connexion au serveur.'
    loading.value = false
  }
}
</script>

<template>
  <div class="join-wrapper">
    <header class="join-header">
      <button class="back-btn" @click="router.push('/')">← Retour</button>
      <div class="skull-ornament">⚔️</div>
      <h1 class="page-title">Rejoindre <span class="title-accent">une Session</span></h1>
    </header>

    <main class="join-main">
      <form class="join-form" @submit.prevent="joinSession">
        <div class="form-group">
          <label class="form-label">Code de session</label>
          <input
            v-model="sessionCode"
            type="text"
            class="form-input"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <p class="form-hint">Entrez le code fourni par votre MJ ou scannez le QR Code.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Votre nom de personnage</label>
          <input
            v-model="playerName"
            type="text"
            class="form-input"
            placeholder="Gandalf le Gris"
          />
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? 'Connexion...' : 'Rejoindre la session' }}
        </button>
      </form>
    </main>

    <footer class="app-footer">
      <p>Forgé dans les abysses ⚔️</p>
    </footer>
  </div>
</template>

<style scoped>
.join-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.join-header {
  text-align: center;
  padding: 2rem 1.5rem 1.5rem;
  position: relative;
}

.back-btn {
  position: absolute;
  left: 1rem;
  top: 1.5rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  cursor: pointer;
}

.back-btn:hover { color: var(--color-gold); }

.skull-ornament { font-size: 2rem; }

.page-title {
  font-family: var(--font-title);
  font-size: 1.8rem;
  color: var(--color-parchment);
  margin-top: 0.5rem;
}

.title-accent { color: var(--color-gold-bright); }

.join-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.join-form {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-input {
  background: #1e1508;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.form-hint {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  font-style: italic;
}

.form-error {
  color: #ff6b6b;
  font-family: var(--font-body);
  font-size: 0.9rem;
  text-align: center;
}

.submit-btn {
  padding: 1rem;
  background: linear-gradient(160deg, #1a4a2a, #0e2e1a);
  border: 1px solid #2a6a3a;
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.5rem;
}

.submit-btn:hover:not(:disabled) {
  background: linear-gradient(160deg, #2a6a3a, #1a4a2a);
  box-shadow: 0 4px 20px rgba(42,106,58,0.4);
}

.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

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
