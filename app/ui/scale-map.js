// ui/scale-map.js — onglet « Carte » de l'Entraînement, sans DOM : toutes les gammes harmonisées dans lesquelles l'accord
// construit est présent (ex. CΔ est le I de Do majeur, le IV de Sol majeur, le ♭III de La éolien…), avec son chiffrage et
// sa fonction tonale, de la gamme la plus courante à la moins courante. Chaque gamme est harmonisée en entier, comme dans
// l'onglet Harmonisation (ui/scale-harmony.js) ; l'accord cherché y est écrit en noir sur fond blanc, chiffrage en rouge,
// comme sur la grille de la Jam. Le moteur (ChordScaleApp.renderScales) ne fait que brancher les clics et le son.
// Chargé par index.html via <script src="app/ui/scale-map.js"> (après ui/scale-harmony.js) et testé par ui/scale-map.test.js.
//
// Quand un accord est-il « présent » dans une gamme ? Il faut (1) que sa fondamentale soit un degré de la gamme, (2) que toutes
// ses notes (tensions comprises : 9, ♯11, 13…) soient dans la gamme, et (3) que sa structure (tierce, quinte, septième) soit
// celle de l'accord que donnent les tierces superposées sur ce degré : CΔ9 est donc le I de Do majeur, mais C7alt n'est
// l'harmonisation d'aucune gamme (il n'y a pas de tierce à la fois majeure et quinte diminuée sur un degré). Les accords
// suspendus (sus2, sus4) n'ont pas d'équivalent par tierces : seules (1) et (2) comptent, l'accord affiché est celui du degré.

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const SM_T = (typeof getStrictSpelledNotes !== 'undefined')
    ? { getStrictSpelledNotes, chordInfo, scalesDb, AWKWARD_NOTE, ROOT_NAMES_SHARP, ROOT_NAMES_FLAT }
    : require('../theory.js');
if (typeof scaleHarmony === 'undefined' && typeof require === 'function') {
    var { scaleHarmony } = require('./scale-harmony.js');
}
if (typeof glyphHtml === 'undefined' && typeof require === 'function') {
    var { glyphHtml } = require('../grid/harmony.js');
}

// Gammes de sept notes harmonisées, de la plus courante à la moins courante. C'est l'ordre d'affichage des cartes ;
// pour retirer une gamme de la Carte, il suffit de l'ôter de cette liste.
const SM_SCALE_ORDER = [
    'ionian', 'aeolian', 'harmonicMinor', 'melodicMinor', 'mixolydian', 'dorian', 'lydian', 'phrygian', 'phrygianDominant',
    'locrian', 'lydianDominant', 'altered', 'locrianSharp2', 'harmonicMajor', 'mixolydianFlat13', 'mixolydianFlat9', 'lydianAug'
];
// Pour une même gamme (plusieurs tonalités la contiennent), les degrés les plus structurants d'abord : I, V, IV, II, VI, III, VII
// en tonalité à tierce majeure ; I, IV, V, III, VII, VI, II en tonalité à tierce mineure.
const SM_DEGREE_ORDER = { major: [0, 4, 3, 1, 5, 2, 6], minor: [0, 3, 4, 2, 6, 5, 1] };

// Fonction tonale du degré (rang 0 à 6 dans la gamme). Convention des degrés : tonique = I, III, VI ; sous-dominante = II, IV ;
// dominante = V, VII. En tonalité à tierce mineure, le VI (sus-dominante) joue la sous-dominante.
const SM_FN = {
    T: { key: 'T', name: 'Tonique' },
    SD: { key: 'SD', name: 'Sous-dominante' },
    D: { key: 'D', name: 'Dominante' }
};
function scaleMapFunction(degree, minorThird) {
    const keys = ['T', 'SD', 'T', 'SD', 'D', minorThird ? 'SD' : 'T', 'D'];
    return SM_FN[keys[degree]] || SM_FN.T;
}

