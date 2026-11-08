// Tests de la barre de mise en forme des annotations (ui/annot-bar.js) : tailles, polices, HTML de la barre et des menus. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./annot-bar.js');
const F = require('../grid/grid-format.js');

describe('tailles', () => {
    test('nextAnnotSize : cran suivant ou précédent, bornes respectées', () => {
        assert.equal(B.nextAnnotSize(15, 1), 16);
        assert.equal(B.nextAnnotSize(15, -1), 14);
        assert.equal(B.nextAnnotSize(12, 1), 14);
        assert.equal(B.nextAnnotSize(8, -1), B.ANNOT_SIZE_MIN);
        assert.equal(B.nextAnnotSize(72, 1), B.ANNOT_SIZE_MAX);
        assert.equal(B.nextAnnotSize(43, 1), 48);
        assert.equal(B.nextAnnotSize(43, -1), 40);
        assert.equal(B.nextAnnotSize('abc', 1), 16, 'valeur illisible : on part de la taille normale');
    });
    test('clampAnnotSize : entier dans les bornes', () => {
        assert.deepEqual([3, 8, 15.4, 15.6, 72, 200].map(B.clampAnnotSize), [8, 8, 15, 16, 72, 72]);
        assert.equal(B.clampAnnotSize('x'), B.ANNOT_SIZE_DEFAULT);
        assert.equal(B.clampAnnotSize(undefined), B.ANNOT_SIZE_DEFAULT);
    });
    test('les crans sont croissants et dans les bornes', () => {
        const s = B.ANNOT_SIZE_STEPS;
        assert.ok(s.every((v, i) => i === 0 || v > s[i - 1]));
        assert.equal(s[0], B.ANNOT_SIZE_MIN);
        assert.equal(s[s.length - 1], B.ANNOT_SIZE_MAX);
    });
    test('toute taille du curseur passe le nettoyage des annotations (8 à 72 px)', () => {
        for (const px of [B.ANNOT_SIZE_MIN, 15, 43, B.ANNOT_SIZE_MAX]) {
            assert.equal(F.sanitizeNoteHtml(`<span style="font-size: ${px}px;">x</span>`), `<span style="font-size:${px}px">x</span>`);
        }
    });
});

describe('polices', () => {
    test('chaque police proposée est acceptée telle quelle par le nettoyage des annotations', () => {
        for (const f of B.ANNOT_FONT_CHOICES) {
            const out = F.sanitizeNoteHtml(`<span style="font-family:${f.css}">x</span>`);
            assert.equal(out, `<span style="font-family:${f.css}">x</span>`, f.label);
        }
    });
    test('les polices proposées sont exactement celles que le nettoyage accepte', () => {
        assert.deepEqual(B.ANNOT_FONT_CHOICES.map(f => f.css).sort(), Object.values(F.NOTE_FONTS).sort());
    });
    test('« Real Book » (Kalam, la police des accords de la grille) est la première police et la police par défaut', () => {
        assert.equal(B.ANNOT_FONT_CHOICES[0].label, 'Real Book');
        assert.equal(B.ANNOT_FONT_CHOICES[0].css, B.ANNOT_FONT_DEFAULT_CSS);
        assert.equal(B.ANNOT_FONT_DEFAULT_CSS, 'Kalam,cursive');
        const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'style.css'), 'utf8');
        assert.match(css, /\.jam-annot-text \{[^}]*font: 400 15px\/1\.45 Kalam, cursive/, 'les zones d\'annotation s\'écrivent par défaut en Real Book');
    });
    test('plus de polices qu\'avant : au moins 15, sans doublon de libellé ni de première famille', () => {
        const list = B.ANNOT_FONT_CHOICES;
        assert.ok(list.length >= 15);
        assert.equal(new Set(list.map(f => f.label)).size, list.length);
        const first = (css) => css.split(',')[0].replace(/^["']|["']$/g, '').toLowerCase();
        assert.equal(new Set(list.map(f => first(f.css))).size, list.length, 'deux polices ne peuvent pas avoir la même première famille (le nettoyage les confondrait)');
    });
    test('chaque police finit par une famille générique (un repli existe toujours)', () => {
        for (const f of B.ANNOT_FONT_CHOICES) assert.match(f.css, /(sans-serif|serif|monospace|cursive)$/, f.label);
    });
    test('annotFontLabel : retrouve le libellé depuis la valeur calculée par le navigateur', () => {
        assert.equal(B.annotFontLabel('Georgia, serif'), 'Georgia');
        assert.equal(B.annotFontLabel('"Times New Roman", Times, serif'), 'Times');
        assert.equal(B.annotFontLabel("system-ui, -apple-system, 'Segoe UI', sans-serif"), 'Système');
        assert.equal(B.annotFontLabel('Kalam, cursive'), 'Real Book');
        assert.equal(B.annotFontLabel('"Palatino Linotype", Palatino, serif'), 'Palatino');
        assert.equal(B.annotFontLabel('Menlo'), 'Code (Menlo)');
        assert.equal(B.annotFontLabel('Comic Sans MS'), null);
        assert.equal(B.annotFontLabel(''), null);
    });
});

