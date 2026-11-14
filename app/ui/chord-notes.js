// ui/chord-notes.js — bloc d'accords jouables des annotations de Chord Scales, sans DOM : format enregistré, symboles, notes à jouer, copier-coller.
// Un bloc d'accords est enregistré sous la forme <div class="annot-chords" data-chords="b|0~maj7~4|7~7~2" data-at="x,y" data-border="0"></div> :
//   data-chords = lecture, puis un accord par « | » ; lecture : « b » (accords plaqués) ou « a » (arpégés, de bas en haut), suivie au besoin des réglages
//     propres au bloc : « ,bpm90 » (tempo en noires par minute), « ,sw67 » (swing en %), « ,inBb » (instrument : inC, inBb ou inEb) — comme une portée ;
//     un réglage absent suit celui de la jam (blocs écrits avant ces réglages) ;
//   accord = fondamentale ~ identifiant d'accord ~ durée en temps :
//     fondamentale : numéro de la note (0 = do … 11 = si), suivi de « s » (dièse) ou « f » (bémol) pour une touche noire (« 1s » = do♯, « 1f » = ré♭) ;
//     identifiant : celui de Chord Scales (catalogue : « maj7 », « m7b5 »… ou accord composé « x:M:P:b7:b9 », voir theory.js) ;
//     durée : 0,5 à 32 temps (par pas de ½ temps) ; la durée d'un temps suit le tempo de la jam.
//   data-at = place sur le canevas, data-border="0" = cadre caché : comme une portée (ui/staff-notes.js).
// Fonctions pures. Chargé par index.html via <script src="app/ui/chord-notes.js"> (après theory.js et ui/staff-notes.js) et testé par ui/chord-notes.test.js.

const CH_T = (typeof lookupChord !== 'undefined')
    ? { lookupChord, chordInfo, chordRootName, stackIntervalsUp, ROOT_NAMES_SHARP, ROOT_NAMES_FLAT, ROOT_NAMES_DEFAULT, BLACK_PCS, chordTypes }
    : require('../theory.js');
const CH_N = (typeof formatBlockAt !== 'undefined')
    ? { formatBlockAt, parseBlockAt, clampBlockAt, splitStaffClips, clampStaffBpm, clampStaffSwing, clampStaffInstr }
    : require('./staff-notes.js');

const CH_MAX_CHORDS = 16;                                   // accords par bloc
const CH_BEATS_MIN = 0.5, CH_BEATS_MAX = 32, CH_BEATS_DEFAULT = 4;
const CH_BEATS_CHOICES = [0.5, 1, 2, 3, 4, 6, 8, 12, 16];   // durées proposées dans l'éditeur (n'importe quelle valeur du format est lue)
const CH_ARP_SPACING = 0.5;                                 // arpège : une note tous les ½ temps (plus serré si l'accord est court)

function chordsClampBeats(v) {
    const n = Math.round(Number(v) * 2) / 2;
    return Number.isFinite(n) ? Math.max(CH_BEATS_MIN, Math.min(CH_BEATS_MAX, n)) : CH_BEATS_DEFAULT;
}

// « 7 », « 1s », « 1f » → { pc, acc } (acc : 's', 'f' ou null — une touche blanche n'a pas d'altération) ; null si invalide.
function chordsParseRoot(text) {
    const m = /^(\d{1,2})([sf])?$/.exec(String(text));
    if (!m) return null;
    const pc = parseInt(m[1], 10);
    if (pc > 11) return null;
    return { pc, acc: CH_T.BLACK_PCS.includes(pc) ? (m[2] || null) : null };
}

const chordsRootText = (c) => `${c.pc}${c.acc || ''}`;

function chordsNewChord(pc, acc, id, beats) {
    return { pc, acc: CH_T.BLACK_PCS.includes(pc) ? (acc || null) : null, id, beats: chordsClampBeats(beats === undefined ? CH_BEATS_DEFAULT : beats) };
}

// Bloc d'un seul accord (do majeur, 4 temps, accords plaqués) : ce que crée le bouton « Accords ».
// settings (facultatif) : { bpm, swing, instr } repris d'un autre bloc (réglages du dernier bloc créé).
function chordsDefault(settings) {
    return Object.assign({ mode: 'b', bpm: 0, swing: 0, instr: '', chords: [chordsNewChord(0, null, 'majTriad', CH_BEATS_DEFAULT)] }, chordsSettings(settings));
}

