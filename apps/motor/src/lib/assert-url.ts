/**
 * Valida que una URL externa (que entre del usuario / proveedor) sea https
 * (seguridad dura, CLAUDE.md §10). Lanza si no es una URL válida o no es https.
 */
export function assertHttpsUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`assertHttpsUrl: URL inválida: ${url}`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(`assertHttpsUrl: se requiere https (recibido ${u.protocol}): ${url}`);
  }
  return u;
}
