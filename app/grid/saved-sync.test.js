// Tests de grid/saved-sync.js : suivi des changements, fusion dans les deux sens, GitHub simulé. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const SY = require('./saved-sync.js');
const SL = require('./saved-library.js');
const GF = require('./grid-format.js');

const G = GF.sanitizeImportedGrid, S = GF.sanitizeImportedSettings;
const grid = (root) => GF.sanitizeImportedGrid([{ rootIndex: root, chordId: 'maj7', measures: 1 }]);
const entry = (root, at, folder) => { const e = { grid: grid(root), settings: { key: root, bpm: 120 } }; if (at) e.savedAt = at; if (folder) e.folder = folder; return e; };
const merge = (local, doc, now = 1000) => SY.svsMerge(local, doc, G, S, now);
const docOf = (saved, folders, meta) => JSON.parse(JSON.stringify(SY.svsSnapshot(saved, folders || [], meta || {}, '2026-11-20T00:00:00.000Z')));

describe('suivi des changements sur cet appareil', () => {
    test('grille nouvelle, modifiée, déplacée : datée ; supprimée : retenue', () => {
        const prev = { A: entry(1, 10), B: entry(2, 10), C: entry(3, 10) };
        const next = { A: entry(1, 10), B: entry(5, 10), C: entry(3, 10, 'Jazz'), D: entry(4) };
        delete next.A; next.A2 = prev.A;
        const r = SY.svsTrack(prev, [], next, [], {}, 500);
        assert.equal(r.saved.B.savedAt, 500, 'contenu modifié sans nouvelle date');
        assert.equal(r.saved.C.savedAt, 500, 'changement de dossier');
        assert.equal(r.saved.D.savedAt, 500, 'nouvelle grille');
        assert.equal(r.saved.A2.savedAt, 500, 'renommée = nouvelle');
        assert.deepEqual(r.meta.deleted, { A: 500 });
        assert.equal(r.meta.folders.jazz.deleted, false);
    });
    test('une date déjà posée (sauvegarde) est gardée ; recréer une grille efface sa suppression', () => {
        const r = SY.svsTrack({ A: entry(1, 10) }, [], { A: entry(2, 77) }, [], { deleted: { B: 5 } }, 500);
        assert.equal(r.saved.A.savedAt, 77);
        const r2 = SY.svsTrack({}, [], { B: entry(1) }, [], { deleted: { B: 5 } }, 600);
        assert.deepEqual(r2.meta.deleted, {});
    });
    test('horloge en retard : une modification reste postérieure à ce qu\'elle remplace', () => {
        const r = SY.svsTrack({ A: entry(1, 9000) }, [], { A: entry(1, 9000, 'Jazz'), B: entry(2) }, [], { deleted: { B: 8000 } }, 500);
        assert.equal(r.saved.A.savedAt, 9001);
        assert.equal(r.saved.B.savedAt, 8001);
    });
    test('dossier supprimé retenu ; vieilles suppressions oubliées', () => {
        const r = SY.svsTrack({}, ['Vide'], {}, [], { deleted: { Old: 1 } }, 500 * 24 * 3600 * 1000);
        assert.equal(r.meta.folders.vide.deleted, true);
        assert.equal('Old' in r.meta.deleted, false);
    });
});

