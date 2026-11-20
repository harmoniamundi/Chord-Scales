// grid/saved-sync.js — synchronisation des grilles sauvegardées entre appareils, par un fichier partagé.
// Deux façons d'atteindre ce fichier, au choix de l'utilisateur (rien n'est activé par défaut) :
//  - un fichier qu'on lit puis réenregistre soi-même (iCloud Drive, Dropbox, clé USB…) ;
//  - un fichier d'un dépôt GitHub privé, lu et écrit automatiquement par l'appli (jeton d'accès personnel).
// Le fichier a le format de la copie de sécurité (grid/saved-library.js, « chord-scales-saved-grids »), version 2 : il garde
// en plus la date de chaque grille, les grilles supprimées et les dossiers créés / supprimés, pour fusionner dans les deux sens.
// Il reste lisible par « Restaurer… ».
//
// Règles de fusion, grille par grille (par son nom) :
//  - la version la plus récente (savedAt) l'emporte ; une suppression plus récente que la grille l'emporte sur elle ;
//  - même contenu des deux côtés : rien à faire ;
//  - deux contenus différents sans date utilisable (anciennes sauvegardes) : on garde les deux, l'une sous « Nom (conflit) » ;
//    le choix est déterministe, pour que tous les appareils arrivent au même résultat.
// Fonctions pures (le réseau passe par une fonction fetch donnée en paramètre) ; testé par grid/saved-sync.test.js.

const SVS_LIB = (typeof slFolderList !== 'undefined')
    ? { slFolderList, slFolderOf, slNormalize, slBuildBackup, slIsBackup, slCleanFolderName, slUniqueName, SL_BACKUP_FORMAT }
    : require('./saved-library.js');

const SVS_VERSION = 2;
const SVS_TOMBSTONE_MS = 400 * 24 * 3600 * 1000; // une suppression est retenue un peu plus d'un an
const SVS_DEFAULT_FILE = 'chord-scales-synchro.json';
const GHS_DEFAULT_PATH = 'chord-scales-sauvegardes.json';
const SVS_CONFIG_PREFIX = 'chordscales-sync:';

// --- Mémoire de synchronisation (localStorage « jamSyncMeta ») ---
// deleted : { nom de grille: date de suppression } ; folders : { nom normalisé: { name, at, deleted } }
function svsCleanMeta(m) {
    const out = { deleted: {}, folders: {} };
    if (!m || typeof m !== 'object') return out;
    if (m.deleted && typeof m.deleted === 'object') {
        Object.keys(m.deleted).forEach(k => { const t = Number(m.deleted[k]); if (k && Number.isFinite(t) && t > 0) out.deleted[k] = t; });
    }
    if (m.folders && typeof m.folders === 'object') {
        Object.keys(m.folders).forEach(k => {
            const r = m.folders[k];
            const name = SVS_LIB.slCleanFolderName(r && r.name);
            const at = Number(r && r.at);
            if (name && Number.isFinite(at) && at > 0) out.folders[SVS_LIB.slNormalize(name)] = { name, at, deleted: !!r.deleted };
        });
    }
    return out;
}

function svsPrune(meta, now) {
    const limit = (Number.isFinite(now) ? now : 0) - SVS_TOMBSTONE_MS;
    Object.keys(meta.deleted).forEach(k => { if (meta.deleted[k] < limit) delete meta.deleted[k]; });
    Object.keys(meta.folders).forEach(k => { const r = meta.folders[k]; if (r.deleted && r.at < limit) delete meta.folders[k]; });
    return meta;
}

// Sauvegarde ramenée à un objet (les plus anciennes étaient un simple tableau).
function svsEntry(e) {
    if (Array.isArray(e)) return { grid: e, settings: null };
    return (e && typeof e === 'object') ? e : null;
}

// Empreinte de contenu (sans la date) : grille, réglages, dossier.
function svsSig(e, clean) {
    const x = svsEntry(e);
    if (!x) return '';
    try {
        const grid = clean ? clean.grid(x.grid) : x.grid;
        const settings = (x.settings && typeof x.settings === 'object') ? (clean ? clean.settings(x.settings) : x.settings) : null;
        return JSON.stringify({ g: grid, s: settings, f: SVS_LIB.slNormalize(SVS_LIB.slFolderOf(x)) });
    } catch (er) { return ''; }
}

