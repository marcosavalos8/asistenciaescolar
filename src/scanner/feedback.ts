/** Señales breves de confirmación (sonido + vibración). No bloquean el escaneo. */
let ctx: AudioContext | null = null;

/** Debe llamarse desde un gesto del usuario para desbloquear el audio en iOS. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep(kind: "ok" | "warn" | "error") {
  try {
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 60 : [80, 60, 80]);
  } catch {
    /* sin vibración */
  }
  if (!ctx || ctx.state !== "running") return;
  const freq = kind === "ok" ? 1100 : kind === "warn" ? 660 : 300;
  const dur = kind === "ok" ? 0.09 : 0.18;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}
