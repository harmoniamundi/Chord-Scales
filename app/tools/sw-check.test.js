// Cohérence du mode hors ligne : la liste de fichiers de sw.js couvre tout ce que charge index.html, rien ne vient
// d'Internet, le manifeste est valide et les icônes existent. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const sw = read('sw.js');

// SHELL_FILES = [ … ] de sw.js
const shellBlock = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(sw);
const SHELL = shellBlock ? [...shellBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];

describe('sw.js', () => {
    test('la liste SHELL_FILES est lisible', () => assert.ok(SHELL.length > 40));
    test('chaque fichier de la liste existe (sauf « ./ » = la page elle-même)', () => {
        const missing = SHELL.filter(f => f !== './' && !fs.existsSync(path.join(ROOT, f)));
        assert.deepEqual(missing, []);
    });
    test('aucun doublon', () => assert.equal(new Set(SHELL).size, SHELL.length));
    test('chaque <script src> et feuille de style locale d\'index.html est dans la liste', () => {
        const used = [
            ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]),
            ...[...html.matchAll(/<link\b[^>]*\brel="(?:stylesheet|manifest|icon|apple-touch-icon)"[^>]*\bhref="([^"]+)"/g)].map(m => m[1])
        ];
        assert.ok(used.length > 40);
        const missing = used.filter(f => !SHELL.includes(f));
        assert.deepEqual(missing, [], `à ajouter à SHELL_FILES dans sw.js : ${missing.join(', ')}`);
    });
    test('les polices référencées par style.css sont dans la liste', () => {
        const css = read('app/style.css');
        const fonts = [...css.matchAll(/url\("(fonts\/[^"]+)"\)/g)].map(m => 'app/' + m[1]);
        assert.ok(fonts.length >= 2);
        assert.deepEqual(fonts.filter(f => !SHELL.includes(f)), []);
    });
    test('importe la liste des sons depuis local-soundfonts.js', () => {
        assert.match(sw, /importScripts\('app\/audio\/local-soundfonts\.js'\)/);
        assert.match(sw, /LOCAL_SOUNDFONT_FILES/);
    });
    test('tous les chemins de sw.js sont relatifs (l\'appli est publiée dans un sous-dossier)', () => {
        SHELL.forEach(f => assert.ok(!f.startsWith('/') && !/^[a-z]+:/.test(f), f));
    });
});

describe('index.html : plus rien ne vient d\'Internet', () => {
    test('aucune ressource externe chargée (script, feuille de style, police, image)', () => {
        const external = [
            ...html.matchAll(/<(?:script|img|source)\b[^>]*\bsrc="(https?:[^"]+)"/g),
            ...html.matchAll(/<link\b[^>]*\bhref="(https?:[^"]+)"/g)
        ].map(m => m[1]);
        assert.deepEqual(external, []);
    });
    test('style.css ne charge rien d\'externe', () => {
        const css = read('app/style.css');
        assert.deepEqual([...css.matchAll(/url\(\s*["']?(https?:[^)"']+)/g)].map(m => m[1]), []);
        assert.ok(!/@import\s+url\(\s*["']?https?:/.test(css));
    });
    test('aucun appel direct à un serveur de sons externe', () => {
        assert.ok(!/gleitz\.github\.io|midi-js-soundfonts\//.test(html));
    });
});

describe('manifest.webmanifest', () => {
    const manifest = JSON.parse(read('manifest.webmanifest'));
    test('champs indispensables à l\'installation', () => {
        assert.ok(manifest.name && manifest.short_name);
        assert.equal(manifest.display, 'standalone');
        assert.equal(manifest.start_url, './');
        assert.equal(manifest.scope, './');
    });
    test('icônes : existent, tailles annoncées exactes, une « maskable »', () => {
        assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
        manifest.icons.forEach(i => {
            const p = path.join(ROOT, i.src);
            assert.ok(fs.existsSync(p), i.src);
            const buf = fs.readFileSync(p);
            assert.equal(buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20), i.sizes, `taille réelle de ${i.src}`);
            assert.ok(SHELL.includes(i.src), `${i.src} absent de SHELL_FILES`);
        });
    });
});
