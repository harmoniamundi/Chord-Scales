// grid/harmony.js — lecture harmonique d'une grille, sans DOM : symboles d'accords (notation Jam), tonalité en vigueur à une mesure,
// étiquettes de fonction (I, V/ii, subV…) et lectures alternatives proposées par l'éditeur de fonction tonale.
// Les réglages du moteur passent par des paramètres : mainKey (tonique de la grille) et rootLabels (noms des 12 fondamentales,
// selon l'enharmonie choisie). Chargé par index.html via <script src="grid/harmony.js"> (après grid/generation.js, dont il
// utilise romanDeg et chordFamily) et testé par grid/harmony.test.js.

// Sous Node, la théorie se charge ; en navigateur ce sont des globaux (theory.js).
const HARM_THEORY = (typeof lookupChord !== 'undefined')
    ? { lookupChord, chordInfo, chordTypes, chordRootName, bassNoteName }
    : require('../theory.js');
if (typeof romanDeg === 'undefined' && typeof require === 'function') {
    var { romanDeg, chordFamily, convertRomanText, convertRomanLabel } = require('./generation.js');
}
// FN_MINOR_MODES est une constante globale (grid/generation.js) : on la reprend sous un nom propre à ce fichier.
const HARM_MINOR_MODES = (typeof FN_MINOR_MODES !== 'undefined') ? FN_MINOR_MODES : require('./generation.js').FN_MINOR_MODES;
const HARM_MODE_SCALES = (typeof FN_MODE_SCALES !== 'undefined') ? FN_MODE_SCALES : require('./generation.js').FN_MODE_SCALES;

// Notation Jam d'un accord : une triade majeure s'écrit avec la fondamentale seule (D, C, F#…).
function jazzChordNotation(chordId) {
    // En mode Jam, une triade majeure s'écrit avec la fondamentale seule (D, C, F#...)
    if (chordId === 'majTriad') return '';
    const built = HARM_THEORY.lookupChord(chordId);
    if (built && built.built) return built.jazz;   // accord composé : symbole généré
    const notation = {
        maj7: 'Δ',
        maj9: 'Δ9',
        '6': '6',
        maj7sharp11: 'Δ#11',
        maj7sharp5: 'Δ#5',
        m7: '−7',
        m9: '−9',
        m11: '−11',
        mmaj7: '−Δ7',
        '7': '7',
        '9': '9',
        '7alt': '7alt',
        '7b9': '7♭9',
        '7sharp5': '7#5',
        m7b5: 'ø',
        dim7: '°',
        '7sus4': '7sus4'
    };
    return notation[chordId] || (HARM_THEORY.lookupChord(chordId) || HARM_THEORY.chordTypes.maj[0]).name;
}

function chordSymbol(chord, rootLabels) {
    const symbol = `${HARM_THEORY.chordRootName(chord.rootIndex, chord.chordId, rootLabels)}${jazzChordNotation(chord.chordId)}`;
    if (Number.isInteger(chord.bassRootIndex) && chord.bassRootIndex !== chord.rootIndex) return `${symbol}/${HARM_THEORY.bassNoteName(chord.rootIndex, chord.chordId, chord.bassRootIndex, rootLabels)}`;
    return symbol;
}

// Les caractères absents de la police Kalam (Δ, ♭, ♯ et le signe moins « − » du mineur) sont isolés dans un <span>
// afin que le téléphone puisse leur imposer une police qui les contient (sinon il les tire d'une police « cursive »
// de secours : tiret trop fin, Δ qui ressemble à un D…). Le texte reçu doit déjà être du HTML valide.
function glyphHtml(text) {
    return String(text).replace(/[Δ♭♯−]/g, (c) => `<span class="jam-glyph">${c}</span>`);
}

// Version HTML du symbole pour la grille (voir glyphHtml).
function chordSymbolHtml(chord, rootLabels) {
    return glyphHtml(chordSymbol(chord, rootLabels));
}

