# How to prepare a game for Game Channels

This guide is for TeemCare developers adding a first-party game to the Game Channel catalogue. Games plug into an existing Channel contract: the Channel owns membership, lobby, seats, Start, the result key, and the score list. The game only plays and hands back a `GameResult`.

Reference implementation: [`src/lib/games/dice/index.tsx`](../src/lib/games/dice/index.tsx) (`dice`). Dice is `defaultPublished`: Workspace managers can bind it without an extra Publish click unless an admin unpublishes it.

Related product context: [Channels-PRD.md](./Channels-PRD.md).

## What you are building

A Game Channel is dedicated to **one** catalogue title (for example `#chess` or `#pacman`). Workspace managers pick that title when they create the Channel. Members join a lobby, sit, and the host starts the match. After play, the Channel records winners, every participant’s score, and a server datestamp.

You do **not** ship:

- Your own lobby, Start button, or player inventing
- A public score webhook
- A remote iframe or third-party game origin
- Cheat-proof competitive servers (out of scope)

You **do** ship a same-origin React module that implements `ChannelGameModule`.

## Three registrations (same `gameId`)

A title is not playable until all three exist.

| Layer | File | Role |
| --- | --- | --- |
| Allowlist | [`convex/lib/gameCatalog.ts`](../convex/lib/gameCatalog.ts) `KNOWN_GAMES` | Backend refuses unknown ids (`NOT_FOUND`) |
| Client module | [`src/lib/games/registry.ts`](../src/lib/games/registry.ts) | Maps `gameId` to `PlayView` / `SpectateView` |
| Admin publish | `/admin/channels/games` | Sets catalogue name and `gameCatalog.enabled`. Code in the repo is not in the create-Channel picker until Publish. Preview runs the module in this deploy only. |

`gameId` is a stable slug (`dice`, `chess`, `pacman`). Do not rename it after publish. Workspace Channels bind `boundGameId` to that slug.

If the allowlist and admin row exist but the registry has no module, the Channel shows that the game is not deployed and Start stays blocked.

## Manifest

Add one object to `KNOWN_GAMES`. Types live in [`src/lib/games/types.ts`](../src/lib/games/types.ts) (keep Convex `GameManifest` in `gameCatalog.ts` in sync).

```ts
{
  gameId: "chess",
  title: "Chess",
  summary: "Two-player chess. Public board for spectators.",
  minPlayers: 2,
  maxPlayers: 2,
  teamMode: "solo",                 // "solo" | "teams" | "either"
  scoreDirection: "higher",         // "higher" | "lower" (display; Channel does not rank yet)
  scoreUnit: "points",              // optional, e.g. "pips", "ms"
  sync: "convex",                   // "convex" | "webrtc"
  spectate: "public",               // "none" | "public" | "delayed"
  supportsReady: false,
  maxLiveStateBytes: 8192,
}
```

### `sync`

- **`convex`** — Turn or low-rate games (Chess, Checkers, Battleship, Dice). Push a JSON snapshot with `ctx.publishLiveState`. Convex is not a 60 fps physics host.
- **`webrtc`** — Real-time arcade (Pacman, Asteroids). Channel still runs lobby, Start, result key, and `commit`. The frame loop stays on peers. Spectate only if you throttle snapshots into `publishLiveState` (for example 5 Hz). Otherwise set `spectate: "none"`.

### `spectate`

- **`public`** — Non-seated Channel members see `SpectateView` and the last live snapshot.
- **`delayed`** — Same pipeline today; delay policy is for a later Channel change. Do not put secrets in the snapshot.
- **`none`** — Spectators see “match in progress” and roster names only. Use for hidden information (Poker hole cards).

### `supportsReady`

When `true`, Start requires every seated player in `readyUserIds`. The v1 Channel panel shows ready state but **does not yet expose a Ready toggle**. Ship `supportsReady: false` unless you also add that control to [`ChannelGamePanel.tsx`](../src/components/channels/ChannelGamePanel.tsx). The mutation already exists: `channelGames:setChannelGameReady`.

