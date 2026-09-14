import {
  ASTEROID_RADIUS,
  ASTEROID_SCORE,
  ASTEROID_SPAWN_GRACE,
  ASTEROID_SPEED,
  BULLET_LIFETIME,
  BULLET_RADIUS,
  BULLET_SPEED,
  COLORS,
  EXTRA_LIFE_EVERY,
  FIRE_COOLDOWN,
  HYPERSPACE_COOLDOWN,
  HYPERSPACE_INVULN,
  INVULN_TIME,
  MAX_PLAYERS,
  MUZZLE_TIME,
  RESPAWN_DELAY,
  SHIP_COLORS,
  SHIP_HIT_RADIUS,
  SHIP_MAX_SPEED,
  SHIP_RADIUS,
  SHIP_ROTATION,
  SHIP_ROTATION_ACCEL,
  SHIP_ROTATION_MAX,
  SHIP_THRUST,
  STARTING_LIVES,
  UFO_BULLET_SPEED,
  UFO_FIRE_COOLDOWN,
  UFO_RADIUS,
  UFO_SCORE,
  UFO_SPEED,
  UFO_WARN_TIME,
  WAVE_BASE,
  WAVE_CAP,
  WAVE_GROWTH,
  WAVE_PAUSE,
  WORLD_H,
  WORLD_W,
} from './constants.js'
import { wrap, wrapDelta, wrapDist } from './wrap.js'

export const EMPTY_INPUT = {
  left: false,
  right: false,
  thrust: false,
  fire: false,
  hyperspace: false,
}

const rand = (a, b, rng) => a + rng() * (b - a)

const dist2 = (a, b) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

const clampMag = (vx, vy, max) => {
  const m = Math.hypot(vx, vy)
  if (m <= max || m === 0) return { vx, vy }
  const s = max / m
  return { vx: vx * s, vy: vy * s }
}

export function makeStars(w, h, rng = Math.random) {
  return Array.from({ length: 140 }, () => ({
    x: rng() * w,
    y: rng() * h,
    z: rand(0.25, 1.4, rng),
    tw: rng() * Math.PI * 2,
  }))
}

function asteroidVerts(radius, rng) {
  const count = 9 + Math.floor(rng() * 5)
  const verts = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const jagged = radius * rand(0.68, 1.12, rng)
    verts.push({ x: Math.cos(a) * jagged, y: Math.sin(a) * jagged })
  }
  return verts
}

export function spawnAsteroid(w, h, size, x, y, kickAngle, kickSpeed, rng = Math.random) {
  const tier = size === 3 || size === 2 || size === 1 ? size : 3
  const [minS, maxS] = ASTEROID_SPEED[tier]
  const radius = ASTEROID_RADIUS[tier]
  const angle = kickAngle ?? rand(0, Math.PI * 2, rng)
  const speed = kickSpeed ?? rand(minS, maxS, rng)
  let px = x
  let py = y
  if (px == null) {
    const edge = Math.floor(rng() * 4)
    if (edge === 0) {
      px = rand(0, w, rng)
      py = -20
    } else if (edge === 1) {
      px = rand(0, w, rng)
      py = h + 20
    } else if (edge === 2) {
      px = -20
      py = rand(0, h, rng)
    } else {
      px = w + 20
      py = rand(0, h, rng)
    }
  }
  return {
    x: px,
    y: py,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    spin: rand(-1.2, 1.2, rng),
    angle: rand(0, Math.PI * 2, rng),
    size: tier,
    r: radius,
    verts: asteroidVerts(radius, rng),
    grace: 0,
    hitFlash: 0,
  }
}

export class WorldSim {
  constructor({ rng = Math.random, roster = [{ userId: 'solo' }] } = {}) {
    this.rng = rng
    this.w = WORLD_W
    this.h = WORLD_H
    this.stars = makeStars(this.w, this.h, rng)
    this.asteroidMomentum = 0.3
    this.tickSeq = 0
    this.effects = []
    this.setRoster(roster)
    this.resetMatch()
    this.mode = 'menu'
  }