describe('fusion', () => {
    test('la version la plus récente l\'emporte, dans les deux sens', () => {
        const local = { saved: { A: entry(1, 100), B: entry(2, 300) }, folders: [], meta: {} };
        const doc = docOf({ A: entry(7, 200), B: entry(8, 200), C: entry(9, 50) });
        const m = merge(local, doc);
        assert.equal(m.saved.A.grid[0].rootIndex, 7);
        assert.equal(m.saved.B.grid[0].rootIndex, 2);
        assert.equal(m.saved.C.grid[0].rootIndex, 9);
        assert.deepEqual(m.received.sort(), ['A', 'C']);
        assert.equal(m.localChanged, true);
        assert.equal(m.remoteChanged, true, 'B est plus récent ici');
    });
    test('suppressions : plus récente que la grille = supprimée ; grille modifiée après = gardée', () => {
        const local = { saved: { A: entry(1, 100), B: entry(2, 400) }, folders: [], meta: { deleted: { C: 300 } } };
        const doc = docOf({ C: entry(3, 200) }, [], { deleted: { A: 150, B: 350 } });
        const m = merge(local, doc);
        assert.deepEqual(Object.keys(m.saved), ['B']);
        assert.deepEqual(m.removed, ['A']);
        assert.deepEqual(m.meta.deleted, { A: 150, C: 300 });
    });
    test('déjà à jour : rien à écrire nulle part', () => {
        const saved = { A: entry(1, 100, 'Jazz') };
        const m = merge({ saved, folders: ['Vide'], meta: {} }, docOf(saved, ['Vide']));
        assert.equal(m.localChanged, false);
        assert.equal(m.remoteChanged, false);
        assert.deepEqual(m.received, []);
    });
    test('anciennes sauvegardes sans date : identiques = rien, différentes = les deux gardées, même résultat partout', () => {
        const a = { X: entry(1), Y: entry(5) }, b = { X: entry(2), Y: entry(5) };
        const m1 = merge({ saved: a, folders: [], meta: {} }, docOf(b));
        const m2 = merge({ saved: b, folders: [], meta: {} }, docOf(a));
        assert.deepEqual(Object.keys(m1.saved).sort(), ['X', 'X (conflit)', 'Y']);
        assert.deepEqual(m1.saved, m2.saved, 'les deux appareils convergent');
        assert.deepEqual(m1.conflicts, ['X']);
        // une deuxième synchro ne recrée pas de copie
        const m3 = merge({ saved: m1.saved, folders: [], meta: m1.meta }, docOf(m2.saved, [], m2.meta));
        assert.equal(Object.keys(m3.saved).length, 3);
        assert.equal(m3.remoteChanged, false);
    });
    test('dossiers : création et suppression propagées, un dossier qui contient une grille reste', () => {
        const local = { saved: { A: entry(1, 10, 'Gardé') }, folders: ['Vide', 'Gardé', 'Nouveau'], meta: { folders: { nouveau: { name: 'Nouveau', at: 50 } } } };
        const doc = docOf({}, ['Vide', 'Gardé', 'Autre'], { folders: { vide: { name: 'Vide', at: 40, deleted: true }, 'garde': { name: 'Gardé', at: 40, deleted: true } } });
        const m = merge(local, doc);
        assert.deepEqual(m.folders, ['Autre', 'Gardé', 'Nouveau']);
    });
    test('grille illisible dans le fichier : ignorée', () => {
        const doc = docOf({ A: entry(1, 10) });
        doc.grids.push({ name: 'Cassée', grid: [{ rootIndex: 99 }] });
        const m = merge({ saved: {}, folders: [], meta: {} }, doc);
        assert.deepEqual(Object.keys(m.saved), ['A']);
        assert.equal(m.invalid, 1);
    });
    test('le fichier reste une copie de sécurité restaurable', () => {
        const doc = docOf({ A: entry(1, 10) });
        assert.equal(SL.slIsBackup(doc), true);
        assert.equal(doc.version, 2);
    });
    test('compte rendu', () => {
        assert.equal(SY.svsSummary({ received: ['a', 'b'], removed: ['c'], conflicts: [] }), '2 grilles reçues, 1 grille supprimée (supprimées ailleurs)');
        assert.equal(SY.svsSummary({ received: [], removed: [], conflicts: [] }), 'rien de nouveau');
    });
});

describe('réglages GitHub', () => {
    test('dépôt, chemin, jeton', () => {
        assert.deepEqual(SY.ghsParseRepo('https://github.com/harmoniamundi/chord-data.git'), { owner: 'harmoniamundi', repo: 'chord-data' });
        assert.equal(SY.ghsParseRepo('pas un dépôt'), null);
        assert.equal(SY.ghsCleanPath(''), SY.GHS_DEFAULT_PATH);
        assert.equal(SY.ghsCleanPath('dossier/grilles'), 'dossier/grilles.json');
        assert.equal(SY.ghsCleanPath('../x.json'), null);
        const tok = 'github_pat_' + 'a'.repeat(40);
        assert.deepEqual(SY.ghsCleanConfig({ repo: 'a/b', path: '', token: ' ' + tok + ' ' }), { repo: 'a/b', path: SY.GHS_DEFAULT_PATH, token: tok });
        assert.equal(SY.ghsCleanConfig({ repo: 'a/b', token: 'court' }), null);
    });
    test('code de configuration aller-retour', () => {
        const cfg = { repo: 'moi/donnees', path: 'cs.json', token: 'ghp_' + 'Z'.repeat(36) };
        const code = SY.svsConfigCode(cfg);
        assert.match(code, /^chordscales-sync:/);
        assert.deepEqual(SY.svsParseConfigCode(code), cfg);
        assert.equal(SY.svsParseConfigCode('n\'importe quoi'), null);
    });
    test('base64 UTF-8', () => {
        const s = 'Été — ♭♯ ' + 'x'.repeat(70000);
        assert.equal(SY.svsB64Decode(SY.svsB64Encode(s)), s);
    });
});

