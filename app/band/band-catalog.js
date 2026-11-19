// band/band-catalog.js — catalogue unique des orchestres (formations), de leurs rythmes imposés et des entrées du menu
// « Orchestre », sans DOM. Avant, ces informations étaient réparties entre style-meta.js (quatre tables d'entrées de menu)
// et plusieurs méthodes du moteur (liste des rythmes valables par orchestre, noms affichés, valeur du menu, choix d'une
// entrée). Le comportement est strictement le même qu'avant : voir les empreintes sonores (e2e/empreintes.e2e.js).
//
// Trois notions :
//   · formation  : l'orchestre (Jazz, Pop-Rock, Brasil, Cuba…) = la valeur de bandStyle dans le moteur ;
//   · rythme     : une façon de jouer imposée à une formation (bossa, salsa, soleá, punk, highlife…) = _bandGroove ;
//   · entrée     : une ligne du menu Orchestre ; soit une formation seule, soit un couple formation + rythme.
// Chargé par index.html via <script src="app/band/band-catalog.js"> (après rock-plan, africa-plan et afrocuban-plan)
// et testé par band/band-catalog.test.js.

// Dépendances : les constantes reçoivent un nom propre au module (un « var { ROCK_GROOVES } » redéclarerait la constante
// de rock-plan.js dans le navigateur : page blanche) ; les fonctions suivent le schéma habituel.
const BC_ROCK_GROOVES = typeof ROCK_GROOVES !== 'undefined' ? ROCK_GROOVES : require('./rock-plan.js').ROCK_GROOVES;
const BC_AFRO = typeof AFRO_GROOVES !== 'undefined' ? { AFRO_GROOVES, AFRO_STYLES } : require('./afrocuban-plan.js');
const BC_AFRICA = typeof AFRICA_GROOVES !== 'undefined' ? { AFRICA_GROOVES, AFRICA_NAMES } : require('./africa-plan.js');
if (typeof africaGroove === 'undefined' && typeof require === 'function') {
    var { africaGroove } = require('./africa-plan.js');
}

// Formations : nom affiché sur le bouton (« Orchestre … ») sans rythme, et rythmes imposés qu'elles savent jouer.
// L'ordre des clés est celui de l'ancienne liste de setBandStyle. Un rythme absent de la liste d'une formation est ignoré
// par elle (il « ne fuit pas » : le rythme afro d'un style afro-cubain ne fait pas sonner Cuba sous l'orchestre Brasil).
const BAND_FORMATIONS = {
    swing:     { name: 'Jazz',        grooves: [] },
    pop:       { name: 'Pop-Rock',    grooves: BC_ROCK_GROOVES },
    latin:     { name: 'Brasil',      grooves: ['bossa', 'samba', 'tango', 'piazzolla'] },
    cuba:      { name: 'Cuba',        grooves: ['afro', 'salsa'].concat(BC_AFRO.AFRO_GROOVES) },
    classic:   { name: 'Classique',   grooves: ['c-baroque'] },
    guitar:    { name: 'Guitare',     grooves: ['f-solea', 'f-bulerias', 'f-tangos', 'c-baroque'] },
    brass:     { name: 'Brass',       grooves: ['b-chorale'] },
    balkan:    { name: 'Balkans',     grooves: ['bk-sevdah', 'bk-tsifte'] },
    cumbia:    { name: 'Cumbia',      grooves: [] },
    piazzolla: { name: 'Tango nuevo', grooves: ['lyrique'] },
    africa:    { name: 'Highlife',    grooves: BC_AFRICA.AFRICA_GROOVES }   // sans rythme, l'orchestre Afrique joue le highlife
};

