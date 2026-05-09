import { defineConfig } from 'drizzle-kit'

process.loadEnvFile()

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQL_LITE_FILENAME!,
  },
})