// Faux GitHub en mémoire : un dépôt, un fichier, le contrôle de version (sha) comme le vrai.
function fakeGithub(opts = {}) {
    const st = { file: null, sha: null, n: 0, writes: 0, token: opts.token || 'ghp_' + 'T'.repeat(36), raceOnce: opts.raceOnce || null };
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
    st.fetch = async (url, o = {}) => {
        if (opts.offline) throw new TypeError('Failed to fetch');
        if ((o.headers || {}).Authorization !== `Bearer ${st.token}`) return reply(401, {});
        if (url === 'https://api.github.com/repos/moi/donnees') return reply(200, { name: 'donnees' });
        if (!url.startsWith('https://api.github.com/repos/moi/donnees/contents/')) return reply(404, {});
        if (!o.method || o.method === 'GET') {
            if (!st.file) return reply(404, {});
            if (o.headers.Accept === 'application/vnd.github.raw+json') return reply(200, st.file);
            return reply(200, { type: 'file', sha: st.sha, encoding: 'base64', content: SY.svsB64Encode(st.file) });
        }
        const body = JSON.parse(o.body);
        if (st.raceOnce) { const r = st.raceOnce; st.raceOnce = null; st.file = r; st.sha = 'race'; }
        if ((body.sha || null) !== st.sha) return reply(409, {});
        st.file = SY.svsB64Decode(body.content);
        st.sha = 'sha' + (++st.n);
        st.writes++;
        return reply(200, { content: { sha: st.sha } });
    };
    return st;
}

describe('synchronisation GitHub (simulée)', () => {
    const cfg = { repo: 'moi/donnees', path: 'cs.json', token: 'ghp_' + 'T'.repeat(36) };
    const deps = (now) => ({ sanitizeGrid: G, sanitizeSettings: S, now });
    test('premier appareil : crée le fichier ; deuxième : reçoit ; changements croisés ; suppression propagée', async () => {
        const gh = fakeGithub();
        let mac = { saved: { Estate: entry(1, 100, 'Bossa') }, folders: [], meta: {} };
        let ipad = { saved: { Solar: entry(2, 120) }, folders: [], meta: {} };
        let r = await SY.ghsSyncCycle(cfg, mac, gh.fetch, deps(200));
        assert.equal(r.created, true);
        mac = r;
        r = await SY.ghsSyncCycle(cfg, ipad, gh.fetch, deps(300));
        assert.deepEqual(r.received, ['Estate']);
        assert.deepEqual(Object.keys(r.saved).sort(), ['Estate', 'Solar']);
        assert.equal(r.wrote, true);
        ipad = r;
        // l'iPad modifie Estate et supprime Solar
        const t = SY.svsTrack(ipad.saved, ipad.folders, { Estate: entry(9, 400, 'Bossa') }, ipad.folders, ipad.meta, 400);
        ipad = { saved: t.saved, folders: ipad.folders, meta: t.meta };
        await SY.ghsSyncCycle(cfg, ipad, gh.fetch, deps(410));
        r = await SY.ghsSyncCycle(cfg, mac, gh.fetch, deps(500));
        assert.equal(r.saved.Estate.grid[0].rootIndex, 9);
        assert.equal('Solar' in r.saved, false);
        assert.equal(r.saved.Estate.folder, 'Bossa');
        // à jour : aucune écriture
        const w = gh.writes;
        r = await SY.ghsSyncCycle(cfg, r, gh.fetch, deps(600));
        assert.equal(r.wrote, false);
        assert.equal(gh.writes, w);
    });
    test('fichier modifié entre lecture et écriture : on refusionne et on recommence', async () => {
        const other = JSON.stringify(docOf({ Autre: entry(3, 50) }));
        const gh = fakeGithub({ raceOnce: other });
        const r = await SY.ghsSyncCycle(cfg, { saved: { Moi: entry(1, 60) }, folders: [], meta: {} }, gh.fetch, deps(70));
        assert.deepEqual(Object.keys(r.saved).sort(), ['Autre', 'Moi']);
        const stored = JSON.parse(gh.file);
        assert.deepEqual(stored.grids.map(g => g.name).sort(), ['Autre', 'Moi']);
    });
    test('erreurs : jeton refusé, pas de réseau, fichier étranger jamais écrasé', async () => {
        const gh = fakeGithub();
        await assert.rejects(SY.ghsSyncCycle({ ...cfg, token: 'ghp_' + 'X'.repeat(36) }, { saved: {} }, gh.fetch, deps(1)), e => e.kind === 'auth');
        await assert.rejects(SY.ghsSyncCycle(cfg, { saved: {} }, fakeGithub({ offline: true }).fetch, deps(1)), e => e.kind === 'network');
        gh.file = '{"hello":1}'; gh.sha = 'x';
        await assert.rejects(SY.ghsSyncCycle(cfg, { saved: { A: entry(1, 1) } }, gh.fetch, deps(1)), e => e.kind === 'format');
        assert.equal(gh.file, '{"hello":1}');
        assert.match(SY.ghsErrorText({ kind: 'auth' }), /jeton/);
    });
});
