// Tests de grid/ireal-import.js (import des grilles iReal Pro). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const IR = require('./ireal-import.js');
const GF = require('./grid-format.js');
const TH = require('../theory.js');

// Lien irealb comme ceux d'iReal Pro : grille brouillée (la permutation par blocs de 50 signes est sa propre inverse).
const scramble = (m) => IR.irUnscramble(m);
const song = (title, style, key, music, bpm = 0) =>
    `${title}=Jobim Antonio-Carlos==${style}=${key}==${IR.IR_OBF_PREFIX}${scramble(music)}=Jazz-${style}=${bpm}=3`;
const link = (...songs) => 'irealb://' + encodeURIComponent(songs.join('==='));
const one = (music, style = 'Medium Swing', key = 'C') => IR.irealImport(`irealbook://T=C=${style}=${key}=n=${music}`).songs[0];
const brief = (g) => g.map(s => `${TH.ROOT_NAMES_DEFAULT[s.rootIndex]}:${s.chordId}x${s.measures}` + (s.split ? `+${TH.ROOT_NAMES_DEFAULT[s.split.rootIndex]}:${s.split.chordId}` : ''));

describe('lecture des liens', () => {
    test('page HTML exportée : lien irealb encodé entre guillemets, playlist et son nom', () => {
        const l = link(song('Girl From Ipanema, The', 'Bossa Nova', 'F', '{*AT44F^7XyQ|XyQ|G7XyQ|XyQ}', 0), song('Blues', 'Medium Swing', 'Bb', '[T44Bb7XyQ|Eb7XyQ|Bb7XyQ|XyQZ', 160)) + encodeURIComponent('===Mes standards');
        const r = IR.irealImport(`<html><body><a href="${l}">Mes standards</a></body></html>`);
        assert.equal(r.playlist, 'Mes standards');
        assert.equal(r.songs.length, 2);
        assert.equal(r.songs[0].name, 'The Girl From Ipanema');
        assert.deepEqual(brief(r.songs[0].grid), ['F:maj7x2', 'G:7x2']);
        assert.equal(r.songs[1].settings.bpm, 160);
    });
    test('lien collé tel quel (non encodé) et ancien format irealbook', () => {
        const r = IR.irealImport('irealbook://Song Title=LastName FirstName=Style=Ab=n=T44*A{C^7 |A-7 |D-9 |G7#5 }');
        assert.equal(r.songs.length, 1);
        assert.deepEqual(brief(r.songs[0].grid), ['C:maj7x1', 'A:m7x1', 'D:m9x1', 'G:7sharp5x1']);
        assert.equal(r.songs[0].settings.key, 8);
    });
    test('texte sans lien iReal : rien', () => {
        assert.equal(IR.irLooksLikeIReal('{"grid": []}'), false);
        assert.equal(IR.irealImport('bonjour').songs.length, 0);
    });
    test('déchiffrage : la permutation ne touche que les blocs complets de 50 signes', () => {
        const s = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        assert.equal(IR.irUnscramble(IR.irUnscramble(s)), s);
        assert.equal(IR.irUnscramble('court'), 'court');
    });
});

