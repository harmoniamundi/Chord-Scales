// ui/staff-notes.js — portées éditables des annotations (motifs, riffs, licks…), sans DOM ni VexFlow :
// format texte d'une portée (celui qui est enregistré dans l'annotation et dans les fichiers .json), lecture stricte
// d'un texte venu de l'extérieur, durées, découpage en mesures (levée, tuplets), ligatures, hauteurs (altérations de l'armure,
// MIDI, nom de note) et plan de lecture (tempo, swing). Le dessin et les clics sont dans ui/staff-editor.js ; le nettoyage des
// annotations (grid/grid-format.js) s'appuie sur parseStaff / formatStaff pour ne laisser passer que des portées valides.
// Chargé par index.html via <script src="ui/staff-notes.js"> (avant grid/grid-format.js) et testé par ui/staff-notes.test.js.
//
// Format : « clé,métrique,armure[,taille][,puN][,bpmN][,swN];événement événement… »
//   Exemple : « t,4/4,0;q:c4 (3 8:e4 8:g4 8:b4) qr h.:a4 »
//   clé : t (sol) ou b (fa) ; métrique : 4/4, 6/8… ; armure : nombre d'altérations, de -7 (bémols) à 7 (dièses)
//   réglages facultatifs (écrits seulement quand ils diffèrent de la valeur par défaut, dans cet ordre) :
//     taille (50 à 200, par pas de 10) ; puN = levée : la portée commence par une mesure incomplète de N événements ;
//     bpmN = tempo de lecture (30 à 300 ; absent = tempo de la jam) ; swN = swing (50 à 75 % ; absent = « Jam » : le swing de la jam chargée, sw50 = croches droites)
//   événement : durée (w ronde, h blanche, q noire, 8 croche, 16 double-croche), « . » point,
//               puis « :hauteur » (lettre c-b, altération # ## b bb, octave 1-7) ou « r » pour un silence.
//               Un « ~ » collé à la hauteur (« q:c4~ ») est une liaison de prolongation : la note se prolonge dans la note suivante, de même hauteur.
//   tuplet : « (N » ouvre un groupe de N dans le temps de M (triolet « (3 », quintolet « (5 »…) et « ) » le ferme ; les notes du groupe
//            s'écrivent avec leur valeur écrite (trois croches pour un triolet de croches).
//   ancien format : un « t » après la durée (« 8t:c4 ») marquait un triolet ; il se lit encore (groupes de trois) et se réécrit avec des parenthèses.

const SN_UNITS = { w: 96, h: 48, q: 24, '8': 12, '16': 6 }; // durées en 96es de ronde (une noire = 24)
const SN_DURATIONS = ['w', 'h', 'q', '8', '16'];
const SN_METERS = ['2/4', '3/4', '4/4', '5/4', '6/4', '2/2', '3/8', '6/8', '7/8', '9/8', '12/8'];
const SN_MAX_EVENTS = 96;
const SN_MAX_LENGTH = 1500;
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

// Événement : « 8:c4 », « q.:eb3 », « hr » (silence). Le « t » après la durée est l'ancienne écriture du triolet (lue, jamais écrite).
const SN_EVENT_RE = /^(w|h|q|8|16)(\.)?(t)?(?::([a-g])(##|#|bb|b)?([1-7])(~)?|(r))$/;
const SN_ALTER = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };
const SN_ALTER_TEXT = { 0: '', 1: '#', 2: '##', '-1': 'b', '-2': 'bb' };
const SN_EPS = 1e-6; // tolérance des comparaisons de durées (les tuplets donnent des durées non entières : 4,8 pour une double-croche de quintolet)

// Taille d'affichage de la portée, en % (100 = normale). Écrite dans le texte seulement si elle diffère de 100.
const SN_SIZE_MIN = 50, SN_SIZE_MAX = 200, SN_SIZE_STEP = 10, SN_SIZE_DEFAULT = 100;
function clampStaffSize(v) {
    const n = Math.round(Number(v) / SN_SIZE_STEP) * SN_SIZE_STEP;
    return Number.isFinite(n) ? Math.max(SN_SIZE_MIN, Math.min(SN_SIZE_MAX, n)) : SN_SIZE_DEFAULT;
}

// Tempo de lecture propre à la portée (0 = celui de la jam) et swing (50 % = croches droites, 67 % = triolet, 75 % = très pointé).
// Le swing vaut 0 par défaut (« Jam ») : la portée suit alors le swing de la jam chargée ; un réglage explicite (50 à 75 %) le remplace.
const SN_BPM_MIN = 30, SN_BPM_MAX = 300;
const SN_SWING_MIN = 50, SN_SWING_MAX = 75, SN_SWING_AUTO = 0, SN_SWING_DEFAULT = SN_SWING_AUTO;
function clampStaffBpm(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.max(SN_BPM_MIN, Math.min(SN_BPM_MAX, n)) : 0;
}
// Swing borné à 50-75 % ; toute valeur absente ou invalide (0, « auto »…) donne 0 = suivre le swing de la jam.
function clampStaffSwing(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.max(SN_SWING_MIN, Math.min(SN_SWING_MAX, n)) : SN_SWING_AUTO;
}
// Rapport de swing joué (0,5 = croches droites… 0,75) : celui de la portée, sinon celui de la jam (jamSwing, 0,5 à 0,75 ; absent = droit).
function staffSwingRatio(st, jamSwing) {
    const own = clampStaffSwing(st && st.swing);
    if (own) return own / 100;
    return typeof jamSwing === 'number' && Number.isFinite(jamSwing) ? Math.max(0.5, Math.min(0.75, jamSwing)) : 0.5;
}
// Tempo effectif de la lecture : celui de la portée, sinon celui de la jam, sinon 100.
function staffTempo(st, jamBpm) { return clampStaffBpm(st && st.bpm) || clampStaffBpm(jamBpm) || 100; }

// Instrument transpositeur propre à la portée : 'C' (en Ut), 'Bb', 'Eb' ; '' = celui de la jam (portées écrites avant ce réglage).
const SN_INSTRUMENTS = ['C', 'Bb', 'Eb'];
function clampStaffInstr(v) { return SN_INSTRUMENTS.includes(v) ? v : ''; }

// ----- Tuplets -----
// Un tuplet « N dans le temps de M » : N notes écrites avec une valeur donnée tiennent dans la durée de M notes de cette valeur
// (triolet : 3 croches dans le temps de 2 ; quintolet : 5 doubles-croches dans le temps de 4…). Chaque note du groupe est un vrai événement,
// de valeur écrite habituelle ; sa durée réelle est la valeur écrite × M / N.
const SN_TUPLET_M = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 9: 8 };
const SN_TUPLETS = [2, 3, 4, 5, 6, 7, 9];
const SN_TUPLET_NAMES = { 2: 'Duolet', 3: 'Triolet', 4: 'Quartolet', 5: 'Quintolet', 6: 'Sextolet', 7: 'Septolet', 9: 'Nonolet' };

