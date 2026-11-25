// band/mexico-plan.js — orchestre « Mexique » de la jam, sans cuivres (ni trompettes du mariachi, ni tuba de la banda). Cinq
// rythmes, chacun avec la formation de son genre :
//   mx-jarocho   son jarocho (Veracruz) : jaranas en rasgueo (sesquiáltera 6/8 ↔ 3/4, apagones), requinto jarocho qui
//                « puntea » la mélodie, leona (basse), zapateado sur la tarima
//   mx-huapango  huapango norteño : accordéon (mélodie en tierces, adornos), bajo sexto (rasgueo et bajeos), basse électrique,
//                batterie légère ; sesquiáltera comme le son
//   mx-polka     polka norteña / corrido (2/4) : accordéon, bajo sexto sur les contretemps et ses bajeos, basse tónica-quinta,
//                batterie « boum-tchac »
//   mx-bolero    bolero romántico du trío (Los Panchos) : requinto (introductions, réponses en tierces, triolets), deux guitares
//                (pouce et accords, ou arpèges), guitarrón discret, maracas et bongó
//   mx-ranchera  canción ranchera jouée par les cordes pincées du mariachi, sans trompettes ni violons : guitarrón (basse et ses
//                bajeos), vihuela (rasgueo aigu et sec), guitare, requinto pour les adornos ; vals en 3/4, polka en 2/4, bolero
//                ranchero en 4/4
// Chargé par index.html via <script src="app/band/mexico-plan.js"> (après band/brasil-plan.js) et testé par band/mexico-plan.test.js.
//
// Fonction pure : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat        temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.density          curseur « Densité » de l'orchestre (0 à 1, 0,5 = écriture d'origine) : présence et nombre de notes de la
//                        voix qui chante (requinto ou accordéon) ; accompagnement, basse et percussions inchangés
//   env.measureInStep    rang de la mesure dans le bloc de la grille (le guitarrón alterne fondamentale et quinte)
//   env.state            mémoire entre deux mesures, modifiée en place : mxState (voicings de chaque pupitre, dernière note de la
//                        mélodie), bandLastFill (la phrase précédente finissait-elle par un roulement ?)
// buildMexicoPlan renvoie { piano, bass, drums, mexico: true } ; chaque frappe de `piano` porte `inst` : 'acc' (accordéon, avec
// son articulation `art`) ou 'gtr' (jarana, requinto, bajo sexto, vihuela, guitares : l'échantillon de nylon, avec `dir`, `roll`,
// `mute`), que le moteur aiguille (playMexicoHit).
//
// Écriture : en « cases ». Mesures de six croches (6/8, 3/4) et leurs multiples (9/8, 12/8) : une case = une croche, un cycle =
// six croches, que le rasgueo coupe en 3 + 3 (6/8) ou 2 + 2 + 2 (3/4) : la sesquiáltera des sones et des huapangos alterne les
// deux. Polka norteña : une case = une double croche, un cycle = une mesure de 2/4. Bolero et ranchera en 2/4 ou 4/4 : une case
// = une croche, un cycle = une mesure de 4/4.

if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { latBassTones, popVoicing, popBassApproach, popScaleNotes } = require('./band-helpers.js');
}
if (typeof cumbiaVoicing === 'undefined' && typeof require === 'function') {
    var { cumbiaVoicing } = require('./cumbia-plan.js');
}

const MEXICO_GROOVES = ['mx-jarocho', 'mx-huapango', 'mx-polka', 'mx-bolero', 'mx-ranchera'];
// Rythmes de l'ensemble norteño : l'accordéon chante, le bajo sexto accompagne, basse électrique et batterie
const MX_NORTENO = { 'mx-huapango': true, 'mx-polka': true };

// Rythme réellement joué selon la signature : chaque rythme garde sa formation et prend la forme qui convient à la mesure.
//   norteño : six croches (6/8, 3/4, 9/8, 12/8) → huapango ; 2/4, 4/4 → polka
//   son jarocho : six croches → son ; 2/4 → ranchera (polka) ; 4/4 → bolero
//   bolero : six croches → ranchera (vals) ; ranchera : toutes les mesures (vals, polka ou bolero ranchero)
//   aucun (Auto) : mesure composée → son jarocho ; 4/4 → bolero ; 3/4, 2/4 → ranchera
function mexicoGroove(groove, bpb, ternary) {
    const three = !!ternary || bpb === 3;
    if (groove === 'mx-huapango' || groove === 'mx-polka') return three ? 'mx-huapango' : 'mx-polka';
    if (groove === 'mx-ranchera') return 'mx-ranchera';
    if (groove === 'mx-jarocho') return three ? 'mx-jarocho' : (bpb === 4 ? 'mx-bolero' : 'mx-ranchera');
    if (groove === 'mx-bolero') return three ? 'mx-ranchera' : 'mx-bolero';
    if (ternary) return 'mx-jarocho';
    return bpb === 4 ? 'mx-bolero' : 'mx-ranchera';
}

// Grille de cases : durée d'une case (en temps du plan) et longueur d'un cycle (en cases) ; fam = tables de rythmes de la mélodie
function mxGrid(groove, bpb, ternary) {
    if (groove === 'mx-polka') return { slot: 0.25, cyc: 8, fam: 'P' };
    if (ternary) return { slot: 1 / 3, cyc: 6, fam: 'T' };
    if (bpb === 3) return { slot: 0.5, cyc: 6, fam: 'T' };
    return { slot: 0.5, cyc: 8, fam: 'B' };
}

