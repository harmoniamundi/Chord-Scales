// band/guitar-plan.js — orchestre « Guitare » de la jam : une guitare classique (cordes nylon) seule, qui mêle arpèges
// (pouce sur les basses, doigts sur les cordes aiguës) et accords (plaqués, roulés), quelle que soit la signature. Sans DOM.
// Chargé par index.html via <script src="band/guitar-plan.js"> (après band/band-helpers.js, avant band/phrase-plan.js)
// et testé par band/guitar-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm         tempo courant (au-delà d'un certain débit de notes, les motifs s'éclaircissent)
//   env.state       mémoire entre deux mesures, modifiée en place : { gtrVoice } (basse et voicing aigu du dernier accord)
//
// ===================== Orchestration GUITARE =====================
// La guitare joue comme un guitariste classique : le pouce (p) tient la basse sur les cordes graves, les doigts (i, m, a) jouent
// les cordes aiguës ; les cordes sonnent librement jusqu'au changement d'accord (« laisser vibrer »).
//  - Le registre est celui de la vraie guitare : basses entre mi2 et sol3, cordes aiguës entre mi3 et mi5 environ (hauteurs réelles).
//  - Chaque accord a une basse (sa fondamentale, ou la basse choisie d'un accord sur basse) et un voicing aigu de trois à quatre
//    notes, choisi pour bouger le moins possible d'un accord au suivant (conduite des voix).
//  - Une mesure est écrite en « cases » (croches droites, ou croches de trois par pulsation en 6/8, 9/8, 12/8). Chaque case porte
//    un geste : B basse (pouce), b basse alternée (quinte, ou fondamentale d'un accord sur basse), 1 2 3 4 notes aiguës (doigts),
//    C accord plein (basse + aigu) roulé de bas en haut, c accord aigu, u accord aigu en coup montant, P pincé (basse + note la
//    plus aiguë ensemble), R accord plein très lentement arpégé, A note d'approche de la basse de l'accord suivant, . silence.
//  - Chaque phrase choisit ses motifs (famille d'arpège, accords, mélanges) ; les mesures reprennent le motif en le variant, et le
//    dernier temps d'un accord annonce parfois la basse du suivant. Le dernier accord de la grille (sans boucle) sonne en accord arpégé lent.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof jamChordPlaybackNotes === 'undefined' && typeof require === 'function') {
    var { jamChordPlaybackNotes, bassPc } = require('./band-helpers.js');
}
// Toque flamenco (band/flamenco-plan.js) : quand le style de grille impose un rythme flamenco, la phrase porte `ph.flamenco`
// et la mesure est écrite par buildFlamencoPlan (même guitare, mêmes cordes de nylon, autre répertoire de gestes).
if (typeof buildFlamencoPlan === 'undefined' && typeof require === 'function') {
    var { buildFlamencoPlan, flamencoPhraseExtras } = require('./flamenco-plan.js');
}

const GTR_BASE = 48;                      // hauteur réelle (MIDI) de la note écrite 0 sans transposition (octave de lecture 3 : do3)
const GTR_BASS_LO = 40, GTR_BASS_HI = 55; // registre des basses : mi2 à sol3
const GTR_UP_LO = 52, GTR_UP_HI = 79;     // registre des cordes aiguës : mi3 à sol5

const gtrMod = (n) => ((n % 12) + 12) % 12;
const gtrAtLeast = (pc, lo) => lo + gtrMod(pc - lo); // plus petite hauteur ≥ lo de classe de hauteur pc

// ---------------------------------------------------------------------------------------------
// Motifs : une cellule = une case par croche (rythme binaire) ou par tiers de pulsation (mesures composées)
// ---------------------------------------------------------------------------------------------
const gtrCell = (s) => s.split(' ');

