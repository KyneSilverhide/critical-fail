<script setup>
import { computed } from 'vue'
import { sessionStore } from '../../stores/session.js'

function hpPercent(player) {
  if (!player.max_hp) return 100
  return Math.min(100, Math.max(0, (player.current_hp / player.max_hp) * 100))
}
function hpColor(player) {
  const pct = hpPercent(player)
  if (pct > 50) return '#2fb896'
  if (pct > 20) return '#f0a500'
  return '#e03030'
}
</script>

<template>
  <div class="player-list">
    <h2 class="section-title">✦ Joueurs Connectés</h2>
    <div v-if="sessionStore.players.length === 0" class="empty-list">
      <p>Aucun joueur connecté.</p>
    </div>
    <div v-else class="players">
      <div v-for="player in sessionStore.players" :key="player.id" class="player-item">
        <div class="player-row-top">
          <span class="player-icon">⚔️</span>
          <span class="player-name">{{ player.player_name }}</span>
          <span class="ac-badge">🛡️ {{ player.ac ?? '?' }}</span>
          <span class="hp-text" :style="{ color: hpColor(player) }">
            ❤️ {{ player.current_hp ?? '?' }}<span class="hp-max">/ {{ player.max_hp ?? '?' }}</span>
          </span>
          <span class="player-badge">En ligne</span>
        </div>
        <div v-if="player.max_hp" class="hp-bar-track">
          <div class="hp-bar-fill"
            :style="{ width: hpPercent(player) + '%', background: hpColor(player) }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-list { margin-top: 1.5rem; }

.section-title {
  font-family: var(--font-heading); font-size: 0.75rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--color-gold-dark); margin-bottom: 0.75rem;
}
.empty-list { font-family: var(--font-body); color: var(--color-text-dim); font-size: 0.9rem; padding: 0.5rem 0; }

.players { display: flex; flex-direction: column; gap: 0.6rem; }

.player-item {
  padding: 0.6rem 0.75rem;
  background: linear-gradient(160deg, #1e1e10, #141408);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.player-row-top { display: flex; align-items: center; gap: 0.6rem; }
.player-icon { font-size: 1rem; }
.player-name { flex: 1; font-family: var(--font-heading); font-size: 0.9rem; color: var(--color-parchment); }

.ac-badge {
  font-family: var(--font-heading); font-size: 0.65rem; letter-spacing: 0.05em;
  color: #89c4ff; background: rgba(137,196,255,0.1); border: 1px solid rgba(137,196,255,0.3);
  border-radius: 20px; padding: 0.1rem 0.45rem;
}
.hp-text {
  font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700;
  transition: color 0.3s;
}
.hp-max { font-size: 0.6rem; color: var(--color-text-dim); margin-left: 2px; }

.player-badge {
  font-family: var(--font-heading); font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: #2fb896; background: rgba(47,184,150,0.1); border: 1px solid #2fb896;
  padding: 0.15rem 0.4rem; border-radius: 20px;
}

.hp-bar-track { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
.hp-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease, background 0.5s ease; }
</style>