// Tonalité en vigueur à une mesure (et une moitié de mesure) : celle du dernier marqueur de modulation
// (modKey, posé quand l'utilisateur choisit une lecture « I de X », « IV de X », etc.) rencontré en
// remontant la grille, sinon la tonalité de la grille. excludeSelf : ignore le marqueur du bloc lui-même
// (tonalité qui précède cet accord, base des lectures proposées).
function localKeyInfo(flatMeasures, index, half = 0, excludeSelf = false, mainKey = 0) {
    const fallback = { root: mainKey, minor: false, marked: false };
    if (!Array.isArray(flatMeasures) || !flatMeasures.length || !(index >= 0)) return fallback;
    const i0 = Math.min(index, flatMeasures.length - 1);
    const selfStep = flatMeasures[i0].stepIndex;
    for (let j = i0; j >= 0; j--) {
        const m = flatMeasures[j];
        const own = excludeSelf && m.stepIndex === selfStep;
        // marqueur de la 2e moitié de mesure : en vigueur seulement pour elle-même (2e moitié) ou pour les mesures suivantes
        if (m.split && m.split.modKey && (j < i0 || half === 1) && !own) return { root: m.split.modKey.root, minor: !!m.split.modKey.minor, marked: true };
        // marqueur du bloc : sauf le sien propre, sauf pour la 2e moitié de la mesure qu'il marque
        if (m.modKey && (!own || (half === 1 && j === i0))) return { root: m.modKey.root, minor: !!m.modKey.minor, marked: true };
    }
    return fallback;
}

// Même lecture, sans l'indicateur « marked » : { root, minor }. minor ne vaut true que pour une tonalité posée par un marqueur
// de modulation ; la tonalité de la grille elle-même est toujours rendue avec minor = false (voir localKeyMinor).
function localKey(flatMeasures, index, half = 0, excludeSelf = false, mainKey = 0) {
    const { root, minor } = localKeyInfo(flatMeasures, index, half, excludeSelf, mainKey);
    return { root, minor };
}

// La tonalité en vigueur est-elle à tierce mineure ? Un marqueur de modulation le dit ; sinon c'est le mode de la grille
// (mainQuality : aeolian, dorian, phrygian, locrian).
function localKeyMinor(flatMeasures, index, half = 0, excludeSelf = false, mainKey = 0, mainQuality = 'ionian') {
    const k = localKeyInfo(flatMeasures, index, half, excludeSelf, mainKey);
    return k.marked ? k.minor : HARM_MINOR_MODES.includes(mainQuality);
}

// Gamme (demi-tons depuis la tonique) de la tonalité en vigueur : celle du mode de la grille, ou majeure / mineure naturelle
// quand un marqueur de modulation a posé une autre tonalité.
function localKeyScale(flatMeasures, index, half = 0, excludeSelf = false, mainKey = 0, mainQuality = 'ionian') {
    const k = localKeyInfo(flatMeasures, index, half, excludeSelf, mainKey);
    if (k.marked) return HARM_MODE_SCALES[k.minor ? 'aeolian' : 'ionian'];
    return HARM_MODE_SCALES[mainQuality] || HARM_MODE_SCALES.ionian;
}

