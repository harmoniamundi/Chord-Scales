'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const K = require('./chord-notes.js');
const { chordPickerHtml, chordPickerBuild, chordPickerParseRoot } = require('./chord-picker.js');
const T = require('../theory.js');

const st = (txt) => K.chordsParse(txt);

describe('format enregistré', () => {
    test('aller-retour et valeurs par défaut', () => {
        assert.equal(K.chordsFormat(K.chordsDefault()), 'b|0~majTriad~4');
        const s = st('a|1f~m7~2|7~7~0.5|10s~x:M:P:b7:b9,s11~16');
        assert.equal(s.mode, 'a');
        assert.equal(s.chords.length, 3);
        assert.deepEqual(s.chords[0], { pc: 1, acc: 'f', id: 'm7', beats: 2 });
        assert.equal(K.chordsFormat(s), 'a|1f~m7~2|7~7~0.5|10s~x:M:P:b7:b9,s11~16');
    });
    test('une touche blanche n\'a pas d\'altération', () => {
        assert.equal(st('b|0s~maj7~4').chords[0].acc, null);
        assert.equal(K.chordsParseRoot('12'), null);
        assert.deepEqual(K.chordsParseRoot('3f'), { pc: 3, acc: 'f' });
    });
    test('accords invalides ignorés, bloc vide refusé', () => {
        assert.equal(st('b|0~inconnu~4'), null);
        assert.equal(st('z|0~maj7~4'), null);
        assert.equal(st(''), null);
        assert.equal(st(undefined), null);
        const s = st('b|0~maj7~4|99~maj7~4|0~maj7~abc|2~m7~1');
        assert.deepEqual(s.chords.map(c => c.id), ['maj7', 'm7']);
    });
    test('limites : durée et nombre d\'accords', () => {
        assert.equal(K.chordsClampBeats(0), 0.5);
        assert.equal(K.chordsClampBeats(999), 32);
        assert.equal(K.chordsClampBeats(1.3), 1.5);
        const many = 'b' + '|0~maj7~1'.repeat(40);
        assert.equal(st(many).chords.length, K.CH_MAX_CHORDS);
    });
    test('chordsCanon normalise', () => {
        assert.equal(K.chordsCanon(' b|0~maj7~4 '), 'b|0~maj7~4');
        assert.equal(K.chordsCanon('nimporte quoi'), null);
    });
});

describe('symboles', () => {
    const c = (pc, acc, id) => K.chordsNewChord(pc, acc, id, 4);
    test('notation jazz de l\'application', () => {
        assert.equal(K.chordsLabel(c(0, null, 'majTriad')), 'C');
        assert.equal(K.chordsLabel(c(0, null, 'maj7')), 'CΔ');
        assert.equal(K.chordsLabel(c(2, null, 'm7')), 'D−7');
        assert.equal(K.chordsLabel(c(7, null, '7')), 'G7');
        assert.equal(K.chordsLabel(c(11, null, 'm7b5')), 'Bø');
    });
    test('dièse ou bémol selon le choix', () => {
        assert.equal(K.chordsLabel(c(1, 's', 'maj7')), 'C#Δ');
        assert.equal(K.chordsLabel(c(1, 'f', 'maj7')), 'DbΔ');
        assert.equal(K.chordsLabel(c(10, null, '7')), 'Bb7');
    });
    test('accord composé : symbole généré', () => {
        assert.match(K.chordsLabel(c(7, null, 'x:M:P:b7:b9,s11')), /^G/);
    });
    test('HTML : glyphes isolés et texte échappé', () => {
        const h = K.chordsLabelHtml(c(1, 'f', 'maj7'));
        assert.match(h, /D<span class="jam-glyph">♭<\/span><span class="jam-glyph">Δ<\/span>/);
        assert.ok(!/[<>]\w*script/.test(h));
    });
    test('durée affichée', () => {
        assert.deepEqual([0.5, 1, 1.5, 4].map(K.chordsBeatsText), ['½', '1', '1½', '4']);
    });
});

