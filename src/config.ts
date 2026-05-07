import z from 'zod'

const envSchema = z.object({
  BOT_TOKEN: z.string(),
  INCEPTION_API_KEY: z.string(),
  SEARXNG_BASE_URL: z.string(),

  WEB_FETCH_TOOL_TOP_K: z.number().default(5),
})

export const env = envSchema.parse(process.env)
