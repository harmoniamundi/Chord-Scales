// band/africa-plan.js — orchestre « Afrique » de la jam : six musiques populaires africaines jouées par une section de guitares
// électriques (ampli clair), une basse électrique, une batterie avec ses percussions, et selon le style un orgue et une section de
// cuivres. Chargé par index.html via <script src="band/africa-plan.js"> (après band-helpers.js) et testé par band/africa-plan.test.js.
//
// Les six rythmes (« grooves », imposés par le style de grille ou choisis dans le menu Orchestre) :
//  - af-afrobeat  (Nigeria, Fela Kuti / Tony Allen) : batterie très syncopée sur un charleston en doubles croches, shekere, bâtons
//                 (clave), congas ; basse en ostinato troué ; une guitare « gratte » des accords étouffés sur les doubles croches,
//                 l'autre répète un petit riff pentatonique ; orgue ; riffs de cuivres à l'unisson et à l'octave ;
//  - af-highlife  (Ghana, E.T. Mensah, les « guitar bands ») : cloche en tresillo (3 + 3 + 2), caisse claire en cross-stick,
//                 congas ; basse chantante ; guitare en picking à deux doigts (pouce et index), guitare rythmique en contretemps ;
//                 cuivres harmonisés en tierces ; léger balancement (swing 56 % par défaut) ;
//  - af-rumba     (rumba congolaise, Franco et l'OK Jazz, Tabu Ley) : maracas, congas, cross-stick ; basse héritée du son cubain ;
//                 guitare « mi-solo » en tierces et sixtes, guitare d'accompagnement en accords brisés ; nappes de saxophones ;
//  - af-soukous   (soukous / sebene, années 80) : batterie « cavacha » (caisse claire en doubles croches continues, grosse caisse
//                 sur chaque temps), basse rebondissante, guitare solo en arpèges rapides et aigus (groupes de trois doubles
//                 croches contre la mesure), guitare médium en croches, guitare rythmique en contretemps ;
//  - af-benga     (Kenya, D.O. Misiani et Shirati Jazz) : autour de 132 à la noire, doubles croches légèrement balancées
//                 (swing 55 % par défaut) ; basse mélodique en noires qui pompent sur chaque temps ; guitare solo en doubles
//                 croches continues et liées, qui coulent par degrés dans la gamme et s'appuient sur le temps et sur le « a » ;
//                 seconde guitare en arpèges de croches ; charleston sur le « et » et le « a », grosse caisse douce sur chaque temps ;
//  - af-mbaqanga  (Afrique du Sud, Makgona Tsohle Band) : basse très bondissante (octaves, doubles croches), batterie à quatre
//                 temps, guitare en riff aigu de croches, guitare rythmique, orgue en contretemps.
//
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords
//   env.groove      rythme (af-…) ; à défaut : highlife
//   env.state       mémoire entre deux mesures, modifiée en place : { africaVoice, africaLead }
// buildAfricaPlan renvoie { piano, bass, drums, africa: true, tone } : les frappes « piano » portent e.inst = 'gtr' (guitare
// électrique), 'organ' (orgue, e.reg = registration) ou 'horn' (section de cuivres, e.parts = [{ iv, slot }], comme le Brass band).
// Hauteurs écrites comme partout : intervalle 0 = do3 réel en Ut (réel = 48 + intervalle + transOffset).

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { popScaleNotes, popBassApproach, latBassTones } = require('./band-helpers.js');
}

const AFRICA_GROOVES = ['af-afrobeat', 'af-highlife', 'af-rumba', 'af-soukous', 'af-benga', 'af-mbaqanga'];
const AFRICA_DEFAULT_GROOVE = 'af-highlife';
// Noms affichés (bouton « Orchestre … »)
const AFRICA_NAMES = { 'af-afrobeat': 'Afrobeat', 'af-highlife': 'Highlife', 'af-rumba': 'Rumba congolaise', 'af-soukous': 'Soukous', 'af-benga': 'Benga', 'af-mbaqanga': 'Mbaqanga' };
function africaGroove(g) { return AFRICA_GROOVES.includes(g) ? g : AFRICA_DEFAULT_GROOVE; }
// Les cuivres ne jouent que dans l'afrobeat, le highlife et la rumba (saxophones de l'OK Jazz).
function africaUsesHorns(g) { const k = africaGroove(g); return k === 'af-afrobeat' || k === 'af-highlife' || k === 'af-rumba'; }
// L'orgue ne joue que dans l'afrobeat et le mbaqanga.
function africaUsesOrgan(g) { const k = africaGroove(g); return k === 'af-afrobeat' || k === 'af-mbaqanga'; }

const afMod = (x) => ((x % 12) + 12) % 12;

// Notes de l'accord (classes de hauteur 0-11) : fondamentale, tierce, quinte, septième (null pour une triade), mineur ou non.
function afChordPcs(env, cs) {
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    const third = t[1] !== undefined ? t[1] - r0 : 4;
    const fifth = t[2] !== undefined ? t[2] - r0 : 7;
    const s = t[3] !== undefined ? afMod(t[3] - r0) : null;
    const seventh = (s === 9 || s === 10 || s === 11) ? s : null;
    const pc = (x) => afMod(cs.rootIndex + r0 + x);
    return {
        root: pc(0), third: pc(third), fifth: pc(fifth), seventh: seventh === null ? null : pc(seventh),
        minor: afMod(third) === 3, dom: seventh === 10 && afMod(third) === 4,
        triad: [pc(0), pc(third), pc(fifth)]
    };
}

// Pentatonique de l'accord : mineure sur un accord mineur, « dominante » (1 2 3 5 b7) sur un accord de septième, majeure sinon.
function afPentaPcs(env, cs) {
    const c = afChordPcs(env, cs);
    const rel = c.minor ? [0, 3, 5, 7, 10] : (c.dom ? [0, 2, 4, 7, 10] : [0, 2, 4, 7, 9]);
    return rel.map(x => afMod(c.root + x));
}

// Toutes les notes (hauteurs écrites) de [lo, hi] dont la classe appartient à pcs, de la plus grave à la plus aiguë.
function afLadder(pcs, lo, hi) {
    const out = [];
    for (let n = Math.ceil(lo); n <= Math.floor(hi); n++) if (pcs.includes(afMod(n))) out.push(n);
    return out;
}

// Voicing de guitare (trois cordes aiguës) : triade, ou fondamentale-tierce-septième quand use7 et que l'accord a une septième ;
// renversement le plus proche du précédent, dans le registre réel [loReal, hiReal].
function afVoicing(env, cs, prev, loReal, hiReal, use7) {
    const off = env.transOffset;
    const c = afChordPcs(env, cs);
    const pcs = (use7 && c.seventh !== null) ? [c.root, c.third, c.seventh] : c.triad.slice();
    const LO = loReal - 48 - off, HI = hiReal - 48 - off, centre = (LO + HI) / 2;
    let best = null, bestCost = Infinity;
    for (let r = 0; r < 3; r++) {
        const order = pcs.slice(r).concat(pcs.slice(0, r));
        for (let oct = 0; oct <= 24; oct += 12) {
            let cur = LO + afMod(order[0] - LO) + oct;
            const v = [cur];
            for (let k = 1; k < 3; k++) { cur += afMod(order[k] - cur) || 12; v.push(cur); }
            if (v[2] > HI) continue;
            let cost = 0.3 * Math.abs((v[0] + v[1] + v[2]) / 3 - centre);
            if (prev && prev.length === 3) for (let j = 0; j < 3; j++) cost += Math.abs(v[j] - prev[j]);
            if (cost < bestCost - 1e-9) { bestCost = cost; best = v; }
        }
    }
    if (best) return best;
    const b = LO + afMod(pcs[0] - LO);
    return [b, b + afMod(pcs[1] - b), b + afMod(pcs[1] - b) + (afMod(pcs[2] - pcs[1]) || 12)];
}

