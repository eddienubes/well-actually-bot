import { and, eq, gt, lt } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { cacheTable } from '../db/schema'

export class CacheDao {
  private readonly db: BunSQLiteDatabase

  constructor(db: BunSQLiteDatabase) {
    this.db = db
  }

  get(hash: string): string | null {
    const [row] = this.db
      .select({ value: cacheTable.value })
      .from(cacheTable)
      .where(and(eq(cacheTable.hash, hash), gt(cacheTable.expiresAt, new Date())))
      .all()
    return row?.value ?? null
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
    const deleted = this.db
      .delete(cacheTable)
      .where(lt(cacheTable.expiresAt, new Date()))
      .returning({ id: cacheTable.id })
      .all()
    return deleted.length
  }
}
