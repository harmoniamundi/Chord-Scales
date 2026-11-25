// styles/style-registry.js — LA fiche de chaque style de grille du Jukebox, sans DOM. Ajouter un style, c'est :
//   1. une entrée ici (dans l'ordre du menu) ;
//   2. son générateur de grille dans styles/style-builders.js (STYLE_BUILDERS[clé]) ;
//   3. une ligne <option value="clé"> dans le menu « jam-style-select » d'index.html, au même rang.
// styles/style-registry.test.js vérifie que les trois restent d'accord, et que l'orchestre et le rythme cités existent.
// Tout le reste se déduit de ces fiches : STYLE_BAND, STYLE_GROOVE, STYLE_TEMPO_METER et STYLE_SCALE_PROFILE (styles/style-meta.js),
// profil de réharmonisation de « Générer » (styleProfile) et longueur de la grille (normalizeGeneratedGrid) dans grid/generation.js,
// tonalité imposée au choix du style (changeStyle, index.html).
// Chargé par index.html via <script src="app/styles/style-registry.js"> (juste après theory.js) et testé par styles/style-registry.test.js.
//
// Champs d'une fiche :
//   band    orchestre proposé (clé de BAND_FORMATIONS, band/band-catalog.js) ; modifiable ensuite dans le pop-up Orchestre
//   groove  rythme imposé à cet orchestre (facultatif ; doit faire partie des rythmes de l'orchestre)
//   bpm     tempo proposé (noires par minute ; pulsations ♩. en mesure composée ; temps court en aksak : croches/s = bpm / 30)
//   meter   signature : '4/4', '3/4', '2/4', '6/8', '9/8', '12/8', '5/8', '7/8', '7/8b' (2+2+3), '11/8'
//   scales  profil de gammes : 'jazz' (gammes écrites par le style, sinon la 1re gamme de l'accord), 'classic' (mode du degré),
//           'blues', 'funk', 'balkan', 'flamenco' (voir profileScaleFor, styles/style-meta.js)
//   key     tonalité posée au choix du style (0 = do … 11 = si) ; absente : la tonalité choisie est gardée
//   bars    longueur de la grille générée, en mesures (16 par défaut)
//   gen     réharmonisation du bouton « Générer » : nom d'un profil de STYLE_GEN_PRESETS ou { turn, alt, w: { opération: poids } }
//           (opérations : iiV, secDom, tritone, backdoor, dim, colour, sus, subdom, chrom — voir reharmonize, grid/generation.js) ;
//           absent : STYLE_GEN_DEFAULT (quelques couleurs). turn : fenêtres de turnaround ; alt : dominantes altérées permises.

const STYLE_GEN_PRESETS = {
    // jazz tonal : ii-V d'approche, dominantes secondaires, tritons, backdoor, diminués, couleurs, turnarounds
    jazz: { turn: true, alt: true, w: { iiV: 3, secDom: 2, tritone: 2.5, backdoor: 1, dim: 1.5, colour: 3, sus: 1.2, subdom: 1.5, chrom: 0.8 } },
    // jazz léger (ballade, bossa, latin jazz)
    light: { turn: false, alt: true, w: { iiV: 2, secDom: 1, tritone: 2, dim: 0.8, colour: 3, sus: 1.5, subdom: 1, chrom: 0.8 } },
    // tonal classique : dominantes secondaires, sous-dominantes
    classical: { turn: false, w: { secDom: 3, subdom: 2, dim: 1, colour: 1, iiV: 0.8 } },
    // aucune réharmonisation (« Générer » renouvelle seulement la forme : triades, rock, Balkans, Afrique, Renaissance…)
    none: { turn: false, w: {} }
};
const STYLE_GEN_DEFAULT = { turn: false, w: { colour: 3 } };

