// styles/toolkit.js — boîte à outils des modèles de grille (styles musicaux de la fonction « Générer »).
// Fonctions pures, sans DOM : tout ce qui dépendait du moteur passe par l'objet `ctx` :
//   ctx.keyRoot        tonique (0 à 11)
//   ctx.mainQuality    mode choisi (ionian, dorian…) : les styles écrits en degrés le suivent
//   ctx.styleKey       identifiant du style
//   ctx.R              générateur aléatoire (null : forme de référence, toujours la 1re option)
//   ctx.findChordObj   id d'accord -> objet du catalogue
// Chargé par index.html via <script src="styles/toolkit.js"> et testé par styles/toolkit.test.js.
// Un accord de modèle est { r: tonique, c: id d'accord, m: mesures, s: gamme, section, phrase, function }.

// Styles de jazz tonal : tonalité majeure ou mineure selon le mode choisi, jamais un mode d'église (voir makeStyleToolkit).
const JAZZ_TONAL_STYLES = new Set(['ii-v-i', 'anatole', 'bebop', 'swing', 'ballad', 'ballad128', 'hardbop', 'dixieland', 'sambacancao', 'sambajazz']);
// Styles classiques écrits en degrés : même principe (majeur ou mineur), mais mineur « classique » : sensible (V et V7 du
// mineur harmonique), ii°, ♭III, iv, ♭VI, sans les couleurs du jazz (pas de neuvième mineure ajoutée).
const CLASSIC_TONAL_STYLES = new Set(['baroque', 'mozart', 'trad']);
// Styles qui écrivent eux-mêmes leur version mineure (minorizeJazz ne leur est pas appliqué)
const JAZZ_MINOR_NATIVE = new Set(['hardbop', 'dixieland']);
const MINOR_QUALITIES = new Set(['dorian', 'phrygian', 'aeolian', 'locrian']);