// opts (facultatif) : { convention: 'jazz' (par défaut) | 'classic', mainQuality, keyMinor }.
//   convention : chiffrage des degrés en tonalité mineure (♭III ♭VI ♭VII en jazz, III VI VII en classique) ;
//   mainQuality : mode de la grille, pour savoir si la tonalité de repli est mineure ;
//   keyMinor : la tonalité imposée par keyOverride est-elle mineure ?
// Une fonction choisie par l'utilisateur (fnLabel) est enregistrée en chiffrage jazz : elle est réécrite à l'affichage.
function harmonicFunctionLabel(measure, flatMeasures, index, half = 0, keyOverride = null, mainKey = 0, opts = {}) {
    const convention = opts && opts.convention === 'classic' ? 'classic' : 'jazz';
    let tonic, minor;
    if (Number.isInteger(keyOverride)) { tonic = keyOverride; minor = !!(opts && opts.keyMinor); }
    else {
        const k = localKeyInfo(flatMeasures, index, half, false, mainKey);
        tonic = k.root;
        minor = k.marked ? k.minor : HARM_MINOR_MODES.includes(opts && opts.mainQuality);
    }
    const minorRef = convention === 'classic' && minor;
    if (measure.fnLabel) return convertRomanLabel(measure.fnLabel, convention, minor); // fonction choisie par l'utilisateur
    const root = ((measure.rootIndex - tonic) % 12 + 12) % 12;
    const chordId = measure.chordId || '';
    // Degré chromatique exact (♭II, ♭III, ♭VI, ♭VII… et non « #I », « #II », « #V », « #VI ») ;
    // majuscule pour les accords majeurs / dominants, minuscule pour les mineurs et diminués ;
    // ø = demi-diminué (m7♭5), ° = diminué (triade ou septième diminuée).
    const cinfo = HARM_THEORY.chordInfo(chordId);
    const lowerCase = !!cinfo && cinfo.minorish;
    let degreeLabel = romanDeg(root, lowerCase, minorRef);
    if (cinfo && cinfo.fam === 'hdim') degreeLabel += 'ø';
    else if (cinfo && cinfo.fam === 'dim') degreeLabel += '°';
    const diminished = !!cinfo && (cinfo.fam === 'hdim' || cinfo.fam === 'dim');

    const fn = measure.harmonicFunction;
    if (fn === 'secondaryDominant') {
        // Cible = prochain accord DIFFÉRENT : un accord répété (2 mesures de C7 avant F, par exemple) garde la même
        // fonction sur toutes ses mesures, au lieu de se prendre lui-même (ou sa répétition) pour cible.
        let next = null;
        for (let j = index + 1; j < flatMeasures.length; j++) {
            const cand = flatMeasures[j];
            if (cand.rootIndex !== measure.rootIndex || cand.chordId !== measure.chordId) { next = cand; break; }
        }
        if (next) {
            const d = (((next.rootIndex - measure.rootIndex) % 12) + 12) % 12;
            const targetRoot = ((next.rootIndex - tonic) % 12 + 12) % 12;
            const tinfo = HARM_THEORY.chordInfo(next.chordId);
            const targetMinor = !!tinfo && tinfo.minorish && tinfo.fam !== 'dim';
            if (d === 5) return targetRoot === 0 ? 'V' : `V/${romanDeg(targetRoot, targetMinor, minorRef)}`; // dominante qui résout une quarte plus haut
            if (d === 11) return targetRoot === 0 ? 'subV' : `subV/${romanDeg(targetRoot, targetMinor, minorRef)}`; // substitut de triton : résolution par demi-ton descendant
        }
        return degreeLabel; // pas de résolution lisible : degré dans la tonalité en vigueur (jamais de « V/? »)
    }
    if (fn === 'dominant') {
        if (diminished) return degreeLabel;
        return degreeLabel;
    }
    if (fn === 'tonic') return degreeLabel === 'I' ? 'I' : degreeLabel;
    if (fn === 'predominant') return degreeLabel;
    if (fn === 'target') return degreeLabel;
    if (fn === 'color') return degreeLabel;
    return degreeLabel;
}