describe('HTML de la barre et des menus', () => {
    const bar = B.annotBarHtml();
    test('la barre contient ce qu’index.html utilise', () => {
        for (const needle of ['id="jam-annot-bar"', 'data-font', 'data-size-step="-1"', 'data-size-step="1"', 'data-size-label', 'data-menu="size"', 'data-menu="color"',
            'data-menu="hilite"', 'data-menu="insert"', 'data-cmd="bold"', 'data-cmd="italic"', 'data-cmd="underline"', 'data-cmd="strikeThrough"',
            'data-cmd="justifyLeft"', 'data-cmd="justifyCenter"', 'data-cmd="justifyRight"', 'data-cmd="insertUnorderedList"', 'data-insert-staff', 'data-insert-frame', 'data-clear',
            'id="jam-annot-staff-host"', 'data-color-bar']) {
            assert.ok(bar.includes(needle), needle);
        }
    });
    test('plus de bouton « Coller portée » ; « Cadre » ajouté ; « Effacer la mise en forme » est un bouton à symbole (sans texte)', () => {
        assert.ok(!bar.includes('data-paste-staff'));
        assert.ok(!bar.includes('Coller portée'));
        assert.ok(/data-insert-frame="1"[^>]*>[^<]*<svg[\s\S]*?<\/svg> Cadre<\/button>/.test(bar), 'bouton Cadre : icône puis libellé');
        const clear = /<button[^>]*data-clear="1"[^>]*>([\s\S]*?)<\/button>/.exec(bar);
        assert.ok(clear, 'bouton d\'effacement présent');
        assert.ok(clear[1].startsWith('<svg') && clear[1].endsWith('</svg>'), 'seulement un symbole');
        assert.ok(/data-clear="1"[^>]*title="Effacer la mise en forme/.test(bar) && /data-clear="1"[^>]*aria-label="Effacer la mise en forme/.test(bar), 'nom accessible conservé');
        assert.ok(!bar.includes('>Effacer la mise en forme<'), 'plus de libellé écrit');
    });
    test('toutes les polices sont dans la liste déroulante', () => {
        B.ANNOT_FONT_CHOICES.forEach(f => assert.ok(bar.includes(`>${f.label}</option>`), f.label));
    });
    test('menu de taille : curseur de 8 à 72, valeur bornée, tailles rapides', () => {
        const m = B.annotMenuHtml('size', { size: 43 });
        assert.ok(m.includes('type="range"') && m.includes('min="8"') && m.includes('max="72"') && m.includes('value="43"'));
        assert.ok(m.includes('data-size="12"') && m.includes('data-size="48"'));
        assert.ok(B.annotMenuHtml('size', { size: 500 }).includes('value="72"'));
        assert.ok(B.annotMenuHtml('size', {}).includes(`value="${B.ANNOT_SIZE_DEFAULT}"`));
    });
    test('menus couleur, surlignage, symboles et nuances', () => {
        assert.ok(B.annotMenuHtml('color').includes('data-color="#dc2626"') && B.annotMenuHtml('color').includes('data-color-custom'));
        assert.ok(B.annotMenuHtml('hilite').includes('data-hilite="transparent"'));
        const ins = B.annotMenuHtml('insert');
        assert.ok(ins.includes('data-ins="♯"') && ins.includes('data-ins="cresc."'));
        assert.equal(B.annotMenuHtml('inconnu'), '');
    });
});
