<script setup>
import { ref, computed } from 'vue'
import meleeTable from './assets/melee.json'
import distanceTable from './assets/distance.json'
import magiqueTable from './assets/magique.json'

const combatType = ref('melee')
const isRolling = ref(false)
const diceValue = ref(null)
const result = ref(null)
const animatedDice = ref(null)
const showResult = ref(false)

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

  // Animate dice value rapidly changing
  let steps = 30
  let delay = 30
  for (let i = 0; i < steps; i++) {
    animatedDice.value = Math.floor(Math.random() * 100) + 1
    await new Promise(r => setTimeout(r, delay + i * 2))
  }

  // Show final value
  animatedDice.value = finalRoll
  diceValue.value = finalRoll

  await new Promise(r => setTimeout(r, 400))

  const found = getResult(finalRoll, tables[combatType.value])
  result.value = found ? found.result : 'Résultat introuvable.'

  await new Promise(r => setTimeout(r, 100))
  showResult.value = true
  isRolling.value = false
}

const typeLabel = computed(() => {
  return combatTypes.find(t => t.key === combatType.value)?.label || ''
})
</script>

<template>
  <div class="app-wrapper">
    <!-- Header -->
    <header class="app-header">
      <div class="skull-ornament">💀</div>
      <h1 class="app-title">Échec<br/><span class="title-accent">Critique</span></h1>
      <p class="app-subtitle">Table des désastres héroïques</p>
      <div class="header-divider">
        <span class="divider-ornament">✦</span>
        <span class="divider-line"></span>
        <span class="divider-ornament">✦</span>
      </div>
    </header>

    <!-- Combat type selector -->
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

    <!-- Dice area -->
    <section class="dice-section">
      <div class="dice-container" :class="{ rolling: isRolling }">
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

      <!-- Roll button -->
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

    <!-- Result area -->
    <section class="result-section" v-if="diceValue !== null">
      <div class="result-card" :class="{ visible: showResult }">
        <div class="result-header">
          <span class="result-type-icon">{{ combatTypes.find(t => t.key === combatType)?.icon }}</span>
          <div class="result-header-text">
            <span class="result-roll-label">Résultat : </span>
            <span class="result-roll-value">{{ diceValue }}</span>
          </div>
        </div>
        <div class="result-divider">
          <span>⚜</span>
        </div>
        <p class="result-text">{{ result }}</p>
        <div class="result-footer">
          <span class="result-type-badge">{{ typeLabel }}</span>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="app-footer">
      <p>Forgé dans les abysses ⚔️</p>
    </footer>
  </div>
</template>

<style scoped>
.app-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 2rem;
}

/* ── Header ── */
.app-header {
  text-align: center;
  padding: 2rem 1.5rem 1rem;
  position: relative;
}

.skull-ornament {
  font-size: 2rem;
  filter: drop-shadow(0 0 8px rgba(139, 26, 26, 0.7));
  animation: floatSkull 3s ease-in-out infinite;
}

@keyframes floatSkull {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.app-title {
  font-family: var(--font-title);
  font-size: 2.4rem;
  line-height: 1.15;
  color: var(--color-parchment);
  text-shadow:
    0 0 30px rgba(201, 168, 76, 0.4),
    2px 2px 4px rgba(0,0,0,0.9);
  margin: 0.5rem 0 0.3rem;
  letter-spacing: 0.02em;
}

.title-accent {
  color: var(--color-gold-bright);
  text-shadow:
    0 0 20px rgba(240, 192, 64, 0.6),
    2px 2px 4px rgba(0,0,0,0.9);
}

.app-subtitle {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.25em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  margin: 0.25rem 0 1rem;
}

.header-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.5rem;
}

.divider-ornament {
  color: var(--color-gold);
  font-size: 0.6rem;
}

.divider-line {
  flex: 1;
  max-width: 100px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-gold-dark), transparent);
}

