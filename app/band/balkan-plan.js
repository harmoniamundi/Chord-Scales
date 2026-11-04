// band/balkan-plan.js — orchestre des Balkans de la jam : accordéon (accords en triades, ligne chantée), basse,
// tapan / daire / darbuka. Chargé par index.html via <script src="band/balkan-plan.js"> (après band-helpers.js) et testé
// par band/balkan-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm         tempo courant
//   env.state       mémoire entre deux mesures, modifiée en place : { balkanVoice, balkanMel }
//                   (renversement de l'accordéon et dernière note de la ligne chantée)

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band-helpers.js).
if (typeof popRun === 'undefined' && typeof require === 'function') {
    var { popRun, popScaleNotes, popBassTones, popBassApproach } = require('./band-helpers.js');
}

// ===================== Orchestration BALKANS =====================
// Trois « couleurs » partagent le même orchestre (la phrase en retient une, d'après le rythme imposé par le style de grille) :
//  - « dance »  (par défaut) : kolo / čoček en 2/4, aksak en 9/8 (2+2+2+3) ; tapan, daire, darbuka ;
//  - « sevdah »  (rythme 'bk-sevdah') : ballade lente de Bosnie en 4/4 : ligne longue et ornée, accompagnement tenu ou arpégé, percussions
//                                     à peine là ;
//  - « tsifte »  (rythme 'bk-tsifte') : tsifteteli / čoček en 4/4, darbuka « maqsum » (dum tek . tek dum . tek .) et ligne syncopée.
// Tout part des groupes de croches de la mesure : 2/4 = 2+2, 9/8 = 2+2+2+3, 6/8 = 3+3, 12/8 = 3+3+3+3, 3/4 et 4/4 = 2+2…
//
// La ligne de l'accordéon est écrite comme un chant, pas comme un tirage de notes isolées :
//  - un motif de phrase : les mesures d'une phrase de 4 forment A B A C (question, réponse, question, conclusion) ; A, B et C ont
//    chacun leur rythme et leur contour mélodique, identiques chaque fois qu'ils reviennent (donc reconnaissables, même quand l'accord
//    a changé) ; la dernière mesure se pose (longue note sur une note de l'accord) ;
//  - un rythme continu, fait de cellules par groupe de croches (la même cellule revient d'un groupe à l'autre) : la ligne ne se
//    tait qu'à l'entrée (phrase qui commence par l'accompagnement seul) et en respiration, jamais au hasard ;
//  - des notes liées (jeu au soufflet), un contour surtout conjoint, les temps forts sur des notes de l'accord, la dernière note de la
//    mesure qui prépare l'accord suivant par un degré conjoint ;
//  - des ornements propres à ce répertoire : petite note sur le temps (kvaka), mordant, mélisme avant une note longue.

const bkClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bkMod = (x) => ((x % 12) + 12) % 12;

