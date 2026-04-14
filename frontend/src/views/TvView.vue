<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'

const route = useRoute()
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const session = ref(null)
const players = ref([])
const connectionError = ref('')

// Track which players had their HP recently updated (for animation)
const hpAnimating = ref(new Set())

function hpPercent(player) {
  if (!player.max_hp) return 100
  return Math.min(100, Math.max(0, (player.current_hp / player.max_hp) * 100))
}
function hpBarColor(player) {
  const pct = hpPercent(player)
  if (pct > 50) return '#2fb896'
  if (pct > 20) return '#f0a500'
  return '#e03030'
}
function hpStatus(player) {
  const pct = hpPercent(player)
  if (pct <= 0) return 'KO'
  if (pct <= 20) return 'Critique'
  if (pct <= 50) return 'Blessé'
  return 'En forme'
}
function statusColor(player) {
  const pct = hpPercent(player)
  if (pct <= 0) return '#888'
  if (pct <= 20) return '#e03030'
  if (pct <= 50) return '#f0a500'
  return '#2fb896'
}

let socket = null

onMounted(() => {
  socket = io(BACKEND_URL)

  socket.on('connect', () => {
    socket.emit('tv-join', { sessionCode: route.params.code })
  })

  socket.on('tv-snapshot', ({ session: s, players: p }) => {
    session.value = s
    players.value = p
  })

  socket.on('player-joined', (player) => {
    const idx = players.value.findIndex(p => String(p.id) === String(player.id))
    if (idx === -1) players.value.push(player)
    else players.value[idx] = { ...players.value[idx], ...player }
  })

  socket.on('player-left', ({ playerId }) => {
    players.value = players.value.filter(p => String(p.id) !== String(playerId))
  })

  socket.on('hp-updated', ({ playerId, newHp }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      players.value[idx] = { ...players.value[idx], current_hp: newHp }
      // Trigger animation
      const id = players.value[idx].id
      hpAnimating.value = new Set([...hpAnimating.value, id])
      setTimeout(() => {
        hpAnimating.value = new Set([...hpAnimating.value].filter(x => x !== id))
      }, 1500)
    }
  })

  socket.on('error', ({ message }) => {
    connectionError.value = message
  })
})

onUnmounted(() => {
  if (socket) socket.disconnect()
})
</script>

<template>
  <div class="tv-wrapper">
    <!-- Error state -->
    <div v-if="connectionError" class="tv-error">
      <p class="error-icon">⚠️</p>
      <p class="error-text">{{ connectionError }}</p>
    </div>

    <!-- Loading state -->
    <div v-else-if="!session" class="tv-loading">
      <div class="loading-orb" />
      <p class="loading-text">Connexion à la session…</p>
    </div>

    <!-- Main TV display -->
    <template v-else>
      <header class="tv-header">
        <div class="header-ornament">⚔</div>
        <h1 class="session-title">{{ session.name }}</h1>
        <p class="party-label">Groupe d'Aventuriers</p>
      </header>

      <div v-if="players.length === 0" class="tv-empty">
        <p class="empty-icon">🏰</p>
        <p class="empty-text">En attente des aventuriers…</p>
      </div>

      <main v-else class="party-grid">
        <div
          v-for="player in players"
          :key="player.id"
          class="player-card"
          :class="{
            'is-animating': hpAnimating.has(player.id),
            'is-critical': hpPercent(player) <= 20 && hpPercent(player) > 0,
            'is-ko': hpPercent(player) <= 0,
          }"
        >
          <!-- Header -->
          <div class="card-header">
            <span class="card-sword">⚔️</span>
            <span class="card-name">{{ player.player_name }}</span>
            <div class="ac-shield">
              <span class="ac-icon">🛡️</span>
              <span class="ac-value">{{ player.ac ?? 10 }}</span>
            </div>
          </div>

          <!-- HP Bar -->
          <div class="hp-section">
            <div class="hp-numbers">
              <span class="hp-current" :style="{ color: hpBarColor(player) }">
                {{ player.current_hp ?? 0 }}
              </span>
              <span class="hp-separator">/</span>
              <span class="hp-max">{{ player.max_hp ?? 0 }}</span>
              <span class="hp-label">PV</span>
            </div>
            <div class="hp-track">
              <div
                class="hp-fill"
                :style="{ width: hpPercent(player) + '%', background: hpBarColor(player) }"
              />
            </div>
          </div>

          <!-- Status -->
          <div class="card-footer">
            <span class="status-badge" :style="{ color: statusColor(player), borderColor: statusColor(player) }">
              {{ hpStatus(player) }}
            </span>
          </div>

          <!-- Animate overlay on HP change -->
          <div v-if="hpAnimating.has(player.id)" class="hp-pulse-overlay" />
        </div>
      </main>

      <footer class="tv-footer">
        <span class="footer-text">CRITICAL FAIL • SESSION EN COURS</span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.tv-wrapper {
  min-height: 100vh;
  background: radial-gradient(ellipse at top, #1a0f05 0%, #0a0802 60%, #000 100%);
  display: flex;
  flex-direction: column;
  padding: 2rem;
  box-sizing: border-box;
}

/* ── Loading / Error ─────────────────────────────────────────────────── */
.tv-loading, .tv-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.loading-orb {
  width: 48px; height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-gold);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-family: var(--font-heading); font-size: 1rem; letter-spacing: 0.2em; color: var(--color-text-dim); }
