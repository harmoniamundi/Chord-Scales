// band-patterns.js — données des patterns rythmiques de l'orchestre de la jam (piano, basse, batterie,
// styles latin / classique / cubain, bibliothèques de mesures binaires et ternaires).
// Ce sont des tables pures, sans DOM ni audio. Chargé par index.html via <script src="band-patterns.js">
// avant le script principal, et vérifié sous Node par band-patterns.test.js.
// Code déplacé tel quel depuis index.html.

// --- Patterns rythmiques de l'orchestre de la jam ---
// Positions en temps dans la mesure (0 à 4) ; les croches "après le temps" (x.5) sont
// décalées en triolet pour le swing. Une frappe de piano = [position, durée (temps), type, vélocité]
// avec type : 'C' accord plaqué, 'S' dyade tierce + septième, 'N' note guide isolée,
// ou un nombre 0-3 = note d'arpège (index dans l'accord).
// Une frappe de basse = [position, degré, durée (temps), vélocité] avec degré : 'R' fondamentale,
// '3', '5', '7', 'O' octave, 'A' note d'approche chromatique vers l'accord suivant,
// 'nR' / 'n5' = note anticipée de l'accord suivant (si la mesure est la dernière de l'accord).
// w = poids de tirage du pattern.
const bandCell = (w, hits) => ({ w, hits });
const BAND_PATTERNS = {
    swing: {
        rootlessProb: 0.6,
        fillProb: 0.45,
        piano: [
            bandCell(3, [[0, 1.25, 'C', 0.9], [1.5, 0.6, 'S', 0.72]]),
            bandCell(2, [[0.5, 0.9, 'C', 0.8], [2.5, 0.6, 'S', 0.72]]),
            bandCell(3, [[1.5, 0.6, 'C', 0.82], [3.5, 0.6, 'S', 0.72]]),
            bandCell(2, [[0, 0.5, 'S', 0.72], [1.5, 0.5, 'C', 0.85], [3, 0.5, 'N', 0.65]]),
            bandCell(2, [[1, 0.9, 'C', 0.8], [2.5, 0.5, 'S', 0.7], [3.5, 0.6, 'C', 0.8]]),
            bandCell(2, [[0.5, 0.4, 'N', 0.62], [1.5, 0.9, 'C', 0.85], [3, 0.5, 'S', 0.7]]),
            bandCell(2, [[2, 0.6, 'C', 0.85], [3.5, 0.6, 'S', 0.72]]),
            bandCell(1, [[1.5, 0.6, 'C', 0.8]]),
            bandCell(1, [[0, 3.2, 'C', 0.72]]),
            bandCell(1, [[0, 0.8, 'S', 0.55], [1, 0.8, 'S', 0.6], [2, 0.8, 'S', 0.55], [3, 0.8, 'S', 0.6]])
        ],
        turn: [
            bandCell(2, [[0, 1, 'C', 0.85], [1.5, 0.5, 'S', 0.7], [2.5, 0.4, 'N', 0.65], [3, 0.4, 'N', 0.7], [3.5, 0.7, 'C', 0.88]]),
            bandCell(2, [[1.5, 0.6, 'C', 0.85], [2.5, 0.5, 'S', 0.7], [3.5, 0.6, 'C', 0.92]])
        ]
    },
    pop: {
        rootlessProb: 0.2,
        fillProb: 0.5,
        kicks: [[0, 2], [0, 2, 2.5], [0, 0.5, 2], [0, 1.5, 2.5], [0, 2, 3.5], [0, 0.75, 2, 2.75]],
        piano: [
            bandCell(3, [[0, 1.4, 'C', 0.9], [1.5, 0.9, 'C', 0.75], [3, 0.9, 'C', 0.8]]),
            bandCell(2, [[0, 0.9, 'C', 0.9], [1.5, 0.4, 'S', 0.7], [2.5, 0.4, 'S', 0.75], [3.5, 0.4, 'C', 0.8]]),
            bandCell(2, [[0, 0.4, 'C', 0.85], [0.75, 0.4, 'S', 0.65], [1.5, 0.9, 'C', 0.8], [2.75, 0.4, 'S', 0.65], [3, 0.9, 'C', 0.85]]),
            bandCell(1, [[0, 3.4, 'C', 0.75], [3.5, 0.4, 'S', 0.7]]),
            bandCell(2, [[0, 0.5, 0, 0.8], [0.5, 0.5, 1, 0.65], [1, 0.5, 2, 0.7], [1.5, 0.5, 3, 0.65],
                         [2, 0.5, 2, 0.7], [2.5, 0.5, 1, 0.65], [3, 0.5, 0, 0.7], [3.5, 0.5, 1, 0.65]]),
            bandCell(2, [[0.5, 0.4, 'C', 0.8], [1.5, 0.4, 'C', 0.8], [2.5, 0.4, 'C', 0.8], [3.5, 0.4, 'C', 0.85]]),
            bandCell(2, [[0, 1.2, 'C', 0.9], [1.5, 0.4, 'S', 0.7], [2, 0.9, 'C', 0.85], [3.25, 0.4, 'S', 0.65], [3.5, 0.4, 'C', 0.75]])
        ],
        turn: [
            bandCell(2, [[0, 0.9, 'C', 0.9], [1.5, 0.4, 'C', 0.75], [2.5, 0.4, 'S', 0.7], [3, 0.4, 'C', 0.8], [3.5, 0.4, 'C', 0.92]]),
            bandCell(2, [[0, 1.2, 'C', 0.9], [2, 0.4, 'C', 0.8], [2.5, 0.4, 'S', 0.7], [3.25, 0.3, 'S', 0.75], [3.5, 0.5, 'C', 0.92]])
        ],
        bass: [
            bandCell(3, [[0, 'R', 0.9, 0.9], [2, '5', 0.9, 0.8]]),
            bandCell(2, [[0, 'R', 1.4, 0.9], [1.5, 'R', 0.4, 0.65], [2, '5', 0.9, 0.8], [3.5, 'A', 0.45, 0.7]]),
            bandCell(2, [[0, 'R', 0.45, 0.9], [0.5, 'R', 0.45, 0.6], [1, 'R', 0.45, 0.75], [1.5, 'R', 0.45, 0.6],
                         [2, 'R', 0.45, 0.8], [2.5, 'R', 0.45, 0.6], [3, 'R', 0.45, 0.75], [3.5, 'R', 0.45, 0.6]]),
            bandCell(2, [[0, 'R', 1.4, 0.9], [1.5, 'R', 0.4, 0.65], [2.5, '5', 0.4, 0.7], [3, 'R', 0.4, 0.75], [3.5, 'A', 0.45, 0.7]]),
            bandCell(1, [[0, 'R', 0.45, 0.9], [0.5, 'O', 0.45, 0.65], [1, 'R', 0.45, 0.75], [1.5, 'O', 0.45, 0.65],
                         [2, 'R', 0.45, 0.8], [2.5, 'O', 0.45, 0.65], [3, 'R', 0.45, 0.75], [3.5, 'O', 0.45, 0.65]]),
            bandCell(2, [[0, 'R', 0.4, 0.9], [0.75, 'R', 0.2, 0.5], [1.5, 'R', 0.4, 0.7], [2, '5', 0.9, 0.8], [3.25, 'R', 0.2, 0.5], [3.5, '3', 0.4, 0.7]])
        ],
        bassTurn: [
            bandCell(2, [[0, 'R', 0.9, 0.9], [1.5, 'R', 0.4, 0.65], [2, '5', 0.9, 0.8], [3, '3', 0.4, 0.7], [3.5, 'A', 0.45, 0.8]]),
            bandCell(1, [[0, 'R', 1.4, 0.9], [2, '5', 0.9, 0.8], [3, 'R', 0.4, 0.7], [3.5, 'A', 0.45, 0.85]])
        ]
    },
    latin: {
        rootlessProb: 0.3,
        fillProb: 0.35,
        piano: [
            bandCell(3, [[0, 0.9, 'C', 0.85], [1.5, 0.5, 'S', 0.75], [3, 0.9, 'C', 0.8]]),
            bandCell(2, [[0.5, 0.4, 'S', 0.7], [1.5, 0.5, 'C', 0.85], [2.5, 0.4, 'S', 0.7], [3.5, 0.5, 'C', 0.8]]),
            bandCell(2, [[0, 0.4, 'C', 0.85], [0.75, 0.4, 'S', 0.7], [1.5, 0.4, 'C', 0.8], [2, 0.4, 'S', 0.65], [3, 0.4, 'C', 0.8], [3.5, 0.4, 'S', 0.7]]),
            bandCell(2, [[1.5, 0.4, 'C', 0.85], [2, 0.4, 'S', 0.7], [3.5, 0.4, 'C', 0.85]]),
            bandCell(2, [[0, 0.4, 'S', 0.7], [1, 0.4, 'C', 0.8], [1.5, 0.4, 'S', 0.7], [2.5, 0.9, 'C', 0.85], [3.5, 0.4, 'S', 0.7]]),
            bandCell(2, [[0, 0.5, 'S', 0.7], [0.5, 0.4, 'N', 0.6], [1.5, 0.5, 'C', 0.85], [2, 0.4, 'N', 0.6], [2.5, 0.5, 'S', 0.7], [3.5, 0.5, 'C', 0.85]])
        ],
        turn: [
            bandCell(2, [[0, 0.6, 'C', 0.85], [1.5, 0.4, 'S', 0.75], [2, 0.4, 'C', 0.8], [3, 0.4, 'S', 0.7], [3.5, 0.5, 'C', 0.9]]),
            bandCell(1, [[0, 0.9, 'C', 0.85], [1.5, 0.4, 'C', 0.8], [2.5, 0.4, 'S', 0.7], [3, 0.4, 'C', 0.8], [3.5, 0.5, 'C', 0.92]])
        ],
        bass: [
            bandCell(3, [[0, 'R', 1.4, 0.9], [1.5, '5', 0.45, 0.75], [2, 'R', 1.4, 0.85], [3.5, '5', 0.45, 0.75]]),
            bandCell(2, [[0, 'R', 1.4, 0.9], [1.5, '5', 0.45, 0.75], [2, 'R', 0.9, 0.85], [3, '3', 0.4, 0.7], [3.5, '5', 0.4, 0.7]]),
            bandCell(2, [[0, 'R', 0.9, 0.9], [1.5, 'O', 0.45, 0.7], [2, '5', 0.9, 0.85], [3.5, 'nR', 0.45, 0.8]]),
            bandCell(1, [[1.5, 'R', 0.4, 0.85], [2, '5', 0.9, 0.8], [3.5, 'nR', 0.45, 0.85]])
        ],
        bassTurn: [
            bandCell(2, [[0, 'R', 1.4, 0.9], [1.5, '5', 0.45, 0.75], [2, 'R', 0.9, 0.85], [3, '3', 0.4, 0.7], [3.5, 'A', 0.45, 0.85]]),
            bandCell(1, [[0, 'R', 0.9, 0.9], [1.5, '5', 0.45, 0.75], [2, '5', 0.9, 0.8], [3.5, 'A', 0.45, 0.85]])
        ]
    }
};

