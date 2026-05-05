import { lightpanda, type LightpandaServeOptions } from '@lightpanda/browser'
import cp from 'node:child_process'
import { type Browser, type BrowserContext } from 'puppeteer-core'
import puppeteer from 'puppeteer-core'
import { DisposableOf } from './utils/utils'
import TurndownService from 'turndown'
import { convert } from '@kreuzberg/html-to-markdown-node'

const turndownService = new TurndownService()
turndownService.remove('img')
turndownService.remove('br')
turndownService.remove('hr')

type BrowserOptions = {
  proc: cp.ChildProcessWithoutNullStreams
  browser: Browser
}

type FetchOptions = {
  ctx: BrowserContext
}

const defaults: LightpandaServeOptions = {
  host: '127.0.0.1',
  port: 9222,
}

export class ManagedBrowser {
  protected readonly options: BrowserOptions

  private constructor(options: BrowserOptions) {
    this.options = options
  }

  async ctx(): Promise<DisposableOf<BrowserContext>> {
    return new DisposableOf(
      await this.options.browser.createBrowserContext(),
      async (ctx) => await ctx.close(),
    )
  }

  async fetch(url: string, options: FetchOptions): Promise<string> {
    const page = new DisposableOf(await options.ctx.newPage(), async (page) => page.close())
    await page.value.goto(url)
    const html = await page.value.content()
    const markdown = convert(html)
    const noRepeats = markdown.replaceAll(/(.)\1{6,}/gs, '$1')
    return noRepeats
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.options.browser.close()

    this.options.proc.stdout.destroy()
    this.options.proc.stderr.destroy()
    this.options.proc.kill()
  }

  static async serve(options: LightpandaServeOptions = defaults): Promise<ManagedBrowser> {
    const proc = await lightpanda.serve({})
    const browser = await puppeteer.connect({
      browserWSEndpoint: `ws://${options.host}:${options.port}`,
    })
    return new ManagedBrowser({
      proc,
      browser,
    })
  }
}
