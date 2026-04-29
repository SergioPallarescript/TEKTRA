import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { useVoiceDictation } from "./useVoiceDictation";

/**
 * Dictado por voz unificado web (Web Speech API) + nativo
 * (@capacitor-community/speech-recognition v7, Capacitor 8).
 *
 * IMPORTANTE Android: SpeechRecognition.start() en Android NO devuelve
 * Promise resoluble — es event-based. Hacer `await sr.start()` provoca
 * el error: 'SpeechRecognition.then()' is not implemented on android.
 * Por eso lo invocamos sin await y consumimos resultados vía listeners.
 */
export function useNativeVoiceDictation(opts?: {
  lang?: string;
  onFinalChange?: (finalText: string) => void;
  onInterimChange?: (interimText: string) => void;
}) {
  const isNative = Capacitor.isNativePlatform();
  const webHook = useVoiceDictation(opts);

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
  const finalRef = useRef("");
  const interimRef = useRef("");

  // Comprobación de disponibilidad sólo en nativo.
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    (async () => {
      try {
        const avail = await SpeechRecognition.available();
        if (!cancelled) setSupported(!!avail?.available);
      } catch (e) {
        console.warn("[dictation] available() error", e);
        if (!cancelled) setSupported(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNative]);

  const removeListeners = useCallback(async () => {
    try { await SpeechRecognition.removeAllListeners(); } catch {}
  }, []);

  const stop = useCallback(async () => {
    if (!isNative) return webHook.stop();
    try { await SpeechRecognition.stop(); } catch {}
    await removeListeners();
    // Consolida cualquier interim como final.
    const merged = mergeWithSpace(finalRef.current, interimRef.current);
    if (merged !== finalRef.current) {
      finalRef.current = merged;
      onFinalRef.current?.(merged);
    }
    interimRef.current = "";
    setInterim("");
    onInterimRef.current?.("");
    setRecording(false);
  }, [isNative, webHook, removeListeners]);

  const start = useCallback(async (seedText = "") => {
    if (!isNative) return webHook.start(seedText);
    try {
      // 1) Permisos explícitos.
      const perm = await SpeechRecognition.checkPermissions();
      if (perm?.speechRecognition !== "granted") {
        const req = await SpeechRecognition.requestPermissions();
        if (req?.speechRecognition !== "granted") {
          setSupported(false);
          return;
        }
      }

      // 2) Disponibilidad (idiomas/servicios instalados).
      const avail = await SpeechRecognition.available();
      if (!avail?.available) {
        setSupported(false);
        return;
      }

      // 3) Reset estado y limpieza de listeners previos.
      await removeListeners();
      finalRef.current = seedText ?? "";
      onFinalRef.current?.(finalRef.current);
      interimRef.current = "";
      setInterim("");
      onInterimRef.current?.("");

      // 4) Listeners ANTES de start.
      await SpeechRecognition.addListener("partialResults", (data: any) => {
        const matches: string[] = data?.matches || [];
        const text = (matches[0] || "").trim();
        interimRef.current = text;
        setInterim(text);
        onInterimRef.current?.(text);
      });

      await SpeechRecognition.addListener("listeningState", (state: any) => {
        // Algunos devices: { status: 'started' | 'stopped' }
        const status = state?.status ?? state;
        if (status === "stopped") {
          const merged = mergeWithSpace(finalRef.current, interimRef.current);
          if (merged !== finalRef.current) {
            finalRef.current = merged;
            onFinalRef.current?.(merged);
          }
          interimRef.current = "";
          setInterim("");
          onInterimRef.current?.("");
          setRecording(false);
          // Limpia listeners para evitar duplicados en próximas sesiones.
          void removeListeners();
        }
      });

      // 5) start SIN await — en Android es fire-and-forget.
      // Hacer await aquí lanza: 'SpeechRecognition.then()' is not implemented on android.
      setRecording(true);
      SpeechRecognition.start({
        language: lang,
        maxResults: 1,
        prompt: "",
        partialResults: true,
        popup: false,
      });
    } catch (err) {
      console.warn("[useNativeVoiceDictation] start error", err);
      setRecording(false);
      await removeListeners();
    }
  }, [isNative, webHook, lang, removeListeners]);

  const toggle = useCallback((seedText = "") => {
    if (!isNative) return webHook.toggle(seedText);
    if (recording) void stop();
    else void start(seedText);
  }, [isNative, webHook, recording, start, stop]);

  const reset = useCallback((value = "") => {
    if (!isNative) return webHook.reset(value);
    finalRef.current = value;
    interimRef.current = "";
    setInterim("");
    onInterimRef.current?.("");
    onFinalRef.current?.(value);
  }, [isNative, webHook]);

  useEffect(() => {
    return () => {
      if (!isNative) return;
      void (async () => {
        try { await SpeechRecognition.stop(); } catch {}
        try { await SpeechRecognition.removeAllListeners(); } catch {}
      })();
    };
  }, [isNative]);

  if (!isNative) return webHook;

  return {
    recording,
    supported,
    interim,
    getFinal: () => finalRef.current,
    start,
    stop,
    toggle,
    reset,
  };
}

function mergeWithSpace(base: string, addition: string): string {
  const b = (base || "").trimEnd();
  const a = (addition || "").trim();
  if (!a) return base;
  if (!b) return a;
  return `${b} ${a}`;
}