function staffDefault() { return { clef: 't', meter: '4/4', ks: 0, size: SN_SIZE_DEFAULT, pu: 0, bpm: 0, swing: SN_SWING_DEFAULT, instr: '', ev: [] }; }

// Un événement du groupe ouvre-t-il un tuplet (premier du groupe) ? Le groupe continue tant que le suivant a le même N sans marque de début.
function staffTupletStarts(ev, i) { return !!ev[i].tu && (!!ev[i].gs || i === 0 || ev[i - 1].tu !== ev[i].tu); }

// Groupe qui commence à l'événement i (ou, si i est au milieu d'un groupe, le groupe qui le contient) : { start, end (exclu), n } ; n = 0 hors tuplet.
function staffTupletBounds(ev, i) {
    if (!ev[i] || !ev[i].tu) return { start: i, end: i + 1, n: 0 };
    let start = i;
    while (start > 0 && !staffTupletStarts(ev, start)) start--;
    let end = start + 1;
    while (end < ev.length && ev[end].tu === ev[start].tu && !ev[end].gs) end++;
    return { start, end, n: ev[start].tu };
}

// Levée valide : jamais au milieu d'un tuplet, jamais plus longue que la portée. Renvoie le nombre d'événements de la levée (0 = pas de levée).
function staffPickupCount(st) {
    let k = Math.round(Number(st.pu) || 0);
    if (k <= 0) return 0;
    if (k > st.ev.length) k = st.ev.length;
    if (k < st.ev.length && st.ev[k].tu && !staffTupletStarts(st.ev, k)) return 0;
    return k;
}

// ----- Liaisons de prolongation -----
// Un événement marqué `tie` est lié au suivant : les deux notes n'en font qu'une seule, de leur durée cumulée. Une liaison n'a de sens que
// entre deux notes de même hauteur écrite (même lettre, altération et octave) : sinon elle est ignorée (ni dessinée, ni écrite, ni jouée).
function staffSamePitch(a, b) { return !!a && !!b && a.l === b.l && a.o === b.o && a.a === b.a; }
function staffTieValid(ev, i) {
    const e = ev[i], n = ev[i + 1];
    return !!(e && e.tie && n && e.p && n.p && staffSamePitch(e.p, n.p));
}
// Chaîne de notes liées qui contient l'événement i : { start, end (exclu) }. Ses notes changent de hauteur ensemble.
function staffTieChain(ev, i) {
    if (!ev[i]) return { start: i, end: i + 1 };
    let start = i, end = i + 1;
    while (start > 0 && staffTieValid(ev, start - 1)) start--;
    while (end < ev.length && staffTieValid(ev, end - 1)) end++;
    return { start, end };
}
// Ensemble des indices `indices` complété par toutes les notes liées à celles-ci.
function staffExpandTies(ev, indices) {
    const out = new Set();
    indices.forEach((i) => { if (!ev[i]) return; const c = staffTieChain(ev, i); for (let k = c.start; k < c.end; k++) out.add(k); });
    return out;
}