// Note les changements faits sur cet appareil entre deux états des sauvegardes :
//  - grille nouvelle ou modifiée (contenu ou dossier) sans nouvelle date : datée de maintenant ;
//  - grille disparue : suppression retenue ;
//  - dossier apparu / disparu de la liste : création / suppression retenue.
// Renvoie { saved, meta } (copies).
function svsTrack(prevSaved, prevFolders, nextSaved, nextFolders, meta, now) {
    const m = svsCleanMeta(meta);
    const prev = prevSaved || {}, next = nextSaved || {};
    const saved = {};
    Object.keys(next).forEach(name => {
        const e = svsEntry(next[name]);
        if (!e) return;
        const p = svsEntry(prev[name]);
        let out = e;
        // Une modification est toujours datée après ce qu'elle remplace (grille ou suppression), même si l'horloge de cet
        // appareil retarde sur celle d'un autre : sinon la version d'origine reviendrait à la synchronisation.
        if (!p) out = { ...e, savedAt: Math.max(now, (m.deleted[name] || 0) + 1) };
        else if (svsSig(p) !== svsSig(e)) {
            const t = (Number.isFinite(e.savedAt) && e.savedAt !== p.savedAt) ? e.savedAt : now;
            out = { ...e, savedAt: Math.max(t, (Number(p.savedAt) || 0) + 1) };
        }
        saved[name] = out;
        delete m.deleted[name];
    });
    Object.keys(prev).forEach(name => { if (!(name in next)) m.deleted[name] = now; });
    const before = SVS_LIB.slFolderList(prev, prevFolders), after = SVS_LIB.slFolderList(saved, nextFolders);
    const nb = new Set(before.map(SVS_LIB.slNormalize)), na = new Set(after.map(SVS_LIB.slNormalize));
    after.forEach(f => { if (!nb.has(SVS_LIB.slNormalize(f))) m.folders[SVS_LIB.slNormalize(f)] = { name: f, at: now, deleted: false }; });
    before.forEach(f => { if (!na.has(SVS_LIB.slNormalize(f))) m.folders[SVS_LIB.slNormalize(f)] = { name: f, at: now, deleted: true }; });
    return { saved, meta: svsPrune(m, now) };
}

// Contenu du fichier partagé (format de la copie de sécurité, version 2).
function svsSnapshot(saved, folders, meta, nowIso) {
    const doc = SVS_LIB.slBuildBackup(saved, folders, nowIso || null);
    const m = svsCleanMeta(meta);
    doc.version = SVS_VERSION;
    doc.deleted = m.deleted;
    doc.folderMeta = m.folders;
    return doc;
}

// Lecture d'un fichier partagé (version 1 ou 2) : grilles mises au propre, suppressions, dossiers.
function svsReadDoc(doc, clean) {
    const grids = {};
    let invalid = 0;
    (Array.isArray(doc && doc.grids) ? doc.grids : []).forEach(item => {
        if (!item || typeof item !== 'object' || typeof item.name !== 'string') { invalid++; return; }
        const name = item.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
        const grid = clean.grid(item.grid);
        if (!name || !grid) { invalid++; return; }
        const e = { grid, settings: (item.settings && typeof item.settings === 'object') ? clean.settings(item.settings) : null };
        const f = SVS_LIB.slCleanFolderName(item.folder);
        if (f) e.folder = f;
        const t = Number(item.savedAt);
        if (Number.isFinite(t) && t > 0) e.savedAt = t;
        grids[name] = e;
    });
    const meta = svsCleanMeta({ deleted: doc && doc.deleted, folders: doc && doc.folderMeta });
    const folders = (Array.isArray(doc && doc.folders) ? doc.folders : []).map(SVS_LIB.slCleanFolderName).filter(Boolean);
    return { grids, meta, folders, invalid };
}

// Empreinte d'un état complet, pour savoir si le fichier partagé doit être réécrit.
function svsDigest(saved, folders, meta, clean) {
    const m = svsCleanMeta(meta);
    const g = Object.keys(saved).sort().map(n => [n, svsSig(saved[n], clean), Number(svsEntry(saved[n]).savedAt) || 0]);
    const fm = Object.keys(m.folders).sort().map(k => [k, m.folders[k].at, m.folders[k].deleted]);
    const d = Object.keys(m.deleted).sort().map(k => [k, m.deleted[k]]);
    return JSON.stringify({ g, f: SVS_LIB.slFolderList(saved, folders).map(SVS_LIB.slNormalize), fm, d });
}