  setRoster(roster) {
    const list = (roster ?? []).filter((p) => p?.userId).slice(0, MAX_PLAYERS)
    this.roster = list.length ? list : [{ userId: 'solo' }]
  }

  shipFor(userId) {
    return this.ships.find((s) => s.userId === userId) ?? null
  }

  aliveShips() {
    return this.ships.filter((s) => s.alive)
  }

  resetMatch() {
    this.score = 0
    this.lives = STARTING_LIVES
    this.wave = 0
    this.nextLifeAt = EXTRA_LIFE_EVERY
    this.waveIn = 0
    this.ufoTimer = 18
    this.asteroids = []
    this.bullets = []
    this.ufoBullets = []
    this.particles = []
    this.wreckage = []
    this.ufo = null
    this.ufoWarning = null
    this.shake = 0
    this.frame = 0
    this.pendingScore = 0
    this.ships = this.roster.map((p, i) => this.makeShip(p.userId, i, this.roster.length))
    for (const s of this.ships) s.alive = false
  }

  seedAttract() {
    this.asteroids = []
    for (let i = 0; i < 7; i++) {
      const size = this.rng() < 0.55 ? 3 : 2
      this.asteroids.push(spawnAsteroid(this.w, this.h, size, undefined, undefined, undefined, undefined, this.rng))
    }
  }

  makeShip(userId, index = 0, count = 1) {
    const spread = count <= 1 ? 0 : (index / count) * Math.PI * 2
    const radius = count <= 1 ? 0 : 140
    return {
      userId,
      color: SHIP_COLORS[index % SHIP_COLORS.length],
      x: this.w / 2 + Math.cos(spread) * radius,
      y: this.h / 2 + Math.sin(spread) * radius,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      alive: true,
      thrusting: false,
      invuln: 0,
      respawnIn: 0,
      fireCd: 0,
      hyperCd: 0,
      muzzle: 0,
      fireWasCharging: false,
      rotDir: 0,
      rotSpeed: SHIP_ROTATION,
    }
  }

  startMatch() {
    this.resetMatch()
    this.mode = 'playing'
    this.ships = this.roster.map((p, i) => {
      const ship = this.makeShip(p.userId, i, this.roster.length)
      ship.invuln = INVULN_TIME
      return ship
    })
    this.beginWave()
  }

  removeShip(userId) {
    this.ships = this.ships.filter((s) => s.userId !== userId)
    this.roster = this.roster.filter((p) => p.userId !== userId)
    this.bullets = this.bullets.filter((b) => b.ownerId !== userId)
  }

  beginWave() {
    this.wave += 1
    this.waveIn = WAVE_PAUSE
    this.pushEffect({ type: 'wave', wave: this.wave })
  }

  spawnWave() {
    const count = Math.min(WAVE_CAP, WAVE_BASE + (this.wave - 1) * WAVE_GROWTH)
    const rocks = []
    const rng = this.rng
    for (let i = 0; i < count; i++) {
      let rock
      let tries = 0
      do {
        rock = spawnAsteroid(this.w, this.h, 3, undefined, undefined, undefined, undefined, rng)
        tries += 1
      } while (this.ships.some((s) => dist2(rock, s) < 220 * 220) && tries < 20)
      rocks.push(rock)
    }
    this.asteroids.push(...rocks)
  }

  updateAttract(dt) {
    if (this.asteroids.length === 0) this.seedAttract()
    this.updateAsteroids(dt)
    this.updateParticles(dt)
    this.updateWreckage(dt)
  }

  updateAftermath(dt) {
    this.updateAsteroids(dt)
    this.updateBullets(dt)
    this.updateParticles(dt)
    this.updateWreckage(dt)
  }

