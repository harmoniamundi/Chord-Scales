// ui/measure-editor.js — contenu HTML du pop-up d'édition d'une mesure (Jam), sans DOM : durée (1 ou 2 accords), degrés de la
// tonalité, fondamentale (clavier ou liste), construction de l'accord (tierce, quinte, septième, tensions) ou catalogue, gamme,
// note de basse, reprises. Le moteur (JamEngine._renderEditor) lit l'état, appelle editorHtml puis pose le résultat dans le pop-up
// et conserve le défilement ; les clics (data-act) sont traités par _editorOnAction.
// Chargé par index.html via <script src="ui/measure-editor.js"> et testé par ui/measure-editor.test.js.
//
// v : m (mesure à plat : measureNumber, measureInStep…), step (bloc de la grille), isHalf (deux accords), cur (accord édité),
//     half (0 ou 1, moitié éditée), mode ('build' | 'cat'), isFolded(clé) (section repliée), degrees (degrés diatoniques),
//     rootLabels (noms des 12 notes), symbol(chord) (symbole texte), jazz(chordId) (notation jazz), findChordObj(id),
//     halfLabelText(half), halfTitleText().

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const MED_T = (typeof chordRootName !== 'undefined')
    ? { chordRootName, bassNoteName, chordInfo, cbNormalize, cbStructIntervals, CB_EXT_ORDER, CB_EXT, CB_EXT_LABEL, getSpelledChordNotes, chordTypes, scalesDb }
    : require('../theory.js');
const { chordRootName: med_chordRootName, bassNoteName: med_bassNoteName, chordInfo: med_chordInfo, cbNormalize: med_cbNormalize,
    cbStructIntervals: med_cbStructIntervals, CB_EXT_ORDER: MED_EXT_ORDER, CB_EXT: MED_EXT, CB_EXT_LABEL: MED_EXT_LABEL,
    getSpelledChordNotes: med_getSpelledChordNotes, chordTypes: med_chordTypes, scalesDb: med_scalesDb } = MED_T;

