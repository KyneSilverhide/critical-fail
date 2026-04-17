const STORAGE_KEY = 'cf_theme_preferences'
const VALID_THEMES = new Set(['dark', 'light'])

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function normalizeScope(scope) {
  return String(scope || '').trim().toLowerCase()
}

export function getThemePreference(scope, fallback = 'dark') {
  const safeScope = normalizeScope(scope)
  if (!safeScope) return fallback
  const all = readAll()
  const value = all[safeScope]
  return VALID_THEMES.has(value) ? value : fallback
}

export function setThemePreference(scope, theme) {
  const safeScope = normalizeScope(scope)
  if (!safeScope || !VALID_THEMES.has(theme)) return
  const all = readAll()
  all[safeScope] = theme
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage may be full or unavailable
  }
}