// Fusion de l'état de cet appareil (local = { saved, folders, meta }) avec le fichier partagé (doc).
// sanitizeGrid / sanitizeSettings : fonctions de grid-format.js. Renvoie :
// { saved, folders, meta, localChanged, remoteChanged, received: [noms], removed: [noms], conflicts: [noms], invalid }
function svsMerge(local, doc, sanitizeGrid, sanitizeSettings, now) {
    const clean = { grid: sanitizeGrid, settings: sanitizeSettings };
    const L = local || {};
    const lSaved = L.saved || {}, lMeta = svsCleanMeta(L.meta), lFolders = Array.isArray(L.folders) ? L.folders : [];
    const R = svsReadDoc(doc, clean);
    const saved = {}, deleted = {};
    const received = [], removed = [], conflicts = [];
    const names = new Set([...Object.keys(lSaved), ...Object.keys(R.grids), ...Object.keys(lMeta.deleted), ...Object.keys(R.meta.deleted)]);
    const time = (e) => (e && Number.isFinite(e.savedAt)) ? e.savedAt : 0;
    const extra = []; // copies « (conflit) » ajoutées après coup
    [...names].sort().forEach(name => {
        const le = svsEntry(lSaved[name]), re = R.grids[name] || null;
        const del = Math.max(lMeta.deleted[name] || 0, R.meta.deleted[name] || 0);
        let win = null, fromRemote = false;
        if (le && re) {
            const ls = svsSig(le, clean), rs = svsSig(re, clean);
            if (ls === rs) {
                const t = Math.max(time(le), time(re));
                win = t ? { ...le, savedAt: t } : le;
            } else if (time(le) !== time(re)) {
                fromRemote = time(re) > time(le);
                win = fromRemote ? re : le;
            } else {
                // même date (ou pas de date) et contenus différents : on garde les deux, choix identique sur tous les appareils
                fromRemote = rs > ls;
                win = fromRemote ? re : le;
                extra.push({ base: name, entry: fromRemote ? le : re });
                conflicts.push(name);
            }
        } else if (le) win = le;
        else if (re) { win = re; fromRemote = true; }
        if (win && del > time(win)) {
            deleted[name] = del;
            if (le) removed.push(name);
            return;
        }
        if (win) {
            saved[name] = win;
            if (fromRemote && (!le || svsSig(le, clean) !== svsSig(win, clean))) received.push(name);
        } else if (del) deleted[name] = del;
    });
    extra.forEach(({ base, entry }) => {
        const sig = svsSig(entry, clean);
        const already = Object.keys(saved).some(k => k.startsWith(base + ' (conflit') && svsSig(saved[k], clean) === sig);
        if (!already) saved[SVS_LIB.slUniqueName(base + ' (conflit)', saved)] = entry;
    });
    // Dossiers : la décision la plus récente (création ou suppression) l'emporte ; un dossier qui contient encore une grille reste.
    const fmeta = { ...lMeta.folders };
    Object.keys(R.meta.folders).forEach(k => { if (!fmeta[k] || R.meta.folders[k].at > fmeta[k].at) fmeta[k] = R.meta.folders[k]; });
    const folders = SVS_LIB.slFolderList({}, [...lFolders, ...R.folders])
        .filter(f => { const r = fmeta[SVS_LIB.slNormalize(f)]; return !(r && r.deleted); });
    Object.keys(fmeta).forEach(k => { const r = fmeta[k]; if (!r.deleted && !folders.some(f => SVS_LIB.slNormalize(f) === k)) folders.push(r.name); });
    const meta = svsPrune({ deleted, folders: fmeta }, now);
    const finalFolders = SVS_LIB.slFolderList(saved, folders);
    const before = JSON.stringify({ s: lSaved, f: SVS_LIB.slFolderList(lSaved, lFolders), m: lMeta });
    const after = JSON.stringify({ s: saved, f: finalFolders, m: meta });
    const remoteChanged = svsDigest(saved, finalFolders, meta, clean) !== svsDigest(R.grids, SVS_LIB.slFolderList(R.grids, R.folders), R.meta, clean);
    return { saved, folders: finalFolders, meta, localChanged: before !== after, remoteChanged, received, removed, conflicts, invalid: R.invalid };
}

// Phrase de compte rendu d'une synchronisation.
function svsSummary(r) {
    if (!r) return '';
    const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;
    const parts = [];
    if (r.received && r.received.length) parts.push(pl(r.received.length, 'grille reçue', 'grilles reçues'));
    if (r.removed && r.removed.length) parts.push(pl(r.removed.length, 'grille supprimée', 'grilles supprimées') + ' (supprimées ailleurs)');
    if (r.conflicts && r.conflicts.length) parts.push(pl(r.conflicts.length, 'conflit gardé en double', 'conflits gardés en double') + ' (« … (conflit) »)');
    return parts.length ? parts.join(', ') : 'rien de nouveau';
}

