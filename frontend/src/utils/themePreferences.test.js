import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getThemePreference, setThemePreference, applyTheme } from './themePreferences.js'

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value) }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  document.head.innerHTML = ''
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  document.head.appendChild(meta)
})

describe('themePreferences', () => {
  it('returns fallback for missing scope', () => {
    expect(getThemePreference('player')).toBe('dark')
    expect(getThemePreference('player', 'light')).toBe('light')
  })

  it('stores and retrieves a valid theme per scope', () => {
    setThemePreference('player', 'light')
    setThemePreference('admin', 'dark')
    expect(getThemePreference('player')).toBe('light')
    expect(getThemePreference('admin')).toBe('dark')
  })

  it('ignores invalid themes', () => {
    setThemePreference('tv', 'blue')
    expect(getThemePreference('tv')).toBe('dark')
  })

  it('applies theme on document and updates theme-color meta', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#f5f1e8')
  })
})
