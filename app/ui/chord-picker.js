// ui/chord-picker.js — sélecteur d'accord de l'Entraînement, sans DOM : le même que celui de l'éditeur de mesure du Jam
// (ui/measure-editor.js), mais posé en permanence dans la colonne de gauche au lieu d'un pop-up. Mêmes classes (jm-*), mêmes
// actions (data-act) et mêmes règles de construction que le Jam. Deux modes :
//   - « Construire » : fondamentale (clavier, touches noires en ♯ et ♭), raccourcis d'accords, tierce / quinte / septième / tensions ;
//   - « Catalogue » : fondamentale (liste), accords courants et menu « Autres accords… ».
// Le moteur (ChordScaleApp.renderChordPicker) pose le HTML, branche les clics (data-act) et applique les résultats de
// chordPickerParseRoot / chordPickerBuild.
// Chargé par index.html via <script src="app/ui/chord-picker.js"> et testé par ui/chord-picker.test.js.
//
// v : rootIndex (0 à 11), chordId (catalogue ou accord composé « x:… »), mode ('build' | 'cat'), rootLabels (noms des 12 notes),
//     jazz(chordId) (notation jazz), findChordObj(chordId).

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const CP_T = (typeof chordRootName !== 'undefined')
    ? { chordRootName, chordInfo, cbNormalize, cbStructIntervals, cbStateOfId, cbId, cbHas, CB_EXT_ORDER, CB_EXT, CB_EXT_LABEL, CB_EXT_CLASH, getSpelledChordNotes, chordTypes }
    : require('../theory.js');
const { chordRootName: cp_chordRootName, chordInfo: cp_chordInfo, cbNormalize: cp_cbNormalize, cbStructIntervals: cp_cbStructIntervals,
    cbStateOfId: cp_cbStateOfId, cbId: cp_cbId, cbHas: cp_cbHas, CB_EXT_ORDER: CP_EXT_ORDER, CB_EXT: CP_EXT, CB_EXT_LABEL: CP_EXT_LABEL,
    CB_EXT_CLASH: CP_EXT_CLASH, getSpelledChordNotes: cp_getSpelledChordNotes, chordTypes: cp_chordTypes } = CP_T;

// Accords proposés en Catalogue et en raccourcis de Construire : mêmes listes que l'éditeur de mesure du Jam.
const CP_CATALOG_IDS = ['maj7', '6', 'maj9', 'm7', 'm9', 'm11', '7', '9', '7alt', '7b9', '7sus4', 'm7b5', 'dim7', 'majTriad', 'minTriad'];
const CP_SHORTCUT_IDS = ['majTriad', 'minTriad', 'maj7', 'm7', '7', 'm7b5', 'dim7', '7sus4', '7alt', '6', '9', 'm9'];

// Valeur d'une touche de fondamentale (« 7 », « 1s », « 1f ») → { pc, acc } ; acc = 's' (dièse), 'f' (bémol) ou null.
// null si la valeur est inutilisable.
function chordPickerParseRoot(value) {
    const m = /^(\d{1,2})([sf])?$/.exec(String(value));
    if (!m) return null;
    const pc = parseInt(m[1], 10);
    if (pc < 0 || pc > 11) return null;
    return { pc, acc: m[2] || null };
}

// Mode Construire : nouvel identifiant d'accord après un clic sur la tierce, la quinte, la septième ou une tension.
//   kind = 'third' | 'fifth' | 'sev' | 'ext' ; v = valeur choisie (ex. 'm', 'b5', 'M7', 'b9').
// Mêmes règles que le Jam : °7 impose tierce mineure + quinte ♭5 ; une tension déjà là s'enlève ; deux tensions qui se heurtent
// d'un demi-ton (9 et ♭9…) ne cohabitent pas. Les combinaisons du catalogue reprennent l'identifiant du catalogue.
// null si le clic ne change rien d'utilisable.
function chordPickerBuild(chordId, kind, v) {
    const s0 = cp_cbStateOfId(chordId) || cp_cbNormalize({});
    const st = { third: s0.third, fifth: s0.fifth, sev: s0.sev, ext: s0.ext.slice() };
    if (kind === 'third') st.third = v;
    else if (kind === 'fifth') st.fifth = v;
    else if (kind === 'sev') {
        st.sev = v;
        if (st.sev === 'bb7') { st.third = 'm'; st.fifth = 'b5'; }   // °7 = tierce mineure + quinte diminuée + 7e diminuée
    } else if (kind === 'ext') {
        if (!cp_cbHas(CP_EXT, v)) return null;
        if (st.ext.includes(v)) st.ext = st.ext.filter(k => k !== v);
        else st.ext = st.ext.filter(k => !CP_EXT_CLASH[v].includes(k)).concat(v);
    } else return null;
    return cp_cbId(st);
}

const cpAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cpGlyph = (s) => String(s).replace(/#/g, '♯').replace(/b/g, '♭');

function chordPickerHtml(v) {
    const { rootIndex, chordId, rootLabels, findChordObj } = v;
    const jazz = v.jazz;
    const chordObj = findChordObj(chordId);
    const mode = v.mode === 'cat' ? 'cat' : 'build';
    const chip = (on, attrs, inner, extra = '') => `<button type="button" class="jm-chip${extra}${on ? ' is-on' : ''}" ${attrs}>${inner}</button>`;
    // La touche allumée est celle dont le nom est celui de l'orthographe courante (Do# et Réb sont deux touches distinctes)
    const rootOn = (nm, val) => rootLabels[parseInt(val, 10)] === nm && parseInt(val, 10) === rootIndex;

    const modeBar = `<div class="jm-mode">
                        ${chip(mode === 'build', 'data-act="mode" data-v="build" title="Choisir la fondamentale, la qualité, puis les tensions"', 'Construire')}
                        ${chip(mode === 'cat', 'data-act="mode" data-v="cat" title="Liste d\'accords prédéfinis"', 'Catalogue')}
                    </div>`;

    if (mode === 'cat') {
        // ----- Mode « Catalogue » : fondamentale en liste, accords courants, menu de tous les accords -----
        const roots = [['C', '0'], ['C#', '1s'], ['Db', '1f'], ['D', '2'], ['D#', '3s'], ['Eb', '3f'], ['E', '4'], ['F', '5'],
            ['F#', '6s'], ['Gb', '6f'], ['G', '7'], ['G#', '8s'], ['Ab', '8f'], ['A', '9'], ['A#', '10s'], ['Bb', '10f'], ['B', '11']]
            .map(([nm, val]) => chip(rootOn(nm, val), `data-act="root" data-v="${val}"`, nm)).join('');
        const catIds = CP_CATALOG_IDS.map(id => findChordObj(id)).filter(c => c && c.id !== undefined).map(c => c.id).slice(0, 16);
        const chords = catIds.map(id => {
            const co = findChordObj(id);
            return chip(id === chordId, `data-act="chord" data-v="${id}" title="${cpAttr(co.fullName || '')}"`, jazz(id) || co.name);
        }).join('');
        const allChords = Object.values(cp_chordTypes).flat();
        const options = allChords.map(c => `<option value="${cpAttr(c.id)}">${jazz(c.id)} — ${c.fullName || c.name}</option>`).join('');
        return `${modeBar}
                    <div class="jm-sec"><div class="jm-sec-t">Fondamentale</div><div class="jm-row">${roots}</div></div>
                    <div class="jm-sec"><div class="jm-sec-t">Accord</div><div class="jm-chords jm-chords-8">${chords}</div>
                        <select class="jm-select" data-act="chordsel"><option value="">Autres accords…</option>${options}</select></div>`;
    }

    // ----- Mode « Construire » : fondamentale → qualité (tierce, quinte, septième) → tensions -----
    const bst = (cp_chordInfo(chordId) || { st: cp_cbNormalize({}) }).st;
    const seg = (act, defs, on, cls = '') => `<div class="jm-seg${cls}">${defs.map(([k, label, tip]) =>
        chip(on(k), `data-act="${act}" data-v="${k}" title="${cpAttr(tip)}"`, label)).join('')}</div>`;
    const thirdSeg = seg('third', [
        ['M', 'maj', 'Tierce majeure'], ['m', 'min', 'Tierce mineure'],
        ['sus4', 'sus4', 'Suspendu : la quarte remplace la tierce'], ['sus2', 'sus2', 'Suspendu : la seconde remplace la tierce']], k => bst.third === k, ' jm-seg-sm');
    const fifthSeg = seg('fifth', [
        ['P', '5', 'Quinte juste'], ['b5', '♭5', 'Quinte diminuée'],
        ['s5', '♯5', 'Quinte augmentée']], k => bst.fifth === k, ' jm-seg-sm');
    const sevSeg = seg('sev', [
        ['', '—', 'Aucune septième : triade'], ['6', '6', 'Sixte ajoutée'],
        ['b7', '7', 'Septième mineure (♭7) : dominante, m7, ø…'], ['M7', 'Δ7', 'Septième majeure'],
        ['bb7', '°7', 'Septième diminuée : accord diminué (tierce mineure + quinte ♭5)']], k => bst.sev === k, ' jm-seg-sm');
    const usedPcs = cp_cbStructIntervals(bst);
    const extTips = { b9: 'Neuvième mineure', '9': 'Neuvième', s9: 'Neuvième augmentée (♯9)', '11': 'Onzième', s11: 'Onzième augmentée (♯11)', b13: 'Treizième mineure (♭13)', '13': 'Treizième' };
    const extSeg = `<div class="jm-seg">${CP_EXT_ORDER.map(k =>
        chip(bst.ext.includes(k), `data-act="ext" data-v="${k}" title="${extTips[k]}${usedPcs.includes(CP_EXT[k]) ? ' (déjà dans l\'accord)' : ''}"`,
            cpGlyph(CP_EXT_LABEL[k]), usedPcs.includes(CP_EXT[k]) ? ' jm-off' : '')).join('')}</div>`;
    const shortcuts = CP_SHORTCUT_IDS.map(id => findChordObj(id)).filter(c => c && c.id !== undefined).map(co =>
        chip(co.id === chordId, `data-act="chord" data-v="${co.id}" title="${cpAttr(co.fullName || '')}"`, jazz(co.id) || co.name)).join('');
    // Fondamentale « clavier » : touches noires (♯ et ♭) au-dessus des touches blanches
    const kbBlack = [['C#', '1s', 2], ['Db', '1f', 3], ['D#', '3s', 4], ['Eb', '3f', 5], ['F#', '6s', 8], ['Gb', '6f', 9],
        ['G#', '8s', 10], ['Ab', '8f', 11], ['A#', '10s', 12], ['Bb', '10f', 13]];
    const kbWhite = [['C', '0'], ['D', '2'], ['E', '4'], ['F', '5'], ['G', '7'], ['A', '9'], ['B', '11']];
    const keyboard = `<div class="jm-kb">
                        ${kbBlack.map(([nm, val, col]) => chip(rootOn(nm, val), `data-act="root" data-v="${val}" style="grid-row:1;grid-column:${col}" title="${cpGlyph(nm)}"`, cpGlyph(nm), ' jm-blk')).join('')}
                        ${kbWhite.map(([nm, val], i) => chip(rootOn(nm, val), `data-act="root" data-v="${val}" style="grid-row:2;grid-column:${i * 2 + 1} / span 2"`, nm)).join('')}
                    </div>`;
    const spelledNotes = cp_getSpelledChordNotes(cp_chordRootName(rootIndex, chordId, rootLabels), chordObj).map(cpGlyph).join(' ');
    const notesNote = chordId === '7alt' ? ' <small>(7alt = 7♭5 ; ajoutez ♭9, ♯9, ♭13 pour le détail)</small>' : '';
    return `${modeBar}
                    <div class="jm-sec"><div class="jm-sec-t">Fondamentale</div>${keyboard}</div>
                    <div class="jm-sec"><div class="jm-sec-t">Accord</div>
                        <div class="jm-chords">${shortcuts}</div>
                        <div class="jm-sub-t">Tierce</div>${thirdSeg}
                        <div class="jm-sub-t">Quinte</div>${fifthSeg}
                        <div class="jm-sub-t">Septième</div>${sevSeg}
                        <div class="jm-sub-t">Tensions</div>${extSeg}
                        <div class="jm-notes">Notes : <b>${spelledNotes}</b>${notesNote}</div></div>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { chordPickerHtml, chordPickerBuild, chordPickerParseRoot, CP_CATALOG_IDS, CP_SHORTCUT_IDS };
}