// Rythme binaire : cellules de 2, 4, 6 ou 8 croches (1, 2, 3 ou 4 temps). arp = arpèges ; travis = pouce alterné sous des notes
// aiguës ; chord = accords ; mix = accord puis arpège.
const GTR_BIN = {
    8: {
        arp: ['B 1 2 3 2 1 2 3', 'B 2 1 3 1 2 1 3', 'B 1 2 1 3 1 2 1', 'B 3 2 1 2 3 2 1', 'B 1 3 2 3 1 3 2', 'B 1 2 3 4 3 2 1', 'B 1 2 3 . 2 1 .'].map(gtrCell),
        travis: ['B 2 b 3 B 2 b 1', 'B 1 b 2 B 3 b 2', 'B 3 2 3 b 3 2 3', 'B 2 3 2 b 2 3 2'].map(gtrCell),
        chord: ['C . . . c . . .', 'C . . u . c . .', 'B . c . B . c .', 'C . . c . . c .', 'C . . . . . u .'].map(gtrCell),
        mix: ['C . 3 2 1 2 3 2', 'C . . 3 2 3 2 1', 'B 1 2 3 c . 3 2', 'B 1 2 3 C . 2 1', 'C . . 3 b 1 2 3'].map(gtrCell)
    },
    6: {
        arp: ['B 1 2 3 2 1', 'B 3 2 1 2 3', 'B 1 2 b 2 1', 'B 1 3 2 3 1', 'B 2 3 2 3 2'].map(gtrCell),
        travis: ['B 2 3 b 2 3', 'B 1 2 b 3 2'].map(gtrCell),
        chord: ['B . c . c .', 'C . c . c .', 'B . c . u .', 'C . . . c .'].map(gtrCell),
        mix: ['C . 3 2 1 2', 'B 1 2 c . 3', 'B . c . 3 2', 'C . 2 3 2 1'].map(gtrCell)
    },
    4: {
        arp: ['B 1 2 1', 'B 2 1 3', 'B 1 2 3', 'B 3 2 1', 'B 1 3 2'].map(gtrCell),
        travis: ['B 2 b 3', 'B 1 b 2'].map(gtrCell),
        chord: ['C . c .', 'C . . u', 'B . c .', 'C . . c'].map(gtrCell),
        mix: ['C . 3 2', 'B 1 c .', 'P . 2 3'].map(gtrCell)
    },
    2: {
        arp: ['B 2', 'B 1', 'B 3'].map(gtrCell),
        travis: ['B 2'].map(gtrCell),
        chord: ['C .', 'B c'].map(gtrCell),
        mix: ['C 2', 'P .'].map(gtrCell)
    }
};

// Mesures composées (6/8, 9/8, 12/8) : on enchaîne des groupes de trois croches (une pulsation), en bouclant sur la liste.
const GTR_TERN = {
    arp: [['B 1 2', '3 2 1'], ['B 2 3', 'b 2 3'], ['B 3 2', 'b 3 2'], ['B . 1', '2 . 3']].map(fam => fam.map(gtrCell)),
    travis: [['B 2 3', 'b 2 3']].map(fam => fam.map(gtrCell)),
    chord: [['C . .', 'c . .'], ['B . .', 'c . .'], ['C . .', '. . u']].map(fam => fam.map(gtrCell)),
    mix: [['C . 3', '2 1 2'], ['C . .', 'B 2 3'], ['B 1 2', 'c . 3']].map(fam => fam.map(gtrCell))
};

const gtrPick = (list, u) => list[Math.floor(u * list.length) % list.length];

// Cellule de `n` cases pour un genre de mesure (arp, travis, chord, mix) ; u = tirage de la phrase (0 à 1) qui choisit le motif.
function gtrCellFor(kind, n, ternary, u) {
    if (ternary) {
        const groups = Math.max(1, Math.round(n / 3));
        const fam = gtrPick(GTR_TERN[kind] || GTR_TERN.arp, u);
        const out = [];
        for (let g = 0; g < groups; g++) out.push(...fam[g % fam.length]);
        return out;
    }
    const table = GTR_BIN[n] || GTR_BIN[[8, 6, 4, 2].find(k => k <= n) || 2];
    const base = gtrPick(table[kind] || table.arp, u).slice();
    while (base.length < n) base.push('.');
    return base.slice(0, n);
}

