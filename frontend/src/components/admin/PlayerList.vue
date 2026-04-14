<script setup>
import { sessionStore } from '../../stores/session.js'
</script>

<template>
  <div class="player-list">
    <h2 class="section-title">✦ Joueurs Connectés</h2>
    <div v-if="sessionStore.players.length === 0" class="empty-list">
      <p>Aucun joueur connecté.</p>
    </div>
    <div v-else class="players">
      <div v-for="player in sessionStore.players" :key="player.id" class="player-item">
        <span class="player-icon">⚔️</span>
        <span class="player-name">{{ player.player_name }}</span>
        <span class="player-badge">En ligne</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-list {
  margin-top: 1.5rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.75rem;
}

.empty-list {
  font-family: var(--font-body);
  font-style: italic;
  color: var(--color-text-dim);
  font-size: 0.9rem;
  padding: 0.5rem 0;
}

.players {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: linear-gradient(160deg, #1e1e10, #141408);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.player-icon { font-size: 1rem; }

.player-name {
  flex: 1;
  font-family: var(--font-heading);
  font-size: 0.9rem;
  color: var(--color-parchment);
}

.player-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #2fb896;
  background: rgba(47,184,150,0.1);
  border: 1px solid #2fb896;
  padding: 0.15rem 0.4rem;
  border-radius: 20px;
}
</style>
