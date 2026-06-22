// @vega-hogar/agent-pipeline — pipeline 3-LLM del agente comercial IA.
// Generator → Judge → Validator(V00-V19) → Splitter. Port re-domain de setters_ia
// (decisión C5: un agente, dos flujos comprador/vendedor; Opción A / RAG).

export type {
  ConversationMessage,
  GeneratorInput,
  GeneratorOutput,
  GeneratorUsage,
  InmobiliarioToolOutput,
  AnthropicTool,
  SystemContent,
} from './types.js';

export {
  runGenerator,
  validateInmobiliarioOutput,
  DEFAULT_GENERATOR_MODEL,
} from './generator.js';

export {
  respondAsInmobiliarioTool,
  buildRespondAsInmobiliarioTool,
  RESPOND_AS_INMOBILIARIO_TOOL_NAME,
} from './tool-definition.js';

export {
  calculateCostUsd,
  resolvePriceForModel,
  DEFAULT_PRICE_TABLE,
  type ModelPriceUsdPerMTokens,
  type CostInput,
} from './cost.js';

export { loadConversationHistory, rowsToConversationMessages, type HistoryRow } from './history.js';
export { logLlmCall, summarizeInmobiliarioOutput } from './llm-call-log.js';

export {
  runJudge,
  judgeMessageTool,
  DEFAULT_JUDGE_MODEL,
  JUDGE_TOOL_NAME,
  type JudgeInput,
  type JudgeOutput,
} from './judge.js';

export {
  runSplitter,
  buildSplitMessageTool,
  splitMessageTool,
  deterministicSplit,
  DEFAULT_SPLITTER_MODEL,
  SPLITTER_TOOL_NAME,
  type SplitterInput,
  type SplitterOutput,
} from './splitter.js';

export {
  runPipeline,
  type PipelineInput,
  type PipelineOutput,
  type PipelineStageMetric,
} from './pipeline.js';
