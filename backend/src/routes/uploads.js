const express = require('express')
const multer = require('multer')
const path = require('path')
const { authenticateToken } = require('../middleware/auth')
const pool = require('../db')

const router = express.Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'))
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const ext = path.extname(file.originalname)
    cb(null, `${unique}${ext}`)
  },
})

const imageFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only images allowed.'))
  }
  cb(null, true)
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
})

const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter,
})

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const url = `/uploads/${req.file.filename}`
  if (req.body.session_id) {
    try {
      await pool.query('INSERT INTO session_images (session_id, url) VALUES ($1, $2)', [req.body.session_id, url])
    } catch (err) { console.error(err) }
  }
  res.json({ url })
})

// Public endpoint for player avatar uploads (no admin auth required)
router.post('/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  res.json({ url: `/uploads/${req.file.filename}` })
})

module.exports = router
