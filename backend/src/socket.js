const jwt = require('jsonwebtoken')
const pool = require('./db')

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (token) {
      try {
        socket.admin = jwt.verify(token, process.env.JWT_SECRET)
      } catch { /* not an admin */ }
    }
    next()
  })

  async function removePlayer(socket) {
    if (!socket.playerId || !socket.sessionId) return
    try {
      const pr = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
      const playerName = pr.rows[0]?.player_name ?? 'Inconnu'
      await pool.query('DELETE FROM players WHERE id = $1', [socket.playerId])
      socket.leave(`session:${socket.sessionId}`)
      const event = { playerId: socket.playerId }
      io.to(`admin:${socket.sessionId}`).emit('player-left', event)
      io.to(`tv:${socket.sessionId}`).emit('player-left', event)

      // Log session event
      await pool.query(
        'INSERT INTO session_events (session_id, event_type, description, player_name) VALUES ($1, $2, $3, $4)',
        [socket.sessionId, 'leave', `${playerName} a quitté la session`, playerName]
      )
      const leaveEvent = { eventType: 'leave', description: `${playerName} a quitté la session`, playerName, createdAt: new Date() }
      io.to(`admin:${socket.sessionId}`).emit('session-event', leaveEvent)

      socket.playerId = null
      socket.sessionId = null
    } catch (err) { console.error(err) }
  }

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // ── Player: join ────────────────────────────────────────────────────────
    socket.on('join-session', async ({ code, playerName, ac, hp, dndClass, avatarUrl }) => {
      try {
        const sessionResult = await pool.query(
          "SELECT * FROM sessions WHERE code = $1 AND status = 'active'", [code])
        const session = sessionResult.rows[0]
        if (!session) { socket.emit('error', { message: 'Session not found or closed.' }); return }

        const acVal = Math.max(1, parseInt(ac) || 10)
        const hpVal = Math.max(1, parseInt(hp) || 20)
        const classVal = dndClass || null
        const avatarVal = avatarUrl || null

        const playerResult = await pool.query(
          `INSERT INTO players (session_id, player_name, socket_id, ac, max_hp, current_hp, dnd_class, avatar_url)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING *`,
          [session.id, playerName, socket.id, acVal, hpVal, classVal, avatarVal]
        )
        const player = playerResult.rows[0]
        socket.join(`session:${session.id}`)
        socket.playerId = player.id
        socket.sessionId = session.id

        socket.emit('session-joined', {
          session: { id: session.id, name: session.name, code: session.code },
          player: { id: player.id, player_name: player.player_name, ac: player.ac, max_hp: player.max_hp, current_hp: player.current_hp, dnd_class: player.dnd_class, avatar_url: player.avatar_url },
        })
        io.to(`admin:${session.id}`).emit('player-joined', player)
        io.to(`tv:${session.id}`).emit('player-joined', player)

        // Log session event
        await pool.query(
          'INSERT INTO session_events (session_id, event_type, description, player_name) VALUES ($1, $2, $3, $4)',
          [session.id, 'join', `${playerName} a rejoint la session`, playerName]
        )
        const joinEvent = { eventType: 'join', description: `${playerName} a rejoint la session`, playerName, createdAt: new Date() }
        io.to(`admin:${session.id}`).emit('session-event', joinEvent)
      } catch (err) { console.error(err); socket.emit('error', { message: 'Failed to join session.' }) }
    })

    socket.on('leave-session', async () => { await removePlayer(socket) })

    // ── Player: update HP ───────────────────────────────────────────────────
    socket.on('update-hp', async ({ newHp }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const hp = Math.max(0, parseInt(newHp) || 0)
        const prev = await pool.query('SELECT current_hp, player_name FROM players WHERE id = $1', [socket.playerId])
        const oldHp = prev.rows[0]?.current_hp ?? 0
        const playerName = prev.rows[0]?.player_name ?? 'Inconnu'
        await pool.query('UPDATE players SET current_hp = $1 WHERE id = $2', [hp, socket.playerId])
        const event = { playerId: socket.playerId, newHp: hp }
        io.to(`admin:${socket.sessionId}`).emit('hp-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('hp-updated', event)
        socket.emit('hp-update-confirmed', { newHp: hp })

        // Log session event
        const delta = hp - oldHp
        if (delta !== 0) {
          let eventType, description
          if (hp === 0) {
            eventType = 'death'
            description = `${playerName} est tombé à 0 PV !`
          } else if (delta < 0) {
            eventType = 'damage'
            description = `${playerName} subit ${Math.abs(delta)} dégâts (${oldHp} → ${hp} PV)`
          } else {
            eventType = 'heal'
            description = `${playerName} récupère ${delta} PV (${oldHp} → ${hp} PV)`
          }
          await pool.query(
            'INSERT INTO session_events (session_id, event_type, description, player_name, value) VALUES ($1, $2, $3, $4, $5)',
            [socket.sessionId, eventType, description, playerName, delta]
          )
          const sessionEvent = { eventType, description, playerName, value: delta, createdAt: new Date() }
          io.to(`admin:${socket.sessionId}`).emit('session-event', sessionEvent)
        }
      } catch (err) { console.error(err) }
    })

    // ── Player: update conditions ───────────────────────────────────────────
    socket.on('update-conditions', async ({ conditions }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const conditionsJson = JSON.stringify(Array.isArray(conditions) ? conditions : [])
        await pool.query('UPDATE players SET conditions = $1 WHERE id = $2', [conditionsJson, socket.playerId])
        const event = { playerId: socket.playerId, conditions }
        io.to(`admin:${socket.sessionId}`).emit('conditions-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('conditions-updated', event)
      } catch (err) { console.error(err) }
    })

    // ── Admin: join room + snapshot ─────────────────────────────────────────
    socket.on('admin-join', async (sessionId) => {
      if (!socket.admin) return
      try {
        const sessionResult = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2', [sessionId, socket.admin.id])
        if (!sessionResult.rows[0]) return
        socket.join(`admin:${sessionId}`)
        const playersResult = await pool.query(
          `SELECT id, session_id, player_name, socket_id, joined_at, ac, max_hp, current_hp, conditions
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [sessionId])
        socket.emit('players-snapshot', { sessionId, players: playersResult.rows })
      } catch (err) { console.error(err) }
    })

    // ── TV: join as observer ────────────────────────────────────────────────
    socket.on('tv-join', async ({ sessionCode }) => {
      try {
        const sessionResult = await pool.query(
          "SELECT * FROM sessions WHERE code = $1 AND status = 'active'", [sessionCode])
        const session = sessionResult.rows[0]
        if (!session) { socket.emit('error', { message: 'Session not found or closed.' }); return }
        socket.join(`tv:${session.id}`)
        socket.tvSessionId = session.id
        const playersResult = await pool.query(
          `SELECT id, player_name, ac, max_hp, current_hp, dnd_class, avatar_url, conditions
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [session.id])
        socket.emit('tv-snapshot', { session: { id: session.id, name: session.name }, players: playersResult.rows })
      } catch (err) { console.error(err) }
    })

    // ── Admin: send message ─────────────────────────────────────────────────
    socket.on('send-message', async ({ sessionId, toPlayerId, type, content, voiceStyle, textEffect }) => {
      if (!socket.admin) return
      try {
        if (!toPlayerId) {
          const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
          if ((cnt.rows[0]?.total || 0) === 0) { socket.emit('send-error', { message: 'Aucun joueur connecté.' }); return }
        }
        const fromName = socket.admin.username
        const vStyle = voiceStyle || 'normal'
        const tEffect = textEffect || 'none'
        await pool.query('INSERT INTO messages (session_id, from_name, to_player_id, type, content, voice_style, text_effect) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [sessionId, fromName, toPlayerId || null, type, content, vStyle, tEffect])
        const msg = { fromName, type, content, voiceStyle: vStyle, textEffect: tEffect, sentAt: new Date() }
        if (toPlayerId) {
          const pr = await pool.query('SELECT socket_id FROM players WHERE id = $1', [toPlayerId])
          if (pr.rows[0]?.socket_id) io.to(pr.rows[0].socket_id).emit('new-message', msg)
        } else {
          io.to(`session:${sessionId}`).emit('new-message', msg)
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: send dice result ─────────────────────────────────────────────
    socket.on('send-dice-result', async ({ sessionId, combatType, rollValue, resultText, toPlayerId }) => {
      if (!socket.admin) return
      try {
        if (!toPlayerId) {
          const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
          if ((cnt.rows[0]?.total || 0) === 0) { socket.emit('send-error', { message: 'Aucun joueur connecté.' }); return }
        }
        await pool.query('INSERT INTO dice_results (session_id, combat_type, roll_value, result_text, sent_to) VALUES ($1, $2, $3, $4, $5)',
          [sessionId, combatType, rollValue, resultText, toPlayerId || null])
        const diceData = { combatType, rollValue, resultText, createdAt: new Date() }
        if (toPlayerId) {
          const pr = await pool.query('SELECT socket_id FROM players WHERE id = $1', [toPlayerId])
          if (pr.rows[0]?.socket_id) io.to(pr.rows[0].socket_id).emit('dice-result', diceData)
        } else {
          io.to(`session:${sessionId}`).emit('dice-result', diceData)
        }
      } catch (err) { console.error(err) }
    })

    socket.on('disconnect', async () => { await removePlayer(socket) })
  })
}

module.exports = setupSocket
