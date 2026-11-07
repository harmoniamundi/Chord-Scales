// ui/staff-notes.js — portées éditables des annotations (motifs, riffs, licks…), sans DOM ni VexFlow :
// format texte d'une portée (celui qui est enregistré dans l'annotation et dans les fichiers .json), lecture stricte
// d'un texte venu de l'extérieur, durées, découpage en mesures, hauteurs (altérations de l'armure, MIDI, nom de note)
// et plan de lecture. Le dessin et les clics sont dans ui/staff-editor.js ; le nettoyage des annotations (grid/grid-format.js)
// s'appuie sur parseStaff / formatStaff pour ne laisser passer que des portées valides.
// Chargé par index.html via <script src="ui/staff-notes.js"> (avant grid/grid-format.js) et testé par ui/staff-notes.test.js.
//
// Format : « clé,métrique,armure;événement événement… »  Exemple : « t,4/4,0;q:c4 8:e4 8:g4 qr h.:a4 »
//   clé : t (sol) ou b (fa) ; métrique : 4/4, 6/8… ; armure : nombre d'altérations, de -7 (bémols) à 7 (dièses)
//   événement : durée (w ronde, h blanche, q noire, 8 croche, 16 double-croche), « . » point, « t » triolet,
//               puis « :hauteur » (lettre c-b, altération # ## b bb, octave 1-7) ou « r » pour un silence.

const SN_UNITS = { w: 96, h: 48, q: 24, '8': 12, '16': 6 }; // durées en 96es de ronde (une noire = 24)
const SN_DURATIONS = ['w', 'h', 'q', '8', '16'];
const SN_METERS = ['2/4', '3/4', '4/4', '5/4', '6/4', '2/2', '3/8', '6/8', '7/8', '9/8', '12/8'];
const SN_MAX_EVENTS = 64;
const SN_MAX_LENGTH = 800;
const SN_LETTERS = 'cdefgab';
const SN_LETTER_SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SN_SHARP_ORDER = 'fcgdaeb';
const SN_FLAT_ORDER = 'beadgcf';
const SN_KEY_NAMES = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#', '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb' };
const SN_KEY_LABELS = { 0: 'Do', 1: 'Sol', 2: 'Ré', 3: 'La', 4: 'Mi', 5: 'Si', 6: 'Fa♯', 7: 'Do♯', '-1': 'Fa', '-2': 'Si♭', '-3': 'Mi♭', '-4': 'La♭', '-5': 'Ré♭', '-6': 'Sol♭', '-7': 'Do♭' };
const SN_FR_NAMES = { c: 'Do', d: 'Ré', e: 'Mi', f: 'Fa', g: 'Sol', a: 'La', b: 'Si' };
const SN_MIDI_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']; // noms acceptés par le piano de l'appli
// Hauteur de la ligne du bas de la portée, en degrés diatoniques (octave × 7 + lettre) : Mi4 en clé de sol, Sol2 en clé de fa.
const SN_BOTTOM_LINE = { t: 4 * 7 + 2, b: 2 * 7 + 4 };

