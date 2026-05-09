import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import { env } from './config'

const sqlite = new Database(env.SQL_LITE_FILENAME)
const db = drizzle(sqlite)
migrate(db, { migrationsFolder: './drizzle' })
