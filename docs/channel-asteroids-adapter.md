# Asteroids Channel adapter

TeemCare Game Channel owns lobby, seats, Start, result token, and scores. This repo keeps a standalone game plus a `NetTransport` seam. Do not add `KNOWN_GAMES` here.

## Manifest (copy later)

`gameId`: `asteroids`  
`minPlayers` 1, `maxPlayers` 4  
`teamMode`: `teams` (one crew)  
`sync`: `webrtc`  
`spectate`: `none`  
`supportsReady`: `false`

Types and `asteroidsGameResult()` live in [`src/channel/types.js`](../src/channel/types.js).

## Must

- Start sim only when Channel mounts `PlayView` (`status === playing`).
- Map `ctx.roster` userIds to ships. Drop unknown ids.
- Host (`ctx.role === host`) runs `WorldSim`. Others send inputs over WebRTC (replace `createBroadcastTransport`).
- Call `ctx.commit` **once** on game over with shared score. Second call is `SESSION_CLOSED`.
- Host disconnect mid-play: `ctx.abort()`. Peer leave: remove that ship, lives/score unchanged.
- Remount: do not `newGame()`. Host re-sends snapshot.
- Same origin. No third-party game backend. No own lobby.

## Must not

- Invent players or Start.
- Mint or store the result token.
- Put a 60fps field in `publishLiveState` (v1 spectate none).
- Pause (desyncs host).

## Disconnect

| Event | Result |
| --- | --- |
| Host gone | abort, no score row |
| Player gone | ship removed, match continues if anyone seated |
| Lives 0 | `commit` complete, crew shared score, `winnerUserIds: []` |

## Local harness (this repo)

`/?mp=1&role=host` then a second tab `/?mp=1&role=player&room=local`. BroadcastChannel only. Channel WebRTC is the later swap behind `NetTransport`.