// Lit un texte de portée ; renvoie la portée ({ clef, meter, ks, size, pu, bpm, swing, ev: [{ d, dot, tu, gs, p: {l, o, a} | null }] })
// ou null si le texte est invalide. tu = N d'un tuplet (0 hors tuplet), gs = premier événement d'un groupe, tie = lié à l'événement suivant.
function parseStaff(text) {
    if (typeof text !== 'string' || text.length > SN_MAX_LENGTH) return null;
    const semi = text.indexOf(';');
    const head = (semi < 0 ? text : text.slice(0, semi)).split(',');
    if (head.length < 3 || head.length > 8) return null;
    const clef = head[0];
    if (clef !== 't' && clef !== 'b') return null;
    if (!SN_METERS.includes(head[1])) return null;
    if (!/^-?[0-7]$/.test(head[2])) return null;
    const ks = parseInt(head[2], 10);
    let size = SN_SIZE_DEFAULT, pu = 0, bpm = 0, swing = SN_SWING_DEFAULT, instr = '';
    const seen = {};
    for (const part of head.slice(3)) {
        let m;
        if (/^\d{2,3}$/.test(part)) {
            if (seen.size) return null;
            seen.size = true;
            size = parseInt(part, 10);
            if (size < SN_SIZE_MIN || size > SN_SIZE_MAX || size % SN_SIZE_STEP !== 0) return null;
        } else if ((m = /^pu(\d{1,2})$/.exec(part))) {
            if (seen.pu) return null;
            seen.pu = true;
            pu = parseInt(m[1], 10);
            if (pu < 1) return null;
        } else if ((m = /^bpm(\d{2,3})$/.exec(part))) {
            if (seen.bpm) return null;
            seen.bpm = true;
            bpm = parseInt(m[1], 10);
            if (bpm < SN_BPM_MIN || bpm > SN_BPM_MAX) return null;
        } else if ((m = /^sw(\d{2})$/.exec(part))) {
            if (seen.sw) return null;
            seen.sw = true;
            swing = parseInt(m[1], 10);
            if (swing < SN_SWING_MIN || swing > SN_SWING_MAX) return null;
        } else if ((m = /^in(C|Bb|Eb)$/.exec(part))) {
            if (seen.instr) return null;
            seen.instr = true;
            instr = m[1];
        } else return null;
    }
    const body = semi < 0 ? '' : text.slice(semi + 1).trim();
    const tokens = body === '' ? [] : body.split(/\s+/);
    const ev = [];
    let open = 0, inGroup = 0;
    for (let tk of tokens) {
        let m = /^\((\d)$/.exec(tk);
        if (m) {
            if (open || !SN_TUPLET_M[m[1]]) return null;
            open = parseInt(m[1], 10);
            inGroup = 0;
            continue;
        }
        const closes = tk.length > 1 && tk.endsWith(')'); // « 8:b4) » : la parenthèse fermante est collée à la dernière note du groupe
        if (closes) tk = tk.slice(0, -1);
        if (tk === ')') {
            if (!open || !inGroup) return null;
            open = 0;
            continue;
        }
        if (ev.length >= SN_MAX_EVENTS) return null;
        m = SN_EVENT_RE.exec(tk);
        if (!m) return null;
        const legacy = !!m[3];
        if (legacy && open) return null;
        if (closes && !open) return null;
        const e = { d: m[1], dot: !!m[2], tu: open || (legacy ? 3 : 0), gs: false, tie: !!m[7], p: m[8] ? null : { l: m[4], o: parseInt(m[6], 10), a: SN_ALTER[m[5] || ''] } };
        if (open) { e.gs = inGroup === 0; inGroup++; } else if (legacy) e.legacy = true;
        ev.push(e);
        if (closes) open = 0;
    }
    if (open) return null;
    // Ancien format : les événements « t » consécutifs se groupent par trois (le dernier groupe peut être incomplet)
    let run = 0;
    ev.forEach((e) => {
        if (e.legacy) { e.gs = run % 3 === 0; run++; delete e.legacy; } else run = 0;
    });
    if (pu > ev.length) return null;
    if (pu > 0 && pu < ev.length && ev[pu].tu && !staffTupletStarts(ev, pu)) return null;
    return { clef, meter: head[1], ks, size, pu, bpm, swing, instr, ev };
}

// Texte canonique d'une portée (l'inverse de parseStaff pour tout texte valide).
function formatStaff(st) {
    const toks = [];
    let open = false;
    const close = () => { if (open) { toks[toks.length - 1] += ')'; open = false; } };
    st.ev.forEach((e, i) => {
        if (open && (!e.tu || staffTupletStarts(st.ev, i))) close();
        if (e.tu && staffTupletStarts(st.ev, i)) { toks.push(`(${e.tu}`); open = true; }
        toks.push(`${e.d}${e.dot ? '.' : ''}${e.p ? `:${e.p.l}${SN_ALTER_TEXT[e.p.a]}${e.p.o}${staffTieValid(st.ev, i) ? '~' : ''}` : 'r'}`);
    });
    close();
    const size = st.size && st.size !== SN_SIZE_DEFAULT ? `,${clampStaffSize(st.size)}` : '';
    const pk = staffPickupCount(st);
    const pu = pk > 0 ? `,pu${pk}` : '';
    const bpm = clampStaffBpm(st.bpm) ? `,bpm${clampStaffBpm(st.bpm)}` : '';
    const sw = clampStaffSwing(st.swing) ? `,sw${clampStaffSwing(st.swing)}` : '';
    const instr = clampStaffInstr(st.instr) ? `,in${clampStaffInstr(st.instr)}` : '';
    return `${st.clef},${st.meter},${st.ks}${size}${pu}${bpm}${sw}${instr};${toks.join(' ')}`;
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

// ----- Place d'un bloc sur le canevas de la zone -----
// Depuis que la zone d'annotation est un canevas (ui/annot-canvas.js), chaque bloc (portée ou cadre de texte) a sa PROPRE place, indépendante de celle
// des autres : « x,y » en pixels depuis le coin haut gauche de la zone (attribut data-at). Deux blocs peuvent se recouvrir.
// L'ancien décalage relatif à la place dans le texte (data-pos, ci-dessus) n'est plus lu que pour reconstruire les annotations écrites avant ce changement.

const SN_AT_MAX = 3000;

function clampBlockAt(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(SN_AT_MAX, n)) : 0;
}

// Lit une place « x,y » (entiers positifs) ; renvoie { x, y } ou null si le texte n'est pas valide.
function parseBlockAt(text) {
    const m = /^(\d{1,4}),(\d{1,4})$/.exec(typeof text === 'string' ? text.trim() : '');
    return m ? { x: clampBlockAt(m[1]), y: clampBlockAt(m[2]) } : null;
}

// Texte d'une place (« 0,0 » compris : contrairement au décalage, la place est toujours écrite), ou '' si elle est absente.
function formatBlockAt(pos) {
    if (!pos || pos.x === undefined || pos.y === undefined) return '';
    return `${clampBlockAt(pos.x)},${clampBlockAt(pos.y)}`;
}

// Cadre visible ou non : seul « 0 » (cadre caché) est écrit, l'absence de l'attribut data-border veut dire « visible ».
function parseBlockBorder(text) { return String(text === undefined || text === null ? '' : text).trim() !== '0'; }

// ----- Cadres de texte (ui/text-frame.js) -----
// Un cadre est un bloc glissé dans le texte d'une annotation, comme une portée, mais où l'on écrit du texte mis en forme.
// Il est enregistré sous la forme <div class="annot-frame" data-frame="L,E" data-at="x,y" data-border="0">texte…</div> :
//   L = largeur de mise en page du texte (pixels, avant agrandissement) ; E = échelle d'affichage en % (100 si absente) ;
//   data-at = place sur le canevas de la zone, comme pour une portée (voir ci-dessus) ; data-border="0" = cadre caché (le texte seul reste visible).
// Tirer sur les bords ou les coins du cadre change E : le cadre ET ce qu'il contient grandissent ou rétrécissent ensemble.
// Format partagé par le script du cadre (affichage) et par grid-format.js (nettoyage des annotations, fichiers importés).

const SN_FRAME_W_MIN = 80;
const SN_FRAME_W_MAX = 1200;
const SN_FRAME_W_DEFAULT = 260;
const SN_FRAME_SCALE_MIN = 25;
const SN_FRAME_SCALE_MAX = 400;
const SN_FRAME_SCALE_DEFAULT = 100;

function clampFrameWidth(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(SN_FRAME_W_MIN, Math.min(SN_FRAME_W_MAX, n)) : SN_FRAME_W_DEFAULT;
}

function clampFrameScale(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(SN_FRAME_SCALE_MIN, Math.min(SN_FRAME_SCALE_MAX, n)) : SN_FRAME_SCALE_DEFAULT;
}

// Lit « L » ou « L,E » (largeur fixe) ou « a » ou « a,E » (largeur automatique : le cadre épouse son texte, qui ne passe à la ligne que sur Entrée) ;
// renvoie { w, s } ou { w, s, auto: true } (valeurs ramenées dans les bornes) ou null si le texte n'est pas valide.
function parseFrameBox(text) {
    const m = /^(a|\d{1,4})(?:,(\d{1,3}))?$/.exec(typeof text === 'string' ? text.trim() : '');
    if (!m) return null;
    const s = m[2] === undefined ? SN_FRAME_SCALE_DEFAULT : clampFrameScale(m[2]);
    return m[1] === 'a' ? { w: SN_FRAME_W_DEFAULT, s, auto: true } : { w: clampFrameWidth(m[1]), s };
}

// Texte canonique : « L » quand l'échelle est de 100 %, « L,E » sinon ; « a » ou « a,E » pour un cadre à largeur automatique.
function formatFrameBox(box) {
    const b = box || {};
    const w = b.auto ? 'a' : String(clampFrameWidth(b.w === undefined ? SN_FRAME_W_DEFAULT : b.w));
    const s = clampFrameScale(b.s === undefined ? SN_FRAME_SCALE_DEFAULT : b.s);
    return s === SN_FRAME_SCALE_DEFAULT ? w : `${w},${s}`;
}

// ----- Copier-coller d'une portée (texte brut, pour passer d'une zone d'annotation à l'autre ou d'une fenêtre à l'autre) -----
// Une portée copiée s'écrit « [portée:t,4/4,0;q:c4 8:e4] » ; dans un texte collé, chaque repère de ce genre redevient une portée.

// Après le nom du bloc : sa place facultative « @x,y » (copie de plusieurs blocs : leurs places relatives sont gardées) et « ! » si son cadre est caché.
const SN_CLIP_RE = /\[portée(?:@(\d{1,4}),(\d{1,4}))?(!)?:([^\]\n]{1,1500})\]|\[cadre(?:@(\d{1,4}),(\d{1,4}))?(!)?:((?:a|\d{1,4})(?:,\d{1,3})?);([^\]\n]{0,30000})\]/g;

