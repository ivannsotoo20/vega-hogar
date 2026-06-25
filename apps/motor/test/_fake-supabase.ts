import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vega-hogar/db';

/**
 * Fake in-memory de Supabase para tests unitarios de los servicios del motor.
 * Soporta el subconjunto de la API que usan: select/insert/update + filtros
 * (eq/is/in/gte/lte/contains) + order/limit + maybeSingle/single + await directo.
 * NO pretende ser fiel a PostgREST — solo lo bastante para los tests de F10b.
 */

type Row = Record<string, unknown>;
type Pred = (r: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  seq: Record<string, number>;
}

export function makeFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  const seq: Record<string, number> = {};
  for (const [t, rows] of Object.entries(seed)) {
    tables[t] = rows.map((r) => ({ ...r }));
    seq[t] = tables[t]!.reduce((max, r) => Math.max(max, Number(r.id ?? 0)), 0);
  }
  return { tables, seq };
}

class FakeQuery {
  private preds: Pred[] = [];
  private _order: { col: string; asc: boolean } | null = null;
  private _limit: number | null = null;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(): this {
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: unknown): this {
    this.preds.push((r) => r[col] === val);
    return this;
  }
  is(col: string, val: unknown): this {
    this.preds.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.preds.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col: string, val: number): this {
    this.preds.push((r) => r[col] != null && Number(r[col]) >= val);
    return this;
  }
  lte(col: string, val: number): this {
    this.preds.push((r) => r[col] != null && Number(r[col]) <= val);
    return this;
  }
  contains(col: string, obj: Record<string, unknown>): this {
    this.preds.push((r) => {
      const f = (r[col] ?? {}) as Record<string, unknown>;
      return Object.entries(obj).every(([k, v]) => f[k] === v);
    });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this._order = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this._limit = n;
    return this;
  }

  private rows(): Row[] {
    this.db.tables[this.table] ??= [];
    const table = this.db.tables[this.table]!;
    if (this.op === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted: Row[] = items.map((it) => {
        this.db.seq[this.table] = (this.db.seq[this.table] ?? 0) + 1;
        const row = { id: this.db.seq[this.table], ...it };
        table.push(row);
        return { ...row };
      });
      return inserted;
    }
    let matched = table.filter((r) => this.preds.every((p) => p(r)));
    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.payload as Row);
      return matched.map((r) => ({ ...r }));
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = table.filter((r) => !matched.includes(r));
      return matched;
    }
    // select
    if (this._order) {
      const { col, asc } = this._order;
      matched = [...matched].sort((a, b) => {
        const av = a[col] as number | string | null;
        const bv = b[col] as number | string | null;
        if (av == null && bv == null) return 0;
        if (av == null) return asc ? 1 : -1;
        if (bv == null) return asc ? -1 : 1;
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
    }
    if (this._limit != null) matched = matched.slice(0, this._limit);
    return matched.map((r) => ({ ...r }));
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.rows()[0] ?? null, error: null };
  }
  async single(): Promise<{ data: Row | null; error: { message: string } | null }> {
    const rows = this.rows();
    if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
    return { data: rows[0]!, error: null };
  }
  then<T>(resolve: (v: { data: Row[]; error: null }) => T): T {
    return resolve({ data: this.rows(), error: null });
  }
}

export function makeFakeSupabase(db: FakeDb): SupabaseClient<Database> {
  const client = {
    from(table: string) {
      return new FakeQuery(db, table);
    },
  };
  return client as unknown as SupabaseClient<Database>;
}
