import { wrapDist } from './wrap.js'

/**
 * musicIntensity (0–1) from danger signals, with attack/release smoothing
 * so layers do not flicker between calm / moderate / tense.
 *
 * raw =
 *   0.32 * asteroidMass   (count × size, capped)
 * + 0.22 * proximity      (nearest rock / UFO bullet, wrap-aware)
 * + 0.28 * ufoThreat      (presence + closeness)
 * + 0.18 * combat         (recent shots + incoming fire)
 * + healthPressure        (low lives)
 *
 * Attack is faster than release so spikes feel immediate, then ease back.
 */

const ATTACK = 1.85
const RELEASE = 0.52

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

export { wrapDelta, wrapDist } from './wrap.js'

export function computeRawIntensity(game) {
  const { w, h, asteroids, ship, ufo, ufoBullets, lives, mode } = game
  if (mode !== 'playing') {
    const field = Math.min(1, (asteroids?.length ?? 0) / 14)
    return 0.08 + field * 0.1
  }

  const diag = Math.hypot(w, h)
  let mass = 0
  let nearestRock = diag
  for (const a of asteroids) {
    mass += a.size / 3
    if (ship?.alive) {
      nearestRock = Math.min(nearestRock, wrapDist(ship, a, w, h) - a.r)
    }
  }
  const asteroidMass = clamp01(mass / 10)
  const proximity = ship?.alive ? clamp01(1 - nearestRock / (diag * 0.22)) : 0

  let ufoThreat = 0
  if (ufo && ship?.alive) {
    const d = wrapDist(ship, ufo, w, h)
    ufoThreat = 0.38 + 0.62 * clamp01(1 - d / (diag * 0.45))
  } else if (ufo) {
    ufoThreat = 0.28
  }

  const now = performance.now()
  const shotAge = (now - (game.lastShotAt ?? 0)) / 1000
  const shoot = clamp01(1 - shotAge / 2.4)
  let incoming = 0
  if (ship?.alive && ufoBullets?.length) {
    let nearest = diag
    for (const b of ufoBullets) nearest = Math.min(nearest, wrapDist(ship, b, w, h))
    incoming = clamp01(1 - nearest / 220)
  }
  const combat = clamp01(shoot * 0.55 + incoming * 0.7 + (game.nearMissPulse ?? 0))

  const health = lives <= 1 ? 0.28 : lives <= 2 ? 0.12 : 0

  return clamp01(
    asteroidMass * 0.32 +
      proximity * 0.22 +
      ufoThreat * 0.28 +
      combat * 0.18 +
      health,
  )
}

export function layerMix(intensity) {
  const i = clamp01(intensity)
  return {
    ambient: 0.5 + i * 0.5,
    calm: clamp01(1 - i / 0.42),
    moderate: clamp01(1 - Math.abs(i - 0.5) / 0.38),
    tense: clamp01((i - 0.52) / 0.48),
  }
}

export class IntensitySmoother {
  constructor(initial = 0.12) {
    this.value = initial
  }

  step(raw, dt) {
    const target = clamp01(raw)
    const rate = target > this.value ? ATTACK : RELEASE
    const t = 1 - Math.exp(-rate * Math.max(0, dt))
    this.value += (target - this.value) * t
    return this.value
  }
}
