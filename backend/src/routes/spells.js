const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load spells once at startup
let spellsCache = null

function getSpells() {
  if (spellsCache) return spellsCache
  try {
    const filePath = path.join(__dirname, '../../aidedd_spells.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    // Filter out entries without attributes (the two header-only entries)
    spellsCache = (data.spells || []).filter(s => s.attributes && Object.keys(s.attributes).length > 0)
  } catch (err) {
    console.error('Failed to load spells JSON:', err)
    spellsCache = []
  }
  return spellsCache
}

// Pre-load on module import
getSpells()

router.get('/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  if (!q) return res.json([])

  const spells = getSpells()
  const results = spells.filter(spell => {
    if (spell.name.toLowerCase().includes(q)) return true
    if (spell.description && spell.description.toLowerCase().includes(q)) return true
    const ecole = spell.attributes?.ecole || ''
    if (ecole.toLowerCase().includes(q)) return true
    return false
  })

  res.json(results.slice(0, 50))
})

module.exports = router
