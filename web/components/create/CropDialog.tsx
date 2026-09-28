"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button, Dialog } from "@/components/ui";

/** 1:1 crop. Mount with key={src} so crop/zoom reset for a new image. */
export function CropDialog({
  src,
  initialPixels,
  onCancel,
  onConfirm,
}: {
  src: string;
  initialPixels?: Area;
  onCancel: () => void;
  onConfirm: (pixels: Area, percent: Area) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areas, setAreas] = useState<{ pixels: Area; percent: Area } | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title="Crop image"
      description="The token image is square everywhere on Lancio."
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!areas} onClick={() => areas && onConfirm(areas.pixels, areas.percent)}>
            Use image
          </Button>
        </>
      }
    >
      <div className="relative h-72 overflow-hidden rounded-card bg-bg">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          maxZoom={4}
          aspect={1}
          showGrid={false}
          initialCroppedAreaPixels={initialPixels}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(percent, pixels) => setAreas({ percent, pixels })}
          style={{ cropAreaStyle: { border: "1px solid var(--accent)", color: "var(--overlay)" } }}
        />
      </div>
      <label className="mt-4 flex items-center gap-3 text-13 text-muted">
        Zoom
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-accent"
        />
      </label>
    </Dialog>
  );
}
