/** Placement letterbox : loger `content` [w,h] dans `viewport` [w,h] sans déformation.
 *  Miroir JS de `layout::fit_scale` (Rust) — plus grande échelle ≤ 1, centrée. */
export function fitScale(content, viewport) {
  const cw = Math.max(1, content[0]);
  const ch = Math.max(1, content[1]);
  const vw = Math.max(1, viewport[0]);
  const vh = Math.max(1, viewport[1]);
  const scale = Math.min(vw / cw, vh / ch, 1.0);
  const width = Math.round(cw * scale);
  const height = Math.round(ch * scale);
  const x = Math.round((vw - width) / 2);
  const y = Math.round((vh - height) / 2);
  return { scale, x, y, width, height };
}
