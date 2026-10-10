// styles/style-meta.js — métadonnées et lectures dépendant du style chargé, sans DOM :
//   · tables par style : orchestre proposé, groove imposé, tempo + signature, profil de gammes ;
//   · règles de modulation écrites dans les styles et pose des marqueurs « I de X » sur une grille ;
//   · gamme par défaut d'un accord selon le profil du style ;
//   · tonalité réelle d'un style écrit en absolu.
// L'état du moteur passe par des paramètres explicites (env / opts) ; le DOM et les champs du moteur restent dans index.html.
// Chargé par index.html via <script src="styles/style-meta.js"> (après grid/generation.js) et testé par styles/style-meta.test.js.

if (typeof chordFamily === 'undefined' && typeof require === 'function') {
    var { chordFamily } = require('../grid/generation.js');
}

// Profil de gammes par style : 'jazz' (1re gamme de l'accord), 'blues', 'funk', 'classic' (mode diatonique du degré), 'balkan'.
const STYLE_SCALE_PROFILE = {
    'ii-v-i':'jazz', anatole:'jazz', 'i-got-rythm':'jazz', bebop:'jazz', swing:'jazz', hardbop:'jazz', ballad:'jazz', ballad128:'jazz',
    valsejazz:'jazz', fusion:'jazz', modal:'jazz', bossa:'jazz', latin:'jazz', samba:'jazz', piazzolla:'jazz', milongalyrique:'jazz', afro68:'jazz',
    blues:'blues', blues128:'blues', funk:'funk',
    baroque:'classic', mozart:'classic', trad:'classic', chansonsimple:'classic', menuet:'classic', valseviennoise:'classic',
    valsemusette:'classic', barcarolle:'classic', tarentelle:'classic', dixieland:'classic', tango:'classic', brasshymn:'classic',
    brasscantique:'classic', pop:'classic', gospel:'classic', jig:'classic', slipjig:'classic', valsecountry:'classic',
    balkan:'balkan', balkan98:'balkan'
};

// Orchestre proposé pour chaque style (modifiable ensuite dans la fenêtre « Orchestre »).
const STYLE_BAND = {
    'ii-v-i': 'swing', anatole: 'swing', 'i-got-rythm': 'swing', bebop: 'swing', swing: 'swing', hardbop: 'swing',
    ballad: 'swing', modal: 'swing', blues: 'swing', dixieland: 'swing',
    bossa: 'latin', latin: 'pop',
    pop: 'pop', funk: 'pop', fusion: 'pop',
    baroque: 'classic', mozart: 'classic', trad: 'classic', chansonsimple: 'pop',
    valsejazz: 'swing', valsemusette: 'pop', valseviennoise: 'classic', menuet: 'classic', valsecountry: 'pop',
    jig: 'pop', afro68: 'cuba', barcarolle: 'classic', tarentelle: 'classic', slipjig: 'pop',
    blues128: 'swing', gospel: 'pop', ballad128: 'swing',
    samba: 'latin', tango: 'piazzolla', piazzolla: 'piazzolla', milongalyrique: 'piazzolla',
    brasshymn: 'brass', brasscantique: 'brass',
    balkan: 'balkan', balkan98: 'balkan'
};

// Rythme imposé à l'orchestre Latin par certains styles (sinon le moteur choisit bossa / samba / afro selon le tempo).
const STYLE_GROOVE = { samba: 'samba', tango: 'lyrique', piazzolla: 'piazzolla', milongalyrique: 'lyrique', afro68: 'afro', brasshymn: 'b-chorale', brasscantique: 'b-chorale' };

