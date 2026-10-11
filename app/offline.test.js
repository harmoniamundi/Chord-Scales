// Tests du mode hors ligne (offline.js) : texte de la pastille d'état. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { offlineChipText, setupOffline } = require('./offline.js');

describe('offlineChipText', () => {
    test('téléchargement en cours : progression x/y', () => {
        assert.equal(offlineChipText({ type: 'sounds-progress', done: 4, total: 13 }), 'Sons hors ligne : 4/13');
        assert.equal(offlineChipText({ type: 'sounds-progress', done: 0, total: 13 }), 'Sons hors ligne : 0/13');
    });
    test('terminé après un vrai téléchargement : confirmation', () => {
        assert.match(offlineChipText({ type: 'sounds-done', done: 13, total: 13, failed: 0, downloaded: 13 }), /Prêt hors ligne/);
    });
    test('terminé sans rien télécharger (déjà en mémoire) : pastille muette', () => {
        assert.equal(offlineChipText({ type: 'sounds-done', done: 13, total: 13, failed: 0, downloaded: 0 }), '');
    });
    test('échec partiel : on dit combien manquent et quoi faire', () => {
        const t = offlineChipText({ type: 'sounds-done', done: 10, total: 13, failed: 3, downloaded: 4 });
        assert.match(t, /incomplets \(10\/13\)/);
        assert.match(t, /réseau/);
    });
    test('message inconnu ou invalide : rien', () => {
        assert.equal(offlineChipText(null), '');
        assert.equal(offlineChipText('x'), '');
        assert.equal(offlineChipText({ type: 'autre' }), '');
    });
});

describe('setupOffline', () => {
    test('sans navigateur (Node) : ne fait rien et ne plante pas', () => {
        assert.doesNotThrow(() => setupOffline());
    });
});
