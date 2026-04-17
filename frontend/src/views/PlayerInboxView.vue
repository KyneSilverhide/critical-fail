<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSocket, resetSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import MessageCard from '../components/player/MessageCard.vue'
import SpellSearchTool from '../components/player/SpellSearchTool.vue'
import PlayerNotesTool from '../components/player/PlayerNotesTool.vue'

const router = useRouter()
const messages = ref([])
const unreadMessages = ref(0)
const playerInfo = ref(sessionStore.playerInfo || { name: 'Aventurier', hp: 20, maxHp: 20, ac: 10 })
const sessionName = ref(sessionStore.activeSession?.name || 'Session')
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

// ── Active tab ───────────────────────────────────────────────────────────
// Tabs: 'combat' | 'outils' | 'boutique' | 'vote' | 'messages'
const activeTab = ref('combat')
let hasRequestedNotificationPermission = false

function requestNotificationPermissionOnce() {
  if (hasRequestedNotificationPermission) return
  if (typeof window === 'undefined' || !('Notification' in window)) return
  hasRequestedNotificationPermission = true
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'messages') unreadMessages.value = 0
  requestNotificationPermissionOnce()
}

// ── HP tracking ──────────────────────────────────────────────────────────
const currentHp = ref(playerInfo.value?.hp ?? 20)
const maxHp = ref(playerInfo.value?.maxHp ?? 20)
const pendingHp = ref(currentHp.value)
const hpSending = ref(false)
const hpSent = ref(false)

// ── Initiative ─────────────────────────────────────────────────────────────
const initiativeValue = ref(
  Number.isFinite(parseInt(playerInfo.value?.initiative))
    ? parseInt(playerInfo.value?.initiative)
    : null
)
const initiativeSending = ref(false)
const initiativeSent = ref(false)

const hpPercent = computed(() => Math.min(100, Math.max(0, (pendingHp.value / maxHp.value) * 100)))
const hpBarColor = computed(() => {
  const pct = hpPercent.value
  if (pct > 50) return '#2fb896'
  if (pct > 20) return '#f0a500'
  return '#e03030'
})

// ── Concentration ────────────────────────────────────────────────────────
const isConcentrating = ref(false)
const concentrationModal = ref(null) // { damage, dc }

function toggleConcentration() {
  isConcentrating.value = !isConcentrating.value
  const socket = getSocket()
  socket.emit('update-concentration', { isConcentrating: isConcentrating.value })
}

function dismissConcentrationModal() {
  concentrationModal.value = null
}

// ── Conditions D&D 5e ────────────────────────────────────────────────────
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
  if (idx === -1) activeConditions.value.push(conditionId)
  else activeConditions.value.splice(idx, 1)
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

function sendInitiativeUpdate() {
  const socket = getSocket()
  initiativeSending.value = true
  socket.emit('update-initiative', { initiative: initiativeValue.value })
}

function leaveSession() {
  const socket = getSocket()
  socket.emit('leave-session')
  resetSocket()
  sessionStore.setActiveSession(null)
  sessionStore.playerInfo = null
  router.push('/')
}

// ── Vote ─────────────────────────────────────────────────────────────────
const activeVote = ref(null)
const myVote = ref(null)
const hasNewVote = ref(false)

function submitVote(optionIndex) {
  const socket = getSocket()
  socket.emit('submit-vote', { voteId: activeVote.value.id, optionIndex })
}

// ── Merchant / Cart ──────────────────────────────────────────────────────
const activeMerchant = ref(sessionStore.activeMerchant || null)
const cart = ref({}) // itemId -> quantity (0 = not in cart)
const cartSending = ref(false)
// Purchase result modal
const purchaseResultModal = ref(null) // { type: 'accepted'|'rejected', items, totalPrice }
// Counter offers (legacy single-item)
const counterOffers = ref([])
let attentionAudioContext = null

const cartItemCount = computed(() =>
  Object.values(cart.value).filter(q => q > 0).length
)
const cartTotal = computed(() => {
  if (!activeMerchant.value) return 0
  let total = 0
  for (const item of activeMerchant.value.items) {
    const qty = cart.value[item.id] || 0
    total += qty * item.price
  }
  return total
})

function setCartQty(itemId, qty) {
  cart.value = { ...cart.value, [itemId]: Math.max(0, qty) }
}

function submitCart() {
  const socket = getSocket()
  const items = []
  for (const item of activeMerchant.value.items) {
    const qty = cart.value[item.id] || 0
    if (qty > 0 && item.stock !== 0) {
      items.push({ itemId: item.id, quantity: qty })
    }
  }
  if (items.length === 0) return
  cartSending.value = true
  socket.emit('request-batch-purchase', { items })
}

function clearCart() {
  cart.value = {}
}

