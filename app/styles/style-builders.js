// styles/style-builders.js — un générateur de grille par style musical (valse jazz, blues, bossa, tango…).
// Chaque entrée de STYLE_BUILDERS reçoit la boîte à outils de styles/toolkit.js et renvoie le modèle du style :
// une liste d'accords { r, c, m, s, section, phrase, function }. Sans DOM, sans état : testable seul.
// Chargé par index.html via <script src="styles/style-builders.js"> (après styles/toolkit.js) et testé par styles/style-builders.test.js.

// Sous Node, la boîte à outils se charge ; en navigateur c'est un global (styles/toolkit.js).
if (typeof makeStyleToolkit === 'undefined' && typeof require === 'function') {
    var { makeStyleToolkit } = require('./toolkit.js');
}

const STYLE_BUILDERS = {
    // ============ 3/4 ============
    valsejazz: (t) => {
        const { libOK, R, pick, join, cells, absCell, JBR, jbr } = t;
        let template = [];
        // Valse jazz : AABA de 32 mesures en 3/4, ii-V-I majeurs ou mineurs (le mineur n'apparaît qu'en renouvellement)
        const minor = !!(R && libOK && R() < 0.35);
        const NA = [[['m7',0,2],['hd',2,1],['alt',7,1]], [['m7',0,1],['m7',5,1],['hd',2,1],['alt',7,1]], [['m7',0,1],['maj7',8,1],['hd',2,1],['alt',7,1]], [['m7',0,1],['D',10,1],['maj7',3,1],['alt',7,1]]];
        const makeA = (sec) => minor
            ? join(cells(pick(NA), sec, 'A1'), cells(pick(NA.slice(1)), sec, 'A2'))
            : join(absCell(pick(['T0','T1','T3','T4','T5']), sec, 'A1'), absCell(pick(['T1','T0','T3']), sec, 'A2'));
        const A1 = makeA('A');
        const A2 = A1.map(x => ({...x, section:'A2', phrase:x.phrase.replace('A','A2')}));
        // Pont : en mineur, soit une marche diatonique, soit une modulation au relatif majeur (bIII) ; en majeur, rhythm changes ou pont modulant
        const MB = [[['maj7',8,2],['D',10,2],['maj7',3,2],['hd',2,1],['alt',7,1]], [['maj7',8,2],['m7',5,2],['hd',2,2],['alt',7,2]]];
        const B = minor
            ? (() => { const spec = pick(MB); const it = cells(spec, 'B', 'B1'); if (spec === MB[0]) [3,3,3,0,0].forEach((k, ix) => { it[ix].kc = k; }); return it; })()
            : jbr(pick(JBR), 'B');
        const A3src = (R && libOK && R() >= 0.7) ? makeA('A') : A1;
        const A3 = A3src.map(x => ({...x, section:'A3', phrase:x.phrase.replace(/^A[12]?/,'A3')}));
        template = join(A1, A2, B, A3);
        return template;
    },
    valsemusette: (t) => {
        const { pick, join, cells, okAfter, twinOf } = t;
        let template = [];
        // Valse musette : A en mineur (16 mesures : 8 + sa reprise), B en relatif majeur puis retour au mineur
        const MA = { a:[['m',0],['md',5],['Dm',7],['m',0]], b:[['m',0],['Dm',7],['m',0],['Dm',7]], c:[['m',0],['L',8],['hd',2],['Dm',7]], d:[['m',0],['md',5],['hd',2],['Dm',7]], e:[['md',5],['Dm',7],['m',0],['m',0]] };
        const RB = { a:[['M',3],['D',10],['M',3],['M',3]], b:[['M',3],['L',8],['D',10],['M',3]], c:[['M',3],['L',8],['M',3],['D',10]] };
        const fc = pick([MA.c, MA.d, MA.b, MA.a]);
        const A = join(cells(fc,'A','A1'), cells(pick(okAfter(fc, [MA.a, MA.e])),'A','A2'));
        const A2 = twinOf(A, 'A2');
        const rbc = pick([RB.b, RB.a, RB.c]);
        const B1 = join(cells(rbc,'B','B1'), cells(pick(okAfter(rbc, [RB.a, RB.b])),'B','B2'));
        const B2 = join(cells(MA.a,'B2','B21'), cells(pick([[['md',5],['Dm',7],['m',0],['m',0]], [['hd',2],['Dm',7],['m',0],['m',0]]]),'B2','B22'));
        template = join(A, A2, B1, B2);
        return template;
    },
    valseviennoise: (t) => {
        const { pick, join, cells, withTwin } = t;
        let template = [];
        // Valse viennoise : A (8, reprise) sur tonique / dominante, trio (8, reprise) dans la tonalité de la dominante
        const W = { a:[['M',0],['M',0],['D',7],['M',0]], b:[['M',0],['D',7],['D',7],['M',0]], c:[['M',0],['L',5],['D',7],['M',0]], d:[['M',0],['m',9],['L',5],['D',7]] };
        const DB = { a:[['M',7],['M',7],['D',2],['M',7]], b:[['M',7],['L',0],['D',2],['M',7]], c:[['M',7],['D',2],['M',7],['D',2]] };
        const A = join(cells(pick([W.a, W.c, W.b, W.d]),'A','A1'), cells(pick([W.a, W.c]),'A','A2'));
        const B = join(cells(pick([DB.a, DB.b, DB.c]),'B','B1'), cells(pick([DB.a, DB.b]),'B','B2'));
        template = withTwin(A, 'A2', B, 'B2');
        return template;
    },
    menuet: (t) => {
        const { pick, join, cadence, cells, okAfter, withTwin } = t;
        let template = [];
        // Menuet : forme binaire 8 + 8 avec reprises ; demi-cadence au milieu de chaque partie, cadence parfaite à la fin
        const ANT = [[['M',0],['L',5],['M',0],['D',7]], [['M',0],['M',0],['m',9],['D',7]], [['M',0],['md',2],['M',0],['D',7]]];
        const CON = [[['M',0],['L',5],['D',7],['M',0]], [['M',0],['md',2],['D',7],['M',0]], [['m',9],['md',2],['D',7],['M',0]]];
        const A = join(cells(pick(ANT),'A','A1'), cells(pick(CON),'A','A2'));
        const BA = [[['M',7],['M',0],['L',5],['D',7]], [['m',9],['md',2],['D',7],['D',7]], [['M',7],['M',7],['M',0],['D',7]]];
        const BB = [[['M',0],['L',5],['D',7],['M',0]], [['M',0],['md',2],['D',7],['M',0]], [['m',9],['md',2],['D',7],['M',0]]];
        const ba = pick(BA);
        const B = join(cells(ba,'B','B1'), cells(pick(okAfter(ba, BB)),'B','B2'));
        template = withTwin(A, 'A2', B, 'B2');
        return template;
    },
    valsecountry: (t) => {
        const { pick, join, cells } = t;
        let template = [];
        // Valse country : couplet (8) puis refrain (8), I-IV-V, fin sur la tonique
        const V1 = [[['M',0],['M',0],['L',5],['L',5]], [['M',0],['L',5],['M',0],['L',5]], [['M',0],['M',0],['M',0],['D',7]]];
        const V2 = [[['M',0],['D',7],['M',0],['M',0]], [['M',0],['L',5],['D',7],['M',0]], [['M',0],['D',7],['D',7],['M',0]]];
        const C1 = [[['L',5],['L',5],['M',0],['M',0]], [['L',5],['M',0],['L',5],['M',0]], [['L',5],['D',7],['M',0],['M',0]]];
        const C2 = [[['D',7],['D',7],['M',0],['M',0]], [['D',7],['M',0],['D',7],['M',0]], [['D',7],['M',0],['M',0],['M',0]]];
        template = join(cells(pick(V1),'A','A1'), cells(pick(V2),'A','A2'), cells(pick(C1),'B','B1'), cells(pick(C2),'B','B2'));
        return template;
    },
    // ============ 6/8 ============
    jig: (t) => {
        const { libOK, R, pick, join, cells, okAfter, withTwin } = t;
        let template = [];
        // Jig irlandaise : 32 mesures, A (8) et B (8) chacune reprise ; mode majeur ou dorien (le dorien en renouvellement)
        const dor = !!(R && libOK && R() < 0.3);
        const T = dor ? 'md' : 'M';
        const A1c = dor ? [[[T,0],['M',10],['L',5],[T,0]], [[T,0],[T,0],['M',10],[T,0]], [[T,0],['M',3],['M',10],[T,0]]]
                        : [[['M',0],['L',5],['M',0],['D',7]], [['M',0],['M',0],['L',5],['D',7]], [['M',0],['M',10],['L',5],['M',0]], [['M',0],['M',10],['M',0],['M',10]]];
        const A2c = dor ? [[[T,0],['M',10],['L',5],[T,0]], [['M',3],['M',10],[T,0],[T,0]]]
                        : [[['M',0],['L',5],['D',7],['M',0]], [['M',0],['M',10],['L',5],['M',0]], [['L',5],['D',7],['M',0],['M',0]]];
        const B1c = dor ? [[['M',3],['M',10],[T,0],[T,0]], [['L',5],['M',10],[T,0],['M',10]]]
                        : [[['L',5],['M',0],['L',5],['D',7]], [['m',9],['L',5],['M',0],['D',7]], [['M',10],['L',5],['M',0],['M',10]]];
        const B2c = dor ? [[[T,0],['M',10],['L',5],[T,0]], [['M',3],['M',10],[T,0],[T,0]]]
                        : [[['M',0],['L',5],['D',7],['M',0]], [['M',0],['M',10],['L',5],['M',0]], [['L',5],['D',7],['M',0],['M',0]]];
        const a1 = pick(A1c), b1 = pick(B1c);
        const a2 = pick(okAfter(a1, A2c));
        const A = join(cells(a1,'A','A1'), cells(a2,'A','A2'));
        const B = join(cells(b1,'B','B1'), cells(pick(okAfter(b1, B2c)),'B','B2'));
        template = withTwin(A, 'A2', B, 'B2');
        return template;
    },
    afro68: (t) => {
        const { R, pick, join, cadence, cells, okAfter } = t;
        let template = [];
        // Afro-cubain (son / guajira / rumba, mesure ternaire) : le plus souvent en mineur, avec la cadence andalouse
        // i - ♭VII - ♭VI - V7(♭9), les vamps i - V7 et i - iv - V7 ; plus rarement en majeur (son montuno
        // I - IV - V7 - IV, I - VI7 - ii - V7). Toujours 4 phrases de 4 mesures, un accord par mesure ou par deux mesures.
        const major = !!(R && R() < 0.3);
        let A, B1, B2;
        if (!major) {
            A  = [ [['m7a',0],['M',10],['maj7',8],['D9b',7]],              // cadence andalouse
                   [['m7a',0,2],['D9b',7,1],['m7a',0,1]],                  // vamp i - V7 - i
                   [['m7a',0],['m7',5],['D9b',7],['m7a',0]],               // i - iv - V7 - i
                   [['m7a',0,2],['m7',5,1],['D9b',7,1]],
                   [['m7a',0],['maj7',8],['M',10],['D9b',7]] ];
            B1 = [ [['m7',5,2],['D9b',7,2]],                               // iv - V7
                   [['maj7',8],['D9b',7],['m7a',0,2]],                     // ♭VI - V7 - i (cadence rompue puis retour)
                   [['m7a',0],['D',2],['D9b',7,2]],                        // i - V7/V - V7
                   [['maj7',3,2],['D',2],['D9b',7]] ];                     // relatif majeur, V7/V puis V7
            B2 = [ [['m7a',0,2],['m7',5,1],['D9b',7,1]],
                   [['m7a',0],['M',10],['maj7',8],['D9b',7]],
                   [['m7a',0],['m7',5],['m7a',0],['D9b',7]],
                   [['m7a',0,2],['maj7',8,1],['D9b',7,1]] ];
        } else {
            A  = [ [['M',0],['M',5],['D',7],['M',5]],                      // I - IV - V7 - IV (son montuno)
                   [['M',0,2],['M',5],['D',7]],
                   [['M',0],['D',9],['m7',2],['D',7]],                     // I - VI7 - ii - V7
                   [['M',0],['M',5],['M',0],['D',7]] ];
            B1 = [ [['M',5,2],['D',7,2]],
                   [['M',0],['D',9],['m7',2],['D',7]],
                   [['M',5],['M',0],['D',2],['D',7]],                      // IV - I - V7/V - V7
                   [['m7',2],['D',7],['M',0,2]] ];
            B2 = [ [['M',0,2],['M',5],['D',7]],
                   [['M',0],['M',5],['M',0],['D',7]],
                   [['M',0],['m7',2],['D',7,2]] ];
        }
        const a1 = pick(A);
        const a2opts = okAfter(a1, A).filter(o => o !== a1);
        const a2 = pick(a2opts.length ? a2opts : A);
        const b1 = pick(okAfter(a2, B1));
        template = join(
            cells(a1,'A','A1'),
            cells(a2,'A','A2'),
            cells(b1,'B','B1'),
            cells(pick(okAfter(b1, B2)),'B','B2')
        );
        return template;
    },
    barcarolle: (t) => {
        const { pick, join, cells } = t;
        let template = [];
        // Barcarolle : majeur, balancement tonique / dominante ; A (8) puis B (8)
        const BC1 = [[['M',0],['D',7],['M',0],['D',7]], [['M',0],['M',0],['D',7],['M',0]], [['M',0],['L',5],['M',0],['D',7]]];
        const BC2 = [[['M',0],['L',5],['D',7],['M',0]], [['M',0],['md',2],['D',7],['M',0]], [['M',0],['m',9],['D',7],['M',0]]];
        const BB1 = [[['m',9],['m',9],['md',2],['D',7]], [['L',5],['L',5],['D',7],['D',7]], [['m',9],['D',4],['m',9],['D',7]]];
        const BB2 = [[['M',0],['L',5],['D',7],['M',0]], [['M',0],['md',2],['D',7],['M',0]]];
        template = join(cells(pick(BC1),'A','A1'), cells(pick(BC2),'A','A2'), cells(pick(BB1),'B','B1'), cells(pick(BB2),'B','B2'));
        return template;
    },
    tarentelle: (t) => {
        const { pick, join, cadence, cells, twinOf } = t;
        let template = [];
        // Tarentelle : mineur, très répétitive ; refrain (4, repris), passage en relatif majeur, cadence finale ; 16 mesures
        const TA = [[['m',0],['m',0],['Dm',7],['m',0]], [['m',0],['Dm',7],['m',0],['m',0]], [['m',0],['md',5],['Dm',7],['m',0]]];
        const TB = [[['M',3],['D',10],['M',3],['Dm',7]], [['M',3],['M',3],['D',10],['M',3]]];
        const TC = [[['m',0],['md',5],['Dm',7],['m',0]], [['m',0],['m',0],['Dm',7],['m',0]]];
        const A = cells(pick(TA),'A','A1');
        template = join(A, twinOf(A,'A2'), cells(pick(TB),'B','B1'), cells(pick(TC),'C','C1'));
        return template;
    },
    // ============ 9/8 ============
    slipjig: (t) => {
        const { pick, cells, okAfter, withTwin } = t;
        let template = [];
        // Slip jig : 16 mesures, deux phrases de 4 mesures chacune reprise
        const SA = [[['M',0],['L',5],['M',0],['D',7]], [['M',0],['M',0],['L',5],['D',7]], [['M',0],['M',10],['L',5],['M',0]], [['M',0],['M',10],['M',0],['M',10]]];
        const SB = [[['L',5],['D',7],['M',0],['M',0]], [['M',0],['M',10],['L',5],['M',0]], [['M',0],['L',5],['D',7],['M',0]]];
        const sa = pick(SA);
        template = withTwin(cells(sa,'A','A1'), 'A2', cells(pick(okAfter(sa, SB)),'B','B1'), 'B2');
        return template;
    },
    // ============ 12/8 (le blues lent et la ballade ternaire réutilisent les générateurs blues et ballad) ============
    gospel: (t) => {
        const { pick, join, cadence, cells, okAfter, twinOf } = t;
        let template = [];
        // Gospel / doo-wop : I-vi-IV-V repris, cadence plagale, final IV-V-I ; 16 mesures
        const GD = [[['maj7i',0],['m7a',9],['maj7',5],['D',7]], [['maj7i',0],['m7a',9],['m7',2],['D',7]], [['maj7i',0],['maj7',5],['maj7i',0],['D',7]], [['maj7i',0],['maj7i',0],['maj7',5],['D',7]]];
        const GB = [[['maj7',5],['maj7i',0],['maj7',5],['maj7i',0]], [['maj7',5],['maj7',5],['maj7i',0],['maj7i',0]], [['maj7',5],['m7',5],['maj7i',0],['maj7i',0]], [['maj7i',0],['maj7',5],['maj7i',0],['maj7',5]]];
        const GC = [[['maj7',5],['D',7],['maj7i',0],['maj7i',0]], [['maj7',5],['m7',5],['maj7i',0],['maj7i',0]], [['m7',2],['D',7],['maj7i',0],['maj7i',0]]];
        const gd = pick(GD);
        const A = cells(gd,'A','A1');
        template = join(A, twinOf(A,'A2'), cells(pick(okAfter(gd, GB)),'B','B1'), cells(pick(GC),'C','C1'));
        return template;
    },
    'ii-v-i': (t) => {
        const { keyRoot, pick, chord, abs, cadence } = t;
        let template = [];
        // Quatre cadences, toutes résolues sur la tonique : ii-V-I, ii-♭II7-I (triton), iv-♭VII7-I (backdoor), double ii-V-I.
        const opt = pick(['a', 'c', 'd', 'e']);
        if (opt === 'a') template = cadence('A','A1');
        else if (opt === 'c') template = [chord('ii',1,'A','A1','predominant'), abs(1,'7',1,'lydianDominant','A','A1','dominant'), chord('I',2,'A','A1','tonic')];
        else if (opt === 'd') template = [abs(5,'m7',1,'dorian','A','A1','predominant'), abs(10,'7',1,'mixolydian','A','A1','dominant'), chord('I',2,'A','A1','tonic')];
        else template = [
            { ...chord('ii',1,'A','A1','predominant'), split: { r:(keyRoot+7)%12, c:'7', s:'mixolydian' } }, chord('I',1,'A','A1','tonic'),
            { ...chord('ii',1,'A','A1','predominant'), split: { r:(keyRoot+7)%12, c:'7', s:'mixolydian' } }, chord('I',1,'A','A1','tonic')
        ];
        return template;
    },
    anatole: (t) => {
        const { pick, join, turnCell } = t;
        let template = [];
        // 8 mesures : A A', deux turnarounds différents.
        const p1 = pick(['T0','T1','T3','T4','T5']);
        let p2 = pick(['T1','T0','T3','T4','T5']);
        if (p2 === p1) p2 = p1 === 'T1' ? 'T0' : 'T1';
        template = join(turnCell(p1,'A','A1'), turnCell(p2,'A2','A2'));
        return template;
    },
    'i-got-rythm': (t) => {
        const { keyRoot, join } = t;
        let template = [];
        // Grille exactement issue du fichier « I got rythm.json » :
        // tonalité d'origine Bb, 32 mesures, AABA.
        // Les offsets ci-dessous sont relatifs à la tonique sélectionnée ;
        // en Bb ils produisent exactement les rootIndex du fichier JSON.
        const mk = (off, c, s, section, phrase, fn, split=null, bassOff=null) => {
            const item = {
                r:(keyRoot + off + 12) % 12,
                c,
                m:1,
                s,
                section,
                phrase,
                function:fn
            };
            if (bassOff !== null) item.bassRootIndex = (keyRoot + bassOff + 12) % 12;
            if (split) {
                item.split = {
                    r:(keyRoot + split.off + 12) % 12,
                    c:split.c,
                    s:split.s
                };
            }
            return item;
        };

        const A = [
            mk(0, 'majTriad', 'ionian', 'A', 'A1', 'tonic',
                {off:9, c:'7', s:'mixolydian'}),
            mk(2, 'm7', 'dorian', 'A', 'A1', 'predominant',
                {off:7, c:'7', s:'mixolydian'}),
            mk(0, 'majTriad', 'ionian', 'A', 'A1', 'tonic',
                {off:9, c:'7', s:'mixolydian'}),
            mk(2, 'm7', 'dorian', 'A', 'A1', 'predominant',
                {off:7, c:'7', s:'mixolydian'}),
            mk(0, 'majTriad', 'ionian', 'A', 'A2', 'tonic',
                {off:0, c:'7', s:'mixolydian'}),
            mk(5, 'majTriad', 'ionian', 'A', 'A2', 'predominant',
                {off:6, c:'dim7', s:'wholeHalfDim'}),
            mk(0, 'majTriad', 'ionian', 'A', 'A2', 'tonic',
                {off:7, c:'7', s:'mixolydian'}, 7),
            mk(0, 'majTriad', 'ionian', 'A', 'A2', 'tonic')
        ];

        const B = [
            mk(4, '7', 'mixolydian', 'B', 'B1', 'dominant'),
            mk(4, '7', 'mixolydian', 'B', 'B1', 'dominant'),
            mk(9, '7', 'mixolydian', 'B', 'B1', 'dominant'),
            mk(9, '7', 'mixolydian', 'B', 'B1', 'dominant'),
            mk(2, '7', 'mixolydian', 'B', 'B2', 'dominant'),
            mk(2, '7', 'mixolydian', 'B', 'B2', 'dominant'),
            mk(7, '7', 'mixolydian', 'B', 'B2', 'dominant'),
            mk(7, '7', 'mixolydian', 'B', 'B2', 'dominant')
        ];

        const A3 = A.map(item => ({
            ...item,
            section:'A3',
            phrase:item.phrase === 'A1' ? 'A31' : 'A32',
            split:item.split ? { ...item.split } : undefined
        }));

        template = join(A, B, A3);
        return template;
    },
    blues: (t) => {
        const { keyRoot, pick, abs } = t;
        let template = [];
        // Blues de 12 mesures : forme de base, quick change, blues jazz, blues mineur, blues avec ii-V final.
        const K = keyRoot;
        const F1 = () => [
            abs(0,'7',4,'mixolydian','A','A1','tonic'),
            abs(5,'7',2,'mixolydian','B','B1','predominant'),
            abs(0,'7',2,'mixolydian','B','B1','tonic'),
            abs(7,'7',1,'mixolydian','C','C1','dominant'),
            abs(5,'7',1,'mixolydian','C','C1','predominant'),
            abs(0,'7',1,'mixolydian','C','C1','tonic'),
            abs(7,'7',1,'mixolydian','C','C1','dominant')
        ];
        const F2 = () => [
            abs(0,'7',1,'mixolydian','A','A1','tonic'), abs(5,'7',1,'mixolydian','A','A1','predominant'), abs(0,'7',2,'mixolydian','A','A1','tonic'),
            abs(5,'7',2,'mixolydian','B','B1','predominant'), abs(0,'7',2,'mixolydian','B','B1','tonic'),
            abs(7,'7',1,'mixolydian','C','C1','dominant'), abs(5,'7',1,'mixolydian','C','C1','predominant'), abs(0,'7',1,'mixolydian','C','C1','tonic'), abs(7,'7',1,'mixolydian','C','C1','dominant')
        ];
        const F3 = () => [
            abs(0,'7',1,'mixolydian','A','A1','tonic'), abs(5,'7',1,'mixolydian','A','A1','predominant'), abs(0,'7',1,'mixolydian','A','A1','tonic'),
            { ...abs(7,'m7',1,'dorian','A','A1','predominant'), split: { r:(K+0)%12, c:'7', s:'mixolydian' } },
            abs(5,'7',1,'mixolydian','B','B1','predominant'), abs(6,'dim7',1,'wholeHalfDim','B','B1','color'),
            { ...abs(0,'7',1,'mixolydian','B','B1','tonic'), bassRootIndex:(K+7)%12 }, abs(9,'7',1,'mixolydian','B','B1','color'),
            abs(2,'m7',1,'dorian','C','C1','predominant'), abs(7,'7',1,'mixolydian','C','C1','dominant'),
            { ...abs(0,'7',1,'mixolydian','C','C1','tonic'), split: { r:(K+9)%12, c:'7', s:'mixolydian' } },
            { ...abs(2,'m7',1,'dorian','C','C1','predominant'), split: { r:(K+7)%12, c:'7', s:'mixolydian' } }
        ];
        const F4 = () => [
            abs(0,'m7',4,'dorian','A','A1','tonic'),
            abs(5,'m7',2,'dorian','B','B1','predominant'), abs(0,'m7',2,'dorian','B','B1','tonic'),
            abs(8,'7',1,'lydianDominant','C','C1','predominant'), abs(7,'7alt',1,'altered','C','C1','dominant'),
            abs(0,'m7',1,'dorian','C','C1','tonic'), abs(7,'7alt',1,'altered','C','C1','dominant')
        ];
        const F5 = () => [
            abs(0,'7',4,'mixolydian','A','A1','tonic'),
            abs(5,'7',2,'mixolydian','B','B1','predominant'), abs(0,'7',2,'mixolydian','B','B1','tonic'),
            abs(2,'m7',1,'dorian','C','C1','predominant'), abs(7,'7',1,'mixolydian','C','C1','dominant'),
            abs(0,'7',1,'mixolydian','C','C1','tonic'), abs(7,'7',1,'mixolydian','C','C1','dominant')
        ];
        template = pick([F1, F2, F3, F4, F5])();
        return template;
    },
    bebop: (t) => {
        const { keyRoot, libOK, R, pick, chordJazz, abs, join } = t;
        let template = [];
        // BeBop : 32 mesures AABA à harmonie dense. Presque chaque mesure porte deux accords (ii-V enchaînés,
        // dominantes secondaires, diminués de passage, substitution de triton, « backdoor »), contrairement au
        // Swing où l'on garde un accord par mesure. Une mesure est une liste d'un ou deux accords :
        // ['d', degré, fonction[, basse]] (diatonique, suit le mode choisi) ou
        // ['a', décalage, accord, gamme, fonction[, basse]] (chromatique, décalage depuis la tonique).
        const bar = (t, sec, phr) => {
            if (t[0] === 'd') {
                const it = chordJazz(t[1], 1, sec, phr, t[2]);
                if (Number.isInteger(t[3])) it.bassRootIndex = (keyRoot + t[3]) % 12;
                return it;
            }
            const it = abs(t[1], t[2], 1, t[3], sec, phr, t[4]);
            if (Number.isInteger(t[5])) it.bassRootIndex = (keyRoot + t[5]) % 12;
            return it;
        };
        const phraseOf = (bars, sec, ph1, ph2) => bars.map((b, k) => {
            const phr = k < 4 ? ph1 : ph2;
            const first = bar(b[0], sec, phr);
            if (b.length === 1) return first;
            const second = bar(b[1], sec, phr);
            return { ...first, split: { r: second.r, c: second.c, s: second.s } };
        });
        const I = ['d', 'I', 'tonic'], II = ['d', 'ii', 'predominant'], III = ['d', 'iii', 'predominant'];
        const IV = ['d', 'IV', 'predominant'], V = ['d', 'V', 'dominant'], VI = ['d', 'vi', 'predominant'];
        const VI7b9 = ['a', 9, '7b9', 'halfWholeDim', 'secondaryDominant'];          // V7(b9)/ii
        const E7b9 = ['a', 4, '7b9', 'halfWholeDim', 'secondaryDominant'];           // V7(b9)/vi
        const V7alt = ['a', 7, '7alt', 'altered', 'dominant'];
        const I7 = ['a', 0, '7', 'mixolydian', 'secondaryDominant'];                 // V7/IV
        const IVm7 = ['a', 5, 'm7', 'dorian', 'predominant'];                        // iv mineur (emprunt)
        const bVII7 = ['a', 10, '7', 'mixolydian', 'dominant'];                      // backdoor
        const VIIo = ['a', 11, 'm7b5', 'locrianSharp2', 'predominant'];
        const D7 = ['a', 2, '7', 'mixolydian', 'secondaryDominant'];
        const dim = (off) => ['a', off, 'dim7', 'wholeHalfDim', 'color'];            // diminué de passage
        const bII7 = ['a', 1, '7', 'lydianDominant', 'dominant'];                    // substitut de triton de V7
        const ii_V = (off) => [['a', off, 'm7', 'dorian', 'predominant'], ['a', (off + 5) % 12, '7', 'mixolydian', 'dominant']];
        const PA = [
            // 1. turnarounds avec dominantes secondaires et chromatisme IV - iv
            [[I, VI7b9], [II, V], [III, VI7b9], [II, V7alt], [I, I7], [IV, IVm7], [III, VI7b9], [II, V]],
            // 2. ii-V chromatiques descendants (Am7 D7 - Gm7 C7), puis backdoor
            [[I], [VIIo, E7b9], [VI, D7], [['a', 7, 'm7', 'dorian', 'predominant'], ['a', 0, '7', 'mixolydian', 'secondaryDominant']], [IV], [IVm7, bVII7], [III, VI7b9], [II, V]],
            // 3. diminués de passage (I - #I°, iii - bIII°, IV - #IV°) et accord de quarte-sixte
            [[I, dim(1)], [II, V], [III, dim(3)], [II, V7alt], [I, I7], [IV, dim(6)], [['d', 'I', 'tonic', 7], VI7b9], [II, V]]
        ];
        const BR = [
            // 1. ii-V du IV, puis du bIII, retour par ii-V et substitution de triton
            [[['a', 7, 'm7', 'dorian', 'predominant'], ['a', 0, '7', 'mixolydian', 'secondaryDominant']], [IV], [IVm7, bVII7], [['a', 3, 'maj7', 'lydian', 'color']], [II, V], [III, VI7b9], [II, V], [II, bII7]],
            // 2. maj7 descendants par tons (C, Bb, Ab) avec leurs ii-V
            [[II, V], [I], ii_V(0), [['a', 10, 'maj7', 'lydian', 'color']], ii_V(10), [['a', 8, 'maj7', 'lydian', 'color']], [II, V], [II, bII7]],
            // 3. chaîne de ii-V descendant chromatiquement (Dm7 G7 - Dbm7 Gb7 - Cm7 F7 - Bm7 E7 - Bbm7 Eb7 - Am7 D7)
            [ii_V(2), ii_V(1), ii_V(0), ii_V(11), ii_V(10), ii_V(9), [II, V7alt], [II, bII7]]
        ];
        const a1 = pick(PA);
        const A1 = phraseOf(a1, 'A', 'A1', 'A2');
        const A2 = A1.map(x => ({...x, section:'A2', phrase:x.phrase.replace('A','A2')}));
        // Tonalité traversée à chaque mesure du pont (décalage de la tonique) : 1 = ii-V-I de IV puis de bIII ; 2 = ii-V-I de bVII puis de bVI
        const BRK = [[5,5,3,3,0,0,0,0], [0,0,10,10,8,8,0,0], [0,0,0,0,0,0,0,0]];
        const brSpec = pick(BR);
        const B = phraseOf(brSpec, 'B', 'B1', 'B2');
        B.forEach((x, ix) => { x.kc = BRK[BR.indexOf(brSpec)][ix]; });
        let a3 = a1;
        if (R && libOK && R() >= 0.5) a3 = pick(PA); // le dernier A peut changer de phrase
        const A3 = phraseOf(a3, 'A3', 'A3', 'A3');
        template = join(A1, A2, B, A3);
        return template;
    },
    swing: (t) => {
        const { libOK, R, pick, join, turnaround, turnCell, JBR, jbr } = t;
        let template = [];
        // 32 mesures AABA. Le matériau A repose sur un turnaround (I-vi-ii-V ou variante) ; B est une chaîne
        // de dominantes par quintes. Les deux premiers A sont identiques ; le dernier peut avoir sa propre fin.
        const q1 = pick(['T0','T1','T3','T4','T5']);
        const q2 = pick(['T1','T0','T3']);
        const A1 = join(turnCell(q1,'A','A1'), turnCell(q2,'A','A2'));
        const A2 = A1.map(x => ({...x, section:'A2', phrase:x.phrase.replace('A','A2')}));
        // Pont : rhythm changes (forme de référence) ou, au renouvellement, pont modulant (à IV ou à bIII)
        const B = jbr(pick(JBR), 'B');
        let A3src = A1;
        if (R && libOK && R() >= 0.7) A3src = join(turnCell(pick(['T0','T1','T3','T4','T5']),'A','A1'), turnCell(pick(['T1','T0','T3','T4','T5']),'A','A2'));
        const A3 = A3src.map(x => ({...x, section:'A3', phrase:x.phrase.replace(/^A[12]?/,'A3')}));
        template = join(A1,A2,B,A3);
        return template;
    },
    modal: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // 16 mesures en AABA : la répétition est le principe structurel, pas une
        // succession artificielle de dominantes. Les sections de contraste changent de couleur modale.
        const A2opts = [[5,'m7','dorian'],[5,'7','mixolydian'],[3,'maj7','lydian'],[10,'maj7','lydian'],[7,'m7','dorian']];
        const Bopts = [[1,'m7','dorian'],[8,'maj7','lydian'],[3,'m7','dorian'],[10,'m7','dorian'],[6,'m7','dorian']];
        const a2 = pick(A2opts);
        let b = pick(Bopts);
        if (b[0] === a2[0]) b = Bopts[(Bopts.indexOf(b) + 1) % Bopts.length];
        template = join(
            [abs(0,'m7',4,'dorian','A','A1','tonic')],
            [abs(a2[0],a2[1],4,a2[2],'A2','A2','color')],
            [abs(b[0],b[1],4,b[2],'B','B1','color')],
            [abs(0,'m7',4,'dorian','A3','A3','tonic')]
        );
        return template;
    },
    bossa: (t) => {
        const { abs, join, cadence } = t;
        let template = [];
        // 32 mesures AABA : cadence mineure, dominantes secondaires et retour clair.
        const A = [
            abs(0,'m7',2,'dorian','A','A1','tonic'),
            abs(5,'m7',2,'dorian','A','A1','predominant'),
            abs(10,'m7b5',1,'locrianSharp2','A','A2','predominant'),
            abs(3,'7alt',1,'altered','A','A2','dominant'),
            abs(8,'7',2,'mixolydian','A','A2','dominant')
        ];
        const A2 = A.map(x=>({...x,section:'A2',phrase:x.phrase.replace(/^A/,'A2')}));
        const B = [
            abs(5,'m7',2,'dorian','B','B1','predominant'), abs(10,'7',2,'mixolydian','B','B1','dominant'),
            abs(3,'maj7',2,'lydian','B','B2','tonic'), abs(8,'7alt',2,'altered','B','B2','dominant')
        ];
        const A3 = A.map(x=>({...x,section:'A3',phrase:x.phrase.replace(/^A/,'A3')}));
        template=join(A,A2,B,A3);
        return template;
    },
    pop: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // 16 mesures : A B A B', progressions diatoniques ; la fin B' retombe sur la tonique.
        const P = { I:[0,'maj7','ionian','tonic'], IV:[5,'maj7','ionian','predominant'], V:[7,'7','mixolydian','dominant'], vi:[9,'m7','aeolian','predominant'], ii:[2,'m7','dorian','predominant'], iii:[4,'m7','phrygian','predominant'] };
        const cell = (names, sec, phr) => names.map(nm => { const [o,c,sc,f] = P[nm]; return abs(o,c,1,sc,sec,phr,f); });
        const endCell = (spec, sec, phr) => spec.map(([nm,m]) => { const [o,c,sc,f] = P[nm]; return abs(o,c,m,sc,sec,phr,f); });
        const cellsA = [['I','V','vi','IV'], ['I','vi','IV','V'], ['I','iii','IV','V'], ['I','IV','V','IV'], ['I','vi','ii','V']];
        const cellsB = [['I','IV','vi','V'], ['vi','IV','I','V'], ['I','iii','vi','IV'], ['vi','ii','V','I']];
        const ends = [[['IV',1],['V',1],['I',2]], [['ii',1],['V',1],['I',2]], [['vi',1],['IV',1],['V',1],['I',1]]];
        const ca = pick(cellsA);
        const endsV = ca[ca.length - 1] === 'V'; // un V en fin d'A doit résoudre : B et la fin B' commencent alors par I ou vi
        const okB = cellsB.filter(c => c.join() !== ca.join() && (!endsV || c[0] === 'I' || c[0] === 'vi'));
        const cb = pick(okB.length ? okB : [cellsB[0]]);
        const okE = ends.filter(e => !endsV || e[0][0] === 'vi' || e[0][0] === 'I');
        template = join(cell(ca,'A','A1'), cell(cb,'B','B1'), cell(ca,'A2','A2'), endCell(pick(okE.length ? okE : [ends[0]]),'B2','B2'));
        return template;
    },
    ballad: (t) => {
        const { pick, chord, chordJazz, abs, join, cadence, turnCell } = t;
        let template = [];
        const cad1 = pick(['c0','c2']) === 'c0' ? cadence('A','A1') : [chord('ii',1,'A','A1','predominant'), abs(1,'7',1,'lydianDominant','A','A1','dominant'), chord('I',2,'A','A1','tonic')];
        const p2 = pick(['orig','T1','T0','T3']);
        const ph2 = p2 === 'orig' ? [chordJazz('vi',1,'A','A2','predominant'), abs(9,'7',1,'altered','A','A2','dominant'), chordJazz('ii',1,'A','A2','predominant'), chordJazz('V',1,'A','A2','dominant')] : turnCell(p2,'A','A2');
        const A=[...cad1, ...ph2];
        const A2=A.map(x=>({...x,section:'A2',phrase:x.phrase.replace(/^A/,'A2')}));
        const B=[abs(5,'maj7',2,'lydian','B','B1','predominant'),abs(10,'7',2,'mixolydian','B','B1','dominant'),abs(3,'maj7',2,'lydian','B','B2','tonic'),abs(8,'7',2,'mixolydian','B','B2','dominant')];
        [0,3,3,3].forEach((k, ix) => { B[ix].kc = k; }); // IV dans la tonalité d'origine, puis modulation en bIII (V7 de bIII, I, IV7)
        const A3=A.map(x=>({...x,section:'A3',phrase:x.phrase.replace(/^A/,'A3')}));
        template=join(A,A2,B,A3);
        return template;
    },
    funk: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // 16 mesures : vamps de dominantes ; chaque section est choisie dans une petite bibliothèque, la fin retombe sur I7.
        const spec = (cellSpec, sec, phr) => cellSpec.map(([o,m,fn]) => abs(o,'7',m,'mixolydian',sec,phr,fn));
        const Aopts = [[[0,4,'tonic']], [[0,1,'tonic'],[5,1,'predominant'],[0,1,'tonic'],[10,1,'color']], [[0,3,'tonic'],[5,1,'predominant']], [[0,2,'tonic'],[3,1,'color'],[5,1,'predominant']]];
        const Bopts = [[[5,4,'predominant']], [[5,2,'predominant'],[10,2,'color']], [[5,1,'predominant'],[0,1,'tonic'],[5,1,'predominant'],[0,1,'tonic']]];
        const A2opts = [[[0,2,'tonic'],[10,2,'color']], [[0,4,'tonic']], [[0,1,'tonic'],[3,1,'color'],[5,1,'predominant'],[10,1,'color']]];
        const B2opts = [[[5,2,'predominant'],[0,2,'tonic']], [[5,2,'predominant'],[10,1,'color'],[0,1,'tonic']], [[5,1,'predominant'],[10,1,'color'],[0,2,'tonic']]];
        const fa = pick(Aopts);
        const okFB = Bopts.filter(c => c[0][0] !== fa[fa.length - 1][0]); // pas deux sections de suite sur le même accord
        const fb = pick(okFB.length ? okFB : Bopts);
        const okFA2 = A2opts.filter(c => c[0][0] !== fb[fb.length - 1][0]);
        const fa2 = pick(okFA2.length ? okFA2 : A2opts);
        template = join(spec(fa,'A','A1'), spec(fb,'B','B1'), spec(fa2,'A2','A2'), spec(pick(B2opts),'B2','B2'));
        return template;
    },
    hardbop: (t) => {
        const { chordJazz, abs, join } = t;
        let template = [];
        template = join(
            [chordJazz('ii',1,'A','A1','predominant'),chordJazz('V',1,'A','A1','dominant'),chordJazz('I',1,'A','A2','tonic'),abs(9,'7',1,'altered','A','A2','secondaryDominant')],
            [chordJazz('ii',1,'B','B1','predominant'),chordJazz('V',1,'B','B1','dominant'),abs(5,'maj7',1,'lydian','B','B2','tonic'),abs(2,'7',1,'mixolydian','B','B2','dominant')],
            [chordJazz('ii',1,'C','C1','predominant'),chordJazz('V',1,'C','C1','dominant'),chordJazz('I',1,'C','C2','tonic'),chordJazz('V',1,'C','C2','dominant')],
            [chordJazz('ii',1,'A2','A3','predominant'),chordJazz('V',1,'A2','A3','dominant'),chordJazz('I',1,'A2','A4','tonic'),chordJazz('V',1,'A2','A4','dominant')]
        );
        return template;
    },
    dixieland: (t) => {
        const { chord, abs, join, cadence } = t;
        let template = [];
        template = join(
            [chord('I',2,'A','A1','tonic'),abs(9,'7',1,'mixolydian','A','A1','secondaryDominant'),chord('ii',1,'A','A1','predominant'),chord('V',2,'A','A2','dominant'),chord('I',2,'A','A2','tonic')],
            [chord('IV',2,'B','B1','predominant'),abs(5,'m7',2,'dorian','B','B1','predominant'),chord('I',2,'B','B2','tonic'),chord('V',2,'B','B2','dominant')]
        );
        // 8 + 8 mesures : A puis B, avec retour de I et cadence finale.
        return template;
    },
    latin: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // 16 mesures : A (8), B (4), retour A' (4) ; chaque partie est choisie dans une petite bibliothèque.
        const LT = { i:[0,'m7','dorian'], iv:[5,'m7','dorian'], bVII7:[10,'7','mixolydian'], 'iiø':[2,'m7b5','locrianSharp2'], V7alt:[7,'7alt','altered'], IV7:[5,'7','mixolydian'], bII7:[1,'7','lydianDominant'] };
        const lt = (nm,m,sec,phr,fn) => { const [o,c,sc] = LT[nm]; return abs(o,c,m,sc,sec,phr,fn); };
        const aPre = pick([[['i',4]], [['i',2],['iv',2]], [['i',3],['iv',1]]]);
        const aEnd = pick([[['iiø',2],['V7alt',2]], [['iiø',1],['V7alt',3]]]);
        const bPre = pick([[['i',2]], [['i',1],['bVII7',1]]]);
        const bEnd = bPre[bPre.length - 1][0] === 'bVII7' ? [['IV7',2]] : pick([[['IV7',2]], [['bII7',2]]]); // bVII7 résout sur IV7
        template = join(
            aPre.map(([nm,m],ix) => lt(nm,m,'A','A1',ix === 0 ? 'tonic' : 'color')),
            aEnd.map(([nm,m]) => lt(nm,m,'A','A2',nm === 'iiø' ? 'predominant' : 'dominant')),
            bPre.map(([nm,m],ix) => lt(nm,m,'B','B1',ix === 0 ? 'tonic' : 'color')),
            bEnd.map(([nm,m]) => lt(nm,m,'B','B2','predominant')),
            [lt('i',4,'A2','A3','tonic')]
        );
        return template;
    },
    fusion: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // 16 mesures : A et B de quatre blocs de deux mesures (accords de couleur), schémas de fondamentales variés.
        const TYPES = [
            [['7sus4','dorian','tonic'],['maj7sharp11','lydian','color'],['7alt','altered','dominant'],['mmaj7','melodicMinor','color']],
            [['m11','dorian','tonic'],['maj7sharp11','lydian','color'],['7sus4','mixolydian','dominant'],['mmaj7','melodicMinor','color']],
            [['m9','dorian','tonic'],['7sus4','mixolydian','color'],['maj7sharp11','lydian','color'],['7alt','altered','dominant']]
        ];
        const ROOTS_A = [[0,3,6,1],[0,5,10,3],[0,10,8,7],[0,2,5,7]];
        const ROOTS_B = [[5,8,3,0],[5,10,3,0],[7,10,5,0],[3,8,10,0]];
        const ta = pick(TYPES), ra = pick(ROOTS_A), tb = pick(TYPES), rb = pick(ROOTS_B);
        template = join(
            ra.map((o,i) => abs(o,ta[i][0],2,ta[i][1],'A',i < 2 ? 'A1' : 'A2',ta[i][2])),
            rb.map((o,i) => abs(o,tb[i][0],2,tb[i][1],'B',i < 2 ? 'B1' : 'B2',tb[i][2]))
        );
        return template;
    },
    baroque: (t) => {
        const { chord, secondary, join } = t;
        let template = [];
        // 16 mesures AABB : séquences, dominantes secondaires et cadences.
        template = join(
            [chord('I',2,'A','A1','tonic'),chord('IV',1,'A','A1','predominant'),chord('ii',1,'A','A1','predominant'),secondary('V',1,'A','A2'),chord('V',1,'A','A2','dominant'),chord('I',2,'A','A2','tonic')],
            [chord('vi',1,'B','B1','predominant'),chord('ii',1,'B','B1','predominant'),secondary('V',1,'B','B2'),chord('V',1,'B','B2','dominant'),chord('I',2,'B','B2','tonic'),chord('IV',1,'B','B3','predominant'),chord('V',1,'B','B3','dominant')]
        );
        return template;
    },
    mozart: (t) => {
        const { chord, secondary, join, cadence } = t;
        let template = [];
        // 16 mesures AABB : antécédent, demi-cadence, conséquent, cadence parfaite.
        template = join(
            [chord('I',2,'A','A1','tonic'),chord('IV',1,'A','A1','predominant'),chord('V',1,'A','A1','dominant'),chord('V',2,'A','A2','dominant'),chord('I',2,'A','A2','tonic')],
            [chord('ii',1,'B','B1','predominant'),secondary('V',1,'B','B1'),chord('V',1,'B','B1','dominant'),chord('vi',2,'B','B2','predominant'),chord('ii',1,'B','B2','predominant'),chord('V',1,'B','B2','dominant'),chord('I',1,'B','B2','tonic')]
        );
        return template;
    },
    trad: (t) => {
        const { pick, chord, join } = t;
        let template = [];
        // 16 mesures A B, avec langage tonal simple et cadences lisibles (la forme se termine sur V, retour à I).
        const a1 = pick([[['I',2],['IV',2]], [['I',2],['vi',2]], [['I',2],['ii',2]]]);
        const a2 = pick([[['I',2],['V',2]], [['IV',2],['V',2]], [['ii',2],['V',2]]]);
        const b1 = pick([[['I',2],['vi',2]], [['vi',2],['IV',2]], [['I',2],['IV',2]]]); // après le V qui termine A : I ou vi
        const b2 = pick([[['ii',2],['V',2]], [['IV',2],['V',2]], [['vi',2],['V',2]]]);
        const fnOf = { I:'tonic', IV:'predominant', vi:'predominant', ii:'predominant', V:'dominant' };
        const mk = (sp, sec, phr) => sp.map(([d,m]) => chord(d,m,sec,phr,fnOf[d]));
        template = join(mk(a1,'A','A1'), mk(a2,'A','A2'), mk(b1,'B','B1'), mk(b2,'B','B2'));
        return template;
    },
    chansonsimple: (t) => {
        const { R, pick, abs, join, cadence } = t;
        let template = [];
        // « Chanson simple » : 16 mesures A A' B B', uniquement des triades (majeures et mineures), en majeur ou (en renouvellement) en mineur.
        // A finit sur V (demi-cadence), A' revient à I, B reste sur un accord de repos, B' conclut par la cadence V - I.
        const minor = !!(R && R() < 0.3);
        const M = (o, f, sc) => [o, 'majTriad', sc, f], m = (o, f, sc) => [o, 'minTriad', sc, f];
        const P = minor ? {
            i: m(0,'tonic','aeolian'), iv: m(5,'predominant','dorian'), V: M(7,'dominant','mixolydian'),
            III: M(3,'predominant','ionian'), VI: M(8,'predominant','lydian'), VII: M(10,'predominant','mixolydian')
        } : {
            I: M(0,'tonic','ionian'), IV: M(5,'predominant','lydian'), V: M(7,'dominant','mixolydian'),
            ii: m(2,'predominant','dorian'), iii: m(4,'predominant','phrygian'), vi: m(9,'predominant','aeolian')
        };
        const row = (spec, sec, phr) => spec.map(([nm, mm = 1]) => { const [o,c,sc,f] = P[nm]; return abs(o,c,mm,sc,sec,phr,f); });
        const L = minor ? {
            a1: [[['i',2],['iv',1],['V',1]], [['i',1],['VII',1],['VI',1],['V',1]], [['i',2],['VI',1],['V',1]], [['i',1],['iv',1],['i',1],['V',1]]],
            a2: [[['i',2],['iv',1],['i',1]], [['i',1],['III',1],['VII',1],['i',1]], [['i',1],['iv',1],['V',1],['i',1]], [['i',1],['VI',1],['iv',1],['i',1]]],
            b1: [[['III',2],['VII',2]], [['VI',2],['iv',2]], [['III',1],['VII',1],['VI',1],['iv',1]], [['VI',1],['VII',1],['III',2]]],
            b2: [[['iv',1],['V',1],['i',2]], [['VI',1],['V',1],['i',2]], [['VII',1],['III',1],['V',1],['i',1]], [['iv',2],['V',1],['i',1]]]
        } : {
            a1: [[['I',2],['IV',1],['V',1]], [['I',1],['vi',1],['IV',1],['V',1]], [['I',2],['vi',1],['V',1]], [['I',1],['IV',1],['I',1],['V',1]], [['I',1],['iii',1],['IV',1],['V',1]]],
            a2: [[['I',2],['IV',1],['I',1]], [['I',1],['vi',1],['IV',1],['I',1]], [['I',1],['IV',1],['V',1],['I',1]], [['I',1],['vi',1],['V',1],['I',1]], [['I',2],['V',1],['I',1]]],
            b1: [[['vi',2],['IV',2]], [['vi',1],['IV',1],['I',1],['IV',1]], [['IV',2],['I',2]], [['vi',1],['iii',1],['IV',2]], [['IV',1],['I',1],['vi',2]]],
            b2: [[['IV',1],['V',1],['I',2]], [['ii',1],['V',1],['I',2]], [['vi',1],['IV',1],['V',1],['I',1]], [['IV',2],['V',1],['I',1]]]
        };
        const b1 = pick(L.b1);
        const b2ok = L.b2.filter(c => c[0][0] !== b1[b1.length - 1][0]); // B' ne reprend pas l'accord où B s'arrête
        template = join(row(pick(L.a1),'A','A1'), row(pick(L.a2),'A','A2'), row(b1,'B','B1'), row(pick(b2ok.length ? b2ok : L.b2),'B','B2'));
        return template;
    },
    samba: (t) => {
        const { pick, join, cells, twinOf } = t;
        let template = [];
        // Samba (2/4), 32 mesures : A A' en mineur (vamp i7 - IV7 ou ii° - V7alt), B dans le relatif majeur, A'' conclusif.
        // Chaque cellule fait 4 mesures ; une cellule qui finit sur V7alt est suivie d'une cellule qui commence sur i.
        const aOpts = [
            [['m7',0,2],['D',5,2]],
            [['m7',0],['hd',2],['alt',7],['m7',0]],
            [['m7',0,2],['hd',2],['alt',7]],
            [['m7',0],['m7',5],['D',10],['m7',0]]
        ];
        const bOpts = [
            [['maj7',3,2],['maj7',8,2]],
            [['maj7',3],['m7',5],['D',10],['maj7',3]],
            [['m7',5],['D',10],['maj7',3,2]]
        ];
        const rOpts = [
            [['hd',2],['alt',7],['m7',0,2]],
            [['m7',0],['hd',2],['alt',7],['m7',0]]
        ];
        const A = join(cells(pick(aOpts),'A','A1'), cells(pick(aOpts),'A','A2'));
        const B = join(cells(pick(bOpts),'B','B1'), cells(pick(bOpts),'B','B2'));
        const A3 = join(cells(pick(aOpts),'A3','A3'), cells(pick(rOpts),'A3','A4'));
        template = join(A, twinOf(A,'A2'), B, A3);
        return template;
    },
    tango: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // Tango à danser (2/4), 32 mesures : A (16) en mineur, antécédent sur V7 puis conséquent sur i ; B (16) dans le
        // relatif majeur (III), qui revient à i par iv / ii° / V7 de V. Harmonie simple, cadences nettes, un accord par
        // mesure ou par deux mesures. Chaque cellule fait 4 mesures et part de l'accord que la précédente appelle.
        const row = (rows, sec, phr) => rows.map(([off, c, sc, fn, m = 1]) => abs(off, c, m, sc, sec, phr, fn));
        const i = (m = 1) => [0, 'minTriad', 'harmonicMinor', 'tonic', m];
        const iv = (m = 1) => [5, 'minTriad', 'dorian', 'predominant', m];
        const V = (m = 1) => [7, '7b9', 'phrygianDominant', 'dominant', m];
        const iio = (m = 1) => [2, 'm7b5', 'locrianSharp2', 'predominant', m];
        const bVI = (m = 1) => [8, 'majTriad', 'ionian', 'predominant', m];
        const III = (m = 1) => [3, 'majTriad', 'ionian', 'color', m];
        const bVII7 = (m = 1) => [10, '7', 'mixolydian', 'secondaryDominant', m];   // V7 de III
        const iiIII = (m = 1) => [5, 'm7', 'dorian', 'predominant', m];             // ii de III
        const V7V = (m = 1) => [2, '7', 'lydianDominant', 'secondaryDominant', m];  // V7 de V
        const T = [ [i(2), V(2)], [i(1), iv(1), V(2)], [i(2), iv(1), V(1)], [i(1), V(1), i(1), V(1)] ];      // part de i, finit sur V7
        const U = [ [i(1), iv(1), V(1), i(1)], [i(1), iio(1), V(1), i(1)], [i(2), V(1), i(1)], [i(1), bVI(1), V(1), i(1)] ]; // part de i, finit sur i
        const W1 = [ [III(2), bVII7(2)], [III(1), bVI(1), bVII7(2)], [III(1), bVII7(1), III(1), bVII7(1)] ];  // part de III, finit sur V7 de III
        const W2 = [ [III(1), bVI(1), bVII7(1), III(1)], [III(1), iiIII(1), bVII7(1), III(1)], [III(2), bVII7(1), III(1)] ]; // part de III, finit sur III
        const Z = [ [III(1), iv(1), V(1), i(1)], [III(1), V7V(1), V(1), i(1)], [III(1), iio(1), V(1), i(1)] ]; // part de III, revient à i
        template = join(
            row(pick(T),'A','A1'), row(pick(U),'A','A2'), row(pick(T),'A2','A3'), row(pick(U),'A2','A4'),
            row(pick(W1),'B','B1'), row(pick(W2),'B','B2'), row(pick(W1),'B2','B3'), row(pick(Z),'B2','B4')
        );
        return template;
    },
    piazzolla: (t) => {
        const { pick, abs, join } = t;
        let template = [];
        // Piazzolla / nuevo tango (4/4), 16 mesures : tonique mineure colorée (m9, m11, m(maj7)), dominantes altérées,
        // basses descendantes (Cm - Bb7 - Abmaj7 - G7b9), puis contraste dans le relatif majeur (Ebmaj7, Abmaj7#11).
        // Antécédent (i -> V), conséquent (i -> i), B (III -> V7 de III), retour (III -> i).
        const row = (rows, sec, phr) => rows.map(([off, c, sc, fn, m = 1]) => abs(off, c, m, sc, sec, phr, fn));
        const i9 = (m = 1) => [0, 'm9', 'aeolian', 'tonic', m];
        const i11 = (m = 1) => [0, 'm11', 'aeolian', 'tonic', m];
        const iM7 = (m = 1) => [0, 'mmaj7', 'melodicMinor', 'tonic', m];
        const iT = (m = 1) => [0, 'minTriad', 'harmonicMinor', 'tonic', m];
        const iv7 = (m = 1) => [5, 'm7', 'dorian', 'predominant', m];
        const iio = (m = 1) => [2, 'm7b5', 'locrianSharp2', 'predominant', m];
        const V7a = (m = 1) => [7, '7alt', 'altered', 'dominant', m];
        const V7b = (m = 1) => [7, '7b9', 'phrygianDominant', 'dominant', m];
        const V7s = (m = 1) => [7, '7sus4', 'mixolydian', 'dominant', m];
        const bVI = (m = 1) => [8, 'maj7', 'lydian', 'predominant', m];
        const bVIs = (m = 1) => [8, 'maj7sharp11', 'lydian', 'predominant', m];
        const bVII7 = (m = 1) => [10, '7', 'mixolydian', 'color', m];
        const III7 = (m = 1) => [3, 'maj7', 'lydian', 'color', m];
        const V7III = (m = 1) => [10, '7', 'mixolydian', 'secondaryDominant', m];
        const V7IIIalt = (m = 1) => [10, '7alt', 'altered', 'secondaryDominant', m];
        const P = [ [i9(2), iv7(1), V7a(1)], [iT(1), bVII7(1), bVI(1), V7b(1)], [iM7(2), bVIs(1), V7a(1)], [i11(2), iio(1), V7b(1)] ];
        const C = [ [i9(1), iio(1), V7a(1), iM7(1)], [iT(1), iv7(1), V7b(1), i9(1)], [i11(1), bVIs(1), V7s(1), i9(1)] ];
        const B1 = [ [III7(1), bVIs(1), iv7(1), V7III(1)], [III7(2), iv7(1), V7IIIalt(1)] ];
        const B2 = [ [III7(1), iio(1), V7a(1), i9(1)], [III7(1), bVIs(1), V7b(1), iM7(1)] ];
        template = join(row(pick(P),'A','A1'), row(pick(C),'A','A2'), row(pick(B1),'B','B1'), row(pick(B2),'B','B2'));
        return template;
    },
    milongalyrique: (t) => {
        const { keyRoot, pick, abs, join } = t;
        let template = [];
        // Milonga lyrique (dans l'esprit d'« Oblivion »), 4/4, 32 mesures AABA en ré mineur : harmonie de chambre, douce
        // et nostalgique. Basse qui descend par degrés conjoints (Dm - Dm7/C - Bbmaj7 - A7b9), cliché chromatique
        // (Dm - DmM7 - Dm7 - Bø/D), pont dans le relatif majeur (Fmaj7, Bbmaj7#11, Gm7, C7), retour à la tonique.
        // Une cellule : [décalage, accord, gamme, fonction, mesures, basse]. Les accords sur basse (« / ») gardent la
        // note de basse d'origine : la contrebasse la joue, le piano arpège l'accord.
        const mrow = (rows, sec, phr) => rows.map(([off, c, sc, fn, m = 1, bs]) => {
            const it = abs(off, c, m, sc, sec, phr, fn);
            if (Number.isInteger(bs)) it.bassRootIndex = (keyRoot + bs + 12) % 12;
            return it;
        });
        const i7 = (m = 1) => [0, 'm7', 'aeolian', 'tonic', m];
        const i9 = (m = 1) => [0, 'm9', 'aeolian', 'tonic', m];
        const i7C = (m = 1) => [0, 'm7', 'aeolian', 'tonic', m, 10];         // Dm7/C
        const iM7 = (m = 1) => [0, 'mmaj7', 'melodicMinor', 'tonic', m];
        const viD = (m = 1) => [9, 'm7b5', 'locrianSharp2', 'predominant', m, 0];   // Bø/D
        const iio = (m = 1) => [2, 'm7b5', 'locrianSharp2', 'predominant', m];
        const iv7 = (m = 1) => [5, 'm7', 'dorian', 'predominant', m];
        const bVI = (m = 1) => [8, 'maj7', 'lydian', 'predominant', m];
        const bVIs = (m = 1) => [8, 'maj7sharp11', 'lydian', 'predominant', m];
        const V7b = (m = 1) => [7, '7b9', 'phrygianDominant', 'dominant', m];
        const V7a = (m = 1) => [7, '7alt', 'altered', 'dominant', m];
        const III7 = (m = 1) => [3, 'maj7', 'lydian', 'color', m];
        const III3 = (m = 1) => [3, 'maj7', 'lydian', 'color', m, 7];        // Fmaj7/A
        const V7III = (m = 1) => [10, '7', 'mixolydian', 'secondaryDominant', m];
        const V7IIIa = (m = 1) => [10, '7alt', 'altered', 'secondaryDominant', m];
        // Les deux premières mesures de la phrase A suivent le sens de la basse : T finit sur V (cas 1) ou sur Bø/D (cas 2) ;
        // la suite U commence en conséquence et finit toujours sur i.
        const AP = [
            { T: [i7(), i7C(), bVI(), V7b()],
              U: [ [i7(), iio(), V7b(), i9()], [i9(), iv7(), V7a(), i7()], [i7(), bVIs(), V7b(), iM7()] ] },
            { T: [i7(), iM7(), i7(), viD()],
              U: [ [iio(), V7b(), i9(2)], [iv7(), V7a(), i9(2)], [iio(), V7b(), i7(), i9()] ] }
        ];
        const W = [ [III7(), bVIs(), iv7(), V7III()], [III7(2), iv7(), V7IIIa()], [III7(), III3(), bVI(), V7III()] ];   // part de III, finit sur V7 de III
        const Z = [ [III7(), iio(), V7a(2)], [III7(), bVIs(), iio(), V7b()], [III7(), iv7(), V7b(2)] ];                // part de III, finit sur V7 : retour à i
        const ap = pick(AP);
        const Ta = ap.T, Ua = pick(ap.U), Uf = pick(ap.U);
        template = join(
            mrow(Ta, 'A', 'A1'), mrow(Ua, 'A', 'A2'),
            mrow(Ta, 'A2', 'A3'), mrow(Ua, 'A2', 'A4'),
            mrow(pick(W), 'B', 'B1'), mrow(pick(Z), 'B', 'B2'),
            mrow(Ta, 'A3', 'A5'), mrow(Uf, 'A3', 'A6')
        );
        return template;
    },
    // ============ Brass band ============
    brasshymn: (t) => {
        const { keyRoot, libOK, R, pick, join, cadence, cells } = t;
        let template = [];
        // Hymne / choral de brass band (4/4), 16 mesures : quatre phrases de quatre mesures (I -> V, I -> I, contraste
        // vi / dominantes secondaires -> V7, retour avec cadence plagale « Amen »). Majeur ; parfois mineur au renouvellement.
        const minor = !!(R && libOK && ![1, 3, 8].includes(keyRoot) && R() < 0.3); // pas de mineur dans une tonalité à six bémols
        if (!minor) {
            const P1 = [ [['M',0],['L',5],['M',0],['D',7]], [['M',0],['m',9],['L',5],['D',7]], [['M',0,2],['L',5],['D',7]], [['M',0],['m',4],['L',5],['D',7]] ];
            const P2 = [ [['M',0],['L',5],['D',7],['M',0]], [['M',0],['md',2],['D',7],['M',0]], [['M',0,2],['D',7],['M',0]], [['M',0],['D',0],['L',5],['M',0]] ];
            const P3 = [ [['m',9],['L',5],['md',2],['D',7]], [['D',4],['m',9],['D',2],['D',7]], [['L',5],['D',9],['md',2],['D',7]] ];
            const P4 = [ [['M',0],['D',7],['L',5],['M',0]], [['M',0],['L',5],['D',7],['M',0]], [['M',0,2],['L',5],['M',0]] ];
            template = join(cells(pick(P1),'A','A1'), cells(pick(P2),'A','A2'), cells(pick(P3),'B','B1'), cells(pick(P4),'B','B2'));
        } else {
            const P1 = [ [['m',0],['md',5],['m',0],['Dm',7]], [['m',0],['L',8],['md',5],['Dm',7]], [['m',0,2],['md',5],['Dm',7]] ];
            const P2 = [ [['m',0],['md',5],['Dm',7],['m',0]], [['m',0],['hd',2],['Dm',7],['m',0]], [['m',0,2],['Dm',7],['m',0]] ];
            const P3 = [ [['M',3],['D',10],['M',3],['Dm',7]], [['L',8],['D',10],['M',3],['Dm',7]] ];
            const P4 = [ [['m',0],['Dm',7],['md',5],['m',0]], [['m',0],['md',5],['Dm',7],['m',0]] ];
            template = join(cells(pick(P1),'A','A1'), cells(pick(P2),'A','A2'), cells(pick(P3),'B','B1'), cells(pick(P4),'B','B2'));
        }
        return template;
    },
    brasscantique: (t) => {
        const { pick, join, cells } = t;
        let template = [];
        // Cantique de brass band (3/4), 16 mesures, dans l'esprit d'« Amazing Grace » : tonique tenue sur deux mesures, IV,
        // retour à la tonique ; seconde moitié plus mobile (vi, ii, dominantes), conclusion plagale ou par le bVII (couleur
        // modale des airs traditionnels). Toujours majeur.
        const P1 = [ [['M',0,2],['L',5],['M',0]], [['M',0],['L',5],['M',0,2]], [['M',0,2],['L',5],['M',0]] ];
        const P2 = [ [['M',0],['L',5],['M',0],['D',7]], [['M',0,2],['L',5],['D',7]], [['M',0],['m',9],['L',5],['D',7]] ];
        const P3 = [ [['m',9],['L',5],['md',2],['D',7]], [['L',5,2],['md',2],['D',7]], [['M',0],['D',0],['L',5],['D',7]], [['L',5],['M',0],['md',2],['D',7]] ];
        const P4 = [ [['M',0],['L',5],['D',7],['M',0]], [['M',0],['M',10],['L',5],['M',0]], [['M',0,2],['L',5],['M',0]], [['M',0],['md',2],['D',7],['M',0]] ];
        template = join(cells(pick(P1),'A','A1'), cells(pick(P2),'A','A2'), cells(pick(P3),'B','B1'), cells(pick(P4),'B','B2'));
        return template;
    },
    // ============ Balkans ============
    balkan: (t) => {
        const { styleKey, pick, abs, join, cadence } = t;
        let template = [];
        // Balkans, mode mineur à seconde et sixte altérées : tonique mineure (mineur harmonique), dominante V7(b9) sur le phrygien
        // dominant (« hijaz »), cadence andalouse i - bVII - bVI - V, seconde bémol (bII) qui retombe sur i. Triades, un accord par
        // mesure, cellules de quatre mesures qui partent de l'accord que la précédente appelle.
        //  « balkan »   : kolo / čoček en 2/4, 32 mesures. A (16) en mineur ; B (16) dans le relatif majeur (III), qui revient à i.
        //  « balkan98 » : aksak 9/8 (2+2+2+3), 16 mesures. A (8) en mineur ; B (8) sur la tonique majeure « hijaz » (même tonique,
        //                 seconde mineure), qui retombe sur i.
        const row = (rows, sec, phr) => rows.map(([off, c, sc, fn, m = 1]) => abs(off, c, m, sc, sec, phr, fn));
        const i = (m = 1) => [0, 'minTriad', 'harmonicMinor', 'tonic', m];
        const iv = (m = 1) => [5, 'minTriad', 'dorian', 'predominant', m];
        const V = (m = 1) => [7, '7b9', 'phrygianDominant', 'dominant', m];
        const bII = (m = 1) => [1, 'majTriad', 'lydian', 'color', m];
        const bVII = (m = 1) => [10, 'majTriad', 'mixolydian', 'predominant', m];
        const bVI = (m = 1) => [8, 'majTriad', 'lydian', 'predominant', m];
        const T = [ [i(2), V(2)], [i(1), iv(1), V(2)], [i(1), bII(1), i(1), V(1)], [i(1), bVII(1), bVI(1), V(1)], [i(2), iv(1), V(1)], [i(1), V(1), i(1), V(1)] ];   // part de i, finit sur V
        const U = [ [i(1), iv(1), V(1), i(1)], [i(2), V(1), i(1)], [i(1), bII(1), V(1), i(1)], [i(1), bVII(1), V(1), i(1)], [i(1), V(1), bII(1), i(1)] ];            // part de i, finit sur i
        if (styleKey === 'balkan') {
            const iio = (m = 1) => [2, 'm7b5', 'locrianSharp2', 'predominant', m];
            const III = (m = 1) => [3, 'majTriad', 'ionian', 'color', m];
            const V7III = (m = 1) => [10, '7', 'mixolydian', 'secondaryDominant', m];   // V7 de III
            const V7V = (m = 1) => [2, '7', 'lydianDominant', 'secondaryDominant', m];   // V7 de V
            const W1 = [ [III(2), V7III(2)], [III(1), bVI(1), V7III(2)], [III(1), V7III(1), III(1), V7III(1)] ];             // part de III, finit sur V7 de III
            const W2 = [ [III(1), bVI(1), V7III(1), III(1)], [III(2), V7III(1), III(1)], [III(1), iv(1), V7III(1), III(1)] ]; // part de III, finit sur III
            const Z = [ [III(1), iv(1), V(1), i(1)], [III(1), V7V(1), V(1), i(1)], [III(1), iio(1), V(1), i(1)], [III(1), bII(1), V(1), i(1)] ]; // revient à i
            template = join(
                row(pick(T),'A','A1'), row(pick(U),'A','A2'), row(pick(T),'A2','A3'), row(pick(U),'A2','A4'),
                row(pick(W1),'B','B1'), row(pick(W2),'B','B2'), row(pick(W1),'B2','B3'), row(pick(Z),'B2','B4')
            );
        } else {
            const HJ = (m = 1) => [0, 'majTriad', 'phrygianDominant', 'color', m];   // tonique majeure « hijaz » (ré mi♭ fa♯ sol la si♭ do)
            const H1 = [ [HJ(1), bII(1), HJ(1), V(1)], [HJ(2), iv(1), V(1)], [HJ(1), bII(1), V(2)] ];          // part de HJ, finit sur V
            const H2 = [ [HJ(1), bII(1), V(1), i(1)], [HJ(1), iv(1), V(1), i(1)], [HJ(2), V(1), i(1)] ];        // part de HJ, revient à i
            template = join(row(pick(T),'A','A1'), row(pick(U),'A','A2'), row(pick(H1),'B','B1'), row(pick(H2),'B','B2'));
        }
        return template;
    },
};

STYLE_BUILDERS.blues128 = STYLE_BUILDERS.blues;
STYLE_BUILDERS.ballad128 = STYLE_BUILDERS.ballad;
STYLE_BUILDERS.balkan98 = STYLE_BUILDERS.balkan;

// Modèle d'un style : sa forme de référence (R = null) ou une proposition renouvelée (R = générateur aléatoire).
// Un style inconnu donne quatre mesures de tonique.
function buildStyleTemplate(styleKey, ctx) {
    const t = makeStyleToolkit({ ...ctx, styleKey });
    const builder = STYLE_BUILDERS[styleKey];
    const template = builder ? builder(t) : [t.chord('I', 4, 'A', 'A1', 'tonic')];
    // Styles à ponts modulants : tout bloc sans tonalité explicite est dans la tonalité d'origine (kc = 0).
    if (template.some(x => Number.isInteger(x.kc))) template.forEach(x => { if (!Number.isInteger(x.kc)) x.kc = 0; });
    return template.map(item => ({ ...item }));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STYLE_BUILDERS, buildStyleTemplate };
}
