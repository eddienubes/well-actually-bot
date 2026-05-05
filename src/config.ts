import z from 'zod'

const envSchema = z.object({
  BOT_TOKEN: z.string(),
  INCEPTION_API_KEY: z.string(),
  SEARXNG_BASE_URL: z.string(),
})

export const env = envSchema.parse(process.env)
