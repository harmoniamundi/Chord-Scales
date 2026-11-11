// ui/scale-harmony.js — onglet « Harmonisation » de l'Entraînement, sans DOM : les accords que l'on peut construire sur
// chaque degré d'une gamme, avec leur chiffrage (I, ♭III, vii°…). Le moteur (ChordScaleApp.playHarmonyChord) joue l'accord cliqué.
// Chargé par index.html via <script src="app/ui/scale-harmony.js"> et testé par ui/scale-harmony.test.js.
//
// Deux méthodes :
//  - gamme de 7 notes : tierces superposées dans la gamme sur chaque degré (1-3-5-7), en septièmes ou en triades ; un seul
//    accord par degré (ex. Do lydien : Δ, 7, −7, ø, Δ, −7, −7) ;
//  - autre gamme (pentatoniques, blues, bebop, diminuées…) : l'empilement par degrés n'a pas de sens ; on propose les accords
//    du catalogue dont toutes les notes sont dans la gamme (les plus complets, deux au plus par degré, les plus usuels d'abord).

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const SH_T = (typeof getStrictSpelledNotes !== 'undefined') ? { getStrictSpelledNotes, cbId, chordInfo, cbNotes, cbNormalize, getSpelledChordNotes, stackIntervalsUp } : require('../theory.js');

const SH_THIRD = { 2: 'sus2', 3: 'm', 4: 'M', 5: 'sus4' };
const SH_FIFTH = { 6: 'b5', 7: 'P', 8: 's5' };
const SH_SEVENTH = { 9: '6', 10: 'b7', 11: 'M7' };       // 9 = septième diminuée (°7) ou sixte : cbNormalize tranche
const SH_TRIAD_IDS = ['majTriad', 'minTriad', 'dimTriad', 'augTriad'];
const SH_SEVENTH_IDS = ['7', 'maj7', 'm7', 'm7b5', 'mmaj7', 'dim7', 'maj7sharp5', '7sharp5', '6'];   // du plus usuel au plus rare
const SH_MAX_PER_DEGREE = 2;   // gammes symétriques : sans limite, chaque degré porterait cinq accords

