import { cn } from "@/lib/utils";
import type { ImagePreview } from "./useImageUpload";

/** Shows the chosen square of a local image (object URL) without re-encoding — GIFs keep animating. */
export function CroppedImage({ preview, alt, className }: { preview: ImagePreview; alt: string; className?: string }) {
  const a = preview.area;
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-surface-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, nothing to optimize */}
      <img
        src={preview.src}
        alt={alt}
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: `${10000 / a.width}%`,
          height: `${10000 / a.height}%`,
          left: `${(-a.x * 100) / a.width}%`,
          top: `${(-a.y * 100) / a.height}%`,
        }}
      />
    </span>
  );
}
