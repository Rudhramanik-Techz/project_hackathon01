import type { Box } from "../case/model";

/** Shows the part of the exact uploaded raster a value was read from (box in basis points, padded a little). */
export function Crop({ url, width, height, box, label }: { url: string; width: number; height: number; box: Box; label: string }) {
  const pad = 250; // 2.5 % of the image around the box
  const l = Math.max(0, box[0] - pad);
  const t = Math.max(0, box[1] - pad);
  const r = Math.min(10000, box[2] + pad);
  const b = Math.min(10000, box[3] + pad);
  const w = (r - l) / 10000;
  const h = (b - t) / 10000;
  const aspect = (w * width) / Math.max(1, h * height);
  const pos = (start: number, size: number) => (size >= 1 ? 0 : ((start / 10000) / (1 - size)) * 100);
  return (
    <div
      role="img"
      aria-label={label}
      className="crop"
      style={{
        aspectRatio: `${aspect}`,
        // Cap the width so height stays <= 5.5rem without distorting the crop on wide screens.
        maxWidth: `min(100%, calc(5.5rem * ${aspect.toFixed(3)}))`,
        backgroundImage: `url("${url}")`,
        backgroundSize: `${100 / w}% ${100 / h}%`,
        backgroundPosition: `${pos(l, w)}% ${pos(t, h)}%`,
      }}
    />
  );
}