// Chiffrage d'une fondamentale située à `offset` demi-tons de la tonique, par rapport à la gamme majeure (comme le Jam en
// notation « jazz » : ♭III, ♭VI, ♭VII en mineur). `scalePcs` (notes de la gamme) départage le triton : ♯IV quand la gamme a une
// quinte juste mais pas de quarte juste (lydien), ♭V sinon (locrien, blues…).
function scaleHarmonyNumeral(offset, scalePcs) {
    const NAMES = { 0: 'I', 1: '♭II', 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII' };
    if (offset === 6) return (scalePcs.includes(7) && !scalePcs.includes(5)) ? '♯IV' : '♭V';
    return NAMES[offset] || '';
}

// Chiffrage complet d'un accord : minuscules pour une tierce mineure, ° (diminué), ø (demi-diminué), + (quinte augmentée).
function scaleHarmonyLabel(offset, chordId, scalePcs) {
    const info = SH_T.chordInfo(chordId);
    let n = scaleHarmonyNumeral(offset, scalePcs);
    if (!info) return n;
    if (info.minorish) n = n.toLowerCase();
    if (info.fam === 'hdim') n += 'ø';
    else if (info.fam === 'dim') n += '°';
    else if (info.st.fifth === 's5') n += '+';   // quinte augmentée : accord augmenté, Δ#5, 7#5…
    return n;
}

// Accords de chaque degré d'une gamme.
//   p = { intervals (demi-tons depuis la tonique, sans l'octave), rootName, rootIndex (0 à 11), triads (triades au lieu des
//         septièmes), findChordObj(id) }
// Renvoie [{ degree, offset, rootIndex, rootName (écrit comme la gamme), chordId, label }], dans l'ordre des degrés.
function scaleHarmony(p) {
    const scale = p.intervals.filter(i => i < 12);
    const n = scale.length;
    const names = SH_T.getStrictSpelledNotes(p.rootName, scale);
    const out = [];
    const push = (degree, chordId) => out.push({
        degree, offset: scale[degree], rootIndex: (p.rootIndex + scale[degree]) % 12, rootName: names[degree], chordId,
        label: scaleHarmonyLabel(scale[degree], chordId, scale)
    });
    if (n === 7) {
        for (let d = 0; d < 7; d++) {
            const up = (k) => (scale[(d + k) % 7] - scale[d] + 12) % 12;
            const third = SH_THIRD[up(2)], fifth = SH_FIFTH[up(4)], sev = p.triads ? '' : SH_SEVENTH[up(6)];
            if (!third || !fifth || sev === undefined) continue;   // pas un accord de tierces (gamme inhabituelle)
            push(d, SH_T.cbId({ third, fifth, sev, ext: [] }));
        }
        return out;
    }
    const pcs = new Set(scale);
    const ids = p.triads ? SH_TRIAD_IDS : [...SH_SEVENTH_IDS, ...SH_TRIAD_IDS];
    const chords = ids.map(id => ({ id, notes: (p.findChordObj(id) || {}).notes || [] })).filter(c => c.notes.length);
    for (let d = 0; d < n; d++) {
        // notes de l'accord : demi-tons depuis sa fondamentale (le degré d) ; la gamme : demi-tons depuis la tonique
        const fits = chords.filter(c => c.notes.every(x => pcs.has((scale[d] + x) % 12)));
        const set = (c) => new Set(c.notes.map(x => x % 12));
        // on écarte un accord dont les notes sont toutes dans un accord plus complet du même degré (la triade de C6, par exemple)
        const maximal = fits.filter(c => !fits.some(o => o !== c && o.notes.length > c.notes.length && [...set(c)].every(x => set(o).has(x))));
        maximal.slice(0, SH_MAX_PER_DEGREE).forEach(c => push(d, c.id));
    }
    return out;
}

const shAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// HTML de l'onglet pour une carte de gamme.
//   p = scaleHarmony + { jazz(chordId) (suffixe jazz), selected: { rootIndex, chordId } (accord choisi : allumé),
//        onclick(rootIndex, chordId) → gestionnaire de clic sur la case (accord plaqué),
//        onArpeggio(rootIndex, chordId) → gestionnaire du chevron « >> » de la case (arpège, comme les dominos de la grille Jam) }
function scaleHarmonyHtml(p) {
    const items = scaleHarmony(p);
    const sel = p.selected || {};
    const chips = items.map(it => {
        const name = `${it.rootName}${p.jazz(it.chordId)}`;
        const on = it.rootIndex === sel.rootIndex && it.chordId === sel.chordId;
        const co = p.findChordObj(it.chordId);
        const tip = `Écouter ${name} plaqué${co && co.fullName ? ' — ' + co.fullName : ''}`;
        const arp = p.onArpeggio
            ? `<span class="th-arp" role="button" aria-label="Écouter l'arpège de ${shAttr(name)}" title="Écouter l'arpège" onclick="${shAttr(p.onArpeggio(it.rootIndex, it.chordId))}; event.stopPropagation();">&gt;&gt;</span>` : '';
        return `<button type="button" class="jm-chip th-chip${on ? ' is-on' : ''}" data-chord="${shAttr(it.rootIndex + ':' + it.chordId)}" title="${shAttr(tip)}" onclick="${shAttr(p.onclick(it.rootIndex, it.chordId))}; event.stopPropagation();"><span class="th-name">${name}</span><small>${it.label}</small>${arp}</button>`;
    }).join('');
    const how = p.intervals.filter(i => i < 12).length === 7
        ? `${p.triads ? 'Triades' : 'Accords de quatre sons'} par tierces superposées sur chaque degré.`
        : 'Accords dont toutes les notes sont dans la gamme (cette gamme n\'a pas sept notes ; deux accords au plus par degré).';
    const note = `${how}${p.onArpeggio ? ' Clic : accord plaqué ; « &gt;&gt; » : arpège.' : ''}`;
    return `<div class="bg-transparent border border-[#333333] rounded-lg p-3 shadow-sm text-slate-100 w-full mx-auto select-none">
                                <div class="th-wrap">${chips || '<span class="text-xs text-slate-500">Aucun accord.</span>'}</div>
                                <div class="th-note">${note}</div>
                            </div>`;
}

// Accord choisi dans une carte de gamme, à afficher en haut de la carte à côté du nom de la gamme (comme sous la grille de la
// Jam) : son nom (un clic le joue en arpège) suivi de ses notes (un clic joue la note). Renvoie '' si l'accord choisi n'est
// pas l'un de ceux proposés pour cette gamme.
//   p = scaleHarmony + { jazz, findChordObj, selected: { rootIndex, chordId },
//        onArpeggio(rootIndex, chordId), onNote(rootIndex, interval) → gestionnaires de clic, badgeClass → classe d'une note }
function scaleHarmonyChosenHtml(p) {
    const sel = p.selected || {};
    const it = scaleHarmony(p).find(x => x.rootIndex === sel.rootIndex && x.chordId === sel.chordId);
    const co = it && p.findChordObj(it.chordId);
    if (!it || !co) return '';
    const name = `${it.rootName}${p.jazz(it.chordId)}`;
    const spelled = SH_T.getSpelledChordNotes(it.rootName, co);
    const stacked = SH_T.stackIntervalsUp(co.notes);
    const notes = spelled.map((label, i) =>
        `<span class="${shAttr(p.badgeClass)}" onclick="${shAttr(p.onNote(it.rootIndex, stacked[i]))}; event.stopPropagation();">${shAttr(label)}</span>`).join('');
    return `<span class="th-sel" data-chord="${shAttr(it.rootIndex + ':' + it.chordId)}">`
        + `<span class="th-sel-name" role="button" title="Écouter l'arpège" onclick="${shAttr(p.onArpeggio(it.rootIndex, it.chordId))}; event.stopPropagation();">${shAttr(name)}</span>`
        + `<span class="th-sel-notes">${notes}</span></span>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scaleHarmonyChosenHtml, scaleHarmony, scaleHarmonyHtml, scaleHarmonyLabel, scaleHarmonyNumeral };
}