describe('notes jouées', () => {
    test('Do majeur : do, mi, sol au-dessus de fa2', () => {
        assert.deepEqual(K.chordsMidi(K.chordsNewChord(0, null, 'majTriad', 4)), [60, 64, 67]);
    });
    test('la fondamentale reste entre fa2 et mi3 ; les tensions montent', () => {
        for (let pc = 0; pc < 12; pc++) {
            const m = K.chordsMidi(K.chordsNewChord(pc, null, 'maj9', 4));
            assert.ok(m[0] >= 53 && m[0] <= 64, `pc ${pc} : ${m[0]}`);
            assert.ok(m.every((n, i) => i === 0 || n > m[i - 1]), 'notes croissantes');
            assert.equal(m[0] % 12, pc);
        }
    });
    test('plaqué : toutes les notes ensemble, par accord', () => {
        const p = K.chordsPlan(st('b|0~majTriad~2|7~7~4'));
        assert.equal(p.total, 6);
        assert.deepEqual(p.chords, [{ at: 0, len: 2 }, { at: 2, len: 4 }]);
        const first = p.events.filter(e => e.chord === 0);
        assert.equal(first.length, 3);
        assert.ok(first.every(e => e.at === 0 && e.len > 1.5 && e.len < 2));
        assert.ok(p.events.filter(e => e.chord === 1).every(e => e.at === 2));
    });
    test('arpégé : une note tous les ½ temps, de bas en haut', () => {
        const p = K.chordsPlan(st('a|0~maj7~4'));
        assert.deepEqual(p.events.map(e => e.at), [0, 0.5, 1, 1.5]);
        assert.deepEqual(p.events.map(e => e.midi), K.chordsMidi(K.chordsNewChord(0, null, 'maj7', 4)));
    });
    test('arpégé d\'un accord court : les notes tiennent dans sa durée', () => {
        const p = K.chordsPlan(st('a|0~maj9~1'));
        assert.ok(p.events.every(e => e.at < 1));
    });
});

describe('modifications', () => {
    const base = st('b|0~maj7~4|7~7~2');
    test('fondamentale, accord, durée, lecture', () => {
        assert.equal(K.chordsFormat(K.chordsEdit(base, 0, 'setRoot', { pc: 3, acc: 'f' })), 'b|3f~maj7~4|7~7~2');
        assert.equal(K.chordsFormat(K.chordsEdit(base, 1, 'setId', 'm7')), 'b|0~maj7~4|7~m7~2');
        assert.equal(K.chordsFormat(K.chordsEdit(base, 1, 'setBeats', 8)), 'b|0~maj7~4|7~7~8');
        assert.equal(K.chordsEdit(base, 0, 'setMode', 'a').mode, 'a');
        assert.equal(K.chordsEdit(base, 0, 'setMode', 'b'), null);
    });
    test('rien ne change → null ; l\'original n\'est jamais modifié', () => {
        assert.equal(K.chordsEdit(base, 0, 'setId', 'maj7'), null);
        assert.equal(K.chordsEdit(base, 0, 'setBeats', 4), null);
        assert.equal(K.chordsEdit(base, 5, 'setBeats', 2), null);
        assert.equal(K.chordsEdit(base, 0, 'setId', 'zzz'), null);
        assert.equal(K.chordsFormat(base), 'b|0~maj7~4|7~7~2');
    });
    test('ajouter copie l\'accord juste après ; supprimer garde au moins un accord', () => {
        assert.equal(K.chordsFormat(K.chordsEdit(base, 0, 'add')), 'b|0~maj7~4|0~maj7~4|7~7~2');
        assert.equal(K.chordsFormat(K.chordsEdit(base, 0, 'remove')), 'b|7~7~2');
        assert.equal(K.chordsEdit(st('b|0~maj7~4'), 0, 'remove'), null);
        const full = { mode: 'b', chords: Array.from({ length: K.CH_MAX_CHORDS }, () => K.chordsNewChord(0, null, 'maj7', 1)) };
        assert.equal(K.chordsEdit(full, 0, 'add'), null);
    });
    test('déplacer', () => {
        assert.equal(K.chordsFormat(K.chordsEdit(base, 0, 'move', 1)), 'b|7~7~2|0~maj7~4');
        assert.equal(K.chordsEdit(base, 0, 'move', -1), null);
        assert.equal(K.chordsEdit(base, 1, 'move', 1), null);
    });
});