// Nom affiché sur le bouton quand un rythme est imposé (sinon le nom de la formation). Un rythme absent garde le nom de la formation.
const BAND_GROOVE_NAMES = {
    pop: { 'r-roll': "Rock'n'roll", 'r-classic': 'Rock classique', 'r-hard': 'Hard rock', 'r-punk': 'Punk', 'r-ballad': 'Power ballad', 'r-blues': 'Blues rock', 'r-indie': 'Indie' },
    latin: { bossa: 'Bossa nova', samba: 'Samba' },
    cuba: Object.assign({ salsa: 'Salsa' }, ...BC_AFRO.AFRO_GROOVES.map(g => ({ [g]: BC_AFRO.AFRO_STYLES[g].name }))),
    guitar: { 'f-solea': 'Flamenco', 'f-bulerias': 'Flamenco', 'f-tangos': 'Flamenco' },
    piazzolla: { lyrique: 'Milonga lyrique' },
    africa: Object.assign({}, ...BC_AFRICA.AFRICA_GROOVES.map(g => ({ [g]: BC_AFRICA.AFRICA_NAMES[g] })))
};

// Entrées du menu Orchestre, dans l'ordre du menu (index.html, <select id="band-style-select">, vérifié par le test).
// band + groove : couple orchestre + rythme ; sans groove : la formation seule.
// tempo : choisir l'entrée pose la signature et le tempo habituels du style du même nom, sauf si ce même couple est déjà actif.
const BAND_MENU = [
    { value: 'swing',            label: 'Jazz', band: 'swing' },
    { value: 'pop',              label: 'Pop-Rock', band: 'pop' },
    { value: 'rockroll',         label: "Rock : rock'n'roll années 50", band: 'pop', groove: 'r-roll', tempo: true },
    { value: 'rockclassic',      label: 'Rock : classique (années 70)', band: 'pop', groove: 'r-classic', tempo: true },
    { value: 'hardrock',         label: 'Rock : hard rock', band: 'pop', groove: 'r-hard', tempo: true },
    { value: 'punk',             label: 'Rock : punk / pop punk', band: 'pop', groove: 'r-punk', tempo: true },
    { value: 'rockballad',       label: 'Rock : power ballad', band: 'pop', groove: 'r-ballad', tempo: true },
    { value: 'bluesrock',        label: 'Rock : blues rock (shuffle)', band: 'pop', groove: 'r-blues', tempo: true },
    { value: 'indierock',        label: 'Rock : indie / britpop', band: 'pop', groove: 'r-indie', tempo: true },
    { value: 'latin',            label: 'Brasil', band: 'latin' },
    { value: 'bossa',            label: 'Brasil : bossa nova', band: 'latin', groove: 'bossa', tempo: true },
    { value: 'samba',            label: 'Brasil : samba (2/4)', band: 'latin', groove: 'samba', tempo: true },
    { value: 'cuba',             label: 'Cuba', band: 'cuba' },
    { value: 'salsa',            label: 'Cuba : salsa (4/4)', band: 'cuba', groove: 'salsa', tempo: true },
    { value: 'sonmontuno',       label: 'Cuba : son montuno (4/4)', band: 'cuba', groove: 'cu-son', tempo: true },
    { value: 'chachacha',        label: 'Cuba : cha-cha-chá (4/4)', band: 'cuba', groove: 'cu-chacha', tempo: true },
    { value: 'bolerocubano',     label: 'Cuba : bolero (4/4)', band: 'cuba', groove: 'cu-bolero', tempo: true },
    { value: 'guajira',          label: 'Cuba : guajira (4/4)', band: 'cuba', groove: 'cu-guajira', tempo: true },
    { value: 'danzon',           label: 'Cuba : danzón (2/4)', band: 'cuba', groove: 'cu-danzon', tempo: true },
    { value: 'guaguanco',        label: 'Cuba : rumba guaguancó (4/4)', band: 'cuba', groove: 'cu-guaguanco', tempo: true },
    { value: 'classic',          label: 'Classique', band: 'classic' },
    { value: 'guitar',           label: 'Guitare', band: 'guitar' },
    { value: 'flamencosolea',    label: 'Flamenco : soleá (12 temps)', band: 'guitar', groove: 'f-solea', tempo: true },
    { value: 'flamencobulerias', label: 'Flamenco : bulerías (12 temps)', band: 'guitar', groove: 'f-bulerias', tempo: true },
    { value: 'flamencotangos',   label: 'Flamenco : rumba / tangos (4/4)', band: 'guitar', groove: 'f-tangos', tempo: true },
    { value: 'brass',            label: 'Brass band', band: 'brass' },
    { value: 'balkan',           label: 'Balkans', band: 'balkan' },
    { value: 'cumbia',           label: 'Cumbia', band: 'cumbia' },
    { value: 'afrobeat',         label: 'Afrique : afrobeat', band: 'africa', groove: 'af-afrobeat', tempo: true },
    { value: 'highlife',         label: 'Afrique : highlife', band: 'africa', groove: 'af-highlife', tempo: true },
    { value: 'rumbacongo',       label: 'Afrique : rumba congolaise', band: 'africa', groove: 'af-rumba', tempo: true },
    { value: 'soukous',          label: 'Afrique : soukous / sebene', band: 'africa', groove: 'af-soukous', tempo: true },
    { value: 'benga',            label: 'Afrique : benga', band: 'africa', groove: 'af-benga', tempo: true },
    { value: 'mbaqanga',         label: 'Afrique : mbaqanga', band: 'africa', groove: 'af-mbaqanga', tempo: true },
    { value: 'piazzolla',        label: 'Tango nuevo (quinteto)', band: 'piazzolla' },
    { value: 'milongalyrique',   label: 'Milonga lyrique (quinteto)', band: 'piazzolla', groove: 'lyrique' }   // sans tempo (comportement d'origine)
];

