// grid/ireal-import.js — import des grilles iReal Pro (liens irealb:// et irealbook://, fichiers HTML exportés par iReal Pro,
// playlists comprises). Fonctions pures, sans DOM : le texte reçu est lu, chaque morceau devient une grille de l'appli
// (même forme que les fichiers .json importés) et ses réglages (tonalité, qualité, tempo, signature, orchestre).
// Chargé par index.html via <script src="app/grid/ireal-import.js"> (après grid-format.js et style-meta.js) et testé par
// grid/ireal-import.test.js.
//
// Ce qu'iReal Pro écrit et que l'appli ne sait pas représenter est adapté, et signalé dans le compte rendu (warnings) :
//   - plus de 2 accords dans une mesure : on garde l'accord du 1er temps et celui du milieu de la mesure ; la mesure
//     d'origine est recopiée dans l'annotation de la mesure ;
//   - accords alternatifs (petits accords entre parenthèses), N.C. et textes libres : dans l'annotation de la mesure
//     (N.C. et mesures vides reprennent l'accord précédent) ;
//   - changement de signature en cours de morceau : on garde la première ; signatures absentes de l'appli (5/4…) : 4/4 ;
//   - 3e fin et au-delà : ignorées ; reprise jouée plus de 4 fois : 4 fois ;
//   - couleurs d'accords très rares : la couleur constructible la plus proche.

// Sous Node, la théorie se charge ; en navigateur ce sont des globaux (theory.js).
const IR_THEORY = (typeof cbId !== 'undefined' && typeof deriveSpelling !== 'undefined')
    ? { cbId, lookupChord, rootNameToIndex, deriveSpelling }
    : require('../theory.js');

const IR_OBF_PREFIX = '1r34LbKcu7';
const IR_MAX_BLOCKS = 512;   // = GRID_MAX_BLOCKS (grid/grid-format.js)

// ===== Lecture du lien =====

// Liens iReal Pro trouvés dans un texte (page HTML exportée, lien collé, texte quelconque).
function irFindLinks(text) {
    if (typeof text !== 'string') return [];
    const out = [];
    // dans une page HTML le lien est entre guillemets (et encodé) ; collé tel quel, il va jusqu'au bout de la ligne
    const quoted = /["'](ireal(b|book):\/\/([^"']+))["']/gi;
    let m;
    while ((m = quoted.exec(text))) out.push({ obfuscated: m[2].toLowerCase() === 'b', body: m[3] });
    if (out.length) return out;
    const bare = /ireal(b|book):\/\/([^\r\n]+)/gi;
    while ((m = bare.exec(text))) out.push({ obfuscated: m[1].toLowerCase() === 'b', body: m[2].trim() });
    return out;
}

function irDecodeURI(s) {
    try { return decodeURIComponent(s); }
    catch (e) {
        // un % isolé : on décode morceau par morceau ce qui peut l'être
        return s.replace(/(%[0-9a-f]{2})+/gi, (x) => { try { return decodeURIComponent(x); } catch (e2) { return x; } });
    }
}

// Le format irealb brouille la grille par blocs de 50 signes (permutation fixe, documentée par les lecteurs libres du format).
function irObfusc50(s) {
    const c = s.split('');
    for (let i = 0; i < 5; i++) { c[49 - i] = s[i]; c[i] = s[49 - i]; }
    for (let i = 10; i < 24; i++) { c[49 - i] = s[i]; c[i] = s[49 - i]; }
    return c.join('');
}
function irUnscramble(s) {
    let r = '';
    while (s.length > 50) {
        const p = s.substring(0, 50);
        s = s.substring(50);
        r += (s.length < 2) ? p : irObfusc50(p);
    }
    return r + s;
}

// Chaîne de la grille, en clair. Abréviations du format : XyQ = 3 cases vides, LZ = barre simple, Kcl = mesure répétée.
function irMusicText(raw, obfuscated) {
    let m = String(raw || '');
    if (obfuscated) {
        if (!m.startsWith(IR_OBF_PREFIX)) return null;
        m = irUnscramble(m.slice(IR_OBF_PREFIX.length));
    }
    return m.replace(/XyQ/g, '   ').replace(/LZ/g, ' |').replace(/Kcl/g, '| x');
}