function editorHtml(v) {
    const { m, step, isHalf, cur, half, rootLabels, isFolded, findChordObj, halfLabelText, halfTitleText } = v;
    const jazz = v.jazz;
                const chordObj = findChordObj(cur.chordId);
                const symbol = (c) => v.symbol(c);
                const chip = (on, attrs, inner, extra = '') => `<button type="button" class="jm-chip${extra}${on ? ' is-on' : ''}" ${attrs}>${inner}</button>`;

                const degrees = v.degrees.map((d, i) =>
                    chip(d.rootIndex === cur.rootIndex && d.chordId === cur.chordId,
                        `data-act="degree" data-i="${i}" title="Raccourci clavier : ${i + 1}"`,
                        `${d.label}<small>${med_chordRootName(d.rootIndex, d.chordId, rootLabels)}${jazz(d.chordId)}</small>`, ' jm-deg')
                ).join('');
                // Fondamentale : les 12 notes, les touches noires en dièse ET en bémol (le nom choisi s'applique à toute la grille)
                const roots = [['C', '0'], ['C#', '1s'], ['Db', '1f'], ['D', '2'], ['D#', '3s'], ['Eb', '3f'], ['E', '4'], ['F', '5'],
                    ['F#', '6s'], ['Gb', '6f'], ['G', '7'], ['G#', '8s'], ['Ab', '8f'], ['A', '9'], ['A#', '10s'], ['Bb', '10f'], ['B', '11']]
                    .map(([nm, v]) => chip(rootLabels[parseInt(v, 10)] === nm && parseInt(v, 10) === cur.rootIndex, `data-act="root" data-v="${v}"`, nm)).join('');
                const common = ['maj7', '6', 'maj9', 'm7', 'm9', 'm11', '7', '9', '7alt', '7b9', '7sus4', 'm7b5', 'dim7', 'majTriad', 'minTriad'];
                const commonObjs = common.map(id => findChordObj(id)).filter(c => c && c.id !== undefined);
                const chords = commonObjs.map(c => chip(c.id === cur.chordId, `data-act="chord" data-v="${c.id}" title="${c.fullName || ''}"`, jazz(c.id) || c.name)).join('');
                const allChords = Object.values(med_chordTypes).flat();
                const options = allChords.map(c => `<option value="${c.id}">${jazz(c.id)} — ${c.fullName || c.name}</option>`).join('');
                const scales = (chordObj ? chordObj.scales : []).map(sc => {
                    const db = med_scalesDb[sc.id];
                    return chip(sc.id === cur.scaleId, `data-act="scale" data-v="${sc.id}" title="${sc.role || ''}"`, db ? db.name : sc.id, ' jm-scale');
                }).join('');

                // Basse : les 12 notes ; les notes de l'accord sont cerclées (avec leur rôle), la fondamentale est le choix par défaut
                const plainChord = `${med_chordRootName(cur.rootIndex, cur.chordId, rootLabels)}${jazz(cur.chordId)}`;
                const chordPcs = (chordObj ? chordObj.notes : []).map(n => (cur.rootIndex + n) % 12);
                const rootPc = (cur.rootIndex + ((chordObj && chordObj.notes[0]) || 0)) % 12;
                const degName = ['R', '♭9', '9', '♭3', '3', '11', '♭5', '5', '♯5', '6', '♭7', '7'];
                const curBass = Number.isInteger(cur.bassRootIndex) ? cur.bassRootIndex : rootPc;
                const basses = rootLabels.map((_, pc) => {
                    const r = med_bassNoteName(cur.rootIndex, cur.chordId, pc, rootLabels);
                    const ct = chordPcs.includes(pc);
                    const sub = ct ? `<small>${degName[(pc - rootPc + 12) % 12]}</small>` : '';
                    const tip = pc === rootPc ? `Fondamentale : pas d'accord sur basse`
                        : (ct ? `${plainChord}/${r} : note de l'accord à la basse` : `${plainChord}/${r} : basse étrangère à l'accord`);
                    return chip(pc === curBass, `data-act="bass" data-v="${pc}" title="${tip}"`, `${r}${sub}`, ct ? ' jm-ct' : '');
                }).join('');

                const rpStart = !!step.repeatStart && m.measureInStep === 1;
                const rpEnd = (step.repeatEnd && m.measureInStep === step.measures) ? step.repeatEnd : 0;
                const marks = [
                    chip(rpStart, 'data-act="rp-start" title="Début de reprise : le jeu revient ici à la fin de la reprise"', '|: Début'),
                    chip(!!rpEnd, 'data-act="rp-end" title="Fin de reprise ; clics successifs : ×2, ×3, ×4, aucun"', rpEnd ? `:| Fin ×${rpEnd}` : ':| Fin'),
                    chip(step.volta === 1, 'data-act="rp-v1" title="1re fin : jouée au premier passage seulement"', '1re fin'),
                    chip(step.volta === 2, 'data-act="rp-v2" title="2e fin : jouée au second passage"', '2e fin')
                ].join('');

                const durSeg = `
                    <div class="jm-row">
                        ${chip(!isHalf, 'data-act="dur" data-v="1" title="Un seul accord sur la mesure"', '1 accord')}
                        ${chip(isHalf, `data-act="dur" data-v="half" title="${halfTitleText()}"`, '2 accords')}
                    </div>
                    ${isHalf ? `<div class="jm-row" style="margin-top:4px">
                        ${chip(half === 0, 'data-act="half" data-v="0"', `${halfLabelText(0)} <small>${symbol(step)}</small>`)}
                        ${chip(half === 1, 'data-act="half" data-v="1"', `${halfLabelText(1)} <small>${symbol(step.split)}</small>`)}
                    </div>` : ''}`;

                // ----- Mode « Construire » : fondamentale → qualité (tierce, quinte, septième) → tensions -----
                const mode = v.mode;
                const glyph = (s) => String(s).replace(/#/g, '♯').replace(/b/g, '♭');
                const bst = (med_chordInfo(cur.chordId) || { st: med_cbNormalize({}) }).st;
                const seg = (act, defs, on) => `<div class="jm-seg">${defs.map(([k, label, tip]) =>
                    chip(on(k), `data-act="${act}" data-v="${k}" title="${tip}"`, label)).join('')}</div>`;
                const thirdSeg = seg('third', [
                    ['M', 'maj', 'Tierce majeure'], ['m', 'min', 'Tierce mineure'],
                    ['sus4', 'sus4', 'Suspendu : la quarte remplace la tierce'], ['sus2', 'sus2', 'Suspendu : la seconde remplace la tierce']], k => bst.third === k);
                const fifthSeg = seg('fifth', [
                    ['P', '5', 'Quinte juste'], ['b5', '♭5', 'Quinte diminuée'],
                    ['s5', '♯5', 'Quinte augmentée']], k => bst.fifth === k);
                const sevSeg = seg('sev', [
                    ['', '—', 'Aucune septième : triade'], ['6', '6', 'Sixte ajoutée'],
                    ['b7', '7', 'Septième mineure (♭7) : dominante, m7, ø…'], ['M7', 'Δ7', 'Septième majeure'],
                    ['bb7', '°7', 'Septième diminuée : accord diminué (tierce mineure + quinte ♭5)']], k => bst.sev === k);
                const usedPcs = med_cbStructIntervals(bst);
                const extTips = { b9: 'Neuvième mineure', '9': 'Neuvième', s9: 'Neuvième augmentée (♯9)', '11': 'Onzième', s11: 'Onzième augmentée (♯11)', b13: 'Treizième mineure (♭13)', '13': 'Treizième' };
                const extSeg = `<div class="jm-seg">${MED_EXT_ORDER.map(k =>
                    chip(bst.ext.includes(k), `data-act="ext" data-v="${k}" title="${extTips[k]}${usedPcs.includes(MED_EXT[k]) ? ' (déjà dans l\'accord)' : ''}"`,
                        glyph(MED_EXT_LABEL[k]), usedPcs.includes(MED_EXT[k]) ? ' jm-off' : '')).join('')}</div>`;
                const shortcutIds = ['majTriad', 'minTriad', 'maj7', 'm7', '7', 'm7b5', 'dim7', '7sus4', '7alt', '6', '9', 'm9'];
                const shortcuts = shortcutIds.map(id => {
                    const co = findChordObj(id);
                    return chip(id === cur.chordId, `data-act="chord" data-v="${id}" title="${co.fullName || ''}"`, jazz(id) || co.name);
                }).join('');
                const spelledNotes = med_getSpelledChordNotes(med_chordRootName(cur.rootIndex, cur.chordId, rootLabels), chordObj).map(glyph).join(' ');
                const notesNote = cur.chordId === '7alt' ? ' <small>(7alt = 7♭5 ; ajoutez ♭9, ♯9, ♭13 pour le détail)</small>' : '';
                const buildChord = `<div class="jm-sec"><div class="jm-sec-t">Accord</div>
                        <div class="jm-row">${shortcuts}</div>
                        <div class="jm-sub-t">Tierce</div>${thirdSeg}
                        <div class="jm-sub-t">Quinte</div>${fifthSeg}
                        <div class="jm-sub-t">Septième</div>${sevSeg}
                        <div class="jm-sub-t">Tensions</div>${extSeg}
                        <div class="jm-notes">Notes : <b>${spelledNotes}</b>${notesNote}</div></div>`;
                // Fondamentale « clavier » : touches noires (♯ et ♭) au-dessus des touches blanches
                const kbBlack = [['C#', '1s', 2], ['Db', '1f', 3], ['D#', '3s', 4], ['Eb', '3f', 5], ['F#', '6s', 8], ['Gb', '6f', 9],
                    ['G#', '8s', 10], ['Ab', '8f', 11], ['A#', '10s', 12], ['Bb', '10f', 13]];
                const kbWhite = [['C', '0'], ['D', '2'], ['E', '4'], ['F', '5'], ['G', '7'], ['A', '9'], ['B', '11']];
                const rootOn = (nm, v) => rootLabels[parseInt(v, 10)] === nm && parseInt(v, 10) === cur.rootIndex;
                const keyboard = `<div class="jm-kb">
                        ${kbBlack.map(([nm, v, col]) => chip(rootOn(nm, v), `data-act="root" data-v="${v}" style="grid-row:1;grid-column:${col}" title="${glyph(nm)}"`, glyph(nm), ' jm-blk')).join('')}
                        ${kbWhite.map(([nm, v], i) => chip(rootOn(nm, v), `data-act="root" data-v="${v}" style="grid-row:2;grid-column:${i * 2 + 1} / span 2"`, nm)).join('')}
                    </div>`;
                const foldSec = (key, title, summary, body) => {
                    const open = !isFolded(key);
                    return `<div class="jm-sec"><button type="button" class="jm-sec-t jm-fold-t" data-act="fold" data-v="${key}" aria-expanded="${open}"><span>${title}${summary ? `<em>${summary}</em>` : ''}</span><span class="jm-caret">${open ? '▾' : '▸'}</span></button>${open ? body : ''}</div>`;
                };
                const bassSummary = (Number.isInteger(cur.bassRootIndex) && cur.bassRootIndex !== rootPc) ? `/${med_bassNoteName(cur.rootIndex, cur.chordId, cur.bassRootIndex, rootLabels)}` : '';
                const rpSummary = [step.repeatStart && m.measureInStep === 1 ? '|:' : '', rpEnd ? `:|×${rpEnd}` : '', step.volta ? `${step.volta}${step.volta === 1 ? 're' : 'e'} fin` : ''].filter(Boolean).join(' ');
                const modeBar = `<div class="jm-mode">
                        ${chip(mode === 'build', 'data-act="mode" data-v="build" title="Choisir la fondamentale, la qualité, puis les tensions"', 'Construire')}
                        ${chip(mode === 'cat', 'data-act="mode" data-v="cat" title="Liste d\'accords prédéfinis"', 'Catalogue')}
                    </div>`;
                const secDur = `<div class="jm-sec"><div class="jm-sec-t">Durée</div>${durSeg}</div>`;
                const secDeg = `<div class="jm-sec"><div class="jm-sec-t">Degrés de la tonalité</div><div class="jm-row">${degrees}</div></div>`;
                const secScale = `<div class="jm-sec"><div class="jm-sec-t">Gamme</div><div class="jm-row">${scales}</div></div>`;
                const body = mode === 'build' ? `
                    ${secDur}
                    ${secDeg}
                    <div class="jm-sec"><div class="jm-sec-t">Fondamentale</div>${keyboard}</div>
                    ${buildChord}
                    ${secScale}
                    ${foldSec('bass', 'Basse', bassSummary, `<div class="jm-row">${basses}</div>`)}
                    ${foldSec('rp', 'Reprises', rpSummary, `<div class="jm-row">${marks}</div>`)}` : `
                    ${secDur}
                    ${secDeg}
                    <div class="jm-sec"><div class="jm-sec-t">Fondamentale</div><div class="jm-row">${roots}</div></div>
                    <div class="jm-sec"><div class="jm-sec-t">Accord</div><div class="jm-row">${chords}</div>
                        <select class="jm-select" data-act="chordsel"><option value="">Autres accords…</option>${options}</select></div>
                    <div class="jm-sec"><div class="jm-sec-t">Basse</div><div class="jm-row">${basses}</div></div>
                    ${secScale}
                    <div class="jm-sec"><div class="jm-sec-t">Reprises</div><div class="jm-row">${marks}</div></div>`;

                return `
                    <div class="jm-head" title="Glisser pour déplacer">
                        <span class="jm-title">Mesure ${m.measureNumber} · ${symbol(cur)}</span>
                        <button type="button" class="jm-btn" data-act="cancel" title="Fermer (Échap)">✕</button>
                    </div>
                    ${modeBar}
                    ${body}
                    <div class="jm-foot">
                        <button type="button" class="jm-btn" data-act="prev" title="Mesure précédente (←)">‹</button>
                        <button type="button" class="jm-btn" data-act="next" title="Mesure suivante (→) — ajoute une mesure après la dernière">›</button>
                        <button type="button" class="jm-btn" data-act="ins" title="Insérer une copie de cette mesure juste après">+ Insérer après</button>
                        <button type="button" class="jm-btn jm-danger" data-act="del" title="Supprimer cette mesure">Supprimer</button>
                        <button type="button" class="jm-btn jm-primary" data-act="close" title="Entrée">OK</button>
                    </div>
                    <div class="jm-hint">Touches : 1–7 degrés · ← → mesures · Entrée / Échap pour fermer</div>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { editorHtml };
}
