import { reactive } from 'vue'

export const sessionStore = reactive({
  activeSession: null,
  sessions: [],
  players: [],
  messages: [],

  setActiveSession(session) {
    this.activeSession = session
    this.players = []
    this.messages = []
  },

  addPlayer(player) {
    const idx = this.players.findIndex(p => p.id === player.id)
    if (idx === -1) this.players.push(player)
    else this.players[idx] = player
  },

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId)
  },

  addMessage(msg) {
    this.messages.push(msg)
  },

  setSessions(sessions) {
    this.sessions = sessions
  }
})