// Nom de la tonique le plus lisible pour la gamme : celui qui évite les notes malcommodes (E#, Cb, doubles altérations) et les
// altérations en excès (Ré# majeur s'écrit Mi♭) ; à égalité, l'écriture choisie par l'utilisateur (rootLabels, 12 noms).
function scaleMapTonicName(tonic, scale, rootLabels) {
    const labels = rootLabels || SM_T.ROOT_NAMES_FLAT;
    const names = [labels[tonic], SM_T.ROOT_NAMES_SHARP[tonic], SM_T.ROOT_NAMES_FLAT[tonic]].filter((n, i, a) => a.indexOf(n) === i);
    let best = names[0], bestScore = Infinity;
    names.forEach(name => {
        const spelled = SM_T.getStrictSpelledNotes(name, scale);
        const score = spelled.reduce((s, n) => s + (SM_T.AWKWARD_NOTE.test(n) ? 10 : 0) + (n.match(/[#b]/g) || []).length, 0);
        if (score < bestScore) { best = name; bestScore = score; }
    });
    return best;
}

// La structure de l'accord cherché est-elle celle de l'accord du degré (tierces superposées) ?
function smSameCore(st, hst) {
    if (st.third === 'sus2' || st.third === 'sus4') return true;
    if (st.third !== hst.third || st.fifth !== hst.fifth) return false;
    return ['b7', 'M7', 'bb7'].includes(st.sev) ? st.sev === hst.sev : true;   // triade ou sixte : la septième n'est pas comparée
}

// Degré (0 à 6) sur lequel l'accord est présent dans la gamme de tonique `tonic`, ou -1.
//   c = { rootIndex, chordId, chordObj, info } ; scale = demi-tons de la gamme ; base = paramètres de scaleHarmony (tonique écrite)
function smDegreeOf(c, scale, tonic, base) {
    const offset = ((c.rootIndex - tonic) % 12 + 12) % 12;
    const degree = scale.indexOf(offset);
    if (degree < 0) return -1;
    if (!c.chordObj.notes.every(n => scale.includes((offset + n) % 12))) return -1;   // toutes les notes de l'accord sont dans la gamme
    // structure de l'accord du degré, à la septième (c'est avec elle qu'on compare, que l'affichage soit en triades ou non)
    const core = scaleHarmony({ ...base, triads: false }).find(x => x.degree === degree);
    const coreInfo = core && SM_T.chordInfo(core.chordId);
    return (coreInfo && smSameCore(c.info.st, coreInfo.st)) ? degree : -1;
}

// Toutes les gammes harmonisées qui contiennent l'accord (et, en mode entonnoir, tous les accords supplémentaires choisis),
// de la plus courante à la moins courante.
//   p = { rootIndex (fondamentale de l'accord, 0 à 11), chordId, findChordObj(id), triads (l'harmonisation affichée est en triades),
//         rootLabels (noms des 12 fondamentales, facultatif), extra (accords supplémentaires : [{ rootIndex, chordId }], facultatif) }
// Renvoie [{ scaleId, tonic (0 à 11), tonicName, rank (rang de la gamme dans SM_SCALE_ORDER), degree (0 à 6, accord principal), label (chiffrage
//            de l'accord principal), fn: { key: 'T'|'SD'|'D', name }, chordId (accord du degré, affiché), rootName, minorThird,
//            hits (degrés des accords cherchés : [principal, ...supplémentaires]), items (harmonisation entière : voir scaleHarmony) }]
function scaleMapEntries(p) {
    const wanted = [{ rootIndex: p.rootIndex, chordId: p.chordId }, ...(p.extra || [])].map(w => ({ ...w, chordObj: p.findChordObj(w.chordId), info: SM_T.chordInfo(w.chordId) }));
    if (wanted.some(w => !w.chordObj || !w.info)) return [];
    const out = [];
    SM_SCALE_ORDER.forEach((scaleId, rank) => {
        const def = SM_T.scalesDb[scaleId];
        if (!def) return;
        const scale = def.intervals.filter(i => i < 12);
        if (scale.length !== 7) return;
        const minorThird = scale.includes(3) && !scale.includes(4);
        for (let tonic = 0; tonic < 12; tonic++) {
            // accords cherchés : fondamentale vite écartée avant de chercher le nom de la tonique
            if (wanted.some(w => !scale.includes(((w.rootIndex - tonic) % 12 + 12) % 12))) continue;
            const tonicName = scaleMapTonicName(tonic, scale, p.rootLabels);
            const base = { intervals: scale, rootName: tonicName, rootIndex: tonic, findChordObj: p.findChordObj };
            const hits = wanted.map(w => smDegreeOf(w, scale, tonic, base));
            if (hits.some(d => d < 0)) continue;
            const degree = hits[0];
            const shown = scaleHarmony({ ...base, triads: !!p.triads });
            const at = shown.find(x => x.degree === degree);
            if (!at) continue;
            out.push({ scaleId, tonic, tonicName, rank, degree, label: at.label, fn: scaleMapFunction(degree, minorThird),
                chordId: at.chordId, rootName: at.rootName, items: shown, minorThird, hits });
        }
    });
    const importance = (e) => SM_DEGREE_ORDER[e.minorThird ? 'minor' : 'major'].indexOf(e.degree);
    return out.sort((a, b) => (a.rank - b.rank) || (importance(a) - importance(b)) || (a.tonic - b.tonic));
}

const smAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Clé d'une gamme de la Carte (même rôle que trainingScaleKey pour les autres onglets).
function scaleMapKey(entry) {
    return `map-${entry.scaleId}-${entry.tonic}`;
}

// Étiquette « degré · fonction » de l'en-tête d'une carte : chiffrage de l'accord et fonction tonale.
function scaleMapFunctionHtml(entry) {
    return `<span class="tm-fn tm-fn-${entry.fn.key}"><b>${glyphHtml(smAttr(entry.label))}</b><span>${entry.fn.name}</span></span>`;
}

// HTML de l'harmonisation entière d'une gamme de la Carte : un accord par degré. L'accord cherché est en noir sur fond blanc avec
// son chiffrage en rouge (comme une case de la grille Jam) ; les accords supplémentaires du mode entonnoir ont la même forme, sur
// un gris de plus en plus soutenu (th-hit-1, th-hit-2…) ; les autres accords sont écrits comme dans l'onglet Harmonisation.
//   p = entrée de scaleMapEntries + { jazz(chordId) (suffixe jazz), onclick(rootIndex, chordId, hit), onArpeggio(rootIndex, chordId) → gestionnaires
//       de clic ; hit = rang de l'accord cherché sur cette case (0 = principal, 1… = supplémentaires), -1 si la case n'en est pas un }
function scaleMapHtml(p) {
    const chips = p.items.map(it => {
        const hit = p.hits.indexOf(it.degree);
        const on = hit >= 0;
        const name = `${it.rootName}${p.jazz(it.chordId)}`;
        const arp = p.onArpeggio
            ? `<span class="th-arp" role="button" aria-label="Écouter l'arpège de ${smAttr(name)}" title="Écouter l'arpège" onclick="${smAttr(p.onArpeggio(it.rootIndex, it.chordId))}; event.stopPropagation();">&gt;&gt;</span>` : '';
        return `<button type="button" class="jm-chip th-chip${on ? ` th-hit th-hit-${Math.min(hit, 5)}` : ''}" data-chord="${smAttr(it.rootIndex + ':' + it.chordId)}" data-degree="${it.degree}"${on ? ` data-hit="${hit}"` : ''}`
            + ` title="${smAttr(`Écouter ${name} plaqué`)}" onclick="${smAttr(p.onclick(it.rootIndex, it.chordId, hit))}; event.stopPropagation();">`
            + `<span class="th-name">${on ? glyphHtml(smAttr(name)) : smAttr(name)}</span><small>${on ? glyphHtml(smAttr(it.label)) : smAttr(it.label)}</small>${arp}</button>`;
    }).join('');
    return `<div class="bg-transparent border border-[#333333] rounded-lg p-3 shadow-sm text-slate-100 w-full mx-auto select-none">
                                <div class="th-wrap">${chips}</div>
                            </div>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scaleMapEntries, scaleMapFunction, scaleMapTonicName, scaleMapKey, scaleMapFunctionHtml, scaleMapHtml, SM_SCALE_ORDER, SM_DEGREE_ORDER };
}
