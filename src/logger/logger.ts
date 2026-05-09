import pino from 'pino'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context, ErrorHandler, Middleware } from 'grammy'
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

type LogEvent = {
  name: string
  payload: unknown
  at: Date
}

type RequestCtx = {
  logger: pino.Logger
  events: LogEvent[]
  startedAt: Date
  requestId: string
  meta: Record<string, unknown>
}

export type LogWriter = {
  write(payload: unknown): void
}

const requestCtx = new AsyncLocalStorage<RequestCtx>()
// grammy invokes bot.catch outside the ALS scope, so we bridge ctx → store
// via a WeakMap that auto-releases when grammy drops the Context.
const ctxStore = new WeakMap<Context, RequestCtx>()

export const getLogWriter = (name: string): LogWriter => ({
  write: (payload) => {
    const ctx = requestCtx.getStore()
    if (!ctx) return
    ctx.events.push({ name, payload, at: new Date() })
  },
})

export const getLogger = (name: string): pino.Logger => {
  return logger.child({ name })
}

const serializeError = (err: unknown): Record<string, unknown> => {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack, cause: err.cause }
  }
  return { value: err }
}

export const createLoggerMiddleware = (): Middleware => {
  return async (ctx, next) => {
    const requestId = crypto.randomBytes(10).toString('hex')
    const reqLogger = logger.child({ requestId })
    const meta: Record<string, unknown> = {
      updateId: ctx.update.update_id,
      userId: ctx.from?.id,
      username: ctx.from?.username,
      chatId: ctx.chat?.id,
      messageText: ctx.message?.text,
    }
    const store: RequestCtx = {
      logger: reqLogger,
      events: [],
      startedAt: new Date(),
      requestId,
      meta,
    }
    ctxStore.set(ctx, store)
    reqLogger.info(meta, `started`)
    await requestCtx.run(store, next)
    reqLogger.info(
      {
        ...store.meta,
        durationMs: Date.now() - store.startedAt.getTime(),
        events: store.events,
      },
      'request',
    )
  }
}

export const createCatchMiddleware = (): ErrorHandler => {
  return (err) => {
    const errPayload = serializeError(err.error)
    const store = ctxStore.get(err.ctx)
    if (!store) {
      logger.error({ err: errPayload }, 'request')
      return
    }
    store.logger.error(
      {
        ...store.meta,
        durationMs: Date.now() - store.startedAt.getTime(),
        events: store.events,
        err: errPayload,
      },
      'request',
    )
  }
}
