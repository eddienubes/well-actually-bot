import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  pipeline,
  PreTrainedModel,
  PreTrainedTokenizer,
  Tensor,
} from '@huggingface/transformers'

export type RankedItem = {
  text: string
  score: number
}

export class Reranker {
  private readonly tokenizer: PreTrainedTokenizer
  private readonly model: PreTrainedModel

  protected constructor(tokenizer: PreTrainedTokenizer, model: PreTrainedModel) {
    this.tokenizer = tokenizer
    this.model = model
  }

  async rank(query: string, text: string[]): Promise<RankedItem[]> {
    const features = this.tokenizer(
      text.map(() => query),
      {
        text_pair: text,
        padding: true,
        truncation: true,
      },
    )
    const output = await this.model(features)
    const tensor: Tensor = output.logits
    const scores: number[] = tensor.tolist().flatMap((item) => item)

    let indexedScores = scores.map((score, idx) => ({ value: score, idx }))
    indexedScores.sort((a, b) => b.value - a.value)

    return indexedScores.map((score) => ({
      score: score.value,
      text: text[score.idx]!,
    }))
  }

  static async create(): Promise<Reranker> {
    const tokenizer = await AutoTokenizer.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2')
    const model = await AutoModelForSequenceClassification.from_pretrained(
      'Xenova/ms-marco-MiniLM-L-6-v2',
    )
    return new Reranker(tokenizer, model)
  }
}
