// Tests des portées éditables (ui/staff-notes.js) : format texte, mesures, hauteurs, plan de lecture, modifications. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./staff-notes.js');

const P = (t) => S.parseStaff(t);
const pieces = (st) => S.layoutStaff(st).measures.map(m => m.pieces.map(x => `${x.d}${x.dot ? '.' : ''}${x.tri ? 't' : ''}${x.p ? '' : 'r'}${x.tieNext ? '~' : ''}`).join(' '));

describe('parseStaff / formatStaff : format texte', () => {
    test('portée vide et exemple complet : aller-retour identique', () => {
        for (const t of ['t,4/4,0;', 't,4/4,0;q:c4 8:e4 8:g4 qr h.:a4 w:c5', 'b,6/8,-2;8t:bb3 8t:b3 8t:bbb3 16.:f##5', 't,3/4,7;q.:c#5 8:cb4']) {
            assert.equal(S.formatStaff(P(t)), t, t);
        }
    });
    test('l’en-tête seul (sans point-virgule) est accepté et devient canonique', () => {
        assert.equal(S.formatStaff(P('t,4/4,0')), 't,4/4,0;');
    });
    test('valeurs lues : durée, point, triolet, hauteur, silence', () => {
        const st = P('b,2/4,-3;8.t:eb3 qr');
        assert.deepEqual(st.ev[0], { d: '8', dot: true, tri: true, p: { l: 'e', o: 3, a: -1 } });
        assert.deepEqual(st.ev[1], { d: 'q', dot: false, tri: false, p: null });
        assert.equal(st.clef, 'b'); assert.equal(st.meter, '2/4'); assert.equal(st.ks, -3);
    });
    test('textes invalides refusés', () => {
        for (const bad of [null, undefined, 5, '', 'x', 't,4/4', 'x,4/4,0;', 't,4/5,0;', 't,4/4,8;', 't,4/4,-8;', 't,4/4,0;q', 't,4/4,0;q:h4', 't,4/4,0;q:c0', 't,4/4,0;q:c8',
            't,4/4,0;x:c4', 't,4/4,0;q:c4,d4', 't,4/4,0;q:c###4', 't,4/4,0;q:cn4', 't,4/4,0;32:c4', 't,4/4,0;<script>']) {
            assert.equal(S.parseStaff(bad), null, String(bad));
        }
    });
    test('64 événements acceptés, 65 refusés ; longueur maximale', () => {
        assert.equal(P(`t,4/4,0;${Array(64).fill('16:c4').join(' ')}`).ev.length, 64);
        assert.equal(P(`t,4/4,0;${Array(65).fill('16:c4').join(' ')}`), null);
        assert.equal(S.parseStaff('t,4/4,0;' + 'q:c4 '.repeat(200)), null);
    });
    test('canonicalStaff : forme canonique ou null', () => {
        assert.equal(S.canonicalStaff('t,4/4,0;  q:c4   8:d4 '), 't,4/4,0;q:c4 8:d4');
        assert.equal(S.canonicalStaff('nope'), null);
    });
});