// --- Écriture du style Pop (gabarits musicaux) ---
// Arpèges du piano « ballade » : index de la voix dans l'accord (0 = grave), une entrée par croche.
const POP_ARP = [
    [0, 2, 3, 2, 1, 2, 3, 2],
    [0, 1, 2, 3, 2, 1, 2, 3],
    [0, 3, 2, 3, 1, 3, 2, 3],
    [0, 2, 1, 3, 2, 3, 1, 2],
    [0, null, 2, 3, null, 2, 3, 1]
];
// Comping syncopé du piano : [position, durée max (temps), vélocité, 'all' accord complet | 'upper' voix aiguës]
const POP_COMP = [
    [[0, 1.4, 0.8, 'all'], [1.5, 0.9, 0.58, 'upper'], [3, 0.9, 0.66, 'all']],
    [[0, 1, 0.8, 'all'], [1.5, 0.5, 0.55, 'upper'], [2, 1.5, 0.7, 'all'], [3.5, 0.5, 0.58, 'upper']],
    [[0, 0.75, 0.8, 'all'], [0.75, 0.75, 0.52, 'upper'], [1.5, 1, 0.68, 'all'], [2.5, 0.75, 0.6, 'upper'], [3.25, 0.6, 0.55, 'upper']],
    [[0, 2, 0.78, 'all'], [2.5, 0.5, 0.58, 'upper'], [3.5, 0.5, 0.6, 'upper']],
    [[0, 0.9, 0.78, 'all'], [1.5, 0.6, 0.58, 'upper'], [2, 0.9, 0.7, 'all'], [3.5, 0.5, 0.58, 'upper']],
    [[0, 1.5, 0.8, 'all'], [2, 1, 0.62, 'upper'], [3, 1, 0.7, 'all']],
    [[0, 1.4, 0.8, 'all'], [1.5, 0.4, 0.5, 'upper'], [2.5, 1.4, 0.72, 'all']],
    [[0, 0.5, 0.7, 'upper'], [1, 0.5, 0.55, 'upper'], [1.5, 1, 0.76, 'all'], [3, 0.5, 0.6, 'upper'], [3.5, 0.5, 0.64, 'all']]
];
// Basse pop : [position, degré, durée max (temps), vélocité] ; degrés R fondamentale, F quinte, T tierce,
// 7 septième, O octave, A note de liaison vers l'accord suivant.
const popEighths = (tokens) => tokens.map((t, k) => [k * 0.5, t, k % 2 === 0 ? 0.5 : 0.4, [0.88, 0.5, 0.7, 0.54, 0.8, 0.5, 0.7, 0.58][k]]);
const POP_BASS = {
    long: [
        [[0, 'R', 3.8, 0.86]],
        [[0, 'R', 1.95, 0.86], [2, 'F', 1.85, 0.72]],
        [[0, 'R', 1.45, 0.86], [1.5, 'R', 0.5, 0.58], [2, 'F', 1.85, 0.7]],
        [[0, 'R', 2.45, 0.86], [2.5, 'O', 1.0, 0.6], [3.5, 'A', 0.45, 0.62]]
    ],
    dotted: [
        [[0, 'R', 1.4, 0.88], [1.5, 'R', 0.9, 0.66], [2.5, 'F', 0.4, 0.6], [3, 'R', 0.45, 0.66], [3.5, 'A', 0.45, 0.7]],
        [[0, 'R', 1.4, 0.88], [1.5, 'R', 0.4, 0.58], [2, 'F', 0.9, 0.72], [3.5, 'A', 0.45, 0.7]],
        [[0, 'R', 0.9, 0.88], [1, 'R', 0.45, 0.56], [1.5, 'O', 0.45, 0.62], [2, 'R', 0.9, 0.78], [3, 'F', 0.4, 0.62], [3.5, 'A', 0.45, 0.7]],
        [[0, 'R', 1.4, 0.88], [1.5, 'T', 0.4, 0.6], [2, 'F', 0.9, 0.74], [3, 'T', 0.45, 0.62], [3.5, 'A', 0.45, 0.7]]
    ],
    eighths: [
        popEighths(['R', 'R', 'R', 'O', 'R', 'R', 'F', 'A']),
        popEighths(['R', 'R', 'O', 'R', 'R', 'R', 'F', 'A']),
        popEighths(['R', 'R', 'R', 'O', 'R', 'F', 'R', 'A']),
        popEighths(['R', 'R', 'R', 'R', 'F', 'R', 'R', 'A'])
    ],
    melodic: [
        [[0, 'R', 0.95, 0.86], [1, 'F', 0.45, 0.62], [1.5, 'T', 0.45, 0.62], [2, 'F', 0.95, 0.74], [3, 'T', 0.45, 0.62], [3.5, 'A', 0.45, 0.68]],
        [[0, 'R', 1.4, 0.86], [1.5, 'F', 0.45, 0.6], [2, 'O', 0.9, 0.72], [3, 'F', 0.45, 0.62], [3.5, 'A', 0.45, 0.68]],
        [[0, 'R', 0.95, 0.86], [1, 'R', 0.45, 0.55], [1.5, 'F', 0.45, 0.62], [2, '7', 0.95, 0.72], [3, 'F', 0.45, 0.62], [3.5, 'A', 0.45, 0.68]]
    ]
};

