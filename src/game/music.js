import { layerMix } from './musicIntensity.js'

/**
 * Adaptive music: procedural Web Audio (no stem files).
 *
 * Stems would need a DAW, aligned loops, and downloads; this game already
 * synthesizes SFX. A handful of oscillators + filtered noise gives coherent
 * key/tempo, tiny payload, and easy mix tweaks. Hybrid stems can be layered
 * later on the same GainNode buses.
 *
 * Layers (crossfade ~2.5s via setTargetAtTime):
 *   ambient  — sub drone + dust, always on, brightens with intensity
 *   calm     — sparse C/G pad
 *   moderate — gated sub pulse (~90–140 BPM feel)
 *   tense    — tritone pads + air noise
 *
 * Mix: music master sits under SFX; duck() dips the bed on peaks.
 */

const FADE_TAU = 0.85
const PING_MIN = 5.5
const PING_SPAN = 9

export class AdaptiveMusic {
  constructor(audio) {
    this.audio = audio
    this.started = false
    this.intensity = 0.12
    this.pingIn = PING_MIN
    this.beat = 0
    this.lowHealth = false
    this.heartIn = 0
    this.nodes = []
  }

  get ctx() {
    return this.audio.ctx
  }

  start() {
    if (this.started || !this.ctx) return
    this.started = true
    const ctx = this.ctx
    const bus = this.audio.musicBus

    this.duck = ctx.createGain()
    this.duck.gain.value = 1
    this.duck.connect(bus)

    this.gAmbient = ctx.createGain()
    this.gCalm = ctx.createGain()
    this.gMod = ctx.createGain()
    this.gTense = ctx.createGain()
    this.gFx = ctx.createGain()
    for (const g of [this.gAmbient, this.gCalm, this.gMod, this.gTense, this.gFx]) {
      g.gain.value = 0
      g.connect(this.duck)
    }
    this.gFx.gain.value = 1

    this.buildAmbient(ctx)
    this.buildCalm(ctx)
    this.buildModerate(ctx)
    this.buildTense(ctx)

    const mix = layerMix(this.intensity)
    this.gAmbient.gain.value = mix.ambient * 0.045
    this.gCalm.gain.value = mix.calm * 0.035
  }