describe('durées et mesures', () => {
    test('durées en 96es de ronde', () => {
        const u = (t) => S.eventUnits(P(`t,4/4,0;${t}`).ev[0]);
        assert.deepEqual(['w:c4', 'h:c4', 'q:c4', '8:c4', '16:c4'].map(u), [96, 48, 24, 12, 6]);
        assert.deepEqual(['h.:c4', 'q.:c4', '8.:c4', '16.:c4'].map(u), [72, 36, 18, 9]);
        assert.deepEqual(['qt:c4', '8t:c4', '16t:c4', 'ht:c4'].map(u), [16, 8, 4, 32]);
    });
    test('durée d’une mesure selon la signature', () => {
        assert.deepEqual(['4/4', '3/4', '2/4', '6/8', '12/8', '2/2', '5/4', '7/8'].map(S.meterUnits), [96, 72, 48, 72, 144, 96, 120, 84]);
    });
    test('groupement des croches : temps en simple, temps pointé en composé', () => {
        assert.deepEqual(['4/4', '3/4', '6/8', '9/8', '12/8', '2/2', '7/8'].map(S.meterBeamUnits), [24, 24, 36, 36, 36, 48, 24]);
    });
    test('decomposeUnits : plus grandes valeurs d’abord, reste inférieur à une double-croche ignoré', () => {
        assert.deepEqual(S.decomposeUnits(96).map(x => x.d + (x.dot ? '.' : '')), ['w']);
        assert.deepEqual(S.decomposeUnits(84).map(x => x.d + (x.dot ? '.' : '')), ['h.', '8']);
        assert.deepEqual(S.decomposeUnits(30).map(x => x.d + (x.dot ? '.' : '')), ['q', '16']);
        assert.deepEqual(S.decomposeUnits(3), []);
    });
    test('une mesure pleine : la mesure suivante est vide (il reste une place pour écrire)', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4 q:d4 q:e4 q:f4'));
        assert.equal(L.measures.length, 2);
        assert.equal(L.measures[0].pieces.length, 4);
        assert.equal(L.measures[1].pieces.length, 0);
    });
    test('portée vide : une mesure vide', () => {
        const L = S.layoutStaff(P('t,4/4,0;'));
        assert.deepEqual(L.measures.map(m => m.pieces.length), [0]);
    });
    test('une note qui dépasse la barre est coupée en morceaux liés', () => {
        assert.deepEqual(pieces(P('t,4/4,0;q:c4 q:d4 q:e4 h:f4')), ['q q q q~', 'q']);
        const L = S.layoutStaff(P('t,4/4,0;h:c4 w:d4'));
        assert.deepEqual(L.measures.map(m => m.used), [96, 48]);
        assert.equal(L.measures[0].pieces[1].tieNext, true);
        assert.equal(L.measures[1].pieces[0].tieFromPrev, true);
        assert.equal(L.measures[0].pieces[0].tieNext, false);
    });
    test('un silence coupé n’est pas lié', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4 q:d4 q:e4 hr'));
        assert.ok(L.measures.flatMap(m => m.pieces).every(pc => !pc.tieNext && !pc.tieFromPrev));
    });
    test('chaque pièce garde l’indice de son événement', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4 q:d4 q:e4 h:f4 q:g4'));
        assert.deepEqual(L.measures.flatMap(m => m.pieces.map(x => x.ev)), [0, 1, 2, 3, 3, 4]);
    });
    test('triolets : groupés par trois, posés d’un bloc dans la mesure', () => {
        const L = S.layoutStaff(P('t,4/4,0;h:c4 q.:d4 8t:f4 8t:g4 8t:a4'));
        assert.equal(L.measures[0].pieces.length, 2, 'les trois triolets ne tiennent pas : ils passent à la mesure suivante');
        const trip = L.measures[1].pieces;
        assert.deepEqual(trip.map(x => !!x.tupletStart), [true, false, false]);
        assert.equal(trip[0].tupletSize, 3);
    });
    test('des triolets qui tiennent restent dans la mesure', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4 q:d4 q:e4 8t:f4 8t:g4 8t:a4'));
        assert.equal(L.measures[0].pieces.length, 6);
    });
    test('trois triolets de noires font une demi-mesure complète', () => {
        const L = S.layoutStaff(P('t,4/4,0;qt:c4 qt:d4 qt:e4 h:f4'));
        assert.equal(L.measures[0].used, 96);
        assert.equal(L.measures[0].pieces.length, 4);
    });
});

