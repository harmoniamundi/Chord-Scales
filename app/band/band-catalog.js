// band/band-catalog.js — catalogue unique des orchestres (formations), de leurs rythmes imposés et des entrées du menu
// « Orchestre », sans DOM. Avant, ces informations étaient réparties entre style-meta.js (quatre tables d'entrées de menu)
// et plusieurs méthodes du moteur (liste des rythmes valables par orchestre, noms affichés, valeur du menu, choix d'une
// entrée). Le comportement est strictement le même qu'avant : voir les empreintes sonores (e2e/empreintes.e2e.js).
//
// Trois notions :
//   · formation  : l'orchestre (Jazz, Pop-Rock, Brasil, Cuba…) = la valeur de bandStyle dans le moteur ;
//   · rythme     : une façon de jouer imposée à une formation (bossa, salsa, soleá, punk, highlife…) = _bandGroove ;
//   · entrée     : un choix possible dans le pop-up Orchestre ; soit une formation seule, soit un couple formation + rythme.
// Le pop-up Orchestre présente deux listes : « Formation » (BAND_FORMATION_ORDER) et « Rythme » (bandGrooveSelect).
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
if (typeof afroUsesGuitar === 'undefined' && typeof require === 'function') {
    var { afroUsesGuitar } = require('./afrocuban-plan.js');
}
const BC_ERA_GROOVES = typeof CLASSIC_ERA_GROOVES !== 'undefined' ? CLASSIC_ERA_GROOVES : require('./classic-eras-plan.js').CLASSIC_ERA_GROOVES;

