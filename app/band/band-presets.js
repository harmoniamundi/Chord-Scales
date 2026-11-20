// band/band-presets.js — orchestres personnalisés (« Mes orchestres » du pop-up Orchestre), sans DOM.
// Un orchestre personnalisé garde le SON seulement : formation, rythme imposé, instruments des pupitres, volumes, réverbération,
// swing et densité de la formation. Ni tempo, ni mesure, ni tonalité : il s'applique à n'importe quelle grille. Choisir ensuite
// un style de grille le remplace par l'orchestre du style (comme avant).
// La liste est gardée dans le navigateur (localStorage, clé BP_STORAGE_KEY) et peut s'exporter / s'importer dans un fichier.
// Chargé par index.html via <script src="app/band/band-presets.js"> (après band-catalog.js) et testé par band/band-presets.test.js.

if (typeof bandFormation === 'undefined' && typeof require === 'function') {
    var { bandFormation, bandEffectiveGroove, bandSanitizeInstruments } = require('./band-catalog.js');
}

const BP_STORAGE_KEY = 'jamBandPresets';
const BP_FILE_TYPE = 'chord-scales-orchestres';
const BP_MAX = 50;          // orchestres gardés au plus
const BP_NAME_MAX = 40;     // caractères d'un nom
const BP_VOLUME_KEYS = ['piano', 'bass', 'drums', 'bandoneon', 'violin', 'guitar', 'rguitar', 'organ', 'strings'];

const bpOwn = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
const bpNum = (v, lo, hi) => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined;
};

// Nom d'orchestre propre : espaces resserrés, caractères de contrôle retirés, BP_NAME_MAX caractères au plus ; '' si vide.
function bandPresetName(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BP_NAME_MAX).trim();
}

// Orchestre personnalisé tiré de l'état du moteur.
// state = { band, groove, instruments (choix de toutes les formations), volumes, reverb, swing (réglage ou null = Auto), density }
function bandPresetFrom(state) {
    const s = state || {};
    const band = bandFormation(s.band);
    const p = { band };
    const g = bandEffectiveGroove(band, s.groove);
    if (g) p.groove = g;
    const ins = bandSanitizeInstruments(s.instruments)[band];
    if (ins) p.instruments = ins;
    const vol = {};
    BP_VOLUME_KEYS.forEach(k => { const v = bpNum(s.volumes && s.volumes[k], 0, 1); if (v !== undefined) vol[k] = v; });
    if (Object.keys(vol).length) p.volumes = vol;
    const rev = bpNum(s.reverb, 0, 1);
    if (rev !== undefined) p.reverb = rev;
    const sw = bpNum(s.swing, 0.5, 0.75);
    if (sw !== undefined) p.swing = sw;
    const d = bpNum(s.density, 0, 1);
    if (d !== undefined) p.density = d;
    return p;
}

// Orchestre lu d'un fichier ou du navigateur : seulement des valeurs connues, bornées ; null si la formation est inconnue.
function bandPresetSanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.band !== 'string') return null;
    if (bandFormation(raw.band) !== raw.band) return null;
    return bandPresetFrom({ band: raw.band, groove: raw.groove, instruments: { [raw.band]: raw.instruments }, volumes: raw.volumes,
        reverb: raw.reverb, swing: raw.swing, density: raw.density });
}

// Liste { nom: orchestre } nettoyée : noms propres, orchestres valides, BP_MAX au plus (dans l'ordre reçu).
function bandPresetsSanitize(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(k => {
        if (Object.keys(out).length >= BP_MAX) return;
        const name = bandPresetName(k);
        const p = bandPresetSanitize(raw[k]);
        if (name && p && !bpOwn(out, name)) out[name] = p;
    });
    return out;
}

// Même son ? (comparaison des orchestres nettoyés)
function bandPresetSame(a, b) {
    const ca = bandPresetSanitize(a), cb = bandPresetSanitize(b);
    return !!ca && !!cb && JSON.stringify(ca) === JSON.stringify(cb);
}

// Ajoute à `list` les orchestres de `incoming` (sans modifier `list`). Même nom et même son : ignoré ; même nom et son
// différent : renommé « nom (2) », « nom (3) »… La liste reste plafonnée à BP_MAX. Renvoie { list, added: [noms ajoutés] }.
function bandPresetsMerge(list, incoming) {
    const out = Object.assign({}, bandPresetsSanitize(list));
    const added = [];
    const inc = bandPresetsSanitize(incoming);
    Object.keys(inc).forEach(name => {
        if (Object.keys(out).length >= BP_MAX) return;
        if (bpOwn(out, name) && bandPresetSame(out[name], inc[name])) return;
        let final = name, n = 2;
        while (bpOwn(out, final)) {
            const suffix = ` (${n++})`;
            final = name.slice(0, BP_NAME_MAX - suffix.length) + suffix;
        }
        out[final] = inc[name];
        added.push(final);
    });
    return { list: out, added };
}

// Contenu d'un fichier d'orchestres (export).
function bandPresetsFile(list) {
    return { type: BP_FILE_TYPE, version: 1, orchestres: bandPresetsSanitize(list) };
}

// Orchestres d'un fichier importé ; null si le fichier n'en contient pas.
function bandPresetsFromFile(data) {
    if (!data || typeof data !== 'object' || data.type !== BP_FILE_TYPE) return null;
    const list = bandPresetsSanitize(data.orchestres);
    return Object.keys(list).length ? list : null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BP_STORAGE_KEY, BP_FILE_TYPE, BP_MAX, BP_NAME_MAX, BP_VOLUME_KEYS, bandPresetName, bandPresetFrom, bandPresetSanitize,
        bandPresetsSanitize, bandPresetSame, bandPresetsMerge, bandPresetsFile, bandPresetsFromFile };
}
