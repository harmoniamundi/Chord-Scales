// band/afrocuban-plan.js — six rythmes afro-cubains de l'orchestre Cuba, chacun avec son instrumentation :
//   cu-son       son montuno   : tres (guitare) en guajeo, tumbao anticipé, bongó (martillo puis cloche), maracas, clave de son
//   cu-chacha    cha-cha-chá   : piano de charanga en accords, cencerro sur les temps, güiro « long - court - court », conga,
//                                le « chá-chá-chá » (4, 4&, 1) marqué par le piano, la basse et les timbales
//   cu-bolero    bolero        : guitare en accords « 1, 2&, 3 » ou en arpèges, basse « 1 … 2& 3 », bongó et maracas très doux
//   cu-guajira   guajira       : guitare en rasgueos légers, basse sur le 1, güiro, bongó discret, sans clave dans le couplet
//   cu-danzon    danzón (2/4)  : piano de charanga sur le cinquillo, timbales (pailas) et güiro en cinquillo / mesure droite
//   cu-guaguanco rumba guaguancó : clave de rumba, palitos (cáscara), tumbadoras (salidor, tres-dos, quinto), guitare discrète
// Chargé par index.html via <script src="app/band/afrocuban-plan.js"> (après band/band-helpers.js) et testé sous Node par
// band/afrocuban-plan.test.js. Fonction pure : tout ce qui dépendait de JamEngine passe par `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat        temps où la mesure se coupe en deux accords
//   env.seed             graine de la lecture : fixe le sens de la clave (3-2 ou 2-3) pour toute la jam
//   env.state            mémoire entre deux mesures, modifiée en place : latTie (la basse a anticipé : note tenue sur le 1)
// buildAfroCubanPlan renvoie { piano, bass, drums } ; classicalGuitar: true quand la partie d'accords est jouée à la guitare.
//
// Écriture : une mesure = 8 cases (« slots »). En 4/4 une case vaut une croche, en 2/4 (danzón) une double croche : le cinquillo
// s'écrit alors comme une clave. Le motif rythmique s'étend sur deux mesures : le côté « three » et le côté « two » (côté trois / deux
// de la clave, ou mesure du cinquillo / mesure droite du danzón). Le sens (quelle mesure commence) vient de la graine de lecture,
// sauf pour le danzón qui commence toujours par le cinquillo.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { latBassTones, popBassApproach } = require('./band-helpers.js');
}

const AFRO_GROOVES = ['cu-son', 'cu-chacha', 'cu-bolero', 'cu-guajira', 'cu-danzon', 'cu-guaguanco'];

// Claves : [case, vélocité]
const AFRO_CLAVE = {
    son:   { three: [[0, 0.64], [3, 0.58], [6, 0.7]], two: [[2, 0.64], [4, 0.68]] },
    rumba: { three: [[0, 0.64], [3, 0.58], [7, 0.72]], two: [[2, 0.64], [4, 0.68]] }
};

// Martillo du bongó (son, bolero, guajira) : [case, tambour, vélocité] ; l'aigu (hembra) ouvert sur le temps 4.
const AFRO_MARTILLO = [[0, 'bongol', 0.34], [1, 'bongoh', 0.26], [2, 'bongol', 0.3], [3, 'bongoh', 0.42],
    [4, 'bongol', 0.34], [5, 'bongoh', 0.26], [6, 'bongol', 0.3], [7, 'bongoh', 0.5]];