// Un morceau : titre, compositeur, style, tonalité, grille, (irealb) style d'accompagnement, tempo.
//   irealb    : Titre=Compositeur==Style=Tonalité==1r34LbKcu7…=StyleAccomp=Tempo=Chorus
//   irealbook : Titre=Compositeur=Style=Tonalité=n=Grille
function irParseSongFields(str, obfuscated) {
    const f = String(str).split('=');
    if (obfuscated) {
        const idx = f.findIndex(x => x.startsWith(IR_OBF_PREFIX));
        if (idx < 2) return null;
        const mid = f.slice(2, idx).filter(x => x !== '');
        const music = irMusicText(f[idx], true);
        if (music === null) return null;
        return { title: f[0], composer: f[1], style: mid[0] || '', key: mid[1] || '', music,
                 compStyle: f[idx + 1] || '', bpm: Number(f[idx + 2]) || 0 };
    }
    if (f.length < 6) return null;
    return { title: f[0], composer: f[1], style: f[2], key: f[3], music: irMusicText(f[5], false), compStyle: '', bpm: 0 };
}

// Tous les morceaux d'un lien (une playlist se termine par son nom, après le dernier « === »).
function irParseLink(link) {
    const body = irDecodeURI(link.body);
    let parts = body.split('===');
    let playlist = '';
    if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (!last.includes(IR_OBF_PREFIX) && last.split('=').length < 4) { playlist = last.trim(); parts = parts.slice(0, -1); }
    }
    if (!link.obfuscated) {
        // irealbook : les morceaux d'une playlist se suivent, 6 champs chacun, séparés eux aussi par « = »
        const f = body.split('=');
        const songs = [];
        for (let j = 0; j + 6 <= f.length; j += 6) { const sg = irParseSongFields(f.slice(j, j + 6).join('='), false); if (sg) songs.push(sg); }
        return { playlist: (f.length % 6 === 1) ? f[f.length - 1].trim() : '', songs };
    }
    const songs = parts.map(p => irParseSongFields(p, link.obfuscated)).filter(Boolean);
    return { playlist, songs };
}

// ===== Accords =====

