<script setup>
const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

function getImageUrl(url) {
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="message-card" :class="message.kind">
    <div v-if="message.kind === 'dice'" class="dice-card">
      <div class="dice-header">
        <span class="dice-icon">🎲</span>
        <span class="dice-type">{{ message.combatType }}</span>
        <span class="dice-time">{{ formatTime(message.createdAt) }}</span>
      </div>
      <div class="dice-roll">
        <span class="roll-label">Résultat :</span>
        <span class="roll-value">{{ message.rollValue }}</span>
      </div>
      <p class="dice-result-text">{{ message.resultText }}</p>
    </div>

    <div v-else-if="message.type === 'image'" class="image-card">
      <div class="card-header">
        <span class="from-name">{{ message.fromName || 'MJ' }}</span>
        <span class="card-time">{{ formatTime(message.sentAt) }}</span>
      </div>
      <img :src="getImageUrl(message.content)" alt="Image du MJ" class="message-image" />
    </div>

    <div v-else class="text-card">
      <div class="card-header">
        <span class="from-name">{{ message.fromName || 'MJ' }}</span>
        <span class="card-time">{{ formatTime(message.sentAt) }}</span>
      </div>
      <p class="message-text">{{ message.content }}</p>
    </div>
  </div>
</template>

<style scoped>
.message-card {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: linear-gradient(160deg, #2a1e10, #1a1208);
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.dice-card,
.text-card,
.image-card {
  padding: 1rem 1.25rem;
}

.dice-card {
  border-left: 3px solid var(--color-gold-dark);
  background: linear-gradient(160deg, #3a2a10, #2a1c08);
}

.dice-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.dice-icon { font-size: 1.2rem; }

.dice-type {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  flex: 1;
}

.dice-time,
.card-time {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  color: var(--color-border);
}

.dice-roll {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.roll-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: var(--color-text-dim);
  text-transform: uppercase;
}

.roll-value {
  font-family: var(--font-title);
  font-size: 2rem;
  color: var(--color-gold-bright);
  text-shadow: 0 0 20px rgba(240,192,64,0.5);
  line-height: 1;
}

.dice-result-text {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--color-parchment);
  line-height: 1.5;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.from-name {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.message-text {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--color-parchment);
  line-height: 1.6;
  white-space: pre-wrap;
}

.message-image {
  width: 100%;
  border-radius: 6px;
  max-height: 400px;
  object-fit: contain;
}
</style>
