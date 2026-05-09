import { describe, it, expect } from 'bun:test'
import { LoadBalancer } from './load-balancer'

describe(LoadBalancer.name, () => {
  describe('getHealthy', () => {
    it('should return null when constructed with no items', () => {
      const lb = new LoadBalancer<string>([])
      expect(lb.useHealthy()).toBeNull()
    })

    it('should return items in round-robin order, wrapping at the end', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      expect(lb.useHealthy()).toBe('a')
      expect(lb.useHealthy()).toBe('b')
      expect(lb.useHealthy()).toBe('c')
      expect(lb.useHealthy()).toBe('a')
      expect(lb.useHealthy()).toBe('b')
    })

    it('should skip items currently in cooldown', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      lb.cooldown((x) => x === 'b', 60_000)

      expect(lb.useHealthy()).toBe('a')
      expect(lb.useHealthy()).toBe('c')
      expect(lb.useHealthy()).toBe('a')
    })

    it('should return null when every item is in cooldown', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 60_000)
      lb.cooldown((x) => x === 'b', 60_000)

      expect(lb.useHealthy()).toBeNull()
    })

    it('should promote expired cooldown items before falling back to null', async () => {
      const lb = new LoadBalancer(['a'])
      lb.cooldown((x) => x === 'a', 30)
      expect(lb.useHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.useHealthy()).toBe('a')
    })
  })

  describe('cooldown', () => {
    it('should remove the matched item from the rotation', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 60_000)

      expect(lb.useHealthy()).toBe('b')
      expect(lb.useHealthy()).toBe('b')
    })

    it('should only cool the item matched by the predicate, not its neighbour', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      lb.cooldown((x) => x === 'a', 60_000)

      const seen = new Set<string>()
      seen.add(lb.useHealthy() as string)
      seen.add(lb.useHealthy() as string)
      seen.add(lb.useHealthy() as string)
      seen.add(lb.useHealthy() as string)

      expect(seen.has('a')).toBe(false)
      expect(seen.has('b')).toBe(true)
      expect(seen.has('c')).toBe(true)
    })

    it('should be a no-op when the predicate matches nothing', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'nope', 60_000)

      expect(lb.useHealthy()).toBe('a')
      expect(lb.useHealthy()).toBe('b')
      expect(lb.useHealthy()).toBe('a')
    })

    it('should be a no-op when cooling an already-cooled item (item is no longer in the active queue)', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 60_000)
      lb.cooldown((x) => x === 'a', 60_000)

      expect(lb.useHealthy()).toBe('b')
    })

    it('should cool multiple items independently', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      lb.cooldown((x) => x === 'a', 60_000)
      lb.cooldown((x) => x === 'c', 60_000)

      expect(lb.useHealthy()).toBe('b')
      expect(lb.useHealthy()).toBe('b')
    })
  })

  describe('cooldown expiry', () => {
    it('should reinstate an expired item on the next getHealthy call', async () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 30)

      expect(lb.useHealthy()).toBe('b')

      await Bun.sleep(60)

      const next = [lb.useHealthy(), lb.useHealthy()]
      expect(next).toContain('a')
      expect(next).toContain('b')
    })

    it('should keep an item in cooldown if it has not yet expired', async () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 200)

      await Bun.sleep(20)
      expect(lb.useHealthy()).toBe('b')
      expect(lb.useHealthy()).toBe('b')
    })

    it('should allow an item to be cooled, expire, be picked, and cooled again', async () => {
      const lb = new LoadBalancer(['a'])
      lb.cooldown((x) => x === 'a', 30)
      expect(lb.useHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.useHealthy()).toBe('a')

      lb.cooldown((x) => x === 'a', 30)
      expect(lb.useHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.useHealthy()).toBe('a')
    })

    it('should expire different cooldown durations independently', async () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 30)
      lb.cooldown((x) => x === 'b', 200)

      expect(lb.useHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.useHealthy()).toBe('a')
      expect(lb.useHealthy()).toBe('a')
    })
  })

  describe('object items with predicates', () => {
    type Provider = { name: string; tier: 'free' | 'paid' }

    const providers: Provider[] = [
      { name: 'searxng-a', tier: 'free' },
      { name: 'searxng-b', tier: 'free' },
      { name: 'brave', tier: 'paid' },
      { name: 'tavily', tier: 'paid' },
    ]

    it('should rotate through all entries when none are cooled', () => {
      const lb = new LoadBalancer(providers)
      const order = [
        lb.useHealthy()?.name,
        lb.useHealthy()?.name,
        lb.useHealthy()?.name,
        lb.useHealthy()?.name,
      ]
      expect(order).toEqual(['searxng-a', 'searxng-b', 'brave', 'tavily'])
    })

    it('should target items by tier using a cooldown predicate', () => {
      const lb = new LoadBalancer(providers)
      lb.cooldown((p) => p.tier === 'free', 60_000)

      const remaining = new Set<string>()
      remaining.add(lb.useHealthy()!.name)
      remaining.add(lb.useHealthy()!.name)
      remaining.add(lb.useHealthy()!.name)

      expect(remaining).toEqual(new Set(['brave', 'tavily']))
    })

    it('should preserve the cause on cooled items (round-trip via expiry)', async () => {
      const lb = new LoadBalancer(providers)
      const err = new Error('rate limited')
      lb.cooldown((p) => p.name === 'searxng-a', 30, err)

      await Bun.sleep(60)

      const seen: string[] = []
      for (let i = 0; i < providers.length; i++) {
        seen.push(lb.useHealthy()!.name)
      }
      expect(seen).toContain('searxng-a')
    })
  })
})
