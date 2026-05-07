import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  PreTrainedModel,
  PreTrainedTokenizer,
} from '@huggingface/transformers'

export class Reranker {
  private readonly tokenizer: PreTrainedTokenizer
  private readonly model: PreTrainedModel

  constructor(tokenizer: PreTrainedTokenizer, model: PreTrainedModel) {
    this.tokenizer = tokenizer
    this.model = model
  }

  async rank(query: string, text: string[]): Promise<any> {
    const features = await this.tokenizer(
      text.map(() => query),
      {
        text_pair: text,
        padding: true,
        truncation: true,
      },
    )
    const scores = await this.model(features)

    
  }

  async create(): Promise<Reranker> {
    const tokenizer = await AutoTokenizer.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2')
    const model = await AutoModelForSequenceClassification.from_pretrained(
      'Xenova/ms-marco-MiniLM-L-6-v2',
    )
    return new Reranker(tokenizer, model)
  }
}
