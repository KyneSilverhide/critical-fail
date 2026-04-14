const jwt = require('jsonwebtoken')
const pool = require('./db')

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        socket.admin = decoded
      } catch {
        // Not an admin socket, that's fine
      }
    }
    next()
  })

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    socket.on('join-session', async ({ code, playerName }) => {
      try {
        const sessionResult = await pool.query(
          "SELECT * FROM sessions WHERE code = $1 AND status = 'active'",
          [code]
        )
        const session = sessionResult.rows[0]
        if (!session) {
          socket.emit('error', { message: 'Session not found or closed.' })
          return
        }

        const playerResult = await pool.query(
          'INSERT INTO players (session_id, player_name, socket_id) VALUES ($1, $2, $3) RETURNING *',
          [session.id, playerName, socket.id]
        )
        const player = playerResult.rows[0]

        socket.join(`session:${session.id}`)
        socket.playerId = player.id
        socket.sessionId = session.id

        socket.emit('session-joined', {
          session: { id: session.id, name: session.name, code: session.code },
          playerId: player.id,
        })

        io.to(`admin:${session.id}`).emit('player-joined', player)
      } catch (err) {
        console.error(err)
        socket.emit('error', { message: 'Failed to join session.' })
      }
    })

    socket.on('leave-session', async () => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        await pool.query('DELETE FROM players WHERE id = $1', [socket.playerId])
        socket.leave(`session:${socket.sessionId}`)
        io.to(`admin:${socket.sessionId}`).emit('player-left', { playerId: socket.playerId })
        socket.playerId = null
        socket.sessionId = null
      } catch (err) {
        console.error(err)
      }
    })

    socket.on('admin-join', (sessionId) => {
      if (!socket.admin) return
      socket.join(`admin:${sessionId}`)
    })

    socket.on('send-message', async ({ sessionId, toPlayerId, type, content }) => {
      if (!socket.admin) return
      try {
        const fromName = socket.admin.username
        await pool.query(
          'INSERT INTO messages (session_id, from_name, to_player_id, type, content) VALUES ($1, $2, $3, $4, $5)',
          [sessionId, fromName, toPlayerId || null, type, content]
        )

        const msg = { fromName, type, content, sentAt: new Date() }

        if (toPlayerId) {
          const playerResult = await pool.query(
            'SELECT socket_id FROM players WHERE id = $1',
            [toPlayerId]
          )
          const player = playerResult.rows[0]
          if (player?.socket_id) {
            io.to(player.socket_id).emit('new-message', msg)
          }
        } else {
          io.to(`session:${sessionId}`).emit('new-message', msg)
        }
      } catch (err) {
        console.error(err)
      }
    })

    socket.on('send-dice-result', async ({ sessionId, combatType, rollValue, resultText, toPlayerId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'INSERT INTO dice_results (session_id, combat_type, roll_value, result_text, sent_to) VALUES ($1, $2, $3, $4, $5)',
          [sessionId, combatType, rollValue, resultText, toPlayerId || null]
        )

        const diceData = {
          combatType,
          rollValue,
          resultText,
          createdAt: new Date(),
        }

        if (toPlayerId) {
          const playerResult = await pool.query(
            'SELECT socket_id FROM players WHERE id = $1',
            [toPlayerId]
          )
          const player = playerResult.rows[0]
          if (player?.socket_id) {
            io.to(player.socket_id).emit('dice-result', diceData)
          }
        } else {
          io.to(`session:${sessionId}`).emit('dice-result', diceData)
        }
      } catch (err) {
        console.error(err)
      }
    })

    socket.on('disconnect', async () => {
      if (socket.playerId && socket.sessionId) {
        try {
          await pool.query('DELETE FROM players WHERE id = $1', [socket.playerId])
          io.to(`admin:${socket.sessionId}`).emit('player-left', { playerId: socket.playerId })
        } catch (err) {
          console.error(err)
        }
      }
    })
  })
}

module.exports = setupSocket
