import { describe, it, expect } from 'bun:test'
import { LoadBalancer } from './load-balancer'

describe(LoadBalancer.name, () => {
  describe('getHealthy', () => {
    it('should return null when constructed with no items', () => {
      const lb = new LoadBalancer<string>([])
      expect(lb.getHealthy()).toBeNull()
    })

    it('should return items in round-robin order, wrapping at the end', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      expect(lb.getHealthy()).toBe('a')
      expect(lb.getHealthy()).toBe('b')
      expect(lb.getHealthy()).toBe('c')
      expect(lb.getHealthy()).toBe('a')
      expect(lb.getHealthy()).toBe('b')
    })

    it('should skip items currently in cooldown', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      lb.cooldown((x) => x === 'b', 60_000)

      expect(lb.getHealthy()).toBe('a')
      expect(lb.getHealthy()).toBe('c')
      expect(lb.getHealthy()).toBe('a')
    })

    it('should return null when every item is in cooldown', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 60_000)
      lb.cooldown((x) => x === 'b', 60_000)

      expect(lb.getHealthy()).toBeNull()
    })

    it('should promote expired cooldown items before falling back to null', async () => {
      const lb = new LoadBalancer(['a'])
      lb.cooldown((x) => x === 'a', 30)
      expect(lb.getHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.getHealthy()).toBe('a')
    })
  })

  describe('cooldown', () => {
    it('should remove the matched item from the rotation', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 60_000)

      expect(lb.getHealthy()).toBe('b')
      expect(lb.getHealthy()).toBe('b')
    })

    it('should only cool the item matched by the predicate, not its neighbour', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      lb.cooldown((x) => x === 'a', 60_000)

      const seen = new Set<string>()
      seen.add(lb.getHealthy() as string)
      seen.add(lb.getHealthy() as string)
      seen.add(lb.getHealthy() as string)
      seen.add(lb.getHealthy() as string)

      expect(seen.has('a')).toBe(false)
      expect(seen.has('b')).toBe(true)
      expect(seen.has('c')).toBe(true)
    })

    it('should be a no-op when the predicate matches nothing', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'nope', 60_000)

      expect(lb.getHealthy()).toBe('a')
      expect(lb.getHealthy()).toBe('b')
      expect(lb.getHealthy()).toBe('a')
    })

    it('should be a no-op when cooling an already-cooled item (item is no longer in the active queue)', () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 60_000)
      lb.cooldown((x) => x === 'a', 60_000)

      expect(lb.getHealthy()).toBe('b')
    })

    it('should cool multiple items independently', () => {
      const lb = new LoadBalancer(['a', 'b', 'c'])
      lb.cooldown((x) => x === 'a', 60_000)
      lb.cooldown((x) => x === 'c', 60_000)

      expect(lb.getHealthy()).toBe('b')
      expect(lb.getHealthy()).toBe('b')
    })
  })

  describe('cooldown expiry', () => {
    it('should reinstate an expired item on the next getHealthy call', async () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 30)

      expect(lb.getHealthy()).toBe('b')

      await Bun.sleep(60)

      const next = [lb.getHealthy(), lb.getHealthy()]
      expect(next).toContain('a')
      expect(next).toContain('b')
    })

    it('should keep an item in cooldown if it has not yet expired', async () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 200)

      await Bun.sleep(20)
      expect(lb.getHealthy()).toBe('b')
      expect(lb.getHealthy()).toBe('b')
    })

    it('should allow an item to be cooled, expire, be picked, and cooled again', async () => {
      const lb = new LoadBalancer(['a'])
      lb.cooldown((x) => x === 'a', 30)
      expect(lb.getHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.getHealthy()).toBe('a')

      lb.cooldown((x) => x === 'a', 30)
      expect(lb.getHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.getHealthy()).toBe('a')
    })

    it('should expire different cooldown durations independently', async () => {
      const lb = new LoadBalancer(['a', 'b'])
      lb.cooldown((x) => x === 'a', 30)
      lb.cooldown((x) => x === 'b', 200)

      expect(lb.getHealthy()).toBeNull()

      await Bun.sleep(60)
      expect(lb.getHealthy()).toBe('a')
      expect(lb.getHealthy()).toBe('a')
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
        lb.getHealthy()?.name,
        lb.getHealthy()?.name,
        lb.getHealthy()?.name,
        lb.getHealthy()?.name,
      ]
      expect(order).toEqual(['searxng-a', 'searxng-b', 'brave', 'tavily'])
    })

    it('should target items by tier using a cooldown predicate', () => {
      const lb = new LoadBalancer(providers)
      lb.cooldown((p) => p.tier === 'free', 60_000)

      const remaining = new Set<string>()
      remaining.add(lb.getHealthy()!.name)
      remaining.add(lb.getHealthy()!.name)
      remaining.add(lb.getHealthy()!.name)

      expect(remaining).toEqual(new Set(['brave', 'tavily']))
    })

    it('should preserve the cause on cooled items (round-trip via expiry)', async () => {
      const lb = new LoadBalancer(providers)
      const err = new Error('rate limited')
      lb.cooldown((p) => p.name === 'searxng-a', 30, err)

      await Bun.sleep(60)

      const seen: string[] = []
      for (let i = 0; i < providers.length; i++) {
        seen.push(lb.getHealthy()!.name)
      }
      expect(seen).toContain('searxng-a')
    })
  })
})