  update(dt, inputsByUserId = {}) {
    this.effects = []
    this.pendingScore = 0
    this.tickSeq += 1
    this.frame += 1
    this.shake = Math.max(0, this.shake - dt * 18)

    for (const a of this.asteroids) {
      a.hitFlash = Math.max(0, (a.hitFlash ?? 0) - dt)
      a.grace = Math.max(0, (a.grace ?? 0) - dt)
    }

    if (this.waveIn > 0) {
      this.waveIn -= dt
      if (this.waveIn <= 0) this.spawnWave()
    }

    for (const ship of this.ships) {
      ship.fireCd = Math.max(0, ship.fireCd - dt)
      if (ship.fireWasCharging && ship.fireCd <= 0) this.pushEffect({ type: 'cannonReady', userId: ship.userId })
      ship.fireWasCharging = ship.fireCd > 0
      ship.hyperCd = Math.max(0, ship.hyperCd - dt)
      ship.invuln = Math.max(0, ship.invuln - dt)
      ship.muzzle = Math.max(0, ship.muzzle - dt)

      if (ship.respawnIn > 0) {
        ship.respawnIn -= dt
        if (ship.respawnIn <= 0 && this.mode === 'playing' && this.lives > 0 && !ship.alive) {
          const idx = this.ships.indexOf(ship)
          const next = this.makeShip(ship.userId, idx, this.ships.length)
          next.invuln = INVULN_TIME
          this.ships[idx] = next
        }
      }
    }

    for (const ship of this.ships) {
      const input = inputsByUserId[ship.userId] ?? EMPTY_INPUT
      this.updateShip(dt, ship, input)
    }

    this.updateAsteroids(dt)
    this.updateBullets(dt)
    this.updateUfo(dt)
    this.updateParticles(dt)
    this.updateWreckage(dt)
    this.collide()
    this.flushScoreAndGameover()

    if (
      this.asteroids.length === 0 &&
      this.waveIn <= 0 &&
      this.mode === 'playing' &&
      this.lives > 0
    ) {
      this.beginWave()
    }

    return this.effects
  }

  updateShip(dt, ship, input) {
    if (!ship.alive) {
      ship.thrusting = false
      return
    }

    const left = Boolean(input.left)
    const right = Boolean(input.right)
    const dir = (right ? 1 : 0) - (left ? 1 : 0)
    if (dir === 0 || dir !== ship.rotDir) ship.rotSpeed = SHIP_ROTATION
    ship.rotDir = dir
    if (dir !== 0) {
      ship.rotSpeed = Math.min(SHIP_ROTATION_MAX, ship.rotSpeed + SHIP_ROTATION_ACCEL * dt)
      ship.angle += dir * ship.rotSpeed * dt
    }

    ship.thrusting = Boolean(input.thrust)
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dt
      ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dt
      const capped = clampMag(ship.vx, ship.vy, SHIP_MAX_SPEED)
      ship.vx = capped.vx
      ship.vy = capped.vy
      this.spawnThrust(ship)
    }

    if (input.fire && ship.fireCd <= 0) this.shoot(ship)
    if (input.hyperspace && ship.hyperCd <= 0) this.hyperspace(ship)

