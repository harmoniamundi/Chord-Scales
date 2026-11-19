// band/guitar-baroque-plan.js — orchestre « Guitare » sur le style de grille Baroque (rythme imposé « c-baroque ») : la guitare
// joue comme un prélude pour luth ou pour guitare (à la manière des préludes de Bach transcrits, de Weiss, de Sanz), sans DOM.
// Chargé par index.html via <script src="band/guitar-baroque-plan.js"> (après band/band-helpers.js, avant band/guitar-plan.js)
// et testé par band/guitar-baroque-plan.test.js.
//
// ===================== Écriture =====================
//  - Le pouce (p) tient la basse sur les cordes graves : basse tenue (premier et troisième temps), basse qui marche (une note par
//    temps, fondamentale puis notes de l'accord, la dernière amène par degré conjoint la basse de l'accord suivant).
//  - Les doigts (i, m, a) jouent un flot continu de doubles-croches (croches au-delà de GB_FAST_BPM, croches de trois en mesure
//    composée) sur les cordes aiguës, laissées vibrer comme sur un luth :
//      prelude  motif de prélude d'un demi-temps fort (la basse ouvre, les doigts arpègent l'accord), repris à chaque demi-mesure ;
//      cells    cellules d'un temps sur les notes de l'accord, avec montée ou descente d'un rang d'un temps à l'autre (séquence) ;
//      scale    cellules de gamme (degrés conjoints) qui progressent d'un temps à l'autre, autour des notes de l'accord.
//  - Le dernier temps mène souvent par une petite gamme à l'accord suivant ; la fin de phrase se pose sur un accord arpégé lent.
//  - Registre réel de la guitare et voicings de band/guitar-plan.js (gtrVoice : basse entre mi2 et sol3, aigu entre mi3 et sol5).
// Fonctions pures : env comme dans band/guitar-plan.js (transOffset, findChordObj, splitBeat, bpm, density, state.gtrVoice).

// Voix et registre de la guitare (band/guitar-plan.js) : globaux en navigateur ; sous Node, chargés au moment de l'appel
// (band/guitar-plan.js charge lui-même ce fichier : un chargement immédiat serait circulaire).
function gbGuitar() {
    if (typeof gtrVoice !== 'undefined') return { gtrVoice, gtrUpNote, GTR_BASE, GTR_BASS_LO, GTR_BASS_HI, GTR_UP_LO, GTR_UP_HI };
    return require('./guitar-plan.js');
}
if (typeof popScaleNotes === 'undefined' && typeof require === 'function') {
    var { popScaleNotes } = require('./band-helpers.js');
}

const GB_GROOVE = 'c-baroque';
const GB_FAST_BPM = 112;   // au-delà : croches au lieu de doubles-croches (débit jouable aux doigts)

// Cellules d'un temps : rangs dans les notes aiguës de l'accord (0 = la plus grave ; au-delà, l'octave supérieure si jouable)
const GB_CELLS = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [3, 2, 1, 0], [2, 1, 0, 1], [0, 2, 3, 2], [1, 2, 3, 2], [2, 3, 1, 3]];
// Montée ou descente d'un rang d'un temps à l'autre (séquence)
const GB_SHIFTS = [[0, 0, 0, 0], [0, 0, 1, 1], [1, 1, 0, 0], [0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 2, 1]];
// Motifs de prélude sur deux temps (8 doubles-croches) : null = la basse seule ouvre le motif
const GB_PRELUDE = [[null, 0, 1, 2, 3, 1, 2, 3], [null, 1, 2, 1, 0, 1, 2, 1], [null, 0, 1, 2, 1, 0, 1, 2], [null, 2, 1, 3, 1, 2, 1, 3]];
// Cellules de gamme : décalages en degrés conjoints
const GB_SCALE_CELLS = [[0, 1, 2, 1], [0, 1, 2, 3], [0, 2, 1, 2], [3, 2, 1, 0], [2, 1, 0, 1]];
// Mesures composées : un groupe de trois croches par pulsation
const GB_TERN = [[0, 1, 2], [2, 1, 0], [0, 2, 1], [1, 2, 3], [0, 1, 3]];