// Tempo (noires par minute ; pulsations ♩. en mesure composée) et signature proposés pour chaque style.
// Valeurs modifiables ensuite avec le curseur de tempo et le sélecteur « Mesure ».
const STYLE_TEMPO_METER = {
    'ii-v-i':      { bpm: 120, meter: '4/4' },
    anatole:       { bpm: 130, meter: '4/4' },
    'i-got-rythm': { bpm: 170, meter: '4/4' },
    bebop:         { bpm: 200, meter: '4/4' },
    swing:         { bpm: 140, meter: '4/4' },
    hardbop:       { bpm: 160, meter: '4/4' },
    ballad:        { bpm: 60,  meter: '4/4' },
    modal:         { bpm: 128, meter: '4/4' },
    blues:         { bpm: 112, meter: '4/4' },
    bossa:         { bpm: 132, meter: '4/4' },
    latin:         { bpm: 160, meter: '4/4' },
    pop:           { bpm: 112, meter: '4/4' },
    funk:          { bpm: 100, meter: '4/4' },
    fusion:        { bpm: 124, meter: '4/4' },
    dixieland:     { bpm: 180, meter: '2/4' }, // « cut time » : une mesure = deux noires
    baroque:       { bpm: 84,  meter: '4/4' },
    mozart:        { bpm: 108, meter: '4/4' },
    trad:          { bpm: 100, meter: '4/4' },
    chansonsimple: { bpm: 100, meter: '4/4' },
    valsejazz:     { bpm: 168, meter: '3/4' },
    valsemusette:  { bpm: 150, meter: '3/4' },
    valseviennoise:{ bpm: 174, meter: '3/4' },
    menuet:        { bpm: 116, meter: '3/4' },
    valsecountry:  { bpm: 96,  meter: '3/4' },
    jig:           { bpm: 116, meter: '6/8' },
    afro68:        { bpm: 96,  meter: '6/8' },
    barcarolle:    { bpm: 56,  meter: '6/8' },
    tarentelle:    { bpm: 132, meter: '6/8' },
    slipjig:       { bpm: 108, meter: '9/8' },
    blues128:      { bpm: 64,  meter: '12/8' },
    gospel:        { bpm: 60,  meter: '12/8' },
    ballad128:     { bpm: 50,  meter: '12/8' },
    samba:         { bpm: 104, meter: '2/4' },
    tango:         { bpm: 116, meter: '2/4' },
    piazzolla:     { bpm: 132, meter: '4/4' },
    milongalyrique:{ bpm: 66,  meter: '4/4' },
    brasshymn:     { bpm: 72,  meter: '4/4' },
    brasscantique: { bpm: 66,  meter: '3/4' },
    balkan:        { bpm: 128, meter: '2/4' },
    balkan98:      { bpm: 100, meter: '9/8' }
};

// Recherche par clé propre : une clé inattendue (« constructor »…) ne renvoie jamais un membre hérité d'Object.
const styleMetaLookup = (table, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key)) ? table[key] : null;
function bandStyleFor(styleKey) { return styleMetaLookup(STYLE_BAND, styleKey); }
function grooveHintFor(styleKey) { return styleMetaLookup(STYLE_GROOVE, styleKey); }
function tempoMeterFor(styleKey) { const t = styleMetaLookup(STYLE_TEMPO_METER, styleKey); return t ? { ...t } : null; }

// ===== Modulations écrites dans les styles =====
// Certains styles ont une section dans une autre tonalité (trio de la valse viennoise à la dominante, partie B en relatif
// majeur pour la valse musette, la tarentelle, la samba, le tango, le piazzolla, pont de la bossa). Après génération, on
// pose sur la bonne mesure le même marqueur que l'éditeur de fonction tonale (fnLabel « I de G » + modKey) : les mesures
// suivantes sont alors analysées dans la nouvelle tonalité, jusqu'au marqueur de retour.
// `to` : décalage (demi-tons) de la nouvelle tonique par rapport à la tonique du style, ou 'home' pour le retour.
// Un marqueur n'est posé que si l'accord y joue bien un rôle dans la nouvelle tonalité (tonique, dominante, ii ou IV) :
// si une variation a réécrit l'endroit, on cherche le premier accord qui convient dans la section, sinon on ne pose rien.
function styleModulations() {
    const sec = (name) => (s) => s.section === name;
    const phr = (name) => (s) => s.phrase === name;
    return {
        valsemusette:   [{ at: sec('B'),  to: 3 }, { at: sec('B2'), to: 'home' }],
        valseviennoise: [{ at: sec('B'),  to: 7 }, { at: (s, i, n) => i === n - 1, to: 'home' }],
        tarentelle:     [{ at: sec('B'),  to: 3 }, { at: sec('C'),  to: 'home' }],
        samba:          [{ at: sec('B'),  to: 3 }, { at: sec('A3'), to: 'home' }],
        tango:          [{ at: sec('B'),  to: 3 }, { at: phr('B4'), to: 'home' }],
        balkan:         [{ at: sec('B'),  to: 3 }, { at: phr('B4'), to: 'home' }],
        piazzolla:      [{ at: phr('B1'), to: 3 }, { at: phr('B2'), to: 'home' }],
        milongalyrique: [{ at: phr('B1'), to: 3 }, { at: phr('B2'), to: 'home' }, { at: sec('A3'), to: 'home' }],
        bossa:          [{ at: phr('B1'), to: 3 }, { at: sec('A3'), to: 'home' }]
    };
}

