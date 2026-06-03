import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Suscripción al matchMedia como store externo. Patrón canónico useSyncExternalStore:
// reactivo al resize sin setState dentro de un effect.
function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT, // snapshot cliente
    () => false, // snapshot servidor (evita hydration mismatch)
  )
}
