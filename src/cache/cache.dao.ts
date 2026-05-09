import { eq, lt } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { cacheTable } from '../db/schema'

export class CacheDao {
  constructor(private readonly db: BunSQLiteDatabase) {}

  get(hash: string): string | null {
    const [row] = this.db
      .select()
      .from(cacheTable)
      .where(eq(cacheTable.hash, hash))
      .limit(1)
      .all()
    if (!row) return null
    if (row.expiresAt.getTime() <= Date.now()) {
      this.delete(hash)
      return null
    }
    return row.value
  }

  set(hash: string, value: string, ttlMs: number): void {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlMs)
    this.db
      .insert(cacheTable)
      .values({ hash, value, expiresAt, updatedAt: now })
      .onConflictDoUpdate({
        target: cacheTable.hash,
        set: { value, expiresAt, updatedAt: now },
      })
      .run()
  }

  delete(hash: string): void {
    this.db.delete(cacheTable).where(eq(cacheTable.hash, hash)).run()
  }

  purgeExpired(): number {
    const result = this.db
      .delete(cacheTable)
      .where(lt(cacheTable.expiresAt, new Date()))
      .run()
    return result.changes
  }
}
