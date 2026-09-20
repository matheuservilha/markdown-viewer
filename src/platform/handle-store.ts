/**
 * The browser's half of remembering a folder between sessions.
 *
 * A `FileSystemHandle` cannot be turned into a string, but it can be stored in
 * IndexedDB and read back after a reload, which is the only way the web build
 * can reopen last session's folder without asking for it again.
 */

const DATABASE = 'markdown-viewer'
const STORE = 'handles'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.addEventListener('upgradeneeded', () => request.result.createObjectStore(STORE))
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(database.transaction(STORE, mode).objectStore(STORE))
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => reject(request.error))
    })
  } finally {
    database.close()
  }
}

export async function putHandle(id: string, handle: FileSystemHandle): Promise<void> {
  await transact('readwrite', (store) => store.put(handle, id))
}

export async function getHandle(id: string): Promise<FileSystemHandle | undefined> {
  try {
    return await transact('readonly', (store) => store.get(id) as IDBRequest<FileSystemHandle>)
  } catch {
    return undefined
  }
}

export async function deleteHandle(id: string): Promise<void> {
  try {
    await transact('readwrite', (store) => store.delete(id))
  } catch {
    // Losing the record only means the folder has to be picked again.
  }
}
