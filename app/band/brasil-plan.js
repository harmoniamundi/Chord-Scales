// band/brasil-plan.js — cinq rythmes brésiliens de l'orchestre Brasil (en plus de la bossa et de la samba) : choro, partido alto,
// baião, samba-canção et samba-jazz. Chaque rythme a sa propre formation, celle du genre :
//   br-choro      regional de choro : cavaquinho (centro), violão 7 cordas (pouce et baixarias), pandeiro ; pas de basse
//   br-partido    roda de partido alto : cavaquinho sur la figure du partido, violão 7 cordas, pandeiro, surdo, palmas ; pas de basse
//   br-baiao      trio nordestin (Luiz Gonzaga) : sanfona (accordéon), zabumba (bumbo + bacalhau), triangle, et une contrebasse
//   br-cancao     samba-canção / MPB : violão (batida lente ou arpejo), contrebasse, percussions très douces (ganzá, aro, surdo)
//   br-sambajazz  samba-jazz (Tamba Trio, Edison Machado) : piano, contrebasse, batterie (cymbale en continu, aro, grosse caisse)
// Chargé par index.html via <script src="app/band/brasil-plan.js"> (après band/cumbia-plan.js) et testé par band/brasil-plan.test.js.
//
// Fonction pure : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat        temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.state            mémoire entre deux mesures, modifiée en place : brState (voicings de chaque pupitre, dernière note du
//                        violão 7 cordas), bandLastFill (la phrase précédente finissait-elle par une virada ?)
// buildBrasilPlan renvoie { piano, bass, drums } et le drapeau de l'instrument d'harmonie : classicalGuitar (violão, cavaquinho),
// accordion (sanfona) ou rien (piano du samba-jazz).
//
// Écriture : tout se pense en « cycles » de huit cases. Choro, partido alto et baião : une case = une double croche, un cycle =
// une mesure de 2/4 (une mesure de 4/4 = deux cycles). Samba-canção et samba-jazz s'écrivent en 4/4 « alla breve » : une case =
// une croche, un cycle = une mesure de 4/4 ; en 2/4, ils reprennent les doubles croches. Les figures alternent deux côtés A / B
// d'un cycle à l'autre (comme le teleco-teco), et chaque phrase choisit les siennes. La « ginga » retarde à peine les cases
// faibles, comme dans la samba jouée.

if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { latBassTones, popVoicing, popBassApproach, popScaleNotes } = require('./band-helpers.js');
}
if (typeof cumbiaVoicing === 'undefined' && typeof require === 'function') {
    var { cumbiaVoicing } = require('./cumbia-plan.js');
}

const BRASIL_GROOVES = ['br-choro', 'br-partido', 'br-baiao', 'br-cancao', 'br-sambajazz'];
// Rythmes écrits « alla breve » : en 4/4, une case = une croche
const BR_CUT = { 'br-cancao': true, 'br-sambajazz': true };
// Instrument d'harmonie de chaque rythme (pour le pop-up Orchestre : liste « Harmonie », curseur de volume)
const BR_HARMONY = { 'br-choro': 'guitar', 'br-partido': 'guitar', 'br-baiao': 'accordion', 'br-cancao': 'guitar', 'br-sambajazz': 'piano' };
// Rythmes sans contrebasse : le violão 7 cordas tient la basse
const BR_NO_BASS = { 'br-choro': true, 'br-partido': true };
// Ginga : retard de chaque case dans son groupe de quatre, en fraction de case
const BR_GINGA = [0, 0.11, 0.04, 0.09];

// Registres (hauteurs réelles, 0 = do3)
const BR_CAV_RANGE = { lo: 14, hi: 31, centre: 22, soft: 27 };    // cavaquinho : ré4 à sol5
const BR_VIO_RANGE = { lo: 2, hi: 17, centre: 9, soft: 14 };      // violão, accords du médium
const BR_PNO_RANGE = { lo: 1, hi: 20, centre: 10, soft: 17 };     // piano du samba-jazz

