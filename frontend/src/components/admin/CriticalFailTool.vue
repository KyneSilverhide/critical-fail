<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { authStore } from '../../stores/auth.js'
import { getSocket } from '../../socket.js'
import meleeTable from '../../assets/melee.json'
import distanceTable from '../../assets/distance.json'
import magiqueTable from '../../assets/magique.json'

const combatType = ref('melee')
const isRolling = ref(false)
const diceValue = ref(null)
const result = ref(null)
const animatedDice = ref(null)
const showResult = ref(false)
const sendFeedback = ref('')
const selectedPlayerId = ref('all')
const hasConnectedPlayers = computed(() => sessionStore.players.length > 0)

const tables = {
  melee: meleeTable,
  distance: distanceTable,
  magique: magiqueTable
}

const combatTypes = [
  { key: 'melee', label: 'Mêlée', icon: '⚔️' },
  { key: 'distance', label: 'Distance', icon: '🏹' },
  { key: 'magique', label: 'Magique', icon: '🔮' },
]

function selectType(type) {
  if (isRolling.value) return
  combatType.value = type
  result.value = null
  diceValue.value = null
  showResult.value = false
}

function getResult(roll, table) {
  return table.find(entry => roll >= entry.min && roll <= entry.max) || null
}

async function rollDice() {
  if (isRolling.value) return
  isRolling.value = true
  showResult.value = false
  result.value = null

  const finalRoll = Math.floor(Math.random() * 100) + 1

  let steps = 30
  for (let i = 0; i < steps; i++) {
    animatedDice.value = Math.floor(Math.random() * 100) + 1
    await new Promise(r => setTimeout(r, 30 + i * 2))
  }

  animatedDice.value = finalRoll
  diceValue.value = finalRoll

  await new Promise(r => setTimeout(r, 400))

  const found = getResult(finalRoll, tables[combatType.value])
  result.value = found ? found.result : 'Résultat introuvable.'

  await new Promise(r => setTimeout(r, 100))
  showResult.value = true
  isRolling.value = false
}

function sendToPlayers() {
  if (!sessionStore.activeSession) {
    sendFeedback.value = 'Aucune session active.'
    setTimeout(() => { sendFeedback.value = '' }, 3000)
    return
  }
  if (!diceValue.value || !result.value) {
    sendFeedback.value = 'Lancez les dés d\'abord.'
    setTimeout(() => { sendFeedback.value = '' }, 3000)
    return
  }
  if (!hasConnectedPlayers.value) {
    sendFeedback.value = 'Aucun joueur connecté.'
    setTimeout(() => { sendFeedback.value = '' }, 3000)
    return
  }

  const socket = getSocket(authStore.token)
  socket.emit('send-dice-result', {
    sessionId: sessionStore.activeSession.id,
    combatType: combatType.value,
    rollValue: diceValue.value,
    resultText: result.value,
    toPlayerId: selectedPlayerId.value === 'all' ? null : parseInt(selectedPlayerId.value),
  })

  const target = selectedPlayerId.value === 'all'
    ? 'tous les joueurs'
    : sessionStore.players.find(p => p.id === parseInt(selectedPlayerId.value))?.player_name || 'joueur'
  sendFeedback.value = `Résultat envoyé à ${target} !`
  setTimeout(() => { sendFeedback.value = '' }, 3000)
}

const typeLabel = computed(() => {
  return combatTypes.find(t => t.key === combatType.value)?.label || ''
})

function handleSendError(data) {
  sendFeedback.value = data?.message || "Erreur lors de l'envoi."
  setTimeout(() => { sendFeedback.value = '' }, 3000)
}

onMounted(() => {
  const socket = getSocket(authStore.token)
  socket.on('send-error', handleSendError)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('send-error', handleSendError)
})
</script>