// Accords DIFFÉRENTS qui suivent l'accord d'une mesure (ou de sa 2e moitié, half = 1) dans la grille : au plus `count`
// { rootIndex, chordId }. Une mesure à deux accords compte pour deux ; un accord répété (2 mesures de D7, par exemple)
// n'est compté qu'une fois, et l'accord de départ lui-même est ignoré s'il se répète. Sert à lire les chaînes de dominantes.
function followingChords(flatMeasures, index, half = 0, count = 2) {
    const out = [];
    if (!Array.isArray(flatMeasures) || !(index >= 0) || index >= flatMeasures.length) return out;
    const start = flatMeasures[index];
    const startChord = (half === 1 && start.split) ? start.split : start;
    let last = { rootIndex: startChord.rootIndex, chordId: startChord.chordId };
    const push = (c) => {
        if (out.length >= count || !c) return;
        if (c.rootIndex === last.rootIndex && c.chordId === last.chordId) return;
        last = { rootIndex: c.rootIndex, chordId: c.chordId };
        out.push({ ...last });
    };
    if (half === 0 && start.split) push(start.split);
    for (let j = index + 1; j < flatMeasures.length && out.length < count; j++) {
        push(flatMeasures[j]);
        if (flatMeasures[j].split) push(flatMeasures[j].split);
    }
    return out;
}

