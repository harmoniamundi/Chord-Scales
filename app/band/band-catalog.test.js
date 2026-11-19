const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./band-catalog.js');
const { ROCK_GROOVES } = require('./rock-plan.js');
const { AFRO_GROOVES } = require('./afrocuban-plan.js');
const { AFRICA_GROOVES } = require('./africa-plan.js');
const M = require('../styles/style-meta.js');
const { IMPORT_GROOVES } = require('../grid/grid-format.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

describe('band-catalog : catalogue des orchestres', () => {
    test('formations : les onze orchestres du moteur, dans l\'ordre d\'origine', () => {
        assert.deepEqual(Object.keys(C.BAND_FORMATIONS), ['swing', 'pop', 'latin', 'cuba', 'classic', 'guitar', 'brass', 'balkan', 'cumbia', 'piazzolla', 'africa']);
        assert.deepEqual(C.BAND_FORMATIONS.pop.grooves, ROCK_GROOVES);
        assert.deepEqual(C.BAND_FORMATIONS.cuba.grooves, ['afro', 'salsa'].concat(AFRO_GROOVES));
        assert.deepEqual(C.BAND_FORMATIONS.africa.grooves, AFRICA_GROOVES);
    });

    test('bandFormation : formation inconnue → Jazz', () => {
        assert.equal(C.bandFormation('cuba'), 'cuba');
        assert.equal(C.bandFormation('zzz'), 'swing');
        assert.equal(C.bandFormation(undefined), 'swing');
        assert.equal(C.bandFormation('constructor'), 'swing');
    });

    test('bandEffectiveGroove : un rythme ne vaut que pour sa formation', () => {
        assert.equal(C.bandEffectiveGroove('latin', 'samba'), 'samba');
        assert.equal(C.bandEffectiveGroove('latin', 'afro'), null);
        assert.equal(C.bandEffectiveGroove('cuba', 'afro'), 'afro');
        assert.equal(C.bandEffectiveGroove('guitar', 'c-baroque'), 'c-baroque');
        assert.equal(C.bandEffectiveGroove('classic', 'f-solea'), null);
        assert.equal(C.bandEffectiveGroove('swing', 'bossa'), null);
        assert.equal(C.bandEffectiveGroove('pop', null), null);
        assert.equal(C.bandEffectiveGroove('zzz', 'bossa'), null);
    });

    test('le menu Orchestre d\'index.html est exactement BAND_MENU (valeurs, libellés, ordre)', () => {
        const m = HTML.match(/<select id="band-style-select"[\s\S]*?<\/select>/);
        assert.ok(m, 'menu band-style-select introuvable');
        const opts = [...m[0].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(x => ({ value: x[1], label: unesc(x[2]).trim() }));
        assert.deepEqual(opts, C.BAND_MENU.map(e => ({ value: e.value, label: e.label })));
    });

    test('entrées : formation existante, rythme joué par cette formation, entrée seule = formation', () => {
        C.BAND_MENU.forEach(e => {
            assert.ok(C.BAND_FORMATIONS[e.band], e.value);
            if (e.groove) assert.ok(C.BAND_FORMATIONS[e.band].grooves.includes(e.groove), e.value);
            else { assert.equal(e.value, e.band); assert.ok(!e.tempo, e.value); }
        });
        const vals = C.BAND_MENU.map(e => e.value);
        assert.equal(new Set(vals).size, vals.length, 'valeurs en double');
        const pairs = C.BAND_MENU.filter(e => e.groove).map(e => e.band + '|' + e.groove);
        assert.equal(new Set(pairs).size, pairs.length, 'couple orchestre + rythme en double');
    });

    test('entrées avec tempo : un style de grille du même nom donne la même formation, le même rythme et un tempo', () => {
        C.BAND_MENU.filter(e => e.tempo).forEach(e => {
            assert.equal(M.bandStyleFor(e.value), e.band, e.value);
            assert.equal(M.grooveHintFor(e.value), e.groove, e.value);
            assert.ok(M.tempoMeterFor(e.value), e.value);
        });
        assert.equal(C.bandMenuEntry('milongalyrique').tempo, undefined);   // la milonga ne touche ni au tempo ni à la mesure
    });

    test('bandMenuValue : valeur affichée par le menu', () => {
        assert.equal(C.bandMenuValue('piazzolla', 'lyrique'), 'milongalyrique');
        assert.equal(C.bandMenuValue('piazzolla', null), 'piazzolla');
        assert.equal(C.bandMenuValue('latin', 'bossa'), 'bossa');
        assert.equal(C.bandMenuValue('latin', 'tango'), 'latin');
        assert.equal(C.bandMenuValue('cuba', 'cu-son'), 'sonmontuno');
        assert.equal(C.bandMenuValue('cuba', 'afro'), 'cuba');
        assert.equal(C.bandMenuValue('guitar', 'f-tangos'), 'flamencotangos');
        assert.equal(C.bandMenuValue('guitar', 'c-baroque'), 'guitar');
        assert.equal(C.bandMenuValue('pop', 'r-punk'), 'punk');
        assert.equal(C.bandMenuValue('africa', null), 'highlife');
        assert.equal(C.bandMenuValue('africa', 'af-benga'), 'benga');
        assert.equal(C.bandMenuValue('balkan', 'bk-sevdah'), 'balkan');
        assert.equal(C.bandMenuValue('swing', null), 'swing');
    });

    test('bandDisplayName : nom du bouton Orchestre', () => {
        const cases = [['swing', null, 'Jazz'], ['pop', null, 'Pop-Rock'], ['pop', 'r-roll', "Rock'n'roll"], ['latin', null, 'Brasil'],
            ['latin', 'samba', 'Samba'], ['latin', 'tango', 'Brasil'], ['cuba', null, 'Cuba'], ['cuba', 'afro', 'Cuba'], ['cuba', 'salsa', 'Salsa'],
            ['cuba', 'cu-chacha', 'Cha-cha-chá'], ['classic', 'c-baroque', 'Classique'], ['guitar', null, 'Guitare'], ['guitar', 'c-baroque', 'Guitare'],
            ['guitar', 'f-solea', 'Flamenco'], ['brass', 'b-chorale', 'Brass'], ['balkan', 'bk-tsifte', 'Balkans'], ['cumbia', null, 'Cumbia'],
            ['africa', null, 'Highlife'], ['africa', 'af-rumba', 'Rumba congolaise'], ['piazzolla', null, 'Tango nuevo'],
            ['piazzolla', 'lyrique', 'Milonga lyrique'], ['zzz', null, 'Jazz']];
        cases.forEach(([b, g, n]) => assert.equal(C.bandDisplayName(b, g), n, `${b} ${g}`));
    });

    test('bandGrooveAfterPlainChoice : rythmes effacés ou gardés par le choix d\'une formation seule (comportement d\'origine)', () => {
        ['lyrique', 'bossa', 'samba', 'salsa', 'f-solea', 'r-punk', 'cu-son', 'af-benga'].forEach(g => assert.equal(C.bandGrooveAfterPlainChoice(g, 'swing'), null, g));
        ['tango', 'piazzolla', 'afro', 'b-chorale', 'bk-sevdah', 'bk-tsifte'].forEach(g => assert.equal(C.bandGrooveAfterPlainChoice(g, 'swing'), g, g));
        assert.equal(C.bandGrooveAfterPlainChoice('c-baroque', 'swing'), null);
        assert.equal(C.bandGrooveAfterPlainChoice('c-baroque', 'classic'), 'c-baroque');
        assert.equal(C.bandGrooveAfterPlainChoice('c-baroque', 'guitar'), 'c-baroque');
        assert.equal(C.bandGrooveAfterPlainChoice(null, 'swing'), null);
    });

    test('tous les rythmes imposés par un style de grille sont connus d\'une formation, et l\'import les accepte tous', () => {
        const all = C.bandAllGrooves();
        // 'piazzolla' (style Piazzolla) n'est valable que pour l'orchestre Brasil : sous le quinteto il est ignoré (comportement d'origine)
        Object.values(M.STYLE_GROOVE).forEach(g => assert.ok(all.includes(g), g));
        assert.deepEqual(all.slice().sort(), IMPORT_GROOVES.slice().sort());
        Object.values(M.STYLE_BAND).forEach(b => assert.ok(C.BAND_FORMATIONS[b], b));
    });
});