// ---- Figures (cases 0 à 7 d'un cycle ; côté A puis côté B) ----
// Cavaquinho du choro : maxixe (double-croche, croche, double-croche | croche, croche), centro (plus syncopé), tresillo (aéré)
const BR_CHORO_CAV = {
    maxixe:   { A: [0, 1, 3, 4, 6], B: [0, 1, 3, 4, 6] },
    centro:   { A: [0, 2, 3, 5, 6], B: [1, 2, 4, 6, 7] },
    tresillo: { A: [0, 3, 6, 7], B: [1, 2, 4, 6] }
};
// Partido alto (figure de deux mesures de 2/4) : x . . x . . x . | . x . . x . x .
const BR_PARTIDO = { A: [0, 3, 6], B: [1, 4, 6] };
// Sanfona du baião, main gauche : accords sur la cellule du baião (0, 3, 4 / tresillo 0, 3, 6), en contretemps, ou tenus au soufflet
const BR_SANFONA = {
    baiao:  { A: [[0, 2.2], [3, 0.8], [4, 1.6]], B: [[0, 2.2], [3, 0.8], [6, 1.4]] },
    tresil: { A: [[0, 2.6], [3, 2.6], [6, 1.6]], B: [[0, 2.6], [3, 2.6], [6, 1.6]] },
    contra: { A: [[2, 1.2], [6, 1.2]], B: [[2, 1.2], [5, 0.8], [6, 1.2]] },
    fole:   { A: [[0, 3.6], [4, 3.8]], B: [[0, 5.8], [6, 1.8]] }
};
// Sanfona, main droite : rythmes de la mélodie sur un cycle ([case, durée en cases]) ; longues et brèves mêlées, levées, cellule du baião
const BR_BAIAO_RHYTHMS = [
    [[0, 3], [3, 1], [4, 2], [6, 2]],          // cellule du baião
    [[0, 2], [2, 2], [4, 4]],
    [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]],
    [[0, 4], [4, 2], [6, 2]],
    [[2, 2], [4, 2], [6, 1], [7, 1]],          // départ en levée (le 1 est laissé à la main gauche)
    [[0, 6], [6, 1], [7, 1]],                  // note tenue puis levée
    [[0, 3], [3, 3], [6, 2]],                  // tresillo
    [[0, 2], [2, 1], [3, 1], [4, 3], [7, 1]],
    [[1, 1], [2, 1], [3, 1], [4, 4]],          // anacrouse vers le 2
    [[0, 3], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]
];
// Fin de phrase : la dernière note dure
const BR_BAIAO_END_RHYTHMS = [ [[0, 2], [2, 2], [4, 4]], [[0, 1], [1, 1], [2, 2], [4, 4]], [[0, 3], [3, 5]], [[0, 8]], [[0, 2], [2, 6]] ];
// Fill vers l'accord suivant : plus dense, mais pas toujours en doubles croches égales
const BR_BAIAO_FILL_RHYTHMS = [
    [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2]],
    [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]],
    [[0, 3], [3, 1], [4, 1], [5, 1], [6, 2]],
    [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]
];
// Rôle de la sanfona sur chaque quart de phrase : mélodie, accompagnement seul, fill vers la phrase suivante
const BR_BAIAO_ROLES = [
    ['mel', 'mel', 'mel', 'fill'], ['mel', 'comp', 'mel', 'mel'], ['comp', 'mel', 'mel', 'fill'], ['mel', 'mel', 'comp', 'mel'],
    ['mel', 'mel', 'mel', 'mel'], ['comp', 'mel', 'comp', 'fill']
];
// Doigts du violão en samba-canção (teleco-teco ralenti ; les cases 0 et 4 sont au pouce)
const BR_CANCAO_FING = {
    lenta:  { A: [2, 5, 7], B: [1, 3, 6] },
    aberta: { A: [2, 6], B: [3, 6] }
};
// Piano du samba-jazz : figures de comping
const BR_SJ_PIANO = {
    partido: { A: [[0, 1.6], [3, 1], [6, 1.4]], B: [[1, 1], [4, 1.6], [6, 1.2]] },
    teleco:  { A: [[2, 1], [5, 1], [7, 1]], B: [[1, 1], [3, 1], [6, 1.6]] },
    sparse:  { A: [[0, 2.5], [5, 1.2]], B: [[3, 1.2], [6, 2]] }
};
// Basses : [case, note, durée (cases), vélocité] ; R fondamentale, F quinte, O octave, A approche de l'accord suivant
const BR_BASS = {
    'br-baiao': [
        [[0, 'R', 2.8, 0.82], [3, 'R', 0.9, 0.62], [4, 'F', 3.6, 0.86]],
        [[0, 'R', 2.8, 0.82], [3, 'O', 0.9, 0.6], [4, 'F', 2.6, 0.84], [7, 'A', 0.9, 0.56]],
        [[0, 'R', 2.8, 0.82], [3, 'R', 2.8, 0.68], [6, 'F', 1.8, 0.74]]
    ],
    'br-cancao': [
        [[0, 'R', 3.8, 0.72], [4, 'F', 3.8, 0.78]],
        [[0, 'R', 2.8, 0.72], [3, 'R', 0.9, 0.5], [4, 'F', 3.8, 0.78]],
        [[0, 'R', 3.8, 0.72], [4, 'F', 2.8, 0.76], [7, 'A', 1, 0.54]]
    ],
    'br-sambajazz': [
        [[0, 'R', 1.8, 0.76], [4, 'F', 2.8, 0.9]],
        [[0, 'R', 1.8, 0.76], [3, 'R', 0.9, 0.52], [4, 'F', 2.8, 0.9]],
        [[0, 'R', 1.8, 0.76], [4, 'F', 2.6, 0.88], [7, 'A', 1, 0.6]],
        [[0, 'R', 1.6, 0.76], [2, 'O', 0.9, 0.52], [4, 'F', 2.8, 0.88], [7, 'A', 1, 0.58]]
    ]
};

const brPick = (rng, opts) => {
    const tot = opts.reduce((a, o) => a + o[1], 0);
    let r = rng() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[opts.length - 1][0];
};

// Choix faits une fois par phrase (gardés pendant toute la phrase).
function brasilPhraseExtras(groove, ph, rng) {
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const out = { groove, flip: rng() < 0.25, ginga: 0.7 + rng() * 0.5, bassIdx: 0, bassAlt: 0 };
    const nb = BR_BASS[groove] ? BR_BASS[groove].length : 1;
    out.bassIdx = Math.floor(rng() * nb);
    out.bassAlt = Math.floor(rng() * nb);
    if (groove === 'br-choro') {
        out.cav = brPick(rng, I < 0.45 ? [['tresillo', 2], ['maxixe', 2], ['centro', 1]] : [['maxixe', 2], ['centro', 2.5], ['tresillo', 0.6]]);
        out.vio6 = rng() < 0.35 + 0.4 * I;            // le violão 6 cordas double l'harmonie au médium
        out.baixaria = 0.5 + 0.35 * I;                 // probabilité d'une baixaria à un changement d'accord
        out.ghosts = I > 0.5 && rng() < 0.7;
    } else if (groove === 'br-partido') {
        out.palmas = rng() < 0.3 + 0.6 * I;
        out.ghosts = rng() < 0.55 + 0.4 * I;           // abafados du cavaquinho entre les coups du partido
        out.baixaria = 0.3 + 0.35 * I;
        out.resposta = rng() < 0.25 + 0.5 * I;         // surdo de resposta
    } else if (groove === 'br-baiao') {
        out.roles = brPick(rng, BR_BAIAO_ROLES.map((r, k) => [r, k < 4 ? 2 : 1]));   // rôle de chaque quart de phrase
        out.comps = rng() < 0.5 ? ['baiao', 'contra', 'fole'] : ['fole', 'baiao', 'tresil'];
        out.contours = [0, 1, 2, 3].map(() => brPick(rng, [['down', 2], ['arch', 2], ['up', 1.2], ['valley', 1], ['neighbor', 1.2], ['repeat', 0.8]]));
        out.thirds = 0.12 + 0.3 * I;                   // doublure à la tierce inférieure (les mélodies nordestines en tierces)
        out.orn = 0.15 + 0.2 * rng();                  // appoggiatures
        out.lh = 0.25 + 0.3 * I;                       // main gauche sous la mélodie
        out.lastRhythm = -1;
        out.triOpen = I > 0.65 && rng() < 0.6;         // triangle plus ouvert quand la phrase s'anime
        out.zabVar = rng() < 0.35;                     // zabumba en tresillo sur le côté B
    } else if (groove === 'br-cancao') {
        out.texture = brPick(rng, I < 0.45 ? [['arpejo', 3], ['lenta', 1.5], ['aberta', 1]] : [['lenta', 3], ['arpejo', 1.5], ['aberta', 1]]);
        out.ganza = rng() < 0.45 + 0.3 * I;
        out.aro = rng() < 0.4 + 0.4 * I;
    } else if (groove === 'br-sambajazz') {
        out.comp = brPick(rng, I < 0.45 ? [['sparse', 2], ['teleco', 2], ['partido', 1]] : [['partido', 2.5], ['teleco', 2], ['sparse', 0.6]]);
        out.ride = I > 0.55 ? rng() < 0.75 : rng() < 0.25; // cymbale ride (samba de prato) ou charleston fermé
        out.ghosts = I > 0.5 && rng() < 0.7;
        out.doubles = I > 0.6 && rng() < 0.5;          // coups doublés du piano (deux cases de suite)
    }
    return out;
}

