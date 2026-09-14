import { openDb, SETTINGS_STORE } from './idb.js'

export const AUDIO_SETTINGS_ID = 'audio'

/** SFX defaults to 0.8; music defaults to 50% of that (0.4). */
export const DEFAULT_AUDIO_SETTINGS = {
  sfxMuted: false,
  musicMuted: false,
  sfxVolume: 0.8,
  musicVolume: 0.4,
  asteroidMomentum: 0.3,
}

export async function getAudioSettings() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly')
    const req = tx.objectStore(SETTINGS_STORE).get(AUDIO_SETTINGS_ID)
    req.onsuccess = () => {
      resolve({ ...DEFAULT_AUDIO_SETTINGS, ...(req.result ?? {}) })
    }
    req.onerror = () => reject(req.error)
  })
}

export async function saveAudioSettings(settings) {
  const db = await openDb()
  const row = {
    id: AUDIO_SETTINGS_ID,
    sfxMuted: Boolean(settings.sfxMuted),
    musicMuted: Boolean(settings.musicMuted),
    sfxVolume: clamp01(settings.sfxVolume),
    musicVolume: clamp01(settings.musicVolume),
    asteroidMomentum: clamp01(settings.asteroidMomentum),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite')
    tx.objectStore(SETTINGS_STORE).put(row)
    tx.oncomplete = () => resolve(row)
    tx.onerror = () => reject(tx.error)
  })
}

function clamp01(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}