// Écritures de chaque rythme.
//  inst     'guitar' (tres / guitare, cordes de nylon) ou 'piano'
//  clave    'son' | 'rumba' | null ; claveVel : facteur ; claveB : clave seulement dans la 2e ambiance (montuno)
//  fixedDir côté de la première mesure imposé (danzón : cinquillo d'abord)
//  ant      cases d'anticipation possibles de la basse (accord suivant tenu par-dessus la barre), ou null
//  pAnt     case où la partie d'accords passe déjà à l'accord suivant (null : jamais) ; pAntP : probabilité
//  oct      probabilité de doubler à l'octave les notes seules ; legato : durée relative à l'écart avant la note suivante
//  roll     écart (s) entre les notes d'un accord ; ring : tenue maximale (en temps) d'une frappe
//  comp     cellules de la partie d'accords par côté et par densité : [case, voix (indice ou liste), vélocité]
//           voix : 0 fondamentale, 1 tierce, 2 quinte, 3 septième (ou fondamentale à l'octave pour une triade), 4… à l'octave
//  bass     cellules de basse par densité : [case | 'a' (anticipation), jeton, durée en cases, vélocité]
//           jetons : R fondamentale, F quinte, T tierce, O octave, A approche de l'accord suivant, N fondamentale de l'accord suivant
//  fill     tambours du roulement de fin de phrase
const AFRO_STYLES = {
    'cu-son': {
        name: 'Son montuno', inst: 'guitar', clave: 'son', claveVel: 0.95, ant: [6, 7], pAnt: 'ant', pAntP: 0.8,
        oct: 0.85, legato: 0.95, roll: 0.008, ring: 0.9, gainMul: 1.15,
        comp: {
            three: [
                { d: 0.35, hits: [[0, 2, 0.72], [3, 1, 0.66], [4, 0, 0.55], [6, 2, 0.7]] },
                { d: 0.6,  hits: [[0, 2, 0.72], [1, 1, 0.5], [3, 0, 0.68], [4, 1, 0.5], [5, 2, 0.55], [6, 1, 0.7], [7, 0, 0.5]] },
                { d: 0.85, hits: [[0, 2, 0.74], [1, 1, 0.5], [2, 0, 0.55], [3, 1, 0.7], [4, 2, 0.52], [5, 1, 0.5], [6, 3, 0.72], [7, 2, 0.55]] }
            ],
            two: [
                { d: 0.35, hits: [[1, 1, 0.6], [2, 2, 0.7], [4, 1, 0.68], [7, 0, 0.6]] },
                { d: 0.6,  hits: [[1, 0, 0.5], [2, 2, 0.72], [3, 1, 0.5], [4, 2, 0.7], [5, 1, 0.5], [7, 0, 0.62]] },
                { d: 0.85, hits: [[0, 1, 0.5], [1, 0, 0.5], [2, 2, 0.74], [3, 1, 0.52], [4, 2, 0.72], [5, 1, 0.5], [6, 0, 0.52], [7, 2, 0.62]] }
            ]
        },
        bass: [
            { d: 0.3,  hits: [[3, 'F', 3, 0.8], ['a', 'N', 3, 0.9]] },
            { d: 0.55, hits: [[3, 'F', 2, 0.8], [4, 'O', 2, 0.6], ['a', 'N', 3, 0.9]] },
            { d: 0.8,  hits: [[1, 'R', 1, 0.5], [3, 'F', 2, 0.8], [5, 'A', 1, 0.62], ['a', 'N', 3, 0.9]] }
        ],
        fill: ['bongol', 'bongoh', 'bongol', 'bongoh']
    },
    'cu-chacha': {
        name: 'Cha-cha-chá', inst: 'piano', clave: null, ant: null, pAnt: 7, pAntP: 0.55,
        oct: 0, legato: 0.8, roll: 0.004, ring: 0.9, gainMul: 1.05,
        comp: {
            three: [
                { d: 0.35, hits: [[0, [0, 1, 2], 0.62], [3, [1, 2, 3], 0.5], [4, [0, 1, 2], 0.56]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.62], [2, [1, 2, 3], 0.42], [3, [1, 2, 3], 0.52], [4, [0, 1, 2], 0.56], [6, [1, 2, 3], 0.5]] },
                { d: 0.85, hits: [[0, [0, 1, 2, 3], 0.64], [1, 2, 0.4], [2, [1, 2, 3], 0.45], [3, [1, 2, 3], 0.52], [4, [0, 1, 2], 0.56], [5, 3, 0.4], [6, [1, 2, 3], 0.52], [7, [1, 2, 3], 0.48]] }
            ],
            two: [
                { d: 0.35, hits: [[0, [0, 1, 2], 0.6], [4, [1, 2, 3], 0.52], [6, [1, 2, 3], 0.56], [7, [1, 2, 3], 0.56]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.6], [2, [1, 2, 3], 0.45], [4, [1, 2, 3], 0.52], [6, [1, 2, 3], 0.58], [7, [1, 2, 3], 0.56]] },
                { d: 0.85, hits: [[0, [0, 1, 2, 3], 0.6], [1, 2, 0.4], [2, [1, 2, 3], 0.46], [3, 3, 0.42], [4, [1, 2, 3], 0.52], [5, 2, 0.42], [6, [1, 2, 3], 0.58], [7, [1, 2, 3], 0.56]] }
            ]
        },
        bass: [
            { d: 0.3,  hits: [[0, 'R', 4, 0.85], [4, 'F', 3, 0.72], [7, 'A', 1, 0.6]] },
            { d: 0.55, hits: [[0, 'R', 3, 0.85], [3, 'F', 1, 0.62], [4, 'O', 2, 0.7], [6, 'F', 1, 0.6], [7, 'A', 1, 0.62]] },
            { d: 0.8,  hits: [[0, 'R', 2, 0.85], [2, 'T', 1, 0.55], [3, 'F', 1, 0.65], [4, 'O', 2, 0.7], [6, 'F', 1, 0.6], [7, 'A', 1, 0.62]] }
        ],
        fill: ['shell', 'shell', 'shell', 'bell']
    },
    'cu-bolero': {
        name: 'Bolero', inst: 'guitar', clave: 'son', claveVel: 0.42, ant: null, pAnt: null, pAntP: 0,
        oct: 0, legato: 1.6, roll: 0.018, ring: 2.2, gainMul: 1.1,
        comp: {
            three: [
                { d: 0.35, hits: [[0, [1, 2, 3], 0.5], [3, [1, 2, 3], 0.42], [4, [1, 2, 3], 0.48]] },
                { d: 0.6,  hits: [[0, [1, 2, 3], 0.5], [2, 2, 0.4], [3, [1, 2, 3], 0.42], [4, [1, 2, 3], 0.46], [6, 3, 0.4], [7, 2, 0.36]] },
                { d: 0.85, hits: [[0, 1, 0.5], [1, 2, 0.42], [2, 3, 0.44], [3, 4, 0.46], [4, 2, 0.48], [5, 3, 0.42], [6, 4, 0.44], [7, 3, 0.4]] }
            ],
            two: [
                { d: 0.35, hits: [[0, [1, 2, 3], 0.48], [3, [1, 2, 3], 0.42], [4, [1, 2, 3], 0.46]] },
                { d: 0.6,  hits: [[0, [1, 2, 3], 0.48], [2, 3, 0.38], [3, [1, 2, 3], 0.42], [4, [1, 2, 3], 0.46], [6, 2, 0.4], [7, 1, 0.36]] },
                { d: 0.85, hits: [[0, 1, 0.48], [1, 2, 0.4], [2, 3, 0.42], [3, 4, 0.46], [4, 3, 0.46], [5, 2, 0.4], [6, 1, 0.42], [7, 2, 0.38]] }
            ]
        },
        bass: [
            { d: 0.3,  hits: [[0, 'R', 3, 0.8], [3, 'F', 1, 0.58], [4, 'F', 4, 0.72]] },
            { d: 0.55, hits: [[0, 'R', 3, 0.8], [3, 'F', 1, 0.58], [4, 'O', 3, 0.7], [7, 'A', 1, 0.55]] },
            { d: 0.8,  hits: [[0, 'R', 2, 0.8], [2, 'T', 1, 0.5], [3, 'F', 1, 0.58], [4, 'O', 2, 0.7], [6, 'T', 1, 0.5], [7, 'A', 1, 0.56]] }
        ],
        fill: ['bongol', 'bongoh', 'bongoh', 'bongol']
    },
    'cu-guajira': {
        name: 'Guajira', inst: 'guitar', clave: 'son', claveVel: 0.55, claveB: true, ant: [6], antP: 0.35, pAnt: 'ant', pAntP: 0.6,
        oct: 0.5, legato: 1.1, roll: 0.013, ring: 1.4, gainMul: 1.12,
        comp: {
            three: [
                { d: 0.35, hits: [[0, [0, 1, 2], 0.58], [3, [0, 1, 2], 0.5], [6, [1, 2], 0.5]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.58], [2, 1, 0.42], [3, [0, 1, 2], 0.52], [5, 2, 0.42], [6, [1, 2], 0.52]] },
                { d: 0.85, hits: [[0, [0, 1, 2], 0.6], [1, 2, 0.4], [2, 1, 0.44], [3, [0, 1, 2], 0.54], [4, 2, 0.42], [5, 1, 0.42], [6, [1, 2], 0.54], [7, 0, 0.4]] }
            ],
            two: [
                { d: 0.35, hits: [[0, [0, 1, 2], 0.55], [2, [1, 2], 0.48], [4, [0, 1, 2], 0.52], [7, [1, 2], 0.45]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.55], [1, 2, 0.4], [2, [1, 2], 0.48], [4, [0, 1, 2], 0.52], [5, 1, 0.4], [7, [1, 2], 0.46]] },
                { d: 0.85, hits: [[0, [0, 1, 2], 0.56], [1, 2, 0.4], [2, [1, 2], 0.5], [3, 1, 0.4], [4, [0, 1, 2], 0.53], [5, 2, 0.42], [6, 1, 0.4], [7, [1, 2], 0.48]] }
            ]
        },
        bass: [
            { d: 0.3,  hits: [[0, 'R', 3, 0.82], [3, 'F', 3, 0.72], [6, 'R', 2, 0.64]] },
            { d: 0.55, hits: [[0, 'R', 3, 0.82], [3, 'F', 2, 0.72], [6, 'A', 2, 0.62]] },
            { d: 0.8,  hits: [[0, 'R', 2, 0.82], [2, 'T', 1, 0.55], [3, 'F', 3, 0.72], [6, 'O', 1, 0.6], [7, 'A', 1, 0.6]] }
        ],
        // Variante avec anticipation (tumbao du son), choisie pour certaines phrases
        bassAnt: [
            { d: 0.5, hits: [[0, 'R', 2, 0.8], [3, 'F', 3, 0.74], ['a', 'N', 3, 0.86]] }
        ],
        fill: ['bongol', 'bongoh', 'bongol', 'bongoh']
    },
    'cu-danzon': {
        name: 'Danzón', inst: 'piano', clave: null, fixedDir: 0, ant: null, pAnt: null, pAntP: 0,
        oct: 0.4, legato: 0.85, roll: 0.005, ring: 1.2, gainMul: 1.05,
        comp: {
            three: [ // mesure du cinquillo (cases = doubles croches en 2/4)
                { d: 0.35, hits: [[0, [0, 1, 2], 0.6], [3, [1, 2, 3], 0.48], [6, [1, 2, 3], 0.5]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.6], [2, [1, 2], 0.4], [3, [1, 2, 3], 0.5], [5, [1, 2], 0.4], [6, [1, 2, 3], 0.52]] },
                { d: 0.85, hits: [[0, [0, 1, 2], 0.62], [1, 2, 0.38], [2, 1, 0.4], [3, [1, 2, 3], 0.5], [4, 2, 0.38], [5, 3, 0.42], [6, [1, 2, 3], 0.52], [7, 2, 0.38]] }
            ],
            two: [ // mesure droite
                { d: 0.35, hits: [[0, [0, 1, 2], 0.58], [4, [1, 2, 3], 0.5]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.58], [2, [1, 2, 3], 0.42], [4, [1, 2, 3], 0.5], [6, [1, 2, 3], 0.42]] },
                { d: 0.85, hits: [[0, [0, 1, 2], 0.6], [1, 2, 0.38], [2, [1, 2, 3], 0.42], [3, 1, 0.38], [4, [1, 2, 3], 0.5], [5, 2, 0.38], [6, [1, 2, 3], 0.44], [7, 3, 0.38]] }
            ]
        },
        bass: [
            { d: 0.3,  hits: [[0, 'R', 4, 0.82], [4, 'F', 4, 0.7]] },
            { d: 0.55, hits: [[0, 'R', 3, 0.82], [3, 'F', 1, 0.6], [4, 'F', 4, 0.7]] },
            { d: 0.8,  hits: [[0, 'R', 2, 0.82], [2, 'O', 2, 0.55], [4, 'F', 2, 0.7], [6, 'A', 2, 0.6]] }
        ],
        fill: ['shell', 'shell', 'tom1', 'tom2']
    },
    'cu-guaguanco': {
        name: 'Rumba guaguancó', inst: 'guitar', clave: 'rumba', claveVel: 1.05, ant: [6, 7], pAnt: null, pAntP: 0,
        oct: 0, legato: 1.0, roll: 0.012, ring: 1.2, gainMul: 1.0,
        comp: {
            three: [
                { d: 0.35, hits: [[0, [0, 1, 2], 0.48], [3, [1, 2], 0.4]] },
                { d: 0.6,  hits: [[0, [0, 1, 2], 0.5], [3, [1, 2], 0.42], [6, [1, 2, 3], 0.42]] },
                { d: 0.85, hits: [[0, [0, 1, 2], 0.5], [2, 2, 0.36], [3, [1, 2], 0.44], [5, 1, 0.36], [6, [1, 2, 3], 0.44]] }
            ],
            two: [
                { d: 0.35, hits: [[2, [1, 2], 0.42], [4, [0, 1, 2], 0.46]] },
                { d: 0.6,  hits: [[2, [1, 2], 0.42], [4, [0, 1, 2], 0.46], [7, [1, 2], 0.4]] },
                { d: 0.85, hits: [[0, 1, 0.34], [2, [1, 2], 0.44], [4, [0, 1, 2], 0.48], [5, 2, 0.36], [7, [1, 2], 0.42]] }
            ]
        },
        bass: [
            { d: 0.3,  hits: [[0, 'R', 3, 0.75], ['a', 'N', 3, 0.85]] },
            { d: 0.55, hits: [[3, 'F', 3, 0.75], ['a', 'N', 3, 0.85]] },
            { d: 0.8,  hits: [[0, 'R', 2, 0.7], [3, 'F', 2, 0.75], ['a', 'N', 3, 0.85]] }
        ],
        fill: ['conga1', 'slap', 'conga2', 'conga2']
    }
};