// Réglages de lecture propres au bloc : tempo (0 = jam), swing en % (0 = jam), instrument ('' = jam, sinon 'C', 'Bb' ou 'Eb').
function chordsSettings(o) {
    return { bpm: CH_N.clampStaffBpm(o && o.bpm), swing: CH_N.clampStaffSwing(o && o.swing), instr: CH_N.clampStaffInstr(o && o.instr) };
}

// Tempo et rapport de swing effectifs : ceux du bloc, sinon ceux de la jam (jamBpm ; jamSwing de 0,5 à 0,75).
function chordsTempo(st, jamBpm) { return CH_N.clampStaffBpm(st && st.bpm) || CH_N.clampStaffBpm(jamBpm) || 100; }
function chordsSwingRatio(st, jamSwing) {
    const own = CH_N.clampStaffSwing(st && st.swing);
    if (own) return own / 100;
    return typeof jamSwing === 'number' && Number.isFinite(jamSwing) ? Math.max(0.5, Math.min(0.75, jamSwing)) : 0.5;
}

// Texte enregistré → { mode, chords: [{ pc, acc, id, beats }] } ; null si rien d'utilisable. Un accord invalide est ignoré ; au plus CH_MAX_CHORDS accords.
function chordsParse(text) {
    if (typeof text !== 'string') return null;
    const parts = text.trim().split('|');
    const head = parts[0].split(',');
    const mode = head[0] === 'a' ? 'a' : (head[0] === 'b' ? 'b' : null);
    if (!mode) return null;
    const set = { bpm: 0, swing: 0, instr: '' };
    for (const h of head.slice(1)) {
        let m;
        if ((m = /^bpm(\d{2,3})$/.exec(h))) set.bpm = CH_N.clampStaffBpm(m[1]);
        else if ((m = /^sw(\d{2})$/.exec(h))) set.swing = CH_N.clampStaffSwing(m[1]);
        else if ((m = /^in(C|Bb|Eb)$/.exec(h))) set.instr = m[1];
        else return null;
    }
    const chords = [];
    for (const p of parts.slice(1)) {
        if (chords.length >= CH_MAX_CHORDS) break;
        const f = p.split('~');
        if (f.length !== 3) continue;
        const root = chordsParseRoot(f[0]);
        if (!root || !/^[A-Za-z0-9:,-]{1,40}$/.test(f[1]) || !CH_T.lookupChord(f[1])) continue;
        if (!/^\d{1,2}(?:\.5)?$/.test(f[2])) continue;
        chords.push(chordsNewChord(root.pc, root.acc, f[1], parseFloat(f[2])));
    }
    return chords.length ? Object.assign({ mode }, set, { chords }) : null;
}

function chordsFormat(st) {
    const s = st || chordsDefault();
    const set = chordsSettings(s);
    const head = (s.mode === 'a' ? 'a' : 'b') + (set.bpm ? `,bpm${set.bpm}` : '') + (set.swing ? `,sw${set.swing}` : '') + (set.instr ? `,in${set.instr}` : '');
    return [head].concat((s.chords || []).slice(0, CH_MAX_CHORDS).map(c => `${chordsRootText(c)}~${c.id}~${chordsClampBeats(c.beats)}`)).join('|');
}

// Texte canonique d'un bloc (null si invalide) : ce qu'on garde dans le fichier.
function chordsCanon(text) {
    const st = chordsParse(text);
    return st ? chordsFormat(st) : null;
}

function chordsDuration(st) { return st.chords.reduce((s, c) => s + c.beats, 0); }

// ----- Symbole d'un accord (notation jazz de l'application : Δ, −7, ø, °…, comme dans la grille de Chord Scales) -----

