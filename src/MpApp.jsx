import { useEffect, useRef, useState } from 'react'
import { Game } from './game/Game.js'
import { FIRE_COOLDOWN } from './game/constants.js'
import { MpSession, parseMpQuery } from './net/session.js'
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

export default function MpApp() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const sessionRef = useRef(null)
  const cfgRef = useRef(null)
  if (!cfgRef.current) cfgRef.current = parseMpQuery()
  const cfg = cfgRef.current
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
  const [lobby, setLobby] = useState({
    role: cfg.role,
    userId: cfg.userId,
    peers: [],
    started: false,
    hostLeft: false,
    canStart: cfg.role === 'host',
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const game = new Game(canvas, {
      onState: setHud,
      localUserId: cfg.userId,
      cameraMode: 'follow',
      pauseEnabled: false,
    })
    gameRef.current = game
    const session = new MpSession(game, {
      role: cfg.role,
      room: cfg.room,
      userId: cfg.userId,
      onLobby: setLobby,
    })
    sessionRef.current = session
    game.netSession = session
    game.startLoop()

    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return
      game.audio.unlock()
      if (e.code === 'KeyM') {
        game.toggleSfxMute()
        return
      }
      if (e.code === 'KeyN') {
        game.toggleMusicMute()
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
    const onHide = () => session.destroy({ notify: true })
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pagehide', onHide)
      session.destroy({ notify: false })
      game.destroy()
    }
  }, [])

  function hold(action, value) {
    const game = gameRef.current
    if (!game) return
    game.audio.unlock()
    game.input[action] = value
  }

  const firePct = Math.round((1 - hud.fireCd / FIRE_COOLDOWN) * 100)
  const joinUrl = `${window.location.origin}${window.location.pathname}?mp=1&role=player&room=${encodeURIComponent(cfg.room)}`
  const showLobby = !lobby.started || lobby.hostLeft
  const playing = lobby.started && hud.mode === 'playing'

  return (
    <div className="shell" onPointerDown={() => gameRef.current?.audio.unlock()}>
      <canvas ref={canvasRef} />

      {playing && (
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
              CREW {lobby.peers.length} // SECTOR {hud.wave}
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

      {showLobby && (
        <div className="overlay">
          <div className="panel">
            <h1 className="logo" style={{ fontSize: 40 }}>
              CREW LINK
            </h1>
            <p className="tag">
              {cfg.role === 'host' ? 'HOST' : 'PLAYER'} // ROOM {cfg.room} // {cfg.userId}
            </p>
            {lobby.hostLeft && <p className="muted-note">HOST LEFT — SESSION CLOSED</p>}
            <ul className="score-list">
              {lobby.peers.map((p) => (
                <li key={p.userId}>
                  <span>{p.userId === cfg.userId ? 'YOU' : 'P'}</span>
                  <span className="score-name">{p.userId}</span>
                </li>
              ))}
              {lobby.peers.length === 0 && <li className="empty">Waiting for host...</li>}
            </ul>
            {cfg.role === 'host' && !lobby.started && (
              <>
                <p className="muted-note">Open a second tab as player:</p>
                <p className="tag" style={{ wordBreak: 'break-all' }}>
                  {joinUrl}
                </p>
                <div className="actions">
                  <button className="btn" onClick={() => sessionRef.current?.startMatch()}>
                    Start crew
                  </button>
                </div>
              </>
            )}
            {cfg.role === 'player' && !lobby.started && !lobby.hostLeft && (
              <p className="muted-note">Waiting for host to start. Max 4 ships. Shared lives.</p>
            )}
            <div className="actions" style={{ marginTop: 16 }}>
              <a className="btn ghost" href="./">
                Solo
              </a>
            </div>
          </div>
        </div>
      )}

      {lobby.started && hud.mode === 'gameover' && !lobby.hostLeft && (
        <div className="overlay">
          <div className="panel">
            <h1 className="logo" style={{ fontSize: 40 }}>
              HULLS LOST
            </h1>
            <p className="tag">
              CREW SCORE {hud.score} // SECTOR {hud.wave}
            </p>
            <p className="muted-note">Shared score. Channel commit is a later TeemCare step.</p>
            <div className="actions">
              <a className="btn ghost" href="./">
                Solo
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="touch">
        <div className="touch-cluster">
          <button className="pad" onPointerDown={() => hold('left', true)} onPointerUp={() => hold('left', false)} onPointerLeave={() => hold('left', false)}>
            ⟨
          </button>
          <button className="pad" onPointerDown={() => hold('right', true)} onPointerUp={() => hold('right', false)} onPointerLeave={() => hold('right', false)}>
            ⟩
          </button>
        </div>
        <div className="touch-cluster">
          <button className="pad" onPointerDown={() => hold('thrust', true)} onPointerUp={() => hold('thrust', false)} onPointerLeave={() => hold('thrust', false)}>
            ▲
          </button>
          <button className="pad" aria-label="Hyperspace" onPointerDown={() => hold('hyperspace', true)} onPointerUp={() => hold('hyperspace', false)} onPointerLeave={() => hold('hyperspace', false)}>
            H
          </button>
          <button className="pad" onPointerDown={() => hold('fire', true)} onPointerUp={() => hold('fire', false)} onPointerLeave={() => hold('fire', false)}>
            ✦
          </button>
        </div>
      </div>
    </div>
  )
}