// Percussions d'une mesure : liste de [case, tambour, vélocité]. B = deuxième ambiance (montuno, plus pleine).
function afroPercussion(groove, side, B, rng, I) {
    const out = [];
    const add = (e, drum, v) => out.push([e, drum, v]);
    const lift = 0.8 + 0.3 * I;
    if (groove === 'cu-son') {
        if (!B) {
            AFRO_MARTILLO.forEach(([e, d, v]) => { if (e === 0 || rng() > 0.16) add(e, d, v * lift); });
        } else {
            // le bongocero prend la cloche (campana de bongó), la conga entre
            [[0, 0.62], [2, 0.48], [4, 0.6], [6, 0.48], [7, 0.4]].forEach(([e, v]) => add(e, 'bell', v * 0.85 * lift));
            [[2, 'slap', 0.5], [3, 'conga2', 0.58], [6, 'conga2', 0.72], [7, 'conga2', 0.55]].forEach(([e, d, v]) => add(e, d, v * lift));
        }
        for (let e = 0; e < 8; e++) add(e, 'shaker', (e % 2 === 1 ? 0.3 : 0.22) * lift);           // maracas
    } else if (groove === 'cu-chacha') {
        [[0, 0.7], [2, 0.48], [4, 0.66], [6, 0.48]].forEach(([e, v]) => add(e, 'bell', v * (B ? 0.95 : 0.75) * lift));   // cencerro
        [[0, 'guiro', 0.36], [2, 'guirot', 0.22], [3, 'guirot', 0.24], [4, 'guiro', 0.36], [6, 'guirot', 0.22], [7, 'guirot', 0.24]]
            .forEach(([e, d, v]) => add(e, d, v * lift));
        [[0, 'conga1', 0.24], [2, 'slap', 0.55], [4, 'conga1', 0.24], [6, 'conga2', 0.74], [7, 'conga2', 0.62]].forEach(([e, d, v]) => add(e, d, v * lift));
        if (B) [[6, 'shell', 0.42], [7, 'shell', 0.48]].forEach(([e, d, v]) => add(e, d, v * lift)); // le « chá-chá » des timbales
    } else if (groove === 'cu-bolero') {
        // bongó en martillo très léger, maracas « 1, 2&, 3, 4& »
        AFRO_MARTILLO.forEach(([e, d, v]) => { if (e === 0 || e === 3 || e === 7 || rng() > 0.4) add(e, d, v * 0.62 * lift); });
        [[0, 0.3], [3, 0.24], [4, 0.28], [6, 0.18], [7, 0.22]].forEach(([e, v]) => add(e, 'shaker', v * lift));
        if (B) [[6, 'conga2', 0.36], [7, 'conga2', 0.32]].forEach(([e, d, v]) => add(e, d, v * lift));
    } else if (groove === 'cu-guajira') {
        [[0, 'guiro', 0.32], [2, 'guirot', 0.2], [3, 'guirot', 0.22], [4, 'guiro', 0.32], [6, 'guirot', 0.2], [7, 'guirot', 0.22]]
            .forEach(([e, d, v]) => add(e, d, v * lift));
        if (B) AFRO_MARTILLO.forEach(([e, d, v]) => { if (e === 0 || rng() > 0.25) add(e, d, v * 0.8 * lift); });
        else [[3, 'bongoh', 0.3], [7, 'bongoh', 0.38]].forEach(([e, d, v]) => add(e, d, v * lift));
    } else if (groove === 'cu-danzon') {
        if (side === 'three') {  // cinquillo
            [[0, 0.55], [2, 0.4], [3, 0.5], [5, 0.4], [6, 0.55]].forEach(([e, v]) => add(e, 'shell', v * lift));
            [[0, 'guiro', 0.32], [2, 'guirot', 0.2], [3, 'guirot', 0.22], [5, 'guirot', 0.2], [6, 'guiro', 0.3]].forEach(([e, d, v]) => add(e, d, v * lift));
        } else {                 // mesure droite, la paila grave sur le 2
            [[0, 0.5], [2, 0.36], [6, 0.36]].forEach(([e, v]) => add(e, 'shell', v * lift));
            add(4, 'tom2', 0.46 * lift);
            [[0, 'guiro', 0.32], [2, 'guirot', 0.2], [4, 'guiro', 0.3], [6, 'guirot', 0.2]].forEach(([e, d, v]) => add(e, d, v * lift));
        }
        if (B) [[0, 0.45], [4, 0.5]].forEach(([e, v]) => add(e, 'bell', v * lift));    // campana du final (danzón-mambo)
    } else if (groove === 'cu-guaguanco') {
        // palitos sur la guagua : cáscara calée sur la clave de rumba
        const pal = side === 'three' ? [0, 2, 3, 5, 7] : [0, 2, 4, 5, 7];
        const cl = new Set(AFRO_CLAVE.rumba[side].map(c => c[0]));
        pal.forEach(e => add(e, 'shell', (cl.has(e) ? 0.55 : 0.34) * lift));
        // tumbadoras : salidor (grave) et tres-dos ; la tumba répond sur 4 et 4& du côté deux
        if (side === 'three') [[0, 'conga1', 0.24], [2, 'slap', 0.55], [3, 'conga1', 0.7], [4, 'conga1', 0.6], [6, 'conga1', 0.24]].forEach(([e, d, v]) => add(e, d, v * lift));
        else [[0, 'conga1', 0.24], [2, 'slap', 0.55], [4, 'conga1', 0.24], [6, 'conga2', 0.76], [7, 'conga2', 0.7]].forEach(([e, d, v]) => add(e, d, v * lift));
        if (B) {
            // le quinto improvise : quelques frappes aiguës, jamais sur toutes les cases
            const n = 2 + Math.floor(rng() * 3);
            const free = [1, 3, 4, 5, 6, 7].filter(() => rng() < 0.7).slice(0, n);
            free.forEach(e => add(e, rng() < 0.4 ? 'slap' : 'bongol', (0.42 + 0.25 * rng()) * lift));
            for (let e = 0; e < 8; e += 2) add(e + 1, 'shaker', 0.18 * lift);   // chékeré discret
        }
    }
    return out;
}

