// grid/grid-format.js — format des grilles sauvegardées et importées (.json) : lecture sécurisée d'un fichier venant
// de l'extérieur. Fonctions pures, sans DOM : tout ce qui n'est pas valide est écarté ou ramené à une valeur sûre.
// Chargé par index.html via <script src="grid/grid-format.js"> (après theory.js) et testé par grid/grid-format.test.js.

// Sous Node, la théorie se charge ; en navigateur ce sont des globaux (theory.js).
const GF_THEORY = (typeof scalesDb !== 'undefined')
    ? { scalesDb, lookupChord, isValidSpell }
    : require('../theory.js');

// Repères de partie proposés par le menu « Partie » ; les lettres A–Z restent acceptées (anciennes grilles, parties auto)
const PART_LABELS = ['in', 'A', 'B', 'C', 'D', 'E', 'F', 'G', "A'", "B'", "C'", "D'", "E'", "F'", "G'", 'out'];
const isPartLabel = (v) => typeof v === 'string' && (PART_LABELS.includes(v) || /^[A-Z]$/.test(v));

// Rythmes imposés par un style (samba, tango…), valables dans un fichier importé.
const IMPORT_GROOVES = ['samba', 'tango', 'piazzolla', 'lyrique', 'afro', 'b-chorale'];

// Lit une signature (nombre 2, 3, 4 des anciennes versions, ou texte « 6/8 »).
function parseMeter(val) {
    const k = String(val === undefined || val === null ? '' : val).trim();
    const key = ({ '2': '2/4', '3': '3/4', '4': '4/4' })[k] || k;
    const table = { '2/4': [2, false], '3/4': [3, false], '4/4': [4, false], '6/8': [2, true], '9/8': [3, true], '12/8': [4, true] };
    const t = table[key] || table['4/4'];
    return { key: table[key] ? key : '4/4', bpb: t[0], ternary: t[1] };
}

// Une entrée sauvegardée est { grid, settings } ; les anciennes sauvegardes
// (simple tableau d'accords) restent lisibles, sans paramètres.
function unpackSavedEntry(entry) {
    if (Array.isArray(entry)) return { grid: entry, settings: null };
    if (entry && Array.isArray(entry.grid)) return { grid: entry.grid, settings: entry.settings || null };
    return null;
}

function sanitizeImportedGrid(raw) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) return null;
    const knownChord = (id) => !!GF_THEORY.lookupChord(id);
    const clean = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') return null;
        const rootIndex = Number(item.rootIndex);
        const measures = Number(item.measures);
        if (!Number.isInteger(rootIndex) || rootIndex < 0 || rootIndex > 11) return null;
        if (!Number.isInteger(measures) || measures < 1 || measures > 16) return null;
        if (typeof item.chordId !== 'string' || !knownChord(item.chordId)) return null;
        let scaleId = item.scaleId;
        if (typeof scaleId !== 'string' || !GF_THEORY.scalesDb[scaleId]) {
            scaleId = GF_THEORY.lookupChord(item.chordId).scales[0].id;
        }
        const step = { rootIndex, chordId: item.chordId, measures, scaleId };
        const modKeyOf = (v) => (v && typeof v === 'object' && Number.isInteger(v.root) && v.root >= 0 && v.root <= 11) ? { root: v.root, minor: v.minor === true } : null;
        const bassOf = (v) => { const b = Number(v); return (v !== null && v !== undefined && Number.isInteger(b) && b >= 0 && b <= 11) ? b : null; };
        if (bassOf(item.bassRootIndex) !== null) step.bassRootIndex = bassOf(item.bassRootIndex);
        if (measures === 1 && item.split && typeof item.split === 'object') {
            const sr = Number(item.split.rootIndex);
            if (!Number.isInteger(sr) || sr < 0 || sr > 11 || typeof item.split.chordId !== 'string' || !knownChord(item.split.chordId)) return null;
            let ss = item.split.scaleId;
            if (typeof ss !== 'string' || !GF_THEORY.scalesDb[ss]) ss = GF_THEORY.lookupChord(item.split.chordId).scales[0].id;
            step.split = { rootIndex: sr, chordId: item.split.chordId, scaleId: ss };
            if (bassOf(item.split.bassRootIndex) !== null) step.split.bassRootIndex = bassOf(item.split.bassRootIndex);
            if (typeof item.split.fnLabel === 'string' && item.split.fnLabel) step.split.fnLabel = item.split.fnLabel.slice(0, 24);
            const smk = modKeyOf(item.split.modKey);
            if (smk) step.split.modKey = smk;
        }
        ['section', 'phrase', 'harmonicFunction'].forEach(k => {
            if (typeof item[k] === 'string') step[k] = item[k].slice(0, 80);
        });
        if (typeof item.fnLabel === 'string' && item.fnLabel) step.fnLabel = item.fnLabel.slice(0, 24);
        const mk0 = modKeyOf(item.modKey);
        if (mk0) step.modKey = mk0;
        // Signes de reprise : début, fin (nombre de passages) et 1re / 2e fin
        if (item.repeatStart === true) step.repeatStart = true;
        if (isPartLabel(item.partStart)) step.partStart = item.partStart; // repère de partie (in, A–G, A'–G', out ; A–Z accepté pour les anciennes grilles)
        const re = Number(item.repeatEnd);
        if (Number.isInteger(re) && re >= 2 && re <= 4) step.repeatEnd = re;
        const vo = Number(item.volta);
        if (vo === 1 || vo === 2) step.volta = vo;
        clean.push(step);
    }
    return clean;
}

