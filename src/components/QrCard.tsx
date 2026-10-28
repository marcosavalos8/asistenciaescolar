import { useRef } from "react";
import { Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { qrPayload } from "@/lib/qr";
import { downloadBlob, safeFilename } from "@/lib/csv";
import type { Student } from "@/types";
import { Button, btnCls } from "./ui";

/** Compone una ficha PNG (QR + nombre + grupo) a partir del canvas del QR. */
async function cardPng(qrCanvas: HTMLCanvasElement, name: string, group: string, institution: string): Promise<Blob> {
  const W = 600, pad = 44, qr = W - pad * 2;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = qr + pad * 2 + 150;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#64748b";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(institution, W / 2, pad - 8, W - pad);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, pad, pad + 6, qr, qr);
  ctx.fillStyle = "#0f172a";
  let size = 36;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(name).width > W - pad && size > 18) {
    size -= 2;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
  }
  ctx.fillText(name, W / 2, qr + pad + 70);
  ctx.fillStyle = "#334155";
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.fillText(`Grupo: ${group}`, W / 2, qr + pad + 115, W - pad);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo generar la imagen"))), "image/png"));
}

export function StudentQrPanel({ student, groupName, institution }: { student: Student; groupName: string; institution: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  const download = async () => {
    if (!ref.current) return;
    const blob = await cardPng(ref.current, student.fullName, groupName, institution);
    downloadBlob(`QR_${safeFilename(student.fullName)}.png`, blob);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <QRCodeCanvas
          ref={ref}
          value={qrPayload(student.qrToken)}
          size={512}
          level="M"
          marginSize={2}
          style={{ width: 240, height: 240 }}
        />
      </div>
      <div className="text-center">
        <p className="text-lg font-bold">{student.fullName}</p>
        <p className="text-sm text-slate-600">Grupo: {groupName}</p>
        {!student.active && <p className="mt-1 text-sm font-semibold text-rose-600">Alumno inactivo: el QR no registrará asistencia</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={download}>Descargar PNG</Button>
        <Link to={`/imprimir/alumno/${student.id}`} target="_blank" rel="noopener" className={btnCls("secondary")}>
          Imprimir ficha
        </Link>
      </div>
    </div>
  );
}