function afroPhraseExtras(ph, groove) {
    const S = AFRO_STYLES[groove];
    const rng = ph.rng;
    const idx = Number.isInteger(ph.index) ? ph.index : 0;
    // Deux ambiances alternent par groupes de deux phrases : A (couplet / paseo) puis B (montuno, plus plein)
    const B = Math.floor(idx / 2) % 2 === 1;
    const base = typeof ph.intensity === 'number' ? ph.intensity : 0.3 + 0.6 * (typeof ph.density === 'number' ? ph.density : 0.5);
    const calm = groove === 'cu-bolero' ? 0.12 : 0;
    const I = Math.max(0.2, Math.min(1, base + (B ? 0.15 : -0.08) - calm - (idx === 0 ? 0.1 : 0)));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs(c.d - I) * 2)]));
    const cellIdx = byDensity(S.comp.three);
    const useAntBass = !!S.bassAnt && rng() < (S.antP || 0);
    const bassList = useAntBass ? S.bassAnt : S.bass;
    return {
        groove, B, I, cellIdx,
        altIdx: Math.max(0, Math.min(S.comp.three.length - 1, cellIdx + (rng() < 0.5 ? -1 : 1))),
        altOn: rng() < 0.6,
        bassList: useAntBass ? 'bassAnt' : 'bass',
        bassIdx: byDensity(bassList),
        bassAlt: Math.floor(rng() * bassList.length),
        ant: S.ant ? S.ant[Math.floor(rng() * S.ant.length)] : null,
        oct: rng() < S.oct,
        pianoAnt: rng() < S.pAntP
    };
}

