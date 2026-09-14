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
  RESPAWN_DELAY,
  MUZZLE_TIME,
  SHIP_MAX_SPEED,
  SHIP_HIT_RADIUS,
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
} from './constants.js'
import { AudioEngine } from './audio.js'
import { computeRawIntensity, IntensitySmoother, wrapDelta, wrapDist } from './musicIntensity.js'
import { getAudioSettings, saveAudioSettings, DEFAULT_AUDIO_SETTINGS } from '../db/settings.js'
import { drawWorld } from './render.js'

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (a, b) => (Math.random() < 0.5 ? a : b)
const wrap = (v, max, r = 0) => {
  if (v < -r) return max + r
  if (v > max + r) return -r
  return v
}
const dist2 = (a, b) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
const clamp01 = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}
const clampMag = (vx, vy, max) => {
  const m = Math.hypot(vx, vy)
  if (m <= max || m === 0) return { vx, vy }
  const s = max / m
  return { vx: vx * s, vy: vy * s }
}

function makeStars(w, h) {
  return Array.from({ length: 140 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    z: rand(0.25, 1.4),
    tw: Math.random() * Math.PI * 2,
  }))
}

function asteroidVerts(radius) {
  const count = 9 + Math.floor(Math.random() * 5)
  const verts = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const jagged = radius * rand(0.68, 1.12)
    verts.push({ x: Math.cos(a) * jagged, y: Math.sin(a) * jagged })
  }
  return verts
}

function spawnAsteroid(w, h, size, x, y, kickAngle, kickSpeed) {
  const tier = size === 3 || size === 2 || size === 1 ? size : 3
  const [minS, maxS] = ASTEROID_SPEED[tier]
  const radius = ASTEROID_RADIUS[tier]
  const angle = kickAngle ?? rand(0, Math.PI * 2)
  const speed = kickSpeed ?? rand(minS, maxS)
  let px = x
  let py = y
  if (px == null) {
    const edge = Math.floor(Math.random() * 4)
    if (edge === 0) {
      px = rand(0, w)
      py = -20
    } else if (edge === 1) {
      px = rand(0, w)
      py = h + 20
    } else if (edge === 2) {
      px = -20
      py = rand(0, h)
    } else {
      px = w + 20
      py = rand(0, h)
    }
  }
  return {
    x: px,
    y: py,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    spin: rand(-1.2, 1.2),
    angle: rand(0, Math.PI * 2),
    size: tier,
    r: radius,
    verts: asteroidVerts(radius),
    grace: 0,
    hitFlash: 0,
  }
}

export class Game {
  constructor(canvas, { onState } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onState = onState
    this.audio = new AudioEngine()
    this.musicFeel = new IntensitySmoother(0.12)
    this.lastShotAt = 0
    this.nearMissPulse = 0
    this.nearMissSting = 0
    this.asteroidMomentum = DEFAULT_AUDIO_SETTINGS.asteroidMomentum
    getAudioSettings()
      .then((settings) => {
        this.audio.applySettings(settings)
        if (Number.isFinite(settings.asteroidMomentum)) {
          this.asteroidMomentum = clamp01(settings.asteroidMomentum)
        }
        this.emit()
      })
      .catch(() => {})
    this.input = {
      left: false,
      right: false,
      thrust: false,
      fire: false,
      hyperspace: false,
      pause: false,
    }
    this.inputHoldover = this.emptyHoldover()
    this.inputGateUntil = 0
    this.inputClearTimer = 0
    this.rotDir = 0
    this.rotSpeed = SHIP_ROTATION
    this.mode = 'menu'
    this.raf = 0
    this.running = false
    this.last = 0
    this.shake = 0
    this.runId = 0
    this.w = 1280
    this.h = 720
    this.stars = makeStars(this.w, this.h)
    this.resetMatch()
    this.resize = this.resize.bind(this)
    this.loop = this.loop.bind(this)
    this.resize()
    this.seedAttract()
    window.addEventListener('resize', this.resize)
  }