  osc(ctx, type, freq) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.start()
    this.nodes.push(o)
    return o
  }

  noiseLoop(ctx) {
    const seconds = 2
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.start()
    this.nodes.push(src)
    return src
  }

  buildAmbient(ctx) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 140
    lp.Q.value = 0.7
    this.ambFilter = lp

    const a = this.osc(ctx, 'sine', 41.2)
    const b = this.osc(ctx, 'sine', 61.74)
    const detune = ctx.createOscillator()
    detune.frequency.value = 0.07
    const detuneGain = ctx.createGain()
    detuneGain.gain.value = 4
    detune.connect(detuneGain)
    detuneGain.connect(b.detune)
    detune.start()
    this.nodes.push(detune)

    const mix = ctx.createGain()
    mix.gain.value = 1
    a.connect(mix)
    b.connect(mix)
    mix.connect(lp)

    const dust = this.noiseLoop(ctx)
    const dustLp = ctx.createBiquadFilter()
    dustLp.type = 'lowpass'
    dustLp.frequency.value = 220
    const dustG = ctx.createGain()
    dustG.gain.value = 0.22
    dust.connect(dustLp)
    dustLp.connect(dustG)
    dustG.connect(lp)

    lp.connect(this.gAmbient)
  }

  buildCalm(ctx) {
    const c = this.osc(ctx, 'sine', 65.41)
    const g = this.osc(ctx, 'triangle', 98)
    g.detune.value = 6
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const mix = ctx.createGain()
    mix.gain.value = 0.7
    c.connect(mix)
    g.connect(mix)
    mix.connect(lp)
    lp.connect(this.gCalm)
  }

  buildModerate(ctx) {
    const sub = this.osc(ctx, 'sine', 55)
    this.pulseGain = ctx.createGain()
    this.pulseGain.gain.value = 0.28
    this.pulseLfo = ctx.createOscillator()
    this.pulseLfo.type = 'sine'
    this.pulseLfo.frequency.value = 1.55
    const depth = ctx.createGain()
    depth.gain.value = 0.26
    this.pulseLfo.connect(depth)
    depth.connect(this.pulseGain.gain)
    this.pulseLfo.start()
    this.nodes.push(this.pulseLfo)
    sub.connect(this.pulseGain)

    const tick = this.osc(ctx, 'triangle', 220)
    const tickG = ctx.createGain()
    tickG.gain.value = 0.06
    const tickDepth = ctx.createGain()
    tickDepth.gain.value = 0.05
    this.pulseLfo.connect(tickDepth)
    tickDepth.connect(tickG.gain)
    tick.connect(tickG)

    this.pulseGain.connect(this.gMod)
    tickG.connect(this.gMod)
  }

  buildTense(ctx) {
    const a = this.osc(ctx, 'sawtooth', 146.83)
    const b = this.osc(ctx, 'sawtooth', 207.65)
    a.detune.value = -8
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 720
    bp.Q.value = 1.8
    this.tenseFilter = bp
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.18
    const lfoG = ctx.createGain()
    lfoG.gain.value = 380
    lfo.connect(lfoG)
    lfoG.connect(bp.frequency)
    lfo.start()
    this.nodes.push(lfo)

    const mix = ctx.createGain()
    mix.gain.value = 0.18
    a.connect(mix)
    b.connect(mix)
    mix.connect(bp)
    bp.connect(this.gTense)

    const air = this.noiseLoop(ctx)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
    this.airGain = ctx.createGain()
    this.airGain.gain.value = 0.04
    air.connect(hp)
    hp.connect(this.airGain)
    this.airGain.connect(this.gTense)
  }

  setIntensity(value) {
    const next = Math.min(1, Math.max(0, value))
    const now = this.ctx?.currentTime ?? 0
    const tiny = Math.abs(next - this.intensity) < 0.01
    if (tiny && this._mixAt != null && now - this._mixAt < 0.12) {
      this.intensity = next
      return
    }
    this.intensity = next
    if (!this.started) return
    this._mixAt = now
    const t = now
    const mix = layerMix(this.intensity)
    this.gAmbient.gain.setTargetAtTime(mix.ambient * 0.05, t, FADE_TAU)
    this.gCalm.gain.setTargetAtTime(mix.calm * 0.038, t, FADE_TAU)
    this.gMod.gain.setTargetAtTime(mix.moderate * 0.042, t, FADE_TAU)
    this.gTense.gain.setTargetAtTime(mix.tense * 0.055, t, FADE_TAU)
    if (this.pulseLfo) {
      this.pulseLfo.frequency.setTargetAtTime(1.35 + this.intensity * 1.15, t, 0.6)
    }
    if (this.ambFilter) {
      this.ambFilter.frequency.setTargetAtTime(120 + this.intensity * 220, t, 1.2)
    }
    if (this.tenseFilter) {
      this.tenseFilter.Q.setTargetAtTime(1.4 + this.intensity * 2.2, t, 0.8)
    }
    if (this.airGain) {
      this.airGain.gain.setTargetAtTime(0.03 + this.intensity * 0.08, t, FADE_TAU)
    }
  }

  update(dt, { lives = 5, asteroidCount = 0 } = {}) {
    if (!this.started || this.audio.musicMuted) return
    this.pingIn -= dt * (1 + Math.min(1, asteroidCount / 10) * 0.8)
    if (this.pingIn <= 0) {
      this.metalPing()
      this.pingIn = PING_MIN + Math.random() * PING_SPAN
    }
    this.lowHealth = lives <= 1
    if (this.lowHealth) {
      this.heartIn -= dt
      if (this.heartIn <= 0) {
        this.heartbeat()
        this.heartIn = 1.15
      }
    }
  }

  duck(amount = 0.45) {
    if (!this.started) return
    const t = this.ctx.currentTime
    const g = this.duck.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(Math.max(0.35, 1 - amount), t)
    g.setTargetAtTime(1, t + 0.05, 0.18)
  }

  metalPing() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const f = this.ctx.createBiquadFilter()
    osc.type = 'sine'
    const freq = 880 + Math.random() * 1400
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.5)
    f.type = 'highpass'
    f.frequency.value = 600
    g.gain.setValueAtTime(0.012 + this.intensity * 0.01, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
    osc.connect(f)
    f.connect(g)
    g.connect(this.gFx)
    osc.start(t)
    osc.stop(t + 0.6)
  }

  heartbeat() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (const [delay, gain] of [
      [0, 0.04],
      [0.18, 0.028],
    ]) {
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(70, t + delay)
      osc.frequency.exponentialRampToValueAtTime(38, t + delay + 0.12)
      g.gain.setValueAtTime(gain, t + delay)
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.16)
      osc.connect(g)
      g.connect(this.gFx)
      osc.start(t + delay)
      osc.stop(t + delay + 0.2)
    }
  }

  stinger(kind) {
    if (!this.started || this.audio.musicMuted || !this.ctx) return
    const t = this.ctx.currentTime
    if (kind === 'ufo') {
      ;[311, 370, 466].forEach((freq, i) => {
        this.tone(freq, t + i * 0.09, 0.22, 0.03, 'triangle')
      })
      return
    }
    if (kind === 'wave') {
      this.tone(130.81, t, 0.45, 0.03, 'sine')
      this.tone(196, t + 0.12, 0.5, 0.025, 'sine')
      return
    }
    if (kind === 'near') {
      this.tone(932, t, 0.08, 0.018, 'sine', -200)
    }
  }

  tone(freq, t, dur, gain, type, slide = 0) {
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g)
    g.connect(this.gFx)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  stop() {
    for (const n of this.nodes) {
      try {
        n.stop()
      } catch {
        /* already stopped */
      }
    }
    this.nodes = []
    this.started = false
  }
}
