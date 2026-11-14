// ui/staff-editor.js — portées éditables dans les annotations (onglet « Annotations » du mode Jam) : dessin avec VexFlow
// et édition à la souris, au doigt et au clavier. Le format, les mesures et les hauteurs sont dans ui/staff-notes.js.
// Une portée est un élément <div class="annot-staff" data-staff="…" data-at="x,y"> posé sur le canevas de la zone d'annotation (ui/annot-canvas.js) ;
// le texte enregistré ne garde que ce petit bloc (le dessin et la barre d'outils sont refaits à l'ouverture). Elle a sa place à elle, indépendante
// de celle des autres blocs, et son cadre peut être caché (data-border="0").
// Écrire : choisir une durée, cliquer sur la portée (la note se pose à la hauteur cliquée, avant la note qui suit) ;
// cliquer une note pour la sélectionner puis la glisser vers le haut ou le bas, ou utiliser les flèches ; Suppr. l'enlève.
// Sélection multiple, comme dans le système : ⌘ / Ctrl + clic ajoute ou retire une note, Maj + clic étend de la dernière note choisie jusqu'à celle-ci,
// Maj (ou ⌘) + glisser dans le vide trace un rectangle, ⌘A choisit tout. Les flèches, les altérations, les durées, le point, les silences, la liaison, Suppr.,
// ⌘C / ⌘X / ⌘V s'appliquent alors à tout le groupe (et le glisser vertical d'une note du groupe déplace tout le groupe).
// Liaison de prolongation : touche L ou bouton « ⌣ » (les deux notes, de même hauteur, ne sont jouées qu'une fois).
// Deux états : portée « en édition » (elle occupe toute la largeur de la zone, avec sa barre d'outils) ou portée « au repos »
// (le cadre épouse la portée telle qu'elle est écrite ; elle se déplace en la glissant, hors édition, avec les autres blocs sélectionnés, et se copie-colle d'une zone à l'autre).
// Chargé par index.html via <script src="ui/staff-editor.js"> (après ui/staff-notes.js) et testé par ui/staff-editor.test.js.

// Sous Node (tests), le format se charge ; en navigateur ce sont des globaux (ui/staff-notes.js).
const NSE_N = (typeof parseStaff !== 'undefined')
    ? { parseStaff, formatStaff, staffDefault, layoutStaff, staffBeamGroups, staffBeamBreaks, pitchFromDia, pitchDia, pitchLabel, pitchMidi, midiToName, diaFromY, yFromDia,
        playbackPlan, insertEvent, staffInsertTupletGroup, staffInsertBoundary, removeEvent, updateEvent, alterEvent, shiftEvent, cloneStaff,
        staffTupletChoices, staffMakeTuplet, staffDissolveTuplet, staffTupletBounds, staffSetPickup, staffEventEnd, setStaffTempo, setStaffSwing, setStaffInstr, clampStaffInstr, SN_INSTRUMENTS, staffTempo, staffMeterAllowsSwing,
        shiftEvents, alterEvents, removeEvents, staffExtractEvents, staffInsertEvents, staffToggleTies, staffAddTiedNote, staffHasTie, staffTieValid, staffSwingRatio,
        staffClipText, frameClipText, parseFrameBox, splitStaffClips, parseStaffPos, formatStaffPos, clampStaffPos,
        parseBlockAt, formatBlockAt, clampBlockAt, parseBlockBorder,
        SN_KEY_NAMES, SN_KEY_LABELS, SN_BOTTOM_LINE, SN_METERS, SN_SIZE_MIN, SN_SIZE_MAX, SN_SIZE_STEP, SN_SIZE_DEFAULT, clampStaffSize,
        SN_TUPLETS, SN_TUPLET_M, SN_TUPLET_NAMES, SN_BPM_MIN, SN_BPM_MAX, SN_SWING_MIN, SN_SWING_MAX }
    : require('./staff-notes.js');

const NSE_SPACING = 10;        // écart entre deux lignes de la portée (pixels)
const NSE_ABOVE = 3;           // lignes d'espace au-dessus de la portée
const NSE_BAND = 110;          // hauteur d'une ligne de portée (système) avec ses lignes supplémentaires
const NSE_TOP = NSE_ABOVE * NSE_SPACING; // position de la ligne du haut dans une ligne de portée
const NSE_BLUE = '#2563eb';
const NSE_PAD = 3;             // marge gardée autour de la portée quand le cadre épouse son dessin (pixels)
const NSE_TAIL = 240;          // portée vide ajoutée à droite des notes en édition, pour écrire la suite (unités du dessin)
const NSE_TAIL_MIN = 44;       // place minimale gardée pour cette portée vide quand on réserve la place des temps manquants
const NSE_BEAT_PX = 38;        // largeur réservée par temps (noire) manquant dans la 1re mesure incomplète, en édition

// ----- Dessin -----

// Tracé « Real Book » : les notes, les clés et les chiffres sont déjà manuscrits (police Petaluma) ; les lignes de la portée, droites et grises,
// deviennent un trait de crayon plus sombre et un peu irrégulier (courbe très légère, toujours la même pour une ligne donnée).
// Épaisseur des lignes, des hampes et des barres de mesure : style.css (.annot-staff-svg .vf-stave…).
function nseHandDrawn(svg) {
    if (!svg || !svg.querySelectorAll) return;
    let i = 0;
    svg.querySelectorAll('.vf-stave path').forEach((p) => {
        const m = /^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[ ,]+(-?[\d.]+)$/.exec((p.getAttribute('d') || '').trim());
        i++;
        if (!m) return;
        const x1 = +m[1], y1 = +m[2], x2 = +m[3], y2 = +m[4];
        if (y1 !== y2 || x2 - x1 < 12) return;
        const w = (((i * 7) % 5) - 2) * 0.22;      // -0,44 … +0,44 pixel
        const a = (((i * 3) % 4) - 1.5) * 0.12;    // très légère pente
        const mx = x1 + (x2 - x1) * (0.35 + ((i * 5) % 3) * 0.15);
        p.setAttribute('d', `M${x1} ${y1 + a}Q${mx} ${y1 + w} ${x2} ${y2 - a}`);
    });
}

// L'indication de mesure (4/4, 6/8…) de la police manuscrite fait le double de la hauteur de la portée (chaque chiffre en occupe toute la hauteur) :
// on la réduit de moitié autour de son centre, chaque chiffre couvre alors la moitié de la portée comme dans une partition.
const NSE_TIMESIG_SCALE = 0.5;
function nseSmallTimeSig(svg) {
    if (!svg || !svg.querySelectorAll) return;
    svg.querySelectorAll('.vf-timesignature').forEach((g) => {
        try {
            const b = g.getBBox();
            if (!(b.width > 0 && b.height > 0)) return;
            const cx = b.x + b.width / 2, cy = b.y + b.height / 2, k = NSE_TIMESIG_SCALE;
            g.setAttribute('transform', `translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`);
        } catch (e) { /* mesure impossible (élément caché) : on garde la taille d'origine */ }
    });
}

// Boîte qui contient tout ce que le SVG a dessiné ({ x, y, w, h }), ou `fallback` si le navigateur ne sait pas la mesurer
// (élément caché, ancien navigateur).
function nseContentBox(svg, fallback) {
    try {
        const b = svg.getBBox();
        if (b && b.width > 0 && b.height > 0) return { x: b.x, y: b.y, w: b.width, h: b.height };
    } catch (e) { /* élément non affiché : mesure impossible */ }
    return fallback;
}