function chordsJazz(chordId) {
    if (chordId === 'majTriad') return '';                 // une triade majeure s'écrit avec la fondamentale seule (C, D, F#…)
    const built = CH_T.lookupChord(chordId);
    if (built && built.built) return built.jazz;           // accord composé : symbole généré
    const notation = {
        maj7: 'Δ', maj9: 'Δ9', '6': '6', maj7sharp11: 'Δ#11', maj7sharp5: 'Δ#5', m7: '−7', m9: '−9', m11: '−11', mmaj7: '−Δ7',
        '7': '7', '9': '9', '7alt': '7alt', '7b9': '7♭9', '7sharp5': '7#5', m7b5: 'ø', dim7: '°', '7sus4': '7sus4'
    };
    return notation[chordId] || (built || CH_T.chordTypes.maj[0]).name;
}

// Les 12 noms de notes d'un accord : dièses, bémols, ou l'orthographe usuelle (Do♭… jamais) selon l'altération choisie.
function chordsLabels(acc) { return acc === 's' ? CH_T.ROOT_NAMES_SHARP : (acc === 'f' ? CH_T.ROOT_NAMES_FLAT : CH_T.ROOT_NAMES_DEFAULT); }

function chordsRootName(c) { return CH_T.chordRootName(c.pc, c.id, chordsLabels(c.acc)); }

function chordsLabel(c) { return `${chordsRootName(c)}${chordsJazz(c.id)}`; }

// Les signes Δ ♭ ♯ − sont isolés dans un <span class="jam-glyph"> (police qui les contient : style.css) ; le texte est échappé.
function chordsLabelHtml(c) {
    const esc = String(chordsLabel(c)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭').replace(/(\d)b/g, '$1♭').replace(/[Δ♭♯−]/g, (g) => `<span class="jam-glyph">${g}</span>`);
}

// Durée affichée : « 4 », « ½ », « 1½ ».
function chordsBeatsText(b) {
    const whole = Math.floor(b), half = b - whole >= 0.5;
    return half ? (whole ? `${whole}½` : '½') : String(whole);
}

// ----- Notes jouées -----

// Notes MIDI de l'accord, de bas en haut : fondamentale entre fa2 et mi3 (53 à 64), les autres notes empilées au-dessus (9, 11 et 13 à l'octave supérieure).
function chordsMidi(c) {
    const obj = CH_T.lookupChord(c.id);
    if (!obj) return [];
    const root = 53 + ((c.pc - 5 + 12) % 12);
    return CH_T.stackIntervalsUp(obj.notes).map(iv => root + iv);
}

// Plan de lecture : { events: [{ midi, at, len, chord }], chords: [{ at, len }], total } ; `at` et `len` en temps (à multiplier par la durée du temps).
// Swing (ratio 0,5 = droit … 0,75) : un départ sur un « et » (x,5 temps) est retardé de x + ratio ; les départs sur le temps ne bougent pas.
function chordsPlan(st, swing) {
    const events = [], spans = [];
    const sw = typeof swing === 'number' && swing > 0.5 + 1e-9 ? swing : 0.5;
    const warp = (x) => (Math.abs(x - Math.floor(x) - 0.5) < 1e-9 ? Math.floor(x) + sw : x);
    let t = 0;
    st.chords.forEach((c, i) => {
        const notes = chordsMidi(c);
        if (st.mode === 'a') {
            const gap = Math.min(CH_ARP_SPACING, c.beats / Math.max(1, notes.length));
            notes.forEach((midi, k) => events.push({ midi, at: warp(t + k * gap), len: Math.max(0.25, (c.beats - k * gap) * 0.97), chord: i }));
        } else {
            notes.forEach((midi) => events.push({ midi, at: warp(t), len: Math.max(0.25, c.beats * 0.95), chord: i }));
        }
        spans.push({ at: warp(t), len: c.beats });
        t += c.beats;
    });
    return { events, chords: spans, total: t };
}

// ----- Modifications (l'éditeur les applique sur une copie, puis réécrit le bloc) -----

const chordsClone = (st) => Object.assign({ mode: st.mode }, chordsSettings(st), { chords: st.chords.map(c => ({ ...c })) });

// op : 'setRoot' (v = { pc, acc }), 'setId' (v = identifiant), 'setBeats' (v = durée), 'add' (copie l'accord i juste après lui), 'remove', 'move' (v = -1 ou 1),
// 'setMode' (v = 'a' | 'b'). Renvoie le nouveau bloc, ou null si rien ne change.
function chordsEdit(st, i, op, v) {
    const s = chordsClone(st), c = s.chords[i];
    if (op === 'setBpm' || op === 'setSwing' || op === 'setInstr') {
        const key = op === 'setBpm' ? 'bpm' : (op === 'setSwing' ? 'swing' : 'instr');
        const val = chordsSettings({ [key]: v })[key];
        if (val === s[key]) return null;
        s[key] = val;
        return s;
    }
    if (op === 'setMode') { const m = v === 'a' ? 'a' : 'b'; if (m === s.mode) return null; s.mode = m; return s; }
    if (!c) return null;
    if (op === 'setRoot') {
        const pc = Number(v && v.pc);
        if (!Number.isInteger(pc) || pc < 0 || pc > 11) return null;
        const acc = CH_T.BLACK_PCS.includes(pc) ? ((v && v.acc) || null) : null;
        if (pc === c.pc && acc === c.acc) return null;
        c.pc = pc; c.acc = acc;
    } else if (op === 'setId') {
        if (!CH_T.lookupChord(v) || v === c.id) return null;
        c.id = v;
    } else if (op === 'setBeats') {
        const b = chordsClampBeats(v);
        if (b === c.beats) return null;
        c.beats = b;
    } else if (op === 'add') {
        if (s.chords.length >= CH_MAX_CHORDS) return null;
        s.chords.splice(i + 1, 0, { ...c });
    } else if (op === 'remove') {
        if (s.chords.length <= 1) return null;
        s.chords.splice(i, 1);
    } else if (op === 'move') {
        const j = i + (v < 0 ? -1 : 1);
        if (j < 0 || j >= s.chords.length) return null;
        [s.chords[i], s.chords[j]] = [s.chords[j], s.chords[i]];
    } else return null;
    return s;
}

// ----- Enregistrement et presse-papiers -----

function chordsStubHtml(st, at, border) {
    const p = CH_N.formatBlockAt(at);
    return `<div class="annot-chords" data-chords="${chordsFormat(st || chordsDefault())}"${p ? ` data-at="${p}"` : ''}${border === false ? ' data-border="0"' : ''}></div>`;
}

// Un bloc copié s'écrit « [accords@x,y!:b|0~maj7~4] » (place et « ! » facultatifs, comme « [portée…] »).
const CH_CLIP_RE = /\[accords(?:@(\d{1,4}),(\d{1,4}))?(!)?:([^\]\n]{1,2000})\]/g;

