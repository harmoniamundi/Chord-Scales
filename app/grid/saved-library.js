// grid/saved-library.js — bibliothèque des grilles sauvegardées dans le navigateur (localStorage « jamSavedGrids ») :
// dossiers, recherche filtrante et copie de sécurité de toutes les sauvegardes en un seul fichier .json.
// Fonctions pures, sans DOM ni localStorage : le moteur d'index.html lit le stockage, appelle ces fonctions et écrit le résultat.
// Chargé par index.html via <script src="app/grid/saved-library.js"> et testé par grid/saved-library.test.js.
//
// Modèle :
//  - sauvegardes : { nom: { grid, settings, folder?, savedAt? } } (format inchangé ; « folder » absent = « Sans dossier ») ;
//  - dossiers : liste de noms (localStorage « jamSavedGridFolders »), pour garder les dossiers vides et leur existence.
//    Un dossier cité par une sauvegarde existe même s'il manque à la liste. Un seul niveau de dossiers.

const SL_FOLDER_MAX = 40;
const SL_BACKUP_FORMAT = 'chord-scales-saved-grids';

// Nom de dossier au propre ('' si rien ne reste) : sans caractère de contrôle, espaces resserrés, 40 caractères au plus.
function slCleanFolderName(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SL_FOLDER_MAX).trim();
}

// Comparaison « à la française » : sans tenir compte de la casse ni des accents, nombres dans l'ordre naturel (Grille 2 < Grille 10).
function slCompare(a, b) {
    return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base', numeric: true });
}

// Texte de recherche : minuscules, sans accents ni ligatures, espaces resserrés.
function slNormalize(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/Œ/g, 'oe').replace(/Æ/g, 'ae')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Mots de la recherche (tous doivent se retrouver).
function slTerms(query) {
    const q = slNormalize(query);
    return q ? q.split(' ') : [];
}

// Dossier d'une sauvegarde ('' = sans dossier).
function slFolderOf(entry) {
    return (entry && !Array.isArray(entry) && typeof entry === 'object') ? slCleanFolderName(entry.folder) : '';
}

// Liste triée des dossiers : ceux enregistrés + ceux cités par une sauvegarde.
function slFolderList(saved, folders) {
    const set = new Map();
    const add = (f) => { const n = slCleanFolderName(f); if (n && !set.has(slNormalize(n))) set.set(slNormalize(n), n); };
    (Array.isArray(folders) ? folders : []).forEach(add);
    Object.keys(saved || {}).forEach(k => add(slFolderOf(saved[k])));
    return [...set.values()].sort(slCompare);
}

// Retrouve un dossier existant quelle que soit la casse / les accents (« jazz » → « Jazz ») ; sinon le nom propre donné.
function slResolveFolder(name, list) {
    const n = slCleanFolderName(name);
    if (!n) return '';
    const hit = (list || []).find(f => slNormalize(f) === slNormalize(n));
    return hit || n;
}

// Une grille correspond si chaque mot se retrouve dans son nom ou dans le nom de son dossier.
function slMatches(terms, name, folder) {
    if (!terms || terms.length === 0) return true;
    const hay = slNormalize(name) + ' \u0001 ' + slNormalize(folder);
    return terms.every(t => hay.includes(t));
}

// Vue de la liste : grilles sans dossier, puis dossiers (triés), chacun avec ses grilles (triées) filtrées par la recherche.
// En recherche, un dossier sans résultat disparaît et les autres s'ouvrent ; sinon un dossier replié garde son nombre de grilles.
function slBuildView(saved, folders, query, collapsed) {
    const terms = slTerms(query);
    const searching = terms.length > 0;
    const closed = new Set((Array.isArray(collapsed) ? collapsed : []).map(slNormalize));
    const list = slFolderList(saved, folders);
    const byFolder = new Map(list.map(f => [slNormalize(f), []]));
    const loose = [];
    let total = 0, shown = 0;
    Object.keys(saved || {}).sort(slCompare).forEach(name => {
        total++;
        const folder = slFolderOf(saved[name]);
        if (!slMatches(terms, name, folder)) return;
        shown++;
        if (folder) byFolder.get(slNormalize(folder)).push(name);
        else loose.push(name);
    });
    const outFolders = [];
    list.forEach(f => {
        const grids = byFolder.get(slNormalize(f));
        const folderHit = searching && terms.every(t => slNormalize(f).includes(t));
        if (searching && grids.length === 0 && !folderHit) return;
        const count = Object.keys(saved || {}).filter(k => slNormalize(slFolderOf(saved[k])) === slNormalize(f)).length;
        outFolders.push({ name: f, grids, count, open: searching || !closed.has(slNormalize(f)) });
    });
    return { loose, folders: outFolders, total, shown, searching };
}

