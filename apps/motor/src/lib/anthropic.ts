import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}
