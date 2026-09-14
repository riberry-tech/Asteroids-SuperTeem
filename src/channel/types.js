/**
 * ChannelGameModule contract (copy into TeemCare). Do not fork in production;
 * keep this file aligned with TeemCare `src/lib/games/types.ts`.
 *
 * @typedef {'host'|'player'|'spectator'} ChannelGameRole
 *
 * @typedef {{ userId: string, displayName: string }} ChannelRosterEntry
 *
 * @typedef {{
 *   sessionId: string,
 *   gameId: string,
 *   selfUserId: string,
 *   role: ChannelGameRole,
 *   roster: ChannelRosterEntry[],
 *   liveState: { revision: number, payload: string } | null,
 *   commit: (input: GameResultInput) => Promise<void>,
 *   abort: () => Promise<void>,
 *   publishLiveState: (payload: string) => Promise<void>,
 * }} ChannelGamePlayContext
 *
 * @typedef {{
 *   outcome: 'win'|'draw'|'complete',
 *   players: Array<{ userId: string, score: number, teamKey?: string }>,
 *   teams?: Array<{ teamKey: string, displayName: string, playerUserIds: string[], score: number }>,
 *   winnerUserIds: string[],
 *   winnerTeamKey?: string,
 * }} GameResultInput
 *
 * @typedef {{
 *   gameId: string,
 *   title: string,
 *   summary: string,
 *   minPlayers: number,
 *   maxPlayers: number,
 *   teamMode: 'solo'|'teams'|'either',
 *   scoreDirection: 'higher'|'lower',
 *   scoreUnit?: string,
 *   sync: 'convex'|'webrtc',
 *   spectate: 'none'|'public'|'delayed',
 *   supportsReady: boolean,
 *   maxLiveStateBytes: number,
 * }} GameManifest
 */

export const ASTEROIDS_MANIFEST = {
  gameId: 'asteroids',
  title: 'Asteroids',
  summary: 'Co-op crew vs asteroids and UFO. Shared lives. Up to 4 ships.',
  minPlayers: 1,
  maxPlayers: 4,
  teamMode: 'teams',
  scoreDirection: 'higher',
  scoreUnit: 'points',
  sync: 'webrtc',
  spectate: 'none',
  supportsReady: false,
  maxLiveStateBytes: 8192,
}

/**
 * @param {ChannelRosterEntry[]} roster
 * @param {number} sharedScore
 * @returns {GameResultInput}
 */
export function asteroidsGameResult(roster, sharedScore) {
  const playerUserIds = roster.map((p) => p.userId)
  return {
    outcome: 'complete',
    players: playerUserIds.map((userId) => ({ userId, score: sharedScore, teamKey: 'crew' })),
    teams: [
      {
        teamKey: 'crew',
        displayName: 'Crew',
        playerUserIds,
        score: sharedScore,
      },
    ],
    winnerUserIds: [],
  }
}