// --- Écriture du style Latin : guitare classique (nylon) + basse + batterie ---
// Cellules de guitare : [position, durée max (temps), type, vélocité]
// types : T pouce (fondamentale), t pouce (quinte, grave), C accord complet, U cordes aiguës (3 notes, coup montant),
// TC / tC pouce + accord, X accord étouffé (« chk »), aN note d'arpège (N = rang de la voix, 0 = grave).
// d = densité (0 à 1) : sert à choisir la cellule selon l'énergie de la phrase.
const LAT_VOICE_RANGE = { lo: 0, hi: 15, centre: 6, soft: 12 };
// Bossa nova : le pouce garde un balancement fondamentale / quinte, les doigts suivent la clave (3-2) :
// A = barre « 3 » (temps 1, 2&, 4), B = barre « 2 » (temps 2 et 3).
const LAT_BOSSA = [
    { d: 0.18, pick: true,
      A: [[0, 1.2, 'T', 0.62], [0.5, 2, 'a1', 0.4], [1, 2, 'a2', 0.44], [1.5, 2, 'a3', 0.5], [2, 1.2, 't', 0.54], [2.5, 2, 'a2', 0.4], [3, 2, 'a1', 0.44], [3.5, 2, 'a3', 0.5]],
      B: [[0, 1.2, 'T', 0.62], [0.5, 2, 'a2', 0.4], [1, 2, 'a3', 0.46], [1.5, 2, 'a1', 0.42], [2, 1.2, 't', 0.54], [2.5, 2, 'a1', 0.4], [3, 2, 'a3', 0.46], [3.5, 2, 'a2', 0.44]] },
    { d: 0.28,
      A: [[0, 1.6, 'TC', 0.74], [1.5, 0.5, 'U', 0.48], [3, 0.5, 'U', 0.5]],
      B: [[0, 0.9, 'T', 0.5], [1, 0.5, 'U', 0.5], [2, 1.4, 'TC', 0.66], [3.5, 0.5, 't', 0.42]] },
    { d: 0.45,
      A: [[0, 1.4, 'TC', 0.78], [1.5, 0.5, 'tC', 0.56], [2, 0.5, 'T', 0.46], [3, 0.5, 'U', 0.54]],
      B: [[0, 0.5, 'T', 0.5], [1, 0.5, 'U', 0.54], [1.5, 0.5, 't', 0.44], [2, 1.4, 'TC', 0.7], [3.5, 0.5, 't', 0.46]] },
    { d: 0.62,
      A: [[0, 1.4, 'TC', 0.8], [1.5, 0.5, 'tC', 0.58], [2, 0.5, 'T', 0.46], [3, 0.45, 'U', 0.55], [3.5, 0.2, 'X', 0.32]],
      B: [[0, 0.5, 'T', 0.5], [1, 0.5, 'U', 0.55], [1.5, 0.5, 't', 0.44], [2, 0.9, 'TC', 0.7], [3, 0.2, 'X', 0.3], [3.5, 0.5, 'tC', 0.55]] },
    { d: 0.8,
      A: [[0, 0.9, 'TC', 0.82], [0.5, 0.2, 'X', 0.3], [1.5, 0.5, 'tC', 0.6], [2, 0.5, 'T', 0.5], [2.5, 0.2, 'X', 0.3], [3, 0.45, 'U', 0.58], [3.5, 0.45, 'U', 0.5]],
      B: [[0, 0.5, 'T', 0.52], [1, 0.45, 'U', 0.58], [1.5, 0.5, 't', 0.46], [2, 0.9, 'TC', 0.74], [2.5, 0.2, 'X', 0.3], [3, 0.2, 'X', 0.32], [3.5, 0.5, 'tC', 0.6]] }
];
// Samba : batida de guitare (pouce sur chaque temps, accords étouffés sur les doubles croches)
const LAT_SAMBA = [
    { d: 0.5, A: [[0, 0.5, 'T', 0.72], [0.75, 0.18, 'X', 0.4], [1.5, 0.4, 'U', 0.55], [2, 0.5, 't', 0.64], [2.75, 0.18, 'X', 0.4], [3.5, 0.4, 'U', 0.56]] },
    { d: 0.6, A: [[0, 0.5, 'TC', 0.76], [0.75, 0.18, 'X', 0.38], [1, 0.45, 't', 0.56], [1.75, 0.18, 'X', 0.38], [2, 0.5, 'T', 0.66], [2.5, 0.18, 'X', 0.36], [3, 0.45, 't', 0.58], [3.75, 0.18, 'X', 0.38]] },
    { d: 0.4, A: [[0, 0.9, 'TC', 0.76], [1.5, 0.4, 'U', 0.55], [2.25, 0.18, 'X', 0.4], [3, 0.5, 'tC', 0.66], [3.75, 0.18, 'X', 0.38]] },
    { d: 0.7, A: [[0, 0.5, 'T', 0.72], [0.5, 0.2, 'X', 0.34], [0.75, 0.2, 'X', 0.4], [1.5, 0.4, 'U', 0.56], [2, 0.5, 't', 0.64], [2.5, 0.2, 'X', 0.34], [2.75, 0.2, 'X', 0.4], [3, 0.4, 'U', 0.5], [3.5, 0.4, 'U', 0.58]] }
];
// Latin jazz / afro-cubain : guajeo arpégé syncopé sur le tumbao de la basse
const LAT_AFRO = [
    { d: 0.5, A: [[0, 0.5, 'T', 0.62], [0.5, 0.9, 'a1', 0.48], [1, 0.9, 'a2', 0.52], [1.5, 0.9, 'a3', 0.58], [2.5, 0.9, 'a2', 0.5], [3, 0.9, 'a1', 0.5], [3.5, 0.9, 'a3', 0.58]] },
    { d: 0.4, A: [[0, 0.6, 'TC', 0.7], [1.5, 0.5, 'U', 0.55], [2.5, 0.5, 'U', 0.5], [3, 0.5, 't', 0.5], [3.5, 0.5, 'U', 0.58]] },
    { d: 0.65, A: [[0.5, 0.5, 'a2', 0.5], [1, 0.5, 'a3', 0.56], [1.5, 0.5, 'a1', 0.5], [2, 0.5, 'a2', 0.52], [2.5, 0.5, 'a3', 0.56], [3, 0.5, 'U', 0.55], [3.5, 0.5, 'U', 0.6]] }
];
// Tango (marcato) : la guitare martèle chaque temps (accent sur 1 et 3), avec des accords étouffés « chicharra »
// sur les doubles croches et de petites relances aiguës sur le dernier temps.
const LAT_TANGO = [
    { d: 0.3, A: [[0, 0.9, 'TC', 0.84], [1, 0.8, 'C', 0.7], [2, 0.9, 'TC', 0.8], [3, 0.8, 'C', 0.7]] },
    { d: 0.5, A: [[0, 0.5, 'TC', 0.86], [0.75, 0.18, 'X', 0.4], [1, 0.5, 'C', 0.7], [2, 0.5, 'TC', 0.8], [2.75, 0.18, 'X', 0.4], [3, 0.5, 'C', 0.72], [3.5, 0.3, 'U', 0.55]] },
    { d: 0.7, A: [[0, 0.5, 'TC', 0.88], [0.5, 0.18, 'X', 0.4], [0.75, 0.3, 'U', 0.56], [1, 0.5, 'C', 0.72], [2, 0.5, 'TC', 0.82], [2.5, 0.18, 'X', 0.4], [3, 0.5, 'C', 0.74], [3.5, 0.3, 'U', 0.58]] }
];
// Piazzolla (nuevo tango) : découpage 3-3-2 (attaques sur 1, 2& et 4), basse martelée sur les mêmes appuis,
// « yumba » (accent puis accord étouffé) et « chicharra » (grattés rapides) pour les phrases les plus tendues.
const LAT_PIAZZOLLA = [
    { d: 0.35, A: [[0, 0.9, 'TC', 0.86], [1.5, 0.9, 'C', 0.8], [3, 0.9, 'C', 0.78]] },
    { d: 0.5, A: [[0, 0.5, 'TC', 0.88], [0.75, 0.18, 'X', 0.4], [1.5, 0.5, 'C', 0.8], [2.25, 0.18, 'X', 0.4], [3, 0.5, 'C', 0.8], [3.5, 0.3, 'U', 0.6]] },
    { d: 0.7, A: [[0, 0.4, 'TC', 0.9], [0.5, 0.2, 'X', 0.42], [1.5, 0.4, 'tC', 0.82], [2, 0.2, 'X', 0.4], [2.5, 0.2, 'X', 0.4], [3, 0.4, 'C', 0.82], [3.5, 0.3, 'U', 0.62]] },
    { d: 0.85, A: [[0, 0.4, 'TC', 0.9], [0.25, 0.15, 'X', 0.38], [0.5, 0.15, 'X', 0.42], [1.5, 0.4, 'C', 0.84], [1.75, 0.15, 'X', 0.38], [2, 0.15, 'X', 0.42], [3, 0.4, 'C', 0.84], [3.25, 0.15, 'X', 0.38], [3.5, 0.3, 'U', 0.62]] }
];
// Basse latine : [position, degré, durée max (temps), vélocité] ; R fondamentale, F quinte (grave), T tierce,
// O octave, A note de liaison vers l'accord suivant, N « anticipation » : fondamentale de l'accord suivant.
const LAT_BASS = {
    bossa: [
        [[0, 'R', 1.4, 0.88], [1.5, 'F', 0.45, 0.7], [2, 'R', 1.4, 0.82], [3.5, 'F', 0.45, 0.7]],
        [[0, 'R', 1.4, 0.88], [1.5, 'F', 0.45, 0.7], [2, 'O', 0.9, 0.78], [3, 'F', 0.45, 0.64], [3.5, 'A', 0.45, 0.68]],
        [[0, 'R', 0.9, 0.88], [1.5, 'F', 0.45, 0.7], [2, 'R', 0.9, 0.8], [3, 'T', 0.4, 0.62], [3.5, 'F', 0.45, 0.68]],
        [[0, 'R', 1.9, 0.86], [2, 'F', 1.4, 0.72], [3.5, 'A', 0.45, 0.66]],
        [[0, 'R', 1.4, 0.88], [1.5, 'F', 0.45, 0.68], [2, 'T', 0.9, 0.74], [3, 'F', 0.4, 0.62], [3.5, 'A', 0.45, 0.68]]
    ],
    samba: [
        [[0, 'R', 0.45, 0.82], [1, 'F', 0.9, 0.82], [2, 'R', 0.45, 0.78], [3, 'F', 0.9, 0.82]],
        [[0, 'R', 0.4, 0.82], [1, 'F', 0.4, 0.76], [1.5, 'R', 0.4, 0.62], [2, 'R', 0.4, 0.78], [3, 'F', 0.4, 0.76], [3.5, 'A', 0.45, 0.7]],
        [[0, 'R', 0.45, 0.82], [0.75, 'R', 0.2, 0.55], [1, 'F', 0.9, 0.8], [2, 'R', 0.45, 0.78], [2.75, 'F', 0.2, 0.55], [3, 'F', 0.5, 0.78], [3.5, 'A', 0.45, 0.66]]
    ],
    afro: [
        [[0, 'R', 0.45, 0.7], [1.5, 'R', 1.4, 0.82], [3, 'F', 0.45, 0.76], [3.5, 'N', 1.2, 0.8]],
        [[0, 'R', 0.45, 0.7], [1.5, 'R', 0.45, 0.8], [2, 'F', 0.45, 0.68], [3, 'O', 0.45, 0.76], [3.5, 'N', 1.2, 0.8]],
        [[0, 'R', 0.45, 0.7], [1.5, 'R', 0.9, 0.82], [3, 'T', 0.45, 0.7], [3.5, 'N', 1.2, 0.8]]
    ],
    // tango : basse « marcato » (fondamentale / quinte sur chaque temps), avec arrastre vers l'accord suivant
    tango: [
        [[0, 'R', 0.9, 0.88], [1, 'F', 0.9, 0.78], [2, 'R', 0.9, 0.84], [3, 'F', 0.9, 0.78]],
        [[0, 'R', 0.45, 0.88], [0.5, 'R', 0.4, 0.55], [1, 'F', 0.9, 0.78], [2, 'R', 0.9, 0.84], [3, 'F', 0.45, 0.76], [3.5, 'A', 0.45, 0.7]],
        [[0, 'R', 0.9, 0.88], [1, 'F', 0.9, 0.78], [2, 'R', 0.9, 0.84], [3, 'T', 0.45, 0.72], [3.5, 'A', 0.45, 0.7]]
    ],
    // Piazzolla : 3-3-2, la basse marque les mêmes appuis que la guitare
    piazzolla: [
        [[0, 'R', 1.4, 0.9], [1.5, 'R', 1.4, 0.84], [3, 'F', 0.9, 0.8]],
        [[0, 'R', 1.4, 0.9], [1.5, 'F', 1.4, 0.8], [3, 'A', 0.9, 0.74]],
        [[0, 'R', 0.9, 0.9], [1.5, 'R', 0.9, 0.8], [2.5, 'O', 0.4, 0.66], [3, 'F', 0.9, 0.78]]
    ]
};

