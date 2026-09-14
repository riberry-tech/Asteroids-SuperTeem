import { useEffect, useRef, useState } from 'react'
import { Game } from './game/Game.js'
import { FIRE_COOLDOWN } from './game/constants.js'
import { addHighScore, formatScoreAge, getHighScores, NAME_MAX, sanitizePilotName, setHighScoreName } from './db/scores.js'
import './App.css'

const KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'thrust',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'thrust',
  Space: 'fire',
  KeyH: 'hyperspace',
}

let lastSavedRunId = 0

export default function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const [hud, setHud] = useState({
    mode: 'menu',
    score: 0,
    lives: 5,
    wave: 1,
    fireCd: 0,
    muted: false,
    sfxMuted: false,
    musicMuted: false,
    sfxVolume: 0.8,
    musicVolume: 0.4,
    asteroidMomentum: 0.3,
    runId: 0,
  })
  const [view, setView] = useState('menu')
  const [scores, setScores] = useState([])
  const [saved, setSaved] = useState(false)
  const [madeBoard, setMadeBoard] = useState(false)
  const [pendingScoreId, setPendingScoreId] = useState(null)
  const [pilotName, setPilotName] = useState('')
  const [named, setNamed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const canvas = canvasRef.current
    const game = new Game(canvas, { onState: setHud })
    gameRef.current = game
    game.startLoop()
    getHighScores().then(setScores).catch(() => setScores([]))

    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return
      game.audio.unlock()
      if (e.code === 'Escape') {
        e.preventDefault()
        if (game.mode === 'playing' || game.mode === 'paused') {
          game.togglePause()
          return
        }
        goMenu()
        return
      }
      if (e.code === 'KeyP') {
        e.preventDefault()
        game.togglePause()
        return
      }
      if (e.code === 'KeyM') {
        game.toggleSfxMute()
        return
      }
      if (e.code === 'KeyN') {
        game.toggleMusicMute()
        return
      }
      if (e.code === 'Enter' && game.mode === 'menu') {
        start()
        return
      }
      const bind = KEYS[e.code]
      if (bind) {
        e.preventDefault()
        game.input[bind] = true
      }
    }
    const up = (e) => {
      if (e.target instanceof HTMLInputElement) return
      const bind = KEYS[e.code]
      if (bind) {
        e.preventDefault()
        game.input[bind] = false
      }
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      game.destroy()
    }
  }, [])

  useEffect(() => {
    if (hud.mode === 'gameover') {
      setView('gameover')
    } else if (hud.mode === 'playing') {
      setView('play')
    } else if (hud.mode === 'paused') {
      setView('paused')
    } else if (hud.mode === 'menu' && view !== 'scores') {
      setView('menu')
    }
  }, [hud.mode])

  useEffect(() => {
    if (hud.mode !== 'gameover' || !hud.runId || lastSavedRunId === hud.runId) return
    lastSavedRunId = hud.runId
    if (hud.score <= 0) {
      setSaved(false)
      return
    }
    addHighScore({ score: hud.score, wave: hud.wave })
      .then((result) => {
        setScores(result.scores)
        setSaved(true)
        setMadeBoard(result.madeBoard)
        setPendingScoreId(result.madeBoard ? result.id : null)
        setNamed(false)
        setPilotName('')
        setNow(Date.now())
      })
      .catch((err) => {
        console.error(err)
        lastSavedRunId = 0
      })
  }, [hud.mode, hud.runId, hud.score, hud.wave])

  useEffect(() => {
    if (view !== 'scores' && view !== 'gameover') return
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [view])

  function start() {
    setSaved(false)
    setMadeBoard(false)
    setPendingScoreId(null)
    setPilotName('')
    setNamed(false)
    setView('play')
    gameRef.current?.newGame()
  }

  function goMenu() {
    gameRef.current?.toMenu()
    setView('menu')
  }

  async function claimName() {
    if (named) return
    setNamed(true)
    try {
      if (pendingScoreId) {
        const next = await setHighScoreName(pendingScoreId, pilotName)
        setScores(next)
      } else {
        const next = await getHighScores()
        setScores(next)
      }
    } catch (err) {
      console.error(err)
    }
    setNow(Date.now())
    setView('scores')
  }

  function showScores() {
    getHighScores().then(setScores).catch(() => setScores([]))
    setNow(Date.now())
    setView('scores')
  }

  function hold(action, value) {
    const game = gameRef.current
    if (!game) return
    game.audio.unlock()
    game.input[action] = value
  }

  const firePct = Math.round((1 - hud.fireCd / FIRE_COOLDOWN) * 100)

  return (
    <div
      className="shell"
      onPointerDown={() => gameRef.current?.audio.unlock()}
    >
      <canvas ref={canvasRef} />

      {hud.mode === 'playing' && (
        <div className="hud">
          <div className="hud-top">
            <div>
              <div className="hud-score">{String(hud.score).padStart(6, '0')}</div>
              <div className="lives">
                {Array.from({ length: hud.lives }, (_, i) => (
                  <span className="life-ship" key={i} />
                ))}
              </div>
            </div>
            <div className="hud-wave">
              SECTOR {hud.wave}
              {hud.ufoInbound && <div className="inbound">SAUCER INBOUND</div>}
            </div>
          </div>
          <div className="weapon">
            <label>CANNON</label>
            <div className={`weapon-bar ${firePct >= 100 ? 'is-ready' : ''}`}>
              <span style={{ width: `${Math.max(0, firePct)}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="audio-btns">
        {hud.mode === 'playing' || hud.mode === 'paused' ? (
          <button
            className="icon-btn"
            onClick={() => gameRef.current?.togglePause()}
            aria-label={hud.mode === 'paused' ? 'Resume' : 'Pause'}
          >
            {hud.mode === 'paused' ? '▶' : '❚❚'}
          </button>
        ) : null}
        <button
          className={`icon-btn ${hud.sfxMuted ? 'is-off' : ''}`}
          onClick={() => gameRef.current?.toggleSfxMute()}
          aria-label={hud.sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
          aria-pressed={hud.sfxMuted}
          title="SFX mute (M)"
        >
          FX
        </button>
        <button
          className={`icon-btn ${hud.musicMuted ? 'is-off' : ''}`}
          onClick={() => gameRef.current?.toggleMusicMute()}
          aria-label={hud.musicMuted ? 'Unmute music' : 'Mute music'}
          aria-pressed={hud.musicMuted}
          title="Music mute (N)"
        >
          MUS
        </button>
      </div>

      {view === 'menu' && (
        <div className="overlay">
          <div className="panel">
            <h1 className="logo">ASTEROIDS</h1>
            <p className="tag">VECTOR DEFENSE // SECTOR PATROL</p>
            <div className="controls-help">
              <div>A / D or ← → rotate</div>
              <div>W or ↑ thrust</div>
              <div>SPACE fire (1 shot / second)</div>
              <div>H hyperspace &nbsp; P pause</div>
              <div>M mute FX &nbsp; N mute music</div>
            </div>
            <AudioMix hud={hud} gameRef={gameRef} />
            <div className="actions">
              <button className="btn" onClick={start}>
                Start
              </button>
              <button className="btn ghost" onClick={showScores}>
                High scores
              </button>
              <a className="btn ghost" href="./?mp=1&role=host">
                Crew (local)
              </a>
            </div>
          </div>
        </div>
      )}

      {view === 'scores' && (
        <div className="overlay">
          <button className="overlay-back" onClick={goMenu}>
            ← Back to menu
          </button>
          <div className="panel fame">
            <div className="fame-head">
              <h1 className="logo">HALL OF FAME</h1>
              <p className="tag">TOP 10</p>
            </div>
            <ul className="score-list">
              {scores.length === 0 && <li className="empty">No scores yet. Clear a sector.</li>}
              {scores.map((row, i) => (
                <li
                  key={row.id}
                  className={row.id === pendingScoreId ? 'is-you' : undefined}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span className="score-name">{row.name || 'ANON'}</span>
                  <span>{row.score}</span>
                  <span>W{row.wave}</span>
                  <span className="score-age">{formatScoreAge(row.date, now)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {view === 'paused' && (
        <div className="overlay">
          <div className="panel">
            <h1 className="logo" style={{ fontSize: 40 }}>
              PAUSED
            </h1>
            <p className="tag">P OR ESC TO RESUME</p>
            <AudioMix hud={hud} gameRef={gameRef} />
            <div className="actions">
              <button className="btn" onClick={() => gameRef.current?.togglePause()}>
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'gameover' && (
        <div className="overlay">
          <div className="panel">
            <h1 className="logo" style={{ fontSize: 40 }}>
              HULL LOST
            </h1>
            <p className="tag">
              SCORE {hud.score} // SECTOR {hud.wave}
            </p>
            {saved && !madeBoard && <p className="muted-note">SCORE ARCHIVED</p>}
            {hud.score <= 0 && <p className="muted-note">NO SCORE TO ARCHIVE</p>}
            {saved && madeBoard && !named && (
              <div className="name-entry">
                <p className="muted-note">TOP 10 — ENTER DISPLAY NAME</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    claimName()
                  }}
                >
                  <input
                    autoFocus
                    maxLength={NAME_MAX}
                    value={pilotName}
                    placeholder="PILOT"
                    aria-label="Display name"
                    autoComplete="off"
                    onChange={(e) => setPilotName(sanitizePilotName(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.code === 'NumpadEnter') {
                        e.preventDefault()
                        e.stopPropagation()
                        claimName()
                      }
                    }}
                  />
                  <p className="name-hint">{pilotName.length}/{NAME_MAX} LETTERS · ENTER TO CONFIRM</p>
                  <div className="actions">
                    <button className="btn" type="submit">
                      Sign name
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setNamed(true)}
                    >
                      Skip
                    </button>
                  </div>
                </form>
              </div>
            )}
            {saved && madeBoard && named && (
              <p className="muted-note">
                {pilotName ? `${pilotName} LOGGED IN HALL OF FAME` : 'ANON LOGGED IN HALL OF FAME'}
              </p>
            )}
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn" onClick={start}>
                Relaunch
              </button>
              <button className="btn ghost" onClick={showScores}>
                High scores
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="touch">
        <div className="touch-cluster">
          <button
            className="pad"
            onPointerDown={() => hold('left', true)}
            onPointerUp={() => hold('left', false)}
            onPointerLeave={() => hold('left', false)}
          >
            ⟨
          </button>
          <button
            className="pad"
            onPointerDown={() => hold('right', true)}
            onPointerUp={() => hold('right', false)}
            onPointerLeave={() => hold('right', false)}
          >
            ⟩
          </button>
        </div>
        <div className="touch-cluster">
          <button
            className="pad"
            onPointerDown={() => hold('thrust', true)}
            onPointerUp={() => hold('thrust', false)}
            onPointerLeave={() => hold('thrust', false)}
          >
            ▲
          </button>
          <button
            className="pad"
            aria-label="Hyperspace"
            onPointerDown={() => hold('hyperspace', true)}
            onPointerUp={() => hold('hyperspace', false)}
            onPointerLeave={() => hold('hyperspace', false)}
          >
            H
          </button>
          <button
            className="pad"
            onPointerDown={() => hold('fire', true)}
            onPointerUp={() => hold('fire', false)}
            onPointerLeave={() => hold('fire', false)}
          >
            ✦
          </button>
        </div>
      </div>
    </div>
  )
}

function AudioMix({ hud, gameRef }) {
  return (
    <div className="audio-mix">
      <label>
        <span>ASTEROID MOMENTUM {Math.round((hud.asteroidMomentum ?? 0.3) * 100)}%</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round((hud.asteroidMomentum ?? 0.3) * 100)}
          aria-label="Asteroid momentum"
          onChange={(e) => gameRef.current?.setAsteroidMomentum(Number(e.target.value) / 100)}
        />
      </label>
      <label>
        <span>SFX {Math.round(hud.sfxVolume * 100)}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(hud.sfxVolume * 100)}
          aria-label="Sound effects volume"
          onPointerDown={() => gameRef.current?.audio.unlock()}
          onChange={(e) => gameRef.current?.setSfxVolume(Number(e.target.value) / 100)}
        />
      </label>
      <label>
        <span>MUSIC {Math.round(hud.musicVolume * 100)}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(hud.musicVolume * 100)}
          aria-label="Music volume"
          onPointerDown={() => gameRef.current?.audio.unlock()}
          onChange={(e) => gameRef.current?.setMusicVolume(Number(e.target.value) / 100)}
        />
      </label>
      <p className="audio-hint">Music defaults to half of SFX. Settings save with scores.</p>
    </div>
  )
}
