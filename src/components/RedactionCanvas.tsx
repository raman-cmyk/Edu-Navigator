import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

/*
 * Client-side redaction. The applicant drags black boxes over sensitive regions
 * (passport number, address, financial figures) and the boxes are burned into
 * the exported pixels — so the raw values never leave the device. This reduces
 * upload anxiety, the main drop-off in verification (docs/05 §verify step 3).
 *
 * (Auto-detection of sensitive regions needs OCR, which is out of V1 scope; this
 * is manual redaction with an explicit user confirm, which the RLS layer then
 * requires via redaction_applied = true.)
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function RedactionCanvas({
  imageDataUrl,
  onChange,
}: {
  imageDataUrl: string;
  onChange: (redactedDataUrl: string) => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<Box | null>(null);

  const redraw = useCallback(
    (extra: Box | null) => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);
      if (extra) ctx.fillRect(extra.x, extra.y, extra.w, extra.h);
    },
    [boxes],
  );

  // Load the image once, size the canvas to it (capped for perf).
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 1000;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      redraw(null);
      onChange(canvas.toDataURL('image/png'));
    };
    img.src = imageDataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl]);

  // Re-export whenever committed boxes change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    redraw(null);
    onChange(canvas.toDataURL('image/png'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes]);

  function toCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = toCanvasCoords(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return;
    const p = toCanvasCoords(e);
    const b = normalize(dragStart.current, p);
    setPreview(b);
    redraw(b);
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return;
    const p = toCanvasCoords(e);
    const b = normalize(dragStart.current, p);
    dragStart.current = null;
    setPreview(null);
    if (b.w > 4 && b.h > 4) setBoxes((prev) => [...prev, b]);
    else redraw(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="w-full touch-none rounded-md border border-rule"
        style={{ background: 'var(--sunk)', cursor: 'crosshair' }}
        aria-label={t('verify.redactAdd')}
      />
      <p className="mt-s2 text-micro text-stone">{t('verify.redactAdd')}</p>
      <div className="mt-s2 flex gap-s2">
        <Button
          variant="secondary"
          onClick={() => setBoxes((prev) => prev.slice(0, -1))}
          disabled={boxes.length === 0}
        >
          {t('verify.redactUndo')}
        </Button>
        <Button variant="ghost" onClick={() => setBoxes([])} disabled={boxes.length === 0}>
          {t('verify.redactClear')}
        </Button>
      </div>
      {preview && <span className="sr-only">drawing</span>}
    </div>
  );
}

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
