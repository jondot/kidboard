import { describe, it, expect } from 'vitest'

describe('scaffold', () => {
  it('runs typescript and vitest', () => {
    const x: number = 1 + 1
    expect(x).toBe(2)
  })

  it('has a dom', () => {
    expect(typeof document).toBe('object')
  })
})
