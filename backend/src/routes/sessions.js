const express = require('express')
const QRCode = require('qrcode')
const pool = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'Session name required.' })

  try {
    const result = await pool.query(
      'INSERT INTO sessions (name, created_by) VALUES ($1, $2) RETURNING *',
      [name, req.admin.id]
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

module.exports = router