// Transpose une grille de jazz écrite en majeur dans la tonalité mineure homonyme, en gardant les fonctions :
//   I → i m7 ; ii → iiø ; iii → ♭IIImaj7 ; IV → iv m7 ; V7 → V7(b9) ; vi → ♭VImaj7 ; viiø → vii°7.
// Une dominante (secondaire ou non) suit sa cible : si la cible descend d'un demi-ton (vi → ♭VI, iii → ♭III), la dominante aussi ;
// si la cible devient mineure ou demi-diminuée, la dominante prend la neuvième mineure. Un m7 suivi de « sa » dominante (ii-V)
// suit cette dominante, et devient m7b5 quand le ii-V mène à un accord mineur. Les accords chromatiques (♭VII7, ♭II7, diminués,
// ♭III, ♭VI…) restent tels quels. La grille est lue comme une boucle (la dernière dominante résout sur la première mesure).
const TK_MAJ = ['majTriad', 'maj7', 'maj9', '6', 'maj7sharp11', 'maj7sharp5'];
const TK_MIN = ['minTriad', 'm7', 'm9', 'm11', 'mmaj7'];
const TK_DOM = ['7', '9', '7alt', '7b9', '7sharp5', '7sus4'];
function minorizeJazz(items, keyRoot, tonicScale = 'dorian', opts = {}) {
    const classic = !!opts.classic;
    const out = items.map(x => { const y = { ...x }; if (x.split) y.split = { ...x.split }; return y; });
    const slots = [];
    out.forEach(it => { slots.push({ h: it, it, half: false }); if (it.split) slots.push({ h: it.split, it, half: true }); });
    const n = slots.length;
    if (!n) return out;
    slots.forEach(sl => { sl.o = ((sl.h.r - keyRoot) % 12 + 12) % 12; sl.c0 = sl.h.c; sl.s0 = sl.h.s; });
    const isMinorish = (c) => TK_MIN.includes(c) || c === 'm7b5' || c === 'minTriad';
    const res = new Array(n);
    const classify = (k, nr) => {
        const sl = slots[k], nx = slots[(k + 1) % n];
        const { o, c0, s0 } = sl;
        if (TK_DOM.includes(c0)) {
            const resolves = nx.o === (o + 5) % 12;
            const delta = (resolves && nr) ? nr.delta : 0;
            const targetMinor = (resolves && nr) ? isMinorish(nr.c) : o === 7;
            if (targetMinor && classic && c0 === '7') return { delta, c: '7', s: 'phrygianDominant', targetMinor };   // V7 du mineur harmonique
            if (targetMinor && (c0 === '7' || c0 === '9')) return { delta, c: '7b9', s: 'phrygianDominant', targetMinor };
            return { delta, c: c0, s: s0, targetMinor };
        }
        if (isMinorish(c0)) {
            const unit = TK_DOM.includes(nx.c0) && nx.o === (o + 5) % 12;
            if (unit && nr) {
                const c = nr.targetMinor ? 'm7b5' : c0;
                return { delta: nr.delta, c, s: c === 'm7b5' ? 'locrianSharp2' : s0 };
            }
            if (o === 0) return { delta: 0, c: 'm7', s: tonicScale };
            if (o === 2) return { delta: 0, c: 'm7b5', s: 'locrianSharp2' };
            if (o === 4) return { delta: -1, c: 'maj7', s: 'ionian' };
            if (o === 5) return { delta: 0, c: c0 === 'm7b5' ? 'm7' : c0, s: 'dorian' };
            if (o === 9 && TK_DOM.includes(nx.c0) && nx.o === 9) return { delta: 0, c: 'm7b5', s: 'locrianSharp2' };   // vi - VI7 → viø (son de i6) - VI7
            if (o === 9) return { delta: -1, c: 'maj7', s: 'lydian' };
            if (o === 11 && c0 === 'm7b5') return { delta: 0, c: 'dim7', s: 'wholeHalfDim' };
            return { delta: 0, c: c0, s: s0 };
        }
        if (TK_MAJ.includes(c0)) {
            if (o === 0) return { delta: 0, c: 'm7', s: tonicScale };
            if (o === 5) return { delta: 0, c: 'm7', s: 'dorian' };
        }
        return { delta: 0, c: c0, s: s0 };
    };
    // De la fin vers le début (chaque accord dépend du suivant) ; la dernière mesure regarde une lecture provisoire de la première.
    const first = classify(0, null);
    for (let k = n - 1; k >= 0; k--) res[k] = classify(k, k === n - 1 ? first : res[k + 1]);
    slots.forEach((sl, k) => {
        const r = res[k];
        sl.h.r = (sl.h.r + r.delta + 12) % 12;
        sl.h.c = r.c;
        sl.h.s = r.s;
        if (!sl.half && r.delta && Number.isInteger(sl.it.bassRootIndex)) sl.it.bassRootIndex = (sl.it.bassRootIndex + r.delta + 12) % 12;
    });
    // Deux moitiés devenues identiques (ex. IV | iv → iv | iv) : un seul accord pour la mesure
    out.forEach(it => { if (it.split && it.split.r === it.r && it.split.c === it.c) delete it.split; });
    return out;
}

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
    // Styles de jazz tonal (écrits en degrés) : ils ne tournent PAS dans les modes, ce qui supprimerait la dominante
    // (en dorien le « V » deviendrait un m7). Mode majeur (ionien, lydien, mixolydien) → tonalité majeure ;
    // mode mineur (dorien, phrygien, éolien, locrien) → tonalité mineure du jazz (i, iiø, V7(b9/alt), ♭III, iv, ♭VI),
    // obtenue par minorizeJazz après construction, ou écrite directement par le style (hard bop, dixieland).
    const jazzTonal = JAZZ_TONAL_STYLES.has(styleKey);
    const classicTonal = CLASSIC_TONAL_STYLES.has(styleKey);
    const minorKey = (jazzTonal || classicTonal) && MINOR_QUALITIES.has(mainQuality);
    const minorTonicScale = classicTonal ? 'aeolian' : ((mainQuality === 'aeolian') ? 'aeolian' : 'dorian');
    const rotation = (jazzTonal || classicTonal) ? 0 : (QUALITY_ROTATION[mainQuality] ?? 0);
    // Un style en degrés qui tournerait dans les modes désactive ses bibliothèques (elles supposent une tonalité majeure) ;
    // les styles tonals (jazz, classiques) et les styles écrits en absolu (bossa, modal, blues…) les gardent toujours actives.
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
        styleKey, keyRoot, mainQuality, minorQuality: MINOR_QUALITIES.has(mainQuality), rotation, libOK, R, pick, jazzTonal, minorKey, minorTonicScale, classicTonal, minorNative: JAZZ_MINOR_NATIVE.has(styleKey),
        chord, chordJazz, secondary, abs, join, iiV, turnaround, cadence, turnCell,
        CH, TONIC_KINDS, cells, okAfter, twinOf, absCell, withTwin, JBR, jbr
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeStyleToolkit, minorizeJazz, JAZZ_TONAL_STYLES, CLASSIC_TONAL_STYLES, JAZZ_MINOR_NATIVE };
}