  resetMatch() {
    this.score = 0
    this.lives = STARTING_LIVES
    this.wave = 0
    this.nextLifeAt = EXTRA_LIFE_EVERY
    this.fireCd = 0
    this.hyperCd = 0
    this.invuln = 0
    this.respawnIn = 0
    this.waveIn = 0
    this.ufoTimer = 18
    this.ship = this.makeShip()
    this.ship.alive = false
    this.asteroids = []
    this.bullets = []
    this.ufoBullets = []
    this.particles = []
    this.wreckage = []
    this.ufo = null
    this.ufoWarning = null
    this.muzzle = 0
    this.fireWasCharging = false
  }

  seedAttract() {
    this.asteroids = []
    for (let i = 0; i < 7; i++) {
      const size = Math.random() < 0.55 ? 3 : 2
      this.asteroids.push(spawnAsteroid(this.w, this.h, size))
    }
  }

  toMenu() {
    this.audio.stopLoops()
    this.nearMissPulse = 0
    this.mode = 'menu'
    this.resetMatch()
    this.seedAttract()
    this.emit()
  }

  makeShip() {
    return {
      x: this.w / 2,
      y: this.h / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      alive: true,
      thrusting: false,
    }
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    if (this.inputClearTimer) clearTimeout(this.inputClearTimer)
    window.removeEventListener('resize', this.resize)
    this.audio.destroy()
  }

  emptyHoldover() {
    return {
      left: false,
      right: false,
      thrust: false,
      fire: false,
      hyperspace: false,
    }
  }

  clearInput() {
    this.input.left = false
    this.input.right = false
    this.input.thrust = false
    this.input.fire = false
    this.input.hyperspace = false
    this.input.pause = false
    this.rotDir = 0
    this.rotSpeed = SHIP_ROTATION
    if (this.ship) this.ship.thrusting = false
    try {
      this.audio.setThrust(false)
    } catch {
      /* audio may not be ready */
    }
  }