// Libellé de lecture d'un accord dans la tonalité cible { root, minor }, même vocabulaire que getFunctionAlternatives ;
// null si l'accord n'y joue aucun des rôles retenus. rootLabels : noms des 12 fondamentales selon l'enharmonie choisie.
function modReading(chord, tgt, rootLabels) {
    const r = (((chord.rootIndex - tgt.root) % 12) + 12) % 12;
    const fam = chordFamily(chord.chordId);
    const K = rootLabels[tgt.root];
    if (!tgt.minor) {
        if (r === 0 && fam === 'maj') return `I de ${K}`;
        if (r === 7 && fam === 'dom') return `V7 de ${K}`;
        if (r === 2 && fam === 'min') return `ii de ${K}`;
        if (r === 5 && fam === 'maj') return `IV de ${K}`;
    } else {
        if (r === 0 && fam === 'min') return `i (${K}m)`;
        if (r === 7 && fam === 'dom') return `V7 de ${K}m`;
        if (r === 2 && fam === 'hdim') return `iiø de ${K}m`;
        if (r === 5 && fam === 'min') return `iv de ${K}m`;
    }
    return null;
}

// Tonalité traversée par chaque bloc de la grille, en demi-tons depuis la tonique (0 = tonalité d'origine) :
// soit posée par le style lui-même (champ kc des cellules de ses ponts modulants), soit déduite des règles par section.
// Un marqueur (fnLabel + modKey) est posé au premier accord du bloc qui joue un rôle dans la nouvelle tonalité (parmi les
// 4 premières mesures) ; si aucun ne convient, on ne module pas. Le retour à la tonalité d'origine reçoit toujours un
// marqueur (étiquette automatique à défaut de lecture), pour que la fin de la grille ne reste jamais dans une autre tonalité.
// La grille est modifiée en place. opts : { styleKey, mainKey, mainQuality, rootLabels, homeLabel(stepIndex, home) }.
function annotateModulations(g, opts) {
    const { styleKey, mainKey, mainQuality, rootLabels, homeLabel } = opts;
    if (!g.length || !Number.isInteger(mainKey)) return;
    const n0 = g.length;
    let cur = 0, kcs = null;
    if (g.some(s => Number.isInteger(s.kc))) {
        kcs = g.map(s => { if (Number.isInteger(s.kc)) cur = s.kc; return cur; });
    } else {
        const rules = styleModulations()[styleKey];
        if (rules) kcs = g.map((s, i) => { rules.forEach(r => { if (r.at(s, i, n0)) cur = r.to === 'home' ? 0 : r.to; }); return cur; });
    }
    if (!kcs || !kcs.some(k => k !== 0)) return;
    // Tonalité d'origine : mineure si la tonique du mode choisi (ou du style, via la synchronisation de tonalité) est un accord mineur ;
    // on ne la lit pas sur le premier accord, qui peut être un ii (ballade, ii-V-I…).
    const home = { root: mainKey, minor: ['dorian', 'phrygian', 'aeolian', 'locrian'].includes(mainQuality) };
    let active = 0, i = 0;
    while (i < g.length) {
        if (kcs[i] === active) { i++; continue; }
        const k = kcs[i];
        const tgt = k === 0 ? home : { root: (home.root + k) % 12, minor: false };
        let found = -1, label = null, acc = 0;
        for (let t = i; t < g.length && acc < 4 && kcs[t] === k; acc += g[t].measures, t++) {
            const lb = modReading(g[t], tgt, rootLabels);
            if (lb) { found = t; label = lb; break; }
        }
        if (found < 0 && k === 0) { found = i; label = homeLabel(i, home); }
        if (found < 0) { // pas de lecture possible : on ne module pas, on passe au bloc suivant
            let j = i; while (j < g.length && kcs[j] === k) j++;
            i = j; continue;
        }
        // Le marqueur ne vaut que pour une mesure (comme dans l'éditeur) : on détache la première mesure du bloc.
        if (g[found].measures > 1) {
            const head = JSON.parse(JSON.stringify(g[found])); head.measures = 1;
            const rest = JSON.parse(JSON.stringify(g[found])); rest.measures = g[found].measures - 1;
            delete head.repeatEnd; delete rest.repeatStart; delete rest.partStart; // début de reprise sur la 1re partie, fin sur la dernière
            g.splice(found, 1, head, rest);
            kcs.splice(found, 1, kcs[found], kcs[found]);
        }
        g[found].fnLabel = String(label).slice(0, 24);
        g[found].modKey = { root: tgt.root, minor: tgt.minor };
        active = k; i = found + 1;
    }
}

