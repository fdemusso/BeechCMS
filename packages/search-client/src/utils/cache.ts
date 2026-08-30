export async function fetchWithCache(url: string, etag?: string): Promise<ArrayBuffer> {
  const isCachesAvailable = typeof caches !== 'undefined';
  
  if (isCachesAvailable) {
    const CACHE_NAME = 'beechcms-vector-cache';
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    
    const headers = new Headers();
    if (cachedResponse) {
      if (etag) {
        headers.set('If-None-Match', etag);
      } else {
        const cachedEtag = cachedResponse.headers.get('ETag');
        if (cachedEtag) headers.set('If-None-Match', cachedEtag);
      }
    }

    const response = await fetch(url, { headers });

    if (response.status === 304 && cachedResponse) {
      return cachedResponse.arrayBuffer();
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const responseToCache = response.clone();
    await cache.put(url, responseToCache);
    return response.arrayBuffer();
  }

  // Fallback to IndexedDB
  return fetchWithIDBCache(url, etag);
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not available'));
    }
    const req = indexedDB.open('beechcms-idb-cache', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('vectors');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<{ buffer: ArrayBuffer, etag: string | null } | undefined> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readonly');
      const store = tx.objectStore('vectors');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(key: string, buffer: ArrayBuffer, etag: string | null): Promise<void> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readwrite');
      const store = tx.objectStore('vectors');
      const req = store.put({ buffer, etag }, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

async function fetchWithIDBCache(url: string, etag?: string): Promise<ArrayBuffer> {
  const cached = await idbGet(url);
  const headers = new Headers();
  if (cached) {
    if (etag) {
      headers.set('If-None-Match', etag);
    } else if (cached.etag) {
      headers.set('If-None-Match', cached.etag);
    }
  }

  const response = await fetch(url, { headers });

  if (response.status === 304 && cached) {
    return cached.buffer;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const responseEtag = response.headers.get('ETag');
  await idbPut(url, buffer, responseEtag);
  
  return buffer;
}
