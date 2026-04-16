<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'

const route = useRoute()
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const session = ref(null)
const players = ref([])
const connectionError = ref('')
const tvMode = ref('lobby')
const qrCodeDataUrl = ref(null)
const sessionCode = ref('')
const currentImageUrl = ref(null)
const activeVote = ref(null)
const activeMerchant = ref(null)

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

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function avatarUrl(player) {
  if (!player.avatar_url) return null
  return resolveMediaUrl(player.avatar_url)
}

const CONDITION_LABELS = {
  blinded: { label: 'Aveuglé', icon: '👁️' },
  charmed: { label: 'Charmé', icon: '💕' },
  deafened: { label: 'Assourdi', icon: '🔇' },
  exhaustion: { label: 'Épuisé', icon: '😴' },
  frightened: { label: 'Effrayé', icon: '😱' },
  grappled: { label: 'Agrippé', icon: '🤝' },
  incapacitated: { label: 'Incapacité', icon: '🚫' },
  invisible: { label: 'Invisible', icon: '👻' },
  paralyzed: { label: 'Paralysé', icon: '⚡' },
  petrified: { label: 'Pétrifié', icon: '🪨' },
  poisoned: { label: 'Empoisonné', icon: '☠️' },
  prone: { label: 'À terre', icon: '⬇️' },
  restrained: { label: 'Entravé', icon: '⛓️' },
  stunned: { label: 'Étourdi', icon: '💫' },
  unconscious: { label: 'Inconscient', icon: '💤' },
}

