require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const path = require('path')
const bcrypt = require('bcrypt')
const runMigrations = require('./migrations')
const pool = require('./db')
const authRoutes = require('./routes/auth')
const sessionRoutes = require('./routes/sessions')
const uploadRoutes = require('./routes/uploads')
const setupSocket = require('./socket')

const app = express()
const server = http.createServer(app)

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/uploads', uploadRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

setupSocket(io)

async function seedAdmin() {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM admins')
    if (parseInt(result.rows[0].count) === 0) {
      const hash = await bcrypt.hash('admin123', 10)
      await pool.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        ['admin', hash]
      )
      console.log('Default admin created: admin / admin123')
    }
  } catch (err) {
    console.error('Error seeding admin:', err)
  }
}

const PORT = process.env.PORT || 3000

async function start() {
  let retries = 10
  while (retries > 0) {
    try {
      await runMigrations()
      await seedAdmin()
      break
    } catch (err) {
      retries--
      console.log(`DB not ready, retrying... (${retries} left)`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start()