const SN_EVENT_RE = /^(w|h|q|8|16)(\.)?(t)?(?::([a-g])(##|#|bb|b)?([1-7])|(r))$/;
const SN_ALTER = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };
const SN_ALTER_TEXT = { 0: '', 1: '#', 2: '##', '-1': 'b', '-2': 'bb' };

// Taille d'affichage de la portée, en % (100 = normale). Écrite dans le texte seulement si elle diffère de 100.
const SN_SIZE_MIN = 60, SN_SIZE_MAX = 200, SN_SIZE_STEP = 10, SN_SIZE_DEFAULT = 100;
function clampStaffSize(v) {
    const n = Math.round(Number(v) / SN_SIZE_STEP) * SN_SIZE_STEP;
    return Number.isFinite(n) ? Math.max(SN_SIZE_MIN, Math.min(SN_SIZE_MAX, n)) : SN_SIZE_DEFAULT;
}

function staffDefault() { return { clef: 't', meter: '4/4', ks: 0, size: SN_SIZE_DEFAULT, ev: [] }; }

// Lit un texte de portée ; renvoie la portée ({ clef, meter, ks, size, ev: [{ d, dot, tri, p: {l, o, a} | null }] }) ou null si le texte est invalide.
function parseStaff(text) {
    if (typeof text !== 'string' || text.length > SN_MAX_LENGTH) return null;
    const semi = text.indexOf(';');
    const head = (semi < 0 ? text : text.slice(0, semi)).split(',');
    if (head.length !== 3 && head.length !== 4) return null;
    const clef = head[0];
    if (clef !== 't' && clef !== 'b') return null;
    if (!SN_METERS.includes(head[1])) return null;
    if (!/^-?[0-7]$/.test(head[2])) return null;
    const ks = parseInt(head[2], 10);
    let size = SN_SIZE_DEFAULT;
    if (head.length === 4) {
        if (!/^\d{2,3}$/.test(head[3])) return null;
        size = parseInt(head[3], 10);
        if (size < SN_SIZE_MIN || size > SN_SIZE_MAX || size % SN_SIZE_STEP !== 0) return null;
    }
    const body = semi < 0 ? '' : text.slice(semi + 1).trim();
    const tokens = body === '' ? [] : body.split(/\s+/);
    if (tokens.length > SN_MAX_EVENTS) return null;
    const ev = [];
    for (const tk of tokens) {
        const m = SN_EVENT_RE.exec(tk);
        if (!m) return null;
        ev.push({ d: m[1], dot: !!m[2], tri: !!m[3], p: m[7] ? null : { l: m[4], o: parseInt(m[6], 10), a: SN_ALTER[m[5] || ''] } });
    }
    return { clef, meter: head[1], ks, size, ev };
}

// Texte canonique d'une portée (l'inverse de parseStaff pour tout texte valide).
function formatStaff(st) {
    const evs = st.ev.map(e => `${e.d}${e.dot ? '.' : ''}${e.tri ? 't' : ''}${e.p ? `:${e.p.l}${SN_ALTER_TEXT[e.p.a]}${e.p.o}` : 'r'}`);
    const size = st.size && st.size !== SN_SIZE_DEFAULT ? `,${clampStaffSize(st.size)}` : '';
    return `${st.clef},${st.meter},${st.ks}${size};${evs.join(' ')}`;
}

// Texte à enregistrer, ou null s'il n'est pas valide : renvoie la forme canonique.
function canonicalStaff(text) {
    const st = parseStaff(text);
    return st ? formatStaff(st) : null;
}

// ----- Décalage libre d'un bloc portée -----
// Un bloc garde sa place dans le texte mais peut être décalé au pixel près : « x,y » (pixels, par rapport à sa place dans le texte),
// écrit à part du texte de la portée (attribut data-pos). (0,0) = pas de décalage.

const SN_POS_MAX = 3000;

function clampStaffPos(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(-SN_POS_MAX, Math.min(SN_POS_MAX, n)) : 0;
}

// Lit un décalage « x,y » ; renvoie { x, y } ou null si le texte n'est pas valide.
function parseStaffPos(text) {
    const m = /^(-?\d{1,4}),(-?\d{1,4})$/.exec(typeof text === 'string' ? text.trim() : '');
    return m ? { x: clampStaffPos(m[1]), y: clampStaffPos(m[2]) } : null;
}

// Texte d'un décalage, ou '' quand il n'y en a pas (valeur absente ou (0,0)).
function formatStaffPos(pos) {
    if (!pos) return '';
    const x = clampStaffPos(pos.x), y = clampStaffPos(pos.y);
    return x === 0 && y === 0 ? '' : `${x},${y}`;
}

// ----- Copier-coller d'une portée (texte brut, pour passer d'une zone d'annotation à l'autre ou d'une fenêtre à l'autre) -----
// Une portée copiée s'écrit « [portée:t,4/4,0;q:c4 8:e4] » ; dans un texte collé, chaque repère de ce genre redevient une portée.

const SN_CLIP_RE = /\[portée:([^\]\n]{1,800})\]/g;

function staffClipText(st) { return `[portée:${formatStaff(st)}]`; }

// Découpe un texte collé en morceaux [{ text }] (texte ordinaire) et [{ staff }] (texte d'une portée valide, sous sa forme canonique).
// Un repère dont la portée est invalide reste du texte ordinaire.
function splitStaffClips(text) {
    const src = String(text === undefined || text === null ? '' : text);
    const out = [];
    let pos = 0, m;
    SN_CLIP_RE.lastIndex = 0;
    while ((m = SN_CLIP_RE.exec(src))) {
        const canon = canonicalStaff(m[1]);
        if (!canon) continue;
        if (m.index > pos) out.push({ text: src.slice(pos, m.index) });
        out.push({ staff: canon });
        pos = m.index + m[0].length;
    }
    if (pos < src.length) out.push({ text: src.slice(pos) });
    return out;
}

// ----- Durées -----

function eventUnits(e) {
    let u = SN_UNITS[e.d] * (e.dot ? 1.5 : 1);
    if (e.tri) u = u * 2 / 3;
    return Math.round(u);
}