function parseConditions(player) {
  try {
    const raw = player.conditions
    if (!raw) return []
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function barWidth(optionIndex) {
  if (!activeVote.value || !activeVote.value.totalVotes) return 0
  return Math.round((activeVote.value.results[optionIndex] / activeVote.value.totalVotes) * 100)
}

function voterNamesFor(optionIndex) {
  if (!activeVote.value) return ''
  return activeVote.value.voterNames
    .filter(v => v.optionIndex === optionIndex)
    .map(v => v.name)
    .join(', ')
}

let socket = null

onMounted(() => {
  socket = io(BACKEND_URL)

  socket.on('connect', () => {
    socket.emit('tv-join', { sessionCode: route.params.code })
  })

  socket.on('tv-snapshot', (data) => {
    session.value = data.session
    players.value = data.players
    tvMode.value = data.tvMode || 'lobby'
    qrCodeDataUrl.value = data.qrCodeDataUrl || null
    sessionCode.value = data.sessionCode || ''
    currentImageUrl.value = data.currentImageUrl || null
    activeVote.value = data.activeVote || null
    activeMerchant.value = data.activeMerchant || null
    data.players.forEach(pl => { previousHp.value[pl.id] = pl.current_hp })
  })

  socket.on('tv-mode-changed', ({ mode, imageUrl, merchantData }) => {
    tvMode.value = mode
    if (imageUrl) currentImageUrl.value = imageUrl
    if (merchantData) activeMerchant.value = merchantData
    else if (mode === 'lobby') activeMerchant.value = null
  })

  socket.on('vote-started', (voteData) => {
    activeVote.value = { ...voteData, isClosed: false }
  })

  socket.on('vote-updated', (voteData) => {
    activeVote.value = { ...voteData, isClosed: false }
  })

  socket.on('vote-closed', (voteData) => {
    activeVote.value = { ...voteData, isClosed: true }
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

  socket.on('conditions-updated', ({ playerId, conditions }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      players.value[idx] = { ...players.value[idx], conditions }
    }
  })

  socket.on('concentration-updated', ({ playerId, isConcentrating }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      players.value[idx] = { ...players.value[idx], is_concentrating: isConcentrating }
    }
  })

  socket.on('error', ({ message }) => {
    connectionError.value = message
  })

  socket.on('merchant-items-updated', (merchantData) => {
    activeMerchant.value = merchantData
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
      <!-- Lobby mode: session title + QR code + session code -->
      <div v-if="tvMode === 'lobby'" class="lobby-display">
        <header class="tv-header">
          <div class="lobby-ornament" aria-hidden="true">⚜</div>
          <h1 class="session-title">{{ session.name }}</h1>
          <div class="lobby-divider" aria-hidden="true">⸻ ✦ ⸻</div>
        </header>
        <p class="lobby-title">Rejoignez la partie !</p>
        <img v-if="qrCodeDataUrl" :src="qrCodeDataUrl" alt="QR Code" class="lobby-qr" />
        <div class="lobby-code">{{ sessionCode }}</div>
        <p class="lobby-hint">Scannez le QR code ou saisissez le code sur l'application</p>
      </div>

      <!-- Combat mode: party HP grid -->
      <template v-else-if="tvMode === 'combat'">
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

              <span v-if="player.is_concentrating" class="concentration-badge" title="Concentration">🎯</span>
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

            <!-- Conditions -->
            <div v-if="parseConditions(player).length > 0" class="conditions-row">
              <span
                v-for="cid in parseConditions(player)"
                :key="cid"
                class="condition-badge"
                :title="CONDITION_LABELS[cid]?.label || cid"
              >
                {{ CONDITION_LABELS[cid]?.icon || '⚡' }} {{ CONDITION_LABELS[cid]?.label || cid }}
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
      </template>

      <!-- Vote mode -->
      <div v-else-if="tvMode === 'vote'" class="vote-display">
        <h2 class="vote-question">{{ activeVote?.question }}</h2>
        <div class="vote-progress">{{ activeVote?.totalVotes }} / {{ activeVote?.totalPlayers }} joueurs ont voté</div>
        <div v-if="activeVote?.isClosed" class="vote-results">
          <div v-for="(option, i) in activeVote.options" :key="i" class="vote-option">
            <div class="vote-option-header">
              <span class="vote-option-label">{{ option }}</span>
              <span class="vote-option-count">{{ activeVote.results[i] }} vote(s)</span>
            </div>
            <div class="vote-bar">
              <div class="vote-bar-fill" :style="{ width: barWidth(i) + '%' }"></div>
            </div>
            <span v-if="!activeVote.isAnonymous" class="voter-names">
              {{ voterNamesFor(i) }}
            </span>
          </div>
        </div>
        <div v-else class="vote-waiting">
          <div class="vote-orb"></div>
          <p>Vote en cours…</p>
        </div>
      </div>

      <!-- Image mode -->
      <div v-else-if="tvMode === 'image'" class="image-display">
        <img :src="resolveMediaUrl(currentImageUrl)" class="tv-image" alt="Image affichée" />
      </div>

      <!-- Merchant mode -->
      <div v-else-if="tvMode === 'merchant' && activeMerchant" class="merchant-display">
        <header class="merchant-header">
          <div class="merchant-icon">🏪</div>
          <h2 class="merchant-name">{{ activeMerchant.name }}</h2>
          <p v-if="activeMerchant.description" class="merchant-desc">{{ activeMerchant.description }}</p>
        </header>
        <div class="merchant-grid">
          <div
            v-for="item in activeMerchant.items"
            :key="item.id"
            class="merchant-item"
            :class="{ 'out-of-stock': item.stock === 0 }"
          >
            <div class="item-category">{{ item.category }}</div>
            <div class="item-name">{{ item.name }}</div>
            <p v-if="item.description" class="item-desc">{{ item.description }}</p>
            <div class="item-footer">
              <span class="item-price">{{ item.price }} po</span>
              <span v-if="item.stock === -1" class="item-stock unlimited">∞</span>
              <span v-else-if="item.stock === 0" class="item-stock empty">Épuisé</span>
              <span v-else class="item-stock">× {{ item.stock }}</span>
            </div>
          </div>
        </div>
      </div>

      <footer class="tv-footer">
        <span class="footer-text">CRITICAL FAIL • SESSION EN COURS</span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.tv-wrapper {
  min-height: 100vh;
  background: var(--color-bg);
  background-image: radial-gradient(ellipse at 50% 0%, #1f1608 0%, #120d04 60%);
  display: flex;
  flex-direction: column;
  padding: 2.5rem 3rem;
  box-sizing: border-box;
  font-size: 18px; /* Base font size boosted for TV viewing distance */
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

/* ── Header (lobby only) ──────────────────────────────────────────────── */
.tv-header {
  text-align: center;
  margin-bottom: 1rem;
}
.session-title {
  font-family: var(--font-title);
  font-size: clamp(2rem, 5vw, 4rem);
  color: var(--color-gold-bright);
  text-shadow: 0 0 40px rgba(240,192,64,0.4), 0 2px 0 rgba(0,0,0,0.8);
  letter-spacing: 0.1em;
  margin: 0.25rem 0;
}
.lobby-ornament {
  font-size: clamp(1.5rem, 3vw, 2.5rem);
  color: var(--color-gold-dark);
  opacity: 0.8;
  margin-bottom: 0.5rem;
}
.lobby-divider {
  font-family: var(--font-heading);
  font-size: clamp(0.8rem, 1.5vw, 1.1rem);
  letter-spacing: 0.5em;
  color: var(--color-gold-dark);
  margin-top: 0.5rem;
}

/* ── Lobby mode ───────────────────────────────────────────────────────── */
.lobby-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}
.lobby-title {
  font-family: var(--font-title);
  font-size: clamp(1.8rem, 3.5vw, 2.8rem);
  color: var(--color-parchment);
  text-shadow: 0 0 20px rgba(240,192,64,0.3), 0 2px 4px rgba(0,0,0,0.8);
  letter-spacing: 0.08em;
  margin: 0;
}
.lobby-qr {
  width: clamp(200px, 30vw, 400px);
  height: clamp(200px, 30vw, 400px);
  border: 4px solid var(--color-gold-dark);
  border-radius: 16px;
  background: white;
  padding: 8px;
  box-shadow: 0 0 40px rgba(201,168,76,0.2);
}
.lobby-code {
  font-family: var(--font-title);
  font-size: clamp(4rem, 12vw, 8rem);
  color: var(--color-gold-bright);
  text-shadow: 0 0 60px rgba(240,192,64,0.6), 0 4px 0 rgba(0,0,0,0.8);
  letter-spacing: 0.2em;
  line-height: 1;
}
.lobby-hint {
  font-family: var(--font-heading);
  font-size: clamp(0.7rem, 1.5vw, 1rem);
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-align: center;
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
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 2rem;
  align-content: start;
}

/* ── Player Card ─────────────────────────────────────────────────────── */
.player-card {
  position: relative;
  background: linear-gradient(160deg, var(--color-surface-soft) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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
  width: 110px;
  height: 110px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--color-gold-dark);
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
  font-size: 2.8rem;
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
  font-size: clamp(1.1rem, 2.2vw, 1.6rem);
  color: var(--color-parchment);
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.class-badge {
  font-family: var(--font-heading);
  font-size: 0.8rem;
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
  background: rgba(201,168,76,0.1);
  border: 1px solid rgba(201,168,76,0.4);
  border-radius: 8px;
  padding: 0.3rem 0.6rem;
}
.ac-icon { font-size: 1rem; }
.ac-value {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.3rem);
  font-weight: 700;
  color: var(--color-gold-bright);
}

.concentration-badge {
  font-size: 1.3rem;
  filter: drop-shadow(0 0 6px rgba(123,94,167,0.8));
}

/* HP Section */
.hp-section { display: flex; flex-direction: column; gap: 0.5rem; }
.hp-numbers { display: flex; align-items: baseline; gap: 0.3rem; }
.hp-current {
  font-family: var(--font-heading);
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 900;
  line-height: 1;
  transition: color 0.4s;
}
.hp-separator { font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-border); }
.hp-max { font-family: var(--font-heading); font-size: 1.3rem; color: var(--color-text-dim); }
.hp-label {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-left: 0.25rem;
}

.hp-track {
  height: 14px;
  background: rgba(255,255,255,0.06);
  border-radius: 7px;
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  border-radius: 7px;
  transition: width 0.6s ease, background 0.6s ease;
  box-shadow: 0 0 10px currentColor;
}

/* Conditions row */
.conditions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading);
  font-size: clamp(0.75rem, 1.4vw, 1rem);
  letter-spacing: 0.05em;
  color: #f0a500;
  background: rgba(240,165,0,0.12);
  border: 1px solid rgba(240,165,0,0.4);
  border-radius: 20px;
  padding: 0.24rem 0.7rem;
  white-space: nowrap;
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

/* ── Vote mode ────────────────────────────────────────────────────────── */
.vote-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}
.vote-question {
  font-family: var(--font-title);
  font-size: clamp(1.5rem, 4vw, 3rem);
  color: var(--color-gold-bright);
  text-shadow: 0 0 30px rgba(240,192,64,0.5), 0 2px 4px rgba(0,0,0,0.8);
  text-align: center;
  margin: 0;
}
.vote-progress {
  font-family: var(--font-heading);
  font-size: clamp(0.9rem, 2vw, 1.3rem);
  letter-spacing: 0.15em;
  color: var(--color-parchment-dark);
}
.vote-results {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.vote-option {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.vote-option-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.vote-option-label {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.4rem);
  color: var(--color-parchment);
}
.vote-option-count {
  font-family: var(--font-heading);
  font-size: clamp(0.85rem, 1.5vw, 1.1rem);
  color: var(--color-gold);
}
.vote-bar {
  height: 24px;
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}
.vote-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  border-radius: 12px;
  transition: width 0.8s ease;
  box-shadow: 0 0 10px rgba(240,192,64,0.4);
}
.voter-names {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-text-dim);
  font-style: italic;
}
.vote-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}
.vote-orb {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid var(--color-gold-dark);
  border-top-color: var(--color-gold-bright);
  animation: spin 1.5s linear infinite;
  box-shadow: 0 0 30px rgba(240,192,64,0.3);
}
.vote-waiting p {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.4rem);
  letter-spacing: 0.2em;
  color: var(--color-parchment);
}

/* ── Image mode ───────────────────────────────────────────────────────── */
.image-display {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tv-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

/* ── Merchant mode ────────────────────────────────────────────────────── */
.merchant-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.merchant-header {
  text-align: center;
}
.merchant-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}
.merchant-name {
  font-family: var(--font-title);
  font-size: clamp(2rem, 4vw, 3.5rem);
  color: var(--color-gold-bright);
  text-shadow: 0 0 30px rgba(240,192,64,0.5);
  letter-spacing: 0.08em;
  margin: 0;
}
.merchant-desc {
  font-family: var(--font-heading);
  font-size: clamp(0.7rem, 1.5vw, 1rem);
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  margin-top: 0.5rem;
}
.merchant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.merchant-item {
  background: linear-gradient(160deg, var(--color-surface-soft) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.2s;
}
.merchant-item:not(.out-of-stock):hover {
  border-color: var(--color-gold-dark);
}
.merchant-item.out-of-stock {
  opacity: 0.45;
  filter: grayscale(0.5);
}
.item-category {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.item-name {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.3rem);
  color: var(--color-parchment);
  letter-spacing: 0.04em;
}
.item-desc {
  font-family: var(--font-body);
  font-size: clamp(0.8rem, 1.5vw, 1rem);
  color: var(--color-text-dim);
  line-height: 1.4;
  margin: 0;
  flex: 1;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
}
.item-price {
  font-family: var(--font-title);
  font-size: clamp(1.4rem, 3vw, 2rem);
  color: var(--color-gold-bright);
  text-shadow: 0 0 12px rgba(240,192,64,0.4);
}
.item-stock {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.2rem 0.65rem;
}
.item-stock.unlimited { color: var(--color-gold-dark); border-color: var(--color-gold-dark); }
.item-stock.empty { color: #ff6b6b; border-color: #8b2a2a; background: rgba(139,42,42,0.1); }

/* ── Footer ──────────────────────────────────────────────────────────── */
.tv-footer {
  text-align: center;
  margin-top: 2rem;
}
.footer-text {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  opacity: 0.7;
}
</style>
