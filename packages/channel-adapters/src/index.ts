// @vega-hogar/channel-adapters — drivers de canales.
// Fase 5: WhatsApp YCloud + mock (driver simulado para alumnos sin BSP real).
// Fase 8: Voz Zadarma (SIP + WebSocket) + ElevenLabs TTS + Deepgram/Whisper STT.
//
// Estructura prevista:
//   src/whatsapp/interface.ts   → contrato WhatsAppAdapter (send, parseInbound)
//   src/whatsapp/ycloud.ts      → driver real YCloud BSP
//   src/whatsapp/mock.ts        → driver mock para simulator del panel
//   src/voice/interface.ts      → contrato VoiceAdapter
//   src/voice/zadarma.ts        → driver SIP Zadarma

export const CHANNEL_ADAPTERS_PLACEHOLDER = 'fase-5-y-8';