function respondCounterOffer(requestId, accept) {
  const socket = getSocket()
  socket.emit('respond-counter-offer', { requestId, accept })
  counterOffers.value = counterOffers.value.filter(c => c.requestId !== requestId)
}

function dismissPurchaseModal() {
  purchaseResultModal.value = null
}

function shouldAlertUser() {
  if (typeof document === 'undefined') return false
  return document.visibilityState !== 'visible' || !document.hasFocus()
}

function playAttentionSound() {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  if (!attentionAudioContext) attentionAudioContext = new AudioContextClass()
  if (attentionAudioContext.state === 'suspended') {
    attentionAudioContext.resume().catch(() => {})
  }
  const now = attentionAudioContext.currentTime
  const osc = attentionAudioContext.createOscillator()
  const gain = attentionAudioContext.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  osc.connect(gain)
  gain.connect(attentionAudioContext.destination)
  osc.start(now)
  osc.stop(now + 0.24)
}

function notifyAttention(message) {
  if (!shouldAlertUser()) return
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('Attention MJ', { body: message })
      return
    } catch {}
  }
  playAttentionSound()
}

const needsAttention = computed(() => ({
  combat: activeConditions.value.length > 0 && activeTab.value !== 'combat',
  boutique: !!activeMerchant.value && activeTab.value !== 'boutique',
  vote: hasNewVote.value && activeTab.value !== 'vote',
  messages: unreadMessages.value > 0 && activeTab.value !== 'messages',
  counterOffer: counterOffers.value.length > 0,
}))

watch(needsAttention, (next, prev) => {
  const hadAttention = prev ? Object.values(prev).some(Boolean) : false
  const hasAttention = Object.values(next).some(Boolean)
  if (!hasAttention || hadAttention) return

  if (next.counterOffer) notifyAttention('Nouvelle contre-offre du MJ.')
  else if (next.vote) notifyAttention('Un vote attend votre réponse.')
  else if (next.messages) notifyAttention('Nouveau message du MJ.')
  else if (next.boutique) notifyAttention('La boutique est ouverte.')
  else if (next.combat) notifyAttention('Un onglet demande votre attention.')
}, { deep: true })

// ── Socket handlers ──────────────────────────────────────────────────────
const handleNewMessage = (msg) => {
  messages.value.push({ ...msg, kind: 'message' })
  if (activeTab.value !== 'messages') unreadMessages.value++
}
const handleDiceResult = (data) => {
  messages.value.push({ ...data, kind: 'dice' })
  if (activeTab.value !== 'messages') unreadMessages.value++
}
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
const handleInitiativeConfirmed = (data) => {
  initiativeValue.value = data.initiative
  if (sessionStore.playerInfo) sessionStore.playerInfo.initiative = data.initiative
  initiativeSending.value = false
  initiativeSent.value = true
  setTimeout(() => { initiativeSent.value = false }, 2000)
}
const handleConcentrationWarning = (data) => {
  concentrationModal.value = data
}
const handleVoteStarted = (voteData) => {
  activeVote.value = { ...voteData, isClosed: false }
  myVote.value = null
  hasNewVote.value = true
}
const handleVoteClosed = (voteData) => {
  activeVote.value = { ...voteData, isClosed: true }
}
const handleVoteSubmitted = (data) => {
  myVote.value = data.optionIndex
}

const handleMerchantShown = (data) => {
  activeMerchant.value = data
  cart.value = {}
  cartSending.value = false
}
const handleMerchantClosed = () => {
  activeMerchant.value = null
  cart.value = {}
  cartSending.value = false
  if (activeTab.value === 'boutique') activeTab.value = 'combat'
}
const handleMerchantItemsUpdated = (data) => {
  activeMerchant.value = data
}

const handlePurchaseRequested = () => {
  // cart stays until confirmed
}
const handleBatchAccepted = ({ items, totalPrice }) => {
  cartSending.value = false
  cart.value = {}
  purchaseResultModal.value = { type: 'accepted', items, totalPrice }
}
const handleBatchRejected = ({ items }) => {
  cartSending.value = false
  cart.value = {}
  purchaseResultModal.value = { type: 'rejected', items }
}
const handlePurchaseCounterOffer = (data) => {
  cartSending.value = false
  counterOffers.value.push(data)
}
const handleCounterOfferResult = ({ accepted, itemName, finalPrice }) => {
  if (accepted) {
    purchaseResultModal.value = { type: 'accepted', items: [{ item_name: itemName, quantity: 1, total_price: finalPrice }], totalPrice: finalPrice }
  } else {
    purchaseResultModal.value = { type: 'rejected', items: [{ item_name: itemName, quantity: 1, total_price: 0 }] }
  }
}
const handlePurchaseError = ({ message }) => {
  cartSending.value = false
  purchaseResultModal.value = { type: 'error', message }
}

