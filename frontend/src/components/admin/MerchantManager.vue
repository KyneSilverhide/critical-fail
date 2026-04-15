<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

// ── State ───────────────────────────────────────────────────────────────
const merchants = ref([])
const pendingRequests = ref([])
const loading = ref(false)
const view = ref('list') // 'list' | 'create'

// Create form
const newName = ref('')
const newDesc = ref('')
const newItems = ref([])
const creating = ref(false)

// Respond dialog
const respondingRequest = ref(null)
const respondAction = ref('accept')
const respondPrice = ref(0)

const DND_PRESETS = [
  { name: 'Potion de soins', description: 'Récupère 2d4+2 PV', price: 50, stock: 5, category: 'Potions' },
  { name: 'Potion de soins supérieurs', description: 'Récupère 4d4+4 PV', price: 100, stock: 3, category: 'Potions' },
  { name: 'Potion de soins importants', description: 'Récupère 8d4+8 PV', price: 300, stock: 2, category: 'Potions' },
  { name: 'Antidote', description: 'Contre les poisons', price: 50, stock: 3, category: 'Potions' },
  { name: 'Eau bénite', description: 'Efficace contre les morts-vivants', price: 25, stock: 5, category: 'Potions' },
  { name: 'Torche', description: 'Éclaire dans un rayon de 6m pendant 1h', price: 1, stock: -1, category: 'Équipement' },
  { name: 'Rations de voyage (x1 jour)', description: 'Nourriture pour un jour', price: 5, stock: -1, category: 'Équipement' },
  { name: 'Corde de chanvre (15m)', description: 'Résistance 1000 lbs', price: 10, stock: 5, category: 'Équipement' },
  { name: 'Sac à dos', description: 'Capacité 30 lbs / 1 pied cube', price: 20, stock: 3, category: 'Équipement' },
  { name: 'Huile de lampe', description: 'Alimente une lampe pendant 6h', price: 1, stock: -1, category: 'Équipement' },
  { name: 'Flèches (x20)', description: 'Munitions pour arc', price: 10, stock: 5, category: 'Armes' },
  { name: 'Dague', description: 'Dégâts : 1d4 perforant', price: 20, stock: 3, category: 'Armes' },
  { name: 'Épée courte', description: 'Dégâts : 1d6 perforant', price: 100, stock: 2, category: 'Armes' },
  { name: 'Épée longue', description: 'Dégâts : 1d8 tranchant', price: 150, stock: 2, category: 'Armes' },
  { name: 'Armure de cuir', description: 'CA : 11 + mod. Dex', price: 100, stock: 2, category: 'Armures' },
  { name: 'Cotte de mailles', description: 'CA : 16, Force min 13', price: 750, stock: 1, category: 'Armures' },
  { name: 'Bouclier', description: 'CA : +2', price: 100, stock: 3, category: 'Armures' },
  { name: "Parchemin d'identification", description: 'Identifie un objet magique', price: 200, stock: 2, category: 'Magie' },
  { name: 'Parchemin de sorts (1er niv.)', description: 'Sort aléatoire de 1er niveau', price: 150, stock: 2, category: 'Magie' },
]