/* ── Type Selector ── */
.type-selector {
  padding: 1rem 1.5rem;
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
  background: linear-gradient(160deg, #1e160b 0%, #120d06 100%);
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
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  box-shadow: 0 0 12px rgba(201,168,76,0.2), inset 0 0 8px rgba(201,168,76,0.05);
}

.type-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.type-icon {
  font-size: 1.5rem;
  filter: drop-shadow(0 0 4px rgba(201,168,76,0.4));
}

.type-name {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* ── Dice Section ── */
.dice-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1.5rem 1rem;
  gap: 1.5rem;
}

.dice-container {
  perspective: 600px;
}

.dice-d100 {
  width: 120px;
  height: 120px;
  position: relative;
  transition: transform 0.3s ease;
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
}

.dice-face {
  width: 100%;
  height: 100%;
  background: linear-gradient(145deg, #2a1a0a, #1a0f05);
  border: 2px solid var(--color-gold-dark);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 0 1px rgba(201,168,76,0.15),
    0 4px 20px rgba(0,0,0,0.8),
    inset 0 1px 0 rgba(255,255,255,0.05),
    inset 0 0 20px rgba(139,26,26,0.1);
  clip-path: polygon(
    20% 0%, 80% 0%,
    100% 20%, 100% 80%,
    80% 100%, 20% 100%,
    0% 80%, 0% 20%
  );
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

/* ── Roll Button ── */
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
    0 1px 0 rgba(255,255,255,0.05) inset,
    0 -1px 0 rgba(0,0,0,0.3) inset;
  margin-top: 1.5rem;
  position: relative;
  overflow: hidden;
}

.roll-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.06), transparent 70%);
  pointer-events: none;
}

.roll-btn:hover:not(:disabled) {
  background: linear-gradient(160deg, #8b2a2a 0%, #6b1a1a 50%, #4a0f0f 100%);
  box-shadow:
    0 6px 28px rgba(139,26,26,0.7),
    0 1px 0 rgba(255,255,255,0.08) inset,
    0 0 0 1px rgba(240,192,64,0.2);
  transform: translateY(-1px);
}

.roll-btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 2px 10px rgba(139,26,26,0.4);
}

.roll-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.roll-btn-icon {
  font-size: 1.2rem;
  animation: none;
}

.roll-btn.rolling .roll-btn-icon {
  animation: spinDice 0.5s linear infinite;
}

@keyframes spinDice {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Result Section ── */
.result-section {
  padding: 0.5rem 1.5rem 1rem;
}

.result-card {
  background: linear-gradient(160deg, #1e140a 0%, #140d05 100%);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow:
    0 0 0 1px rgba(201,168,76,0.1),
    0 8px 32px rgba(0,0,0,0.6),
    inset 0 0 40px rgba(139,26,26,0.05);
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.4s ease, transform 0.4s ease;
  position: relative;
  overflow: hidden;
}

.result-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at top center, rgba(201,168,76,0.04), transparent 60%);
  pointer-events: none;
}

.result-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.result-type-icon {
  font-size: 1.8rem;
  filter: drop-shadow(0 0 6px rgba(201,168,76,0.4));
}

.result-header-text {
  font-family: var(--font-heading);
  font-size: 0.9rem;
}

.result-roll-label {
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
}

.result-roll-value {
  color: var(--color-gold-bright);
  font-size: 1.3rem;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(240,192,64,0.5);
}

.result-divider {
  text-align: center;
  color: var(--color-gold-dark);
  font-size: 0.9rem;
  margin: 0.5rem 0 1rem;
  position: relative;
}

.result-divider::before,
.result-divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 35%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-gold-dark));
}

.result-divider::before {
  left: 0;
}

.result-divider::after {
  right: 0;
  background: linear-gradient(270deg, transparent, var(--color-gold-dark));
}

.result-text {
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--color-parchment);
  font-style: italic;
  text-align: center;
  padding: 0 0.25rem;
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

/* ── Footer ── */
.app-footer {
  margin-top: auto;
  padding: 1.5rem;
  text-align: center;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-border);
}
</style>
