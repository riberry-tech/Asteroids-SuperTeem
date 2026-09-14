import { openDb, SCORES_STORE } from './idb.js'

export const MAX_SCORES = 10
export const NAME_MAX = 8

export async function getHighScores(limit = MAX_SCORES) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readonly')
    const request = tx.objectStore(SCORES_STORE).getAll()
    request.onsuccess = () => {
      const rows = (request.result ?? [])
        .sort((a, b) => b.score - a.score || b.date - a.date)
        .slice(0, limit)
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}

export function formatScoreAge(date, now = Date.now()) {
  const ms = Math.max(0, now - Number(date || 0))
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (ms < minute) return 'Just now'
  if (ms < hour) return `${Math.floor(ms / minute)}m ago`
  if (ms < day) return `${Math.floor(ms / hour)}h ago`
  return `${Math.floor(ms / day)}d ago`
}

export function sanitizePilotName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, NAME_MAX)
}

async function pruneScores() {
  const all = await getHighScores(9999)
  if (all.length <= MAX_SCORES) return all.slice(0, MAX_SCORES)
  const keep = all.slice(0, MAX_SCORES)
  const keepIds = new Set(keep.map((row) => row.id))
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readwrite')
    const store = tx.objectStore(SCORES_STORE)
    for (const row of all) {
      if (!keepIds.has(row.id)) store.delete(row.id)
    }
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  return keep
}

export async function addHighScore({ score, wave, name = '' }) {
  const db = await openDb()
  const entry = {
    name: sanitizePilotName(name),
    score: Math.max(0, Math.floor(score)),
    wave: Math.max(1, Math.floor(wave)),
    date: Date.now(),
  }

  const id = await new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readwrite')
    const req = tx.objectStore(SCORES_STORE).add(entry)
    let key = null
    req.onsuccess = () => {
      key = req.result
    }
    tx.oncomplete = () => resolve(key)
    tx.onerror = () => reject(tx.error)
  })

  const scores = await pruneScores()
  const rank = scores.findIndex((row) => row.id === id) + 1
  return {
    scores,
    id,
    rank,
    madeBoard: rank > 0,
  }
}

export async function setHighScoreName(id, name) {
  const db = await openDb()
  const clean = sanitizePilotName(name)
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readwrite')
    const store = tx.objectStore(SCORES_STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const row = req.result
      if (!row) return
      row.name = clean
      store.put(row)
    }
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  return getHighScores()
}
