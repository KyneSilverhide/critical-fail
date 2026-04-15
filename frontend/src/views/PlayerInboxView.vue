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

// Concentration
const isConcentrating = ref(false)
const concentrationWarning = ref(null)

function toggleConcentration() {
  isConcentrating.value = !isConcentrating.value
  const socket = getSocket()
  socket.emit('update-concentration', { isConcentrating: isConcentrating.value })
}

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

// Vote
const activeVote = ref(null)
const myVote = ref(null)

function submitVote(optionIndex) {
  const socket = getSocket()
  socket.emit('submit-vote', { voteId: activeVote.value.id, optionIndex })
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
const handleConcentrationConfirmed = (data) => {
  isConcentrating.value = data.isConcentrating
}
const handleConcentrationWarning = (data) => {
  concentrationWarning.value = data
}
const handleVoteStarted = (voteData) => {
  activeVote.value = { ...voteData, isClosed: false }
  myVote.value = null
}
const handleVoteClosed = (voteData) => {
  activeVote.value = { ...voteData, isClosed: true }
}
const handleVoteSubmitted = (data) => {
  myVote.value = data.optionIndex
}

// Merchant
const activeMerchant = ref(sessionStore.activeMerchant || null)
const purchaseStateByItem = ref({}) // itemId -> 'idle'|'pending'
const purchaseNotifications = ref([]) // { id, message, type }
const counterOffers = ref([]) // { requestId, action, finalPrice, itemName }

function buyItem(itemId) {
  if (purchaseStateByItem.value[itemId] === 'pending') return
  purchaseStateByItem.value[itemId] = 'pending'
  const socket = getSocket()
  socket.emit('request-purchase', { itemId, quantity: 1 })
}

function respondCounterOffer(requestId, accept) {
  const socket = getSocket()
  socket.emit('respond-counter-offer', { requestId, accept })
  counterOffers.value = counterOffers.value.filter(c => c.requestId !== requestId)
}

function addNotification(message, type = 'info') {
  const id = Date.now()
  purchaseNotifications.value.push({ id, message, type })
  setTimeout(() => {
    purchaseNotifications.value = purchaseNotifications.value.filter(n => n.id !== id)
  }, 5000)
}

const handleMerchantShown = (data) => { activeMerchant.value = data }
const handleMerchantItemsUpdated = (data) => { activeMerchant.value = data }
const handlePurchaseRequested = ({ itemId }) => {
  // state stays 'pending' until confirmed
}
const handlePurchaseAccepted = ({ itemName, finalPrice }) => {
  Object.keys(purchaseStateByItem.value).forEach(k => {
    if (purchaseStateByItem.value[k] === 'pending') delete purchaseStateByItem.value[k]
  })
  addNotification(`✅ Achat accepté : ${itemName} (${finalPrice} po)`, 'success')
}
const handlePurchaseRejected = ({ itemName }) => {
  Object.keys(purchaseStateByItem.value).forEach(k => {
    if (purchaseStateByItem.value[k] === 'pending') delete purchaseStateByItem.value[k]
  })
  addNotification(`❌ Achat refusé : ${itemName}`, 'error')
}
const handlePurchaseCounterOffer = (data) => {
  Object.keys(purchaseStateByItem.value).forEach(k => {
    if (purchaseStateByItem.value[k] === 'pending') delete purchaseStateByItem.value[k]
  })
  counterOffers.value.push(data)
}
const handleCounterOfferResult = ({ accepted, itemName, finalPrice }) => {
  if (accepted) {
    addNotification(`✅ Contre-offre acceptée : ${itemName} (${finalPrice} po)`, 'success')
  } else {
    addNotification(`↩️ Contre-offre déclinée : ${itemName}`, 'info')
  }
}
const handlePurchaseError = ({ message }) => {
  Object.keys(purchaseStateByItem.value).forEach(k => {
    if (purchaseStateByItem.value[k] === 'pending') delete purchaseStateByItem.value[k]
  })
  addNotification(`⚠️ ${message}`, 'error')
}

onMounted(() => {
  if (!sessionStore.activeSession) { router.push('/join'); return }
  const socket = getSocket()
  socket.on('new-message', handleNewMessage)
  socket.on('dice-result', handleDiceResult)
  socket.on('hp-update-confirmed', handleHpConfirmed)
  socket.on('concentration-confirmed', handleConcentrationConfirmed)
  socket.on('concentration-warning', handleConcentrationWarning)
  socket.on('vote-started', handleVoteStarted)
  socket.on('vote-closed', handleVoteClosed)
  socket.on('vote-submitted', handleVoteSubmitted)
  socket.on('merchant-shown', handleMerchantShown)
  socket.on('merchant-items-updated', handleMerchantItemsUpdated)
  socket.on('purchase-requested', handlePurchaseRequested)
  socket.on('purchase-accepted', handlePurchaseAccepted)
  socket.on('purchase-rejected', handlePurchaseRejected)
  socket.on('purchase-counter-offer', handlePurchaseCounterOffer)
  socket.on('counter-offer-result', handleCounterOfferResult)
  socket.on('purchase-error', handlePurchaseError)
})

onUnmounted(() => {
  const socket = getSocket()
  if (socket) {
    socket.off('new-message', handleNewMessage)
    socket.off('dice-result', handleDiceResult)
    socket.off('hp-update-confirmed', handleHpConfirmed)
    socket.off('concentration-confirmed', handleConcentrationConfirmed)
    socket.off('concentration-warning', handleConcentrationWarning)
    socket.off('vote-started', handleVoteStarted)
    socket.off('vote-closed', handleVoteClosed)
    socket.off('vote-submitted', handleVoteSubmitted)
    socket.off('merchant-shown', handleMerchantShown)
    socket.off('merchant-items-updated', handleMerchantItemsUpdated)
    socket.off('purchase-requested', handlePurchaseRequested)
    socket.off('purchase-accepted', handlePurchaseAccepted)
    socket.off('purchase-rejected', handlePurchaseRejected)
    socket.off('purchase-counter-offer', handlePurchaseCounterOffer)
    socket.off('counter-offer-result', handleCounterOfferResult)
    socket.off('purchase-error', handlePurchaseError)
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

      <!-- Concentration Toggle -->
      <div class="concentration-panel">
        <button
          class="concentration-btn"
          :class="{ active: isConcentrating }"
          @click="toggleConcentration"
        >
          <span class="concentration-icon">🎯</span>
          <span>{{ isConcentrating ? 'Concentration active' : 'Se concentrer' }}</span>
        </button>
      </div>

      <!-- Concentration Warning Banner -->
      <div v-if="concentrationWarning" class="concentration-warning">
        <div class="warning-content">
          <p class="warning-title">⚠️ Jet de concentration requis !</p>
          <p class="warning-desc">DD {{ concentrationWarning.dc }} ({{ concentrationWarning.damage }} dégâts subis)</p>
        </div>
        <button class="warning-dismiss" @click="concentrationWarning = null">✕</button>
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

    <!-- Vote Panel -->
    <div v-if="activeVote" class="vote-panel">
      <h3 class="vote-title">🗳️ Vote : {{ activeVote.question }}</h3>
      <div v-if="myVote === null && !activeVote.isClosed" class="vote-options">
        <button
          v-for="(opt, i) in activeVote.options"
          :key="i"
          class="vote-option-btn"
          @click="submitVote(i)"
        >{{ opt }}</button>
      </div>
      <div v-else-if="myVote !== null && !activeVote.isClosed" class="vote-done">
        <p>✓ Vous avez voté pour : <strong>{{ activeVote.options[myVote] }}</strong></p>
      </div>
      <div v-if="activeVote.isClosed" class="vote-results-mini">
        <p class="vote-closed-label">Vote clôturé — Résultats :</p>
        <p v-for="(opt, i) in activeVote.options" :key="i" class="vote-result-line">
          {{ opt }}: <strong>{{ activeVote.results[i] }}</strong> vote(s)
        </p>
      </div>
    </div>

    <!-- Merchant Panel -->
    <div v-if="activeMerchant" class="merchant-panel">
      <h3 class="merchant-title">🏪 {{ activeMerchant.name }}</h3>
      <p v-if="activeMerchant.description" class="merchant-desc">{{ activeMerchant.description }}</p>

      <!-- Counter offers -->
      <div v-for="offer in counterOffers" :key="offer.requestId" class="counter-offer">
        <p class="offer-text">
          <span v-if="offer.action === 'discount'">💚 Ristourne proposée</span>
          <span v-else>📈 Nouveau prix proposé</span>
          pour <strong>{{ offer.itemName }}</strong> :
          <strong class="offer-price">{{ offer.finalPrice }} po</strong>
        </p>
        <div class="offer-actions">
          <button class="offer-btn accept" @click="respondCounterOffer(offer.requestId, true)">Accepter</button>
          <button class="offer-btn decline" @click="respondCounterOffer(offer.requestId, false)">Décliner</button>
        </div>
      </div>

      <!-- Purchase notifications -->
      <div v-for="notif in purchaseNotifications" :key="notif.id" class="purchase-notif" :class="notif.type">
        {{ notif.message }}
      </div>

      <!-- Items grouped by category -->
      <div class="shop-items">
        <div
          v-for="item in activeMerchant.items"
          :key="item.id"
          class="shop-item"
          :class="{ 'out-of-stock': item.stock === 0 }"
        >
          <div class="shop-item-info">
            <span class="shop-item-cat">{{ item.category }}</span>
            <span class="shop-item-name">{{ item.name }}</span>
            <p v-if="item.description" class="shop-item-desc">{{ item.description }}</p>
          </div>
          <div class="shop-item-right">
            <span class="shop-item-price">{{ item.price }} po</span>
            <span v-if="item.stock !== -1 && item.stock !== 0" class="shop-item-stock">×{{ item.stock }}</span>
            <span v-else-if="item.stock === 0" class="shop-item-stock empty">Épuisé</span>
            <button
              v-if="item.stock !== 0"
              class="buy-btn"
              :disabled="purchaseStateByItem[item.id] === 'pending'"
              @click="buyItem(item.id)"
            >
              {{ purchaseStateByItem[item.id] === 'pending' ? '…' : 'Acheter' }}
            </button>
          </div>
        </div>
      </div>
    </div>

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

/* Concentration */
.concentration-panel {
  display: flex;
}
.concentration-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.03);
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.concentration-btn:hover {
  border-color: #7b5ea7;
  color: #b89ee8;
}
.concentration-btn.active {
  border-color: #7b5ea7;
  background: rgba(123,94,167,0.2);
  color: #b89ee8;
  box-shadow: 0 0 10px rgba(123,94,167,0.3);
}
.concentration-icon { font-size: 1rem; }

/* Concentration Warning */
.concentration-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(123,94,167,0.15);
  border: 1px solid #7b5ea7;
  border-radius: 10px;
  animation: pulseWarning 2s ease-in-out infinite;
}
@keyframes pulseWarning {
  0%, 100% { box-shadow: 0 0 0 0 rgba(123,94,167,0.4); }
  50% { box-shadow: 0 0 12px 4px rgba(123,94,167,0.3); }
}
.warning-content { flex: 1; }
.warning-title {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  font-weight: 700;
  color: #b89ee8;
  letter-spacing: 0.05em;
  margin: 0 0 0.25rem;
}
.warning-desc {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  margin: 0;
}
.warning-dismiss {
  background: none;
  border: 1px solid rgba(123,94,167,0.5);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b89ee8;
  cursor: pointer;
  font-size: 0.75rem;
  flex-shrink: 0;
  transition: all 0.2s;
}
.warning-dismiss:hover { background: rgba(123,94,167,0.2); }

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

/* Vote Panel */
.vote-panel {
  margin: 0 1.5rem;
  padding: 1rem;
  background: linear-gradient(160deg, #0e1a2a, #091220);
  border: 1px solid rgba(137,196,255,0.25);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.vote-title {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  color: #89c4ff;
  letter-spacing: 0.05em;
  margin: 0;
}
.vote-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.vote-option-btn {
  padding: 0.6rem 1rem;
  background: rgba(137,196,255,0.08);
  border: 1px solid rgba(137,196,255,0.3);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.vote-option-btn:hover {
  background: rgba(137,196,255,0.18);
  border-color: #89c4ff;
  color: #89c4ff;
}
.vote-done {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: #2fb896;
}
.vote-done strong { color: var(--color-parchment); }
.vote-closed-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0 0 0.25rem;
}
.vote-result-line {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  margin: 0;
}
.vote-result-line strong { color: var(--color-parchment); }

/* ── Merchant Panel ────────────────────────────────────────────────────── */
.merchant-panel {
  background: linear-gradient(160deg, #1e1e0a, #14140a);
  border: 1px solid rgba(201,168,76,0.3);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0 0.5rem;
}
.merchant-title {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.merchant-desc {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  margin: 0;
}

/* Counter offer */
.counter-offer {
  background: linear-gradient(160deg, #1a2a0a, #101808);
  border: 1px solid rgba(47,184,150,0.4);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.offer-text {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin: 0;
}
.offer-text strong { color: var(--color-parchment); }
.offer-price { color: #2fb896 !important; }
.offer-actions { display: flex; gap: 0.5rem; }
.offer-btn {
  flex: 1;
  padding: 0.4rem;
  border-radius: 6px;
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid;
}
.offer-btn.accept { background: rgba(47,184,150,0.1); border-color: #2fb896; color: #2fb896; }
.offer-btn.accept:hover { background: rgba(47,184,150,0.25); }
.offer-btn.decline { background: rgba(255,107,107,0.1); border-color: #ff6b6b; color: #ff6b6b; }
.offer-btn.decline:hover { background: rgba(255,107,107,0.2); }

/* Purchase notifications */
.purchase-notif {
  font-family: var(--font-body);
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  animation: slideIn 0.3s ease;
}
.purchase-notif.success { background: rgba(47,184,150,0.1); border: 1px solid rgba(47,184,150,0.3); color: #2fb896; }
.purchase-notif.error { background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); color: #ff6b6b; }
.purchase-notif.info { background: rgba(255,255,255,0.04); border: 1px solid var(--color-border); color: var(--color-text-dim); }
@keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

/* Shop items */
.shop-items { display: flex; flex-direction: column; gap: 0.5rem; }
.shop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  transition: border-color 0.2s;
}
.shop-item:not(.out-of-stock):hover { border-color: rgba(201,168,76,0.4); }
.shop-item.out-of-stock { opacity: 0.45; }
.shop-item-info { flex: 1; min-width: 0; }
.shop-item-cat {
  display: block;
  font-family: var(--font-heading);
  font-size: 0.55rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.15rem;
}
.shop-item-name {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-parchment);
}
.shop-item-desc {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0.15rem 0 0;
}
.shop-item-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.shop-item-price {
  font-family: var(--font-title);
  font-size: 1rem;
  color: var(--color-gold-bright);
}
.shop-item-stock {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  color: var(--color-text-dim);
}
.shop-item-stock.empty { color: #ff6b6b; }
.buy-btn {
  padding: 0.35rem 0.7rem;
  background: rgba(201,168,76,0.1);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.buy-btn:hover:not(:disabled) { background: rgba(201,168,76,0.25); }
.buy-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
