<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../stores/auth.js'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

async function login() {
  if (!username.value || !password.value) {
    error.value = 'Veuillez remplir tous les champs.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Identifiants incorrects.'
      return
    }
    authStore.login(data.token, data.admin)
    router.push('/admin')
  } catch {
    error.value = 'Erreur de connexion au serveur.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <header class="login-header">
      <button class="back-btn" @click="router.push('/')">← Retour</button>
      <div class="skull-ornament">🎲</div>
      <h1 class="page-title">Connexion <span class="title-accent">MJ</span></h1>
      <p class="page-subtitle">Maître du Jeu</p>
    </header>

    <main class="login-main">
      <form class="login-form" @submit.prevent="login">
        <div class="form-group">
          <label class="form-label">Nom d'utilisateur</label>
          <input
            v-model="username"
            type="text"
            class="form-input"
            placeholder="admin"
            autocomplete="username"
          />
        </div>
        <div class="form-group">
          <label class="form-label">Mot de passe</label>
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="••••••••"
            autocomplete="current-password"
          />
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button type="submit" class="submit-btn" :disabled="loading">
          <span>{{ loading ? 'Connexion...' : 'Se connecter' }}</span>
        </button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.login-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.login-header {
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
  letter-spacing: 0.1em;
}

.back-btn:hover { color: var(--color-gold); }

.skull-ornament { font-size: 2rem; }

.page-title {
  font-family: var(--font-title);
  font-size: 2rem;
  color: var(--color-parchment);
  margin: 0.5rem 0 0.2rem;
}

.title-accent { color: var(--color-gold-bright); }

.page-subtitle {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.25em;
  color: var(--color-text-dim);
  text-transform: uppercase;
}

.login-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.login-form {
  width: 100%;
  max-width: 360px;
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
  background: var(--color-surface);
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

.form-error {
  color: #ff6b6b;
  font-family: var(--font-body);
  font-size: 0.9rem;
  text-align: center;
}

.submit-btn {
  padding: 1rem;
  background: linear-gradient(160deg, #6b1a1a, #4a0f0f);
  border: 1px solid #8b2a2a;
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
  background: linear-gradient(160deg, #8b2a2a, #6b1a1a);
  box-shadow: 0 4px 20px rgba(139,26,26,0.5);
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