    ship.x = wrap(ship.x + ship.vx * dt, this.w, SHIP_RADIUS)
    ship.y = wrap(ship.y + ship.vy * dt, this.h, SHIP_RADIUS)
  }

  predictShip(dt, ship, input) {
    this.updateShip(dt, ship, input)
  }

  spawnThrust(ship) {
    const back = ship.angle + Math.PI
    for (let i = 0; i < 2; i++) {
      const spread = rand(-0.35, 0.35, this.rng)
      this.particles.push({
        x: ship.x + Math.cos(back) * 12,
        y: ship.y + Math.sin(back) * 12,
        vx: Math.cos(back + spread) * rand(40, 140, this.rng) - ship.vx * 0.2,
        vy: Math.sin(back + spread) * rand(40, 140, this.rng) - ship.vy * 0.2,
        life: rand(0.18, 0.38, this.rng),
        max: 0.38,
        size: rand(1.2, 2.8, this.rng),
        color: this.rng() < 0.45 ? '#ffd27a' : COLORS.thrust,
      })
    }
  }

  shoot(ship) {
    const nx = Math.cos(ship.angle)
    const ny = Math.sin(ship.angle)
    this.bullets.push({
      ownerId: ship.userId,
      x: ship.x + nx * 16,
      y: ship.y + ny * 16,
      vx: nx * BULLET_SPEED,
      vy: ny * BULLET_SPEED,
      life: BULLET_LIFETIME,
      r: BULLET_RADIUS,
      wrapped: false,
    })
    ship.fireCd = FIRE_COOLDOWN
    ship.fireWasCharging = true
    ship.muzzle = MUZZLE_TIME
    this.pushEffect({ type: 'fire', userId: ship.userId, x: ship.x, y: ship.y })
  }

  hyperspace(ship) {
    ship.hyperCd = HYPERSPACE_COOLDOWN
    const spot = this.findHyperspaceSpot()
    ship.x = spot.x
    ship.y = spot.y
    ship.vx *= 0.5
    ship.vy *= 0.5
    ship.invuln = HYPERSPACE_INVULN
    this.burst(ship.x, ship.y, COLORS.bullet, 18, 160)
  }

  findHyperspaceSpot() {
    const margin = 80
    let best = { x: this.w / 2, y: this.h / 2, d: -1 }
    for (let i = 0; i < 28; i++) {
      const x = rand(margin, this.w - margin, this.rng)
      const y = rand(margin, this.h - margin, this.rng)
      const d = this.clearanceAt(x, y)
      if (d > 56) return { x, y }
      if (d > best.d) best = { x, y, d }
    }
    return best
  }

  clearanceAt(x, y) {
    const pt = { x, y }
    let nearest = Infinity
    for (const a of this.asteroids) {
      nearest = Math.min(nearest, wrapDist(pt, a, this.w, this.h) - a.r)
    }
    if (this.ufo) nearest = Math.min(nearest, wrapDist(pt, this.ufo, this.w, this.h) - this.ufo.r)
    return nearest
  }

  updateAsteroids(dt) {
    for (const a of this.asteroids) {
      a.angle += a.spin * dt
      a.x = wrap(a.x + a.vx * dt, this.w, a.r)
      a.y = wrap(a.y + a.vy * dt, this.h, a.r)
    }
  }

  updateBullets(dt) {
    this.bullets = this.bullets.filter((b) => {
      const nextX = b.x + b.vx * dt
      const nextY = b.y + b.vy * dt
      const wrappedX = wrap(nextX, this.w)
      const wrappedY = wrap(nextY, this.h)
      if (wrappedX !== nextX || wrappedY !== nextY) b.wrapped = true
      b.x = wrappedX
      b.y = wrappedY
      if (b.wrapped) b.life -= dt
      return !b.wrapped || b.life > 0
    })
    this.ufoBullets = this.ufoBullets.filter((b) => {
      b.life -= dt
      b.x = wrap(b.x + b.vx * dt, this.w)
      b.y = wrap(b.y + b.vy * dt, this.h)
      return b.life > 0
    })
  }

  nearestShipTo(entity) {
    let best = null
    let bestD = Infinity
    for (const ship of this.aliveShips()) {
      const d = wrapDist(entity, ship, this.w, this.h)
      if (d < bestD) {
        bestD = d
        best = ship
      }
    }
    return best
  }

  updateUfo(dt) {
    if (!this.ufo) this.ufoTimer -= dt
    if (
      !this.ufo &&
      this.wave >= 2 &&
      this.mode === 'playing' &&
      this.ufoTimer > 0 &&
      this.ufoTimer <= UFO_WARN_TIME
    ) {
      if (!this.ufoWarning) {
        this.ufoWarning = {
          fromLeft: this.rng() < 0.5,
          y: rand(80, this.h - 80, this.rng),
        }
        this.pushEffect({ type: 'ufoWarn' })
      }
    }

    if (!this.ufo && this.wave >= 2 && this.ufoTimer <= 0 && this.mode === 'playing') {
      const fromLeft = this.ufoWarning?.fromLeft ?? this.rng() < 0.5
      const y = this.ufoWarning?.y ?? rand(80, this.h - 80, this.rng)
      this.ufo = {
        x: fromLeft ? -30 : this.w + 30,
        y,
        vx: fromLeft ? UFO_SPEED : -UFO_SPEED,
        vy: 0,
        phase: rand(0, Math.PI * 2, this.rng),
        fireCd: 0.8,
        r: UFO_RADIUS,
      }
      this.ufoWarning = null
      this.ufoTimer = rand(22, 38, this.rng)
    }

    if (!this.ufo) return

    this.ufo.phase += dt * 2.2
    this.ufo.vy = Math.sin(this.ufo.phase) * 70
    this.ufo.x += this.ufo.vx * dt
    this.ufo.y = wrap(this.ufo.y + this.ufo.vy * dt, this.h, this.ufo.r)
    this.ufo.fireCd -= dt

    const target = this.nearestShipTo(this.ufo)
    if (this.ufo.fireCd <= 0 && target) {
      const aim =
        Math.atan2(wrapDelta(target.y, this.ufo.y, this.h), wrapDelta(target.x, this.ufo.x, this.w)) +
        rand(-0.4, 0.4, this.rng)
      this.ufoBullets.push({
        x: this.ufo.x,
        y: this.ufo.y,
        vx: Math.cos(aim) * UFO_BULLET_SPEED,
        vy: Math.sin(aim) * UFO_BULLET_SPEED,
        life: 2.2,
        r: 2.2,
        hostile: true,
      })
      this.ufo.fireCd = UFO_FIRE_COOLDOWN
      this.pushEffect({ type: 'ufoShot' })
    }

    if (this.ufo.x < -50 || this.ufo.x > this.w + 50) {
      this.ufo = null
    }
  }

  updateParticles(dt) {
    this.particles = this.particles.filter((p) => {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.99
      p.vy *= 0.99
      return p.life > 0
    })
  }

  burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2, this.rng)
      const s = rand(speed * 0.25, speed, this.rng)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.85, this.rng),
        max: 0.85,
        size: rand(1, 3.2, this.rng),
        color,
      })
    }
  }

  updateWreckage(dt) {
    this.wreckage = this.wreckage.filter((w) => {
      w.life -= dt
      w.x = wrap(w.x + w.vx * dt, this.w)
      w.y = wrap(w.y + w.vy * dt, this.h)
      w.angle += w.spin * dt
      return w.life > 0
    })
  }

  addLine(x, y, vx, vy, x1, y1, x2, y2, color, life = 1.35, spin) {
    this.wreckage.push({
      x,
      y,
      vx,
      vy,
      x1,
      y1,
      x2,
      y2,
      angle: 0,
      spin: spin ?? rand(-4.5, 4.5, this.rng),
      life,
      max: life,
      color,
    })
  }

  shatterShip(ship) {
    const ca = Math.cos(ship.angle)
    const sa = Math.sin(ship.angle)
    const rot = (px, py) => ({ x: px * ca - py * sa, y: px * sa + py * ca })
    const nose = rot(SHIP_RADIUS + 2, 0)
    const left = rot(-SHIP_RADIUS, 8)
    const notch = rot(-SHIP_RADIUS + 4, 0)
    const right = rot(-SHIP_RADIUS, -8)
    const segs = [
      [nose, left],
      [left, notch],
      [notch, right],
      [right, nose],
    ]
    for (const [a, b] of segs) {
      this.addLine(
        ship.x,
        ship.y,
        ship.vx + rand(-40, 40, this.rng),
        ship.vy + rand(-40, 40, this.rng),
        a.x,
        a.y,
        b.x,
        b.y,
        ship.color ?? COLORS.ship,
        rand(1.1, 1.7, this.rng),
      )
    }
  }

  crashShipOnAsteroid(ship, rock) {
    const dx = wrapDelta(ship.x, rock.x, this.w)
    const dy = wrapDelta(ship.y, rock.y, this.h)
    const dist = Math.hypot(dx, dy) || 1
    const nx = dx / dist
    const ny = dy / dist
    const tx = -ny
    const ty = nx
    const rvx = ship.vx - rock.vx
    const rvy = ship.vy - rock.vy
    const vn = rvx * nx + rvy * ny
    const vt = rvx * tx + rvy * ty
    const into = Math.min(vn, -40)
    const bounce = 0.55
    const impact = Math.abs(into)

    const contactX = wrap(rock.x + nx * (rock.r + 2), this.w)
    const contactY = wrap(rock.y + ny * (rock.r + 2), this.h)

    const ca = Math.cos(ship.angle)
    const sa = Math.sin(ship.angle)
    const rot = (px, py) => ({ x: px * ca - py * sa, y: px * sa + py * ca })
    const hull = [
      rot(SHIP_RADIUS + 2, 0),
      rot(-SHIP_RADIUS, 8),
      rot(-SHIP_RADIUS + 4, 0),
      rot(-SHIP_RADIUS, -8),
    ]
    const segs = [
      [hull[0], hull[1]],
      [hull[1], hull[2]],
      [hull[2], hull[3]],
      [hull[3], hull[0]],
    ]

    segs.forEach(([a, b], i) => {
      const midX = (a.x + b.x) * 0.5
      const midY = (a.y + b.y) * 0.5
      const along = midX * tx + midY * ty
      const scatter = (i - 1.5) * 28
      const rebound = bounce * impact + rand(20, 70, this.rng)
      const scrape = vt * 0.7 + scatter + rand(-35, 35, this.rng)
      const px = contactX + tx * along * 0.45 + nx * rand(2, 10, this.rng)
      const py = contactY + ty * along * 0.45 + ny * rand(2, 10, this.rng)
      const vx = rock.vx + nx * rebound + tx * scrape
      const vy = rock.vy + ny * rebound + ty * scrape
      const spin = (vt + along * 8) * 0.04 + rand(-2.2, 2.2, this.rng)
      this.addLine(
        px,
        py,
        vx,
        vy,
        a.x - midX,
        a.y - midY,
        b.x - midX,
        b.y - midY,
        ship.color ?? COLORS.ship,
        rand(1.4, 2.1, this.rng),
        spin,
      )
    })

    for (let i = 0; i < 10; i++) {
      const spread = rand(-0.9, 0.9, this.rng)
      const sx = Math.cos(Math.atan2(ny, nx) + spread)
      const sy = Math.sin(Math.atan2(ny, nx) + spread)
      const speed = impact * rand(0.35, 1.1, this.rng) + rand(30, 90, this.rng)
      this.particles.push({
        x: contactX + nx * 3,
        y: contactY + ny * 3,
        vx: rock.vx + sx * speed + tx * vt * 0.25,
        vy: rock.vy + sy * speed + ty * vt * 0.25,
        life: rand(0.25, 0.7, this.rng),
        max: 0.7,
        size: rand(1, 2.4, this.rng),
        color: this.rng() < 0.4 ? COLORS.thrust : ship.color ?? COLORS.ship,
      })
    }

    const rockMass = Math.max(1, rock.size)
    const push = (impact * 0.08) / rockMass
    rock.vx -= nx * push
    rock.vy -= ny * push
  }

  shatterUfo(ufo) {
    const segs = [
      [-18, 0, 18, 0],
      [-14, 4, 14, 4],
      [-14, -4, 14, -4],
      [-9, -4, -9, -10],
      [9, -4, 9, -10],
      [-9, -10, 9, -10],
    ]
    for (const [x1, y1, x2, y2] of segs) {
      this.addLine(ufo.x, ufo.y, ufo.vx, ufo.vy, x1, y1, x2, y2, COLORS.ufo, rand(0.9, 1.4, this.rng))
    }
  }

  hits(a, b, radius) {
    return wrapDist(a, b, this.w, this.h) < radius
  }

  collide() {
    this.resolveBulletHits(this.bullets, { canHitUfo: true, canHitShip: false })
    this.resolveBulletHits(this.ufoBullets, { canHitUfo: false, canHitShip: true })

    if (this.ufo) {
      for (let j = this.asteroids.length - 1; j >= 0; j--) {
        const a = this.asteroids[j]
        if (this.hits(this.ufo, a, this.ufo.r + a.r)) {
          this.destroyUfo(false)
          break
        }
      }
    }

    for (const ship of this.ships) {
      if (!ship.alive || ship.invuln > 0) continue
      for (const a of this.asteroids) {
        if (this.hits(ship, a, SHIP_HIT_RADIUS + a.r)) {
          this.killShip(ship, { kind: 'asteroid', other: a })
          break
        }
      }
      if (!ship.alive || ship.invuln > 0) continue
      if (this.ufo && this.hits(ship, this.ufo, SHIP_HIT_RADIUS + this.ufo.r)) {
        this.destroyUfo()
        this.killShip(ship, { kind: 'ufo', other: this.ufo })
      }
    }
  }

  resolveBulletHits(bullets, { canHitUfo, canHitShip }) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]
      if (b.spent) continue

      if (canHitUfo && this.ufo && this.hits(b, this.ufo, b.r + this.ufo.r)) {
        b.spent = true
        bullets.splice(i, 1)
        this.destroyUfo()
        continue
      }

      if (canHitShip) {
        let hitShip = null
        for (const ship of this.ships) {
          if (!ship.alive) continue
          if (this.hits(ship, b, SHIP_HIT_RADIUS + b.r)) {
            hitShip = ship
            break
          }
        }
        if (hitShip) {
          b.spent = true
          bullets.splice(i, 1)
          if (hitShip.invuln <= 0) this.killShip(hitShip, { kind: 'bullet' })
          continue
        }
      }

      const rockIndex = this.firstAsteroidHitBy(b)
      if (rockIndex < 0) continue
      b.spent = true
      bullets.splice(i, 1)
      this.splitAsteroid(rockIndex)
    }
  }

  firstAsteroidHitBy(b) {
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < this.asteroids.length; j++) {
      const a = this.asteroids[j]
      if ((a.grace ?? 0) > 0) continue
      if (a.bornFrame === this.frame) continue
      if (!this.hits(b, a, b.r + a.r)) continue
      const d = wrapDist(b, a, this.w, this.h)
      if (d < bestDist) {
        bestDist = d
        best = j
      }
    }
    return best
  }

  splitAsteroid(index) {
    const a = this.asteroids[index]
    if (!a) return
    const size = a.size === 3 ? 3 : a.size === 2 ? 2 : 1
    this.asteroids.splice(index, 1)

    if (size > 1) {
      const childSize = size === 3 ? 2 : 1
      const base = Math.atan2(a.vy, a.vx)
      const heading = Number.isFinite(base) ? base : rand(0, Math.PI * 2, this.rng)
      const parentSpeed = Math.hypot(a.vx, a.vy)
      for (let i = 0; i < 2; i++) {
        const angle = heading + (i === 0 ? -1 : 1) * (Math.PI / 2) + rand(-0.25, 0.25, this.rng)
        const speed = Math.max(55, parentSpeed * 1.05) + rand(10, 35, this.rng)
        const gap = Math.max(a.r * 0.65, 22)
        const child = spawnAsteroid(
          this.w,
          this.h,
          childSize,
          a.x + Math.cos(angle) * gap,
          a.y + Math.sin(angle) * gap,
          angle,
          speed,
          this.rng,
        )
        child.grace = ASTEROID_SPAWN_GRACE
        child.bornFrame = this.frame
        child.hitFlash = 0.18
        const m = this.asteroidMomentum
        child.vx = child.vx * (1 - m) + a.vx * m
        child.vy = child.vy * (1 - m) + a.vy * m
        const accel = rand(0.75, 2.5, this.rng)
        child.vx *= accel
        child.vy *= accel
        this.asteroids.push(child)
      }
    }

    this.pendingScore += ASTEROID_SCORE[size] ?? 20
    this.burst(a.x, a.y, COLORS.asteroid, 4 + size * 2, 40 + size * 12)
    this.shake = Math.max(this.shake, size)
    this.pushEffect({ type: 'bang', size, x: a.x, y: a.y })
  }

  destroyUfo(awardScore = true) {
    const ufo = this.ufo
    if (!ufo) return
    this.ufo = null
    this.ufoWarning = null
    this.ufoTimer = rand(22, 38, this.rng)
    this.shake = 4
    this.shatterUfo(ufo)
    this.pushEffect({ type: 'bang', size: 'ufo', x: ufo.x, y: ufo.y, ufoOff: true })
    if (awardScore) this.pendingScore += UFO_SCORE
  }

  killShip(ship, impact) {
    if (!ship?.alive) return
    ship.alive = false
    ship.thrusting = false
    ship.invuln = 0
    ship.respawnIn = RESPAWN_DELAY
    this.lives = Math.max(0, this.lives - 1)
    this.shake = impact?.kind === 'asteroid' ? 5 : 3
    if (impact?.kind === 'asteroid' && impact.other) this.crashShipOnAsteroid(ship, impact.other)
    else this.shatterShip(ship)
    this.pushEffect({ type: 'bang', size: 'ship', userId: ship.userId, x: ship.x, y: ship.y })
  }

  flushScoreAndGameover() {
    if (this.pendingScore) this.addScore(this.pendingScore)
    this.pendingScore = 0
    if (this.lives <= 0 && this.mode === 'playing') {
      this.mode = 'gameover'
      this.pushEffect({ type: 'gameover' })
      for (const ship of this.ships) {
        ship.respawnIn = 0
      }
    }
  }

  addScore(n) {
    this.score += n
    if (this.score >= this.nextLifeAt) {
      this.lives += 1
      this.nextLifeAt += EXTRA_LIFE_EVERY
      this.pushEffect({ type: 'extraLife' })
    }
  }

  pushEffect(effect) {
    this.effects.push(effect)
  }

  sampleNearMiss(ship) {
    if (!ship?.alive || ship.invuln > 0 || this.mode !== 'playing') return false
    for (const a of this.asteroids) {
      const d = wrapDist(ship, a, this.w, this.h)
      const hit = SHIP_HIT_RADIUS + a.r * 0.88
      if (d > hit && d < hit * 1.6) return true
    }
    return false
  }

  snapshot() {
    return structuredClone({
      tickSeq: this.tickSeq,
      mode: this.mode,
      score: this.score,
      lives: this.lives,
      wave: this.wave,
      nextLifeAt: this.nextLifeAt,
      waveIn: this.waveIn,
      ufoTimer: this.ufoTimer,
      frame: this.frame,
      shake: this.shake,
      ships: this.ships,
      asteroids: this.asteroids,
      bullets: this.bullets,
      ufoBullets: this.ufoBullets,
      ufo: this.ufo,
      ufoWarning: this.ufoWarning,
      particles: this.particles,
      wreckage: this.wreckage,
      roster: this.roster,
      stars: this.stars,
      asteroidMomentum: this.asteroidMomentum,
    })
  }

  applySnapshot(data) {
    if (!data) return
    this.tickSeq = data.tickSeq
    this.mode = data.mode
    this.score = data.score
    this.lives = data.lives
    this.wave = data.wave
    this.nextLifeAt = data.nextLifeAt
    this.waveIn = data.waveIn
    this.ufoTimer = data.ufoTimer
    this.frame = data.frame
    this.shake = data.shake
    this.ships = data.ships
    this.asteroids = data.asteroids
    this.bullets = data.bullets
    this.ufoBullets = data.ufoBullets
    this.ufo = data.ufo
    this.ufoWarning = data.ufoWarning
    this.particles = data.particles ?? this.particles
    this.wreckage = data.wreckage ?? this.wreckage
    this.roster = data.roster ?? this.roster
    this.stars = data.stars ?? this.stars
    if (Number.isFinite(data.asteroidMomentum)) this.asteroidMomentum = data.asteroidMomentum
  }
}
