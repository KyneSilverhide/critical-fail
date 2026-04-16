<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { authStore } from '../../stores/auth.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const searchCache = new Map()
const MIN_AUTO_SEARCH_LENGTH = 3
let autoSearchTimer = null

// Parse school + level from "niveau 3 - nécomancie (rituel)" → { level: 3, school: 'Nécromancie', ritual: true }
function parseEcole(ecole) {
  if (!ecole) return { level: null, school: '', ritual: false }
  const rituel = ecole.toLowerCase().includes('rituel')
  const match = ecole.match(/niveau\s+(\d+)\s*[-–]\s*(.+)/i)
  if (match) {
    let school = match[2].replace(/\s*\(rituel\)/i, '').trim()
    school = school.charAt(0).toUpperCase() + school.slice(1)
    return { level: parseInt(match[1]), school, ritual: rituel }
  }
  // Cantrip / tour de magie
  const cantrip = ecole.match(/tour de magie\s*[-–]?\s*(.*)/i)
  if (cantrip) {
    let school = cantrip[1].replace(/\s*\(rituel\)/i, '').trim()
    return { level: 0, school: school || ecole, ritual: rituel }
  }
  return { level: null, school: ecole, ritual: rituel }
}

function levelLabel(level) {
  if (level === null) return ''
  if (level === 0) return 'Tour de magie'
  return `Niveau ${level}`
}

const SCHOOL_COLORS = {
  abjuration: '#89c4ff',
  divination: '#c4a0ff',
  enchantement: '#ff9eb5',
  évocation: '#ffb347',
  illusion: '#b0e0e6',
  invocation: '#98ff98',
  nécromancie: '#cc99ff',
  transmutation: '#f0e68c',
}

function schoolColor(school) {
  const key = school.toLowerCase()
  for (const [k, v] of Object.entries(SCHOOL_COLORS)) {
    if (key.includes(k)) return v
  }
  return '#c9a84c'
}

function shortComponent(composantes) {
  if (!composantes) return ''
  const m = composantes.match(/Composantes\s*:\s*(.+)/i)
  return m ? m[1] : composantes
}

async function search() {
  const q = query.value.trim()
  if (!q) return
  if (searchCache.has(q)) {
    results.value = searchCache.get(q)
    searched.value = true
    return
  }
  loading.value = true
  searched.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/spells/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const data = await res.json()
      results.value = data
      searchCache.set(q, data)
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
    searched.value = true
  }
}

watch(query, () => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  const q = query.value.trim()
  if (q.length < MIN_AUTO_SEARCH_LENGTH) {
    results.value = []
    searched.value = false
    loading.value = false
    return
  }
  autoSearchTimer = setTimeout(() => {
    search()
  }, 250)
})

onUnmounted(() => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
})
</script>

<template>
  <div class="search-tool">
    <h2 class="section-title">🔍 Recherche de Sorts</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom du sort, école, description…"
        @keydown.enter="search"
      />
      <button class="search-btn" :disabled="loading || !query.trim()" @click="search">
        {{ loading ? '…' : '🔍 Chercher' }}
      </button>
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="searched && results.length === 0" class="no-results">
      <p class="no-results-icon">📭</p>
      <p class="no-results-text">Aucun sort trouvé pour « {{ query }} »</p>
    </div>

    <div v-else-if="results.length > 0" class="results-info">
      {{ results.length }} sort(s) trouvé(s)
      <span v-if="results.length === 50"> (premiers 50 résultats)</span>
    </div>

    <div class="results-grid">
      <div v-for="spell in results" :key="spell.slug" class="spell-card">
        <!-- Card header -->
        <div class="spell-header">
          <div class="spell-title-row">
            <h3 class="spell-name">{{ spell.name }}</h3>
            <span v-if="parseEcole(spell.attributes?.ecole).ritual" class="ritual-badge">Rituel</span>
          </div>
          <div class="spell-meta-row">
            <span
              class="school-badge"
              :style="{ color: schoolColor(parseEcole(spell.attributes?.ecole).school), borderColor: schoolColor(parseEcole(spell.attributes?.ecole).school) + '44', background: schoolColor(parseEcole(spell.attributes?.ecole).school) + '15' }"
            >{{ parseEcole(spell.attributes?.ecole).school }}</span>
            <span class="level-badge">
              {{ levelLabel(parseEcole(spell.attributes?.ecole).level) }}
            </span>
          </div>
        </div>

        <!-- Attributes grid -->
        <div class="spell-attrs">
          <div v-if="spell.attributes?.temps_incantation" class="attr-item">
            <span class="attr-icon">⏱️</span>
            <span class="attr-val">{{ spell.attributes.temps_incantation.replace(/^Temps d'incantation\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.portee" class="attr-item">
            <span class="attr-icon">🎯</span>
            <span class="attr-val">{{ spell.attributes.portee.replace(/^Portée\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.duree" class="attr-item">
            <span class="attr-icon">⌛</span>
            <span class="attr-val">{{ spell.attributes.duree.replace(/^Durée\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.composantes" class="attr-item">
            <span class="attr-icon">🧪</span>
            <span class="attr-val">{{ shortComponent(spell.attributes.composantes) }}</span>
          </div>
        </div>

        <!-- Description -->
        <div v-if="spell.description" class="spell-desc">
          {{ spell.description }}
        </div>

        <a :href="spell.detail_url" target="_blank" class="spell-link">Voir sur AideDD ↗</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-tool {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.search-bar {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus { border-color: var(--color-gold-dark); }
.search-input::placeholder { color: var(--color-border); }

.search-btn {
  padding: 0.6rem 1.1rem;
  background: linear-gradient(160deg, #4a2010, #2e1008);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.search-btn:hover:not(:disabled) { background: linear-gradient(160deg, #6b3020, #4a1e10); }
.search-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Loading */
.search-loading {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  padding: 1.5rem 0;
}
.loading-dot {
  font-size: 0.5rem;
  color: var(--color-gold-dark);
  animation: dotBounce 1.2s ease-in-out infinite;
}
.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotBounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-6px); opacity: 1; } }

/* No results */
.no-results {
  text-align: center;
  padding: 2rem 0;
}
.no-results-icon { font-size: 2.5rem; opacity: 0.4; margin: 0; }
.no-results-text { font-family: var(--font-heading); font-size: 0.85rem; color: var(--color-text-dim); margin: 0.5rem 0 0; }

/* Results count */
.results-info {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

/* Results grid */
.results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Spell card */
.spell-card {
  background: linear-gradient(160deg, #1e1610, #130f08);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: border-color 0.2s;
}
.spell-card:hover { border-color: var(--color-gold-dark); }

.spell-header { display: flex; flex-direction: column; gap: 0.35rem; }

.spell-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.spell-name {
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
  flex: 1;
}

.ritual-badge {
  font-family: var(--font-heading);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #b89ee8;
  background: rgba(123,94,167,0.15);
  border: 1px solid rgba(123,94,167,0.4);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  flex-shrink: 0;
}

.spell-meta-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.school-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
}

.level-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: rgba(201,168,76,0.1);
  border: 1px solid rgba(201,168,76,0.3);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
}

/* Attributes */
.spell-attrs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.35rem 0.75rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}

.attr-item {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
}
.attr-icon { font-size: 0.75rem; flex-shrink: 0; line-height: 1.4; }
.attr-val {
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--color-text-dim);
  line-height: 1.35;
  word-break: break-word;
}

/* Description */
.spell-desc {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  white-space: pre-line;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

/* Link */
.spell-link {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  align-self: flex-start;
  transition: color 0.2s;
}
.spell-link:hover { color: var(--color-gold-bright); }
</style>
