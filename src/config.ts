import z from 'zod'

const envSchema = z.object({
  BOT_TOKEN: z.string(),
  INCEPTION_API_KEY: z.string(),
})

export const env = envSchema.parse(process.env)
