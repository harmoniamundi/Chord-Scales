// Contrôles de cohérence du projet, sans dépendance : les scripts d'index.html existent et sont tous chargés, aucun nom
// global n'est déclaré deux fois (une déclaration const/let/class en double entre deux <script> classiques est une
// SyntaxError qui casse toute la page), chaque module a son fichier de test, et chaque gestionnaire onclick="app.xxx()"
// du HTML désigne une méthode qui existe. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ROOT = dossier qui contient index.html ; les modules sont dans ROOT/app (chemins de <script src> : « app/... »).
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- Scripts de la page, dans l'ordre de chargement ----
function pageScripts() {
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        const src = /\bsrc="([^"]+)"/.exec(m[1]);
        out.push(src ? { src: src[1], external: /^https?:/.test(src[1]) } : { inline: m[2] });
    }
    return out;
}
const scripts = pageScripts();
const localSrc = scripts.filter(s => s.src && !s.external).map(s => s.src);

// Déclarations de plus haut niveau d'un script : { name, kind }.
function topLevelDecls(code) {
    const lines = code.split('\n');
    const first = lines.find(l => l.trim() !== '');
    const indent = first ? first.match(/^ */)[0].length : 0;
    const pad = ' '.repeat(indent);
    const decls = [];
    for (const l of lines) {
        if (!l.startsWith(pad) || l.slice(pad.length).startsWith(' ')) continue;
        const rest = l.slice(pad.length);
        let m = /^(const|let|var)\s*\{([^}]*)\}/.exec(rest);
        if (m) { m[2].split(',').forEach(p => { const n = p.split(':').pop().split('=')[0].trim(); if (n) decls.push({ name: n, kind: m[1] }); }); continue; }
        m = /^(const|let|var)\s+(\w+)/.exec(rest) || /^(class|function)\s+(\w+)/.exec(rest) || /^async\s+(function)\s+(\w+)/.exec(rest);
        if (m) decls.push({ name: m[2], kind: m[1] });
    }
    return decls;
}

describe('index.html : scripts', () => {
    test('chaque <script src> local existe', () => {
        const missing = localSrc.filter(s => !fs.existsSync(path.join(ROOT, s)));
        assert.deepEqual(missing, []);
    });
    test('aucun script local chargé deux fois', () => {
        const dup = localSrc.filter((s, i) => localSrc.indexOf(s) !== i);
        assert.deepEqual(dup, []);
    });
    test('chaque module du projet est chargé par la page', () => {
        const dirs = ['app', 'app/audio', 'app/band', 'app/grid', 'app/styles', 'app/ui'];
        const modules = [];
        for (const d of dirs) {
            for (const f of fs.readdirSync(path.join(ROOT, d))) {
                if (f.endsWith('.js') && !f.endsWith('.test.js') && !f.endsWith('.e2e.js')) modules.push(path.posix.join(d, f));
            }
        }
        const orphans = modules.filter(f => !localSrc.includes(f));
        assert.deepEqual(orphans, [], `modules non chargés par index.html : ${orphans.join(', ')}`);
    });
    test('chaque module a son fichier de test', () => {
        const untested = localSrc.filter(s => !fs.existsSync(path.join(ROOT, s.replace(/\.js$/, '.test.js'))));
        assert.deepEqual(untested, [], `sans test : ${untested.join(', ')}`);
    });
});

describe('noms globaux', () => {
    const all = [];
    for (const s of scripts) {
        if (s.external) continue;
        const code = s.inline !== undefined ? s.inline : fs.readFileSync(path.join(ROOT, s.src), 'utf8');
        const label = s.src || 'index.html (script interne)';
        topLevelDecls(code).forEach(d => all.push({ ...d, file: label }));
    }
    test('on a bien trouvé des déclarations', () => {
        assert.ok(all.length > 300);
    });
    test('aucun const / let / class déclaré deux fois, ni en même temps qu\'une function ou un var', () => {
        const byName = new Map();
        all.forEach(d => { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); });
        const problems = [];
        for (const [name, list] of byName) {
            const lexical = list.filter(d => ['const', 'let', 'class'].includes(d.kind));
            if (lexical.length > 1 || (lexical.length === 1 && list.length > 1)) {
                problems.push(`${name} : ${list.map(d => `${d.kind} (${d.file})`).join(' + ')}`);
            }
        }
        assert.deepEqual(problems, []);
    });
    test('aucune fonction déclarée dans deux fichiers', () => {
        const byName = new Map();
        all.filter(d => d.kind === 'function').forEach(d => { if (!byName.has(d.name)) byName.set(d.name, new Set()); byName.get(d.name).add(d.file); });
        const dup = [...byName].filter(([, files]) => files.size > 1).map(([n, f]) => `${n} : ${[...f].join(' + ')}`);
        assert.deepEqual(dup, []);
    });
});

describe('gestionnaires du HTML', () => {
    // Méthodes de chaque classe d'index.html (indentation des méthodes : 12 espaces)
    function methodsOf(className) {
        const start = html.indexOf(`class ${className}`);
        assert.ok(start >= 0, `classe ${className} introuvable`);
        const next = html.indexOf('\n        class ', start + 1);
        const body = html.slice(start, next < 0 ? html.length : next);
        return new Set([...body.matchAll(/^ {12}(?:async |get |set )?(\w+)\(/gm)].map(m => m[1]));
    }
    const appMethods = methodsOf('ChordScaleApp');
    const jamMethods = methodsOf('JamEngine');
    test('app.xxx(…) existe dans ChordScaleApp', () => {
        const used = new Set([...html.matchAll(/\bapp\.(?!jam\b)(\w+)\(/g)].map(m => m[1]));
        const missing = [...used].filter(n => !appMethods.has(n));
        assert.deepEqual(missing, []);
    });
    test('app.jam.xxx(…) existe dans JamEngine', () => {
        const used = new Set([...html.matchAll(/\bapp\.jam\.(\w+)\(/g)].map(m => m[1]));
        const missing = [...used].filter(n => !jamMethods.has(n));
        assert.deepEqual(missing, []);
    });
});
