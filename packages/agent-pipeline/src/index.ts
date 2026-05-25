// @vega-hogar/agent-pipeline — pipeline 3-LLM del agente comercial IA.
// Fase 6: portar Generator + Judge + Splitter desde setters_ia (~85% reuso).
// Estructura prevista (Fase 6):
//   - generator.ts      → Haiku 4.5 con prompt caching two-point + tool forzada
//                         respond_as_inmobiliario
//   - judge.ts          → Haiku 4.5 con 8 guardrails
//   - splitter.ts       → Haiku 4.5 trocea en 1-N burbujas WA o frases TTS
//   - tool-definition.ts → schema JSON de respond_as_inmobiliario
//   - types.ts          → PipelineInput / PipelineOutput

export const AGENT_PIPELINE_PLACEHOLDER = 'fase-6';