describe('enregistrement et presse-papiers', () => {
    test('bloc enregistré', () => {
        assert.equal(K.chordsStubHtml(st('b|0~maj7~4'), { x: 10, y: 20 }, false), '<div class="annot-chords" data-chords="b|0~maj7~4" data-at="10,20" data-border="0"></div>');
        assert.equal(K.chordsStubHtml(undefined, null, true), '<div class="annot-chords" data-chords="b|0~majTriad~4"></div>');
    });
    test('copier puis coller : même bloc, place et cadre gardés', () => {
        const s = st('a|1s~7~2|5~m7~4');
        const txt = K.chordsClipText(s, { at: { x: 5, y: 6 }, border: false });
        assert.equal(txt, '[accords@5,6!:a|1s~7~2|5~m7~4]');
        const parts = K.chordsSplitClips(txt);
        assert.deepEqual(parts, [{ chords: 'a|1s~7~2|5~m7~4', at: { x: 5, y: 6 }, noBorder: true }]);
    });
    test('mélangé à du texte et à une portée', () => {
        const parts = K.chordsSplitClips('avant [accords:b|0~maj7~4] milieu [portée:t,4/4,0;q:c4] fin');
        assert.deepEqual(parts.map(p => Object.keys(p)[0]), ['text', 'chords', 'text', 'staff', 'text']);
    });
    test('repère invalide : reste du texte', () => {
        const parts = K.chordsSplitClips('[accords:b|0~zzz~4]');
        assert.deepEqual(parts, [{ text: '[accords:b|0~zzz~4]' }]);
    });
});

describe('sélecteur d\'accord (repris de Chord Scales)', () => {
    const labels = K.chordsLabels(null);
    const v = { rootIndex: 0, chordId: 'maj7', rootLabels: labels, jazz: K.chordsJazz, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0] };
    test('les deux modes se dessinent', () => {
        assert.match(chordPickerHtml({ ...v, mode: 'build' }), /data-act="third"/);
        assert.match(chordPickerHtml({ ...v, mode: 'cat' }), /data-act="chordsel"/);
    });
    test('construire : tension et fondamentale', () => {
        assert.equal(chordPickerBuild('7', 'ext', 'b9'), '7b9');
        assert.deepEqual(chordPickerParseRoot('1f'), { pc: 1, acc: 'f' });
    });
});

