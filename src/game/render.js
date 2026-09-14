import { BULLET_RADIUS, COLORS, SHIP_RADIUS } from './constants.js'

function glow(ctx, color, blur = 12) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = blur
}

export function drawWorld(ctx, game, t) {
  const { w, h } = game
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#05070d'
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake)
  }

  drawStars(ctx, game, t)
  drawParticles(ctx, game)
  drawWreckage(ctx, game)
  for (const a of game.asteroids) drawAsteroid(ctx, a)
  for (const b of game.bullets) drawBullet(ctx, b, COLORS.bullet)
  for (const b of game.ufoBullets) drawBullet(ctx, b, COLORS.ufo)
  if (game.ufoWarning) drawUfoWarning(ctx, game, t)
  if (game.ufo) drawUfo(ctx, game.ufo, t)
  if (game.ship.alive) drawShip(ctx, game)
  if (game.mode === 'playing' && game.waveIn > 0.2) drawWaveBanner(ctx, game)

  ctx.restore()
  drawVignette(ctx, w, h)
}

function drawStars(ctx, game, t) {
  const wave = Math.max(1, game.wave || 1)
  const tint = wave >= 4 ? '#ffd7e6' : wave >= 2 ? '#e2f4ff' : '#d7e6ff'
  for (const s of game.stars) {
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * s.z + s.tw))
    ctx.globalAlpha = twinkle * Math.min(1, s.z)
    ctx.fillStyle = tint
    ctx.shadowBlur = 0
    ctx.fillRect(s.x, s.y, s.z, s.z)
  }
  ctx.globalAlpha = 1
}

function drawAsteroid(ctx, a) {
  const size = Number(a.size) || 2
  const flash = a.hitFlash > 0
  ctx.save()
  ctx.translate(a.x, a.y)
  ctx.rotate(a.angle)
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

function drawBullet(ctx, b, color) {
  glow(ctx, color, 14)
  ctx.beginPath()
  ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2)
  ctx.fill()
}

function drawShip(ctx, game) {
  const { ship, invuln } = game
  if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) return
  ctx.save()
  ctx.translate(ship.x, ship.y)
  ctx.rotate(ship.angle)
  glow(ctx, COLORS.ship, 10)
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

  if (game.muzzle > 0) {
    const flare = 6 + game.muzzle * 40
    glow(ctx, COLORS.bullet, 18)
    ctx.beginPath()
    ctx.moveTo(SHIP_RADIUS + 2, -3)
    ctx.lineTo(SHIP_RADIUS + flare, 0)
    ctx.lineTo(SHIP_RADIUS + 2, 3)
    ctx.stroke()
  }
  ctx.restore()
}

function drawUfoWarning(ctx, game, t) {
  const warn = game.ufoWarning
  if (!warn) return
  const pulse = 0.45 + 0.55 * Math.abs(Math.sin(t * 8))
  const x = warn.fromLeft ? 28 : game.w - 28
  ctx.save()
  ctx.globalAlpha = pulse
  glow(ctx, COLORS.ufo, 18)
  ctx.lineWidth = 2
  ctx.beginPath()
  if (warn.fromLeft) {
    ctx.moveTo(x - 10, warn.y)
    ctx.lineTo(x + 8, warn.y - 12)
    ctx.lineTo(x + 8, warn.y + 12)
  } else {
    ctx.moveTo(x + 10, warn.y)
    ctx.lineTo(x - 8, warn.y - 12)
    ctx.lineTo(x - 8, warn.y + 12)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function drawUfo(ctx, ufo, t) {
  ctx.save()
  ctx.translate(ufo.x, ufo.y)
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

function drawWreckage(ctx, game) {
  for (const w of game.wreckage ?? []) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, w.life / (w.max || 1.2))
    ctx.translate(w.x, w.y)
    ctx.rotate(w.angle)
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

function drawParticles(ctx, game) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / (p.max || 0.8))
    glow(ctx, p.color, 8)
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawWaveBanner(ctx, game) {
  ctx.save()
  ctx.globalAlpha = Math.min(1, game.waveIn)
  glow(ctx, COLORS.hud, 18)
  ctx.font = '700 42px Orbitron, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`SECTOR ${game.wave}`, game.w / 2, game.h / 2 - 20)
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
