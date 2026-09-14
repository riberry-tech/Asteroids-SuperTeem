import { AudioEngine } from './audio.js'
import { createCamera, syncCamera } from './camera.js'
import { WORLD_H, WORLD_W } from './constants.js'
import { getAudioSettings, saveAudioSettings, DEFAULT_AUDIO_SETTINGS } from '../db/settings.js'
import { computeRawIntensity, IntensitySmoother } from './musicIntensity.js'
import { drawWorld } from './render.js'
import { EMPTY_INPUT, WorldSim } from './sim.js'
import { wrapDist } from './wrap.js'

const clamp01 = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

export class Game {
  constructor(canvas, { onState, localUserId = 'solo', roster, cameraMode = 'fit', pauseEnabled = true } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onState = onState
    this.localUserId = localUserId
    this.pauseEnabled = pauseEnabled
    this.audio = new AudioEngine()
    this.musicFeel = new IntensitySmoother(0.12)
    this.lastShotAt = 0
    this.nearMissPulse = 0
    this.nearMissSting = 0
    this.sim = new WorldSim({ roster: roster ?? [{ userId: localUserId }] })
    this.sim.asteroidMomentum = DEFAULT_AUDIO_SETTINGS.asteroidMomentum
    this.camera = createCamera(cameraMode)
    this.viewW = 1280
    this.viewH = 720
    getAudioSettings()
      .then((settings) => {
        this.audio.applySettings(settings)
        if (Number.isFinite(settings.asteroidMomentum)) {
          this.sim.asteroidMomentum = clamp01(settings.asteroidMomentum)
        }
        this.emit()
      })
      .catch(() => {})
    this.input = { ...EMPTY_INPUT, pause: false }
    this.inputHoldover = this.emptyHoldover()
    this.inputGateUntil = 0
    this.inputClearTimer = 0
    this.raf = 0
    this.running = false
    this.last = 0
    this.runId = 0
    this.authority = true
    this.lastEffects = []
    this.effectBuffer = []
    this.netSession = null
    this.resize = this.resize.bind(this)
    this.loop = this.loop.bind(this)
    this.resize()
    this.sim.seedAttract()
    window.addEventListener('resize', this.resize)
  }

  get mode() {
    return this.sim.mode
  }

  set mode(value) {
    this.sim.mode = value
  }

  get w() {
    return WORLD_W
  }

  get h() {
    return WORLD_H
  }

  get ship() {
    return this.sim.shipFor(this.localUserId) ?? this.sim.ships[0]
  }

  get ships() {
    return this.sim.ships
  }

  get lives() {
    return this.sim.lives
  }

  get score() {
    return this.sim.score
  }

  get wave() {
    return this.sim.wave
  }

  get fireCd() {
    return this.ship?.fireCd ?? 0
  }

  get invuln() {
    return this.ship?.invuln ?? 0
  }

  get asteroids() {
    return this.sim.asteroids
  }

  get bullets() {
    return this.sim.bullets
  }

  get ufoBullets() {
    return this.sim.ufoBullets
  }

  get ufo() {
    return this.sim.ufo
  }

  get ufoWarning() {
    return this.sim.ufoWarning
  }

  get particles() {
    return this.sim.particles
  }

  get wreckage() {
    return this.sim.wreckage
  }

  get stars() {
    return this.sim.stars
  }

  get shake() {
    return this.sim.shake
  }

  get waveIn() {
    return this.sim.waveIn
  }

  get asteroidMomentum() {
    return this.sim.asteroidMomentum
  }

  set asteroidMomentum(v) {
    this.sim.asteroidMomentum = clamp01(v)
  }

  emptyHoldover() {
    return { ...EMPTY_INPUT }
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    if (this.inputClearTimer) clearTimeout(this.inputClearTimer)
    window.removeEventListener('resize', this.resize)
    this.audio.destroy()
  }