const STYLE_REGISTRY = {
    // —— Cadences & progressions ——
    'ii-v-i': { band: 'swing', bpm: 120, meter: '4/4', scales: 'jazz', bars: 4, gen: 'jazz' },
    anatole: { band: 'swing', bpm: 130, meter: '4/4', scales: 'jazz', bars: 8, gen: 'jazz' },
    // —— Jazz ——
    swing: { band: 'swing', bpm: 140, meter: '4/4', scales: 'jazz', bars: 32, gen: 'jazz' },
    'i-got-rythm': { band: 'swing', bpm: 170, meter: '4/4', scales: 'jazz', key: 10, bars: 32, gen: 'jazz' },
    bebop: { band: 'swing', bpm: 200, meter: '4/4', scales: 'jazz', bars: 32, gen: { turn: true, alt: true, w: { iiV: 4.5, secDom: 2.5, tritone: 3.5, backdoor: 1, dim: 2, colour: 2.5, sus: 0.4, subdom: 1, chrom: 1.5 } } },
    hardbop: { band: 'swing', bpm: 160, meter: '4/4', scales: 'jazz', gen: 'jazz' },
    dixieland: { band: 'swing', bpm: 180, meter: '2/4', scales: 'classic', bars: 32, gen: { turn: false, w: { secDom: 3, subdom: 2, dim: 1.2 } } },
    ballad: { band: 'swing', bpm: 60, meter: '4/4', scales: 'jazz', bars: 32, gen: 'light' },
    ballad128: { band: 'swing', bpm: 50, meter: '12/8', scales: 'jazz', bars: 32, gen: { turn: false, alt: true, w: { iiV: 2, secDom: 1, tritone: 2, dim: 0.8, colour: 5, sus: 1, subdom: 1 } } },
    modal: { band: 'swing', bpm: 128, meter: '4/4', scales: 'jazz', gen: { turn: false, w: { colour: 4 } } },
    latin: { band: 'pop', bpm: 160, meter: '4/4', scales: 'jazz', gen: 'light' },
    fusion: { band: 'pop', bpm: 124, meter: '4/4', scales: 'jazz', gen: { turn: false, w: { colour: 3, tritone: 1 } } },
    manouche: { band: 'manouche', bpm: 180, meter: '4/4', scales: 'jazz', key: 9, bars: 32, gen: { turn: false, w: { dim: 2.5, secDom: 2.2, iiV: 1, chrom: 0.4, subdom: 0.6 } } },
    // —— Blues ——
    blues: { band: 'swing', bpm: 112, meter: '4/4', scales: 'blues', bars: 12, gen: { turn: false, w: { colour: 4, tritone: 2, sus: 2 } } },
    blues128: { band: 'swing', bpm: 64, meter: '12/8', scales: 'blues', bars: 12, gen: { turn: false, w: { colour: 4, tritone: 2, sus: 2 } } },
    // —— Pop, Funk & Soul ——
    pop: { band: 'pop', bpm: 112, meter: '4/4', scales: 'classic', gen: { turn: false, w: { colour: 4 } } },
    funk: { band: 'pop', bpm: 100, meter: '4/4', scales: 'funk', gen: { turn: false, w: { colour: 4 } } },
    gospel: { band: 'pop', bpm: 60, meter: '12/8', scales: 'classic', gen: { turn: false, w: { secDom: 2, subdom: 1, colour: 3 } } },
    // —— Rock ——
    rockroll: { band: 'pop', groove: 'r-roll', bpm: 160, meter: '4/4', scales: 'blues', key: 9, bars: 12, gen: 'none' },
    rockclassic: { band: 'pop', groove: 'r-classic', bpm: 118, meter: '4/4', scales: 'classic', key: 2, gen: 'none' },
    hardrock: { band: 'pop', groove: 'r-hard', bpm: 132, meter: '4/4', scales: 'classic', key: 4, gen: 'none' },
    punk: { band: 'pop', groove: 'r-punk', bpm: 145, meter: '4/4', scales: 'classic', key: 7, gen: 'none' },
    rockballad: { band: 'pop', groove: 'r-ballad', bpm: 68, meter: '4/4', scales: 'classic', key: 7, gen: 'none' },
    bluesrock: { band: 'pop', groove: 'r-blues', bpm: 100, meter: '4/4', scales: 'blues', key: 9, bars: 12, gen: 'none' },
    indierock: { band: 'pop', groove: 'r-indie', bpm: 124, meter: '4/4', scales: 'classic', key: 0, gen: 'none' },
    // —— Chanson & traditionnel ——
    trad: { band: 'classic', bpm: 100, meter: '4/4', scales: 'classic', gen: 'classical' },
    chansonsimple: { band: 'pop', bpm: 100, meter: '4/4', scales: 'classic', gen: 'none' },
    // —— Musique classique (par époque) ——
    renaissance: { band: 'classic', groove: 'c-renaissance', bpm: 76, meter: '4/4', scales: 'classic', gen: 'none' },
    baroque: { band: 'classic', groove: 'c-baroque', bpm: 84, meter: '4/4', scales: 'classic', gen: 'classical' },
    chaconne: { band: 'classic', groove: 'c-chaconne', bpm: 72, meter: '3/4', scales: 'classic', bars: 32, gen: 'none' },
    mozart: { band: 'classic', bpm: 108, meter: '4/4', scales: 'classic', gen: 'classical' },
    menuet: { band: 'classic', bpm: 116, meter: '3/4', scales: 'classic', bars: 32, gen: { turn: false, w: { secDom: 2, subdom: 1.5 } } },
    nocturne: { band: 'classic', groove: 'c-nocturne', bpm: 58, meter: '4/4', scales: 'classic', gen: { turn: false, w: { secDom: 1.5, dim: 1.2, subdom: 1 } } },
    romantique: { band: 'classic', groove: 'c-romantic', bpm: 66, meter: '4/4', scales: 'classic', gen: { turn: false, w: { dim: 1.5, secDom: 1.5, chrom: 1, subdom: 0.6 } } },
    impressionnisme: { band: 'classic', groove: 'c-impression', bpm: 60, meter: '4/4', scales: 'jazz', gen: { turn: false, w: { colour: 2, chrom: 1.2, sus: 0.6 } } },
    gymnopedie: { band: 'classic', groove: 'c-satie', bpm: 72, meter: '3/4', scales: 'jazz', gen: { turn: false, w: { colour: 1 } } },
    neoclassique: { band: 'classic', groove: 'c-neoclassic', bpm: 126, meter: '4/4', scales: 'classic', gen: { turn: false, w: { chrom: 1.5, secDom: 0.8 } } },
    minimalisme: { band: 'classic', groove: 'c-minimal', bpm: 120, meter: '4/4', scales: 'jazz', gen: 'none' },
    // —— Valses (3/4) ——
    valsejazz: { band: 'swing', bpm: 168, meter: '3/4', scales: 'jazz', bars: 32, gen: 'jazz' },
    valsemusette: { band: 'pop', bpm: 150, meter: '3/4', scales: 'classic', bars: 32, gen: 'classical' },
    valsemanouche: { band: 'manouche', bpm: 160, meter: '3/4', scales: 'jazz', key: 2, bars: 32, gen: { turn: false, w: { dim: 2, secDom: 2, iiV: 0.6, chrom: 0.3 } } },
    valseviennoise: { band: 'classic', bpm: 174, meter: '3/4', scales: 'classic', bars: 32, gen: { turn: false, w: { secDom: 1.5, subdom: 1 } } },
    valsecountry: { band: 'pop', bpm: 96, meter: '3/4', scales: 'classic', gen: { turn: false, w: { secDom: 1, subdom: 1 } } },
    // —— Danses (6/8, 9/8) ——
    jig: { band: 'pop', bpm: 116, meter: '6/8', scales: 'classic', bars: 32, gen: { turn: false, w: { secDom: 1.5, subdom: 1 } } },
    slipjig: { band: 'pop', bpm: 108, meter: '9/8', scales: 'classic', gen: { turn: false, w: { secDom: 1.5, subdom: 1 } } },
    barcarolle: { band: 'classic', bpm: 56, meter: '6/8', scales: 'classic', gen: 'classical' },
    tarentelle: { band: 'classic', bpm: 132, meter: '6/8', scales: 'classic', gen: 'classical' },
    // —— Brass band ——
    brasshymn: { band: 'brass', groove: 'b-chorale', bpm: 72, meter: '4/4', scales: 'classic', key: 5, gen: { turn: false, w: { secDom: 2, subdom: 1.5 } } },
    brasscantique: { band: 'brass', groove: 'b-chorale', bpm: 66, meter: '3/4', scales: 'classic', key: 3, gen: { turn: false, w: { secDom: 1.5, subdom: 1.5 } } },
    // —— Balkans ——
    balkan: { band: 'balkan', bpm: 128, meter: '2/4', scales: 'balkan', key: 2, bars: 32, gen: 'none' },
    balkan98: { band: 'balkan', bpm: 100, meter: '9/8', scales: 'balkan', key: 9, gen: 'none' },
    balkansevdah: { band: 'balkan', groove: 'bk-sevdah', bpm: 60, meter: '4/4', scales: 'balkan', key: 9, gen: 'none' },
    balkantsifte: { band: 'balkan', groove: 'bk-tsifte', bpm: 100, meter: '4/4', scales: 'balkan', key: 2, gen: 'none' },
    balkan58: { band: 'balkan', bpm: 140, meter: '5/8', scales: 'balkan', key: 9, gen: 'none' },
    balkan78: { band: 'balkan', bpm: 120, meter: '7/8', scales: 'balkan', key: 2, gen: 'none' },
    balkan78r: { band: 'balkan', bpm: 150, meter: '7/8b', scales: 'classic', key: 7, gen: 'none' },
    balkan118: { band: 'balkan', bpm: 150, meter: '11/8', scales: 'balkan', key: 4, gen: 'none' },
    // —— Flamenco ——
    flamencosolea: { band: 'guitar', groove: 'f-solea', bpm: 52, meter: '12/8', scales: 'flamenco', key: 9 },
    flamencobulerias: { band: 'guitar', groove: 'f-bulerias', bpm: 88, meter: '12/8', scales: 'flamenco', key: 9 },
    flamencotangos: { band: 'guitar', groove: 'f-tangos', bpm: 108, meter: '4/4', scales: 'flamenco', key: 9 },
    // —— Amérique Latine ——
    bossa: { band: 'latin', groove: 'bossa', bpm: 132, meter: '4/4', scales: 'jazz', bars: 32, gen: 'light' },
    samba: { band: 'latin', groove: 'samba', bpm: 104, meter: '2/4', scales: 'jazz', bars: 32, gen: { turn: false, alt: true, w: { iiV: 2, secDom: 1, tritone: 1.5, colour: 3, sus: 1, subdom: 1 } } },
    afrosamba: { band: 'guitar', groove: 'g-baden', bpm: 100, meter: '2/4', scales: 'jazz', key: 2, bars: 32, gen: { turn: false, alt: true, w: { tritone: 1.5, colour: 2.5, iiV: 1, secDom: 0.8, chrom: 1, sus: 0.8 } } },
    choro: { band: 'latin', groove: 'br-choro', bpm: 100, meter: '2/4', scales: 'jazz', bars: 32, gen: { turn: false, w: { secDom: 3, dim: 2, subdom: 1.2, chrom: 0.6 } } },
    partidoalto: { band: 'latin', groove: 'br-partido', bpm: 96, meter: '2/4', scales: 'jazz', bars: 32, gen: { turn: false, alt: true, w: { iiV: 2, secDom: 2, tritone: 1, colour: 1.5, subdom: 1, dim: 0.6 } } },
    baiao: { band: 'latin', groove: 'br-baiao', bpm: 108, meter: '2/4', scales: 'jazz', key: 7, bars: 32, gen: 'none' },
    sambacancao: { band: 'latin', groove: 'br-cancao', bpm: 72, meter: '4/4', scales: 'jazz', bars: 32, gen: 'light' },
    sambajazz: { band: 'latin', groove: 'br-sambajazz', bpm: 208, meter: '4/4', scales: 'jazz', bars: 32, gen: { turn: true, alt: true, w: { iiV: 3, secDom: 2, tritone: 2.5, colour: 3, sus: 0.8, subdom: 1, chrom: 0.6, dim: 0.6 } } },
    cumbia: { band: 'cumbia', bpm: 98, meter: '4/4', scales: 'classic', key: 7, gen: 'none' },
    tango: { band: 'piazzolla', groove: 'lyrique', bpm: 116, meter: '2/4', scales: 'classic', bars: 32, gen: { turn: false, w: { secDom: 3, subdom: 2, dim: 1.5, colour: 1.5, iiV: 1 } } },
    piazzolla: { band: 'piazzolla', groove: 'piazzolla', bpm: 132, meter: '4/4', scales: 'jazz', gen: { turn: false, alt: true, w: { secDom: 2.5, dim: 2, colour: 3, tritone: 1.5, sus: 1.5, chrom: 1.5, iiV: 1.5 } } },
    milongalyrique: { band: 'piazzolla', groove: 'lyrique', bpm: 66, meter: '4/4', scales: 'jazz', key: 2, bars: 32, gen: { turn: false, alt: true, w: { colour: 2.5, iiV: 1.2, secDom: 1.5, dim: 1.2, sus: 1.2, chrom: 1.2, tritone: 0.5, subdom: 1 } } },
    // —— Cuba ——
    sonmontuno: { band: 'cuba', groove: 'cu-son', bpm: 104, meter: '4/4', scales: 'classic', gen: { turn: false, w: { secDom: 0.6 } } },
    chachacha: { band: 'cuba', groove: 'cu-chacha', bpm: 116, meter: '4/4', scales: 'jazz', gen: { turn: false, alt: true, w: { iiV: 1.5, secDom: 1, colour: 1.5, subdom: 0.6 } } },
    bolerocubano: { band: 'cuba', groove: 'cu-bolero', bpm: 72, meter: '4/4', scales: 'jazz', gen: { turn: false, alt: true, w: { iiV: 2, secDom: 1.5, tritone: 0.8, dim: 1, colour: 2.5, sus: 0.6, subdom: 1, chrom: 0.6 } } },
    guajira: { band: 'cuba', groove: 'cu-guajira', bpm: 92, meter: '4/4', scales: 'classic', gen: 'none' },
    danzon: { band: 'cuba', groove: 'cu-danzon', bpm: 112, meter: '2/4', scales: 'classic', bars: 32, gen: { turn: false, w: { secDom: 1.5, subdom: 1 } } },
    guaguanco: { band: 'cuba', groove: 'cu-guaguanco', bpm: 108, meter: '4/4', scales: 'classic', gen: 'none' },
    salsa: { band: 'cuba', groove: 'salsa', bpm: 180, meter: '4/4', scales: 'jazz' },
    afro68: { band: 'cuba', groove: 'afro', bpm: 96, meter: '6/8', scales: 'jazz', gen: { turn: false, w: { colour: 1.2, sus: 0.6, secDom: 0.4 } } },
    // —— Mexique (orchestre Mexique, sans cuivres) ——
    sonjarocho: { band: 'mexico', groove: 'mx-jarocho', bpm: 126, meter: '6/8', scales: 'classic', key: 2, gen: 'none' },
    huapango: { band: 'mexico', groove: 'mx-huapango', bpm: 104, meter: '6/8', scales: 'classic', key: 7, gen: 'none' },
    polkanortena: { band: 'mexico', groove: 'mx-polka', bpm: 132, meter: '2/4', scales: 'classic', key: 0, bars: 32, gen: 'none' },
    bolerotrio: { band: 'mexico', groove: 'mx-bolero', bpm: 80, meter: '4/4', scales: 'jazz', bars: 32, gen: 'light' },
    ranchera: { band: 'mexico', groove: 'mx-ranchera', bpm: 168, meter: '3/4', scales: 'classic', key: 7, bars: 32, gen: 'none' },
    // —— Afrique ——
    afrobeat: { band: 'africa', groove: 'af-afrobeat', bpm: 112, meter: '4/4', scales: 'classic', key: 2, gen: 'none' },
    highlife: { band: 'africa', groove: 'af-highlife', bpm: 120, meter: '4/4', scales: 'classic', key: 5, gen: 'none' },
    rumbacongo: { band: 'africa', groove: 'af-rumba', bpm: 116, meter: '4/4', scales: 'classic', key: 9, gen: 'none' },
    soukous: { band: 'africa', groove: 'af-soukous', bpm: 144, meter: '4/4', scales: 'classic', key: 4, gen: 'none' },
    benga: { band: 'africa', groove: 'af-benga', bpm: 132, meter: '4/4', scales: 'classic', key: 7, gen: 'none' },
    mbaqanga: { band: 'africa', groove: 'af-mbaqanga', bpm: 126, meter: '4/4', scales: 'classic', key: 0, gen: 'none' }
};

