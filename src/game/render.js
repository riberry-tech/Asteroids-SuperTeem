import { BULLET_RADIUS, COLORS, SHIP_RADIUS, WORLD_H, WORLD_W } from './constants.js'
import { inView, worldToView } from './camera.js'
import { wrapDelta } from './wrap.js'

function glow(ctx, color, blur = 12) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = blur
}

function wrapCopies(cam) {
  if (cam.mode === 'fit') {
    const copies = []
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) copies.push({ ox: i * WORLD_W, oy: j * WORLD_H })
    }
    return copies
  }
  return [{ ox: 0, oy: 0 }]
}

function at(cam, x, y, ox, oy) {
  if (cam.mode === 'fit') {
    const scale = cam.scale
    const ox0 = (cam.viewW - WORLD_W * scale) / 2
    const oy0 = (cam.viewH - WORLD_H * scale) / 2
    return { x: ox0 + (x + ox) * scale, y: oy0 + (y + oy) * scale }
  }
  return worldToView(cam, x, y)
}

export function drawWorld(ctx, game, t) {
  const cam = game.camera
  const viewW = cam.viewW
  const viewH = cam.viewH
  ctx.clearRect(0, 0, viewW, viewH)
  ctx.fillStyle = '#05070d'
  ctx.fillRect(0, 0, viewW, viewH)

  ctx.save()
  if (cam.mode === 'fit') {
    const ox0 = (cam.viewW - WORLD_W * cam.scale) / 2
    const oy0 = (cam.viewH - WORLD_H * cam.scale) / 2
    ctx.beginPath()
    ctx.rect(ox0, oy0, WORLD_W * cam.scale, WORLD_H * cam.scale)
    ctx.clip()
  }
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake)
  }

  const copies = wrapCopies(cam)
  drawStars(ctx, game, t, copies)
  for (const c of copies) {
    drawParticles(ctx, game, cam, c)
    drawWreckage(ctx, game, cam, c)
    for (const a of game.asteroids) drawAsteroid(ctx, a, cam, c)
    for (const b of game.bullets) drawBullet(ctx, b, COLORS.bullet, cam, c)
    for (const b of game.ufoBullets) drawBullet(ctx, b, COLORS.ufo, cam, c)
    if (game.ufo) drawUfo(ctx, game.ufo, t, cam, c)
    for (const ship of game.ships ?? []) {
      if (ship.alive) drawShip(ctx, ship, cam, c)
    }
  }
  if (game.ufoWarning) drawUfoWarning(ctx, game, t, cam)
  if (game.mode === 'playing' && game.waveIn > 0.2) drawWaveBanner(ctx, game, cam)

  ctx.restore()
  drawVignette(ctx, viewW, viewH)
  if (cam.mode === 'follow' && game.mode === 'playing') drawOffscreenTicks(ctx, game, cam)
}

function drawStars(ctx, game, t, copies) {
  const wave = Math.max(1, game.wave || 1)
  const tint = wave >= 4 ? '#ffd7e6' : wave >= 2 ? '#e2f4ff' : '#d7e6ff'
  const cam = game.camera
  for (const c of copies) {
    for (const s of game.stars) {
      const p = at(cam, s.x, s.y, c.ox, c.oy)
      if (p.x < -4 || p.y < -4 || p.x > cam.viewW + 4 || p.y > cam.viewH + 4) continue
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * s.z + s.tw))
      ctx.globalAlpha = twinkle * Math.min(1, s.z)
      ctx.fillStyle = tint
      ctx.shadowBlur = 0
      ctx.fillRect(p.x, p.y, s.z, s.z)
    }
  }
  ctx.globalAlpha = 1
}

function drawAsteroid(ctx, a, cam, c) {
  const p = at(cam, a.x, a.y, c.ox, c.oy)
  const size = Number(a.size) || 2
  const flash = a.hitFlash > 0
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(a.angle)
  ctx.scale(cam.scale, cam.scale)
  ctx.beginPath()
  a.verts.forEach((v, i) => {
    if (i === 0) ctx.moveTo(v.x, v.y)
    else ctx.lineTo(v.x, v.y)
  })
  ctx.closePath()
  ctx.fillStyle = flash ? 'rgba(255,255,255,0.22)' : 'rgba(197, 208, 220, 0.12)'
  ctx.shadowBlur = 0
  ctx.fill()
  glow(ctx, flash ? '#ffffff' : COLORS.asteroid, flash ? 16 : 8)
  ctx.lineWidth = size >= 3 ? 2.4 : size === 2 ? 1.8 : 1.35
  ctx.stroke()
  ctx.restore()
}

function drawBullet(ctx, b, color, cam, c) {
  const p = at(cam, b.x, b.y, c.ox, c.oy)
  glow(ctx, color, 14)
  ctx.beginPath()
  ctx.arc(p.x, p.y, BULLET_RADIUS * cam.scale, 0, Math.PI * 2)
  ctx.fill()
}