// Petit générateur déterministe (graine entière) : les rythmes et contours d'un même rôle sont identiques d'une mesure à l'autre.
function bkLcg(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Couleur de l'orchestre d'après le rythme imposé par le style de grille ('bk-sevdah', 'bk-tsifte') ; sinon la danse.
function balkanFlavorOf(groove) {
    return groove === 'bk-sevdah' ? 'sevdah' : (groove === 'bk-tsifte' ? 'tsifte' : 'dance');
}

// Rôle d'une mesure dans la phrase : A (question), B (réponse), C (conclusion). Phrase de 4 : A B A C.
function balkanRoleOf(i, L) {
    if (L <= 1) return 'A';
    if (i >= L - 1) return 'C';
    return i % 2 === 0 ? 'A' : 'B';
}

// Voicing de l'accordéon (main droite) : triade, hauteurs écrites, renversement le plus proche du précédent.
function balkanVoicing(env, cs, prev) {
    const off = env.transOffset;
    const t = env.findChordObj(cs.chordId).notes;
    const third = t[1] !== undefined ? t[1] : 4;
    const fifth = (third === 3 && t.includes(6)) ? 6 : 7;
    const pcs = [0, third, fifth].map(x => (((cs.rootIndex + x) % 12) + 12) % 12);
    const LO = 5 - off, HI = 21 - off, centre = 12 - off;   // fa3 à la4 réels environ
    let best = null, bestCost = Infinity;
    for (let r = 0; r < 3; r++) {
        const order = pcs.slice(r).concat(pcs.slice(0, r));
        for (let oct = 0; oct <= 12; oct += 12) {
            let cur = LO + ((((order[0] - LO) % 12) + 12) % 12) + oct;
            const v = [cur];
            for (let k = 1; k < 3; k++) { cur += ((((order[k] - cur) % 12) + 12) % 12) || 12; v.push(cur); }
            if (v[2] > HI + 3) continue;
            let c = 0.35 * Math.abs((v[0] + v[1] + v[2]) / 3 - centre) + Math.max(0, v[2] - HI) * 2;
            if (prev && prev.length) for (let j = 0; j < 3; j++) c += Math.abs(v[2 - j] - prev[prev.length - 1 - j]);
            if (c < bestCost - 1e-9) { bestCost = c; best = v; }
        }
    }
    return best || [LO, LO + 4, LO + 7];
}

// Choix faits une fois par phrase. ctx (facultatif) : { groove } — le rythme imposé par le style de grille.
function balkanPhraseExtras(rng, prev, index, ctx) {
    const flavor = balkanFlavorOf(ctx && ctx.groove);
    const pl = (prev && prev.style === 'balkan' && (prev.flavor || 'dance') === flavor) ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    // intensité : départ, valeur vers laquelle elle tend, amplitude du hasard, bornes
    const F = {
        dance:  { first: [0.4, 0.15], tgt: 0.7,  noise: 0.45, lo: 0.28, hi: 0.98 },
        sevdah: { first: [0.3, 0.1],  tgt: 0.42, noise: 0.2,  lo: 0.22, hi: 0.6 },
        tsifte: { first: [0.5, 0.1],  tgt: 0.66, noise: 0.34, lo: 0.38, hi: 0.92 }
    }[flavor];
    let I = index === 0 ? F.first[0] + rng() * F.first[1] : prevI + (F.tgt - prevI) * 0.22 + (rng() - 0.5) * F.noise;
    I = bkClamp(I, F.lo, F.hi);
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const feelDance = rng() < (I < 0.55 ? 0.4 : 0.12) ? 'oompah' : 'drive';   // oom-pah (binaire seulement) ou contretemps
    const feel = flavor === 'sevdah' ? (rng() < 0.55 ? 'pad' : 'arp') : (flavor === 'tsifte' ? 'drive' : feelDance);
    // ligne chantée : 0 = l'accompagnement seul pendant la 1re moitié de la phrase (entrée), 1 = lyrique (notes plus longues,
    // une respiration), 2 = soutenue
    const mel = flavor === 'sevdah'
        ? pickW([[1, 3], [2, 2.2], [0, index === 0 ? 1.2 : 0.1]])
        : pickW(I < 0.45 ? [[0, 0.7], [1, 3], [2, 1.5]] : [[0, 0.25], [1, 1.8], [2, 3.2]]);
    return {
        flavor,
        intensity: I,
        feel,
        percIdx: Math.floor(rng() * 3),
        darIdx: Math.floor(rng() * 2),
        bassIdx: Math.floor(rng() * 3),
        fill: rng() < 0.75,
        run: rng() < (flavor === 'sevdah' ? 0.2 : 0.6),        // phrase rapide de l'accordéon en fin de cellule
        daire: rng() < (flavor === 'sevdah' ? 0.15 : 0.55),
        perc: flavor === 'sevdah' ? (index > 0 && rng() < 0.85) : true,   // la ballade démarre sans percussions
        mel,
        melSeed: rng(),
        melSteps: (() => {   // matière du contour (degrés de la gamme) : des arcs plutôt qu'un zigzag, le sens se poursuit le plus souvent
            let dir = rng() < 0.5 ? 1 : -1;
            return Array.from({ length: 8 }, () => {
                if (rng() > 0.64) dir = -dir;
                return dir * pickW([[1, 6], [2, 2.2], [3, 0.25], [0, 0.35]]);
            });
        })(),
        orn: rng() < (flavor === 'sevdah' ? 0.92 : (flavor === 'tsifte' ? 0.75 : 0.45)),   // ornements (petites notes, mordants)
        oct: rng() < 0.4         // notes longues doublées à l'octave inférieure
    };
}

// ---------- Rythme de la ligne : cellules par groupe de croches ----------
// [durées en croches, poids « calme », poids « vif »] ; chaque cellule couvre exactement un groupe (2 ou 3 croches).
const BK_CELL2 = [
    [[2], 1.2, 0.5], [[1, 1], 3, 3], [[1.5, 0.5], 0.9, 1.6], [[0.5, 0.5, 1], 0.15, 1.1], [[1, 0.5, 0.5], 0.25, 1.3], [[0.5, 0.5, 0.5, 0.5], 0, 1]
];
const BK_CELL3 = [
    [[3], 1.1, 0.5], [[2, 1], 2.5, 1.5], [[1, 2], 1.8, 1.8], [[1, 1, 1], 2.6, 3], [[1.5, 0.5, 1], 0.7, 1.4],
    [[1, 1, 0.5, 0.5], 0.1, 1.2], [[2, 0.5, 0.5], 0.4, 1], [[0.5, 0.5, 1, 1], 0.1, 0.9]
];
// Mesures complètes en 4/4 (8 croches) pour la ballade et le tsifteteli, par rôle : A ouvre, B répond, C conclut sur une note longue.
const BK_BAR8 = {
    sevdah: {
        A: [[4, 2, 2], [3, 1, 2, 2], [2, 2, 4], [2, 1, 1, 4], [3, 1, 4], [2, 2, 2, 2], [1.5, 0.5, 2, 4], [2, 1, 1, 2, 2], [1, 1, 2, 4]],
        B: [[2, 2, 2, 2], [2, 1, 1, 2, 2], [1, 1, 2, 2, 2], [3, 1, 2, 2], [2, 2, 3, 1], [1.5, 0.5, 1, 1, 4], [2, 1, 1, 1, 1, 2]],
        C: [[2, 2, 4], [4, 4], [3, 1, 4], [2, 1, 1, 4], [1, 1, 2, 4]]
    },
    tsifte: {
        A: [[3, 1, 2, 2], [1, 1, 2, 1, 1, 2], [1.5, 0.5, 1, 1, 1.5, 0.5, 1, 1], [2, 1, 1, 2, 1, 1], [3, 1, 1, 1, 2], [1, 1, 1, 1, 2, 2], [1.5, 0.5, 2, 1.5, 0.5, 2]],
        B: [[1, 1, 1, 1, 1, 1, 1, 1], [1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 1], [2, 1, 1, 1, 1, 2], [1.5, 0.5, 1.5, 0.5, 1, 1, 1, 1], [1, 1, 2, 0.5, 0.5, 0.5, 0.5, 1, 1]],
        C: [[2, 1, 1, 4], [1, 1, 2, 4], [3, 1, 4], [2, 2, 4]]
    }
};

// Durées (en croches) de la ligne pour une mesure : somme = nombre de croches de la mesure.
//   role : 'A' | 'B' | 'C' ; o = { flavor, groups, native4, seed, act (0 calme … 1 vif), thin (0 … 1 : tempo rapide) }
function balkanBarRhythm(role, o) {
    const mr = bkLcg0(o.seed);                     // palette de la phrase : la même pour tous les rôles
    const rr = bkLcg0(o.seed + 7919 * ('ABC'.indexOf(role) + 1));   // choix propres à ce rôle
    const act = bkClamp(o.act, 0, 1), thin = bkClamp(o.thin || 0, 0, 1);
    if (o.native4 && o.flavor !== 'dance') {
        const set = BK_BAR8[o.flavor][role];
        // le même rôle donne la même mesure dans toute la phrase (graine de la phrase)
        return set[Math.floor((role === 'A' ? mr() : rr()) * set.length) % set.length].slice();
    }
    const w = (c) => { const x = c[1] * (1 - act) + c[2] * act; return c[0].includes(0.5) ? x * (1 - thin) : x; };
    const pick = (set, r) => {
        let tot = 0; set.forEach(c => { tot += w(c); });
        if (tot <= 0) return set[1];
        let t = r * tot;
        for (const c of set) { t -= w(c); if (t <= 0) return c; }
        return set[set.length - 1];
    };
    const pal = { a2: pick(BK_CELL2, mr()), b2: pick(BK_CELL2, mr()), a3: pick(BK_CELL3, mr()), b3: pick(BK_CELL3, mr()) };
    const alt2 = pick(BK_CELL2, rr());
    const last = o.groups.length - 1;
    const out = [];
    o.groups.forEach((g, k) => {
        let cell;
        if (g === 2) {
            if (role === 'A') cell = k % 2 === 0 ? pal.a2 : pal.b2;
            else if (role === 'B') cell = k % 2 === 0 ? pal.a2 : alt2;
            else cell = k === last ? [[2]] : (k === 0 ? pal.a2 : [[1, 1]]);
        } else {
            if (role === 'A') cell = pal.a3;
            else if (role === 'B') cell = k === last ? pal.b3 : pal.a3;
            else cell = k === last ? [[3]] : (k === 0 ? pal.a3 : [[1, 1, 1]]);
        }
        cell[0].forEach(d => out.push(d));
    });
    return out;
}
function bkLcg0(seed) { return bkLcg(Math.floor(seed) + 12345); }

// Contour mélodique d'un rôle : n-1 pas (en degrés de la gamme). A monte, B redescend, C finit en descendant.
function balkanContour(melSteps, role, n) {
    const base = melSteps && melSteps.length ? melSteps : [1, -1, 1, 1, -1, -1, 2, -2];
    const r = { A: 0, B: 3, C: 6 }[role] || 0;
    const steps = [];
    for (let k = 0; k < n - 1; k++) steps.push(base[(r + k) % base.length]);
    const net = () => steps.reduce((a, b) => a + b, 0);
    const want = role === 'A' ? 1 : (role === 'B' ? -1 : -2);
    for (let guard = 0; guard < 24 && steps.length; guard++) {
        const d = net();
        if (role === 'A' ? d >= want : d <= want) break;
        // on renverse le pas le plus contraire à l'objectif
        let bi = 0;
        steps.forEach((s, j) => { if (role === 'A' ? s < steps[bi] : s > steps[bi]) bi = j; });
        if (steps[bi] === 0) break;
        steps[bi] = -steps[bi];
    }
    if (role === 'C' && steps.length && steps[steps.length - 1] > 0) steps[steps.length - 1] = -steps[steps.length - 1];
    return steps;
}

function buildBalkanPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const flavor = ph.flavor || 'dance';
    const eps = 1e-6;
    const spe = ternary ? 3 : 2;                                  // croches par pulsation
    const E = bpb * spe;                                          // croches dans la mesure
    const aksak = ternary && bpb === 3;                           // 9/8 : 2+2+2+3
    const groups = ternary ? (aksak ? [2, 2, 2, 3] : Array(bpb).fill(3)) : Array(bpb).fill(2);
    const gs = []; { let a = 0; groups.forEach(g => { gs.push(a); a += g; }); }
    const P = (e) => e / spe;                                     // position (en pulsations) de la croche e
    const kolo = !ternary && bpb === 2;
    const native4 = !ternary && bpb === 4;                        // 4/4 binaire : signature des variantes ballade et tsifteteli
    const sevdahN = flavor === 'sevdah' && native4, tsifteN = flavor === 'tsifte' && native4;
    const feel = (!ternary && ph.feel === 'oompah' && flavor === 'dance') ? 'oompah' : 'drive';
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const prog = L > 1 ? i / (L - 1) : 0;
    const dynBase = flavor === 'sevdah' ? 0.62 : 0.74;
    const dyn = (dynBase + 0.28 * I) * (0.92 + 0.08 * prog);
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    const piano = [], bass = [], drums = [];

    // ---- allègement de l'accordéon quand le tempo monte (lisibilité à l'oreille) ----
    // Vitesse = croches par seconde (le BPM compte la noire en binaire, la noire pointée en ternaire / 9/8). Au tempo habituel
    // (kolo 2/4 ≈ 128 : 4,3 croches/s ; 9/8 ≈ 100 : 5 croches/s) rien ne change ; au-delà de 5 croches/s l'accordéon se dépouille
    // progressivement (thin 0 → 1 entre 5 et 8 croches/s) : plus de doubles croches dans la ligne, phrase de fin plus courte puis
    // supprimée, plus d'ornements ni de doublage à l'octave, contretemps réduits.
    const eighthsPerSec = (env.bpm || 120) * spe / 60;
    const thin = Math.max(0, Math.min(1, (eighthsPerSec - 5) / 3));

    // ---- conduite des voix de l'accordéon ----
    const cache = {};
    let lastV = env.state.balkanVoice ? env.state.balkanVoice.v : null;
    let lastKey = env.state.balkanVoice ? env.state.balkanVoice.key : null;
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        const v = (env.state.balkanVoice && env.state.balkanVoice.key === key) ? env.state.balkanVoice.v : balkanVoicing(env, cs, lastV);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const Vs = segs.map(sg => voiceFor(sg.cs));
    const nextV = changeNext ? voiceFor(nextStep) : null;
    env.state.balkanVoice = lastKey ? { key: lastKey, v: lastV } : null;

    // ---- phrase rapide de fin de cellule (dans la gamme du dernier accord, vers l'accord suivant) ----
    const runFrom = bpb - 1;
    const nRun = thin > 0.35 ? spe : (ternary ? 6 : 4);          // très rapide : croches au lieu de doubles croches
    let runNotes = [];
    if (isTurn && L > 1 && changeNext && ph.run && thin < 0.8 && nextV && bpb >= 2) {
        const lv = Vs[Vs.length - 1];
        runNotes = popRun(env, lastSeg.cs, lv[lv.length - 1], nextV[nextV.length - 1], nRun);
    }
    const run = runNotes.length === nRun;
    let lastMelX = null;                                         // dernière note de la ligne : la phrase rapide en part
    const runE = runFrom * spe;                                  // première croche prise par la phrase rapide

    // ---- accordéon : la ligne chantée ----
    const csAt = (pos) => segs[segAt(pos)].cs;
    const intro = (ph.mel === 0 && L >= 3) ? Math.floor(L / 2) : 0;       // phrase qui commence par l'accompagnement seul
    const melBar = ph.mel !== 0 ? true : (L >= 3 && i >= intro);
    if (melBar) {
        const li = Math.max(0, i - intro), LL = Math.max(1, L - intro);
        const role = balkanRoleOf(li, LL);
        const seed = Math.floor(ph.melSeed * 1e9);
        const off = env.transOffset;
        const reg = flavor === 'sevdah' ? { lo: 9 - off, hi: 24 - off, centre: 17 - off } : { lo: 12 - off, hi: 26 - off, centre: 19 - off };
        const actBase = flavor === 'sevdah' ? 0.15 + 0.35 * I : bkClamp((I - 0.1) / 0.6, 0.4, 1);
        const act = actBase * (ph.mel === 1 ? 0.5 : 1) * (1 - 0.6 * thin);
        let durs = balkanBarRhythm(role, { flavor, groups, native4, seed, act, thin });
        // respiration (ligne lyrique, mesure de réponse) : le dernier groupe de la mesure reste vide ; avec deux groupes seulement,
        // la dernière croche est laissée libre
        let onsets = []; { let a = 0; durs.forEach(d => { onsets.push(a); a += d; }); }
        if (ph.mel === 1 && role === 'B' && flavor !== 'sevdah' && ((seed >>> 3) & 1) && durs.length > 2) {
            const cut = groups.length >= 3 ? gs[groups.length - 1] : E - 1;
            const keep = onsets.filter(e => e < cut - eps).length;
            if (keep >= 2 && keep < onsets.length) { durs = durs.slice(0, keep); onsets = onsets.slice(0, keep); durs[keep - 1] = Math.min(durs[keep - 1], cut - onsets[keep - 1]); }
        }
        // phrase rapide de fin : la ligne s'arrête avant, sa dernière note est prolongée jusque-là
        if (run) {
            const keep = onsets.filter(e => e < runE - eps).length;
            if (keep >= 1 && keep < onsets.length) {
                durs = durs.slice(0, keep); onsets = onsets.slice(0, keep);
                durs[keep - 1] = runE - onsets[keep - 1];
            } else if (keep >= 1) durs[keep - 1] = Math.min(durs[keep - 1], runE - onsets[keep - 1]);
            else { durs = []; onsets = []; }
        }
        const n = durs.length;
        const steps = balkanContour(ph.melSteps, role, n);

        // gammes et notes d'accord de chaque accord de la mesure
        const infoCache = {};
        const info = (cs) => {
            const key = cs.rootIndex + ':' + cs.chordId + ':' + cs.scaleId;
            if (infoCache[key]) return infoCache[key];
            const t = env.findChordObj(cs.chordId).notes;
            const third = t[1] !== undefined ? t[1] : 4;
            const fifth = (third === 3 && t.includes(6)) ? 6 : 7;
            const pcs = { root: bkMod(cs.rootIndex), third: bkMod(cs.rootIndex + third), fifth: bkMod(cs.rootIndex + fifth) };
            return (infoCache[key] = {
                S: popScaleNotes(cs, reg.lo, reg.hi), pcs, ct: new Set([pcs.root, pcs.third, pcs.fifth]),
                dominant: third === 4 && t.includes(10)
            });
        };
        const near = (S, x) => S.reduce((b, v, j) => Math.abs(v - x) < Math.abs(S[b] - x) ? j : b, 0);
        const isCTi = (ci, j) => ci.S[j] !== undefined && ci.ct.has(bkMod(ci.S[j]));
        // note d'accord la plus proche de idx ; à distance égale, celle qui est la plus proche de la note précédente (petit saut)
        const snapCT = (ci, idx, pIdx) => {
            if (isCTi(ci, idx)) return idx;
            let best = idx, bc = Infinity;
            for (const d of [1, -1, 2, -2]) {
                if (!isCTi(ci, idx + d)) continue;
                const c = Math.abs(d) * 1.2 + Math.abs(idx + d - pIdx) * 0.5 + (idx + d === pIdx ? 3 : 0);   // on évite de répéter la note précédente
                if (c < bc) { bc = c; best = idx + d; }
            }
            return best;
        };
        const ok = n > 0 && segs.every(sg => info(sg.cs).S.length >= 4);
        if (ok) {
            let prevX = env.state.balkanMel;
            const hasPrev = prevX !== null && prevX !== undefined;
            const walk = [];
            for (let k = 0; k < n; k++) {
                const e = onsets[k], d = durs[k], pos = P(e);
                const ci = info(csAt(pos)), S = ci.S;
                const strong = gs.includes(e);
                const heavy = strong && d >= 1 - eps;
                let idx;
                if (k === 0) {
                    // début de mesure : la note d'accord la plus proche de la fin de la mesure précédente, sans la répéter ;
                    // A part vers le haut, B et C vers le bas ; un début de phrase se rapproche du centre du registre
                    let ref = hasPrev ? prevX : reg.centre;
                    if (li === 0 && hasPrev) ref = (prevX + reg.centre) / 2;
                    const bias = role === 'A' ? 1 : -1;
                    const base = near(S, ref);
                    let bestJ = base, bestC = Infinity;
                    for (let j = Math.max(0, base - 3); j <= Math.min(S.length - 1, base + 3); j++) {
                        if (!isCTi(ci, j)) continue;
                        const c = Math.abs(S[j] - ref) + (hasPrev && S[j] === prevX ? 3 : 0) - 0.6 * bias * (S[j] - ref);
                        if (c < bestC) { bestC = c; bestJ = j; }
                    }
                    idx = bestJ;
                } else {
                    let st = steps[k - 1];
                    const px = walk[k - 1].x;
                    if (px > reg.hi - 3 && st > 0) st = -st;
                    if (px < reg.lo + 3 && st < 0) st = -st;
                    const pIdx = near(S, px);
                    idx = bkClamp(pIdx + st, 0, S.length - 1);
                    if (heavy) idx = snapCT(ci, idx, pIdx);
                }
                walk.push({ e, d, idx, x: S[idx], S, ci, strong, heavy });
            }
            // dernière note : se pose (fin de phrase) ou prépare l'accord suivant par un degré conjoint
            const lastN = walk[n - 1];
            if (!run && n >= 1 && lastN) {
                const ci = lastN.ci, S = ci.S, from = n >= 2 ? walk[n - 2].x : (hasPrev ? prevX : reg.centre);
                if (isTurn && L > 1) {
                    // conclusion : sur la dominante on reste ouvert (quinte ou tierce), ailleurs on se pose sur la fondamentale
                    const want = ci.dominant ? [ci.pcs.fifth, ci.pcs.third] : [ci.pcs.root];
                    let bj = lastN.idx, bc = Infinity;
                    S.forEach((v, j) => { if (want.includes(bkMod(v))) { const c = Math.abs(v - from); if (c < bc) { bc = c; bj = j; } } });
                    lastN.idx = bj; lastN.x = S[bj]; lastN.closing = true;
                    if (n >= 2 && lastN.x === from) {
                        // pas de note répétée : l'avant-dernière approche la note finale par une autre note d'accord voisine, ou par un degré conjoint
                        const pn = walk[n - 2], pS = pn.S;
                        let cj = -1, cc = Infinity;
                        pS.forEach((v, j) => { if (v !== lastN.x && pn.ci.ct.has(bkMod(v)) && Math.abs(v - lastN.x) <= 7) { const c = Math.abs(v - lastN.x) - (v > lastN.x ? 0.5 : 0); if (c < cc) { cc = c; cj = j; } } });
                        if (cj < 0 && !pn.heavy) { cj = near(pS, lastN.x) + 1; if (pS[cj] === undefined) cj = near(pS, lastN.x) - 1; }
                        if (cj >= 0 && pS[cj] !== undefined) { pn.idx = cj; pn.x = pS[cj]; }
                    }
                } else if (changeNext && nextStep) {
                    const nci = info(nextStep), nS = nci.S;
                    let ti = -1, tc = Infinity;
                    nS.forEach((v, j) => { if (nci.ct.has(bkMod(v))) { const c = Math.abs(v - from); if (c < tc) { tc = c; ti = j; } } });
                    if (ti >= 0 && lastN.heavy) {
                        // note longue sur un temps fort : elle reste une note de l’accord, la plus proche de celui qui suit
                        let bj = lastN.idx, bc = Infinity;
                        S.forEach((v, j) => { if (ci.ct.has(bkMod(v))) { const c = Math.abs(v - nS[ti]) + 0.3 * Math.abs(v - from) + (v === from ? 3 : 0); if (c < bc) { bc = c; bj = j; } } });
                        lastN.idx = bj; lastN.x = S[bj];
                    } else if (ti >= 0) {
                        const cands = [nS[ti - 1], nS[ti + 1]].filter(v => v !== undefined);
                        let pick = null, pc = Infinity;
                        cands.forEach(v => { const c = Math.abs(v - from) + (v === from ? 4 : 0); if (c < pc) { pc = c; pick = v; } });   // jamais la note qu'on vient de jouer
                        if (pick !== null) { const j = near(S, pick); lastN.idx = j; lastN.x = S[j]; }
                    }
                }
            }
            // ---- notes à jouer : durée liée, intensité, ornements ----
            const fast = thin > 0.5;
            const ornP = ph.orn && !fast ? (flavor === 'sevdah' ? 0.4 : (flavor === 'tsifte' ? 0.36 : 0.28)) * (1 - thin) : 0;
            const sd0 = (seed >>> 0) + 977 * m;
            const orng = bkLcg(sd0 + (li + 1) * 131);
            const breath = (role === 'B' && L >= 4) || (isTurn && L > 1);
            walk.forEach((nt, k) => {
                const prevNote = k > 0 ? walk[k - 1] : null;
                const interval = prevNote ? Math.abs(nt.x - prevNote.x) : 1;
                let leg = nt.d >= 2 ? 0.97 : (interval === 0 ? 0.8 : (interval <= 2 ? 0.97 : 0.9));
                if (k === n - 1 && breath && !run) leg = Math.min(leg, nt.closing && flavor === 'sevdah' ? 0.97 : 0.82);
                let pos = P(nt.e), dur = Math.max(0.1 / spe, P(nt.d) * leg);
                const archV = 0.92 + 0.14 * Math.sin(Math.PI * (li + pos / bpb) / LL);
                const vel = clampV(((nt.strong ? 0.78 : 0.64) + 0.1 * I) * dyn * archV * (nt.closing ? 0.94 : 1));
                const S = nt.S, j = nt.idx;
                const up = S[j + 1], dn = S[j - 1];
                // ornement : tiré à part, avec un générateur propre à la mesure (la ligne reste identique à chaque reprise du rôle)
                let ornKind = 0;
                if (ornP > 0 && orng() < ornP) {
                    if (nt.d >= 1.9 && (nt.strong || nt.closing) && up !== undefined && dur * 60 / (env.bpm || 120) > 0.5) ornKind = 2;                // mordant
                    else if (nt.strong && nt.d >= 1 - eps && k > 0 && (up !== undefined || dn !== undefined) && orng() < 0.7) ornKind = 1;             // petite note sur le temps
                    else if (nt.d >= 2.4 && dn !== undefined && S[j - 2] !== undefined && flavor !== 'dance') ornKind = 3;                              // mélisme
                }
                const gdur = 0.16 / spe;
                const doubled = ph.oct && thin < 0.6 && nt.d >= 1 - eps;
                if (ornKind === 1) {
                    const g = (k % 2 === 0 && up !== undefined) || dn === undefined ? up : dn;
                    piano.push({ pos, dur: gdur, vel: clampV(0.54 * dyn), rootIndex: 0, intervals: [g], art: 'orn', oct: false });
                    pos += gdur; dur = Math.max(0.1 / spe, dur - gdur);
                } else if (ornKind === 2) {
                    const q = 0.2 / spe;
                    [nt.x, up].forEach((x, z) => {
                        piano.push({ pos: pos + z * q, dur: q * 0.95, vel: clampV((0.62 + 0.04 * z) * dyn), rootIndex: 0, intervals: [x], art: 'orn', oct: false });
                    });
                    pos += 2 * q; dur = Math.max(0.1 / spe, dur - 2 * q);
                } else if (ornKind === 3) {
                    const q = 0.22 / spe;
                    [S[j - 2], dn].forEach((x, z) => {
                        piano.push({ pos: pos + z * q, dur: q * 0.95, vel: clampV((0.5 + 0.05 * z) * dyn), rootIndex: 0, intervals: [x], art: 'orn', oct: false });
                    });
                    pos += 2 * q; dur = Math.max(0.1 / spe, dur - 2 * q);
                }
                piano.push({ pos, dur, vel, rootIndex: 0, intervals: [nt.x], art: 'lin', oct: doubled });
            });
            env.state.balkanMel = walk[n - 1].x;
            lastMelX = walk[n - 1].x;
        }
    }
    if (run && lastMelX !== null) {
        // la phrase rapide part de la dernière note de la ligne (pas d'un saut d'octave) et vise toujours le haut de l'accord suivant
        const rn = popRun(env, lastSeg.cs, lastMelX, nextV[nextV.length - 1], nRun);
        if (rn.length === nRun) runNotes = rn;
    }
    runNotes.forEach((x, k) => piano.push({
        pos: runFrom + k / nRun, dur: 0.92 / nRun, vel: clampV((0.5 + 0.32 * k / (nRun - 1)) * dyn),
        rootIndex: 0, intervals: [x], art: 'run'
    }));

    // ---- accordéon : accompagnement (accords courts, tenus ou arpégés selon la couleur) ----
    const chord = (pos, dur, vel) => {
        if (run && pos >= runFrom - eps) return;
        piano.push({ pos, dur, vel: clampV(vel * dyn), rootIndex: 0, intervals: Vs[segAt(pos)], art: 'pah' });
    };
    if (sevdahN) {
        if (ph.feel === 'arp') {
            // main gauche en vague, une note par croche (bas - milieu - haut - milieu), très douce
            for (let e = 0; e < E; e++) {
                if (run && P(e) >= runFrom - eps) continue;
                const V = Vs[segAt(P(e))];
                piano.push({ pos: P(e), dur: 1.7 / spe, vel: clampV((e % 2 === 0 ? 0.44 : 0.36) * dyn * (melBar ? 0.92 : 1.1)), rootIndex: 0, intervals: [V[[0, 1, 2, 1][e % 4]]], art: 'arp' });
            }
        } else {
            // nappe tenue au soufflet, relancée à chaque accord, avec un léger rappel au 3e temps
            segs.forEach((sg, si) => {
                const e1 = (run && sg.e >= bpb - eps) ? runFrom : sg.e;
                if (e1 - sg.s > 0.2) piano.push({ pos: sg.s, dur: (e1 - sg.s) * 0.97, vel: clampV(0.42 * dyn * (melBar ? 0.9 : 1.1)), rootIndex: 0, intervals: Vs[si], art: 'pad' });
            });
            if (!halves && !run) chord(bpb / 2, 0.8, 0.46);
        }
    } else if (tsifteN) {
        // contretemps sur les « tek » du maqsum (croches 1, 3 et 6), plus légers sous la ligne
        [[1, 0.58], [3, 0.6], [6, 0.64]].forEach(([e, v]) => chord(P(e), 0.7 / spe, v * (melBar ? 0.82 : 1)));
    } else {
        groups.forEach((g, gi) => {
            if (feel === 'oompah') {
                if (gi % 2 === 1) chord(P(gs[gi]), 0.5, melBar ? 0.62 : 0.74);       // l'accord remplace la basse sur le temps faible
            } else {
                for (let k = 1; k < g; k++) {
                    const last = k === g - 1;
                    if ((melBar || thin > 0.5) && !last) continue;                    // sous la ligne (ou si c'est rapide) : seulement le contretemps de fin de groupe
                    chord(P(gs[gi] + k), 0.6 / spe, ((last ? 0.72 : 0.6) + 0.08 * I) * (melBar ? 0.85 : 1));
                }
            }
        });
    }

    // ---- basse : fondamentale / quinte, note d'approche vers l'accord suivant ----
    const PATS = [[0, 1], [0, 0, 1, 1], [0, 1, 0, 2]];            // 0 fondamentale, 1 quinte, 2 tierce
    const pat = PATS[ph.bassIdx % PATS.length];
    let lastBassAbs = null;
    segs.forEach((sg, si) => {
        const T = popBassTones(env, sg.cs);
        const tone = [T.root, T.fifth, T.third];
        const lastHere = si === segs.length - 1;
        const nxt = lastHere ? (changeNext ? nextStep : null) : segs[si + 1].cs;
        const inSeg = (pos) => pos >= sg.s - eps && pos < sg.e - eps;
        if (sevdahN) {
            // notes longues : fondamentale sur le 1er temps, quinte sur le 3e (ou fondamentale), qui se prolongent
            const pts = halves ? [sg.s] : [0, bpb / 2];
            pts.forEach((pos, n) => {
                const a = n === 0 ? T.root : (ph.bassIdx % 2 ? T.fifth : T.root);
                const nextPos = n + 1 < pts.length ? pts[n + 1] : sg.e;
                bass.push({ pos, abs: a, dur: Math.max(0.5, (nextPos - pos) * 0.92), vel: clampV((n === 0 ? 0.74 : 0.6) * (0.85 + 0.2 * I)) });
                lastBassAbs = a;
            });
        } else if (tsifteN) {
            // la basse suit les « dum » du maqsum (croches 0 et 4) et pousse vers le « tek » de la croche 6
            const TS = [[[0, 0, 0.92], [4, 0, 0.78], [6, 1, 0.58]], [[0, 0, 0.92], [3, 0, 0.5], [4, 1, 0.74], [6, 0, 0.58]], [[0, 0, 0.92], [4, 0, 0.8], [5, 1, 0.5], [6, 0, 0.58]]];
            const pts = TS[ph.bassIdx % TS.length].filter(([e]) => inSeg(P(e)));
            pts.forEach(([e, t, v], n) => {
                const nextE = n + 1 < pts.length ? pts[n + 1][0] : Math.round(sg.e * spe);
                const a = tone[t];
                bass.push({ pos: P(e), abs: a, dur: Math.max(0.3 / spe, (nextE - e) * 0.8 / spe), vel: clampV(v * (0.85 + 0.2 * I)) });
                lastBassAbs = a;
            });
        } else {
            let n = 0;
            groups.forEach((g, gi) => {
                const pos = P(gs[gi]);
                if (!inSeg(pos)) return;
                if (feel === 'oompah' && gi % 2 === 1) return;
                const a = tone[pat[n % pat.length]];
                const first = gi === 0;
                bass.push({ pos, abs: a, dur: (feel === 'oompah' ? 0.85 : 0.72 * g / spe), vel: clampV((first ? 0.9 : 0.74) * (0.85 + 0.2 * I)) });
                lastBassAbs = a;
                n++;
            });
        }
        if (lastHere && nxt && (isTurn ? 0.85 : (flavor === 'sevdah' ? 0.4 : 0.55)) > rng()) {
            // note d'approche sur la dernière croche : annonce l'accord suivant (jamais la note qu'on vient de jouer)
            let apr = popBassApproach(env, T.root, nxt, rng);
            if (apr === lastBassAbs) apr = popBassApproach(env, T.root, nxt, rng);
            if (apr !== lastBassAbs) {
                const aprPos = P(E - 1);
                const before = bass.filter(b => b.pos < aprPos - eps).pop();          // la note précédente s'arrête avant l'approche
                if (before) before.dur = Math.min(before.dur, Math.max(0.25 / spe, aprPos - before.pos - 0.04));
                bass.push({ pos: aprPos, abs: apr, dur: 0.8 / spe, vel: clampV(0.7 * (0.85 + 0.2 * I)) });
            }
        }
    });

    // ---- percussions ----
    const dr = (e, drum, vel, extra) => drums.push(Object.assign({ pos: P(e), drum, vel: Math.min(1, vel * (0.85 + 0.2 * I)) }, extra || {}));
    const pickup = changeNext && !isTurn && rng() < 0.5;          // petite note de baguette qui lance l'accord suivant
    if (sevdahN) {
        // presque rien : un « dum » au 1er temps, un « tek » très doux au 3e, un léger « ka » avant le changement d'accord
        if (ph.perc) {
            dr(0, 'dum', 0.62); dr(4, 'dum', 0.4); dr(6, 'ka', 0.2);
            if (changeNext) dr(7, 'ka', 0.2);
        }
    } else if (tsifteN) {
        // darbuka « maqsum » : dum tek . tek dum . tek . ; la mesure de réponse prend l'appui de la variante « baladi »
        const answer = (i % 2 === 1);
        const MAQ = ph.darIdx === 0
            ? [[0, 'dum', 1], [1, 'tek', 0.72], [3, 'tek', 0.74], [4, 'dum', 0.92], [6, 'tek', 0.76]]
            : [[0, 'dum', 1], [1, 'dum', 0.55], [3, 'tek', 0.72], [4, 'dum', 0.9], [6, 'tek', 0.76]];
        MAQ.forEach(([e, d, v]) => dr(e, d, v));
        [[2, 0.3], [5, 0.28], [7, 0.34]].forEach(([e, v]) => { if (answer || I > 0.6 || e === 7) dr(e, 'ka', v); });
        if (answer && I > 0.5) dr(4.5, 'ka', 0.24);
    } else if (kolo) {
        // tapan (grosse caisse frappée à la mailloche) sur les temps, baguette fine sur les contretemps
        const TAP = [
            [[0, 'tapan', 1], [1, 'stick', 0.5], [2, 'tapan', 0.82], [3, 'stick', 0.55]],
            [[0, 'tapan', 1], [1, 'stick', 0.45], [2, 'stick', 0.5], [2.5, 'stick', 0.3], [3, 'stick', 0.6]],
            [[0, 'tapan', 1], [1, 'stick', 0.5], [2, 'tapan', 0.8], [3, 'stick', 0.5], [3.5, 'stick', 0.32]]
        ];
        TAP[ph.percIdx % TAP.length].forEach(([e, d, v]) => dr(e, d, v));
        if (pickup) dr(3.5, 'stick', 0.34);
    } else if (aksak) {
        // darbuka : dum sur le 1er et le 3e groupe, tek sur les autres débuts de groupe, ka de remplissage
        const DAR = [
            [[0, 'dum', 1], [2, 'tek', 0.7], [3, 'ka', 0.4], [4, 'dum', 0.88], [6, 'tek', 0.75], [7, 'ka', 0.4], [8, 'tek', 0.62]],
            [[0, 'dum', 1], [1, 'ka', 0.33], [2, 'tek', 0.7], [4, 'dum', 0.85], [5, 'ka', 0.33], [6, 'tek', 0.72], [7, 'ka', 0.38], [8, 'tek', 0.55]]
        ];
        DAR[ph.darIdx % DAR.length].forEach(([e, d, v]) => dr(e, d, v));
        if (I > 0.62 || i % 2 === 1) [1, 5].forEach(e => dr(e + 0.5, 'ka', 0.28));
        if (pickup) dr(E - 0.5, 'ka', 0.3);
    } else if (ternary) {
        groups.forEach((g, gi) => { dr(gs[gi], 'dum', gi % 2 === 0 ? 1 : 0.7); dr(gs[gi] + 1, 'ka', 0.35); dr(gs[gi] + 2, 'tek', 0.62); });
    } else {
        groups.forEach((g, gi) => {
            dr(gs[gi], gi % 2 === 0 ? 'tapan' : 'stick', gi % 2 === 0 ? (gi === 0 ? 1 : 0.8) : 0.55);
            if (I > 0.5) dr(gs[gi] + 1, 'stick', 0.3);
        });
    }
    // daire (tambour sur cadre à cymbalettes) : frémissement continu en croches
    if (ph.daire && I > 0.4 && !sevdahN) for (let e = 0; e < E; e++) dr(e, 'daire', gs.includes(e) ? 0.38 : 0.22);
    // roulement avant l'accord suivant
    if (isTurn && L > 1 && ph.fill && !(sevdahN && !ph.perc)) {
        const keep = drums.filter(d => d.pos < runFrom - eps || d.drum === 'daire');
        drums.length = 0; keep.forEach(d => drums.push(d));
        const soft = sevdahN ? 0.5 : 1;
        for (let k = 0; k < nRun; k++) {
            const d = kolo ? 'stick' : (k % 2 ? 'tek' : 'ka');
            drums.push({ pos: runFrom + k / nRun, drum: d, vel: Math.min(1, (0.3 + 0.55 * k / (nRun - 1)) * soft) });
        }
    }

    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums, accordion: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { balkanVoicing, balkanPhraseExtras, buildBalkanPlan, balkanFlavorOf, balkanRoleOf, balkanBarRhythm, balkanContour, BK_BAR8, BK_CELL2, BK_CELL3 };
}
