// band/rock-plan.js — arrangements Rock de l'orchestre Pop-Rock : batterie rock (grosse caisse, caisse claire, toms réalistes), basse,
// guitare électrique (accords, ponctuations, arpèges), orgue, cordes, tambourin. Chargé par index.html via
// <script src="app/band/rock-plan.js"> (après band/band-helpers.js, avant band/pop-plan.js) et testé par band/rock-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env`, comme dans band/pop-plan.js :
//   env.transOffset, env.findChordObj(id), env.state (mémoire entre deux mesures : rockStrV, rockPad, bandLastFill).
//
// Deux usages :
//  · le Pop-Rock « ordinaire » (aucun rythme imposé) reçoit des COUCHES en plus de son piano / sa basse / sa batterie :
//    guitare électrique, orgue, cordes, tambourin, selon l'énergie de la phrase (popLayers) ;
//  · un GROOVE rock (r-roll, r-classic, r-hard, r-punk, r-ballad, r-blues, r-indie) réécrit la basse et la batterie et règle la
//    guitare, l'orgue et les cordes pour ce style (buildRockPlan, qui part du plan Pop-Rock pour le piano).
//
// Les événements des instruments mélodiques sont rangés dans plan.piano avec un champ `inst` ('piano', 'gtr', 'organ', 'strings') :
// le moteur les aiguille (playRockHit) ; plan.rock = true les signale, plan.tone règle l'ampli de la guitare (audio/rock-synths.js).
// Convention des hauteurs, comme pour le piano : demi-tons écrits au-dessus de do3 (rootIndex 0), transposés par le moteur.

if (typeof popBassTones === 'undefined' && typeof require === 'function') {
    var { popBassTones, popBassApproach, popVoicing } = require('./band-helpers.js');
}

const ROCK_GROOVES = ['r-roll', 'r-classic', 'r-hard', 'r-punk', 'r-ballad', 'r-blues', 'r-indie'];
function isRockGroove(g) { return ROCK_GROOVES.includes(g); }