// Lectures possibles d'un accord dans la tonalité de la grille : degré diatonique, dominantes secondaires,
// substitutions, emprunts modaux, accords de passage / chromatisme et modulations.
// next : accord de la mesure suivante (pour les accords d'approche chromatique), ou null.
function functionAlternatives(chord, next = null, keyOverride = null, env = {}) {
    const { mainKey, rootLabels } = env;
    // env.scale (facultatif) : gamme de la tonalité en vigueur ; un accord dont les notes y sont toutes est diatonique, pas « emprunté »
    const diatonicIn = (r, triad) => Array.isArray(env.scale) && triad.every(n => env.scale.includes((r + n) % 12));
    // Tierce de la tonalité en vigueur, quand sa gamme est connue (sinon on propose toujours le passage au mode parallèle)
    const keyHasMinorThird = Array.isArray(env.scale) && env.scale.includes(3) && !env.scale.includes(4);
    const keyHasMajorThird = Array.isArray(env.scale) && env.scale.includes(4) && !env.scale.includes(3);
    const key = Number.isInteger(keyOverride) ? keyOverride : mainKey;
    const r = ((chord.rootIndex - key) % 12 + 12) % 12;
    const R = (t, lower) => romanDeg(t, lower);
    const K = (t) => rootLabels[(key + ((t % 12) + 12) % 12) % 12];
    const mod = (n) => ((n % 12) + 12) % 12;
    const fam = chordFamily(chord.chordId);
    const diatonic = [0, 2, 4, 5, 7, 9, 11];
    const groups = [];
    const seen = new Set();
    const add = (title, items) => {
        const clean = items.filter(it => it && it.label && !seen.has(it.label) && seen.add(it.label));
        if (clean.length) groups.push({ title, items: clean });
    };
    const it = (label, desc, mod = null) => ({ label, desc, mod }); // mod : { root, minor } = nouvelle tonalité si la lecture est une modulation
    const mk = (t, minor = false) => ({ root: (key + mod(t)) % 12, minor });

    // --- Fonction T / SD / D ---
    const tsd = { maj: { 0: 'T', 5: 'SD' }, min: { 2: 'SD', 4: 'T', 9: 'T' }, dom: { 7: 'D' }, aug: { 7: 'D' }, hdim: { 11: 'D' }, dim: { 11: 'D' } }[fam] || {};
    if (tsd[r]) {
        const txt = { T: 'Tonique : repos, stabilité', SD: 'Sous-dominante (prédominante) : éloignement, prépare la dominante', D: 'Dominante : tension, appelle la résolution sur la tonique' }[tsd[r]];
        add('Fonction (T / SD / D)', [it(tsd[r], txt)]);
    }

    if (fam === 'dom' || fam === 'aug') {
        const isSus4 = !!(HARM_THEORY.chordInfo(chord.chordId) || {}).sus4;
        const suf = isSus4 ? '7sus' : (fam === 'aug' ? '+' : '7');
        const tSec = mod(r + 5);
        // Chaîne de dominantes (cycle des quintes) : quand l'accord qui suit est lui-même une dominante une quarte plus haut,
        // cet accord est « la dominante de la dominante ». Y = accord suivant, Z = celui qui vient après Y.
        // Ex. en Si♭ : D7 → G7 → C7 → F7 → B♭ ; G7 se lit V7/II (il mène à C7) et D7 se lit V7/V7/II (il mène à G7).
        // Pas de lecture « en chaîne » si Y mène à la tonique (D7 → G7 → C : c'est déjà V7/V) ni si Y ne résout pas une quinte plus bas.
        const after = Array.isArray(env.after) ? env.after : [];
        const Y = after[0], Z = after[1];
        const isDomFam = (id) => { const f = chordFamily(id); return f === 'dom' || f === 'aug'; };
        let chainItem = null;
        if (r !== 7 && Y && Z && isDomFam(Y.chordId) && mod(Y.rootIndex - chord.rootIndex) === 5 && mod(Z.rootIndex - Y.rootIndex) === 5) {
            const tY = mod(Y.rootIndex - key), tZ = mod(Z.rootIndex - key);
            const zMinor = chordFamily(Z.chordId) === 'min';
            if (tZ !== 0) {
                const zName = K(tZ) + (zMinor ? 'm' : (isDomFam(Z.chordId) ? '7' : ''));
                chainItem = it(`V${suf}/V7/${R(tZ, zMinor)}`,
                    `Chaîne de dominantes : dominante de ${K(tY)}7, lui-même V7/${R(tZ, zMinor)} ; cycle des quintes ${K(r)}7 → ${K(tY)}7 → ${zName}`);
            }
        }
        add('Dominantes', [
            r === 7 ? it('V' + suf, 'Dominante principale : tend vers la tonique I') : null,
            r !== 7 ? it(`V${suf}/${R(tSec)}`, `Dominante secondaire (tonicisation) : résout sur ${R(tSec)} (${K(tSec)}), une quinte plus bas`) : null,
            chainItem
        ]);
        const tTri = mod(r + 11);
        const tBd = mod(r + 2);
        add('Substitutions', [
            it(`subV${suf}/${R(tTri)}`, `Substitut de triton : remplace V7/${R(tTri)} ; sa fondamentale descend d'un demi-ton sur ${R(tTri)} (${K(tTri)})`),
            (fam === 'dom' && !isSus4) ? it(tBd === 0 ? '♭VII7' : `♭VII7/${R(tBd)}`, `Dominante « backdoor » (♭VII7) : résout par la sous-dominante mineure sur ${R(tBd)} (${K(tBd)})`) : null
        ]);
        add('Emprunts modaux', [
            r === 0 ? it('I7', 'Tonique dominante : couleur blues / mixolydienne') : null,
            r === 5 ? it('IV7', 'Sous-dominante dominante : couleur blues') : null,
            r === 3 ? it('♭III7', 'Dominante d\'emprunt (♭III7), couleur blues mineur') : null,
            r === 8 ? it('♭VI7', 'Sixte augmentée (♭VI7) : conduit à V') : null
        ]);
        if (r !== 7) add('Modulation', [it(`V${suf} de ${K(tSec)}`, `Modulation : cet accord devient la dominante de la nouvelle tonalité de ${K(tSec)}`, mk(tSec))]);
    } else if (fam === 'min') {
        const degreeInfo = {
            0: ['i', 'Tonique mineure (mode parallèle)'],
            1: ['♭ii', 'Accord chromatique (♭ii) : voisin chromatique de i'],
            2: ['ii', 'Sous-dominante : prépare V7 (ii–V–I)'],
            3: ['♭iii', 'Emprunt au mode parallèle mineur'],
            4: ['iii', 'Tonique relative : relie I à IV ou vi'],
            5: ['iv', 'Sous-dominante mineure : emprunt au mode parallèle mineur'],
            6: ['♯iv', 'Accord chromatique'],
            7: ['v', 'Dominante mineure : couleur modale (mixolydien / éolien)'],
            8: ['♭vi', 'Emprunt au mode parallèle mineur'],
            9: ['vi', 'Substitut de tonique : relatif mineur de I'],
            10: ['♭vii', 'Emprunt (couleur dorienne / éolienne)'],
            11: ['vii', 'Accord chromatique']
        }[r];
        if (r === 5 && diatonicIn(r, [0, 3, 7])) degreeInfo[1] = 'Sous-dominante mineure : accord diatonique de la gamme';
        add('Degré', [it(degreeInfo[0], degreeInfo[1])]);
        const tIi = mod(r - 2);
        if (r !== 2) add('Dominantes secondaires', [it(`ii/${R(tIi)}`, `Le ii d'un ii–V secondaire : mène à V7/${R(tIi)} puis ${R(tIi)} (${K(tIi)})`)]);
        const pivots = [
            [mod(r + 10), 'ii', `ii de ${K(r + 10)}`, 'sous-dominante'],
            [mod(r + 8), 'iii', `iii de ${K(r + 8)}`, 'tonique relative'],
            [mod(r + 3), 'vi', `vi de ${K(r + 3)}`, 'relatif mineur']
        ].filter(x => x[0] !== 0).map(x => it(x[2], `Modulation (accord pivot) : ${x[1]} de ${K(x[0])}, rôle de ${x[3]} dans la nouvelle tonalité`, mk(x[0])));
        // Sur la tonique en vigueur (r = 0), « i (Xm) » signifie : passage au mode parallèle mineur, la tonique restant la même.
        // Inutile de le proposer si la tonalité en vigueur est déjà à tierce mineure.
        const toParallelMinor = r === 0 && !keyHasMinorThird;
        add('Modulation', [...pivots, (r !== 0 || toParallelMinor) ? it(`i (${K(r)}m)`, toParallelMinor ? `Passage en ${K(0)} mineur (tonalité parallèle) : même tonique, nouveau mode ; les accords suivants se lisent en ${K(0)} mineur` : `Modulation en ${K(r)} mineur : cet accord en devient la tonique`, mk(r, true)) : null]);
    } else if (fam === 'maj') {
        const degreeInfo = {
            0: ['I', 'Tonique'],
            1: ['♭II', 'Sixte napolitaine : accord de ♭II qui précède V'],
            2: ['II', 'II majeur (lydien) : dominante secondaire V/V sans septième'],
            3: ['♭III', 'Emprunt au mode parallèle mineur'],
            4: ['III', 'III majeur : V/vi sans septième'],
            5: ['IV', 'Sous-dominante'],
            6: ['♯IV', 'Accord chromatique'],
            7: ['V', 'Dominante (accord majeur sur V)'],
            8: ['♭VI', 'Emprunt au mode parallèle mineur'],
            9: ['VI', 'VI majeur : V/ii sans septième'],
            10: ['♭VII', 'Emprunt au mode parallèle mineur / couleur mixolydienne'],
            11: ['VII', 'Accord chromatique']
        }[r];
        const diatonicRole = { 3: 'Médiante : accord diatonique de la gamme (relatif majeur de la tonique)', 8: 'Sus-dominante : accord diatonique de la gamme',
            10: 'Sous-tonique : accord diatonique de la gamme, sans sensible (couleur éolienne / mixolydienne)' }[r];
        if (diatonicRole && diatonicIn(r, [0, 4, 7])) degreeInfo[1] = diatonicRole;
        add('Degré', [it(degreeInfo[0], degreeInfo[1])]);
        const tIv = mod(r + 7), tV = mod(r + 5);
        add('Modulation', [
            // Sur la tonique en vigueur (r = 0) : passage au mode parallèle majeur, sauf si la tonalité en vigueur est déjà majeure.
            r !== 0 ? it(`I de ${K(r)}`, `Modulation : cet accord devient la tonique de ${K(r)} majeur`, mk(r))
                : (!keyHasMajorThird ? it(`I de ${K(0)}`, `Passage en ${K(0)} majeur (tonalité parallèle) : même tonique, nouveau mode ; les accords suivants se lisent en ${K(0)} majeur`, mk(0)) : null),
            tIv !== 0 ? it(`IV de ${K(tIv)}`, `Modulation (accord pivot) : sous-dominante de ${K(tIv)}`, mk(tIv)) : null,
            (chord.chordId === 'majTriad' && tV !== 0) ? it(`V de ${K(tV)}`, `Modulation : dominante (triade) de ${K(tV)}`, mk(tV)) : null
        ]);
    } else if (fam === 'hdim') {
        const tIi = mod(r - 2);
        add('Dominantes secondaires', [
            r === 11 ? it('viiø', 'Sensible demi-diminuée : fonction de dominante (V7 sans fondamentale) vers I') : null,
            it(tIi === 0 ? 'iiø' : `iiø/${R(tIi, true)}`, tIi === 0 ? 'Emprunt au mineur parallèle : iiø – V7(♭9) – i' : `ii–V mineur : iiø – V7(♭9) – ${R(tIi, true)} ; tonicisation de ${R(tIi, true)} (${K(tIi)} mineur)`)
        ]);
        add('Modulation', [it(`iiø de ${K(tIi)}m`, `Modulation en ${K(tIi)} mineur : cet accord en devient le iiø`, mk(tIi, true))]);
    } else if (fam === 'dim') {
        const tg = [1, 4, 7, 10].map(n => mod(r + n));
        add('Dominantes secondaires', tg.map(t => it(t === 0 ? 'vii°7' : `vii°7/${R(t)}`, `Remplace V7(♭9) de ${R(t)} (${K(t)}) : résolution par demi-ton ascendant sur ${R(t)}`)));
        const lo = mod(r - 1), hi = mod(r + 1);
        const passing = [];
        if (diatonic.includes(lo) && diatonic.includes(hi)) {
            passing.push(it(`♯${R(lo)}°7`, `Dim7 de passage ascendant entre ${R(lo)} et ${R(hi)} (notation en dièse)`));
            passing.push(it(`♭${R(hi)}°7`, `Dim7 de passage descendant entre ${R(hi)} et ${R(lo)} (notation en bémol)`));
        }
        if (diatonic.includes(r) && r !== 11) passing.push(it(`${R(r)}°7`, `Accord diminué auxiliaire (broderie) du degré ${R(r)}`));
        add('Accords de passage', passing);
    }

    // --- Accords d'approche chromatique (selon l'accord qui suit) ---
    if (next) {
        const d = mod(next.rootIndex - chord.rootIndex);
        const tn = mod(next.rootIndex - key);
        if (d === 1) add('Accords de passage', [it(`↗ ${R(tn)}`, `Accord d'approche chromatique : monte d'un demi-ton vers ${R(tn)} (${K(tn)})`)]);
        if (d === 11) add('Accords de passage', [it(`↘ ${R(tn)}`, `Accord d'approche chromatique : descend d'un demi-ton vers ${R(tn)} (${K(tn)})`)]);
    }
    return groups;
}

// Lectures proposées (functionAlternatives, écrites en chiffrage jazz et enregistrées telles quelles) mises en forme pour
// l'affichage selon la convention : chaque lecture garde `label` / `desc` d'origine et reçoit `shownLabel` / `shownDesc`.
function displayAlternatives(groups, convention, minor) {
    return groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i,
        shownLabel: convertRomanLabel(i.label, convention, minor),
        shownDesc: convertRomanText(i.desc, convention, minor) })) }));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { jazzChordNotation, chordSymbol, chordSymbolHtml, glyphHtml, localKey, localKeyInfo, localKeyMinor, localKeyScale, harmonicFunctionLabel, functionAlternatives, displayAlternatives, followingChords };
}