  clearInput() {
    this.input.left = false
    this.input.right = false
    this.input.thrust = false
    this.input.fire = false
    this.input.hyperspace = false
    this.input.pause = false
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

  localInput() {
    return {
      left: this.controlDown('left'),
      right: this.controlDown('right'),
      thrust: this.controlDown('thrust'),
      fire: this.controlDown('fire'),
      hyperspace: this.controlDown('hyperspace'),
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.viewW = Math.max(320, window.innerWidth)
    this.viewH = Math.max(240, window.innerHeight)
    this.canvas.width = Math.floor(this.viewW * dpr)
    this.canvas.height = Math.floor(this.viewH * dpr)
    this.canvas.style.width = `${this.viewW}px`
    this.canvas.style.height = `${this.viewH}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  emit() {
    const ship = this.ship
    this.onState?.({
      mode: this.mode,
      score: this.score,
      lives: this.lives,
      wave: Math.max(1, this.wave),
      fireCd: ship?.fireCd ?? 0,
      muted: this.audio.sfxMuted,
      sfxMuted: this.audio.sfxMuted,
      musicMuted: this.audio.musicMuted,
      sfxVolume: this.audio.sfxVolume,
      musicVolume: this.audio.musicVolume,
      asteroidMomentum: this.asteroidMomentum,
      ufoInbound: Boolean(this.ufoWarning),
      runId: this.runId,
      localUserId: this.localUserId,
    })
  }

  startLoop() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
    this.emit()
  }

  toMenu() {
    this.audio.stopLoops()
    this.nearMissPulse = 0
    this.sim.mode = 'menu'
    this.sim.resetMatch()
    this.sim.seedAttract()
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
    this.sim.startMatch()
    const ship = this.ship
    if (this.camera.mode === 'follow' && ship) {
      this.camera.x = ship.x
      this.camera.y = ship.y
    }
    this.emit()
  }

  applyRemoteSnapshot(data, effects = []) {
    const local = this.ship ? { ...this.ship } : null
    this.sim.applySnapshot(data)
    if (local && this.camera.mode === 'follow') {
      const hostShip = this.sim.shipFor(this.localUserId)
      if (hostShip && local.alive) {
        if (wrapDist(hostShip, local, WORLD_W, WORLD_H) < 80) {
          hostShip.x = local.x
          hostShip.y = local.y
          hostShip.vx = local.vx
          hostShip.vy = local.vy
          hostShip.angle = local.angle
          hostShip.thrusting = local.thrusting
        }
      }
    }
    this.playEffects(effects)
    const ship = this.ship
    if (this.camera.mode === 'follow' && ship && this.camera.x === WORLD_W / 2 && this.camera.y === WORLD_H / 2) {
      this.camera.x = ship.x
      this.camera.y = ship.y
    }
    this.emit()
  }

  togglePause() {
    if (!this.pauseEnabled) return
    if (this.mode === 'playing') {
      this.sim.mode = 'paused'
      this.audio.stopLoops()
    } else if (this.mode === 'paused') {
      this.sim.mode = 'playing'
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
    this.asteroidMomentum = v
    this.persistAudio()
    this.emit()
  }

  playEffects(effects) {
    for (const e of effects ?? []) {
      try {
        if (e.type === 'fire') {
          this.lastShotAt = performance.now()
          if (!e.userId || e.userId === this.localUserId) this.audio.fire()
        } else if (e.type === 'bang') {
          this.audio.bang(e.size)
          if (e.size === 'ship' && e.userId === this.localUserId) this.audio.setThrust(false)
          if (e.ufoOff || e.size === 'ufo') this.audio.setUfo(false)
        } else if (e.type === 'wave') this.audio.wave()
        else if (e.type === 'ufoWarn') this.audio.stinger('ufo')
        else if (e.type === 'ufoShot') this.audio.ufoShot()
        else if (e.type === 'extraLife') this.audio.extraLife()
        else if (e.type === 'cannonReady' && e.userId === this.localUserId) this.audio.cannonReady()
        else if (e.type === 'nearMiss') this.audio.stinger('near')
        else if (e.type === 'gameover') this.audio.setUfo(false)
      } catch {
        /* keep sim even if audio fails */
      }
    }
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

  loop(now) {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    try {
      if (this.authority) {
        if (this.mode === 'playing') {
          const inputs = this.collectInputs?.() ?? { [this.localUserId]: this.localInput() }
          const effects = this.sim.update(dt, inputs)
          this.lastEffects = effects
          this.effectBuffer.push(...effects)
          this.playEffects(effects)
          const ship = this.ship
          this.audio.setThrust(Boolean(ship?.alive && ship.thrusting))
          this.audio.setUfo(Boolean(this.ufo))
          if (this.sim.sampleNearMiss(ship)) {
            this.nearMissPulse = Math.max(this.nearMissPulse, 0.85)
            if (this.nearMissSting <= 0) {
              this.playEffects([{ type: 'nearMiss' }])
              this.nearMissSting = 2.4
            }
          }
          this.emit()
        } else {
          this.audio.setThrust(false)
          if (this.mode === 'menu') this.sim.updateAttract(dt)
          else if (this.mode === 'gameover') this.sim.updateAftermath(dt)
          this.audio.setUfo(false)
        }
      } else if (this.mode === 'playing') {
        const ship = this.ship
        if (ship) this.sim.predictShip(dt, ship, this.localInput())
        this.audio.setThrust(Boolean(ship?.alive && ship.thrusting))
        this.audio.setUfo(Boolean(this.ufo))
      } else {
        this.audio.setThrust(false)
      }
      this.netSession?.tickNet(now)
      this.syncMusic(dt)
      syncCamera(this.camera, this.viewW, this.viewH, this.ship, dt)
      drawWorld(this.ctx, this, now / 1000)
    } catch (err) {
      console.error(err)
    }
  }
}
