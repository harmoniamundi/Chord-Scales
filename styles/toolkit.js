// styles/toolkit.js — boîte à outils des modèles de grille (styles musicaux de la fonction « Générer »).
// Fonctions pures, sans DOM : tout ce qui dépendait du moteur passe par l'objet `ctx` :
//   ctx.keyRoot        tonique (0 à 11)
//   ctx.mainQuality    mode choisi (ionian, dorian…) : les styles écrits en degrés le suivent
//   ctx.styleKey       identifiant du style
//   ctx.R              générateur aléatoire (null : forme de référence, toujours la 1re option)
//   ctx.findChordObj   id d'accord -> objet du catalogue
// Chargé par index.html via <script src="styles/toolkit.js"> et testé par styles/toolkit.test.js.
// Un accord de modèle est { r: tonique, c: id d'accord, m: mesures, s: gamme, section, phrase, function }.

function makeStyleToolkit(ctx) {
    const { styleKey, mainQuality, R, findChordObj } = ctx;
    const keyRoot = Number.isInteger(ctx.keyRoot) ? ctx.keyRoot : 0;
    const DEGREE_TABLE = [
        { off: 0,  c: 'maj7', s: 'ionian' },
        { off: 2,  c: 'm7',   s: 'dorian' },
        { off: 4,  c: 'm7',   s: 'phrygian' },
        { off: 5,  c: 'maj7', s: 'lydian' },
        { off: 7,  c: '7',    s: 'mixolydian' },
        { off: 9,  c: 'm7',   s: 'aeolian' },
        { off: 11, c: 'm7b5', s: 'locrianSharp2' }
    ];
    const DEGREE_INDEX = { I:0, ii:1, iii:2, IV:3, V:4, vi:5, vii:6 };
    const QUALITY_ROTATION = { ionian:0, dorian:1, phrygian:2, lydian:3, mixolydian:4, aeolian:5, locrian:6 };
    const ROTATION_STYLES = new Set(['ii-v-i', 'anatole', 'bebop', 'swing', 'ballad', 'ballad128', 'hardbop', 'dixieland', 'baroque', 'mozart', 'trad']);
    const rotation = QUALITY_ROTATION[mainQuality] ?? 0;
    // Les styles écrits en degrés (ii-V-I, swing…) suivent le mode choisi ; leurs bibliothèques de cellules supposent une
    // tonalité majeure. Les styles écrits en absolu (bossa, modal, blues…) ignorent le mode : bibliothèques toujours actives.
    const libOK = !ROTATION_STYLES.has(styleKey) || rotation === 0;
    const diatonicChord = (degree, measures=1, tonicScale='ionian') => {
        const i = DEGREE_INDEX[degree];
        const idx = (rotation + i) % 7;
        const offsetFromTonic = (DEGREE_TABLE[idx].off - DEGREE_TABLE[rotation].off + 12) % 12;
        return {
            r:(keyRoot + offsetFromTonic) % 12,
            c:DEGREE_TABLE[idx].c,
            m:measures,
            s:(i === 0 && rotation === 0) ? tonicScale : DEGREE_TABLE[idx].s
        };
    };
    const chord = (degree, measures=1, section='', phrase='', fn='tonic') => ({ ...diatonicChord(degree, measures, 'ionian'), section, phrase, function:fn });
    const chordJazz = (degree, measures=1, section='', phrase='', fn='tonic') => ({ ...diatonicChord(degree, measures, 'lydian'), section, phrase, function:fn });
    const secondary = (degree, measures=1, section='', phrase='') => {
        const target = diatonicChord(degree, 1);
        return { r:(target.r + 7) % 12, c:'7', m:measures, s:'mixolydian', section, phrase, function:'secondaryDominant' };
    };
    const abs = (off, c, m=1, s=null, section='', phrase='', fn='color') => ({ r:(keyRoot+off+12)%12, c, m, s:s || ((findChordObj(c).scales || [])[0]?.id || 'ionian'), section, phrase, function:fn });
    const join = (...parts) => parts.flat().map(x => ({...x}));

    // Cellules harmoniques réutilisables. Elles constituent le vocabulaire du style :
    // une variation peut modifier une cellule, mais ne détruit pas sa fonction.
    const iiV = (section, phrase, target='I', jazz=true) => [
        jazz ? chordJazz('ii',1,section,phrase,'predominant') : chord('ii',1,section,phrase,'predominant'),
        jazz ? chordJazz('V',1,section,phrase,'dominant') : chord('V',1,section,phrase,'dominant')
    ];
    const turnaround = (section, phrase) => [
        chordJazz('I',1,section,phrase,'tonic'),
        chordJazz('vi',1,section,phrase,'predominant'),
        chordJazz('ii',1,section,phrase,'predominant'),
        chordJazz('V',1,section,phrase,'dominant')
    ];
    const cadence = (section, phrase) => [
        chord('ii',1,section,phrase,'predominant'),
        chord('V',1,section,phrase,'dominant'),
        chord('I',2,section,phrase,'tonic')
    ];

    const pick = (arr) => (R && libOK) ? arr[Math.floor(R() * arr.length)] : arr[0];
    const TURNLIB = {
        T3: [[0,'maj7','lydian','tonic'],[1,'dim7','wholeHalfDim','color'],[2,'m7','dorian','predominant'],[7,'7','mixolydian','dominant']],
        T4: [[0,'maj7','lydian','tonic'],[3,'7','mixolydian','color'],[8,'7','mixolydian','color'],[1,'7','lydianDominant','dominant']],
        T5: [[0,'maj7','lydian','tonic'],[0,'7','mixolydian','color'],[5,'maj7','lydian','predominant'],[5,'m7','dorian','predominant']]
    };
    // Cellule de 4 mesures de type turnaround (T0 et T1 : écriture d'origine, T3-T5 : variantes)
    const turnCell = (kind, section, phrase) => {
        if (kind === 'T0') return turnaround(section, phrase);
        if (kind === 'T1') return [chordJazz('I',1,section,phrase,'tonic'), abs(9,'7',1,'mixolydian',section,phrase,'secondaryDominant'), chordJazz('ii',1,section,phrase,'predominant'), chordJazz('V',1,section,phrase,'dominant')];
        return TURNLIB[kind].map(([off,c,sc,fn]) => abs(off,c,1,sc,section,phrase,fn));
    };

    // Accords de tonalité pour les styles écrits en absolu : nom -> [accord, gamme]
    const CH = {
        M: ['majTriad','ionian'], L: ['majTriad','lydian'], m: ['minTriad','aeolian'], md: ['minTriad','dorian'],
        D: ['7','mixolydian'], Dm: ['7','mixolydianFlat13'], hd: ['m7b5','locrianSharp2'], alt: ['7alt','altered'],
        maj7: ['maj7','lydian'], maj7i: ['maj7','ionian'], m7: ['m7','dorian'], m7a: ['m7','aeolian'],
        D9b: ['7b9','phrygianDominant']
    };
    const TONIC_KINDS = new Set(['M','m','md','maj7','maj7i','m7','m7a']);
    // Une cellule = liste de [nom, décalage depuis la tonique, nombre de mesures (1 par défaut)]
    const cells = (spec, sec, phr) => spec.map(([nm, off, m = 1]) => {
        const [c, sc] = CH[nm];
        const fn = (off === 0 && TONIC_KINDS.has(nm)) ? 'tonic' : ((c === '7' || c === '7alt' || c === '7b9') ? 'dominant' : 'predominant');
        return abs(off, c, m, sc, sec, phr, fn);
    });
    // Après une cellule qui finit sur une dominante, la suivante commence par la tonique ou vi (résolution ou cadence rompue)
    const okAfter = (prev, opts) => {
        if (!prev || !['7','7b9','7alt'].includes(CH[prev[prev.length - 1][0]][0])) return opts;
        const ok = opts.filter(o => (o[0][1] === 0 && TONIC_KINDS.has(o[0][0])) || o[0][1] === 9);
        return ok.length ? ok : opts;
    };
    const twinOf = (items, sec) => items.map(x => ({ ...x, section: sec, phrase: x.phrase.replace(/^[A-Z]\d*/, m0 => sec + m0.replace(/^[A-Z]/, '')) }));
    const absTurn = {
        T0: [[0,'maj7','lydian','tonic'],[9,'m7','aeolian','predominant'],[2,'m7','dorian','predominant'],[7,'7','mixolydian','dominant']],
        T1: [[0,'maj7','lydian','tonic'],[9,'7','mixolydian','secondaryDominant'],[2,'m7','dorian','predominant'],[7,'7','mixolydian','dominant']],
        T3: TURNLIB.T3, T4: TURNLIB.T4, T5: TURNLIB.T5
    };
    const absCell = (kind, sec, phr) => absTurn[kind].map(([off,c,sc,fn]) => abs(off,c,1,sc,sec,phr,fn));
    // Les copies jumelles : A2 reprend A (même contenu, étiquettes propres), B2 reprend B.
    const withTwin = (A, secA, B, secB) => join(A, twinOf(A, secA), B, twinOf(B, secB));

    // Ponts à 8 mesures des formes AABA jazz. Cellule : [décalage, accord, gamme, mesures, fonction, kc, phrase] ; kc = tonalité
    // traversée (décalage de la tonique en demi-tons, 0 = tonalité d'origine) : elle sert à poser le marqueur de modulation « I de X ».
    const JBR = [
        // 0. chaîne de dominantes (rhythm changes) : pas de modulation
        [[4,'7','mixolydian',2,'secondaryDominant',0,'B1'], [9,'7','mixolydian',2,'secondaryDominant',0,'B1'], [2,'7','mixolydian',2,'secondaryDominant',0,'B2'], [7,'7','mixolydian',2,'dominant',0,'B2']],
        // 1. pont à la sous-dominante : ii-V-I de IV, puis ii-V de IV ; vi de IV sert de pivot (c'est le ii de la tonalité d'origine)
        [[7,'m7','dorian',1,'predominant',5,'B1'], [0,'7','mixolydian',1,'dominant',5,'B1'], [5,'maj7','lydian',2,'tonic',5,'B1'],
         [7,'m7','dorian',1,'predominant',5,'B2'], [0,'7','mixolydian',1,'dominant',5,'B2'], [2,'m7','dorian',1,'predominant',0,'B2'], [7,'7','mixolydian',1,'dominant',0,'B2']],
        // 2. pont en bIII : ii-V-I de bIII, retour par le ii-V de la tonalité d'origine
        [[5,'m7','dorian',1,'predominant',3,'B1'], [10,'7','mixolydian',1,'dominant',3,'B1'], [3,'maj7','lydian',2,'tonic',3,'B1'],
         [2,'m7','dorian',2,'predominant',0,'B2'], [7,'7','mixolydian',2,'dominant',0,'B2']]
    ];
    const jbr = (spec, sec) => spec.map(([off, c, sc, m, fn, kc, ph]) => Object.assign(abs(off, c, m, sc, sec, ph, fn), { kc }));


    return {
        styleKey, keyRoot, rotation, libOK, R, pick,
        chord, chordJazz, secondary, abs, join, iiV, turnaround, cadence, turnCell,
        CH, TONIC_KINDS, cells, okAfter, twinOf, absCell, withTwin, JBR, jbr
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeStyleToolkit };
}