describe('fenêtre d\'édition (HTML)', () => {
    const { chordEditorHtml } = require('./chord-block.js');
    const s = K.chordsParse('b|0~maj7~4|7~7~2');
    test('suite, réglages, lecture et sélecteur', () => {
        const h = chordEditorHtml({ st: s, sel: 1, pickerMode: 'build', playing: false });
        assert.equal((h.match(/data-cb="pick"/g) || []).length, 2);
        assert.match(h, /cb-seq-chip is-on" data-cb="pick" data-i="1"/);
        assert.match(h, /data-cb="beats"/);
        assert.match(h, /data-act="third"/);
        assert.match(h, /▶ Écouter/);
        assert.match(chordEditorHtml({ st: s, sel: 0, pickerMode: 'cat', playing: true }), /■ Stop[\s\S]*data-act="chordsel"/);
    });
    test('boutons grisés aux extrémités et avec un seul accord', () => {
        const h0 = chordEditorHtml({ st: s, sel: 0, pickerMode: 'build' });
        assert.match(h0, /data-cb="left"[^>]*disabled/);
        assert.doesNotMatch(h0, /data-cb="right"[^>]*disabled/);
        const one = chordEditorHtml({ st: K.chordsParse('b|0~maj7~4'), sel: 0, pickerMode: 'build' });
        assert.match(one, /data-cb="del"[^>]*disabled/);
    });
    test('réglages du bloc proposés dans la fenêtre (tempo, swing, instrument)', () => {
        const h = chordEditorHtml({ st: K.chordsParse('b,bpm90,sw67,inBb|0~maj7~4'), sel: 0, pickerMode: 'build' });
        assert.match(h, /data-cb="bpm"[^>]*value="90"/);
        assert.match(h, /<option value="67" selected>Triolet · 67 %<\/option>/);
        assert.match(h, /<option value="Bb" selected>En Si♭<\/option>/);
        assert.match(h, /<option value="0">Jam<\/option>/);    // « Jam » reste proposé pour revenir au tempo / swing / instrument de la jam
        assert.match(h, /<option value="">Jam<\/option>/);
        const old = chordEditorHtml({ st: K.chordsParse('b|0~maj7~4'), sel: 0, pickerMode: 'build' });
        assert.match(old, /<option value="0" selected>Jam<\/option>/);
        assert.match(old, /<option value="" selected>Jam<\/option>/);
    });
    test('durée courante toujours proposée', () => {
        assert.match(chordEditorHtml({ st: K.chordsParse('b|0~maj7~5'), sel: 0, pickerMode: 'build' }), /<option value="5" selected>5<\/option>/);
    });
});

describe('réglages de lecture propres au bloc', () => {
    test('lecture et écriture : tempo, swing, instrument', () => {
        const b = st('a,inBb,bpm90,sw67|0~maj7~4');
        assert.equal(b.mode, 'a'); assert.equal(b.bpm, 90); assert.equal(b.swing, 67); assert.equal(b.instr, 'Bb');
        assert.equal(K.chordsFormat(b), 'a,bpm90,sw67,inBb|0~maj7~4');   // forme canonique : tempo, swing, instrument
        assert.equal(K.chordsCanon('b,inC|0~maj7~4'), 'b,inC|0~maj7~4');  // « en Ut » explicite est conservé
    });
    test('un bloc ancien (sans réglage) suit la jam : 0 et instrument vide', () => {
        const b = st('b|0~maj7~4');
        assert.equal(b.bpm, 0); assert.equal(b.swing, 0); assert.equal(b.instr, '');
        assert.equal(K.chordsFormat(b), 'b|0~maj7~4');
    });
    test('un réglage invalide rend le bloc illisible', () => {
        assert.equal(K.chordsCanon('b,bpm9|0~maj7~4'), null);
        assert.equal(K.chordsCanon('b,foo|0~maj7~4'), null);
        assert.equal(K.chordsCanon('b,inXx|0~maj7~4'), null);
    });
    test('un tempo hors limites est ramené dans les limites', () => {
        assert.equal(st('b,bpm999|0~maj7~4').bpm, 300);
        assert.equal(st('b,bpm10|0~maj7~4').bpm, 30);
    });
    test('chordsDefault reprend les réglages donnés', () => {
        const d = K.chordsDefault({ bpm: 80, swing: 67, instr: 'Eb' });
        assert.equal(K.chordsFormat(d), 'b,bpm80,sw67,inEb|0~majTriad~4');
        assert.equal(K.chordsFormat(K.chordsDefault()), 'b|0~majTriad~4');
    });
    test('chordsEdit : setBpm, setSwing, setInstr', () => {
        const b = st('b|0~maj7~4');
        assert.equal(K.chordsEdit(b, 0, 'setBpm', 110).bpm, 110);
        assert.equal(K.chordsEdit(b, 0, 'setBpm', 1000).bpm, 300);
        assert.equal(K.chordsEdit(b, 0, 'setBpm', ''), null);        // déjà 0 : rien ne change
        assert.equal(K.chordsEdit(b, 0, 'setSwing', '67').swing, 67);
        assert.equal(K.chordsEdit(b, 0, 'setInstr', 'Eb').instr, 'Eb');
        assert.equal(K.chordsEdit(b, 0, 'setInstr', 'zz'), null);
        const c = K.chordsEdit(b, 0, 'setBpm', 90);
        assert.equal(K.chordsEdit(c, 0, 'setBeats', 2).bpm, 90);     // les autres modifications gardent les réglages
        assert.equal(b.bpm, 0);                                      // l'original n'est pas touché
    });
    test('tempo et swing effectifs : ceux du bloc, sinon ceux de la jam', () => {
        assert.equal(K.chordsTempo({ bpm: 90 }, 120), 90);
        assert.equal(K.chordsTempo({ bpm: 0 }, 120), 120);
        assert.equal(K.chordsTempo({}, undefined), 100);
        assert.equal(K.chordsSwingRatio({ swing: 67 }, 0.5), 0.67);
        assert.equal(K.chordsSwingRatio({ swing: 0 }, 0.6), 0.6);
        assert.equal(K.chordsSwingRatio({}, undefined), 0.5);
    });
    test('swing : les départs sur un « et » sont retardés, pas ceux sur le temps', () => {
        const b = st('a|0~majTriad~2');                      // arpège de 3 notes sur 2 temps : départs à 0 ; ½ ; 1
        assert.deepEqual(K.chordsPlan(b, 0.5).events.map(e => e.at), [0, 0.5, 1]);
        assert.deepEqual(K.chordsPlan(b, 0.67).events.map(e => e.at), [0, 0.67, 1]);
        assert.deepEqual(K.chordsPlan(b).events.map(e => e.at), [0, 0.5, 1]);   // sans swing : droit
        assert.equal(K.chordsPlan(b, 0.67).total, 2);
        const c = st('b|0~majTriad~0.5|7~majTriad~1');       // un accord qui commence sur un « et » est retardé aussi
        assert.deepEqual(K.chordsPlan(c, 0.67).chords.map(x => x.at), [0, 0.67]);
    });
});