// Couleur iReal (« -7 », « ^7#11 », « 7b9sus », « h », « o7 »…) → état du constructeur d'accords { third, fifth, sev, ext }.
// approx : la couleur contient des signes non reconnus, ou que l'appli ne sait pas jouer (accord de quinte « 5 »).
const IR_Q_TOKENS = /alt|min|maj|add13|add9|add4|add3|add2|sus4|sus2|sus|b13|#11|b5|#5|b6|b9|#9|13|11|69|9|7|6|5|4|2|\^|-|h|o|\+/g;
function irQuality(q) {
    const st = { third: 'M', fifth: 'P', sev: '', ext: [] };
    let approx = false, dim = false, maj = false;
    const rest = q.replace(IR_Q_TOKENS, '');
    if (rest.replace(/[()]/g, '') !== '') approx = true;
    const toks = q.match(IR_Q_TOKENS) || [];
    if (toks.includes('alt')) return { id: '7alt', approx: false };
    const defSev = () => { if (!st.sev) st.sev = dim ? 'bb7' : (maj ? 'M7' : 'b7'); };
    const addExt = (...e) => e.forEach(x => { if (!st.ext.includes(x)) st.ext.push(x); });
    toks.forEach((t, i) => {
        switch (t) {
            case '-': case 'min': st.third = 'm'; break;
            case 'h': st.third = 'm'; st.fifth = 'b5'; st.sev = 'b7'; break;
            case 'o': st.third = 'm'; st.fifth = 'b5'; dim = true; break;
            case '+': st.fifth = 's5'; break;
            case '^': maj = true; st.sev = 'M7'; break;
            case 'maj': maj = true; break;                           // « maj7 », « maj13#11 » ; « maj(add4) » reste une triade
            case 'sus': case 'sus4': case '4': st.third = 'sus4'; break;
            case 'sus2': st.third = 'sus2'; break;
            case '2': if (toks.length === 1 || toks[i - 1] === 'sus') st.third = 'sus2'; else addExt('9'); break;
            case 'add2': case 'add9': addExt('9'); break;
            case 'add4': addExt('11'); break;
            case 'add13': addExt('13'); break;
            case 'add3': st.third = 'M'; addExt('11'); break;      // 7susadd3 : la quarte s'ajoute à la tierce
            case '5': approx = true; break;                          // accord de quinte (sans tierce) : joué en triade majeure
            case '6': if (!st.sev || st.sev === 'b7') st.sev = '6'; break;
            case '69': st.sev = '6'; addExt('9'); break;
            case '7': if (maj) st.sev = 'M7'; else if (dim) st.sev = 'bb7'; else st.sev = 'b7'; break;
            case '9': defSev(); addExt('9'); break;
            case '11': defSev(); addExt('9', '11'); break;
            case '13': defSev(); addExt('9', '13'); break;
            case 'b5': st.fifth = 'b5'; break;
            case '#5': st.fifth = 's5'; break;
            case 'b6': addExt('b13'); break;
            case 'b9': defSev(); addExt('b9'); break;
            case '#9': defSev(); addExt('s9'); break;
            case '#11': addExt('s11'); break;
            case 'b13': defSev(); addExt('b13'); break;
        }
    });
    // une 9 posée par défaut gêne une ♭9 ou une #9 écrite (ex. 13b9) : on garde l'altération
    if (st.ext.includes('b9') || st.ext.includes('s9')) st.ext = st.ext.filter(x => x !== '9');
    if (st.ext.includes('b13')) st.ext = st.ext.filter(x => x !== '13');
    if (st.ext.includes('s11')) st.ext = st.ext.filter(x => x !== '11');
    if (st.sev === 'bb7' && !(st.third === 'm' && st.fifth === 'b5')) st.sev = 'b7';
    return { id: IR_THEORY.cbId(st), approx };
}