// Petite variation d'une cellule : deux notes des doigts échangées, une note retirée, ou un doigt décalé d'un rang. La première case ne change pas.
function gtrMutate(cell, rng) {
    const out = cell.slice();
    const fingers = [];
    out.forEach((t, k) => { if (k > 0 && /^[1-4]$/.test(t)) fingers.push(k); });
    if (!fingers.length) return out;
    const r = rng();
    if (r < 0.4) {
        const k = fingers[Math.floor(rng() * fingers.length)];
        if (k + 1 < out.length && /^[1-4]$/.test(out[k + 1])) { const t = out[k]; out[k] = out[k + 1]; out[k + 1] = t; }
    } else if (r < 0.7) {
        out[fingers[Math.floor(rng() * fingers.length)]] = '.';
    } else {
        const k = fingers[Math.floor(rng() * fingers.length)];
        out[k] = String(Math.max(1, Math.min(3, Number(out[k]) + (rng() < 0.5 ? -1 : 1))));
    }
    return out;
}

// Trop de notes par seconde pour des doigts : on ne garde que les premiers gestes de la cellule, un sur deux (binaire) ou un par pulsation.
function gtrThin(cell, step) {
    const kept = cell.filter(t => t !== '.');
    const out = cell.map(() => '.');
    for (let k = 0, j = 0; k < cell.length && j < kept.length; k += step, j++) out[k] = kept[j];
    return out;
}

// ---------------------------------------------------------------------------------------------
// Voix de la guitare : basse du pouce et voicing aigu, en hauteurs réelles (MIDI) puis ramenées en hauteurs écrites
// ---------------------------------------------------------------------------------------------

// Basse de l'accord (sa basse choisie, ou sa fondamentale) entre mi2 et sol3, au plus près de la basse précédente ; à distance
// presque égale, la plus grave (les cordes graves sonnent plus pleines).
function gtrBassMidi(env, cs, prevBass) {
    const pc = gtrMod(bassPc(env, cs) + env.transOffset);
    const lowest = gtrAtLeast(pc, GTR_BASS_LO);
    if (!Number.isFinite(prevBass)) return lowest;
    const cands = lowest + 12 <= GTR_BASS_HI ? [lowest, lowest + 12] : [lowest];
    const cost = (c) => Math.abs(c - prevBass) + 0.3 * (c - GTR_BASS_LO);
    return cands.reduce((best, c) => (cost(c) < cost(best) ? c : best), cands[0]);
}

// Basse alternée du pouce : la quinte de l'accord (sa fondamentale pour un accord sur basse), au plus près de la basse, jamais la même hauteur.
function gtrAltBassMidi(env, cs, bass) {
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    const slash = Number.isInteger(cs.bassRootIndex);
    const has = (iv) => t.some(x => gtrMod(x - r0) === iv);
    const fifth = has(7) ? 7 : (has(6) ? 6 : (has(8) ? 8 : 7));
    const pc = gtrMod(cs.rootIndex + r0 + (slash ? 0 : fifth) + env.transOffset);
    let best = null;
    for (let m = GTR_BASS_LO; m <= GTR_BASS_HI; m++) {
        if (gtrMod(m) !== pc || m === bass) continue;
        if (best === null || Math.abs(m - bass) < Math.abs(best - bass)) best = m;
    }
    return best === null ? bass + 12 : best;
}