function drawShip(ctx, ship, cam, c) {
  if (ship.invuln > 0 && Math.floor(ship.invuln * 12) % 2 === 0) return
  const p = at(cam, ship.x, ship.y, c.ox, c.oy)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(ship.angle)
  ctx.scale(cam.scale, cam.scale)
  glow(ctx, ship.color ?? COLORS.ship, 10)
  ctx.lineWidth = 1.8
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(SHIP_RADIUS + 2, 0)
  ctx.lineTo(-SHIP_RADIUS, 8)
  ctx.lineTo(-SHIP_RADIUS + 4, 0)
  ctx.lineTo(-SHIP_RADIUS, -8)
  ctx.closePath()
  ctx.stroke()

  if (ship.thrusting) {
    const flicker = 8 + Math.random() * 7
    glow(ctx, COLORS.thrust, 16)
    ctx.beginPath()
    ctx.moveTo(-SHIP_RADIUS + 2, 4)
    ctx.lineTo(-SHIP_RADIUS - flicker, 0)
    ctx.lineTo(-SHIP_RADIUS + 2, -4)
    ctx.stroke()
  }

  if (ship.muzzle > 0) {
    const flare = 6 + ship.muzzle * 40
    glow(ctx, COLORS.bullet, 18)
    ctx.beginPath()
    ctx.moveTo(SHIP_RADIUS + 2, -3)
    ctx.lineTo(SHIP_RADIUS + flare, 0)
    ctx.lineTo(SHIP_RADIUS + 2, 3)
    ctx.stroke()
  }
  ctx.restore()
}

function drawUfoWarning(ctx, game, t, cam) {
  const warn = game.ufoWarning
  if (!warn) return
  const x = warn.fromLeft ? 28 : WORLD_W - 28
  const p = at(cam, x, warn.y, 0, 0)
  const pulse = 0.45 + 0.55 * Math.abs(Math.sin(t * 8))
  ctx.save()
  ctx.globalAlpha = pulse
  glow(ctx, COLORS.ufo, 18)
  ctx.lineWidth = 2
  ctx.beginPath()
  const s = cam.scale
  if (warn.fromLeft) {
    ctx.moveTo(p.x - 10 * s, p.y)
    ctx.lineTo(p.x + 8 * s, p.y - 12 * s)
    ctx.lineTo(p.x + 8 * s, p.y + 12 * s)
  } else {
    ctx.moveTo(p.x + 10 * s, p.y)
    ctx.lineTo(p.x - 8 * s, p.y - 12 * s)
    ctx.lineTo(p.x - 8 * s, p.y + 12 * s)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function drawUfo(ctx, ufo, t, cam, c) {
  const p = at(cam, ufo.x, ufo.y, c.ox, c.oy)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(cam.scale, cam.scale)
  glow(ctx, COLORS.ufo, 12)
  ctx.lineWidth = 1.7
  ctx.beginPath()
  ctx.ellipse(0, 0, 18, 6, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, -4, 9, 6, 0, Math.PI, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 10)
  for (const x of [-6, 0, 6]) {
    ctx.beginPath()
    ctx.arc(x, 0, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawWreckage(ctx, game, cam, c) {
  for (const w of game.wreckage ?? []) {
    const p = at(cam, w.x, w.y, c.ox, c.oy)
    ctx.save()
    ctx.globalAlpha = Math.max(0, w.life / (w.max || 1.2))
    ctx.translate(p.x, p.y)
    ctx.rotate(w.angle)
    ctx.scale(cam.scale, cam.scale)
    glow(ctx, w.color, 8)
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(w.x1, w.y1)
    ctx.lineTo(w.x2, w.y2)
    ctx.stroke()
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

function drawParticles(ctx, game, cam, c) {
  for (const p of game.particles) {
    const q = at(cam, p.x, p.y, c.ox, c.oy)
    ctx.globalAlpha = Math.max(0, p.life / (p.max || 0.8))
    glow(ctx, p.color, 8)
    ctx.beginPath()
    ctx.arc(q.x, q.y, p.size * cam.scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawWaveBanner(ctx, game, cam) {
  ctx.save()
  ctx.globalAlpha = Math.min(1, game.waveIn)
  glow(ctx, COLORS.hud, 18)
  ctx.font = '700 42px Orbitron, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`SECTOR ${game.wave}`, cam.viewW / 2, cam.viewH / 2 - 20)
  ctx.restore()
}

function drawVignette(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = g
  ctx.shadowBlur = 0
  ctx.fillRect(0, 0, w, h)
}

function drawOffscreenTicks(ctx, game, cam) {
  const local = game.ship
  if (!local) return
  const marks = []
  for (const ship of game.ships) {
    if (ship.userId === local.userId || !ship.alive) continue
    if (!inView(cam, ship.x, ship.y, 24)) marks.push({ x: ship.x, y: ship.y, color: ship.color ?? COLORS.ship })
  }
  if (game.ufo && !inView(cam, game.ufo.x, game.ufo.y, 24)) {
    marks.push({ x: game.ufo.x, y: game.ufo.y, color: COLORS.ufo })
  }
  const pad = 18
  for (const m of marks) {
    const dx = wrapDelta(m.x, cam.x, WORLD_W)
    const dy = wrapDelta(m.y, cam.y, WORLD_H)
    const sx = cam.viewW / 2 + dx * cam.scale
    const sy = cam.viewH / 2 + dy * cam.scale
    const x = Math.min(cam.viewW - pad, Math.max(pad, sx))
    const y = Math.min(cam.viewH - pad, Math.max(pad, sy))
    ctx.save()
    glow(ctx, m.color, 10)
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}
