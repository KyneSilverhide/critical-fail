import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAllProfiles, getProfile, saveProfile, removeProfile } from './playerProfiles.js'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value) }),
    removeItem: vi.fn((key) => { delete store[key] }),
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

describe('getAllProfiles', () => {
  it('returns empty object when nothing stored', () => {
    expect(getAllProfiles()).toEqual({})
  })

  it('returns parsed profiles from localStorage', () => {
    const data = { gandalf: { dndClass: 'Magicien', avatarUrl: null, displayName: 'Gandalf' } }
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(data))
    expect(getAllProfiles()).toEqual(data)
  })

  it('returns empty object on invalid JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-json{{{')
    expect(getAllProfiles()).toEqual({})
  })
})

describe('getProfile', () => {
  it('returns null for empty name', () => {
    expect(getProfile('')).toBeNull()
    expect(getProfile(null)).toBeNull()
  })

  it('returns null when profile not found', () => {
    expect(getProfile('unknown')).toBeNull()
  })

  it('looks up by lowercase key', () => {
    saveProfile('Gandalf', { dndClass: 'Magicien', avatarUrl: '/uploads/av.jpg' })
    expect(getProfile('GANDALF')).not.toBeNull()
    expect(getProfile('gandalf')).not.toBeNull()
    expect(getProfile('Gandalf')).not.toBeNull()
  })

  it('returns the stored profile data', () => {
    saveProfile('Aragorn', { dndClass: 'Guerrier', avatarUrl: null })
    const profile = getProfile('Aragorn')
    expect(profile).toMatchObject({ dndClass: 'Guerrier', avatarUrl: null, displayName: 'Aragorn' })
  })
})

describe('saveProfile', () => {
  it('does nothing for empty name', () => {
    saveProfile('', { dndClass: 'Barde', avatarUrl: null })
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('saves a new profile', () => {
    saveProfile('Legolas', { dndClass: 'Rôdeur', avatarUrl: '/uploads/elf.png' })
    const profile = getProfile('Legolas')
    expect(profile?.dndClass).toBe('Rôdeur')
    expect(profile?.avatarUrl).toBe('/uploads/elf.png')
    expect(profile?.displayName).toBe('Legolas')
  })

  it('overwrites an existing profile', () => {
    saveProfile('Thorin', { dndClass: 'Guerrier', avatarUrl: null })
    saveProfile('Thorin', { dndClass: 'Barbare', avatarUrl: '/uploads/dwarf.jpg' })
    const profile = getProfile('Thorin')
    expect(profile?.dndClass).toBe('Barbare')
    expect(profile?.avatarUrl).toBe('/uploads/dwarf.jpg')
  })

  it('stores multiple profiles independently', () => {
    saveProfile('Alice', { dndClass: 'Clerc', avatarUrl: null })
    saveProfile('Bob', { dndClass: 'Moine', avatarUrl: null })
    expect(getProfile('Alice')?.dndClass).toBe('Clerc')
    expect(getProfile('Bob')?.dndClass).toBe('Moine')
  })

  it('handles missing optional fields gracefully', () => {
    saveProfile('Frodo', {})
    const profile = getProfile('Frodo')
    expect(profile?.dndClass).toBe('')
    expect(profile?.avatarUrl).toBeNull()
  })

  it('trims whitespace from the name', () => {
    saveProfile('  Sam  ', { dndClass: 'Rôdeur', avatarUrl: null })
    expect(getProfile('Sam')).not.toBeNull()
    expect(getProfile('  Sam  ')).not.toBeNull()
  })
})

describe('removeProfile', () => {
  it('does nothing for empty name', () => {
    removeProfile('')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('removes a stored profile', () => {
    saveProfile('Bilbo', { dndClass: 'Roublard', avatarUrl: null })
    expect(getProfile('Bilbo')).not.toBeNull()
    removeProfile('Bilbo')
    expect(getProfile('Bilbo')).toBeNull()
  })

  it('does not affect other profiles', () => {
    saveProfile('Gimli', { dndClass: 'Guerrier', avatarUrl: null })
    saveProfile('Legolas', { dndClass: 'Rôdeur', avatarUrl: null })
    removeProfile('Gimli')
    expect(getProfile('Gimli')).toBeNull()
    expect(getProfile('Legolas')).not.toBeNull()
  })
})
