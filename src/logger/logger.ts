import pino from 'pino'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Middleware } from 'grammy'
import crypto from 'node:crypto'
import { env } from '../config.ts'

const transport = pino.transport({
  targets: [
    ...(env.IS_DEV
      ? [
          {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
            level: env.LOG_LEVEL,
          },
        ]
      : []),
    {
      target: 'pino/file',
      options: { destination: env.LOG_FILE_PATH, append: true, mkdir: true },
      level: env.LOG_LEVEL,
    },
  ],
})

const logger = pino({ level: env.LOG_LEVEL }, transport)

type LoggerCtx = {
  logger?: pino.Logger
}

const loggerCtx = new AsyncLocalStorage<LoggerCtx>()

export const getLogger = (name: string, params?: Record<string, string | number>): pino.Logger => {
  const ctx = loggerCtx.getStore()
  if (ctx?.logger) {
    return ctx.logger
  }
  delete params?.name
  return logger.child({ name, ...params })
}

export const createLoggerMiddleware = (): Middleware => {
  return (_ctx, next) => {
    return loggerCtx.run(
      {
        logger: logger.child({
          requestId: crypto.randomBytes(10).toString('hex'),
        }),
      },
      next,
    )
  }
}
