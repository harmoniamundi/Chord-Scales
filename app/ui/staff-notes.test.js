// Tests des portées éditables (ui/staff-notes.js) : format texte, mesures, hauteurs, plan de lecture, modifications. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./staff-notes.js');

const P = (t) => S.parseStaff(t);
const pieces = (st) => S.layoutStaff(st).measures.map(m => m.pieces.map(x => `${x.d}${x.dot ? '.' : ''}${x.tu ? 't' : ''}${x.p ? '' : 'r'}${x.tieNext ? '~' : ''}`).join(' '));

describe('parseStaff / formatStaff : format texte', () => {
    test('portée vide et exemple complet : aller-retour identique', () => {
        for (const t of ['t,4/4,0;', 't,4/4,0;q:c4 8:e4 8:g4 qr h.:a4 w:c5', 'b,6/8,-2;(3 8:bb3 8:b3 8:bbb3) 16.:f##5', 't,3/4,7;q.:c#5 8:cb4', 't,4/4,0;(5 16:c4 16:d4 16:e4 16:f4 16:g4) q:a4']) {
            assert.equal(S.formatStaff(P(t)), t, t);
        }
    });
    test('ancienne écriture « 8t:… » (groupes de trois) : relue, puis réécrite avec parenthèses', () => {
        assert.equal(S.formatStaff(P('b,6/8,-2;8t:bb3 8t:b3 8t:bbb3 16.:f##5')), 'b,6/8,-2;(3 8:bb3 8:b3 8:bbb3) 16.:f##5');
        assert.equal(S.formatStaff(P('t,4/4,0;qt:c4 qt:d4 qt:e4 h:f4')), 't,4/4,0;(3 q:c4 q:d4 q:e4) h:f4');
    });
    test('l’en-tête seul (sans point-virgule) est accepté et devient canonique', () => {
        assert.equal(S.formatStaff(P('t,4/4,0')), 't,4/4,0;');
    });
    test('valeurs lues : durée, point, triolet, hauteur, silence', () => {
        const st = P('b,2/4,-3;8.t:eb3 qr');
        assert.deepEqual(st.ev[0], { d: '8', dot: true, tu: 3, gs: true, tie: false, p: { l: 'e', o: 3, a: -1 } });
        assert.deepEqual(st.ev[1], { d: 'q', dot: false, tu: 0, gs: false, tie: false, p: null });
        const tp = P('t,4/4,0;(5 16:c4 16r 16:e4 16:f4 16:g4) q:a4');
        assert.deepEqual(tp.ev.map(e => [e.tu, e.gs]), [[5, true], [5, false], [5, false], [5, false], [5, false], [0, false]]);
        assert.equal(tp.ev[1].p, null);
        assert.equal(st.clef, 'b'); assert.equal(st.meter, '2/4'); assert.equal(st.ks, -3);
    });
    test('textes invalides refusés', () => {
        for (const bad of [null, undefined, 5, '', 'x', 't,4/4', 'x,4/4,0;', 't,4/5,0;', 't,4/4,8;', 't,4/4,-8;', 't,4/4,0;q', 't,4/4,0;q:h4', 't,4/4,0;q:c0', 't,4/4,0;q:c8',
            't,4/4,0;x:c4', 't,4/4,0;q:c4,d4', 't,4/4,0;q:c###4', 't,4/4,0;q:cn4', 't,4/4,0;32:c4', 't,4/4,0;<script>']) {
            assert.equal(S.parseStaff(bad), null, String(bad));
        }
    });
    test('96 événements acceptés, 97 refusés ; longueur maximale', () => {
        assert.equal(P(`t,4/4,0;${Array(96).fill('16:c4').join(' ')}`).ev.length, 96);
        assert.equal(P(`t,4/4,0;${Array(97).fill('16:c4').join(' ')}`), null);
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
    test('insertEvent : plus rien au-delà de 96 événements', () => {
        let st = P(`t,4/4,0;${Array(96).fill('16:c4').join(' ')}`);
        st = S.insertEvent(st, 0, { d: 'q', p: null });
        assert.equal(st.ev.length, 96);
        assert.equal(S.staffInsertTupletGroup(st, 0, { d: '8', p: null }, 3).ev.length, 96, 'un tuplet entier ou rien');
    });
    test('removeEvent', () => {
        assert.equal(S.formatStaff(S.removeEvent(base(), 0)), 't,4/4,0;q:d4');
        assert.equal(S.formatStaff(S.removeEvent(base(), 9)), 't,4/4,0;q:c4 q:d4');
    });
    test('updateEvent : durée, point, triolet, hauteur, silence', () => {
        assert.equal(S.formatStaff(S.updateEvent(base(), 0, { d: 'h', dot: true })), 't,4/4,0;h.:c4 q:d4');
        assert.equal(S.formatStaff(S.updateEvent(base(), 1, { tri: true })), 't,4/4,0;q:c4 q:d4', 'le triolet ne se règle plus note par note (voir staffMakeTuplet)');
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
        for (const t of ['t,4/4,0,60;q:c4', 'b,6/8,-2,150;(3 8:bb3)', 't,3/4,7,200;']) assert.equal(S.formatStaff(P(t)), t, t);
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
        for (const t of ['t,4/4,0;', 't,4/4,0;q:c4 8:e4 8:g4 qr h.:a4 w:c5', 'b,6/8,-2,160;(3 8:bb3 8:b3 8:bbb3)', 't,4/4,0,pu1,bpm96,sw67;8:c4 q:d4 q:e4 q:f4 q:g4']) {
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

describe('cadres de texte : largeur et échelle', () => {
    test('lecture : « L » ou « L,E », bornes appliquées', () => {
        assert.deepEqual(S.parseFrameBox('260'), { w: 260, s: 100 });
        assert.deepEqual(S.parseFrameBox('260,150'), { w: 260, s: 150 });
        assert.deepEqual(S.parseFrameBox(' 300,60 '), { w: 300, s: 60 });
        assert.deepEqual(S.parseFrameBox('10,5'), { w: S.SN_FRAME_W_MIN, s: S.SN_FRAME_SCALE_MIN });
        assert.deepEqual(S.parseFrameBox('1500,999'), { w: S.SN_FRAME_W_MAX, s: S.SN_FRAME_SCALE_MAX });
    });
    test('largeur automatique « a » : lecture, écriture, aller-retour, copier-coller', () => {
        assert.deepEqual(S.parseFrameBox('a'), { w: S.SN_FRAME_W_DEFAULT, s: 100, auto: true });
        assert.deepEqual(S.parseFrameBox(' a,150 '), { w: S.SN_FRAME_W_DEFAULT, s: 150, auto: true });
        assert.equal(S.formatFrameBox({ auto: true, w: 24, s: 100 }), 'a');
        assert.equal(S.formatFrameBox({ auto: true, s: 150 }), 'a,150');
        for (const t of ['a', 'a,25', 'a,400']) assert.equal(S.formatFrameBox(S.parseFrameBox(t)), t);
        for (const bad of ['b', 'a,', 'aa', 'a,1500', '1a']) assert.equal(S.parseFrameBox(bad), null, bad);
        assert.ok(S.frameClipText({ auto: true, s: 100 }, 'x').startsWith('[cadre:a;'));
        assert.deepEqual(S.splitStaffClips('[cadre:a,120;bonjour]'), [{ frame: { box: 'a,120', html: 'bonjour' } }]);
    });
    test('texte invalide → null', () => {
        for (const bad of ['', 'abc', '260,', ',150', '260,150,3', '-260', '26.5', '12345', '260,1500', null, undefined, 260]) assert.equal(S.parseFrameBox(bad), null, String(bad));
    });
    test('écriture : l\'échelle de 100 % est omise ; aller-retour', () => {
        assert.equal(S.formatFrameBox({ w: 260, s: 100 }), '260');
        assert.equal(S.formatFrameBox({ w: 260, s: 150 }), '260,150');
        assert.equal(S.formatFrameBox({ w: 260 }), '260');
        assert.equal(S.formatFrameBox({}), String(S.SN_FRAME_W_DEFAULT));
        assert.equal(S.formatFrameBox({ w: 9999, s: 9999 }), `${S.SN_FRAME_W_MAX},${S.SN_FRAME_SCALE_MAX}`);
        for (const t of ['80', '260', '300,25', '1200,400', '500,133']) assert.equal(S.formatFrameBox(S.parseFrameBox(t)), t);
    });
    test('bornes', () => {
        assert.equal(S.clampFrameWidth('x'), S.SN_FRAME_W_DEFAULT);
        assert.equal(S.clampFrameScale('x'), S.SN_FRAME_SCALE_DEFAULT);
        assert.equal(S.clampFrameScale(1), S.SN_FRAME_SCALE_MIN);
        assert.equal(S.clampFrameScale(1e6), S.SN_FRAME_SCALE_MAX);
    });
});

describe('copier-coller d\'un cadre de texte : frameClipText / splitStaffClips', () => {
    test('le repère est une seule ligne, sans « ] » à l\'intérieur, et se relit à l\'identique', () => {
        const html = '<b>Gras</b> ] [ et <i>retour</i><div>ligne 2</div>\néàç';
        const clip = S.frameClipText({ w: 300, s: 150 }, html);
        assert.ok(clip.startsWith('[cadre:300,150;') && clip.endsWith(']'));
        assert.ok(!clip.slice(0, -1).includes(']') && !clip.includes('\n'));
        assert.deepEqual(S.splitStaffClips(clip), [{ frame: { box: '300,150', html } }]);
    });
    test('l\'échelle de 100 % est omise ; la largeur est ramenée dans les bornes', () => {
        assert.ok(S.frameClipText({ w: 260, s: 100 }, 'a').startsWith('[cadre:260;'));
        assert.deepEqual(S.splitStaffClips('[cadre:5,9;a]'), [{ frame: { box: '80,25', html: 'a' } }]);
    });
    test('texte, portée et cadre mêlés dans l\'ordre', () => {
        const st = S.staffClipText(S.parseStaff('t,4/4,0;q:c4'));
        const fr = S.frameClipText({ w: 260 }, 'x');
        assert.deepEqual(S.splitStaffClips(`avant ${st} milieu ${fr} après`), [{ text: 'avant ' }, { staff: 't,4/4,0;q:c4' }, { text: ' milieu ' }, { frame: { box: '260', html: 'x' } }, { text: ' après' }]);
    });
    test('un cadre vide se copie et se colle', () => {
        assert.deepEqual(S.splitStaffClips(S.frameClipText({ w: 260 }, '')), [{ frame: { box: '260', html: '' } }]);
    });
    test('repère invalide (largeur illisible, encodage cassé) : reste du texte ordinaire', () => {
        for (const bad of ['[cadre:abc;x]', '[cadre:260;%E0%A4%A]', '[cadre:260,1500;x]', '[cadre:260]']) assert.deepEqual(S.splitStaffClips(bad), [{ text: bad }], bad);
    });
});

describe('place d\'un bloc sur le canevas (data-at) et bord visible (data-border)', () => {
    test('lecture : deux entiers positifs « x,y »', () => {
        assert.deepEqual(S.parseBlockAt('12,34'), { x: 12, y: 34 });
        assert.deepEqual(S.parseBlockAt('0,0'), { x: 0, y: 0 });
        assert.deepEqual(S.parseBlockAt(' 7,9 '), { x: 7, y: 9 });
        assert.deepEqual(S.parseBlockAt(`${S.SN_AT_MAX + 1},0`), { x: S.SN_AT_MAX, y: 0 }); // au-delà de la limite : ramené à la limite
    });
    test('lecture : tout le reste est refusé (négatif, décimal, trop de chiffres, texte)', () => {
        for (const bad of ['', null, undefined, 'x', '1', '1,2,3', '-1,5', '5,-1', '1.5,2', '1,2.5', '0,99999', '7 , 9', '１,２']) assert.equal(S.parseBlockAt(bad), null, String(bad));
    });
    test('écriture : aller-retour identique, texte vide sans place', () => {
        assert.equal(S.formatBlockAt({ x: 12, y: 34 }), '12,34');
        assert.deepEqual(S.parseBlockAt(S.formatBlockAt({ x: 12, y: 34 })), { x: 12, y: 34 });
        assert.equal(S.formatBlockAt(null), '');
        assert.equal(S.formatBlockAt(undefined), '');
    });
    test('clampBlockAt : entier entre 0 et la limite', () => {
        assert.equal(S.clampBlockAt(-8), 0);
        assert.equal(S.clampBlockAt(12.6), 13);
        assert.equal(S.clampBlockAt(1e9), S.SN_AT_MAX);
        assert.equal(S.clampBlockAt(NaN), 0);
    });
    test('bord : visible par défaut, caché seulement avec « 0 »', () => {
        assert.equal(S.parseBlockBorder(null), true);
        assert.equal(S.parseBlockBorder(''), true);
        assert.equal(S.parseBlockBorder('1'), true);
        assert.equal(S.parseBlockBorder('0'), false);
    });
});

describe('copier-coller avec la place et le bord : [portée@x,y!:…] et [cadre@x,y!:…]', () => {
    const st = S.parseStaff('t,4/4,0;q:c4');
    test('une portée avec sa place ; le « ! » dit que son cadre est caché', () => {
        assert.equal(S.staffClipText(st, { at: { x: 12, y: 34 }, border: true }), '[portée@12,34:t,4/4,0;q:c4]');
        assert.equal(S.staffClipText(st, { at: { x: 12, y: 34 }, border: false }), '[portée@12,34!:t,4/4,0;q:c4]');
        assert.equal(S.staffClipText(st), '[portée:t,4/4,0;q:c4]');
    });
    test('relecture : place et bord caché sont rendus, et seulement s\'ils sont notés', () => {
        assert.deepEqual(S.splitStaffClips('[portée@12,34!:t,4/4,0;q:c4]'), [{ staff: 't,4/4,0;q:c4', at: { x: 12, y: 34 }, noBorder: true }]);
        assert.deepEqual(S.splitStaffClips('[portée@12,34:t,4/4,0;q:c4]'), [{ staff: 't,4/4,0;q:c4', at: { x: 12, y: 34 } }]);
        assert.deepEqual(S.splitStaffClips('[portée:t,4/4,0;q:c4]'), [{ staff: 't,4/4,0;q:c4' }]);
    });
    test('un cadre de texte : place, bord caché, texte mis en forme', () => {
        const t = S.frameClipText({ w: 200, s: 150 }, '<b>a</b>', { at: { x: 5, y: 6 }, border: false });
        assert.match(t, /^\[cadre@5,6!:200,150;/);
        assert.deepEqual(S.splitStaffClips(t), [{ frame: { box: '200,150', html: '<b>a</b>' }, at: { x: 5, y: 6 }, noBorder: true }]);
    });
    test('plusieurs blocs copiés ensemble gardent leur place relative', () => {
        const txt = S.staffClipText(st, { at: { x: 10, y: 10 } }) + S.frameClipText({ w: 260 }, 'x', { at: { x: 300, y: 40 } });
        const parts = S.splitStaffClips(txt);
        assert.deepEqual(parts.map(p => p.at), [{ x: 10, y: 10 }, { x: 300, y: 40 }]);
    });
    test('une place illisible : le repère reste du texte ordinaire', () => {
        for (const bad of ['[portée@-1,5:t,4/4,0;q:c4]', '[portée@x,y:t,4/4,0;q:c4]', '[cadre@1:260;x]']) assert.deepEqual(S.splitStaffClips(bad), [{ text: bad }], bad);
    });
});

describe('levée (anacrouse)', () => {
    test('pu1 : la 1re mesure est incomplète, la mesure suivante est pleine', () => {
        const L = S.layoutStaff(P('t,4/4,0,pu1;q:c4 q:d4 q:e4 q:f4 q:g4'));
        assert.equal(L.pickup, true);
        assert.deepEqual(L.measures.map(m => [m.used, m.pickup]), [[24, true], [96, false]]);
    });
    test('sans pu, la même portée se découpe en mesures pleines', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4 q:d4 q:e4 q:f4 q:g4'));
        assert.equal(L.pickup, false);
        assert.deepEqual(L.measures.map(m => m.used), [96, 24]);
    });
    test('une levée plus longue qu’une mesure, ou qui coupe un tuplet, n’est pas une levée', () => {
        assert.equal(S.layoutStaff(P('t,4/4,0,pu5;q:c4 q:d4 q:e4 q:f4 q:g4')).pickup, false);
        assert.equal(P('t,4/4,0,pu2;(3 8:c4 8:d4 8:e4) q:f4'), null, 'levée au milieu d’un tuplet : texte refusé');
        assert.equal(S.layoutStaff(P('t,4/4,0,pu3;(3 8:c4 8:d4 8:e4) q:f4')).pickup, true);
    });
    test('staffSetPickup : fixe, défait, ne coupe jamais un tuplet', () => {
        const st = P('t,4/4,0;(3 8:c4 8:d4 8:e4) q:f4 q:g4');
        assert.equal(S.formatStaff(S.staffSetPickup(st, 3)), 't,4/4,0,pu3;(3 8:c4 8:d4 8:e4) q:f4 q:g4');
        assert.equal(S.staffSetPickup(st, 1).pu, 3, 'au milieu d’un tuplet : jusqu’à sa fin');
        assert.equal(S.staffSetPickup(S.staffSetPickup(st, 3), 0).pu, 0);
        assert.equal(S.staffSetPickup(st, 99).pu, 5);
        assert.equal(st.pu, 0, 'la portée d’origine ne change pas');
    });
    test('staffEventEnd : fin de la note, ou de son tuplet', () => {
        const st = P('t,4/4,0;q:c4 (3 8:c4 8:d4 8:e4) q:f4');
        assert.deepEqual([0, 1, 2, 3, 4].map(i => S.staffEventEnd(st, i)), [1, 4, 4, 4, 5]);
    });
    test('insertEvent : avant la fin de la levée elle s’allonge ; à sa fin, la note ouvre la mesure suivante (sauf joinPickup)', () => {
        const st = P('t,4/4,0,pu2;q:c4 q:d4 h:e4');
        assert.equal(S.insertEvent(st, 1, { d: '8', p: null }).pu, 3);
        assert.equal(S.insertEvent(st, 2, { d: '8', p: null }).pu, 2);
        assert.equal(S.insertEvent(st, 2, { d: '8', p: null }, { joinPickup: true }).pu, 3);
        assert.equal(S.insertEvent(st, 3, { d: '8', p: null }, { joinPickup: true }).pu, 2);
    });
    test('removeEvent : la levée raccourcit avec ses notes', () => {
        const st = P('t,4/4,0,pu2;q:c4 q:d4 h:e4');
        assert.equal(S.removeEvent(st, 0).pu, 1);
        assert.equal(S.removeEvent(st, 2).pu, 2);
    });
    test('la levée est swinguée comme si elle finissait sur le temps fort ; la lecture démarre sans attente', () => {
        const plan = S.playbackPlan(P('t,4/4,0,pu1,sw67;8:c4 8:d4 8:e4 8:f4 8:g4')).map(x => [Math.round(x.at * 100) / 100, Math.round(x.len * 100) / 100]);
        assert.deepEqual(plan, [[0, 0.33], [0.33, 0.67], [1, 0.33], [1.33, 0.67], [2, 0.33]]);
    });
});

describe('tuplets (triolet, quintolet… : de vraies notes)', () => {
    const q3 = () => P('t,4/4,0;q:c4 q:d4 h:e4');
    test('durée réelle = durée écrite × M / N', () => {
        const u = (t) => P(`t,4/4,0;${t}`).ev.map(S.eventUnits);
        assert.deepEqual(u('(3 8:c4 8:d4 8:e4)').map(x => Math.round(x * 1e6) / 1e6), [8, 8, 8]);
        assert.deepEqual(u('(5 16:c4 16:d4 16:e4 16:f4 16:g4)').map(x => Math.round(x * 1e6) / 1e6), [4.8, 4.8, 4.8, 4.8, 4.8]);
        assert.deepEqual(u('(2 8:c4 8:d4)').map(x => Math.round(x * 1e6) / 1e6), [18, 18]);
        assert.ok(Math.abs(u('(7 16:c4 16:d4 16:e4 16:f4 16:g4 16:a4 16:b4)').reduce((a, b) => a + b) - 24) < 1e-6);
        assert.ok(Math.abs(u('(6 16:c4 16:d4 16:e4 16:f4 16:g4 16:a4)').reduce((a, b) => a + b) - 24) < 1e-6);
    });
    test('un groupe de N notes occupe exactement la place de M notes de même valeur : la mesure se remplit', () => {
        const L = S.layoutStaff(P('t,4/4,0;(3 q:c4 q:d4 q:e4) (5 16:c4 16:d4 16:e4 16:f4 16:g4) q:f4 q:g4'));
        assert.equal(L.measures.length, 2);
        assert.ok(Math.abs(L.measures[0].used - 96) < 1e-6, String(L.measures[0].used));
    });
    test('staffTupletChoices : seulement les tuplets dont la valeur écrite existe', () => {
        assert.deepEqual(S.staffTupletChoices(P('t,4/4,0;q:c4').ev[0]), [3, 5, 6, 7]);
        assert.deepEqual(S.staffTupletChoices(P('t,4/4,0;h:c4').ev[0]), [3, 5, 6, 7, 9]);
        assert.deepEqual(S.staffTupletChoices(P('t,4/4,0;8:c4').ev[0]), [3]);
        assert.deepEqual(S.staffTupletChoices(P('t,4/4,0;q.:c4').ev[0]).includes(2), true, 'noire pointée : duolet');
        assert.deepEqual(S.staffTupletChoices(P('t,4/4,0;(3 8:c4 8:d4 8:e4)').ev[0]), [], 'déjà un tuplet');
    });
    test('staffMakeTuplet : une noire devient un vrai triolet de 3 croches, même hauteur, même durée', () => {
        const st = q3();
        const t = S.staffMakeTuplet(st, 0, 3);
        assert.equal(S.formatStaff(t), 't,4/4,0;(3 8:c4 8:c4 8:c4) q:d4 h:e4');
        assert.equal(S.staffWrittenUnits === undefined, false);
        assert.equal(S.layoutStaff(t).measures[0].used, S.layoutStaff(st).measures[0].used, 'durée totale inchangée');
        assert.equal(S.formatStaff(S.staffMakeTuplet(st, 0, 5)), 't,4/4,0;(5 16:c4 16:c4 16:c4 16:c4 16:c4) q:d4 h:e4');
        assert.equal(S.formatStaff(st), 't,4/4,0;q:c4 q:d4 h:e4', 'la portée d’origine ne change pas');
    });
    test('staffMakeTuplet : un silence donne un tuplet de silences ; impossible → null', () => {
        assert.equal(S.formatStaff(S.staffMakeTuplet(P('t,4/4,0;qr'), 0, 3)), 't,4/4,0;(3 8r 8r 8r)');
        assert.equal(S.staffMakeTuplet(P('t,4/4,0;8:c4'), 0, 5), null, 'une croche ne se coupe pas en quintolet');
        assert.equal(S.staffMakeTuplet(P('t,4/4,0;(3 8:c4 8:d4 8:e4)'), 0, 3), null, 'déjà dans un tuplet');
        assert.equal(S.staffMakeTuplet(q3(), 9, 3), null);
    });
    test('staffMakeTuplet : la levée suit', () => {
        const t = S.staffMakeTuplet(P('t,4/4,0,pu1;q:c4 q:d4'), 0, 3);
        assert.equal(t.pu, 3);
    });
    test('staffDissolveTuplet : le groupe redevient une note ; autre durée → notes libres', () => {
        const t = S.staffMakeTuplet(q3(), 0, 3);
        assert.equal(S.formatStaff(S.staffDissolveTuplet(t, 1)), 't,4/4,0;q:c4 q:d4 h:e4');
        assert.equal(S.staffDissolveTuplet(q3(), 0), null);
        const dup = P('t,4/4,0;(2 8:c4 8:d4) q:e4');
        assert.equal(S.formatStaff(S.staffDissolveTuplet(dup, 0)), 't,4/4,0;q.:c4 q:e4');
    });
    test('removeEvent : une note de tuplet devient un silence ; le groupe de silences part d’un bloc', () => {
        const t = S.staffMakeTuplet(q3(), 0, 3);
        const r = S.removeEvent(t, 1);
        assert.equal(S.formatStaff(r), 't,4/4,0;(3 8:c4 8r 8:c4) q:d4 h:e4');
        const rr = S.removeEvent(S.removeEvent(S.removeEvent(t, 0), 1), 2);
        assert.equal(S.formatStaff(rr), 't,4/4,0;(3 8r 8r 8r) q:d4 h:e4');
        assert.equal(S.formatStaff(S.removeEvent(rr, 1)), 't,4/4,0;q:d4 h:e4');
        assert.equal(S.layoutStaff(r).measures[0].used, 96, 'la durée est gardée');
    });
    test('staffInsertTupletGroup : N notes d’un coup ; staffInsertBoundary : jamais au milieu d’un groupe', () => {
        const st = q3();
        assert.equal(S.formatStaff(S.staffInsertTupletGroup(st, 1, { d: '8', dot: false, p: { l: 'c', o: 4, a: 0 } }, 3)), 't,4/4,0;q:c4 (3 8:c4 8:c4 8:c4) q:d4 h:e4');
        const t = S.staffMakeTuplet(st, 0, 3);
        assert.deepEqual([0, 1, 2, 3].map(i => S.staffInsertBoundary(t, i, true)), [0, 3, 3, 3]);
        assert.deepEqual([0, 1, 2, 3].map(i => S.staffInsertBoundary(t, i, false)), [0, 0, 0, 3]);
    });
    test('lecture : les notes d’un triolet se répartissent à égale distance dans le temps de deux croches', () => {
        const plan = S.playbackPlan(P('t,4/4,0;(3 8:c4 8:d4 8:e4) q:f4')).map(x => [Math.round(x.at * 1000) / 1000, Math.round(x.len * 1000) / 1000]);
        assert.deepEqual(plan, [[0, 0.333], [0.333, 0.333], [0.667, 0.333], [1, 1]]);
    });
});

describe('groupes de notes liées par une ligature (règles d’écriture)', () => {
    const groups = (t) => { const st = P(t); return S.staffBeamGroups(S.layoutStaff(st).measures[0], st.meter); };
    test('4/4 : croches regroupées par temps ou par deux temps selon la mesure ; les noires ne sont jamais liées', () => {
        assert.deepEqual(groups('t,4/4,0;8:c4 8:d4 8:e4 8:f4 q:g4 q:a4'), [[0, 1], [2, 3]]);
    });
    test('3/8 : les trois croches sont liées en un seul groupe (pas 2 + 1)', () => {
        assert.deepEqual(groups('t,3/8,0;8:c4 8:d4 8:e4'), [[0, 1, 2]]);
    });
    test('7/8 : 2 + 2 + 3', () => {
        assert.deepEqual(groups('t,7/8,0;8:c4 8:d4 8:e4 8:f4 8:g4 8:a4 8:b4'), [[0, 1], [2, 3], [4, 5, 6]]);
    });
    test('6/8 : deux groupes de trois croches', () => {
        assert.deepEqual(groups('t,6/8,0;8:c4 8:d4 8:e4 8:f4 8:g4 8:a4'), [[0, 1, 2], [3, 4, 5]]);
    });
    test('une note de plus d’une croche ou un silence coupe le groupe', () => {
        assert.deepEqual(groups('t,4/4,0;8:c4 8:d4 q:e4 8:f4 8:g4 h:a4'), [[0, 1], [3, 4]]);
    });
});

describe('tempo et swing de lecture', () => {
    test('en-tête : bpmN et swN dans n’importe quel ordre, forme canonique stable', () => {
        const st = P('t,4/4,0,sw67,bpm132;q:c4');
        assert.equal(st.bpm, 132); assert.equal(st.swing, 67);
        assert.equal(S.formatStaff(st), 't,4/4,0,bpm132,sw67;q:c4');
        assert.equal(S.formatStaff(P(S.formatStaff(st))), 't,4/4,0,bpm132,sw67;q:c4');
    });
    test('valeurs par défaut absentes du texte (swing : « Jam » = 0) ; valeurs hors bornes refusées', () => {
        const st = P('t,4/4,0;q:c4');
        assert.equal(st.bpm, 0); assert.equal(st.swing, 0);
        for (const bad of ['t,4/4,0,bpm0;q:c4', 't,4/4,0,bpm5;q:c4', 't,4/4,0,bpm900;q:c4', 't,4/4,0,sw49;q:c4', 't,4/4,0,sw99;q:c4']) assert.equal(P(bad), null, bad);
    });
    test('staffTempo : celui de la portée, sinon celui de la jam, sinon 100', () => {
        assert.equal(S.staffTempo({ bpm: 0 }, 0), 100);
        assert.equal(S.staffTempo({ bpm: 0 }, 90), 90);
        assert.equal(S.staffTempo({ bpm: 140 }, 90), 140);
    });
    test('setStaffTempo / setStaffSwing : bornés, la portée d’origine ne change pas', () => {
        const st = P('t,4/4,0;q:c4');
        assert.equal(S.setStaffTempo(st, 1000).bpm, 300);
        assert.equal(S.setStaffTempo(st, 10).bpm, 30);
        assert.equal(S.setStaffTempo(S.setStaffTempo(st, 120), '').bpm, 0, 'vide : tempo de la jam');
        assert.equal(S.setStaffSwing(st, 80).swing, 75);
        assert.equal(S.setStaffSwing(st, 67).swing, 67);
        assert.equal(st.bpm, 0); assert.equal(st.swing, 0);
        assert.equal(S.setStaffSwing(S.setStaffSwing(st, 67), 'auto').swing, 0, '« Jam » : retour au swing de la jam');
        assert.equal(S.setStaffSwing(st, 50).swing, 50, 'droit : réglage explicite');
    });
    test('swing droit explicite : sw50 s’écrit et se relit ; absent = suit la jam', () => {
        const st = P('t,4/4,0,sw50;q:c4');
        assert.equal(st.swing, 50);
        assert.equal(S.formatStaff(st), 't,4/4,0,sw50;q:c4');
        assert.equal(S.formatStaff(P('t,4/4,0;q:c4')), 't,4/4,0;q:c4');
    });
    test('swing 67 % : les croches deviennent longue-brève (2/3 + 1/3 de temps) ; 50 % : droites', () => {
        const r = (t) => S.playbackPlan(P(t)).map(x => [Math.round(x.at * 100) / 100, Math.round(x.len * 100) / 100]);
        assert.deepEqual(r('t,4/4,0,sw67;8:c4 8:d4 8:e4 8:f4'), [[0, 0.67], [0.67, 0.33], [1, 0.67], [1.67, 0.33]]);
        assert.deepEqual(r('t,4/4,0;8:c4 8:d4 8:e4 8:f4'), [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5]]);
    });
    test('pas de swing en mesure composée (6/8) ni sur les notes d’un tuplet ; la durée totale est conservée', () => {
        const r = (t) => S.playbackPlan(P(t)).map(x => [Math.round(x.at * 100) / 100, Math.round(x.len * 100) / 100]);
        assert.deepEqual(r('t,6/8,0,sw67;8:c4 8:d4 8:e4 8:f4'), [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5]]);
        assert.deepEqual(r('t,4/4,0,sw75;(3 8:c4 8:d4 8:e4) q:f4'), [[0, 0.33], [0.33, 0.33], [0.67, 0.33], [1, 1]]);
        assert.equal(S.staffMeterAllowsSwing('6/8'), false);
        assert.equal(S.staffMeterAllowsSwing('4/4'), true);
        const plan = S.playbackPlan(P('t,4/4,0,sw75;8:c4 8:d4 q:e4 h:f4'));
        const end = plan[plan.length - 1]; assert.ok(Math.abs(end.at + end.len - 4) < 1e-9);
    });
    test('copier-coller : tempo et swing sont gardés', () => {
        const t = 't,4/4,0,bpm132,sw67;q:c4';
        assert.deepEqual(S.splitStaffClips(S.staffClipText(P(t))), [{ staff: t }]);
    });
});


describe('swing par défaut : celui de la jam chargée', () => {
    const r = (t, jam) => S.playbackPlan(P(t), jam).map(x => [Math.round(x.at * 100) / 100, Math.round(x.len * 100) / 100]);
    const swung = [[0, 0.67], [0.67, 0.33], [1, 0.67], [1.67, 0.33]];
    const straight = [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5]];
    test('sans réglage propre, la portée swingue comme la jam', () => {
        assert.deepEqual(r('t,4/4,0;8:c4 8:d4 8:e4 8:f4', 0.667), swung);
        assert.deepEqual(r('t,4/4,0;8:c4 8:d4 8:e4 8:f4', 0.5), straight);
        assert.deepEqual(r('t,4/4,0;8:c4 8:d4 8:e4 8:f4'), straight, 'sans jam : droit');
    });
    test('un réglage explicite l’emporte sur la jam (y compris « droit »)', () => {
        assert.deepEqual(r('t,4/4,0,sw50;8:c4 8:d4 8:e4 8:f4', 0.667), straight);
        assert.deepEqual(r('t,4/4,0,sw67;8:c4 8:d4 8:e4 8:f4', 0.5), swung);
    });
    test('mesure composée : pas de swing, même si la jam swingue', () => {
        assert.deepEqual(r('t,6/8,0;8:c4 8:d4 8:e4 8:f4', 0.667), straight);
    });
    test('staffSwingRatio : valeurs hors bornes ramenées dans 0,5-0,75', () => {
        assert.equal(S.staffSwingRatio({ swing: 0 }, 0.9), 0.75);
        assert.equal(S.staffSwingRatio({ swing: 0 }, 0.2), 0.5);
        assert.equal(S.staffSwingRatio({ swing: 0 }, NaN), 0.5);
        assert.equal(S.staffSwingRatio({ swing: 62 }, 0.7), 0.62);
    });
});

describe('liaisons de prolongation', () => {
    test('écriture « ~ » : aller-retour ; une liaison entre hauteurs différentes ou sans suite est ignorée', () => {
        for (const t of ['t,4/4,0;q:c4~ q:c4 h:d4', 't,4/4,0;(3 8:c4~ 8:c4 8:d4~) q:d4', 't,4/4,0;w:eb4~ w:eb4']) assert.equal(S.formatStaff(P(t)), t, t);
        assert.equal(S.formatStaff(P('t,4/4,0;q:c4~ q:d4')), 't,4/4,0;q:c4 q:d4');
        assert.equal(S.formatStaff(P('t,4/4,0;q:c4~')), 't,4/4,0;q:c4');
        assert.equal(S.formatStaff(P('t,4/4,0;q:c#4~ q:db4')), 't,4/4,0;q:c#4 q:db4', 'même son mais pas la même note écrite : pas de liaison');
        assert.equal(P('t,4/4,0;qr~'), null, 'un silence ne se lie pas');
    });
    test('mise en page : une liaison part de la première note et arrive sur la seconde, qui reste une vraie note', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4~ q:c4 h:d4'));
        const pcs = L.measures[0].pieces;
        assert.deepEqual(pcs.map(x => [x.ev, x.tieNext, x.tieFromPrev, x.cont]), [[0, true, false, false], [1, false, true, false], [2, false, false, false]]);
    });
    test('liaison à travers la barre de mesure', () => {
        const L = S.layoutStaff(P('t,4/4,0;w:c4~ w:c4'));
        assert.equal(L.measures[0].pieces[0].tieNext, true);
        assert.equal(L.measures[1].pieces[0].tieFromPrev, true);
        assert.equal(L.measures[1].pieces[0].cont, false);
    });
    test('une note coupée par la barre est une suite (cont), liée aussi à la note suivante si elle est liée', () => {
        const L = S.layoutStaff(P('t,4/4,0;q:c4 q:c4 q:c4 h:d4~ h:d4'));
        const all = L.measures.flatMap(m => m.pieces);
        assert.deepEqual(all.map(x => [x.ev, x.tieNext, x.tieFromPrev, x.cont]),
            [[0, false, false, false], [1, false, false, false], [2, false, false, false], [3, true, false, false], [3, true, true, true], [4, false, true, false]]);
    });
    test('lecture : deux notes liées ne sont jouées qu’une fois, pour leur durée cumulée', () => {
        const plan = S.playbackPlan(P('t,4/4,0;q:c4~ q:c4~ h:c4'));
        assert.deepEqual(plan.map(x => [x.at, x.len, x.midi]), [[0, 4, 60]]);
        const p2 = S.playbackPlan(P('t,4/4,0;q:c4~ q:c4 q:d4 q:d4'));
        assert.deepEqual(p2.map(x => [x.at, x.len, x.midi]), [[0, 2, 60], [2, 1, 62], [3, 1, 62]]);
    });
    test('lecture : sans liaison, deux notes de même hauteur sont rejouées', () => {
        assert.equal(S.playbackPlan(P('t,4/4,0;q:c4 q:c4')).length, 2);
    });
    test('changer la hauteur d’une note liée change toute la chaîne', () => {
        const st = P('t,4/4,0;q:c4~ q:c4~ q:c4 q:e4');
        assert.equal(S.formatStaff(S.shiftEvent(st, 1, 1)), 't,4/4,0;q:d4~ q:d4~ q:d4 q:e4');
        assert.equal(S.formatStaff(S.alterEvent(st, 2, 1)), 't,4/4,0;q:c#4~ q:c#4~ q:c#4 q:e4');
        assert.equal(S.formatStaff(S.updateEvent(st, 0, { p: { l: 'g', o: 4, a: 0 } })), 't,4/4,0;q:g4~ q:g4~ q:g4 q:e4');
    });
    test('insérer une note entre deux notes liées, supprimer l’une d’elles : la liaison disparaît', () => {
        const st = P('t,4/4,0;q:c4~ q:c4 q:e4');
        assert.equal(S.formatStaff(S.insertEvent(st, 1, { d: 'q', dot: false, p: { l: 'c', o: 4, a: 0 } })), 't,4/4,0;q:c4 q:c4 q:c4 q:e4');
        assert.equal(S.formatStaff(S.removeEvent(st, 1)), 't,4/4,0;q:c4 q:e4');
        assert.equal(S.formatStaff(S.updateEvent(st, 1, { p: null })), 't,4/4,0;q:c4 qr q:e4');
    });
    test('staffToggleTies : pose, puis retire, les liaisons possibles (même hauteur que la note suivante)', () => {
        const st = P('t,4/4,0;q:c4 q:c4 q:c4 q:d4');
        const a = S.staffToggleTies(st, [0, 1]);
        assert.equal(S.formatStaff(a.staff), 't,4/4,0;q:c4~ q:c4~ q:c4 q:d4');
        assert.equal(a.candidates, 2);
        const b = S.staffToggleTies(a.staff, [0, 1]);
        assert.equal(S.formatStaff(b.staff), 't,4/4,0;q:c4 q:c4 q:c4 q:d4');
        const none = S.staffToggleTies(st, [2]);
        assert.equal(none.candidates, 0, 'la suivante est une autre hauteur');
        assert.equal(S.staffToggleTies(st, [3]).candidates, 0, 'dernière note');
    });
    test('staffAddTiedNote : prolonge la dernière note d’une note liée de même hauteur', () => {
        const st = P('t,4/4,0;q:c4 h.:e4');
        assert.equal(S.formatStaff(S.staffAddTiedNote(st, 1)), 't,4/4,0;q:c4 h.:e4~ h.:e4');
        assert.equal(S.staffAddTiedNote(st, 0), null, 'pas la dernière note');
    });
    test('liaison conservée en transformant une note en tuplet', () => {
        const st = P('t,4/4,0;q:c4~ q:c4');
        assert.equal(S.formatStaff(S.staffMakeTuplet(st, 0, 3)), 't,4/4,0;(3 8:c4 8:c4 8:c4~) q:c4');
    });
});

describe('sélection multiple : opérations de groupe', () => {
    test('shiftEvents : déplace toutes les notes choisies, laisse les silences ; rien ne bouge si l’une sort de la plage', () => {
        const st = P('t,4/4,0;q:c4 qr q:e4 q:g4');
        assert.equal(S.formatStaff(S.shiftEvents(st, [0, 1, 2], 1)), 't,4/4,0;q:d4 qr q:f4 q:g4');
        assert.equal(S.formatStaff(S.shiftEvents(st, [0, 2], -7)), 't,4/4,0;q:c3 qr q:e3 q:g4');
        const edge = P('t,4/4,0;q:c1 q:c4');
        assert.equal(S.formatStaff(S.shiftEvents(edge, [0, 1], -1)), 't,4/4,0;q:c1 q:c4', 'Do1 ne peut pas descendre : le groupe reste en place');
    });
    test('shiftEvents / alterEvents : une note liée entraîne celles qui lui sont liées', () => {
        const st = P('t,4/4,0;q:c4~ q:c4 q:e4');
        assert.equal(S.formatStaff(S.shiftEvents(st, [0], 2)), 't,4/4,0;q:e4~ q:e4 q:e4');
        assert.equal(S.formatStaff(S.alterEvents(st, [1], -1)), 't,4/4,0;q:cb4~ q:cb4 q:e4');
    });
    test('alterEvents : dièse, bémol, bécarre sur tout le groupe', () => {
        const st = P('t,4/4,0;q:c4 q:d4 qr q:f4');
        assert.equal(S.formatStaff(S.alterEvents(st, [0, 1, 2, 3], 1)), 't,4/4,0;q:c#4 q:d#4 qr q:f#4');
        assert.equal(S.formatStaff(S.alterEvents(S.alterEvents(st, [0, 1], 1), [0, 1], null)), 't,4/4,0;q:c4 q:d4 qr q:f4');
    });
    test('removeEvents : supprime le groupe ; indices fantaisistes ignorés ; la levée suit', () => {
        const st = P('t,4/4,0;q:c4 q:d4 q:e4 q:f4 q:g4');
        assert.equal(S.formatStaff(S.removeEvents(st, [1, 3, 9, -1])), 't,4/4,0;q:c4 q:e4 q:g4');
        const pk = S.staffSetPickup(P('t,4/4,0;q:c4 q:d4 q:e4 q:f4 q:g4'), 2);
        const out = S.removeEvents(pk, [0, 3]);
        assert.equal(S.formatStaff(out), 't,4/4,0,pu1;q:d4 q:e4 q:g4');
    });
    test('removeEvents : une note de tuplet devient un silence ; le groupe de silences choisi en entier disparaît', () => {
        const st = P('t,4/4,0;(3 8:c4 8:d4 8:e4) q:f4');
        assert.equal(S.formatStaff(S.removeEvents(st, [0, 1])), 't,4/4,0;(3 8r 8r 8:e4) q:f4');
        assert.equal(S.formatStaff(S.removeEvents(st, [0, 1, 2])), 't,4/4,0;q:f4');
        const half = S.removeEvents(st, [0, 1]);
        assert.equal(S.formatStaff(S.removeEvents(half, [0])), 't,4/4,0;(3 8r 8r 8:e4) q:f4', 'tant qu’une note reste dans le groupe, il reste');
    });
    test('removeEvents : la liaison de la note d’avant disparaît', () => {
        const st = P('t,4/4,0;q:c4~ q:c4 q:e4');
        assert.equal(S.formatStaff(S.removeEvents(st, [1])), 't,4/4,0;q:c4 q:e4');
    });
    test('copier / coller : durées, silences et liaisons suivent ; la dernière liaison ne dépasse pas', () => {
        const st = P('t,4/4,0;q:c4~ q:c4 qr q:g4~ q:g4');
        const clip = S.staffExtractEvents(st, [0, 1, 3]);
        assert.equal(clip.length, 3);
        assert.deepEqual(clip.map(e => e.tie), [true, false, false], 'q:g4 est copiée sans sa suite : plus de liaison');
        const out = S.staffInsertEvents(P('t,4/4,0;h:a4 h:b4'), 1, clip);
        assert.equal(S.formatStaff(out), 't,4/4,0;h:a4 q:c4~ q:c4 q:g4 h:b4');
    });
    test('coller : un tuplet est collé en entier, sans se fondre avec le groupe voisin', () => {
        const src = P('t,4/4,0;(3 8:c4 8:d4 8:e4) q:f4');
        const clip = S.staffExtractEvents(src, [1]);
        assert.equal(clip.length, 3, 'un seul membre choisi : tout le tuplet est copié');
        const out = S.staffInsertEvents(P('t,4/4,0;(3 8:a4 8:b4 8:c5) q:d5'), 3, clip);
        assert.equal(S.formatStaff(out), 't,4/4,0;(3 8:a4 8:b4 8:c5) (3 8:c4 8:d4 8:e4) q:d5');
        const before = S.staffInsertEvents(P('t,4/4,0;(3 8:a4 8:b4 8:c5) q:d5'), 0, clip);
        assert.equal(S.formatStaff(before), 't,4/4,0;(3 8:c4 8:d4 8:e4) (3 8:a4 8:b4 8:c5) q:d5');
    });
    test('coller au milieu d’un tuplet : ramené à la frontière du groupe', () => {
        const out = S.staffInsertEvents(P('t,4/4,0;(3 8:a4 8:b4 8:c5) q:d5'), 1, [{ d: 'q', dot: false, tu: 0, gs: false, tie: false, p: { l: 'c', o: 4, a: 0 } }]);
        assert.equal(S.formatStaff(out), 't,4/4,0;(3 8:a4 8:b4 8:c5) q:c4 q:d5');
    });
    test('coller dans une portée pleine : refusé', () => {
        const full = S.parseStaff('t,4/4,0;' + new Array(96).fill('16:c4').join(' '));
        assert.ok(full);
        assert.equal(S.staffInsertEvents(full, 0, [{ d: 'q', dot: false, tu: 0, gs: false, tie: false, p: null }]), null);
    });
    test('staffHasTie', () => {
        const st = P('t,4/4,0;q:c4~ q:c4 q:e4');
        assert.equal(S.staffHasTie(st, [0]), true);
        assert.equal(S.staffHasTie(st, [1, 2]), false);
    });
});

describe('instrument propre à la portée', () => {
    test('en-tête : inC, inBb, inEb ; forme canonique (tempo, swing, instrument)', () => {
        const st = P('t,4/4,0,inBb,sw67,bpm132;q:c4');
        assert.equal(st.instr, 'Bb');
        assert.equal(S.formatStaff(st), 't,4/4,0,bpm132,sw67,inBb;q:c4');
        assert.equal(S.formatStaff(P('t,4/4,0,inC;q:c4')), 't,4/4,0,inC;q:c4');   // « en Ut » explicite se garde
    });
    test('une portée écrite sans instrument suit la jam (instr vide) ; valeur inconnue ou répétée refusée', () => {
        assert.equal(P('t,4/4,0;q:c4').instr, '');
        assert.equal(S.formatStaff(P('t,4/4,0;q:c4')), 't,4/4,0;q:c4');
        assert.equal(P('t,4/4,0,inF;q:c4'), null);
        assert.equal(P('t,4/4,0,inBb,inEb;q:c4'), null);
    });
    test('setStaffInstr et copie', () => {
        const st = P('t,4/4,0;q:c4');
        const b = S.setStaffInstr(st, 'Eb');
        assert.equal(b.instr, 'Eb'); assert.equal(st.instr, '');
        assert.equal(S.cloneStaff(b).instr, 'Eb');
        assert.equal(S.setStaffInstr(b, 'zz').instr, '');
        assert.equal(S.staffDefault().instr, '');
    });
    test('toutes les valeurs au maximum : l\'en-tête à 8 champs reste lisible', () => {
        assert.ok(P('t,4/4,0,150,pu1,bpm96,sw67,inBb;q:c4 q:d4'));
    });
});

describe('plan de lecture : indice de la note jouée', () => {
    test('chaque entrée garde l’indice de son événement ; une note liée garde celui de la première', () => {
        const plan = S.playbackPlan(P('t,4/4,0;q:c4~ q:c4 qr q:e4'));
        assert.deepEqual(plan.map(n => n.ev), [0, 2, 3]);
        assert.deepEqual(plan.map(n => n.midi === null), [false, true, false]);
    });
});
