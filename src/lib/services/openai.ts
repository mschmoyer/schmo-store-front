import OpenAI from 'openai';

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenAIService {
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 2000,
      ...config
    };
    
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
    });
  }

  async generateWithFunctionCalling<T>(
    systemPrompt: string,
    userPrompt: string,
    functionSchema: object,
    functionName: string
  ): Promise<T> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: functionName,
            description: `Generate store details based on the provided information`,
            parameters: functionSchema
          }
        }],
        tool_choice: { type: 'function', function: { name: functionName } }
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      
      if (!toolCall || !toolCall.function.arguments) {
        throw new Error('No function call returned from OpenAI');
      }

      return JSON.parse(toolCall.function.arguments) as T;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static getInstance(): OpenAIService {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    return new OpenAIService({ apiKey });
  }
}