// Note du violão 7 cordas : ramenée dans son registre grave (do2 à do3 réels)
function brFold7(env, n) {
    const off = env.transOffset;
    let a = n;
    while (a + off > 0) a -= 12;
    while (a + off < -12) a += 12;
    return a;
}

// Pouce du violão 6 cordas (samba-canção) : mi2 à mi3 réels
function brFoldThumb(env, n) {
    const off = env.transOffset;
    let a = n;
    while (a + off > 4) a -= 12;
    while (a + off < -8) a += 12;
    return a;
}

// Baixaria : `len` notes conjointes (gamme de l'accord en cours, dernière note souvent chromatique) qui mènent à la
// fondamentale de l'accord suivant (dans le registre du 7 cordas). Renvoie les notes dans l'ordre du jeu, ou [].
function brBaixaria(env, cs, nextCs, len, rng) {
    const off = env.transOffset;
    const target = brFold7(env, latBassTones(env, nextCs).root);
    const S = popScaleNotes(cs, target - 16, target + 16);
    let up;                                             // true : on monte vers la cible (en partant d'en dessous)
    if (target + off <= -9) up = false;
    else if (target + off >= -3) up = true;
    else up = rng() < 0.55;
    const line = (dirUp) => dirUp ? S.filter(n => n < target).slice(-len) : S.filter(n => n > target).slice(0, len).reverse();
    const fits = (ns) => ns.length === len && !ns.some(n => n + off < -13 || n + off > 4);   // pas plus bas que le si1 du 7 cordas
    let notes = line(up);
    if (!fits(notes)) { up = !up; notes = line(up); }
    if (!fits(notes)) return [];
    // dernière note chromatique (sensible), comme dans les contrechants du 7 cordas
    const lastChrom = up ? target - 1 : target + 1;
    if (rng() < (up ? 0.55 : 0.3) && notes[notes.length - 1] !== lastChrom && !notes.includes(lastChrom)) notes[notes.length - 1] = lastChrom;
    return notes;
}


// Note voisine dans la gamme de l'accord : `steps` degrés plus haut (positif) ou plus bas (négatif), ou null.
function brScaleStep(env, cs, n, steps) {
    const S = popScaleNotes(cs, n - 14, n + 14);
    const k = S.indexOf(n);
    if (k < 0) {
        const below = S.filter(x => x < n), above = S.filter(x => x > n);
        if (steps < 0) return below.length >= -steps ? below[below.length + steps] : null;
        return above.length >= steps ? above[steps - 1] : null;
    }
    const j = k + steps;
    return (j >= 0 && j < S.length) ? S[j] : null;
}

// Ligne mélodique de la sanfona sur un cycle : `rhythm` = [[case, durée en cases]…], `csOf(case)` = accord sous la case
// (fonction, ou un accord), `contour` = down | up | arch | valley | neighbor | repeat. Mouvement surtout conjoint dans la
// gamme de l'accord, quelques sauts sur les notes de l'accord ; les appuis (cases 0 et 4) tombent sur une note de l'accord ;
// `land` : la dernière note se pose sur une note de l'accord visé (`target`, sinon l'accord en cours). Notes liées : chaque note
// dure jusqu'à la suivante (léger chevauchement). Renvoie [{ k, p, d, n, peak }] (p, d en temps ; registre do4 - ré5 réels).
function brMelLine(env, csOf, target, from, rhythm, contour, rng, land) {
    const off = env.transOffset;
    const slot = 0.25;
    const LO = 13 - off, HI = 29 - off;
    const cs = (k) => typeof csOf === 'function' ? csOf(k) : csOf;
    const pcsOf = (c) => {
        const t = env.findChordObj(c.chordId).notes;
        return t.slice(0, 4).map(x => (((c.rootIndex + x) % 12) + 12) % 12);
    };
    const isCT = (c, n) => pcsOf(c).includes(((n % 12) + 12) % 12);
    const nearestCT = (c, n) => {
        for (let d = 0; d <= 6; d++) for (const sg of [-1, 1]) { const x = n + sg * d; if (x >= LO && x <= HI && isCT(c, x)) return x; }
        return n;
    };
    let n = Number.isFinite(from) ? from : nearestCT(cs(rhythm[0][0]), 21 - off);
    if (n < LO || n > HI) n = nearestCT(cs(rhythm[0][0]), 21 - off);
    const N = rhythm.length;
    const out = [];
    let peakIdx = -1, peakVal = -99;
    rhythm.forEach(([k, len], idx) => {
        const c = cs(k);
        let dir;
        if (contour === 'down') dir = -1;
        else if (contour === 'up') dir = 1;
        else if (contour === 'arch') dir = idx < N / 2 ? 1 : -1;
        else if (contour === 'valley') dir = idx < N / 2 ? -1 : 1;
        else if (contour === 'neighbor') dir = [1, -1, -1, 1][idx % 4];
        else dir = idx % 3 === 2 ? -1 : 0;           // repeat : note répétée (cellule du baião), puis broderie
        if (idx > 0 || !Number.isFinite(from)) {
            if (dir !== 0) {
                const leap = rng() < 0.2 ? 2 : 1;      // de temps en temps une tierce
                const nx = brScaleStep(env, c, n, dir * leap);
                n = (nx !== null && nx >= LO && nx <= HI) ? nx : (brScaleStep(env, c, n, -dir) ?? n);
            }
        } else if (dir !== 0) {
            const nx = brScaleStep(env, c, n, dir);
            if (nx !== null && nx >= LO && nx <= HI) n = nx;
        }
        // appui : note de l'accord
        if (k % 4 === 0 && !isCT(c, n)) n = nearestCT(c, n);
        // fin : note de l'accord visé, au plus près
        if (land && idx === N - 1) {
            const t = target || c;
            if (!isCT(t, n)) n = nearestCT(t, n);
        }
        if (n > peakVal) { peakVal = n; peakIdx = idx; }
        out.push({ k, p: k * slot, d: 0, n, len });
    });
    out.forEach((nt, idx) => {
        const nx = out[idx + 1];
        nt.d = nx ? (nx.p - nt.p) + 0.04 : nt.len * slot + 0.04;   // liées : la note tient jusqu'à la suivante
        nt.peak = idx === peakIdx;
        delete nt.len;
    });
    return out;
}