// --- Style Classique : accompagnement en arpèges (notes de l'accord uniquement) ---
// Les motifs donnent, pour chaque position, le rang de la voix de l'accord (0 = grave, 3 = aigu ; au-delà du nombre de
// notes de l'accord, la voix est reprise à l'octave supérieure). null = silence.
const CLS_EIGHTS = [          // une mesure en croches (8 positions)
    [0, 1, 2, 3, 2, 1, 2, 1],     // montée et redescente
    [0, 2, 1, 3, 2, 3, 1, 2],     // arpège brisé
    [0, 3, 1, 3, 2, 3, 1, 3],     // basse d'Alberti
    [0, 1, 2, 1, 3, 2, 1, 2],     // vague
    [0, 1, 2, 3, 3, 2, 1, 0],     // montée puis descente complète
    [0, 1, 2, null, 3, 2, 1, null] // respirée
];
const CLS_QUARTERS = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 2, 1], [0, 1, 2, 1], [0, 2, 3, 2]];
const CLS_MIXED = [            // rythmes variés : [position, voix]
    [[0, 0], [1, 1], [1.5, 2], [2, 3], [3, 2], [3.5, 1]],
    [[0, 0], [1.5, 1], [2, 2], [3, 3], [3.5, 2]],
    [[0, 0], [0.5, 1], [1, 2], [2, 3], [3, 1], [3.5, 2]],
    [[0, 0], [1, 2], [1.5, 1], [2, 3], [2.5, 2], [3, 1]]
];
const CLS_UPPER = [            // voix aiguës en croches sous/sur une basse tenue (positions 0.5 à 3.5)
    [1, 2, 3, 2, 1, 2, 3],
    [1, 3, 2, 3, 1, 3, 2],
    [1, 2, 3, 2, 3, 2, 1]
];
// Le style « Classique » n'a ni basse ni batterie ni motifs de la bibliothèque : entrée factice pour le moteur commun.
BAND_PATTERNS.classic = {
    rootlessProb: 0, fillProb: 0,
    piano: [bandCell(1, [[0, 1, 'C', 0.8]])],
    turn: [bandCell(1, [[0, 1, 'C', 0.8]])]
};

// Le style « Brass band » a son propre générateur (buildBrassPlan) : entrée factice pour le moteur commun.
BAND_PATTERNS.brass = {
    rootlessProb: 0, fillProb: 0,
    piano: [bandCell(1, [[0, 1, 'C', 0.8]])],
    turn: [bandCell(1, [[0, 1, 'C', 0.8]])]
};

// Sujets de fugue du style « Tango nuevo » : [croche d'entrée, saut en degrés de la gamme par rapport à la note précédente].
const PZ_SUBJECTS = [
    [[0, 0], [3, 2], [4, -1], [6, -1], [7, -1]],
    [[0, 0], [3, -1], [6, -1], [7, 2]],
    [[0, 0], [2, 1], [3, 1], [6, -2], [7, -1]],
    [[0, 0], [3, 3], [5, -1], [6, -1]],
    [[0, 0], [1, -1], [3, 2], [6, -1]]
];

// Arpèges du piano de la Milonga lyrique : 8 croches par mesure, indices dans les notes de l'accord (0 = grave, 3 = aigu), null = silence.
const PZ_LYR_ARP = [
    [0, 2, 3, 2, 1, 2, 3, 2],
    [0, 1, 2, 3, 2, 1, 2, 1],
    [0, 2, 1, 3, 2, 3, 1, 2],
    [0, null, 2, 3, null, 2, 1, 2]
];

// Le style « Tango nuevo » (Piazzolla) a son propre générateur (buildPiazzollaPlan) : entrée factice pour le moteur commun.
BAND_PATTERNS.piazzolla = {
    rootlessProb: 0, fillProb: 0,
    piano: [bandCell(1, [[0, 1, 'C', 0.8]])],
    turn: [bandCell(1, [[0, 1, 'C', 0.8]])]
};

// Le style « Balkans » a son propre générateur (buildBalkanPlan) : entrée factice pour le moteur commun.
BAND_PATTERNS.balkan = {
    rootlessProb: 0, fillProb: 0,
    piano: [bandCell(1, [[0, 1, 'C', 0.8]])],
    turn: [bandCell(1, [[0, 1, 'C', 0.8]])]
};