function handleKicked() {
  resetSocket()
  sessionStore.setActiveSession(null)
  sessionStore.playerInfo = null
  router.push('/?kicked=1')
}

function handleBeforeUnload() {
  const socket = getSocket()
  if (socket && sessionStore.activeSession) {
    socket.emit('leave-session')
  }
}

onMounted(() => {
  if (!sessionStore.activeSession) { router.push('/join'); return }
  requestNotificationPermissionOnce()
  const socket = getSocket()
  socket.on('new-message', handleNewMessage)
  socket.on('dice-result', handleDiceResult)
  socket.on('hp-update-confirmed', handleHpConfirmed)
  socket.on('concentration-confirmed', handleConcentrationConfirmed)
  socket.on('initiative-confirmed', handleInitiativeConfirmed)
  socket.on('concentration-warning', handleConcentrationWarning)
  socket.on('vote-started', handleVoteStarted)
  socket.on('vote-closed', handleVoteClosed)
  socket.on('vote-submitted', handleVoteSubmitted)
  socket.on('merchant-shown', handleMerchantShown)
  socket.on('merchant-closed', handleMerchantClosed)
  socket.on('merchant-items-updated', handleMerchantItemsUpdated)
  socket.on('purchase-requested', handlePurchaseRequested)
  socket.on('batch-accepted', handleBatchAccepted)
  socket.on('batch-rejected', handleBatchRejected)
  socket.on('purchase-counter-offer', handlePurchaseCounterOffer)
  socket.on('counter-offer-result', handleCounterOfferResult)
  socket.on('purchase-error', handlePurchaseError)
  socket.on('kicked', handleKicked)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  const socket = getSocket()
  if (socket) {
    if (sessionStore.activeSession) socket.emit('leave-session')
    socket.off('new-message', handleNewMessage)
    socket.off('dice-result', handleDiceResult)
    socket.off('hp-update-confirmed', handleHpConfirmed)
    socket.off('concentration-confirmed', handleConcentrationConfirmed)
    socket.off('initiative-confirmed', handleInitiativeConfirmed)
    socket.off('concentration-warning', handleConcentrationWarning)
    socket.off('vote-started', handleVoteStarted)
    socket.off('vote-closed', handleVoteClosed)
    socket.off('vote-submitted', handleVoteSubmitted)
    socket.off('merchant-shown', handleMerchantShown)
    socket.off('merchant-closed', handleMerchantClosed)
    socket.off('merchant-items-updated', handleMerchantItemsUpdated)
    socket.off('purchase-requested', handlePurchaseRequested)
    socket.off('batch-accepted', handleBatchAccepted)
    socket.off('batch-rejected', handleBatchRejected)
    socket.off('purchase-counter-offer', handlePurchaseCounterOffer)
    socket.off('counter-offer-result', handleCounterOfferResult)
    socket.off('purchase-error', handlePurchaseError)
    socket.off('kicked', handleKicked)
  }
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (attentionAudioContext) {
    attentionAudioContext.close().catch(() => {})
    attentionAudioContext = null
  }
})
</script>

