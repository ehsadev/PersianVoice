export interface Template { id: string; name: string; schema: string; updated: number }
const DB = 'ava-templates-v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('templates', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', mode);
    const request = action(tx.objectStore('templates'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listTemplates(): Promise<Template[]> { return (await transact('readonly', s => s.getAll() as IDBRequest<Template[]>)).sort((a, b) => b.updated - a.updated); }
export async function saveTemplate(item: Template): Promise<void> { await transact('readwrite', s => s.put(item)); }
export async function deleteTemplate(id: string): Promise<void> { await transact('readwrite', s => s.delete(id)); }