// --- Motifs du 3/4 et du 2/4 ---
// Mêmes conventions que les motifs 4/4 ci-dessus, mais la mesure n'a plus que 3 (positions 0 à 2.5) ou 2 temps
// (0 à 1.5). Les bibliothèques sont choisies par getPatternLib() ; les cellules sont tirées par phrase, comme en 4/4.
const _meterDummy = [bandCell(1, [[0, 1, 'C', 0.8]])]; // entrée factice pour les styles qui n'utilisent pas ces cellules
const METER_LIB = {
    '3/4': {
        // Valse jazz : le piano commente sur les temps 2 et 3 ou en contretemps, la basse marche en trois.
        swing: {
            rootlessProb: 0.6, fillProb: 0.45,
            piano: [
                bandCell(3, [[0, 1.2, 'C', 0.85], [2, 0.9, 'S', 0.7]]),                       // 1 . 3
                bandCell(3, [[1, 1, 'C', 0.82], [2, 0.9, 'S', 0.7]]),                         // . 2 3 (valse classique)
                bandCell(2, [[1.5, 0.6, 'C', 0.82], [2.5, 0.4, 'S', 0.7]]),                   // 2& 3&
                bandCell(2, [[0, 0.5, 'S', 0.7], [1.5, 0.7, 'C', 0.85]]),
                bandCell(2, [[0.5, 0.7, 'C', 0.8], [2, 0.9, 'S', 0.7]]),
                bandCell(2, [[1, 0.8, 'C', 0.8], [2.5, 0.5, 'S', 0.7]]),
                bandCell(2, [[0, 0.5, 'N', 0.62], [1.5, 0.8, 'C', 0.85], [2.5, 0.4, 'N', 0.65]]),
                bandCell(1, [[0, 2.8, 'C', 0.72]]),
                bandCell(1, [[1.5, 0.6, 'C', 0.8]]),
                bandCell(1, [[0, 0.8, 'S', 0.6], [1, 0.8, 'S', 0.65], [2, 0.8, 'S', 0.6]])
            ],
            turn: [
                bandCell(2, [[0, 1, 'C', 0.85], [1.5, 0.5, 'S', 0.7], [2.5, 0.6, 'C', 0.9]]),
                bandCell(2, [[1, 0.8, 'C', 0.85], [2, 0.5, 'S', 0.7], [2.5, 0.6, 'C', 0.92]]),
                bandCell(1, [[1.5, 0.6, 'C', 0.85], [2.5, 0.6, 'C', 0.92]])
            ]
        },
        // Pop en 3 : ballade arpégée, valse (basse / accord / accord) ou comping syncopé.
        pop: {
            rootlessProb: 0.2, fillProb: 0.5, piano: _meterDummy, turn: _meterDummy,
            comp: [   // [position, durée max, vélocité, 'all' accord complet | 'upper' voix aiguës]
                [[0, 1.4, 0.8, 'all'], [1.5, 0.7, 0.58, 'upper'], [2.5, 0.4, 0.55, 'upper']],
                [[0, 1.4, 0.8, 'all'], [2, 0.9, 0.62, 'all']],
                [[0, 0.9, 0.8, 'all'], [1, 0.5, 0.55, 'upper'], [2, 0.9, 0.62, 'upper']],
                [[0, 0.9, 0.8, 'all'], [1.5, 0.5, 0.6, 'upper'], [2, 0.5, 0.55, 'upper'], [2.5, 0.5, 0.55, 'upper']],
                [[0, 1.9, 0.78, 'all'], [2.5, 0.4, 0.6, 'upper']],
                [[0, 0.5, 0.7, 'upper'], [1, 0.9, 0.78, 'all'], [2.5, 0.5, 0.6, 'upper']]
            ],
            arp: [    // une entrée par croche (6) : index de la voix, 0 = grave
                [0, 2, 3, 2, 1, 2],
                [0, 1, 2, 3, 2, 1],
                [0, 2, 1, 3, 2, 1],
                [0, null, 2, 3, null, 2],
                [0, 3, 2, 3, 1, 2]
            ],
            bassCells: {   // [position, degré, durée, vélocité] : R fondamentale, F quinte, T tierce, A liaison vers l'accord suivant
                long: [[[0, 'R', 2.8, 0.85]], [[0, 'R', 1.9, 0.85], [2, 'F', 0.9, 0.7]]],
                dotted: [[[0, 'R', 1.4, 0.88], [1.5, 'F', 0.9, 0.7], [2.5, 'A', 0.45, 0.6]], [[0, 'R', 1.4, 0.88], [1.5, 'F', 1.4, 0.7]]],
                eighths: [[[0, 'R', 0.45, 0.85], [1, 'R', 0.45, 0.6], [1.5, 'F', 0.45, 0.7], [2, 'R', 0.45, 0.62], [2.5, 'A', 0.45, 0.6]],
                          [[0, 'R', 0.45, 0.85], [0.5, 'R', 0.45, 0.55], [1, 'F', 0.45, 0.65], [2, 'T', 0.45, 0.62], [2.5, 'A', 0.45, 0.6]]],
                melodic: [[[0, 'R', 1, 0.85], [1, 'T', 0.9, 0.7], [2, 'F', 0.9, 0.75]], [[0, 'R', 1, 0.85], [1, 'F', 0.9, 0.7], [2, 'A', 0.9, 0.72]]]
            },
            drums: {  // groove : grosse caisse, caisse claire / cross-stick, charleston
                ballad: { hat: 'q', kick: [[0, 1]], snare: [[2, 0.55, 'rim']] },
                waltz:  { hat: 'e', kick: [[0, 1]], snare: [[1, 0.45, 'rim'], [2, 0.7, 'snare']] },
                back:   { hat: 'e', kick: [[0, 1], [1.5, 0.75]], snare: [[2, 0.9, 'snare']] },
                drive:  { hat: 'e', kick: [[0, 1], [1.5, 0.8], [2.5, 0.7]], snare: [[1, 0.5, 'snare'], [2, 0.9, 'snare']] }
            }
        },
        // Latin en 3 : bossa-valse, valsa brésilienne (samba en 3) et vals criollo.
        latin: {
            rootlessProb: 0, fillProb: 0.45, piano: _meterDummy, turn: _meterDummy,
            bossa: [  // d = densité ; A / B alternent d'une mesure à l'autre
                { d: 0.2, A: [[0, 1.2, 'T', 0.62], [1, 2, 'a1', 0.42], [1.5, 2, 'a2', 0.46], [2, 1.2, 't', 0.54], [2.5, 2, 'a3', 0.5]],
                          B: [[0, 1.2, 'T', 0.62], [0.5, 2, 'a2', 0.4], [1, 2, 'a3', 0.46], [2, 1.2, 't', 0.54], [2.5, 2, 'a1', 0.42]] },
                { d: 0.35, A: [[0, 1.6, 'TC', 0.74], [1.5, 0.5, 'U', 0.5], [2.5, 0.5, 'U', 0.5]],
                           B: [[0, 0.9, 'T', 0.5], [1, 0.5, 'U', 0.5], [2, 1.4, 'TC', 0.66]] },
                { d: 0.55, A: [[0, 1.4, 'TC', 0.78], [1.5, 0.5, 'tC', 0.56], [2, 0.5, 'T', 0.46], [2.5, 0.5, 'U', 0.54]],
                           B: [[0, 0.5, 'T', 0.5], [1, 0.5, 'U', 0.54], [1.5, 0.5, 't', 0.44], [2, 1.4, 'TC', 0.7]] },
                { d: 0.78, A: [[0, 0.9, 'TC', 0.82], [0.5, 0.2, 'X', 0.3], [1.5, 0.5, 'tC', 0.6], [2, 0.5, 'T', 0.5], [2.5, 0.45, 'U', 0.58]],
                           B: [[0, 0.5, 'T', 0.52], [1, 0.45, 'U', 0.58], [1.5, 0.5, 't', 0.46], [2, 0.9, 'TC', 0.74], [2.5, 0.2, 'X', 0.3]] }
            ],
            samba: [  // valsa : le pouce marque chaque temps, accords étouffés sur les doubles croches
                { d: 0.45, A: [[0, 0.5, 'T', 0.72], [0.75, 0.18, 'X', 0.4], [1.5, 0.4, 'U', 0.55], [2, 0.5, 't', 0.64], [2.75, 0.18, 'X', 0.4]] },
                { d: 0.6, A: [[0, 0.5, 'TC', 0.76], [0.75, 0.18, 'X', 0.38], [1, 0.45, 't', 0.56], [1.75, 0.18, 'X', 0.38], [2, 0.5, 'T', 0.66], [2.5, 0.18, 'X', 0.36]] },
                { d: 0.75, A: [[0, 0.5, 'T', 0.72], [0.5, 0.2, 'X', 0.34], [0.75, 0.2, 'X', 0.4], [1.5, 0.4, 'U', 0.56], [2, 0.5, 't', 0.64], [2.5, 0.2, 'X', 0.34], [2.75, 0.2, 'X', 0.4]] }
            ],
            afro: [   // vals criollo : appuis sur le 2 et le « et » du 3
                { d: 0.4, A: [[0, 0.5, 'T', 0.62], [1, 0.9, 'a1', 0.5], [1.5, 0.9, 'a2', 0.54], [2.5, 0.9, 'a3', 0.58]] },
                { d: 0.55, A: [[0, 0.6, 'TC', 0.7], [1.5, 0.5, 'U', 0.55], [2.5, 0.5, 'U', 0.58]] },
                { d: 0.7, A: [[0.5, 0.5, 'a2', 0.5], [1, 0.5, 'a3', 0.56], [1.5, 0.5, 'a1', 0.5], [2, 0.5, 'a2', 0.52], [2.5, 0.5, 'U', 0.6]] }
            ],
            bassCells: {
                bossa: [[[0, 'R', 1.4, 0.88], [1.5, 'F', 1.4, 0.7]],
                        [[0, 'R', 0.9, 0.88], [1.5, 'F', 0.45, 0.7], [2, 'T', 0.9, 0.74]],
                        [[0, 'R', 1.9, 0.86], [2, 'F', 0.9, 0.72]]],
                samba: [[[0, 'R', 0.45, 0.82], [1, 'F', 0.9, 0.82], [2, 'R', 0.45, 0.7]],
                        [[0, 'R', 0.4, 0.82], [1, 'F', 0.4, 0.76], [1.5, 'R', 0.4, 0.62], [2, 'F', 0.45, 0.72]]],
                afro: [[[0, 'R', 0.45, 0.7], [1.5, 'R', 0.9, 0.82], [2.5, 'F', 0.45, 0.7]],
                       [[0, 'R', 0.45, 0.7], [1.5, 'R', 0.45, 0.8], [2, 'F', 0.45, 0.68], [2.5, 'A', 0.45, 0.72]]]
            },
            drums: {  // hat toujours en croches ; kick [pos, vel] ; rim A / B alternent
                bossa: { kick: [[0, 0.8], [1.5, 0.55]], rimA: [0, 1.5], rimB: [1, 2.5] },
                samba: { kick: [[0, 0.6], [1, 0.9], [2, 0.6]], rimA: [1.5, 2.5], rimB: [0.5, 2] },
                afro:  { kick: [[0, 0.8], [1.5, 0.62]], rimA: [1, 2.5], rimB: [1.5, 2] }
            }
        },
        // Classique en 3 : arpèges en six croches, valse (basse puis accord), rythmes mêlés, voix aiguës sur basse.
        classic: {
            rootlessProb: 0, fillProb: 0, piano: _meterDummy, turn: _meterDummy,
            eights: [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3, 2, 1], [0, 3, 1, 3, 2, 3], [0, 1, 2, 1, 3, 2], [0, 1, 2, 3, 2, 3], [0, 1, 2, null, 2, 1]],
            quarters: [[0, 1, 2], [0, 2, 1], [0, 3, 2], [0, 2, 3], [0, 1, 3]],
            mixed: [[[0, 0], [1, 1], [1.5, 2], [2, 3], [2.5, 2]], [[0, 0], [0.5, 1], [1, 2], [2, 3]],
                    [[0, 0], [1.5, 1], [2, 2], [2.5, 3]], [[0, 0], [1, 2], [1.5, 1], [2, 3]]],
            upper: [[1, 2, 3, 2, 1], [1, 3, 2, 3, 1], [1, 2, 3, 2, 3]],
            tail: [[1, 2, 3, 2], [0, 2, 3, 2]]
        }
    },
    '2/4': {
        // Deux temps swing : basse sur chaque temps, piano en contretemps.
        swing: {
            rootlessProb: 0.6, fillProb: 0.4,
            piano: [
                bandCell(3, [[0, 1.2, 'C', 0.85], [1.5, 0.5, 'S', 0.7]]),
                bandCell(2, [[0.5, 0.9, 'C', 0.8]]),
                bandCell(3, [[1, 0.9, 'C', 0.82]]),
                bandCell(2, [[0, 0.8, 'S', 0.7], [1.5, 0.5, 'C', 0.82]]),
                bandCell(2, [[0, 0.5, 'N', 0.62], [1, 0.9, 'C', 0.82]]),
                bandCell(1, [[0, 1.9, 'C', 0.72]]),
                bandCell(1, [[1.5, 0.5, 'C', 0.8]])
            ],
            turn: [
                bandCell(2, [[0, 1, 'C', 0.85], [1.5, 0.5, 'C', 0.9]]),
                bandCell(2, [[0.5, 0.8, 'C', 0.85], [1.5, 0.5, 'C', 0.92]])
            ]
        },
        // Pop en 2 : marche, polka, pop droit, ballade.
        pop: {
            rootlessProb: 0.2, fillProb: 0.5, piano: _meterDummy, turn: _meterDummy,
            comp: [
                [[0, 1.4, 0.78, 'all'], [1.5, 0.5, 0.58, 'upper']],
                [[0, 0.9, 0.78, 'all'], [1, 0.9, 0.6, 'upper']],
                [[0, 1.9, 0.78, 'all']],
                [[0, 0.9, 0.8, 'all'], [1.5, 0.4, 0.55, 'upper']],
                [[0, 0.45, 0.7, 'upper'], [0.5, 0.45, 0.55, 'upper'], [1, 0.9, 0.78, 'all']]
            ],
            arp: [[0, 1, 2, 1], [0, 2, 3, 2], [0, 1, 2, 3], [0, null, 2, 3]],
            bassCells: {
                long: [[[0, 'R', 1.9, 0.85]], [[0, 'R', 0.9, 0.85], [1, 'F', 0.9, 0.7]]],
                dotted: [[[0, 'R', 1.4, 0.88], [1.5, 'A', 0.45, 0.62]], [[0, 'R', 1.4, 0.88], [1.5, 'F', 0.45, 0.66]]],
                eighths: [[[0, 'R', 0.45, 0.85], [0.5, 'R', 0.45, 0.6], [1, 'F', 0.45, 0.7], [1.5, 'A', 0.45, 0.6]],
                          [[0, 'R', 0.45, 0.85], [0.5, 'F', 0.45, 0.6], [1, 'R', 0.45, 0.7], [1.5, 'A', 0.45, 0.6]]],
                melodic: [[[0, 'R', 1, 0.85], [1, 'F', 0.9, 0.72]], [[0, 'R', 1, 0.85], [1, 'T', 0.9, 0.7]]]
            },
            drums: {
                ballad: { hat: 'q', kick: [[0, 1]], snare: [[1, 0.55, 'rim']] },
                march:  { hat: 'e', kick: [[0, 1]], snare: [[1, 0.9, 'snare']] },
                polka:  { hat: 'q', kick: [[0, 0.9], [1, 0.8]], snare: [[0.5, 0.6, 'snare'], [1.5, 0.7, 'snare']] },
                drive:  { hat: 'e', kick: [[0, 1], [0.5, 0.7], [1.5, 0.75]], snare: [[1, 0.9, 'snare']] }
            }
        },
        // Latin en 2 : samba (le temps naturel du genre), bossa à deux temps, baião.
        latin: {
            rootlessProb: 0, fillProb: 0.45, piano: _meterDummy, turn: _meterDummy,
            bossa: [
                { d: 0.25, A: [[0, 1.4, 'TC', 0.76], [1.5, 0.5, 'U', 0.5]], B: [[0, 0.9, 'T', 0.5], [1, 1.2, 'TC', 0.68]] },
                { d: 0.5, A: [[0, 1.4, 'TC', 0.78], [1.5, 0.5, 'tC', 0.58]], B: [[0, 0.5, 'T', 0.5], [0.5, 0.5, 'U', 0.5], [1, 1.2, 'TC', 0.7]] },
                { d: 0.75, A: [[0, 0.9, 'TC', 0.8], [0.5, 0.2, 'X', 0.3], [1.5, 0.5, 'tC', 0.6]], B: [[0, 0.5, 'T', 0.52], [1, 0.9, 'TC', 0.72], [1.5, 0.2, 'X', 0.3]] }
            ],
            samba: [
                { d: 0.45, A: [[0, 0.45, 'T', 0.8], [0.5, 0.2, 'X', 0.4], [1, 0.45, 't', 0.65], [1.5, 0.2, 'X', 0.4]] },
                { d: 0.65, A: [[0, 0.45, 'TC', 0.78], [0.75, 0.18, 'X', 0.38], [1, 0.45, 't', 0.62], [1.75, 0.18, 'X', 0.38]] },
                { d: 0.8, A: [[0, 0.4, 'T', 0.76], [0.5, 0.18, 'X', 0.34], [0.75, 0.18, 'X', 0.4], [1, 0.4, 'U', 0.6], [1.5, 0.18, 'X', 0.34], [1.75, 0.18, 'X', 0.4]] }
            ],
            afro: [   // baião
                { d: 0.4, A: [[0, 0.5, 'T', 0.64], [0.5, 0.45, 'U', 0.55], [1.5, 0.45, 'U', 0.58]] },
                { d: 0.65, A: [[0, 0.45, 'TC', 0.7], [0.75, 0.2, 'X', 0.36], [1, 0.45, 't', 0.56], [1.5, 0.45, 'U', 0.6]] }
            ],
            tango: [  // tango à danser : marcato sur chaque temps, « chicharra » sur les doubles croches
                { d: 0.3, A: [[0, 0.9, 'TC', 0.84], [1, 0.8, 'C', 0.7]] },
                { d: 0.55, A: [[0, 0.5, 'TC', 0.86], [0.75, 0.18, 'X', 0.4], [1, 0.5, 'C', 0.72], [1.5, 0.2, 'X', 0.38]] },
                { d: 0.75, A: [[0, 0.5, 'TC', 0.88], [0.5, 0.18, 'X', 0.4], [0.75, 0.3, 'U', 0.56], [1, 0.5, 'C', 0.74], [1.5, 0.3, 'U', 0.58]] }
            ],
            piazzolla: [  // 3-3-2 ramené à deux temps : attaques sur 1, 1&-et et 2&
                { d: 0.4, A: [[0, 0.6, 'TC', 0.88], [0.75, 0.5, 'C', 0.8], [1.5, 0.4, 'U', 0.6]] },
                { d: 0.65, A: [[0, 0.5, 'TC', 0.9], [0.5, 0.15, 'X', 0.4], [0.75, 0.5, 'C', 0.82], [1.25, 0.15, 'X', 0.4], [1.5, 0.4, 'U', 0.62]] }
            ],
            bassCells: {
                bossa: [[[0, 'R', 1.4, 0.88], [1.5, 'F', 0.45, 0.7]], [[0, 'R', 0.9, 0.88], [1, 'F', 0.9, 0.74]]],
                samba: [[[0, 'R', 0.45, 0.82], [1, 'F', 0.9, 0.82]], [[0, 'R', 0.4, 0.82], [0.5, 'R', 0.4, 0.58], [1, 'F', 0.9, 0.8]]],
                afro: [[[0, 'R', 0.9, 0.78], [1.5, 'F', 0.45, 0.7]], [[0, 'R', 0.45, 0.78], [0.5, 'F', 0.45, 0.62], [1, 'R', 0.45, 0.8], [1.5, 'A', 0.45, 0.68]]],
                tango: [[[0, 'R', 0.9, 0.86], [1, 'F', 0.9, 0.78]], [[0, 'R', 0.45, 0.86], [0.5, 'R', 0.4, 0.55], [1, 'F', 0.9, 0.8]], [[0, 'R', 0.9, 0.86], [1, 'F', 0.45, 0.76], [1.5, 'A', 0.4, 0.7]]],
                piazzolla: [[[0, 'R', 0.7, 0.9], [0.75, 'R', 0.7, 0.82], [1.5, 'F', 0.4, 0.76]], [[0, 'R', 0.7, 0.9], [0.75, 'F', 0.7, 0.8], [1.5, 'A', 0.4, 0.72]]]
            },
            drums: {
                bossa: { kick: [[0, 0.8], [1.5, 0.55]], rimA: [0, 1.5], rimB: [1] },
                samba: { kick: [[0, 0.55], [1, 0.92]], rimA: [0.5, 1.5], rimB: [0.75, 1.75] },
                afro:  { kick: [[0, 0.82], [0.5, 0.55], [1.5, 0.7]], rimA: [1], rimB: [0.5, 1.5] },
                tango: { kick: [[0, 0.4]], rimA: [1], rimB: [1], rimVel: 0.2, noHat: true },
                piazzolla: { kick: [[0, 0.62], [0.75, 0.5]], rimA: [1.5], rimB: [1.25] }
            }
        },
        classic: {
            rootlessProb: 0, fillProb: 0, piano: _meterDummy, turn: _meterDummy,
            eights: [[0, 1, 2, 1], [0, 2, 1, 3], [0, 3, 1, 3], [0, 1, 2, 3], [0, 1, 2, null]],
            quarters: [[0, 2], [0, 3], [0, 1], [0, 2]],
            mixed: [[[0, 0], [1, 2], [1.5, 1]], [[0, 0], [0.5, 1], [1, 2]], [[0, 0], [1, 3], [1.5, 2]]],
            upper: [[1, 2, 3], [1, 3, 2], [2, 3, 2]],
            tail: [[1, 2], [0, 2]]
        }
    }
};

