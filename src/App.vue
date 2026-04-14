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
const collapseHeader = ref(false)

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
  collapseHeader.value = false
}


function getResult(roll, table) {
  return table.find(entry => roll >= entry.min && roll <= entry.max) || null
}

async function rollDice() {
  if (isRolling.value) return
  isRolling.value = true
  showResult.value = false
  result.value = null
  collapseHeader.value = true  // ← AJOUTER CETTE LIGNE (avant l'animation)

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
  <div class="app-wrapper" :class="'theme-' + combatType">
  <!-- Header -->
    <header class="app-header" :class="{ collapsed: collapseHeader }">
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
  background: linear-gradient(160deg, #2e2010 0%, #1e1508 100%);
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
  transition: all 0.3s ease;
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
  background: linear-gradient(160deg, #2a1e10 0%, #1e1408 100%);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow:
    0 0 0 1px rgba(201,168,76,0.12),
    0 8px 32px rgba(0,0,0,0.5),
    inset 0 0 40px rgba(139,80,10,0.06);
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
  justify-content: center;
  margin-bottom: 0.5rem;
}

.result-type-icon {
  font-size: 2.2rem;
  filter: drop-shadow(0 0 8px rgba(201,168,76,0.5));
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
  font-size: 1.25rem;
  line-height: 1.65;
  color: var(--color-parchment);
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

/* ── D&D Beyond Themes ── */

.app-wrapper.theme-melee {
  --theme-accent: #c41e3a;
  --theme-accent-light: #ff6b6b;
  --theme-accent-dark: #8b0000;
  --theme-glow: rgba(196, 30, 58, 0.4);
  --theme-accent-shadow: rgba(196, 30, 58, 0.1);
}

.app-wrapper.theme-distance {
  --theme-accent: #1b8b6f;
  --theme-accent-light: #2fb896;
  --theme-accent-dark: #0d5c42;
  --theme-glow: rgba(27, 139, 111, 0.4);
  --theme-accent-shadow: rgba(27, 139, 111, 0.1);
}

.app-wrapper.theme-magique {
  --theme-accent: #7b2cbf;
  --theme-accent-light: #b391ff;
  --theme-accent-dark: #560bad;
  --theme-glow: rgba(123, 44, 191, 0.4);
  --theme-accent-shadow: rgba(123, 44, 191, 0.1);
}

/* Dé - Couleurs adaptées par thème */
.app-wrapper.theme-melee .dice-face {
  border-color: var(--theme-accent);
  background: radial-gradient(circle at 38% 35%, #8b4513, #5c2e0f 55%, #3d1f08);
  box-shadow:
      0 0 0 4px rgba(196, 30, 58, 0.1),
      inset 0 2px 0 rgba(255,255,255,0.07),
      inset 0 0 24px rgba(196, 30, 58, 0.15);
}

.app-wrapper.theme-distance .dice-face {
  border-color: var(--theme-accent);
  background: radial-gradient(circle at 38% 35%, #2d5f4f, #1d3f2f 55%, #0d2415);
  box-shadow:
      0 0 0 4px rgba(27, 139, 111, 0.1),
      inset 0 2px 0 rgba(255,255,255,0.07),
      inset 0 0 24px rgba(27, 139, 111, 0.15);
}

.app-wrapper.theme-magique .dice-face {
  border-color: var(--theme-accent);
  background: radial-gradient(circle at 38% 35%, #6b3fa0, #4b2f70 55%, #2b1f40);
  box-shadow:
      0 0 0 4px rgba(123, 44, 191, 0.1),
      inset 0 2px 0 rgba(255,255,255,0.07),
      inset 0 0 24px rgba(123, 44, 191, 0.15);
}

/* Cartes résultat - Couleurs adaptées par thème */
.app-wrapper.theme-melee .result-card {
  border-color: var(--theme-accent);
  background: linear-gradient(160deg, rgba(196, 30, 58, 0.1) 0%, rgba(139, 0, 0, 0.05) 100%);
  box-shadow:
      0 0 0 1px var(--theme-accent),
      0 8px 32px rgba(196, 30, 58, 0.2),
      inset 0 0 40px var(--theme-accent-shadow);
}

.app-wrapper.theme-distance .result-card {
  border-color: var(--theme-accent);
  background: linear-gradient(160deg, rgba(27, 139, 111, 0.1) 0%, rgba(13, 92, 66, 0.05) 100%);
  box-shadow:
      0 0 0 1px var(--theme-accent),
      0 8px 32px rgba(27, 139, 111, 0.2),
      inset 0 0 40px var(--theme-accent-shadow);
}

.app-wrapper.theme-magique .result-card {
  border-color: var(--theme-accent);
  background: linear-gradient(160deg, rgba(123, 44, 191, 0.1) 0%, rgba(86, 11, 173, 0.05) 100%);
  box-shadow:
      0 0 0 1px var(--theme-accent),
      0 8px 32px rgba(123, 44, 191, 0.2),
      inset 0 0 40px var(--theme-accent-shadow);
}

/* Badge de type - Couleurs adaptées par thème */
.app-wrapper.theme-melee .result-type-badge {
  color: var(--theme-accent);
  background: rgba(196, 30, 58, 0.1);
  border-color: var(--theme-accent);
}

.app-wrapper.theme-distance .result-type-badge {
  color: var(--theme-accent);
  background: rgba(27, 139, 111, 0.1);
  border-color: var(--theme-accent);
}

.app-wrapper.theme-magique .result-type-badge {
  color: var(--theme-accent);
  background: rgba(123, 44, 191, 0.1);
  border-color: var(--theme-accent);
}

/* Numéro du dé - Couleurs adaptées par thème */
.app-wrapper.theme-melee .dice-number {
  color: #ff6b6b;
  text-shadow:
      0 0 20px rgba(255, 107, 107, 0.8),
      0 0 40px rgba(255, 107, 107, 0.3),
      2px 2px 0 rgba(0,0,0,0.8);
}

.app-wrapper.theme-distance .dice-number {
  color: #2fb896;
  text-shadow:
      0 0 20px rgba(47, 184, 150, 0.8),
      0 0 40px rgba(47, 184, 150, 0.3),
      2px 2px 0 rgba(0,0,0,0.8);
}

.app-wrapper.theme-magique .dice-number {
  color: #b391ff;
  text-shadow:
      0 0 20px rgba(179, 145, 255, 0.8),
      0 0 40px rgba(179, 145, 255, 0.3),
      2px 2px 0 rgba(0,0,0,0.8);
}

/* Divider du résultat - Couleurs adaptées par thème */
.app-wrapper.theme-melee .result-divider {
  color: var(--theme-accent);
}

.app-wrapper.theme-melee .result-divider::before,
.app-wrapper.theme-melee .result-divider::after {
  background: linear-gradient(90deg, transparent, var(--theme-accent));
}

.app-wrapper.theme-distance .result-divider {
  color: var(--theme-accent);
}

.app-wrapper.theme-distance .result-divider::before,
.app-wrapper.theme-distance .result-divider::after {
  background: linear-gradient(90deg, transparent, var(--theme-accent));
}

.app-wrapper.theme-magique .result-divider {
  color: var(--theme-accent);
}

.app-wrapper.theme-magique .result-divider::before,
.app-wrapper.theme-magique .result-divider::after {
  background: linear-gradient(90deg, transparent, var(--theme-accent));
}

/* ── Header Collapse Animation ── */
.app-header {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  transform: translateY(0);
  max-height: 300px;
  overflow: hidden;
}

.app-header.collapsed {
  opacity: 0;
  transform: translateY(-100%);
  max-height: 0;
  padding: 0;
  margin: 0;
}

/* Type selector - reste visible mais remonte */
.type-selector {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateY(0);
}

</style>