### Player counts

`maxPlayers` is clamped to **16** (`HARD_MAX_PLAYERS`). Seat count at Start must fall in `[minPlayers, maxPlayers]`.

## Lifecycle the Channel owns

```text
lobby
  open lobby → sit / leave seat
  host Start
    roster in [min, max]
    ready checks if supportsReady
    no other lobby/playing session on this Channel
    → status playing; result token to seated players only
playing
  PlayView for seats; SpectateView for others (if allowed)
  game may publishLiveState
  commit GameResult | host abort
completed | aborted
  new lobby may open
```

Rules:

- One live session per Channel (`MATCH_IN_PROGRESS` if you try to open a second).
- Roster is frozen after Start. Late arrivals spectate until the next lobby.
- Members only. Guests and bots are out of this slice.
- Chat is on for table talk. Group calling is off.

Do not start play in your module before the panel mounts `PlayView` (that happens only when `status === "playing"`).

## `ChannelGameModule` contract

```ts
export type ChannelGamePlayContext = {
  sessionId: string;
  gameId: string;
  selfUserId: string;
  role: "host" | "player" | "spectator";
  roster: Array<{ userId: string; displayName: string }>;
  liveState: { revision: number; payload: string } | null;
  commit: (input: GameResultInput) => Promise<void>;
  abort: () => Promise<void>;
  publishLiveState: (payload: string) => Promise<void>;
};

export type ChannelGameModule = {
  manifest: GameManifest;
  PlayView: (props: { ctx: ChannelGamePlayContext }) => ReactElement;
  SpectateView: (props: { ctx: ChannelGamePlayContext }) => ReactElement;
};
```

| View | Who | Allowed |
| --- | --- | --- |
| `PlayView` | Seated players | `publishLiveState`, `commit`, `abort` |
| `SpectateView` | Other Channel members when spectate is not `none` | Read `ctx.liveState` only |

The Channel shell holds the result token (`sessionStorage` plus `claimChannelGamePlayToken` on remount). **Do not mint tokens. Do not call `commitChannelGameResult` yourself.** Use `ctx.commit`.

### Must

- Use only `userId` values from `ctx.roster`. Extra ids fail with `INVALID_INPUT`.
- Call `commit` once. A second call fails with `SESSION_CLOSED`.
- Tolerate remount. Seats persist; the Channel reclaims the token for seated players.
- Stay same-origin: TeemCare bundle + Channel APIs only.
- Keep live snapshots under `maxLiveStateBytes` (`LIVE_STATE_TOO_LARGE`).

### Must not

- Open your own lobby or invent players.
- Store the result token in your tables.
- Put hidden cards or private hands in `liveState`.
- Fetch third-party game backends.

### Dice pattern

```ts
await ctx.publishLiveState(JSON.stringify({ roll, by: ctx.selfUserId }));
await ctx.commit({
  outcome: "complete",
  winnerUserIds: [ctx.selfUserId],
  players: [{ userId: ctx.selfUserId, score: roll }],
});
```

Register the module:

```ts
// src/lib/games/registry.ts
[gameId]: { manifest, PlayView, SpectateView }
```

## `GameResult` schema

The Channel fills `channelId`, `gameId`, `sessionId`, and `playedAt` (server clock). You pass:

```ts
type GameResultInput = {
  outcome: "win" | "draw" | "complete";
  players: Array<{ userId: string; score: number; teamKey?: string }>;
  teams?: Array<{
    teamKey: string;
    displayName: string;
    playerUserIds: string[];
    score: number;
  }>;
  winnerUserIds: string[];
  winnerTeamKey?: string;
};
```

