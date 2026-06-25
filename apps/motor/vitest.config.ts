import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Vars dummy para que `config/env.ts` (zod fail-fast) no aborte en los tests.
    // Los tests unitarios usan el fake de Supabase y nunca conectan de verdad.
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      WHATSAPP_PROVIDER: 'mock',
      CALENDAR_PROVIDER: 'mock',
    },
  },
});