function meterUnits(meter) {
    const [n, d] = meter.split('/').map(Number);
    return n * (96 / d);
}

// Groupement des croches sous une même barre : par temps (noire) en simple, par temps pointé (3 croches) en composé.
function meterBeamUnits(meter) {
    const [n, d] = meter.split('/').map(Number);
    return (d === 8 && n % 3 === 0 && n >= 6) ? 36 : (d === 8 ? 24 : (d === 2 ? 48 : 24));
}

// Valeurs écrivables (durée en 96es → durée et point), de la plus longue à la plus courte.
const SN_WRITABLE = [[96, 'w', false], [72, 'h', true], [48, 'h', false], [36, 'q', true], [24, 'q', false],
    [18, '8', true], [12, '8', false], [9, '16', true], [6, '16', false]];

// Décompose une durée en valeurs écrivables, de la plus longue à la plus courte (le reste inférieur à une double-croche est ignoré).
function decomposeUnits(units) {
    const out = [];
    let left = units;
    for (const [u, d, dot] of SN_WRITABLE) {
        while (left >= u) { out.push({ d, dot, units: u }); left -= u; }
    }
    return out;
}

// Découpe la portée en mesures. Une note qui dépasse la barre de mesure est coupée en morceaux liés (tieNext / tieFromPrev) ;
// un triolet (groupe de trois, jamais coupé) qui ne tient pas passe à la mesure suivante.
// Renvoie { total: durée d'une mesure, measures: [{ pieces: [{ ev, d, dot, tri, p, units, tieNext, tieFromPrev }], used }] } ;
// la dernière mesure est vide (sans pièce) si la précédente est pleine, pour qu'il reste toujours une place où écrire la suite.
function layoutStaff(st) {
    const total = meterUnits(st.meter);
    const measures = [{ pieces: [], used: 0 }];
    let cur = measures[0];
    const newMeasure = () => { cur = { pieces: [], used: 0 }; measures.push(cur); };
    let i = 0;
    while (i < st.ev.length) {
        const e = st.ev[i];
        if (e.tri) {
            // groupe de triolets : jusqu'à trois événements consécutifs, posés d'un bloc
            const group = [];
            while (i < st.ev.length && st.ev[i].tri && group.length < 3) group.push(i++);
            const need = group.reduce((s, k) => s + eventUnits(st.ev[k]), 0);
            if (cur.used > 0 && cur.used + need > total + 1) newMeasure();
            group.forEach((k, n) => {
                const ek = st.ev[k];
                const u = eventUnits(ek);
                cur.pieces.push({ ev: k, d: ek.d, dot: ek.dot, tri: true, p: ek.p, units: u, tieNext: false, tieFromPrev: false, tupletStart: n === 0, tupletSize: group.length });
                cur.used += u;
            });
            if (cur.used >= total - 1) newMeasure();
            continue;
        }
        let left = eventUnits(e);
        let first = true;
        while (left > 0) {
            if (cur.used >= total - 1) newMeasure();
            const room = total - cur.used;
            const take = Math.min(left, room);
            const pieces = decomposeUnits(take);
            if (pieces.length === 0) { left = 0; break; } // reste inférieur à une double-croche
            pieces.forEach((pc, n) => {
                const lastOfEvent = left - take <= 0 && n === pieces.length - 1;
                cur.pieces.push({ ev: i, d: pc.d, dot: pc.dot, tri: false, p: e.p, units: pc.units,
                    tieNext: !!e.p && !lastOfEvent, tieFromPrev: !!e.p && !(first && n === 0) });
                cur.used += pc.units;
            });
            left -= take;
            first = false;
        }
        i++;
    }
    if (cur.used >= total - 1 && cur.pieces.length) newMeasure();
    return { total, measures };
}

// ----- Hauteurs -----

function pitchDia(p) { return p.o * 7 + SN_LETTERS.indexOf(p.l); }

// Altération portée par l'armure pour une lettre (+1, -1 ou 0).
function keyAlter(ks, letter) {
    if (ks > 0) return SN_SHARP_ORDER.slice(0, ks).includes(letter) ? 1 : 0;
    if (ks < 0) return SN_FLAT_ORDER.slice(0, -ks).includes(letter) ? -1 : 0;
    return 0;
}

// Hauteur au degré diatonique `dia` (octave × 7 + lettre), avec l'altération de l'armure ; null hors de la plage 1-7.
function pitchFromDia(dia, ks) {
    const o = Math.floor(dia / 7);
    if (o < 1 || o > 7) return null;
    const l = SN_LETTERS[dia - o * 7];
    return { l, o, a: keyAlter(ks, l) };
}