<template>
  <div class="inbox-wrapper">

    <!-- ── Concentration modal ───────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="concentrationModal" class="modal-overlay" @click.self="dismissConcentrationModal">
        <div class="modal-box concentration-modal">
          <div class="modal-icon">🎯</div>
          <h2 class="modal-title">Jet de Concentration !</h2>
          <p class="modal-body">
            Vous avez subi <strong>{{ concentrationModal.damage }} dégâts</strong>.
          </p>
          <p class="modal-body">
            Effectuez un jet de <strong>Constitution</strong> de difficulté
            <span class="dc-badge">DD {{ concentrationModal.dc }}</span>
          </p>
          <p class="modal-hint">Si vous échouez, votre concentration est brisée.</p>
          <button class="modal-close-btn" @click="dismissConcentrationModal">J'ai compris</button>
        </div>
      </div>
    </Teleport>

    <!-- ── Purchase result modal ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="purchaseResultModal" class="modal-overlay" @click.self="dismissPurchaseModal">
        <div class="modal-box purchase-modal" :class="purchaseResultModal.type">
          <div class="modal-icon">
            {{ purchaseResultModal.type === 'accepted' ? '✅' : purchaseResultModal.type === 'rejected' ? '❌' : '⚠️' }}
          </div>
          <h2 class="modal-title">
            {{ purchaseResultModal.type === 'accepted' ? 'Achat accepté !' : purchaseResultModal.type === 'rejected' ? 'Achat refusé' : 'Erreur' }}
          </h2>
          <div v-if="purchaseResultModal.items" class="purchase-modal-items">
            <div v-for="(item, i) in purchaseResultModal.items" :key="i" class="purchase-modal-item">
              <span class="pmi-name">{{ item.item_name }}</span>
              <span class="pmi-qty">× {{ item.quantity }}</span>
              <span v-if="purchaseResultModal.type === 'accepted'" class="pmi-price">{{ item.total_price }} po</span>
            </div>
          </div>
          <p v-if="purchaseResultModal.type === 'accepted' && purchaseResultModal.totalPrice" class="purchase-modal-total">
            Total : <strong>{{ purchaseResultModal.totalPrice }} po</strong>
          </p>
          <p v-if="purchaseResultModal.message" class="modal-body">{{ purchaseResultModal.message }}</p>
          <button class="modal-close-btn" @click="dismissPurchaseModal">Fermer</button>
        </div>
      </div>
    </Teleport>

    <!-- ── Fixed header ─────────────────────────────────────────────────── -->
    <header class="inbox-header">
      <div class="header-left">
        <div class="player-avatar-wrap">
          <img
            v-if="playerInfo?.avatarUrl"
            :src="playerInfo.avatarUrl.startsWith('/uploads/') ? BACKEND_URL + playerInfo.avatarUrl : playerInfo.avatarUrl"
            :alt="playerInfo?.name"
            class="player-avatar"
          />
          <span v-else class="player-icon">⚔️</span>
        </div>
        <div class="header-info">
          <p class="player-name">{{ playerInfo?.name || 'Aventurier' }}</p>
          <p class="session-name">{{ sessionName }}</p>
        </div>
      </div>
      <div class="header-right">
        <span class="ac-chip">🛡️ {{ playerInfo?.ac ?? 10 }}</span>
        <button class="leave-btn" @click="leaveSession">Quitter</button>
      </div>
    </header>

    <!-- ── Scrollable content ────────────────────────────────────────────── -->
    <main class="inbox-content">

      <!-- ── COMBAT tab (Statut + Conditions) ───────────────────────────── -->
      <div v-show="activeTab === 'combat'" class="tab-panel">
        <!-- HP Panel -->
        <div class="panel hp-panel">
          <div class="panel-header">
            <span class="panel-label">❤️ Points de Vie</span>
            <span class="hp-fraction">{{ currentHp }} / {{ maxHp }}</span>
          </div>
          <div class="hp-bar-track">
            <div class="hp-bar-fill" :style="{ width: hpPercent + '%', background: hpBarColor }" />
          </div>
          <div class="hp-controls">
            <button class="hp-btn minus" @click="adjustHp(-5)">−5</button>
            <button class="hp-btn minus" @click="adjustHp(-1)">−1</button>
            <input
              v-model.number="pendingHp"
              type="number"
              class="hp-input"
              :min="0" :max="maxHp"
            />
            <button class="hp-btn plus" @click="adjustHp(1)">+1</button>
            <button class="hp-btn plus" @click="adjustHp(5)">+5</button>
          </div>
          <button
            class="hp-send-btn"
            :class="{ sent: hpSent }"
            :disabled="hpSending || pendingHp === currentHp"
            @click="sendHpUpdate"
          >
            {{ hpSent ? '✓ Mis à jour' : hpSending ? '…' : '📡 Confirmer les PV' }}
          </button>
        </div>

        <!-- Initiative -->
        <div class="panel initiative-panel">
          <div class="panel-header">
            <span class="panel-label">🎲 Initiative</span>
          </div>
          <div class="initiative-controls">
            <input
              v-model.number="initiativeValue"
              type="number"
              class="initiative-input"
              min="-10"
              max="99"
              placeholder="Ex: 14"
            />
            <button
              class="initiative-send-btn"
              :class="{ sent: initiativeSent }"
              :disabled="initiativeSending"
              @click="sendInitiativeUpdate"
            >
              {{ initiativeSent ? '✓ Envoyée' : initiativeSending ? '…' : '📡 Envoyer' }}
            </button>
          </div>
        </div>

        <!-- Concentration -->
        <div class="panel">
          <button
            class="concentration-btn"
            :class="{ active: isConcentrating }"
            @click="toggleConcentration"
          >
            <span class="concentration-icon">🎯</span>
            <div class="concentration-text">
              <span class="conc-label">Concentration</span>
              <span class="conc-state">{{ isConcentrating ? 'Active' : 'Inactive' }}</span>
            </div>
            <span class="conc-toggle">{{ isConcentrating ? 'Arrêter' : 'Activer' }}</span>
          </button>
        </div>

        <!-- Counter offers -->
        <div v-if="counterOffers.length > 0" class="panel counter-offers-panel">
          <p class="panel-label">🔄 Contre-offres</p>
          <div v-for="offer in counterOffers" :key="offer.requestId" class="counter-offer">
            <p class="offer-text">
              <span v-if="offer.action === 'discount'">💚 Ristourne</span>
              <span v-else>📈 Augmentation</span>
              pour <strong>{{ offer.itemName }}</strong> :
              <strong class="offer-price">{{ offer.finalPrice }} po</strong>
            </p>
            <div class="offer-actions">
              <button class="offer-btn accept" @click="respondCounterOffer(offer.requestId, true)">Accepter</button>
              <button class="offer-btn decline" @click="respondCounterOffer(offer.requestId, false)">Décliner</button>
            </div>
          </div>
        </div>

        <!-- Conditions -->
        <div class="panel">
          <p class="panel-label">⚡ États et Conditions</p>
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
      </div>

      <!-- ── OUTILS tab (Notes + Sorts) ───────────────────────────────── -->
      <div v-show="activeTab === 'outils'" class="tab-panel">
        <div class="panel">
          <p class="panel-label">📝 Notes</p>
          <PlayerNotesTool />
        </div>
        <div class="panel">
          <p class="panel-label">🔍 Recherche de sorts</p>
          <SpellSearchTool />
        </div>
      </div>

      <!-- ── BOUTIQUE tab ─────────────────────────────────────────────── -->
      <div v-show="activeTab === 'boutique'" class="tab-panel">
        <div v-if="!activeMerchant" class="panel empty-panel">
          <p class="empty-icon">🏪</p>
          <p class="empty-text">Aucun marchand ouvert pour l'instant.</p>
        </div>
        <template v-else>
          <div class="panel merchant-header-panel">
            <h2 class="merchant-name">🏪 {{ activeMerchant.name }}</h2>
            <p v-if="activeMerchant.description" class="merchant-desc">{{ activeMerchant.description }}</p>
          </div>

          <!-- Items grouped by category -->
          <div class="panel shop-panel">
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
                <span v-if="item.stock === -1" class="shop-item-stock">∞</span>
                <span v-else-if="item.stock === 0" class="shop-item-stock empty">Épuisé</span>
                <span v-else class="shop-item-stock">×{{ item.stock }}</span>
                <div v-if="item.stock !== 0" class="qty-controls">
                  <button class="qty-btn" @click="setCartQty(item.id, (cart[item.id] || 0) - 1)">−</button>
                  <span class="qty-value">{{ cart[item.id] || 0 }}</span>
                  <button class="qty-btn" @click="setCartQty(item.id, (cart[item.id] || 0) + 1)">+</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Cart summary + submit -->
          <div class="panel cart-panel" :class="{ 'cart-active': cartItemCount > 0 }">
            <div class="cart-summary">
              <span class="cart-label">🛒 Panier : {{ cartItemCount }} article(s)</span>
              <span class="cart-total">{{ cartTotal }} po</span>
            </div>
            <div class="cart-actions">
              <button
                class="cart-submit-btn"
                :disabled="cartItemCount === 0 || cartSending"
                @click="submitCart"
              >
                {{ cartSending ? '…' : '📨 Envoyer la demande' }}
              </button>
              <button
                v-if="cartItemCount > 0"
                class="cart-clear-btn"
                @click="clearCart"
              >Vider</button>
            </div>
          </div>
        </template>
      </div>

      <!-- ── VOTE tab ─────────────────────────────────────────────────── -->
      <div v-show="activeTab === 'vote'" class="tab-panel">
        <div v-if="!activeVote" class="panel empty-panel">
          <p class="empty-icon">🗳️</p>
          <p class="empty-text">Aucun vote en cours.</p>
        </div>
        <div v-else class="panel vote-panel">
          <h3 class="vote-title">🗳️ {{ activeVote.question }}</h3>
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
      </div>

      <!-- ── MESSAGES tab ─────────────────────────────────────────────── -->
      <div v-show="activeTab === 'messages'" class="tab-panel">
        <div v-if="messages.length === 0" class="panel empty-panel">
          <p class="empty-icon">📜</p>
          <p class="empty-text">En attente de messages…</p>
          <p class="empty-sub">Restez vigilant, aventurier.</p>
        </div>
        <div v-else class="messages-list">
          <MessageCard v-for="(msg, idx) in messages" :key="idx" :message="msg" />
        </div>
      </div>

    </main>

    <!-- ── Bottom tab bar ────────────────────────────────────────────────── -->
    <nav class="tab-bar">
      <button
        class="tab-item"
        :class="{ active: activeTab === 'combat' }"
        @click="switchTab('combat')"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': activeConditions.length > 0 }">⚔️</span>
        <span class="tab-label">Combat</span>
        <span v-if="activeConditions.length > 0" class="tab-badge tab-badge-urgent">{{ activeConditions.length }}</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'outils' }"
        @click="switchTab('outils')"
      >
        <span class="tab-icon">🛠️</span>
        <span class="tab-label">Outils</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'boutique', disabled: !activeMerchant }"
        :disabled="!activeMerchant"
        @click="switchTab('boutique')"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': activeMerchant && cartItemCount === 0 }">🏪</span>
        <span class="tab-label">Boutique</span>
        <span v-if="cartItemCount > 0" class="tab-badge tab-badge-urgent">{{ cartItemCount }}</span>
        <span v-else-if="activeMerchant && activeTab !== 'boutique'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'vote' }"
        @click="switchTab('vote'); hasNewVote = false"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': hasNewVote && activeTab !== 'vote' }">🗳️</span>
        <span class="tab-label">Vote</span>
        <span v-if="hasNewVote && activeTab !== 'vote'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'messages' }"
        @click="switchTab('messages')"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': unreadMessages > 0 }">📜</span>
        <span class="tab-label">Messages</span>
        <span v-if="unreadMessages > 0" class="tab-badge tab-badge-urgent">{{ unreadMessages }}</span>
      </button>
    </nav>

  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────── */