// Lit les paramètres de jam d'un fichier importé (tonalité, qualité, bpm, orchestration).
// Seuls les champs valides sont conservés ; les autres sont ignorés.
function sanitizeImportedSettings(data) {
    const out = {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
    const key = Number(data.key);
    if (Number.isInteger(key) && key >= 0 && key <= 11) out.key = key;
    const qualities = ['ionian', 'aeolian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
    if (typeof data.quality === 'string' && qualities.includes(data.quality)) out.quality = data.quality;
    if (GF_THEORY.isValidSpell(data.spell)) out.spell = data.spell;
    const bpm = Number(data.bpm);
    if (Number.isFinite(bpm)) out.bpm = Math.max(50, Math.min(220, Math.round(bpm)));
    if (data.timeSignature !== undefined && data.timeSignature !== null) {
        const mt = parseMeter(data.timeSignature);
        const raw = String(data.timeSignature).trim();
        // valeur reconnue seulement (sinon : ignorée, donc 4/4)
        if (mt.key === raw || ({ '2': '2/4', '3': '3/4', '4': '4/4' })[raw] === mt.key) out.timeSignature = mt.key;
    }
    const o = data.orchestration;
    if (o && typeof o === 'object') {
        const orch = {};
        if (['swing', 'pop', 'latin', 'cuba', 'classic', 'brass', 'balkan', 'piazzolla'].includes(o.style)) orch.style = o.style;
        // anciens fichiers : le mode « Arpèges » est devenu le style « Classique »
        if (o.mode === 'arpeges') orch.style = 'classic';
        if (IMPORT_GROOVES.includes(o.groove)) orch.groove = o.groove; // rythme imposé par le style
        // anciens fichiers : Brasil + rythme « afro » désignait en fait le son Cuba
        if (orch.style === 'latin' && orch.groove === 'afro') orch.style = 'cuba';
        if (o.volumes && typeof o.volumes === 'object') {
            orch.volumes = {};
            ['piano', 'bass', 'drums', 'bandoneon', 'violin', 'guitar'].forEach(k => {
                const v = Number(o.volumes[k]);
                if (o.volumes[k] !== null && o.volumes[k] !== undefined && Number.isFinite(v)) orch.volumes[k] = Math.max(0, Math.min(1, v));
            });
        }
        const rev = Number(o.reverb);
        if (o.reverb !== null && o.reverb !== undefined && Number.isFinite(rev)) orch.reverb = Math.max(0, Math.min(1, rev));
        out.orchestration = orch;
    }
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PART_LABELS, isPartLabel, IMPORT_GROOVES, parseMeter, unpackSavedEntry, sanitizeImportedGrid, sanitizeImportedSettings };
}
