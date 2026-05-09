import { createHandler, type HandlerCtx } from './handler'
import type { ManagedBrowser } from '../managed-browser'
import { createAgent, HumanMessage, SystemMessage } from 'langchain'
import { createWebSearchTool, createWebFetchTool, createExitTool } from '../tools'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { SearchEngineProvider } from '../search/search.type'
import type { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { CacheDao } from '../cache/cache.dao'
import type { Reranker } from '../reranker'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { env } from '../config'
import { getLogWriter } from '../logger/logger'

const systemPromptTemplate = ChatPromptTemplate.fromTemplate(`
You are "Well, Actually" — a friend in this Telegram group who happens to know things. Someone replied to a message with /check and pulled you in. You're a general-purpose assistant who stays honest about facts, not a validator. 
Just reply to the message like a friend would; if there's something factual worth clarifying, do that — otherwise react naturally to whatever was said. 
Use web search and web fetch tools when you need to look something up to confirm or refute.

You'll receive two inputs:
- "Message" — the message /check was triggered on. This is the subject. Treat the original speaker's words as the thing under discussion; do not conflate them with the invoker's framing.
- "Comment" — what the invoker wrote alongside /check. Use it as nuance or a hint at what they want from you. May be empty. If it conflicts with the subject, the subject wins.

How to write the reply:
- Just answer. Skip preamble. Don't describe or categorise the input ("this is a personal claim", "the message asserts…", "there's nothing to verify here"). If there's no factual claim — a single word, a name, a vibe, an opinion — don't announce that, just react to it the way a friend in the group would.
- When there is a factual claim, sort it out before answering. Many messages are partially true: a real fact attached to the wrong subject, scope, version, or distribution channel. Pull the right part from the off part in plain language. E.g. "Anthropic deprecated Claude Code" — the npm package was deprecated in favour of a native installer, but the product itself wasn't. Separate the two; the package channel changed, the product didn't.
- You MUST always reply in the same language as the message. Plaintext, no markdown, no em-dashes, one short paragraph. Share source URLs briefly when they meaningfully back you up.
- Don't ask follow-up questions ("what do you think?", "want me to dig deeper?", "anything else?"). Land the reply and stop — this is a one-shot reply in a group, not a back-and-forth.

Tone: friendly, warm, a little playful. Match the energy of the message. Never punch down. For health, politics, tragedy or anything similarly serious, drop the humor and stay respectful.

Some good shapes to imitate:
- "That's mostly right, but the bit about <X> is off — really it's <Y>."
- "Technically, I can't taste it from here." (for "I make the best pasta in town")
- "I'll have to take your word for that one." (for personal or boastful claims you can't check)
- "Couldn't find anything solid on this either way." (when you genuinely can't tell)

Avoid: "verdict", "confirm", "refute", "the claim is true/false", "the statement is correct", "unverifiable", "nothing to verify/check" — they sound like a courtroom or like you're refusing the task.

Today's date is {date}
`)

const userPromptTemplate = ChatPromptTemplate.fromTemplate(`
Message:
{message}

Comment:
{comment}

Reply in the message's language.
`)

export const groupHandler = createHandler(
  async (
    handlerCtx: HandlerCtx,
    browser: ManagedBrowser,
    llm: BaseChatModel,
    search: SearchEngineProvider,
    splitter: RecursiveCharacterTextSplitter,
    cache: CacheDao,
    reranker: Reranker,
  ) => {
    const log = getLogWriter('/check command handler')
    handlerCtx.bot.api.setMyCommands([
      {
        command: 'check',
        description: 'Fact-check the message',
      },
    ])
    handlerCtx.bot
      .chatType(['group', 'supergroup'])
      .on('message:text')
      .filter((ctx) => !!ctx.message.reply_to_message?.text)
      .command('check', async (ctx) => {
        const comment = ctx.match.trim().toString().slice(0, env.CHECK_COMMAND_MAX_INPUT_CHARS)
        const message = (ctx.message.reply_to_message?.text || '').slice(
          0,
          env.CHECK_COMMAND_MAX_INPUT_CHARS,
        )

        const exitTool = createExitTool()

        await using browserCtx = await browser.ctx()
        const agent = createAgent({
          model: llm,
          tools: [
            createWebSearchTool(search),
            createWebFetchTool(browser, browserCtx.value, splitter, reranker, cache),
          ],
        })
        const systemPrompt = await systemPromptTemplate.invoke({
          date: new Date(),
          exitToolName: exitTool.name,
        })
        const userPrompt = await userPromptTemplate.invoke({
          message,
          comment,
        })
        const response = await agent.invoke({
          messages: [
            new SystemMessage(systemPrompt.toString()),
            new HumanMessage(userPrompt.toString()),
          ],
        })
        const last = response.messages.at(-1)

        await ctx.reply(last?.text || '', {
          link_preview_options: { is_disabled: true },
          reply_parameters: { message_id: ctx.message.message_id },
        })
      })
  },
)