// ---- Mélodies : rythmes d'un cycle ([case, durée en cases]) ----
const MX_RHYTHMS = {
    T: {   // six croches
        mel: [
            [[0, 2], [2, 1], [3, 2], [5, 1]],
            [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
            [[0, 2], [2, 2], [4, 2]],                              // hémiole (3/4)
            [[0, 3], [3, 2], [5, 1]],
            [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1]],
            [[1, 1], [2, 1], [3, 3]],                              // levée : le 1 est laissé à l'accompagnement
            [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1]],
            [[0, 4], [4, 1], [5, 1]]
        ],
        end: [ [[0, 3], [3, 3]], [[0, 6]], [[0, 2], [2, 4]], [[0, 1], [1, 1], [2, 4]] ],
        fill: [
            [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
            [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5], [4, 0.5], [4.5, 0.5], [5, 1]],
            [[0, 2], [2, 1], [3, 0.5], [3.5, 0.5], [4, 0.5], [4.5, 0.5], [5, 1]]
        ]
    },
    P: {   // polka : huit doubles croches
        mel: [
            [[0, 2], [2, 2], [4, 2], [6, 2]],
            [[0, 3], [3, 1], [4, 4]],
            [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]],
            [[0, 4], [4, 2], [6, 2]],
            [[0, 1], [1, 1], [2, 2], [4, 2], [6, 1], [7, 1]],
            [[2, 2], [4, 2], [6, 2]],
            [[0, 6], [6, 2]],
            [[0, 2], [2, 2], [4, 4]]
        ],
        end: [ [[0, 4], [4, 4]], [[0, 8]], [[0, 2], [2, 6]], [[0, 3], [3, 5]] ],
        fill: [   // adornos de l'accordéon : doubles croches et triolets
            [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]],
            [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]],
            [[0, 4 / 3], [4 / 3, 4 / 3], [8 / 3, 4 / 3], [4, 1], [5, 1], [6, 1], [7, 1]]
        ]
    },
    B: {   // bolero, ranchera en 2/4 ou 4/4 : huit croches
        mel: [
            [[0, 1], [1, 1], [2, 2], [4, 4]],
            [[0, 3], [3, 1], [4, 4]],
            [[0, 2], [2, 2], [4, 2], [6, 2]],
            [[1, 1], [2, 1], [3, 1], [4, 4]],
            [[0, 2 / 3], [2 / 3, 2 / 3], [4 / 3, 2 / 3], [2, 2], [4, 4]],
            [[0, 4], [4, 1], [5, 1], [6, 2]],
            [[0, 2], [2, 1], [3, 1], [4, 3], [7, 1]]
        ],
        end: [ [[0, 4], [4, 4]], [[0, 8]], [[0, 2], [2, 6]] ],
        fill: [   // triolets du requinto (Los Panchos)
            [[0, 4], [4, 2 / 3], [14 / 3, 2 / 3], [16 / 3, 2 / 3], [6, 2 / 3], [20 / 3, 2 / 3], [22 / 3, 2 / 3]],
            [[0, 2], [2, 2 / 3], [8 / 3, 2 / 3], [10 / 3, 2 / 3], [4, 2 / 3], [14 / 3, 2 / 3], [16 / 3, 2 / 3], [6, 1], [7, 1]],
            [[0, 4 / 3], [4 / 3, 4 / 3], [8 / 3, 4 / 3], [4, 2 / 3], [14 / 3, 2 / 3], [16 / 3, 2 / 3], [6, 2 / 3], [20 / 3, 2 / 3], [22 / 3, 2 / 3]]
        ]
    }
};

// Rôle de la voix chantée sur chaque quart de phrase : mel (mélodie), rest (silence : l'accompagnement seul), fill (mélodie,
// dernier cycle en adorno vers la suite), adorno (silence, puis un adorno sur le dernier cycle).
const MX_ROLES = {
    'mx-jarocho':  [['mel', 'mel', 'rest', 'fill'], ['mel', 'mel', 'mel', 'fill'], ['rest', 'mel', 'mel', 'fill'], ['mel', 'rest', 'mel', 'mel']],
    'mx-huapango': [['mel', 'mel', 'mel', 'fill'], ['mel', 'rest', 'mel', 'fill'], ['rest', 'mel', 'mel', 'fill'], ['mel', 'mel', 'rest', 'fill']],
    'mx-polka':    [['mel', 'mel', 'mel', 'fill'], ['mel', 'rest', 'mel', 'fill'], ['rest', 'mel', 'mel', 'fill'], ['mel', 'mel', 'adorno', 'fill']],
    'mx-bolero':   [['mel', 'mel', 'adorno', 'fill'], ['rest', 'adorno', 'mel', 'fill'], ['mel', 'adorno', 'rest', 'adorno'], ['adorno', 'mel', 'mel', 'fill']],
    'mx-ranchera': [['rest', 'adorno', 'rest', 'adorno'], ['mel', 'adorno', 'rest', 'adorno'], ['rest', 'mel', 'adorno', 'fill'], ['adorno', 'rest', 'adorno', 'fill']]
};

// ---- Accompagnements ----
// Jarana : [case, sens (1 descendant, -1 montant), vélocité, étouffé (apagón)]
const MX_JARANA = {
    seis:   [[0, 1, 0.92], [1, -1, 0.42], [2, 1, 0.62], [3, 1, 0.86], [4, -1, 0.42], [5, 1, 0.6]],
    tres:   [[0, 1, 0.92], [1, -1, 0.4], [2, 1, 0.82], [3, -1, 0.4], [4, 1, 0.82], [5, -1, 0.46]],
    apagon: [[0, 1, 0.92], [1, -1, 0.4], [2, 1, 0.58, 1], [3, 1, 0.86], [4, -1, 0.4], [5, 1, 0.55, 1]],
    tresap: [[0, 1, 0.92], [1, -1, 0.4], [2, 1, 0.82], [3, -1, 0.36, 1], [4, 1, 0.82], [5, -1, 0.4, 1]]
};
// Enchaînements de figures d'un cycle à l'autre (la sesquiáltera)
const MX_JARANA_SEQ = [['seis', 'tres'], ['seis', 'seis', 'seis', 'tres'], ['apagon', 'tres'], ['seis', 'tresap'], ['tres', 'tres', 'seis', 'seis'], ['apagon', 'seis', 'apagon', 'tres']];
// Bajo sexto du huapango : [case, b (basse) | c (accord), sens, vélocité, étouffé]
const MX_SEXTO_T = {
    seis:   [[0, 'b', 1, 0.78], [1, 'c', -1, 0.42], [2, 'c', 1, 0.62], [3, 'b', 1, 0.7], [4, 'c', -1, 0.42], [5, 'c', 1, 0.6]],
    tres:   [[0, 'b', 1, 0.78], [1, 'c', -1, 0.4], [2, 'c', 1, 0.72], [3, 'c', -1, 0.4], [4, 'c', 1, 0.72], [5, 'c', -1, 0.42]],
    apagon: [[0, 'b', 1, 0.78], [1, 'c', -1, 0.4], [2, 'c', 1, 0.58, 1], [3, 'b', 1, 0.7], [4, 'c', -1, 0.4], [5, 'c', 1, 0.56, 1]]
};
// Guitares du trío (bolero, huit croches) : b = pouce (R fondamentale, F quinte), c = accord, a = note d'arpège (rang dans le voicing)
const MX_BOLERO_GTR = {
    clasico: [[0, 'b', 'R', 0.7], [2, 'c', 1, 0.55], [3, 'c', -1, 0.4], [4, 'b', 'F', 0.64], [6, 'c', 1, 0.55], [7, 'c', -1, 0.36]],
    arpegio: [[0, 'b', 'R', 0.66], [1, 'a', 0, 0.42], [2, 'a', 1, 0.46], [3, 'a', 2, 0.52], [4, 'b', 'F', 0.6], [5, 'a', 2, 0.46], [6, 'a', 1, 0.42], [7, 'a', 0, 0.4]],
    rasgueo: [[0, 'b', 'R', 0.7], [1, 'c', -1, 0.34], [2, 'c', 1, 0.56], [4, 'b', 'F', 0.64], [5, 'c', -1, 0.34], [6, 'c', 1, 0.56], [7, 'c', -1, 0.34]]
};
// Ranchera : guitarrón (basse), vihuela (v : rasgueo aigu, [case, sens, vélocité]) et guitare (g : accords du médium) selon la mesure
const MX_RANCHERA = {
    vals:   { bass: [0], walk: [2, 4], v: [[2, 1, 0.66], [3, -1, 0.4], [4, 1, 0.62], [5, -1, 0.36]], g: [2, 4] },
    polka:  { bass: [0, 2], walk: [3], v: [[1, 1, 0.66], [3, 1, 0.6]], g: [1, 3] },
    bolero: { bass: [0, 4], walk: [6, 7], v: [[2, 1, 0.64], [3, -1, 0.38], [6, 1, 0.62], [7, -1, 0.36]], g: [2, 6] }
};