<template>
  <div class="critical-fail-tool" :class="'theme-' + combatType">
    <section class="type-selector">
      <p class="selector-label">Type d'attaque</p>
      <div class="type-buttons">
        <button
          v-for="type in combatTypes"
          :key="type.key"
          class="type-btn"
          :class="{ active: combatType === type.key }"
          @click="selectType(type.key)"
          :disabled="isRolling"
        >
          <span class="type-icon">{{ type.icon }}</span>
          <span class="type-name">{{ type.label }}</span>
        </button>
      </div>
    </section>

    <section class="dice-section">
      <div class="dice-container">
        <div class="dice-d100" :class="{ rolling: isRolling, landed: diceValue !== null && !isRolling }">
          <div class="dice-inner">
            <div class="dice-face">
              <span v-if="animatedDice !== null" class="dice-number">{{ animatedDice }}</span>
              <span v-else class="dice-number dice-placeholder">%</span>
            </div>
            <div class="dice-label">d100</div>
          </div>
        </div>
      </div>

      <button
        class="roll-btn"
        @click="rollDice"
        :disabled="isRolling"
        :class="{ rolling: isRolling }"
      >
        <span class="roll-btn-icon">🎲</span>
        <span class="roll-btn-text">{{ isRolling ? 'Lancement...' : 'Lancer les dés' }}</span>
      </button>
    </section>

    <section class="result-section" v-if="diceValue !== null">
      <div class="result-card" :class="{ visible: showResult }">
        <p class="result-text">{{ result }}</p>
        <div class="result-footer">
          <span class="result-type-badge">{{ typeLabel }}</span>
        </div>
      </div>

      <div v-if="showResult" class="send-section">
        <div class="recipient-row">
          <select v-model="selectedPlayerId" class="recipient-select" :disabled="!hasConnectedPlayers">
            <option v-if="hasConnectedPlayers" value="all">📣 Tous les joueurs</option>
            <option v-else value="" disabled>Aucun joueur connecté</option>
            <option v-for="p in sessionStore.players" :key="p.id" :value="p.id">
              ⚔️ {{ p.player_name }}
            </option>
          </select>
          <button class="send-btn" @click="sendToPlayers" :disabled="!sessionStore.activeSession || !hasConnectedPlayers">
            📡 Envoyer
          </button>
        </div>
        <p v-if="sendFeedback" class="send-feedback">{{ sendFeedback }}</p>
        <p v-if="!sessionStore.activeSession" class="no-session-hint">
          Aucune session active — créez une session dans l'onglet Sessions.
        </p>
        <p v-else-if="!hasConnectedPlayers" class="no-session-hint">
          Aucun joueur connecté dans cette session.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.critical-fail-tool {
  padding-bottom: 2rem;
}

.type-selector {
  padding: 0.5rem 0 1rem;
}

.selector-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-align: center;
  margin-bottom: 0.75rem;
}

.type-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.type-btn {
  flex: 1;
  max-width: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.75rem 0.5rem;
  background: linear-gradient(160deg, var(--color-surface-soft) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  cursor: pointer;
  transition: all 0.25s ease;
  font-family: var(--font-heading);
  position: relative;
  overflow: hidden;
}

.type-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, rgba(201,168,76,0.08) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.25s;
}

.type-btn:hover:not(:disabled)::before,
.type-btn.active::before {
  opacity: 1;
}

.type-btn.active {
  border-color: var(--theme-accent, var(--color-gold-dark));
  color: var(--theme-accent-light, var(--color-gold-bright));
  box-shadow: 0 0 16px var(--theme-glow, rgba(201,168,76,0.2)), inset 0 0 8px var(--theme-accent-shadow, rgba(201,168,76,0.05));
}

.type-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.type-icon {
  font-size: 1.5rem;
}

.type-name {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dice-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 0 1rem;
  gap: 1.5rem;
}

.dice-container {
  perspective: 600px;
}

.dice-d100 {
  width: 120px;
  height: 120px;
  position: relative;
}

.dice-d100.rolling .dice-inner {
  animation: diceShake 0.1s ease-in-out infinite;
}

.dice-d100.landed .dice-inner {
  animation: diceLand 0.4s ease-out forwards;
}

@keyframes diceShake {
  0% { transform: rotate(-3deg) scale(1.02); }
  25% { transform: rotate(3deg) scale(0.98); }
  50% { transform: rotate(-2deg) scale(1.03); }
  75% { transform: rotate(2deg) scale(0.97); }
  100% { transform: rotate(-3deg) scale(1.02); }
}

@keyframes diceLand {
  0% { transform: scale(1.1) rotate(5deg); }
  40% { transform: scale(0.92) rotate(-2deg); }
  70% { transform: scale(1.04) rotate(1deg); }
  100% { transform: scale(1) rotate(0deg); }
}

.dice-inner {
  width: 100%;
  height: 100%;
  position: relative;
  filter: drop-shadow(0 6px 18px rgba(0,0,0,0.7)) drop-shadow(0 0 12px rgba(201,168,76,0.15));
}

.dice-face {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 38% 35%, #4e3418, #32200a 55%, #1e1106);
  border: 2.5px solid var(--color-gold-dark);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 0 4px rgba(201,168,76,0.08),
    inset 0 2px 0 rgba(255,255,255,0.07),
    inset 0 0 24px rgba(139,60,10,0.2);
  position: relative;
}

.dice-number {
  font-family: var(--font-heading);
  font-size: 2.6rem;
  font-weight: 900;
  color: var(--color-gold-bright);
  text-shadow:
    0 0 20px rgba(240,192,64,0.8),
    0 0 40px rgba(240,192,64,0.3),
    2px 2px 0 rgba(0,0,0,0.8);
  line-height: 1;
  user-select: none;
}

