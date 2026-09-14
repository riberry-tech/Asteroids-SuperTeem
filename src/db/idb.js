export const DB_NAME = 'asteroids-arcade'
export const DB_VERSION = 2
export const SCORES_STORE = 'highscores'
export const SETTINGS_STORE = 'settings'

export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SCORES_STORE)) {
        const store = db.createObjectStore(SCORES_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('score', 'score')
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
