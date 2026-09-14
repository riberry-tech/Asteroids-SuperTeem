import assert from 'node:assert/strict'
import { WorldSim } from './sim.js'

function input(partial) {
  return { left: false, right: false, thrust: false, fire: false, hyperspace: false, ...partial }
}

{
  const sim = new WorldSim({ roster: [{ userId: 'a' }, { userId: 'b' }] })
  sim.startMatch()
  const a = sim.shipFor('a')
  const b = sim.shipFor('b')
  a.x = 400
  a.y = 400
  a.invuln = 0
  b.x = 430
  b.y = 400
  b.invuln = 0
  a.angle = 0
  a.fireCd = 0
  sim.asteroids = []
  sim.update(1 / 60, { a: input({ fire: true }), b: input() })
  const lives = sim.lives
  sim.bullets.forEach((bullet) => {
    bullet.x = b.x
    bullet.y = b.y
  })
  sim.collide()
  sim.flushScoreAndGameover()
  assert.equal(sim.lives, lives, 'player bullets must not take lives')
  assert.equal(b.alive, true)
}

{
  const sim = new WorldSim({ roster: [{ userId: 'a' }, { userId: 'b' }] })
  sim.startMatch()
  sim.lives = 1
  sim.asteroids = []
  const a = sim.shipFor('a')
  a.invuln = 0
  a.x = 100
  a.y = 100
  sim.killShip(a, { kind: 'bullet' })
  sim.flushScoreAndGameover()
  assert.equal(sim.lives, 0)
  assert.equal(sim.mode, 'gameover')
  assert.equal(a.respawnIn, 0)
}

{
  const sim = new WorldSim({ roster: [{ userId: 'solo' }] })
  sim.startMatch()
  sim.lives = 5
  sim.score = 9990
  sim.nextLifeAt = 10000
  sim.pendingScore = 20
  sim.flushScoreAndGameover()
  assert.equal(sim.lives, 6)
}

console.log('sim rules ok')