  controlDown(name) {
    if (performance.now() < this.inputGateUntil) return false
    if (this.inputHoldover[name]) {
      if (!this.input[name]) this.inputHoldover[name] = false
      return false
    }
    return Boolean(this.input[name])
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = Math.max(640, window.innerWidth)
    this.h = Math.max(480, window.innerHeight)
    this.canvas.width = Math.floor(this.w * dpr)
    this.canvas.height = Math.floor(this.h * dpr)
    this.canvas.style.width = `${this.w}px`
    this.canvas.style.height = `${this.h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.stars = makeStars(this.w, this.h)
  }

  emit() {
    this.onState?.({
      mode: this.mode,
      score: this.score,
      lives: this.lives,
      wave: Math.max(1, this.wave),
      fireCd: this.fireCd,
      muted: this.audio.sfxMuted,
      sfxMuted: this.audio.sfxMuted,
      musicMuted: this.audio.musicMuted,
      sfxVolume: this.audio.sfxVolume,
      musicVolume: this.audio.musicVolume,
      asteroidMomentum: this.asteroidMomentum,
      ufoInbound: Boolean(this.ufoWarning),
      runId: this.runId,
    })
  }

  startLoop() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
    this.emit()
  }

  newGame() {
    this.audio.unlock()
    this.runId += 1
    this.inputHoldover = {
      left: this.input.left,
      right: this.input.right,
      thrust: this.input.thrust,
      fire: this.input.fire,
      hyperspace: this.input.hyperspace,
    }
    this.clearInput()
    this.inputGateUntil = performance.now() + 1
    if (this.inputClearTimer) clearTimeout(this.inputClearTimer)
    this.inputClearTimer = setTimeout(() => {
      this.clearInput()
      this.inputClearTimer = 0
    }, 1)
    this.resetMatch()
    this.mode = 'playing'
    this.ship = this.makeShip()
    this.invuln = INVULN_TIME
    this.beginWave()
    this.emit()
  }

  togglePause() {
    if (this.mode === 'playing') {
      this.mode = 'paused'
      this.audio.stopLoops()
    } else if (this.mode === 'paused') {
      this.mode = 'playing'
      this.last = performance.now()
    }
    this.emit()
  }

  persistAudio() {
    saveAudioSettings({
      ...this.audio.snapshot(),
      asteroidMomentum: this.asteroidMomentum,
    }).catch(() => {})
  }

  toggleMute() {
    this.toggleSfxMute()
  }

  toggleSfxMute() {
    this.audio.unlock()
    this.audio.toggleSfxMute()
    this.persistAudio()
    this.emit()
  }

  toggleMusicMute() {
    this.audio.unlock()
    this.audio.toggleMusicMute()
    this.persistAudio()
    this.emit()
  }

  setSfxVolume(v) {
    this.audio.unlock()
    this.audio.setSfxVolume(v)
    this.persistAudio()
    this.emit()
  }

  setMusicVolume(v) {
    this.audio.unlock()
    this.audio.setMusicVolume(v)
    this.persistAudio()
    this.emit()
  }

  setAsteroidMomentum(v) {
    this.asteroidMomentum = clamp01(v)
    this.persistAudio()
    this.emit()
  }

  syncMusic(dt) {
    this.nearMissPulse = Math.max(0, this.nearMissPulse - dt * 1.6)
    this.nearMissSting = Math.max(0, this.nearMissSting - dt)
    let raw
    if (this.mode === 'paused') raw = this.musicFeel.value * 0.4
    else if (this.mode === 'gameover') raw = 0.07
    else raw = computeRawIntensity(this)
    const intensity = this.musicFeel.step(raw, dt)
    this.audio.music.setIntensity(intensity)
    this.audio.updateMusic(dt, {
      lives: this.mode === 'playing' ? this.lives : 5,
      asteroidCount: this.asteroids.length,
    })
  }

  sampleNearMiss() {
    const ship = this.ship
    if (!ship?.alive || this.invuln > 0 || this.mode !== 'playing') return
    for (const a of this.asteroids) {
      const d = wrapDist(ship, a, this.w, this.h)
      const hit = SHIP_HIT_RADIUS + a.r * 0.88
      if (d > hit && d < hit * 1.6) {
        this.nearMissPulse = Math.max(this.nearMissPulse, 0.85)
        if (this.nearMissSting <= 0) {
          this.audio.stinger('near')
          this.nearMissSting = 2.4
        }
        return
      }
    }
  }

  beginWave() {
    this.wave += 1
    this.waveIn = WAVE_PAUSE
    this.audio.wave()
    this.emit()
  }

  spawnWave() {
    const count = Math.min(WAVE_CAP, WAVE_BASE + (this.wave - 1) * WAVE_GROWTH)
    const rocks = []
    for (let i = 0; i < count; i++) {
      let rock
      let tries = 0
      do {
        rock = spawnAsteroid(this.w, this.h, 3)
        tries += 1
      } while (dist2(rock, this.ship) < 220 * 220 && tries < 20)
      rocks.push(rock)
    }
    this.asteroids.push(...rocks)
  }

  loop(now) {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    try {
      if (this.mode === 'playing') this.update(dt)
      else {
        this.audio.setThrust(false)
        if (this.mode === 'menu') this.updateAttract(dt)
        else if (this.mode === 'gameover') this.updateAftermath(dt)
      }
      this.syncMusic(dt)
      this.shake = Math.max(0, this.shake - dt * 18)
      drawWorld(this.ctx, this, now / 1000)
    } catch (err) {
      console.error(err)
    }
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

  update(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt)
    if (this.fireWasCharging && this.fireCd <= 0) this.audio.cannonReady()
    this.fireWasCharging = this.fireCd > 0
    this.hyperCd = Math.max(0, this.hyperCd - dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.muzzle = Math.max(0, this.muzzle - dt)
    this.frame = (this.frame ?? 0) + 1
    for (const a of this.asteroids) {
      a.hitFlash = Math.max(0, (a.hitFlash ?? 0) - dt)
      a.grace = Math.max(0, (a.grace ?? 0) - dt)
    }

    if (this.waveIn > 0) {
      this.waveIn -= dt
      if (this.waveIn <= 0) this.spawnWave()
    }

    if (this.respawnIn > 0) {
      this.respawnIn -= dt
      if (this.respawnIn <= 0 && this.mode === 'playing') {
        this.ship = this.makeShip()
        this.invuln = INVULN_TIME
      }
    }

    this.updateShip(dt)
    this.updateAsteroids(dt)
    this.updateBullets(dt)
    this.updateUfo(dt)
    this.updateParticles(dt)
    this.updateWreckage(dt)
    this.collide()
    this.sampleNearMiss()

    if (
      this.asteroids.length === 0 &&
      this.waveIn <= 0 &&
      this.ship.alive &&
      this.mode === 'playing'
    ) {
      this.beginWave()
    }
  }

  updateShip(dt) {
    const ship = this.ship
    if (!ship.alive) {
      this.audio.setThrust(false)
      return
    }

    const left = this.controlDown('left')
    const right = this.controlDown('right')
    const dir = (right ? 1 : 0) - (left ? 1 : 0)
    if (dir === 0 || dir !== this.rotDir) this.rotSpeed = SHIP_ROTATION
    this.rotDir = dir
    if (dir !== 0) {
      this.rotSpeed = Math.min(SHIP_ROTATION_MAX, this.rotSpeed + SHIP_ROTATION_ACCEL * dt)
      ship.angle += dir * this.rotSpeed * dt
    }

    ship.thrusting = this.controlDown('thrust')
    this.audio.setThrust(ship.thrusting)
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dt
      ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dt
      const capped = clampMag(ship.vx, ship.vy, SHIP_MAX_SPEED)
      ship.vx = capped.vx
      ship.vy = capped.vy
      this.spawnThrust(ship)
    }

    if (this.controlDown('fire') && this.fireCd <= 0) this.shoot()
    if (this.controlDown('hyperspace') && this.hyperCd <= 0) this.hyperspace()

    ship.x = wrap(ship.x + ship.vx * dt, this.w, SHIP_RADIUS)
    ship.y = wrap(ship.y + ship.vy * dt, this.h, SHIP_RADIUS)
  }

  spawnThrust(ship) {
    const back = ship.angle + Math.PI
    for (let i = 0; i < 2; i++) {
      const spread = rand(-0.35, 0.35)
      this.particles.push({
        x: ship.x + Math.cos(back) * 12,
        y: ship.y + Math.sin(back) * 12,
        vx: Math.cos(back + spread) * rand(40, 140) - ship.vx * 0.2,
        vy: Math.sin(back + spread) * rand(40, 140) - ship.vy * 0.2,
        life: rand(0.18, 0.38),
        max: 0.38,
        size: rand(1.2, 2.8),
        color: Math.random() < 0.45 ? '#ffd27a' : COLORS.thrust,
      })
    }
  }

  shoot() {
    const ship = this.ship
    const nx = Math.cos(ship.angle)
    const ny = Math.sin(ship.angle)
    this.bullets.push({
      x: ship.x + nx * 16,
      y: ship.y + ny * 16,
      vx: nx * BULLET_SPEED,
      vy: ny * BULLET_SPEED,
      life: BULLET_LIFETIME,
      r: BULLET_RADIUS,
      wrapped: false,
    })
    this.fireCd = FIRE_COOLDOWN
    this.fireWasCharging = true
    this.muzzle = MUZZLE_TIME
    this.lastShotAt = performance.now()
    this.audio.fire()
    this.emit()
  }

  hyperspace() {
    this.hyperCd = HYPERSPACE_COOLDOWN
    const spot = this.findHyperspaceSpot()
    this.ship.x = spot.x
    this.ship.y = spot.y
    this.ship.vx *= 0.5
    this.ship.vy *= 0.5
    this.invuln = HYPERSPACE_INVULN
    this.burst(this.ship.x, this.ship.y, COLORS.bullet, 18, 160)
  }

  findHyperspaceSpot() {
    const margin = 80
    let best = { x: this.w / 2, y: this.h / 2, d: -1 }
    for (let i = 0; i < 28; i++) {
      const x = rand(margin, this.w - margin)
      const y = rand(margin, this.h - margin)
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
          fromLeft: Math.random() < 0.5,
          y: rand(80, this.h - 80),
        }
        this.audio.stinger('ufo')
        this.emit()
      }
    }

    if (!this.ufo && this.wave >= 2 && this.ufoTimer <= 0 && this.mode === 'playing') {
      const fromLeft = this.ufoWarning?.fromLeft ?? Math.random() < 0.5
      const y = this.ufoWarning?.y ?? rand(80, this.h - 80)
      this.ufo = {
        x: fromLeft ? -30 : this.w + 30,
        y,
        vx: fromLeft ? UFO_SPEED : -UFO_SPEED,
        vy: 0,
        phase: rand(0, Math.PI * 2),
        fireCd: 0.8,
        r: UFO_RADIUS,
      }
      this.ufoWarning = null
      this.ufoTimer = rand(22, 38)
      this.emit()
    }

    if (!this.ufo) {
      this.audio.setUfo(false)
      return
    }

    this.audio.setUfo(true)
    this.ufo.phase += dt * 2.2
    this.ufo.vy = Math.sin(this.ufo.phase) * 70
    this.ufo.x += this.ufo.vx * dt
    this.ufo.y = wrap(this.ufo.y + this.ufo.vy * dt, this.h, this.ufo.r)
    this.ufo.fireCd -= dt

    if (this.ufo.fireCd <= 0 && this.ship.alive) {
      const aim = Math.atan2(this.ship.y - this.ufo.y, this.ship.x - this.ufo.x) + rand(-0.4, 0.4)
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
      this.audio.ufoShot()
    }

    if (this.ufo.x < -50 || this.ufo.x > this.w + 50) {
      this.ufo = null
      this.audio.setUfo(false)
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
      const a = rand(0, Math.PI * 2)
      const s = rand(speed * 0.25, speed)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.85),
        max: 0.85,
        size: rand(1, 3.2),
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
      spin: spin ?? rand(-4.5, 4.5),
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
        ship.vx + rand(-40, 40),
        ship.vy + rand(-40, 40),
        a.x,
        a.y,
        b.x,
        b.y,
        COLORS.ship,
        rand(1.1, 1.7),
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
      const rebound = bounce * impact + rand(20, 70)
      const scrape = vt * 0.7 + scatter + rand(-35, 35)
      const px = contactX + tx * along * 0.45 + nx * rand(2, 10)
      const py = contactY + ty * along * 0.45 + ny * rand(2, 10)
      const vx = rock.vx + nx * rebound + tx * scrape
      const vy = rock.vy + ny * rebound + ty * scrape
      const spin = (vt + along * 8) * 0.04 + rand(-2.2, 2.2)
      this.addLine(px, py, vx, vy, a.x - midX, a.y - midY, b.x - midX, b.y - midY, COLORS.ship, rand(1.4, 2.1), spin)
    })

    for (let i = 0; i < 10; i++) {
      const spread = rand(-0.9, 0.9)
      const sx = Math.cos(Math.atan2(ny, nx) + spread)
      const sy = Math.sin(Math.atan2(ny, nx) + spread)
      const speed = impact * rand(0.35, 1.1) + rand(30, 90)
      this.particles.push({
        x: contactX + nx * 3,
        y: contactY + ny * 3,
        vx: rock.vx + sx * speed + tx * vt * 0.25,
        vy: rock.vy + sy * speed + ty * vt * 0.25,
        life: rand(0.25, 0.7),
        max: 0.7,
        size: rand(1, 2.4),
        color: Math.random() < 0.4 ? COLORS.thrust : COLORS.ship,
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
      this.addLine(ufo.x, ufo.y, ufo.vx, ufo.vy, x1, y1, x2, y2, COLORS.ufo, rand(0.9, 1.4))
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

    if (this.ship.alive && this.invuln <= 0) {
      for (const a of this.asteroids) {
        if (this.hits(this.ship, a, SHIP_HIT_RADIUS + a.r)) {
          this.killShip({ kind: 'asteroid', other: a })
          return
        }
      }
      if (this.ufo && this.hits(this.ship, this.ufo, SHIP_HIT_RADIUS + this.ufo.r)) {
        this.destroyUfo()
        this.killShip({ kind: 'ufo', other: this.ufo })
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

      if (canHitShip && this.ship.alive && this.hits(this.ship, b, SHIP_HIT_RADIUS + b.r)) {
        b.spent = true
        bullets.splice(i, 1)
        if (this.invuln <= 0) this.killShip({ kind: 'bullet' })
        continue
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
      const heading = Number.isFinite(base) ? base : rand(0, Math.PI * 2)
      const parentSpeed = Math.hypot(a.vx, a.vy)
      for (let i = 0; i < 2; i++) {
        const angle = heading + (i === 0 ? -1 : 1) * (Math.PI / 2) + rand(-0.25, 0.25)
        const speed = Math.max(55, parentSpeed * 1.05) + rand(10, 35)
        const gap = Math.max(a.r * 0.65, 22)
        const child = spawnAsteroid(
          this.w,
          this.h,
          childSize,
          a.x + Math.cos(angle) * gap,
          a.y + Math.sin(angle) * gap,
          angle,
          speed,
        )
        child.grace = ASTEROID_SPAWN_GRACE
        child.bornFrame = this.frame
        child.hitFlash = 0.18
        const m = this.asteroidMomentum
        child.vx = child.vx * (1 - m) + a.vx * m
        child.vy = child.vy * (1 - m) + a.vy * m
        const accel = rand(0.75, 2.5)
        child.vx *= accel
        child.vy *= accel
        this.asteroids.push(child)
      }
    }

    this.addScore(ASTEROID_SCORE[size] ?? 20)
    this.burst(a.x, a.y, COLORS.asteroid, 4 + size * 2, 40 + size * 12)
    this.shake = Math.max(this.shake, size)
    try {
      this.audio.bang(size)
    } catch {
      /* keep the split even if audio fails */
    }
  }

  destroyUfo(awardScore = true) {
    const ufo = this.ufo
    if (!ufo) return
    this.ufo = null
    this.ufoWarning = null
    this.ufoTimer = rand(22, 38)
    this.shake = 4
    try {
      this.shatterUfo(ufo)
    } catch (err) {
      console.error(err)
    }
    try {
      this.audio.bang('ufo')
      this.audio.setUfo(false)
    } catch (err) {
      console.error(err)
    }
    if (awardScore) this.addScore(UFO_SCORE)
  }

  killShip(impact) {
    if (!this.ship?.alive) return
    const wreck = this.ship
    this.ship.alive = false
    this.ship.thrusting = false
    this.lives = Math.max(0, this.lives - 1)
    this.invuln = 0
    this.respawnIn = RESPAWN_DELAY
    this.shake = impact?.kind === 'asteroid' ? 5 : 3
    try {
      if (impact?.kind === 'asteroid' && impact.other) this.crashShipOnAsteroid(wreck, impact.other)
      else this.shatterShip(wreck)
    } catch (err) {
      console.error(err)
      this.shatterShip(wreck)
    }
    try {
      this.audio.setThrust(false)
      this.audio.bang('ship')
    } catch (err) {
      console.error(err)
    }
    if (this.lives <= 0) {
      this.mode = 'gameover'
      this.audio.setUfo(false)
    }
    this.emit()
  }

  addScore(n) {
    this.score += n
    if (this.score >= this.nextLifeAt) {
      this.lives += 1
      this.nextLifeAt += EXTRA_LIFE_EVERY
      this.audio.extraLife()
    }
    this.emit()
  }
}