// ===================== Motifs =====================
// Toutes les positions sont en temps (noire = 1), écrites pour une mesure de 4 temps ; elles se tronquent en 2/4 et 3/4.
// Basse : [temps, degré, durée, vélocité]. R fondamentale, F quinte, f quinte grave, T tierce, H tierce aiguë, O octave,
// 7 septième (sixte sur une triade majeure), 2 seconde, A note d'approche de l'accord suivant (quinte s'il ne change pas).
// Guitare solo : [temps, rang, durée?] — rang dans l'échelle des notes de l'accord, compté depuis la note de départ ; un tableau
// de deux rangs joue une double corde (tierces, sixtes).

const AFRICA_STYLE = {
    // ---------------- Afrobeat ----------------
    'af-afrobeat': {
        bass: [
            [[0, 'R', 0.75, 0.92], [1.5, 'R', 0.25, 0.6], [1.75, '7', 0.25, 0.72], [2.5, 'F', 0.5, 0.76], [3.25, 'T', 0.25, 0.6], [3.5, 'R', 0.5, 0.78]],
            [[0, 'R', 0.5, 0.9], [0.75, 'R', 0.25, 0.55], [1.5, 'O', 0.25, 0.72], [2, '7', 0.5, 0.72], [2.75, 'F', 0.25, 0.62], [3, 'T', 0.5, 0.7], [3.75, '2', 0.25, 0.5]],
            [[0, 'R', 1.25, 0.92], [1.75, 'F', 0.25, 0.66], [2, '7', 0.5, 0.7], [2.5, 'O', 0.25, 0.62], [3, 'F', 0.5, 0.7], [3.5, 'R', 0.25, 0.6]],
            [[0, 'R', 1.5, 0.9], [2.5, 'F', 0.5, 0.72], [3, '7', 0.5, 0.68], [3.5, 'R', 0.5, 0.7]]
        ],
        // guitare « ténor » : accords étouffés sur les doubles croches (le « gratté » de l'afrobeat)
        chop: [
            [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75],
            [0.5, 0.75, 1.5, 2.5, 2.75, 3.5],
            [0, 0.75, 1.5, 2, 2.75, 3.5],
            [0.25, 0.5, 1.25, 1.75, 2.25, 2.5, 3.25, 3.75]
        ],
        // rythmes du riff de la seconde guitare (et des cuivres)
        riff: [
            [[0, 0.5], [0.5, 0.25], [0.75, 0.5], [1.5, 0.5], [2, 0.25], [2.5, 0.5], [3.25, 0.5]],
            [[0, 0.25], [0.25, 0.25], [0.75, 0.5], [1.5, 0.25], [2, 0.5], [2.75, 0.25], [3, 0.5]],
            [[0.5, 0.25], [0.75, 0.25], [1, 0.5], [2, 0.25], [2.25, 0.25], [2.5, 0.5], [3.5, 0.25]]
        ],
        horn: [
            [[0, 0.5], [0.75, 0.25], [1, 0.75], [2.5, 0.25], [2.75, 0.75]],
            [[0, 0.25], [0.5, 0.25], [0.75, 1], [2, 0.5], [2.5, 0.25], [3, 0.5]],
            [[0.5, 0.5], [1, 0.25], [1.5, 1], [3, 0.25], [3.5, 0.5]]
        ]
    },
    // ---------------- Highlife ----------------
    'af-highlife': {
        bass: [
            [[0, 'R', 1, 0.9], [1, 'T', 0.5, 0.7], [1.5, 'F', 0.5, 0.72], [2, 'O', 1, 0.8], [3, 'F', 0.5, 0.7], [3.5, 'A', 0.5, 0.7]],
            [[0, 'R', 0.75, 0.9], [0.75, 'R', 0.25, 0.5], [1, 'F', 1, 0.72], [2, 'R', 0.5, 0.82], [2.5, 'T', 0.5, 0.66], [3, 'F', 0.5, 0.72], [3.5, 'A', 0.5, 0.66]],
            [[0, 'R', 1.5, 0.9], [1.5, 'F', 0.5, 0.7], [2, 'O', 0.5, 0.75], [2.5, 'F', 0.5, 0.65], [3, 'T', 0.5, 0.66], [3.5, '2', 0.5, 0.6]]
        ],
        // picking à deux doigts : le pouce sur les rangs graves, l'index sur les aigus ; tierces en doubles cordes
        lead: [
            [[0, 0], [0.5, 2], [1, 1], [1.5, 3], [2, 0], [2.5, 2], [3, 1], [3.5, 4]],
            [[0, 0], [0.5, 3], [1, 2], [1.5, 1], [2, 0], [2.5, 3], [3, 2], [3.25, 3], [3.5, 4]],
            [[0, [0, 2]], [0.75, 1], [1.5, [1, 3]], [2, 0], [2.75, 2], [3.5, [2, 4]]],
            [[0, 2], [0.5, 1], [1, [0, 2]], [1.75, 3], [2.5, [1, 3]], [3, 2], [3.5, 1]]
        ],
        chop: [[0.5, 1.5, 2.5, 3.5], [0.5, 1.5, 1.75, 2.5, 3.5], [0.5, 1, 1.5, 2.5, 3, 3.5]],
        horn: [
            [[0, 0.5], [0.5, 0.5], [1, 1], [2.5, 0.5], [3, 1]],
            [[0.5, 0.5], [1, 0.5], [1.5, 1.5], [3.5, 0.5]],
            [[0, 0.75], [0.75, 0.25], [1, 0.5], [1.5, 0.5], [2, 1.5]]
        ]
    },
    // ---------------- Rumba congolaise ----------------
    'af-rumba': {
        bass: [
            [[0, 'R', 0.75, 0.9], [0.75, 'F', 0.75, 0.72], [1.5, 'R', 0.5, 0.7], [2, 'O', 0.5, 0.75], [2.5, 'F', 0.5, 0.68], [3, 'T', 0.5, 0.66], [3.5, 'A', 0.5, 0.68]],
            [[0, 'R', 1, 0.9], [1.5, 'F', 0.5, 0.72], [2, 'R', 0.75, 0.8], [2.75, 'O', 0.25, 0.55], [3, 'F', 0.5, 0.7], [3.5, 'T', 0.5, 0.62]],
            [[0, 'R', 0.5, 0.9], [0.5, 'T', 0.5, 0.62], [1, 'F', 0.5, 0.7], [1.5, 'O', 0.5, 0.72], [2, 'F', 0.5, 0.68], [2.5, 'T', 0.5, 0.6], [3, 'R', 0.5, 0.7], [3.5, 'A', 0.5, 0.66]]
        ],
        // mi-solo : lignes en tierces et sixtes, croches avec quelques doubles croches
        lead: [
            [[0, [0, 2]], [0.5, 1], [1, [1, 3]], [1.5, 2], [2, [2, 4]], [2.5, 3], [3, [1, 3]], [3.5, 2]],
            [[0, [2, 4]], [0.5, 3], [0.75, 2], [1, [1, 3]], [1.5, 1], [2, [0, 2]], [2.5, 1], [3, [1, 3]], [3.5, [2, 4]]],
            [[0, [1, 3]], [0.75, [0, 2]], [1.5, [1, 3]], [2, 2], [2.25, 3], [2.5, [2, 4]], [3.5, [1, 3]]]
        ],
        // accords brisés de la guitare d'accompagnement : rang dans le voicing (0 grave, 2 aigu)
        broken: [
            [[0, 0], [0.5, 1], [1, 2], [1.5, 1], [2, 0], [2.5, 1], [3, 2], [3.5, 1]],
            [[0, 0], [0.5, 2], [1, 1], [1.5, 2], [2, 0], [2.5, 2], [3, 1], [3.5, 2]]
        ],
        horn: [
            [[0, 1.5], [1.5, 0.5], [2, 2]],
            [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1.5]],
            [[2, 0.5], [2.5, 0.5], [3, 1]]
        ]
    },
    // ---------------- Soukous ----------------
    'af-soukous': {
        bass: [
            [[0, 'R', 0.5, 0.9], [0.75, 'R', 0.25, 0.6], [1, 'O', 0.5, 0.72], [1.5, 'F', 0.5, 0.7], [2, 'R', 0.5, 0.85], [2.75, 'T', 0.25, 0.6], [3, 'F', 0.5, 0.72], [3.5, 'A', 0.5, 0.68]],
            [[0, 'R', 0.75, 0.9], [0.75, 'F', 0.25, 0.6], [1, 'O', 0.25, 0.7], [1.5, 'O', 0.5, 0.6], [2, 'R', 0.5, 0.82], [2.5, 'F', 0.5, 0.7], [3, 'T', 0.5, 0.68], [3.5, 'F', 0.25, 0.6], [3.75, 'A', 0.25, 0.6]],
            [[0, 'R', 0.5, 0.92], [0.5, 'O', 0.25, 0.58], [1, 'F', 0.5, 0.72], [1.75, 'R', 0.25, 0.6], [2, 'O', 0.5, 0.8], [2.5, 'T', 0.5, 0.64], [3, 'F', 0.5, 0.72], [3.5, 'A', 0.5, 0.66]]
        ],
        // sebene : doubles croches continues ; cycles de 3, 4 ou 6 rangs, joués en boucle
        cycle: [[0, 1, 2], [2, 1, 0, 1], [0, 2, 1, 3, 2, 1], [1, 0, 2, 1, 3, 2], [0, 1, 2, 3, 2, 1]],
        lead: [
            [[0, [0, 2]], [0.5, 1], [1, [1, 3]], [1.5, 2], [2, [0, 2]], [2.5, 1], [3, [1, 3]], [3.5, [2, 4]]],
            [[0, 1], [0.5, [0, 2]], [1, 1], [1.5, [1, 3]], [2, 2], [2.5, [1, 3]], [3, 1], [3.5, [0, 2]]]
        ],
        chop: [[0.5, 1.5, 2.5, 3.5], [0.5, 0.75, 1.5, 2.5, 2.75, 3.5]]
    },
    // ---------------- Benga ----------------
    'af-benga': {
        // basse : des noires qui pompent sur chaque temps (fondamentale, quinte, octave, tierce), parfois une double croche
        // d'appel sur le « a » ; la dernière annonce l'accord suivant
        bass: [
            [[0, 'R', 0.85, 0.9], [1, 'F', 0.85, 0.74], [2, 'O', 0.85, 0.8], [3, 'F', 0.6, 0.72], [3.75, 'A', 0.25, 0.6]],
            [[0, 'R', 0.85, 0.9], [1, 'T', 0.85, 0.72], [2, 'F', 0.85, 0.78], [2.75, 'F', 0.25, 0.5], [3, 'O', 0.6, 0.72], [3.75, 'A', 0.25, 0.6]],
            [[0, 'R', 0.6, 0.9], [0.75, 'R', 0.25, 0.52], [1, 'F', 0.85, 0.74], [2, 'O', 0.85, 0.8], [3, 'T', 0.85, 0.72]],
            [[0, 'R', 0.85, 0.9], [1, 'O', 0.85, 0.74], [2, 'F', 0.6, 0.78], [2.75, 'R', 0.25, 0.52], [3, 'T', 0.6, 0.7], [3.75, 'A', 0.25, 0.6]]
        ],
        // rythme de la guitare solo, temps par temps : positions dans le temps et poids selon l'énergie (lo, hi)
        // (allégé : les doubles croches continues ne sont plus qu'une couleur ; croche + « a » domine, avec des respirations)
        cells: [
            { c: [0, 0.5, 0.75], lo: 2.6, hi: 2.6 },          // croche, double, double : l'appui sur le « a »
            { c: [0, 0.75], lo: 2.0, hi: 1.8 },               // noire pointée de double, puis le « a »
            { c: [0, 0.5], lo: 1.8, hi: 1.3 },
            { c: [0], lo: 1.2, hi: 0.7 },                     // une note qui sonne tout le temps
            { c: [0.5, 0.75], lo: 1.0, hi: 0.9 },             // part après le temps (la note précédente sonne)
            { c: [0, 0.25, 0.5, 0.75], lo: 0.3, hi: 1.1 },    // doubles croches continues : seulement quand l'énergie monte
            { c: [], lo: 0.5, hi: 0.25 }                      // respiration
        ],
        // seconde guitare : arpèges de croches dans le médium (rang dans le voicing : 0 grave, 2 aigu)
        broken: [
            [[0, 0], [0.5, 1], [1, 2], [1.5, 1], [2, 0], [2.5, 1], [3, 2], [3.5, 1]],
            [[0, 0], [0.5, 2], [1, 1], [1.5, 2], [2, 0], [2.5, 2], [3, 1], [3.5, 2]],
            [[0, 0], [0.75, 1], [1.5, 2], [2, 0], [2.75, 1], [3.5, 2]],
            [[0, 0], [1, 2], [1.5, 1], [2, 0], [3, 2], [3.5, 1]],
            [[0, 0], [1, 1], [2, 0], [3, 2]]
        ]
    },
    // ---------------- Mbaqanga ----------------
    'af-mbaqanga': {
        bass: [
            [[0, 'R', 0.4, 0.92], [0.5, 'O', 0.25, 0.62], [0.75, 'R', 0.25, 0.55], [1, 'F', 0.4, 0.75], [1.5, 'O', 0.4, 0.66], [2, 'T', 0.4, 0.78], [2.5, 'F', 0.25, 0.6], [2.75, 'O', 0.25, 0.55], [3, 'F', 0.4, 0.72], [3.5, 'A', 0.4, 0.66]],
            [[0, 'R', 0.4, 0.9], [0.5, 'R', 0.25, 0.5], [0.75, 'F', 0.25, 0.6], [1, 'O', 0.4, 0.74], [1.5, 'F', 0.4, 0.66], [2, 'R', 0.4, 0.84], [2.5, 'T', 0.25, 0.6], [3, 'F', 0.4, 0.72], [3.25, 'O', 0.25, 0.55], [3.5, 'F', 0.4, 0.62]],
            [[0, 'R', 0.5, 0.9], [0.75, 'O', 0.25, 0.6], [1, 'F', 0.5, 0.74], [1.5, 'T', 0.25, 0.6], [1.75, 'F', 0.25, 0.56], [2, 'O', 0.5, 0.8], [2.75, 'F', 0.25, 0.6], [3, 'T', 0.5, 0.7], [3.5, 'A', 0.5, 0.64]]
        ],
        lead: [
            [[0, 0], [0.5, 1], [1, 2], [1.5, 1], [2, 0], [2.5, 1], [3, 2], [3.25, 3], [3.5, 2]],
            [[0, 2], [0.5, 1], [0.75, 2], [1, 3], [1.5, 2], [2, 1], [2.5, 0], [3, 1], [3.5, 2]],
            [[0, [0, 2]], [0.5, 1], [1, 2], [1.5, [1, 3]], [2, 2], [2.5, 1], [3, [0, 2]], [3.5, 1]]
        ],
        chop: [[0.5, 1.5, 2.5, 3.5], [0.5, 1, 1.5, 2.5, 3, 3.5]]
    }
};

