export class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

/**
 * Rechaza si la operación tarda más de `ms`. La operación de Firestore puede
 * seguir en curso; por eso la UI nunca confirma un guardado por timeout, solo
 * cuando la promesa original se resuelve.
 */
export function withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function errorMessage(e: unknown): string {
  if (e instanceof TimeoutError) return "Sin respuesta del servidor. Revisa tu conexión; no se confirmó el guardado.";
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "permission-denied":
      return "No tienes permiso para realizar esta acción.";
    case "unavailable":
    case "deadline-exceeded":
      return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
    case "failed-precondition":
      return "Falta un índice de Firestore o la operación no es válida en este estado. Revisa la consola del navegador.";
    case "not-found":
      return "El registro no existe.";
    case "aborted":
      return "Hubo un conflicto con otra operación. Inténtalo de nuevo.";
    case "resource-exhausted":
      return "Se alcanzó el límite de uso de Firebase. Inténtalo más tarde.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "Correo o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos.";
    case "auth/email-already-in-use":
      return "Ese correo ya tiene una cuenta. Inicia sesión.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Error de red. Revisa tu conexión.";
  }
  if (e instanceof Error && e.message) return e.message;
  return "Ocurrió un error inesperado.";
}
