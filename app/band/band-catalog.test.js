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

    test('pop-up Orchestre d\'index.html : liste Formation = BAND_FORMATION_ORDER (valeurs, libellés), liste Rythme présente', () => {
        const m = HTML.match(/<select id="band-formation-select"[\s\S]*?<\/select>/);
        assert.ok(m, 'liste band-formation-select introuvable');
        const opts = [...m[0].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(x => ({ value: x[1], label: unesc(x[2]).trim() }));
        assert.deepEqual(opts, C.BAND_FORMATION_ORDER.map(b => ({ value: b, label: C.BAND_FORMATION_LABELS[b] })));
        assert.deepEqual(C.BAND_FORMATION_ORDER.slice().sort(), Object.keys(C.BAND_FORMATIONS).sort());
        assert.match(HTML, /<select id="band-groove-select" onchange="app\.jam\.chooseBandGroove\(this\.value\)"/);
        assert.match(HTML, /<select id="band-formation-select" onchange="app\.jam\.chooseBandFormation\(this\.value\)"/);
        assert.ok(!/band-style-select/.test(HTML), 'ancien menu à une seule liste encore présent');
    });

    test('bandGrooveSelect : liste Rythme de chaque formation', () => {
        const opt = (b, g) => C.bandGrooveSelect(b, g);
        assert.deepEqual(opt('swing', null), { options: [{ value: '', label: 'Swing' }], value: '', disabled: true });
        assert.equal(opt('cumbia', null).disabled, true);
        const pop = opt('pop', 'r-punk');
        assert.equal(pop.value, 'r-punk');
        assert.deepEqual(pop.options.map(o => o.value), [''].concat(C.BAND_FORMATIONS.pop.grooves));
        assert.equal(pop.disabled, false);
        // rythmes autrefois accessibles seulement par un style de grille
        assert.deepEqual(opt('classic', 'c-baroque').options.map(o => o.value), ['', 'c-baroque']);
        assert.equal(opt('classic', 'c-baroque').value, 'c-baroque');
        assert.ok(opt('guitar', null).options.some(o => o.value === 'c-baroque'));
        assert.deepEqual(opt('brass', null).options.map(o => o.value), ['', 'b-chorale']);
        assert.deepEqual(opt('balkan', 'bk-tsifte').options.map(o => o.value), ['', 'bk-sevdah', 'bk-tsifte']);
        assert.deepEqual(opt('piazzolla', 'lyrique').options.map(o => o.value), ['', 'lyrique']);
        // Afrique : pas de « Auto », le highlife est montré sans rythme imposé
        assert.equal(opt('africa', null).options[0].value, 'af-afrobeat');
        assert.equal(opt('africa', null).value, 'af-highlife');
        assert.equal(opt('africa', 'af-benga').value, 'af-benga');
        // rythme actif sans libellé : « Auto » (Cuba joue déjà l'afro-cubain par défaut ; anciens rythmes de Brasil)
        assert.equal(opt('cuba', 'afro').value, '');
        assert.ok(!opt('cuba', null).options.some(o => o.value === 'afro'));
        assert.equal(opt('latin', 'tango').value, '');
        // formation inconnue : Jazz
        assert.equal(opt('zzz', null).options[0].label, 'Swing');
        // chaque option de rythme correspond à un choix du pop-up (et donc à la règle de tempo de chooseBandStyle)
        C.BAND_FORMATION_ORDER.forEach(b => opt(b, null).options.filter(o => o.value).forEach(o => assert.ok(C.bandEntryFor(b, o.value), `${b} ${o.value}`)));
    });

    test('nouvelles entrées (baroque, choral, sevdah, tsifteteli) : rythme imposé sans tempo', () => {
        ['classic-baroque', 'guitar-baroque', 'brass-chorale', 'balkan-sevdah', 'balkan-tsifte'].forEach(v => {
            const e = C.bandMenuEntry(v);
            assert.ok(e && e.groove, v);
            assert.ok(!e.tempo, v);
            assert.equal(C.bandEntryFor(e.band, e.groove), e, v);
        });
        assert.equal(C.bandEntryFor('cuba', 'afro'), null);
        assert.equal(C.bandEntryFor('pop', null), null);
    });

    test('entrées : formation existante, rythme joué par cette formation, entrée seule = formation', () => {
        C.BAND_MENU.forEach(e => {
            assert.ok(C.BAND_FORMATIONS[e.band], e.value);
            if (e.groove) assert.ok(C.BAND_FORMATIONS[e.band].grooves.includes(e.groove), e.value);
            else { assert.equal(e.value, e.band); assert.ok(!e.tempo, e.value); }
            assert.ok(e.label, e.value);
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

    test('bandMenuValue : choix du pop-up qui correspond à la formation et au rythme actifs', () => {
        assert.equal(C.bandMenuValue('piazzolla', 'lyrique'), 'milongalyrique');
        assert.equal(C.bandMenuValue('piazzolla', null), 'piazzolla');
        assert.equal(C.bandMenuValue('latin', 'bossa'), 'bossa');
        assert.equal(C.bandMenuValue('latin', 'tango'), 'latin');
        assert.equal(C.bandMenuValue('cuba', 'cu-son'), 'sonmontuno');
        assert.equal(C.bandMenuValue('cuba', 'afro'), 'cuba');
        assert.equal(C.bandMenuValue('guitar', 'f-tangos'), 'flamencotangos');
        assert.equal(C.bandMenuValue('guitar', 'c-baroque'), 'guitar-baroque');
        assert.equal(C.bandMenuValue('pop', 'r-punk'), 'punk');
        assert.equal(C.bandMenuValue('africa', null), 'highlife');
        assert.equal(C.bandMenuValue('africa', 'af-benga'), 'benga');
        assert.equal(C.bandMenuValue('balkan', 'bk-sevdah'), 'balkan-sevdah');
        assert.equal(C.bandMenuValue('brass', 'b-chorale'), 'brass-chorale');
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

    test('instruments : pupitre d\'origine de chaque formation, null quand il n\'est pas réglable', () => {
        const N = (b, g, r) => C.bandNativeInstrument(b, g, r);
        assert.deepEqual(C.BAND_FORMATION_ORDER.map(b => N(b, null, 'harmony')),
            ['piano', 'piano', 'guitar', 'piano', 'piano', 'guitar', null, 'accordion', 'accordion', null, null]);
        assert.deepEqual(C.BAND_FORMATION_ORDER.map(b => N(b, null, 'bass')),
            ['upright', 'electric', 'upright', 'upright', null, null, 'tuba', 'upright', 'electric', 'electric', 'upright']);
        assert.equal(N('cuba', 'cu-son', 'harmony'), 'guitar');      // tres
        assert.equal(N('cuba', 'cu-chacha', 'harmony'), 'piano');
        assert.equal(N('pop', 'r-roll', 'bass'), 'upright');        // rock'n'roll : la contrebasse mène
        assert.equal(N('swing', null, 'drums'), null);
    });

    test('instruments : choix enregistré, Auto quand il est inconnu ou égal à l\'instrument d\'origine', () => {
        const ch = { swing: { harmony: 'organ', bass: 'piano' }, latin: { harmony: 'guitar' }, brass: { harmony: 'piano', bass: 'electric' } };
        assert.equal(C.bandInstrumentChoice(ch, 'swing', null, 'harmony'), 'organ');
        assert.equal(C.bandInstrumentChoice(ch, 'swing', null, 'bass'), '');        // « piano » n'est pas une basse
        assert.equal(C.bandInstrumentChoice(ch, 'latin', null, 'harmony'), '');     // guitare = instrument d'origine
        assert.equal(C.bandInstrumentChoice(ch, 'brass', null, 'harmony'), '');     // section : pas réglable
        assert.equal(C.bandInstrumentChoice(ch, 'brass', null, 'bass'), 'electric');
        assert.equal(C.bandInstrumentChoice(ch, 'pop', null, 'harmony'), '');
        assert.equal(C.bandInstrumentChoice(null, 'pop', null, 'harmony'), '');
        // le choix est propre à chaque formation
        assert.equal(C.bandInstrumentChoice({ swing: { harmony: 'organ' } }, 'balkan', null, 'harmony'), '');
    });

    test('instruments : listes du pop-up', () => {
        const h = C.bandInstrumentSelect({ swing: { harmony: 'epiano' } }, 'swing', null, 'harmony');
        assert.equal(h.options[0].label, 'Auto : piano');
        assert.equal(h.value, 'epiano');
        assert.ok(!h.options.some(o => o.value === 'piano'), 'l\'instrument d\'origine est le choix Auto');
        assert.equal(h.disabled, false);
        assert.deepEqual(C.bandInstrumentSelect({}, 'brass', null, 'harmony'), { options: [{ value: '', label: '—' }], value: '', disabled: true });
        assert.equal(C.bandInstrumentSelect({}, 'guitar', null, 'bass').disabled, true);
        assert.deepEqual(C.bandInstrumentSelect({}, 'piazzolla', null, 'bass').options.map(o => o.value), ['', 'electric', 'tuba']);
    });

    test('instruments : bandSetInstrument ne modifie pas l\'original ; Auto retire l\'entrée', () => {
        const a = { swing: { harmony: 'organ' } };
        const b = C.bandSetInstrument(a, 'swing', 'bass', 'electric');
        assert.deepEqual(a, { swing: { harmony: 'organ' } });
        assert.deepEqual(b, { swing: { harmony: 'organ', bass: 'electric' } });
        assert.deepEqual(C.bandSetInstrument(b, 'swing', 'harmony', ''), { swing: { bass: 'electric' } });
        assert.deepEqual(C.bandSetInstrument({ swing: { bass: 'electric' } }, 'swing', 'bass', ''), {});
        assert.deepEqual(C.bandSetInstrument({}, 'swing', 'bass', 'violon'), {});
    });

    test('instruments : relecture d\'un fichier (formations et instruments connus seulement)', () => {
        assert.deepEqual(C.bandSanitizeInstruments({ swing: { harmony: 'organ', bass: 'tuba', drums: 'x' }, zzz: { harmony: 'piano' }, pop: { harmony: 'violon' }, latin: 'piano' }),
            { swing: { harmony: 'organ', bass: 'tuba' } });
        [null, undefined, 'x', [], 3].forEach(v => assert.deepEqual(C.bandSanitizeInstruments(v), {}));
    });
});