// Formations : nom affiché sur le bouton (« Orchestre … ») sans rythme, et rythmes imposés qu'elles savent jouer.
// L'ordre des clés est celui de l'ancienne liste de setBandStyle. Un rythme absent de la liste d'une formation est ignoré
// par elle (il « ne fuit pas » : le rythme afro d'un style afro-cubain ne fait pas sonner Cuba sous l'orchestre Brasil).
const BAND_FORMATIONS = {
    swing:     { name: 'Jazz',        grooves: [] },
    pop:       { name: 'Pop-Rock',    grooves: BC_ROCK_GROOVES },
    latin:     { name: 'Brasil',      grooves: ['bossa', 'samba', 'tango', 'piazzolla'] },
    cuba:      { name: 'Cuba',        grooves: ['afro', 'salsa'].concat(BC_AFRO.AFRO_GROOVES) },
    classic:   { name: 'Classique',   grooves: ['c-baroque'].concat(BC_ERA_GROOVES) },
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

// Liste « Formation » du pop-up Orchestre : ordre et libellés.
const BAND_FORMATION_ORDER = ['swing', 'pop', 'latin', 'cuba', 'classic', 'guitar', 'brass', 'balkan', 'cumbia', 'africa', 'piazzolla'];
const BAND_FORMATION_LABELS = { swing: 'Jazz', pop: 'Pop-Rock', latin: 'Brasil', cuba: 'Cuba', classic: 'Classique (piano)', guitar: 'Guitare',
    brass: 'Brass band', balkan: 'Balkans', cumbia: 'Cumbia', africa: 'Afrique', piazzolla: 'Quinteto de tango' };

// Liste « Rythme » : ce que joue la formation sans rythme imposé (première ligne, valeur ''). null : pas de choix « Auto »
// (l'orchestre Afrique joue alors le highlife, montré comme tel). Formation sans rythme : la liste est grisée.
const BAND_AUTO_LABELS = { swing: 'Swing', pop: 'Pop-Rock (couches selon la phrase)', latin: 'Auto : bossa ou samba selon le tempo',
    cuba: 'Afro-cubain (clave, montuno)', classic: 'Piano classique', guitar: 'Guitare classique (arpèges)',
    brass: 'Auto : marche, fanfare ou choral', balkan: 'Auto : danse (selon la mesure)', cumbia: 'Cumbia', africa: null, piazzolla: 'Tango nuevo' };

// Libellés des rythmes dans la liste « Rythme ». Un rythme sans libellé n'y figure pas : 'afro' (c'est déjà le jeu par défaut
// de Cuba), 'tango' et 'piazzolla' (anciens rythmes de l'orchestre Brasil, gardés pour relire les anciens fichiers).
const BAND_GROOVE_LABELS = {
    'r-roll': "Rock'n'roll années 50", 'r-classic': 'Rock classique (années 70)', 'r-hard': 'Hard rock', 'r-punk': 'Punk / pop punk',
    'r-ballad': 'Power ballad', 'r-blues': 'Blues rock (shuffle)', 'r-indie': 'Indie / britpop',
    bossa: 'Bossa nova', samba: 'Samba (2/4)',
    salsa: 'Salsa (4/4)', 'cu-son': 'Son montuno (4/4)', 'cu-chacha': 'Cha-cha-chá (4/4)', 'cu-bolero': 'Bolero (4/4)', 'cu-guajira': 'Guajira (4/4)',
    'cu-danzon': 'Danzón (2/4)', 'cu-guaguanco': 'Rumba guaguancó (4/4)',
    'c-baroque': 'Baroque',
    'c-renaissance': 'Renaissance (pavane, consort, luth)', 'c-chaconne': 'Basse obstinée (chaconne, folia)',
    'c-nocturne': 'Romantique : nocturne (Chopin)', 'c-romantic': 'Romantique tardif (Wagner, Franck)',
    'c-impression': 'Impressionnisme (Debussy, Ravel)', 'c-satie': 'Satie (gymnopédie)',
    'c-neoclassic': 'Néoclassique (Stravinsky, Prokofiev)', 'c-minimal': 'Minimalisme (Glass, Reich)',
    'f-solea': 'Flamenco : soleá (12 temps)', 'f-bulerias': 'Flamenco : bulerías (12 temps)', 'f-tangos': 'Flamenco : rumba / tangos (4/4)',
    'b-chorale': 'Choral (hymne, cantique)',
    'bk-sevdah': 'Sevdah, ballade lente', 'bk-tsifte': 'Tsifteteli / čoček',
    'af-afrobeat': 'Afrobeat', 'af-highlife': 'Highlife', 'af-rumba': 'Rumba congolaise', 'af-soukous': 'Soukous / sebene', 'af-benga': 'Benga', 'af-mbaqanga': 'Mbaqanga',
    lyrique: 'Milonga lyrique'
};

// Choix possibles du pop-up Orchestre (valeurs reçues par chooseBandStyle ; ancien menu à une seule liste, dans son ordre).
// band + groove : couple orchestre + rythme ; sans groove : la formation seule.
// tempo : choisir l'entrée pose la signature et le tempo habituels du style du même nom, sauf si ce même couple est déjà actif.
// Les dernières entrées (baroque, choral, sevdah, tsifteteli) n'étaient accessibles que par un style de grille : elles imposent
// le rythme sans toucher au tempo ni à la mesure (leur jeu s'adapte à toutes les signatures).
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
    { value: 'milongalyrique',   label: 'Milonga lyrique (quinteto)', band: 'piazzolla', groove: 'lyrique' },  // sans tempo (comportement d'origine)
    { value: 'classic-baroque',  label: 'Classique : baroque', band: 'classic', groove: 'c-baroque' },
    // Écritures de piano par époque (band/classic-eras-plan.js) : imposent le rythme sans toucher au tempo ni à la mesure
    { value: 'classic-renaissance', label: 'Classique : Renaissance', band: 'classic', groove: 'c-renaissance' },
    { value: 'classic-chaconne',    label: 'Classique : basse obstinée (chaconne)', band: 'classic', groove: 'c-chaconne' },
    { value: 'classic-nocturne',    label: 'Classique : nocturne romantique', band: 'classic', groove: 'c-nocturne' },
    { value: 'classic-romantic',    label: 'Classique : romantisme tardif', band: 'classic', groove: 'c-romantic' },
    { value: 'classic-impression',  label: 'Classique : impressionnisme', band: 'classic', groove: 'c-impression' },
    { value: 'classic-satie',       label: 'Classique : Satie', band: 'classic', groove: 'c-satie' },
    { value: 'classic-neoclassic',  label: 'Classique : néoclassique', band: 'classic', groove: 'c-neoclassic' },
    { value: 'classic-minimal',     label: 'Classique : minimalisme', band: 'classic', groove: 'c-minimal' },
    { value: 'guitar-baroque',   label: 'Guitare : baroque', band: 'guitar', groove: 'c-baroque' },
    { value: 'brass-chorale',    label: 'Brass band : choral', band: 'brass', groove: 'b-chorale' },
    { value: 'balkan-sevdah',    label: 'Balkans : sevdah', band: 'balkan', groove: 'bk-sevdah' },
    { value: 'balkan-tsifte',    label: 'Balkans : tsifteteli', band: 'balkan', groove: 'bk-tsifte' }
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

// Choix du pop-up (BAND_MENU) qui correspond à la formation et au rythme actifs (groove = rythme effectif).
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
// Afrique, lyrique) sont effacés ; le baroque n'est gardé que pour Classique ou Guitare, les écritures par époque (nocturne,
// impressionnisme…) pour Classique ; les rythmes qui ne viennent que
// d'un style de grille (tango, piazzolla, afro, choral, sevdah, tsifteteli) restent en mémoire.
function bandGrooveAfterPlainChoice(groove, value) {
    const g = groove || '';
    if (g === 'lyrique' || ['bossa', 'samba', 'salsa'].includes(g) || g.startsWith('f-') || g.startsWith('r-')
        || (g.startsWith('c-') && !((g === 'c-baroque' && (value === 'guitar' || value === 'classic')) || (BC_ERA_GROOVES.includes(g) && value === 'classic')))
        || g.startsWith('cu-') || g.startsWith('af-')) return null;
    return groove;
}

// Entrée du pop-up pour un couple formation + rythme, ou null.
function bandEntryFor(band, groove) { return (groove && BAND_MENU.find(e => e.band === band && e.groove === groove)) || null; }

// Liste « Rythme » d'une formation : { options: [{ value, label }], value, disabled }.
// groove = rythme effectif (getEffectiveGroove). Un rythme actif sans libellé (afro, anciens tango / piazzolla) s'affiche « Auto ».
function bandGrooveSelect(band, groove) {
    const b = bandFormation(band);
    const grooves = BAND_FORMATIONS[b].grooves.filter(g => bcOwn(BAND_GROOVE_LABELS, g) && bandEntryFor(b, g));
    const auto = BAND_AUTO_LABELS[b];
    const options = (auto ? [{ value: '', label: auto }] : []).concat(grooves.map(g => ({ value: g, label: BAND_GROOVE_LABELS[g] })));
    const shown = b === 'africa' ? africaGroove(groove) : groove;
    const value = options.some(o => o.value === shown) && shown ? shown : (auto ? '' : options[0].value);
    return { options, value, disabled: grooves.length === 0 };
}

// ===== Instruments : changer le timbre d'un pupitre =====
// Deux pupitres réglables dans le pop-up Orchestre : « Harmonie » (l'instrument du premier curseur de volume) et « Basse ».
// Seul le timbre change : la formation écrit les mêmes notes (voicings, rythme, durées), un autre instrument les joue.
// '' = Auto : l'instrument d'origine de la formation, son strictement inchangé.
const BAND_INSTRUMENTS = {
    harmony: { piano: 'Piano', epiano: 'Piano électrique', organ: 'Orgue', guitar: 'Guitare nylon', egtr: 'Guitare électrique', accordion: 'Accordéon' },
    bass: { upright: 'Contrebasse', electric: 'Basse électrique', tuba: 'Tuba' }
};

// Instrument d'origine de chaque pupitre, ou null quand le pupitre n'est pas réglable : sections de plusieurs instruments
// (Brass band, quinteto de tango, Afrique : cuivres et guitares) pour l'harmonie, formations sans basse (Classique, Guitare).
function bandNativeInstrument(band, groove, role) {
    const b = bandFormation(band);
    if (role === 'harmony') {
        if (b === 'swing' || b === 'pop' || b === 'classic') return 'piano';
        if (b === 'latin' || b === 'guitar') return 'guitar';
        if (b === 'cuba') return afroUsesGuitar(groove) ? 'guitar' : 'piano';
        if (b === 'balkan' || b === 'cumbia') return 'accordion';
        return null;
    }
    if (role === 'bass') {
        if (b === 'classic' || b === 'guitar') return null;
        if (b === 'brass') return 'tuba';
        if (b === 'pop') return groove === 'r-roll' ? 'upright' : 'electric';   // rock'n'roll des années 50 : la contrebasse mène
        if (b === 'cumbia' || b === 'africa') return 'electric';
        return 'upright';
    }
    return null;
}

// Choix enregistré pour une formation et un pupitre ('' = Auto). choices = { swing: { harmony: 'organ', bass: '' }, … }.
// Un choix inconnu, ou égal à l'instrument d'origine, vaut Auto.
function bandInstrumentChoice(choices, band, groove, role) {
    const b = bandFormation(band);
    const native = bandNativeInstrument(b, groove, role);
    if (!native) return '';
    const c = choices && choices[b] && choices[b][role];
    return (typeof c === 'string' && bcOwn(BAND_INSTRUMENTS[role], c) && c !== native) ? c : '';
}

// Liste d'un pupitre dans le pop-up : { options: [{ value, label }], value, disabled }.
function bandInstrumentSelect(choices, band, groove, role) {
    const native = bandNativeInstrument(band, groove, role);
    if (!native) return { options: [{ value: '', label: '—' }], value: '', disabled: true };
    const names = BAND_INSTRUMENTS[role];
    const options = [{ value: '', label: 'Auto : ' + names[native].toLowerCase() }]
        .concat(Object.keys(names).filter(k => k !== native).map(k => ({ value: k, label: names[k] })));
    return { options, value: bandInstrumentChoice(choices, band, groove, role), disabled: false };
}

// Nouveau tableau de choix après un choix dans le pop-up (l'original n'est pas modifié ; Auto retire l'entrée).
function bandSetInstrument(choices, band, role, value) {
    const b = bandFormation(band);
    const out = {};
    Object.keys(choices || {}).forEach(k => { out[k] = Object.assign({}, choices[k]); });
    const cur = Object.assign({}, out[b]);
    if (value && bcOwn(BAND_INSTRUMENTS[role] || {}, value)) cur[role] = value; else delete cur[role];
    if (Object.keys(cur).length) out[b] = cur; else delete out[b];
    return out;
}

// Choix relus d'un fichier : formations et instruments connus seulement.
function bandSanitizeInstruments(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(b => {
        if (!bcOwn(BAND_FORMATIONS, b) || !raw[b] || typeof raw[b] !== 'object') return;
        const cur = {};
        ['harmony', 'bass'].forEach(r => { const v = raw[b][r]; if (typeof v === 'string' && bcOwn(BAND_INSTRUMENTS[r], v)) cur[r] = v; });
        if (Object.keys(cur).length) out[b] = cur;
    });
    return out;
}

// Tous les rythmes connus (pour l'import d'un fichier de grille).
function bandAllGrooves() {
    const seen = [];
    Object.values(BAND_FORMATIONS).forEach(f => f.grooves.forEach(g => { if (!seen.includes(g)) seen.push(g); }));
    return seen;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BAND_FORMATIONS, BAND_GROOVE_NAMES, BAND_FORMATION_ORDER, BAND_FORMATION_LABELS, BAND_AUTO_LABELS, BAND_GROOVE_LABELS,
        BAND_MENU, bandFormation, bandEffectiveGroove, bandMenuEntry, bandEntryFor, bandGrooveSelect,
        BAND_INSTRUMENTS, bandNativeInstrument, bandInstrumentChoice, bandInstrumentSelect, bandSetInstrument, bandSanitizeInstruments,
        bandMenuValue, bandDisplayName, bandGrooveAfterPlainChoice, bandAllGrooves };
}