// Choix faits une fois par phrase (4 mesures en général) : énergie, motifs, couches qui jouent.
function africaPhraseExtras(rng, prev, index, groove) {
    const g = africaGroove(groove);
    const S = AFRICA_STYLE[g];
    const pl = (prev && prev.style === 'africa') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.42 + rng() * 0.15 : prevI + (0.66 - prevI) * 0.25 + (rng() - 0.5) * 0.42;
    I = Math.max(0.28, Math.min(0.98, I));
    const n = (list) => list ? Math.floor(rng() * list.length) : 0;
    const keepBass = !!(pl && rng() < 0.45);                   // la basse garde souvent son ostinato d'une phrase à l'autre
    return {
        intensity: I,
        bassIdx: keepBass && typeof pl.bassIdx === 'number' ? pl.bassIdx : n(S.bass),
        bassAlt: n(S.bass),
        chopIdx: n(S.chop),
        leadIdx: n(S.lead),
        leadAlt: n(S.lead),
        brokenIdx: n(S.broken),
        cycleIdx: n(S.cycle),
        riffIdx: n(S.riff),
        hornIdx: n(S.horn),
        drumVar: Math.floor(rng() * 3),
        // le riff (guitare de l'afrobeat, cuivres) : suite de pas dans la pentatonique, rejouée à l'identique à chaque mesure
        riffSteps: Array.from({ length: 8 }, () => africaPickStep(rng)),
        horns: rng() < (index === 0 ? 0.35 : 0.3 + 0.55 * I),   // la section de cuivres entre surtout quand l'énergie monte
        hornPad: rng() < 0.45,
        organ: rng() < 0.4 + 0.45 * I,
        lead2: rng() < 0.35 + 0.5 * I,                          // seconde guitare (sebene, benga) selon l'énergie
        fill: rng() < 0.7,
        ghost16: rng() < 0.3 + 0.5 * I,
        melSeed: rng(),                                         // ligne de la guitare solo du benga
        melDir: rng() < 0.5 ? 1 : -1
    };
}

