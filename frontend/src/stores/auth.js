import { reactive } from 'vue'

const stored = localStorage.getItem('auth')
const initial = stored ? JSON.parse(stored) : { token: null, admin: null }

export const authStore = reactive({
  token: initial.token,
  admin: initial.admin,

  login(token, admin) {
    this.token = token
    this.admin = admin
    localStorage.setItem('auth', JSON.stringify({ token, admin }))
  },

  logout() {
    this.token = null
    this.admin = null
    localStorage.removeItem('auth')
  }
})