const bcOwn = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);

// Formation valable (sinon 'swing', comme l'ancien setBandStyle).
function bandFormation(style) { return bcOwn(BAND_FORMATIONS, style) ? style : 'swing'; }

// Rythme mémorisé réellement applicable à la formation, ou null.
function bandEffectiveGroove(band, groove) {
    const f = bcOwn(BAND_FORMATIONS, band) ? BAND_FORMATIONS[band] : null;
    return (groove && f && f.grooves.includes(groove)) ? groove : null;
}

// Entrée du menu Orchestre pour une valeur, ou null.
function bandMenuEntry(value) { return BAND_MENU.find(e => e.value === value) || null; }

// Valeur du menu Orchestre pour la formation et le rythme actifs (groove = rythme effectif).
// L'orchestre Afrique sans rythme affiche « Afrique : highlife ».
function bandMenuValue(band, groove) {
    const g = band === 'africa' ? africaGroove(groove) : groove;
    const e = g ? BAND_MENU.find(x => x.band === band && x.groove === g) : null;
    return e ? e.value : band;
}

// Nom affiché après « Orchestre » (groove = rythme effectif).
function bandDisplayName(band, groove) {
    const f = bcOwn(BAND_FORMATIONS, band) ? BAND_FORMATIONS[band] : BAND_FORMATIONS.swing;
    const names = BAND_GROOVE_NAMES[band];
    const g = band === 'africa' ? africaGroove(groove) : groove;
    return (names && g && bcOwn(names, g)) ? names[g] : f.name;
}

// Choix d'une formation seule dans le menu (Jazz, Brasil, Cuba, Guitare…) : rythme mémorisé qui reste, ou null.
// Comportement d'origine conservé tel quel : les rythmes choisis dans ce menu (bossa, samba, salsa, cubains, palos, rock,
// Afrique, lyrique) sont effacés ; le baroque n'est gardé que pour Classique ou Guitare ; les rythmes qui ne viennent que
// d'un style de grille (tango, piazzolla, afro, choral, sevdah, tsifteteli) restent en mémoire.
function bandGrooveAfterPlainChoice(groove, value) {
    const g = groove || '';
    if (g === 'lyrique' || ['bossa', 'samba', 'salsa'].includes(g) || g.startsWith('f-') || g.startsWith('r-')
        || (g.startsWith('c-') && !(g === 'c-baroque' && (value === 'guitar' || value === 'classic')))
        || g.startsWith('cu-') || g.startsWith('af-')) return null;
    return groove;
}

// Tous les rythmes connus (pour l'import d'un fichier de grille).
function bandAllGrooves() {
    const seen = [];
    Object.values(BAND_FORMATIONS).forEach(f => f.grooves.forEach(g => { if (!seen.includes(g)) seen.push(g); }));
    return seen;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BAND_FORMATIONS, BAND_GROOVE_NAMES, BAND_MENU, bandFormation, bandEffectiveGroove, bandMenuEntry,
        bandMenuValue, bandDisplayName, bandGrooveAfterPlainChoice, bandAllGrooves };
}
