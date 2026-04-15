const jwt = require('jsonwebtoken')
const QRCode = require('qrcode')
const crypto = require('crypto')
const pool = require('./db')

async function getMerchantData(merchantId) {
  const mr = await pool.query('SELECT * FROM merchants WHERE id = $1', [merchantId])
  const merchant = mr.rows[0]
  if (!merchant) return null
  const items = await pool.query(
    'SELECT * FROM merchant_items WHERE merchant_id = $1 ORDER BY category, name',
    [merchantId]
  )
  return { ...merchant, items: items.rows }
}

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
          activeMerchant: (session.current_merchant_id && session.tv_mode === 'merchant')
            ? await getMerchantData(session.current_merchant_id)
            : null,
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
        const prev = await pool.query('SELECT current_hp, player_name, is_concentrating FROM players WHERE id = $1', [socket.playerId])
        const oldHp = prev.rows[0]?.current_hp ?? 0
        const playerName = prev.rows[0]?.player_name ?? 'Inconnu'
        const wasConcentrating = prev.rows[0]?.is_concentrating ?? false
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
            if (wasConcentrating) {
              await pool.query('UPDATE players SET is_concentrating = FALSE WHERE id = $1', [socket.playerId])
              const concEvent = { playerId: socket.playerId, isConcentrating: false }
              io.to(`admin:${socket.sessionId}`).emit('concentration-updated', concEvent)
              io.to(`tv:${socket.sessionId}`).emit('concentration-updated', concEvent)
            }
          } else if (delta < 0) {
            eventType = 'damage'
            description = `${playerName} subit ${Math.abs(delta)} dégâts (${oldHp} → ${hp} PV)`
            if (wasConcentrating) {
              const dc = Math.max(10, Math.ceil(Math.abs(delta) / 2))
              socket.emit('concentration-warning', { damage: Math.abs(delta), dc })
            }
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

    // ── Player: update concentration ────────────────────────────────────────
    socket.on('update-concentration', async ({ isConcentrating }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        await pool.query('UPDATE players SET is_concentrating = $1 WHERE id = $2', [isConcentrating, socket.playerId])
        const event = { playerId: socket.playerId, isConcentrating }
        io.to(`admin:${socket.sessionId}`).emit('concentration-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('concentration-updated', event)
        socket.emit('concentration-confirmed', { isConcentrating })
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
          `SELECT id, session_id, player_name, socket_id, joined_at, ac, max_hp, current_hp, conditions, is_concentrating
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
          `SELECT id, player_name, ac, max_hp, current_hp, dnd_class, avatar_url, conditions, is_concentrating
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [session.id])

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
        const joinUrl = `${frontendUrl}/join/${session.code}`
        const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

        let activeVote = null
        if (session.current_vote_id) {
          const voteInfo = await pool.query('SELECT * FROM votes WHERE id = $1 AND status = $2', [session.current_vote_id, 'active'])
          if (voteInfo.rows[0]) {
            const v = voteInfo.rows[0]
            const options = typeof v.options === 'string' ? JSON.parse(v.options) : v.options
            const responses = await pool.query('SELECT option_index, player_name FROM vote_responses WHERE vote_id = $1', [v.id])
            const results = options.map((_, i) => responses.rows.filter(r => r.option_index === i).length)
            const totalPlayers = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [session.id])
            activeVote = {
              id: v.id, question: v.question, options, isAnonymous: v.is_anonymous,
              results, totalPlayers: totalPlayers.rows[0].total, totalVotes: responses.rows.length,
              voterNames: responses.rows.map(r => ({ name: r.player_name, optionIndex: r.option_index }))
            }
          }
        }

        socket.emit('tv-snapshot', {
          session: { id: session.id, name: session.name },
          players: playersResult.rows,
          tvMode: session.tv_mode || 'lobby',
          sessionCode: session.code,
          qrCodeDataUrl,
          currentImageUrl: session.current_image_url,
          activeVote,
          activeMerchant: (session.current_merchant_id && session.tv_mode === 'merchant')
            ? await getMerchantData(session.current_merchant_id)
            : null,
        })
      } catch (err) { console.error(err) }
    })

    // ── Admin: set TV mode ──────────────────────────────────────────────────
    socket.on('set-tv-mode', async ({ sessionId, mode }) => {
      if (!socket.admin) return
      try {
        await pool.query('UPDATE sessions SET tv_mode = $1 WHERE id = $2 AND created_by = $3', [mode, sessionId, socket.admin.id])
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode })
      } catch (err) { console.error(err) }
    })

    // ── Admin: create vote ──────────────────────────────────────────────────
    socket.on('create-vote', async ({ sessionId, question, options, isAnonymous }) => {
      if (!socket.admin) return
      try {
        const voteRes = await pool.query(
          'INSERT INTO votes (session_id, question, options, is_anonymous) VALUES ($1, $2, $3, $4) RETURNING *',
          [sessionId, question, JSON.stringify(options), isAnonymous || false]
        )
        const vote = voteRes.rows[0]
        await pool.query('UPDATE sessions SET tv_mode = $1, current_vote_id = $2 WHERE id = $3', ['vote', vote.id, sessionId])
        const voteData = {
          id: vote.id, question, options, isAnonymous: vote.is_anonymous,
          results: options.map(() => 0), totalPlayers: 0, totalVotes: 0, voterNames: []
        }
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'vote' })
        io.to(`tv:${sessionId}`).emit('vote-started', voteData)
        io.to(`session:${sessionId}`).emit('vote-started', voteData)
        io.to(`admin:${sessionId}`).emit('vote-started', voteData)
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'vote' })
      } catch (err) { console.error(err) }
    })

    // ── Player: submit vote ─────────────────────────────────────────────────
    socket.on('submit-vote', async ({ voteId, optionIndex }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const existing = await pool.query('SELECT id FROM vote_responses WHERE vote_id = $1 AND player_id = $2', [voteId, socket.playerId])
        if (existing.rows[0]) { socket.emit('vote-error', { message: 'Vous avez déjà voté.' }); return }
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        await pool.query('INSERT INTO vote_responses (vote_id, player_id, player_name, option_index) VALUES ($1, $2, $3, $4)', [voteId, socket.playerId, playerName, optionIndex])
        socket.emit('vote-submitted', { optionIndex })

        const voteInfo = await pool.query('SELECT * FROM votes WHERE id = $1', [voteId])
        const vote = voteInfo.rows[0]
        const options = typeof vote.options === 'string' ? JSON.parse(vote.options) : vote.options
        const responses = await pool.query('SELECT option_index, player_name FROM vote_responses WHERE vote_id = $1', [voteId])
        const results = options.map((_, i) => responses.rows.filter(r => r.option_index === i).length)
        const totalPlayers = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [socket.sessionId])
        const totalVotes = responses.rows.length
        const voterNames = responses.rows.map(r => ({ name: r.player_name, optionIndex: r.option_index }))

        const voteUpdate = {
          id: voteId, question: vote.question, options, isAnonymous: vote.is_anonymous,
          results, totalPlayers: totalPlayers.rows[0].total, totalVotes, voterNames
        }
        io.to(`tv:${socket.sessionId}`).emit('vote-updated', voteUpdate)
        io.to(`admin:${socket.sessionId}`).emit('vote-updated', voteUpdate)

        if (totalVotes >= totalPlayers.rows[0].total) {
          const closed = await pool.query('UPDATE votes SET status = $1 WHERE id = $2 AND status = $3 RETURNING id', ['closed', voteId, 'active'])
          if (closed.rows[0]) {
            io.to(`tv:${socket.sessionId}`).emit('vote-closed', voteUpdate)
            io.to(`session:${socket.sessionId}`).emit('vote-closed', voteUpdate)
            io.to(`admin:${socket.sessionId}`).emit('vote-closed', voteUpdate)
          }
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: close vote ───────────────────────────────────────────────────
    socket.on('close-vote', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query('SELECT current_vote_id FROM sessions WHERE id = $1', [sessionId])
        const voteId = sessionRes.rows[0]?.current_vote_id
        if (!voteId) return
        await pool.query('UPDATE votes SET status = $1 WHERE id = $2', ['closed', voteId])
        const voteInfo = await pool.query('SELECT * FROM votes WHERE id = $1', [voteId])
        const vote = voteInfo.rows[0]
        const options = typeof vote.options === 'string' ? JSON.parse(vote.options) : vote.options
        const responses = await pool.query('SELECT option_index, player_name FROM vote_responses WHERE vote_id = $1', [voteId])
        const results = options.map((_, i) => responses.rows.filter(r => r.option_index === i).length)
        const totalPlayers = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
        const voterNames = responses.rows.map(r => ({ name: r.player_name, optionIndex: r.option_index }))
        const voteUpdate = {
          id: voteId, question: vote.question, options, isAnonymous: vote.is_anonymous,
          results, totalPlayers: totalPlayers.rows[0].total, totalVotes: responses.rows.length, voterNames
        }
        io.to(`tv:${sessionId}`).emit('vote-closed', voteUpdate)
        io.to(`session:${sessionId}`).emit('vote-closed', voteUpdate)
        io.to(`admin:${sessionId}`).emit('vote-closed', voteUpdate)
      } catch (err) { console.error(err) }
    })

    // ── Admin: show image on TV ─────────────────────────────────────────────
    socket.on('show-image', async ({ sessionId, imageUrl }) => {
      if (!socket.admin) return
      try {
        await pool.query('UPDATE sessions SET tv_mode = $1, current_image_url = $2 WHERE id = $3 AND created_by = $4', ['image', imageUrl, sessionId, socket.admin.id])
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'image', imageUrl })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'image', imageUrl })
      } catch (err) { console.error(err) }
    })

    // ── Admin: send message ─────────────────────────────────────────────────
    socket.on('send-message', async ({ sessionId, toPlayerId, type, content, voiceStyle, textEffect, authorName }) => {
      if (!socket.admin) return
      try {
        if (!toPlayerId) {
          const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
          if ((cnt.rows[0]?.total || 0) === 0) { socket.emit('send-error', { message: 'Aucun joueur connecté.' }); return }
        }
        const fromName = (authorName && authorName.trim()) ? authorName.trim() : socket.admin.username
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

    // ── Admin: create merchant ──────────────────────────────────────────────
    socket.on('create-merchant', async ({ sessionId, name, description, items }) => {
      if (!socket.admin) return
      try {
        const mr = await pool.query(
          'INSERT INTO merchants (session_id, name, description) VALUES ($1, $2, $3) RETURNING *',
          [sessionId, name, description || '']
        )
        const merchant = mr.rows[0]
        for (const item of (items || [])) {
          await pool.query(
            'INSERT INTO merchant_items (merchant_id, name, description, price, stock, category) VALUES ($1, $2, $3, $4, $5, $6)',
            [merchant.id, item.name, item.description || '', item.price, item.stock ?? -1, item.category || 'Divers']
          )
        }
        const merchantData = await getMerchantData(merchant.id)
        socket.emit('merchant-created', merchantData)
      } catch (err) { console.error(err) }
    })

    // ── Admin: show merchant on TV ──────────────────────────────────────────
    socket.on('show-merchant', async ({ sessionId, merchantId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_merchant_id = $2 WHERE id = $3 AND created_by = $4',
          ['merchant', merchantId, sessionId, socket.admin.id]
        )
        const merchantData = await getMerchantData(merchantId)
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'merchant', merchantData })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'merchant', merchantData })
        io.to(`session:${sessionId}`).emit('merchant-shown', merchantData)
      } catch (err) { console.error(err) }
    })

    // ── Player: request purchase (single item, legacy) ──────────────────────
    socket.on('request-purchase', async ({ itemId, quantity }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const itemRes = await pool.query('SELECT * FROM merchant_items WHERE id = $1', [itemId])
        const item = itemRes.rows[0]
        if (!item) { socket.emit('purchase-error', { message: 'Objet introuvable.' }); return }
        const qty = Math.max(1, parseInt(quantity) || 1)
        if (item.stock !== -1 && item.stock < qty) {
          socket.emit('purchase-error', { message: 'Stock insuffisant.' }); return
        }
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        const pr = await pool.query(
          'INSERT INTO purchase_requests (session_id, merchant_id, item_id, player_id, player_name, quantity, base_price, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [socket.sessionId, item.merchant_id, itemId, socket.playerId, playerName, qty, item.price * qty, 'pending']
        )
        const request = pr.rows[0]
        const requestData = {
          id: request.id, item_id: itemId, item_name: item.name, quantity: qty,
          base_price: request.base_price, player_name: playerName, player_id: socket.playerId,
        }
        io.to(`admin:${socket.sessionId}`).emit('purchase-request', requestData)
        socket.emit('purchase-requested', { requestId: request.id, itemId, itemName: item.name })
      } catch (err) { console.error(err) }
    })

    // ── Player: request batch purchase (cart) ───────────────────────────────
    socket.on('request-batch-purchase', async ({ items }) => {
      if (!socket.playerId || !socket.sessionId) return
      if (!Array.isArray(items) || items.length === 0) {
        socket.emit('purchase-error', { message: 'Panier vide.' }); return
      }
      try {
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        const batchId = crypto.randomUUID()
        const batchItems = []
        let totalPrice = 0
        let merchantId = null
        for (const { itemId, quantity } of items) {
          const itemRes = await pool.query('SELECT * FROM merchant_items WHERE id = $1', [itemId])
          const item = itemRes.rows[0]
          if (!item) continue
          const qty = Math.max(1, parseInt(quantity) || 1)
          if (item.stock !== -1 && item.stock < qty) continue
          const linePrice = item.price * qty
          totalPrice += linePrice
          merchantId = item.merchant_id
          const pr = await pool.query(
            'INSERT INTO purchase_requests (session_id, merchant_id, item_id, player_id, player_name, quantity, base_price, status, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [socket.sessionId, item.merchant_id, itemId, socket.playerId, playerName, qty, linePrice, 'pending', batchId]
          )
          batchItems.push({
            request_id: pr.rows[0].id,
            item_id: itemId,
            item_name: item.name,
            quantity: qty,
            unit_price: item.price,
            total_price: linePrice,
          })
        }
        if (batchItems.length === 0) {
          socket.emit('purchase-error', { message: 'Aucun article disponible dans votre panier.' }); return
        }
        const requestData = {
          batch_id: batchId,
          merchant_id: merchantId,
          player_name: playerName,
          player_id: socket.playerId,
          items: batchItems,
          total_price: totalPrice,
        }
        io.to(`admin:${socket.sessionId}`).emit('purchase-request', requestData)
        socket.emit('purchase-requested', { batchId, items: batchItems })
      } catch (err) { console.error(err); socket.emit('purchase-error', { message: 'Erreur lors de la demande.' }) }
    })

    // ── Admin: respond to purchase (single legacy item) ─────────────────────
    socket.on('respond-purchase', async ({ requestId, action, finalPrice }) => {
      if (!socket.admin) return
      try {
        const reqRes = await pool.query(
          `SELECT pr.*, mi.stock AS item_stock, mi.name AS item_name
           FROM purchase_requests pr JOIN merchant_items mi ON pr.item_id = mi.id
           WHERE pr.id = $1`,
          [requestId]
        )
        const req = reqRes.rows[0]
        if (!req || req.status !== 'pending') return
        const playerSocketRes = await pool.query('SELECT socket_id FROM players WHERE id = $1', [req.player_id])
        const playerSocketId = playerSocketRes.rows[0]?.socket_id

        if (action === 'accept') {
          if (req.item_stock !== -1) {
            await pool.query(
              'UPDATE merchant_items SET stock = GREATEST(0, stock - $1) WHERE id = $2',
              [req.quantity, req.item_id]
            )
          }
          await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', ['accepted', req.base_price, requestId])
          const items = [{ item_name: req.item_name, quantity: req.quantity, total_price: req.base_price }]
          if (playerSocketId) io.to(playerSocketId).emit('batch-accepted', { items, totalPrice: req.base_price })
          const merchantData = await getMerchantData(req.merchant_id)
          socket.emit('merchant-updated', merchantData)
          io.to(`tv:${req.session_id}`).emit('merchant-items-updated', merchantData)
          io.to(`session:${req.session_id}`).emit('merchant-items-updated', merchantData)
        } else if (action === 'discount' || action === 'increase') {
          const fp = Math.max(0, parseInt(finalPrice) || req.base_price)
          await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', [action, fp, requestId])
          if (playerSocketId) io.to(playerSocketId).emit('purchase-counter-offer', { requestId, action, finalPrice: fp, itemName: req.item_name })
        } else if (action === 'reject') {
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['rejected', requestId])
          const items = [{ item_name: req.item_name, quantity: req.quantity, total_price: req.base_price }]
          if (playerSocketId) io.to(playerSocketId).emit('batch-rejected', { items })
        }
        socket.emit('purchase-responded', { requestId, action })
      } catch (err) { console.error(err) }
    })

    // ── Admin: respond to batch purchase ────────────────────────────────────
    socket.on('respond-batch-purchase', async ({ batchId, action }) => {
      if (!socket.admin) return
      try {
        const reqsRes = await pool.query(
          `SELECT pr.*, mi.stock AS item_stock, mi.name AS item_name
           FROM purchase_requests pr JOIN merchant_items mi ON pr.item_id = mi.id
           WHERE pr.batch_id = $1 AND pr.status = 'pending'`,
          [batchId]
        )
        const reqs = reqsRes.rows
        if (reqs.length === 0) return
        const playerSocketRes = await pool.query('SELECT socket_id FROM players WHERE id = $1', [reqs[0].player_id])
        const playerSocketId = playerSocketRes.rows[0]?.socket_id

        if (action === 'accept') {
          let totalFinal = 0
          for (const req of reqs) {
            if (req.item_stock !== -1) {
              await pool.query('UPDATE merchant_items SET stock = GREATEST(0, stock - $1) WHERE id = $2', [req.quantity, req.item_id])
            }
            await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', ['accepted', req.base_price, req.id])
            totalFinal += req.base_price
          }
          const items = reqs.map(r => ({ item_name: r.item_name, quantity: r.quantity, total_price: r.base_price }))
          if (playerSocketId) io.to(playerSocketId).emit('batch-accepted', { batchId, items, totalPrice: totalFinal })
          const merchantData = await getMerchantData(reqs[0].merchant_id)
          socket.emit('merchant-updated', merchantData)
          io.to(`tv:${reqs[0].session_id}`).emit('merchant-items-updated', merchantData)
          io.to(`session:${reqs[0].session_id}`).emit('merchant-items-updated', merchantData)
        } else if (action === 'reject') {
          for (const req of reqs) {
            await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['rejected', req.id])
          }
          const items = reqs.map(r => ({ item_name: r.item_name, quantity: r.quantity, total_price: r.base_price }))
          if (playerSocketId) io.to(playerSocketId).emit('batch-rejected', { batchId, items })
        }
        socket.emit('purchase-responded', { batchId, action })
      } catch (err) { console.error(err) }
    })

    // ── Admin: close merchant ────────────────────────────────────────────────
    socket.on('close-merchant', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          "UPDATE sessions SET tv_mode = 'lobby', current_merchant_id = NULL WHERE id = $1 AND created_by = $2",
          [sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
        io.to(`session:${sessionId}`).emit('merchant-closed')
      } catch (err) { console.error(err) }
    })

    // ── Player: respond to counter offer ────────────────────────────────────
    socket.on('respond-counter-offer', async ({ requestId, accept }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const reqRes = await pool.query(
          `SELECT pr.*, mi.stock AS item_stock
           FROM purchase_requests pr JOIN merchant_items mi ON pr.item_id = mi.id
           WHERE pr.id = $1 AND pr.player_id = $2`,
          [requestId, socket.playerId]
        )
        const req = reqRes.rows[0]
        if (!req || !['discount', 'increase'].includes(req.status)) return

        if (accept) {
          if (req.item_stock !== -1) {
            await pool.query(
              'UPDATE merchant_items SET stock = GREATEST(0, stock - $1) WHERE id = $2',
              [req.quantity, req.item_id]
            )
          }
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['accepted', requestId])
          socket.emit('counter-offer-result', { requestId, accepted: true, itemName: req.item_name, finalPrice: req.final_price })
          const merchantData = await getMerchantData(req.merchant_id)
          io.to(`admin:${socket.sessionId}`).emit('merchant-updated', merchantData)
          io.to(`tv:${socket.sessionId}`).emit('merchant-items-updated', merchantData)
          io.to(`session:${socket.sessionId}`).emit('merchant-items-updated', merchantData)
        } else {
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['declined', requestId])
          socket.emit('counter-offer-result', { requestId, accepted: false, itemName: req.item_name })
        }
        io.to(`admin:${socket.sessionId}`).emit('counter-offer-response', { requestId, accepted: accept, playerName: req.player_name })
      } catch (err) { console.error(err) }
    })
  })
}

module.exports = setupSocket
