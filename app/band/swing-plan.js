// band/swing-plan.js — orchestre « standard » à 4 temps (swing, et base commune du piano / basse / batterie) et utilitaires de phrase, sans DOM :
//   bandPhraseLength    longueur de phrase (4, 3 ou 2 mesures) selon la durée de la grille
//   varyCell            variation d'un motif de piano (frappe décalée, retirée ou note de couleur ajoutée)
//   buildBandDrums      batterie swing / pop / latin d'une mesure (ride, charleston, grosse caisse, ghost notes, fills)
//   buildStandardPlan   piano + basse (walking bass en swing) + batterie d'une mesure à 4 temps
// Fonctions pures : env = { transOffset, findChordObj, swing (rapport de swing), state: { bandLastFill } } ;
// la mémoire entre mesures (bandLastFill : un fill vient d'être joué) est modifiée en place.
// Chargé par index.html via <script src="band/swing-plan.js"> (après band/band-helpers.js et band/bass-lines.js)
// et testé par band/swing-plan.test.js.

// Sous Node, les dépendances se chargent ; en navigateur ce sont des globaux (autres fichiers de band/).
if (typeof swingPos === 'undefined' && typeof require === 'function') {
    var { swingPos, pianoHitIntervals } = require('./band-helpers.js');
}
if (typeof buildWalkingBass === 'undefined' && typeof require === 'function') {
    var { resolveBassToken, buildWalkingBass, buildWalkingBassSplit } = require('./bass-lines.js');
}

// Longueur de phrase : 4 mesures si la grille s'y prête, sinon 3 ou 2.
function bandPhraseLength(grid) {
    const formLen = grid.reduce((s, it) => s + (it.measures || 1), 0);
    return [4, 3, 2].find(n => formLen >= n && formLen % n === 0) || 4;
}

// Variation d'un pattern de piano : une frappe décalée d'une croche, une frappe retirée,
// ou une note de couleur ajoutée sur un temps libre.
function varyCell(hits, rng, maxPos = 3.5) {
    const out = hits.map(h => h.slice());
    const taken = () => new Set(out.map(h => h[0]));
    const r = rng();
    if (r < 0.35 && out.length > 1) {
        const h = out[Math.floor(rng() * out.length)];
        const np = h[0] + (rng() < 0.6 ? -0.5 : 0.5);
        if (np >= 0 && np <= maxPos && !taken().has(np)) h[0] = np;
    } else if (r < 0.55 && out.length > 2) {
        out.splice(Math.floor(rng() * out.length), 1);
    } else if (r < 0.9) {
        const free = [0.5, 1, 1.5, 2.5, 3, 3.5].filter(p => p <= maxPos && !taken().has(p));
        if (free.length) out.push([free[Math.floor(rng() * free.length)], 0.4, 'N', 0.6]);
    }
    return out.sort((a, b) => a[0] - b[0]);
}