function chordsClipText(st, meta) {
    const at = meta && meta.at ? CH_N.formatBlockAt(meta.at) : '';
    return `[accords${at ? `@${at}` : ''}${meta && meta.border === false ? '!' : ''}:${chordsFormat(st)}]`;
}

// Comme splitStaffClips (ui/staff-notes.js), avec en plus des morceaux { chords: texte canonique, at?, noBorder? } pour les repères « [accords…] ».
function chordsSplitClips(text) {
    const src = String(text === undefined || text === null ? '' : text);
    const out = [];
    let pos = 0, m;
    CH_CLIP_RE.lastIndex = 0;
    const plain = (s) => { if (s) CH_N.splitStaffClips(s).forEach(p => out.push(p)); };
    while ((m = CH_CLIP_RE.exec(src))) {
        const canon = chordsCanon(m[4]);
        if (!canon) continue;
        plain(src.slice(pos, m.index));
        const piece = { chords: canon };
        if (m[1] !== undefined) piece.at = { x: CH_N.clampBlockAt(m[1]), y: CH_N.clampBlockAt(m[2]) };
        if (m[3]) piece.noBorder = true;
        out.push(piece);
        pos = m.index + m[0].length;
    }
    plain(src.slice(pos));
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CH_MAX_CHORDS, CH_BEATS_MIN, CH_BEATS_MAX, CH_BEATS_DEFAULT, CH_BEATS_CHOICES, chordsClampBeats, chordsParseRoot, chordsRootText, chordsNewChord,
        chordsDefault, chordsSettings, chordsTempo, chordsSwingRatio, chordsParse, chordsFormat, chordsCanon, chordsDuration, chordsJazz, chordsLabels, chordsRootName, chordsLabel, chordsLabelHtml, chordsBeatsText,
        chordsMidi, chordsPlan, chordsEdit, chordsStubHtml, chordsClipText, chordsSplitClips };
}
