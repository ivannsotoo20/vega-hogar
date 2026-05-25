# Vega Hogar Inmobiliaria — lore ficticio

> Documento canónico de la inmobiliaria ficticia que modela este proyecto. Cualquier
> seed data, mensaje del agente, copy de anuncio o asset visual debe respetar esta
> identidad. Aprobado por Iván tras descartar 3 candidatos alternativos
> (Aurea / Naranjo & Co / Lares).

---

## Identidad de marca

| Campo | Valor |
|---|---|
| **Nombre** | Vega Hogar Inmobiliaria |
| **Slogan** | Tu hogar en Valencia, desde 1998 |
| **Año fundación ficticio** | 1998 (28 años de historia simulada) |
| **Dominio ficticio** | `vegahogar.es` (no se compra — naming interno + demos) |
| **Tono** | Tradicional cercano. Sin hype. Sin tono "proptech sexy". |

**Por qué "Vega"**: remite a la huerta valenciana → arraigo local + naming evocador.
**Por qué 1998**: credibilidad de "toda la vida" sin entrar en territorio centenario.

---

## Paleta cromática

| Token | Hex | Uso |
|---|---|---|
| `--color-oliva` | `#5C6F44` | Primario (CTAs, headers, links) — verde oliva profundo |
| `--color-oliva-dark` | `#485636` | Hover / texto sobre crema |
| `--color-oliva-light` | `#7A8B5E` | Acentos suaves |
| `--color-terracota` | `#B85C38` | Acento (badges activos, énfasis) — terracota mediterránea |
| `--color-terracota-dark` | `#934829` | Hover acento |
| `--color-terracota-light` | `#D07A55` | Estados suaves |
| `--color-crema` | `#F5EBDD` | Background general |
| `--color-crema-dark` | `#E8D8BF` | Cards / superficies elevadas |
| `--color-negro-suave` | `#2A2A2A` | Texto principal (no negro puro) |
| `--color-blanco-roto` | `#FAFAF7` | Cards contraste con crema |

Aplicado en `apps/panel/src/app/globals.css` como CSS custom properties + Tailwind 4
`@theme inline` con prefijo `brand-*` (ej. `bg-brand-oliva`, `text-brand-terracota`).

---

## Tipografía

| Familia | Uso | Fuente |
|---|---|---|
| **Playfair Display** | Serif para títulos, hero, claims | `next/font/google` |
| **Inter** | Sans para cuerpo, UI, tablas, formularios | `next/font/google` |

Cargadas en `apps/panel/src/app/layout.tsx` con variables CSS `--font-playfair` y
`--font-inter` consumidas en `globals.css` (`--font-serif`, `--font-sans`).

---

## Operativa simulada

### Sedes

| Oficina | Dirección | Perfil | Foco |
|---|---|---|---|
| **Ruzafa** | Calle Cuba 47, Valencia | Joven/urbano | Alquiler residencial |
| **Campanar** | Av. del Cid 132, Valencia | Familias | Venta |

**Mix oficial**: 60% alquiler / 40% venta a nivel global. Ruzafa concentra alquiler;
Campanar concentra venta.

### Equipo (10 personas)

| Rol | N | Notas |
|---|---|---|
| Director general | 1 | Único superadmin |
| Directores de oficina | 2 | Uno por sede |
| Comerciales | 6 | 3 por sede |
| Asistente/Captador | 1 | Cross-oficina, foco vendedores (Fase 11) |

Nombres simulados se generan en seed data de Fase 1 con nombres valencianos verosímiles.

### Catálogo simulado (Fase 1 seed)

- **30-50 inmuebles** repartidos en mix 60/40.
- **Barrios reales de Valencia**: Ruzafa, Russafa, Benimaclet, El Carmen, Campanar,
  Patraix, Algirós, Ciudad Jardín, L'Eixample, Cabanyal/Marítim, Malilla.
- **Fotos**: stock libres de Unsplash o Pexels (atribución cuando aplique).
- **Direcciones**: aproximadas reales (no exactas — evitar problemas legales).
- **Precios**: verosímiles por zona y tipo (no inflados — DEC-007).

---

## Teléfono y voz

- **Número público**: a contratar en Fase 8 con Zadarma. Prefijo **+34 96X** (Valencia).
- **Voz del agente IA**: ElevenLabs voz española femenina o masculina (decisión de Fase 8
  con A/B testing antes de elegir).

---

## Mensajería WhatsApp

- **BSP**: YCloud (mismo que setters_ia — patrón validado).
- **Número WhatsApp Business**: mismo Zadarma o uno dedicado (decisión Fase 5).
- **Modo dual**:
  - **Real** (YCloud) para Iván en producción.
  - **Mock** (simulador integrado en panel `/admin/simulator`) para alumnos que clonen
    sin fricción BSP.

Variable: `WHATSAPP_PROVIDER=ycloud|mock`.

---

## Anti-jugadas del lore

1. **NO rent-to-rent, alquileres vacacionales ni venta a extranjeros** — inmobiliaria
   tradicional española de toda la vida.
2. **NO inflar cifras en seed data** — DEC-007 doctrina.
3. **NO sobreproducción de contenido orgánico** — la web ficticia, si se construye, es
   limpia. Sin video corporativo gigante.
4. **NO copiar tono New School juvenil** — el copy de Vega Hogar es tradicional cercano.

---

## Logo (Fase 2+)

Pendiente de diseño definitivo. Concepto:

- Tipografía serif "Vega" + hojita estilizada de la huerta valenciana
- Paleta: oliva sobre crema (versión principal) + monocromo (impresión)
- SVG vectorial para escalado limpio

Variante temporal en `apps/panel/src/app/page.tsx` usa solo tipografía Playfair Display
mientras tanto.
