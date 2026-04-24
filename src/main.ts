import { Bot } from "grammy";
import { env } from "./config";
import {ChatOpenAI} from '@langchain/openai';

const bot = new Bot(env.BOT_TOKEN);

export const main = async (): Promise<void> => {
  const llm = new ChatOpenAI();

  bot.on("message", (ctx) => {
    ctx.reply("I am degenerate");
  });
  await bot.start();
};

void main();
