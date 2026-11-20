// Tests de grid/saved-library.js : dossiers, recherche, copie de sécurité des sauvegardes. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const SL = require('./saved-library.js');
const GF = require('./grid-format.js');

const step = (rootIndex = 0, chordId = 'maj7') => ({ rootIndex, chordId, measures: 1 });
const entry = (folder, root = 0) => { const e = { grid: [step(root)], settings: { key: 0, bpm: 120 } }; if (folder) e.folder = folder; return e; };

describe('noms et recherche', () => {
    test('nom de dossier au propre', () => {
        assert.equal(SL.slCleanFolderName('  Jazz \n standards  '), 'Jazz standards');
        assert.equal(SL.slCleanFolderName(''), '');
        assert.equal(SL.slCleanFolderName(12), '');
        assert.equal(SL.slCleanFolderName('x'.repeat(80)).length, SL.SL_FOLDER_MAX);
    });
    test('normalisation sans accents ni casse', () => {
        assert.equal(SL.slNormalize('  Été  À  Œuvre '), 'ete a oeuvre');
    });
    test('tous les mots doivent se retrouver, dans le nom ou le dossier', () => {
        const t = SL.slTerms('estate bossa');
        assert.equal(SL.slMatches(t, 'Estate', 'Bossa'), true);
        assert.equal(SL.slMatches(t, 'Estate', 'Jazz'), false);
        assert.equal(SL.slMatches(SL.slTerms('ete'), 'Été indien', ''), true);
        assert.equal(SL.slMatches([], 'x', ''), true);
    });
    test('surlignage échappé, insensible aux accents', () => {
        assert.equal(SL.slHighlight('Été <b>', 'ete'), '<mark>Été</mark> &lt;b&gt;');
        assert.equal(SL.slHighlight('Blue Bossa', 'bo blue'), '<mark>Blue</mark> <mark>Bo</mark>ssa');
        assert.equal(SL.slHighlight('a&b', ''), 'a&amp;b');
    });
    test('tri naturel', () => {
        assert.deepEqual(['Grille 10', 'grille 2', 'Ébène'].sort(SL.slCompare), ['Ébène', 'grille 2', 'Grille 10']);
    });
});

describe('dossiers', () => {
    const saved = { 'Estate': entry('Bossa'), 'Blue Bossa': entry('bossa'), 'Autumn': entry(''), 'Solar': entry('Jazz') };
    test('liste des dossiers : enregistrés + cités, sans doublon de casse', () => {
        assert.deepEqual(SL.slFolderList(saved, ['Vide', 'jazz']), ['Bossa', 'jazz', 'Vide']);
    });
    test('vue : sans dossier puis dossiers, repli et nombres', () => {
        const v = SL.slBuildView(saved, ['Vide'], '', ['vide']);
        assert.deepEqual(v.loose, ['Autumn']);
        assert.deepEqual(v.folders.map(f => [f.name, f.grids, f.count, f.open]), [
            ['Bossa', ['Blue Bossa', 'Estate'], 2, true], ['Jazz', ['Solar'], 1, true], ['Vide', [], 0, false]]);
        assert.equal(v.total, 4);
        assert.equal(v.shown, 4);
    });
    test('vue en recherche : dossiers sans résultat masqués, les autres ouverts', () => {
        const v = SL.slBuildView(saved, ['Vide'], 'sol', ['jazz']);
        assert.deepEqual(v.loose, []);
        assert.deepEqual(v.folders.map(f => [f.name, f.grids, f.open]), [['Jazz', ['Solar'], true]]);
        assert.equal(v.shown, 1);
        // le nom du dossier suffit à faire apparaître ses grilles
        const w = SL.slBuildView(saved, [], 'bossa');
        assert.deepEqual(w.folders.map(f => f.grids), [['Blue Bossa', 'Estate']]);
    });
    test('ranger / sortir une grille, garder le dossier en réenregistrant', () => {
        const e = SL.slWithFolder(entry(''), ' Jazz ');
        assert.equal(e.folder, 'Jazz');
        assert.equal('folder' in SL.slWithFolder(e, ''), false);
        const again = SL.slMakeEntry(e, [step(2)], { key: 2 }, 5);
        assert.deepEqual(again, { grid: [step(2)], settings: { key: 2 }, folder: 'Jazz', savedAt: 5 });
        assert.equal('folder' in SL.slMakeEntry(undefined, [], null), false);
        // anciennes sauvegardes (tableau seul)
        assert.deepEqual(SL.slWithFolder([step()], 'A'), { grid: [step()], settings: null, folder: 'A' });
    });
    test('renommer un dossier, éventuellement en le fusionnant', () => {
        const r = SL.slRenameFolder(saved, ['Vide'], 'bossa', 'Brésil');
        assert.equal(r.saved['Estate'].folder, 'Brésil');
        assert.equal(r.saved['Blue Bossa'].folder, 'Brésil');
        assert.deepEqual(r.folders, ['Brésil', 'Jazz', 'Vide']);
        const m = SL.slRenameFolder(saved, [], 'Bossa', 'JAZZ');
        assert.equal(m.saved['Estate'].folder, 'Jazz');
        assert.deepEqual(m.folders, ['Jazz']);
        assert.equal(saved['Estate'].folder, 'Bossa', 'original intact');
    });
    test('supprimer un dossier garde ses grilles (sans dossier)', () => {
        const r = SL.slDeleteFolder(saved, ['Vide'], 'Bossa');
        assert.equal('folder' in r.saved['Estate'], false);
        assert.equal(Object.keys(r.saved).length, 4);
        assert.deepEqual(r.folders, ['Jazz', 'Vide']);
    });
    test('nom libre', () => {
        assert.equal(SL.slUniqueName('A', { A: 1, 'A (2)': 1 }), 'A (3)');
        assert.equal(SL.slUniqueName('B', { A: 1 }), 'B');
    });
});