describe('couleurs d\'accords', () => {
    const cases = {
        '': 'majTriad', '^7': 'maj7', '^': 'maj7', '-7': 'm7', '7': '7', 'h7': 'm7b5', 'h': 'm7b5', 'o7': 'dim7', 'o': 'dimTriad',
        '+': 'augTriad', '7#5': '7sharp5', '-^7': 'mmaj7', '6': '6', '7alt': '7alt', '7b9': '7b9', '^7#11': 'maj7sharp11',
        '7sus': '7sus4', '-9': 'm9', '-11': 'm11', '9': '9'
    };
    Object.keys(cases).forEach(q => test(`« ${q} » → ${cases[q]}`, () => assert.equal(IR.irQuality(q).id, cases[q])));
    test('toutes les couleurs de la documentation iReal Pro donnent un accord jouable', () => {
        const all = ['5', '2', 'add9', '+', 'o', 'h', 'sus', '^', '-', '^7', '-7', '7', '7sus', 'h7', 'o7', '^9', '^13', '6', '69', '^7#11', '^9#11', '^7#5',
            '-6', '-69', '-^7', '-^9', '-9', '-11', '-7b5', 'h9', '-b6', '-#5', '9', '7b9', '7#9', '7#11', '7b5', '7#5', '9#11', '9b5', '9#5', '7b13',
            '7#9#5', '7#9b5', '7#9#11', '7b9#11', '7b9b5', '7b9#5', '7b9#9', '7b9b13', '7alt', '13', '13#11', '13b9', '13#9', '7b9sus', '7susadd3',
            '9sus', '13sus', '7b13sus', '11', 'min13', 'min^11', 'min^13', 'maj13#11', 'maj7b5', 'maj7#9', 'min7b6', 'min9b6', 'maj(add4)', 'min(add4)', '7(add13)'];
        all.forEach(q => {
            const c = IR.irReadChord('C' + q + ' |');
            assert.ok(c && TH.lookupChord(c.chordId), q);
            assert.equal(c.len, 1 + q.length, q);
        });
    });
    test('altérations écrites gardées : 13b9 = ♭9 + 13, 7#9#5 = #9 + #5', () => {
        assert.equal(IR.irQuality('13b9').id, 'x:M:P:b7:b9,13');
        assert.equal(IR.irQuality('7#9#5').id, 'x:M:s5:b7:s9');
    });
    test('basse, altération de la fondamentale, « 5 » signalé comme approché', () => {
        const c = IR.irReadChord('Bb7b9/Ab |');
        assert.equal(c.rootIndex, 10); assert.equal(c.bassRootIndex, 8); assert.equal(c.chordId, '7b9');
        assert.equal(IR.irQuality('5').approx, true);
    });
});

describe('grille', () => {
    test('reprises, 1re / 2e fin, accord partagé', () => {
        const s = one('T44{C |A- |N1D- |G7 } |N2D- G7 |C6 Z');
        assert.deepEqual(brief(s.grid), ['C:majTriadx1', 'A:minTriadx1', 'D:minTriadx1', 'G:7x1', 'D:minTriadx1+G:7', 'C:6x1']);
        assert.equal(s.grid[0].repeatStart, true);
        assert.equal(s.grid[2].volta, 1);
        assert.equal(s.grid[3].repeatEnd, 2);
        assert.equal(s.grid[4].volta, 2);
    });
    test('mesures répétées (x, r), mesures vides et accords identiques fusionnés', () => {
        assert.deepEqual(brief(one('[T44C | x | x | x |D-7 |G7 | r| Z').grid), ['C:majTriadx4', 'D:m7x1', 'G:7x1', 'D:m7x1', 'G:7x1']);
        assert.deepEqual(brief(one('[T44C^7XyQ|XyQ|D-7 G7 |C^7XyQZ').grid), ['C:maj7x2', 'D:m7x1+G:7', 'C:maj7x1']);
    });
    test('plus de 2 accords : 1er temps et milieu de mesure, mesure d\'origine en annotation', () => {
        const s = one('[T44C7 A7 D7 G7 |C^7 Z');
        assert.deepEqual(brief(s.grid), ['C:7x1+D:7', 'C:maj7x1']);
        assert.match(s.grid[0].note, /C7 A7 D7 G7/);
        assert.equal(s.warnings.length, 1);
    });
    test('accords alternatifs et N.C. en annotation ; N.C. garde l\'accord précédent', () => {
        const s = one('[T44C^7 (A7) |n Z');
        assert.match(s.grid[0].note, /Accords alternatifs : A7/);
        assert.equal(s.grid.length, 2);
        assert.equal(s.grid[1].chordId, 'maj7');
        assert.match(s.grid[1].note, /N\.C\./);
    });
    test('parties, segno, coda, D.S. al Coda, Fine, point d\'orgue, « 3x »', () => {
        const s = one('*A[T44C |SF |G7 Q|C ]*B{<3x>D-7 |G7 <D.S. al Coda>}[QC f|C <Fine>Z');
        const g = s.grid;
        assert.equal(g[0].partStart, 'A');
        assert.equal(g[1].segno, true);
        assert.equal(g[2].toCoda, true);
        assert.equal(g[4].partStart, 'B');
        assert.equal(g[4].repeatStart, true);
        assert.equal(g[5].jump, 'dsCoda');
        assert.equal(g[5].repeatEnd, 3);
        assert.equal(g[6].coda, true);
        assert.equal(g[6].fermata, true);
        assert.equal(g[g.length - 1].fine, true);
    });
    test('renvoi écrit après la barre de fin : rattaché à la dernière mesure', () => {
        const s = one('[T44C |G7 Z<D.C. al Fine>');
        assert.equal(s.grid[s.grid.length - 1].jump, 'dcFine');
    });
    test('signature : 3/4, changement en cours de morceau signalé, 5/4 ramené à 4/4', () => {
        assert.equal(one('[T34C |G7 Z').settings.timeSignature, '3/4');
        const ch = one('[T44C |T34G7 Z');
        assert.equal(ch.settings.timeSignature, '4/4');
        assert.ok(ch.warnings.some(w => /signature/.test(w)));
        assert.equal(one('[T54C |G7 Z').settings.timeSignature, '4/4');
    });
    test('3e fin ignorée et signalée', () => {
        const s = one('{C |N1F }|N2G }|N3A Z');
        assert.ok(s.warnings.some(w => /3e fin/.test(w)));
        assert.ok(!s.grid.some(g => g.volta === 3));
    });
});

