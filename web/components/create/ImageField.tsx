"use client";

import { TOKEN_LIMITS } from "@lancio/shared";
import { Check, Crop, ImagePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import type { Area } from "react-easy-crop";
import { Button, Field, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CropDialog } from "./CropDialog";
import { CroppedImage } from "./CroppedImage";
import type { ImageUpload } from "./useImageUpload";

const TYPES: readonly string[] = TOKEN_LIMITS.imageTypes;
const MAX_MB = TOKEN_LIMITS.imageMaxBytes / (1024 * 1024);

type Pending = { file: File; src: string; initial?: Area };

/** Drop zone → 1:1 crop dialog → upload on confirm. Shows status, retry, re-crop, replace, remove. */
export function ImageField({ upload, disabled }: { upload: ImageUpload; disabled?: boolean }) {
  const { state } = upload;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const choose = () => inputRef.current?.click();

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return setPickError("Use a PNG, JPG, WEBP or GIF image.");
    if (file.size > TOKEN_LIMITS.imageMaxBytes) return setPickError(`Image must be ${MAX_MB} MB or smaller.`);
    setPickError(null);
    setPending({ file, src: URL.createObjectURL(file) });
  };

  const recrop = () => {
    const sel = upload.selection();
    if (sel) setPending({ file: sel.file, src: sel.src, initial: sel.pixels });
  };

  const cancelCrop = () => {
    if (pending && pending.src !== upload.selection()?.src) URL.revokeObjectURL(pending.src);
    setPending(null);
  };

  const confirmCrop = (pixels: Area, percent: Area) => {
    if (!pending) return;
    upload.start({ file: pending.file, src: pending.src, pixels, percent });
    setPending(null);
  };

  const drop = {
    onDragOver: (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (!disabled) pick(e.dataTransfer.files[0]);
    },
  };

  const error = pickError ?? (state.status === "error" ? state.message : undefined);
  const frame = cn(
    "flex items-center gap-4 rounded-2xl border bg-surface-2 p-3 transition-colors",
    dragOver ? "border-accent" : "border-border",
  );

  return (
    <Field
      label="Token image"
      htmlFor="token-image"
      error={error}
      hint={`PNG, JPG, WEBP or GIF, up to ${MAX_MB} MB. Cropped to a square.`}
    >
      {state.status === "empty" ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          onClick={() => !disabled && choose()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              choose();
            }
          }}
          className={cn(frame, "border-dashed hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none aria-disabled:opacity-60")}
          {...drop}
        >
          <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-surface text-muted">
            <ImagePlus size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">Choose image</span>
            <span className="block text-13 text-muted">or drop it here</span>
          </span>
        </div>
      ) : (
        <div className={frame} {...drop}>
          <CroppedImage preview={state.preview} alt="Token image" className="size-16 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{state.file.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-13">
              {state.status === "uploading" && (
                <>
                  <Spinner size={13} className="text-muted" />
                  <span className="text-muted">Uploading…</span>
                </>
              )}
              {state.status === "ready" && (
                <>
                  <Check size={14} className="text-accent-text" />
                  <span className="text-muted">Uploaded</span>
                </>
              )}
              {state.status === "error" && <span className="text-sell">Upload failed</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {state.status === "error" && (
              <Button variant="outline" size="sm" onClick={upload.retry} disabled={disabled}>
                <RefreshCw size={14} />
                Retry
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Crop image" title="Crop" onClick={recrop} disabled={disabled}>
              <Crop size={16} />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Replace image" title="Replace" onClick={choose} disabled={disabled}>
              <Upload size={16} />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Remove image" title="Remove" onClick={upload.clear} disabled={disabled}>
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        id="token-image"
        type="file"
        accept={TYPES.join(",")}
        tabIndex={-1}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {pending && (
        <CropDialog key={pending.src} src={pending.src} initialPixels={pending.initial} onCancel={cancelCrop} onConfirm={confirmCrop} />
      )}
    </Field>
  );
}