function buildBrasilPlan(env, groove, bpb, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    if (!ph.br || ph.br.groove !== groove) ph.br = brasilPhraseExtras(groove, ph, rng);
    const br = ph.br;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const prog = L > 1 ? i / (L - 1) : 0;
    const off = env.transOffset;
    const slot = (BR_CUT[groove] && bpb >= 4) ? 0.5 : 0.25;
    const cycLen = 8 * slot;
    const cycles = Math.max(1, Math.round(bpb / cycLen));
    const splitAt = env.splitBeat || bpb / 2;
    const st = env.state.brState && env.state.brState.groove === groove ? env.state.brState : { groove, lanes: {} };
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const aPos = bpb - slot;                      // dernière case : l'accord suivant y est souvent anticipé
    const anticip = changeNext && groove !== 'br-baiao' && rng() < (groove === 'br-cancao' ? 0.3 : 0.35 + 0.3 * I);
    const segAt = (p) => (halves && p >= splitAt - 1e-6) ? segs[1] : segs[0];
    const csAt = (p) => (anticip && p >= aPos - 1e-6) ? nextStep : segAt(p).cs;
    const followOf = (sg) => { const k = segs.indexOf(sg); return k < segs.length - 1 ? segs[k + 1].cs : (changeNext ? nextStep : null); };
    const endOf = (p) => {
        if (anticip && p >= aPos - 1e-6) return bpb + 1;
        if (halves && p < splitAt - 1e-6) return splitAt + 0.03;
        return (anticip ? aPos : bpb) + 0.06;
    };
    const side = (c) => ((m * cycles + c + (br.flip ? 1 : 0)) % 2 === 0 ? 'A' : 'B');
    const ginga = (p) => {
        const k = Math.round((((p / slot) % 4) + 4) % 4) % 4;
        return p + BR_GINGA[k] * slot * br.ginga;
    };
    const P = (c, k) => c * cycLen + k * slot;   // position d'une case
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? Math.max(bpb - (BR_CUT[groove] && bpb >= 4 ? 2 : 1), 0) : 99;

    // ---- voicings avec conduite des voix, un pupitre à la fois ----
    const cache = {};
    const voice = (lane, cs, fn) => {
        const key = lane + '|' + cs.rootIndex + ':' + cs.chordId;
        if (cache[key]) return cache[key];
        const mem = st.lanes[lane];
        const v = (mem && mem.key === key) ? mem.v : fn(mem ? mem.v : null);
        cache[key] = v;
        st.lanes[lane] = { key, v };
        return v;
    };
    const noRootTop = (cs, V, n) => {
        const t = V.filter(x => (((x - cs.rootIndex) % 12) + 12) % 12 !== 0);
        const src = t.length >= Math.min(n, 3) ? t : V;
        return src.length > n ? src.slice(-n) : src.slice();
    };
    const cavOf = (cs) => noRootTop(cs, voice('cav', cs, prev => popVoicing(env, cs, prev, BR_CAV_RANGE)), 3);
    const vioOf = (cs) => noRootTop(cs, voice('vio', cs, prev => popVoicing(env, cs, prev, BR_VIO_RANGE)), 3);
    const pnoOf = (cs) => noRootTop(cs, voice('pno', cs, prev => popVoicing(env, cs, prev, BR_PNO_RANGE)), 4);
    const accOf = (cs) => voice('acc', cs, prev => cumbiaVoicing(env, cs, prev));

    const harm = [];
    const hv = (0.72 + 0.3 * I) * (0.93 + 0.07 * prog);
    // frappe d'harmonie (violão, cavaquinho, piano ou sanfona selon le rythme)
    const pushH = (p, dur, notes, vel, o = {}) => {
        const sorted = notes.slice().sort((a, b) => a - b).filter((n, k, arr) => k === 0 || n !== arr[k - 1]);
        if (!sorted.length || p >= bpb - 1e-6) return;
        const n = sorted.length;
        const e = {
            pos: o.noGinga ? p : ginga(p),
            dur: Math.max(o.mute ? 0.06 : 0.1, o.free ? dur : Math.min(dur, endOf(p) - p)),
            vel: Math.max(0.06, Math.min(1, vel * hv * (0.94 + rng() * 0.12))),
            rootIndex: 0, intervals: sorted,
            noteVels: sorted.map((_, k) => n === 1 ? 1 : (k === n - 1 ? 1 : 0.84))
        };
        if (o.art) e.art = o.art;
        if (o.mute) e.mute = true;
        if (o.oct) e.oct = true;
        if (o.who) e.who = o.who;
        if (BR_HARMONY[groove] !== 'accordion') {
            e.dir = o.dir || 1;
            e.roll = n > 1 ? (o.roll !== undefined ? o.roll : 0.006 + rng() * 0.006) : 0;
            e.lay = 0.002 + rng() * 0.006;
        }
        harm.push(e);
    };

    const bass = [];
    const bvel = (v) => Math.min(1, v * (0.82 + 0.22 * I) * (0.93 + 0.07 * prog));
    const drums = [];
    const dv = (0.72 + 0.3 * I) * (0.92 + 0.08 * prog);
    const add = (p, drum, vel, orn) => {
        if (p >= fillFrom - 1e-6 || p >= bpb - 1e-6) return;
        const e = { pos: ginga(p), drum, vel: Math.max(0.04, Math.min(1, vel * dv * (0.93 + rng() * 0.14))), lay: 0 };
        if (orn) e.orn = true;
        drums.push(e);
    };
    const pushF = (p, drum, v) => { if (p < bpb - 1e-6) drums.push({ pos: ginga(p), drum, vel: Math.max(0.05, Math.min(1, v * dv)), lay: 0 }); };
    const resolveAfterFill = i === 0 && env.state.bandLastFill;
    env.state.bandLastFill = false;
    if (isTurn) env.state.bandLastFill = doFill;

    // ---- violão 7 cordas : pouce et baixarias (choro, partido alto) ----
    const seven = (style) => {
        const tones = (cs) => {
            const T = latBassTones(env, cs);
            return { root: brFold7(env, T.root), fifth: brFold7(env, T.fifth), third: brFold7(env, T.third) };
        };
        const thumb = [];
        for (let c = 0; c < cycles; c++) {
            [0, 4].forEach(k => {
                const p = P(c, k);
                const sg = segAt(p);
                const T = tones(sg.cs);
                const first = Math.abs(sg.s - p) < 1e-6;
                let note = (k === 4 && !first) ? T.fifth : T.root;
                // la quinte au-dessus de la fondamentale sonne mieux quand la fondamentale est déjà basse
                if (note === T.fifth && note < T.root - 5 && note + 12 + off <= 2) note += 12;
                const long = style === 'partido' ? (k === 4 ? 0.75 : 0.42) : (k === 4 ? 0.48 : 0.45);
                thumb.push({ p, note, dur: long, vel: k === 4 ? (style === 'partido' ? 0.74 : 0.66) : 0.6 });
            });
            // petite note de passage avant le 2 (choro) : tierce ou quinte sur la 4e double croche
            if (style === 'choro' && rng() < 0.3 + 0.3 * I) {
                const p = P(c, 3);
                const T = tones(segAt(p).cs);
                thumb.push({ p, note: rng() < 0.5 ? T.third : T.fifth, dur: 0.22, vel: 0.46 });
            }
        }
        // baixaria vers l'accord suivant (ou vers le second accord d'une mesure coupée)
        let runFrom = 99;
        const want = changeNext || (halves && !sameChord(segs[0].cs, segs[1].cs));
        const prob = isTurn ? Math.min(0.95, br.baixaria + 0.3) : br.baixaria;
        if (want && rng() < prob) {
            const to = changeNext ? nextStep : segs[1].cs;
            const from = changeNext ? lastSeg : segs[0];
            const end = changeNext ? bpb : splitAt;
            const maxLen = Math.round((end - from.s) / slot) - 1;
            let len = style === 'choro' ? (isTurn ? 7 : 3 + Math.floor(rng() * 3)) : (isTurn ? 5 : 3);
            len = Math.max(0, Math.min(len, maxLen));
            let notes = [];
            for (let n = len; n >= 3 && !notes.length; n--) { notes = brBaixaria(env, from.cs, to, n, rng); if (notes.length) len = n; }
            if (notes.length) {
                runFrom = end - len * slot;
                for (let k = thumb.length - 1; k >= 0; k--) if (thumb[k].p >= runFrom - 1e-6 && thumb[k].p < end - 1e-6) thumb.splice(k, 1);
                notes.forEach((n, k) => thumb.push({ p: runFrom + k * slot, note: n, dur: slot * 1.15, vel: 0.56 + 0.05 * k / Math.max(1, len - 1) + (k === len - 1 ? 0.06 : 0) }));
            }
        }
        thumb.sort((a, b) => a.p - b.p).forEach((t, k, arr) => {
            const nx = arr[k + 1];
            const d = nx ? Math.min(t.dur, nx.p - t.p + 0.02) : t.dur;
            pushH(t.p, d, [t.note], t.vel * 1.08, { who: '7c' });
        });
        return runFrom;
    };

    // ======================= CHORO =======================
    if (groove === 'br-choro') {
        seven('choro');
        for (let c = 0; c < cycles; c++) {
            const sd = side(c);
            const fig = BR_CHORO_CAV[br.cav][sd];
            const taken = new Set();
            fig.forEach(k => {
                if (k > 0 && rng() < 0.06 * (1.1 - I)) return;
                const p = P(c, k);
                taken.add(k);
                const acc = (k % 4 === 3) ? 1.08 : (k % 4 === 0 ? 0.96 : 1);
                pushH(p, slot * 1.4, cavOf(csAt(p)), 0.5 * acc, { dir: k % 2 ? -1 : 1, roll: 0.004, who: 'cav' });
            });
            if (br.ghosts) for (let k = 1; k < 8; k += 2) if (!taken.has(k) && rng() < 0.35 * I) {
                const p = P(c, k);
                pushH(p, 0.06, cavOf(csAt(p)).slice(-2), 0.22, { mute: true, dir: -1, roll: 0.002, who: 'cav' });
            }
            // violão 6 cordas : accord du médium sur les contretemps (« e » des temps)
            if (br.vio6) [2, 6].forEach(k => {
                if (rng() > 0.75) return;
                const p = P(c, k);
                pushH(p, slot * 1.6, vioOf(csAt(p)), 0.4, { dir: 1, roll: 0.01, who: 'vio' });
            });
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if ((harm[k].who === 'cav' || harm[k].who === 'vio') && harm[k].pos >= aPos - 1e-6) harm.splice(k, 1);
            pushH(aPos, slot * 2.5, cavOf(nextStep), 0.56, { dir: -1, roll: 0.004, who: 'cav' });
        }
        if (halves && !harm.some(e => e.who === 'cav' && Math.abs(e.pos - segs[1].s) < 0.05)) pushH(segs[1].s, slot * 1.5, cavOf(segs[1].cs), 0.5, { who: 'cav' });
        // pandeiro de choro : pouce, doigts, doigts, doigts (accent sur la 4e), pouce grave sur le 2, quelques tapas
        for (let c = 0; c < cycles; c++) {
            for (let b = 0; b < 2; b++) {
                const p = P(c, b * 4);
                add(p, 'pandg', b === 1 ? 0.56 : 0.4);
                add(p + slot, 'pandj', 0.26, true);
                if (b === 1 && rng() < 0.22 + 0.25 * I) add(p + 2 * slot, 'pandt', 0.44); else add(p + 2 * slot, 'pandj', 0.36);
                add(p + 3 * slot, 'pandj', 0.56);
            }
        }
        if (doFill) {
            const b = fillFrom;
            [0.3, 0.36, 0.42, 0.5].forEach((v, k) => pushF(b + k * slot, 'pandj', v + 0.1));
            pushF(b, 'pandg', 0.6); pushF(b + 2 * slot, 'pandt', 0.6); pushF(b + 3 * slot, 'pandt', 0.66);
        }
    }

    // ======================= PARTIDO ALTO =======================
    if (groove === 'br-partido') {
        seven('partido');
        for (let c = 0; c < cycles; c++) {
            const sd = side(c);
            const fig = BR_PARTIDO[sd];
            fig.forEach(k => {
                const p = P(c, k);
                pushH(p, slot * 1.5, cavOf(csAt(p)), 0.58 * (k === 6 ? 1.06 : 1), { dir: k % 2 ? -1 : 1, roll: 0.004, who: 'cav' });
            });
            // abafados : le cavaquinho ne s'arrête jamais (mouvement continu en doubles croches)
            if (br.ghosts) for (let k = 0; k < 8; k++) if (!fig.includes(k) && rng() < 0.55 + 0.3 * I) {
                const p = P(c, k);
                pushH(p, 0.06, cavOf(csAt(p)).slice(-2), k % 2 ? 0.2 : 0.26, { mute: true, dir: k % 2 ? -1 : 1, roll: 0.002, who: 'cav' });
            }
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].who === 'cav' && harm[k].pos >= aPos - 1e-6) harm.splice(k, 1);
            pushH(aPos, slot * 2.5, cavOf(nextStep), 0.62, { dir: -1, roll: 0.004, who: 'cav' });
        }
        if (halves && !harm.some(e => e.who === 'cav' && !e.mute && Math.abs(e.pos - segs[1].s) < 0.05)) pushH(segs[1].s, slot * 1.5, cavOf(segs[1].cs), 0.54, { who: 'cav' });
        for (let c = 0; c < cycles; c++) {
            const sd = side(c);
            // surdo : étouffé sur le 1 (ouvert après une virada), marcação ouverte sur le 2 ; resposta entre les deux
            add(P(c, 0), (resolveAfterFill && c === 0) ? 'surdo' : 'surdom', (resolveAfterFill && c === 0) ? 0.74 : 0.44);
            add(P(c, 4), 'surdo', 0.8);
            if (br.resposta) (sd === 'A' ? [[3, 0.36], [6, 0.4]] : [[2, 0.34], [7, 0.38]]).forEach(([k, v]) => { if (rng() < 0.8) add(P(c, k), 'surdom', v); });
            // pandeiro : doubles croches, tapas sur les coups du partido qui tombent hors temps
            for (let k = 0; k < 8; k++) {
                const p = P(c, k);
                if (k === 0 || k === 4) { add(p, 'pandg', k === 4 ? 0.58 : 0.42); continue; }
                const onFig = BR_PARTIDO[sd].includes(k);
                if (onFig && rng() < 0.6) add(p, 'pandt', 0.5);
                else add(p, 'pandj', k % 4 === 3 ? 0.56 : (k % 2 ? 0.26 : 0.36), k % 2 === 1);
            }
            // palmas de la roda sur la figure du partido
            if (br.palmas) BR_PARTIDO[sd].forEach(k => add(P(c, k), rng() < 0.75 ? 'palma' : 'sorda', 0.42 + 0.12 * I));
        }
        if (doFill) {
            const b = fillFrom;
            pushF(b, 'surdo', 0.76); pushF(b + 2 * slot, 'surdo', 0.6); pushF(b + 3 * slot, 'surdom', 0.66);
            [1, 2, 3].forEach((k, n) => pushF(b + k * slot, 'pandt', 0.48 + 0.08 * n));
            if (br.palmas) [0, 1, 2, 3].forEach(k => pushF(b + k * slot, 'palma', 0.4 + 0.05 * k));
        }
    }

    // ======================= BAIÃO =======================
    if (groove === 'br-baiao') {
        // sanfona : la main droite chante (lignes liées, motifs variés, question / réponse sur la phrase), la main gauche
        // accompagne ; les mesures d'accompagnement seul sont minoritaires (rôles choisis par phrase, BR_BAIAO_ROLES).
        const units = L * cycles;
        for (let c = 0; c < cycles; c++) {
            const u = i * cycles + c;                       // rang du cycle dans la phrase
            const role = br.roles[Math.floor(u * 4 / Math.max(1, units))] || 'mel';
            const c0 = P(c, 0), c1 = c0 + cycLen;
            const lastUnit = c === cycles - 1;
            const toNext = lastUnit && changeNext ? nextStep : null;
            const phraseEnd = u === units - 1;
            const sd = side(c);
            if (role === 'comp') {
                // accompagnement varié : cellule du baião, contretemps, accord tenu au soufflet
                const fig = BR_SANFONA[br.comps[(u + (br.flip ? 1 : 0)) % br.comps.length]][sd];
                fig.forEach(([k, d]) => {
                    const p = P(c, k);
                    pushH(p, d * slot, accOf(segAt(p).cs), k === 0 ? 0.58 : 0.5, { art: d > 2 ? 'pad' : 'lin' });
                });
                // petite levée liée vers la mesure suivante
                if (rng() < 0.45) {
                    const from = st.lanes.mel ? st.lanes.mel.n : null;
                    const line = brMelLine(env, segAt(P(c, 6)).cs, toNext, from, [[6, 1], [7, 1]], rng() < 0.5 ? 'up' : 'down', rng, !!toNext);
                    line.forEach(nt => pushH(nt.p + c0, nt.d, [nt.n], 0.5, { art: 'lin', free: true }));
                    if (line.length) st.lanes.mel = { n: line[line.length - 1].n };
                }
                continue;
            }
            // mélodie (ou « fill » de fin de phrase, plus dense et plus souvent en tierces)
            const fill = role === 'fill' || (phraseEnd && !!toNext);
            const pool = fill ? BR_BAIAO_FILL_RHYTHMS : (phraseEnd ? BR_BAIAO_END_RHYTHMS : BR_BAIAO_RHYTHMS);
            let rIdx = Math.floor(rng() * pool.length);
            if (!fill && !phraseEnd && rIdx === br.lastRhythm && pool.length > 1) rIdx = (rIdx + 1 + Math.floor(rng() * (pool.length - 1))) % pool.length;
            if (!fill && !phraseEnd) br.lastRhythm = rIdx;
            const rhythm = pool[rIdx];
            const contour = fill ? (rng() < 0.65 ? 'down' : 'up') : br.contours[u % br.contours.length];
            const from = st.lanes.mel ? st.lanes.mel.n : null;
            const half = (k) => segAt(c0 + k * slot).cs;
            const target = toNext || (phraseEnd ? half(7) : null);
            const line = brMelLine(env, half, target, from, rhythm, contour, rng, phraseEnd || !!toNext);
            const thirdsP = fill ? 0.75 : br.thirds;
            line.forEach((nt, k) => {
                const p = c0 + nt.p;
                const strong = nt.k % 4 === 0;
                const notes = [nt.n];
                if (rng() < thirdsP * (strong ? 1 : 0.6)) {
                    const lo = brScaleStep(env, half(nt.k), nt.n, -2);
                    if (lo !== null) notes.unshift(lo);
                }
                // appoggiature : petite note d'ornement juste avant une note longue (la note du dessus, dans la gamme)
                if (strong && nt.d >= 2 * slot && p >= 0.07 && rng() < br.orn) {
                    const up = brScaleStep(env, half(nt.k), nt.n, 1);
                    if (up !== null) pushH(p - 0.06, 0.07, [up], 0.42, { art: 'orn', noGinga: true, free: true });
                }
                const last = k === line.length - 1;
                const vel = (strong ? 0.66 : 0.56) + (nt.peak ? 0.06 : 0) + (last && phraseEnd ? 0.04 : 0);
                pushH(p, nt.d, notes, vel, { art: 'lin', free: last });
            });
            if (line.length) st.lanes.mel = { n: line[line.length - 1].n };
            // main gauche discrète sous la mélodie : accords courts sur le « e » des temps
            [2, 6].forEach(k => {
                if (rng() > br.lh) return;
                const p = P(c, k);
                const V = accOf(segAt(p).cs);
                pushH(p, 0.9 * slot, V.slice(0, 3).map(x => x - 12 >= 0 - off ? x - 12 : x), 0.34, { art: 'lin' });
            });
            if (c1 > bpb + 1e-6) break;
        }
        if (halves && !harm.some(e => e.art !== 'orn' && Math.abs(e.pos - segs[1].s) < 0.06)) pushH(segs[1].s, 0.5, accOf(segs[1].cs), 0.5, { art: 'lin' });
        // contrebasse : cellule du baião (noire pointée - double croche - noire), approche de l'accord suivant
        for (let c = 0; c < cycles; c++) {
            const tpl = BR_BASS['br-baiao'][(c === 1 || i % 2 === 1) && rng() < 0.5 ? br.bassAlt : br.bassIdx];
            tpl.forEach(([k, tok, d, v]) => {
                const p = P(c, k);
                const sg = segAt(p);
                const T = latBassTones(env, sg.cs);
                const follow = followOf(sg);
                let abs;
                if (Math.abs(sg.s - p) < 1e-6) abs = T.root;
                else if (tok === 'F') abs = T.fifth;
                else if (tok === 'O') abs = T.octave;
                else if (tok === 'A') abs = (follow && p >= sg.e - 0.5) ? popBassApproach(env, T.root, follow, rng) : T.fifth;
                else abs = T.root;
                bass.push({ pos: p, abs, dur: d * slot, vel: bvel(v), wide: true });
            });
        }
        // zabumba (bumbo et bacalhau), triangle
        for (let c = 0; c < cycles; c++) {
            const sd = side(c);
            add(P(c, 0), 'zab', (resolveAfterFill && c === 0) ? 0.95 : 0.86);
            add(P(c, 3), 'zab', 0.7);
            if (br.zabVar && sd === 'B') add(P(c, 6), 'zab', 0.56);
            else add(P(c, 4), 'zabm', 0.5);
            [[2, 0.34], [4, 0.62], [6, 0.42], [7, 0.3]].forEach(([k, v]) => { if (k !== 7 || rng() < 0.6 + 0.3 * I) add(P(c, k), 'bacal', v, k === 7); });
            for (let k = 0; k < 8; k++) {
                const open = (k % 4 === 2) || (br.triOpen && k % 4 === 3 && rng() < 0.5);
                add(P(c, k), open ? 'tri' : 'trim', open ? 0.5 : (k % 4 === 0 ? 0.36 : 0.24), !open && k % 2 === 1);
            }
        }
        if (doFill) {
            const b = fillFrom;
            pushF(b, 'zab', 0.84); pushF(b + 0.25, 'zab', 0.62); pushF(b + 0.5, 'zab', 0.7); pushF(b + 0.75, 'zab', 0.8);
            [0, 0.25, 0.5, 0.75].forEach((q, k) => pushF(b + q, k === 2 ? 'tri' : 'trim', 0.3 + 0.06 * k));
        }
    }

    // ======================= SAMBA-CANÇÃO =======================
    if (groove === 'br-cancao') {
        for (let c = 0; c < cycles; c++) {
            const sd = side(c);
            // pouce : fondamentale puis quinte, longues (la corde vibre)
            [0, 4].forEach(k => {
                const p = P(c, k);
                const sg = segAt(p);
                const T = latBassTones(env, sg.cs);
                const first = Math.abs(sg.s - p) < 1e-6;
                const note = brFoldThumb(env, (k === 4 && !first) ? T.fifth : T.root);   // pouce du violão : mi2 - mi3
                const withChord = br.texture !== 'arpejo' && k === 0 && rng() < 0.4;
                const ns = withChord ? [note].concat(vioOf(sg.cs)) : [note];
                pushH(p, 4 * slot, ns, k === 0 ? 0.7 : 0.64, { roll: withChord ? 0.03 : 0 });
            });
            if (br.texture === 'arpejo') {
                // arpejo : i - m - a puis a - m - i (ou variantes), notes laissées vibrer
                const order = sd === 'A' ? [[1, 0], [2, 1], [3, 2], [5, 2], [6, 1], [7, 0]] : [[1, 0], [2, 1], [3, 2], [5, 1], [6, 2], [7, 1]];
                order.forEach(([k, idx]) => {
                    const p = P(c, k);
                    const V = vioOf(csAt(p));
                    const n = V[Math.min(V.length - 1, idx)];
                    pushH(p, 3 * slot, [n], 0.52 + (idx === 2 ? 0.06 : 0));
                });
            } else {
                BR_CANCAO_FING[br.texture][sd].forEach(k => {
                    const p = P(c, k);
                    pushH(p, 2.5 * slot, vioOf(csAt(p)), 0.6, { dir: rng() < 0.6 ? 1 : -1, roll: 0.012 });
                });
            }
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].pos >= aPos - 1e-6) harm.splice(k, 1);
            pushH(aPos, 3 * slot, vioOf(nextStep), 0.62, { dir: -1, roll: 0.014 });
        }
        if (halves && !harm.some(e => Math.abs(e.pos - segs[1].s) < 0.05)) pushH(segs[1].s, 2 * slot, vioOf(segs[1].cs), 0.5);
        for (let c = 0; c < cycles; c++) {
            const tpl = BR_BASS['br-cancao'][(c === 1 || i % 2 === 1) && rng() < 0.5 ? br.bassAlt : br.bassIdx];
            tpl.forEach(([k, tok, d, v]) => {
                const p = P(c, k);
                const sg = segAt(p);
                const T = latBassTones(env, sg.cs);
                const follow = followOf(sg);
                let abs = T.root;
                if (Math.abs(sg.s - p) < 1e-6) abs = T.root;
                else if (tok === 'F') abs = T.fifth;
                else if (tok === 'A') abs = (follow && p >= sg.e - 2 * slot) ? popBassApproach(env, T.root, follow, rng) : T.fifth;
                bass.push({ pos: p, abs, dur: d * slot, vel: bvel(v), wide: true });
            });
            const sd = side(c);
            add(P(c, 0), 'surdom', 0.26);
            add(P(c, 4), 'surdo', 0.4);
            if (br.ganza) for (let k = 0; k < 8; k++) add(P(c, k), 'ganza', k % 4 === 3 ? 0.24 : (k % 2 ? 0.12 : 0.17), k % 2 === 1);
            if (br.aro) (sd === 'A' ? [3, 6] : [2, 5]).forEach(k => add(P(c, k), 'rim', 0.24));
        }
        if (doFill) {
            const b = fillFrom;
            pushF(b, 'surdo', 0.46); pushF(b + 3 * slot, 'rim', 0.3); pushF(b + 5 * slot, 'surdom', 0.32); pushF(b + 6 * slot, 'surdo', 0.42);
        }
    }

    // ======================= SAMBA-JAZZ =======================
    if (groove === 'br-sambajazz') {
        for (let c = 0; c < cycles; c++) {
            const sd = side(c);
            BR_SJ_PIANO[br.comp][sd].forEach(([k, d]) => {
                const p = P(c, k);
                pushH(p, d * slot, pnoOf(csAt(p)), k === 0 ? 0.58 : 0.64, { roll: 0.004 });
                if (br.doubles && k < 7 && rng() < 0.25) pushH(p + slot, slot * 0.9, pnoOf(csAt(p + slot)), 0.5, { roll: 0.004 });
            });
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].pos >= aPos - 1e-6) harm.splice(k, 1);
            pushH(aPos, slot * 3, pnoOf(nextStep), 0.7, { roll: 0.004 });
        }
        if (halves && !harm.some(e => Math.abs(e.pos - segs[1].s) < 0.05)) pushH(segs[1].s, slot * 1.5, pnoOf(segs[1].cs), 0.6);
        for (let c = 0; c < cycles; c++) {
            const tpl = BR_BASS['br-sambajazz'][(c === 1 || i % 2 === 1) && rng() < 0.5 ? br.bassAlt : br.bassIdx];
            tpl.forEach(([k, tok, d, v]) => {
                const p = P(c, k);
                const sg = segAt(p);
                const T = latBassTones(env, sg.cs);
                const follow = followOf(sg);
                let abs = T.root;
                if (Math.abs(sg.s - p) < 1e-6) abs = T.root;
                else if (tok === 'F') abs = T.fifth;
                else if (tok === 'O') abs = T.octave;
                else if (tok === 'A') abs = (follow && p >= sg.e - 2 * slot) ? popBassApproach(env, T.root, follow, rng) : T.fifth;
                bass.push({ pos: p, abs, dur: d * slot, vel: bvel(v), wide: true });
            });
            const sd = side(c);
            // cymbale (ride) ou charleston fermé en continu, accent sur la dernière case de chaque groupe
            for (let k = 0; k < 8; k++) add(P(c, k), br.ride ? 'ride' : 'hat', (k % 4 === 3 ? 0.48 : (k % 2 ? 0.26 : 0.34)) * (br.ride ? 0.8 : 1), k % 2 === 1);
            if (br.ride) add(P(c, 4), 'pedal', 0.3, true);
            // grosse caisse : « surdo » de la batterie (2e temps appuyé)
            [[0, 0.46], [3, 0.36], [4, 0.78], [7, 0.36]].forEach(([k, v]) => add(P(c, k), 'kick', v));
            // aro (cross-stick) sur le teleco-teco
            (sd === 'A' ? [0, 2, 5, 7] : [1, 3, 6]).forEach(k => add(P(c, k), 'rim', 0.4));
            if (br.ghosts) [1, 6].forEach(k => { if (rng() < 0.4) add(P(c, k), 'ghost', 0.18, true); });
        }
        if (resolveAfterFill) drums.push({ pos: 0, drum: 'crash', vel: 0.42 * dv, lay: 0 });
        if (doFill) {
            const b = fillFrom;
            const n = Math.round((bpb - b) / slot);
            const seq = ['snare', 'snare', 'tom1', 'tom1', 'tom2', 'tom2', 'tom3', 'snare'];
            for (let k = 0; k < n; k++) pushF(b + k * slot, seq[Math.floor(k * 8 / n)], 0.44 + 0.3 * k / Math.max(1, n - 1));
            pushF(b, 'kick', 0.6);
        }
    }

    harm.sort((a, b) => a.pos - b.pos);
    // basse : durées bornées par la note suivante, ginga sur les cases faibles
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.02 : bpb - b.pos - 0.02;
        b.dur = Math.max(0.1, Math.min(b.dur, limit));
        if (Math.abs(b.pos - Math.round(b.pos)) > 1e-6) b.pos = ginga(b.pos);
    });
    if (anticip && bass.length && rng() < 0.4) {
        for (let k = bass.length - 1; k >= 0; k--) if (bass[k].pos >= aPos - 1e-6) bass.splice(k, 1);
        bass.push({ pos: aPos, abs: latBassTones(env, nextStep).root, dur: 0.9, vel: bvel(0.66), wide: true });
    }
    // deuxième accord d'une mesure coupée : sa fondamentale à la basse
    if (halves && bass.length && !bass.some(b => Math.abs(b.pos - segs[1].s) < 0.05)) {
        bass.push({ pos: segs[1].s, abs: latBassTones(env, segs[1].cs).root, dur: Math.max(0.3, bpb - segs[1].s - 0.05), vel: bvel(0.8), wide: true });
        bass.sort((a, b) => a.pos - b.pos);
    }
    drums.sort((a, b) => a.pos - b.pos);
    env.state.brState = st;

    const out = { piano: harm, bass: BR_NO_BASS[groove] ? [] : bass, drums };
    if (BR_HARMONY[groove] === 'guitar') out.classicalGuitar = true;
    else if (BR_HARMONY[groove] === 'accordion') out.accordion = true;
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BRASIL_GROOVES, BR_CUT, BR_HARMONY, BR_NO_BASS, BR_CHORO_CAV, BR_PARTIDO, BR_SANFONA, BR_BAIAO_RHYTHMS, BR_BAIAO_END_RHYTHMS, BR_BAIAO_FILL_RHYTHMS, BR_BAIAO_ROLES, brScaleStep, brMelLine, BR_CANCAO_FING, BR_SJ_PIANO, BR_BASS,
        brasilPhraseExtras, brFold7, brFoldThumb, brBaixaria, buildBrasilPlan };
}