const IR_ROOT_RE = /^([A-G])(#|b)?/;
// Accord écrit « C^7 », « Bb7b9/Ab », « F#-7 »… → { rootIndex, rootName, chordId, bassRootIndex, approx, len } ou null.
function irReadChord(s) {
    const r = IR_ROOT_RE.exec(s);
    if (!r) return null;
    let pos = r[0].length;
    // couleur : jusqu'à la basse, ou au premier signe qui n'appartient pas à une couleur d'accord
    // (« s » et « l », petits / grands accords, ne sont jamais pris : seuls sus et alt les contiennent)
    const qm = /^(?:min|maj|\(add\d+\)|add\d*|alt|sus\d?|[-^+#bho0-9])*/.exec(s.slice(pos));
    const q = qm ? qm[0] : '';
    pos += q.length;
    let bass = null;
    const b = /^\/([A-G])(#|b)?/.exec(s.slice(pos));
    if (b) { bass = IR_THEORY.rootNameToIndex(b[1] + (b[2] || '')); pos += b[0].length; }
    const rootName = r[1] + (r[2] || '');
    const qq = irQuality(q);
    if (!IR_THEORY.lookupChord(qq.id)) return null;
    return { rootIndex: IR_THEORY.rootNameToIndex(rootName), rootName, chordId: qq.id, quality: q,
             bassRootIndex: (bass !== null && bass >= 0) ? bass : null, approx: qq.approx, len: pos };
}

// ===== Grille =====

const IR_METERS = { '44': '4/4', '34': '3/4', '24': '2/4', '22': '4/4', '32': '3/4', '68': '6/8', '98': '9/8', '12': '12/8',
    '58': '5/8', '78': '7/8' };

function irTextOf(raw) {
    return String(raw || '').replace(/^\*\d{0,2}/, '').trim();   // « *72Fine » : décalage vertical du texte, puis le texte
}

// Indications de fin de mesure : quand elles tombent hors mesure, elles reviennent à la mesure précédente.
const IR_BACK_KEYS = ['jump', 'fine', 'toCoda', 'fermata'];

// Accord écrit à la manière d'iReal (« C^7 », « D-7 », « Bh7 », « Co7 ») → écriture usuelle pour les annotations.
function irPretty(label) {
    return String(label).replace(/\^/g, 'Δ').replace(/(^|[A-G][#b]?)-/g, '$1m').replace(/h/g, 'ø').replace(/o/g, '°');
}

function irEscape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Lit la chaîne de la grille : liste de mesures { chords:[{…, cell}], cells, alts:[], notes:[], attrs }, signature, compte rendu.
function irReadMeasures(music, warn) {
    const measures = [];
    let pending = {};           // indications posées hors mesure (partie, reprise, 2e fin…) : pour la mesure suivante
    let cur = null;
    let lastBar = 'open';       // 'open' ([ { |), 'close' (] } Z)
    let meter = null, meterChanged = false;
    let qCount = 0;
    let repeatTwoNext = null;   // « r » : la mesure suivante (vide) reçoit la 2e mesure répétée
    let repeatCount = 0;        // « <3x> » écrit n'importe où dans la reprise { }
    const fresh = () => ({ chords: [], cells: 0, alts: [], notes: [], attrs: {}, kind: null });
    const lastReal = () => measures[measures.length - 1] || null;
    const lastChordOf = (m) => (m && m.chords.length ? m.chords[m.chords.length - 1] : null);
    const copyChords = (m) => (m ? m.chords.map(c => ({ ...c })) : []);

    const finish = () => {
        const m = cur;
        cur = null;
        if (!m) return;
        if (repeatTwoNext && !m.chords.length && !m.kind) { m.chords = repeatTwoNext; repeatTwoNext = null; }
        else if (m.kind === 'x') m.chords = copyChords(lastReal());
        else if (m.kind === 'r') { const n = measures.length; m.chords = copyChords(measures[n - 2] || measures[n - 1]); repeatTwoNext = copyChords(measures[n - 1]); }
        const empty = !m.chords.length;
        if (empty) {
            // mesure vide, N.C. ou barres obliques : l'accord précédent continue (une mesure « vide » entre deux barres de fin
            // et de début de ligne n'en est pas une : on garde seulement ses indications pour la suivante)
            const hold = m.kind === 'n' || m.kind === 'hold' || (m.cells > 0 && lastBar === 'open');
            const prev = lastChordOf(lastReal());
            if (!hold || !prev) {
                // renvoi, Fine… écrits après la dernière barre d'une ligne : ils appartiennent à la mesure d'avant
                const back = lastReal();
                Object.keys(m.attrs).forEach(k => {
                    if (back && IR_BACK_KEYS.includes(k)) back.attrs[k] = m.attrs[k]; else pending[k] = m.attrs[k];
                });
                if (m.notes.length) pending._notes = (pending._notes || []).concat(m.notes);
                return;
            }
            m.chords = [{ ...prev, cell: 0 }];
            if (m.kind === 'n') m.notes.unshift('N.C.');
        }
        const pn = pending._notes; delete pending._notes;
        m.attrs = Object.assign({}, pending, m.attrs);
        if (pn) m.notes = pn.concat(m.notes);
        pending = {};
        measures.push(m);
    };
    const open = () => { if (!cur) cur = fresh(); return cur; };
    const attr = (k, v) => { if (cur) cur.attrs[k] = v; else pending[k] = v; };

    let i = 0;
    const s = music;
    while (i < s.length) {
        const ch = s[i];
        if (ch === '|' || ch === '[' || ch === '{' || ch === ']' || ch === '}' || ch === 'Z') {
            finish();
            if (ch === '}') {
                const m = lastReal();
                if (m) {
                    let n = repeatCount || m.attrs.repeatCount || 2;
                    repeatCount = 0;
                    if (n > 4) { warn('repeat4'); n = 4; }
                    m.attrs.repeatEnd = n;
                }
            }
            if (ch === '{') { pending.repeatStart = true; repeatCount = 0; }
            lastBar = (ch === ']' || ch === '}' || ch === 'Z') ? 'close' : 'open';
            i++; continue;
        }
        if (ch === 'T' && /^\d\d/.test(s.slice(i + 1, i + 3))) {
            const code = s.slice(i + 1, i + 3);
            const mt = IR_METERS[code];
            if (!mt) warn('meterUnknown', `${code[0]}/${code[1]}`);
            const val = mt || '4/4';
            if (meter === null) meter = val; else if (val !== meter) meterChanged = true;
            i += 3; continue;
        }
        if (ch === '*' && i + 1 < s.length) {
            const c = s[i + 1];
            const label = c === 'i' ? 'in' : (c === 'V' ? 'Couplet' : (/[A-Z]/.test(c) ? c : null));
            if (label) attr('partStart', label);
            i += 2; continue;
        }
        if (ch === '<') {
            const end = s.indexOf('>', i);
            const txt = irTextOf(end < 0 ? s.slice(i + 1) : s.slice(i + 1, end));
            i = end < 0 ? s.length : end + 1;
            const tm = open();
            irApplyText(txt, tm, warn);
            if (tm.attrs.repeatCount) { repeatCount = tm.attrs.repeatCount; delete tm.attrs.repeatCount; }
            continue;
        }
        if (ch === '(') {
            const end = s.indexOf(')', i);
            const txt = (end < 0 ? s.slice(i + 1) : s.slice(i + 1, end)).trim();
            i = end < 0 ? s.length : end + 1;
            if (txt) { open().alts.push(txt); warn('alts'); }
            continue;
        }
        if (ch === 'N' && /[0-9]/.test(s[i + 1] || '')) {
            const n = Number(s[i + 1]);
            if (n === 1 || n === 2) attr('volta', n);
            else if (n >= 3) warn('volta3');
            i += 2; continue;
        }
        if (ch === 'S') { attr('segno', true); i++; continue; }
        if (ch === 'Q') { qCount++; attr(qCount === 1 ? '_q1' : '_qn', true); i++; continue; }
        if (ch === 'f') { open().attrs.fermata = true; i++; continue; }
        if (ch === 'x') { open().kind = 'x'; i++; continue; }
        if (ch === 'r') { open().kind = 'r'; i++; continue; }
        if (ch === 'n') { const m = open(); if (!m.chords.length) m.kind = 'n'; m.cells++; i++; continue; }
        if (ch === 'p') { const m = open(); if (!m.kind) m.kind = 'hold'; m.cells++; i++; continue; }
        if (ch === ' ') {
            // case vide : dans une mesure (« |   | » = l'accord précédent continue) ; après une barre de fin, simple marge
            if (!cur && lastBar === 'open') open();
            if (cur) cur.cells++;
            i++; continue;
        }
        if (ch === 'W') {
            // « W/G » : accord précédent, nouvelle basse
            const b = /^W\/([A-G])(#|b)?/.exec(s.slice(i));
            const m = open();
            const prev = lastChordOf(m.chords.length ? m : lastReal());
            if (b && prev) { m.chords.push({ ...prev, bassRootIndex: IR_THEORY.rootNameToIndex(b[1] + (b[2] || '')), cell: m.cells }); m.cells++; }
            i += b ? b[0].length : 1; continue;
        }
        if (/[A-G]/.test(ch)) {
            const c = irReadChord(s.slice(i));
            if (c) {
                const m = open();
                if (m.kind === 'hold' || m.kind === 'n') m.kind = null;
                if (c.approx) warn('approx', c.rootName + c.quality);
                m.chords.push({ rootIndex: c.rootIndex, rootName: c.rootName, chordId: c.chordId, bassRootIndex: c.bassRootIndex, label: s.slice(i, i + c.len), cell: m.cells });
                m.cells++;
                i += c.len; continue;
            }
        }
        i++;   // , Y U s l et tout signe inconnu : rien à lire
    }
    finish();
    if (meterChanged) warn('meterChange');
    return { measures, meter: meter || '4/4', qCount };
}

// Texte libre posé sur une mesure : renvois (D.C., D.S., Fine), nombre de passages (« 3x »), sinon annotation.
function irApplyText(txt, m, warn) {
    if (!txt) return;
    const t = txt.toLowerCase().replace(/\s+/g, ' ');
    const dc = /^d\.? ?c\.?(?![a-z])/.test(t), ds = /^d\.? ?s\.?(?![a-z])/.test(t);
    if (dc || ds) {
        const base = dc ? 'dc' : 'ds';
        if (/al coda/.test(t)) m.attrs.jump = base + 'Coda';
        else if (/al fine/.test(t)) m.attrs.jump = base + 'Fine';
        else { m.attrs.jump = base; if (/\b(1st|2nd|3rd|\d)/.test(t)) warn('jumpEnding', txt); }
        return;
    }
    if (/^fine\b/.test(t)) { m.attrs.fine = true; return; }
    if (/^to coda\b/.test(t)) { m.attrs.toCoda = true; return; }
    const rx = /^(\d+) ?x\b/.exec(t);
    if (rx) { m.attrs.repeatCount = Number(rx[1]); return; }
    m.notes.push(txt);
}

// Une mesure lue → un bloc de la grille (au plus 2 accords : le 1er temps et le milieu de la mesure).
function irMeasureToStep(m, warn) {
    let chords = m.chords;
    const notes = m.notes.slice();
    if (chords.length > 2) {
        warn('crowded');
        notes.push('Mesure d’origine : ' + chords.map(c => irPretty(c.label)).join(' '));
        const half = Math.floor(Math.max(m.cells, chords.length) / 2);
        let second = null;
        chords.forEach((c, k) => { if (k > 0 && c.cell <= half) second = c; });
        if (!second || second.cell === chords[0].cell) second = chords[Math.ceil(chords.length / 2)];
        chords = [chords[0], second];
    }
    if (m.alts.length) notes.push('Accords alternatifs : ' + m.alts.map(irPretty).join(' '));
    const a = chords[0];
    const step = { rootIndex: a.rootIndex, chordId: a.chordId, measures: 1 };
    if (a.bassRootIndex !== null && a.bassRootIndex !== undefined) step.bassRootIndex = a.bassRootIndex;
    if (chords.length === 2) {
        const b = chords[1];
        step.split = { rootIndex: b.rootIndex, chordId: b.chordId };
        if (b.bassRootIndex !== null && b.bassRootIndex !== undefined) step.split.bassRootIndex = b.bassRootIndex;
    }
    const at = m.attrs;
    if (at.partStart) step.partStart = at.partStart;
    if (at.repeatStart) step.repeatStart = true;
    if (at.repeatEnd) step.repeatEnd = at.repeatEnd;
    if (at.volta) step.volta = at.volta;
    ['segno', 'coda', 'toCoda', 'fine', 'fermata'].forEach(k => { if (at[k]) step[k] = true; });
    if (at.jump) step.jump = at.jump;
    if (notes.length) step.note = notes.map(n => `<div>${irEscape(n)}</div>`).join('');
    return step;
}

// Indications qui empêchent de fusionner une mesure avec la précédente (début) ou la suivante (fin).
const IR_START_KEYS = ['partStart', 'repeatStart', 'volta', 'segno', 'coda', 'note'];
const IR_END_KEYS = ['repeatEnd', 'toCoda', 'fine', 'jump', 'fermata', 'note'];
function irSameChord(a, b) {
    return a.rootIndex === b.rootIndex && a.chordId === b.chordId && (a.bassRootIndex ?? null) === (b.bassRootIndex ?? null);
}
function irMergeSteps(steps) {
    const out = [];
    steps.forEach(st => {
        const prev = out[out.length - 1];
        if (prev && !prev.split && !st.split && irSameChord(prev, st) && prev.measures < 16
            && !IR_END_KEYS.some(k => prev[k] !== undefined) && !IR_START_KEYS.some(k => st[k] !== undefined)) {
            prev.measures++;
            IR_END_KEYS.forEach(k => { if (st[k] !== undefined) prev[k] = st[k]; });
            return;
        }
        out.push(st);
    });
    return out;
}

// ===== Style, tempo, tonalité =====

// Style iReal (« Medium Swing », « Bossa Nova », « Latin-Brazil: Samba »…) → orchestre de l'appli (+ rythme, swing).
function irOrchestraFor(style, compStyle) {
    const s = `${compStyle || ''} ${style || ''}`.toLowerCase();
    if (/gypsy|manouche/.test(s)) return { style: 'manouche' };
    if (/bossa/.test(s)) return { style: 'latin', groove: 'bossa' };
    if (/samba/.test(s)) return { style: 'latin', groove: 'samba' };
    if (/choro/.test(s)) return { style: 'latin', groove: 'br-choro' };
    if (/bai[aã]o|forr[oó]/.test(s)) return { style: 'latin', groove: 'br-baiao' };
    if (/tango/.test(s)) return { style: 'piazzolla' };
    if (/salsa|mambo|montuno/.test(s)) return { style: 'cuba', groove: 'salsa' };
    if (/cha ?cha|afro|rumba|guaguanc|songo/.test(s)) return { style: 'cuba' };
    if (/bolero/.test(s)) return { style: 'mexico', groove: 'mx-bolero' };
    if (/cumbia/.test(s)) return { style: 'cumbia' };
    if (/rock|pop|funk|disco|soul|r ?& ?b|rnb|reggae|country|shuffle|house|smooth|bluegrass|16th/.test(s)) return { style: 'pop' };
    if (/latin/.test(s)) return { style: 'latin' };
    if (/even/.test(s)) return { style: 'swing', swing: 0.5 };
    return { style: 'swing' };
}
function irTempoFor(style, compStyle) {
    const s = `${compStyle || ''} ${style || ''}`.toLowerCase();
    if (/ballad|slow/.test(s)) return 70;
    if (/up ?tempo|fast|double time/.test(s)) return 220;
    if (/medium up/.test(s)) return 180;
    if (/samba/.test(s)) return 190;
    if (/bossa/.test(s)) return 130;
    if (/waltz/.test(s)) return 140;
    return 140;
}
// « Eb », « C- », « F#- » → { key, quality, keyName }
function irKeyOf(k) {
    const m = /^([A-G])(#|b)?(-)?/.exec(String(k || '').trim());
    if (!m) return null;
    const name = m[1] + (m[2] || '');
    const key = IR_THEORY.rootNameToIndex(name);
    if (key < 0) return null;
    return { key, quality: m[3] ? 'aeolian' : 'ionian', keyName: name };
}
// Titres iReal du type « Girl From Ipanema, The » → « The Girl From Ipanema »
function irTitle(t) {
    const s = String(t || '').trim();
    const m = /^(.*),\s*(The|A|An)$/i.exec(s);
    return (m ? `${m[2]} ${m[1]}` : s).slice(0, 80) || 'Grille iReal Pro';
}
// « Jobim Antonio-Carlos » (nom d'abord, comme dans iReal Pro) → « Antonio-Carlos Jobim »
function irComposer(c) {
    const s = String(c || '').trim();
    const p = s.split(' ');
    return p.length === 2 ? `${p[1]} ${p[0]}` : s;
}

// ===== Compte rendu =====

const IR_WARN_TEXT = {
    crowded: (n) => `${n} mesure${n > 1 ? 's' : ''} de plus de 2 accords ramenée${n > 1 ? 's' : ''} à 2 (accords d'origine dans l'annotation)`,
    alts: (n) => `${n} accord${n > 1 ? 's' : ''} alternatif${n > 1 ? 's' : ''} placé${n > 1 ? 's' : ''} dans les annotations`,
    approx: (n, d) => `${n} accord${n > 1 ? 's' : ''} approché${n > 1 ? 's' : ''} (${d.slice(0, 4).join(', ')}${d.length > 4 ? '…' : ''})`,
    meterChange: () => 'changement de signature en cours de morceau : seule la première est gardée',
    meterUnknown: (n, d) => `signature ${d.join(', ')} absente de l'appli : remplacée par 4/4`,
    volta3: () => '3e fin ignorée',
    repeat4: () => 'reprise jouée plus de 4 fois : ramenée à 4',
    jumpEnding: (n, d) => `renvoi « ${d[0]} » lu comme un simple D.C. / D.S.`,
    coda: () => 'signe de coda isolé lu comme le début de la coda',
    truncated: () => `morceau trop long : seules les ${IR_MAX_BLOCKS} premières cases sont gardées`
};
function irWarnSummary(w) {
    return Object.keys(w).map(k => IR_WARN_TEXT[k] ? IR_WARN_TEXT[k](w[k].count, w[k].details) : k);
}

// ===== Morceau → grille de l'appli =====

// opts.scaleFor(chordId, rootIndex, key, quality) : gamme à poser (règle de l'appli pour les accords posés à la main) ; sans
// elle, l'import laisse la gamme par défaut de l'accord (grid-format.js la complète).
function irSongToGrid(song, opts) {
    const o = opts || {};
    const w = {};
    const warn = (k, d) => {
        const e = w[k] || (w[k] = { count: 0, details: [] });
        e.count++;
        if (d !== undefined && !e.details.includes(d)) e.details.push(d);
    };
    const read = irReadMeasures(song.music || '', warn);
    if (!read.measures.length) return null;
    // Signe de coda : 1re occurrence = « To Coda », les suivantes = début de la coda (un seul signe : début de la coda)
    read.measures.forEach(m => {
        if (m.attrs._q1) { if (read.qCount >= 2) m.attrs.toCoda = true; else { m.attrs.coda = true; } }
        if (m.attrs._qn) m.attrs.coda = true;
        delete m.attrs._q1; delete m.attrs._qn;
    });
    let steps = irMergeSteps(read.measures.map(m => irMeasureToStep(m, warn)));
    if (steps.length > IR_MAX_BLOCKS) { steps = steps.slice(0, IR_MAX_BLOCKS); warn('truncated'); }

    const k = irKeyOf(song.key) || { key: steps[0].rootIndex, quality: 'ionian', keyName: null };
    const settings = { key: k.key, quality: k.quality, timeSignature: read.meter };
    if (k.keyName) settings.spell = IR_THEORY.deriveSpelling(k.keyName, k.quality);
    settings.bpm = (song.bpm >= 30 && song.bpm <= 400) ? song.bpm : irTempoFor(song.style, song.compStyle);
    settings.orchestration = irOrchestraFor(song.style, song.compStyle);
    if (/waltz/i.test(song.style) && read.meter === '4/4' && !/T44/.test(song.music)) settings.timeSignature = '3/4';
    const info = [];
    if (song.composer) info.push(`Compositeur : ${irComposer(song.composer)}`);
    if (song.style) info.push(`Style iReal Pro : ${song.style}`);
    if (info.length) settings.notes = info.map(t => `<div>${irEscape(t)}</div>`).join('');

    if (typeof o.scaleFor === 'function') {
        const put = (h) => { const sc = o.scaleFor(h.chordId, h.rootIndex, settings.key, settings.quality); if (sc) h.scaleId = sc; };
        steps.forEach(st => { put(st); if (st.split) put(st.split); });
    }
    return { name: irTitle(song.title), grid: steps, settings, warnings: irWarnSummary(w) };
}

// Point d'entrée : texte quelconque (page HTML exportée, lien collé) → { playlist, songs: [{ name, grid, settings, warnings }], failed }.
function irealImport(text, opts) {
    const links = irFindLinks(text);
    const out = { playlist: '', songs: [], failed: 0 };
    links.forEach(l => {
        const p = irParseLink(l);
        if (p.playlist && !out.playlist) out.playlist = p.playlist;
        p.songs.forEach(sg => {
            let g = null;
            try { g = irSongToGrid(sg, opts); } catch (e) { g = null; }
            if (g) out.songs.push(g); else out.failed++;
        });
    });
    return out;
}

function irLooksLikeIReal(text) { return typeof text === 'string' && /ireal(b|book):\/\//i.test(text); }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { irFindLinks, irUnscramble, irObfusc50, irMusicText, irParseSongFields, irParseLink, irQuality, irReadChord,
        irReadMeasures, irMeasureToStep, irMergeSteps, irOrchestraFor, irTempoFor, irKeyOf, irTitle, irComposer, irSongToGrid,
        irealImport, irLooksLikeIReal, IR_OBF_PREFIX };
}