.error-icon { font-size: 3rem; }
.error-text { font-family: var(--font-heading); font-size: 1.2rem; color: #ff6b6b; text-align: center; }

/* ── Header ──────────────────────────────────────────────────────────── */
.tv-header {
  text-align: center;
  margin-bottom: 2.5rem;
}
.header-ornament {
  font-size: 2rem;
  color: var(--color-gold-dark);
  letter-spacing: 1rem;
  display: block;
  margin-bottom: 0.5rem;
  opacity: 0.6;
}
.session-title {
  font-family: var(--font-title);
  font-size: clamp(2rem, 5vw, 4rem);
  color: var(--color-gold-bright);
  text-shadow: 0 0 40px rgba(240,192,64,0.4), 0 2px 0 rgba(0,0,0,0.8);
  letter-spacing: 0.1em;
  margin: 0;
}
.party-label {
  font-family: var(--font-heading);
  font-size: clamp(0.7rem, 1.5vw, 1rem);
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-top: 0.5rem;
}

/* ── Empty ───────────────────────────────────────────────────────────── */
.tv-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.empty-icon { font-size: 4rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-text-dim); letter-spacing: 0.2em; }

/* ── Party Grid ──────────────────────────────────────────────────────── */
.party-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  align-content: start;
}

/* ── Player Card ─────────────────────────────────────────────────────── */
.player-card {
  position: relative;
  background: linear-gradient(160deg, #2a1e10 0%, #1a1208 50%, #120d05 100%);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.player-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--color-gold-dark), transparent);
  opacity: 0.4;
}
.player-card.is-critical {
  border-color: #e03030;
  box-shadow: 0 0 20px rgba(224,48,48,0.2);
}
.player-card.is-ko {
  border-color: #555;
  opacity: 0.6;
  filter: grayscale(0.5);
}
.player-card.is-animating {
  animation: hpFlash 1.5s ease-out;
}

@keyframes hpFlash {
  0%   { box-shadow: 0 0 0px rgba(240,192,64,0); border-color: var(--color-gold-bright); }
  20%  { box-shadow: 0 0 40px rgba(240,192,64,0.6); }
  60%  { box-shadow: 0 0 20px rgba(240,192,64,0.3); }
  100% { box-shadow: none; border-color: var(--color-border); }
}

.hp-pulse-overlay {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background: radial-gradient(ellipse at center, rgba(240,192,64,0.12) 0%, transparent 70%);
  pointer-events: none;
  animation: pulseOut 1.5s ease-out forwards;
}
@keyframes pulseOut {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.card-sword { font-size: 1.2rem; }
.card-name {
  flex: 1;
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.4rem);
  color: var(--color-parchment);
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-shield {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(137,196,255,0.1);
  border: 1px solid rgba(137,196,255,0.3);
  border-radius: 8px;
  padding: 0.3rem 0.6rem;
}
.ac-icon { font-size: 1rem; }
.ac-value {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.3rem);
  font-weight: 700;
  color: #89c4ff;
}

/* HP Section */
.hp-section { display: flex; flex-direction: column; gap: 0.5rem; }
.hp-numbers { display: flex; align-items: baseline; gap: 0.3rem; }
.hp-current {
  font-family: var(--font-heading);
  font-size: clamp(1.6rem, 4vw, 2.5rem);
  font-weight: 900;
  line-height: 1;
  transition: color 0.4s;
}
.hp-separator { font-family: var(--font-heading); font-size: 1.2rem; color: var(--color-border); }
.hp-max { font-family: var(--font-heading); font-size: 1rem; color: var(--color-text-dim); }
.hp-label {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-left: 0.25rem;
}

.hp-track {
  height: 10px;
  background: rgba(255,255,255,0.06);
  border-radius: 5px;
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.6s ease, background 0.6s ease;
  box-shadow: 0 0 8px currentColor;
}

/* Card Footer */
.card-footer { display: flex; justify-content: flex-end; }
.status-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 20px;
  padding: 0.15rem 0.5rem;
  background: rgba(0,0,0,0.2);
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.tv-footer {
  text-align: center;
  margin-top: 2rem;
}
.footer-text {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--color-border);
  opacity: 0.5;
}
</style>

