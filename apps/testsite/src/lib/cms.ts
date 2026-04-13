// Utility per interfacciarsi con l'API del CMS
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8789/api/v1/public';
export const API_KEY = import.meta.env.VITE_API_KEY || 'dev-public-key-changeme';

export async function fetchSeed(seedSlug: string, params: Record<string, string> = {}) {
  const url = new URL(`${API_BASE}/${seedSlug}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  
  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': API_KEY }
  });
  
  if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
  return res.json();
}

export async function postSeed(seedSlug: string, data: Record<string, any>) {
  const res = await fetch(`${API_BASE}/${seedSlug}/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
  return res.json();
}
