import { DEFAULT_AUDIO_SETTINGS } from '../db/settings.js'
import { AdaptiveMusic } from './music.js'

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.sfxMuted = DEFAULT_AUDIO_SETTINGS.sfxMuted
    this.musicMuted = DEFAULT_AUDIO_SETTINGS.musicMuted
    this.sfxVolume = DEFAULT_AUDIO_SETTINGS.sfxVolume
    this.musicVolume = DEFAULT_AUDIO_SETTINGS.musicVolume
    this.thrust = null
    this.ufo = null
    this.music = new AdaptiveMusic(this)
  }

  get muted() {
    return this.sfxMuted
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      this.ctx = new Ctx()
      this.buildGraph()
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    this.music.start()
    this.applyMix()
  }

  buildGraph() {
    const ctx = this.ctx
    this.sfxBus = ctx.createGain()
    this.musicBus = ctx.createGain()
    this.master = ctx.createDynamicsCompressor()
    this.master.threshold.value = -18
    this.master.knee.value = 10
    this.master.ratio.value = 2.2
    this.master.attack.value = 0.012
    this.master.release.value = 0.22
    this.sfxBus.connect(this.master)
    this.musicBus.connect(this.master)
    this.master.connect(ctx.destination)
    this.applyMix()
  }

  applySettings(settings) {
    if (!settings) return
    if (typeof settings.sfxMuted === 'boolean') this.sfxMuted = settings.sfxMuted
    if (typeof settings.musicMuted === 'boolean') this.musicMuted = settings.musicMuted
    if (Number.isFinite(settings.sfxVolume)) this.sfxVolume = clamp01(settings.sfxVolume)
    if (Number.isFinite(settings.musicVolume)) this.musicVolume = clamp01(settings.musicVolume)
    this.applyMix()
    if (this.sfxMuted) this.stopLoops()
  }

  snapshot() {
    return {
      sfxMuted: this.sfxMuted,
      musicMuted: this.musicMuted,
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
    }
  }

  applyMix() {
    if (!this.sfxBus || !this.ctx) return
    const t = this.ctx.currentTime
    const sfx = this.sfxMuted ? 0 : this.sfxVolume
    const music = this.musicMuted ? 0 : this.musicVolume
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.04)
    this.musicBus.gain.setTargetAtTime(music, t, 0.08)
  }

  setSfxVolume(v) {
    this.sfxVolume = clamp01(v)
    this.applyMix()
  }

  setMusicVolume(v) {
    this.musicVolume = clamp01(v)
    this.applyMix()
  }

  toggleSfxMute() {
    this.sfxMuted = !this.sfxMuted
    if (this.sfxMuted) this.stopLoops()
    this.applyMix()
    return this.sfxMuted
  }

  toggleMusicMute() {
    this.musicMuted = !this.musicMuted
    this.applyMix()
    return this.musicMuted
  }

  toggleMute() {
    return this.toggleSfxMute()
  }

  stopLoops() {
    this.setThrust(false)
    this.setUfo(false)
  }

  duck(amount) {
    this.music.duck(amount)
  }

  stinger(kind) {
    this.music.stinger(kind)
  }

  updateMusic(dt, signals) {
    this.music.update(dt, signals)
  }

  out() {
    return this.sfxBus || this.ctx?.destination
  }

  beep(freq, dur, type = 'square', gain = 0.05, slide = 0) {
    if (this.sfxMuted || !this.ctx || !this.out()) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(40, freq), t)
    if (slide) {
      try {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur)
      } catch {
        osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur)
      }
    }
    g.gain.setValueAtTime(Math.max(0.001, gain), t)
    try {
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    } catch {
      g.gain.linearRampToValueAtTime(0, t + dur)
    }
    osc.connect(g)
    g.connect(this.out())
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  noise(dur, gain = 0.08, hp = 400) {
    this.noiseBurst({ dur, gain, filter: 'highpass', freq: hp, color: 'white' })
  }

  noiseBurst({
    dur,
    gain = 0.06,
    filter = 'bandpass',
    freq = 400,
    q = 0.7,
    color = 'white',
    delay = 0,
  } = {}) {
    if (this.sfxMuted || !this.ctx || !this.out()) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
    fillNoise(buffer.getChannelData(0), color)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(Math.max(0.001, gain), t)
    try {
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    } catch {
      g.gain.linearRampToValueAtTime(0, t + dur)
    }
    src.connect(f)
    f.connect(g)
    g.connect(this.out())
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  muffledBoom({ freq = 80, dur = 0.3, gain = 0.07 } = {}) {
    this.noiseBurst({
      dur,
      gain,
      filter: 'lowpass',
      freq: freq * 1.8,
      q: 0.6,
      color: 'brown',
    })
    this.beep(freq, dur * 0.85, 'sine', gain * 0.55, -freq * 0.45)
  }

  rockCrumble(size) {
    const heavy = size === 3
    const chunks = heavy ? 5 : 4
    for (let i = 0; i < chunks; i++) {
      const delay = i * (heavy ? 0.028 : 0.02) + Math.random() * 0.012
      this.noiseBurst({
        dur: heavy ? 0.14 : 0.09,
        gain: (heavy ? 0.07 : 0.05) * (1 - i * 0.12),
        filter: 'bandpass',
        freq: (heavy ? 140 : 260) + Math.random() * (heavy ? 180 : 320),
        q: heavy ? 1.4 : 2.2,
        color: 'brown',
        delay,
      })
    }
    this.noiseBurst({
      dur: heavy ? 0.22 : 0.14,
      gain: heavy ? 0.05 : 0.035,
      filter: 'bandpass',
      freq: heavy ? 90 : 150,
      q: 0.9,
      color: 'pink',
    })
  }

  sandScatter() {
    const grains = 9
    for (let i = 0; i < grains; i++) {
      this.noiseBurst({
        dur: 0.045 + Math.random() * 0.04,
        gain: 0.028 + Math.random() * 0.018,
        filter: 'highpass',
        freq: 2200 + Math.random() * 2800,
        q: 0.5,
        color: 'white',
        delay: Math.random() * 0.09,
      })
    }
    this.noiseBurst({
      dur: 0.16,
      gain: 0.04,
      filter: 'bandpass',
      freq: 900,
      q: 0.8,
      color: 'pink',
    })
  }

  metalShatter({ brighter = false } = {}) {
    const metal = brighter
      ? [186, 311, 415, 622, 880]
      : [155, 247, 370, 523, 740]
    metal.forEach((f, i) => {
      this.beep(f, 0.18 + i * 0.04, i % 2 ? 'triangle' : 'square', 0.018 - i * 0.002, -f * 0.35)
    })
    const glass = brighter
      ? [1840, 2460, 3120, 4180, 5320]
      : [1620, 2180, 2870, 3650, 4900]
    glass.forEach((f, i) => {
      this.beep(f, 0.22 + i * 0.05, 'sine', 0.016, -f * 0.55)
    })
    for (let i = 0; i < 6; i++) {
      this.noiseBurst({
        dur: 0.05 + Math.random() * 0.04,
        gain: 0.045,
        filter: 'highpass',
        freq: 2800 + Math.random() * 3500,
        q: 0.7,
        color: 'white',
        delay: i * 0.018,
      })
    }
  }

  fire() {
    this.beep(980, 0.1, 'square', 0.045, -420)
    this.duck(0.22)
  }

  cannonReady() {
    this.beep(1480, 0.07, 'triangle', 0.03, 120)
  }

  ufoShot() {
    this.beep(310, 0.11, 'sawtooth', 0.04, 90)
  }

  bang(size) {
    if (size === 'ship') {
      this.beep(78, 0.22, 'square', 0.05, -30)
      this.metalShatter()
      this.muffledBoom({ freq: 62, dur: 0.44, gain: 0.085 })
      this.duck(0.4)
      return
    }
    if (size === 'ufo') {
      this.beep(210, 0.16, 'triangle', 0.05, -70)
      this.metalShatter({ brighter: true })
      this.muffledBoom({ freq: 88, dur: 0.34, gain: 0.07 })
      this.duck(0.32)
      return
    }
    const map = { 3: { f: 92, d: 0.2 }, 2: { f: 168, d: 0.16 }, 1: { f: 290, d: 0.12 } }
    const tone = map[size] ?? map[1]
    this.beep(tone.f, tone.d, 'square', 0.042, -40)
    if (size === 1) {
      this.sandScatter()
      this.muffledBoom({ freq: 150, dur: 0.2, gain: 0.042 })
    } else {
      this.rockCrumble(size)
      this.muffledBoom({
        freq: size === 3 ? 52 : 88,
        dur: size === 3 ? 0.4 : 0.26,
        gain: size === 3 ? 0.08 : 0.055,
      })
    }
    this.duck(0.22)
  }

  extraLife() {
    ;[523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.12, 'square', 0.05), i * 90)
    })
  }

  wave() {
    this.beep(220, 0.18, 'triangle', 0.04, 180)
    this.stinger('wave')
  }

  setThrust(on) {
    if (!on || this.sfxMuted || !this.ctx || !this.out()) {
      if (this.thrust) {
        try {
          this.thrust.stop()
        } catch {
          /* already stopped */
        }
        this.thrust = null
      }
      return
    }
    if (this.thrust) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const f = this.ctx.createBiquadFilter()
    osc.type = 'sawtooth'
    osc.frequency.value = 55
    f.type = 'lowpass'
    f.frequency.value = 180
    g.gain.value = 0.025
    osc.connect(f)
    f.connect(g)
    g.connect(this.out())
    osc.start()
    this.thrust = osc
  }

  setUfo(on) {
    if (!on || this.sfxMuted || !this.ctx || !this.out()) {
      if (this.ufo) {
        try {
          this.ufo.stop()
        } catch {
          /* already stopped */
        }
        this.ufo = null
      }
      return
    }
    if (this.ufo) return
    const osc = this.ctx.createOscillator()
    const lfo = this.ctx.createOscillator()
    const lfoGain = this.ctx.createGain()
    const g = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 210
    lfo.frequency.value = 3.2
    lfoGain.gain.value = 80
    g.gain.value = 0.018
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    osc.connect(g)
    g.connect(this.out())
    osc.start()
    lfo.start()
    osc.onended = () => {
      try {
        lfo.stop()
      } catch {
        /* already stopped */
      }
    }
    this.ufo = osc
  }

  destroy() {
    this.stopLoops()
    this.music.stop()
  }
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

function fillNoise(data, color) {
  if (color === 'brown') {
    let last = 0
    for (let i = 0; i < data.length; i++) {
      last += (Math.random() * 2 - 1) * 0.02
      last *= 0.98
      data[i] = last * 3.2
    }
    return
  }
  if (color === 'pink') {
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.052691
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11
    }
    return
  }
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
}
