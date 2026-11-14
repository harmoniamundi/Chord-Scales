// grid/grid-format.js — format des grilles sauvegardées et importées (.json) : lecture sécurisée d'un fichier venant
// de l'extérieur. Fonctions pures, sans DOM : tout ce qui n'est pas valide est écarté ou ramené à une valeur sûre.
// Chargé par index.html via <script src="grid/grid-format.js"> (après theory.js) et testé par grid/grid-format.test.js.

// Sous Node, la théorie se charge ; en navigateur ce sont des globaux (theory.js).
const GF_THEORY = (typeof scalesDb !== 'undefined')
    ? { scalesDb, lookupChord, isValidSpell }
    : require('../theory.js');
// Portées éditables des annotations (ui/staff-notes.js) : une portée n'est gardée que si son texte est valide.
const GF_STAFF = (typeof parseStaff !== 'undefined')
    ? { parseStaff, formatStaff, parseStaffPos, formatStaffPos, parseBlockAt, formatBlockAt, parseBlockBorder, parseFrameBox, formatFrameBox }
    : require('../ui/staff-notes.js');
// Blocs d'accords jouables (ui/chord-notes.js) : même principe, le texte « data-chords » est relu et réécrit sous sa forme canonique.
const GF_CHORDS = (typeof chordsCanon !== 'undefined') ? { chordsCanon } : require('../ui/chord-notes.js');
// Cadres de dessin libre (ui/draw-notes.js) : « data-draw » est relu (traits compris) et réécrit sous sa forme canonique.
const GF_DRAW = (typeof drawCanon !== 'undefined') ? { drawCanon } : require('../ui/draw-notes.js');

// Repères de partie proposés par le menu « Partie » ; les lettres A–Z restent acceptées (anciennes grilles, parties auto)
const PART_LABELS = ['in', 'A', 'B', 'C', 'D', 'E', 'F', 'G', "A'", "B'", "C'", "D'", "E'", "F'", "G'", 'out'];
const isPartLabel = (v) => typeof v === 'string' && (PART_LABELS.includes(v) || /^[A-Z]$/.test(v));

// Rythmes imposés par un style (samba, tango…), valables dans un fichier importé.
const IMPORT_GROOVES = ['bossa', 'samba', 'salsa', 'tango', 'piazzolla', 'lyrique', 'afro', 'b-chorale', 'bk-sevdah', 'bk-tsifte', 'f-solea', 'f-bulerias', 'f-tangos',
    'r-roll', 'r-classic', 'r-hard', 'r-punk', 'r-ballad', 'r-blues', 'r-indie', 'c-baroque'];

// Densité de notes par orchestre (curseur « Densité » du pop-up Orchestre, 0 à 1) et valeur par défaut :
// Guitare 60 % (un peu plus fourni que l'écriture d'origine, vers 35 %) ; autres orchestres 50 % = l'écriture d'origine.
const BAND_DENSITY_DEFAULTS = { guitar: 0.6, classic: 0.5, piazzolla: 0.5, balkan: 0.5, cumbia: 0.5, brass: 0.5 };

// Annotations libres (onglet « Annotations » du mode Jam) : une par mesure (jusqu'à 2000 signes de texte) et une pour toute la grille (8000).
// Le texte est mis en forme (gras, taille, couleur…) : il est gardé sous forme de HTML RESTREINT, nettoyé par sanitizeNoteHtml.
const MEASURE_NOTE_MAX = 2000;
const GRID_NOTE_MAX = 8000;
const MEASURE_NOTE_SPAN_MAX = 64;   // une annotation de mesure peut rester affichée sur 64 mesures au plus (`noteSpan` du bloc)
const NOTE_MAX_STAVES = 8; // portées éditables par annotation
const NOTE_MAX_FRAMES = 8; // cadres de texte par annotation (le texte d'un cadre compte dans la limite de l'annotation ; pas de cadre dans un cadre, ni de portée)
const NOTE_MAX_CHORDS = 12; // blocs d'accords jouables par annotation (jusqu'à 16 accords chacun)
const NOTE_MAX_DRAWS = 6;   // cadres de dessin libre par annotation (leurs traits ne comptent pas dans la limite du texte)