describe('hauteurs', () => {
    test('altérations de l’armure : dièses (fa do sol…), bémols (si mi la…)', () => {
        assert.deepEqual('fcgdaeb'.split('').map(l => S.keyAlter(1, l)), [1, 0, 0, 0, 0, 0, 0]);
        assert.deepEqual('fcgdaeb'.split('').map(l => S.keyAlter(3, l)), [1, 1, 1, 0, 0, 0, 0]);
        assert.deepEqual('beadgcf'.split('').map(l => S.keyAlter(-2, l)), [-1, -1, 0, 0, 0, 0, 0]);
        assert.equal(S.keyAlter(0, 'f'), 0);
        assert.equal(S.keyAlter(7, 'b'), 1);
        assert.equal(S.keyAlter(-7, 'f'), -1);
    });
    test('pitchFromDia : lettre, octave, altération de l’armure ; hors plage → null', () => {
        assert.deepEqual(S.pitchFromDia(4 * 7 + 3, 1), { l: 'f', o: 4, a: 1 }); // fa4 en sol majeur
        assert.deepEqual(S.pitchFromDia(4 * 7 + 3, 0), { l: 'f', o: 4, a: 0 });
        assert.deepEqual(S.pitchFromDia(4 * 7 + 6, -2), { l: 'b', o: 4, a: -1 });
        assert.equal(S.pitchFromDia(6, 0), null);
        assert.equal(S.pitchFromDia(8 * 7, 0), null);
    });
    test('MIDI et noms : do4 = 60, la4 = 69, altérations', () => {
        const m = (l, o, a = 0) => S.pitchMidi({ l, o, a });
        assert.deepEqual([m('c', 4), m('a', 4), m('f', 4, 1), m('b', 3, -1), m('c', 4, -1), m('b', 3, 1), m('c', 1)], [60, 69, 66, 58, 59, 60, 24]);
        assert.deepEqual([60, 61, 70, 71, 24].map(S.midiToName), ['C4', 'Db4', 'Bb4', 'B4', 'C1']);
    });
    test('libellé français', () => {
        assert.equal(S.pitchLabel({ l: 'f', o: 4, a: 1 }), 'Fa♯4');
        assert.equal(S.pitchLabel({ l: 'b', o: 3, a: -1 }), 'Si♭3');
        assert.equal(S.pitchLabel({ l: 'c', o: 5, a: 0 }), 'Do5');
    });
    test('clic → degré : ligne du bas = mi4 en clé de sol, sol2 en clé de fa', () => {
        const bottom = 100, sp = 10;
        assert.equal(S.diaFromY(100, bottom, sp, S.SN_BOTTOM_LINE.t), 4 * 7 + 2);          // mi4
        assert.equal(S.diaFromY(95, bottom, sp, S.SN_BOTTOM_LINE.t), 4 * 7 + 3);           // fa4 (premier interligne)
        assert.equal(S.diaFromY(60, bottom, sp, S.SN_BOTTOM_LINE.t), 4 * 7 + 2 + 8);       // fa5 (ligne du haut)
        assert.equal(S.diaFromY(102, bottom, sp, S.SN_BOTTOM_LINE.t), 4 * 7 + 2);          // arrondi à la ligne la plus proche
        assert.equal(S.diaFromY(100, bottom, sp, S.SN_BOTTOM_LINE.b), 2 * 7 + 4);          // sol2
    });
    test('yFromDia est l’inverse de diaFromY', () => {
        for (const dia of [20, 30, 34, 41, 50]) assert.equal(S.diaFromY(S.yFromDia(dia, 100, 10, 30), 100, 10, 30), dia);
    });
});

describe('plan de lecture', () => {
    test('temps en noires, silences comptés, notes jouées avec leur MIDI', () => {
        const plan = S.playbackPlan(P('t,4/4,0;q:c4 8:d4 8r h.:e4 qt:g4'));
        assert.deepEqual(plan.map(n => n.at), [0, 1, 1.5, 2, 5]);
        assert.deepEqual(plan.map(n => n.len), [1, 0.5, 0.5, 3, 2 / 3]);
        assert.deepEqual(plan.map(n => n.midi), [60, 62, null, 64, 67]);
    });
});