// meta (facultatif) : { at: { x, y }, border: false } → place du bloc et cadre caché.
function clipMeta(meta) {
    if (!meta) return '';
    const at = meta.at ? formatBlockAt(meta.at) : '';
    return (at ? `@${at}` : '') + (meta.border === false ? '!' : '');
}

function staffClipText(st, meta) { return `[portée${clipMeta(meta)}:${formatStaff(st)}]`; }

// Un cadre de texte copié s'écrit « [cadre:260,150;<texte mis en forme, encodé>] » : largeur / échelle, puis son HTML passé par encodeURIComponent
// (aucun « ] » ni retour à la ligne). Le HTML doit encore être nettoyé par celui qui le colle (sanitizeNoteHtml, grid/grid-format.js).
function frameClipText(box, html, meta) {
    return `[cadre${clipMeta(meta)}:${formatFrameBox(box)};${encodeURIComponent(String(html || ''))}]`;
}

// Découpe un texte collé en morceaux [{ text }] (texte ordinaire), [{ staff }] (texte d'une portée valide, sous sa forme canonique)
// et [{ frame: { box, html } }] (cadre de texte : largeur / échelle canoniques et HTML décodé, à nettoyer). Un bloc copié avec sa place
// et son cadre porte aussi `at` ({ x, y }) et `noBorder` (true si son cadre est caché). Un repère invalide reste du texte ordinaire.
function splitStaffClips(text) {
    const src = String(text === undefined || text === null ? '' : text);
    const out = [];
    let pos = 0, m;
    SN_CLIP_RE.lastIndex = 0;
    while ((m = SN_CLIP_RE.exec(src))) {
        let piece = null;
        if (m[4] !== undefined) {
            const canon = canonicalStaff(m[4]);
            if (canon) piece = { staff: canon };
            if (piece && m[1] !== undefined) piece.at = { x: clampBlockAt(m[1]), y: clampBlockAt(m[2]) };
            if (piece && m[3]) piece.noBorder = true;
        } else {
            const box = parseFrameBox(m[8]);
            let html = null;
            try { html = decodeURIComponent(m[9]); } catch (e) { /* encodage invalide */ }
            if (box && html !== null) piece = { frame: { box: formatFrameBox(box), html } };
            if (piece && m[5] !== undefined) piece.at = { x: clampBlockAt(m[5]), y: clampBlockAt(m[6]) };
            if (piece && m[7]) piece.noBorder = true;
        }
        if (!piece) continue;
        if (m.index > pos) out.push({ text: src.slice(pos, m.index) });
        out.push(piece);
        pos = m.index + m[0].length;
    }
    if (pos < src.length) out.push({ text: src.slice(pos) });
    return out;
}

// ----- Durées -----

// Durée écrite d'un événement, en 96es de ronde (sans tenir compte d'un éventuel tuplet).
function staffWrittenUnits(e) { return SN_UNITS[e.d] * (e.dot ? 1.5 : 1); }

// Durée réelle d'un événement : la valeur écrite, réduite par le tuplet (3 croches de triolet = 8 unités chacune, pas 12).
function eventUnits(e) {
    const u = staffWrittenUnits(e);
    return e.tu ? u * SN_TUPLET_M[e.tu] / e.tu : Math.round(u);
}

function meterUnits(meter) {
    const [n, d] = meter.split('/').map(Number);
    return n * (96 / d);
}

// Temps de la mesure pour grouper les croches et doubles-croches sous une même barre (en 96es de ronde), dans l'ordre :
// la noire en simple (la blanche en 2/2), la noire pointée en composé, 2+2+3 croches en 7/8, la mesure entière en 3/8.
function staffMeterBeatGroups(meter) {
    const [n, d] = meter.split('/').map(Number);
    if (d === 8) {
        if (n === 7) return [24, 24, 36];
        if (n % 3 === 0) return new Array(n / 3).fill(36);
        return new Array(n).fill(12);
    }
    if (d === 2) return new Array(n).fill(48);
    return new Array(n).fill(24);
}

// Longueur du premier temps (compatibilité : l'ancien groupement ne connaissait qu'une longueur).
function meterBeamUnits(meter) { return staffMeterBeatGroups(meter)[0]; }

// Valeurs écrivables (durée en 96es → durée et point), de la plus longue à la plus courte.
const SN_WRITABLE = [[96, 'w', false], [72, 'h', true], [48, 'h', false], [36, 'q', true], [24, 'q', false],
    [18, '8', true], [12, '8', false], [9, '16', true], [6, '16', false]];

// Valeur écrite qui dure exactement `units` (96es de ronde), ou null.
function staffWritableValue(units) {
    for (const [u, d, dot] of SN_WRITABLE) if (Math.abs(u - units) < SN_EPS) return { d, dot };
    return null;
}

// Décompose une durée en valeurs écrivables, de la plus longue à la plus courte (le reste inférieur à une double-croche est ignoré).
function decomposeUnits(units) {
    const out = [];
    let left = units;
    for (const [u, d, dot] of SN_WRITABLE) {
        while (left >= u - SN_EPS) { out.push({ d, dot, units: u }); left -= u; }
    }
    return out;
}