// Registres (hauteurs écrites relatives au do3 des instruments d'harmonie ; transOffset ramène aux hauteurs réelles)
const MX_RANGES = {
    jarana: { lo: 10, hi: 25, centre: 17, soft: 22 },
    jarana2: { lo: 4, hi: 19, centre: 11, soft: 16 },
    sexto: { lo: 0, hi: 14, centre: 7, soft: 11 },
    gtr: { lo: 2, hi: 17, centre: 9, soft: 14 },
    vihuela: { lo: 12, hi: 26, centre: 19, soft: 23 }
};
// Registre de la voix chantée (réel) : requinto jarocho, accordéon, requinto du trío et de la ranchera
const MX_LEAD = { 'mx-jarocho': [14, 33], 'mx-huapango': [12, 29], 'mx-polka': [12, 29], 'mx-bolero': [12, 31], 'mx-ranchera': [14, 31] };
// Doublure à la tierce inférieure (les mélodies norteñas et les requintos du trío chantent en tierces)
const MX_THIRDS = { 'mx-jarocho': 0.12, 'mx-huapango': 0.6, 'mx-polka': 0.6, 'mx-bolero': 0.42, 'mx-ranchera': 0.5 };

const mxPick = (rng, opts) => {
    const tot = opts.reduce((a, o) => a + o[1], 0);
    let r = rng() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[opts.length - 1][0];
};
const mxNear = (x) => Math.abs(x - Math.round(x)) < 1e-6;

// Choix faits une fois par phrase (gardés pendant toute la phrase).
function mexicoPhraseExtras(groove, ph, rng) {
    const idx = Number.isInteger(ph.index) ? ph.index : 0;
    // énergie de la phrase : arc de quatre phrases (la quatrième monte), un peu de hasard
    const I = Math.max(0.15, Math.min(1, 0.32 + 0.42 * rng() + (idx % 4 === 3 ? 0.16 : 0) - (idx === 0 ? 0.12 : 0)));
    const out = { groove, intensity: I, fill: rng() < 0.6, flip: rng() < 0.3, anticip: 0.15 + 0.25 * I };
    out.roles = MX_ROLES[groove][Math.floor(rng() * MX_ROLES[groove].length)];
    out.contours = [0, 1, 2, 3].map(() => mxPick(rng, [['down', 2], ['arch', 2], ['up', 1.2], ['valley', 1], ['neighbor', 1.2], ['repeat', 0.6]]));
    out.orn = 0.1 + 0.2 * rng();
    if (groove === 'mx-jarocho') {
        out.seq = MX_JARANA_SEQ[Math.floor(rng() * MX_JARANA_SEQ.length)];
        out.jarana2 = I > 0.5 && rng() < 0.75;             // une deuxième jarana double les coups accentués
        out.zap = idx === 0 ? 0.5 : 0.75 + 0.35 * I;         // présence du zapateado (discret à l'entrée)
        out.leona = rng() < 0.45 ? 'sync' : 'base';
    } else if (groove === 'mx-huapango') {
        out.seq = mxPick(rng, [[['seis', 'tres'], 2], [['seis', 'seis', 'apagon', 'tres'], 1.5], [['tres', 'seis'], 1], [['apagon', 'tres'], 1]]);
        out.bajeo = 0.45 + 0.3 * I;
        out.pad = rng() < 0.6;
        out.ride = I > 0.7 && rng() < 0.5;
    } else if (groove === 'mx-polka') {
        out.chucu = 0.15 + 0.35 * I;                         // petit coup remonté du bajo sexto en double croche
        out.bajeo = 0.4 + 0.35 * I;
        out.ghosts = I > 0.45 && rng() < 0.7;
        out.pad = rng() < 0.5;
        out.walk = rng() < 0.35 + 0.3 * I;                   // la basse marche vers l'accord suivant
    } else if (groove === 'mx-bolero') {
        out.gtr = mxPick(rng, I < 0.45 ? [['arpegio', 3], ['clasico', 2], ['rasgueo', 0.6]] : [['clasico', 3], ['rasgueo', 1.5], ['arpegio', 1.5]]);
        out.perc = idx > 0 || rng() < 0.4;                   // maracas et bongó entrent après l'introduction
        out.bongo = I > 0.4 && rng() < 0.8;
    } else if (groove === 'mx-ranchera') {
        out.walk = 0.45 + 0.35 * I;                          // bajeos du guitarrón aux changements d'accord
        out.vihUp = I > 0.4;                                 // coups remontés de la vihuela
    }
    return out;
}

