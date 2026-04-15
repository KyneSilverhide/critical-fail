import { io } from 'socket.io-client'

const BACKEND_URL = window.__RUNTIME_CONFIG__.VITE_BACKEND_URL

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
