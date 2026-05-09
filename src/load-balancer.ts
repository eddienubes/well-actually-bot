export type LoadBalancerCooldownItem<T> = {
  cooldownEndsAt: Date
  cause: unknown
  value: T
}

export class LoadBalancer<T> {
  private queue: T[] = []
  private cooldownItems: LoadBalancerCooldownItem<T>[] = []

  constructor(items: T[]) {
    this.queue.push(...items)
  }

  useHealthy(): T | null {
    this.refreshCooldownItems()
    const item = this.queue.shift() || null
    if (item) {
      this.queue.push(item)
    }
    return item
  }

  cooldown(predicate: (item: T) => boolean, cooldownMs: number, cause?: unknown): void {
    this.queue = this.queue.filter((item) => {
      if (predicate(item)) {
        this.cooldownItems.push({
          value: item as T,
          cooldownEndsAt: new Date(new Date().getTime() + cooldownMs),
          cause,
        })
        return false
      }
      return true
    })
    this.refreshCooldownItems()
  }

  private refreshCooldownItems(): void {
    const now = new Date()
    this.cooldownItems = this.cooldownItems.filter((item) => {
      if (item.cooldownEndsAt < now) {
        this.queue.push(item.value)
        return false
      }
      return true
    })
  }
}