// Découpe la portée en mesures. Une note qui dépasse la barre de mesure est coupée en morceaux liés (tieNext / tieFromPrev) ;
// un tuplet (groupe jamais coupé) qui ne tient pas passe à la mesure suivante. Une levée (st.pu événements) ferme la première mesure
// avant qu'elle soit pleine.
// Renvoie { total: durée d'une mesure, pickup: la première mesure est une levée, measures: [{ pieces, used, base, pickup }] } ; chaque pièce est
// { ev, d, dot, tu, p, units, at (début dans la mesure), tieNext, tieFromPrev, cont } et, dans un tuplet, tupletStart, tupletSize, gat (début du groupe) ;
// tieNext / tieFromPrev : une liaison part de la pièce / arrive sur elle (note coupée par la barre de mesure, ou liaison de prolongation écrite entre deux
// événements) ; cont : la pièce est la suite d'un même événement coupé par la barre de mesure (et non une nouvelle note, même liée) ;
// `base` est le décalage du début de la mesure par rapport à un début de temps (non nul pour une levée, qui finit sur le temps fort).
// La dernière mesure est vide (sans pièce) si la précédente est pleine, pour qu'il reste toujours une place où écrire la suite.
function layoutStaff(st) {
    const total = meterUnits(st.meter);
    const pk = staffPickupCount(st);
    const measures = [{ pieces: [], used: 0, base: 0, pickup: false }];
    let cur = measures[0];
    const newMeasure = () => { cur = { pieces: [], used: 0, base: 0, pickup: false }; measures.push(cur); };
    let pickup = false;
    const closePickup = () => {
        if (pk && measures.length === 1 && cur.pieces.length && cur.used < total - SN_EPS) { pickup = true; cur.pickup = true; newMeasure(); }
    };
    let i = 0;
    while (i < st.ev.length) {
        if (pk && i === pk) closePickup();
        const e = st.ev[i];
        if (e.tu) {
            let end = i + 1;
            while (end < st.ev.length && st.ev[end].tu === e.tu && !st.ev[end].gs) end++;
            let need = 0;
            for (let k = i; k < end; k++) need += eventUnits(st.ev[k]);
            if (cur.used > SN_EPS && cur.used + need > total + SN_EPS) newMeasure();
            const gat = cur.used;
            for (let k = i; k < end; k++) {
                const ek = st.ev[k];
                const u = eventUnits(ek);
                cur.pieces.push({ ev: k, d: ek.d, dot: ek.dot, tu: e.tu, p: ek.p, units: u, at: cur.used, gat, tieNext: staffTieValid(st.ev, k), tieFromPrev: k > 0 && staffTieValid(st.ev, k - 1), cont: false, tupletStart: k === i, tupletSize: end - i });
                cur.used += u;
            }
            i = end;
            if (cur.used >= total - SN_EPS) newMeasure();
            continue;
        }
        let left = eventUnits(e);
        let first = true;
        const tieOut = staffTieValid(st.ev, i), tieIn = i > 0 && staffTieValid(st.ev, i - 1);
        while (left > SN_EPS) {
            if (cur.used >= total - SN_EPS) newMeasure();
            const room = total - cur.used;
            const take = Math.min(left, room);
            const pieces = decomposeUnits(take);
            if (pieces.length === 0) { left = 0; break; } // reste inférieur à une double-croche
            pieces.forEach((pc, n) => {
                const lastOfEvent = left - take <= SN_EPS && n === pieces.length - 1;
                const continuation = !!e.p && !(first && n === 0);
                cur.pieces.push({ ev: i, d: pc.d, dot: pc.dot, tu: 0, p: e.p, units: pc.units, at: cur.used,
                    tieNext: !!e.p && (!lastOfEvent || tieOut), tieFromPrev: continuation || (!!e.p && tieIn && first && n === 0), cont: continuation });
                cur.used += pc.units;
            });
            left -= take;
            first = false;
        }
        i++;
    }
    if (pk && pk === st.ev.length) closePickup();
    if (!pickup && cur.used >= total - SN_EPS && cur.pieces.length) newMeasure();
    if (pickup) measures[0].base = Math.max(0, total - measures[0].used);
    return { total, pickup, measures };
}

// ----- Ligatures (groupes de croches et de doubles-croches sous une même barre) -----

// Groupes de pièces d'une mesure à relier par une barre : des croches / doubles-croches jouées (pas de silence) qui se suivent dans
// le même temps de la mesure (voir staffMeterBeatGroups) ; un tuplet reste d'un bloc dans le temps où il commence et ne se mêle pas aux notes voisines.
// `m` est une mesure de layoutStaff (la levée est calée sur la fin de la mesure : ses notes tombent dans les derniers temps).
// Renvoie [[indice de pièce, …], …] (au moins deux pièces par groupe).
function staffBeamGroups(m, meter) {
    const sizes = staffMeterBeatGroups(meter);
    const edges = [0];
    sizes.forEach(s => edges.push(edges[edges.length - 1] + s));
    const beatOf = (pos) => { for (let k = 0; k < sizes.length; k++) if (pos < edges[k + 1] - SN_EPS) return k; return sizes.length - 1; };
    const out = [];
    let run = [], key = null;
    const flush = () => { if (run.length > 1) out.push(run); run = []; key = null; };
    m.pieces.forEach((pc, i) => {
        if (!pc.p || (pc.d !== '8' && pc.d !== '16')) { flush(); return; }
        const anchor = (m.base || 0) + (pc.tu ? pc.gat : pc.at);
        const k = `${beatOf(anchor)}|${pc.tu ? pc.gat : -1}`;
        if (key !== null && k !== key) flush();
        key = k;
        run.push(i);
    });
    flush();
    return out;
}