| Field | Intent |
| --- | --- |
| `players` | Every participant score (required, non-empty, ≤ 16) |
| `teams` | Optional team scores for team games |
| `winnerUserIds` | Winning player(s); must be seated |
| `winnerTeamKey` | Optional winning team |
| `outcome` | `complete` for solo high-score; `win` / `draw` for contested matches |
| `score` | Finite number. Time-attack can be milliseconds. `scoreDirection: "lower"` is for later ranking UI |

The caller of `commit` must be seated. Spectators cannot commit even with a leaked token (`FORBIDDEN`).

## Hard limits

| Limit | Rule |
| --- | --- |
| Origin | First-party module in the TeemCare client |
| Concurrency | One `lobby` or `playing` session per Channel |
| Seats | Manifest max, hard cap 16 |
| Token | Seated players after Start; spectators never |
| Live state | Last snapshot only; no replay log |
| Arcade | `sync: webrtc`; Channel is not the physics host |
| Reconnect | Seat stays; `PlayView` must remount cleanly |
| Disconnect mid-play | Host abort, or `commit` with remaining roster — document which |
| Bots / guests / parallel tables | Out of this slice |

## Error codes (Channel)

| Code | When |
| --- | --- |
| `NOT_FOUND` | Unknown `gameId` or missing match |
| `GAME_UNPUBLISHED` | Not enabled in the admin catalogue |
| `GAME_MODULE_MISSING` | Allowlist hit but client registry missing (match query) |
| `MATCH_IN_PROGRESS` | Second lobby while one is open |
| `LOBBY_FULL` | Sit past `maxPlayers` |
| `NOT_READY` | Start with `supportsReady` and a seated player not ready |
| `BAD_TOKEN` | Wrong or missing result key |
| `SESSION_CLOSED` | Commit/abort/claim after the match ended, or double commit |
| `LIVE_STATE_TOO_LARGE` | Snapshot over `maxLiveStateBytes` |
| `FORBIDDEN` | Spectator publish/commit/claim, or non-host Start/Abort |
| `INVALID_INPUT` | Seat count, non-roster user, non-finite score |

## Worked examples

### Chess (`sync: convex`, `spectate: public`)

1. Manifest: 2 players, `teamMode: "solo"`.
2. `PlayView`: legal moves; `publishLiveState` with FEN or JSON board; on mate or draw, `commit`.
3. `SpectateView`: same snapshot, no input.
4. Add to `KNOWN_GAMES` and `registry.ts`.
5. Admin Publish. Workspace creates a Games Channel bound to `chess`.

### Pacman (`sync: webrtc`)

Same Channel handshake. Run the arcade loop on peers. Either throttle public snapshots for spectate, or set `spectate: "none"`. `commit` when the run ends (lives = 0, timer, etc.).

### Team arcade

Use `teams[]` plus `winnerUserIds` / `winnerTeamKey`. Every seated player still appears in `players`.

## Suggested file layout

```text
convex/lib/gameCatalog.ts              # KNOWN_GAMES entry
src/lib/games/types.ts                 # contract (do not fork)
src/lib/games/<gameId>/index.tsx       # PlayView + SpectateView
src/lib/games/registry.ts              # gameId → module
```

Admin cannot pick a folder in production and inject it into the Vite bundle. Add the folder in git, deploy the client, then Preview and Publish at `/admin/channels/games`.

Keep game-specific Convex mutations out of the Channel score path unless you need extra turn authority. Scores always go through `ctx.commit`.

## Manual test before asking for Publish

1. `KNOWN_GAMES` and registry share the same `gameId`.
2. Deploy the client so `getChannelGameModule` finds it. Admin Preview at `/admin/channels/games`.
3. Save catalogue name. Publish.
4. Create a Games Channel bound to that id.
5. Open lobby, sit to `minPlayers`, Start.
6. Seated tab can play; a second member tab spectates (or sees the none-spectate copy).
7. One `commit` writes a Scores row (winners, scores, time).
8. Second `commit` fails. Abort leaves no result. New lobby opens after complete/abort.

Copy [`src/lib/games/dice`](../src/lib/games/dice) until the handshake is boring, then replace the views.
