// Client HTTP vers l'API Python (music21) de génération de partitions.

import { DEFAULT_API_URL } from './config.js';

const STORAGE_API_KEY = 'partitio_api_url';

function normalizeBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * Résout l'URL de base de l'API selon la priorité :
 * 1. Paramètre d'URL `?api=https://...`
 * 2. Variable globale `window.PARTITIO_API_URL`
 * 3. `localStorage` (`partitio_api_url`)
 * 4. `DEFAULT_API_URL` (dans config.js ; '' = même origine /api/generate)
 */
export function resolveApiBaseUrl() {
  if (typeof window !== 'undefined') {
    try {
      const qs = new URLSearchParams(window.location.search).get('api');
      if (qs) return normalizeBase(qs);
    } catch { /* ignoré */ }
    if (typeof window.PARTITIO_API_URL === 'string' && window.PARTITIO_API_URL.trim()) {
      return normalizeBase(window.PARTITIO_API_URL);
    }
    try {
      const saved = window.localStorage?.getItem(STORAGE_API_KEY);
      if (saved) return normalizeBase(saved);
    } catch { /* ignoré */ }
  }
  return normalizeBase(DEFAULT_API_URL);
}

/**
 * Appelle `POST /api/generate` sur le backend Python (music21)
 * et retourne l'objet `score` JSON directement consommable par le front-end.
 */
export async function generateScoreFromApi(settings, seed, { signal, apiBaseUrl } = {}) {
  const base = apiBaseUrl !== undefined ? normalizeBase(apiBaseUrl) : resolveApiBaseUrl();
  const endpoint = `${base}/api/generate`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings, seed }),
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) detail = String(errBody.detail);
    } catch { /* ignoré */ }
    throw new Error(`Erreur de l'API de génération (${detail})`);
  }

  return response.json();
}