// --- Motifs ternaires : 6/8, 9/8, 12/8 ---
// En mesure composée la pulsation (le « temps » du moteur, donc le BPM) est la noire pointée : 6/8 = 2 pulsations,
// 9/8 = 3, 12/8 = 4, chacune de trois croches. Les cellules ci-dessous sont écrites en CROCHES (0 à 5 pour une
// unité « H » de deux pulsations, 0 à 2 pour une unité « P » d'une pulsation) ; la mesure est une suite d'unités :
// 6/8 = H, 9/8 = H + P, 12/8 = H + H. Les durées sont en croches. Une cellule de piano est [croche, durée, type, vélocité]
// (mêmes types qu'en 4/4), une cellule de basse [croche, degré, durée, vélocité].
const TERN_LIB = {
    swing: {   // jazz « en six » (6/8, 9/8) et shuffle / slow swing (12/8)
        rootlessProb: 0.6, fillProb: 0.45, piano: _meterDummy, turn: _meterDummy,
        H: [
            bandCell(3, [[0, 3, 'C', 0.85], [4, 2, 'S', 0.7]]),
            bandCell(3, [[2, 2, 'C', 0.8], [3, 3, 'S', 0.72]]),
            bandCell(2, [[0, 2, 'S', 0.7], [3, 3, 'C', 0.85]]),
            bandCell(2, [[1, 2, 'C', 0.8], [4, 2, 'S', 0.7]]),
            bandCell(2, [[3, 2, 'C', 0.82], [5, 1, 'S', 0.68]]),
            bandCell(2, [[0, 1, 'N', 0.62], [2, 2, 'C', 0.82], [4, 2, 'S', 0.7]]),
            bandCell(1, [[0, 6, 'C', 0.72]]),
            bandCell(1, [[0, 2, 'S', 0.6], [3, 2, 'S', 0.65]])
        ],
        Hturn: [
            bandCell(2, [[0, 3, 'C', 0.85], [3, 2, 'S', 0.7], [5, 1, 'C', 0.9]]),
            bandCell(2, [[2, 2, 'C', 0.85], [4, 1, 'S', 0.7], [5, 1, 'C', 0.92]]),
            bandCell(1, [[3, 2, 'C', 0.85], [5, 1, 'C', 0.92]])
        ],
        P: [
            bandCell(3, [[0, 2, 'C', 0.8]]),
            bandCell(2, [[2, 1, 'S', 0.7]]),
            bandCell(2, [[0, 1, 'S', 0.7], [2, 1, 'C', 0.8]]),
            bandCell(1, [[1, 2, 'C', 0.78]]),
            bandCell(1, [[0, 3, 'C', 0.7]])
        ],
        Pturn: [
            bandCell(2, [[2, 1, 'C', 0.9]]),
            bandCell(2, [[0, 2, 'S', 0.7], [2, 1, 'C', 0.92]])
        ]
    },
    pop: {     // ballade arpégée en 6/8, soul / doo-wop en 12/8 (accords en triolets), rock ternaire
        rootlessProb: 0.2, fillProb: 0.5, piano: _meterDummy, turn: _meterDummy,
        comp: {   // [croche, durée, vélocité, 'all' accord complet | 'upper' voix aiguës] ; trip = accords en triolets
            H: [
                { w: 3, hits: [[0, 3, 0.8, 'all'], [3, 2, 0.6, 'upper']] },
                { w: 2, hits: [[0, 3, 0.8, 'all'], [4, 1, 0.55, 'upper'], [5, 1, 0.55, 'upper']] },
                { w: 2, hits: [[0, 2, 0.8, 'all'], [3, 3, 0.7, 'all']] },
                { w: 1, hits: [[0, 6, 0.78, 'all']] },
                { w: 2, trip: true, hits: [[0, 1, 0.74, 'all'], [1, 1, 0.5, 'upper'], [2, 1, 0.5, 'upper'], [3, 1, 0.66, 'all'], [4, 1, 0.5, 'upper'], [5, 1, 0.5, 'upper']] },
                { w: 1, hits: [[2, 1, 0.55, 'upper'], [3, 3, 0.78, 'all'], [5, 1, 0.55, 'upper']] }
            ],
            P: [
                { w: 3, hits: [[0, 3, 0.78, 'all']] },
                { w: 2, hits: [[0, 1, 0.7, 'all'], [2, 1, 0.55, 'upper']] },
                { w: 2, trip: true, hits: [[0, 1, 0.7, 'all'], [1, 1, 0.5, 'upper'], [2, 1, 0.5, 'upper']] },
                { w: 1, hits: [[1, 2, 0.65, 'upper']] }
            ]
        },
        arp: {    // une entrée par croche : index de la voix dans l'accord (0 = grave)
            H: [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3, 2, 1], [0, 1, 2, 1, 3, 2], [0, null, 2, 3, null, 2]],
            P: [[0, 1, 2], [0, 2, 1], [0, 1, 3]]
        },
        bassCells: {
            long: {
                H: [[[0, 'R', 6, 0.85]], [[0, 'R', 4, 0.85], [4, 'F', 2, 0.7]]],
                P: [[[0, 'R', 3, 0.8]], [[0, 'F', 3, 0.7]]]
            },
            dotted: {
                H: [[[0, 'R', 3, 0.88], [3, 'F', 3, 0.7]], [[0, 'R', 3, 0.88], [3, 'F', 2, 0.7], [5, 'A', 1, 0.6]]],
                P: [[[0, 'R', 2, 0.8], [2, 'A', 1, 0.6]], [[0, 'F', 3, 0.7]]]
            },
            eighths: {
                H: [[[0, 'R', 1, 0.85], [1, 'R', 1, 0.55], [2, 'F', 1, 0.65], [3, 'R', 1, 0.7], [4, 'F', 1, 0.6], [5, 'A', 1, 0.6]],
                    [[0, 'R', 1, 0.85], [2, 'R', 1, 0.6], [3, 'F', 1, 0.7], [5, 'F', 1, 0.6]]],
                P: [[[0, 'R', 1, 0.7], [1, 'R', 1, 0.5], [2, 'A', 1, 0.6]], [[0, 'F', 1, 0.65], [1, 'F', 1, 0.5], [2, 'A', 1, 0.6]]]
            },
            melodic: {
                H: [[[0, 'R', 2, 0.85], [2, 'T', 1, 0.65], [3, 'F', 3, 0.72]], [[0, 'R', 3, 0.85], [3, 'T', 1, 0.65], [4, 'F', 2, 0.72]]],
                P: [[[0, 'F', 2, 0.72], [2, 'A', 1, 0.65]], [[0, 'T', 3, 0.7]]]
            }
        },
        drums: {  // par nombre de pulsations : grosse caisse [croche, vél.], caisse claire [croche, vél., instrument], charleston en croches (e) ou aux pulsations (p)
            2: {
                ballad: { hat: 'e', kick: [[0, 1]], snare: [[3, 0.55, 'rim']] },
                back:   { hat: 'e', kick: [[0, 1], [5, 0.55]], snare: [[3, 0.9, 'snare']] },
                drive:  { hat: 'e', kick: [[0, 1], [2, 0.7], [5, 0.75]], snare: [[3, 0.9, 'snare']] }
            },
            3: {
                ballad: { hat: 'e', kick: [[0, 1]], snare: [[6, 0.55, 'rim']] },
                back:   { hat: 'e', kick: [[0, 1], [3, 0.6]], snare: [[6, 0.85, 'snare']] },
                drive:  { hat: 'e', kick: [[0, 1], [3, 0.7], [8, 0.75]], snare: [[3, 0.5, 'snare'], [6, 0.9, 'snare']] }
            },
            4: {
                ballad: { hat: 'e', kick: [[0, 1]], snare: [[3, 0.55, 'rim'], [9, 0.55, 'rim']] },
                back:   { hat: 'e', kick: [[0, 1], [6, 0.6]], snare: [[3, 0.9, 'snare'], [9, 0.9, 'snare']] },
                drive:  { hat: 'e', kick: [[0, 1], [5, 0.7], [6, 0.8]], snare: [[3, 0.9, 'snare'], [9, 0.9, 'snare']] }
            }
        }
    },
    latin: {   // balada latine en 6 (guitare arpégée), ijexá (Afro-Brésil) et 6/8 afro-cubain (bembé)
        rootlessProb: 0, fillProb: 0.45, piano: _meterDummy, turn: _meterDummy,
        bossa: [  // d = densité ; A / B alternent d'une unité à l'autre ; PA = unité d'une pulsation
            { d: 0.2,  A: [[0, 1, 'T', 0.62], [1, 3, 'a1', 0.42], [2, 3, 'a2', 0.46], [3, 1, 't', 0.54], [4, 3, 'a3', 0.5], [5, 3, 'a2', 0.44]],
                       B: [[0, 1, 'T', 0.62], [1, 3, 'a2', 0.42], [2, 3, 'a3', 0.46], [3, 1, 't', 0.54], [4, 3, 'a1', 0.46], [5, 3, 'a3', 0.44]],
                       PA: [[0, 1, 'T', 0.6], [1, 3, 'a1', 0.42], [2, 3, 'a2', 0.46]] },
            { d: 0.4,  A: [[0, 3, 'TC', 0.74], [3, 1, 't', 0.5], [4, 1, 'U', 0.5], [5, 1, 'U', 0.46]],
                       B: [[0, 1, 'T', 0.5], [2, 1, 'U', 0.5], [3, 3, 'TC', 0.66]],
                       PA: [[0, 2, 'TC', 0.7], [2, 1, 'U', 0.5]] },
            { d: 0.6,  A: [[0, 2, 'TC', 0.78], [2, 1, 'U', 0.52], [3, 1, 'tC', 0.56], [5, 1, 'U', 0.52]],
                       B: [[0, 1, 'T', 0.5], [2, 1, 'U', 0.54], [3, 2, 'TC', 0.7], [5, 1, 'U', 0.5]],
                       PA: [[0, 1, 'TC', 0.74], [2, 1, 'U', 0.54]] },
            { d: 0.8,  A: [[0, 1, 'TC', 0.8], [1, 1, 'X', 0.3], [2, 1, 'U', 0.55], [3, 1, 'tC', 0.6], [4, 1, 'X', 0.3], [5, 1, 'U', 0.55]],
                       B: [[0, 1, 'T', 0.52], [2, 1, 'U', 0.58], [3, 1, 'TC', 0.72], [4, 1, 'X', 0.3], [5, 1, 'U', 0.52]],
                       PA: [[0, 1, 'TC', 0.76], [1, 1, 'X', 0.3], [2, 1, 'U', 0.55]] }
        ],
        samba: [  // ijexá : appuis sur le 1, le 3 et le 4 des six croches
            { d: 0.45, A: [[0, 1, 'T', 0.72], [2, 1, 'U', 0.55], [3, 1, 't', 0.64], [4, 1, 'X', 0.38], [5, 1, 'U', 0.5]],
                       PA: [[0, 1, 'T', 0.7], [2, 1, 'U', 0.54]] },
            { d: 0.6,  A: [[0, 1, 'TC', 0.76], [2, 1, 'X', 0.38], [3, 1, 't', 0.58], [4, 1, 'U', 0.52], [5, 1, 'X', 0.36]],
                       PA: [[0, 1, 'TC', 0.74], [2, 1, 'U', 0.5]] },
            { d: 0.75, A: [[0, 1, 'T', 0.72], [1, 1, 'X', 0.34], [2, 1, 'U', 0.56], [3, 1, 't', 0.64], [4, 1, 'X', 0.34], [5, 1, 'U', 0.5]],
                       PA: [[0, 1, 'T', 0.72], [1, 1, 'X', 0.34], [2, 1, 'U', 0.54]] }
        ],
        afro: [   // 6/8 afro-cubain : les deux moitiés d'une mesure se répondent (A puis B)
            { d: 0.4,  A: [[0, 1, 'T', 0.62], [2, 1, 'U', 0.55], [4, 1, 'U', 0.52], [5, 1, 'U', 0.58]],
                       B: [[1, 1, 'U', 0.5], [3, 1, 't', 0.54], [5, 1, 'U', 0.58]],
                       PA: [[0, 1, 'T', 0.6], [2, 1, 'U', 0.55]] },
            { d: 0.6,  A: [[0, 1, 'TC', 0.7], [2, 1, 'U', 0.55], [4, 1, 'U', 0.54], [5, 1, 'U', 0.58]],
                       B: [[0, 1, 'T', 0.56], [1, 1, 'U', 0.5], [3, 1, 'tC', 0.6], [5, 1, 'U', 0.58]],
                       PA: [[0, 1, 'TC', 0.68], [2, 1, 'U', 0.56]] },
            { d: 0.8,  A: [[0, 1, 'T', 0.62], [1, 3, 'a1', 0.48], [2, 3, 'a2', 0.52], [4, 3, 'a3', 0.56], [5, 3, 'a2', 0.5]],
                       B: [[1, 3, 'a2', 0.5], [2, 3, 'a3', 0.54], [3, 1, 't', 0.5], [4, 3, 'a1', 0.5], [5, 1, 'U', 0.6]],
                       PA: [[0, 1, 'T', 0.62], [1, 3, 'a2', 0.5], [2, 3, 'a3', 0.54]] }
        ],
        bassCells: {
            bossa: {
                H: [[[0, 'R', 3, 0.86], [3, 'F', 3, 0.7]], [[0, 'R', 2, 0.86], [2, 'F', 1, 0.66], [3, 'R', 2, 0.78], [5, 'A', 1, 0.64]], [[0, 'R', 6, 0.84]]],
                P: [[[0, 'R', 2, 0.8], [2, 'F', 1, 0.64]], [[0, 'R', 3, 0.8]]]
            },
            samba: {
                H: [[[0, 'R', 1, 0.82], [2, 'F', 1, 0.66], [3, 'R', 2, 0.78], [5, 'F', 1, 0.62]], [[0, 'R', 2, 0.82], [2, 'F', 1, 0.64], [3, 'F', 3, 0.76]]],
                P: [[[0, 'R', 1, 0.8], [2, 'F', 1, 0.64]], [[0, 'R', 2, 0.8], [2, 'A', 1, 0.62]]]
            },
            afro: {
                H: [[[0, 'R', 1, 0.72], [2, 'R', 2, 0.82], [5, 'F', 1, 0.7]], [[0, 'R', 1, 0.7], [2, 'R', 1, 0.8], [3, 'F', 1, 0.68], [4, 'O', 1, 0.74], [5, 'A', 1, 0.7]]],
                P: [[[0, 'R', 1, 0.7], [2, 'F', 2, 0.72]], [[0, 'R', 1, 0.7], [2, 'R', 1, 0.78]]]
            }
        },
        drums: {  // kickH / kickP : grosse caisse ; rimHA / rimHB / rimP : « cloche » au rim (croches)
            bossa: { kickH: [[0, 0.8], [3, 0.55]], kickP: [[0, 0.7]], rimHA: [0, 3], rimHB: [2, 5], rimP: [0] },
            samba: { kickH: [[0, 0.7], [3, 0.9]], kickP: [[0, 0.7]], rimHA: [2, 4], rimHB: [1, 5], rimP: [2] },
            afro:  { kickH: [[0, 0.8], [3, 0.6]], kickP: [[0, 0.7]], rimHA: [0, 2, 4, 5], rimHB: [1, 3, 5], rimP: [0, 2] }
        }
    },
    classic: { // barcarolle : arpèges en croches par groupes de trois
        rootlessProb: 0, fillProb: 0, piano: _meterDummy, turn: _meterDummy,
        eights: {
            H: [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3, 2, 1], [0, 1, 2, 1, 3, 2], [0, 3, 1, 3, 2, 3], [0, 1, 2, 3, 3, 2], [0, 1, 2, null, 2, 1]],
            P: [[0, 1, 2], [0, 2, 1], [0, 1, 3], [0, 2, 3]]
        },
        mixed: {  // [croche, voix]
            H: [[[0, 0], [2, 1], [3, 2], [4, 3]], [[0, 0], [1, 1], [3, 2], [5, 3]], [[0, 0], [3, 1], [4, 2], [5, 3]]],
            P: [[[0, 0], [2, 1]], [[0, 0], [1, 2], [2, 1]]]
        },
        upper: {  // voix aiguës sur basse tenue, à partir de la 2e croche de l'unité
            H: [[2, 3, 2, 3, 1], [3, 2, 3, 2, 1], [2, 3, 2, 1, 2]],
            P: [[2, 3], [3, 2], [1, 3]]
        },
        tail: {   // accord doux sur le 1 puis arpège à partir de la 3e croche
            H: [[2, 3, 2, 1], [1, 2, 3, 2]],
            P: [[2], [1]]
        }
    }
};
METER_LIB['6/8'] = METER_LIB['9/8'] = METER_LIB['12/8'] = TERN_LIB;

