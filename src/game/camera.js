import { CAM_DEADZONE, CAM_FOLLOW, MAX_FOV_H, MAX_FOV_W, WORLD_H, WORLD_W } from './constants.js'
import { wrap, wrapDelta } from './wrap.js'

export function fitScale(viewW, viewH) {
  return Math.min(viewW / WORLD_W, viewH / WORLD_H)
}

export function followScale(viewW, viewH) {
  return Math.max(viewW / MAX_FOV_W, viewH / MAX_FOV_H)
}

export function createCamera(mode = 'fit') {
  return {
    mode,
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    scale: 1,
    viewW: 1280,
    viewH: 720,
  }
}

export function syncCamera(cam, viewW, viewH, ship, dt) {
  cam.viewW = viewW
  cam.viewH = viewH
  if (cam.mode === 'fit') {
    cam.x = WORLD_W / 2
    cam.y = WORLD_H / 2
    cam.scale = fitScale(viewW, viewH)
    return cam
  }

  cam.scale = followScale(viewW, viewH)
  if (!ship) return cam

  const dx = wrapDelta(ship.x, cam.x, WORLD_W)
  const dy = wrapDelta(ship.y, cam.y, WORLD_H)
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const pullX = adx > CAM_DEADZONE ? dx - Math.sign(dx) * CAM_DEADZONE : 0
  const pullY = ady > CAM_DEADZONE ? dy - Math.sign(dy) * CAM_DEADZONE : 0
  const t = 1 - Math.exp(-CAM_FOLLOW * Math.max(0, dt))
  cam.x = wrap(cam.x + pullX * t, WORLD_W)
  cam.y = wrap(cam.y + pullY * t, WORLD_H)
  return cam
}

export function worldToView(cam, x, y, ox = 0, oy = 0) {
  const dx = wrapDelta(x + ox, cam.x, WORLD_W)
  const dy = wrapDelta(y + oy, cam.y, WORLD_H)
  return {
    x: cam.viewW / 2 + dx * cam.scale,
    y: cam.viewH / 2 + dy * cam.scale,
  }
}

export function inView(cam, x, y, pad = 40) {
  const p = worldToView(cam, x, y)
  return p.x > -pad && p.y > -pad && p.x < cam.viewW + pad && p.y < cam.viewH + pad
}
