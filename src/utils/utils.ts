/**
 * A helper class to quickly build a disposable instance. An example use-case is database connections.
 */
export class DisposableOf<T> implements Disposable, AsyncDisposable {
  disposed = false
  value: T
  private onDispose: (data: T) => void | Promise<void>

  constructor(value: T, onDispose: (data: T) => void | Promise<void>) {
    this.value = value
    this.onDispose = onDispose
  }

  /**
   * A consumer-friendly alias to [Symbol.dispose]
   */
  dispose(): void {
    this[Symbol.dispose]()
  }

  [Symbol.dispose](): void {
    if (!this.disposed) {
      this.onDispose(this.value)
      this.disposed = true
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.disposed) {
      await this.onDispose(this.value)
      this.disposed = true
    }
  }
}