// Choix faits une fois par phrase (ajoutés à ceux de la guitare classique : intensité, roulé des accords, fin de phrase…)
function guitarBaroqueExtras(ctx, rng, prev) {
    const pb = (prev && prev.gtrBaroque) ? prev : null;
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const idx = (n) => Math.floor(rng() * n);
    const fast = (ctx && ctx.bpm || 84) > GB_FAST_BPM;
    let fam;
    if (pb && rng() < 0.35 && !(fast && pb.gbFam === 'prelude')) fam = pb.gbFam;
    else fam = fast ? pickW([['cells', 3], ['scale', 1.5]]) : pickW([['prelude', 3], ['cells', 3], ['scale', 2]]);
    const bass = fam === 'prelude' ? 'held' : pickW([['walk', 3], ['held', 1.5]]);
    return {
        gtrBaroque: true, gbFam: fam, gbBass: bass,
        gbCellA: idx(GB_CELLS.length), gbCellB: idx(GB_CELLS.length), gbShift: idx(GB_SHIFTS.length),
        gbPre: idx(GB_PRELUDE.length), gbTern: idx(GB_TERN.length), gbTernB: idx(GB_TERN.length),
        gbScaleCell: idx(GB_SCALE_CELLS.length), gbScaleDir: pickW([[1, 3], [-1, 2]]),
        gbRun: rng() < 0.7
    };
}