// Pas du riff : surtout des degrés voisins, parfois un saut de tierce.
function africaPickStep(rng) {
    const opts = [[0, 2], [1, 3], [-1, 3], [2, 1.5], [-2, 1.5], [3, 0.4], [-3, 0.4]];
    const tot = opts.reduce((a, o) => a + o[1], 0);
    let r = rng() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return 0;
}

function buildAfricaPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const g = africaGroove(env.groove);
    const S = AFRICA_STYLE[g];
    const rng = ph.rng || Math.random;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const eps = 1e-6;
    const off = env.transOffset || 0;
    const par = i % 2;                                            // 0 = mesure « question », 1 = « réponse »
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const csAt = (pos) => segs[segAt(pos)].cs;
    const prog = L > 1 ? i / (L - 1) : 0;
    const dyn = (0.8 + 0.24 * I) * (0.94 + 0.06 * prog);
    const clampV = (v) => Math.max(0.06, Math.min(1, v));
    const piano = [], bass = [], drums = [];
    const frac = (pos) => pos - Math.floor(pos + eps);
    // En mesure composée, seules les croches restent (le « et » devient la dernière croche du temps) ; en 2/4 et 3/4 la mesure
    // de 4 temps est tronquée.
    const keep = (pos) => pos < bpb - eps && (!ternary || Math.abs(frac(pos)) < eps || Math.abs(frac(pos) - 0.5) < eps);
    const P = (pos) => ternary && Math.abs(frac(pos) - 0.5) < eps ? Math.floor(pos + eps) + 2 / 3 : pos;
    const pick = (list, k) => list[((k % list.length) + list.length) % list.length];
    const turnFill = isTurn && L > 1 && ph.fill;
    const fillFrom = bpb - 1;

    // ---- guitare rythmique : voicing aigu, conduite des voix d'une mesure à l'autre ----
    const VREG = { 'af-afrobeat': [58, 74], 'af-highlife': [57, 72], 'af-rumba': [55, 71], 'af-soukous': [60, 76], 'af-benga': [55, 71], 'af-mbaqanga': [60, 76] }[g];
    const use7 = g === 'af-afrobeat';
    let lastV = env.state.africaVoice || null;
    const vCache = {};
    const voiceFor = (cs) => {
        const key = cs.rootIndex + ':' + cs.chordId;
        if (!vCache[key]) { vCache[key] = afVoicing(env, cs, lastV, VREG[0], VREG[1], use7); lastV = vCache[key]; }
        return vCache[key];
    };
    const Vs = segs.map(sg => voiceFor(sg.cs));
    env.state.africaVoice = lastV;
    const gtr = (pos, intervals, dur, vel, art, extra) => {
        if (!keep(pos)) return;
        piano.push(Object.assign({ pos: P(pos), dur, vel: clampV(vel * dyn), rootIndex: 0, intervals, inst: 'gtr', art }, extra || {}));
    };
    const chop = (positions, vel, art, dur, top2) => positions.forEach((pos) => {
        if (turnFill && pos >= fillFrom - eps && g !== 'af-soukous' && rng() < 0.5) return;
        const v = Vs[segAt(pos)];
        gtr(pos, top2 ? v.slice(1) : v, dur, vel * (Number.isInteger(pos) ? 1 : 0.92), art, { roll: 0.004, dir: (pos * 4) % 2 ? -1 : 1 });
    });

    // ---- guitare solo : échelle des notes de l'accord, départ près de la note de la mesure précédente ----
    const LREG = { 'af-afrobeat': [62, 76], 'af-highlife': [59, 81], 'af-rumba': [64, 86], 'af-soukous': [69, 91], 'af-benga': [64, 86], 'af-mbaqanga': [64, 84] }[g];
    const leadLo = LREG[0] - 48 - off, leadHi = LREG[1] - 48 - off;
    const leadCentre = Math.round((leadLo + leadHi) / 2) - 3;
    let anchor = env.state.africaLead;
    if (!Number.isFinite(anchor) || anchor < leadLo || anchor > leadHi - 5) anchor = leadCentre;
    const ladderOf = (cs) => afLadder(afChordPcs(env, cs).triad, leadLo, leadHi);
    const ladders = segs.map(sg => ladderOf(sg.cs));
    const baseIdx = ladders.map(Lr => {
        let b = 0;
        Lr.forEach((x, k) => { if (Math.abs(x - anchor) < Math.abs(Lr[b] - anchor)) b = k; });
        return Math.min(b, Math.max(0, Lr.length - 5));      // garder de la place au-dessus pour le motif
    });
    const leadNote = (pos, rank) => {
        const sg = segAt(pos), Lr = ladders[sg];
        if (!Lr.length) return null;
        const k = Math.max(0, Math.min(Lr.length - 1, baseIdx[sg] + rank));
        return Lr[k];
    };
    const playLead = (pattern, opts) => {
        pattern.forEach((h, k) => {
            const [pos, rk, d] = h;
            if (!keep(pos)) return;
            if (opts.skipFill && turnFill && pos >= fillFrom - eps) return;
            const ranks = Array.isArray(rk) ? rk : [rk];
            const notes = Array.from(new Set(ranks.map(r => leadNote(pos, r + (opts.shift || 0))).filter(x => x !== null))).sort((a, b) => a - b);
            if (!notes.length) return;
            const nextPos = k + 1 < pattern.length ? pattern[k + 1][0] : bpb;
            const dur = d || Math.max(0.12, Math.min(opts.maxDur || 1, (nextPos - pos) * (opts.legato || 0.9)));
            const accent = Number.isInteger(pos) ? 1 : (Math.abs(frac(pos) - 0.5) < eps ? 0.9 : 0.8);
            gtr(pos, notes, dur, opts.vel * accent * (0.94 + 0.12 * rng()), opts.art, { roll: notes.length > 1 ? 0.008 : 0 });
        });
    };
    // la mesure suivante repart près de la note de départ de celle-ci (registre stable, voix conduites)
    if (ladders[0].length) env.state.africaLead = ladders[0][baseIdx[0]];

    // ---- riff pentatonique (guitare de l'afrobeat, cuivres) : mêmes pas à chaque mesure de la phrase ----
    const riffNotes = (rhythm, lo, hi, startNear) => {
        const out = [];
        let prevX = null;
        rhythm.forEach(([pos, d], k) => {
            if (!keep(pos)) return;
            const cs = csAt(pos);
            const Sc = afLadder(afPentaPcs(env, cs), lo, hi);
            if (Sc.length < 3) return;
            const near = (x) => Sc.reduce((b, n, j) => Math.abs(n - x) < Math.abs(Sc[b] - x) ? j : b, 0);
            let idx = prevX === null ? near(startNear) : near(prevX) + (ph.riffSteps ? ph.riffSteps[k % ph.riffSteps.length] : 0);
            if (idx < 0) idx = -idx;                                   // rebond aux bords de l'échelle
            if (idx > Sc.length - 1) idx = 2 * (Sc.length - 1) - idx;
            idx = Math.max(0, Math.min(Sc.length - 1, idx));
            // la dernière note du riff se pose sur une note de l'accord
            if (k === rhythm.length - 1) {
                const ct = afChordPcs(env, cs).triad;
                for (const dd of [0, -1, 1, -2, 2]) { const j = idx + dd; if (Sc[j] !== undefined && ct.includes(afMod(Sc[j]))) { idx = j; break; } }
            }
            prevX = Sc[idx];
            out.push({ pos, dur: d, note: Sc[idx] });
        });
        return out;
    };

    // ---- cuivres : section (trompette, « saxophone » ténor = cor, trombone) ----
    const horn = (pos, parts, dur, vel, art) => {
        if (!keep(pos)) return;
        piano.push({ pos: P(pos), dur, vel: clampV(vel * dyn), rootIndex: 0, inst: 'horn', parts, intervals: parts.map(p => p.iv), art });
    };
    const hornLo = 55 - 48 - off, hornHi = 67 - 48 - off;      // ligne écrite (sol3 à sol4) : la trompette sonne une octave plus haut
    // la section joue les phrases paires (une phrase de quatre mesures sur deux) ou toute phrase quand l'énergie est haute
    const hornsOn = !!ph.horns && africaUsesHorns(g);

    // ---- orgue ----
    const organ = (pos, intervals, dur, vel, art, reg, att) => {
        if (!keep(pos)) return;
        piano.push({ pos: P(pos), dur, vel: clampV(vel * dyn), rootIndex: 0, intervals, inst: 'organ', art, reg, att });
    };
    const organV = (sg) => { const v = Vs[sg]; return v.map(x => x - 12); };   // une octave sous la guitare

    // ---- basse ----
    const tonesFor = segs.map(sg => latBassTones(env, sg.cs));
    const bassTok = (tok, sgIdx, pos) => {
        const T = tonesFor[sgIdx];
        const cs = segs[sgIdx].cs;
        const c = afChordPcs(env, cs);
        const fitHi = (x) => { let a = x; while (a + off > 16) a -= 12; while (a + off < -8) a += 12; return a; };
        switch (tok) {
            case 'F': return T.fifth;
            case 'f': return (T.root + off - 5 >= -12) ? T.root - 5 : T.fifth;
            case 'T': return T.third;
            case 'H': return fitHi(T.third < T.root ? T.third + 12 : T.third);
            case 'O': return fitHi(T.root + 12);                      // vraie octave (la basse bondit), même quand la fondamentale est haute
            case '7': {
                // septième (sixte sur une triade majeure), prise sous la fondamentale quand elle y est plus proche (ré - do - ré)
                const iv = (c.seventh !== null || c.minor) ? afMod((c.seventh !== null ? c.seventh : c.root + 10) - c.root) : 9;
                const below = T.root + iv - 12;
                return (below + off >= -8) ? below : fitHi(T.root + iv);
            }
            case '2': return fitHi(T.root + 2);
            case 'A':
                if (changeNext && sgIdx === segs.length - 1 && pos >= bpb - 1 - eps) return popBassApproach(env, T.root, nextStep, rng);
                return T.fifth;
            default: return T.root;
        }
    };
    {
        const cell = pick(S.bass, (par === 1 && rng() < 0.35) ? ph.bassAlt : ph.bassIdx);
        const hits = cell.filter(h => keep(h[0]));
        // en mesure scindée, la seconde moitié reprend sur sa fondamentale
        segs.forEach((sg, k) => {
            if (k > 0 && !hits.some(h => Math.abs(h[0] - sg.s) < eps)) hits.push([sg.s, 'R', 0.75, 0.84]);
        });
        hits.sort((a, b) => a[0] - b[0]);
        hits.forEach(([pos, tok, d, v]) => {
            const sgI = segAt(pos);
            // première note de la seconde moitié : toujours la fondamentale
            const tk = (sgI > 0 && Math.abs(pos - segs[sgI].s) < eps) ? 'R' : tok;
            bass.push({ pos: P(pos), abs: bassTok(tk, sgI, pos), dur: d * (ternary ? 0.9 : 1), vel: clampV(v * (0.86 + 0.18 * I) * (0.94 + 0.06 * prog)), wide: true });
        });
        bass.sort((a, b) => a.pos - b.pos);
        bass.forEach((b, k) => {
            const nx = bass[k + 1];
            const limit = nx ? nx.pos - b.pos + 0.02 : bpb - b.pos - 0.03;
            b.dur = Math.max(0.1, Math.min(b.dur, limit));
        });
    }

    // ---- percussions ----
    const dr = (pos, drum, vel) => {
        if (!keep(pos)) return;
        // percussions un peu en retrait : dans ces musiques ce sont les guitares qui mènent
        drums.push({ pos: P(pos), drum, vel: Math.max(0.04, Math.min(1, vel * (0.86 + 0.2 * I) * 0.78)) });
    };
    const each = (step0, fn) => { for (let p = 0; p < bpb - eps; p += step0) fn(p); };
    const notInFill = (pos) => !(turnFill && pos >= fillFrom - eps);

    if (g === 'af-afrobeat') {
        // Batterie à la Tony Allen : charleston en croches (doubles croches fantômes quand ça chauffe), charleston ouvert sur le
        // « et » du 4, grosse caisse syncopée, caisse claire accentuée sur 2 et 4 entourée de notes fantômes.
        each(0.5, p => { if (notInFill(p) && !(Math.abs(p - 3.5) < eps)) dr(p, 'hat', Number.isInteger(p) ? 0.42 : 0.32); });
        if (ph.ghost16) each(0.25, p => { if (Math.abs(frac(p) - 0.25) < eps || Math.abs(frac(p) - 0.75) < eps) { if (notInFill(p)) dr(p, 'hat', 0.16); } });
        if (notInFill(3.5)) dr(3.5, 'ohat', 0.34);
        const kicks = [[[0, 0.95], [1.5, 0.6], [2.75, 0.58]], [[0, 0.95], [0.75, 0.5], [2, 0.7], [3.25, 0.52]], [[0, 0.95], [1.5, 0.62], [2.5, 0.55], [3.75, 0.45]]][ph.drumVar % 3];
        kicks.forEach(([p, v]) => { if (notInFill(p)) dr(p, 'kick', v); });
        const snares = [[[1, 0.66], [3, 0.7]], [[1, 0.64], [2.75, 0.5], [3, 0.68]], [[1, 0.64], [3, 0.68], [3.75, 0.4]]][ph.drumVar % 3];
        snares.forEach(([p, v]) => { if (notInFill(p)) dr(p, 'snare', v); });
        [[0.75, 0.16], [1.75, 0.18], [2.25, 0.14], [3.25, 0.16]].forEach(([p, v]) => { if (notInFill(p) && I > 0.4) dr(p, 'ghost', v); });
        // shekere en doubles croches (accent sur les contretemps), bâtons en clave d'une mesure, congas
        each(0.25, p => dr(p, 'shaker', Math.abs(frac(p) - 0.5) < eps ? 0.3 : (Number.isInteger(p) ? 0.22 : 0.15)));
        [0, 0.75, 1.5, 2.5, 3].forEach(p => dr(p, 'clave', 0.36));
        if (I > 0.38) [[1, 'slap', 0.36], [1.5, 'conga1', 0.32], [3, 'slap', 0.36], [3.5, 'conga2', 0.46], [3.75, 'conga2', 0.4]].forEach(([p, d, v]) => dr(p, d, v));
        if (turnFill) [[3, 'rtom2', 0.55], [3.25, 'rtom3', 0.5], [3.5, 'rtom4', 0.6], [3.75, 'snare', 0.55]].forEach(([p, d, v]) => dr(p, d, v));
    } else if (g === 'af-highlife') {
        // Cloche en tresillo (3 + 3 + 2, deux fois), grosse caisse sur 1 et 3, cross-stick sur 2 et 4, charleston léger, congas.
        [[0, 'agogol', 0.5], [0.75, 'agogoh', 0.4], [1.5, 'agogoh', 0.42], [2, 'agogol', 0.46], [2.75, 'agogoh', 0.4], [3.5, 'agogoh', 0.42]].forEach(([p, d, v]) => dr(p, d, v));
        [[0, 0.82], [2, 0.7]].forEach(([p, v]) => dr(p, 'kick', v));
        if (ph.drumVar === 1) dr(2.5, 'kick', 0.45);
        [1, 3].forEach(p => { if (notInFill(p)) dr(p, 'rim', 0.5); });
        each(0.5, p => { if (notInFill(p)) dr(p, 'hat', Number.isInteger(p) ? 0.24 : 0.3); });
        each(0.5, p => dr(p, 'shaker', 0.16));
        [[1, 'slap', 0.34], [1.5, 'conga1', 0.3], [3, 'slap', 0.34], [3.5, 'conga2', 0.44], [3.75, 'conga2', 0.38]].forEach(([p, d, v]) => { if (notInFill(p)) dr(p, d, v); });
        if (turnFill) [[3, 'tom1', 0.45], [3.25, 'tom1', 0.4], [3.5, 'tom2', 0.5], [3.75, 'tom3', 0.55]].forEach(([p, d, v]) => dr(p, d, v));
    } else if (g === 'af-rumba') {
        // Maracas en croches, grosse caisse douce, cross-stick sur 2 et 4, congas (tumbao), cloche discrète quand l'énergie monte.
        each(0.5, p => dr(p, 'shaker', Number.isInteger(p) ? 0.2 : 0.3));
        [[0, 0.72], [2, 0.62]].forEach(([p, v]) => dr(p, 'kick', v));
        if (ph.drumVar === 2) dr(1.5, 'kick', 0.4);
        [1, 3].forEach(p => { if (notInFill(p)) dr(p, 'rim', 0.46); });
        if (ph.drumVar !== 0) dr(3.5, 'rim', 0.3);
        each(0.5, p => { if (notInFill(p)) dr(p, 'hat', 0.2); });
        [[1, 'slap', 0.36], [1.5, 'conga1', 0.3], [2.5, 'conga1', 0.26], [3, 'slap', 0.36], [3.5, 'conga2', 0.46], [3.75, 'conga2', 0.4]].forEach(([p, d, v]) => { if (notInFill(p)) dr(p, d, v); });
        if (I > 0.62) each(1, p => dr(p, 'bell', p === 0 ? 0.3 : 0.22));
        if (turnFill) [[3, 'tom1', 0.42], [3.5, 'tom2', 0.48], [3.75, 'tom3', 0.52]].forEach(([p, d, v]) => dr(p, d, v));
    } else if (g === 'af-soukous') {
        // Cavacha : caisse claire en doubles croches continues (accent sur les contretemps), grosse caisse sur chaque temps,
        // charleston ouvert sur le « et » quand l'énergie est haute. À faible énergie, le roulement passe au charleston.
        each(1, p => dr(p, 'kick', p === 0 ? 0.8 : 0.58));
        const cav = I > 0.4;
        each(0.25, p => {
            if (!notInFill(p) && cav) return;
            const off8 = Math.abs(frac(p) - 0.5) < eps;
            if (cav) dr(p, off8 ? 'snare' : 'ghost', off8 ? 0.42 : (Number.isInteger(p) ? 0.26 : 0.2));
            else dr(p, 'hat', off8 ? 0.34 : 0.2);
        });
        if (I > 0.65) each(1, p => dr(p + 0.5, 'ohat', 0.22));
        if (I > 0.5) [[1.75, 'conga1', 0.3], [3.5, 'conga2', 0.4]].forEach(([p, d, v]) => dr(p, d, v));
        if (turnFill) [[3, 'snare', 0.5], [3.25, 'snare', 0.55], [3.5, 'snare', 0.62], [3.75, 'snare', 0.7]].forEach(([p, d, v]) => dr(p, d, v));
    } else if (g === 'af-benga') {
        // Grosse caisse douce sur chaque temps (avec la basse), caisse claire légère sur 2 et 4, charleston sur le « et » et le « a »
        // (c'est lui qui fait balancer), maracas en doubles croches très douces.
        each(1, p => dr(p, 'kick', p === 0 ? 0.7 : 0.52));
        [1, 3].forEach(p => { if (notInFill(p)) dr(p, 'snare', 0.42); });
        each(1, p => {
            if (notInFill(p + 0.5)) dr(p + 0.5, 'hat', 0.4);
            if (notInFill(p + 0.75)) dr(p + 0.75, 'hat', 0.3);
            if (ph.ghost16 && notInFill(p + 0.25)) dr(p + 0.25, 'hat', 0.13);
        });
        each(0.25, p => dr(p, 'shaker', Math.abs(frac(p) - 0.75) < eps ? 0.2 : 0.11));
        if (I > 0.6 && par === 1) dr(3.75, 'ghost', 0.2);
        if (turnFill) [[3, 'rtom1', 0.5], [3.25, 'rtom2', 0.5], [3.5, 'rtom3', 0.55], [3.75, 'rtom4', 0.6]].forEach(([p, d, v]) => dr(p, d, v));
    } else {
        // Mbaqanga : grosse caisse sur chaque temps, caisse claire sur 2 et 4, charleston ouvert sur les contretemps, tambourin.
        each(1, p => dr(p, 'kick', p === 0 ? 0.8 : 0.58));
        [1, 3].forEach(p => { if (notInFill(p)) dr(p, 'snare', 0.6); });
        each(1, p => { if (notInFill(p)) dr(p, 'hat', 0.26); if (notInFill(p + 0.5)) dr(p + 0.5, I > 0.5 ? 'ohat' : 'hat', I > 0.5 ? 0.22 : 0.34); });
        if (I > 0.45) each(1, p => dr(p + 0.5, 'tmb', 0.26));
        if (turnFill) [[3, 'rtom1', 0.5], [3.25, 'rtom2', 0.52], [3.5, 'rtom3', 0.56], [3.75, 'rtom4', 0.62]].forEach(([p, d, v]) => dr(p, d, v));
    }

    // ---- guitare solo du benga : une ligne qui coule par degrés dans la gamme de l'accord ----
    // Rythme tiré temps par temps (surtout des doubles croches continues), rejoué à l'identique d'une mesure « question » à l'autre
    // pour que la ligne tourne comme un motif ; la hauteur avance par degrés conjoints (parfois une tierce), change de sens aux
    // bords du registre ou de temps en temps, et se pose sur une note de l'accord sur chaque temps. Notes liées (elles sonnent
    // jusqu'à la suivante), accents sur le temps et sur le « a ».
    function bengaLine() {
        let sd = (Math.floor((ph.melSeed || 0.37) * 1e9) + par * 7919 + (Math.floor(i / 2) % 2) * 104729) >>> 0;
        const mr = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        const cells = S.cells;
        const wOf = (c) => c.lo + (c.hi - c.lo) * I;
        const pickCell = () => {
            const tot = cells.reduce((a, c) => a + wOf(c), 0);
            let r = mr() * tot;
            for (const c of cells) { r -= wOf(c); if (r <= 0) return c.c; }
            return cells[0].c;
        };
        const onsets = [];
        for (let b = 0; b < bpb; b++) pickCell().forEach(f => onsets.push(b + f));
        if (!onsets.length) onsets.push(0);
        const kept = onsets.filter(pos => keep(pos) && !(turnFill && pos >= fillFrom + 0.5 - eps && mr() < 0.5));
        let prevX = anchor;                                       // dernière note de la mesure précédente
        let dir = ph.melDir || 1, run = 0;
        const notes = [];
        kept.forEach((pos) => {
            const cs = csAt(pos);
            const Sc = popScaleNotes(cs, leadLo, leadHi);
            if (Sc.length < 5) return;
            const ct = afChordPcs(env, cs).triad;
            let j = Sc.reduce((b, n, k) => Math.abs(n - prevX) < Math.abs(Sc[b] - prevX) ? k : b, 0);
            if (notes.length) {
                run++;
                if (run > 3 + Math.floor(mr() * 4)) { dir = -dir; run = 0; }   // une vague de 4 à 7 notes, puis l'autre sens
                j += dir * (mr() < 0.92 ? 1 : 2);
            }
            if (j <= 0) { j = 0; dir = 1; run = 0; }
            if (j >= Sc.length - 1) { j = Sc.length - 1; dir = -1; run = 0; }
            // sur le temps : une note de l'accord, la plus proche dans le sens de la marche
            if (Math.abs(frac(pos)) < eps && !ct.includes(afMod(Sc[j]))) {
                for (const d of [dir, -dir]) { if (Sc[j + d] !== undefined && ct.includes(afMod(Sc[j + d]))) { j += d; break; } }
            }
            prevX = Sc[j];
            notes.push({ pos, note: Sc[j] });
        });
        notes.forEach((n, k) => {
            const nextPos = k + 1 < notes.length ? notes[k + 1].pos : Math.min(bpb, n.pos + 0.5);
            const dur = Math.max(0.2, Math.min(1, (nextPos - n.pos) * 1.1));     // liées : chaque note recouvre un peu la suivante
            const f = frac(n.pos);
            const acc = Math.abs(f) < eps ? 0.95 : Math.abs(f - 0.75) < eps ? 1 : Math.abs(f - 0.5) < eps ? 0.8 : 0.7;
            gtr(n.pos, [n.note], dur, 0.66 * acc * (0.94 + 0.12 * rng()), 'arp', { roll: 0, part: 'solo' });
        });
        if (notes.length) env.state.africaLead = notes[notes.length - 1].note;
    }

    // ---- guitares, orgue, cuivres selon le style ----
    const leadPat = pick(S.lead || [[]], (par === 1 && rng() < 0.4) ? ph.leadAlt : ph.leadIdx);
    if (g === 'af-afrobeat') {
        chop(pick(S.chop, ph.chopIdx), 0.6, 'mute', 0.14, false);
        // seconde guitare : riff pentatonique en notes courtes, rejoué à l'identique à chaque mesure de la phrase
        riffNotes(pick(S.riff, ph.riffIdx), leadLo, leadHi, leadCentre).forEach(n => gtr(n.pos, [n.note], n.dur, 0.74, 'pluck'));
        // orgue : nappe tenue les mesures « question », petits accords sur les contretemps les mesures « réponse »
        if (ph.organ) {
            segs.forEach((sg, k) => {
                if (par === 0) organ(sg.s, organV(k), (sg.e - sg.s) - 0.1, 0.4, 'swell', 'jazz', 0.08);
                else [1.5, 3.5].filter(p => p >= sg.s - eps && p < sg.e - eps).forEach(p => organ(p, organV(k), 0.35, 0.42, 'pad', 'jazz'));
            });
        }
        // cuivres : riff à l'unisson et à l'octave (trompette en haut, « ténor » au milieu, trombone en bas), une mesure sur deux
        if (hornsOn && (par === 0 || I > 0.7)) {
            riffNotes(pick(S.horn, ph.hornIdx), hornLo, hornHi, hornLo + 7).forEach(n => {
                horn(n.pos, [{ iv: n.note, slot: 'c1' }, { iv: n.note, slot: 'h1' }, { iv: n.note - 12, slot: 't1' }], n.dur, 0.72, n.dur <= 0.3 ? 'stac' : 'marc');
            });
        }
    } else if (g === 'af-highlife') {
        chop(pick(S.chop, ph.chopIdx), 0.52, 'mute', 0.16, true);
        playLead(leadPat, { vel: 0.7, art: 'arp', legato: 1.1, maxDur: 0.9, skipFill: false });
        if (hornsOn) {
            if (ph.hornPad && i === 0) {
                // ouverture de phrase : accord tenu de la section, en tierces serrées
                segs.forEach((sg, k) => {
                    const v = afVoicing(env, sg.cs, null, 55, 67, false);
                    horn(sg.s, [{ iv: v[2] - 12, slot: 'c1' }, { iv: v[1], slot: 'h1' }, { iv: v[0] - 12, slot: 't1' }], Math.min(2, sg.e - sg.s) - 0.1, 0.5, 'pad');
                });
            } else if (par === 1) {
                // réponse de la section : ligne harmonisée en tierces (trompette en haut, « saxophone » une tierce dessous)
                riffNotes(pick(S.horn, ph.hornIdx), hornLo + 2, hornHi + 2, hornLo + 9).forEach(n => {
                    const Sc = popScaleNotes(csAt(n.pos), n.note - 5, n.note - 1);
                    const third = Sc.length ? Sc[Math.max(0, Sc.length - 2)] : n.note - 4;
                    horn(n.pos, [{ iv: n.note, slot: 'c1' }, { iv: third + 12, slot: 'h1' }], n.dur, 0.62, n.dur <= 0.3 ? 'stac' : 'marc');
                });
            }
        }
    } else if (g === 'af-rumba') {
        // guitare d'accompagnement : accords brisés en croches ; mi-solo en tierces et sixtes
        pick(S.broken, ph.brokenIdx).forEach(([pos, r]) => {
            if (!keep(pos)) return;
            const v = Vs[segAt(pos)];
            gtr(pos, [v[Math.min(2, r)]], 0.55, Number.isInteger(pos) ? 0.52 : 0.45, 'arp');
        });
        playLead(leadPat, { vel: 0.66, art: 'arp', legato: 1, maxDur: 0.8 });
        // saxophones : nappe tenue au début de la phrase, réponse mélodique à la fin
        if (hornsOn) {
            if (i === 0 && ph.hornPad) segs.forEach((sg) => {
                const v = afVoicing(env, sg.cs, null, 53, 66, false);
                horn(sg.s, [{ iv: v[2], slot: 'h1' }, { iv: v[1], slot: 'h2' }, { iv: v[0] - 12, slot: 't1' }], (sg.e - sg.s) - 0.15, 0.42, 'pad');
            });
            if (isTurn && L > 1) riffNotes(pick(S.horn, ph.hornIdx), hornLo + 2, hornHi + 2, hornLo + 9).forEach(n => {
                horn(n.pos, [{ iv: n.note, slot: 'h1' }, { iv: n.note - 12, slot: 't1' }], n.dur, 0.6, 'ten');
            });
        }
    } else if (g === 'af-soukous') {
        chop(pick(S.chop, ph.chopIdx), 0.5, 'mute', 0.14, true);
        // sebene : doubles croches continues dans l'aigu (croches quand l'énergie est basse), cycle de rangs qui chevauche la mesure
        const cyc = pick(S.cycle, ph.cycleIdx);
        const unit = I > 0.42 ? 0.25 : 0.5;
        let k = Math.round((m >= 0 ? m : 0) * (bpb / unit)) % cyc.length;   // le cycle continue d'une mesure à l'autre
        for (let p = 0; p < bpb - eps; p += unit, k++) {
            if (!keep(p)) continue;
            const note = leadNote(p, cyc[k % cyc.length] + 1);
            if (note === null) continue;
            const acc = Number.isInteger(p) ? 1 : (Math.abs(frac(p) - 0.5) < eps ? 0.86 : 0.74);
            gtr(p, [note], unit * 1.25, 0.58 * acc * (0.94 + 0.12 * rng()), 'arp');
        }
        // seconde guitare (mi-solo) une octave plus bas, en croches et doubles cordes
        if (ph.lead2) playLead(leadPat, { vel: 0.42, art: 'arp', legato: 0.9, maxDur: 0.5, shift: -3 });
    } else if (g === 'af-benga') {
        // seconde guitare : arpèges de croches liés, dans le médium
        // les arpèges serrés (motifs 0 à 2) seulement une mesure sur deux quand l'énergie le demande ; sinon les motifs aérés (3, 4)
        const busy = ph.lead2 && par === 1;
        pick(S.broken, busy ? ph.brokenIdx % 3 : 3 + (ph.brokenIdx % 2)).forEach(([pos, r]) => {
            if (!keep(pos)) return;
            const v = Vs[segAt(pos)];
            gtr(pos, [v[Math.min(2, r)]], 0.8, Number.isInteger(pos) ? 0.4 : 0.34, 'arp');
        });
        bengaLine();
    } else {
        chop(pick(S.chop, ph.chopIdx), 0.54, 'mute', 0.15, true);
        playLead(leadPat, { vel: 0.8, art: 'pluck', legato: 0.8, maxDur: 0.3 });
        // orgue : petits accords sur les contretemps (« bubble »), ou nappe quand l'énergie est basse
        if (ph.organ) {
            if (I > 0.5) each(1, p => organ(p + 0.5, organV(segAt(p + 0.5)), 0.3, 0.36, 'pad', 'rock'));
            else segs.forEach((sg, k) => organ(sg.s, organV(k), (sg.e - sg.s) - 0.1, 0.32, 'swell', 'soft', 0.12));
        }
    }

    // deux guitares sur la même note au même instant : une seule (évite les doublons des motifs qui se croisent)
    // (la ligne de la guitare solo passe en premier : c'est l'accompagnement qui s'efface)
    const seen = new Set();
    piano.sort((a, b) => (b.part === 'solo') - (a.part === 'solo'));
    const out = piano.filter(e => {
        if (e.inst !== 'gtr') return true;
        const key = Math.round(e.pos * 48) + ':' + e.intervals.join(',');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    out.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano: out, bass, drums, africa: true, tone: 'afro' };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AFRICA_GROOVES, AFRICA_DEFAULT_GROOVE, AFRICA_NAMES, AFRICA_STYLE, africaGroove, africaUsesHorns, africaUsesOrgan,
        afChordPcs, afPentaPcs, afLadder, afVoicing, africaPhraseExtras, africaPickStep, buildAfricaPlan };
}