// Échappement HTML.
function slEscape(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Texte échappé avec les mots trouvés surlignés (<mark>), sans tenir compte des accents ni de la casse.
function slHighlight(text, query) {
    const src = String(text == null ? '' : text);
    const terms = slTerms(query);
    if (!terms.length) return slEscape(src);
    // Texte normalisé caractère par caractère, avec la position d'origine de chaque caractère normalisé.
    let norm = '';
    const map = [];
    for (let i = 0; i < src.length; i++) {
        const n = slNormalize(src[i]) || (/\s/.test(src[i]) ? ' ' : '');
        for (let j = 0; j < n.length; j++) { norm += n[j]; map.push(i); }
    }
    const marks = new Array(src.length).fill(false);
    terms.forEach(t => {
        let p = norm.indexOf(t);
        while (p >= 0) {
            for (let k = p; k < p + t.length; k++) marks[map[k]] = true;
            p = norm.indexOf(t, p + t.length);
        }
    });
    let out = '', open = false;
    for (let i = 0; i < src.length; i++) {
        if (marks[i] && !open) { out += '<mark>'; open = true; }
        if (!marks[i] && open) { out += '</mark>'; open = false; }
        out += slEscape(src[i]);
    }
    if (open) out += '</mark>';
    return out;
}

// Copie d'une sauvegarde rangée dans un dossier ('' = sortie de tout dossier).
function slWithFolder(entry, folder) {
    const e = (entry && !Array.isArray(entry) && typeof entry === 'object') ? { ...entry } : { grid: Array.isArray(entry) ? entry : [], settings: null };
    const f = slCleanFolderName(folder);
    if (f) e.folder = f; else delete e.folder;
    return e;
}

// Nouvelle sauvegarde (grille + réglages) qui garde le dossier de l'ancienne version du même nom.
function slMakeEntry(previous, grid, settings, now) {
    const e = { grid, settings };
    const f = slFolderOf(previous);
    if (f) e.folder = f;
    if (Number.isFinite(now)) e.savedAt = now;
    return e;
}

// Renomme un dossier (fusionne avec un dossier existant du même nom). Renvoie { saved, folders } (copies).
function slRenameFolder(saved, folders, oldName, newName) {
    const from = slNormalize(oldName);
    const list = slFolderList(saved, folders);
    const to = slResolveFolder(newName, list.filter(f => slNormalize(f) !== from));
    const out = {};
    Object.keys(saved || {}).forEach(k => {
        out[k] = slNormalize(slFolderOf(saved[k])) === from ? slWithFolder(saved[k], to) : saved[k];
    });
    const fl = list.filter(f => slNormalize(f) !== from);
    if (to && !fl.some(f => slNormalize(f) === slNormalize(to))) fl.push(to);
    return { saved: out, folders: fl.sort(slCompare) };
}

// Supprime un dossier : ses grilles reviennent dans « Sans dossier » (aucune grille n'est supprimée).
function slDeleteFolder(saved, folders, name) {
    const key = slNormalize(name);
    const out = {};
    Object.keys(saved || {}).forEach(k => {
        out[k] = slNormalize(slFolderOf(saved[k])) === key ? slWithFolder(saved[k], '') : saved[k];
    });
    return { saved: out, folders: slFolderList(saved, folders).filter(f => slNormalize(f) !== key) };
}

// Nom libre : « Nom », sinon « Nom (2) », « Nom (3) »…
function slUniqueName(name, saved) {
    const base = String(name || '').trim() || 'Grille';
    if (!saved || !(base in saved)) return base;
    let n = 2;
    while (`${base} (${n})` in saved) n++;
    return `${base} (${n})`;
}

// --- Copie de sécurité : toutes les sauvegardes (et leurs dossiers) dans un seul fichier ---

function slBuildBackup(saved, folders, nowIso) {
    const grids = Object.keys(saved || {}).sort(slCompare).map(name => {
        const e = saved[name];
        const g = Array.isArray(e) ? { grid: e, settings: null } : e;
        const item = { name, grid: g.grid, settings: g.settings || null };
        const f = slFolderOf(e);
        if (f) item.folder = f;
        if (g && Number.isFinite(g.savedAt)) item.savedAt = g.savedAt;
        return item;
    });
    return { format: SL_BACKUP_FORMAT, version: 1, exportedAt: nowIso || null, folders: slFolderList(saved, folders), grids };
}

function slIsBackup(data) {
    return !!(data && typeof data === 'object' && !Array.isArray(data) && data.format === SL_BACKUP_FORMAT && Array.isArray(data.grids));
}

// Nom du fichier : chord-scales-sauvegardes-AAAA-MM-JJ.json
function slBackupFileName(date) {
    const d = date instanceof Date ? date : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `chord-scales-sauvegardes-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// Ajoute le contenu d'une copie de sécurité aux sauvegardes existantes, sans jamais rien écraser :
//  - même nom et même contenu (grille + réglages) : déjà présente, ignorée (on peut réimporter le même fichier sans doublons) ;
//  - même nom, contenu différent : ajoutée sous « Nom (2) » ;
//  - grille illisible : écartée.
// sanitizeGrid / sanitizeSettings : les fonctions de grid-format.js (passées en paramètres pour rester pur).
// Renvoie { saved, folders, added, renamed, skipped, invalid } (copies ; l'original n'est pas modifié).
function slMergeBackup(saved, folders, data, sanitizeGrid, sanitizeSettings) {
    const out = { ...(saved || {}) };
    const res = { added: 0, renamed: 0, skipped: 0, invalid: 0 };
    let fl = slFolderList(out, folders);
    if (!slIsBackup(data)) return { saved: out, folders: fl, ...res, invalid: 1 };
    (Array.isArray(data.folders) ? data.folders : []).forEach(f => {
        const n = slCleanFolderName(f);
        if (n && !fl.some(x => slNormalize(x) === slNormalize(n))) fl.push(n);
    });
    const sig = (e) => { try { return JSON.stringify({ g: e.grid, s: e.settings || null }); } catch (er) { return ''; } };
    data.grids.forEach(item => {
        if (!item || typeof item !== 'object') { res.invalid++; return; }
        const grid = sanitizeGrid(item.grid);
        if (!grid) { res.invalid++; return; }
        const settings = item.settings && typeof item.settings === 'object' ? sanitizeSettings(item.settings) : null;
        let name = typeof item.name === 'string' ? item.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '';
        if (!name) name = 'Grille importée';
        const entry = { grid, settings };
        const folder = slResolveFolder(item.folder, fl);
        if (folder) { entry.folder = folder; if (!fl.some(x => slNormalize(x) === slNormalize(folder))) fl.push(folder); }
        if (Number.isFinite(item.savedAt)) entry.savedAt = item.savedAt;
        if (name in out) {
            const cur = out[name];
            const curE = Array.isArray(cur) ? { grid: cur, settings: null } : (cur || {});
            // comparaison après la même mise au propre des deux côtés (ordre des champs, valeurs par défaut)
            const curClean = { grid: sanitizeGrid(curE.grid), settings: curE.settings && typeof curE.settings === 'object' ? sanitizeSettings(curE.settings) : null };
            if (sig(curClean) === sig(entry)) {
                // déjà présente : on lui rend son dossier si elle n'en avait pas
                if (folder && !slFolderOf(cur)) out[name] = slWithFolder(cur, folder);
                res.skipped++;
                return;
            }
            name = slUniqueName(name, out);
            res.renamed++;
        } else {
            res.added++;
        }
        out[name] = entry;
    });
    fl = fl.sort(slCompare);
    return { saved: out, folders: fl, ...res };
}

// Phrase de compte rendu après l'import d'une copie de sécurité.
function slMergeSummary(r) {
    const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;
    const parts = [];
    parts.push(pl(r.added + r.renamed, 'grille ajoutée', 'grilles ajoutées'));
    if (r.renamed) parts.push(`dont ${pl(r.renamed, 'renommée', 'renommées')} (un autre contenu existait déjà sous ce nom)`);
    if (r.skipped) parts.push(pl(r.skipped, 'déjà présente', 'déjà présentes'));
    if (r.invalid) parts.push(pl(r.invalid, 'illisible écartée', 'illisibles écartées'));
    return parts.join(', ') + '.';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SL_FOLDER_MAX, SL_BACKUP_FORMAT, slCleanFolderName, slCompare, slNormalize, slTerms, slFolderOf, slFolderList, slResolveFolder,
        slMatches, slBuildView, slEscape, slHighlight, slWithFolder, slMakeEntry, slRenameFolder, slDeleteFolder, slUniqueName,
        slBuildBackup, slIsBackup, slBackupFileName, slMergeBackup, slMergeSummary };
}
