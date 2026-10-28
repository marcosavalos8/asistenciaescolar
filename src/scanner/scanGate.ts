/**
 * Filtro anti-duplicados para lecturas del escáner. La cámara entrega el mismo
 * QR muchas veces por segundo; solo dejamos pasar una lectura por código:
 *  - mientras se procesa (en vuelo), cualquier lectura del mismo código se ignora;
 *  - después, se ignora hasta que el código deja de verse durante `cooldownMs`
 *    (cada lectura repetida renueva la espera, así que un QR que se queda frente
 *    a la cámara no dispara avisos en bucle).
 * La garantía definitiva contra duplicados está en Firestore (id determinista +
 * transacción + reglas); esto solo evita trabajo y avisos innecesarios.
 */
export class ScanGate {
  private inFlight = new Set<string>();
  private lastSeen = new Map<string, number>();

  constructor(
    private cooldownMs = 2500,
    private clock: () => number = () => Date.now(),
  ) {}

  tryAcquire(key: string): boolean {
    const t = this.clock();
    const last = this.lastSeen.get(key);
    this.lastSeen.set(key, t);
    if (this.inFlight.has(key)) return false;
    if (last !== undefined && t - last < this.cooldownMs) return false;
    this.inFlight.add(key);
    return true;
  }

  release(key: string) {
    this.inFlight.delete(key);
    this.lastSeen.set(key, this.clock());
    if (this.lastSeen.size > 500) this.prune();
  }

  /** Permite volver a leer un código de inmediato (p. ej. tras un error de red). */
  forget(key: string) {
    this.inFlight.delete(key);
    this.lastSeen.delete(key);
  }

  private prune() {
    const t = this.clock();
    for (const [k, v] of this.lastSeen) if (t - v > this.cooldownMs * 4) this.lastSeen.delete(k);
  }
}
