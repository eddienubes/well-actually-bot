import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { CacheDao } from './cache.dao'

describe(CacheDao.name, () => {
  let sqlite: Database
  let db: BunSQLiteDatabase
  let dao: CacheDao

  beforeEach(() => {
    sqlite = new Database(':memory:')
    db = drizzle(sqlite)
    migrate(db, { migrationsFolder: './drizzle' })
    dao = new CacheDao(db)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('get', () => {
    it('should return null for an unknown key', () => {
      expect(dao.get('missing')).toBeNull()
    })

    it('should return the stored value for a fresh key', () => {
      dao.set('k', 'v', 60_000)
      expect(dao.get('k')).toBe('v')
    })

    it('should return null and evict the row when the entry has expired', async () => {
      dao.set('k', 'v', 30)
      await Bun.sleep(60)

      expect(dao.get('k')).toBeNull()

      const remaining = sqlite.query('SELECT 1 FROM cache WHERE hash = ?').all('k')
      expect(remaining).toHaveLength(0)
    })
  })

  describe('set', () => {
    it('should overwrite the value on a duplicate hash without throwing', () => {
      dao.set('k', 'first', 60_000)
      dao.set('k', 'second', 60_000)
      expect(dao.get('k')).toBe('second')
    })

    it('should refresh the expiry when overwriting an entry', async () => {
      dao.set('k', 'old', 30)
      await Bun.sleep(20)
      dao.set('k', 'new', 60_000)

      await Bun.sleep(40)
      expect(dao.get('k')).toBe('new')
    })

    it('should bump updatedAt on overwrite while keeping createdAt stable', async () => {
      dao.set('k', 'first', 60_000)
      const initial = sqlite
        .query<{ createdAt: number; updatedAt: number }, [string]>(
          'SELECT createdAt, updatedAt FROM cache WHERE hash = ?',
        )
        .get('k')
      expect(initial).not.toBeNull()

      await Bun.sleep(10)
      dao.set('k', 'second', 60_000)

      const after = sqlite
        .query<{ createdAt: number; updatedAt: number }, [string]>(
          'SELECT createdAt, updatedAt FROM cache WHERE hash = ?',
        )
        .get('k')!

      expect(after.createdAt).toBe(initial!.createdAt)
      expect(after.updatedAt).toBeGreaterThanOrEqual(initial!.updatedAt)
    })

    it('should keep entries with distinct hashes independent', () => {
      dao.set('a', '1', 60_000)
      dao.set('b', '2', 60_000)
      expect(dao.get('a')).toBe('1')
      expect(dao.get('b')).toBe('2')
    })
  })

  describe('delete', () => {
    it('should remove the entry for the given hash', () => {
      dao.set('k', 'v', 60_000)
      dao.delete('k')
      expect(dao.get('k')).toBeNull()
    })

    it('should be a no-op when the hash does not exist', () => {
      expect(() => dao.delete('missing')).not.toThrow()
    })

    it('should not affect other entries', () => {
      dao.set('a', '1', 60_000)
      dao.set('b', '2', 60_000)
      dao.delete('a')
      expect(dao.get('a')).toBeNull()
      expect(dao.get('b')).toBe('2')
    })
  })

  describe('purgeExpired', () => {
    it('should delete only expired entries and report the count', async () => {
      dao.set('fresh', 'a', 60_000)
      dao.set('stale', 'b', 30)
      await Bun.sleep(60)

      expect(dao.purgeExpired()).toBe(1)
      expect(dao.get('fresh')).toBe('a')
      expect(dao.get('stale')).toBeNull()
    })

    it('should return 0 when nothing is expired', () => {
      dao.set('a', '1', 60_000)
      dao.set('b', '2', 60_000)
      expect(dao.purgeExpired()).toBe(0)
    })

    it('should return 0 on an empty table', () => {
      expect(dao.purgeExpired()).toBe(0)
    })
  })
})
