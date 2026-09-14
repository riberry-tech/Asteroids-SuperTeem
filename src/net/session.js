import { MAX_PLAYERS, SNAPSHOT_HZ } from '../game/constants.js'
import { EMPTY_INPUT } from '../game/sim.js'
import { createBroadcastTransport } from './transport.js'

const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ

export function parseMpQuery(search = window.location.search) {
  const q = new URLSearchParams(search)
  const role = q.get('role') === 'player' ? 'player' : 'host'
  const room = q.get('room') || 'local'
  const userId = q.get('user') || (role === 'host' ? 'host' : `player-${Math.random().toString(36).slice(2, 7)}`)
  return { role, room, userId, mp: q.has('mp') || q.get('mp') === '1' }
}

export class MpSession {
  constructor(game, { role, room, userId, onLobby }) {
    this.game = game
    this.role = role
    this.userId = userId
    this.onLobby = onLobby
    this.transport = createBroadcastTransport({ room, role, userId })
    this.peers = new Map()
    this.inputs = new Map()
    this.started = false
    this.hostLeft = false
    this.lastSnapshotAt = 0
    this.closed = false
    this.unsub = this.transport.subscribe((msg) => this.onMessage(msg))
    this.game.localUserId = userId
    this.game.pauseEnabled = false
    this.game.authority = role === 'host'
    this.game.camera.mode = 'follow'
    if (role === 'host') {
      this.peers.set(userId, { userId, displayName: userId })
      this.game.collectInputs = () => this.hostInputs()
      this.game.sim.setRoster(this.roster())
    }
    this.announce()
    this.helloTimer = setInterval(() => this.announce(), 700)
  }

  roster() {
    return [...this.peers.values()].slice(0, MAX_PLAYERS)
  }

  lobbyState() {
    return {
      role: this.role,
      userId: this.userId,
      peers: this.roster(),
      started: this.started,
      hostLeft: this.hostLeft,
      canStart: this.role === 'host' && !this.started && this.peers.size >= 1 && this.peers.size <= MAX_PLAYERS,
    }
  }

  emitLobby() {
    this.onLobby?.(this.lobbyState())
  }

  announce() {
    this.transport.send({ type: 'hello', userId: this.userId })
    if (this.role === 'host') {
      this.transport.send({ type: 'lobby', peers: this.roster(), started: this.started })
      if (this.started) this.broadcastSnapshot()
    }
  }

  hostInputs() {
    const map = { [this.userId]: this.game.localInput() }
    for (const [id, input] of this.inputs) {
      if (id === this.userId) continue
      if (!this.peers.has(id)) continue
      map[id] = input
    }
    return map
  }

  startMatch() {
    if (this.role !== 'host' || this.started) return
    const roster = this.roster()
    this.started = true
    this.game.sim.setRoster(roster)
    this.game.localUserId = this.userId
    this.game.newGame()
    this.transport.send({ type: 'start', roster, runId: this.game.runId })
    this.broadcastSnapshot()
    this.emitLobby()
  }

  broadcastSnapshot() {
    if (this.role !== 'host' || !this.started) return
    this.transport.send({
      type: 'snapshot',
      state: this.game.sim.snapshot(),
      effects: this.game.effectBuffer.splice(0),
      runId: this.game.runId,
    })
  }

  tickNet(now) {
    if (this.role === 'host' && this.started && now - this.lastSnapshotAt >= SNAPSHOT_MS) {
      this.lastSnapshotAt = now
      this.broadcastSnapshot()
    }
    if (this.role === 'player' && this.started) {
      this.transport.send({ type: 'input', userId: this.userId, input: this.game.localInput() })
    }
  }

  onMessage(msg) {
    if (!msg || msg.from === this.userId) return
    if (msg.type === 'hello' && this.role === 'host' && !this.started) {
      if (this.peers.size >= MAX_PLAYERS && !this.peers.has(msg.userId)) return
      this.peers.set(msg.userId, { userId: msg.userId, displayName: msg.userId })
      this.inputs.set(msg.userId, { ...EMPTY_INPUT })
      this.transport.send({ type: 'lobby', peers: this.roster(), started: this.started })
      this.emitLobby()
    }
    if (msg.type === 'lobby' && this.role === 'player' && !this.started) {
      this.peers = new Map(msg.peers.map((p) => [p.userId, p]))
      this.emitLobby()
    }
    if (msg.type === 'start') {
      this.started = true
      this.peers = new Map(msg.roster.map((p) => [p.userId, p]))
      this.game.sim.setRoster(msg.roster)
      this.game.localUserId = this.userId
      this.game.runId = msg.runId
      this.game.sim.mode = 'playing'
      this.emitLobby()
    }
    if (msg.type === 'snapshot' && this.role === 'player') {
      this.started = true
      this.game.runId = msg.runId ?? this.game.runId
      this.game.applyRemoteSnapshot(msg.state, msg.effects)
    }
    if (msg.type === 'input' && this.role === 'host' && this.started) {
      if (!this.peers.has(msg.userId)) return
      this.inputs.set(msg.userId, { ...EMPTY_INPUT, ...msg.input })
    }
    if (msg.type === 'leave') {
      this.peers.delete(msg.userId)
      this.inputs.delete(msg.userId)
      if (this.started) this.game.sim.removeShip(msg.userId)
      this.emitLobby()
    }
    if (msg.type === 'host-gone') {
      this.hostLeft = true
      this.game.sim.mode = 'gameover'
      this.game.emit()
      this.emitLobby()
    }
  }

  destroy({ notify = true } = {}) {
    if (this.closed) return
    this.closed = true
    clearInterval(this.helloTimer)
    if (notify) {
      this.transport.send({ type: this.role === 'host' ? 'host-gone' : 'leave', userId: this.userId })
    }
    this.unsub?.()
    this.transport.close()
  }
}
