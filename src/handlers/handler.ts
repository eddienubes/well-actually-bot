import type { Bot } from 'grammy'

export type HandlerCtx = {
  bot: Bot
}

export const createHandler = <T extends any[]>(
  cb: (ctx: HandlerCtx, ...args: T) => Promise<void>,
): ((ctx: HandlerCtx, ...args: T) => Promise<void>) => {
  return async (ctx: HandlerCtx, ...args: T) => {
    return await cb(ctx, ...args)
  }
}
