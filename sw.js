// sw.js — service worker de Chord Scales Machine : garde l'appli en mémoire du navigateur pour qu'elle s'ouvre et
// joue sans connexion. Doit rester À LA RACINE (à côté de index.html) pour couvrir toute l'appli, y compris quand
// elle est publiée dans un sous-dossier (https://…github.io/Chord-Scales/). Tous les chemins sont relatifs à ce fichier.
//
// Deux caches :
//  - « shell » : la page, le code, les styles, la police, les bibliothèques, les icônes. Téléchargé d'un coup à
//    l'installation (si un seul fichier manque, l'installation échoue et l'ancienne version reste en place).
//    Servi « réseau d'abord » (3 s maximum) : en ligne, on a toujours la dernière version publiée ; hors ligne
//    ou réseau trop lent, on prend la copie gardée. Aucun numéro de version à penser à changer.
//  - « sounds » : les ~30 Mo d'échantillons d'instruments. Servi « cache d'abord » (ils ne changent jamais) et
//    téléchargé en arrière-plan, un par un, quand la page le demande (message « precache-sounds »).
// Si la liste des fichiers change, la vérification de cohérence (app/tools/sw-check.test.js, via `npm test`) le signale.

importScripts('app/audio/local-soundfonts.js'); // définit LOCAL_SOUNDFONT_FILES

const SHELL_CACHE = 'chord-scales-shell-v1';
const SOUNDS_CACHE = 'chord-scales-sounds-v1';
const SHELL_TIMEOUT_MS = 3000;

const SHELL_FILES = [
    './',
    'index.html',
    'manifest.webmanifest',
    'app/icons/icon-192.png',
    'app/icons/icon-512.png',
    'app/icons/icon-maskable-512.png',
    'app/icons/apple-touch-icon.png',
    'app/tailwind-built.css',
    'app/style.css',
    'app/fonts/Kalam-Regular.woff',
    'app/fonts/Kalam-Bold.woff',
    'app/vendor/soundfont-player.min.js',
    'app/vendor/vexflow-petaluma.js',
    'app/audio/local-soundfonts.js',
    'app/offline.js',
    'app/theory.js',
    'app/band-patterns.js',
    'app/audio-config.js',
    'app/band/band-helpers.js',
    'app/band/pop-plan.js',
    'app/band/brass-plan.js',
    'app/band/piazzolla-plan.js',
    'app/band/latin-plan.js',
    'app/band/balkan-plan.js',
    'app/band/cuban-plan.js',
    'app/band/meter-plan.js',
    'app/band/ternary-plan.js',
    'app/band/bass-lines.js',
    'app/band/swing-plan.js',
    'app/band/classic-plan.js',
    'app/band/phrase-plan.js',
    'app/band/band-state.js',
    'app/grid/play-order.js',
    'app/grid/grid-format.js',
    'app/grid/generation.js',
    'app/grid/harmony.js',
    'app/grid/edit-ops.js',
    'app/grid/transport.js',
    'app/audio/drum-synths.js',
    'app/audio/note-events.js',
    'app/audio/practice-notes.js',
    'app/ui/grid-view.js',
    'app/ui/scale-cards.js',
    'app/ui/measure-editor.js',
    'app/ui/staff-model.js',
    'app/ui/chord-display.js',
    'app/ui/pastilles.js',
    'app/ui/training-view.js',
    'app/styles/style-meta.js',
    'app/styles/toolkit.js',
    'app/styles/style-builders.js'
];

// Fichiers qui ne changent jamais pour une version donnée : cache d'abord, sans aller vérifier sur le réseau.
const IMMUTABLE_PREFIXES = ['app/vendor/', 'app/fonts/', 'app/icons/'];

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_FILES.map((f) => new Request(scopeUrl(f), { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((k) => (k.startsWith('chord-scales-shell-') && k !== SHELL_CACHE) ||
                               (k.startsWith('chord-scales-sounds-') && k !== SOUNDS_CACHE))
                .map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function relativePath(url) {
    const base = new URL(self.registration.scope);
    return url.pathname.startsWith(base.pathname) ? url.pathname.slice(base.pathname.length) : url.pathname;
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request.url);
    if (hit) return hit;
    const response = await fetch(request.url);
    if (response && response.ok) cache.put(request.url, response.clone());
    return response;
}

function fetchFresh(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { cache: 'no-cache', signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetchFresh(request.url, SHELL_TIMEOUT_MS);
        if (response && response.ok) cache.put(request.url, response.clone());
        return response;
    } catch (err) {
        const hit = await cache.match(request.url, { ignoreSearch: true });
        if (hit) return hit;
        if (request.mode === 'navigate') {
            const index = await cache.match(scopeUrl('index.html'));
            if (index) return index;
        }
        throw err;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // autres sites : on ne touche à rien
    const path = relativePath(url);
    if (path.startsWith('app/sounds/')) {
        event.respondWith(cacheFirst(request, SOUNDS_CACHE));
    } else if (IMMUTABLE_PREFIXES.some((p) => path.startsWith(p))) {
        event.respondWith(cacheFirst(request, SHELL_CACHE));
    } else {
        event.respondWith(networkFirst(request));
    }
});

// --- Téléchargement des sons en arrière-plan ---
async function broadcast(message) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((c) => c.postMessage(message));
}

let precaching = null;
function precacheSounds() {
    if (precaching) return precaching;
    precaching = (async () => {
        const cache = await caches.open(SOUNDS_CACHE);
        const total = LOCAL_SOUNDFONT_FILES.length;
        let done = 0, failed = 0, downloaded = 0;
        for (const file of LOCAL_SOUNDFONT_FILES) {
            const url = scopeUrl(file);
            try {
                if (!(await cache.match(url))) {
                    await broadcast({ type: 'sounds-progress', done, total, failed });
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    await cache.put(url, response);
                    downloaded++;
                }
                done++;
            } catch (err) {
                failed++;
            }
        }
        await broadcast({ type: 'sounds-done', done, total, failed, downloaded });
    })().finally(() => { precaching = null; });
    return precaching;
}

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'precache-sounds') event.waitUntil(precacheSounds());
});
