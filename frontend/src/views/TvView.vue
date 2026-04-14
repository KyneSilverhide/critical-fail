<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'

const route = useRoute()
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const session = ref(null)
const players = ref([])
const connectionError = ref('')

// Track HP change animations per player: { id -> { type: 'damage'|'heal', delta: number, key: number } }
const hpAnimations = ref({})
// Track previous HP values to compute delta
const previousHp = ref({})

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

function avatarUrl(player) {
  if (!player.avatar_url) return null
  if (player.avatar_url.startsWith('http')) return player.avatar_url
  return `${BACKEND_URL}${player.avatar_url}`
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
    // Initialize previousHp tracking
    p.forEach(pl => { previousHp.value[pl.id] = pl.current_hp })
  })

  socket.on('player-joined', (player) => {
    const idx = players.value.findIndex(p => String(p.id) === String(player.id))
    if (idx === -1) {
      players.value.push(player)
    } else {
      players.value[idx] = { ...players.value[idx], ...player }
    }
    previousHp.value[player.id] = player.current_hp
  })

  socket.on('player-left', ({ playerId }) => {
    players.value = players.value.filter(p => String(p.id) !== String(playerId))
    delete previousHp.value[playerId]
    delete hpAnimations.value[playerId]
  })

  socket.on('hp-updated', ({ playerId, newHp }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      const oldHp = previousHp.value[players.value[idx].id] ?? players.value[idx].current_hp
      const delta = newHp - oldHp
      players.value[idx] = { ...players.value[idx], current_hp: newHp }
      previousHp.value[players.value[idx].id] = newHp

      const id = players.value[idx].id
      // Trigger animation (use a key to force re-trigger if updated quickly)
      hpAnimations.value = {
        ...hpAnimations.value,
        [id]: { type: delta < 0 ? 'damage' : 'heal', delta, key: Date.now() },
      }
      setTimeout(() => {
        const current = { ...hpAnimations.value }
        delete current[id]
        hpAnimations.value = current
      }, 2000)
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
            'is-damage': hpAnimations[player.id]?.type === 'damage',
            'is-heal': hpAnimations[player.id]?.type === 'heal',
            'is-critical': hpPercent(player) <= 20 && hpPercent(player) > 0,
            'is-ko': hpPercent(player) <= 0,
          }"
        >
          <!-- Header -->
          <div class="card-header">
            <!-- Avatar -->
            <div class="card-avatar">
              <img v-if="avatarUrl(player)" :src="avatarUrl(player)" :alt="player.player_name" class="avatar-img" />
              <span v-else class="avatar-fallback">{{ player.player_name?.[0]?.toUpperCase() || '?' }}</span>
            </div>

            <div class="card-identity">
              <span class="card-name">{{ player.player_name }}</span>
              <span v-if="player.dnd_class" class="class-badge">{{ player.dnd_class }}</span>
            </div>

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

          <!-- HP change floating indicator -->
          <Transition name="hp-float">
            <div
              v-if="hpAnimations[player.id]"
              :key="hpAnimations[player.id].key"
              class="hp-delta"
              :class="hpAnimations[player.id].type === 'damage' ? 'hp-delta-damage' : 'hp-delta-heal'"
            >
              {{ hpAnimations[player.id].delta > 0 ? '+' : '' }}{{ hpAnimations[player.id].delta }}
            </div>
          </Transition>
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

/* Damage animation: red shake */
.player-card.is-damage {
  animation: damageShake 0.5s ease-out, damageGlow 2s ease-out;
}
@keyframes damageShake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-8px); }
  30%  { transform: translateX(7px); }
  45%  { transform: translateX(-5px); }
  60%  { transform: translateX(4px); }
  75%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}
@keyframes damageGlow {
  0%   { box-shadow: 0 0 30px rgba(224,48,48,0.8); border-color: #e03030; }
  40%  { box-shadow: 0 0 20px rgba(224,48,48,0.4); }
  100% { box-shadow: none; border-color: var(--color-border); }
}

/* Heal animation: green pulse */
.player-card.is-heal {
  animation: healPulse 2s ease-out;
}
@keyframes healPulse {
  0%   { box-shadow: 0 0 0 0 rgba(47,184,150,0.7); border-color: #2fb896; }
  20%  { box-shadow: 0 0 30px 6px rgba(47,184,150,0.5); }
  60%  { box-shadow: 0 0 15px 2px rgba(47,184,150,0.2); }
  100% { box-shadow: none; border-color: var(--color-border); }
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Avatar */
.card-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-gold-dark);
  flex-shrink: 0;
  background: rgba(255,255,255,0.07);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-fallback {
  font-family: var(--font-heading);
  font-size: 1.3rem;
  color: var(--color-gold-dark);
  font-weight: 700;
  line-height: 1;
}

.card-identity {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.card-name {
  font-family: var(--font-heading);
  font-size: clamp(0.9rem, 2vw, 1.3rem);
  color: var(--color-parchment);
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.class-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: rgba(180,120,20,0.15);
  border: 1px solid rgba(180,120,20,0.4);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  width: fit-content;
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

/* HP floating delta */
.hp-delta {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-title);
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 900;
  pointer-events: none;
  text-shadow: 0 2px 10px rgba(0,0,0,0.8);
  z-index: 10;
}
.hp-delta-damage {
  color: #ff4444;
  text-shadow: 0 0 20px rgba(255,68,68,0.8), 0 2px 8px rgba(0,0,0,0.9);
}
.hp-delta-heal {
  color: #2fb896;
  text-shadow: 0 0 20px rgba(47,184,150,0.8), 0 2px 8px rgba(0,0,0,0.9);
}

/* Transition for HP delta float-up */
.hp-float-enter-active {
  animation: floatUp 2s ease-out forwards;
}
.hp-float-leave-active {
  display: none;
}
@keyframes floatUp {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
  20%  { opacity: 1; transform: translate(-50%, -70%) scale(1.1); }
  70%  { opacity: 0.8; transform: translate(-50%, -100%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -130%) scale(0.9); }
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
