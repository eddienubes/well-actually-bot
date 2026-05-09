import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const cacheTable = sqliteTable('cache', {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  hash: text().unique().notNull(),
  value: text().notNull(),
  expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
  createdAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .$onUpdateFn(() => new Date()),
})