describe('modifications (la portée d’origine n’est jamais changée)', () => {
    const base = () => P('t,4/4,0;q:c4 q:d4');
    test('insertEvent : à l’indice demandé, borné', () => {
        const st = base();
        assert.equal(S.formatStaff(S.insertEvent(st, 1, { d: '8', p: { l: 'e', o: 4, a: 0 } })), 't,4/4,0;q:c4 8:e4 q:d4');
        assert.equal(S.formatStaff(S.insertEvent(st, 99, { d: 'q', p: null })), 't,4/4,0;q:c4 q:d4 qr');
        assert.equal(S.formatStaff(S.insertEvent(st, -3, { d: 'h', dot: true, p: { l: 'a', o: 3, a: 0 } })), 't,4/4,0;h.:a3 q:c4 q:d4');
        assert.equal(S.formatStaff(st), 't,4/4,0;q:c4 q:d4');
    });
    test('insertEvent : plus rien au-delà de 64 événements', () => {
        let st = P(`t,4/4,0;${Array(64).fill('16:c4').join(' ')}`);
        st = S.insertEvent(st, 0, { d: 'q', p: null });
        assert.equal(st.ev.length, 64);
    });
    test('removeEvent', () => {
        assert.equal(S.formatStaff(S.removeEvent(base(), 0)), 't,4/4,0;q:d4');
        assert.equal(S.formatStaff(S.removeEvent(base(), 9)), 't,4/4,0;q:c4 q:d4');
    });
    test('updateEvent : durée, point, triolet, hauteur, silence', () => {
        assert.equal(S.formatStaff(S.updateEvent(base(), 0, { d: 'h', dot: true })), 't,4/4,0;h.:c4 q:d4');
        assert.equal(S.formatStaff(S.updateEvent(base(), 1, { tri: true })), 't,4/4,0;q:c4 qt:d4');
        assert.equal(S.formatStaff(S.updateEvent(base(), 0, { p: null })), 't,4/4,0;qr q:d4');
        assert.equal(S.formatStaff(S.updateEvent(base(), 1, { p: { l: 'g', o: 4, a: 1 } })), 't,4/4,0;q:c4 q:g#4');
        assert.equal(S.formatStaff(S.updateEvent(base(), 0, { d: 'zz' })), 't,4/4,0;q:c4 q:d4', 'durée inconnue ignorée');
    });
    test('alterEvent : dièse, bémol, bécarre ; limites ±2 ; silence inchangé', () => {
        assert.equal(S.formatStaff(S.alterEvent(base(), 0, 1)), 't,4/4,0;q:c#4 q:d4');
        assert.equal(S.formatStaff(S.alterEvent(S.alterEvent(S.alterEvent(base(), 0, 1), 0, 1), 0, 1)), 't,4/4,0;q:c##4 q:d4');
        assert.equal(S.formatStaff(S.alterEvent(S.alterEvent(base(), 1, -1), 1, null)), 't,4/4,0;q:c4 q:d4');
        assert.equal(S.formatStaff(S.alterEvent(P('t,4/4,0;qr'), 0, 1)), 't,4/4,0;qr');
    });
    test('shiftEvent : un degré à la fois, avec l’armure ; reste dans la plage', () => {
        assert.equal(S.formatStaff(S.shiftEvent(P('t,4/4,1;q:e4'), 0, 1)), 't,4/4,1;q:f#4');
        assert.equal(S.formatStaff(S.shiftEvent(P('t,4/4,0;q:c4'), 0, -1)), 't,4/4,0;q:b3');
        assert.equal(S.formatStaff(S.shiftEvent(P('t,4/4,0;q:c4'), 0, 7)), 't,4/4,0;q:c5');
        assert.equal(S.formatStaff(S.shiftEvent(P('t,4/4,0;q:c1'), 0, -1)), 't,4/4,0;q:c1', 'pas sous l’octave 1');
    });
});

describe('taille d’affichage de la portée', () => {
    test('par défaut 100 % : absente du texte ; autre taille : 4e champ de l’en-tête, aller-retour identique', () => {
        assert.equal(P('t,4/4,0;q:c4').size, 100);
        assert.equal(S.formatStaff(P('t,4/4,0,100;q:c4')), 't,4/4,0;q:c4');
        for (const t of ['t,4/4,0,60;q:c4', 'b,6/8,-2,150;8t:bb3', 't,3/4,7,200;']) assert.equal(S.formatStaff(P(t)), t, t);
        assert.equal(P('t,4/4,0,150;q:c4').size, 150);
        assert.equal(P('t,4/4,0,50;q:c4').size, 50);
        assert.equal(S.formatStaff(P('t,4/4,0,50;q:c4')), 't,4/4,0,50;q:c4');
    });
    test('tailles invalides refusées (hors 50-200, pas de 10, pas un nombre)', () => {
        for (const t of ['t,4/4,0,40;', 't,4/4,0,210;', 't,4/4,0,155;', 't,4/4,0,abc;', 't,4/4,0,;', 't,4/4,0,100,1;', 't,4/4,0,-100;']) assert.equal(P(t), null, t);
    });
    test('clampStaffSize arrondit au pas de 10 et borne', () => {
        assert.equal(S.clampStaffSize(33), 50);
        assert.equal(S.clampStaffSize(50), 50);
        assert.equal(S.clampStaffSize(999), 200);
        assert.equal(S.clampStaffSize('124'), 120);
        assert.equal(S.clampStaffSize('x'), 100);
    });
    test('les modifications gardent la taille', () => {
        const st = P('t,4/4,0,150;q:c4 q:d4');
        for (const out of [S.insertEvent(st, 1, { d: 'q', p: { l: 'e', o: 4, a: 0 } }), S.removeEvent(st, 0), S.updateEvent(st, 0, { d: 'h' }), S.alterEvent(st, 0, 1), S.shiftEvent(st, 0, 1), S.cloneStaff(st)]) {
            assert.equal(out.size, 150);
        }
    });
});

