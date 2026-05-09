import z from 'zod'
import path from 'node:path'
import envPaths from 'env-paths'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_TOKEN: z.string(),
  INCEPTION_API_KEY: z.string(),
  SEARXNG_BASE_URL: z.string(),
  BRAVE_API_TOKEN: z.string(),
  TAVILY_API_TOKEN: z.string(),
  FIRECRAWL_API_TOKEN: z.string(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SEARCH_ENGINE_COOLDOWN_MS: z.number().default(300_000), // 5 mins
  SEARCH_CACHE_TTL_MS: z.number().default(3_600_000), // 1 hour
  WEB_FETCH_CACHE_TTL_MS: z.number().default(3_600_000), // 1 hour
  BOT_RATE_LIMIT_HITS: z.number().default(1),
  BOT_RATE_LIMIT_WINDOW_MS: z.number().default(2000),
  SQL_LITE_FILENAME: z.string().default('wa.sqlite'),
  CACHE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  WEB_SEARCH_TOOL_TOP_K: z.number().default(10),
  WEB_FETCH_TOOL_TOP_K: z.number().default(5),
  BROWSER_URL_OPEN_TIMEOUT_MS: z.number().default(7000),
  CHECK_COMMAND_MAX_INPUT_CHARS: z.number().default(3000),
})

export const env = envSchema
  .transform((e) => ({
    ...e,
    IS_DEV: e.NODE_ENV !== 'production',
    LOG_FILE_PATH: path.join(envPaths('well-actually-bot').log, 'well-actually-bot.log'),
  }))
  .parse(process.env)