function pitchMidi(p) { return (p.o + 1) * 12 + SN_LETTER_SEMITONE[p.l] + p.a; }

function midiToName(m) { return SN_MIDI_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

// Nom français affiché, par exemple « Fa♯4 ».
function pitchLabel(p) {
    return `${SN_FR_NAMES[p.l]}${({ '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' })[p.a]}${p.o}`;
}

// Degré diatonique d'une ligne d'écran : y est la hauteur cliquée, bottomY celle de la ligne du bas, spacing l'écart entre lignes.
function diaFromY(y, bottomY, spacing, bottomDia) {
    return bottomDia + Math.round((bottomY - y) / (spacing / 2));
}

function yFromDia(dia, bottomY, spacing, bottomDia) {
    return bottomY - (dia - bottomDia) * (spacing / 2);
}

// Plan de lecture : [{ at, len, midi }] en temps (noires) ; midi = null pour un silence. Les notes liées sont déjà des événements entiers.
function playbackPlan(st) {
    const out = [];
    let t = 0;
    st.ev.forEach(e => {
        const len = eventUnits(e) / 24;
        out.push({ at: t, len, midi: e.p ? pitchMidi(e.p) : null });
        t += len;
    });
    return out;
}

// ----- Modifications (renvoient une nouvelle portée ; l'ancienne n'est pas touchée) -----

function cloneStaff(st) { return { clef: st.clef, meter: st.meter, ks: st.ks, size: st.size || SN_SIZE_DEFAULT, ev: st.ev.map(e => ({ d: e.d, dot: e.dot, tri: e.tri, p: e.p ? { ...e.p } : null })) }; }

function insertEvent(st, index, ev) {
    const out = cloneStaff(st);
    if (out.ev.length >= SN_MAX_EVENTS) return out;
    out.ev.splice(Math.max(0, Math.min(index, out.ev.length)), 0, { d: ev.d, dot: !!ev.dot, tri: !!ev.tri, p: ev.p ? { ...ev.p } : null });
    return out;
}

function removeEvent(st, index) {
    const out = cloneStaff(st);
    if (index >= 0 && index < out.ev.length) out.ev.splice(index, 1);
    return out;
}

// Remplace certains champs d'un événement (durée, point, triolet, hauteur ; p = null pour un silence).
function updateEvent(st, index, patch) {
    const out = cloneStaff(st);
    const e = out.ev[index];
    if (!e) return out;
    if (patch.d !== undefined && SN_DURATIONS.includes(patch.d)) e.d = patch.d;
    if (patch.dot !== undefined) e.dot = !!patch.dot;
    if (patch.tri !== undefined) e.tri = !!patch.tri;
    if (patch.p !== undefined) e.p = patch.p ? { ...patch.p } : null;
    return out;
}

// Altère la note : delta -1 (bémol), +1 (dièse) ou null (bécarre = hauteur naturelle, sans altération).
function alterEvent(st, index, delta) {
    const out = cloneStaff(st);
    const e = out.ev[index];
    if (!e || !e.p) return out;
    e.p.a = delta === null ? 0 : Math.max(-2, Math.min(2, e.p.a + delta));
    return out;
}

// Déplace la note d'un degré diatonique (steps) en gardant l'armure ; reste dans la plage 1-7 octaves.
function shiftEvent(st, index, steps) {
    const out = cloneStaff(st);
    const e = out.ev[index];
    if (!e || !e.p) return out;
    const np = pitchFromDia(pitchDia(e.p) + steps, st.ks);
    if (np) e.p = np;
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SN_POS_MAX, clampStaffPos, parseStaffPos, formatStaffPos, staffClipText, splitStaffClips, SN_UNITS, SN_DURATIONS, SN_METERS, SN_MAX_EVENTS, SN_MAX_LENGTH, SN_KEY_NAMES, SN_KEY_LABELS, SN_BOTTOM_LINE,
        SN_SIZE_MIN, SN_SIZE_MAX, SN_SIZE_STEP, SN_SIZE_DEFAULT, clampStaffSize,
        staffDefault, parseStaff, formatStaff, canonicalStaff, eventUnits, meterUnits, meterBeamUnits, decomposeUnits, layoutStaff,
        pitchDia, keyAlter, pitchFromDia, pitchMidi, midiToName, pitchLabel, diaFromY, yFromDia, playbackPlan,
        cloneStaff, insertEvent, removeEvent, updateEvent, alterEvent, shiftEvent };
}