// ---- écriture rythmique compacte : une mesure = 16 doubles croches ; les espaces sont ignorés ----
// rkVel : '.' silence, '1' à '9' = force du coup (1/9 à 1).
function rkVel(str) {
    const out = []; let k = 0;
    for (const ch of String(str).replace(/\s+/g, '')) { if (ch >= '1' && ch <= '9') out.push([k * 0.25, +ch / 9]); k++; }
    return out;
}
// rkSym : un symbole par double croche ; '-' prolonge le symbole précédent ; '.' silence.
function rkSym(str) {
    const chars = [...String(str).replace(/\s+/g, '')]; const out = [];
    chars.forEach((ch, k) => {
        if (ch === '.' || ch === '-') return;
        let n = 1; while (chars[k + n] === '-') n++;
        out.push({ pos: k * 0.25, sym: ch, dur: n * 0.25 });
    });
    return out;
}
const pickOf = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// ---------------------------------------------------------------------------------------------------------------------
// Les grooves : tout ce qui change d'un style rock à l'autre est ici (données), les générateurs plus bas sont communs.
//   tempo    tempo habituel (pour le menu Orchestre) ;  swing   croches (0,5 = droites ; 0,62 = rock'n'roll ; 0,667 = shuffle)
//   arc      énergie de chaque phrase d'une grille de quatre phrases (couplet, couplet, refrain, refrain)
//   drums    time = charleston / ride (lo = couplet, hi = refrain), kick, snare, ghost, open (doubles croches du charleston ouvert)
//   bass     motifs de basse (lo / hi) ; guitar  mode et motifs (lo / hi) ; keys, strings, tmb : couches
// ---------------------------------------------------------------------------------------------------------------------
const ROCK = {
    'r-classic': {
        tempo: 118, swing: 0.5, arc: [0.4, 0.5, 0.78, 0.9], upright: false,
        drums: {
            lo: { time: ['hat', ['7.5.6.5.7.5.6.5.', '7.4.6.4.7.4.6.5.']], kick: ['9.......8.7.....', '9.....7.8.......', '9.......8.....7.'], snare: '....9.......9...', ghost: ['.......3.......3', '......3.......3.'] },
            hi: { time: ['hat', ['8.6.7.6.8.6.7.6.', '8.6.7.6.8.6.7.7.']], kick: ['9.....7.8.7.....', '9.7...7.8.....7.', '9.......8.7...7.'], snare: '....9.......9...', ghost: ['.......3.......3'], open: [14] }
        },
        bass: { lo: ['R-R.R.R.R-R.R.F.', 'R---..R.R-R.F-A.', 'R-----R.R-----F.'], hi: ['R.R.R.R.R.R.R.F.', 'R-R.R.O.R-R.R.F.', 'R.R.R.R.R.R.R.A.'] },
        // Guitare des années 70 : la main droite ne s'arrête jamais (huitièmes de base), mais tous les coups ne sonnent pas ; chaque phrase
        // enchaîne plusieurs motifs (voir ph.gtrSeq) que `varyGuitar` détend encore d'une mesure à l'autre (coups manqués, grattés sourds,
        // accords tenus, reprise sus4, arpège de temps en temps). `pats` : plusieurs motifs de 16 doubles croches (D bas, U haut, x/X sourds).
        guitar: { lo: { mode: 'strum', shape: 'full', tone: 'clean', vary: 'classic', arpBar: ['0 1 2 3 4 3 2 1', '0 2 1 3 2 4 3 2', '0 1 2 4 2 3 2 1'],
                        pats: ['D...D.U...U.D.U.', 'D...D.UU..U.D.U.', 'D---..U.D.U.D.U.', 'D.....U.D.U..xU.', 'D-----U.D.U.D...', 'D.D.D.U.D.U.D.U.', 'D-------D.U.D.U.', 'D.x.D.U.x.U.D.xU', 'D...D...D.U.D.U.'] },
                  hi: { mode: 'strum', shape: 'power4', tone: 'drive', vary: 'classic',
                        pats: ['D.D.D.D.D.D.D.D.', 'D---D.D.D---D.D.', 'D.D.DUD.D.D.D.DU', 'D...D.D.D...D.D.', 'D-----D.D.D.D-D.', 'D...D.D.D-----D.', 'D.D.D...D.D.D.D.', 'D-------D.D.D.DU'] } },
        keys: { lo: 'stab', hi: 'stab' }, organ: { lo: null, hi: 'pad' }, strings: { lo: null, hi: null }, tmb: { lo: null, hi: 'eighths' }
    },
    'r-hard': {
        tempo: 132, swing: 0.5, arc: [0.55, 0.62, 0.86, 0.96], upright: false,
        drums: {
            lo: { time: ['hat', ['8.6.7.6.8.6.7.6.']], kick: ['9.....9.8.....9.', '9.9...9.8.9...9.'], snare: '....9.......9...', ghost: [] },
            hi: { time: ['ride', ['9.6.7.6.9.6.7.6.']], kick: ['9.9.9.9.9.9.9.9.', '9.9...9.9.9...9.', '9.9.9...9.9.9.9.'], snare: '....9.......9...', ghost: [], open: [] }
        },
        bass: { lo: ['R.R.R.R.R.R.R.R.', 'R.R.R.O.R.R.R.F.', 'R.RRR.RRR.RRR.R.'], hi: ['R.R.R.R.R.R.R.R.', 'R.R.R.R.R.R.R.A.', 'R.RRR.RRR.RRR.RA'] },
        // Guitare hard rock : peu de notes, longues. Accords de puissance tenus (un temps, deux temps, la mesure), quelques croches étouffées
        // seulement pour lancer un accord (riffs à la Deep Purple, AC/DC, Black Sabbath : « 3 + 3 + 2 » de Smoke on the Water, accord de
        // deux temps après un tronçonnage…). `hold` : l'accord peut durer six temps, au-delà de la barre de mesure (voir rockGuitar).
        guitar: { lo: { mode: 'chug', shape: 'power', tone: 'heavy', vary: 'hard', hold: 0.3,
                        pats: ['P-------P-------', 'P-----P-----P---', 'M.M.M.M.P-------', 'P---P---P-------', 'P-------M.M.P---', 'P---M.M.P-------', 'P---------------', 'P---P-----P-----'] },
                  hi: { mode: 'strum', shape: 'power4', tone: 'heavy', vary: 'hard', hold: 0.5,
                        pats: ['P-----P-----P---', 'P-------P---P---', 'P---------------', 'P-----P-P-------', 'P---P---P-------', 'P-------P-----P-', 'P---P-----P-----', 'P-------P-------'] } },
        keys: { lo: null, hi: null }, organ: { lo: 'pad', hi: 'swell' }, strings: { lo: null, hi: null }, tmb: { lo: null, hi: null }, organFull: true
    },
    'r-punk': {
        tempo: 176, swing: 0.5, arc: [0.8, 0.85, 0.92, 1], upright: false,
        drums: {
            lo: { time: ['hat', ['8.6.8.6.8.6.8.6.']], kick: ['9.......9.......', '9.....9.9.......', '9...9...9...9...'], snare: '....9.......9...', ghost: [] },
            hi: { time: ['hat', ['9.7.9.7.9.7.9.7.']], kick: ['9.......9.9.....', '9.....9.9.....9.', '9...9...9.9.9...'], snare: '....9.......9...', ghost: [], open: [14] }
        },
        bass: { lo: ['R.R.R.R.R.R.R.R.', 'R.R.R.R.R.R.R.F.'], hi: ['R.R.R.R.R.R.R.R.', 'R.R.R.R.R.R.R.A.'] },
        // Guitare punk : accords de puissance en coups descendants, mais simples et qui sonnent (noires et croches, chaque coup rend la
        // main au suivant sans trou : pas d'effet mitraillette). Ça varie par le choix des motifs d'une phrase, les accents déplacés,
        // les coups qui manquent et les accords tenus, jamais par des petites notes sèches.
        guitar: { lo: { mode: 'strum', shape: 'power', tone: 'drive', vary: 'punk',
                        pats: ['D---D---D---D---', 'D---D---D-D-D---', 'D---D-D-D---D-D-', 'D-----D-D---D---', 'D---D---D-----D-', 'D-D-D---D-D-D---'] },
                  hi: { mode: 'strum', shape: 'power', tone: 'drive', vary: 'punk',
                        pats: ['D---D---D---D---', 'D---D-D-D---D-D-', 'D-D-D-D-D-D-D-D-', 'D-----D-D---D---', 'D---D---D-D-D---', 'D-D-D---D-D-D---', 'D---D---D-----D-'] } },
        keys: { lo: null, hi: null }, organ: { lo: null, hi: null }, strings: { lo: null, hi: null }, tmb: { lo: null, hi: null }
    },
    'r-ballad': {
        tempo: 68, swing: 0.5, arc: [0.3, 0.42, 0.78, 0.95], upright: false,
        drums: {
            lo: { time: ['hat', ['5.3.4.3.5.3.4.3.', '4...3...4...3...']], kick: ['9.......7.......', '9.....7.........'], snare: '........9.......', ghost: [], rim: true },
            hi: { time: ['ride', ['7.5.6.5.7.5.6.5.', '8.5.6.5.7.5.7.5.']], kick: ['9.....7.8.7.....', '9.......8.7...7.'], snare: '....9.......9...', ghost: ['.......3.......3'], open: [14] }
        },
        bass: { lo: ['R-------R-------', 'R-----..F-----..', 'R-------F---O---'], hi: ['R-R.R.R.R-R.R.F.', 'R---..R.R-R.F-A.'] },
        guitar: { lo: { mode: 'arp', shape: 'full', tone: 'clean', pats: ['0 1 2 3 4 3 2 1', '0 2 1 3 2 4 3 2'] },
                  hi: { mode: 'strum', shape: 'power4', tone: 'drive', pats: ['D---..D.D---.UD.', 'D-------D-----U.'] } },
        keys: { lo: 'ballad', hi: 'pad' }, organ: { lo: null, hi: 'swell' }, strings: { lo: 'pad', hi: 'swell' }, tmb: { lo: null, hi: null }
    },
    'r-blues': {
        tempo: 100, swing: 0.667, arc: [0.5, 0.58, 0.72, 0.85], upright: false,
        drums: {
            lo: { time: ['hat', ['8.5.7.5.8.5.7.5.', '8...6.5.8...6.5.']], kick: ['9.......8.....5.', '9.......8.7.....'], snare: '....9.......9...', ghost: ['......3.......3.'] },
            hi: { time: ['ride', ['8.5.7.5.8.5.7.5.', '8...7.5.8...7.5.']], kick: ['9.....5.8.......', '9.......8.7...5.'], snare: '....9.......9...', ghost: ['......3.......3.', '......3.....3...'] }
        },
        bass: { lo: ['R...T...F...6...', 'R...F...6...7...', 'R.R.F.F.6.6.F.F.'], hi: ['R.R.F.F.6.6.F.F.', 'R...T...F...6...', 'R.R.T.T.F.F.6.A.'] },
        // Dyades de boogie + de temps en temps une phrase de guitare solo sur les deux derniers temps (licks : voir BLUES_LICKS)
        guitar: { lo: { mode: 'boogie', shape: 'dyad', tone: 'crunch', licks: 0.4, pats: ['5 5 6 6 7 7 6 6', '5 6 5 6 5 6 5 6', '5 6 7 6 5 6 7 6'] },
                  hi: { mode: 'boogie', shape: 'dyad', tone: 'drive', licks: 0.55, pats: ['5 5 6 6 7 7 6 6', '5 6 7 6 5 6 7 6'] } },
        keys: { lo: 'stab', hi: 'stab' }, organ: { lo: 'pad', hi: 'pad' }, strings: { lo: null, hi: null }, tmb: { lo: null, hi: null }, leslieFast: true
    },
    // Rock'n'roll des années 50 : pas de guitare électrique (piano, contrebasse, batterie). La contrebasse mène : lignes qui marchent
    // (fondamentale, tierce, quinte, sixte, septième…), accents sur les temps 2 et 4 comme en slap, course vers l'accord suivant en fin
    // de phrase, un peu plus de niveau (gainMul) ; la batterie se met légèrement en retrait (mix). Le piano garde son jeu d'origine (boogie).
    'r-roll': {
        tempo: 160, swing: 0.62, arc: [0.55, 0.62, 0.78, 0.88], upright: true, bassLead: true, guitar: null,
        mix: { drums: 0.84 },
        drums: {
            lo: { time: ['hat', ['8.6.8.6.8.6.8.6.']], kick: ['9.......9.......', '9.......9.....5.'], snare: '....9.......9...', ghost: [] },
            hi: { time: ['hat', ['9.7.9.7.9.7.9.7.']], kick: ['9.......9.....6.', '9.....5.9.......'], snare: '....9.......9...', ghost: [], clap: true }
        },
        bass: { lo: ['R...T...F...6.A.', 'R.T.F.6.7.6.F.T.', 'R.R.F.F.6.6.F.F.', 'R---..T.F---..6.', 'R...F...6...7.A.'],
                hi: ['R.T.F.6.7.6.F.T.', 'R.R.F.F.6.6.F.F.', 'R.T.F.6.O.6.F.A.', 'R.R.T.F.6.7.6.A.'] },
        keys: { lo: 'boogie', hi: 'boogie' }, organ: { lo: null, hi: null }, strings: { lo: null, hi: null }, tmb: { lo: null, hi: null }
    },
    'r-indie': {
        tempo: 124, swing: 0.5, arc: [0.45, 0.52, 0.8, 0.9], upright: false,
        drums: {
            lo: { time: ['hat', ['7.5.7.5.7.5.7.5.', '7.5.6.5.7.5.6.5.']], kick: ['9.....7...9...7.', '9.......8.7.....'], snare: '....9.......9...', ghost: ['.......3.......3'] },
            hi: { time: ['hat', ['8.6.8.6.8.6.8.6.']], kick: ['9.....7...9...7.', '9.7...7.8.7...7.'], snare: '....9.......9...', ghost: ['.......3.......3'], open: [6, 14] }
        },
        bass: { lo: ['R.R.R.RFR.R.R.F.', 'R-R.R.R.R-R.F.O.'], hi: ['R.R.R.RFR.R.R.F.', 'R.R.RRR.R.R.R.FA', 'R.R.R.O.R.R.F.R.'] },
        guitar: { lo: { mode: 'jangle', shape: 'high', tone: 'clean', pats: ['D.xU.UxUD.xU.UxU', 'D.DU.U.UD.DU.U.U'] },
                  hi: { mode: 'strum', shape: 'full', tone: 'crunch', pats: ['D.D.D.D.D.D.D.D.', 'D.DUD.DUD.DUD.DU'] } },
        keys: { lo: 'pad', hi: 'comp' }, organ: { lo: null, hi: 'swell' }, strings: { lo: null, hi: null }, tmb: { lo: 'eighths', hi: 'eighths' }
    }
};
// ---------------------------------------------------------------------------------------------------------------------
// Caractère d'une phrase rock : énergie (arc couplet → refrain), motifs choisis une fois pour la phrase.
// base = extras Pop-Rock déjà calculés pour la phrase (piano, intensité…) ; renvoie les champs à ajouter.
// ---------------------------------------------------------------------------------------------------------------------
function rockPhraseExtras(rng, prev, index, groove, base) {
    const G = ROCK[groove];
    const arcI = G.arc[((index % 4) + 4) % 4];
    const I = Math.max(0.25, Math.min(1, arcI + (rng() - 0.5) * 0.1));
    const hi = I >= 0.62;
    const keep = !!(prev && prev.rockGroove === groove && rng() < 0.45);   // un riff qui revient : la phrase reprend celui de la précédente
    const lvl = hi ? 'hi' : 'lo';
    const pickIdx = (n, prevIdx) => (keep && prevIdx !== undefined) ? prevIdx % n : Math.floor(rng() * n);
    const gc = G.guitar ? G.guitar[lvl] : null;   // null : rythme sans guitare électrique (rock'n'roll des années 50)
    return {
        intensity: I,
        rockGroove: groove, rockHi: hi,
        gtrPat: gc ? pickIdx(gc.pats.length, prev && prev.gtrPat) : 0,
        ...(gc && gc.vary ? guitarLife(rng, keep ? prev : null, gc) : {}),
        bassPat: pickIdx(G.bass[lvl].length, prev && prev.bassPat),
        kickPat: pickIdx(G.drums[lvl].kick.length, prev && prev.kickPat),
        timePat: pickIdx(G.drums[lvl].time[1].length, prev && prev.timePat),
        ghostOn: rng() < 0.55,
        fill: rng() < 0.8, fillKind: Math.floor(rng() * 7),
        crashStart: rng() < 0.9,
        organKind: G.organ[lvl], stringsKind: G.strings[lvl], tmbKind: G.tmb[lvl], keysKind: G.keys[lvl],
        gtrTone: gc ? gc.tone : 'clean',
        leslie: (hi && G.leslieFast) || (G.organFull && hi) ? 'fast' : 'slow',
        pianoOn: !(groove === 'r-hard' || groove === 'r-punk'),
        lift: index > 0 && ((G.arc[index % 4] - G.arc[(index + 3) % 4]) > 0.18),
        feel: 'eighths', halfTime: false, hat16: false
    };
}

