import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui";

type CamState = "starting" | "running" | "denied" | "nocamera" | "insecure" | "error";

function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Vista de cámara con lector QR. Prioriza la cámara trasera, libera la cámara al
 * desmontarse (destroy) y la propia librería la pausa cuando la pestaña se oculta.
 * `onDecode` puede cambiar en cada render: se guarda en un ref para no reiniciar la cámara.
 */
export default function QrScannerView({ onDecode, className = "" }: { onDecode: (text: string) => void; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [state, setState] = useState<CamState>("starting");
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState("insecure");
      return;
    }
    const video = videoRef.current!;
    let cancelled = false;
    setState("starting");
    setHasFlash(false);
    setFlashOn(false);

    const scanner = new QrScanner(video, (r) => onDecodeRef.current(r.data), {
      preferredCamera: "environment",
      maxScansPerSecond: 10,
      returnDetailedScanResult: true,
      // Región de lectura: el cuadrado central (más rápido y evita leer QR del fondo)
      calculateScanRegion: (v) => {
        const size = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.8);
        return {
          x: Math.round((v.videoWidth - size) / 2),
          y: Math.round((v.videoHeight - size) / 2),
          width: size,
          height: size,
          downScaledWidth: Math.min(size, 600),
          downScaledHeight: Math.min(size, 600),
        };
      },
    });
    scannerRef.current = scanner;

    scanner
      .start()
      .then(async () => {
        if (cancelled) return;
        setState("running");
        try {
          setHasFlash(await scanner.hasFlash());
        } catch {
          setHasFlash(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string })?.name ?? "";
        const msg = String((e as { message?: string })?.message ?? e);
        if (name === "NotAllowedError" || name === "SecurityError" || /permission|denied/i.test(msg)) setState("denied");
        else if (name === "NotFoundError" || /not found/i.test(msg)) setState("nocamera");
        else setState("error");
      });

    return () => {
      cancelled = true;
      scanner.destroy(); // detiene el stream y libera la cámara
      scannerRef.current = null;
    };
  }, [attempt]);

  const toggleFlash = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.toggleFlash();
      setFlashOn(s.isFlashOn());
    } catch {
      setHasFlash(false);
    }
  };

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

      {state === "running" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="aspect-square w-[70%] max-w-[340px] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}

      {hasFlash && state === "running" && (
        <button
          onClick={toggleFlash}
          className={`absolute right-3 top-3 rounded-full px-4 py-2 text-sm font-semibold ${flashOn ? "bg-yellow-300 text-slate-900" : "bg-black/60 text-white"}`}
          aria-pressed={flashOn}
        >
          {flashOn ? "🔦 Linterna encendida" : "🔦 Linterna"}
        </button>
      )}

      {state !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-white">
          {state === "starting" && <p className="text-lg">Abriendo cámara…</p>}
          {state === "insecure" && (
            <p>
              La cámara requiere una conexión segura (HTTPS). Abre la aplicación desde su dirección <b>https://</b> (o localhost en desarrollo).
            </p>
          )}
          {state === "nocamera" && <p>No se encontró ninguna cámara en este dispositivo. Usa el registro manual.</p>}
          {state === "error" && (
            <div className="space-y-3">
              <p>No se pudo iniciar la cámara. Puede estar en uso por otra aplicación.</p>
              <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</Button>
            </div>
          )}
          {state === "denied" && (
            <div className="max-w-sm space-y-3 text-left">
              <p className="text-center text-lg font-semibold">Permiso de cámara denegado</p>
              {isIOS() ? (
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Abre <b>Ajustes</b> → <b>Safari</b> → <b>Cámara</b> y elige «Preguntar» o «Permitir».</li>
                  <li>O en Safari pulsa <b>aA</b> en la barra de direcciones → <b>Configuración del sitio web</b> → Cámara → Permitir.</li>
                  <li>Vuelve aquí y pulsa «Reintentar».</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Toca el icono 🔒 o ⓘ junto a la dirección en Chrome.</li>
                  <li>Entra a <b>Permisos</b> → <b>Cámara</b> → <b>Permitir</b>.</li>
                  <li>Vuelve aquí y pulsa «Reintentar».</li>
                </ol>
              )}
              <div className="text-center">
                <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
