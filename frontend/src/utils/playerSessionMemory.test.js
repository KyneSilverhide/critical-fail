import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAllLastKnownPlayers, getLastKnownPlayer, saveLastKnownPlayer, removeLastKnownPlayer } from './playerSessionMemory.js'

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

describe('playerSessionMemory', () => {
  it('returns empty object when storage is empty', () => {
    expect(getAllLastKnownPlayers()).toEqual({})
  })

  it('saves and reads a player by session code', () => {
    saveLastKnownPlayer('AbCd1234', { name: 'Gandalf', ac: 14, hp: 27, dndClass: 'Magicien', avatarUrl: '/uploads/g.jpg' })
    expect(getLastKnownPlayer('abcd1234')).toMatchObject({
      name: 'Gandalf',
      ac: 14,
      hp: 27,
      dndClass: 'Magicien',
      avatarUrl: '/uploads/g.jpg',
    })
  })

  it('ignores invalid payloads', () => {
    saveLastKnownPlayer('', { name: 'A' })
    saveLastKnownPlayer('1234', { name: '' })
    expect(getAllLastKnownPlayers()).toEqual({})
  })

  it('removes a saved player by session code', () => {
    saveLastKnownPlayer('1234', { name: 'Aragorn', ac: 16, hp: 35 })
    expect(getLastKnownPlayer('1234')).not.toBeNull()
    removeLastKnownPlayer('1234')
    expect(getLastKnownPlayer('1234')).toBeNull()
  })
})