// Dessine la portée `st` dans `host` (vide d'abord).
// opts : width (largeur disponible), selected (indice de l'événement à colorer, ou liste / ensemble d'indices),
//        compact (portée au repos : pas de prolongement vide à droite, et le dessin est recadré au plus juste pour que le cadre épouse la portée).
//        En édition (compact faux), la dernière ligne se prolonge d'une portée vide où l'on clique pour écrire la suite, et la 1re mesure incomplète
//        garde la place des temps manquants (la barre qui la ferme est alors une vraie barre : cliquer derrière la fait devenir une levée).
// Renvoie la géométrie pour les clics : { width, height, view, compact, layout, firstOpen, tailX, lines: [{ top, bottom, bottomY }],
//   measures: [{ mi, line, xs, xe, ev0, ev1 }], notes: [{ ev, x, y, line, m, rest, tieFromPrev, cont }] }  (cont : suite d'une note coupée par la barre de mesure).
// Les positions sont en unités du dessin ; `view` ({ x, y, w, h }) est la partie du dessin réellement affichée (tout le dessin hors mode compact).
function drawNoteStaff(host, st, opts = {}) {
    const VF = Vex.Flow;
    host.innerHTML = '';
    const zoom = (st.size || NSE_N.SN_SIZE_DEFAULT) / 100; // taille d'affichage : on dessine en grandeur normale puis on agrandit / réduit
    const W = Math.max(260, Math.floor((opts.width || host.clientWidth || 600) / zoom)); // largeur « logique » disponible
    const clef = st.clef === 'b' ? 'bass' : 'treble';
    const restKey = st.clef === 'b' ? 'd/3' : 'b/4';
    const keyName = NSE_N.SN_KEY_NAMES[st.ks];
    const layout = NSE_N.layoutStaff(st);
    const isSelected = (ev) => Array.isArray(opts.selected) ? opts.selected.includes(ev) : (opts.selected instanceof Set ? opts.selected.has(ev) : opts.selected === ev);

    // 1. Notes, voix, barres, tuplets de chaque mesure (sans position : elle vient après le découpage en lignes).
    // La mesure vide qui suit une mesure pleine ne sert qu'à poser la suite : elle n'est pas dessinée quand la portée est au repos.
    const lastEmpty = layout.measures.length > 1 && layout.measures[layout.measures.length - 1].pieces.length === 0;
    const meas = (opts.compact && lastEmpty ? layout.measures.slice(0, -1) : layout.measures).map((m, mi) => {
        const notes = m.pieces.map((pc) => {
            let key;
            if (pc.p) key = `${pc.p.l}${({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[pc.p.a]}/${pc.p.o}`;
            else key = restKey;
            const n = new VF.StaveNote({ clef, keys: [key], duration: pc.d + (pc.dot ? 'd' : '') + (pc.p ? '' : 'r'), auto_stem: true });
            if (pc.dot) VF.Dot.buildAndAttach([n], { all: true });
            if (isSelected(pc.ev)) n.setStyle({ fillStyle: NSE_BLUE, strokeStyle: NSE_BLUE });
            return n;
        });
        // Ligatures : groupes de croches / doubles-croches par temps de la mesure (ui/staff-notes.js : staffBeamGroups). La barre fixe aussi le sens des hampes du groupe.
        const groups = notes.length ? NSE_N.staffBeamGroups(m, st.meter) : [];
        const beamOf = new Map();
        const beams = groups.map((g, gi) => {
            g.forEach(i => beamOf.set(i, gi));
            const b = new VF.Beam(g.map(i => notes[i]), true);
            const br = NSE_N.staffBeamBreaks(m, g, st.meter);
            if (br.length && typeof b.breakSecondaryAt === 'function') b.breakSecondaryAt(br);
            return b;
        });
        // Tuplets : le chiffre se pose du côté de la barre (ou des hampes), le crochet n'est tracé que si les notes ne sont pas toutes sous une même barre.
        const tuplets = [];
        m.pieces.forEach((pc, i) => {
            if (!pc.tupletStart) return;
            const members = notes.slice(i, i + pc.tupletSize);
            const g0 = beamOf.get(i);
            const beamed = g0 !== undefined && members.every((_, k) => beamOf.get(i + k) === g0);
            const down = members.some((n, k) => m.pieces[i + k].p && n.getStemDirection() === VF.Stem.DOWN) && !members.some((n, k) => m.pieces[i + k].p && n.getStemDirection() === VF.Stem.UP);
            tuplets.push(new VF.Tuplet(members, { num_notes: pc.tu, notes_occupied: NSE_N.SN_TUPLET_M[pc.tu], ratioed: false, bracketed: !beamed,
                location: down ? VF.Tuplet.LOCATION_BOTTOM : VF.Tuplet.LOCATION_TOP }));
        });
        let voice = null, formatter = null, minW = 0;
        if (notes.length) {
            voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
            voice.addTickables(notes);
            VF.Accidental.applyAccidentals([voice], keyName); // altérations selon l'armure, rappelées dans la mesure
            formatter = new VF.Formatter().joinVoices([voice]);
            minW = formatter.preCalculateMinTotalWidth([voice]);
        }
        return { m, mi, notes, tuplets, voice, formatter, minW, beams };
    });

    // 2. Répartition des mesures en lignes de portée
    const probe = (first, firstLine) => {
        const s = new VF.Stave(0, 0, 400);
        if (first) { s.addClef(clef); if (st.ks) s.addKeySignature(keyName); if (firstLine) s.addTimeSignature(st.meter); }
        return s.getNoteStartX();
    };
    const head = { firstLine: probe(true, true), otherLine: probe(true, false), inner: probe(false, false) };
    const lines = [];
    let curLine = null;
    meas.forEach((mo) => {
        const content = Math.max(54, Math.ceil(mo.minW * 1.25) + 26);
        const isFirstLine = lines.length === 0;
        const headW = curLine ? head.inner : (isFirstLine ? head.firstLine : head.otherLine);
        if (!curLine || (curLine.natural + headW + content > W - 6 && curLine.items.length)) {
            curLine = { items: [], natural: 0 };
            lines.push(curLine);
            mo.headW = lines.length === 1 ? head.firstLine : head.otherLine;
        } else mo.headW = head.inner;
        mo.content = content;
        curLine.items.push(mo);
        curLine.natural += mo.headW + content;
    });

    // Largeur du dessin. Au repos et sur plusieurs lignes : toute la largeur ; en édition sur une seule ligne : les notes écrites, la place des temps
    // manquants de la 1re mesure, puis une portée vide pour écrire la suite (le bloc reste à sa place au lieu de s'étendre sur toute la zone).
    const lastLine = lines[lines.length - 1];
    const firstOpen = layout.measures.length === 1 && !layout.pickup && layout.measures[0].pieces.length > 0 && layout.measures[0].used < layout.total - 1e-6;
    let nominalExtra = 0;
    if (!opts.compact && firstOpen && lastLine) {
        nominalExtra = Math.max(0, Math.min(((layout.total - layout.measures[0].used) / 24) * NSE_BEAT_PX, W - 6 - lastLine.natural - NSE_TAIL_MIN));
    }
    const lastEnd = 3 + (lastLine ? lastLine.natural : 0) + nominalExtra;
    const tailW = (!opts.compact && W - 3 - lastEnd > 40) ? Math.min(NSE_TAIL, W - 3 - lastEnd) : 0;
    const drawW = (opts.compact || lines.length > 1 || !lastLine) ? W : Math.min(W, Math.ceil(lastEnd + tailW + 3));

    // 3. Dessin
    const height = lines.length * NSE_BAND;
    const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(drawW, height);
    const ctx = renderer.getContext();
    const svg = host.querySelector('svg');
    if (svg) {
        svg.style.display = 'block'; svg.style.overflow = 'visible';
        svg.setAttribute('viewBox', `0 0 ${drawW} ${height}`);
        svg.setAttribute('width', String(Math.round(drawW * zoom))); svg.setAttribute('height', String(Math.round(height * zoom)));
        svg.style.width = `${Math.round(drawW * zoom)}px`; svg.style.maxWidth = '100%'; svg.style.height = 'auto'; // trop grand pour la zone : il se réduit sans se déformer
    }
    const geo = { width: drawW, height, zoom, view: { x: 0, y: 0, w: drawW, h: height }, compact: !!opts.compact, layout, firstOpen, tailX: 0, lines: [], measures: [], notes: [] };
    const tieJobs = []; // { from: {note, line}, to: {note, line} }
    let tiePending = null;
    lines.forEach((ln, li) => {
        const y = li * NSE_BAND;
        const isLastLine = li === lines.length - 1;
        // Les lignes pleines remplissent la largeur ; la dernière garde la largeur de ses notes (elles ne se déplacent pas quand on en ajoute)
        // et se prolonge d'une portée vide, où l'on clique pour écrire la suite.
        const extra = isLastLine ? 0 : Math.max(0, W - 6 - ln.natural);
        const totalContent = ln.items.reduce((s, mo) => s + mo.content, 0);
        let x = 3;
        ln.items.forEach((mo, k) => {
            const room = (isLastLine && k === ln.items.length - 1) ? nominalExtra : 0; // place des temps manquants de la 1re mesure (édition)
            const w = mo.headW + mo.content + (extra * mo.content / totalContent) + room;
            const stave = new VF.Stave(x, y, w, { space_above_staff_ln: NSE_ABOVE, space_below_staff_ln: 3 });
            if (k === 0) { stave.addClef(clef); if (st.ks) stave.addKeySignature(keyName); if (li === 0) stave.addTimeSignature(st.meter); }
            if (isLastLine && k === ln.items.length - 1) stave.setEndBarType(ln.natural + nominalExtra >= W - 40 ? VF.Barline.type.END : VF.Barline.type.SINGLE);
            stave.setContext(ctx).draw();
            const first = mo.m.pieces.length ? mo.m.pieces[0].ev : null;
            const lastP = mo.m.pieces.length ? mo.m.pieces[mo.m.pieces.length - 1].ev : null;
            geo.measures.push({ mi: mo.mi, line: li, xs: x, xe: x + w, noteX: stave.getNoteStartX(), ev0: first, ev1: lastP });
            if (mo.voice) {
                const fw = Math.max(30, stave.getNoteEndX() - stave.getNoteStartX() - 12 - room);
                mo.formatter.format([mo.voice], fw);
                mo.voice.draw(ctx, stave);
                mo.beams.forEach(b => b.setContext(ctx).draw());
                mo.tuplets.forEach(t => t.setContext(ctx).draw());
                mo.m.pieces.forEach((pc, i) => {
                    const n = mo.notes[i];
                    const cx = (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2;
                    geo.notes.push({ g: (n.getSVGElement && n.getSVGElement()) || null, ev: pc.ev, x: cx, y: pc.p ? n.getYs()[0] : y + NSE_TOP + 2 * NSE_SPACING, line: li, m: mo.mi, rest: !pc.p, tieFromPrev: pc.tieFromPrev, cont: !!pc.cont });
                    if (pc.tieFromPrev && tiePending) tieJobs.push({ from: tiePending, to: { note: n, line: li } });
                    tiePending = pc.tieNext ? { note: n, line: li } : null;
                });
            }
            x += w;
        });
        geo.right = Math.max(geo.right || 0, x);
        if (isLastLine) geo.tailX = x;
        if (isLastLine && tailW > 0) {
            const tail = new VF.Stave(x, y, tailW, { space_above_staff_ln: NSE_ABOVE, space_below_staff_ln: 3 });
            tail.setBegBarType(VF.Barline.type.NONE);
            tail.setEndBarType(VF.Barline.type.NONE);
            tail.setContext(ctx).draw();
        }
        geo.lines.push({ top: y, bottom: y + NSE_BAND, bottomY: y + NSE_TOP + 4 * NSE_SPACING });
    });
    tieJobs.forEach((j) => {
        try {
            if (j.from.line === j.to.line) new VF.StaveTie({ first_note: j.from.note, last_note: j.to.note, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
            else {
                new VF.StaveTie({ first_note: j.from.note, last_note: null, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
                new VF.StaveTie({ first_note: null, last_note: j.to.note, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
            }
        } catch (e) { /* liaison impossible à dessiner : la portée reste lisible */ }
    });
    nseHandDrawn(svg);
    nseSmallTimeSig(svg);
    // Portée au repos : le cadre épouse la portée (largeur de ses mesures, hauteur de ses lignes, notes aiguës et graves comprises).
    if (opts.compact && svg) {
        const b = nseContentBox(svg, { x: 0, y: NSE_TOP - 20, w: Math.min(W, (geo.right || W) + NSE_PAD), h: height - NSE_TOP + 20 - 24 });
        const x0 = Math.floor(b.x - NSE_PAD), y0 = Math.floor(b.y - NSE_PAD);
        const view = { x: x0, y: y0, w: Math.ceil(b.x + b.w + NSE_PAD) - x0, h: Math.ceil(b.y + b.h + NSE_PAD) - y0 };
        geo.view = view;
        svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
        svg.setAttribute('width', String(Math.round(view.w * zoom))); svg.setAttribute('height', String(Math.round(view.h * zoom)));
        svg.style.width = `${Math.round(view.w * zoom)}px`;
    }
    return geo;
}

// ----- Ce que montrent les boutons, copier-coller, déplacement (fonctions sans état) -----

// Valeurs que montrent les boutons de durée, point, tuplet et silence. Quand une note vient d'être posée (selAuto), elle reste sélectionnée
// mais les boutons règlent la PROCHAINE note (cur) : ils doivent donc montrer cur, sinon le point semble resté allumé après un clic.
// tu = N du tuplet (0 : aucun).
function nseToolState(st, sel, selAuto, cur) {
    const e = (sel >= 0 && !selAuto) ? st.ev[sel] : null;
    return e ? { d: e.d, dot: !!e.dot, tu: e.tu || 0, rest: !e.p } : { d: cur.d, dot: !!cur.dot, tu: cur.tu || 0, rest: !!cur.rest };
}

// ----- Barre d'outils de la portée (petites icônes dessinées, sans dépendre d'une police musicale) -----

function nseNoteIcon(d) {
    const head = (open, x, y) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3.4" transform="rotate(-22 ${x} ${y})" ${open ? 'fill="none" stroke="currentColor" stroke-width="1.6"' : 'fill="currentColor"'}/>`;
    const stem = (x, y1, y2) => `<path d="M${x} ${y1}V${y2}" stroke="currentColor" stroke-width="1.5" fill="none"/>`;
    const flag = (y) => `<path d="M11.4 ${y}c0.4 3.2 4.6 4 4.6 7.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    let inner;
    if (d === 'w') inner = `<ellipse cx="10" cy="11" rx="6" ry="4" transform="rotate(-22 10 11)" fill="none" stroke="currentColor" stroke-width="2"/>`;
    else if (d === 'h') inner = head(true, 7, 16) + stem(11.2, 15, 3);
    else if (d === 'q') inner = head(false, 7, 16) + stem(11.2, 15, 3);
    else if (d === '8') inner = head(false, 7, 16) + stem(11.2, 15, 3) + flag(3);
    else inner = head(false, 7, 16) + stem(11.2, 15, 3) + flag(3) + flag(7.5);
    return `<svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true">${inner}</svg>`;
}

const NSE_REST_ICON = '<svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true"><path d="M7 3l5 5-4 4.5 5 5.5c-3-1-5 .4-4.6 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NSE_COPY_ICON = '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2H10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const NSE_PASTE_ICON = '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="11.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5.5" y="1.3" width="5" height="3.2" rx="1" fill="currentColor"/></svg>';
const NSE_TIE_ICON = '<svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true"><ellipse cx="4.5" cy="5" rx="3.3" ry="2.4" transform="rotate(-22 4.5 5)" fill="currentColor"/><ellipse cx="17.5" cy="5" rx="3.3" ry="2.4" transform="rotate(-22 17.5 5)" fill="currentColor"/><path d="M4.5 9.5C8 16.5 14 16.5 17.5 9.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const NSE_MULTI_ICON = '<svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true"><rect x="1.5" y="2.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="7" cy="9" r="2.2" fill="currentColor"/><circle cx="13.5" cy="9" r="2.2" fill="currentColor"/></svg>';
const NSE_DURATION_TITLES = { w: 'Ronde (clavier : 5)', h: 'Blanche (clavier : 4)', q: 'Noire (clavier : 3)', '8': 'Croche (clavier : 2)', '16': 'Double-croche (clavier : 1)' };
const NSE_DURATION_KEYS = { '1': '16', '2': '8', '3': 'q', '4': 'h', '5': 'w' };

// Choix du swing de lecture : « Jam » (valeur 0, par défaut) suit le swing de la jam (onglet Annotations du mode Jam) ; sinon 50 % = croches droites, 67 % = triolet.
// Une valeur venue d'ailleurs (62 %…) reste proposée. jamPct : swing actuel de la jam, rappelé dans le libellé « Jam ».
const NSE_SWING_CHOICES = [[50, 'Droit · 50 %'], [55, '55 %'], [60, '60 %'], [65, '65 %'], [67, 'Triolet · 67 %'], [70, '70 %'], [75, '75 %']];
function nseSwingAutoLabel(jamPct) { return jamPct ? `Jam · ${jamPct} %` : 'Jam'; }
function nseSwingOptions(current, jamPct) {
    const cur = Number(current) || 0;
    const list = NSE_SWING_CHOICES.slice();
    if (cur && !list.some(c => c[0] === cur)) { list.push([cur, `${cur} %`]); list.sort((a, b) => a[0] - b[0]); }
    list.unshift([0, nseSwingAutoLabel(jamPct)]);
    return list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');
}

// Choix de l'instrument transpositeur de la portée (valeur vide = « Jam » : celui de la jam, toujours proposé pour y revenir).
const NSE_INSTR_CHOICES = [['C', 'En Ut'], ['Bb', 'En Si♭'], ['Eb', 'En Mi♭']];
function nseInstrOptions(current) {
    const cur = NSE_N.clampStaffInstr(current);
    const list = NSE_INSTR_CHOICES.slice();
    list.unshift(['', 'Jam']);
    return list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');
}

function nseTupletOptions(current) {
    return `<option value="0"${!current ? ' selected' : ''}>Tuplet</option>` + NSE_N.SN_TUPLETS.map(n => `<option value="${n}"${n === current ? ' selected' : ''}>${NSE_N.SN_TUPLET_NAMES[n]} (${n})</option>`).join('');
}

function nseKeyOptions(current) {
    const opts = [];
    for (let k = -7; k <= 7; k++) {
        const label = k === 0 ? 'Do maj. · aucune' : `${NSE_N.SN_KEY_LABELS[k]} maj. · ${Math.abs(k)}${k > 0 ? '♯' : '♭'}`;
        opts.push(`<option value="${k}"${k === current ? ' selected' : ''}>${label}</option>`);
    }
    return opts.join('');
}

// HTML de la barre d'outils d'une portée (pur : testé sans navigateur).
function nseToolsHtml(st, cur, jamPct) {
    const dur = ['w', 'h', 'q', '8', '16'].map(d => `<button type="button" class="ns-btn" data-dur="${d}" title="${NSE_DURATION_TITLES[d]}" aria-label="${NSE_DURATION_TITLES[d]}">${nseNoteIcon(d)}</button>`).join('');
    const meters = NSE_N.SN_METERS.map(m => `<option value="${m}"${m === st.meter ? ' selected' : ''}>${m}</option>`).join('');
    return `
        <button type="button" class="ns-btn ns-txt ns-exit" data-act="exit" title="Revenir à la mise en forme du texte" aria-label="Revenir à la mise en forme du texte">◂ Texte</button>
        <span class="ns-sep"></span>
        <div class="ns-grp" role="group" aria-label="Durée de la prochaine note">${dur}
            <button type="button" class="ns-btn" data-mod="dot" title="Note pointée (clavier : .)" aria-label="Note pointée"><b>•</b></button>
            <select class="ns-sel ns-sel-tup" data-set="tuplet" title="Tuplet : transforme la note sélectionnée en triolet, quintolet, sextolet… (vraies notes, dans la même durée) ; sans note sélectionnée, règle les prochaines notes. Clavier : t = triolet" aria-label="Tuplet">${nseTupletOptions(cur && cur.tu)}</select>
            <button type="button" class="ns-btn" data-mod="rest" title="Silence : le prochain clic pose un silence (clavier : r)" aria-label="Silence">${NSE_REST_ICON}</button>
            <button type="button" class="ns-btn" data-act="tie" title="Liaison de prolongation : relie la note sélectionnée à la suivante, de même hauteur (clavier : l). Sur la dernière note, ajoute une note liée. Plusieurs notes sélectionnées : toutes les liaisons possibles." aria-label="Liaison de prolongation">${NSE_TIE_ICON}</button>
        </div>
        <span class="ns-sep"></span>
        <div class="ns-grp" role="group" aria-label="Altération de la note sélectionnée">
            <button type="button" class="ns-btn" data-alt="1" title="Dièse (clavier : #)" aria-label="Dièse">♯</button>
            <button type="button" class="ns-btn" data-alt="-1" title="Bémol (clavier : -)" aria-label="Bémol">♭</button>
            <button type="button" class="ns-btn" data-alt="0" title="Bécarre (clavier : n)" aria-label="Bécarre">♮</button>
        </div>
        <span class="ns-sep"></span>
        <select class="ns-sel" data-set="clef" aria-label="Clé"><option value="t"${st.clef === 't' ? ' selected' : ''}>Clé de sol</option><option value="b"${st.clef === 'b' ? ' selected' : ''}>Clé de fa</option></select>
        <select class="ns-sel" data-set="meter" aria-label="Mesure">${meters}</select>
        <select class="ns-sel ns-sel-key" data-set="ks" aria-label="Armure">${nseKeyOptions(st.ks)}</select>
        <button type="button" class="ns-btn ns-txt" data-act="pickup" title="Levée (anacrouse) : la portée commence par une mesure incomplète. Sélectionnez la dernière note de la levée puis cliquez ici, ou écrivez les notes de la levée puis cliquez dans la portée derrière la barre de mesure." aria-label="Levée (anacrouse)">Levée</button>
        <span class="ns-sep"></span>
        <label class="ns-zoom" title="Taille de la portée">
            <span class="ns-zoom-lab" aria-hidden="true">Taille</span>
            <input type="range" class="ns-range" data-set="size" min="${NSE_N.SN_SIZE_MIN}" max="${NSE_N.SN_SIZE_MAX}" step="${NSE_N.SN_SIZE_STEP}" value="${st.size || NSE_N.SN_SIZE_DEFAULT}" aria-label="Taille de la portée en pourcentage">
            <output class="ns-zoom-val">${st.size || NSE_N.SN_SIZE_DEFAULT} %</output>
        </label>
        <span class="ns-sep"></span>
        <label class="ns-zoom ns-tempo" title="Tempo de lecture de la portée, en noires par minute (vide : tempo de la jam)">
            <span class="ns-zoom-lab" aria-hidden="true">♩ =</span>
            <input type="number" class="ns-num" data-set="bpm" min="${NSE_N.SN_BPM_MIN}" max="${NSE_N.SN_BPM_MAX}" step="1" inputmode="numeric" placeholder="jam" value="${st.bpm || ''}" aria-label="Tempo de lecture, en noires par minute">
        </label>
        <label class="ns-zoom ns-swing" title="Swing de lecture : « Jam » suit le swing de la jam (par défaut) ; 50 % = croches droites, 67 % = triolet, plus haut = plus pointé">
            <span class="ns-zoom-lab" aria-hidden="true">Swing</span>
            <select class="ns-sel ns-sel-inline" data-set="swing" aria-label="Swing de lecture"${NSE_N.staffMeterAllowsSwing(st.meter) ? '' : ' disabled'}>${nseSwingOptions(st.swing || 0, jamPct)}</select>
        </label>
        <label class="ns-zoom ns-instr" title="Instrument transpositeur de la portée : la hauteur écrite est transposée à la lecture">
            <span class="ns-zoom-lab" aria-hidden="true">Instr.</span>
            <select class="ns-sel ns-sel-inline" data-set="instr" aria-label="Instrument transpositeur">${nseInstrOptions(st.instr)}</select>
        </label>
        <div class="ns-grp">
            <button type="button" class="ns-btn ns-play" data-act="play" title="Écouter la portée" aria-label="Écouter la portée">▶</button>
            <button type="button" class="ns-btn" data-act="undo" title="Annuler le dernier changement de la portée (⌘Z)" aria-label="Annuler">↶</button>
            <button type="button" class="ns-btn" data-act="del" title="Supprimer la note sélectionnée (Suppr.)" aria-label="Supprimer la note sélectionnée">⌫</button>
            <button type="button" class="ns-btn ns-multi" data-act="multi" title="Sélection multiple : touchez les notes pour les ajouter ou les retirer du groupe, glissez dans le vide pour les encadrer. Sur ordinateur : ⌘ / Ctrl + clic pour ajouter, Maj + clic pour une plage, Maj + glisser pour encadrer, ⌘A pour tout" aria-label="Sélection multiple">${NSE_MULTI_ICON}</button>
            <button type="button" class="ns-btn" data-act="copy" title="Copier cette portée (⌘C) pour la coller ici ou dans une autre zone. Avec des notes sélectionnées : copie ces notes." aria-label="Copier la portée">${NSE_COPY_ICON}</button>
            <button type="button" class="ns-btn" data-act="paste" title="Coller la portée copiée, juste après celle-ci (⌘V). Avec des notes copiées et une sélection : colle ces notes après la sélection." aria-label="Coller la portée copiée">${NSE_PASTE_ICON}</button>
            <button type="button" class="ns-btn ns-txt" data-act="clear" title="Effacer toutes les notes">Vider</button>
            <button type="button" class="ns-btn ns-txt ns-danger" data-act="remove" title="Supprimer cette portée">✕ Portée</button>
        </div>
        <button type="button" class="ns-btn ns-txt ns-more-btn" data-act="more" aria-expanded="false" title="Autres réglages : clé, mesure, armure, levée, taille, tempo, swing, copier, coller, vider, supprimer" aria-label="Autres réglages de la portée">⋯</button>`;
}

// Touche du clavier → action sur la ou les notes sélectionnées (pur : testé sans navigateur). Renvoie null si la touche n'est pas pour la portée.
function nseKeyAction(key, mods = {}) {
    if (mods.meta || mods.ctrl) {
        const k = String(key).toLowerCase();
        if (k === 'z') return { type: 'undo' };
        if (k === 'a') return { type: 'selectAll' };
        if (k === 'c') return { type: 'copy' };
        if (k === 'x') return { type: 'cut' };
        if (k === 'v') return { type: 'paste' };
        return null;
    }
    if (key === 'ArrowUp') return { type: 'shift', steps: mods.shift ? 7 : 1 };
    if (key === 'ArrowDown') return { type: 'shift', steps: mods.shift ? -7 : -1 };
    if (key === 'ArrowLeft') return mods.shift ? { type: 'extend', delta: -1 } : { type: 'move', delta: -1 };
    if (key === 'ArrowRight') return mods.shift ? { type: 'extend', delta: 1 } : { type: 'move', delta: 1 };
    if (key === 'l' || key === 'L') return { type: 'tie' };
    if (key === 'Delete' || key === 'Backspace') return { type: 'delete' };
    if (key === 'Escape') return { type: 'deselect' };
    if (/^[a-gA-G]$/.test(key)) return { type: 'letter', letter: key.toLowerCase() };
    if (key === '#') return { type: 'alter', delta: 1 };
    if (key === '-') return { type: 'alter', delta: -1 };
    if (key === 'n' || key === 'N') return { type: 'alter', delta: null };
    if (key === '.') return { type: 'mod', mod: 'dot' };
    if (key === 't' || key === 'T') return { type: 'tuplet', n: 3 };
    if (key === 'r' || key === 'R') return { type: 'mod', mod: 'rest' };
    if (NSE_DURATION_KEYS[key]) return { type: 'dur', dur: NSE_DURATION_KEYS[key] };
    return null;
}

// Hauteur la plus proche de la hauteur actuelle pour la lettre demandée (touche a-g).
function nseNearestLetter(p, letter, ks) {
    const here = NSE_N.pitchDia(p);
    let best = null;
    for (let o = p.o - 1; o <= p.o + 1; o++) {
        const dia = o * 7 + 'cdefgab'.indexOf(letter);
        if (best === null || Math.abs(dia - here) < Math.abs(best - here)) best = dia;
    }
    return NSE_N.pitchFromDia(best, ks);
}

// ----- Portée éditable -----

let NSE_ACTIVE = null; // la portée dont la barre d'outils est ouverte (une seule à la fois)
let NSE_NOTE_CLIP = null; // notes copiées (staffExtractEvents) : se collent dans n'importe quelle portée, après la sélection ; une copie de portée entière l'efface

// opts : isEditable() → l'annotation est modifiable ; onChange(view) après chaque modification ; onActivate(view) quand on clique dans la portée ;
//        canvas() → le canevas de la zone (ui/annot-canvas.js) : sélection et déplacement des blocs ;
//        onCopy(view), onPaste(view) : boutons Copier / Coller de la barre d'outils ;
//        onGrab(view) quand le bloc est saisi pour être redimensionné (avant tout changement) ;
//        onMoved(view) quand le bloc vient d'être redimensionné (à enregistrer tout de suite, pour que ↶ l'annule) ;
//        audio : { ready() → Promise, now(), play(midi, secondes, durée) → nœud audio ou null (la transposition de la jam est appliquée par play), bpm(),
//                  swing() → swing de la jam (0,5 à 0,75), suivi tant que la portée n'a pas son propre réglage }
class NoteStaffView {
    constructor(el, opts) {
        this.el = el;
        this.opts = opts;
        this.st = NSE_N.parseStaff(el.getAttribute('data-staff') || '') || NSE_N.staffDefault();
        this.sel = -1;          // événement « actif » de la sélection (le dernier choisi) ; -1 = aucune sélection
        this.selSet = new Set(); // tous les événements sélectionnés (note, silence) ; contient `sel` dès qu'il n'est pas vide
        this.anchor = -1;       // point de départ d'une sélection étendue avec Maj
        this.multiMode = false; // mode « sélection multiple » (tactile) : toucher une note l'ajoute ou la retire du groupe
        this.selAuto = false;   // sélection posée par l'insertion d'une note (les boutons de durée ne la modifient pas)
        this.cur = { d: 'q', dot: false, tu: 0, rest: false }; // valeurs de la prochaine note
        this.history = [];
        this.geo = null;
        this.playing = null;
        el.__noteStaff = this;
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Portée : motif musical');
        el.innerHTML = '<button type="button" class="annot-staff-edit" contenteditable="false" title="Modifier la portée (un second clic en sort)" aria-label="Modifier la portée">✎</button>'
            + '<div class="annot-staff-svg"></div><div class="annot-staff-tools" role="toolbar" aria-label="Édition de la portée"></div>';
        // La barre d'outils de la portée prend la place de la barre de texte tant que la portée est active (opts.toolsHost) ; sinon elle reste ici, cachée.
        this.editBtn = el.querySelector('.annot-staff-edit');
        this._initPlace();
        this._showPos();
        this.svgHost = el.querySelector('.annot-staff-svg');
        this.tools = el.querySelector('.annot-staff-tools');
        this._bind();
        this._renderTools();
        this.render();
        this._observe();
    }

    get editable() { return !!this.opts.isEditable(); }

    // En édition : la portée occupe toute la largeur de la zone, avec ses outils. Au repos : le cadre épouse la portée écrite.
    get isActive() { return this.el.classList.contains('is-active'); }

    _canvas() { return this.opts.canvas ? this.opts.canvas() : null; }

    // Place de la portée : data-at (place sur le canevas de la zone). Une portée écrite avant les canevas n'a que l'ancien décalage data-pos, relatif
    // à sa place dans le texte : `legacy` jusqu'à ce que la zone ait reconstruit la mise en page (index.html, _annotMigrate).
    _initPlace() {
        const at = NSE_N.parseBlockAt(this.el.getAttribute('data-at') || '');
        this.legacy = !at;
        this.pos = at || NSE_N.parseStaffPos(this.el.getAttribute('data-pos') || '') || { x: 0, y: 0 };
        this.border = NSE_N.parseBlockBorder(this.el.getAttribute('data-border'));
        this.el.classList.toggle('no-border', !this.border);
    }

    // La zone d'annotation qui contient la portée (sa largeur fixe la largeur de mise en page).
    _zone() { return this.el.closest('.jam-annot-text') || this.el.parentElement; }

    // Redessine la portée quand la largeur de sa zone change (fenêtre redimensionnée, panneau replié…).
    _observe() {
        if (this._ro || typeof ResizeObserver === 'undefined') return;
        const z = this._zone();
        if (!z) return;
        this._zoneW = Math.floor(z.clientWidth);
        this._ro = new ResizeObserver(() => {
            if (!this.el.isConnected) { this.destroy(); return; }
            const zz = this._zone();
            const w = zz ? Math.floor(zz.clientWidth) : 0;
            if (w > 0 && Math.abs(w - this._zoneW) > 6) { this._zoneW = w; this.render(); }
        });
        this._ro.observe(z);
    }

    // Largeur (en pixels de l'écran) disponible pour mettre la portée en page : celle du bloc en édition, celle de la zone au repos.
    // Les deux états découpent ainsi les lignes de la même façon : activer une portée ne change pas ses retours à la ligne.
    // En édition le bloc reste où il est : la largeur disponible est ce qui reste de la zone à droite de son coin haut gauche.
    _availWidth() {
        const z = this._zone();
        if (!z) return this._lastWidth || 600;
        const px = (v) => parseFloat(v) || 0;
        const zs = getComputedStyle(z), es = getComputedStyle(this.el);
        // Téléphone : la portée en édition occupe tout le cadre de la zone (style.css), elle part donc du bord gauche et n'a pas de marge à droite.
        const fills = this.isActive && !this.legacy && typeof acIsPhone === 'function' && acIsPhone();
        const left = (this.legacy || fills) ? 0 : Math.max(0, this.pos.x);
        const w = Math.floor(z.clientWidth - left - (fills ? 0 : px(zs.paddingRight)) - px(es.paddingLeft) - px(es.paddingRight) - px(es.borderLeftWidth) - px(es.borderRightWidth) - (this.legacy ? px(zs.paddingLeft) : 0));
        return w > 120 ? w : Math.max(this._lastWidth || 0, 360);
    }

    destroy() {
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        this.stop();
        if (NSE_ACTIVE === this) NSE_ACTIVE = null;
    }

    // Dessine la portée ; si VexFlow n'est pas là (ou échoue), un message remplace le dessin.
    render() {
        const active = this.isActive;
        this._lastWidth = this._availWidth();
        try {
            this.geo = drawNoteStaff(this.svgHost, this.st, { width: this._lastWidth, selected: active ? this._selList() : [], compact: !active });
        } catch (e) {
            this.geo = null;
            this.svgHost.textContent = 'Portée non affichable';
        }
        const empty = active && this.st.ev.length === 0;
        let hint = this.svgHost.querySelector('.annot-staff-hint');
        if (empty && !hint) {
            hint = document.createElement('div');
            hint.className = 'annot-staff-hint';
            const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
            hint.textContent = touch ? 'Choisissez une durée, puis touchez la portée' : 'Choisissez une durée puis cliquez sur la portée pour poser des notes';
            this.svgHost.appendChild(hint);
        }
        if (this.playing && this._hiEv >= 0) this._markPlaying(this._hiEv);
        this._refreshTools();
    }

    _renderTools() { this.tools.innerHTML = nseToolsHtml(this.st, this.cur, this._jamSwingPct()); }

    // Swing de la jam, en % (0 s'il n'en donne pas) : rappelé dans l'entrée « Jam » du menu Swing.
    _jamSwingPct() {
        const a = this.opts.audio;
        try { const v = a && a.swing ? a.swing() : null; return typeof v === 'number' && v > 0 ? Math.round(v * 100) : 0; } catch (e) { return 0; }
    }

    // Boutons allumés selon la sélection (ou, sans sélection, selon les valeurs de la prochaine note).
    _refreshTools() {
        const e = this.sel >= 0 ? this.st.ev[this.sel] : null;
        const v = nseToolState(this.st, this.sel, this.selAuto, this.cur);
        this.tools.querySelectorAll('[data-dur]').forEach(b => b.classList.toggle('is-on', b.dataset.dur === v.d));
        const on = (mod, val) => { const b = this.tools.querySelector(`[data-mod="${mod}"]`); if (b) b.classList.toggle('is-on', !!val); };
        on('dot', v.dot); on('rest', v.rest);
        const tu = this.tools.querySelector('[data-set="tuplet"]');
        if (tu) {
            tu.value = String(v.tu || 0);
            const sel = this.sel >= 0 && !this.selAuto ? this.st.ev[this.sel] : null;
            const ok = sel && !sel.tu ? NSE_N.staffTupletChoices(sel) : null;
            tu.querySelectorAll('option').forEach(o => { const n = Number(o.value); o.disabled = !!(ok && n > 0 && !ok.includes(n)); });
        }
        const pk = this.tools.querySelector('[data-act="pickup"]'); if (pk) pk.classList.toggle('is-on', NSE_N.layoutStaff(this.st).pickup);
        const bpm = this.tools.querySelector('[data-set="bpm"]'); if (bpm && document.activeElement !== bpm) bpm.value = this.st.bpm ? String(this.st.bpm) : '';
        const sw = this.tools.querySelector('[data-set="swing"]');
        if (sw) {
            const cur = this.st.swing || 0;
            const jamPct = this._jamSwingPct();
            if (!sw.querySelector(`option[value="${cur}"]`)) sw.innerHTML = nseSwingOptions(cur, jamPct);
            const auto = sw.querySelector('option[value="0"]');
            if (auto) auto.textContent = nseSwingAutoLabel(jamPct);
            sw.value = String(cur);
            sw.disabled = !NSE_N.staffMeterAllowsSwing(this.st.meter);
        }
        const ins = this.tools.querySelector('[data-set="instr"]');
        if (ins) { const cur = NSE_N.clampStaffInstr(this.st.instr); if (!ins.querySelector(`option[value="${cur}"]`)) ins.innerHTML = nseInstrOptions(cur); ins.value = cur; }
        const list = this._selList(), explicit = list.length > 0 && !this.selAuto;
        const tie = this.tools.querySelector('[data-act="tie"]'); if (tie) tie.classList.toggle('is-on', NSE_N.staffHasTie(this.st, list));
        const multi = this.tools.querySelector('[data-act="multi"]'); if (multi) { multi.classList.toggle('is-on', this.multiMode); multi.setAttribute('aria-pressed', this.multiMode ? 'true' : 'false'); }
        const cp = this.tools.querySelector('[data-act="copy"]');
        if (cp) cp.title = explicit ? `Copier les ${list.length > 1 ? list.length + ' notes sélectionnées' : 'notes sélectionnées'} (⌘C) : elles se collent après une sélection, ici ou dans une autre portée` : 'Copier cette portée (⌘C) pour la coller ici ou dans une autre zone';
        const ps = this.tools.querySelector('[data-act="paste"]');
        if (ps) ps.title = list.length && NSE_NOTE_CLIP ? 'Coller les notes copiées juste après la sélection (⌘V)' : 'Coller la portée copiée, juste après celle-ci (⌘V)';
        this.tools.querySelectorAll('[data-alt]').forEach(b => {
            const a = e && e.p ? e.p.a : null;
            b.classList.toggle('is-on', a !== null && ((b.dataset.alt === '0' && a === 0 && NSE_N.pitchFromDia(NSE_N.pitchDia(e.p), this.st.ks).a !== 0) || (b.dataset.alt !== '0' && a === Number(b.dataset.alt))));
        });
        const del = this.tools.querySelector('[data-act="del"]'); if (del) del.disabled = this.sel < 0;
        const un = this.tools.querySelector('[data-act="undo"]'); if (un) un.disabled = this.history.length === 0;
        const play = this.tools.querySelector('[data-act="play"]'); if (play) play.textContent = this.playing ? '■' : '▶';
        const sz = this.tools.querySelector('[data-set="size"]');
        if (sz && document.activeElement !== sz) sz.value = String(this.st.size || NSE_N.SN_SIZE_DEFAULT);
        const szv = this.tools.querySelector('.ns-zoom-val'); if (szv) szv.textContent = `${this.st.size || NSE_N.SN_SIZE_DEFAULT} %`;
        ['clef', 'meter', 'ks'].forEach(k => {
            const s = this.tools.querySelector(`[data-set="${k}"]`);
            if (s) s.value = String(k === 'clef' ? this.st.clef : (k === 'meter' ? this.st.meter : this.st.ks));
        });
    }

    activate() {
        if (NSE_ACTIVE && NSE_ACTIVE !== this) NSE_ACTIVE.deactivate();
        const wasActive = this.isActive;
        const cv = this._canvas();
        if (cv) cv.clearSelection(true); // une portée en édition n'est pas « sélectionnée » : ses outils remplacent ceux du texte
        NSE_ACTIVE = this;
        this.el.classList.add('is-active');
        this.el.classList.remove('is-picked');
        if (!wasActive) this.render(); // la portée prend toute la largeur de la zone
        const host = this.opts.toolsHost && this.opts.toolsHost();
        if (host && this.tools.parentNode !== host) host.appendChild(this.tools);
        if (this.opts.onActivate) this.opts.onActivate(this);
        if (!this._outside) {
            this._outside = (ev) => {
                if (this.el.contains(ev.target) || this.tools.contains(ev.target)) return;
                // Au doigt, un appui hors de la portée ne la ferme qu'au relâcher : faire défiler la page ne doit pas interrompre l'édition.
                if (ev.pointerType === 'touch' && typeof acOnTouchTap === 'function') acOnTouchTap(ev, () => { if (this.isActive) this.deactivate(); });
                else this.deactivate();
            };
            document.addEventListener('pointerdown', this._outside, true);
        }
    }

    deactivate() {
        const wasActive = this.isActive;
        this.el.classList.remove('is-active');
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        this.stop();
        if (this.tools.parentNode !== this.el) this.el.appendChild(this.tools);
        this._clearSel();
        this.multiMode = false;
        if (wasActive) this.render(); // le cadre se resserre autour de la portée écrite
        if (NSE_ACTIVE === this) NSE_ACTIVE = null;
        if (this.opts.onDeactivate) this.opts.onDeactivate(this);
    }

    // ----- Changements de la portée -----

    // Remplace la portée (annulable) : redessine, met à jour data-staff et prévient l'annotation.
    _apply(next, opts = {}) {
        if (NSE_N.formatStaff(next) === NSE_N.formatStaff(this.st)) return false;
        if (!opts.noHistory) { this.history.push(this.st); if (this.history.length > 60) this.history.shift(); }
        this.st = next;
        const n = this.st.ev.length;
        if (this.sel >= n) this.sel = n - 1;
        this.selSet = new Set(Array.from(this.selSet).filter(i => i < n));
        if (this.sel >= 0) this.selSet.add(this.sel); else this.selSet.clear();
        if (this.anchor >= n) this.anchor = n - 1;
        this.render();
        this.commit();
        return true;
    }

    commit() {
        this.el.setAttribute('data-staff', NSE_N.formatStaff(this.st));
        if (this.opts.onChange) this.opts.onChange(this);
    }

    undo() {
        const prev = this.history.pop();
        if (!prev) return;
        this._apply(prev, { noHistory: true });
    }

    // ----- Sélection : une note ou plusieurs (⌘ / Ctrl + clic, Maj + clic, rectangle, ⌘A) -----

    _clearSel() { this.sel = -1; this.anchor = -1; this.selSet = new Set(); this.selAuto = false; }

    select(i, auto = false) {
        this.sel = i;
        this.anchor = i;
        this.selSet = i >= 0 ? new Set([i]) : new Set();
        this.selAuto = auto;
        this.render();
    }

    // Indices des événements sélectionnés, dans l'ordre de la portée.
    _selList() { return Array.from(this.selSet).filter(i => this.st.ev[i]).sort((a, b) => a - b); }

    // Sélection voulue par l'utilisateur (la note qu'une insertion vient de sélectionner d'office ne compte pas).
    _explicitList() { return this.selAuto ? [] : this._selList(); }

    // Remplace la sélection (list : indices) ; focus : l'événement actif.
    _setSelection(list, focus, anchor) {
        this.selSet = new Set(list);
        this.sel = list.length ? (list.includes(focus) ? focus : list[list.length - 1]) : -1;
        this.anchor = list.length ? (anchor === undefined ? this.sel : anchor) : -1;
        this.selAuto = false;
        this.render();
    }

    // ⌘ / Ctrl + clic : ajoute ou retire l'événement du groupe.
    _toggleSel(i) {
        const set = new Set(this.selSet);
        if (set.has(i)) set.delete(i); else set.add(i);
        this._setSelection(Array.from(set).sort((a, b) => a - b), set.has(i) ? i : -1, i);
    }

    // Maj + clic : tous les événements entre le point de départ et `i` (en plus de la sélection actuelle si `additive`).
    _extendSel(i, additive = false) {
        const a = this.anchor >= 0 ? this.anchor : (this.sel >= 0 ? this.sel : i);
        const set = additive ? new Set(this.selSet) : new Set();
        for (let k = Math.min(a, i); k <= Math.max(a, i); k++) set.add(k);
        this._setSelection(Array.from(set).sort((a2, b2) => a2 - b2), i, a);
    }

    _selectAll() {
        const all = this.st.ev.map((_, i) => i);
        this._setSelection(all, all.length - 1, 0);
    }

    _hearEvent(i) {
        const e = this.st.ev[i];
        if (e && e.p) this._audition(NSE_N.pitchMidi(e.p));
    }

    // Écoute la note active de la sélection, sinon la première note qui reste dans le groupe.
    _hearSelection() {
        const e = this.st.ev[this.sel];
        if (e && e.p) { this._hearEvent(this.sel); return; }
        const first = this._selList().find(i => this.st.ev[i].p);
        if (first !== undefined) this._hearEvent(first);
    }

    // ----- Souris et doigt -----

    _bind() {
        const host = this.svgHost;
        this.tools.addEventListener('click', (ev) => this._toolClick(ev));
        this.tools.addEventListener('change', (ev) => this._toolChange(ev));
        this.tools.addEventListener('input', (ev) => this._toolInput(ev));
        host.addEventListener('pointerdown', (ev) => this._pointerDown(ev));
        host.addEventListener('pointermove', (ev) => this._pointerMove(ev));
        host.addEventListener('pointerleave', () => this._hideGhost());
        // Hors édition de la portée (lecture, ou bloc simplement posé), un simple clic sur une note la joue ; pas après un glisser (déplacement du bloc).
        host.addEventListener('pointerdown', (ev) => { this._downXY = { x: ev.clientX, y: ev.clientY }; }, true);
        host.addEventListener('click', (ev) => {
            if (this.isActive || !this.geo) return;
            const d = this._downXY;
            if (d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return;
            const hit = this._hitEvent(this._local(ev));
            if (hit >= 0) this._playNote(hit);
        });
        // On n'entre pas en édition en cliquant dans la portée : le crayon ✎ (au survol) l'ouvre, et un second clic la ferme.
        this.editBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        this.editBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (!this.editable) return;
            if (this.isActive) { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); } else this.activate();
        });
        // Hors édition, un clic-glisser n'importe où dans le bloc le déplace (avec les autres blocs sélectionnés) ; un clic le sélectionne ; un double-clic l'ouvre en édition.
        this.el.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.annot-staff-edit')) this._blockDown(ev); });
        // Les bords et les coins redimensionnent le bloc, comme pour un cadre de texte : le curseur qui les survole change de forme.
        this.el.addEventListener('pointermove', (ev) => this._hover(ev));
        this.el.addEventListener('pointerleave', () => { if (!this._resizing) this.el.style.cursor = ''; });
        this.el.addEventListener('dblclick', (ev) => { if (ev.target.closest('.annot-staff-edit')) return; ev.preventDefault(); ev.stopPropagation(); if (this.editable && !this.isActive) this.activate(); });
    }

    _local(ev) {
        const svg = this.svgHost.querySelector('svg');
        const r = (svg || this.svgHost).getBoundingClientRect();
        // Les positions de la géométrie sont en unités du dessin : on convertit les pixels de l'écran (la portée peut être agrandie ou réduite,
        // et au repos seule une partie du dessin est affichée : geo.view).
        const v = (this.geo && this.geo.view) || { x: 0, y: 0, w: this.geo ? this.geo.width : 1, h: 1 };
        const k = this.geo && r.width > 0 ? v.w / r.width : 1;
        this._k = k;
        return { x: v.x + (ev.clientX - r.left) * k, y: v.y + (ev.clientY - r.top) * k };
    }

    _lineAt(y) {
        if (!this.geo) return 0;
        return Math.max(0, Math.min(this.geo.lines.length - 1, Math.floor(y / NSE_BAND)));
    }

    // Note (ou silence) sous le pointeur : indice de l'événement, ou -1.
    _hitEvent(pt) {
        if (!this.geo) return -1;
        let best = -1, bestD = 1e9;
        const tol = Math.max(1, this._k || 1); // portée réduite : la zone de clic reste d'au moins 11 pixels à l'écran
        for (const r of this.geo.notes) {
            const dx = Math.abs(pt.x - r.x);
            if (dx > 11 * tol) continue;
            const L = this.geo.lines[r.line];
            const dy = r.rest ? ((pt.y >= L.bottomY - 4 * NSE_SPACING - 4 && pt.y <= L.bottomY + 4) ? 0 : 99) : Math.abs(pt.y - r.y);
            if (dy > 8 * tol) continue;
            const d = dx + dy;
            if (d < bestD) { bestD = d; best = r.ev; }
        }
        return best;
    }

    _insertIndexAt(line, x) {
        const recs = this.geo.notes.filter(r => r.line === line);
        if (!recs.length) return this.st.ev.length;
        for (const r of recs) if (r.x > x) return r.cont ? r.ev + 1 : r.ev;
        return recs[recs.length - 1].ev + 1;
    }

    // Où poser la note cliquée : { at, join, pickup }.
    //  - at : indice d'insertion, ramené sur une frontière (on n'écrit jamais au milieu d'un tuplet) ;
    //  - pickup : la portée n'a qu'une 1re mesure incomplète et le clic est DERRIÈRE sa barre : les notes déjà écrites deviennent la levée
    //    (anacrouse) et la note se crée derrière la barre ;
    //  - join : avec une levée, un clic avant sa barre prolonge la levée au lieu d'ouvrir la mesure suivante.
    _insertSpot(pt, line) {
        const n = this.st.ev.length;
        const geo = this.geo;
        const m0 = geo.measures.find(m => m.mi === 0);
        if (geo.firstOpen && m0 && this.st.pu === 0 && n > 0 && line === m0.line && pt.x >= m0.xe) return { at: n, join: false, pickup: true };
        let at = this._insertIndexAt(line, pt.x);
        const e = this.st.ev[at];
        if (e && e.tu && !NSE_N.staffTupletStarts(this.st.ev, at)) {
            const b = NSE_N.staffTupletBounds(this.st.ev, at);
            const a = geo.notes.find(r => r.ev === b.start), z = geo.notes.find(r => r.ev === b.end - 1);
            at = (a && z && pt.x < (a.x + z.x) / 2) ? b.start : b.end;
        }
        const join = this.st.pu > 0 && at === this.st.pu && !!m0 && line === m0.line && pt.x < m0.xe;
        return { at, join, pickup: false };
    }

    // Petit message qui s'efface (une action impossible, un conseil).
    _flashHint(text) {
        if (!this.svgHost) return;
        let h = this.svgHost.querySelector('.annot-staff-flash');
        if (!h) { h = document.createElement('div'); h.className = 'annot-staff-flash'; this.svgHost.appendChild(h); }
        h.textContent = text;
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => { if (h.parentNode) h.remove(); }, 3200);
    }

    _diaAt(pt, line) {
        const L = this.geo.lines[line];
        return NSE_N.diaFromY(pt.y, L.bottomY, NSE_SPACING, NSE_N.SN_BOTTOM_LINE[this.st.clef]);
    }

    _pointerDown(ev) {
        if (!this.editable || ev.button > 0 || !this.geo) return;
        if (!this.isActive) return; // au repos, un clic dans la portée ne fait rien : on l'ouvre avec le crayon ✎
        ev.preventDefault(); // garde le focus (et la sélection de texte) où ils sont
        this.activate();
        const pt = this._local(ev);
        const hit = this._hitEvent(pt);
        // Sélection multiple : ⌘ / Ctrl + clic ajoute ou retire une note, Maj + clic étend jusqu'à elle, Maj / ⌘ + glisser dans le vide trace un rectangle ;
        // le mode « sélection multiple » (bouton, pour le doigt) fait de chaque toucher un ajout / retrait.
        const addKey = ev.metaKey || ev.ctrlKey, rangeKey = ev.shiftKey;
        if (addKey || rangeKey || this.multiMode) {
            if (hit >= 0) {
                if (rangeKey) this._extendSel(hit, addKey); else this._toggleSel(hit);
                if (this.selSet.has(hit)) this._hearEvent(hit);
            } else this._startMarquee(ev, pt, !(addKey || rangeKey));
            return;
        }
        let dragEv = -1, moved = false, wasSelected = false, group = false;
        if (hit >= 0) {
            // Une note du groupe sélectionné : le groupe reste choisi pour pouvoir le glisser en bloc ; un simple clic ne garde ensuite que cette note.
            group = !this.selAuto && this.selSet.size > 1 && this.selSet.has(hit);
            wasSelected = !group && this.sel === hit && !this.selAuto;
            if (group) { this.sel = hit; this.anchor = hit; } else this.select(hit, false);
            this._hearEvent(hit);
            if (this.st.ev[hit].p) dragEv = hit;
            else if (group) { this.select(hit, false); group = false; }
        } else {
            const line = this._lineAt(pt.y);
            const spot = this._insertSpot(pt, line);
            const at = spot.at;
            const c = this.cur;
            let p = null;
            if (!c.rest) p = NSE_N.pitchFromDia(this._diaAt(pt, line), this.st.ks);
            if (!c.rest && !p) return;
            let base = this.st;
            if (spot.pickup) {
                // Les notes déjà écrites forment la levée, à condition d'être plus courtes qu'une mesure.
                const withPickup = NSE_N.staffSetPickup(this.st, this.st.ev.length);
                if (NSE_N.layoutStaff(withPickup).pickup) base = withPickup;
                else this._flashHint('La levée doit être plus courte qu\'une mesure');
            }
            const proto = { d: c.d, dot: c.dot, p };
            const next = c.tu ? NSE_N.staffInsertTupletGroup(base, at, proto, c.tu, { joinPickup: spot.join }) : NSE_N.insertEvent(base, at, proto, { joinPickup: spot.join });
            if (next.ev.length === base.ev.length) { this._flashHint('Portée pleine'); return; }
            if (!this._apply(next)) return;
            this.select(at, true);
            if (p) { this._audition(NSE_N.pitchMidi(p)); dragEv = at; }
        }
        // Glisser vers le haut ou le bas change la hauteur de la note touchée (de tout le groupe, si elle en fait partie).
        if (dragEv < 0) return;
        const host = this.svgHost;
        try { host.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const line = this.geo.notes.find(r => r.ev === dragEv);
        const lineIdx = line ? line.line : 0;
        const onMove = (e2) => {
            const p2 = this._local(e2);
            if (!moved && Math.abs(p2.y - pt.y) < 4 * Math.max(1, this._k || 1)) return;
            const dia = this._diaAt(p2, lineIdx);
            const e0 = this.st.ev[dragEv];
            if (!e0 || !e0.p) return;
            if (group) {
                const delta = dia - NSE_N.pitchDia(e0.p);
                if (!delta) return;
                if (!this._apply(NSE_N.shiftEvents(this.st, this._selList(), delta))) return; // une note sortirait de la portée : le groupe ne bouge pas
                moved = true;
                this._audition(NSE_N.pitchMidi(this.st.ev[dragEv].p));
                return;
            }
            const np = NSE_N.pitchFromDia(dia, this.st.ks);
            if (!np) return;
            if (NSE_N.pitchDia(np) === NSE_N.pitchDia(e0.p)) return;
            moved = true;
            this._apply(NSE_N.updateEvent(this.st, dragEv, { p: np }));
            this._audition(NSE_N.pitchMidi(np));
        };
        const onUp = () => {
            host.removeEventListener('pointermove', onMove);
            host.removeEventListener('pointerup', onUp);
            host.removeEventListener('pointercancel', onUp);
            try { host.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (moved) return;
            if (group) this.select(hit, false);
            else if (wasSelected && hit === dragEv) this.select(-1);
        };
        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerup', onUp);
        host.addEventListener('pointercancel', onUp);
    }

    // Rectangle de sélection : glisser dans le vide (Maj / ⌘ / Ctrl enfoncé, ou en mode « sélection multiple ») ajoute au groupe toutes les notes et tous
    // les silences touchés. Un simple toucher dans le vide (mode « sélection multiple » seulement) vide la sélection.
    _startMarquee(ev, pt0, clearOnTap) {
        const host = this.svgHost;
        const base = new Set(this.selSet);
        const x0 = ev.clientX, y0 = ev.clientY;
        let box = null, moved = false, lastKey = '';
        try { host.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const onMove = (e2) => {
            if (!moved && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 4) return;
            moved = true;
            const hr = host.getBoundingClientRect();
            if (!box) { box = document.createElement('div'); box.className = 'annot-marquee'; }
            if (!box.isConnected) host.appendChild(box); // le dessin de la portée vide son conteneur à chaque changement de sélection
            const l = Math.min(x0, e2.clientX), t = Math.min(y0, e2.clientY), r = Math.max(x0, e2.clientX), b = Math.max(y0, e2.clientY);
            // le conteneur peut défiler : le rectangle se place dans le contenu défilant, sous le pointeur
            box.style.left = `${l - hr.left - host.clientLeft + host.scrollLeft}px`; box.style.top = `${t - hr.top - host.clientTop + host.scrollTop}px`;
            box.style.width = `${r - l}px`; box.style.height = `${b - t}px`;
            const p1 = this._local(e2);
            const xa = Math.min(pt0.x, p1.x), xb = Math.max(pt0.x, p1.x), ya = Math.min(pt0.y, p1.y), yb = Math.max(pt0.y, p1.y);
            const set = new Set(base);
            this.geo.notes.forEach((n) => { if (n.x >= xa - 4 && n.x <= xb + 4 && n.y >= ya - 6 && n.y <= yb + 6) set.add(n.ev); });
            const list = Array.from(set).sort((a, c) => a - c);
            const key = list.join(',');
            if (key === lastKey) return;
            lastKey = key;
            this._setSelection(list, list.length ? list[list.length - 1] : -1, list.length ? list[0] : undefined);
            if (!box.isConnected) host.appendChild(box);
        };
        const onUp = () => {
            host.removeEventListener('pointermove', onMove);
            host.removeEventListener('pointerup', onUp);
            host.removeEventListener('pointercancel', onUp);
            try { host.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (box) box.remove();
            if (!moved && clearOnTap && this.selSet.size) this.select(-1);
        };
        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerup', onUp);
        host.addEventListener('pointercancel', onUp);
    }

    // Survol à la souris : une note fantôme montre la hauteur qui sera posée.
    _pointerMove(ev) {
        if (!this.editable || !this.geo || !this.isActive || ev.buttons || ev.pointerType === 'touch' || this.cur.rest) { this._hideGhost(); return; }
        const pt = this._local(ev);
        if (this._hitEvent(pt) >= 0) { this._hideGhost(); return; }
        const line = this._lineAt(pt.y);
        const dia = this._diaAt(pt, line);
        const p = NSE_N.pitchFromDia(dia, this.st.ks);
        if (!p) { this._hideGhost(); return; }
        const L = this.geo.lines[line];
        const y = NSE_N.yFromDia(dia, L.bottomY, NSE_SPACING, NSE_N.SN_BOTTOM_LINE[this.st.clef]);
        let g = this.svgHost.querySelector('.annot-ghost');
        if (!g) {
            g = document.createElement('div');
            g.className = 'annot-ghost';
            g.innerHTML = '<i></i><span></span>';
            this.svgHost.appendChild(g);
        }
        const back = 1 / (this._k || 1); // unités du dessin → pixels de l'écran
        const v = this.geo.view || { x: 0, y: 0 };
        g.style.left = `${(pt.x - v.x) * back - 6}px`;
        g.style.top = `${(y - v.y) * back - 4.5}px`;
        g.lastChild.textContent = NSE_N.pitchLabel(p) + (this._insertSpot(pt, line).pickup ? ' · levée' : '');
    }

    _hideGhost() { const g = this.svgHost.querySelector('.annot-ghost'); if (g) g.remove(); }

    // ----- Place du bloc sur le canevas -----

    // Affiche la place (data-at) : la portée est positionnée en absolu dans sa zone. Une portée « héritée » (pas encore migrée) garde l'ancien décalage relatif.
    _showPos() {
        const { x, y } = this.pos;
        if (this.legacy) {
            this.el.style.left = x ? `${x}px` : '';
            this.el.style.top = y ? `${y}px` : '';
            const t = NSE_N.formatStaffPos(this.pos);
            if (t) this.el.setAttribute('data-pos', t); else this.el.removeAttribute('data-pos');
            return;
        }
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.setProperty('--bx', `${x}px`); // origine du zoom de la zone (voir style.css)
        this.el.style.setProperty('--by', `${y}px`);
        this.el.setAttribute('data-at', NSE_N.formatBlockAt(this.pos));
        this.el.removeAttribute('data-pos');
    }

    // Pose la place (entiers positifs, sur le canevas) ; renvoie true si elle a changé. N'enregistre rien (voir commit).
    setAt(pos) {
        const x = NSE_N.clampBlockAt(pos.x), y = NSE_N.clampBlockAt(pos.y);
        if (!this.legacy && x === this.pos.x && y === this.pos.y) return false;
        this.legacy = false;
        this.pos = { x, y };
        this._showPos();
        return true;
    }

    // Place le bloc pour que son coin haut gauche tombe en `desired` { left, top } (pixels de l'écran).
    placeAt(desired) {
        const z = this._zone();
        if (!z) return;
        const r = z.getBoundingClientRect();
        const k = typeof acZoomOf === 'function' ? acZoomOf(z) : 1; // la zone peut être agrandie : les places sont celles du canevas à 100 %
        this.setAt({ x: Math.max(0, (desired.left - r.left - z.clientLeft + z.scrollLeft) / k), y: Math.max(0, (desired.top - r.top - z.clientTop + z.scrollTop) / k) });
    }

    // Bord du bloc visible ou non (la portée, elle, reste affichée) ; renvoie true si cela change.
    setBorder(on) {
        on = !!on;
        if (on === this.border) return false;
        this.border = on;
        this.el.classList.toggle('no-border', !on);
        if (on) this.el.removeAttribute('data-border'); else this.el.setAttribute('data-border', '0');
        return true;
    }

    // ----- Redimensionner : bords et coins (hors édition), comme un cadre de texte (ui/text-frame.js) -----
    // Tirer change la taille de la portée (le même réglage que le curseur « Taille » : 50 à 200 %, par pas de 10) ; le coin ou le bord opposé reste en place.

    // Zone sensible sous le pointeur ('' = le milieu du bloc, ou le crayon).
    _zoneAt(ev) {
        if (ev.target.closest && ev.target.closest('.annot-staff-edit')) return '';
        const r = this.el.getBoundingClientRect();
        const touch = ev.pointerType === 'touch';
        return ntfHitZone(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height, touch ? NTF_EDGE_TOUCH : NTF_EDGE, touch ? NTF_CORNER_TOUCH : NTF_CORNER);
    }

    _hover(ev) {
        if (ev.buttons || this._resizing || ev.pointerType === 'touch') return;
        this.el.style.cursor = (!this.editable || this.isActive) ? '' : ntfCursor(this._zoneAt(ev));
    }

    _resizeDown(ev, zone) {
        const el = this.el;
        const cv = this._canvas();
        if (cv) cv.select([el], 'set', true);
        if (this.opts.onGrab) this.opts.onGrab(this);
        const r0 = el.getBoundingClientRect();
        const s0 = this.st.size || NSE_N.SN_SIZE_DEFAULT, pos0 = { ...this.pos };
        const x0 = ev.clientX, y0 = ev.clientY;
        let changed = false;
        this._resizing = true;
        el.style.cursor = ntfCursor(zone);
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const setSize = (s) => this._apply(Object.assign(NSE_N.cloneStaff(this.st), { size: s }), { noHistory: true });
        const end = (drop) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onCancel);
            document.removeEventListener('keydown', onKey, true);
            try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            this._resizing = false;
            el.style.cursor = '';
            if (!drop) {
                if (changed) { setSize(s0); this.pos = pos0; this._showPos(); }
                return;
            }
            if (!changed) { this._pick(); return; }
            this.commit();
            if (this.opts.onMoved) this.opts.onMoved(this);
            this._pick();
        };
        const onMove = (e2) => {
            if (!changed && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 3) return;
            const res = ntfResizeScale(zone, r0.width, r0.height, s0, e2.clientX - x0, e2.clientY - y0, { min: NSE_N.SN_SIZE_MIN, max: NSE_N.SN_SIZE_MAX });
            const s = NSE_N.clampStaffSize(res.s);
            if (s === (this.st.size || NSE_N.SN_SIZE_DEFAULT)) { changed = changed || s !== s0; return; }
            changed = true;
            setSize(s);
            const r1 = el.getBoundingClientRect();
            this.placeAt({ left: r0.left + res.ax * (r0.width - r1.width), top: r0.top + res.ay * (r0.height - r1.height) }, false);
        };
        const onUp = () => end(true);
        const onCancel = () => end(false);
        const onKey = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); end(false); } };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
        document.addEventListener('keydown', onKey, true);
    }

    // Hors édition, appui sur le bloc : un clic le sélectionne (Maj / ⌘ / Ctrl + clic : ajoute ou retire le bloc de la sélection ; ⌘C copie, ⌘X coupe, Suppr. enlève,
    // les flèches décalent d'un pixel). Un appui sur un bord ou un coin le redimensionne ; ailleurs, glisser déplace toute la sélection (ui/annot-canvas.js).
    _blockDown(ev) {
        if (!this.editable || ev.button > 0 || this.isActive) return;
        ev.preventDefault();
        ev.stopPropagation();
        const zone = this._zoneAt(ev);
        const cv = this._canvas();
        const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        if (zone && !additive) this._resizeDown(ev, zone);
        else if (cv) cv.startMove(this, ev);
    }

    // Sélectionne le bloc (seul) : la zone prend le focus pour que ⌘C, ⌘X, Suppr. et les flèches s'appliquent à lui.
    _pick() {
        const cv = this._canvas();
        if (cv) cv.select([this.el], 'set', true);
    }

    // ----- Barre d'outils -----

    _toolClick(ev) {
        const b = ev.target.closest('button');
        if (!b || !this.editable) return;
        this.activate();
        const selEv = this.sel >= 0 ? this.st.ev[this.sel] : null;
        const applyToSel = selEv && !this.selAuto;
        if (b.dataset.dur) {
            this.cur.d = b.dataset.dur;
            if (applyToSel) this._updateGroup({ d: b.dataset.dur });
            this._refreshTools();
        } else if (b.dataset.mod) {
            this._applyMod(b.dataset.mod);
        } else if (b.dataset.alt !== undefined) {
            const list = this._selList();
            if (list.some(i => this.st.ev[i].p)) {
                const a = b.dataset.alt === '0' ? null : Number(b.dataset.alt);
                this._apply(list.length > 1 ? NSE_N.alterEvents(this.st, list, a) : NSE_N.alterEvent(this.st, list[0], a));
                this._hearSelection();
            }
        } else if (b.dataset.act) {
            const act = b.dataset.act;
            if (act === 'play') this.playing ? this.stop() : this.play();
            else if (act === 'pickup') this._togglePickup();
            else if (act === 'undo') this.undo();
            else if (act === 'del') this._deleteSelected();
            else if (act === 'clear') { this._clearSel(); this._apply(Object.assign(NSE_N.cloneStaff(this.st), { ev: [], pu: 0 })); }
            else if (act === 'tie') this._toggleTie();
            else if (act === 'multi') { this.multiMode = !this.multiMode; this._refreshTools(); if (this.multiMode) this._flashHint('Touchez les notes pour les ajouter au groupe ; glissez dans le vide pour les encadrer'); }
            else if (act === 'copy') {
                if (this._explicitList().length) this._copyNotes(this._explicitList());
                else { NSE_NOTE_CLIP = null; if (this.opts.onCopy) this.opts.onCopy(this); }
            }
            else if (act === 'paste') {
                if (this._selList().length && NSE_NOTE_CLIP) this._pasteNotes();
                else if (this.opts.onPaste) this.opts.onPaste(this);
            }
            else if (act === 'remove') { if (this.opts.onRemove) this.opts.onRemove(this); }
            else if (act === 'exit') { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); }
            else if (act === 'more') { // téléphone : les réglages moins fréquents se déplient (style.css, .ns-open) ; le bouton n'existe pas sur ordinateur
                const open = this.tools.classList.toggle('ns-open');
                b.classList.toggle('is-on', open);
                b.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
        }
    }

    _applyMod(mod) {
        const key = mod === 'rest' ? 'rest' : mod;
        this.cur[key] = !this.cur[key];
        const list = this._explicitList();
        const e = this.sel >= 0 ? this.st.ev[this.sel] : null;
        if (list.length > 1) {
            // Groupe : le point s'allume pour tous si l'un d'eux n'en a pas ; un silence remplace toutes les notes (ou, si ce ne sont que des silences, les redevient).
            if (mod === 'rest') {
                const toRest = list.some(i => this.st.ev[i].p);
                this.cur.rest = toRest;
                let next = this.st;
                list.forEach((i) => { next = NSE_N.updateEvent(next, i, { p: toRest ? null : this._pitchForRest(next, i) }); });
                this._apply(next);
            } else {
                const on = !list.every(i => this.st.ev[i][mod]);
                this.cur[key] = on;
                this._updateGroup({ [mod]: on });
            }
        } else if (e && !this.selAuto) {
            if (mod === 'rest') {
                const nowRest = !!e.p;
                const p = nowRest ? null : this._pitchForRest(this.st, this.sel);
                this.cur.rest = nowRest;
                this._apply(NSE_N.updateEvent(this.st, this.sel, { p }));
            } else {
                this.cur[key] = !e[mod];
                this._updateGroup({ [mod]: !e[mod] });
            }
        }
        this._refreshTools();
    }

    // Hauteur d'une note qui remplace le silence i : celle de la note qui précède, sinon la 2e ligne de la portée.
    _pitchForRest(st, i) {
        const prev = st.ev.slice(0, i).reverse().find(x => x.p);
        return prev ? { ...prev.p } : NSE_N.pitchFromDia(NSE_N.SN_BOTTOM_LINE[st.clef] + 4, st.ks);
    }

    // Change la durée (d) ou le point (dot) des événements sélectionnés ; dans un tuplet, toutes ses notes changent ensemble (elles ont la même valeur).
    _updateGroup(patch) {
        const list = this._selList();
        if (!list.length) return;
        const idx = new Set();
        list.forEach((i) => { const b = NSE_N.staffTupletBounds(this.st.ev, i); for (let k = b.start; k < b.end; k++) idx.add(k); });
        let next = this.st;
        idx.forEach((k) => { next = NSE_N.updateEvent(next, k, patch); });
        this._apply(next);
    }

    // Tuplet : sur une note sélectionnée, la transforme (ou défait son tuplet, n = 0) ; sinon règle les prochaines notes posées.
    _setTuplet(n) {
        n = Number(n) || 0;
        if (this._explicitList().length > 1) { this._flashHint('Tuplet : choisissez une seule note'); this._refreshTools(); return; }
        const e = this.sel >= 0 && !this.selAuto ? this.st.ev[this.sel] : null;
        if (!e) { this.cur.tu = this.cur.tu === n && n === 3 ? 0 : n; this._refreshTools(); return; }
        if (e.tu === n) { this._refreshTools(); return; }
        let base = this.st, at = this.sel;
        if (e.tu) {
            const b = NSE_N.staffTupletBounds(this.st.ev, this.sel);
            const dis = NSE_N.staffDissolveTuplet(this.st, this.sel);
            if (!dis) { this._refreshTools(); return; }
            base = dis; at = b.start;
            if (n === 0) { this._apply(base); this.select(at, false); return; }
            if (base.ev.length !== this.st.ev.length - (b.end - b.start - 1)) { this._flashHint('Ce tuplet ne se réécrit pas en une seule note'); this._refreshTools(); return; }
        } else if (n === 0) { this._refreshTools(); return; }
        const next = NSE_N.staffMakeTuplet(base, at, n);
        if (!next) { this._flashHint(NSE_N.SN_TUPLET_NAMES[n] + ' impossible pour cette durée'); this._refreshTools(); return; }
        this._apply(next);
        this.select(at, false);
    }

    // Levée (anacrouse) : « Levée » défait la levée existante, ou fait de tout ce qui précède la note sélectionnée (elle comprise) la mesure incomplète du début.
    _togglePickup() {
        if (NSE_N.layoutStaff(this.st).pickup) { this._apply(NSE_N.staffSetPickup(this.st, 0)); return; }
        if (this.sel < 0 || !this.st.ev[this.sel]) { this._flashHint('Sélectionnez la dernière note de la levée, puis cliquez sur Levée'); return; }
        const next = NSE_N.staffSetPickup(this.st, NSE_N.staffEventEnd(this.st, this.sel));
        if (!NSE_N.layoutStaff(next).pickup) { this._flashHint('La levée doit être plus courte qu\'une mesure'); return; }
        this._apply(next);
    }

    // Curseur de taille : la portée suit le curseur en direct (sans encombrer l'historique d'annulation).
    _toolInput(ev) {
        const r = ev.target.closest('input[data-set="size"]');
        if (!r || !this.editable) return;
        this.activate();
        this._apply(Object.assign(NSE_N.cloneStaff(this.st), { size: NSE_N.clampStaffSize(r.value) }), { noHistory: true });
    }

    _toolChange(ev) {
        const num = ev.target.closest('input[data-set="bpm"]');
        if (num && this.editable) {
            this.activate();
            const v = String(num.value).trim();
            this._apply(NSE_N.setStaffTempo(this.st, v === '' ? 0 : v));
            num.value = this.st.bpm ? String(this.st.bpm) : '';
            return;
        }
        const s = ev.target.closest('select');
        if (!s || !this.editable) return;
        if (s.dataset.set === 'tuplet') { this.activate(); this._setTuplet(s.value); return; }
        if (s.dataset.set === 'instr') { this.activate(); this._apply(NSE_N.setStaffInstr(this.st, s.value)); if (this.opts.onFocusBack) this.opts.onFocusBack(this); return; }
        if (s.dataset.set === 'swing') { this.activate(); this._apply(NSE_N.setStaffSwing(this.st, s.value)); if (this.opts.onFocusBack) this.opts.onFocusBack(this); return; }
        const next = NSE_N.cloneStaff(this.st);
        if (s.dataset.set === 'clef') next.clef = s.value === 'b' ? 'b' : 't';
        else if (s.dataset.set === 'meter') next.meter = NSE_N.SN_METERS.includes(s.value) ? s.value : '4/4';
        else if (s.dataset.set === 'ks') next.ks = Math.max(-7, Math.min(7, parseInt(s.value, 10) || 0));
        this._apply(next);
        if (this.opts.onFocusBack) this.opts.onFocusBack(this);
    }

    _deleteSelected() {
        const list = this._selList();
        if (!list.length) return;
        const first = list[0];
        this._clearSel();
        this._apply(list.length === 1 ? NSE_N.removeEvent(this.st, first) : NSE_N.removeEvents(this.st, list));
        if (this.st.ev.length) this.select(Math.max(0, Math.min(first - 1, this.st.ev.length - 1)), true); // la note d'avant, ou la première
        else this.render();
    }

    // Liaison de prolongation : relie chaque note choisie à la suivante quand elle a la même hauteur (un second appui enlève les liaisons).
    // Sur la dernière note de la portée, ajoute une note liée de même hauteur et même valeur.
    _toggleTie() {
        const list = this._selList();
        if (!list.length) { this._flashHint('Sélectionnez une note : la liaison la relie à la suivante'); return; }
        const r = NSE_N.staffToggleTies(this.st, list);
        if (r.candidates) { this._apply(r.staff); this._refreshTools(); return; }
        const add = list.length === 1 ? NSE_N.staffAddTiedNote(this.st, list[0]) : null;
        if (add) { this._apply(add); this.select(list[0] + 1, true); return; }
        this._flashHint('Une liaison relie deux notes de même hauteur : placez d\'abord la note suivante à la même hauteur');
    }

    // Copie les événements choisis (tuplets en entier) dans le presse-papiers des notes de l'éditeur.
    _copyNotes(list) {
        const clip = NSE_N.staffExtractEvents(this.st, list);
        if (!clip.length) return;
        NSE_NOTE_CLIP = clip;
        this._refreshTools();
        this._flashHint(`${clip.length} ${clip.length > 1 ? 'éléments copiés' : 'élément copié'} · ⌘V les colle après la sélection`);
    }

    // Colle les notes copiées juste après la sélection (ou le tuplet qui la termine) ; les notes collées deviennent la sélection.
    _pasteNotes() {
        const list = this._selList();
        if (!list.length || !NSE_NOTE_CLIP) return;
        const at = NSE_N.staffEventEnd(this.st, list[list.length - 1]);
        const next = NSE_N.staffInsertEvents(this.st, at, NSE_NOTE_CLIP);
        if (!next) { this._flashHint('Portée pleine'); return; }
        const first = NSE_N.staffInsertBoundary(this.st, at);
        this._clearSel();
        if (!this._apply(next)) return;
        const pasted = NSE_NOTE_CLIP.map((_, k) => first + k);
        this._setSelection(pasted, pasted[pasted.length - 1], first);
        this._hearSelection();
    }

    // ----- Clavier (appelé par l'annotation quand la portée est active) : renvoie true si la touche a été utilisée -----

    handleKey(ev) {
        if (!this.editable || ev.target.closest('select, input')) return false;
        const act = nseKeyAction(ev.key, { shift: ev.shiftKey, meta: ev.metaKey, ctrl: ev.ctrlKey });
        if (!act) return false;
        const list = this._selList();
        const has = list.length > 0;
        const explicit = has && !this.selAuto;
        if (act.type === 'undo') { if (!this.history.length) return false; this.undo(); return true; }
        if (act.type === 'selectAll') { if (!this.st.ev.length) return false; this._selectAll(); return true; }
        if (act.type === 'copy' || act.type === 'cut') {
            if (!explicit) { NSE_NOTE_CLIP = null; return false; } // pas de notes choisies : c'est la portée entière qu'on copie (ou coupe), voir l'annotation
            this._copyNotes(list);
            if (act.type === 'cut') this._deleteSelected();
            return true;
        }
        if (act.type === 'paste') { if (!has || !NSE_NOTE_CLIP) return false; this._pasteNotes(); return true; }
        if (act.type === 'dur') { this.cur.d = act.dur; if (explicit) this._updateGroup({ d: act.dur }); this._refreshTools(); return true; }
        if (act.type === 'tuplet') {
            if (explicit && list.length > 1) { this._setTuplet(act.n); return true; }
            const sel = explicit ? this.st.ev[this.sel] : null;
            this._setTuplet(sel ? (sel.tu === act.n ? 0 : act.n) : (this.cur.tu === act.n ? 0 : act.n));
            return true;
        }
        if (act.type === 'mod') { this._applyMod(act.mod); return true; }
        if (act.type === 'tie') { this._toggleTie(); return true; }
        if (!has) return false; // sans note sélectionnée, flèches, lettres et Suppr. restent à la saisie de texte
        if (act.type === 'deselect') { this.select(-1); return true; }
        if (act.type === 'delete') { this._deleteSelected(); return true; }
        const last = this.st.ev.length - 1;
        if (act.type === 'move') { const n = Math.max(0, Math.min(last, this.sel + act.delta)); this.select(n, false); this._hearEvent(n); return true; }
        if (act.type === 'extend') { const n = Math.max(0, Math.min(last, this.sel + act.delta)); this._extendSel(n, false); this._hearEvent(n); return true; }
        const notes = list.filter(i => this.st.ev[i].p);
        if (!notes.length) return false;
        if (act.type === 'shift') { if (this._apply(NSE_N.shiftEvents(this.st, list, act.steps))) this._hearSelection(); return true; }
        if (act.type === 'letter') {
            if (list.length > 1) return true; // une lettre n'a de sens que pour une seule note
            const e = this.st.ev[this.sel];
            const np = nseNearestLetter(e.p, act.letter, this.st.ks);
            if (np) { this._apply(NSE_N.updateEvent(this.st, this.sel, { p: np })); this._hearEvent(this.sel); }
            return true;
        }
        if (act.type === 'alter') { this._apply(NSE_N.alterEvents(this.st, list, act.delta)); this._hearSelection(); return true; }
        return false;
    }

    // ----- Son -----

    _audition(midi) {
        const a = this.opts.audio;
        if (!a) return;
        a.ready().then((ok) => { if (ok) a.play(midi, 0, 0.7, this.st.instr); });
    }

    play() {
        const a = this.opts.audio;
        if (!a || !this.st.ev.length) return;
        this.stop();
        const token = {};
        this.playing = token;
        this._refreshTools();
        a.ready().then((ok) => {
            if (!ok || this.playing !== token) { if (this.playing === token) { this.playing = null; this._refreshTools(); } return; }
            const beat = 60 / NSE_N.staffTempo(this.st, a.bpm());
            const plan = NSE_N.playbackPlan(this.st, a.swing ? a.swing() : null); // swing de la portée, sinon celui de la jam
            const nodes = [];
            token.timers = [];
            plan.forEach(n => {
                if (n.midi !== null) { const node = a.play(n.midi, n.at * beat, Math.max(0.12, n.len * beat * 0.95), this.st.instr); if (node) nodes.push(node); }
                token.timers.push(setTimeout(() => { if (this.playing === token) this._markPlaying(n.midi !== null ? n.ev : -1); }, n.at * beat * 1000)); // la note qui sonne est soulignée en bleu
            });
            token.nodes = nodes;
            const last = plan[plan.length - 1];
            token.timer = setTimeout(() => { if (this.playing === token) { this.playing = null; this._markPlaying(-1); this._refreshTools(); } }, (last.at + last.len) * beat * 1000 + 150);
        });
    }

    // Colore en bleu la tête de la note `i` (indice de l'événement) pendant qu'elle sonne ; -1 efface la couleur. Elle est reposée quand la portée se redessine.
    _markPlaying(i) {
        this._hiEv = i;
        this.svgHost.querySelectorAll('.vf-notehead.ns-playing').forEach(n => n.classList.remove('ns-playing'));
        if (i < 0 || !this.geo) return;
        this.geo.notes.filter(r => r.ev === i && !r.rest && r.g && r.g.isConnected).forEach((r) => {
            r.g.querySelectorAll('.vf-notehead').forEach(h => h.classList.add('ns-playing'));
        });
    }

    // Clic sur une note hors édition de la portée : elle se joue seule, sa tête bleuit un instant.
    _playNote(i) {
        const e = this.st.ev[i];
        if (!e || !e.p || this.playing) return;
        this._audition(NSE_N.pitchMidi(e.p));
        this._markPlaying(i);
        clearTimeout(this._noteTimer);
        this._noteTimer = setTimeout(() => { if (!this.playing) this._markPlaying(-1); }, 450);
    }

    stop() {
        const t = this.playing;
        if (!t) return;
        this.playing = null;
        if (t.timer) clearTimeout(t.timer);
        (t.timers || []).forEach(clearTimeout);
        this._markPlaying(-1);
        (t.nodes || []).forEach(n => { try { n.stop(); } catch (e) { /* déjà arrêtée */ } });
        this._refreshTools();
    }
}

// Petit bloc enregistré dans l'annotation pour une portée (le dessin n'est pas enregistré) : son texte, sa place sur le canevas et son bord (caché si border === false).
function noteStaffStubHtml(st, at, border) {
    const p = NSE_N.formatBlockAt(at);
    return `<div class="annot-staff" data-staff="${NSE_N.formatStaff(st || NSE_N.staffDefault())}"${p ? ` data-at="${p}"` : ''}${border === false ? ' data-border="0"' : ''}></div>`;
}

// Transforme chaque bloc « annot-staff » de `root` en portée éditable (ou simplement affichée si l'annotation est en lecture seule).
function hydrateNoteStaves(root, opts) {
    root.querySelectorAll('.annot-staff').forEach((el) => {
        if (el.__noteStaff && el.isConnected && el.__noteStaff.el === el && el.querySelector('.annot-staff-svg')) return;
        new NoteStaffView(el, opts);
    });
}

// Petit bloc enregistrable d'une portée ou d'un cadre de texte affiché (sans son dessin, ses boutons ni ses outils) : son texte, sa place sur le canevas,
// son bord et, pour un cadre, son texte mis en forme. `at` remplace la place affichée (bloc recréé ailleurs). Un bloc hérité (pas encore migré) garde data-pos.
function nseBlockStub(el, at) {
    const isFrame = el.classList.contains('annot-frame'), isChords = el.classList.contains('annot-chords'), isDraw = el.classList.contains('annot-draw');
    const stub = document.createElement('div');
    stub.className = isFrame ? 'annot-frame' : (isChords ? 'annot-chords' : (isDraw ? 'annot-draw' : 'annot-staff'));
    if (isDraw) {
        stub.setAttribute('data-draw', el.getAttribute('data-draw') || '');   // cadre de dessin (ui/draw-block.js) : son texte est déjà sa forme enregistrée
    } else if (isChords) {
        stub.setAttribute('data-chords', el.getAttribute('data-chords') || '');   // bloc d'accords (ui/chord-block.js) : son texte est déjà sa forme enregistrée
    } else if (isFrame) {
        stub.setAttribute('data-frame', el.getAttribute('data-frame') || '');
        const body = el.querySelector('.annot-frame-body');
        stub.innerHTML = body ? body.innerHTML : '';
    } else {
        const st = NSE_N.parseStaff(el.getAttribute('data-staff') || '');
        stub.setAttribute('data-staff', NSE_N.formatStaff(st || NSE_N.staffDefault()));
    }
    const place = at ? NSE_N.formatBlockAt(at) : NSE_N.formatBlockAt(NSE_N.parseBlockAt(el.getAttribute('data-at') || ''));
    if (place) stub.setAttribute('data-at', place);
    else { const pos = NSE_N.formatStaffPos(NSE_N.parseStaffPos(el.getAttribute('data-pos') || '')); if (pos) stub.setAttribute('data-pos', pos); }
    if (!NSE_N.parseBlockBorder(el.getAttribute('data-border'))) stub.setAttribute('data-border', '0');
    return stub;
}

// Copie du contenu d'un champ d'annotation où chaque portée (et chaque cadre de texte) est remplacée par son petit bloc enregistrable.
// Le champ ne contient que des blocs : le calque des repères (.annot-overlay) n'est pas enregistré.
function annotationHtmlForSave(ed) {
    const c = ed.cloneNode(true);
    c.querySelectorAll('.annot-overlay').forEach(o => o.remove());
    c.querySelectorAll('.annot-staff, .annot-frame, .annot-chords, .annot-draw').forEach((el) => el.replaceWith(nseBlockStub(el)));
    return c.innerHTML;
}

// Texte brut des blocs `els` pour le presse-papiers : « [portée@x,y:…] » pour chaque portée, « [cadre@x,y:…] » pour chaque cadre de texte (un « ! » après la place
// quand son cadre est caché). La place relative des blocs copiés ensemble est ainsi gardée au collage.
function nseBlocksToClipText(els) {
    return els.map((n) => {
        const meta = { at: NSE_N.parseBlockAt(n.getAttribute('data-at') || ''), border: NSE_N.parseBlockBorder(n.getAttribute('data-border')) };
        if (n.classList.contains('annot-staff')) {
            const st = NSE_N.parseStaff(n.getAttribute('data-staff') || '');
            return st ? NSE_N.staffClipText(st, meta) : '';
        }
        const box = NSE_N.parseFrameBox(n.getAttribute('data-frame') || '');
        const body = n.querySelector('.annot-frame-body');
        return box ? NSE_N.frameClipText(box, body ? body.innerHTML : n.innerHTML, meta) : '';
    }).join('');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { nseHandDrawn, nseSmallTimeSig, NSE_TIMESIG_SCALE, NSE_SPACING, NSE_BAND, NSE_TOP, nseToolsHtml, nseKeyAction, nseNearestLetter, nseNoteIcon, nseKeyOptions, nseToolState, nseBlocksToClipText, noteStaffStubHtml };
}