.inbox-wrapper {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-bg);
}

/* ── Header ──────────────────────────────────────────────────────────── */
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-surface-alt);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 0.75rem;
}
.header-left { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.header-right { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }

.player-avatar-wrap {
  width: 38px; height: 38px;
  border-radius: 50%;
  border: 2px solid var(--color-gold-dark);
  overflow: hidden;
  background: rgba(255,255,255,0.07);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.player-avatar { width: 100%; height: 100%; object-fit: cover; }
.player-icon { font-size: 1.2rem; }

.header-info { min-width: 0; }
.player-name {
  font-family: var(--font-heading);
  font-size: 0.95rem;
  color: var(--color-parchment);
  letter-spacing: 0.03em;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.session-name {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}

.ac-chip {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: rgba(201,168,76,0.1);
  border: 1px solid rgba(201,168,76,0.4);
  border-radius: 20px;
  padding: 0.2rem 0.6rem;
  white-space: nowrap;
}
.leave-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;
  white-space: nowrap;
}
.leave-btn:hover { border-color: var(--color-red); color: #ff6b6b; }

/* ── Scrollable content ──────────────────────────────────────────────── */
.inbox-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  -webkit-overflow-scrolling: touch;
}
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ── Panel cards ─────────────────────────────────────────────────────── */
.panel {
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
}
.panel-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0 0 0.75rem;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

/* ── HP Panel ────────────────────────────────────────────────────────── */
.hp-panel { display: flex; flex-direction: column; gap: 0.6rem; }
.hp-fraction {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-parchment);
  letter-spacing: 0.05em;
}
.hp-bar-track { height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; }
.hp-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease, background 0.4s ease; }
.hp-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.hp-btn {
  flex: 1;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.05);
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s;
}
.hp-btn.minus:hover { border-color: #e03030; color: #e03030; background: rgba(224,48,48,0.1); }
.hp-btn.plus:hover { border-color: #2fb896; color: #2fb896; background: rgba(47,184,150,0.1); }
.hp-input {
  flex: 2;
  height: 40px;
  text-align: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 1.4rem;
  font-weight: 700;
  outline: none;
}
.hp-input:focus { border-color: var(--color-gold-dark); }
.hp-send-btn {
  width: 100%;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  background: rgba(180,120,20,0.15);
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.hp-send-btn:hover:not(:disabled) { background: rgba(180,120,20,0.3); }
.hp-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hp-send-btn.sent { border-color: #2fb896; background: rgba(47,184,150,0.15); color: #2fb896; }

/* ── Initiative ──────────────────────────────────────────────────────── */
.initiative-panel { display: flex; flex-direction: column; gap: 0.5rem; }
.initiative-controls { display: flex; align-items: center; gap: 0.5rem; }
.initiative-input {
  flex: 1;
  height: 40px;
  text-align: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 1.2rem;
  font-weight: 700;
  outline: none;
}
.initiative-input:focus { border-color: #6aa6e0; }
.initiative-send-btn {
  border: 1px solid #6aa6e0;
  border-radius: 8px;
  background: rgba(100,150,220,0.14);
  color: #9ed3ff;
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.initiative-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.initiative-send-btn.sent { border-color: #2fb896; color: #2fb896; background: rgba(47,184,150,0.15); }

/* ── Concentration ───────────────────────────────────────────────────── */
.concentration-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.04);
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.concentration-btn:hover:not(.active) {
  border-color: var(--color-gold-dark);
  color: var(--color-parchment);
}
.concentration-btn.active {
  border-color: #7b5ea7;
  background: rgba(123,94,167,0.15);
  box-shadow: 0 0 12px rgba(123,94,167,0.2);
}
.concentration-icon { font-size: 1.3rem; flex-shrink: 0; }
.concentration-text { flex: 1; }
.conc-label { display: block; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; }
.conc-state {
  display: block;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  margin-top: 0.1rem;
}
.concentration-btn.active .conc-state { color: #b89ee8; }
.conc-toggle {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  flex-shrink: 0;
}
.concentration-btn.active .conc-toggle { color: #b89ee8; }

/* ── Counter offers ──────────────────────────────────────────────────── */
.counter-offers-panel { display: flex; flex-direction: column; gap: 0.6rem; }
.counter-offer {
  background: rgba(47,184,150,0.06);
  border: 1px solid rgba(47,184,150,0.3);
  border-radius: 8px;
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.offer-text { font-family: var(--font-body); font-size: 0.85rem; color: var(--color-text-dim); margin: 0; }
.offer-text strong { color: var(--color-parchment); }
.offer-price { color: #2fb896 !important; }
.offer-actions { display: flex; gap: 0.5rem; }
.offer-btn {
  flex: 1; padding: 0.45rem;
  border-radius: 6px; font-family: var(--font-heading); font-size: 0.7rem;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.2s; border: 1px solid;
}
.offer-btn.accept { background: rgba(47,184,150,0.1); border-color: #2fb896; color: #2fb896; }
.offer-btn.accept:hover { background: rgba(47,184,150,0.25); }
.offer-btn.decline { background: rgba(255,107,107,0.1); border-color: #ff6b6b; color: #ff6b6b; }
.offer-btn.decline:hover { background: rgba(255,107,107,0.2); }

/* ── Conditions ──────────────────────────────────────────────────────── */
.conditions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
.condition-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.6rem 0.4rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.03);
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
}
.condition-btn:hover { border-color: #f0a500; color: #f0a500; }
.condition-btn.active {
  border-color: #e03030;
  background: rgba(224,48,48,0.15);
  color: #ff6060;
}
.cond-icon { font-size: 1.1rem; }
.cond-label { text-align: center; line-height: 1.2; white-space: nowrap; }

/* ── Shop ────────────────────────────────────────────────────────────── */
.merchant-header-panel { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem 1rem; }
.merchant-name {
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.1em;
  color: var(--color-gold-bright);
  margin: 0;
}
.merchant-desc { font-family: var(--font-body); font-size: 0.8rem; color: var(--color-text-dim); margin: 0; }

.shop-panel { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
.shop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.5rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.shop-item.out-of-stock { opacity: 0.45; }
.shop-item-info { flex: 1; min-width: 0; }
.shop-item-cat {
  display: block;
  font-family: var(--font-heading);
  font-size: 0.52rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.1rem;
}
.shop-item-name { font-family: var(--font-heading); font-size: 0.85rem; color: var(--color-parchment); }
.shop-item-desc { font-family: var(--font-body); font-size: 0.72rem; color: var(--color-text-dim); margin: 0.1rem 0 0; }
.shop-item-right { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.shop-item-price { font-family: var(--font-title); font-size: 0.95rem; color: var(--color-gold-bright); }
.shop-item-stock { font-family: var(--font-heading); font-size: 0.6rem; color: var(--color-text-dim); }
.shop-item-stock.empty { color: #ff6b6b; }

.qty-controls { display: flex; align-items: center; gap: 0.3rem; }
.qty-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: rgba(255,255,255,0.05);
  color: var(--color-parchment);
  font-size: 1rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.qty-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.qty-value {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-parchment);
  min-width: 20px;
  text-align: center;
}

.cart-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-color: rgba(201,168,76,0.2);
}
.cart-panel.cart-active { border-color: rgba(201,168,76,0.45); background: linear-gradient(160deg, var(--color-surface-soft), var(--color-surface)); }
.cart-summary { display: flex; align-items: center; justify-content: space-between; }
.cart-label { font-family: var(--font-heading); font-size: 0.75rem; letter-spacing: 0.1em; color: var(--color-text-dim); }
.cart-total { font-family: var(--font-title); font-size: 1.1rem; color: var(--color-gold-bright); }
.cart-actions { display: flex; gap: 0.5rem; }
.cart-submit-btn {
  flex: 1;
  padding: 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  background: rgba(180,120,20,0.15);
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.cart-submit-btn:hover:not(:disabled) { background: rgba(180,120,20,0.3); }
.cart-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cart-clear-btn {
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s;
}
.cart-clear-btn:hover { border-color: #cc3030; color: #ff6060; }

/* ── Vote ────────────────────────────────────────────────────────────── */
.vote-panel { display: flex; flex-direction: column; gap: 0.75rem; }
.vote-title { font-family: var(--font-heading); font-size: 1rem; color: var(--color-gold-bright); letter-spacing: 0.05em; margin: 0; }
.vote-options { display: flex; flex-direction: column; gap: 0.5rem; }
.vote-option-btn {
  padding: 0.7rem 1rem;
  background: rgba(201,168,76,0.08);
  border: 1px solid rgba(201,168,76,0.35);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.vote-option-btn:hover { background: rgba(201,168,76,0.18); border-color: var(--color-gold); color: var(--color-gold-bright); }
.vote-done { font-family: var(--font-body); font-size: 0.9rem; color: #2fb896; }
.vote-done strong { color: var(--color-parchment); }
.vote-closed-label { font-family: var(--font-heading); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-dim); margin: 0 0 0.25rem; }
.vote-result-line { font-family: var(--font-body); font-size: 0.85rem; color: var(--color-text-dim); margin: 0.1rem 0; }
.vote-result-line strong { color: var(--color-parchment); }

/* ── Messages ────────────────────────────────────────────────────────── */
.messages-list { display: flex; flex-direction: column; gap: 1rem; }

/* ── Empty states ────────────────────────────────────────────────────── */
.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 0.5rem;
  border-style: dashed;
}
.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading); font-size: 0.9rem; letter-spacing: 0.1em; color: var(--color-text-dim); }
.empty-sub { font-family: var(--font-body); color: var(--color-border); font-size: 0.8rem; }

/* ── Tab bar ─────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  background: var(--color-surface-alt);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.6rem 0.25rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  cursor: pointer;
  transition: color 0.2s;
  position: relative;
  min-width: 0;
}
.tab-item:hover:not(:disabled) { color: var(--color-parchment); }
.tab-item.active { color: var(--color-gold-bright); }
.tab-item.active::before {
  content: '';
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 2px;
  background: var(--color-gold-dark);
  border-radius: 0 0 2px 2px;
}
.tab-item:disabled { opacity: 0.3; cursor: not-allowed; }
.tab-icon {
  font-size: 1.3rem;
  line-height: 1;
  transition: transform 0.2s, filter 0.2s;
}
.tab-icon-notify {
  animation: iconShake 0.6s ease-in-out infinite alternate;
  filter: drop-shadow(0 0 6px #e03030);
}
@keyframes iconShake {
  0% { transform: rotate(-8deg) scale(1.1); }
  100% { transform: rotate(8deg) scale(1.2); }
}
.tab-label { font-size: 0.55rem; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.tab-badge {
  position: absolute;
  top: 4px; right: calc(50% - 18px);
  min-width: 18px; height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  font-weight: 700;
  color: white;
  display: flex; align-items: center; justify-content: center;
}
.tab-badge-urgent {
  background: #e03030;
  box-shadow: 0 0 8px #e03030, 0 0 16px rgba(224,48,48,0.5);
  animation: urgentPulse 1s ease-in-out infinite;
}
.tab-badge-pulse {
  background: #f0a500;
  box-shadow: 0 0 8px #f0a500, 0 0 16px rgba(240,165,0,0.5);
  animation: urgentPulse 0.8s ease-in-out infinite;
}
@keyframes urgentPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.85; }
}

/* ── Modals ──────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.modal-box {
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-gold-dark);
  border-radius: 16px;
  padding: 2rem 1.5rem;
  width: min(400px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}
.modal-icon { font-size: 3rem; line-height: 1; }
.modal-title {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.modal-body {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}
.modal-body strong { color: var(--color-parchment); }
.modal-hint {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}
.dc-badge {
  display: inline-block;
  background: rgba(123,94,167,0.2);
  border: 1px solid #7b5ea7;
  border-radius: 20px;
  padding: 0.2rem 0.7rem;
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  color: #b89ee8;
  letter-spacing: 0.05em;
}
.modal-close-btn {
  padding: 0.7rem 2rem;
  border-radius: 10px;
  border: 1px solid var(--color-gold-dark);
  background: rgba(180,120,20,0.15);
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.5rem;
}
.modal-close-btn:hover { background: rgba(180,120,20,0.3); }

/* Concentration modal specifics */
.concentration-modal { border-color: #7b5ea7; }
.concentration-modal .modal-title { color: #b89ee8; }

/* Purchase result modal */
.purchase-modal.accepted { border-color: #2fb896; }
.purchase-modal.accepted .modal-title { color: #2fb896; }
.purchase-modal.rejected { border-color: #cc3030; }
.purchase-modal.rejected .modal-title { color: #ff6b6b; }

.purchase-modal-items {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
}
.purchase-modal-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-heading);
  font-size: 0.8rem;
  text-align: left;
}
.pmi-name { flex: 1; color: var(--color-parchment); }
.pmi-qty { color: var(--color-text-dim); }
.pmi-price { color: var(--color-gold-bright); }
.purchase-modal-total {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin: 0;
}
.purchase-modal-total strong { color: var(--color-gold-bright); font-size: 1.1rem; }
</style>