// ===== Gammes par défaut selon le style =====
// Gamme par défaut d'un accord selon le profil du style chargé (STYLE_SCALE_PROFILE).
// env : { scaleStyle, mainKey, mainQuality, qualityAuto, findChordObj }.
// Renvoie un id de gamme proposée pour cet accord, ou null : le comportement jazz habituel (1re gamme de l'accord) s'applique.
function styleScaleFor(env, chordId, rootIndex) {
    const profile = STYLE_SCALE_PROFILE[env.scaleStyle];
    if (!profile || profile === 'jazz') return null;
    const co = env.findChordObj(chordId);
    if (!co || !co.scales || !co.scales.length) return null;
    const ok = (id) => co.scales.some(sc => sc.id === id);
    const pick = (...ids) => ids.find(ok) || null;
    const fam = chordFamily(chordId);
    const off = (((rootIndex - env.mainKey) % 12) + 12) % 12;

    if (profile === 'blues') {
        if (fam === 'dom') return [0, 5, 7].includes(off) ? pick('bluesScale', 'mixolydian') : pick('mixolydian');
        if (fam === 'min') return off === 0 ? pick('bluesScale', 'minorPentatonic') : pick('minorPentatonic', 'dorian');
        if (fam === 'maj') return pick('majorBlues', 'majorPentatonic', 'ionian');
        return null;
    }
    if (profile === 'funk') {
        if (fam === 'dom') return [0, 5].includes(off) ? pick('bluesScale', 'mixolydian') : pick('mixolydian');
        if (fam === 'min') return off === 0 ? pick('minorPentatonic', 'dorian') : pick('dorian');
        if (fam === 'maj') return pick('ionian');
        return null;
    }

    // balkan : mineur harmonique sur la tonique mineure, dorien sur iv, phrygien dominant (hijaz) sur la dominante V7(b9)
    if (profile === 'balkan') {
        if (fam === 'dom') return off === 7 ? pick('phrygianDominant', 'mixolydianFlat9', 'mixolydian') : pick('mixolydian');
        if (fam === 'min') return off === 0 ? pick('harmonicMinor', 'aeolian') : (off === 5 ? pick('dorian') : pick('aeolian', 'dorian'));
        if (fam === 'maj') return off === 1 ? pick('lydian', 'ionian') : pick('ionian');
        return null;
    }

    // classic : mode diatonique du degré dans la tonalité courante
    const DEG = [
        { off: 0, f: 'maj', s: 'ionian' }, { off: 2, f: 'min', s: 'dorian' }, { off: 4, f: 'min', s: 'phrygian' },
        { off: 5, f: 'maj', s: 'lydian' }, { off: 7, f: 'dom', s: 'mixolydian' }, { off: 9, f: 'min', s: 'aeolian' },
        { off: 11, f: 'hdim', s: 'locrian' }
    ];
    const ROT = { ionian: 0, dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, aeolian: 5, locrian: 6 };
    // mode « mixolydien » posé automatiquement par un style qui démarre sur une dominante : la tonique reste le I
    let rot = ROT[env.mainQuality] ?? 0;
    if (env.qualityAuto && env.mainQuality === 'mixolydian') rot = 0;
    for (let i = 0; i < 7; i++) {
        const d = DEG[(rot + i) % 7];
        if (((d.off - DEG[rot].off + 12) % 12) !== off || d.f !== fam) continue;
        const id = pick(d.s);
        if (id) return id;
    }
    // hors mode : la couleur classique la plus simple
    const minorKey = ['aeolian', 'dorian', 'phrygian'].includes(env.mainQuality);
    if (fam === 'dom' && off === 7 && minorKey) return pick('mixolydianFlat13', 'mixolydian'); // V7 d'un ton mineur
    if (fam === 'dom') return pick('mixolydian');
    if (fam === 'min') return pick('aeolian', 'dorian');
    if (fam === 'maj') return pick('ionian');
    if (fam === 'hdim') return pick('locrian');
    return null;
}

