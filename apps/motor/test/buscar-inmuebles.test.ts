import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeSupabase } from './_fake-supabase.js';
import { buscarInmuebles } from '../src/services/agent-tools/buscar-inmuebles.js';

function seedDb() {
  return makeFakeDb({
    lead_preferences: [
      {
        id: 1,
        tenant_id: 1,
        lead_id: 100,
        type: 'sale',
        neighborhoods: ['Ruzafa'],
        price_min_eur: 200000,
        price_max_eur: 300000,
        rooms_min: 2,
        m2_min: 60,
        features_required: {},
        updated_at: '2026-06-01T00:00:00Z',
      },
    ],
    properties: [
      { id: 1, tenant_id: 1, type: 'sale', neighborhood: 'Ruzafa', status: 'available', deleted_at: null, price_eur: 250000, monthly_rent_eur: null, rooms: 3, m2_built: 80, features: {}, title: 'Piso Ruzafa A' },
      { id: 2, tenant_id: 1, type: 'sale', neighborhood: 'Ruzafa', status: 'available', deleted_at: null, price_eur: 290000, monthly_rent_eur: null, rooms: 2, m2_built: 70, features: {}, title: 'Piso Ruzafa B' },
      { id: 3, tenant_id: 1, type: 'sale', neighborhood: 'Centro', status: 'available', deleted_at: null, price_eur: 260000, monthly_rent_eur: null, rooms: 3, m2_built: 90, features: {}, title: 'Piso Centro' },
      { id: 4, tenant_id: 1, type: 'sale', neighborhood: 'Ruzafa', status: 'sold', deleted_at: null, price_eur: 250000, monthly_rent_eur: null, rooms: 3, m2_built: 80, features: {}, title: 'Vendido' },
      { id: 5, tenant_id: 1, type: 'sale', neighborhood: 'Ruzafa', status: 'available', deleted_at: '2026-06-01T00:00:00Z', price_eur: 250000, monthly_rent_eur: null, rooms: 3, m2_built: 80, features: {}, title: 'Borrado' },
      { id: 6, tenant_id: 1, type: 'rent', neighborhood: 'Ruzafa', status: 'available', deleted_at: null, price_eur: null, monthly_rent_eur: 1200, rooms: 3, m2_built: 80, features: {}, title: 'Alquiler' },
      { id: 7, tenant_id: 1, type: 'sale', neighborhood: 'Ruzafa', status: 'available', deleted_at: null, price_eur: 500000, monthly_rent_eur: null, rooms: 4, m2_built: 120, features: {}, title: 'Fuera de presupuesto' },
    ],
  });
}

describe('buscarInmuebles', () => {
  it('matchea zona + tipo + presupuesto + rooms/m2, ordena por precio asc y excluye sold/borrado/rent/fuera-presupuesto', async () => {
    const supabase = makeFakeSupabase(seedDb());
    const res = await buscarInmuebles({ supabase, tenantId: 1, leadId: 100 });
    expect(res.ids).toEqual([1, 2]); // 250k antes que 290k; Centro (otra zona) excluido en relax 0
    expect(res.properties[0]!.priceLabel).toContain('€');
    expect(res.properties[0]!.matchReason).toContain('zona');
  });

  it('relaja a otras zonas cuando la zona pedida no tiene resultados', async () => {
    const db = seedDb();
    db.tables.lead_preferences![0]!.neighborhoods = ['Benimaclet']; // sin inventario
    const supabase = makeFakeSupabase(db);
    const res = await buscarInmuebles({ supabase, tenantId: 1, leadId: 100 });
    // Relax nivel 3 (cualquier zona, dentro de presupuesto+tipo): Ruzafa A/B + Centro.
    expect(res.ids.length).toBeGreaterThan(0);
    expect(res.ids).toContain(3); // Centro entra al relajar la zona
  });

  it('devuelve vacío si el lead no tiene preferencias', async () => {
    const supabase = makeFakeSupabase(seedDb());
    const res = await buscarInmuebles({ supabase, tenantId: 1, leadId: 999 });
    expect(res).toEqual({ properties: [], ids: [] });
  });
});