describe('réglages', () => {
    test('tonalité mineure, orthographe, style → orchestre, tempo', () => {
        const s = one('[T44D-7 |E7b9 Z', 'Bossa Nova', 'D-');
        assert.equal(s.settings.key, 2);
        assert.equal(s.settings.quality, 'aeolian');
        assert.deepEqual(s.settings.orchestration, { style: 'latin', groove: 'bossa' });
        assert.ok(s.settings.bpm >= 50);
        assert.equal(one('[C Z', 'Medium Swing', 'F#').settings.spell, TH.deriveSpelling('F#', 'ionian'));
    });
    test('correspondance des styles', () => {
        assert.equal(IR.irOrchestraFor('Gypsy Jazz').style, 'manouche');
        assert.equal(IR.irOrchestraFor('Samba').groove, 'samba');
        assert.equal(IR.irOrchestraFor('Rock Pop').style, 'pop');
        assert.equal(IR.irOrchestraFor('Up Tempo Swing').style, 'swing');
        assert.equal(IR.irOrchestraFor('Even 8ths').swing, 0.5);
        assert.equal(IR.irOrchestraFor('', 'Latin-Cuba: Salsa').groove, 'salsa');
    });
    test('compositeur remis dans l\'ordre prénom nom', () => {
        assert.equal(IR.irComposer('Jobim Antonio-Carlos'), 'Antonio-Carlos Jobim');
    });
    test('gamme choisie par la règle de l\'appli quand elle est fournie', () => {
        const s = IR.irealImport('irealbook://T=C=Swing=C=n=[D-7 |G7 Z', { scaleFor: (id) => (id === 'm7' ? 'dorian' : null) }).songs[0];
        assert.equal(s.grid[0].scaleId, 'dorian');
        assert.equal(s.grid[1].scaleId, undefined);
    });
});

describe('compatibilité avec le format de l\'appli', () => {
    test('grille et réglages passent la lecture sécurisée des fichiers importés', () => {
        const l = link(song('Test', 'Medium Swing', 'Eb', '{*AT44Eb^7XyQ|C-7 F7|N1B-7 E7 |Ab^7 Ab-6 }|N2Bh7 E7b9 |A-^7 D13sus |G7alt C7#9#5 |F-7(Bb7) Bb7 Z', 180));
        const s = IR.irealImport(`"${l}"`).songs[0];
        const g = GF.sanitizeImportedGrid(s.grid);
        assert.ok(g, 'grille refusée');
        assert.equal(g.length, s.grid.length);
        const st = GF.sanitizeImportedSettings(s.settings);
        assert.equal(st.key, 3);
        assert.equal(st.bpm, 180);
        assert.equal(st.orchestration.style, 'swing');
        assert.ok(st.notes && /Compositeur/.test(st.notes));
    });
});