describe('copier-coller d\'une portée : staffClipText / splitStaffClips', () => {
    test('le repère « [portée:…] » contient le texte canonique de la portée', () => {
        assert.equal(S.staffClipText(P('t,4/4,0;q:c4 8:e4')), '[portée:t,4/4,0;q:c4 8:e4]');
        assert.equal(S.staffClipText(P('b,6/8,-2,150;')), '[portée:b,6/8,-2,150;]');
    });
    test('un texte sans repère reste un seul morceau de texte', () => {
        assert.deepEqual(S.splitStaffClips('Intro lente'), [{ text: 'Intro lente' }]);
        assert.deepEqual(S.splitStaffClips(''), []);
        assert.deepEqual(S.splitStaffClips(undefined), []);
    });
    test('texte et portées mélangés : ordre conservé, portées sous forme canonique', () => {
        const parts = S.splitStaffClips('Début [portée:t,4/4,0;q:c4] milieu [portée:b,3/4,-1;h:f3]\n fin');
        assert.deepEqual(parts, [{ text: 'Début ' }, { staff: 't,4/4,0;q:c4' }, { text: ' milieu ' }, { staff: 'b,3/4,-1;h:f3' }, { text: '\n fin' }]);
    });
    test('deux portées collées l\'une à l\'autre', () => {
        assert.deepEqual(S.splitStaffClips('[portée:t,4/4,0;q:c4][portée:t,4/4,0;q:d4]'), [{ staff: 't,4/4,0;q:c4' }, { staff: 't,4/4,0;q:d4' }]);
    });
    test('une portée invalide reste du texte ordinaire (rien n\'est inventé)', () => {
        for (const bad of ['[portée:x,4/4,0;q:c4]', '[portée:t,4/4,0;q:z9]', '[portée:]', '[portée:t,7/16,0;]']) {
            assert.deepEqual(S.splitStaffClips(bad), [{ text: bad }], bad);
        }
    });
    test('aller-retour : ce qui est copié est exactement ce qui est collé', () => {
        for (const t of ['t,4/4,0;', 't,4/4,0;q:c4 8:e4 8:g4 qr h.:a4 w:c5', 'b,6/8,-2,160;8t:bb3 8t:b3 8t:bbb3']) {
            assert.deepEqual(S.splitStaffClips(S.staffClipText(P(t))), [{ staff: t }], t);
        }
    });
    test('un repère trop long (plus de 800 signes) n\'est pas lu', () => {
        const long = `[portée:t,4/4,0;${'q:c4 '.repeat(200)}]`;
        assert.deepEqual(S.splitStaffClips(long), [{ text: long }]);
    });
});

describe('décalage libre d\'un bloc portée (data-pos)', () => {
    test('lecture : deux entiers « x,y », avec signe', () => {
        assert.deepEqual(S.parseStaffPos('12,-7'), { x: 12, y: -7 });
        assert.deepEqual(S.parseStaffPos(' 0,0 '), { x: 0, y: 0 });
    });
    test('lecture : tout le reste est refusé', () => {
        for (const bad of ['', '12', '1,2,3', 'a,b', '1.5,2', '12345,1', '1;2', '--1,2', null, undefined, 5]) assert.equal(S.parseStaffPos(bad), null, String(bad));
    });
    test('les valeurs sont limitées à ±3000 pixels', () => {
        assert.equal(S.clampStaffPos(99999), 3000);
        assert.equal(S.clampStaffPos(-99999), -3000);
        assert.equal(S.clampStaffPos('x'), 0);
        assert.equal(S.clampStaffPos(2.6), 3);
        assert.deepEqual(S.parseStaffPos('3500,-3500'), { x: 3000, y: -3000 });
    });
    test('écriture : pas de décalage = texte vide ; aller-retour', () => {
        assert.equal(S.formatStaffPos(null), '');
        assert.equal(S.formatStaffPos({ x: 0, y: 0 }), '');
        assert.equal(S.formatStaffPos({ x: 4, y: -9 }), '4,-9');
        assert.deepEqual(S.parseStaffPos(S.formatStaffPos({ x: -120, y: 33 })), { x: -120, y: 33 });
    });
});
