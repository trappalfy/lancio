"use client";

import { useCallback, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { uploadImage } from "./upload";

/** Local preview: object URL of the original file + the chosen square (percent of the image). */
export type ImagePreview = { src: string; area: Area };

export type ImageState =
  | { status: "empty" }
  | { status: "uploading"; file: File; preview: ImagePreview }
  | { status: "ready"; file: File; preview: ImagePreview; uri: string }
  | { status: "error"; file: File; preview: ImagePreview; message: string };

type Selection = { file: File; src: string; pixels: Area; percent: Area };

/** Uploads on selection (after the crop); keeps the last selection for retry and re-crop. */
export function useImageUpload() {
  const [state, setState] = useState<ImageState>({ status: "empty" });
  const current = useRef<Selection | null>(null);
  const abort = useRef<AbortController | null>(null);

  const start = useCallback((sel: Selection) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    if (current.current && current.current.src !== sel.src) URL.revokeObjectURL(current.current.src);
    current.current = sel;
    const base = { file: sel.file, preview: { src: sel.src, area: sel.percent } };
    setState({ status: "uploading", ...base });
    uploadImage(sel.file, sel.pixels, ctrl.signal).then(
      (r) => {
        if (!ctrl.signal.aborted) setState({ status: "ready", ...base, uri: r.uri });
      },
      (err: unknown) => {
        if (!ctrl.signal.aborted) {
          setState({ status: "error", ...base, message: err instanceof Error ? err.message : "Upload failed. Try again." });
        }
      },
    );
  }, []);

  const retry = useCallback(() => {
    if (current.current) start(current.current);
  }, [start]);

  const clear = useCallback(() => {
    abort.current?.abort();
    if (current.current) URL.revokeObjectURL(current.current.src);
    current.current = null;
    setState({ status: "empty" });
  }, []);

  /** The committed selection (for re-cropping with the same file). */
  const selection = useCallback(() => current.current, []);

  return { state, start, retry, clear, selection };
}

export type ImageUpload = ReturnType<typeof useImageUpload>;