const srOwn = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(STYLE_REGISTRY, k);
// Fiche d'un style, ou null (clé inconnue, « custom », « constructor »…).
function styleEntry(styleKey) { return srOwn(styleKey) ? STYLE_REGISTRY[styleKey] : null; }
// Table { style: valeur } d'un champ, pour les styles qui l'ont.
function styleField(field) {
    const out = {};
    Object.keys(STYLE_REGISTRY).forEach(k => { if (STYLE_REGISTRY[k][field] !== undefined) out[k] = STYLE_REGISTRY[k][field]; });
    return out;
}
// Profil de réharmonisation (« Générer ») d'un style.
function styleGenProfile(styleKey) {
    const e = styleEntry(styleKey);
    const g = e && e.gen;
    if (typeof g === 'string') return STYLE_GEN_PRESETS[g] || STYLE_GEN_DEFAULT;
    return g || STYLE_GEN_DEFAULT;
}
// Longueur de la grille générée (mesures).
function styleBars(styleKey) { const e = styleEntry(styleKey); return (e && e.bars) || 16; }
// Tonalité posée au choix du style, ou null.
function styleKeyRoot(styleKey) { const e = styleEntry(styleKey); return (e && Number.isInteger(e.key)) ? e.key : null; }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STYLE_REGISTRY, STYLE_GEN_PRESETS, STYLE_GEN_DEFAULT, styleEntry, styleField, styleGenProfile, styleBars, styleKeyRoot };
}
