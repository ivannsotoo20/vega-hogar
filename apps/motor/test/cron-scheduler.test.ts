import { describe, it, expect } from 'vitest';
import type { Redis } from 'ioredis';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';
import { runDebounceTick } from '../src/plugins/cron-scheduler.js';

function makeFakeRedis(entries: Array<{ member: string; score: number }>) {
  const store = new Map<string, number>(entries.map((e) => [e.member, e.score]));
  const redis = {
    async zrangebyscore(_key: string, min: number, max: number) {
      const out: string[] = [];
      for (const [m, s] of store) {
        if (s >= Number(min) && s <= Number(max)) out.push(m, String(s));
      }
      return out;
    },
    async zrem(_key: string, member: string) {
      return store.delete(String(member)) ? 1 : 0;
    },
  };
  return { redis: redis as unknown as Redis, store };
}

const fakeSupabase = {} as unknown as SupabaseClient<Database>;
const fakeAnthropic = {} as unknown as Anthropic;

describe('runDebounceTick', () => {
  it('procesa los debounces vencidos y los elimina (drop antes de procesar)', async () => {
    const past = Date.now() - 1000;
    const { redis, store } = makeFakeRedis([
      { member: '9', score: past },
      { member: '10', score: past },
    ]);
    const calls: number[] = [];
    const res = await runDebounceTick({
      supabase: fakeSupabase,
      anthropic: fakeAnthropic,
      redis,
      process: async (id) => {
        calls.push(id);
      },
    });
    expect(res.processed).toBe(2);
    expect(calls.sort((a, b) => a - b)).toEqual([9, 10]);
    expect(store.size).toBe(0); // ambos eliminados
  });

  it('un process que lanza no rompe el tick y la entrada igual se elimina', async () => {
    const past = Date.now() - 1000;
    const { redis, store } = makeFakeRedis([
      { member: '9', score: past },
      { member: '10', score: past },
    ]);
    const res = await runDebounceTick({
      supabase: fakeSupabase,
      anthropic: fakeAnthropic,
      redis,
      process: async (id) => {
        if (id === 10) throw new Error('boom');
      },
    });
    expect(res.processed).toBe(1); // solo el 9 contó como procesado
    expect(store.size).toBe(0); // ambos drop (anti-zombie en redis)
  });

  it('no procesa entradas aún no vencidas', async () => {
    const future = Date.now() + 60_000;
    const { redis } = makeFakeRedis([{ member: '9', score: future }]);
    const calls: number[] = [];
    const res = await runDebounceTick({
      supabase: fakeSupabase,
      anthropic: fakeAnthropic,
      redis,
      process: async (id) => {
        calls.push(id);
      },
    });
    expect(res.processed).toBe(0);
    expect(calls).toEqual([]);
  });
});
