import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

let socket = null

export function getSocket(token = null) {
  if (!socket) {
    socket = io(BACKEND_URL, { auth: { token } })
  }
  return socket
}

export function resetSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