// Applique le profil de gammes du style (env.scaleStyle doit déjà valoir styleKey) à une grille fraîchement générée :
// seules les gammes laissées sur la valeur « jazz » par défaut (1re gamme de l'accord) sont remplacées ;
// les gammes choisies explicitement par le style sont conservées.
function applyStyleScaleProfile(env, styleKey, items) {
    const profile = STYLE_SCALE_PROFILE[styleKey];
    if (!profile || profile === 'jazz' || !items) return;
    const fix = (h) => {
        if (!h || !Number.isInteger(h.rootIndex)) return;
        const co = env.findChordObj(h.chordId);
        if (!co || !co.scales || !co.scales.length || h.scaleId !== co.scales[0].id) return;
        const sc = styleScaleFor(env, h.chordId, h.rootIndex);
        if (sc) h.scaleId = sc;
    };
    items.forEach(it => { fix(it); if (it.split) fix(it.split); });
}

// Un style écrit en absolu (bossa, modal, latin, blues, funk, pop, fusion…) définit lui-même sa tonalité : le sélecteur
// affiche alors la tonalité réelle de la grille (ex. « F Mineur », « F Dorien ») au lieu de rester sur la précédente.
// Les styles écrits en degrés suivent déjà la tonalité et le mode choisis : null (rien à changer).
// Sinon { rootIndex, quality } : tonique et mode déduits du premier accord de la grille générée.
const STYLES_FOLLOWING_KEY = ['ii-v-i', 'anatole', 'bebop', 'swing', 'ballad', 'ballad128', 'hardbop', 'dixieland', 'baroque', 'mozart', 'trad'];
function styleTonality(styleKey, generated) {
    if (STYLES_FOLLOWING_KEY.includes(styleKey) || !generated || !generated.length) return null;
    const tonic = generated[0];
    const fam = chordFamily(tonic.chordId);
    let quality = 'ionian';
    if (fam === 'min') quality = styleKey === 'modal' ? 'dorian' : 'aeolian';
    else if (fam === 'dom') quality = 'mixolydian';
    return { rootIndex: tonic.rootIndex, quality };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STYLE_SCALE_PROFILE, STYLE_BAND, STYLE_GROOVE, STYLE_TEMPO_METER, STYLES_FOLLOWING_KEY,
        bandStyleFor, grooveHintFor, tempoMeterFor, styleModulations, modReading, annotateModulations,
        styleScaleFor, applyStyleScaleProfile, styleTonality };
}
