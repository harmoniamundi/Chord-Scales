// Tests de ui/chord-block.js : la fenêtre d'édition (HTML pur, sans navigateur) et ses choix de lecture.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const K = require('./chord-notes.js');
const { chordEditorHtml } = require('./chord-block.js');

const html = (text, extra) => chordEditorHtml(Object.assign({ st: K.chordsParse(text), sel: 0, pickerMode: 'build', playing: false }, extra));

describe('fenêtre d\'édition des accords', () => {
    test('un bloc qui suit la jam : tempo vide, « Jam » sélectionné pour le swing et l\'instrument', () => {
        const h = html('b|0~maj7~4');
        assert.match(h, /data-cb="bpm"[^>]*placeholder="jam" value=""/);
        assert.match(h, /<option value="0" selected>Jam<\/option>/);
        assert.match(h, /<option value="" selected>Jam<\/option>/);
    });
    test('un bloc aux réglages propres : valeurs affichées, « Jam » proposé pour y revenir', () => {
        const h = html('a,bpm80,sw60,inEb|0~maj7~4');
        assert.match(h, /data-cb="bpm"[^>]*value="80"/);
        assert.match(h, /<option value="60" selected>60 %<\/option>/);
        assert.match(h, /<option value="Eb" selected>En Mi♭<\/option>/);
        assert.match(h, /<option value="0">Jam<\/option>/);
        assert.match(h, /<option value="">Jam<\/option>/);
    });
    test('mode de lecture et bouton d\'écoute', () => {
        assert.match(html('b|0~maj7~4'), /data-cb="mode" data-v="b"/);
        assert.match(html('a|0~maj7~4'), /class="jm-chip is-on" data-cb="mode" data-v="a"/);
        assert.match(html('b|0~maj7~4'), /▶ Écouter/);
        assert.match(html('b|0~maj7~4', { playing: true }), /■ Stop/);
    });
});