// Polices proposées par la barre de mise en forme (nom de la première famille en minuscules → valeur CSS enregistrée).
// Ce sont des polices du système, plus la police « Real Book » (Kalam) fournie avec l'appli : aucune autre n'est acceptée.
// La liste doit rester identique à ANNOT_FONT_CHOICES (ui/annot-bar.js) : un test le vérifie.
const NOTE_FONTS = {
    'system-ui': "system-ui,-apple-system,'Segoe UI',sans-serif",
    arial: 'Arial,Helvetica,sans-serif',
    verdana: 'Verdana,Geneva,sans-serif',
    'trebuchet ms': "'Trebuchet MS',sans-serif",
    'gill sans': "'Gill Sans','Gill Sans MT',Calibri,sans-serif",
    futura: "Futura,'Century Gothic','Trebuchet MS',sans-serif",
    georgia: 'Georgia,serif',
    'times new roman': "'Times New Roman',Times,serif",
    'palatino linotype': "'Palatino Linotype',Palatino,'Book Antiqua',serif",
    baskerville: "Baskerville,'Baskerville Old Face',Georgia,serif",
    'courier new': "'Courier New',Courier,monospace",
    menlo: "Menlo,Monaco,Consolas,'DejaVu Sans Mono',monospace",
    impact: "Impact,'Arial Narrow',sans-serif",
    'marker felt': "'Marker Felt','Segoe Print','Comic Sans MS',cursive",
    'bradley hand': "'Bradley Hand','Segoe Script','Comic Sans MS',cursive",
    'snell roundhand': "'Snell Roundhand','Brush Script MT','Lucida Handwriting',cursive",
    kalam: 'Kalam,cursive'
};

// Éléments acceptés (les autres sont retirés, leur texte est gardé) et ce qu'ils deviennent.
const NOTE_TAGS = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', span: 'span', font: 'span',
    div: 'div', p: 'div', br: 'br', ul: 'ul', ol: 'ol', li: 'li' };
// Tailles écrites en mots (produites par certains navigateurs) et tailles 1 à 7 de l'ancienne balise <font>, en pixels.
const NOTE_FONT_WORDS = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
const NOTE_FONT_SIZES = [10, 13, 16, 18, 24, 32, 48];

function decodeNoteEntities(t) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return t.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (all, dec, hex, name) => {
        if (name) return Object.prototype.hasOwnProperty.call(named, name.toLowerCase()) ? named[name.toLowerCase()] : all;
        const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
        const ok = cp === 9 || cp === 10 || (cp >= 32 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF) && !(cp >= 0x7F && cp <= 0x9F));
        return ok ? String.fromCodePoint(cp) : all;
    });
}

// Couleur CSS : #rgb, #rrggbb ou rgb()/rgba() opaque → « #rrggbb » ; sinon null.
function noteColor(v) {
    v = String(v || '').trim().toLowerCase();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
    if (m) return '#' + (m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]);
    m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(v);
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    if (alpha !== 1) return null;
    const c = [m[1], m[2], m[3]].map(Number);
    if (c.some(n => n > 255)) return null;
    return '#' + c.map(n => n.toString(16).padStart(2, '0')).join('');
}

