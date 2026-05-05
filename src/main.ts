import { Bot } from 'grammy'
import { env } from './config'
import { ChatOpenAI } from '@langchain/openai'
import crypto from 'node:crypto'
import { MemorySaver } from '@langchain/langgraph'
import { createAgent, HumanMessage, SystemMessage } from 'langchain'
import { SearXngApi } from './searxng-api'
import { ManagedBrowser } from './managed-browser'
import { write } from 'bun'

const bot = new Bot(env.BOT_TOKEN)

export const main = async (): Promise<void> => {
  console.log('hello')

  const llm = new ChatOpenAI({
    model: 'mercury-2',
    apiKey: env.INCEPTION_API_KEY,
    configuration: {
      baseURL: 'https://api.inceptionlabs.ai/v1',
    },
  })

  const threadId = crypto.randomUUID()
  const checkpointer = new MemorySaver()

  bot.on('message:text', async (ctx) => {
    const agent = createAgent({
      model: llm,
      checkpointer,
    })
    const stream = await agent.stream(
      {
        messages: [
          new SystemMessage(
            'Do NOT use markdown in your responses. Reply in a simple, yet coherent text.',
          ),
          new HumanMessage(ctx.message.text),
        ],
      },
      {
        configurable: {
          thread_id: threadId,
        },
        streamMode: ['messages'],
      },
    )
    let content: string = ''
    for await (const [_, event] of stream) {
      const [chunk] = event
      if (chunk.text) {
        content += chunk.text
        await ctx.replyWithDraft(content)
      }
    }
    await ctx.reply(content)
  })
  // await bot.start()

  // const api = new SearXngApi()
  // console.log(
  //   await api.search({
  //     q: 'langchain',
  //   }),
  // )
  await using b = await ManagedBrowser.serve()
  await using ctx = await b.ctx()
  const md = await b.fetch('https://en.wikipedia.org/wiki/Elon_Musk', {
    ctx: ctx.value,
  })
  await write('test.md', md);
}

void main()
