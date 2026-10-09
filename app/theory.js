// theory.js — théorie musicale pure (sans DOM, sans audio) : orthographe des notes,
// gammes, accords, constructeur d'accords. Chargé par index.html via <script src="theory.js">
// et testable sous Node (voir theory.test.js).
// Aucun état global : l'orthographe choisie par l'utilisateur (les noms des 12 touches, voir
// labelsForSpelling) est passée en paramètre à chordRootName et bassNoteName.

// Noms des fondamentales. Les touches noires s'écrivent avec un dièse ou un bémol (Do#/Réb, Ré#/Mib, Fa#/Solb,
// Sol#/Lab, La#/Sib) : l'orthographe choisie est portée par un tableau de 12 noms (voir labelsForSpelling) ; les listes ci-dessous sont fixes.
const ROOT_NAMES_DEFAULT = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ROOT_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOT_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const AUDIO_ROOT_NAMES = ROOT_NAMES_DEFAULT; // noms de notes envoyés au moteur audio (jamais modifiés)
const BLACK_PCS = [1, 3, 6, 8, 10];
const DEFAULT_SPELL = 'ffsff'; // orthographe usuelle : Db Eb F# Ab Bb (un caractère s/f par touche noire)
function isValidSpell(sp) { return typeof sp === 'string' && /^[sf]{5}$/.test(sp); }
// Noms des 12 touches pour une orthographe donnée ('ffsff', un caractère s/f par touche noire).
// Fonction pure : renvoie un nouveau tableau, ne touche à aucun état global.
function labelsForSpelling(spell) {
    const sp = isValidSpell(spell) ? spell : DEFAULT_SPELL;
    const labels = ROOT_NAMES_DEFAULT.slice();
    BLACK_PCS.forEach((pc, i) => { labels[pc] = (sp[i] === 's' ? ROOT_NAMES_SHARP : ROOT_NAMES_FLAT)[pc]; });
    return labels;
}
// Inverse de labelsForSpelling : retrouve la chaîne s/f à partir des noms des 12 touches.
function spellingOfLabels(labels) { return BLACK_PCS.map(pc => (labels[pc].includes('#') ? 's' : 'f')).join(''); }
// « G# » / « Ab » / « Cb » / « E# » → numéro de demi-ton (0–11), -1 si le nom est invalide
function rootNameToIndex(name) {
    const m = /^([A-G])(##|#|bb|b)?$/.exec(String(name));
    if (!m) return -1;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    const acc = { '#': 1, '##': 2, 'b': -1, 'bb': -2 }[m[2]] || 0;
    return (((base + acc) % 12) + 12) % 12;
}
// Orthographe des touches noires la plus naturelle pour une tonalité (nom + mode) : celle de l'armure de la
// tonalité majeure parente, en prenant toujours l'enharmonique la plus simple (jamais 7 altérations ni
// doubles dièses : Ré# majeur s'écrit Mib, Sol# majeur Lab, La# majeur Sib, Do# majeur Réb, Fa# majeur Fa#,
// Sol♭ majeur Sol♭ si l'on est parti d'un bémol). Les cas à égalité (Fa#/Solb, Si/Dob) suivent l'écriture choisie.
function deriveSpelling(keyName, quality) {
    const ROT = { ionian: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, aeolian: 9, locrian: 11 };
    const pc = rootNameToIndex(keyName);
    if (pc < 0) return DEFAULT_SPELL;
    const pref = keyName.includes('#') ? 's' : (keyName.includes('b') ? 'f' : null);
    const parentPc = (((pc - (ROT[quality] || 0)) % 12) + 12) % 12;
    // Tonalité majeure parente : la plus simple (≤ 6 altérations). Fa#/Solb et Si/Dob restent au choix de l'utilisateur.
    const PARENT = { 1: 'Db', 3: 'Eb', 6: (pref === 'f' ? 'Gb' : 'F#'), 8: 'Ab', 10: 'Bb', 11: 'B' };
    const parentName = PARENT[parentPc] || ROOT_NAMES_DEFAULT[parentPc];
    const spell = DEFAULT_SPELL.split('');
    (majorScalesSpelling[parentName] || []).forEach(n => {
        const i = BLACK_PCS.indexOf(rootNameToIndex(n));
        if (i >= 0 && /[#b]/.test(n)) spell[i] = n.includes('#') ? 's' : 'f';
    });
    return spell.join('');
}

const majorScalesSpelling = {
    "C":  ["C", "D", "E", "F", "G", "A", "B"],
    "Db": ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"],
    "D":  ["D", "E", "F#", "G", "A", "B", "C#"],
    "Eb": ["Eb", "F", "G", "Ab", "Bb", "C", "D"],
    "E":  ["E", "F#", "G#", "A", "B", "C#", "D#"],
    "F":  ["F", "G", "A", "Bb", "C", "D", "E"],
    "F#": ["F#", "G#", "A#", "B", "C#", "D#", "E#"],
    "Gb": ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"],
    "G":  ["G", "A", "B", "C", "D", "E", "F#"],
    "Ab": ["Ab", "Bb", "C", "Db", "Eb", "F", "G"],
    "A":  ["A", "B", "C#", "D", "E", "F#", "G#"],
    "Bb": ["Bb", "C", "D", "Eb", "F", "G", "A"],
    "B":  ["B", "C#", "D#", "E", "F#", "G#", "A#"],
    // Tonalités « théoriques » : servent à écrire correctement les gammes/accords dont la fondamentale est Do#, Ré#, Sol#, La#
    // (ou la relative d'un mineur en bémols : La♭ mineur → Do♭ majeur)
    "C#": ["C#", "D#", "E#", "F#", "G#", "A#", "B#"],
    "D#": ["D#", "E#", "F##", "G#", "A#", "B#", "C##"],
    "G#": ["G#", "A#", "B#", "C#", "D#", "E#", "F##"],
    "A#": ["A#", "B#", "C##", "D#", "E#", "F##", "G##"],
    "Cb": ["Cb", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"]
};

// --- Orthographe : une lettre par degré, altérations choisies selon la fonction de la note ---
const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Nom de note « lettre + altération » pour un demi-ton donné ; null si plus de deux altérations seraient nécessaires.
function spellOnLetter(letter, semi) {
    let diff = ((((semi - LETTER_SEMI[letter]) % 12) + 12) % 12);
    if (diff > 6) diff -= 12;
    const acc = { 0: '', 1: '#', 2: '##', '-1': 'b', '-2': 'bb' }[diff];
    return acc === undefined ? null : letter + acc;
}
// Fondamentale d'un accord : les accords diminués construits sur une touche noire s'écrivent toujours avec
// la fondamentale dièsée (Do#°, Ré#°, Fa#°, Sol#°, La#°) pour éviter les doubles bémols (Réb°7 = Réb Fab Labb Dobb).
function chordRootName(rootIndex, chordId, labels) {
    const info = chordInfo(chordId);
    if (info && info.fam === 'dim' && BLACK_PCS.includes(rootIndex)) return ROOT_NAMES_SHARP[rootIndex];
    return labels[rootIndex];
}
// Nom de la note de basse d'un accord sur basse (C/E, A/C#, Cm/Eb…) : écrite comme la note de l'accord qu'elle est
// (tierce → lettre +2, quinte → +4, …) plutôt qu'avec l'orthographe générale de la touche.
function bassNoteName(rootIndex, chordId, bassPc, labels) {
    const rootName = chordRootName(rootIndex, chordId, labels);
    const rl = LETTER_ORDER.indexOf(rootName[0]);
    const iv = (((bassPc - rootIndex) % 12) + 12) % 12;
    const info = chordInfo(chordId);
    const aug = !!info && info.st.fifth === 's5';
    const flat5 = !!info && (info.minorish || info.st.fifth === 'b5');
    const steps = [0, 1, 1, 2, 2, 3, flat5 ? 4 : 3, 4, aug ? 4 : 5, (info && info.st.sev === 'bb7') ? 6 : 5, 6, 6];
    return spellOnLetter(LETTER_ORDER[(rl + steps[iv]) % 7], bassPc) || labels[bassPc];
}
// Rang de lettre (0 = lettre de la fondamentale … 6 = septième) d'un intervalle dans une gamme donnée.
// Les notes chromatiques de passage prennent un dièse en montant, un bémol en descendant.
function scaleLetterStep(interval, has, descending) {
    switch (interval) {
        case 0: return 0;
        case 1: case 2: return 1;
        case 3: case 4: return 2;
        case 5: return 3;
        case 6:
            if (has(5) && has(7)) return descending ? 4 : 3;      // passage 4–5 : #4 en montant, b5 en descendant
            if (has(1) && has(3) && has(4) && has(8) && has(10)) return 4;   // altérée : b5 (Solb)
            return (has(7) || (has(4) && has(8))) ? 3 : 4;         // lydien / ton-ton : #4 ; locrien, blues… : b5
        case 7: return 4;
        case 8:
            if (has(7) && has(9)) return descending ? 5 : 4;      // passage 5–6 : #5 en montant, b6 en descendant
            if (has(1) && has(3) && has(4) && has(6) && has(10)) return 5;   // altérée : b13 (Lab)
            return (has(4) && !has(7)) ? 4 : 5;                    // lydien augmenté / ton-ton : #5 ; sinon b6
        case 9: return 5;
        case 10:
            if (has(2) && has(4) && has(6) && has(8)) return 5;   // gamme par tons : La# (et non Sib après Sol#)
            return 6;
        case 11: return 6;
        case 12: return 7;
        default: return 0;
    }
}
// Notes d'une gamme : une lettre par degré (jamais deux altérations de la même lettre dans une gamme heptatonique),
// chromatismes de passage dièsés en montant et bémolisés en descendant (descending = true).
const AWKWARD_NOTE = /^(E#|B#|Cb|Fb)$|##|bb/;
function getStrictSpelledNotes(rootName, intervals, descending = false) {
    const rootSemi = Math.max(0, rootNameToIndex(rootName));
    const rootLetter = /^[A-G]/.test(rootName) ? rootName[0] : 'C';
    const rl = LETTER_ORDER.indexOf(rootLetter);
    const has = (n) => intervals.includes(n);
    const chromatic = intervals.length >= 12;
    const isAltered = has(1) && has(3) && has(4) && has(6) && has(8) && has(10);
    const sevenNotes = intervals.length === 7 && !isAltered;
    const CHROMA_UP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];   // Do Do# Ré Ré# Mi Fa Fa# Sol Sol# La La# Si
    const CHROMA_DOWN = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]; // Do Réb Ré Mib Mi Fa Solb Sol Lab La Sib Si
    const names = intervals.map((interval, idx) => {
        const semi = (rootSemi + interval) % 12;
        let step = chromatic ? (descending ? CHROMA_DOWN : CHROMA_UP)[interval % 12]
                 : (sevenNotes ? idx : scaleLetterStep(interval, has, descending));
        let name = spellOnLetter(LETTER_ORDER[(rl + step) % 7], semi);
        // note chromatique qui tomberait sur une écriture peu lisible (Si#, Mi#, Do♭, Fa♭, doubles altérations) :
        // on prend la lettre voisine (ex. Do au lieu de Si# dans la gamme de blues de Fa#, La au lieu de Si♭♭ dans l'altérée de La♭)
        if (!chromatic && !sevenNotes && [1, 3, 6, 8, 10].includes(interval) && (!name || AWKWARD_NOTE.test(name))) {
            for (const alt of [step - 1, step + 1]) {
                if (alt < 0 || alt > 6) continue;
                const altName = spellOnLetter(LETTER_ORDER[(rl + alt) % 7], semi);
                if (altName && !AWKWARD_NOTE.test(altName)) { name = altName; break; }
            }
        }
        return name || ROOT_NAMES_DEFAULT[semi];
    });
    // Gammes symétriques (tons entiers, diminuées) : si l'écriture stricte oblige à des doubles altérations,
    // on écrit avec les noms usuels de la touche (dièses si la fondamentale est dièsée, bémols sinon).
    const symmetric = (intervals.length === 6 && intervals.every((v, i) => v === i * 2))
        || (intervals.length === 8 && (intervals.join() === '0,2,3,5,6,8,9,11' || intervals.join() === '0,1,3,4,6,7,9,10'));
    if (symmetric && names.some(n => AWKWARD_NOTE.test(n))) {
        const table = rootName.includes('#') ? ROOT_NAMES_SHARP : ROOT_NAMES_FLAT;
        return intervals.map(i => (i % 12 === 0 && i > 0) ? rootName : (i === 0 ? rootName : table[(rootSemi + i) % 12]));
    }
    return names;
}

// Notes d'un accord : tierce → lettre +2, quinte → +4, septième → +6, neuvième → +1, onzième → +3, treizième → +5.
function getSpelledChordNotes(rootName, chordObj) {
    const intervals = chordObj.notes;
    const rootSemi = Math.max(0, rootNameToIndex(rootName));
    const rootLetter = /^[A-G]/.test(rootName) ? rootName[0] : 'C';
    const rl = LETTER_ORDER.indexOf(rootLetter);
    const hasDim = intervals.includes(3) && intervals.includes(6) && !intervals.includes(7);
    return intervals.map(interval => {
        let deg = 0;
        if (interval === 0) deg = 0;
        else if (interval === 1 || interval === 2) deg = 1;
        else if (interval === 3) deg = intervals.includes(4) ? 1 : 2;   // #9 au-dessus d'une tierce majeure : Ré# (et non Mi♭)
        else if (interval === 4) deg = 2;
        else if (interval === 5) deg = 3;
        else if (interval === 6) deg = intervals.includes(7) ? 3 : 4;
        else if (interval === 7) deg = 4;
        else if (interval === 8) deg = intervals.includes(7) ? 5 : 4;   // ♭13 (La♭) avec une quinte juste ; sinon #5
        else if (interval === 9) deg = hasDim ? 6 : 5;   // 7e diminuée = bb7 (Si♭♭ dans Do°7) ; sinon 6te / 13e
        else if (interval === 10 || interval === 11) deg = 6;
        const semi = (rootSemi + interval) % 12;
        return spellOnLetter(LETTER_ORDER[(rl + deg) % 7], semi) || ROOT_NAMES_DEFAULT[semi];
    });
}

function getIntervalLabel(interval, chordNotes) {
    const has = (n) => chordNotes.includes(n);
    const inChord = has(interval);
    const hasMajThird = has(4);
    const hasMinThird = has(3);
    const hasThird = hasMajThird || hasMinThird;

    switch (interval) {
        case 0:  return "1";
        case 1:  return "b9";
        case 2:  return "9";
        case 3:  
            if (inChord) return "b3";
            return (hasMajThird && has(10)) ? "#9" : "b3";
        case 4:  return "3";
        case 5:  
            return (inChord && !hasThird) ? "4" : "11";
        case 6:
            if (inChord) return has(7) ? "#11" : "b5";
            return hasMinThird ? "b5" : "#11";
        case 7:  return "5";
        case 8:  return inChord ? "#5" : "b13";
        case 9:  
            if (inChord) return (hasMinThird && has(6)) ? "bb7" : "6";
            return "13";
        case 10: return "b7";
        case 11: return "7";
        case 12: return "8";
        default: return String(interval);
    }
}

// Intervalles d'un accord rangés en montant : chaque note est placée au-dessus de la précédente
// (9, 11 et 13 deviennent 14, 17 et 21 au lieu de 2, 5 et 9), pour que l'arpège ne redescende jamais.
function stackIntervalsUp(intervals) {
    let prev = -Infinity;
    return intervals.map(iv => { let v = iv; while (v <= prev) v += 12; prev = v; return v; });
}

// Notes cibles d'un accord : tierce (ou quarte dans un accord suspendu), septième
// (ou sixte / double bémol 7 quand l'accord n'a pas de septième : 6, dim7) et quinte
// (juste, sinon diminuée, sinon augmentée). Retourne des intervalles en demi-tons.
function getTargetIntervals(chordObj) {
    if (!chordObj || !Array.isArray(chordObj.notes)) return [];
    const n = chordObj.notes;
    const has = (i) => n.includes(i);
    const targets = [];
    const thirds = [3, 4].filter(has);
    if (thirds.length) targets.push(...thirds); else if (n[1] === 5 || n[1] === 2) targets.push(n[1]); else if (has(5)) targets.push(5);   // sus4 / sus2 : la note suspendue
    const sevenths = [10, 11].filter(has);
    if (sevenths.length) targets.push(...sevenths); else if (has(9)) targets.push(9);
    if (has(7)) targets.push(7); else if (has(6)) targets.push(6); else if (has(8)) targets.push(8);
    return targets;
}

// Notes à éviter : note de la gamme située un demi-ton au-dessus d'une note essentielle de l'accord
// (fondamentale, tierce, septième). Ne sont PAS considérées comme à éviter :
//  - les altérations voulues d'une dominante ou d'un accord suspendu (b9, b13) ;
//  - la b6 / #5 au-dessus d'un accord à septième majeure (maj7, mMaj7) : couleur de quinte augmentée ;
//  - les notes de passage chromatiques des gammes bebop et blues.
// La b13 (b6) n'est à éviter que sur les accords mineurs (éolien, phrygien).
function getAvoidNotes(scaleId, chordId) {
    const avoids = [];
    const info = chordInfo(chordId);
    const sus4 = !!info && info.sus4;
    const isDom = !!info && info.fam === 'dom' && !sus4;

    // Quarte juste au-dessus de la tierce majeure
    if (['ionian', 'majorBebop', 'harmonicMajor'].includes(scaleId)) avoids.push(5);
    if (['mixolydian', 'mixolydianFlat13', 'phrygianDominant', 'mixolydianFlat9', 'dominantBebop'].includes(scaleId) && !sus4) avoids.push(5);
    // Sur un accord suspendu, c'est la tierce majeure qui frotte avec la quarte
    if (scaleId === 'mixolydian' && sus4) avoids.push(4);
    // Accords mineurs : b13 au-dessus de la quinte juste (éolien) ; phrygien : b9 et b13
    if (scaleId === 'aeolian') avoids.push(8);
    // Sur 7sus4, le phrygien donne un 7sus4(b9, b13) : ces altérations sont voulues
    if (scaleId === 'phrygian' && !sus4) { avoids.push(1); avoids.push(8); }
    if (scaleId === 'locrian') avoids.push(1);
    // Blues sur dominante : la b3 frotte contre la tierce majeure
    if (scaleId === 'bluesScale' && isDom) avoids.push(3);

    return avoids;
}

const scalesDb = {
    ionian: { name: "Ionien (Gamme majeure)", category: "Diatonique", intervals: [0, 2, 4, 5, 7, 9, 11], characteristicInterval: 11, desc: "Utilisé sur le degré I. La quarte frotte avec la tierce majeure et doit être traitée comme note de passage." },
    lydian: { name: "Lydien", category: "Diatonique / Majeur", intervals: [0, 2, 4, 6, 7, 9, 11], characteristicInterval: 6, desc: "Choix principal en jazz moderne pour éviter la quarte juste dissonante (4)." },
    lydianAug: { name: "Lydien Augmenté", category: "Mineur Mélodique", intervals: [0, 2, 4, 6, 8, 9, 11], characteristicInterval: 8, desc: "Sur Maj7#5 (degré III du mineur mélodique)." },
    harmonicMajor: { name: "Majeur Harmonique", category: "Emprunt Modal", intervals: [0, 2, 4, 5, 7, 8, 11], characteristicInterval: 8, desc: "Sert aux emprunts modaux pour apporter une couleur sombre." },
    majorBebop: { name: "Gamme Bebop Majeure", category: "Bebop", intervals: [0, 2, 4, 5, 7, 8, 9, 11], characteristicInterval: 8, desc: "Ajoute un chromatisme (la #5) entre la quinte et la sixte pour caler le phrasé rythmique sur les temps forts." },
    majorPentatonic: { name: "Pentatonique Majeure", category: "Pentatonique", intervals: [0, 2, 4, 7, 9], characteristicInterval: 9, desc: "Retire les demi-tons pour une sonorité ouverte et consonante." },
    majorBlues: { name: "Gamme Blues Majeure", category: "Blues", intervals: [0, 2, 3, 4, 7, 9], characteristicInterval: 3, desc: "Introduit la tierce mineure (blue note) comme approche chromatique de la tierce majeure." },
    dorian: { name: "Dorien", category: "Diatonique / Mineur", intervals: [0, 2, 3, 5, 7, 9, 10], characteristicInterval: 9, desc: "Degré II. La sixte majeure stabilise l'accord." },
    melodicMinor: { name: "Mineur Mélodique", category: "Mineur Mélodique", intervals: [0, 2, 3, 5, 7, 9, 11], characteristicInterval: 11, desc: "Sur mMaj7 ou m6. Accord de tonique mineur de référence." },
    aeolian: { name: "Éolien (Mineur naturel)", category: "Diatonique / Mineur", intervals: [0, 2, 3, 5, 7, 8, 10], characteristicInterval: 8, desc: "Degré VI. La b6 frotte contre la quinte, à manier avec prudence." },
    phrygian: { name: "Phrygien", category: "Diatonique / Mineur", intervals: [0, 1, 3, 5, 7, 8, 10], characteristicInterval: 1, desc: "Degré III. Très dissonant." },
    harmonicMinor: { name: "Mineur Harmonique", category: "Mineur Harmonique", intervals: [0, 2, 3, 5, 7, 8, 11], characteristicInterval: 11, desc: "Sur mMaj7 avec une couleur classique marquée." },
    minorBebop: { name: "Bebop Mineure (Dorienne)", category: "Bebop", intervals: [0, 2, 3, 5, 7, 9, 10, 11], characteristicInterval: 11, desc: "Ajoute la septième majeure comme chromatisme de passage vers la tonique." },
    minorPentatonic: { name: "Pentatonique Mineure", category: "Pentatonique", intervals: [0, 3, 5, 7, 10], characteristicInterval: 3, desc: "Choix standard, élimine les risques de frottements." },
    bluesScale: { name: "Gamme Blues", category: "Pentatonique / Blues", intervals: [0, 3, 5, 6, 7, 10], characteristicInterval: 6, desc: "L'ajout de la blue note crée de la tension sans changer la nature mineure. Sur dominante, la b3 frotte contre la tierce." },
    mixolydian: { name: "Mixolydien", category: "Diatonique / Dominant", intervals: [0, 2, 4, 5, 7, 9, 10], characteristicInterval: 10, desc: "Sur un V7 classique non altéré (tensions 9, 13)." },
    lydianDominant: { name: "Lydien Dominant (Lydien b7)", category: "Mineur Mélodique", intervals: [0, 2, 4, 6, 7, 9, 10], characteristicInterval: 6, desc: "Pour les V7 qui ne résolvent pas en quinte juste (Substituts tritoniques, bVII7)." },
    altered: { name: "Altéré (Super Locrien)", category: "Mineur Mélodique", intervals: [0, 1, 3, 4, 6, 8, 10], characteristicInterval: 1, desc: "Pour V7 résolvant sur un I. Contient toutes les altérations (b9, #9, #11, b13)." },
    mixolydianFlat13: { name: "Mixolydien b13", category: "Mineur Mélodique", intervals: [0, 2, 4, 5, 7, 8, 10], characteristicInterval: 8, desc: "5ème mode du mineur mélodique." },
    phrygianDominant: { name: "Phrygien Dominant", category: "Mineur Harmonique", intervals: [0, 1, 4, 5, 7, 8, 10], characteristicInterval: 1, desc: "For V7 vers un accord mineur." },
    mixolydianFlat9: { name: "Mixolydien b9", category: "Majeur Harmonique", intervals: [0, 1, 4, 5, 7, 9, 10], characteristicInterval: 1, desc: "5ème mode du majeur harmonique." },
    dominantBebop: { name: "Bebop Dominante", category: "Bebop", intervals: [0, 2, 4, 5, 7, 9, 10, 11], characteristicInterval: 11, desc: "Chromatisme entre la septième mineure et la fondamentale." },
    halfWholeDim: { name: "Demi-Ton / Ton (Octatonique)", category: "Symétrique", intervals: [0, 1, 3, 4, 6, 7, 9, 10], characteristicInterval: 1, desc: "Sur accords 7b9 ou 7#9, garde la quinte juste et la 13e majeure." },
    wholeTone: { name: "Par Tons (Hexatonique)", category: "Symétrique", intervals: [0, 2, 4, 6, 8, 10], characteristicInterval: 6, desc: "Sur les accords 7#5 (dominantes sans 9ème altérée)." },
    locrianSharp2: { name: "Locrien bécarre 2", category: "Mineur Mélodique", intervals: [0, 2, 3, 5, 6, 8, 10], characteristicInterval: 2, desc: "Choix moderne par défaut sur le degré II d'un ii-V-I mineur. La seconde majeure sonne mieux que la b2." },
    locrian: { name: "Locrien", category: "Diatonique", intervals: [0, 1, 3, 5, 6, 8, 10], characteristicInterval: 6, desc: "Degré VII de la gamme majeure." },
    minorPentatonicFlat5: { name: "Pentatonique mineure b5", category: "Pentatonique", intervals: [0, 3, 5, 6, 10], characteristicInterval: 6, desc: "Version allégée du Locrien." },
    wholeHalfDim: { name: "Ton / Demi-Ton (Octatonique)", category: "Symétrique", intervals: [0, 2, 3, 5, 6, 8, 9, 11], characteristicInterval: 9, desc: "Option principale, couvre la structure symétrique de l'accord diminué et ajoute une note d'approche." }
};

const chordTypes = {
    maj: [
        { id: "majTriad", name: "maj", fullName: "Triade majeure", notes: [0, 4, 7], scales: [{ id: "ionian", role: "Principal" }, { id: "lydian", role: "Alternative" }, { id: "majorPentatonic", role: "Consonance" }] },
        { id: "maj7", name: "maj7", fullName: "Majeur 7", notes: [0, 4, 7, 11], scales: [{ id: "lydian", role: "Principal (Moderne)" }, { id: "ionian", role: "Degré I" }, { id: "harmonicMajor", role: "Emprunt sombre" }, { id: "majorBebop", role: "Rythmique Bebop" }, { id: "majorPentatonic", role: "Consonance ouverte" }, { id: "majorBlues", role: "Approche bluesy" }] },
        { id: "maj9", name: "maj9", fullName: "Majeur 9", notes: [0, 4, 7, 11, 2], scales: [{ id: "lydian", role: "Principal" }, { id: "ionian", role: "Degré I" }] },
        { id: "6", name: "6", fullName: "Sixte", notes: [0, 4, 7, 9], scales: [{ id: "ionian", role: "Principal" }, { id: "lydian", role: "Moderne" }, { id: "majorBebop", role: "Bebop" }, { id: "majorPentatonic", role: "Consonance" }, { id: "majorBlues", role: "Bluesy" }] },
        { id: "maj7sharp11", name: "maj7(#11)", fullName: "Majeur 7 dièse 11", notes: [0, 4, 7, 11, 6], scales: [{ id: "lydian", role: "Principal" }, { id: "lydianAug", role: "Avancé" }] },
        { id: "maj7sharp5", name: "maj7(#5)", fullName: "Majeur 7 quinte augmentée", notes: [0, 4, 8, 11], scales: [{ id: "lydianAug", role: "Principal (Degré III du mineur mélodique)" }, { id: "majorBebop", role: "Alternative" }] }
    ],
    min: [
        { id: "minTriad", name: "m", fullName: "Triade mineure", notes: [0, 3, 7], scales: [{ id: "dorian", role: "Principal" }, { id: "aeolian", role: "Naturel" }, { id: "minorPentatonic", role: "Consonance" }] },
        { id: "m7", name: "m7", fullName: "Mineur 7", notes: [0, 3, 7, 10], scales: [{ id: "dorian", role: "Principal (Degré II)" }, { id: "aeolian", role: "Degré VI (b6 frotte)" }, { id: "phrygian", role: "Degré III (Dissonant)" }, { id: "minorBebop", role: "Approche Bebop" }, { id: "minorPentatonic", role: "Sans frottements" }, { id: "bluesScale", role: "Tension Blues" }] },
        { id: "m9", name: "m9", fullName: "Mineur 9", notes: [0, 3, 7, 10, 2], scales: [{ id: "dorian", role: "Principal" }, { id: "aeolian", role: "Secondaire" }, { id: "minorBebop", role: "Bebop" }] },
        { id: "m11", name: "m11", fullName: "Mineur 11", notes: [0, 3, 7, 10, 2, 5], scales: [{ id: "dorian", role: "Principal" }, { id: "aeolian", role: "Naturel" }] },
        { id: "mmaj7", name: "m(maj7)", fullName: "Mineur-Majeur 7", notes: [0, 3, 7, 11], scales: [{ id: "melodicMinor", role: "Principal (Tonique mineure)" }, { id: "harmonicMinor", role: "Classique marqué" }] }
    ],
    dom: [
        { id: "7", name: "7", fullName: "Dominante 7", notes: [0, 4, 7, 10], scales: [{ id: "mixolydian", role: "Principal (Non altéré)" }, { id: "lydianDominant", role: "Sans résolution juste" }, { id: "mixolydianFlat13", role: "Tendu (b13)" }, { id: "dominantBebop", role: "Bebop" }, { id: "bluesScale", role: "Blues/Rock/Funk" }, { id: "mixolydianFlat9", role: "Mixolydien b9 (Spécifique)" }] },
        { id: "9", name: "9", fullName: "Dominante 9", notes: [0, 4, 7, 10, 2], scales: [{ id: "mixolydian", role: "Principal" }, { id: "lydianDominant", role: "Recommandé (#11)" }, { id: "dominantBebop", role: "Bebop" }] },
        { id: "7alt", name: "7alt", fullName: "Dominante Altérée", notes: [0, 4, 6, 10], scales: [{ id: "altered", role: "Principal (Résout sur I)" }, { id: "halfWholeDim", role: "Alternative" }] },
        { id: "7b9", name: "7(b9)", fullName: "Dominante 9 mineure", notes: [0, 4, 7, 10, 1], scales: [{ id: "halfWholeDim", role: "Principal (Symétrique)" }, { id: "phrygianDominant", role: "Vers accord mineur" }] },
        { id: "7sharp5", name: "7(#5)", fullName: "Dominante 7 quinte aug", notes: [0, 4, 8, 10], scales: [{ id: "wholeTone", role: "Principal (Ton par ton)" }, { id: "altered", role: "Altéré" }] }
    ],
    other: [
        { id: "dimTriad", name: "dim", fullName: "Triade diminuée", notes: [0, 3, 6], scales: [{ id: "wholeHalfDim", role: "Principal" }] },
        { id: "augTriad", name: "aug", fullName: "Triade augmentée", notes: [0, 4, 8], scales: [{ id: "wholeTone", role: "Principal" }, { id: "lydianAug", role: "Alternative" }] },
        { id: "m7b5", name: "m7b5", fullName: "Semi-diminué (Half-dim)", notes: [0, 3, 6, 10], scales: [{ id: "locrianSharp2", role: "Principal Moderne (Degré II)" }, { id: "locrian", role: "Classique (Degré VII)" }, { id: "minorPentatonicFlat5", role: "Allégé" }] },
        { id: "dim7", name: "dim7", fullName: "Diminué 7", notes: [0, 3, 6, 9], scales: [{ id: "wholeHalfDim", role: "Principal (Couvre la structure symétrique)" }] },
        { id: "7sus4", name: "7sus4", fullName: "Dominante Suspendue", notes: [0, 5, 7, 10], scales: [{ id: "mixolydian", role: "Principal" }, { id: "dorian", role: "Aérien" }, { id: "phrygian", role: "Modal / Sus4 b9" }] }
    ]
};

// ===== Accords composés (mode « Construire » de l'éditeur de mesure) =====
// Un accord composé se décrit par { third, fifth, sev, ext } :
//   third : 'M' (tierce majeure) | 'm' (mineure) | 'sus4' | 'sus2'
//   fifth : 'P' (juste) | 'b5' | 's5'
//   sev   : '' (aucune) | '6' | 'b7' | 'M7' | 'bb7' (septième diminuée, réservée à m + ♭5)
//   ext   : tensions parmi b9, 9, s9 (#9), 11, s11 (#11), b13, 13
// Les combinaisons qui existent au catalogue réutilisent l'identifiant du catalogue (donc ses gammes et son vocabulaire) ;
// toutes les autres reçoivent un identifiant canonique « x:tierce:quinte:septième:tensions » (ex. x:M:P:b7:b9,s11),
// enregistré à la demande par lookupChord() (grilles sauvegardées et importées comprises).
const CB_THIRD = { M: 4, m: 3, sus4: 5, sus2: 2 };
const CB_FIFTH = { P: 7, b5: 6, s5: 8 };
const CB_SEV = { '': null, '6': 9, b7: 10, M7: 11, bb7: 9 };
const CB_EXT = { b9: 1, '9': 2, s9: 3, '11': 5, s11: 6, b13: 8, '13': 9 };
const CB_EXT_ORDER = ['b9', '9', 's9', '11', 's11', 'b13', '13'];
const CB_EXT_LABEL = { b9: '♭9', '9': '9', s9: '#9', '11': '11', s11: '#11', b13: '♭13', '13': '13' };
// tensions qui se heurtent d'un demi-ton : on n'en garde qu'une (b9 et #9 peuvent coexister, comme dans l'altéré)
const CB_EXT_CLASH = { b9: ['9'], '9': ['b9', 's9'], s9: ['9'], '11': ['s11'], s11: ['11'], b13: ['13'], '13': ['b13'] };
const CB_CATALOG_KEYS = {
    majTriad: 'M|P||', maj7: 'M|P|M7|', maj9: 'M|P|M7|9', '6': 'M|P|6|', maj7sharp11: 'M|P|M7|s11', maj7sharp5: 'M|s5|M7|',
    minTriad: 'm|P||', m7: 'm|P|b7|', m9: 'm|P|b7|9', m11: 'm|P|b7|9,11', mmaj7: 'm|P|M7|',
    '7': 'M|P|b7|', '9': 'M|P|b7|9', '7alt': 'M|b5|b7|', '7b9': 'M|P|b7|b9', '7sharp5': 'M|s5|b7|',
    dimTriad: 'm|b5||', augTriad: 'M|s5||', m7b5: 'm|b5|b7|', dim7: 'm|b5|bb7|', '7sus4': 'sus4|P|b7|'
};
const CB_KEY_TO_CATALOG = {};
Object.keys(CB_CATALOG_KEYS).forEach(id => { CB_KEY_TO_CATALOG[CB_CATALOG_KEYS[id]] = id; });
const cbHas = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Ramène un état à sa forme canonique (valeurs inconnues → défaut, doublons et chocs de tensions écartés)
function cbNormalize(st) {
    st = st || {};
    const third = cbHas(CB_THIRD, st.third) ? st.third : 'M';
    const fifth = cbHas(CB_FIFTH, st.fifth) ? st.fifth : 'P';
    let sev = cbHas(CB_SEV, st.sev) ? st.sev : '';
    if (sev === '6' && third === 'm' && fifth === 'b5') sev = 'bb7';          // m6♭5 = °7 (mêmes notes)
    if (sev === 'bb7' && !(third === 'm' && fifth === 'b5')) sev = 'b7';
    const want = Array.isArray(st.ext) ? st.ext : [];
    const used = cbStructIntervals({ third, fifth, sev });
    const ext = [];
    CB_EXT_ORDER.forEach(k => {
        if (!want.includes(k) || used.includes(CB_EXT[k])) return;           // déjà dans l'accord (ex. 13 sur une sixte)
        if (ext.some(o => CB_EXT_CLASH[k].includes(o))) return;
        ext.push(k);
    });
    return { third, fifth, sev, ext };
}
function cbStructIntervals(st) {
    const n = [0, CB_THIRD[st.third], CB_FIFTH[st.fifth]];
    if (st.sev) n.push(CB_SEV[st.sev]);
    return n;
}
// Notes de l'accord (demi-tons) : [fondamentale, tierce, quinte, septième?, ...tensions croissantes]
function cbNotes(st) { return cbStructIntervals(st).concat(st.ext.map(k => CB_EXT[k])); }
function cbKey(st) { return `${st.third}|${st.fifth}|${st.sev}|${st.ext.join(',')}`; }
function cbParseKey(key) {
    const p = key.split('|');
    return cbNormalize({ third: p[0], fifth: p[1], sev: p[2], ext: p[3] ? p[3].split(',') : [] });
}
// Identifiant d'un état : celui du catalogue s'il existe, sinon l'identifiant canonique x:…
function cbId(st) {
    st = cbNormalize(st);
    return CB_KEY_TO_CATALOG[cbKey(st)] || `x:${st.third}:${st.fifth}:${st.sev || '-'}:${st.ext.join(',') || '-'}`;
}
// État décrit par un identifiant (catalogue ou x:…) ; null si l'identifiant est inconnu
function cbStateOfId(id) {
    if (typeof id !== 'string') return null;
    if (cbHas(CB_CATALOG_KEYS, id)) return cbParseKey(CB_CATALOG_KEYS[id]);
    if (!id.startsWith('x:')) return null;
    const p = id.split(':');
    if (p.length !== 5) return null;
    return cbNormalize({ third: p[1], fifth: p[2], sev: p[3] === '-' ? '' : p[3], ext: p[4] === '-' ? [] : p[4].split(',') });
}
// Famille de l'accord : maj, min, dom, hdim (demi-diminué), dim, aug
function cbFamily(st) {
    if (st.third === 'm' && st.fifth === 'b5') return st.sev === 'b7' ? 'hdim' : 'dim';
    if (st.third === 'm') return 'min';
    if (st.sev === 'b7') return 'dom';
    if (st.third === 'M' && st.fifth === 's5' && st.sev === '') return 'aug';
    return 'maj';
}
const CB_INFO_CACHE = new Map();
// Description structurelle d'un accord quel que soit son identifiant : { st, fam, minorish, sus4 } ; null si inconnu
function chordInfo(id) {
    if (CB_INFO_CACHE.has(id)) return CB_INFO_CACHE.get(id);
    const st = cbStateOfId(id);
    if (!st) return null;
    const info = { st, fam: cbFamily(st), minorish: st.third === 'm', sus4: st.third === 'sus4' };
    CB_INFO_CACHE.set(id, info);
    return info;
}

// Symbole sans la fondamentale, en notation jazz de l'application (Δ, −7, ø, °, # en ASCII, ♭ en glyphe)
function cbSuffix(st) {
    const { third, fifth, sev } = st;
    let rest = st.ext.slice();
    const labels = (arr) => arr.map(k => CB_EXT_LABEL[k]);
    const paren = (arr) => arr.length ? `(${arr.join(',')})` : '';
    if (third === 'm' && fifth === 'b5') {   // la quinte ♭5 est contenue dans le symbole
        const base = { '': 'dim', b7: 'ø', bb7: '°', M7: '−Δ7(♭5)' }[sev] || 'dim';
        return base + paren(labels(rest));
    }
    const alts = [];
    if (fifth === 'b5') alts.push('♭5');
    let aug = false;
    if (fifth === 's5') { if (third === 'M' && sev === '') aug = true; else alts.push('#5'); }
    const minor = third === 'm';
    const sus = third === 'sus4' ? 'sus4' : (third === 'sus2' ? 'sus2' : '');
    let num = '';
    let add = '';
    if (sev === 'b7' || sev === 'M7') {
        // 9, 11, 13 empilées : le plus haut chiffre remplace le 7 (C9, C11, C13, CΔ9)
        let top = '7';
        if (rest.includes('9')) {
            top = rest.includes('13') ? '13' : (rest.includes('11') ? '11' : '9');
            rest = rest.filter(k => k !== '9' && k !== top);
        }
        num = sev === 'M7' ? (top === '7' ? (minor ? 'Δ7' : 'Δ') : 'Δ' + top) : top;
    } else if (sev === '6') {
        num = '6';
        if (rest.includes('9')) { num = '6/9'; rest = rest.filter(k => k !== '9'); }
    } else if (rest.length && !sus && !aug) {
        const l = labels(rest);
        add = 'add' + (l.length === 1 ? l[0] : `(${l.join(',')})`);
        rest = [];
    }
    const quality = aug ? 'aug' : (minor ? (num === '' ? 'm' : '−') : '') + num;
    return `${quality}${sus}${add}${paren([...alts, ...labels(rest)])}`;
}
function cbFullName(st) {
    const T = { M: 'tierce majeure', m: 'tierce mineure', sus4: 'quarte (sus4)', sus2: 'seconde (sus2)' };
    const F = { P: 'quinte juste', b5: 'quinte diminuée', s5: 'quinte augmentée' };
    const S = { '6': 'sixte', b7: 'septième mineure', M7: 'septième majeure', bb7: 'septième diminuée' };
    return [T[st.third], F[st.fifth], st.sev ? S[st.sev] : '', st.ext.length ? st.ext.map(k => CB_EXT_LABEL[k]).join(', ') : ''].filter(Boolean).join(' · ');
}

// Gammes proposées pour un accord composé : celles qui contiennent toutes ses notes (à défaut, le moins de notes manquantes),
// classées par notes à éviter (demi-ton au-dessus d'une note essentielle) puis par ordre de préférence de la famille.
const CB_SCALE_PREF = {
    maj: ['ionian', 'lydian', 'majorPentatonic', 'harmonicMajor', 'majorBebop', 'majorBlues', 'lydianAug'],
    min: ['dorian', 'aeolian', 'melodicMinor', 'minorPentatonic', 'minorBebop', 'harmonicMinor', 'phrygian', 'bluesScale'],
    dom: ['mixolydian', 'lydianDominant', 'dominantBebop', 'mixolydianFlat13', 'bluesScale', 'mixolydianFlat9', 'phrygianDominant', 'halfWholeDim', 'altered', 'wholeTone'],
    hdim: ['locrianSharp2', 'locrian', 'minorPentatonicFlat5'],
    dim: ['wholeHalfDim', 'halfWholeDim'],
    aug: ['wholeTone', 'lydianAug', 'altered']
};
function cbSuggestScales(st) {
    const fam = cbFamily(st);
    const notes = cbNotes(st);
    const pcs = new Set(notes.map(n => n % 12));
    const has = (k) => st.ext.includes(k);
    const sus = st.third === 'sus4' || st.third === 'sus2';
    let pref;
    if (sus) pref = fam === 'dom' ? ['mixolydian', 'dorian', 'phrygian', 'dominantBebop', 'mixolydianFlat9'] : ['mixolydian', 'dorian', 'ionian', 'majorPentatonic', 'aeolian', 'lydian'];
    else pref = CB_SCALE_PREF[fam].slice();
    const boost = [];
    if (sus) {
        if (has('b9')) boost.push('phrygian', 'mixolydianFlat9');
    } else if (fam === 'dom') {
        if (has('b9')) boost.push('halfWholeDim', 'phrygianDominant', 'mixolydianFlat9');
        if (has('s9') || st.fifth === 'b5') boost.push('altered', 'halfWholeDim');
        if (has('s11')) boost.push('lydianDominant');
        if (has('b13')) boost.push('mixolydianFlat13', 'altered');
        if (st.fifth === 's5') boost.push('wholeTone', 'altered');
    } else if (fam === 'maj') {
        if (has('s11')) boost.push('lydian', 'lydianAug');
        if (st.fifth === 's5') boost.push('lydianAug');
    } else if (fam === 'min') {
        if (st.sev === 'M7') boost.push('melodicMinor', 'harmonicMinor');
        if (has('b13')) boost.push('aeolian');
    }
    const order = [...new Set([...boost, ...pref])];
    const guides = new Set([0, notes[1] % 12]);
    if (st.sev === 'b7' || st.sev === 'M7') guides.add(CB_SEV[st.sev]);
    if (st.fifth === 'P') guides.add(7);
    const exempt = new Set();
    if (fam === 'dom') { exempt.add(1); exempt.add(8); }       // ♭9 et ♭13 : altérations voulues d'une dominante
    if (st.sev === 'M7') exempt.add(8);                         // ♭6 / #5 au-dessus d'une septième majeure : couleur de quinte augmentée
    const rows = Object.keys(scalesDb).map(id => {
        const iv = scalesDb[id].intervals.map(n => n % 12);
        const set = new Set(iv);
        let missing = 0;
        pcs.forEach(p => { if (!set.has(p)) missing++; });
        let pen = 0;
        iv.forEach(n => { if (!pcs.has(n) && guides.has((n + 11) % 12) && !exempt.has(n)) pen++; });
        if (st.third === 'sus4' && set.has(4)) pen++;           // la tierce majeure frotte contre la quarte
        const idx = order.indexOf(id);
        return { id, missing, pen, rank: missing * 10 + pen * 3 + (idx < 0 ? 30 : idx) };
    });
    const minMissing = Math.min(...rows.map(r => r.missing));
    return rows.filter(r => r.missing === minMissing).sort((a, b) => a.rank - b.rank).slice(0, 6).map((r, i) => ({
        id: r.id,
        role: i === 0 ? 'Suggérée' : (r.missing ? 'Ne couvre pas toutes les notes' : (r.pen ? 'Contient une note à éviter' : 'Alternative'))
    }));
}

const builtChords = new Map();
function cbMakeChord(id, st) {
    const suffix = cbSuffix(st);
    return { id, name: suffix || 'maj', fullName: cbFullName(st), notes: cbNotes(st), scales: cbSuggestScales(st), built: true, jazz: suffix };
}
// Accord du catalogue, ou accord composé (enregistré à la première demande) ; null si l'identifiant est inconnu
function lookupChord(id) {
    for (const cat in chordTypes) {
        const found = chordTypes[cat].find(c => c.id === id);
        if (found) return found;
    }
    if (typeof id !== 'string') return null;
    const hit = builtChords.get(id);
    if (hit) return hit;
    if (!id.startsWith('x:')) return null;
    const st = cbStateOfId(id);
    if (!st || cbId(st) !== id) return null;      // forme non canonique, ou accord déjà présent au catalogue
    const obj = cbMakeChord(id, st);
    builtChords.set(id, obj);
    return obj;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROOT_NAMES_DEFAULT,
        ROOT_NAMES_SHARP,
        ROOT_NAMES_FLAT,
        AUDIO_ROOT_NAMES,
        BLACK_PCS,
        DEFAULT_SPELL,
        isValidSpell,
        labelsForSpelling,
        spellingOfLabels,
        rootNameToIndex,
        deriveSpelling,
        majorScalesSpelling,
        LETTER_SEMI,
        LETTER_ORDER,
        spellOnLetter,
        chordRootName,
        bassNoteName,
        scaleLetterStep,
        AWKWARD_NOTE,
        getStrictSpelledNotes,
        getSpelledChordNotes,
        getIntervalLabel,
        stackIntervalsUp,
        getTargetIntervals,
        getAvoidNotes,
        scalesDb,
        chordTypes,
        CB_THIRD,
        CB_FIFTH,
        CB_SEV,
        CB_EXT,
        CB_EXT_ORDER,
        CB_EXT_LABEL,
        CB_EXT_CLASH,
        CB_CATALOG_KEYS,
        CB_KEY_TO_CATALOG,
        cbHas,
        cbNormalize,
        cbStructIntervals,
        cbNotes,
        cbKey,
        cbParseKey,
        cbId,
        cbStateOfId,
        cbFamily,
        CB_INFO_CACHE,
        chordInfo,
        cbSuffix,
        cbFullName,
        CB_SCALE_PREF,
        cbSuggestScales,
        builtChords,
        cbMakeChord,
        lookupChord
    };
}
