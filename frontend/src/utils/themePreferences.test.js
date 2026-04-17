import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getThemePreference, setThemePreference } from './themePreferences.js'

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
})