// Notes aiguës de l'accord (trois à quatre, en ordre croissant) : on garde les notes de couleur (tierce, septième, tension), la quinte
// quand l'accord est une triade ; la basse n'est pas doublée dans les accords de quatre notes. Choix du renversement le plus proche du
// précédent, ni trop haut ni collé à la basse.
function gtrUpperMidi(env, cs, bass, prevUp) {
    const off = env.transOffset;
    const tones = [];
    jamChordPlaybackNotes(env.findChordObj(cs.chordId)).forEach(iv => {
        const pc = gtrMod(cs.rootIndex + iv + off);
        if (!tones.includes(pc)) tones.push(pc);
    });
    let U = tones.length >= 4 ? tones.filter(pc => pc !== gtrMod(bass)) : tones.slice();
    if (!U.length) U = [gtrMod(bass)];
    let best = null, bestCost = Infinity;
    for (let r = 0; r < U.length; r++) {
        const order = U.slice(r).concat(U.slice(0, r));
        for (let first = GTR_UP_LO; first <= GTR_UP_LO + 15; first++) {
            if (gtrMod(first) !== order[0]) continue;
            const v = [first];
            for (let k = 1; k < order.length; k++) v.push(v[k - 1] + (gtrMod(order[k] - v[k - 1]) || 12));
            const top = v[v.length - 1];
            const mean = v.reduce((a, b) => a + b, 0) / v.length;
            let c = 0.25 * Math.abs(mean - 63);
            if (top > 72) c += (top - 72) * 1.5;
            if (top > GTR_UP_HI) c += 20;
            if (top - v[0] > 16) c += (top - v[0] - 16) * 1.2;
            if (v[0] - bass < 7) c += (7 - (v[0] - bass));
            for (let k = 0; k + 1 < v.length; k++) if (v[k + 1] - v[k] <= 2 && v[k] < 60) c += 3; // pas de seconde serrée dans le grave
            if (prevUp && prevUp.length) {
                for (let j = 0; j < Math.min(v.length, prevUp.length); j++) c += 0.6 * Math.abs(v[v.length - 1 - j] - prevUp[prevUp.length - 1 - j]);
            }
            if (c < bestCost - 1e-9) { bestCost = c; best = v; }
        }
    }
    return best || [GTR_UP_LO + gtrMod(U[0] - GTR_UP_LO)];
}

const gtrKeyOf = (cs) => cs.rootIndex + ':' + cs.chordId + ':' + (Number.isInteger(cs.bassRootIndex) ? cs.bassRootIndex : '-');

// Voix de la guitare pour cet accord, dans la continuité du précédent ( { key, bass, up } ) ; le même accord garde exactement la même voix.
function gtrVoice(env, cs, prev) {
    const key = gtrKeyOf(cs);
    if (prev && prev.key === key) return prev;
    const bass = gtrBassMidi(env, cs, prev ? prev.bass : null);
    const up = gtrUpperMidi(env, cs, bass, prev ? prev.up : null);
    return { key, bass, alt: gtrAltBassMidi(env, cs, bass), up };
}

// k-ième note aiguë (0 = la plus grave) ; au-delà du nombre de notes, on reprend à l'octave supérieure si la guitare peut la jouer.
function gtrUpNote(up, k) {
    if (k < up.length) return up[k];
    const higher = up[k % up.length] + 12 * Math.floor(k / up.length);
    return higher <= GTR_UP_HI ? higher : up[k % up.length];
}

// Note d'approche vers la basse de l'accord suivant : un demi-ton ou un ton au-dessus ou au-dessous, du côté de la basse actuelle.
function gtrApproachMidi(env, cur, nextCs, rng) {
    const target = gtrBassMidi(env, nextCs, cur.bass);
    if (target === cur.bass) return null;
    const side = cur.bass >= target ? 1 : -1;
    const step = rng() < 0.6 ? 1 : 2;
    let a = target + side * step;
    if (a < GTR_BASS_LO || a > GTR_BASS_HI) a = target - side * step;
    return (a >= GTR_BASS_LO && a <= GTR_BASS_HI && a !== target) ? a : null;
}

// ---------------------------------------------------------------------------------------------
// Phrase : choix faits une fois et gardés pendant toute la phrase
// ---------------------------------------------------------------------------------------------
function guitarPhraseExtras(ctx, rng, prev, index) {
    const base = guitarClassicalExtras(ctx, rng, prev, index);
    // Rythme flamenco imposé par le style de grille (ctx.groove = 'f-solea', 'f-bulerias' ou 'f-tangos') : champs du toque flamenco en plus
    return ctx && ctx.groove ? Object.assign(base, flamencoPhraseExtras(ctx, rng, prev, index)) : base;
}