function buildAfroCubanPlan(env, groove, bpb, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const S = AFRO_STYLES[groove];
    const rng = ph.rng;
    if (!ph.ac || ph.ac.groove !== groove) ph.ac = afroPhraseExtras(ph, groove);
    const ac = ph.ac;
    const eps = 1e-6;
    const SL = bpb / 8;                                // durée d'une case en temps (croche en 4/4, double croche en 2/4)
    const I = ac.I;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.78 + 0.28 * I) * (0.93 + 0.07 * prog);
    const dir = Number.isInteger(S.fixedDir) ? S.fixedDir : (env.seed || 0) % 2;
    const side = ((m + dir) % 2 === 0) ? 'three' : 'two';
    const splitAt = env.splitBeat;
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const followOf = (si) => si < segs.length - 1 ? segs[si + 1].cs : (changeNext ? nextStep : null);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const bassAntOn = ac.bassList === 'bassAnt' || (!!S.ant && ac.bassList === 'bass');
    const antPos = (ac.ant !== null && bassAntOn) ? ac.ant * SL : null;
    const pAntSlot = S.pAnt === 'ant' ? ac.ant : S.pAnt;
    const pAntPos = (changeNext && ac.pianoAnt && pAntSlot !== null && pAntSlot !== undefined) ? pAntSlot * SL : null;
    const tied = !!env.state.latTie;
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? bpb - Math.min(1, bpb / 2) : 99;

    // ---- partie d'accords (tres, guitare ou piano) ----
    const off = env.transOffset;
    const stacks = {};
    const stackFor = (cs) => {
        const key = cs.rootIndex + ':' + cs.chordId;
        if (stacks[key]) return stacks[key];
        const notes = env.findChordObj(cs.chordId).notes;
        const r0 = notes[0] || 0;
        let rel = [...new Set(notes.slice(0, 4).map(n => (((n - r0) % 12) + 12) % 12))];
        if (rel.length < 3) rel = [...new Set(rel.concat([0, 7]))];
        rel.sort((a, b) => a - b);
        if (rel.length === 3) rel.push(12);           // triade : la 4e voix est la fondamentale à l'octave
        const pcRoot = (((cs.rootIndex + r0) % 12) + 12) % 12;
        const lo = 3 - off;                            // fondamentale entre mi♭3 et ré4 (réels)
        const r = lo + ((((pcRoot - lo) % 12) + 12) % 12);
        return (stacks[key] = rel.map(x => r + x));
    };
    const noteOf = (T, v) => T[v % T.length] + 12 * Math.floor(v / T.length);
    const chordOf = (pos) => (pAntPos !== null && pos >= pAntPos - eps) ? nextStep : segs[segAt(pos)].cs;
    const useAlt = (i === 2 || isTurn) && ac.altOn;
    const cell = S.comp[side][useAlt ? ac.altIdx : ac.cellIdx];
    let gh = cell.hits.map(([e, v, vel]) => [e * SL, v, vel]);
    segs.forEach(sg => {
        const hi = pAntPos !== null ? Math.min(sg.e, pAntPos) : sg.e;
        if (!gh.some(h => h[0] >= sg.s - eps && h[0] < hi - eps)) gh.push([sg.s, [0, 1, 2], 0.6]);
    });
    gh.sort((a, b) => a[0] - b[0]);
    const piano = gh.map(([pos, v, vel], k) => {
        const T = stackFor(chordOf(pos));
        let notes;
        if (Array.isArray(v)) notes = v.map(x => noteOf(T, x));
        else {
            const p = noteOf(T, v);
            notes = (ac.oct && p + 12 + off <= 38) ? [p, p + 12] : [p];
        }
        const nx = gh[k + 1];
        const gap = nx ? nx[0] - pos : 2 * SL;
        const lim = (pAntPos !== null && pos < pAntPos - eps) ? pAntPos + 0.03
            : ((halves && pos < splitAt - eps) ? splitAt + 0.03 : bpb + (changeNext ? 0.03 : 0.3));
        return {
            pos,
            dur: Math.max(0.12, Math.min(gap * S.legato, S.ring, lim - pos)),
            vel: Math.max(0.1, Math.min(1, vel * gv)),
            rootIndex: 0, intervals: notes,
            noteVels: notes.map((_, q) => (q === notes.length - 1 ? 1 : 0.82)),
            roll: S.roll, dir: 1, wide: true, gainMul: S.gainMul,
            lay: rng() * 0.008
        };
    });

    // ---- basse ----
    const bass = [];
    const list = S[ac.bassList] || S.bass;
    const bCell = list[((i === 2 && rng() < 0.5) ? ac.bassAlt : ac.bassIdx) % list.length].hits;
    const bh = bCell
        .filter(([e]) => e !== 'a' || antPos !== null)
        .map(([e, tok, d, v]) => [e === 'a' ? antPos : e * SL, tok, d * SL, v]);
    segs.forEach(sg => {
        if (tied && sg.s === 0) return;                // la note anticipée couvre le 1
        if (!bh.some(h => h[0] >= sg.s - eps && h[0] < sg.s + 2 * SL - eps)) bh.push([sg.s, 'R', Math.min(2, sg.e - sg.s), 0.8]);
    });
    const segInfo = segs.map((sg, si) => {
        const T = latBassTones(env, sg.cs);
        const follow = followOf(si);
        return { T, approach: follow ? popBassApproach(env, T.root, follow, rng) : null };
    });
    bh.forEach(([pos, tok, d, v]) => {
        if (tied && pos < 0.2) return;
        const { T, approach } = segInfo[segAt(pos)];
        let abs;
        switch (tok) {
            case 'F': abs = T.fifth; break;
            case 'T': abs = T.third; break;
            case 'O': abs = T.octave; break;
            case 'A': abs = approach !== null ? approach : T.fifth; break;
            case 'N': abs = changeNext ? latBassTones(env, nextStep).root : T.root; break;
            default: abs = T.root;
        }
        bass.push({ pos, abs, dur: d, tok, vel: Math.min(1, v * (0.82 + 0.22 * I) * (0.92 + 0.08 * prog)), wide: true });
    });
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const isAnt = antPos !== null && b.tok === 'N' && b.pos >= antPos - eps;
        const limit = nx ? nx.pos - b.pos + 0.03 : (isAnt ? bpb - b.pos + 1.3 : bpb - b.pos - 0.03);
        b.dur = Math.max(0.12, Math.min(b.dur, limit));
    });
    const tie = antPos !== null && bass.some(b => b.tok === 'N' && b.pos >= antPos - eps);

    // ---- percussions ----
    const drums = [];
    const fillSet = new Set(S.fill.concat(['shaker', 'guiro', 'guirot', 'bongol', 'bongoh', 'conga1', 'conga2', 'slap', 'shell']));
    const dr = (pos, drum, vel) => {
        if (pos >= bpb - eps) return;
        if (pos >= fillFrom - eps && fillSet.has(drum)) return;
        drums.push({ pos, drum, vel: Math.max(0.05, Math.min(1, vel)) });
    };
    if (S.clave && (!S.claveB || ac.B)) AFRO_CLAVE[S.clave][side].forEach(([e, v]) => dr(e * SL, 'clave', v * S.claveVel));
    afroPercussion(groove, side, ac.B, rng, I).forEach(([e, d, v]) => dr(e * SL, d, v));
    if (doFill) {
        for (let k = 0; k < 4; k++) {
            const pos = fillFrom + k * (bpb - fillFrom) / 4;
            if (pos < bpb - eps) drums.push({ pos, drum: S.fill[k % S.fill.length], vel: Math.min(1, 0.38 + 0.1 * k + 0.12 * I) });
        }
    }
    drums.sort((a, b) => a.pos - b.pos);
    env.state.latTie = tie;
    const out = { piano, bass, drums };
    if (S.inst === 'guitar') out.classicalGuitar = true;
    return out;
}

// Rythmes dont la partie d'accords est jouée à la guitare (le moteur charge alors la guitare classique pour l'orchestre Cuba).
function afroUsesGuitar(groove) { return !!AFRO_STYLES[groove] && AFRO_STYLES[groove].inst === 'guitar'; }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AFRO_GROOVES, AFRO_STYLES, AFRO_CLAVE, AFRO_MARTILLO, afroPercussion, afroPhraseExtras, buildAfroCubanPlan, afroUsesGuitar };
}