// Note voisine dans la gamme de l'accord : `steps` degrés plus haut (positif) ou plus bas (négatif), ou null.
function mxScaleStep(cs, n, steps) {
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

// Ligne mélodique d'un cycle : `rhythm` = [[case, durée en cases]…], `csOf(case)` = accord sous la case, `contour` = down | up |
// arch | valley | neighbor | repeat. Mouvement surtout conjoint dans la gamme, quelques tierces ; les appuis (o.strong(case))
// tombent sur une note de l'accord ; `land` : la dernière note se pose sur une note de l'accord visé (`target`, sinon l'accord en
// cours). o = { slot, strong, lo, hi } (lo, hi en hauteurs réelles). Renvoie [{ k, p, d, n, peak }] (p, d en temps, liées).
function mxLine(env, csOf, target, from, rhythm, contour, rng, land, o) {
    const off = env.transOffset;
    const LO = o.lo - off, HI = o.hi - off;
    const cs = (k) => typeof csOf === 'function' ? csOf(k) : csOf;
    const pcsOf = (c) => env.findChordObj(c.chordId).notes.slice(0, 4).map(x => (((c.rootIndex + x) % 12) + 12) % 12);
    const isCT = (c, n) => pcsOf(c).includes(((n % 12) + 12) % 12);
    const nearestCT = (c, n) => {
        for (let d = 0; d <= 6; d++) for (const sg of [-1, 1]) { const x = n + sg * d; if (x >= LO && x <= HI && isCT(c, x)) return x; }
        return n;
    };
    const mid = Math.round((LO + HI) / 2);
    let n = Number.isFinite(from) && from >= LO && from <= HI ? from : nearestCT(cs(rhythm[0][0]), mid);
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
        else dir = idx % 3 === 2 ? -1 : 0;
        // la ligne ne s'écrase pas sur les bords du registre : elle repart dans l'autre sens
        if (dir > 0 && n >= HI - 2) dir = -1;
        if (dir < 0 && n <= LO + 2) dir = 1;
        if (idx > 0 || !Number.isFinite(from)) {
            if (dir !== 0) {
                const leap = rng() < 0.2 ? 2 : 1;
                const nx = mxScaleStep(c, n, dir * leap);
                n = (nx !== null && nx >= LO && nx <= HI) ? nx : (mxScaleStep(c, n, -dir) ?? n);
            }
        } else if (dir !== 0) {
            const nx = mxScaleStep(c, n, dir);
            if (nx !== null && nx >= LO && nx <= HI) n = nx;
        }
        if (o.strong(k) && !isCT(c, n)) n = nearestCT(c, n);
        if (land && idx === N - 1) {
            const t = target || c;
            if (!isCT(t, n)) n = nearestCT(t, n);
        }
        if (n > peakVal) { peakVal = n; peakIdx = idx; }
        out.push({ k, p: k * o.slot, d: 0, n, len });
    });
    out.forEach((nt, idx) => {
        const nx = out[idx + 1];
        nt.d = nx ? (nx.p - nt.p) + 0.03 : nt.len * o.slot + 0.03;
        nt.peak = idx === peakIdx;
        delete nt.len;
    });
    return out;
}

// Curseur « Densité » appliqué à un rythme de mélodie : en dessous de 0,5 les notes brèves des temps faibles disparaissent (la
// précédente dure d'autant) ; au-dessus, les notes longues se coupent en deux (une note de passage s'ajoute).
function mxDensify(rhythm, d, rng, strong) {
    if (!Number.isFinite(d) || Math.abs(d - 0.5) < 0.02) return rhythm;
    let out = rhythm.map(x => x.slice());
    if (d < 0.5) {
        const pDrop = (0.5 - d) * 1.7;
        const kept = [];
        out.forEach((x, idx) => {
            if (idx > 0 && !strong(x[0]) && x[1] <= 1.01 && rng() < pDrop) { kept[kept.length - 1][1] += x[1]; return; }
            kept.push(x);
        });
        out = kept;
    } else {
        const pSplit = (d - 0.5) * 1.5;
        const res = [];
        out.forEach(x => {
            if (x[1] >= 2 - 1e-6 && rng() < pSplit) { const h = x[1] / 2; res.push([x[0], h], [x[0] + h, h]); }
            else res.push(x);
        });
        out = res;
    }
    return out;
}

// Bajeo (bajo sexto, guitarrón) : `len` notes conjointes dans la gamme de l'accord en cours qui mènent à la basse de l'accord
// suivant, la dernière souvent chromatique. Hauteurs dans le registre de la basse (latBassTones). Renvoie les notes, ou [].
function mxWalk(env, cs, nextCs, len, rng) {
    const off = env.transOffset;
    const target = latBassTones(env, nextCs).root;
    const S = popScaleNotes(cs, target - 14, target + 14);
    let up;
    if (target + off <= -6) up = false;
    else if (target + off >= 1) up = true;
    else up = rng() < 0.6;
    const line = (u) => u ? S.filter(n => n < target).slice(-len) : S.filter(n => n > target).slice(0, len).reverse();
    const fits = (ns) => ns.length === len && !ns.some(n => n + off < -13 || n + off > 9);
    let notes = line(up);
    if (!fits(notes)) { up = !up; notes = line(up); }
    if (!fits(notes)) return [];
    const lastChrom = up ? target - 1 : target + 1;
    if (rng() < (up ? 0.5 : 0.3) && !notes.includes(lastChrom)) notes[notes.length - 1] = lastChrom;
    return notes;
}

