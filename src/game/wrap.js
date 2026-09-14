export function wrap(v, max, r = 0) {
  if (v < -r) return max + r
  if (v > max + r) return -r
  return v
}

export function wrapDelta(a, b, size) {
  let d = a - b
  const half = size * 0.5
  if (d > half) d -= size
  if (d < -half) d += size
  return d
}

export function wrapDist(a, b, w, h) {
  const dx = wrapDelta(a.x, b.x, w)
  const dy = wrapDelta(a.y, b.y, h)
  return Math.hypot(dx, dy)
}

export function wrapToward(from, to, size) {
  return from + wrapDelta(to, from, size)
}