// Batterie : ride / charleston / grosse caisse selon le style, avec ghost notes qui suivent
// parfois les syncopes du piano, et fill à la fin de certaines phrases (suivi d'un crash).
function buildBandDrums(env, style, ph, i, L, piano, rng, swing, m) {
    const d = [];
    const add = (pos, drum, vel) => d.push({ pos, drum, vel });
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const isTurn = L > 1 && i === L - 1;
    const doFill = isTurn && ph.fill;
    const fillFrom = doFill ? 3 : 99;
    const dens = ph.density;
    const syncop = piano.filter(e => Math.abs(e.pos - Math.round(e.pos)) > 0.05 && e.pos < fillFrom);

    if (i === 0 && env.state.bandLastFill) {
        if (rng() < 0.6) add(0, 'crash', 0.9);
        env.state.bandLastFill = false;
    }
    if (isTurn) env.state.bandLastFill = doFill;

    if (style === 'swing') {
        [0, 1, 2, 3].forEach(b => { if (b < fillFrom) add(b, 'ride', b % 2 === 0 ? 0.62 : 0.5); });
        [1, 3].forEach(b => { if (b < fillFrom) add(b + swing, 'ride', 0.36); });
        if (rng() < 0.18 * dens) add((rng() < 0.5 ? 0 : 2) + swing, 'ride', 0.33);
        [1, 3].forEach(b => { if (b < fillFrom) add(b, 'pedal', 0.5); });
        if (ph.feather) [0, 1, 2, 3].forEach(b => { if (b < fillFrom) add(b, 'kick', 0.16 + rng() * 0.06); });
        else [0, 2].forEach(b => add(b, 'kick', 0.35));
        syncop.forEach(e => {
            if (rng() < 0.4 * dens) rng() < 0.7 ? add(e.pos, 'ghost', 0.7) : add(e.pos, 'kick', 0.55);
        });
        if (rng() < 0.15 * dens) add(swingPos(0.5 + Math.floor(rng() * 3), swing), 'ghost', 0.6);
        if (doFill) {
            if (ph.fillKind === 0) { add(3, 'snare', 0.5); add(3 + 1 / 3, 'tom1', 0.6); add(3 + 2 / 3, 'tom3', 0.72); }
            else { add(3, 'snare', 0.5); add(3 + swing, 'snare', 0.7); add(3 + swing, 'kick', 0.6); }
        }
    } else if (style === 'pop') {
        for (let p = 0; p < 4; p += 0.5) {
            if (p >= fillFrom) break;
            const open = p === 3.5 && rng() < 0.25 * dens;
            add(p, open ? 'ohat' : 'hat', Number.isInteger(p) ? 0.6 : 0.38);
        }
        if (ph.hat16) for (let p = 0.25; p < 4; p += 0.5) if (p < fillFrom) add(p, 'hat', 0.2);
        ph.kickPattern.forEach(p => { if (p < fillFrom) add(p, 'kick', p === 0 ? 1 : 0.85); });
        if (isTurn && !doFill && !ph.kickPattern.includes(3.5)) add(3.5, 'kick', 0.8);
        [1, 3].forEach(p => { if (p < fillFrom) add(p, 'snare', 0.9); });
        const ghostSlots = [1.75, 2.75, 3.75].filter(p => p < fillFrom);
        if (ghostSlots.length && rng() < 0.3 * dens) add(pick(ghostSlots), 'ghost', 0.6);
        syncop.forEach(e => { if (rng() < 0.25 * dens) add(e.pos, 'kick', 0.7); });
        if (doFill) {
            const drumsSeq = ph.fillKind === 0 ? ['snare', 'tom1', 'tom2', 'tom3'] : ['snare', 'snare', 'snare', 'snare'];
            [0.5, 0.55, 0.7, 0.85].forEach((v, k) => add(3 + k * 0.25, drumsSeq[k], v));
        }
    } else { // latin (bossa) : charleston en croches, grosse caisse en "dotted", clave au cross-stick
        for (let p = 0; p < 4; p += 0.5) {
            if (p >= fillFrom) break;
            const open = p === 3.5 && rng() < 0.2 * dens;
            add(p, open ? 'ohat' : 'hat', Number.isInteger(p) ? 0.5 : 0.32);
        }
        if (0 < fillFrom) add(0, 'kick', 0.8);
        if (2 < fillFrom) add(2, 'kick', 0.7);
        [1.5, 3.5].forEach(p => { if (p < fillFrom && rng() < 0.8) add(p, 'kick', 0.55); });
        (m % 2 === 0 ? [0, 1.5, 3] : [1, 2]).forEach(p => { if (p < fillFrom) add(p, 'rim', 0.55); });
        if (doFill) {
            if (ph.fillKind === 0) { add(3, 'tom1', 0.5); add(3.5, 'tom2', 0.6); add(3.75, 'tom3', 0.72); }
            else { add(3, 'rim', 0.55); add(3.25, 'rim', 0.5); add(3.5, 'snare', 0.5); }
        }
    }
    return d;
}

