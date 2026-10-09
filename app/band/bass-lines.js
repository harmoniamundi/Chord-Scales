// band/bass-lines.js — lignes de basse du style swing (walking bass), sans DOM :
//   resolveBassToken   note de basse désignée par un jeton de motif (R, 3, 5, 7, O, A… ; « n » = accord suivant)
//   buildWalkingBass   mesure à un accord : quatre noires, « à deux temps » occasionnel, passage chromatique, approche
//   buildWalkingBassSplit   mesure à deux accords : une fondamentale par accord, approches chromatiques
// Fonctions pures : le moteur passe `env` ({ transOffset, findChordObj }, comme dans band/band-helpers.js) et un générateur
// pseudo-aléatoire `rng`. Chargé par index.html via <script src="band/bass-lines.js"> (après band/band-helpers.js)
// et testé par band/bass-lines.test.js.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof bassNear === 'undefined' && typeof require === 'function') {
    var { bassNear } = require('./band-helpers.js');
}
const BASSL_SCALES = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

// Note de basse (hauteur absolue en demi-tons) pour un "degré" de pattern.
function resolveBassToken(env, tok, step, nextStep, isLastMeasureOfStep, rng) {
    const useNext = tok.charAt(0) === 'n';
    const t = useNext ? tok.slice(1) : tok;
    const cs = (useNext && isLastMeasureOfStep && nextStep) ? nextStep : step;
    const tones = env.findChordObj(cs.chordId).notes;
    const base = cs.rootIndex;
    const fifth = base + (tones[2] !== undefined ? tones[2] : 7);
    switch (t) {
        case '3': return base + (tones[1] !== undefined ? tones[1] : 4);
        case '5': return fifth;
        case '7': return base + (tones[3] !== undefined ? tones[3] : (tones[2] !== undefined ? tones[2] : 7));
        case 'O': { const r = base + tones[0]; return r > 5 ? r - 12 : r + 12; }
        case 'A': {
            if (isLastMeasureOfStep && nextStep) {
                const target = bassNear(env, nextStep);
                return target + (rng() < 0.65 ? -1 : 1);
            }
            return fifth;
        }
        default: return base + tones[0];
    }
}

// Ligne de basse walking (swing) : varie à chaque mesure — quatre noires (fondamentale, puis
// tierce / seconde / quinte / septième), "deux temps" occasionnel, note de passage chromatique
// en croche swinguée, et note d'approche chromatique vers l'accord suivant en fin d'accord.
function buildWalkingBass(env, step, nextStep, isLastMeasureOfStep, rng, swing) {
    const tones = env.findChordObj(step.chordId).notes;
    const rt = step.rootIndex;
    const root = bassNear(env, step);
    const third = rt + (tones[1] !== undefined ? tones[1] : 4);
    const fifth = rt + (tones[2] !== undefined ? tones[2] : 7);
    const seventh = rt + (tones[3] !== undefined ? tones[3] : 12);
    const sc = (BASSL_SCALES[step.scaleId] && BASSL_SCALES[step.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
    const second = rt + (sc[1] !== undefined ? sc[1] : 2);
    const pick = (opts) => opts[Math.floor(rng() * opts.length)];

    let approach = null;
    if (isLastMeasureOfStep && nextStep) {
        const target = bassNear(env, nextStep);
        approach = target + (rng() < 0.65 ? -1 : 1);
    }

    const hits = [];
    if (rng() < 0.15) { // feeling "à deux temps"
        hits.push({ pos: 0, abs: root, dur: 1.9, vel: 0.9 });
        hits.push({ pos: 2, abs: pick([fifth, third, fifth]), dur: approach !== null ? 1.4 : 1.9, vel: 0.8 });
        if (approach !== null) hits.push({ pos: 3 + swing, abs: approach, dur: 0.3, vel: 0.6 });
        return hits;
    }

    const b1 = pick([third, second, fifth, third]);
    const c2 = [fifth, third, seventh, fifth].filter(n => n !== b1);
    const b2 = c2.length ? pick(c2) : fifth;
    let b3;
    if (approach !== null) b3 = approach;
    else {
        const c3 = [fifth, seventh, third].filter(n => n !== b2);
        b3 = c3.length ? pick(c3) : fifth;
    }
    hits.push({ pos: 0, abs: root, dur: 0.95, vel: 0.95 });
    hits.push({ pos: 1, abs: b1, dur: 0.95, vel: 0.8 });
    hits.push({ pos: 2, abs: b2, dur: 0.95, vel: 0.88 });
    hits.push({ pos: 3, abs: b3, dur: 0.95, vel: 0.8 });

    if (rng() < 0.18) { // note de passage chromatique (croche swinguée) vers le temps 3
        hits[1].dur = 0.6;
        hits.push({ pos: 1 + swing, abs: b2 + (b2 > b1 ? -1 : 1), dur: 0.3, vel: 0.55 });
    }
    return hits;
}

// Walking bass d'une mesure à deux accords : fondamentale de chaque accord sur son premier temps
// (temps 1 et 3), note d'approche chromatique vers le second accord au temps 2 et vers l'accord
// suivant au temps 4 ; parfois « à deux temps » (une fondamentale par accord).
function buildWalkingBassSplit(env, halves, nextStep, rng, swing) {
    const [A, B] = halves;
    const pick = (opts) => opts[Math.floor(rng() * opts.length)];
    const pc = (n) => ((n % 12) + 12) % 12;
    const tonesOf = (c) => {
        const t = env.findChordObj(c.chordId).notes, rt = c.rootIndex;
        return {
            root: bassNear(env, c),
            third: rt + (t[1] !== undefined ? t[1] : 4),
            fifth: rt + (t[2] !== undefined ? t[2] : 7)
        };
    };
    const a = tonesOf(A), b = tonesOf(B);
    // Approche chromatique vers une fondamentale ; si elle est identique à celle de départ,
    // on reste sur une note de l'accord.
    const approach = (from, toRoot, fallbacks) =>
        pc(toRoot) === pc(from.root) ? pick(fallbacks) : toRoot + (rng() < 0.65 ? -1 : 1);

    const nextRoot = nextStep ? bassNear(env, nextStep) : null;
    const midNote = approach(a, b.root, [a.fifth, a.third]);
    const endNote = nextRoot !== null ? approach(b, nextRoot, [b.fifth, b.third]) : pick([b.fifth, b.third]);

    const hits = [];
    if (rng() < 0.2) { // feeling « à deux temps » : une fondamentale par accord
        const withApproach = nextRoot !== null && pc(nextRoot) !== pc(b.root);
        hits.push({ pos: 0, abs: a.root, dur: 1.9, vel: 0.9 });
        hits.push({ pos: 2, abs: b.root, dur: withApproach ? 1.4 : 1.9, vel: 0.85 });
        if (withApproach) hits.push({ pos: 3 + swing, abs: endNote, dur: 0.3, vel: 0.6 });
        return hits;
    }
    hits.push({ pos: 0, abs: a.root, dur: 0.95, vel: 0.95 });
    hits.push({ pos: 1, abs: midNote, dur: 0.95, vel: 0.8 });
    hits.push({ pos: 2, abs: b.root, dur: 0.95, vel: 0.9 });
    hits.push({ pos: 3, abs: endNote, dur: 0.95, vel: 0.8 });
    return hits;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { resolveBassToken, buildWalkingBass, buildWalkingBassSplit };
}
