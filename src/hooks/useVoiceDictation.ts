import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook unificado de dictado por voz para móvil/tablet/escritorio.
 *
 * Soluciona la duplicación de palabras observada en móviles/tablets:
 * - Acumula únicamente resultados FINALES (isFinal === true) por su índice global,
 *   de modo que un mismo resultado nunca se inserta dos veces aunque el navegador
 *   reemita eventos.
 * - Al reiniciarse el reconocimiento (onend → start automático en navegadores que
 *   cortan tras silencios), reinicia el contador de índice procesado, pero el
 *   texto ya confirmado permanece intacto.
 * - Deduplicación defensiva de cola: si el nuevo trozo final ya termina la cadena
 *   acumulada, no se añade (caso típico de Chrome móvil emitiendo el último
 *   segmento dos veces).
 * - Mantiene el texto provisional (interim) separado del texto confirmado, para
 *   que el usuario pueda editar el campo sin que se machaque mientras dicta.
 */
export function useVoiceDictation(opts?: {
  lang?: string;
  /** Llamado cada vez que cambia el texto confirmado acumulado. */
  onFinalChange?: (finalText: string) => void;
  /** Llamado cada vez que cambia el texto provisional. */
  onInterimChange?: (interimText: string) => void;
}) {
  const lang = opts?.lang ?? "es-ES";
  const onFinalRef = useRef(opts?.onFinalChange);
  const onInterimRef = useRef(opts?.onInterimChange);
  useEffect(() => {
    onFinalRef.current = opts?.onFinalChange;
    onInterimRef.current = opts?.onInterimChange;
  }, [opts?.onFinalChange, opts?.onInterimChange]);

  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<any>(null);
  // Texto confirmado acumulado durante esta sesión de dictado.
  const finalRef = useRef("");
  // Bandera: el usuario quiere seguir grabando (para re-arrancar tras onend).
  const wantRecordingRef = useRef(false);
  // Índice del próximo resultado por procesar dentro del SpeechRecognitionResultList actual.
  const nextIndexRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) setSupported(false);
  }, []);

  const cleanup = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const r = recognitionRef.current;
    if (r) {
      try { r.onresult = null; } catch {}
      try { r.onerror = null; } catch {}
      try { r.onend = null; } catch {}
      try { r.stop(); } catch {}
      try { r.abort?.(); } catch {}
    }
    recognitionRef.current = null;
  }, []);

  const stop = useCallback(() => {
    wantRecordingRef.current = false;
    cleanup();
    setRecording(false);
    setInterim("");
    onInterimRef.current?.("");
  }, [cleanup]);

  const start = useCallback((seedText = "") => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    // Si ya estaba grabando, paramos limpio antes de arrancar de nuevo.
    cleanup();

    finalRef.current = seedText ?? "";
    nextIndexRef.current = 0;
    setInterim("");
    onInterimRef.current?.("");
    onFinalRef.current?.(finalRef.current);

    const startInstance = () => {
      const recognition = new SR();
      recognitionRef.current = recognition;
      recognition.lang = lang;
      // Mantenemos modo continuo y, si el navegador corta tras un silencio,
      // re-arrancamos en onend para que el usuario pueda pensar o buscar una
      // imagen sin perder la sesión. La deduplicación de mergeFinal evita que
      // el bloque previo se repita aunque el navegador lo reemita.
      recognition.continuous = true;
      recognition.interimResults = true;
      // Reseteamos el índice porque cada instancia tiene su propia lista.
      nextIndexRef.current = 0;

      recognition.onresult = (event: any) => {
        let nextFinal = finalRef.current;
        let interimPart = "";
        const results = event.results;
        // Procesamos desde el siguiente índice no visto.
        for (let i = nextIndexRef.current; i < results.length; i++) {
          const r = results[i];
          const text = r[0]?.transcript ?? "";
          if (r.isFinal) {
            nextFinal = mergeFinal(nextFinal, text);
            // Avanzamos el cursor: este índice ya está confirmado.
            nextIndexRef.current = i + 1;
          } else {
            interimPart += text;
          }
        }
        if (nextFinal !== finalRef.current) {
          finalRef.current = nextFinal;
          onFinalRef.current?.(nextFinal);
        }
        const cleanInterim = interimPart.trim();
        setInterim(cleanInterim);
        onInterimRef.current?.(cleanInterim);
      };

      recognition.onerror = (e: any) => {
        const err = e?.error;
        // Errores benignos: dejamos que onend decida si reiniciar.
        if (err === "no-speech" || err === "aborted") return;
        // Errores duros: paramos completamente.
        wantRecordingRef.current = false;
        cleanup();
        setRecording(false);
        setInterim("");
        onInterimRef.current?.("");
      };

      recognition.onend = () => {
        if (wantRecordingRef.current) {
          // Reinicio controlado tras silencio. Esperamos un tick para no
          // colisionar con la instancia actual y re-creamos un reconocedor
          // limpio (índices a 0). El texto final ya confirmado se mantiene.
          restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (!wantRecordingRef.current) return;
            try {
              startInstance();
            } catch {
              wantRecordingRef.current = false;
              setRecording(false);
              setInterim("");
              onInterimRef.current?.("");
            }
          }, 80);
        } else {
          wantRecordingRef.current = false;
          setRecording(false);
          setInterim("");
          onInterimRef.current?.("");
        }
      };

      try {
        recognition.start();
      } catch {
        // Si el navegador se queja porque hay otra instancia, reintentamos breve.
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 120);
      }
    };

    wantRecordingRef.current = true;
    setRecording(true);
    startInstance();
  }, [cleanup, lang]);

  const toggle = useCallback((seedText = "") => {
    if (recording) stop();
    else start(seedText);
  }, [recording, start, stop]);

  const reset = useCallback((value = "") => {
    finalRef.current = value;
    setInterim("");
    onInterimRef.current?.("");
    onFinalRef.current?.(value);
  }, []);

  useEffect(() => {
    return () => {
      wantRecordingRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    recording,
    supported,
    interim,
    /** Texto confirmado acumulado en esta sesión. */
    getFinal: () => finalRef.current,
    start,
    stop,
    toggle,
    reset,
  };
}

/**
 * Combina el texto ya confirmado con un nuevo fragmento final,
 * evitando repeticiones inmediatas (tail dedup) que algunos navegadores
 * móviles producen al reemitir el último segmento.
 */
function mergeFinal(existing: string, addition: string): string {
  const add = addition.trim();
  if (!add) return existing;
  const base = existing.trimEnd();
  if (!base) return add;

  const baseLower = normalize(base);
  const addLower = normalize(add);

  // Caso 1: el nuevo fragmento ya está contenido al final del texto base.
  // Cubre el caso típico al pausar en móvil: el navegador reemite el último
  // bloque dictado en lugar de solo lo nuevo.
  if (baseLower.endsWith(addLower)) return existing;

  // Caso 1b: el nuevo fragmento está contenido completo en cualquier punto del
  // texto base (Chrome móvil a veces reemite el bloque entero al reanudar).
  if (addLower.length >= 8 && baseLower.includes(addLower)) {
    // Sólo lo descartamos si la coincidencia está cerca del final (últimos
    // 200 caracteres) para no perder repeticiones legítimas distantes.
    const tail = baseLower.slice(-Math.max(addLower.length + 200, 200));
    if (tail.includes(addLower)) return existing;
  }

  // Caso 2: solapamiento por palabras entre el final confirmado y el inicio
  // reemitido. Es el patrón móvil más problemático: tras una pausa llega
  // "frase anterior + palabras nuevas", y el solapamiento puede ser mucho más
  // largo que 80 caracteres.
  const wordOverlap = getWordOverlapCount(base, add);
  if (wordOverlap > 0) {
    const addWords = add.trim().split(/\s+/);
    const remainder = addWords.slice(wordOverlap).join(" ").trim();
    if (!remainder) return existing;
    const sep = base && !/\s$/.test(existing) ? " " : "";
    return `${base}${sep}${remainder}`;
  }

  // Caso 3: solapamiento parcial entre el final de base y el inicio de add.
  const maxOverlap = Math.min(baseLower.length, addLower.length, 80);
  let overlap = 0;
  for (let n = maxOverlap; n > 0; n--) {
    if (baseLower.slice(-n) === addLower.slice(0, n)) {
      // Validamos que el solapamiento esté en frontera de palabra para
      // no comernos contenido legítimo.
      const charBefore = baseLower.slice(-n - 1, -n);
      const charAfter = addLower.slice(n, n + 1);
      const wordBoundaryBefore = !charBefore || /\s/.test(charBefore);
      const wordBoundaryAfter = !charAfter || /\s/.test(charAfter) || n === addLower.length;
      if (wordBoundaryBefore && (wordBoundaryAfter || n >= 6)) {
        overlap = n;
        break;
      }
    }
  }

  const trimmedAdd = add.slice(overlap).trimStart();
  if (!trimmedAdd) return existing;

  const sep = base && !/\s$/.test(existing) ? " " : "";
  return `${base}${sep}${trimmedAdd}`;
}

/**
 * Normaliza para comparación: minúsculas, sin acentos, espacios colapsados y
 * sin signos de puntuación finales. Permite que la deduplicación detecte
 * "Hola mundo." == "hola mundo" cuando el navegador reemite el segmento.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?¡¿"'()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getWordOverlapCount(existing: string, addition: string): number {
  const baseWords = normalize(existing).split(" ").filter(Boolean);
  const addWords = normalize(addition).split(" ").filter(Boolean);
  const max = Math.min(baseWords.length, addWords.length, 80);

  for (let n = max; n >= 3; n--) {
    const baseTail = baseWords.slice(-n).join(" ");
    const addHead = addWords.slice(0, n).join(" ");
    if (baseTail === addHead) return n;
  }

  return 0;
}