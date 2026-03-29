import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string | null;
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, { disabled?: boolean }>(function SignatureCanvas(
  { disabled = false },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(wrapper.clientWidth, 280);
    const height = 180;
    const context = canvas.getContext("2d");

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#111111";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  const getPoint = (event: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const { x, y } = getPoint(event);
    drawingRef.current = true;
    hasStrokeRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = getPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.getContext("2d")?.closePath();
    if (event) canvasRef.current?.releasePointerCapture(event.pointerId);
  };

  const clear = useCallback(() => {
    hasStrokeRef.current = false;
    setupCanvas();
  }, [setupCanvas]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty: () => !hasStrokeRef.current,
      toDataUrl: () => (hasStrokeRef.current ? canvasRef.current?.toDataURL("image/png") || null : null),
    }),
    [clear],
  );

  return (
    <div ref={wrapperRef} className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full rounded-md border border-border bg-card touch-none"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={() => stopDrawing()}
      />
      <p className="text-xs text-muted-foreground">
        Firme con el dedo o stylus dentro del recuadro.
      </p>
    </div>
  );
});

export default SignatureCanvas;