// Guitare « vivante » (cfg.vary) : le déroulé des motifs de la phrase, l'éventuel accord tenu au-delà de la barre de mesure et la mesure
// d'arpège. Tirés une fois par phrase (reproductibles) ; une phrase qui reprend le riff de la précédente en garde le déroulé.
const GTR_SEQS = [[0, 1, 0, 2], [0, 0, 1, 2], [0, 1, 1, 2], [0, 1, 2, 1], [0, 1, 0, 1], [0, 0, 1, 0]];
function guitarLife(rng, prev, gc) {
    const seq = prev && prev.gtrSeq ? prev.gtrSeq : GTR_SEQS[Math.floor(rng() * GTR_SEQS.length)];
    const out = { gtrSeq: seq, gtrHoldOn: !!gc.hold && rng() < gc.hold, gtrHoldAt: rng() < 0.6 ? 0 : 2 };   // gtrHoldAt : mesure de la phrase qui porte l'accord tenu
    if (gc.arpBar) out.gtrArp = rng() < 0.3 ? 1 + Math.floor(rng() * 2) : -1;   // numéro de la mesure jouée en arpège (-1 : aucune)
    return out;
}

// Couches du Pop-Rock « ordinaire » (aucun groove imposé), choisies avec l'énergie I de la phrase : guitare, orgue, cordes, tambourin.
function popLayerExtras(rng, I, index, prev) {
    const hi = I >= 0.6, mid = I >= 0.42;
    const r = rng();
    const gtrKind = hi ? (r < 0.55 ? 'strum' : (r < 0.8 ? 'chug' : 'arp')) : (mid ? (r < 0.35 ? 'arp' : (r < 0.7 ? 'chop' : 'strum')) : (r < 0.5 ? null : 'arp'));
    return {
        layGtr: gtrKind,
        layGtrTone: hi ? (rng() < 0.55 ? 'crunch' : 'clean') : 'clean',
        layGtrPat: Math.floor(rng() * 3),
        layOrgan: hi ? (rng() < 0.45 ? 'pad' : null) : (mid && rng() < 0.18 ? 'swell' : null),
        layStrings: (I >= 0.7 && rng() < 0.6) || (I < 0.45 && rng() < 0.12) ? (hi ? 'swell' : 'pad') : null,
        layTmb: hi ? (rng() < 0.6 ? 'eighths' : 'quarters') : (mid && rng() < 0.2 ? 'quarters' : null),
        layLeslie: rng() < 0.3 ? 'fast' : 'slow'
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Contexte d'une mesure : segments d'accord, anticipation, accord à une position donnée
// ---------------------------------------------------------------------------------------------------------------------
function rockCtx(env, step, nextStep, isLastMeasureOfStep, halves, anticip) {
    const segs = halves ? [{ s: 0, e: 2, cs: halves[0] }, { s: 2, e: 4, cs: halves[1] }] : [{ s: 0, e: 4, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const same = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId;
    const changeNext = !!nextStep && isLastMeasureOfStep && !same(lastSeg.cs, nextStep);
    const ant = !!anticip && changeNext;
    return {
        env, segs, lastSeg, nextStep, changeNext, anticip: ant,
        csAt: (pos) => (ant && pos >= 3.5 - 1e-6) ? nextStep : (halves && pos >= 2 - 1e-6 ? segs[1].cs : segs[0].cs),
        segEnd: (pos) => (ant && pos >= 3.5 - 1e-6) ? 4.9 : ((halves && pos < 2 - 1e-6) ? 2 : (ant ? 3.5 : 4)),
        follow: (si) => si < segs.length - 1 ? segs[si + 1].cs : (changeNext ? nextStep : null)
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Basse
// ---------------------------------------------------------------------------------------------------------------------
function rockBassTones(env, cs) {
    const T = popBassTones(env, cs);
    const off = env.transOffset;
    const fit = (x) => { let a = x; while (a + off > 11) a -= 12; while (a + off < -8) a += 12; return a; };
    return { ...T, six: fit(T.root + 9), flat7: fit(T.root + 10) };
}

const BASS_RUNS = [['F', '6', '7', 'A'], ['T', 'F', '6', 'A'], ['O', '7', '6', 'A'], ['F', 'T', 'R', 'A']];
function rockBass(c, ph, G, lvl, i, isTurn, rng) {
    const lead = !!G.bassLead;   // la basse mène (rock'n'roll des années 50) : plus de niveau, accents sur les temps 2 et 4, course de fin de phrase
    const leadMul = lead ? { gainMul: 1.18 } : {};
    const pats = G.bass[lvl];
    const baseIdx = ph.bassPat % pats.length;
    const idx = (i > 0 && !isTurn && rng() < 0.2) ? (baseIdx + 1) % pats.length : (isTurn && rng() < 0.5 ? (baseIdx + pats.length - 1) % pats.length : baseIdx);
    const out = [];
    c.segs.forEach((sg, si) => {
        const T = rockBassTones(c.env, sg.cs);
        const follow = c.follow(si);
        const approach = follow ? popBassApproach(c.env, T.root, follow, rng) : null;
        const resolve = (sym) => ({ R: T.root, r: T.root, F: T.fifth, T: T.third, '7': T.flat7, '6': T.six, O: T.octave, A: approach !== null ? approach : T.fifth })[sym];
        const len = sg.e - sg.s;
        let notes = len >= 4 ? rkSym(pats[idx]) : [{ pos: 0, sym: 'R', dur: 1.9 }].concat(follow && rng() < 0.5 ? [{ pos: 1.5, sym: 'A', dur: 0.45 }] : []);
        if (lead && len >= 4 && isTurn && follow && rng() < 0.7) {   // la basse « monte » vers l'accord suivant sur les deux derniers temps
            const run = BASS_RUNS[Math.floor(rng() * BASS_RUNS.length)];
            notes = notes.filter(n => n.pos < 2).concat(run.map((sym, k) => ({ pos: 2 + k * 0.5, sym, dur: 0.5 })));
        }
        notes.forEach(n => {
            let abs = resolve(n.sym);
            if (abs === undefined) return;
            if (n.sym === 'A' && !follow) abs = T.fifth;
            const beatPos = n.pos % 1 === 0;
            const accent = lead ? (beatPos ? (n.pos % 2 === 1 ? 1 : 0.94) : 0.84) : (beatPos ? (n.pos === 0 ? 1 : 0.9) : 0.78);
            out.push({
                pos: sg.s + n.pos, abs, tok: n.sym,
                dur: Math.max(0.12, Math.min(n.dur * 0.97, sg.e - (sg.s + n.pos) + 0.05)),
                vel: Math.min(1, (lead ? 0.84 + 0.16 * ph.intensity : 0.68 + 0.3 * ph.intensity) * accent * (n.sym === 'r' ? 0.5 : 1) * (0.94 + rng() * 0.1)),
                wide: true, ...leadMul
            });
        });
    });
    if (c.anticip) {
        for (let k = out.length - 1; k >= 0; k--) if (out[k].pos >= 3.5 - 1e-6) out.splice(k, 1);
        out.push({ pos: 3.5, abs: rockBassTones(c.env, c.nextStep).root, tok: 'nR', dur: 1.2, vel: 0.72 + 0.12 * ph.intensity, wide: true, ...leadMul });
    }
    out.sort((a, b) => a.pos - b.pos);
    out.forEach((b, k) => {   // une note de basse s'arrête quand la suivante commence
        const nx = out[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.02 : (b.tok === 'nR' ? 1.2 : 4 - b.pos - 0.03);
        b.dur = Math.max(0.1, Math.min(b.dur, limit));
    });
    return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Batterie
// ---------------------------------------------------------------------------------------------------------------------
// Roulements et breaks de fin de phrase : [position, tambour, force]
const ROCK_FILLS = [
    () => [[3, 'rghost', 0.5], [3.25, 'rghost', 0.55], [3.5, 'rsnare', 0.7], [3.75, 'rsnare', 0.86]],
    () => [[2, 'rsnare', 0.7], [2.5, 'rtom1', 0.7], [3, 'rtom2', 0.76], [3.5, 'rtom3', 0.86]],
    () => [[3, 'rtom1', 0.62], [3.25, 'rtom1', 0.58], [3.5, 'rtom2', 0.72], [3.75, 'rtom3', 0.84]],
    () => ['rtom1', 'rtom2', 'rtom1', 'rtom1', 'rtom2', 'rtom1', 'rtom3', 'rtom3'].map((d, k) => [2 + k * 0.25, d, 0.5 + 0.045 * k]),
    () => [[3.5, 'rsnare', 0.72], [3.5, 'rkick', 0.8], [3.75, 'rsnare', 0.86]],
    () => [[2, 'rtom3', 0.7], [2.5, 'rtom4', 0.75], [3, 'rtom4', 0.82], [3.5, 'rtom3', 0.9], [3.5, 'rkick', 0.75]],
    () => [[2.5, 'rsnare', 0.6], [3, 'rtom1', 0.7], [3.25, 'rtom2', 0.74], [3.5, 'rtom3', 0.8], [3.75, 'rtom4', 0.9]]
];
const ROCK_FILL_KINDS = {
    'r-classic': [0, 1, 2, 4, 6], 'r-hard': [3, 1, 2, 5], 'r-punk': [0, 4, 1], 'r-ballad': [5, 2, 1, 6], 'r-blues': [0, 1, 4], 'r-roll': [0, 4, 1], 'r-indie': [1, 2, 4, 6]
};

function rockDrums(c, ph, G, lvl, groove, i, L, isTurn, bass, rng, env) {
    const D = G.drums[lvl];
    const I = ph.intensity;
    const prog = L > 1 ? i / (L - 1) : 0;
    const dv = 0.82 * (0.72 + 0.3 * I) * (0.92 + 0.08 * prog) * (G.mix ? G.mix.drums : 1);   // le kit rock est plus plein que l'ancien : un peu moins fort à vélocité égale
    const out = [];
    const add = (pos, drum, vel, lay) => out.push({ pos, drum, vel: Math.max(0.06, Math.min(1, vel * dv)), lay: lay || 0 });
    const jit = () => (rng() - 0.5) * 0.1;
    const doFill = isTurn && ph.fill;
    const kinds = ROCK_FILL_KINDS[groove];
    const fillEvents = doFill ? ROCK_FILLS[kinds[ph.fillKind % kinds.length]]() : [];
    const fillFrom = fillEvents.length ? Math.min(...fillEvents.map(e => e[0])) : 99;

    // départ de phrase : crash après un fill ou un changement d'énergie
    if (i === 0) {
        const want = env.state.bandLastFill ? 0.85 : (ph.lift ? 0.7 : (lvl === 'hi' && ph.crashStart ? 0.4 : 0));
        if (want && rng() < want) add(0, 'crash', 0.82);
        env.state.bandLastFill = false;
    }
    if (isTurn) env.state.bandLastFill = doFill;

    // charleston / ride
    const [timeDrum, timePats] = D.time;
    const timePat = rkVel(timePats[ph.timePat % timePats.length]);
    const openAt = new Set((D.open || []).map(s => s * 0.25));
    timePat.forEach(([p, v]) => {
        if (p >= fillFrom - 1e-6) return;
        if (timeDrum === 'hat' && p % 1 !== 0 && rng() < 0.05) return;                 // le charleston respire
        const open = timeDrum === 'hat' && openAt.has(p) && rng() < 0.2 + 0.4 * I;
        add(p, open ? 'ohat' : timeDrum, v + jit(), 0.002);
    });

    // caisse claire : temps arrière (un peu en retard sur le temps : le jeu « posé » d'un vrai batteur), notes fantômes
    const snareDrum = D.rim ? 'rim' : 'rsnare';
    rkVel(D.snare).forEach(([p, v]) => { if (p < fillFrom - 1e-6) add(p, snareDrum, (p === 3 ? v : v * 0.96) + (rng() - 0.5) * 0.08, 0.008); });
    if (D.clap) rkVel(D.snare).forEach(([p, v]) => { if (p < fillFrom - 1e-6 && rng() < 0.7) add(p, 'clap', v * 0.55, 0.01); });
    if (ph.ghostOn && D.ghost && D.ghost.length && I > 0.45) {
        rkVel(D.ghost[(ph.kickPat + i) % D.ghost.length]).forEach(([p, v]) => { if (p < fillFrom - 1e-6 && rng() < 0.75) add(p, 'rghost', v * 0.9, 0.006); });
    }

    // grosse caisse : motif du groove, un peu varié d'une mesure à l'autre, ou calée sur la basse pour les grooves à croches de basse
    const kicks = D.kick;
    const kIdx = (i > 0 && !isTurn && rng() < 0.3) ? (ph.kickPat + 1) % kicks.length : ph.kickPat % kicks.length;
    rkVel(kicks[kIdx]).forEach(([p, v]) => { if (p < fillFrom - 1e-6) add(p, 'rkick', v * (0.9 + 0.1 * I)); });
    if (c.anticip && fillFrom > 3.5) add(3.5, 'rkick', 0.72);

    // rim click / tambourin / ride-bell : couches du groove
    if (ph.tmbKind && fillFrom > 3.9) {
        if (ph.tmbKind === 'eighths') for (let p = 0.5; p < 4; p += 1) add(p, 'tmbs', 0.42 + rng() * 0.08);
        else [1, 3].forEach(p => add(p, 'tmb', 0.5));
    }
    fillEvents.forEach(([p, d, v]) => add(p, d, v + (rng() - 0.5) * 0.06, d === 'rkick' ? 0 : 0.004));
    out.sort((a, b) => a.pos - b.pos);
    return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Guitare électrique
// ---------------------------------------------------------------------------------------------------------------------
// Fondamentale de l'accord dans le registre de la guitare (de mi grave à ré aigu, écrit dans les hauteurs du moteur).
function gtrRoot(env, cs) {
    const n = env.findChordObj(cs.chordId).notes;
    let r = cs.rootIndex + (n[0] || 0);
    const off = env.transOffset;
    while (r + off > 3) r -= 12;
    while (r + off < -8) r += 12;
    return r;
}

// Forme d'accord de guitare : 'dyad' (fondamentale + quinte), 'power' (+ octave), 'power4', 'full' (accord complet de barré), 'high' (cordes aiguës).
function gtrShape(env, cs, kind) {
    const n = env.findChordObj(cs.chordId).notes;
    const r0 = n[0] || 0;
    const rel = (k, d) => ((((n[k] !== undefined ? n[k] : d) - r0) % 12) + 12) % 12;
    const t = rel(1, 4), f = rel(2, 7), sv = n.length >= 4 ? rel(3, 10) : null;
    const seventh = (sv !== null && (sv === 9 || sv === 10 || sv === 11)) ? sv : null;
    const R = gtrRoot(env, cs);
    switch (kind) {
        case 'dyad': return [R, R + f];
        case 'power': return [R, R + f, R + 12];
        case 'power4': return [R, R + f, R + 12, R + 12 + f];
        case 'high': return [R + 12, R + 12 + f, R + 24, R + 24 + t];
        case 'third': return [R + 12 + t];                                                  // la tierce seule (retombée du sus4)
        case 'sus4': return (f === 7 && (t === 3 || t === 4)) ? [R, R + 7, R + 12, R + 17, R + 19] : null;   // null : accord sans quinte juste
        default: return seventh !== null ? [R, R + f, R + seventh, R + 12 + t] : [R, R + f, R + 12, R + 12 + t, R + 12 + f];
    }
}

// Détend un motif de guitare d'une mesure à l'autre (cfg.vary : 'classic' années 70, 'hard' hard rock, 'punk'). evs = événements de rkSym
// ({ pos, sym, dur }) ; k = { rng, i, isTurn, fill, hi }. Renvoie la liste modifiée (acc : coefficient d'accent propre au coup).
//  · classic : coups montants manqués ou remplacés par un gratté sourd, relances en double croche, accords tenus jusqu'au coup suivant,
//    retombée sus4 → tierce sur le premier accord du couplet ;
//  · hard    : les accords s'allongent jusqu'au coup suivant ou, au contraire, se raccourcissent ; le dernier peut sonner jusqu'à la fin ;
//  · punk    : grattés sourds et paumes étouffées sur quelques contretemps (couplet), relance en doubles croches, accords de refrain tenus ;
//  · avec un roulement (fin de phrase), la guitare laisse sonner le dernier accord au lieu de continuer à jouer sous la batterie.
function varyGuitar(evs0, kind, k) {
    const { rng, i, isTurn, fill, hi } = k;
    let evs = evs0.map(e => ({ ...e, acc: 1 }));
    const sortEvs = () => evs.sort((a, b) => a.pos - b.pos);
    const free = (pos) => !evs.some(e => Math.abs(e.pos - pos) < 1e-6);
    const gapAfter = (idx) => (evs[idx + 1] ? evs[idx + 1].pos : 4) - evs[idx].pos;
    const insert = (e) => { evs.push({ acc: 1, ...e }); sortEvs(); };
    const stretch = (p, minGap, mul) => evs.forEach((e, idx) => { if (p(e) && gapAfter(idx) >= minGap && rng() < mul) e.dur = gapAfter(idx) * (0.9 + rng() * 0.1); });
    const fillBreak = (p) => {   // roulement de batterie : les coups tardifs disparaissent, le dernier accord joué sonne jusqu'au roulement
        evs = evs.filter(e => e.pos < 2.9 || e.pos === 3.5);
        const last = evs.filter(e => e.pos < 3.4 && p(e)).pop();
        if (last) last.dur = Math.max(last.dur, 3.4 - last.pos);
    };
    if (kind === 'classic') {
        evs = evs.flatMap(e => {
            if (e.sym === 'U' && e.pos % 1 !== 0 && rng() < 0.3) return rng() < 0.45 ? [{ ...e, sym: 'x', dur: 0.1, acc: 0.85 }] : [];
            if (hi && e.sym === 'D' && e.pos > 0 && e.pos % 1 !== 0 && rng() < 0.2) return [];   // refrain : un contretemps de temps en temps ne sonne pas
            return [e];
        });
        [0.75, 2.75].forEach(p => { if (rng() < 0.15 && free(p) && !free(p + 0.25)) insert({ pos: p, sym: 'u', dur: 0.2, acc: 0.8 }); });
        stretch(e => e.sym === 'D', 0.99, 0.45);
        if (!hi && i === 0 && rng() < 0.3) {
            const f = evs[0];
            if (f && f.pos === 0 && f.sym === 'D' && f.dur >= 0.9 && free(0.5)) {
                const total = f.dur; f.sym = 'S'; f.dur = 0.5;
                insert({ pos: 0.5, sym: 'h', dur: total - 0.5 });
            }
        }
        if (isTurn && fill && rng() < 0.55) fillBreak(e => e.sym === 'D' || e.sym === 'S');
    } else if (kind === 'hard') {
        // les accords ne font que s'allonger (jusqu'au coup suivant), jamais se raccourcir
        evs.forEach((e, idx) => {
            if (e.sym !== 'P' || e.pos === 0) return;
            const g = gapAfter(idx);
            if (rng() < 0.35 && g > e.dur + 0.2) e.dur = g * (0.94 + rng() * 0.06);
        });
        const lastP = evs.filter(e => e.sym === 'P').pop();
        if (lastP && lastP.dur < 4 - lastP.pos - 0.2 && rng() < 0.5) lastP.dur = 4 - lastP.pos;
        if (isTurn && fill && rng() < 0.6) fillBreak(e => e.sym === 'P');
    } else if (kind === 'punk') {
        evs.forEach(e => {
            if (e.pos === 0 || e.sym !== 'D') return;
            if (e.pos % 1 !== 0 && rng() < 0.15) e.sym = '.';                // un contretemps qui ne sonne pas : la rythmique respire
            else if (e.pos % 1 === 0 && rng() < 0.35) e.acc = 1.08;          // accent déplacé
        });
        evs = evs.filter(e => e.sym !== '.');
        stretch(e => e.sym === 'D' && e.pos > 0, 0.99, 0.35);
        if (isTurn && fill && rng() < 0.5) fillBreak(e => e.sym === 'D');
    }
    return evs;
}

// Accent d'un coup selon sa place dans la mesure et le style : le jeu d'un guitariste n'est jamais plat.
function strokeAccent(kind, pos) {
    const onBeat = pos % 1 === 0, eighth = pos % 0.5 === 0;
    if (kind === 'classic') return onBeat ? (pos === 1 || pos === 3 ? 1.07 : 1) : (eighth ? 0.86 : 0.78);
    if (kind === 'hard') return onBeat ? (pos === 0 ? 1.04 : 1) : 0.9;
    return pos === 0 ? 1.06 : (onBeat ? 0.98 : 0.9);
}

// Phrases de blues rock (gamme pentatonique mineure et « note bleue » sur l'accord) : [temps, demi-tons au-dessus de la fondamentale, durée].
// Elles tombent sur les deux derniers temps et laissent la place aux dyades qui précèdent ; la dernière note appelle l'accord suivant.
const BLUES_LICKS = [
    [[2, 22, 0.5], [2.5, 19, 0.5], [3, 17, 0.5], [3.5, 15, 0.5]],   // descente septième - quinte - quarte - tierce mineure
    [[2, 15, 0.5], [2.5, 16, 0.5], [3, 19, 1]],                     // tierce mineure qui monte à la majeure, puis la quinte tenue
    [[2.5, 19, 0.5], [3, 22, 0.5], [3.5, 24, 0.5]],                 // montée quinte - septième - octave
    [[2, 17, 0.5], [2.5, 18, 0.5], [3, 19, 1]],                     // quarte - note bleue - quinte
    [[3, 19, 0.5], [3.5, 22, 0.5]],                                 // petite relance en fin de mesure
    [[2, 24, 1], [3, 22, 0.5], [3.5, 19, 0.5]]                      // octave tenue qui redescend
];

function rockGuitar(c, ph, cfg, i, isTurn, rng, lvlTone, m) {
    const I = ph.intensity;
    const env = c.env;
    const out = [];
    const velScale = 0.78 + 0.26 * I;
    const push = (pos, dur, intervals, vel, art, dir, roll, lay) => {
        if (!intervals || !intervals.length) return;
        const e = {
            pos, dur: Math.max(0.06, Math.min(dur, c.segEnd(pos) - pos + 0.1)), vel: Math.max(0.1, Math.min(1.1, vel * velScale)),
            rootIndex: 0, intervals, inst: 'gtr', art, dir, roll, tone: lvlTone, wide: true
        };
        if (lay) e.lay = lay;
        out.push(e);
    };
    const patSet = cfg.pats;
    const vary = cfg.vary;
    const seq = vary && ph.gtrSeq ? ph.gtrSeq : null;
    const pi = seq ? (ph.gtrPat + seq[((i % 4) + 4) % 4]) % patSet.length : (ph.gtrPat + (isTurn && rng() < 0.5 ? 1 : 0)) % patSet.length;
    const arpBar = (patStr) => {
        // Arpège de guitare claire : les cordes sonnent jusqu'au changement d'accord (laisser vibrer)
        const idxs = patStr.split(' ').map(Number);
        c.segs.forEach(sg => {
            const sh = gtrShape(env, sg.cs, 'full');
            const steps = Math.round((sg.e - sg.s) * 2);
            for (let k = 0; k < steps; k++) {
                const pos = sg.s + k * 0.5;
                const ix = idxs[k % idxs.length] % sh.length;
                push(pos, Math.min(3, c.segEnd(pos) - pos + 0.6), [sh[ix]], (k % 4 === 0 ? 0.7 : 0.5) * (0.92 + rng() * 0.12), 'arp', 1, 0);
            }
        });
        return out;
    };
    if (cfg.mode === 'boogie') {
        // Boogie : dyades fondamentale + quinte / sixte / septième sur chaque croche (Chuck Berry, shuffle de blues)
        const toks = patSet[pi].split(' ');
        const add = { '5': 7, '6': 9, '7': 10 };
        toks.forEach((tk, k) => {
            const pos = k * 0.5;
            const cs = c.csAt(pos);
            const R = gtrRoot(env, cs);
            const acc = k % 2 === 0 ? 1 : 0.8;
            push(pos, 0.44, [R, R + add[tk]], 0.78 * acc * (0.94 + rng() * 0.1), 'mute', 1, 0.004);
        });
        if (cfg.licks && c.segs.length === 1 && rng() < (isTurn || i % 2 === 1 ? cfg.licks : 0.12)) {
            const lick = BLUES_LICKS[Math.floor(rng() * BLUES_LICKS.length)].filter(n => !(c.anticip && n[0] >= 3.5));
            if (lick.length) {
                const from = lick[0][0];
                for (let k = out.length - 1; k >= 0; k--) if (out[k].pos >= from - 1e-6) out.splice(k, 1);   // la phrase prend la place des dyades
                lick.forEach(([pos, st, d]) => push(pos, Math.max(0.3, d * 0.97), [gtrRoot(env, c.csAt(pos)) + st], 0.74 * (0.94 + rng() * 0.12), 'strum', 1, 0, 0.004 + rng() * 0.008));
            }
        }
        return out;
    }
    if (cfg.mode === 'arp') return arpBar(patSet[pi]);
    // Années 70 : de temps en temps, une mesure d'arpège laisse respirer le couplet
    if (cfg.arpBar && ph.gtrArp === i && !isTurn && c.segs.length === 1) return arpBar(cfg.arpBar[(ph.gtrPat + i) % cfg.arpBar.length]);
    // Accord tenu au-delà de la barre de mesure (hard rock) : un accord de puissance de six temps, sans ré-attaque au début de la mesure suivante
    let ringUntil = 0;
    if (vary && cfg.hold !== undefined && m !== undefined) {
        const st = env.state.rockGtrHold || (env.state.rockGtrHold = { m: -9, key: '' });
        const key = c.segs[0].cs.rootIndex + ':' + c.segs[0].cs.chordId;
        if (c.segs.length === 1 && st.m === m - 1 && st.key === key) { ringUntil = 2; st.m = -9; }
        else if (ph.gtrHoldOn && c.segs.length === 1 && !c.changeNext && !c.anticip && !isTurn && i === ph.gtrHoldAt) {
            st.m = m; st.key = key;
            push(0, 5.96, gtrShape(env, c.segs[0].cs, 'power4'), 1.02 * (0.96 + rng() * 0.08), 'strum', 1, 0.007, 0.004);
            if (out.length) out[out.length - 1].dur = 5.96;   // push borne la durée à la mesure : cet accord-là la dépasse volontairement
            return out;
        }
    }
    // modes à symboles : strum, chug, jangle
    let evs = rkSym(patSet[pi]);
    if (vary) evs = varyGuitar(evs, vary, { rng, i, isTurn, fill: ph.fill, hi: !!ph.rockHi });
    if (ringUntil) evs = evs.filter(e => e.pos >= ringUntil - 1e-6);
    const rl = (b) => vary ? b * (0.7 + rng() * 0.8) : b;   // délai entre cordes : jamais deux fois le même
    let susOk = false;
    evs.forEach(ev => {
        const cs = c.csAt(ev.pos);
        const R = gtrRoot(env, cs);
        const beatStrong = ev.pos % 2 === 0;
        const v = vary ? (ev.acc || 1) * strokeAccent(vary, ev.pos) * (0.92 + rng() * 0.14) : (beatStrong ? 1 : 0.9) * (0.94 + rng() * 0.1);
        // léger retard humain : coups de contretemps de la main droite un peu après le temps (années 70), hard rock « posé », punk sur le temps
        const lay = !vary ? 0 : (vary === 'classic' ? ((ev.pos === 1 || ev.pos === 3 ? 0.006 : 0) + rng() * 0.008 + (ev.sym === 'U' ? 0.003 : 0)) : (vary === 'hard' ? rng() * 0.01 : rng() * 0.004));
        const full = gtrShape(env, cs, cfg.shape);
        const top = full.slice(-3);
        switch (ev.sym) {
            case 'D': push(ev.pos, Math.max(vary === 'punk' ? 0.95 : 0.5, ev.dur * 0.97), full, 0.9 * v, 'strum', 1, rl(0.006), lay); break;
            case 'd': push(ev.pos, Math.max(0.4, ev.dur * 0.97), full, 0.7 * v, 'strum', 1, rl(0.005), lay); break;
            case 'U': push(ev.pos, 0.4, top, 0.55 * v, 'strum', -1, rl(0.004), lay); break;
            case 'u': push(ev.pos, 0.2, top, 0.45 * v, 'strum', -1, rl(0.003), lay); break;
            case 'P': push(ev.pos, Math.max(vary === 'hard' ? 0.95 : 0.5, ev.dur * 0.97), gtrShape(env, cs, 'power4'), 1 * v, 'strum', 1, rl(0.006), lay); break;
            case 'M': push(ev.pos, 0.2, [R, R + 7], 0.8 * v, 'mute', 1, rl(0.003), lay); break;
            case 'X': push(ev.pos, 0.06, full.slice(0, 3), 0.5 * v, 'dead', 1, rl(0.003), lay); break;
            case 'x': push(ev.pos, 0.07, top, 0.42 * v, 'dead', -1, rl(0.003), lay); break;
            case 'S': {
                const sus = gtrShape(env, cs, 'sus4');
                susOk = !!sus;
                push(ev.pos, Math.max(0.4, ev.dur * 0.97), sus || full, 0.88 * v, 'strum', 1, rl(0.006), lay);
                break;
            }
            case 'h': if (susOk) push(ev.pos, Math.max(0.4, ev.dur * 0.97), gtrShape(env, cs, 'third'), 0.62 * v, 'arp', 1, 0, lay); break;
            default: break;
        }
    });
    return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Claviers : piano boogie / piano martelé, orgue, cordes
// ---------------------------------------------------------------------------------------------------------------------
function rockKeys(c, ph, G, i, isTurn, rng, base) {
    const env = c.env;
    const I = ph.intensity;
    const out = [];
    const mk = (pos, dur, ints, vel, inst, art, roll) => out.push({
        pos, dur: Math.max(0.1, Math.min(dur, c.segEnd(pos) - pos + (art === 'pad' || art === 'swell' ? 0.1 : 0.05))), vel: Math.max(0.1, Math.min(1, vel)),
        rootIndex: 0, intervals: ints, inst, art, roll: roll || 0, lay: 0.002 + rng() * 0.006, wide: true,
        noteVels: ints.map((_, k) => ints.length === 1 ? 1 : (k === ints.length - 1 ? 1.08 : (k === 0 ? 0.82 : 0.92)))
    });
    // ---- piano de style (le piano Pop-Rock de base est repris tel quel, sauf ces deux modes) ----
    let piano = base.piano.filter(e => !e.inst);
    if (!ph.pianoOn) piano = [];
    if (ph.keysKind === 'pound' || ph.keysKind === 'stab' || ph.keysKind === 'boogie') {
        piano = [];
        c.segs.forEach(sg => {
            const V = base.voiceFor(sg.cs);
            if (!V.length) return;
            if (ph.keysKind === 'pound') {
                for (let p = sg.s; p < sg.e - 0.01; p += 0.5) mk(p, 0.5, V, (p % 1 === 0 ? 0.6 : 0.46) + I * 0.1, 'piano', 'hit', 0.004);
            } else if (ph.keysKind === 'stab') {
                [[0.5, 0.55], [1.5, 0.5], [2.5, 0.55], [3.5, 0.5]].forEach(([p, v]) => { if (p >= sg.s && p < sg.e && rng() < 0.8) mk(p, 0.35, V.slice(1), v * 0.9, 'piano', 'hit', 0.003); });
                if (rng() < 0.6 && sg.s === 0) mk(0, 0.8, V, 0.62, 'piano', 'hit', 0.006);
            } else {
                // boogie-woogie : la main gauche marche sur la fondamentale (1-3-5-6-b7-6-5-3), la main droite place des accords sur les contretemps
                let lh = gtrRoot(env, sg.cs);
                while (lh + env.transOffset > -1) lh -= 12;
                while (lh + env.transOffset < -13) lh += 12;
                const nn = env.findChordObj(sg.cs.chordId).notes;
                const t = ((((nn[1] !== undefined ? nn[1] : 4) - (nn[0] || 0)) % 12) + 12) % 12;
                [0, t, 7, 9, 10, 9, 7, t].forEach((ivl, k) => {
                    const p = sg.s + k * 0.5;
                    if (p >= sg.e - 0.01) return;
                    mk(p, 0.48, k % 4 === 0 ? [lh + ivl, lh + ivl + 12] : [lh + ivl], k % 2 === 0 ? 0.62 : 0.5, 'piano', 'hit', 0.002);
                });
                [1, 3].forEach(p => { if (p >= sg.s && p < sg.e) mk(p + 0.5, 0.4, V.slice(1), 0.56 + rng() * 0.08, 'piano', 'hit', 0.004); });
            }
        });
    } else if (ph.keysKind === 'comp' || ph.keysKind === 'pad' || ph.keysKind === 'ballad') {
        // piano de base (ballade, nappe, comping syncopé) un peu en retrait derrière la guitare
        piano = piano.map(e => ({ ...e, vel: e.vel * 0.88 }));
    }
    out.push(...piano);
    return out;
}

// Orgue et cordes : accords tenus. Une même nappe peut durer deux mesures (état env.state.rockPad : pas de ré-attaque à la 2e mesure).
function rockSustained(c, ph, base, m, isLastMeasureOfStep, rng) {
    const env = c.env;
    const out = [];
    const I = ph.intensity;
    const st = env.state.rockPad || (env.state.rockPad = { organ: -9, strings: -9, organKey: '', stringsKey: '' });
    const key = (cs) => cs.rootIndex + ':' + cs.chordId;
    const sustained = (kind, inst, voicing, vel, att, relBeats) => {
        c.segs.forEach((sg, si) => {
            const k = key(sg.cs);
            const cont = !(c.segs.length > 1) && st[inst] === m - 1 && st[inst + 'Key'] === k && st[inst + 'Len'] === 8;
            if (cont) { st[inst] = m; return; }   // la nappe de la mesure précédente dure encore
            const V = voicing(sg.cs);
            if (!V.length) return;
            const two = c.segs.length === 1 && !isLastMeasureOfStep && !c.changeNext && kind !== 'stab';
            const len = two ? 8 : (sg.e - sg.s);
            out.push({
                pos: sg.s, dur: Math.max(0.5, len - 0.04 + (two ? 0 : 0.1)), vel: vel * (0.92 + rng() * 0.1),
                rootIndex: 0, intervals: V, inst, art: kind, roll: 0.004, lay: 0.004, wide: true, att
            });
            st[inst] = m; st[inst + 'Key'] = k; st[inst + 'Len'] = two ? 8 : 4;
        });
    };
    if (ph.organKind) {
        sustained(ph.organKind, 'organ', (cs) => base.voiceFor(cs), 0.55 + 0.2 * I, ph.organKind === 'swell' ? 0.35 : 0.01);
    }
    if (ph.stringsKind) {
        const rg = { lo: 2, hi: 21, centre: 12, soft: 19 };
        sustained(ph.stringsKind, 'strings', (cs) => {
            const prevV = env.state.rockStrV && env.state.rockStrV.key === key(cs) ? env.state.rockStrV.v : (env.state.rockStrV ? env.state.rockStrV.v : null);
            const V = (env.state.rockStrV && env.state.rockStrV.key === key(cs)) ? env.state.rockStrV.v : popVoicing(env, cs, prevV, rg);
            env.state.rockStrV = { key: key(cs), v: V };
            return V;
        }, 0.5 + 0.2 * I, ph.stringsKind === 'swell' ? 0.45 : 0.3);
    }
    return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------------------------------------------------
// base = plan Pop-Rock de base { piano, bass, drums, anticip, voiceFor } ; renvoie le plan rock complet.
function buildRockPlan(env, base, groove, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const G = ROCK[groove];
    const rng = ph.rng;
    const lvl = ph.rockHi ? 'hi' : 'lo';
    const c = rockCtx(env, step, nextStep, isLastMeasureOfStep, halves, base.anticip);
    const bass = rockBass(c, ph, G, lvl, i, isTurn, rng);
    const drums = rockDrums(c, ph, G, lvl, groove, i, L, isTurn, bass, rng, env);
    const gcfg = G.guitar ? G.guitar[lvl] : null;
    const gtr = gcfg ? rockGuitar(c, ph, gcfg, i, isTurn, rng, ph.gtrTone, m) : [];
    const keys = rockKeys(c, ph, G, i, isTurn, rng, base);
    const sus = rockSustained(c, ph, base, m, isLastMeasureOfStep, rng);
    const piano = [...keys, ...gtr, ...sus].sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums, rock: true, tone: ph.gtrTone, upright: !!G.upright, leslie: ph.leslie };
}

// Couches ajoutées au plan Pop-Rock ordinaire : guitare, orgue, cordes, tambourin (modifie le plan en place).
function popLayers(env, plan, ph, step, nextStep, isLastMeasureOfStep, halves, i, isTurn, m, voiceFor) {
    const rng = ph.rng;
    const c = rockCtx(env, step, nextStep, isLastMeasureOfStep, halves, plan.anticip);
    const I = ph.intensity;
    const extra = [];
    let busy = false;
    if (ph.layGtr) {
        const mode = ph.layGtr;
        const cfgs = {
            strum: { mode: 'strum', shape: 'full', pats: ['D...D.U...U.D.U.', 'D.D.D.D.D.D.D.D.', 'D...D.UU..UUD.U.'] },
            chug: { mode: 'chug', shape: 'power', pats: ['M.MMM.MMM.MMM.M.', 'P.MM..M.P.MM..M.', 'M.M.M.M.M.M.M.M.'] },
            chop: { mode: 'strum', shape: 'high', pats: ['..X...X...X...X.', '..X..X..X...X.X.', '.X..X..X.X..X..X'] },
            arp: { mode: 'arp', shape: 'full', pats: ['0 1 2 3 4 3 2 1', '0 2 1 3 2 4 3 2', '0 1 2 4 2 3 2 1'] }
        };
        const cfg = cfgs[mode];
        const pats = cfg.pats.map(p => cfg.mode === 'arp' ? p : String(p).replace(/\s+/g, '').slice(0, 16));
        const g = rockGuitar(c, { ...ph, gtrPat: ph.layGtrPat }, { ...cfg, pats }, i, isTurn, rng, ph.layGtrTone);
        g.forEach(e => { e.vel *= 0.82; });
        extra.push(...g); busy = true;
    }
    const base = { voiceFor, piano: [] };
    const phL = { ...ph, organKind: ph.layOrgan, stringsKind: ph.layStrings };
    extra.push(...rockSustained(c, phL, base, m, isLastMeasureOfStep, rng));
    if (ph.layTmb && !(isTurn && ph.fill)) {
        if (ph.layTmb === 'eighths') for (let p = 0.5; p < 4; p += 1) plan.drums.push({ pos: p, drum: 'tmbs', vel: 0.34 + rng() * 0.08, lay: 0 });
        else [1, 3].forEach(p => plan.drums.push({ pos: p, drum: 'tmb', vel: 0.44, lay: 0.004 }));
        plan.drums.sort((a, b) => a.pos - b.pos);
    }
    if (busy) plan.piano.forEach(e => { e.vel *= 0.86; });
    if (extra.length) {
        plan.piano = plan.piano.concat(extra).sort((a, b) => a.pos - b.pos);
        plan.rock = true;
        plan.tone = ph.layGtrTone;
        plan.leslie = ph.layLeslie;
    }
    return plan;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ROCK, ROCK_GROOVES, ROCK_FILLS, isRockGroove, rkVel, rkSym, rockPhraseExtras, popLayerExtras, rockCtx, rockBass, rockDrums,
        gtrRoot, gtrShape, rockGuitar, rockKeys, rockSustained, buildRockPlan, popLayers };
}