function guitarClassicalExtras(ctx, rng, prev, index) {
    const pl = (prev && prev.style === 'guitar') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.3 + rng() * 0.25 : prevI + (0.5 - prevI) * 0.25 + (rng() - 0.5) * 0.4;
    I = Math.max(0.22, Math.min(0.85, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const family = (pl && pl.family && rng() < 0.4) ? pl.family : pickW([['arp', 3], ['travis', I > 0.4 ? 1.6 : 0.6]]);
    const u = () => rng();
    return {
        intensity: I, family,
        mixChord: 0.35 + rng() * 0.3,             // part des mesures menées par des accords (le reste : arpèges seuls)
        uArp: u(), uArpAlt: u(), uTravis: u(), uChord: u(), uChordAlt: u(), uMix: u(), uMixAlt: u(),
        roll: 0.011 + rng() * 0.014,              // retard (s) entre deux cordes d'un accord plein
        slowStart: rng() < 0.45,                  // la phrase s'ouvre sur un accord arpégé lentement
        ending: Math.floor(rng() * 3),
        endingOn: rng() < 0.7,
        approach: 0.25 + 0.4 * I                  // chance d'annoncer la basse de l'accord suivant
    };
}

// ---------------------------------------------------------------------------------------------
// Plan d'une mesure
// ---------------------------------------------------------------------------------------------
const GTR_VEL = { B: 0.72, b: 0.58, f: 0.52, C: 0.72, c: 0.54, u: 0.46, P: 0.7, R: 0.66, A: 0.58 };

function buildGuitarPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    if (ph.flamenco) return buildFlamencoPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m);
    const rng = ph.rng;
    const I = ph.intensity;
    const off = env.transOffset;
    const spb = ternary ? 3 : 2;                              // cases par temps
    const splitAt = env.splitBeat || 2;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.72 + 0.32 * I) * (0.94 + 0.06 * prog) * (isTurn ? 0.93 : 1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const holdOn = !changeNext && !!nextStep;                 // même accord ensuite : les cordes continuent de vibrer
    const isFinal = !nextStep && isLastMeasureOfStep;         // dernier accord de la grille (sans boucle)
    const ev = [];
    const clamp = (v) => Math.max(0.12, Math.min(1, v));
    const slotsPerSec = (env.bpm || 100) / 60 * spb;
    const tooFast = slotsPerSec > 7.5;

    segs.forEach((sg, si) => {
        const lastOne = si === segs.length - 1;
        const voice = gtrVoice(env, sg.cs, env.state.gtrVoice);
        env.state.gtrVoice = voice;
        const { bass, alt, up } = voice;
        const toWritten = (mid) => mid - GTR_BASE - off;
        const endPos = sg.e + (isFinal && lastOne ? 2.5 : ((lastOne && holdOn) ? 1.0 : 0.04)); // fin de la résonance
        const ring = (pos, max) => Math.max(0.2, Math.min(endPos - pos, max));
        const N = Math.round((sg.e - sg.s) * spb);
        const posOf = (k) => sg.s + k / spb;

        const addEvent = (k, tok, vel, notes, dur, extra) => {
            const sorted = notes.slice().sort((a, b) => a - b).filter((x, j, arr) => j === 0 || x !== arr[j - 1]);
            const c = sorted.length;
            const nv = sorted.map((x, j) => (c === 1 ? 1 : (j === 0 ? 1 : (j === c - 1 ? 0.95 : 0.8))));
            ev.push(Object.assign({
                pos: posOf(k), dur, vel: clamp(vel * gv),
                rootIndex: 0, intervals: sorted.map(toWritten), noteVels: nv,
                roll: c > 1 ? ph.roll : 0, dir: 1, lay: rng() * 0.006, wide: true, gainMul: 1.15, tok
            }, extra || {}));
        };

        // ---------- dernière mesure de la grille : accord plein arpégé lentement, qui résonne ----------
        if (isFinal && si === 0 && lastOne) {
            addEvent(0, 'R', GTR_VEL.R, [bass].concat(up), ring(posOf(0), bpb + 2.5), { roll: 0.05 + rng() * 0.02 });
            return;
        }

        // ---------- choix du motif de la mesure (ou de la moitié de mesure) ----------
        const prefersChord = rng() < ph.mixChord;
        let kind;
        if (i === 0 && si === 0) kind = rng() < 0.6 ? (ph.family === 'travis' ? 'travis' : 'arp') : 'mix';
        else if (prefersChord) kind = rng() < 0.55 ? 'mix' : 'chord';
        else kind = (ph.family === 'travis' && !ternary && rng() < 0.7) ? 'travis' : 'arp';
        if (halves && N <= 4 && kind === 'chord' && rng() < 0.4) kind = 'arp';
        const second = i % 2 === 1; // une mesure sur deux reprend le motif « bis » de la phrase
        const u = { arp: second ? ph.uArpAlt : ph.uArp, travis: ph.uTravis, chord: second ? ph.uChordAlt : ph.uChord, mix: second ? ph.uMixAlt : ph.uMix }[kind];
        let cell = gtrCellFor(kind, N, ternary, u);
        if (i >= 2 && (kind === 'arp' || kind === 'travis') && rng() < 0.35 + 0.3 * I) cell = gtrMutate(cell, rng);
        if (tooFast && N > 2) cell = gtrThin(cell, ternary ? 3 : 2);

        // Début de phrase : le premier geste devient un accord arpégé lentement
        if (ph.slowStart && i === 0 && si === 0 && /^[BC]$/.test(cell[0]) && N >= 4) cell[0] = 'R';

        // Fin de phrase : le motif se « referme » (accord arpégé lentement, ou accord aigu très doux, sur le troisième temps) ou continue
        if (isTurn && L > 1 && ph.endingOn && lastOne && N >= 4 && ph.ending < 2) {
            const half = Math.floor(N / 2);
            for (let k = half; k < N; k++) cell[k] = '.';
            cell[half] = ph.ending === 0 ? 'R' : 'u';
        }

        // La basse de l'accord suivant est annoncée sur la dernière case
        let approach = null;
        if (changeNext && lastOne && N >= 4 && rng() < ph.approach) {
            approach = gtrApproachMidi(env, voice, nextStep, rng);
            if (approach !== null) cell[N - 1] = 'A';
        }

        // ---------- gestes → notes ----------
        cell.forEach((tok, k) => {
            if (tok === '.') return;
            const beat = k % spb === 0;
            const pos = posOf(k);
            const f = (rank) => GTR_VEL.f + (beat ? 0.06 : 0) + (rank >= 2 ? 0.05 : 0);
            switch (tok) {
                case 'B': addEvent(k, tok, GTR_VEL.B + (k === 0 ? 0.06 : 0), [bass], ring(pos, 3.6)); break;
                case 'b': addEvent(k, tok, GTR_VEL.b + (beat ? 0.04 : 0), [alt], ring(pos, 2.2)); break;
                case '1': case '2': case '3': case '4': {
                    const r = Number(tok) - 1;
                    addEvent(k, tok, f(r), [gtrUpNote(up, r)], ring(pos, 2.4));
                    break;
                }
                case 'C': addEvent(k, tok, GTR_VEL.C, [bass].concat(up), ring(pos, 3)); break;
                case 'c': addEvent(k, tok, GTR_VEL.c, up, ring(pos, 2.4), { roll: ph.roll * 0.8 }); break;
                case 'u': addEvent(k, tok, GTR_VEL.u, up, ring(pos, 2), { roll: ph.roll * 0.8, dir: -1 }); break;
                case 'P': addEvent(k, tok, GTR_VEL.P, [bass, up[up.length - 1]], ring(pos, 3), { roll: 0.006 }); break;
                case 'R': addEvent(k, tok, GTR_VEL.R, [bass].concat(up), ring(pos, 3.2), { roll: 0.045 + rng() * 0.02 }); break;
                case 'A': addEvent(k, tok, GTR_VEL.A, [approach], ring(pos, 1.6)); break;
                default: break;
            }
        });
    });

    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [], classicalGuitar: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        guitarPhraseExtras, buildGuitarPlan,
        gtrBassMidi, gtrAltBassMidi, gtrUpperMidi, gtrVoice, gtrCellFor, gtrMutate, gtrThin,
        GTR_BIN, GTR_TERN, GTR_BASE, GTR_BASS_LO, GTR_BASS_HI, GTR_UP_LO, GTR_UP_HI
    };
}
