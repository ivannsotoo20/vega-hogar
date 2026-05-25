export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="max-w-2xl flex flex-col items-center text-center gap-8">
        <div className="inline-flex items-center gap-3 rounded-full border border-brand-oliva/20 bg-brand-blanco/60 px-4 py-1.5 text-sm text-brand-oliva-dark">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-terracota" />
          Fase 0 · Kickoff técnico
        </div>

        <h1 className="font-serif text-5xl md:text-7xl tracking-tight text-brand-oliva-dark">
          Vega Hogar
          <span className="block text-brand-terracota">Inmobiliaria</span>
        </h1>

        <p className="font-serif italic text-xl md:text-2xl text-brand-negro/70">
          Tu hogar en Valencia, desde 1998
        </p>

        <p className="max-w-md text-base text-brand-negro/60 leading-relaxed">
          Sistema centralizado + agente comercial IA en construcción. Panel para
          el equipo, captación automatizada de vendedores, WhatsApp y voz
          integrados.
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-10 rounded-md bg-brand-oliva" title="#5C6F44 Oliva" />
          <div
            className="h-10 rounded-md bg-brand-terracota"
            title="#B85C38 Terracota"
          />
          <div
            className="h-10 rounded-md bg-brand-crema-dark border border-brand-oliva/10"
            title="#F5EBDD Crema"
          />
          <div className="h-10 rounded-md bg-brand-negro" title="#2A2A2A Negro suave" />
        </div>

        <footer className="mt-8 text-xs text-brand-negro/40 uppercase tracking-widest">
          Proyecto formativo · Fyzon
        </footer>
      </div>
    </main>
  );
}
