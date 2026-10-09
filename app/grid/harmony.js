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
    var { romanDeg, chordFamily } = require('./generation.js');
}

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

// Version HTML du symbole pour la grille : les caractères absents de la police Kalam (Δ, ♭)
// sont isolés dans un <span> afin que le téléphone puisse leur imposer une police qui les contient.
function chordSymbolHtml(chord, rootLabels) {
    return chordSymbol(chord, rootLabels).replace(/[Δ♭]/g, (c) => `<span class="jam-glyph">${c}</span>`);
}

// Tonalité en vigueur à une mesure (et une moitié de mesure) : celle du dernier marqueur de modulation
// (modKey, posé quand l'utilisateur choisit une lecture « I de X », « IV de X », etc.) rencontré en
// remontant la grille, sinon la tonalité de la grille. excludeSelf : ignore le marqueur du bloc lui-même
// (tonalité qui précède cet accord, base des lectures proposées).
function localKey(flatMeasures, index, half = 0, excludeSelf = false, mainKey = 0) {
    const fallback = { root: mainKey, minor: false };
    if (!Array.isArray(flatMeasures) || !flatMeasures.length || !(index >= 0)) return fallback;
    const i0 = Math.min(index, flatMeasures.length - 1);
    const selfStep = flatMeasures[i0].stepIndex;
    for (let j = i0; j >= 0; j--) {
        const m = flatMeasures[j];
        const own = excludeSelf && m.stepIndex === selfStep;
        // marqueur de la 2e moitié de mesure : en vigueur seulement pour elle-même (2e moitié) ou pour les mesures suivantes
        if (m.split && m.split.modKey && (j < i0 || half === 1) && !own) return { root: m.split.modKey.root, minor: !!m.split.modKey.minor };
        // marqueur du bloc : sauf le sien propre, sauf pour la 2e moitié de la mesure qu'il marque
        if (m.modKey && (!own || (half === 1 && j === i0))) return { root: m.modKey.root, minor: !!m.modKey.minor };
    }
    return fallback;
}

function harmonicFunctionLabel(measure, flatMeasures, index, half = 0, keyOverride = null, mainKey = 0) {
    if (measure.fnLabel) return measure.fnLabel; // fonction choisie par l'utilisateur
    const tonic = Number.isInteger(keyOverride) ? keyOverride : localKey(flatMeasures, index, half, false, mainKey).root;
    const root = ((measure.rootIndex - tonic) % 12 + 12) % 12;
    const chordId = measure.chordId || '';
    // Degré chromatique exact (♭II, ♭III, ♭VI, ♭VII… et non « #I », « #II », « #V », « #VI ») ;
    // majuscule pour les accords majeurs / dominants, minuscule pour les mineurs et diminués ;
    // ø = demi-diminué (m7♭5), ° = diminué (triade ou septième diminuée).
    const cinfo = HARM_THEORY.chordInfo(chordId);
    const lowerCase = !!cinfo && cinfo.minorish;
    let degreeLabel = romanDeg(root, lowerCase);
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
            if (d === 5) return targetRoot === 0 ? 'V' : `V/${romanDeg(targetRoot, targetMinor)}`; // dominante qui résout une quarte plus haut
            if (d === 11) return targetRoot === 0 ? 'subV' : `subV/${romanDeg(targetRoot, targetMinor)}`; // substitut de triton : résolution par demi-ton descendant
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

// Lectures possibles d'un accord dans la tonalité de la grille : degré diatonique, dominantes secondaires,
// substitutions, emprunts modaux, accords de passage / chromatisme et modulations.
// next : accord de la mesure suivante (pour les accords d'approche chromatique), ou null.
function functionAlternatives(chord, next = null, keyOverride = null, env = {}) {
    const { mainKey, rootLabels } = env;
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
        add('Dominantes', [
            r === 7 ? it('V' + suf, 'Dominante principale : tend vers la tonique I') : null,
            r !== 7 ? it(`V${suf}/${R(tSec)}`, `Dominante secondaire (tonicisation) : résout sur ${R(tSec)} (${K(tSec)}), une quinte plus bas`) : null
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
        add('Degré', [it(degreeInfo[0], degreeInfo[1])]);
        const tIi = mod(r - 2);
        if (r !== 2) add('Dominantes secondaires', [it(`ii/${R(tIi)}`, `Le ii d'un ii–V secondaire : mène à V7/${R(tIi)} puis ${R(tIi)} (${K(tIi)})`)]);
        const pivots = [
            [mod(r + 10), 'ii', `ii de ${K(r + 10)}`, 'sous-dominante'],
            [mod(r + 8), 'iii', `iii de ${K(r + 8)}`, 'tonique relative'],
            [mod(r + 3), 'vi', `vi de ${K(r + 3)}`, 'relatif mineur']
        ].filter(x => x[0] !== 0).map(x => it(x[2], `Modulation (accord pivot) : ${x[1]} de ${K(x[0])}, rôle de ${x[3]} dans la nouvelle tonalité`, mk(x[0])));
        add('Modulation', [...pivots, r !== 0 ? it(`i (${K(r)}m)`, `Modulation en ${K(r)} mineur : cet accord en devient la tonique`, mk(r, true)) : null]);
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
        add('Degré', [it(degreeInfo[0], degreeInfo[1])]);
        const tIv = mod(r + 7), tV = mod(r + 5);
        add('Modulation', [
            r !== 0 ? it(`I de ${K(r)}`, `Modulation : cet accord devient la tonique de ${K(r)} majeur`, mk(r)) : null,
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { jazzChordNotation, chordSymbol, chordSymbolHtml, localKey, harmonicFunctionLabel, functionAlternatives };
}