// Plan d'une mesure à 4 temps hors orchestres dédiés : piano (comping), basse, batterie.
function buildStandardPlan(env, style, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const swing = env.swing;
    const sw = (p) => swingPos(p, swing);
    const cell = isTurn ? ph.turn : (i === 0 ? ph.motif : (i === 1 ? ph.second : ph.varied));
    const tension = 0.92 + 0.08 * (L > 1 ? i / (L - 1) : 0);
    const chordFor = (pos) => {
        if (isLastMeasureOfStep && pos >= 3.5 && nextStep) return nextStep;
        if (halves) return pos >= 2 ? halves[1] : halves[0];
        return step;
    };
    // Chaque accord doit s'entendre au piano, même si le motif de comping n'a aucune frappe
    // dans sa moitié de mesure.
    let pcell = cell;
    if (halves) {
        pcell = cell.slice();
        if (!pcell.some(h => h[0] < 2)) pcell.push([0, 1.6, 'C', 0.78]);
        if (!pcell.some(h => h[0] >= 2 && h[0] < 3.5)) pcell.push([2, 1.5, 'C', 0.72]);
        pcell.sort((a, b) => a[0] - b[0]);
    }

    const piano = pcell.map((h, k) => {
        const [pos, dur, kind, vel] = h;
        const cs = chordFor(pos);
        const anticipated = isLastMeasureOfStep && pos >= 3.5 && !!nextStep;
        const nextPos = k + 1 < pcell.length ? pcell[k + 1][0] : 4;
        let room = anticipated ? (4 - pos + 0.6) : Math.max(0.2, nextPos - pos + 0.15);
        // le premier accord s'arrête au changement d'accord (temps 3)
        if (halves && pos < 2) room = Math.min(room, Math.max(0.15, 2 - sw(pos)));
        return {
            pos: sw(pos),
            dur: Math.min(dur, room),
            vel: Math.min(1, vel * tension),
            rootIndex: cs.rootIndex,
            intervals: pianoHitIntervals(env.findChordObj(cs.chordId), kind, ph.voicing, rng)
        };
    });

    let bass;
    if (style === 'swing') {
        bass = halves
            ? buildWalkingBassSplit(env, halves, nextStep, rng, swing)
            : buildWalkingBass(env, step, nextStep, isLastMeasureOfStep, rng, swing);
    } else {
        const bcell = (isTurn && ph.bassTurn) ? ph.bassTurn : (i === 2 ? ph.bassAlt : ph.bassMotif);
        let bc = bcell;
        if (halves) {
            // la fondamentale de chaque accord doit s'entendre à la basse
            bc = bcell.slice();
            if (!bc.some(b => b[0] < 2)) bc.push([0, 'R', 1.8, 0.9]);
            if (!bc.some(b => b[0] >= 1.9 && b[0] < 2.75)) bc.push([2, 'R', 1.6, 0.85]);
            bc.sort((a, b) => a[0] - b[0]);
        }
        const sameRoot = !!halves && (((halves[0].rootIndex - halves[1].rootIndex) % 12 + 12) % 12 === 0);
        bass = bc.map(([pos, tok, dur, vel]) => {
            let cs = step, nx = nextStep, last = isLastMeasureOfStep, d = dur;
            if (halves) {
                if (pos < 2) {
                    cs = halves[0];
                    nx = sameRoot ? null : halves[1]; // note d'approche vers le second accord
                    last = !!nx;
                    d = Math.min(dur, Math.max(0.25, 2 - sw(pos) - 0.05));
                } else {
                    cs = halves[1];
                }
            }
            return { pos: sw(pos), abs: resolveBassToken(env, tok, cs, nx, last, rng), dur: d, vel };
        });
    }

    const drums = buildBandDrums(env, style, ph, i, L, piano, rng, swing, m);
    return { piano, bass, drums };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bandPhraseLength, varyCell, buildBandDrums, buildStandardPlan };
}