// ── API ─────────────────────────────────────────────────────────────────
async function loadMerchants() {
  if (!sessionStore.activeSession) return
  loading.value = true
  try {
    const [mRes, pRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/merchants`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/purchase-requests`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
    ])
    if (mRes.ok) merchants.value = await mRes.json()
    if (pRes.ok) pendingRequests.value = (await pRes.json()).filter(r => r.status === 'pending')
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

// ── Create flow ─────────────────────────────────────────────────────────
function usePresets() {
  newItems.value = DND_PRESETS.map(p => ({ ...p }))
}

function addItem() {
  newItems.value.push({ name: '', description: '', price: 10, stock: -1, category: 'Divers' })
}

function removeItem(idx) {
  newItems.value.splice(idx, 1)
}

function createMerchant() {
  if (!newName.value.trim()) return
  const validItems = newItems.value.filter(i => i.name.trim() && i.price >= 0)
  if (validItems.length === 0) return
  const socket = getSocket()
  socket.emit('create-merchant', {
    sessionId: sessionStore.activeSession.id,
    name: newName.value.trim(),
    description: newDesc.value.trim(),
    items: validItems,
  })
  creating.value = true
}

function showOnTv(merchantId) {
  const socket = getSocket()
  socket.emit('show-merchant', { sessionId: sessionStore.activeSession.id, merchantId })
}

// ── Purchase response ────────────────────────────────────────────────────
function openRespond(req) {
  respondingRequest.value = req
  respondAction.value = 'accept'
  respondPrice.value = req.base_price
}

function submitRespond() {
  if (!respondingRequest.value) return
  const socket = getSocket()
  socket.emit('respond-purchase', {
    requestId: respondingRequest.value.id,
    action: respondAction.value,
    finalPrice: respondPrice.value,
  })
  respondingRequest.value = null
}

// ── Socket handlers ──────────────────────────────────────────────────────
function handleMerchantCreated(data) {
  merchants.value.unshift(data)
  creating.value = false
  view.value = 'list'
  newName.value = ''
  newDesc.value = ''
  newItems.value = []
}

function handleMerchantUpdated(data) {
  const idx = merchants.value.findIndex(m => m.id === data.id)
  if (idx !== -1) merchants.value[idx] = data
}

function handlePurchaseRequest(data) {
  pendingRequests.value.push(data)
}

function handlePurchaseResponded({ requestId }) {
  pendingRequests.value = pendingRequests.value.filter(r => r.id !== requestId)
}

function handleCounterOfferResponse({ requestId }) {
  pendingRequests.value = pendingRequests.value.filter(r => r.id !== requestId)
}

onMounted(() => {
  loadMerchants()
  const socket = getSocket()
  socket.on('merchant-created', handleMerchantCreated)
  socket.on('merchant-updated', handleMerchantUpdated)
  socket.on('purchase-request', handlePurchaseRequest)
  socket.on('purchase-responded', handlePurchaseResponded)
  socket.on('counter-offer-response', handleCounterOfferResponse)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('merchant-created', handleMerchantCreated)
  socket.off('merchant-updated', handleMerchantUpdated)
  socket.off('purchase-request', handlePurchaseRequest)
  socket.off('purchase-responded', handlePurchaseResponded)
  socket.off('counter-offer-response', handleCounterOfferResponse)
})
</script>

<template>
  <div class="merchant-manager">
    <div class="manager-header">
      <h2 class="section-title">🏪 Gestion des Marchands</h2>
      <div class="header-actions">
        <button
          class="tab-btn"
          :class="{ active: view === 'list' }"
          @click="view = 'list'"
        >Liste</button>
        <button
          class="tab-btn"
          :class="{ active: view === 'create' }"
          @click="view = 'create'"
        >+ Créer</button>
      </div>
    </div>

    <!-- Pending purchase requests banner -->
    <div v-if="pendingRequests.length > 0" class="requests-banner">
      <p class="requests-title">🛒 Demandes d'achat en attente ({{ pendingRequests.length }})</p>
      <div v-for="req in pendingRequests" :key="req.id" class="request-row">
        <span class="request-info">
          <strong>{{ req.player_name }}</strong> veut acheter
          <strong>{{ req.item_name }}</strong>
          × {{ req.quantity }}
          — {{ req.base_price }} po
        </span>
        <button class="respond-btn" @click="openRespond(req)">Répondre</button>
      </div>
    </div>

    <!-- Create merchant form -->
    <div v-if="view === 'create'" class="create-form">
      <div class="form-group">
        <label class="form-label">Nom du marchand</label>
        <input v-model="newName" class="form-input" placeholder="Ex: Brom le Forgeron" />
      </div>
      <div class="form-group">
        <label class="form-label">Description (optionnelle)</label>
        <input v-model="newDesc" class="form-input" placeholder="Ex: Un nain bourru mais honnête" />
      </div>

      <div class="items-header">
        <span class="form-label">Articles</span>
        <div class="items-actions">
          <button class="small-btn" @click="usePresets">📋 Objets D&D</button>
          <button class="small-btn" @click="addItem">+ Ajouter</button>
        </div>
      </div>

      <div v-if="newItems.length === 0" class="no-items">
        <p>Aucun article. Cliquez sur « Objets D&D » pour pré-remplir ou « + Ajouter » pour créer manuellement.</p>
      </div>

      <div class="items-list">
        <div v-for="(item, idx) in newItems" :key="idx" class="item-row">
          <div class="item-row-fields">
            <input v-model="item.name" class="form-input item-name-input" placeholder="Nom" />
            <input v-model="item.description" class="form-input item-desc-input" placeholder="Description" />
            <input v-model.number="item.price" type="number" class="form-input item-price-input" placeholder="Prix (po)" min="0" />
            <input
              v-model.number="item.stock"
              type="number"
              class="form-input item-stock-input"
              placeholder="Stock (-1=∞)"
              min="-1"
            />
            <input v-model="item.category" class="form-input item-cat-input" placeholder="Catégorie" />
          </div>
          <button class="remove-btn" @click="removeItem(idx)">✕</button>
        </div>
      </div>

      <button
        class="action-btn"
        :disabled="!newName.trim() || newItems.filter(i=>i.name.trim()).length === 0 || creating"
        @click="createMerchant"
      >
        {{ creating ? '…' : '✓ Créer le marchand' }}
      </button>
    </div>

    <!-- Merchants list -->
    <div v-else class="merchants-list">
      <div v-if="loading" class="loading-text">Chargement…</div>
      <div v-else-if="merchants.length === 0" class="empty-msg">
        <p>Aucun marchand créé pour cette session.</p>
      </div>
      <div v-for="merchant in merchants" :key="merchant.id" class="merchant-card">
        <div class="merchant-card-header">
          <div>
            <p class="merchant-card-name">{{ merchant.name }}</p>
            <p v-if="merchant.description" class="merchant-card-desc">{{ merchant.description }}</p>
          </div>
          <button class="show-tv-btn" @click="showOnTv(merchant.id)">📺 Sur TV</button>
        </div>
        <div class="merchant-items-preview">
          <div v-for="item in merchant.items" :key="item.id" class="preview-item">
            <span class="preview-cat">{{ item.category }}</span>
            <span class="preview-name">{{ item.name }}</span>
            <span class="preview-price">{{ item.price }} po</span>
            <span class="preview-stock" :class="{ empty: item.stock === 0 }">
              {{ item.stock === -1 ? '∞' : item.stock === 0 ? 'Épuisé' : `×${item.stock}` }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Respond dialog -->
    <div v-if="respondingRequest" class="respond-overlay" @click.self="respondingRequest = null">
      <div class="respond-dialog">
        <h3 class="dialog-title">Répondre à la demande</h3>
        <p class="dialog-info">
          <strong>{{ respondingRequest.player_name }}</strong> souhaite acheter
          <strong>{{ respondingRequest.item_name }}</strong>
          × {{ respondingRequest.quantity }}
          pour <strong>{{ respondingRequest.base_price }} po</strong>
        </p>

        <div class="respond-actions">
          <button
            class="respond-action-btn"
            :class="{ active: respondAction === 'accept' }"
            @click="respondAction = 'accept'"
          >✅ Accepter</button>
          <button
            class="respond-action-btn discount"
            :class="{ active: respondAction === 'discount' }"
            @click="respondAction = 'discount'"
          >💚 Ristourne</button>
          <button
            class="respond-action-btn increase"
            :class="{ active: respondAction === 'increase' }"
            @click="respondAction = 'increase'"
          >📈 Augmenter</button>
          <button
            class="respond-action-btn reject"
            :class="{ active: respondAction === 'reject' }"
            @click="respondAction = 'reject'"
          >❌ Refuser</button>
        </div>

        <div v-if="respondAction === 'discount' || respondAction === 'increase'" class="price-input-group">
          <label class="form-label">Nouveau prix (po)</label>
          <input v-model.number="respondPrice" type="number" class="form-input" min="0" />
        </div>

        <div class="dialog-footer">
          <button class="action-btn" @click="submitRespond">Confirmer</button>
          <button class="cancel-btn" @click="respondingRequest = null">Annuler</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.merchant-manager {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  position: relative;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.4rem;
}

.tab-btn {
  padding: 0.35rem 0.75rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active, .tab-btn:hover {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: rgba(201,168,76,0.08);
}

/* Requests banner */
.requests-banner {
  background: linear-gradient(160deg, #1a2a0a, #101808);
  border: 1px solid rgba(47,184,150,0.4);
  border-radius: 10px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.requests-title {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #2fb896;
  margin: 0;
}
.request-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: rgba(47,184,150,0.05);
  border: 1px solid rgba(47,184,150,0.2);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.request-info {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-parchment);
  flex: 1;
}
.request-info strong { color: #2fb896; }
.respond-btn {
  padding: 0.3rem 0.7rem;
  background: rgba(47,184,150,0.1);
  border: 1px solid #2fb896;
  border-radius: 6px;
  color: #2fb896;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.respond-btn:hover { background: rgba(47,184,150,0.25); }

/* Create form */
.create-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(160deg, #1e1408, #150e05);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
}
.form-group { display: flex; flex-direction: column; gap: 0.35rem; }
.form-label {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.form-input {
  background: #12100a;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.items-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.items-actions { display: flex; gap: 0.4rem; }
.small-btn {
  padding: 0.3rem 0.6rem;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
}
.small-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-dark); }

.no-items {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  text-align: center;
  padding: 1rem 0;
}

.items-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 300px; overflow-y: auto; }
.item-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.item-row-fields { display: flex; gap: 0.35rem; flex: 1; flex-wrap: wrap; }
.item-name-input { flex: 2; min-width: 100px; }
.item-desc-input { flex: 3; min-width: 120px; }
.item-price-input { flex: 1; min-width: 60px; }
.item-stock-input { flex: 1; min-width: 60px; }
.item-cat-input { flex: 1; min-width: 80px; }
.remove-btn {
  background: none;
  border: 1px solid #8b2a2a;
  border-radius: 4px;
  color: #ff6b6b;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.7rem;
  flex-shrink: 0;
  transition: all 0.2s;
}
.remove-btn:hover { background: rgba(139,42,42,0.2); }

.action-btn {
  padding: 0.55rem 1rem;
  background: linear-gradient(160deg, #4a2010, #2e1008);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}
.action-btn:hover:not(:disabled) { background: linear-gradient(160deg, #6b3020, #4a1e10); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Merchants list */
.merchants-list { display: flex; flex-direction: column; gap: 1rem; }
.loading-text, .empty-msg {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 0;
}
.merchant-card {
  background: linear-gradient(160deg, #1e1408, #150e05);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.merchant-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.merchant-card-name {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  color: var(--color-parchment);
  margin: 0;
}
.merchant-card-desc {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0.2rem 0 0;
}
.show-tv-btn {
  padding: 0.35rem 0.75rem;
  background: rgba(137,196,255,0.08);
  border: 1px solid rgba(137,196,255,0.3);
  border-radius: 6px;
  color: #89c4ff;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
}
.show-tv-btn:hover { background: rgba(137,196,255,0.18); border-color: #89c4ff; }

.merchant-items-preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 200px;
  overflow-y: auto;
}
.preview-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.4rem;
  background: rgba(255,255,255,0.03);
  border-radius: 4px;
  font-family: var(--font-heading);
  font-size: 0.65rem;
}
.preview-cat {
  color: var(--color-gold-dark);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.6rem;
  width: 70px;
  flex-shrink: 0;
}
.preview-name { flex: 1; color: var(--color-parchment); }
.preview-price { color: var(--color-gold-bright); width: 50px; text-align: right; flex-shrink: 0; }
.preview-stock {
  width: 50px;
  text-align: right;
  flex-shrink: 0;
  color: var(--color-text-dim);
}
.preview-stock.empty { color: #ff6b6b; }

/* Respond dialog */
.respond-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.respond-dialog {
  background: linear-gradient(160deg, #2a1e10, #1a1208);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 1.5rem;
  width: min(480px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.dialog-title {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.dialog-info {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}
.dialog-info strong { color: var(--color-parchment); }

.respond-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.respond-action-btn {
  flex: 1;
  padding: 0.5rem 0.5rem;
  background: #1e1508;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  min-width: 80px;
}
.respond-action-btn.active { border-color: var(--color-gold-dark); color: var(--color-gold-bright); background: rgba(201,168,76,0.1); }
.respond-action-btn.discount.active { border-color: #2fb896; color: #2fb896; background: rgba(47,184,150,0.1); }
.respond-action-btn.increase.active { border-color: #f0a500; color: #f0a500; background: rgba(240,165,0,0.1); }
.respond-action-btn.reject.active { border-color: #cc3030; color: #ff6060; background: rgba(200,48,48,0.1); }

.price-input-group { display: flex; flex-direction: column; gap: 0.35rem; }

.dialog-footer { display: flex; gap: 0.5rem; }
.cancel-btn {
  flex: 1;
  padding: 0.55rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.cancel-btn:hover { border-color: #cc3030; color: #ff6060; }
.dialog-footer .action-btn { flex: 2; width: auto; }
</style>