.dice-placeholder {
  font-size: 2.2rem;
  color: var(--color-gold-dark);
  text-shadow: none;
  opacity: 0.5;
}

.dice-label {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.3em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  white-space: nowrap;
}

.roll-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 2.5rem;
  background: linear-gradient(160deg, #6b1a1a 0%, #4a0f0f 50%, #3a0a0a 100%);
  border: 1px solid #8b2a2a;
  border-radius: 50px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow:
    0 4px 20px rgba(139,26,26,0.5),
    0 1px 0 rgba(255,255,255,0.05) inset;
  margin-top: 1.5rem;
}

.roll-btn:hover:not(:disabled) {
  background: linear-gradient(160deg, #8b2a2a 0%, #6b1a1a 50%, #4a0f0f 100%);
  box-shadow: 0 6px 28px rgba(139,26,26,0.7);
  transform: translateY(-1px);
}

.roll-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.roll-btn-icon {
  font-size: 1.2rem;
}

.roll-btn.rolling .roll-btn-icon {
  animation: spinDice 0.5s linear infinite;
}

@keyframes spinDice {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.result-section {
  padding: 0.5rem 0 1rem;
}

.result-card {
  background: linear-gradient(160deg, var(--color-surface) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow:
    0 0 0 1px rgba(201,168,76,0.12),
    0 8px 32px rgba(0,0,0,0.5);
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.result-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.result-text {
  font-family: var(--font-body);
  font-size: 1.15rem;
  line-height: 1.65;
  color: var(--color-parchment);
  text-align: center;
}

.result-footer {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.result-type-badge {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: rgba(201,168,76,0.07);
  border: 1px solid rgba(201,168,76,0.15);
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.send-section {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.recipient-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  align-items: center;
}

.recipient-select {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.9rem;
  outline: none;
  cursor: pointer;
}
.recipient-select:focus { border-color: var(--color-gold-dark); }
.recipient-select:disabled { opacity: 0.5; cursor: not-allowed; }

.send-btn {
  padding: 0.75rem 2rem;
  background: linear-gradient(160deg, #1a4a2a, #0e2e1a);
  border: 1px solid #2a6a3a;
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(160deg, #2a6a3a, #1a4a2a);
  box-shadow: 0 4px 20px rgba(42,106,58,0.4);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-feedback {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: #2fb896;
  text-align: center;
}

.no-session-hint {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  text-align: center;
}

/* Themes */
.critical-fail-tool.theme-melee {
  --theme-accent: #c41e3a;
  --theme-accent-light: #ff6b6b;
  --theme-glow: rgba(196, 30, 58, 0.4);
  --theme-accent-shadow: rgba(196, 30, 58, 0.1);
}

.critical-fail-tool.theme-distance {
  --theme-accent: #1b8b6f;
  --theme-accent-light: #2fb896;
  --theme-glow: rgba(27, 139, 111, 0.4);
  --theme-accent-shadow: rgba(27, 139, 111, 0.1);
}

.critical-fail-tool.theme-magique {
  --theme-accent: #7b2cbf;
  --theme-accent-light: #b391ff;
  --theme-glow: rgba(123, 44, 191, 0.4);
  --theme-accent-shadow: rgba(123, 44, 191, 0.1);
}

.critical-fail-tool.theme-melee .dice-face {
  border-color: var(--theme-accent);
  background: radial-gradient(circle at 38% 35%, #8b4513, #5c2e0f 55%, #3d1f08);
}

.critical-fail-tool.theme-distance .dice-face {
  border-color: var(--theme-accent);
  background: radial-gradient(circle at 38% 35%, #2d5f4f, #1d3f2f 55%, #0d2415);
}

.critical-fail-tool.theme-magique .dice-face {
  border-color: var(--theme-accent);
  background: radial-gradient(circle at 38% 35%, #6b3fa0, #4b2f70 55%, #2b1f40);
}

.critical-fail-tool.theme-melee .dice-number {
  color: #ff6b6b;
  text-shadow: 0 0 20px rgba(255, 107, 107, 0.8), 2px 2px 0 rgba(0,0,0,0.8);
}

.critical-fail-tool.theme-distance .dice-number {
  color: #2fb896;
  text-shadow: 0 0 20px rgba(47, 184, 150, 0.8), 2px 2px 0 rgba(0,0,0,0.8);
}

.critical-fail-tool.theme-magique .dice-number {
  color: #b391ff;
  text-shadow: 0 0 20px rgba(179, 145, 255, 0.8), 2px 2px 0 rgba(0,0,0,0.8);
}

.critical-fail-tool.theme-melee .result-card {
  border-color: var(--theme-accent);
}

.critical-fail-tool.theme-distance .result-card {
  border-color: var(--theme-accent);
}

.critical-fail-tool.theme-magique .result-card {
  border-color: var(--theme-accent);
}
</style>