// ===== Musique cubaine : tables rythmiques (son, guajira, rumba, mambo) =====
// Positions en croches depuis le début d'un cadre : 12 croches en mesure ternaire (la cloche de bembé : 2 mesures de 6/8
// ou 1 mesure de 12/8), 16 croches en mesure binaire (2 mesures de 4/4, clave de son 3-2).
// guajeos : [croche, voix, vélocité] ; la voix est un rang dans l'accord empilé (0 fondamentale, 1 tierce, 2 quinte,
// 3 septième, 4 octave…). basse : [croche, jeton, durée en croches, vélocité] ; congas : [croche, son, vélocité].
const CUBA = (() => {
    const twice = (hits, n) => hits.concat(hits.map(h => [h[0] + n].concat(h.slice(1))));
    return {
        ternary: {
            frame: 12,
            bellVel: { 0: 0.8, 2: 0.52, 4: 0.62, 5: 0.5, 7: 0.68, 9: 0.52, 11: 0.58 },
            guajeos: [
                { d: 0.3, hits: [[0, 0, 0.82], [4, 2, 0.62], [7, 1, 0.68], [11, 3, 0.7]] },
                { d: 0.5, hits: [[0, 0, 0.82], [2, 1, 0.56], [4, 2, 0.64], [5, 1, 0.52], [7, 2, 0.68], [9, 3, 0.6], [11, 2, 0.64]] },
                { d: 0.7, hits: [[0, 0, 0.82], [2, 2, 0.58], [3, 1, 0.48], [5, 3, 0.62], [6, 2, 0.54], [7, 1, 0.68], [9, 2, 0.58], [10, 3, 0.48], [11, 2, 0.66]] },
                { d: 0.9, hits: [[0, 0, 0.82], [1, 1, 0.44], [2, 2, 0.58], [4, 3, 0.64], [5, 2, 0.54], [6, 1, 0.5], [7, 2, 0.7], [8, 3, 0.46], [9, 4, 0.6], [10, 2, 0.5], [11, 3, 0.66]] }
            ],
            bass: [
                { d: 0.3, hits: [[0, 'R', 3, 0.88], [3, 'F', 3, 0.72], [6, 'R', 3, 0.82], [9, 'F', 3, 0.7]] },
                { d: 0.55, hits: [[0, 'R', 2, 0.9], [2, 'R', 1, 0.58], [3, 'F', 2, 0.75], [5, 'N', 1, 0.64], [6, 'R', 2, 0.82], [8, 'F', 1, 0.6], [9, 'T', 2, 0.68], [11, 'N', 1, 0.66]] },
                { d: 0.8, hits: [[0, 'R', 1, 0.9], [1, 'R', 1, 0.5], [3, 'F', 1, 0.74], [4, 'O', 1, 0.62], [5, 'N', 1, 0.62], [6, 'R', 1, 0.82], [7, 'T', 1, 0.6], [9, 'F', 1, 0.76], [10, 'R', 1, 0.55], [11, 'N', 1, 0.66]] }
            ],
            congas: [
                { d: 0.3, hits: [[0, 'conga2', 0.7], [3, 'slap', 0.55], [6, 'conga2', 0.65], [9, 'slap', 0.55]] },
                { d: 0.55, hits: [[0, 'conga2', 0.75], [2, 'conga1', 0.42], [3, 'slap', 0.6], [5, 'conga1', 0.42], [6, 'conga2', 0.7], [8, 'conga1', 0.42], [9, 'slap', 0.6], [10, 'conga1', 0.42]] },
                { d: 0.8, hits: [[0, 'conga2', 0.75], [1, 'conga1', 0.35], [2, 'conga1', 0.45], [3, 'slap', 0.62], [4, 'conga1', 0.38], [5, 'conga2', 0.55], [6, 'conga2', 0.7], [7, 'conga1', 0.35], [8, 'conga1', 0.45], [9, 'slap', 0.62], [10, 'conga1', 0.38], [11, 'conga2', 0.55]] }
            ]
        },
        binary: {
            frame: 16,
            bellVel: { 0: 0.55, 2: 0.62, 4: 0.55, 6: 0.66, 8: 0.55, 10: 0.62, 12: 0.55, 14: 0.66 },
            clave: { 0: 0.62, 3: 0.56, 6: 0.66, 10: 0.56, 12: 0.66 },
            guajeos: [
                { d: 0.35, hits: [[0, 0, 0.82], [3, 2, 0.6], [6, 3, 0.66], [10, 1, 0.62], [12, 2, 0.64]] },
                { d: 0.55, hits: [[0, 0, 0.82], [2, 1, 0.5], [3, 2, 0.62], [5, 3, 0.54], [6, 2, 0.68], [8, 1, 0.5], [10, 2, 0.64], [12, 3, 0.64], [14, 1, 0.5]] },
                { d: 0.8, hits: [[0, 0, 0.82], [1, 1, 0.45], [3, 2, 0.62], [4, 3, 0.5], [6, 2, 0.68], [7, 1, 0.46], [8, 0, 0.5], [10, 3, 0.64], [11, 2, 0.46], [12, 1, 0.62], [14, 2, 0.52]] }
            ],
            bass: [
                { d: 0.3, hits: twice([[0, 'R', 2, 0.82], [4, 'F', 2, 0.72]], 8) },
                { d: 0.55, hits: twice([[3, 'R', 2, 0.88], [6, 'F', 1, 0.8], [7, 'N', 1, 0.82]], 8) },
                { d: 0.8, hits: twice([[0, 'R', 1, 0.7], [3, 'R', 2, 0.88], [5, 'O', 1, 0.62], [6, 'F', 1, 0.82], [7, 'N', 1, 0.84]], 8) }
            ],
            congas: [
                { d: 0.35, hits: twice([[3, 'conga2', 0.7], [6, 'conga2', 0.7]], 8) },
                { d: 0.55, hits: twice([[0, 'conga1', 0.35], [2, 'slap', 0.55], [3, 'conga2', 0.8], [4, 'conga1', 0.35], [6, 'conga2', 0.8], [7, 'slap', 0.4]], 8) },
                { d: 0.8, hits: twice([[0, 'conga1', 0.35], [1, 'conga1', 0.3], [2, 'slap', 0.55], [3, 'conga2', 0.8], [4, 'conga1', 0.35], [5, 'conga1', 0.3], [6, 'conga2', 0.8], [7, 'slap', 0.4]], 8) }
            ]
        }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        bandCell,
        BAND_PATTERNS,
        POP_ARP,
        POP_COMP,
        popEighths,
        POP_BASS,
        LAT_VOICE_RANGE,
        LAT_BOSSA,
        LAT_SAMBA,
        LAT_AFRO,
        LAT_TANGO,
        LAT_PIAZZOLLA,
        LAT_BASS,
        CLS_EIGHTS,
        CLS_QUARTERS,
        CLS_MIXED,
        CLS_UPPER,
        PZ_SUBJECTS,
        PZ_LYR_ARP,
        _meterDummy,
        METER_LIB,
        TERN_LIB,
        CUBA
    };
}
