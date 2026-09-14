/**
 * Swappable realtime transport. Channel WebRTC later; BroadcastChannel now.
 *
 * @typedef {object} NetTransport
 * @property {'host'|'player'} role
 * @property {(handler: (msg: object) => void) => () => void} subscribe
 * @property {(msg: object) => void} send
 * @property {() => void} close
 */

export function createBroadcastTransport({ room = 'local', role, userId }) {
  const channel = new BroadcastChannel(`asteroids-mp:${room}`)
  return {
    role,
    userId,
    room,
    subscribe(handler) {
      const onMsg = (ev) => handler(ev.data)
      channel.addEventListener('message', onMsg)
      return () => channel.removeEventListener('message', onMsg)
    },
    send(msg) {
      channel.postMessage({ ...msg, from: userId, role })
    },
    close() {
      channel.close()
    },
  }
}