describe('copie de sécurité', () => {
    const saved = { 'Estate': { ...entry('Bossa'), savedAt: 10 }, 'Old': [step(3)] };
    test('fichier complet, relu comme copie de sécurité', () => {
        const b = SL.slBuildBackup(saved, ['Vide'], '2026-11-20T12:00:00.000Z');
        assert.equal(SL.slIsBackup(b), true);
        assert.equal(SL.slIsBackup({ grid: [] }), false);
        assert.deepEqual(b.folders, ['Bossa', 'Vide']);
        assert.deepEqual(b.grids.map(g => [g.name, g.folder, g.savedAt]), [['Estate', 'Bossa', 10], ['Old', undefined, undefined]]);
        assert.deepEqual(b.grids[1].grid, [step(3)]);
        // passe par JSON sans perte
        assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
    });
    test('nom de fichier daté', () => {
        assert.equal(SL.slBackupFileName(new Date(2026, 0, 5)), 'chord-scales-sauvegardes-2026-01-05.json');
    });
    test('fusion : ajout, doublon ignoré, conflit renommé, illisible écarté, dossiers recréés', () => {
        const backup = SL.slBuildBackup({
            'Estate': entry('Bossa'),           // même contenu que l'existante → ignorée
            'Solar': entry('Jazz', 5),          // nouvelle
            'Autumn': entry('', 7),             // conflit (contenu différent)
        }, ['Vide'], null);
        backup.grids.push({ name: 'Cassée', grid: [{ rootIndex: 99 }] });
        const existing = { 'Estate': entry(''), 'Autumn': entry('', 1) };
        const r = SL.slMergeBackup(existing, [], backup, GF.sanitizeImportedGrid, GF.sanitizeImportedSettings);
        assert.equal(r.added, 1);
        assert.equal(r.renamed, 1);
        assert.equal(r.skipped, 1);
        assert.equal(r.invalid, 1);
        assert.deepEqual(Object.keys(r.saved).sort(), ['Autumn', 'Autumn (2)', 'Estate', 'Solar']);
        assert.equal(r.saved['Estate'].folder, 'Bossa', 'doublon sans dossier : reprend celui de la copie');
        assert.equal(r.saved['Solar'].folder, 'Jazz');
        assert.equal(r.saved['Autumn (2)'].grid[0].rootIndex, 7);
        assert.equal(r.saved['Autumn'].grid[0].rootIndex, 1, 'rien n\'est écrasé');
        assert.deepEqual(r.folders, ['Bossa', 'Jazz', 'Vide']);
        assert.equal('Autumn (2)' in existing, false, 'original intact');
        assert.match(SL.slMergeSummary(r), /^2 grilles ajoutées, dont 1 renommée .*, 1 déjà présente, 1 illisible écartée\.$/);
    });
    test('réimporter la même copie ne crée aucun doublon', () => {
        const base = { 'A': entry('X'), 'B': entry('', 4) };
        const b = JSON.parse(JSON.stringify(SL.slBuildBackup(base, [], null)));
        const clean = SL.slMergeBackup({}, [], b, GF.sanitizeImportedGrid, GF.sanitizeImportedSettings);
        const again = SL.slMergeBackup(clean.saved, clean.folders, b, GF.sanitizeImportedGrid, GF.sanitizeImportedSettings);
        assert.equal(again.added, 0);
        assert.equal(again.skipped, 2);
        assert.deepEqual(Object.keys(again.saved).sort(), ['A', 'B']);
    });
    test('fichier qui n\'est pas une copie de sécurité', () => {
        const r = SL.slMergeBackup({ A: entry('') }, [], { grid: [] }, GF.sanitizeImportedGrid, GF.sanitizeImportedSettings);
        assert.equal(r.invalid, 1);
        assert.deepEqual(Object.keys(r.saved), ['A']);
    });
});