// Où couper la barre des doubles-croches à l'intérieur d'un groupe (elles se regroupent par croche quand le temps est plus long qu'une noire,
// par noire dans une mesure à la blanche). Renvoie les indices (dans le groupe) après lesquels la barre secondaire s'interrompt.
function staffBeamBreaks(m, group, meter) {
    const sizes = staffMeterBeatGroups(meter);
    const first = m.pieces[group[0]];
    if (first.tu) return [];
    let pos = (m.base || 0), acc = 0, len = sizes[0];
    const p0 = pos + first.at;
    for (const s of sizes) { if (p0 < acc + s - SN_EPS) { len = s; break; } acc += s; len = s; }
    const every = len % 24 === 12 ? 12 : (len > 24 ? 24 : 0);
    if (!every) return [];
    const out = [];
    for (let t = 0; t < group.length - 1; t++) {
        const next = (m.base || 0) + m.pieces[group[t + 1]].at;
        const r = next / every;
        if (Math.abs(r - Math.round(r)) < SN_EPS) out.push(t);
    }
    return out;
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

// Plan de lecture : [{ at, len, midi, tu }] en temps (noires) ; midi = null pour un silence. Les notes liées sont déjà des événements entiers.
// Avec un swing (st.swing > 50 %), les croches placées sur le « et » sont retardées : dans chaque temps, la première moitié s'étire jusqu'au swing
// et la seconde se comprime (les doubles-croches suivent) ; les notes d'un tuplet gardent leur place, un triolet écrit n'a pas besoin de swing.
// Le temps est compté à partir du premier temps fort : une levée est donc swinguée comme si elle finissait sur le temps fort.
function staffSwingWarp(pos, swing) {
    if (Math.abs(swing - 0.5) < 1e-9) return pos;
    const b = Math.floor(pos + 1e-9);
    const f = pos - b;
    return f < 0.5 ? b + f * swing / 0.5 : b + swing + (f - 0.5) * (1 - swing) / 0.5;
}

// Le swing se règle en noires (2/4, 3/4, 4/4, 5/4, 6/4, 2/2, 3/8…) ; il n'a pas de sens en mesure composée (6/8, 9/8, 12/8).
function staffMeterAllowsSwing(meter) {
    const [n, d] = meter.split('/').map(Number);
    return !(d === 8 && n % 3 === 0 && n >= 6);
}

// jamSwing : swing de la jam chargée (0,5 à 0,75), suivi tant que la portée n'a pas son propre réglage (staffSwingRatio).
// Deux notes liées (liaison de prolongation) ne sont jouées qu'une fois, pour leur durée cumulée.
function playbackPlan(st, jamSwing) {
    const out = [];
    let t = 0;
    st.ev.forEach((e, i) => {
        const len = eventUnits(e) / 24;
        if (i > 0 && out.length && staffTieValid(st.ev, i - 1)) out[out.length - 1].len += len;
        else out.push({ at: t, len, midi: e.p ? pitchMidi(e.p) : null, tu: e.tu || 0, ev: i });
        t += len;
    });
    const sw = staffSwingRatio(st, jamSwing);
    if (sw > 0.5 + 1e-9 && staffMeterAllowsSwing(st.meter)) {
        const L = layoutStaff(st);
        const off = L.pickup ? L.measures[0].used / 24 : 0;
        out.forEach((n) => {
            if (n.tu) return;
            const a = off + staffSwingWarp(n.at - off, sw);
            const b = off + staffSwingWarp(n.at + n.len - off, sw);
            n.len = Math.max(0.05, b - a);
            n.at = a;
        });
        const lead = out.length ? out[0].at : 0; // une levée swinguée commence sur le « et » : la lecture démarre quand même tout de suite
        if (lead > 0) out.forEach(n => { n.at -= lead; });
    }
    return out;
}

// ----- Modifications (renvoient une nouvelle portée ; l'ancienne n'est pas touchée) -----

function cloneStaffEvent(e) { return { d: e.d, dot: !!e.dot, tu: e.tu || 0, gs: !!(e.tu && e.gs), tie: !!(e.p && e.tie), p: e.p ? { ...e.p } : null }; }

function cloneStaff(st) {
    return { clef: st.clef, meter: st.meter, ks: st.ks, size: st.size || SN_SIZE_DEFAULT, pu: st.pu || 0, bpm: st.bpm || 0, swing: st.swing || SN_SWING_DEFAULT, instr: clampStaffInstr(st.instr), ev: st.ev.map(cloneStaffEvent) };
}

// Insère un événement (ou, avec ev.tu, le membre d'un tuplet : ev.gs = premier du groupe).
// La levée suit : un événement inséré avant sa fin l'allonge ; inséré pile à sa fin, il ouvre la mesure suivante (opts.joinPickup : il entre dans la levée).
function insertEvent(st, index, ev, opts = {}) {
    const out = cloneStaff(st);
    if (out.ev.length >= SN_MAX_EVENTS) return out;
    const i = Math.max(0, Math.min(index, out.ev.length));
    if (i > 0) out.ev[i - 1].tie = false; // la note d'avant n'est plus suivie de celle à laquelle elle était liée
    out.ev.splice(i, 0, cloneStaffEvent(ev));
    if (out.pu > 0 && (i < out.pu || (i === out.pu && opts.joinPickup))) out.pu++;
    return out;
}

// Insère un groupe complet de n notes de même valeur (tuplet), toutes à la hauteur de `ev` (silences si ev.p est null).
function staffInsertTupletGroup(st, index, ev, n, opts = {}) {
    const out = cloneStaff(st);
    if (!SN_TUPLET_M[n] || out.ev.length + n > SN_MAX_EVENTS) return out;
    const i = Math.max(0, Math.min(index, out.ev.length));
    const members = [];
    for (let k = 0; k < n; k++) members.push({ d: ev.d, dot: !!ev.dot, tu: n, gs: k === 0, tie: false, p: ev.p ? { ...ev.p } : null });
    if (i > 0) out.ev[i - 1].tie = false;
    out.ev.splice(i, 0, ...members);
    if (out.pu > 0 && (i < out.pu || (i === out.pu && opts.joinPickup))) out.pu += n;
    return out;
}

// Indice d'insertion ramené sur une frontière : on n'insère jamais au milieu d'un tuplet (vers sa fin, ou vers son début si toEnd est faux).
function staffInsertBoundary(st, index, toEnd = true) {
    if (index <= 0 || index >= st.ev.length) return Math.max(0, Math.min(index, st.ev.length));
    if (!st.ev[index].tu || staffTupletStarts(st.ev, index)) return index;
    const b = staffTupletBounds(st.ev, index);
    return toEnd ? b.end : b.start;
}

// Supprime un événement. Une note de tuplet devient un silence (le groupe garde sa durée) ; un silence de tuplet ne s'enlève que si tout le
// groupe n'est que silences (le groupe part alors d'un bloc).
function removeEvent(st, index) {
    const out = cloneStaff(st);
    if (index < 0 || index >= out.ev.length) return out;
    const e = out.ev[index];
    let from = index, count = 1;
    if (e.tu) {
        if (e.p) { e.p = null; e.tie = false; if (index > 0) out.ev[index - 1].tie = false; return out; }
        const b = staffTupletBounds(out.ev, index);
        if (!out.ev.slice(b.start, b.end).every(x => !x.p)) return out;
        from = b.start; count = b.end - b.start;
    }
    out.ev.splice(from, count);
    if (from > 0 && out.ev[from - 1]) out.ev[from - 1].tie = false;
    if (out.pu > 0) {
        if (from < out.pu) out.pu = Math.max(0, out.pu - Math.min(count, out.pu - from));
        if (out.pu > out.ev.length) out.pu = out.ev.length;
    }
    return out;
}

// Remplace certains champs d'un événement (durée, point, hauteur ; p = null pour un silence).
function updateEvent(st, index, patch) {
    const out = cloneStaff(st);
    const e = out.ev[index];
    if (!e) return out;
    if (patch.d !== undefined && SN_DURATIONS.includes(patch.d)) e.d = patch.d;
    if (patch.dot !== undefined) e.dot = !!patch.dot;
    if (patch.p !== undefined) {
        if (patch.p) {
            const c = staffTieChain(out.ev, index); // les notes liées gardent la même hauteur
            for (let k = c.start; k < c.end; k++) out.ev[k].p = { ...patch.p };
        } else {
            e.p = null; e.tie = false;
            if (index > 0) out.ev[index - 1].tie = false;
        }
    }
    return out;
}

// Tuplets proposés pour une note (celle-ci devient N notes de valeur plus courte dans le même temps) : ceux dont la valeur écrite existe.
// Exemple : une noire → triolet (3 croches), quintolet, sextolet ou septolet (doubles-croches) ; une noire pointée → duolet, triolet, quartolet…
function staffTupletChoices(e) {
    if (!e || e.tu) return [];
    return SN_TUPLETS.filter(n => staffWritableValue(eventUnits(e) / SN_TUPLET_M[n]));
}

// Transforme la note `index` en tuplet de n notes de même hauteur, qui occupent exactement la même durée ; null si c'est impossible
// (la valeur écrite n'existe pas : une croche ne se coupe pas en quintolet, par exemple) ou si la portée est pleine.
function staffMakeTuplet(st, index, n) {
    const e = st.ev[index];
    if (!e || e.tu || !SN_TUPLET_M[n]) return null;
    const w = staffWritableValue(eventUnits(e) / SN_TUPLET_M[n]);
    if (!w || st.ev.length - 1 + n > SN_MAX_EVENTS) return null;
    const out = cloneStaff(st);
    const members = [];
    for (let k = 0; k < n; k++) members.push({ d: w.d, dot: w.dot, tu: n, gs: k === 0, tie: k === n - 1 && !!e.tie, p: e.p ? { ...e.p } : null });
    out.ev.splice(index, 1, ...members);
    if (out.pu > index) out.pu += n - 1;
    return out;
}

// Défait le tuplet qui contient l'événement `index` : si le groupe a une durée qui s'écrit en une note, il redevient cette note
// (hauteur de sa première note) ; sinon ses notes gardent leur valeur écrite, hors tuplet. Renvoie null si l'événement n'est pas dans un tuplet.
function staffDissolveTuplet(st, index) {
    const e = st.ev[index];
    if (!e || !e.tu) return null;
    const b = staffTupletBounds(st.ev, index);
    const out = cloneStaff(st);
    let total = 0;
    for (let k = b.start; k < b.end; k++) total += eventUnits(st.ev[k]);
    const w = staffWritableValue(total);
    if (w) {
        const first = st.ev.slice(b.start, b.end).find(x => x.p);
        out.ev.splice(b.start, b.end - b.start, { d: w.d, dot: w.dot, tu: 0, gs: false, tie: !!(first && st.ev[b.end - 1].tie), p: first ? { ...first.p } : null });
        if (out.pu >= b.end) out.pu -= b.end - b.start - 1;
    } else {
        for (let k = b.start; k < b.end; k++) { out.ev[k].tu = 0; out.ev[k].gs = false; }
    }
    return out;
}

// Fixe la levée : les k premiers événements forment la mesure incomplète du début (0 = pas de levée). Elle ne coupe jamais un tuplet.
function staffSetPickup(st, k) {
    const out = cloneStaff(st);
    k = Math.max(0, Math.min(st.ev.length, Math.round(Number(k) || 0)));
    while (k > 0 && k < out.ev.length && out.ev[k].tu && !staffTupletStarts(out.ev, k)) k++;
    out.pu = k;
    return out;
}

// Indice de fin (exclu) de l'événement ou du tuplet qui contient `index` : la levée « jusqu'à cette note ».
function staffEventEnd(st, index) { return st.ev[index] ? staffTupletBounds(st.ev, index).end : index; }

function setStaffTempo(st, bpm) { const out = cloneStaff(st); out.bpm = clampStaffBpm(bpm); return out; }
function setStaffSwing(st, pct) { const out = cloneStaff(st); out.swing = clampStaffSwing(pct); return out; }
function setStaffInstr(st, v) { const out = cloneStaff(st); out.instr = clampStaffInstr(v); return out; }

// Altère la note : delta -1 (bémol), +1 (dièse) ou null (bécarre = hauteur naturelle, sans altération).
function alterEvent(st, index, delta) {
    const out = cloneStaff(st);
    const e = out.ev[index];
    if (!e || !e.p) return out;
    const a = delta === null ? 0 : Math.max(-2, Math.min(2, e.p.a + delta));
    const c = staffTieChain(out.ev, index);
    for (let k = c.start; k < c.end; k++) out.ev[k].p.a = a;
    return out;
}

// Déplace la note d'un degré diatonique (steps) en gardant l'armure ; reste dans la plage 1-7 octaves.
function shiftEvent(st, index, steps) {
    const out = cloneStaff(st);
    const e = out.ev[index];
    if (!e || !e.p) return out;
    const np = pitchFromDia(pitchDia(e.p) + steps, st.ks);
    if (np) {
        const c = staffTieChain(out.ev, index);
        for (let k = c.start; k < c.end; k++) out.ev[k].p = { ...np };
    }
    return out;
}

// ----- Plusieurs notes à la fois (sélection multiple) -----

// Indices de `indices` valides, triés et sans doublon.
function staffSortedIndices(st, indices) {
    return Array.from(new Set(Array.from(indices).filter(i => Number.isInteger(i) && st.ev[i]))).sort((a, b) => a - b);
}

// Rend explicite le début de chaque groupe de tuplet (un groupe qui en suit un autre de même N ne doit jamais se fondre avec lui).
function staffNormalizeTuplets(ev) {
    ev.forEach((e, i) => { if (e.tu && staffTupletStarts(ev, i)) e.gs = true; });
}

// Déplace de `steps` degrés diatoniques toutes les notes de `indices` (et les notes qui leur sont liées) : tout bouge ou rien ne bouge
// (si une note sortait de la plage 1-7 octaves, la portée est rendue telle quelle).
function shiftEvents(st, indices, steps) {
    const out = cloneStaff(st);
    const set = staffExpandTies(out.ev, staffSortedIndices(st, indices));
    const moves = [];
    for (const i of set) {
        const e = out.ev[i];
        if (!e.p) continue;
        const np = pitchFromDia(pitchDia(e.p) + steps, st.ks);
        if (!np) return out;
        moves.push([i, np]);
    }
    moves.forEach(([i, np]) => { out.ev[i].p = np; });
    return out;
}

// Altère toutes les notes de `indices` (delta -1, +1, ou null = bécarre), comme alterEvent pour une seule.
function alterEvents(st, indices, delta) {
    const out = cloneStaff(st);
    staffExpandTies(out.ev, staffSortedIndices(st, indices)).forEach((i) => {
        const e = out.ev[i];
        if (e.p) e.p.a = delta === null ? 0 : Math.max(-2, Math.min(2, e.p.a + delta));
    });
    return out;
}

// Supprime les événements `indices` : une note de tuplet devient un silence, un groupe de tuplet qui n'est plus que silences (et dont on a choisi
// tous les membres, ou au moins un silence) disparaît d'un bloc ; les autres événements s'enlèvent.
function removeEvents(st, indices) {
    const sel = new Set(staffSortedIndices(st, indices));
    const out = cloneStaff(st);
    const wasRest = new Set();
    sel.forEach((i) => {
        const e = out.ev[i];
        if (!e.p) wasRest.add(i);
        if (e.tu && e.p) { e.p = null; e.tie = false; if (i > 0) out.ev[i - 1].tie = false; }
    });
    const ranges = [];
    const seen = new Set();
    sel.forEach((i) => {
        const e = out.ev[i];
        if (!e.tu) { ranges.push([i, 1]); return; }
        const b = staffTupletBounds(out.ev, i);
        if (seen.has(b.start)) return;
        seen.add(b.start);
        const members = [];
        for (let k = b.start; k < b.end; k++) members.push(k);
        const allRests = members.every(k => !out.ev[k].p);
        const wanted = members.every(k => sel.has(k)) || members.some(k => wasRest.has(k));
        if (allRests && wanted) ranges.push([b.start, b.end - b.start]);
    });
    ranges.sort((a, b) => b[0] - a[0]).forEach(([from, count]) => {
        out.ev.splice(from, count);
        if (from > 0 && out.ev[from - 1]) out.ev[from - 1].tie = false;
        if (out.pu > 0 && from < out.pu) out.pu = Math.max(0, out.pu - Math.min(count, out.pu - from));
    });
    if (out.pu > out.ev.length) out.pu = out.ev.length;
    staffNormalizeTuplets(out.ev);
    return out;
}

// Copie des événements `indices` pour un collage : les tuplets sont pris en entier, les liaisons ne sont gardées qu'entre événements qui se suivent.
function staffExtractEvents(st, indices) {
    const want = new Set();
    staffSortedIndices(st, indices).forEach((i) => {
        const b = staffTupletBounds(st.ev, i);
        for (let k = b.start; k < b.end; k++) want.add(k);
    });
    const list = Array.from(want).sort((a, b) => a - b);
    const out = list.map((i, j) => {
        const c = cloneStaffEvent(st.ev[i]);
        c.tie = staffTieValid(st.ev, i) && list[j + 1] === i + 1;
        return c;
    });
    staffNormalizeTuplets(out);
    return out;
}

// Insère `events` (copiés avec staffExtractEvents) à l'indice `index`, ramené sur une frontière de tuplet. Renvoie la nouvelle portée, ou null si elle serait pleine.
// Une levée qui précède l'insertion s'allonge ; la dernière note collée n'est jamais liée à ce qui suit.
function staffInsertEvents(st, index, events) {
    if (!events || !events.length || st.ev.length + events.length > SN_MAX_EVENTS) return null;
    const out = cloneStaff(st);
    const i = staffInsertBoundary(out, index);
    const members = events.map(cloneStaffEvent);
    members[members.length - 1].tie = false;
    if (i > 0) out.ev[i - 1].tie = false;
    out.ev.splice(i, 0, ...members);
    if (out.pu > 0 && i < out.pu) out.pu += members.length;
    staffNormalizeTuplets(out.ev);
    return out;
}

// Liaison des notes `indices` à la note qui les suit (même hauteur). Si toutes les liaisons possibles existent déjà, elles s'enlèvent ; sinon elles se posent.
// Renvoie { staff, candidates, tied } : candidates = nombre de notes pouvant être liées (la suivante a la même hauteur), tied = liaisons présentes après l'opération.
function staffToggleTies(st, indices) {
    const out = cloneStaff(st);
    const cand = staffSortedIndices(st, indices).filter(i => out.ev[i + 1] && out.ev[i].p && staffSamePitch(out.ev[i].p, out.ev[i + 1].p));
    if (!cand.length) return { staff: out, candidates: 0, tied: 0 };
    const allTied = cand.every(i => out.ev[i].tie);
    cand.forEach((i) => { out.ev[i].tie = !allTied; });
    return { staff: out, candidates: cand.length, tied: allTied ? 0 : cand.length };
}

// Prolonge la note `index`, dernière de la portée, d'une nouvelle note de même hauteur et de même valeur, liée à elle (null si ce n'est pas possible).
function staffAddTiedNote(st, index) {
    const e = st.ev[index];
    if (!e || !e.p || e.tu || index !== st.ev.length - 1 || st.ev.length >= SN_MAX_EVENTS) return null;
    const out = cloneStaff(st);
    out.ev[index].tie = true;
    out.ev.push({ d: e.d, dot: !!e.dot, tu: 0, gs: false, tie: false, p: { ...e.p } });
    return out;
}

// Une note de la sélection (ou un tuplet entier) a-t-elle une liaison vers la suivante ?
function staffHasTie(st, indices) { return staffSortedIndices(st, indices).some(i => staffTieValid(st.ev, i)); }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SN_POS_MAX, clampStaffPos, parseStaffPos, formatStaffPos, SN_AT_MAX, clampBlockAt, parseBlockAt, formatBlockAt, parseBlockBorder,
        SN_FRAME_W_MIN, SN_FRAME_W_MAX, SN_FRAME_W_DEFAULT, SN_FRAME_SCALE_MIN, SN_FRAME_SCALE_MAX, SN_FRAME_SCALE_DEFAULT, clampFrameWidth, clampFrameScale, parseFrameBox, formatFrameBox,
        staffClipText, frameClipText, splitStaffClips, SN_UNITS, SN_DURATIONS, SN_METERS, SN_MAX_EVENTS, SN_MAX_LENGTH, SN_KEY_NAMES, SN_KEY_LABELS, SN_BOTTOM_LINE,
        SN_SIZE_MIN, SN_SIZE_MAX, SN_SIZE_STEP, SN_SIZE_DEFAULT, clampStaffSize,
        SN_BPM_MIN, SN_BPM_MAX, SN_SWING_MIN, SN_SWING_MAX, SN_SWING_AUTO, SN_SWING_DEFAULT, clampStaffBpm, clampStaffSwing, SN_INSTRUMENTS, clampStaffInstr, setStaffInstr, staffSwingRatio, staffTempo,
        staffSamePitch, staffTieValid, staffTieChain, staffExpandTies, staffSortedIndices, staffNormalizeTuplets,
        SN_TUPLET_M, SN_TUPLETS, SN_TUPLET_NAMES, staffTupletStarts, staffTupletBounds, staffPickupCount,
        staffDefault, parseStaff, formatStaff, canonicalStaff, staffWrittenUnits, eventUnits, meterUnits, staffMeterBeatGroups, meterBeamUnits, staffWritableValue, decomposeUnits, layoutStaff,
        staffBeamGroups, staffBeamBreaks,
        pitchDia, keyAlter, pitchFromDia, pitchMidi, midiToName, pitchLabel, diaFromY, yFromDia, staffSwingWarp, staffMeterAllowsSwing, playbackPlan,
        cloneStaff, insertEvent, staffInsertTupletGroup, staffInsertBoundary, removeEvent, updateEvent, staffTupletChoices, staffMakeTuplet, staffDissolveTuplet, staffSetPickup, staffEventEnd, setStaffTempo, setStaffSwing, alterEvent, shiftEvent,
        shiftEvents, alterEvents, removeEvents, staffExtractEvents, staffInsertEvents, staffToggleTies, staffAddTiedNote, staffHasTie };
}