function buildMexicoPlan(env, groove0, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const groove = mexicoGroove(groove0, bpb, ternary);
    const rng = ph.rng;
    if (!ph.mex || ph.mex.groove !== groove) ph.mex = mexicoPhraseExtras(groove, ph, rng);
    const mx = ph.mex;
    const I = mx.intensity;
    const prog = L > 1 ? i / (L - 1) : 0;
    const off = env.transOffset;
    const { slot, cyc, fam } = mxGrid(groove, bpb, ternary);
    const nS = Math.max(1, Math.round(bpb / slot));
    const unitsPerBar = Math.max(1, Math.ceil(nS / cyc));
    const density = Number.isFinite(env.density) ? env.density : 0.5;
    const splitAt = env.splitBeat || bpb / 2;
    const st = env.state.mxState && env.state.mxState.groove === groove ? env.state.mxState : { groove, lanes: {} };
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const aPos = bpb - slot;
    const anticip = changeNext && groove !== 'mx-ranchera' && rng() < mx.anticip;
    const segAt = (p) => (halves && p >= splitAt - 1e-6) ? segs[1] : segs[0];
    const csAt = (p) => (anticip && p >= aPos - 1e-6) ? nextStep : segAt(p).cs;
    const followOf = (sg) => { const k = segs.indexOf(sg); return k < segs.length - 1 ? segs[k + 1].cs : (changeNext ? nextStep : null); };
    const endOf = (p) => {
        if (anticip && p >= aPos - 1e-6) return bpb + 1;
        if (halves && p < splitAt - 1e-6) return splitAt + 0.03;
        return (anticip ? aPos : bpb) + 0.06;
    };
    // index dans le cycle (bolero en 2/4 : une mesure sur deux reprend la seconde moitié du cycle de 4/4)
    const kk = (k) => (fam === 'B' && nS < cyc && m % 2 === 1) ? (k + nS) % cyc : k % cyc;
    const P = (k) => k * slot;
    const doFill = isTurn && mx.fill;
    const fillFrom = doFill ? Math.max(0, bpb - 1) : 99;   // roulement sur le dernier temps (la dernière pulsation en 6/8)
    const strong = fam === 'T' ? (k) => mxNear(k) && Math.round(k) % 3 === 0 : (fam === 'P' ? (k) => mxNear(k) && Math.round(k) % 4 === 0 : (k) => mxNear(k) && Math.round(k) % 2 === 0);

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
    const topN = (cs, V, n) => {
        const t = V.filter(x => (((x - cs.rootIndex) % 12) + 12) % 12 !== 0);
        const src = t.length >= Math.min(n, 3) ? t : V;
        return src.length > n ? src.slice(-n) : src.slice();
    };
    const vOf = (lane, range) => (cs) => voice(lane, cs, prev => popVoicing(env, cs, prev, range));
    const jarOf = vOf('jar', MX_RANGES.jarana), jar2Of = vOf('jar2', MX_RANGES.jarana2);
    const sexOf = vOf('sexto', MX_RANGES.sexto), gtrOf = vOf('gtr', MX_RANGES.gtr);
    const vihOf = (cs) => topN(cs, vOf('vih', MX_RANGES.vihuela)(cs), 3);
    const accOf = (cs) => voice('acc', cs, prev => cumbiaVoicing(env, cs, prev));
    const bassOf = (cs) => latBassTones(env, cs);

    const harm = [];
    const hv = (0.72 + 0.3 * I) * (0.93 + 0.07 * prog);
    // frappe d'harmonie : o.inst 'gtr' (défaut) ou 'acc' ; o.art (accordéon), o.dir, o.roll, o.mute, o.gain, o.free (durée libre)
    const pushH = (p, dur, notes, vel, o = {}) => {
        const sorted = notes.slice().sort((a, b) => a - b).filter((n, k, arr) => k === 0 || n !== arr[k - 1]);
        if (!sorted.length || p >= bpb - 1e-6 || p < -1e-6) return;
        const n = sorted.length;
        const inst = o.inst || 'gtr';
        const e = {
            pos: p,
            dur: Math.max(o.mute ? 0.05 : 0.08, o.free ? dur : Math.min(dur, endOf(p) - p)),
            vel: Math.max(0.06, Math.min(1, vel * hv * (0.94 + rng() * 0.12))),
            rootIndex: 0, intervals: sorted, inst,
            noteVels: sorted.map((_, k) => n === 1 ? 1 : (k === n - 1 ? 1 : 0.84))
        };
        if (inst === 'acc') e.art = o.art || 'lin';
        else {
            e.dir = o.dir || 1;
            e.roll = n > 1 ? (o.roll !== undefined ? o.roll : 0.008 + rng() * 0.006) : 0;
            e.lay = 0.002 + rng() * 0.006 + (o.lay || 0);
            if (o.mute) e.mute = true;
        }
        if (o.gain && o.gain !== 1) e.gainMul = o.gain;
        harm.push(e);
    };
    const bass = [];
    const bvel = (v) => Math.min(1, v * (0.82 + 0.22 * I) * (0.93 + 0.07 * prog));
    const pushB = (p, abs, dur, v, gain) => {
        if (p >= bpb - 1e-6) return;
        const b = { pos: p, abs, dur, vel: bvel(v), wide: true };
        if (gain && gain !== 1) b.gainMul = gain;
        bass.push(b);
    };
    const drums = [];
    const dv = (0.72 + 0.3 * I) * (0.92 + 0.08 * prog);
    const add = (p, drum, vel, orn) => {
        if (p >= fillFrom - 1e-6 || p >= bpb - 1e-6) return;
        const e = { pos: p, drum, vel: Math.max(0.04, Math.min(1, vel * dv * (0.93 + rng() * 0.14))), lay: 0 };
        if (orn) e.orn = true;
        drums.push(e);
    };
    const pushF = (p, drum, v) => { if (p < bpb - 1e-6) drums.push({ pos: p, drum, vel: Math.max(0.05, Math.min(1, v * dv)), lay: 0 }); };
    const resolveAfterFill = i === 0 && env.state.bandLastFill;
    env.state.bandLastFill = false;
    if (isTurn) env.state.bandLastFill = doFill;

    // ---- note de basse d'un token : R fondamentale, F quinte, O octave, A approche de l'accord suivant ----
    const bassTok = (p, tok, near) => {
        const sg = segAt(p);
        const T = bassOf(sg.cs);
        if (Math.abs(sg.s - p) < 1e-6) return T.root;
        if (tok === 'F') return T.fifth;
        if (tok === 'O') return T.octave;
        if (tok === 'A') {
            const follow = followOf(sg);
            return (follow && p >= sg.e - near) ? popBassApproach(env, T.root, follow, rng) : T.fifth;
        }
        return T.root;
    };

    // ======================= VOIX CHANTÉE (requinto ou accordéon) =======================
    const units = L * unitsPerBar;
    const leadAcc = !!MX_NORTENO[groove];
    const [loL, hiL] = MX_LEAD[groove];
    const roleOf = (u) => {
        let r = mx.roles[Math.floor(u * 4 / Math.max(1, units))] || 'mel';
        const q = Math.floor(u * 4 / Math.max(1, units));
        const lastOfQuarter = Math.floor((u + 1) * 4 / Math.max(1, units)) !== q || u === units - 1;
        // densité : la voix se tait plus souvent (en dessous de 0,5) ou chante davantage (au-dessus)
        const h = ((u * 2654435761) >>> 0) % 1000 / 1000;   // tirage stable pour un cycle donné (indépendant de l'ordre des appels)
        if (r === 'mel' && density < 0.5 && h < (0.5 - density) * 1.3) r = 'rest';
        if ((r === 'rest' || r === 'adorno') && density > 0.5 && h < (density - 0.5) * 1.3) r = 'mel';
        if (r === 'fill') return lastOfQuarter ? 'fill' : 'mel';
        if (r === 'adorno') return lastOfQuarter ? 'fill' : 'rest';
        return r;
    };
    if (!mx.rh) mx.rh = {};
    const rhythmFor = (u, avail) => {
        if (mx.rh[u]) return mx.rh[u];
        const role = roleOf(u);
        const tab = MX_RHYTHMS[fam];
        const end = u === units - 1 && role !== 'fill';
        const pool = role === 'fill' ? tab.fill : (end ? tab.end : tab.mel);
        let idx = Math.floor(rng() * pool.length);
        const prev = mx.rh[u - 1];
        if (prev && prev.pool === pool && prev.idx === idx && pool.length > 1) idx = (idx + 1 + Math.floor(rng() * (pool.length - 1))) % pool.length;
        let rhythm = pool[idx].filter(([k]) => k < avail - 1e-6).map(([k, len]) => [k, Math.min(len, avail - k)]);
        if (role !== 'fill') rhythm = mxDensify(rhythm, density, rng, strong);
        mx.rh[u] = { pool, idx, rhythm, role };
        return mx.rh[u];
    };
    const thirdsP = MX_THIRDS[groove];
    for (let c = 0; c < unitsPerBar; c++) {
        const u = i * unitsPerBar + c;
        const c0k = c * cyc;
        const avail = Math.min(cyc, nS - c0k);
        if (avail <= 0) break;
        const role = roleOf(u);
        const lastUnit = c === unitsPerBar - 1;
        const toNext = lastUnit && changeNext ? nextStep : null;
        const phraseEnd = u === units - 1;
        if (role === 'rest') {
            // accordéon : une nappe douce au soufflet quand il ne chante pas
            if (leadAcc && mx.pad && rng() < 0.7) {
                const p = P(c0k);
                const V = accOf(segAt(p).cs);
                pushH(p, avail * slot * 0.95, V.slice(-2), 0.3, { inst: 'acc', art: 'pad' });
            }
            continue;
        }
        const R0 = rhythmFor(u, avail);
        if (!R0.rhythm.length) continue;
        const fill = R0.role === 'fill';
        const contour = fill ? (rng() < 0.6 ? 'down' : 'up') : mx.contours[u % mx.contours.length];
        const from = st.lanes.mel ? st.lanes.mel.n : null;
        const csK = (k) => csAt(P(c0k + k));
        const target = toNext || (phraseEnd ? csK(avail - 1) : null);
        const line = mxLine(env, csK, target, from, R0.rhythm, contour, rng, phraseEnd || !!toNext, { slot, strong, lo: loL, hi: hiL });
        line.forEach((nt, k) => {
            const p = P(c0k) + nt.p;
            const isStrong = strong(nt.k);
            const notes = [nt.n];
            const tp = fill ? Math.min(0.85, thirdsP + 0.2) : thirdsP;
            if (rng() < tp * (isStrong ? 1 : 0.65)) {
                const lo = mxScaleStep(csK(nt.k), nt.n, -2);
                if (lo !== null) notes.unshift(lo);
            }
            const last = k === line.length - 1;
            const vel = (isStrong ? 0.66 : 0.56) + (nt.peak ? 0.06 : 0) + (last && phraseEnd ? 0.04 : 0);
            // petite note d'ornement juste avant une note longue (la note du dessus)
            if (isStrong && nt.d >= 2 * slot && p >= 0.08 && rng() < mx.orn) {
                const up = mxScaleStep(csK(nt.k), nt.n, 1);
                if (up !== null) pushH(p - 0.06, 0.07, [up], 0.4, leadAcc ? { inst: 'acc', art: 'orn', free: true } : { free: true, gain: 0.9 });
            }
            if (leadAcc) {
                const d = last ? Math.max(0.1, nt.d) : nt.d;
                pushH(p, d, notes, vel, { inst: 'acc', art: fill && nt.d < 1.2 * slot ? 'run' : 'lin', free: last && !toNext });
            } else {
                // requinto : cordes pincées au médiator (jarocho : notes vives) ou aux doigts (trío, ranchera : un peu plus liées)
                const ring = groove === 'mx-jarocho' ? Math.min(nt.d, slot * 1.4) : Math.min(nt.d + slot * 0.4, slot * 3.5);
                pushH(p, Math.max(0.09, ring), notes, vel + 0.04, { dir: 1, roll: 0.004, gain: groove === 'mx-jarocho' ? 1.05 : 1 });
            }
        });
        if (line.length) st.lanes.mel = { n: line[line.length - 1].n };
    }

    // ======================= SON JAROCHO =======================
    if (groove === 'mx-jarocho') {
        for (let c = 0; c < unitsPerBar; c++) {
            const c0k = c * cyc;
            const avail = Math.min(cyc, nS - c0k);
            const fig = mx.seq[(m * unitsPerBar + c + (mx.flip ? 1 : 0)) % mx.seq.length];
            const tres = fig === 'tres' || fig === 'tresap';
            MX_JARANA[fig].forEach(([k, dir, v, mute]) => {
                if (k >= avail) return;
                const p = P(c0k + k);
                if (k > 0 && !mute && v < 0.5 && rng() < 0.08 * (1.2 - I)) return;
                const cs = csAt(p);
                pushH(p, mute ? 0.06 : slot * (dir > 0 ? 1.7 : 1.1), jarOf(cs), v, { dir, roll: dir > 0 ? 0.014 : 0.009, mute: !!mute, gain: 0.82 });
                if (mx.jarana2 && v >= 0.8 && !mute) pushH(p, slot * 1.6, jar2Of(cs), v * 0.62, { dir, roll: 0.018, gain: 0.7, lay: 0.008 });
            });
            // leona : notes graves pincées, souvent à contretemps
            const pat = tres ? [[0, 'R', 1.8, 0.84], [2, 'F', 1.8, 0.72], [4, 'O', 1.6, 0.66]]
                : (mx.leona === 'sync' ? [[0, 'R', 1.4, 0.8], [2, 'F', 0.9, 0.66], [3, 'R', 1.8, 0.74], [5, 'A', 0.9, 0.6]]
                    : [[0, 'R', 2.6, 0.84], [3, 'F', 1.6, 0.7], [5, 'A', 0.9, 0.56]]);
            pat.forEach(([k, tok, d, v]) => {
                if (k >= avail) return;
                const p = P(c0k + k);
                pushB(p, bassTok(p, tok, 2 * slot), d * slot, v, 1.05);
            });
            // zapateado sur la tarima : talon (grave) et pointe
            const zap = tres ? [[0, 'cajonb', 0.68], [1, 'cajont', 0.26], [2, 'cajonb', 0.52], [3, 'cajont', 0.26], [4, 'cajonb', 0.52], [5, 'cajont', 0.3]]
                : [[0, 'cajonb', 0.7], [1, 'cajont', 0.28], [2, 'cajont', 0.38], [3, 'cajonb', 0.62], [4, 'cajont', 0.28], [5, 'cajont', 0.42]];
            zap.forEach(([k, drum, v]) => { if (k < avail && (k === 0 || rng() < 0.92)) add(P(c0k + k), drum, v * mx.zap, drum === 'cajont' && v < 0.3); });
            // redoble entre deux coups quand la danse s'anime
            if (I > 0.6 && rng() < 0.4) add(P(c0k + 5) - slot / 2, 'cajont', 0.22 * mx.zap, true);
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].pos >= aPos - 1e-6 && harm[k].intervals.length > 2) harm.splice(k, 1);
            pushH(aPos, slot * 2.2, jarOf(nextStep), 0.7, { dir: 1, roll: 0.014, gain: 0.82 });
        }
        if (resolveAfterFill) drums.push({ pos: 0, drum: 'cajonb', vel: 0.8 * dv, lay: 0 });
        if (doFill) {
            const b = fillFrom, n = Math.round((bpb - b) / (slot / 2));
            for (let k = 0; k < n; k++) pushF(b + k * slot / 2, k % 3 === 0 ? 'cajonb' : 'cajont', (0.3 + 0.35 * k / Math.max(1, n - 1)) * mx.zap);
        }
    }

    // ======================= HUAPANGO NORTEÑO =======================
    if (groove === 'mx-huapango') {
        let runFrom = 99;
        // bajeo du bajo sexto vers l'accord suivant, sur les trois dernières croches
        if (changeNext && rng() < (isTurn ? Math.min(0.95, mx.bajeo + 0.25) : mx.bajeo) && !(halves && bpb - 3 * slot <= splitAt + 1e-6)) {
            const notes = mxWalk(env, lastSeg.cs, nextStep, 3, rng);
            if (notes.length) {
                runFrom = bpb - 3 * slot;
                notes.forEach((n, k) => pushH(runFrom + k * slot, slot * 1.1, [n], 0.56 + 0.06 * k, { dir: 1, roll: 0, gain: 1.05 }));
            }
        }
        for (let c = 0; c < unitsPerBar; c++) {
            const c0k = c * cyc;
            const avail = Math.min(cyc, nS - c0k);
            const fig = mx.seq[(m * unitsPerBar + c + (mx.flip ? 1 : 0)) % mx.seq.length];
            const tres = fig === 'tres';
            MX_SEXTO_T[fig].forEach(([k, kind, dir, v, mute]) => {
                if (k >= avail) return;
                const p = P(c0k + k);
                if (p >= runFrom - 1e-6) return;
                const sg = segAt(p);
                if (kind === 'b') {
                    const T = bassOf(sg.cs);
                    const first = Math.abs(sg.s - p) < 1e-6;
                    pushH(p, slot * 1.4, [k === 0 || first ? T.root : T.fifth], v, { dir: 1, roll: 0, gain: 1.05 });
                } else pushH(p, mute ? 0.06 : slot * (dir > 0 ? 1.5 : 1), sexOf(csAt(p)), v, { dir, roll: dir > 0 ? 0.016 : 0.01, mute: !!mute, gain: 0.85 });
            });
            // basse électrique
            const pat = tres ? [[0, 'R', 1.6, 0.84], [2, 'F', 1.4, 0.72], [4, 'O', 1.4, 0.68]] : [[0, 'R', 2.6, 0.84], [3, 'F', 2.2, 0.76], [5, 'A', 0.9, 0.58]];
            pat.forEach(([k, tok, d, v]) => {
                if (k >= avail) return;
                if (tok === 'A' && !(changeNext && c === unitsPerBar - 1)) return;
                const p = P(c0k + k);
                pushB(p, bassTok(p, tok, 2 * slot), d * slot, v);
            });
            // batterie légère : grosse caisse sur les appuis, caisse claire douce, charleston (ou ride) en croches
            for (let k = 0; k < avail; k++) add(P(c0k + k), mx.ride ? 'ride' : 'hat', (k % 3 === 0 ? 0.3 : 0.2) * (mx.ride ? 0.75 : 1), k % 3 !== 0);
            if (tres) { add(P(c0k), 'kick', 0.74); [2, 4].forEach(k => { if (k < avail) add(P(c0k + k), 'snare', 0.4); }); }
            else { add(P(c0k), 'kick', 0.76); if (avail > 3) add(P(c0k + 3), 'kick', 0.56); [2, 5].forEach(k => { if (k < avail) add(P(c0k + k), k === 5 ? 'snare' : 'rim', k === 5 ? 0.42 : 0.3); }); }
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].pos >= aPos - 1e-6 && harm[k].intervals.length > 2) harm.splice(k, 1);
            if (runFrom > aPos) pushH(aPos, slot * 2, sexOf(nextStep), 0.66, { dir: 1, roll: 0.016, gain: 0.85 });
        }
        if (resolveAfterFill) drums.push({ pos: 0, drum: 'crash', vel: 0.4 * dv, lay: 0 });
        if (doFill) {
            const b = fillFrom, n = Math.round((bpb - b) / slot);
            const seq = ['snare', 'snare', 'tom1', 'tom2', 'tom3', 'snare'];
            for (let k = 0; k < n; k++) pushF(b + k * slot, seq[Math.floor(k * seq.length / n)], 0.42 + 0.3 * k / Math.max(1, n - 1));
            pushF(b, 'kick', 0.6);
        }
    }

    // ======================= POLKA NORTEÑA =======================
    if (groove === 'mx-polka') {
        const beats = Math.round(nS / 4);
        let runFrom = 99;
        // bajeo : la dernière noire passe en notes conjointes vers l'accord suivant (croches, ou doubles croches au tour de phrase)
        if (changeNext && rng() < (isTurn ? Math.min(0.95, mx.bajeo + 0.25) : mx.bajeo) && !(halves && bpb - 1 <= splitAt + 1e-6)) {
            const sixteenths = isTurn && rng() < 0.6;
            const len = sixteenths ? 4 : 2;
            const notes = mxWalk(env, lastSeg.cs, nextStep, len, rng);
            if (notes.length) {
                runFrom = bpb - 1;
                const stp = sixteenths ? slot : 2 * slot;
                notes.forEach((n, k) => pushH(runFrom + k * stp, stp * 1.1, [n], 0.56 + 0.05 * k, { dir: 1, roll: 0, gain: 1.05 }));
            }
        }
        for (let b = 0; b < beats; b++) {
            const p0 = b;
            // bajo sexto : l'accord sur le contretemps (« tchac »), parfois un petit coup remonté juste après
            if (p0 + 0.5 < runFrom - 1e-6) {
                pushH(p0 + 0.5, 0.32, sexOf(csAt(p0 + 0.5)), 0.6, { dir: 1, roll: 0.012, gain: 0.85 });
                if (rng() < mx.chucu) pushH(p0 + 0.75, 0.12, sexOf(csAt(p0 + 0.75)).slice(-3), 0.34, { dir: -1, roll: 0.006, gain: 0.8 });
            }
            // basse : tónica sur le temps 1, quinte sur le temps 2 (oom-pah)
            const sg = segAt(p0);
            const T = bassOf(sg.cs);
            const first = Math.abs(sg.s - p0) < 1e-6;
            let abs = (b % 2 === 0 || first) ? T.root : T.fifth;
            if (b === beats - 1 && changeNext && mx.walk && !first) abs = popBassApproach(env, T.root, nextStep, rng);
            pushB(p0, abs, 0.5, b % 2 === 0 ? 0.86 : 0.76);
            if (b === beats - 1 && changeNext && mx.walk && rng() < 0.5) pushB(p0 + 0.5, popBassApproach(env, T.root, nextStep, rng), 0.45, 0.6);
            // batterie : grosse caisse sur les temps, caisse claire et charleston sur les contretemps
            add(p0, 'kick', b % 2 === 0 ? 0.82 : 0.72);
            add(p0, 'hat', 0.16, true);
            add(p0 + 0.5, 'snare', 0.5);
            add(p0 + 0.5, 'hat', 0.34);
            if (mx.ghosts && rng() < 0.5 * I) add(p0 + 0.75, 'ghost', 0.16, true);
        }
        if (anticip && runFrom > aPos) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].pos >= aPos - 1e-6 && harm[k].intervals.length > 2) harm.splice(k, 1);
            pushH(aPos, 0.4, sexOf(nextStep), 0.6, { dir: 1, roll: 0.012, gain: 0.85 });
        }
        if (resolveAfterFill) drums.push({ pos: 0, drum: 'crash', vel: 0.42 * dv, lay: 0 });
        if (doFill) {
            const b = fillFrom;
            [0, 0.25, 0.5, 0.75].forEach((q, k) => pushF(b + q, k === 3 ? 'tom2' : 'snare', 0.44 + 0.1 * k));
            pushF(b, 'kick', 0.7);
        }
    }

    // ======================= BOLERO (trío) =======================
    if (groove === 'mx-bolero') {
        const fig = MX_BOLERO_GTR[mx.gtr];
        for (let k = 0; k < nS; k++) {
            const kc = kk(k);
            const p = P(k);
            const cs = csAt(p);
            fig.filter(f => f[0] === kc).forEach(([, kind, a, v]) => {
                const sg = segAt(p);
                if (kind === 'b') {
                    const T = bassOf(sg.cs);
                    const first = Math.abs(sg.s - p) < 1e-6;
                    pushH(p, slot * 3.5, [(a === 'F' && !first) ? T.fifth : T.root], v, { dir: 1, roll: 0, gain: 1 });
                } else if (kind === 'a') {
                    const V = topN(cs, gtrOf(cs), 3);
                    pushH(p, slot * 2.8, [V[Math.min(V.length - 1, a)]], v);
                } else pushH(p, slot * (a > 0 ? 1.8 : 1.2), topN(cs, gtrOf(cs), 3), v, { dir: a, roll: a > 0 ? 0.02 : 0.012 });
            });
            // guitarrón (contrebasse), discret : fondamentale et quinte, approche avant un changement
            if (kc === 0 || kc === 4) pushB(p, bassTok(p, kc === 0 ? 'R' : 'F', 2), slot * 3.4, kc === 0 ? 0.66 : 0.58, 0.9);
            if (kc === 7 && changeNext && k === nS - 1) pushB(p, bassTok(p, 'A', 1), slot * 0.9, 0.48, 0.9);
            // maracas en croches, bongó en martillo très doux
            if (mx.perc) {
                add(p, 'shaker', [0.3, 0.16, 0.26, 0.2, 0.3, 0.16, 0.26, 0.22][kc], kc % 2 === 1);
                if (mx.bongo) {
                    if ([2, 5, 6].includes(kc)) add(p, 'bongoh', 0.24, true);
                    if (kc === 3 || kc === 7) add(p, 'bongol', 0.3);
                }
            }
        }
        if (anticip) {
            for (let k = harm.length - 1; k >= 0; k--) if (harm[k].pos >= aPos - 1e-6 && harm[k].intervals.length > 1) harm.splice(k, 1);
            pushH(aPos, slot * 2.5, topN(nextStep, gtrOf(nextStep), 3), 0.52, { dir: 1, roll: 0.02 });
        }
        if (doFill && mx.perc) {
            const b = fillFrom;
            pushF(b, 'bongol', 0.36); pushF(b + 0.5, 'bongoh', 0.3); pushF(b + 0.75, 'bongoh', 0.34);
        }
    }

    // ======================= RANCHERA (cordes du mariachi) =======================
    if (groove === 'mx-ranchera') {
        const kind = fam === 'T' ? 'vals' : (nS <= 4 ? 'polka' : 'bolero');
        const pat = MX_RANCHERA[kind];
        const mis = Number.isInteger(env.measureInStep) ? env.measureInStep : 0;
        // bajeo du guitarrón vers l'accord suivant, sur les derniers temps
        let walkFrom = 99;
        if (changeNext && rng() < (isTurn ? Math.min(0.95, mx.walk + 0.25) : mx.walk)) {
            // dans le dernier cycle (12/8 : la seconde moitié) ; mesure coupée : seulement après la basse du second accord
            const ks = pat.walk.map(k => k + (unitsPerBar - 1) * cyc).filter(k => k < nS && !(halves && P(k) <= splitAt + 1e-6));
            const notes = ks.length ? mxWalk(env, lastSeg.cs, nextStep, ks.length, rng) : [];
            if (notes.length) {
                walkFrom = P(ks[0]);
                ks.forEach((k, j) => pushB(P(k), notes[j], slot * (j < ks.length - 1 ? ks[j + 1] - k : nS - k) * 0.9, 0.74 + 0.04 * j, 1.1));
            }
        }
        for (let c = 0; c < unitsPerBar; c++) {
            const c0k = c * cyc;
            const avail = Math.min(cyc, nS - c0k);
            pat.bass.forEach((k, j) => {
                if (k >= avail) return;
                const p = P(c0k + k);
                if (p >= walkFrom - 1e-6) return;
                const sg = segAt(p);
                const T = bassOf(sg.cs);
                const first = Math.abs(sg.s - p) < 1e-6;
                // vals : fondamentale, puis la quinte à la mesure suivante du même accord ; polka et bolero : fondamentale puis quinte
                const alt = kind === 'vals' ? (mis % 2 === 1 && !halves) : j % 2 === 1;
                pushB(p, (alt && !(first && sg.s > 0)) ? T.fifth : T.root, slot * (kind === 'vals' ? 1.9 : 1.8), j === 0 ? 0.88 : 0.78, 1.1);
            });
            pat.v.forEach(([k, dir, v]) => {
                if (k >= avail || (dir < 0 && !mx.vihUp)) return;
                const p = P(c0k + k);
                pushH(p, slot * 0.9, vihOf(csAt(p)), v, { dir, roll: dir > 0 ? 0.01 : 0.007, gain: 0.85 });
            });
            pat.g.forEach(k => {
                if (k >= avail) return;
                const p = P(c0k + k);
                pushH(p, slot * 1.8, topN(csAt(p), gtrOf(csAt(p)), 3), 0.5, { dir: 1, roll: 0.018, gain: 0.8, lay: 0.006 });
            });
        }
    }

    harm.sort((a, b) => a.pos - b.pos);
    // basse : durées bornées par la note suivante
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.02 : bpb - b.pos - 0.02;
        b.dur = Math.max(0.1, Math.min(b.dur, limit));
    });
    // deuxième accord d'une mesure coupée : sa basse
    if (halves && bass.length && !bass.some(b => Math.abs(b.pos - segs[1].s) < 0.05)) {
        bass.push({ pos: segs[1].s, abs: bassOf(segs[1].cs).root, dur: Math.max(0.3, Math.min(1.5, bpb - segs[1].s - 0.05)), vel: bvel(0.8), wide: true });
        bass.sort((a, b) => a.pos - b.pos);
    }
    drums.sort((a, b) => a.pos - b.pos);
    env.state.mxState = st;
    return { piano: harm, bass, drums, mexico: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MEXICO_GROOVES, MX_NORTENO, MX_RHYTHMS, MX_ROLES, MX_JARANA, MX_JARANA_SEQ, MX_SEXTO_T, MX_BOLERO_GTR, MX_RANCHERA,
        mexicoGroove, mxGrid, mexicoPhraseExtras, mxScaleStep, mxLine, mxDensify, mxWalk, buildMexicoPlan };
}