// --- Texte ⇄ base64 (UTF-8), pour l'API GitHub ---
function svsB64Encode(str) {
    const bytes = new TextEncoder().encode(String(str));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}
function svsB64Decode(b64) {
    const bin = atob(String(b64 || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

// --- Réglages GitHub ---
// Dépôt : « utilisateur/dépôt » ou son adresse https://github.com/utilisateur/dépôt
function ghsParseRepo(s) {
    const t = String(s || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(t);
    return m ? { owner: m[1], repo: m[2] } : null;
}

function ghsCleanPath(p) {
    const t = String(p || '').trim().replace(/^\/+/, '').replace(/\\/g, '/');
    if (!t) return GHS_DEFAULT_PATH;
    if (t.split('/').some(seg => !seg || seg === '.' || seg === '..')) return null;
    return /\.json$/i.test(t) ? t : t + '.json';
}

// Réglages complets et valides, ou null.
function ghsCleanConfig(c) {
    if (!c || typeof c !== 'object') return null;
    const r = ghsParseRepo(c.repo);
    const path = ghsCleanPath(c.path);
    const token = String(c.token || '').trim();
    if (!r || !path || !/^[A-Za-z0-9_]{20,255}$/.test(token)) return null;
    return { repo: `${r.owner}/${r.repo}`, path, token };
}

// Code à coller sur un autre appareil (contient le jeton : à ne pas partager).
function svsConfigCode(cfg) {
    const c = ghsCleanConfig(cfg);
    return c ? SVS_CONFIG_PREFIX + svsB64Encode(JSON.stringify(c)) : '';
}
function svsParseConfigCode(text) {
    const t = String(text || '').trim();
    if (!t.startsWith(SVS_CONFIG_PREFIX)) return null;
    try { return ghsCleanConfig(JSON.parse(svsB64Decode(t.slice(SVS_CONFIG_PREFIX.length)))); } catch (e) { return null; }
}

function ghsContentsUrl(cfg) {
    const r = ghsParseRepo(cfg.repo);
    const path = cfg.path.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${path}`;
}

function ghsHeaders(cfg, accept) {
    return { 'Authorization': `Bearer ${cfg.token}`, 'Accept': accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

// Erreur typée : kind = 'auth' (jeton refusé), 'repo' (dépôt introuvable ou inaccessible), 'format' (le fichier n'est pas
// un fichier de synchronisation de Chord Scales), 'conflict' (fichier changé entre-temps), 'network' (pas de réseau), 'http'.
function ghsError(kind, message) { const e = new Error(message); e.kind = kind; return e; }

function ghsErrorText(e) {
    const k = e && e.kind;
    if (k === 'auth') return 'jeton refusé ou expiré';
    if (k === 'repo') return 'dépôt introuvable, ou le jeton n\'y a pas accès';
    if (k === 'format') return 'le fichier du dépôt n\'est pas un fichier de synchronisation de Chord Scales';
    if (k === 'network') return 'pas de connexion';
    if (k === 'conflict') return 'fichier modifié en même temps ailleurs';
    return (e && e.message) || 'erreur inconnue';
}

async function ghsFetch(fetchFn, url, opts) {
    try { return await fetchFn(url, opts); }
    catch (e) { throw ghsError('network', 'pas de connexion'); }
}

function ghsStatusError(res, what) {
    if (res.status === 401) return ghsError('auth', 'jeton refusé');
    if (res.status === 403) return ghsError('auth', 'accès refusé (droits du jeton ou limite de requêtes)');
    if (res.status === 404) return ghsError('repo', 'introuvable');
    if (res.status === 409 || res.status === 422) return ghsError('conflict', 'conflit');
    return ghsError('http', `${what} : erreur ${res.status}`);
}

// Lit le fichier du dépôt : { doc, sha } ; { doc: null, sha: null } s'il n'existe pas encore.
async function ghsRead(cfg, fetchFn) {
    const url = ghsContentsUrl(cfg);
    const res = await ghsFetch(fetchFn, url, { headers: ghsHeaders(cfg), cache: 'no-store' });
    if (res.status === 404) {
        // fichier absent… ou dépôt inaccessible : on vérifie le dépôt
        const r = ghsParseRepo(cfg.repo);
        const rr = await ghsFetch(fetchFn, `https://api.github.com/repos/${r.owner}/${r.repo}`, { headers: ghsHeaders(cfg), cache: 'no-store' });
        if (rr.ok) return { doc: null, sha: null };
        throw ghsStatusError(rr, 'dépôt');
    }
    if (!res.ok) throw ghsStatusError(res, 'lecture');
    const meta = await res.json();
    if (!meta || meta.type !== 'file' || typeof meta.sha !== 'string') throw ghsError('format', 'pas un fichier');
    let text;
    if (meta.encoding === 'base64' && typeof meta.content === 'string' && meta.content) text = svsB64Decode(meta.content);
    else {
        // fichier de plus d'1 Mo : contenu brut à part
        const raw = await ghsFetch(fetchFn, url, { headers: ghsHeaders(cfg, 'application/vnd.github.raw+json'), cache: 'no-store' });
        if (!raw.ok) throw ghsStatusError(raw, 'lecture');
        text = await raw.text();
    }
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw ghsError('format', 'JSON illisible'); }
    if (!SVS_LIB.slIsBackup(doc)) throw ghsError('format', 'format inconnu');
    return { doc, sha: meta.sha };
}

// Écrit le fichier (sha = version lue, null pour le créer). Renvoie le nouveau sha.
async function ghsWrite(cfg, doc, sha, fetchFn, message) {
    const body = { message: message || 'Chord Scales : synchronisation des sauvegardes', content: svsB64Encode(JSON.stringify(doc, null, 1)) };
    if (sha) body.sha = sha;
    const res = await ghsFetch(fetchFn, ghsContentsUrl(cfg), {
        method: 'PUT', headers: { ...ghsHeaders(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store'
    });
    if (!res.ok) throw ghsStatusError(res, 'écriture');
    const out = await res.json();
    return out && out.content && out.content.sha;
}

// Une synchronisation complète avec GitHub : lire, fusionner, réécrire si besoin (en recommençant si le fichier a changé
// entre la lecture et l'écriture). deps = { sanitizeGrid, sanitizeSettings, now, message }.
// Renvoie le résultat de svsMerge, plus wrote (fichier réécrit) et created (fichier créé).
async function ghsSyncCycle(cfg, local, fetchFn, deps) {
    let state = local;
    const acc = { received: new Set(), removed: new Set(), conflicts: new Set() };
    const finish = (m, wrote, created) => {
        ['received', 'removed', 'conflicts'].forEach(k => (m[k] || []).forEach(n => acc[k].add(n)));
        const before = JSON.stringify({ s: local.saved || {}, f: SVS_LIB.slFolderList(local.saved || {}, local.folders), m: svsCleanMeta(local.meta) });
        const after = JSON.stringify({ s: m.saved, f: m.folders, m: m.meta });
        return { ...m, received: [...acc.received].filter(n => n in m.saved), removed: [...acc.removed].filter(n => !(n in m.saved)),
            conflicts: [...acc.conflicts], localChanged: before !== after, wrote, created };
    };
    for (let attempt = 0; attempt < 3; attempt++) {
        const { doc, sha } = await ghsRead(cfg, fetchFn);
        const nowIso = new Date(deps.now).toISOString();
        let m;
        if (doc) m = svsMerge(state, doc, deps.sanitizeGrid, deps.sanitizeSettings, deps.now);
        else {
            m = { saved: state.saved || {}, folders: SVS_LIB.slFolderList(state.saved || {}, state.folders), meta: svsCleanMeta(state.meta),
                remoteChanged: true, received: [], removed: [], conflicts: [], invalid: 0 };
        }
        if (!m.remoteChanged) return finish(m, false, false);
        try {
            await ghsWrite(cfg, svsSnapshot(m.saved, m.folders, m.meta, nowIso), sha, fetchFn, deps.message);
            return finish(m, true, !doc);
        } catch (e) {
            if (e.kind !== 'conflict' || attempt === 2) throw e;
            // le fichier a changé entre la lecture et l'écriture : on garde ce qu'on a fusionné et on recommence avec sa nouvelle version
            ['received', 'removed', 'conflicts'].forEach(k => (m[k] || []).forEach(n => acc[k].add(n)));
            state = { saved: m.saved, folders: m.folders, meta: m.meta };
        }
    }
    throw ghsError('conflict', 'conflit');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SVS_VERSION, SVS_DEFAULT_FILE, GHS_DEFAULT_PATH, svsCleanMeta, svsTrack, svsSnapshot, svsReadDoc, svsDigest, svsMerge, svsSummary,
        svsB64Encode, svsB64Decode, ghsParseRepo, ghsCleanPath, ghsCleanConfig, svsConfigCode, svsParseConfigCode, ghsContentsUrl, ghsErrorText,
        ghsRead, ghsWrite, ghsSyncCycle };
}