// Style CSS réduit à ce que propose la barre de mise en forme (couleur, surlignage, taille, gras, italique, souligné, barré, alignement).
function noteStyle(styleText) {
    const got = new Map();
    String(styleText || '').split(';').forEach(decl => {
        const i = decl.indexOf(':');
        if (i < 0) return;
        const prop = decl.slice(0, i).trim().toLowerCase();
        const val = decl.slice(i + 1).trim().toLowerCase();
        if (prop === 'color') { const c = noteColor(val); if (c) got.set('color', c); }
        else if (prop === 'background-color' || prop === 'background') {
            if (val === 'transparent') got.set('background-color', 'transparent');
            else { const c = noteColor(val); if (c) got.set('background-color', c); }
        } else if (prop === 'font-size') {
            let px = null;
            const m = /^(\d{1,3}(?:\.\d+)?)px$/.exec(val);
            if (m) px = Math.round(parseFloat(m[1])); else if (NOTE_FONT_WORDS[val]) px = NOTE_FONT_WORDS[val];
            if (px) got.set('font-size', Math.max(8, Math.min(96, px)) + 'px');
        } else if (prop === 'font-family') {
            const first = val.split(',')[0].trim().replace(/^["']|["']$/g, '').trim();
            if (Object.prototype.hasOwnProperty.call(NOTE_FONTS, first)) got.set('font-family', NOTE_FONTS[first]);
        } else if (prop === 'font-weight') {
            if (/^(bold|bolder|[6-9]00)$/.test(val)) got.set('font-weight', 'bold'); else if (/^(normal|lighter|[1-5]00)$/.test(val)) got.set('font-weight', 'normal');
        } else if (prop === 'font-style') {
            if (val === 'italic' || val === 'oblique') got.set('font-style', 'italic'); else if (val === 'normal') got.set('font-style', 'normal');
        } else if (prop === 'text-decoration' || prop === 'text-decoration-line') {
            const t = val.split(/\s+/);
            const parts = ['underline', 'line-through'].filter(k => t.includes(k));
            if (parts.length) got.set('text-decoration', parts.join(' ')); else if (t.includes('none')) got.set('text-decoration', 'none');
        } else if (prop === 'text-align') {
            if (/^(left|center|right|justify)$/.test(val)) got.set('text-align', val);
        }
    });
    return [...got].map(([k, v]) => `${k}:${v}`).join(';');
}

// Nettoie une annotation mise en forme : on ne garde que les éléments et styles ci-dessus, tout le texte est échappé
// (rien de ce qui vient d'un fichier importé ne peut exécuter de code). Le texte est limité à maxText signes.
// Renvoie '' si l'annotation ne contient aucun texte visible. Un texte simple (anciennes annotations) reste tel quel.
function sanitizeNoteHtml(raw, maxText = MEASURE_NOTE_MAX) {
    if (typeof raw !== 'string' || !raw) return '';
    const src = raw.replace(/\r\n?/g, '\n').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let out = '', pos = 0, left = maxText, count = 0, hasText = false, m, skip = 0, staves = 0, frames = 0, chordBlocks = 0, drawBlocks = 0;
    const stack = [];
    const addText = (chunk) => {
        if (!chunk || left <= 0) return;
        let t = decodeNoteEntities(chunk);
        if (t.length > left) t = t.slice(0, left);
        left -= t.length;
        if (/[^\s ]/.test(t)) hasText = true;
        out += t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    // Place d'un bloc : « data-at » (place sur le canevas de la zone) ou, pour une annotation écrite avant les canevas, l'ancien décalage « data-pos »
    // (relatif à la place dans le texte : le navigateur s'en sert une fois pour reconstruire la mise en page, voir index.html, _annotMigrate) ;
    // « data-border="0" » = cadre caché.
    const blockPlace = (a) => {
        const at = GF_STAFF.formatBlockAt(GF_STAFF.parseBlockAt(a['data-at'] || ''));
        const pos = at ? '' : GF_STAFF.formatStaffPos(GF_STAFF.parseStaffPos(a['data-pos'] || ''));
        const hidden = a['data-border'] !== undefined && !GF_STAFF.parseBlockBorder(a['data-border']);
        return (at ? ` data-at="${at}"` : (pos ? ` data-pos="${pos}"` : '')) + (hidden ? ' data-border="0"' : '');
    };
    const readAttrs = (raw) => {
        const attrs = {};
        raw.replace(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g, (all, k, a, b, c) => { attrs[k.toLowerCase()] = decodeNoteEntities(a !== undefined ? a : (b !== undefined ? b : c)); return all; });
        return attrs;
    };
    while ((m = re.exec(src))) {
        if (!skip) addText(src.slice(pos, m.index));
        pos = re.lastIndex;
        const closing = m[1] === '/';
        const name = m[2].toLowerCase();
        // Contenu d'une portée (dessin, boutons…) : jeté, la portée est reconstruite à partir de son seul texte « data-staff ».
        if (skip) { if (name === 'div') skip += closing ? -1 : 1; continue; }
        if (!closing && name === 'div' && /\bdata-staff\s*=/i.test(m[3])) {
            skip = 1;
            const sa = readAttrs(m[3]);
            const text = GF_STAFF.parseStaff(sa['data-staff'] || '');
            if (text && staves < NOTE_MAX_STAVES && count < 400 && !stack.some(e => e.kind === 'frame')) {
                out += `<div class="annot-staff" data-staff="${GF_STAFF.formatStaff(text)}"${blockPlace(sa)}></div>`;
                staves++; count++; hasText = true;
            }
            continue;
        }
        // Cadre de dessin : reconstruit à partir de son seul texte « data-draw » (taille et traits).
        if (!closing && name === 'div' && /\bdata-draw\s*=/i.test(m[3])) {
            skip = 1;
            const da = readAttrs(m[3]);
            const text = GF_DRAW.drawCanon(da['data-draw'] || '');
            if (text && drawBlocks < NOTE_MAX_DRAWS && count < 400 && !stack.some(e => e.kind === 'frame')) {
                out += `<div class="annot-draw" data-draw="${text}"${blockPlace(da)}></div>`;
                drawBlocks++; count++; hasText = true;
            }
            continue;
        }
        // Bloc d'accords : reconstruit à partir de son seul texte « data-chords » (accords, durées, lecture).
        if (!closing && name === 'div' && /\bdata-chords\s*=/i.test(m[3])) {
            skip = 1;
            const ca = readAttrs(m[3]);
            const text = GF_CHORDS.chordsCanon(ca['data-chords'] || '');
            if (text && chordBlocks < NOTE_MAX_CHORDS && count < 400 && !stack.some(e => e.kind === 'frame')) {
                out += `<div class="annot-chords" data-chords="${text}"${blockPlace(ca)}></div>`;
                chordBlocks++; count++; hasText = true;
            }
            continue;
        }
        // Cadre de texte : un <div data-frame="…"> dont le contenu (texte mis en forme) est nettoyé comme le reste. Un cadre invalide, ou placé
        // dans un autre cadre, devient un simple bloc de texte.
        if (!closing && name === 'div' && /\bdata-frame\s*=/i.test(m[3]) && frames < NOTE_MAX_FRAMES && count < 400 && stack.length < 16 && !stack.some(e => e.kind === 'frame')) {
            const fa = readAttrs(m[3]);
            const box = GF_STAFF.parseFrameBox(fa['data-frame'] || '');
            if (box) {
                out += `<div class="annot-frame" data-frame="${GF_STAFF.formatFrameBox(box)}"${blockPlace(fa)}>`;
                stack.push({ kind: 'frame', emitted: true });
                frames++; count++; hasText = true;
                continue;
            }
        }
        const kind = NOTE_TAGS[name];
        if (!kind) continue;
        if (kind === 'br') { if (!closing && count < 400) { out += '<br>'; count++; } continue; }
        if (closing) {
            let k = stack.length - 1;
            while (k >= 0 && stack[k].kind !== kind && !(kind === 'div' && stack[k].kind === 'frame')) k--; // un </div> ferme aussi un cadre
            if (k < 0) continue;
            while (stack.length > k) { const e = stack.pop(); if (e.emitted) out += `</${e.kind === 'frame' ? 'div' : e.kind}>`; }
            continue;
        }
        let style = '';
        if (kind !== 'b' && kind !== 'i' && kind !== 'u' && kind !== 's') {
            const attrs = readAttrs(m[3]);
            let css = attrs.style || '';
            if (name === 'font') {
                if (attrs.color) css += `;color:${attrs.color}`;
                if (attrs.face) css += `;font-family:${String(attrs.face).replace(/;/g, '')}`;
                const sz = parseInt(attrs.size, 10);
                if (sz >= 1 && sz <= 7) css += `;font-size:${NOTE_FONT_SIZES[sz - 1]}px`;
            }
            style = noteStyle(css);
        }
        const emit = count < 400 && stack.length < 16 && (kind !== 'span' || !!style);
        if (emit) { out += `<${kind}${style ? ` style="${style}"` : ''}>`; count++; }
        stack.push({ kind, emitted: emit });
    }
    if (!skip) addText(src.slice(pos));
    while (stack.length) { const e = stack.pop(); if (e.emitted) out += `</${e.kind === 'frame' ? 'div' : e.kind}>`; }
    if (!hasText) return '';
    // éléments vides, retours à la ligne et espaces de fin (le navigateur en laisse toujours un en fin de champ)
    let prev;
    do {
        prev = out;
        out = out.replace(/<(span|b|i|u|s|div|li)(?: style="[^"]*")?><\/\1>/g, '')
            .replace(/<div(?: style="[^"]*")?>(?:<br>|\s| )*<\/div>$/, '')
            .replace(/(?:<br>|\s| )+$/, '');
    } while (out !== prev);
    return out;
}

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
        if (typeof item.note === 'string') { const nt = sanitizeNoteHtml(item.note, MEASURE_NOTE_MAX); if (nt) step.note = nt; }
        // Durée de l'annotation en mesures (à partir de celle du bloc) : seulement avec un texte, et seulement si elle dépasse le bloc.
        const nspan = Number(item.noteSpan);
        if (step.note && Number.isInteger(nspan) && nspan > measures && nspan <= MEASURE_NOTE_SPAN_MAX) step.noteSpan = nspan;
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

// Lit les paramètres de jam d'un fichier importé (tonalité, qualité, chiffrage des degrés, bpm, orchestration).
// Seuls les champs valides sont conservés ; les autres sont ignorés.
function sanitizeImportedSettings(data) {
    const out = {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
    const key = Number(data.key);
    if (Number.isInteger(key) && key >= 0 && key <= 11) out.key = key;
    const qualities = ['ionian', 'aeolian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
    if (typeof data.quality === 'string' && qualities.includes(data.quality)) out.quality = data.quality;
    if (GF_THEORY.isValidSpell(data.spell)) out.spell = data.spell;
    if (data.fnConvention === 'jazz' || data.fnConvention === 'classic') out.fnConvention = data.fnConvention; // chiffrage des degrés choisi à la main ; absent = classique (défaut)
    if (typeof data.notes === 'string') { const nt = sanitizeNoteHtml(data.notes, GRID_NOTE_MAX); if (nt) out.notes = nt; } // annotation générale de la grille
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
        if (['swing', 'pop', 'latin', 'cuba', 'classic', 'guitar', 'brass', 'balkan', 'cumbia', 'piazzolla'].includes(o.style)) orch.style = o.style;
        // anciens fichiers : le mode « Arpèges » est devenu le style « Classique »
        if (o.mode === 'arpeges') orch.style = 'classic';
        if (IMPORT_GROOVES.includes(o.groove)) orch.groove = o.groove; // rythme imposé par le style
        // anciens fichiers : Brasil + rythme « afro » désignait en fait le son Cuba
        if (orch.style === 'latin' && orch.groove === 'afro') orch.style = 'cuba';
        if (o.volumes && typeof o.volumes === 'object') {
            orch.volumes = {};
            ['piano', 'bass', 'drums', 'bandoneon', 'violin', 'guitar', 'rguitar', 'organ', 'strings'].forEach(k => {
                const v = Number(o.volumes[k]);
                if (o.volumes[k] !== null && o.volumes[k] !== undefined && Number.isFinite(v)) orch.volumes[k] = Math.max(0, Math.min(1, v));
            });
        }
        const rev = Number(o.reverb);
        if (o.reverb !== null && o.reverb !== undefined && Number.isFinite(rev)) orch.reverb = Math.max(0, Math.min(1, rev));
        // densités par orchestre ; les anciens fichiers n'avaient que « guitarDensity »
        const dens = {};
        const src = (o.densities && typeof o.densities === 'object') ? o.densities : {};
        Object.keys(BAND_DENSITY_DEFAULTS).forEach(k => {
            const raw = (src[k] !== undefined) ? src[k] : (k === 'guitar' ? o.guitarDensity : undefined);
            const v = Number(raw);
            if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(v)) dens[k] = Math.max(0, Math.min(1, v));
        });
        if (Object.keys(dens).length) orch.densities = dens; // absent = valeurs par défaut
        const sw = Number(o.swing);
        if (o.swing !== null && o.swing !== undefined && o.swing !== '' && Number.isFinite(sw)) orch.swing = Math.max(0.5, Math.min(0.75, sw)); // absent = « Auto »
        out.orchestration = orch;
    }
    return out;
}

// ===== Export : que mettre dans le fichier .json ? =====
// Toujours exportés : les accords (fondamentale, qualité, basse, durée, accord partagé dans une mesure), les signes de reprise et la
// signature rythmique (sans elle, l'import remet la grille en 4/4). Le reste se choisit, case par case (mode « Personnalisée »).
const EXPORT_OPTIONS = [
    { key: 'analysis', label: 'Analyse fonctionnelle', hint: 'degrés, modulations et personnalisations de l\'analyse' },
    { key: 'notes', label: 'Annotations', hint: 'celles des mesures et celle de la grille, portées comprises' },
    { key: 'parts', label: 'Parties', hint: 'repères in, A, B… out' },
    { key: 'scales', label: 'Gammes', hint: 'la gamme choisie pour chaque accord' },
    { key: 'key', label: 'Tonalité et mode', hint: 'avec l\'orthographe ♯ / ♭' },
    { key: 'tempo', label: 'Tempo', hint: 'les battements par minute' },
    { key: 'orchestra', label: 'Orchestre', hint: 'style, rythme, swing et densités' },
    { key: 'mix', label: 'Volumes et réverbération', hint: 'le mixage de l\'orchestre' }
];
const EXPORT_MODES = ['full', 'grid', 'custom']; // complète (tout) · grille seule · personnalisée

// Cases cochées d'un mode : complète = tout, grille seule = rien ; en « personnalisée », on part de ce que l'utilisateur a coché.
function exportOptionsFor(mode, custom) {
    const on = (v) => EXPORT_OPTIONS.reduce((o, d) => { o[d.key] = v; return o; }, {});
    if (mode === 'grid') return on(false);
    if (mode !== 'custom') return on(true);
    const src = (custom && typeof custom === 'object') ? custom : {};
    const out = on(false);
    EXPORT_OPTIONS.forEach(d => { out[d.key] = src[d.key] === true; });
    return exportOptionsNormalized(out);
}

// L'analyse fonctionnelle se lit par rapport à la tonalité : elle l'emporte avec elle.
function exportOptionsNormalized(opts) {
    const out = {};
    EXPORT_OPTIONS.forEach(d => { out[d.key] = !!(opts && opts[d.key]); });
    if (out.analysis) out.key = true;
    return out;
}

// Grille à exporter : copie des blocs, sans ce qui n'est pas demandé (fnLabel / modKey / harmonicFunction, note, partStart / section / phrase, scaleId).
function filterGridForExport(grid, opts) {
    const o = exportOptionsNormalized(opts);
    const strip = (b, isSplit) => {
        const c = JSON.parse(JSON.stringify(b));
        if (!o.analysis) { delete c.fnLabel; delete c.modKey; delete c.harmonicFunction; }
        if (!o.notes) { delete c.note; delete c.noteSpan; }
        if (!o.parts) { delete c.partStart; delete c.section; delete c.phrase; }
        if (!o.scales) delete c.scaleId;
        if (!isSplit && c.split && typeof c.split === 'object') c.split = strip(c.split, true);
        return c;
    };
    return (Array.isArray(grid) ? grid : []).map(b => strip(b, false));
}

// Réglages à exporter : la signature rythmique y est toujours ; le reste selon les cases.
function filterSettingsForExport(settings, opts) {
    const o = exportOptionsNormalized(opts);
    const s = (settings && typeof settings === 'object') ? settings : {};
    const out = {};
    if (s.timeSignature !== undefined) out.timeSignature = s.timeSignature;
    if (o.key) ['key', 'quality', 'spell'].forEach(k => { if (s[k] !== undefined) out[k] = s[k]; });
    if (o.analysis && s.fnConvention !== undefined) out.fnConvention = s.fnConvention;
    if (o.notes && s.notes !== undefined) out.notes = s.notes;
    if (o.tempo && s.bpm !== undefined) out.bpm = s.bpm;
    const so = s.orchestration;
    if (so && typeof so === 'object' && (o.orchestra || o.mix)) {
        const orch = {};
        if (o.orchestra) ['mode', 'style', 'densities', 'swing', 'groove'].forEach(k => { if (so[k] !== undefined) orch[k] = so[k]; });
        if (o.mix) ['volumes', 'reverb'].forEach(k => { if (so[k] !== undefined) orch[k] = so[k]; });
        out.orchestration = orch;
    }
    return out;
}

// Phrase qui résume le contenu du fichier (affichée dans le pop-up).
function describeExport(opts) {
    const o = exportOptionsNormalized(opts);
    const base = 'accords, durées, reprises et signature rythmique';
    const extra = EXPORT_OPTIONS.filter(d => o[d.key]).map(d => d.label.toLowerCase());
    return extra.length ? `Le fichier contiendra : ${base}, plus ${extra.join(', ')}.` : `Le fichier contiendra la grille seule : ${base}.`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MEASURE_NOTE_MAX, MEASURE_NOTE_SPAN_MAX, GRID_NOTE_MAX, NOTE_FONTS, NOTE_MAX_STAVES, NOTE_MAX_FRAMES, NOTE_MAX_CHORDS, NOTE_MAX_DRAWS, sanitizeNoteHtml, BAND_DENSITY_DEFAULTS, PART_LABELS, isPartLabel, IMPORT_GROOVES, parseMeter, unpackSavedEntry, sanitizeImportedGrid, sanitizeImportedSettings,
        EXPORT_OPTIONS, EXPORT_MODES, exportOptionsFor, exportOptionsNormalized, filterGridForExport, filterSettingsForExport, describeExport };
}