// Plan d'une mesure
function buildGuitarBaroquePlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn) {
    const { gtrVoice, gtrUpNote, GTR_BASE, GTR_BASS_LO, GTR_BASS_HI, GTR_UP_LO, GTR_UP_HI } = gbGuitar();
    const rng = ph.rng;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const off = env.transOffset;
    const div = ternary ? 3 : ((env.bpm || 84) > GB_FAST_BPM ? 2 : 4);   // notes des doigts par temps
    const splitAt = env.splitBeat || 2;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.72 + 0.3 * I) * (0.94 + 0.06 * prog) * (isTurn ? 0.95 : 1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const holdOn = !changeNext && !!nextStep;
    const isFinal = !nextStep && isLastMeasureOfStep;
    const dens = Number.isFinite(env.density) ? Math.max(0, Math.min(1, env.density)) : null;
    const clamp = (v) => Math.max(0.12, Math.min(1, v));
    const ev = [];

    segs.forEach((sg, si) => {
        const lastOne = si === segs.length - 1;
        const voice = gtrVoice(env, sg.cs, env.state.gtrVoice);
        env.state.gtrVoice = voice;
        const { bass, alt, up } = voice;
        const len = sg.e - sg.s;
        const toWritten = (mid) => mid - GTR_BASE - off;
        const endPos = sg.e + (isFinal && lastOne ? 2.5 : ((lastOne && holdOn) ? 1.0 : 0.04));
        const ring = (pos, max) => Math.max(0.15, Math.min(endPos - pos, max));
        const add = (pos, vel, notes, dur, extra) => {
            const sorted = notes.slice().sort((a, b) => a - b).filter((x, j, arr) => j === 0 || x !== arr[j - 1]);
            const c = sorted.length;
            ev.push(Object.assign({
                pos: sg.s + pos, dur, vel: clamp(vel * gv),
                rootIndex: 0, intervals: sorted.map(toWritten), noteVels: sorted.map((_, j) => (c === 1 || j === 0) ? 1 : 0.85),
                roll: c > 1 ? (ph.roll || 0.015) : 0, dir: 1, lay: rng() * 0.006, wide: true, gainMul: 1.15
            }, extra || {}));
        };

        // Dernière mesure de la grille (sans boucle) : accord plein arpégé lentement, qui résonne
        if (isFinal && lastOne && si === 0) {
            add(0, 0.66, [bass].concat(up), ring(sg.s, bpb + 2.5), { roll: 0.05 + rng() * 0.02 });
            return;
        }

        const toCs = lastOne ? (changeNext ? nextStep : null) : segs[si + 1].cs;   // accord vers lequel on s'oriente

        // ---------- pouce : basse ----------
        // Notes de l'accord dans le registre des basses, au-dessus de la basse
        const pcs = new Set(up.map(x => ((x % 12) + 12) % 12));
        const T = [bass];
        for (let m = bass + 1; m <= Math.min(bass + 12, GTR_BASS_HI + 5); m++) if (pcs.has(((m % 12) + 12) % 12)) T.push(m);
        if (!T.includes(alt) && alt > bass && alt <= GTR_BASS_HI + 5) T.push(alt);
        T.sort((a, b) => a - b);
        let kind = ph.gbBass;
        if (dens !== null && dens > 0.5 && kind === 'held' && rng() < (dens - 0.5) * 2.2) kind = 'walk';
        const beats = Math.floor(len);
        // Approche diatonique (degré conjoint de la gamme de l'accord suivant) de la basse suivante, du côté de la basse actuelle
        let app = null;
        if (toCs && beats >= 2) {
            const tgt = gtrVoice(env, toCs, voice).bass;
            const side = bass >= tgt ? 1 : -1;
            const S = popScaleNotes(toCs, tgt - 3 - GTR_BASE - off, tgt + 3 - GTR_BASE - off).map(n => n + GTR_BASE + off)
                .filter(n => n !== tgt && (n - tgt) * side > 0 && n >= GTR_BASS_LO && n <= GTR_BASS_HI + 5)
                .sort((a, b) => Math.abs(a - tgt) - Math.abs(b - tgt));
            if (tgt !== bass && S.length) app = S[0];
        }
        if (kind === 'held' || beats < 2) {
            add(0, 0.74 + (sg.s === 0 ? 0.04 : 0), [bass], ring(sg.s, Math.min(len, 2) + 0.4));
            if (len >= 4) add(2, 0.6, [rng() < 0.55 ? bass : alt], ring(sg.s + 2, 2.4));
        } else {
            const shape = (i % 2 === 0) ? [0, 1, 2, 1] : [0, 2, 1, 2];
            for (let b = 0; b < beats; b++) {
                const last = b === beats - 1;
                const p = (last && app !== null) ? app : T[Math.min(T.length - 1, shape[b % 4])];
                add(b, b === 0 ? 0.74 : 0.56, [p], ring(sg.s + b, 1.1));
            }
        }

        // ---------- doigts : flot continu ----------
        const slots = Math.round(len * div);
        const fig = new Array(slots).fill(null);
        let fam = ph.gbFam;
        if (ternary) fam = fam === 'scale' ? 'scale' : 'tern';
        else if (fam === 'prelude' && (div !== 4 || len < 2)) fam = 'cells';
        if (!ternary && i % 4 === 3 && fam === 'cells' && rng() < 0.4) fam = 'scale';   // une mesure de gamme pour relancer la phrase
        const U = (k) => gtrUpNote(up, Math.max(0, k));
        if (fam === 'prelude') {
            const P = GB_PRELUDE[ph.gbPre % GB_PRELUDE.length];
            const closing = isTurn && lastOne && L > 1;
            for (let g = 0; g * 8 < slots; g++) {
                const pat = (closing && (g + 1) * 8 >= slots) ? [null, 0, 1, 2, 3, 2, 1, 0] : P;
                for (let k = 0; k < 8 && g * 8 + k < slots; k++) if (pat[k] !== null) fig[g * 8 + k] = U(pat[k]);
            }
        } else if (fam === 'cells') {
            const A = GB_CELLS[ph.gbCellA % GB_CELLS.length], B = GB_CELLS[ph.gbCellB % GB_CELLS.length], sh = GB_SHIFTS[ph.gbShift % GB_SHIFTS.length];
            for (let b = 0; b < len; b++) {
                const cell = b % 2 === 0 ? A : B;
                for (let k = 0; k < div && b * div + k < slots; k++) fig[b * div + k] = U((div === 4 ? cell[k] : cell[k * 2]) + sh[b % 4]);
            }
        } else if (fam === 'tern') {
            const A = GB_TERN[ph.gbTern % GB_TERN.length], B = GB_TERN[ph.gbTernB % GB_TERN.length];
            for (let b = 0; b < len; b++) for (let k = 0; k < 3 && b * 3 + k < slots; k++) fig[b * 3 + k] = U((b % 2 === 0 ? A : B)[k]);
            for (let b = 0; b < len; b++) if (b * 3 < slots && (kind === 'held' ? (b === 0 || b === 2) : true)) fig[b * 3] = null;   // le pouce ouvre la pulsation
        } else { // scale
            const S = popScaleNotes(sg.cs, GTR_UP_LO - GTR_BASE - off, Math.min(GTR_UP_HI, up[up.length - 1] + 7) - GTR_BASE - off).map(n => n + GTR_BASE + off);
            if (S.length >= 6) {
                const dir = ph.gbScaleDir || 1;
                const start = dir > 0 ? up[0] : up[up.length - 1];
                let i0 = 0; S.forEach((x, j) => { if (Math.abs(x - start) < Math.abs(S[i0] - start)) i0 = j; });
                const cell = GB_SCALE_CELLS[ph.gbScaleCell % GB_SCALE_CELLS.length];
                const per = ternary ? 3 : div;
                for (let b = 0; b < len; b++) for (let k = 0; k < per && b * per + k < slots; k++) {
                    const d = per === 4 ? cell[k] : (per === 3 ? cell[k] : cell[k * 2]);
                    fig[b * per + k] = S[Math.max(0, Math.min(S.length - 1, i0 + dir * b + dir * d))];
                }
            } else {
                for (let k = 0; k < slots; k++) fig[k] = U([0, 1, 2, 1][k % 4]);
            }
        }

        // Dernier temps : courte gamme vers l'accord suivant, ou (fin de phrase) accord arpégé lent
        const lastBeat = slots - div;
        if (isTurn && lastOne && L > 1 && ph.endingOn && len >= 3) {
            for (let k = lastBeat; k < slots; k++) fig[k] = null;
            add(len - 1, 0.56, [bass].concat(up), ring(sg.s + len - 1, 2.6), { roll: 0.04 + rng() * 0.02 });
        } else if (toCs && ph.gbRun && div === 4 && len >= 2 && fam !== 'prelude') {
            const nv = gtrVoice(env, toCs, voice);
            const target = nv.up[Math.min(1, nv.up.length - 1)];
            const before = fig[lastBeat] !== null ? fig[lastBeat] : up[up.length - 1];
            const S = popScaleNotes(toCs, Math.min(before, target) - 5 - GTR_BASE - off, Math.max(before, target) + 5 - GTR_BASE - off)
                .map(n => n + GTR_BASE + off).filter(n => n !== target && n >= GTR_UP_LO && n <= GTR_UP_HI);
            const side = before >= target ? 1 : -1;
            const run = S.filter(n => (n - target) * side > 0).sort((a, b) => Math.abs(a - target) - Math.abs(b - target)).slice(0, 3).reverse();
            if (run.length === 3) { fig[lastBeat + 1] = run[0]; fig[lastBeat + 2] = run[1]; fig[lastBeat + 3] = run[2]; }
        }

        // Curseur « Densité » sous 0,5 : les doigts s'éclaircissent (la première note de chaque temps reste)
        if (dens !== null && dens < 0.5) {
            const t = (0.5 - dens) / 0.5;
            for (let k = 1; k < slots; k++) if (fig[k] !== null && k % div !== 0 && rng() < 0.9 * t) fig[k] = null;
        }

        fig.forEach((p, k) => {
            if (p === null) return;
            const onBeat = k % div === 0;
            const base = onBeat ? 0.58 : (div === 4 && k % 2 === 0 ? 0.5 : 0.45);
            add(k / div, base + (rng() - 0.5) * 0.05, [p], ring(sg.s + k / div, div === 4 ? 0.6 : 0.9));
        });
    });

    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [], classicalGuitar: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { guitarBaroqueExtras, buildGuitarBaroquePlan, GB_GROOVE, GB_FAST_BPM, GB_CELLS, GB_PRELUDE, GB_SCALE_CELLS, GB_TERN };
}
