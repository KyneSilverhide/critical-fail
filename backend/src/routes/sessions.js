const express = require('express')
const QRCode = require('qrcode')
const pool = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

const crypto = require('crypto')

async function generateUniqueCode(pool) {
  for (let i = 0; i < 10; i++) {
    const code = (10000000 + crypto.randomInt(90000000)).toString()
    const exists = await pool.query('SELECT id FROM sessions WHERE code = $1', [code])
    if (!exists.rows[0]) return code
  }
  throw new Error('Could not generate unique code')
}

router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'Session name required.' })

  try {
    const code = await generateUniqueCode(pool)
    const result = await pool.query(
      'INSERT INTO sessions (name, code, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, code, req.admin.id]
    )
    const session = result.rows[0]

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const joinUrl = `${frontendUrl}/join/${session.code}`
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

    res.status(201).json({ session, qrCodeDataUrl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE created_by = $1 ORDER BY created_at DESC',
      [req.admin.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/qrcode', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, code, status FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    const session = result.rows[0]
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (session.status !== 'active') return res.status(400).json({ error: 'Session is closed.' })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const joinUrl = `${frontendUrl}/join/${session.code}`
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

    res.json({ qrCodeDataUrl, joinUrl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:code', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, code, name, status, created_at FROM sessions WHERE code = $1 AND status = 'active'",
      [req.params.code]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Session not found or closed.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/:id/close', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE sessions SET status = 'closed' WHERE id = $1 AND created_by = $2 RETURNING *",
      [req.params.id, req.admin.id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Session not found.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/journal', authenticateToken, async (req, res) => {
  try {
    const sessionCheck = await pool.query(
      'SELECT id, created_at FROM sessions WHERE id = $1 AND created_by = $2',
      [req.params.id, req.admin.id]
    )
    if (!sessionCheck.rows[0]) return res.status(404).json({ error: 'Session not found.' })

    const events = await pool.query(
      'SELECT * FROM session_events WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    )

    const rows = events.rows
    const damages = rows.filter(e => e.event_type === 'damage')
    const heals = rows.filter(e => e.event_type === 'heal')
    const deaths = rows.filter(e => e.event_type === 'death')
    const totalDamage = damages.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)
    const totalHeal = heals.reduce((sum, e) => sum + Math.abs(e.value || 0), 0)

    const sessionStart = sessionCheck.rows[0].created_at
    const lastEvent = rows.length ? rows[rows.length - 1].created_at : new Date()
    const durationMs = new Date(lastEvent) - new Date(sessionStart)
    const durationMin = Math.round(durationMs / 60000)

    const summary = [
      `📜 Résumé de session`,
      `⏱️ Durée : ${durationMin} min`,
      `💥 Dégâts totaux : ${totalDamage} PV`,
      `💚 Soins totaux : ${totalHeal} PV`,
      `💀 Morts : ${deaths.length}`,
      deaths.length ? `   ${deaths.map(d => d.player_name).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    res.json({ events: rows, summary })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/images', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, url, uploaded_at FROM session_images WHERE session_id = $1 ORDER BY uploaded_at DESC',
      [req.params.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
