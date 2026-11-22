// ui/grid-view.js — affichage de la grille d'accords (jam), sans DOM : découpage en lignes, « modèle » de chaque case
// (accord(s), gamme, reprises, 1re / 2e fin, case active) et HTML correspondant, repères d'impression, empreinte de rendu.
// Le moteur (JamEngine.renderSequenceUI / printCurrentGrid) ne fait plus que créer les éléments, brancher les clics
// et insérer le HTML produit ici. Chargé par index.html via <script src="ui/grid-view.js"> et testé par ui/grid-view.test.js.
//
// Contexte de vue `v` (construit une fois par rendu par le moteur) :
//   grid            grille (blocs)         flat      liste à plat des mesures (getFlatMeasureList)
//   effV            volta effective par bloc (_effectiveVolta)
//   scalesDb        catalogue des gammes   bpb / splitBeat   temps par mesure, temps où change l'accord d'une mesure à deux accords
//   aksak           mesure aksak (5/8, 7/8, 11/8) : temps inégaux, les deux moitiés d'une mesure coupée restent de même largeur
//   currentBeat     temps courant dans le bloc    currentMeasureNum   numéro de la mesure en cours
//   showHarmonicFunctions, editBarOpen, sel ({from, to} ou null)
//   symbolHtml(chord)  symbole d'accord en HTML    fnLabel(chord, flat, index, half)  chiffrage de fonction
//   partLabelOf(m)  repère de partie qui ouvre la mesure (lettre ou nom libre, ou null)    measureKey(m)  clé d'égalité de deux mesures

// Découpe la liste à plat en lignes de 4 mesures ; une nouvelle partie commence toujours une nouvelle ligne.
// breakBefore(m) (facultatif) : autre raison de commencer une ligne (la coda ⊕, comme sur un Real Book).
function layoutRows(flat, partLabelOf, breakBefore) {
    const rows = [];
    let cur = [];
    flat.forEach((m) => {
        if (cur.length && (cur.length === 4 || partLabelOf(m) || (breakBefore && breakBefore(m)))) { rows.push(cur); cur = []; }
        cur.push(m);
    });
    if (cur.length) rows.push(cur);
    return rows;
}

// ===== Signes de renvoi (Real Book) : 𝄋 et ⊕ au-dessus du début de la mesure, To Coda / Fine / D.C. / D.S. au-dessus de sa fin =====
// Les symboles sont dessinés en SVG (les caractères musicaux 𝄋 𝄌 manquent dans beaucoup de polices, sur iPhone notamment).
const NAV_SEGNO_SVG = '<svg class="nav-glyph" viewBox="0 0 20 24" width="0.95em" height="1.15em" aria-hidden="true"><path d="M14.5 6.2C14.2 3 6.2 2.6 6 7c-.2 4.6 8.4 4.4 8.4 9.6 0 4.8-8.6 5-9-.6" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M4 21.5 16 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="4.6" cy="11.2" r="1.7" fill="currentColor"/><circle cx="15.4" cy="12.8" r="1.7" fill="currentColor"/></svg>';
const NAV_CODA_SVG = '<svg class="nav-glyph" viewBox="0 0 20 20" width="1em" height="1em" aria-hidden="true"><circle cx="10" cy="10" r="5.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 .8v18.4M.8 10h18.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const NAV_LABELS = { dc: 'D.C.', dcFine: 'D.C. al Fine', dcCoda: 'D.C. al Coda', ds: 'D.S.', dsFine: 'D.S. al Fine', dsCoda: 'D.S. al Coda' };
const NAV_TITLES = {
    dc: 'Da capo : retour au début', dcFine: 'Da capo al Fine : retour au début, jusqu\'au Fine', dcCoda: 'Da capo al Coda : retour au début, puis du To Coda à la coda ⊕',
    ds: 'Dal segno : retour au signe', dsFine: 'Dal segno al Fine : retour au signe, jusqu\'au Fine', dsCoda: 'Dal segno al Coda : retour au signe, puis du To Coda à la coda ⊕'
};
// Signes du début du bloc (𝄋, ⊕ Coda) en HTML ; '' s'il n'y en a pas.
function navStartHtml(st) {
    if (!st) return '';
    const out = [];
    if (st.segno) out.push(`<span class="nav-it" title="Segno : point de retour du D.S.">${NAV_SEGNO_SVG}</span>`);
    if (st.coda) out.push(`<span class="nav-it" title="Coda : on y saute depuis le To Coda, après le renvoi">${NAV_CODA_SVG}<span class="nav-w">Coda</span></span>`);
    return out.join(' ');
}
// Signes de la fin du bloc (To Coda ⊕, Fine, D.C. / D.S.) en HTML ; '' s'il n'y en a pas.
function navEndHtml(st) {
    if (!st) return '';
    const out = [];
    if (st.toCoda) out.push(`<span class="nav-it" title="To Coda : après le renvoi, saut à la coda ⊕"><span class="nav-w">To Coda</span>${NAV_CODA_SVG}</span>`);
    if (st.fine) out.push('<span class="nav-it" title="Fine : après le renvoi, la grille s\'arrête ici"><span class="nav-w">Fine</span></span>');
    if (NAV_LABELS[st.jump]) out.push(`<span class="nav-it" title="${NAV_TITLES[st.jump]}"><span class="nav-w">${NAV_LABELS[st.jump]}</span></span>`);
    return out.join(' ');
}
// La mesure m ouvre-t-elle la coda ? (elle commence alors une nouvelle ligne, comme sur un Real Book)
function navRowBreak(grid, m) {
    return !!m && m.measureInStep === 1 && !!(grid[m.stepIndex] || {}).coda;
}

// Classes de la case selon qu'elle est en cours de lecture ou non.
function cellClassName(isActive) {
    return `jam-cell p-2 rounded border text-center transition cursor-pointer select-none flex flex-col justify-between h-[64px] relative ${
        isActive
            ? 'bg-blue-600 border-blue-400 text-white shadow-lg ring-2 ring-blue-400/50 scale-[1.02] z-10'
            : 'bg-white border-slate-300 hover:border-slate-500 text-slate-900'
    }`;
}

// Tout ce qu'il faut savoir pour dessiner la case d'une mesure.
function measureCellModel(v, m) {
    const symA = v.symbolHtml(m);
    const previousMeasure = v.flat[m.measureNumber - 2];
    // « % » : la mesure répète exactement la précédente (les deux accords s'il y en a deux)
    const repeat = !!previousMeasure && !v.partLabelOf(m) && v.measureKey(previousMeasure) === v.measureKey(m);
    const showSplit = !!m.split && !repeat;
    const displayChordSymbol = repeat ? '%' : symA;
    const isActive = (m.measureNumber === v.currentMeasureNum);
    const activeHalf = (isActive && showSplit) ? ((v.currentBeat % v.bpb) >= v.splitBeat ? 1 : 0) : -1;
    const scaleShort = (id) => (v.scalesDb[id] && v.scalesDb[id].name.split(' ')[0]) || '';
    const scaleLabel = showSplit ? `${scaleShort(m.scaleId)} · ${scaleShort(m.split.scaleId)}` : scaleShort(m.scaleId);
    const centerHtml = showSplit
        ? `<div class="jam-split my-auto">
                                   <div class="jam-half${activeHalf === 0 ? ' jam-half-active' : ''}" data-half="0"><span class="jam-realbook-chord whitespace-nowrap">${symA}</span></div>
                                   <div class="jam-half${activeHalf === 1 ? ' jam-half-active' : ''}" data-half="1"><span class="jam-realbook-chord whitespace-nowrap">${v.symbolHtml(m.split, m)}</span></div>
                               </div>`
        : `<div class="jam-realbook-chord my-auto whitespace-nowrap overflow-visible">${displayChordSymbol}</div>`;
    let bottomHtml = '';
    if (v.showHarmonicFunctions) {
        const flatIdx = v.flat.indexOf(m);
        if (showSplit) {
            const fa = v.fnLabel({ rootIndex: m.rootIndex, chordId: m.chordId, harmonicFunction: null, fnLabel: m.fnLabel }, v.flat, flatIdx, 0);
            const fb = v.fnLabel({ rootIndex: m.split.rootIndex, chordId: m.split.chordId, harmonicFunction: null, fnLabel: m.split.fnLabel }, v.flat, flatIdx, 1);
            bottomHtml = `<div class="jam-half-fn jam-fn-label" data-fhalf="0" style="left:30px">${fa}</div><div class="jam-half-fn jam-fn-label" data-fhalf="1" style="right:8px">${fb}</div>`;
        } else {
            bottomHtml = `<div class="jam-cell-bottom jam-fn-label text-[10px] text-right font-normal jam-realbook-chord text-red-500" data-fhalf="0">${v.fnLabel(m, v.flat, flatIdx)}</div>`;
        }
    }
    // Signes de reprise de cette mesure (barres |: et :|, ×N, 1re / 2e fin)
    const stp = v.grid[m.stepIndex];
    const hasRS = !!stp.repeatStart && m.measureInStep === 1;
    const hasRE = !!stp.repeatEnd && m.measureInStep === stp.measures;
    const marks = m.measureInStep === 1 ? marksHtml(stp) : ''; // indications Droit / Swing et tempo (tous passages, puis 1x, 2x…)
    let voltaFirst = false;
    const sv = v.effV[m.stepIndex]; // 1re / 2e fin effective (la 1re fin va jusqu'au :|)
    if (sv) {
        const prevM = v.flat[m.measureNumber - 2];
        voltaFirst = !prevM || v.effV[prevM.stepIndex] !== sv;
    }
    const selected = !!(v.sel && m.measureNumber >= v.sel.from && m.measureNumber <= v.sel.to);
    const navStart = m.measureInStep === 1 ? navStartHtml(stp) : '';
    const navEnd = m.measureInStep === stp.measures ? navEndHtml(stp) : '';
    return {
        navStart, navEnd,
        measureNumber: m.measureNumber, isActive, repeat, showSplit, activeHalf, scaleLabel, centerHtml, bottomHtml,
        hasRS, hasRE, sv, voltaFirst, repeatEnd: stp.repeatEnd, marks, selected,
        ts3: showSplit && v.bpb === 3 && !v.aksak, editBarOpen: !!v.editBarOpen
    };
}

// Texte d'une indication de tempo : « ♩=90 », « a tempo », ou '' (aucune).
function tempoMarkText(t) {
    if (t === 'base') return 'a tempo';
    return (Number.isInteger(t) && t >= 30 && t <= 300) ? '\u2669=' + t : '';
}
// Même chose en HTML : la noire ♩ dans une police qui la dessine en grand (la police manuscrite la rend minuscule).
function tempoMarkHtml(t) {
    const txt = tempoMarkText(t);
    return txt.charAt(0) === '\u2669' ? '<span class="jam-qn">\u2669</span>' + txt.slice(1) : txt;
}

// Indications d'un bloc en HTML, comme sur un lead sheet : « Droit ♩=60 » (tous les passages), puis par passage de la reprise
// « 1x Droit ♩=80 · 2x Swing ♩=160 » ; '' s'il n'y en a pas.
function marksHtml(st) {
    if (!st) return '';
    const one = (o) => [o.feel === 'straight' ? 'Droit' : (o.feel === 'swing' ? 'Swing' : ''), tempoMarkHtml(o.tempo)].filter(Boolean).join(' ');
    const parts = [];
    const base = one(st);
    if (base) parts.push(base);
    if (st.byPass && typeof st.byPass === 'object') {
        Object.keys(st.byPass).sort().forEach(k => { const t = one(st.byPass[k] || {}); if (t) parts.push(`<b class="jam-pass">${k}x</b> ${t}`); });
    }
    return parts.join(' · ');
}

// Mêmes indications en texte simple (résumé de la barre d'édition, info-bulles).
function marksText(st) { return marksHtml(st).replace(/<[^>]*>/g, ''); }

// Popup « Reprises » (reprises, renvois et jeu) de la barre d'édition (sélection from..to). v :
//   from, to             plage sélectionnée (numéros de mesure)
//   times                reprise posée exactement sur la sélection (2 à 4), 0 sinon
//   region               { from, to, times } reprise qui contient la sélection sans être elle (affichée pour information), ou null
//   volta                1re / 2e fin commune à toute la sélection (1, 2) ou 0
//   rows                 [{ p, feel, tempo }] : une ligne par passage (p = 1…N) quand la mesure est reprise, sinon une seule (p = 0)
//   tempoHere, baseBpm   tempo en vigueur au début de la sélection (indice du champ) et tempo général
//   after                { possible, on, measure } : « revenir au jeu général » sur la mesure qui suit la sélection
//   hasMarks             la première mesure porte au moins une indication de jeu
function repeatPopHtml(v) {
    const chip = (on, attrs, inner, extra = '') => `<button type="button" class="jm-chip${extra}${on ? ' is-on' : ''}" ${attrs}>${inner}</button>`;
    const range = v.from === v.to ? `mesure ${v.from}` : `mesures ${v.from} à ${v.to}`;
    const reps = [[0, 'Aucune', 'Pas de reprise : retire les signes de reprise et les 1re / 2e fins de la sélection'],
        [2, '×2', 'Sélection jouée 2 fois'], [3, '×3', 'Sélection jouée 3 fois'], [4, '×4', 'Sélection jouée 4 fois']]
        .map(([n, l, t]) => chip(v.times === n && !(n === 0 && v.region), `data-act="rep" data-v="${n}" title="${t}"`, l)).join('');
    const regionNote = v.region
        ? `<div class="jrp-note">Cette mesure est dans la reprise ×${v.region.times} des mesures ${v.region.from} à ${v.region.to}.</div>` : '';
    // Une seule mesure sélectionnée : début et fin de reprise se posent séparément (la reprise commence ici et/ou finit ici)
    const ends = [[0, '—', 'Pas de fin de reprise sur cette mesure'], [2, '×2', 'Fin de reprise : retour au début, 2 passages'],
        [3, '×3', 'Fin de reprise : 3 passages'], [4, '×4', 'Fin de reprise : 4 passages']]
        .map(([n, l, t]) => chip((v.repEnd || 0) === n, `data-act="rend" data-v="${n}" title="${t}"`, l)).join('');
    const singleRep = `<div class="jrp-single">
                <div class="jrp-line"><span class="jrp-lab">Début</span>${chip(!!v.repStart, 'data-act="rstart" title="Début de reprise |: sur cette mesure (re-cliquer pour retirer)"', '|: ici')}</div>
                <div class="jrp-line"><span class="jrp-lab">Fin :|</span><div class="jm-seg jrp-rep">${ends}</div></div>
            </div>
            <div class="jrp-note">Pour reprendre plusieurs mesures d'un coup, sélectionnez-les en glissant dans la grille : la reprise se pose alors autour de la sélection.</div>`;
    const voltas = chip(v.volta === 1, 'data-act="volta" data-v="1" title="La sélection est la 1re fin : jouée seulement au premier passage"', '1re fin')
        + chip(v.volta === 2, 'data-act="volta" data-v="2" title="La sélection est la 2e fin : jouée au dernier passage"', '2e fin');
    const qn = '<span class="jm-qn">\u2669</span>';
    const row = (r) => {
        const pa = `data-p="${r.p}"`;
        const lab = r.p ? `<span class="jrp-pass">${r.p}x</span>` : '';
        const tnum = Number.isInteger(r.tempo) ? r.tempo : '';
        return `<div class="jrp-row">${lab}
                <div class="jm-seg jrp-feel">${chip(r.feel === 'straight', `data-act="feel" data-v="straight" ${pa} title="Croches droites"`, 'Droit')}${chip(r.feel === 'swing', `data-act="feel" data-v="swing" ${pa} title="Croches swing : le swing réglé dans le jukebox, ou celui de l'orchestre (triolet) s'il est réglé droit"`, 'Swing')}</div>
                <div class="jrp-tempo">${chip(false, `data-act="tstep" data-v="-5" ${pa} title="Ralentir de 5"`, '−')}<label title="Tempo (vider pour retirer)">${qn}=<input type="number" data-act="tempo" ${pa} min="30" max="300" step="1" inputmode="numeric" value="${tnum}" placeholder="${r.here || v.tempoHere || ''}"></label>${chip(false, `data-act="tstep" data-v="5" ${pa} title="Accélérer de 5"`, '+')}${chip(r.tempo === 'base', `data-act="tbase" ${pa} title="a tempo : tempo général (\u2669 = ${v.baseBpm || ''})"`, 'a tempo')}</div>
            </div>`;
    };
    const after = v.after && v.after.possible
        ? `<label class="jrp-after" title="Rétablit, à la mesure ${v.after.measure}, le jeu (croches et tempo) d'avant la sélection"><input type="checkbox" data-act="after"${v.after.on ? ' checked' : ''}${v.hasMarks || v.after.on ? '' : ' disabled'}> Reprendre le jeu d'avant à la mesure ${v.after.measure}</label>` : '';
    const multi = v.rows.length > 1;
    const navSec = v.nav ? navPopSection(v, chip) : '';
    return `
        <div class="jm-head" title="Glisser pour déplacer">
            <span class="jm-title">Reprises · ${range}</span>
            <button type="button" class="jm-btn" data-act="close" title="Fermer (Échap)">✕</button>
        </div>
        <div class="jm-sec"><div class="jm-sec-t">Reprise</div>
            ${v.single ? singleRep : `<div class="jm-seg jrp-rep">${reps}</div>`}${regionNote}
            <div class="jm-row jrp-voltas">${voltas}</div>
        </div>
        ${navSec}
        <div class="jm-sec"><div class="jm-sec-t">${v.jeuTitle || `Jeu à partir de la mesure ${v.from}${multi ? ', passage par passage' : ''}`}</div>
            ${v.rows.map(row).join('')}
            ${after}
            ${v.hasMarks ? `<button type="button" class="jm-chip jrp-clear" data-act="clearplay" title="Retire les indications de croches et de tempo de la mesure ${v.target || v.from}">Effacer le jeu</button>` : ''}
        </div>`;
}

// Section « Renvois » du popup : v.nav = { here (navMarksOf : signes de la sélection), summary (navMarksSummary : où est chaque
// signe dans la grille), startMeasure, endMeasure }. Début de la sélection : 𝄋 / ⊕ ; fin : To Coda / Fine et le renvoi.
function navPopSection(v, chip) {
    const n = v.nav, h = n.here, sm = n.summary;
    const t = (k, base) => base + (sm[k] && !h[k] ? ` — déjà en mesure ${sm[k]}, il y sera déplacé` : '') + ' (re-cliquer pour retirer)';
    const start = chip(h.segno, `data-act="nav" data-v="segno" title="${t('segno', `𝄋 Segno au début de la mesure ${n.startMeasure} : point de retour du D.S.`)}"`, `${NAV_SEGNO_SVG} Segno`)
        + chip(h.coda, `data-act="nav" data-v="coda" title="${t('coda', `⊕ Coda au début de la mesure ${n.startMeasure} : on y saute depuis le To Coda`)}"`, `${NAV_CODA_SVG} Coda`);
    const end = chip(h.toCoda, `data-act="nav" data-v="toCoda" title="${t('toCoda', `To Coda à la fin de la mesure ${n.endMeasure} : après le renvoi, saut à la coda ⊕`)}"`, `To Coda ${NAV_CODA_SVG}`)
        + chip(h.fine, `data-act="nav" data-v="fine" title="${t('fine', `Fine à la fin de la mesure ${n.endMeasure} : après le renvoi, la grille s'arrête ici`)}"`, 'Fine');
    const jumpChip = (k) => chip(h.jump === k, `data-act="navjump" data-v="${k}" title="${NAV_TITLES[k]}, à la fin de la mesure ${n.endMeasure}${sm.jump && sm.jump.measure !== n.endMeasure ? ` (remplace le ${NAV_LABELS[sm.jump.kind]} de la mesure ${sm.jump.measure})` : ''} (re-cliquer pour retirer)"`, NAV_LABELS[k]);
    const jumps = `<div class="jm-seg jrp-nav3">${['dc', 'dcFine', 'dcCoda'].map(jumpChip).join('')}</div><div class="jm-seg jrp-nav3">${['ds', 'dsFine', 'dsCoda'].map(jumpChip).join('')}</div>`;
    // État de la grille et ce qui manque pour que le renvoi se joue comme écrit
    const parts = [];
    if (sm.segno) parts.push(`${NAV_SEGNO_SVG} m. ${sm.segno}`);
    if (sm.toCoda) parts.push(`To Coda m. ${sm.toCoda}`);
    if (sm.fine) parts.push(`Fine m. ${sm.fine}`);
    if (sm.jump) parts.push(`${NAV_LABELS[sm.jump.kind]} m. ${sm.jump.measure}`);
    if (sm.coda) parts.push(`${NAV_CODA_SVG} m. ${sm.coda}`);
    const warn = [];
    if (sm.jump) {
        const k = sm.jump.kind;
        if (k.indexOf('ds') === 0 && !sm.segno) warn.push('posez le Segno (sinon le D.S. repart du début)');
        if (/Coda$/.test(k) && !sm.toCoda) warn.push('il manque le To Coda');
        if (/Coda$/.test(k) && !sm.coda) warn.push('il manque la Coda ⊕');
        if (/Fine$/.test(k) && !sm.fine) warn.push('il manque le Fine (la grille sera jouée jusqu\'au bout)');
        if (sm.coda && sm.coda <= sm.jump.measure && /Coda$/.test(k)) warn.push('la Coda se place en général après le renvoi');
    } else if (sm.segno || sm.coda || sm.toCoda || sm.fine) warn.push('ajoutez un renvoi D.C. ou D.S. pour que ces signes soient joués');
    const any = h.segno || h.coda || h.toCoda || h.fine || h.jump;
    const single = n.startMeasure === n.endMeasure;
    return `<div class="jm-sec jrp-navsec"><div class="jm-sec-t">Renvois (Real Book)</div>
            <div class="jrp-line"><span class="jrp-lab">${single ? 'Début' : `Début m.${n.startMeasure}`}</span><div class="jm-seg jrp-nav2">${start}</div></div>
            <div class="jrp-line"><span class="jrp-lab">${single ? 'Fin' : `Fin m.${n.endMeasure}`}</span><div class="jm-seg jrp-nav2">${end}</div></div>
            <div class="jrp-line jrp-line-top"><span class="jrp-lab">Renvoi</span><div class="jrp-navj">${jumps}</div></div>
            ${parts.length ? `<div class="jrp-note jrp-navsum">Grille : ${parts.join(' · ')}</div>` : ''}
            ${warn.length ? `<div class="jrp-note jrp-navwarn">${warn.join(' ; ')}.</div>` : ''}
            ${any ? `<button type="button" class="jm-chip jrp-clear" data-act="navclear" title="Retire les signes de renvoi de la sélection">Effacer les renvois</button>` : ''}
        </div>`;
}

// Classes ajoutées à la case en plus de cellClassName.
function cellExtraClasses(c) {
    const out = [];
    if (c.selected) out.push('jam-sel');
    if (c.hasRS) out.push('rp-has-l');
    if (c.hasRE) out.push('rp-has-r');
    if (c.sv) out.push('rp-has-v');
    if (c.ts3) out.push('jam-ts3');
    return out;
}

// Contenu de la case : ligne du haut (n° de mesure, fin, ×N, gamme), accord(s), fonction, boutons d'arpège.
function cellInnerHtml(c) {
    return `
                            <div class="jam-cell-top flex justify-between items-center text-[9px] font-mono ${c.isActive ? 'text-blue-200 font-bold' : 'text-slate-400'}">
                                <span class="jam-cell-tl">${c.voltaFirst ? `<b class="rp-vtxt" title="${c.sv === 1 ? '1re' : '2e'} fin">${c.sv}.</b>` : ''}|${c.measureNumber}${c.editBarOpen ? '<span class="jam-edit-btn" role="button" aria-label="Éditer la mesure" title="Éditer cette mesure">✎</span>' : ''}${c.marks ? `<span class="jam-feel" title="À partir de cette mesure : ${c.marks.replace(/<[^>]*>/g, '')}">${c.marks}</span>` : ''}</span>
                                ${(c.hasRE && c.repeatEnd > 2) ? `<span class="rp-xn" title="Reprise jouée ${c.repeatEnd} fois">×${c.repeatEnd}</span>` : ''}
                                <span class="text-[8px] text-emerald-400 font-medium truncate max-w-[60px]">${c.scaleLabel}</span>
                            </div>
                            ${c.centerHtml}
                            ${c.bottomHtml}
                            <span class="jam-arp-btn" role="button" aria-label="Écouter l'arpège" title="Écouter l'arpège">&gt;&gt;</span>
                            ${c.showSplit ? `<span class="jam-arp-btn jam-arp-btn-b" role="button" aria-label="Écouter l'arpège du second accord" title="Écouter l'arpège du second accord">&gt;&gt;</span>` : ''}
                        `;
}

// Barres de reprise et ligne de 1re / 2e fin (le texte « 1. » et « ×N » est dans la ligne du haut).
function cellMarksHtml(c) {
    let marksHtml = '';
    if (c.hasRS) marksHtml += '<span class="rp-l" title="Début de reprise"></span>';
    if (c.hasRE) marksHtml += '<span class="rp-r" title="Fin de reprise"></span>';
    if (c.sv) {
        marksHtml += '<span class="rp-vl"></span>';
        if (c.voltaFirst) marksHtml += '<span class="rp-vt"></span>';
    }
    // Renvois : étiquettes posées à cheval sur le bord haut de la case (au-dessus de la portée, comme sur un Real Book)
    if (c.navStart) marksHtml += `<span class="nav-tag nav-tag-s">${c.navStart}</span>`;
    if (c.navEnd) marksHtml += `<span class="nav-tag nav-tag-e">${c.navEnd}</span>`;
    return marksHtml;
}

// Empreinte de tout ce qui détermine l'aspect des cases de la grille, hors mesure en cours.
function sequenceFingerprint(v, chordSymbol) {
    const sym = v.flat.map(m => chordSymbol(m) + (m.split ? '/' + chordSymbol(m.split, m) : '')).join(';');
    let fn = '';
    if (v.showHarmonicFunctions) {
        fn = v.flat.map((m, i) => v.fnLabel(m, v.flat, i) + (m.split ? '/' + v.fnLabel(m.split, v.flat, i, 1) : '')).join(';');
    }
    return [JSON.stringify(v.grid), sym, fn, v.mainKey, v.bpb + (v.aksak ? 'a' : ''), v.showHarmonicFunctions ? 1 : 0,
        v.editBarOpen ? 1 : 0, v.sel ? v.sel.from + '-' + v.sel.to : ''].join('\u0001');
}

// Repères d'impression d'une mesure : barres de reprise, ×N, 1re / 2e fin. Renvoie { cls, html }.
function printMarks(grid, effV, m, flat) {
    const st = grid[m.stepIndex];
    const dots = '<svg viewBox="0 0 6 24" width="6pt" height="24pt" aria-hidden="true"><circle cx="3" cy="8" r="2" fill="#000"/><circle cx="3" cy="16" r="2" fill="#000"/></svg>';
    let cls = '', html = '';
    if (st.repeatStart && m.measureInStep === 1) {
        cls += ' has-rs';
        html += `<span class="jam-print-rs"><i class="b1"></i><i class="b2"></i>${dots}</span>`;
    }
    if (st.repeatEnd && m.measureInStep === st.measures) {
        cls += ' has-re';
        html += `<span class="jam-print-re"><i class="b1"></i><i class="b2"></i>${dots}</span>`;
        if (st.repeatEnd > 2) html += `<span class="jam-print-times">×${st.repeatEnd}</span>`;
    }
    const sv = effV[m.stepIndex];
    const svFirst = !!sv && (!flat[m.measureNumber - 2] || effV[flat[m.measureNumber - 2].stepIndex] !== sv);
    // Indications Droit / Swing et de tempo : en haut à gauche de la case (après le « 1. » d'une 1re / 2e fin)
    const mk = m.measureInStep === 1 ? marksHtml(st) : '';
    if (mk) { cls += ' has-feel' + (svFirst ? ' has-feel-v' : ''); html += `<span class="jam-print-marks">${mk}</span>`; }
    if (sv) {
        const first = svFirst;
        html += '<span class="jam-print-vo"></span>';
        if (first) html += `<span class="jam-print-vt"></span><span class="jam-print-vl">${sv}.</span>`;
    }
    // Renvois : au-dessus de la case (début : 𝄋 ⊕ ; fin : To Coda, Fine, D.C. / D.S.)
    const ns = m.measureInStep === 1 ? navStartHtml(st) : '';
    const ne = m.measureInStep === st.measures ? navEndHtml(st) : '';
    if (ns) html += `<span class="jam-print-nav jam-print-nav-s">${ns}</span>`;
    if (ne) html += `<span class="jam-print-nav jam-print-nav-e">${ne}</span>`;
    if (ns || ne) cls += ' has-nav';
    return { cls, html };
}

// HTML de la page d'impression de la grille. Les symboles sont posés ensuite via data-symbol (texte, pas HTML).
// v : grid, flat, effV, bpb, partLabelOf, measureKey, chordSymbol(chord) (texte) ;
//     fnHtml(chord, flat, index, half) (facultatif) : chiffrage de fonction en HTML, imprimé sous l'accord (export PDF avec l'analyse).
function printGridHtml(v) {
    const systems = layoutRows(v.flat, v.partLabelOf, (m) => navRowBreak(v.grid, m));
    const hasParts = v.flat.some(m => isBoxPart(v.partLabelOf(m)));   // gouttière seulement pour les repères courts
    let rowsHtml = '';
    systems.forEach((systemMeasures) => {
        let cellsHtml = '';
        systemMeasures.forEach((m) => {
            const previousMeasure = v.flat[m.measureNumber - 2];
            const repeat = !!previousMeasure && !v.partLabelOf(m) && v.measureKey(previousMeasure) === v.measureKey(m);
            const pm = printMarks(v.grid, v.effV, m, v.flat);
            // Analyse fonctionnelle (option du PDF) : chiffrage en bas à droite de la case, ou de chaque moitié d'une mesure à deux accords
            const flatIdx = v.flat.indexOf(m);
            const fn = (c, half) => {
                if (!v.fnHtml) return '';
                const t = v.fnHtml(c, v.flat, flatIdx, half);
                return t ? `<span class="jam-print-fn${half === 1 ? ' jam-print-fn-b' : (m.split && !repeat ? ' jam-print-fn-a' : '')}">${t}</span>` : '';
            };
            if (m.split && !repeat) {
                const fnA = fn({ rootIndex: m.rootIndex, chordId: m.chordId, harmonicFunction: null, fnLabel: m.fnLabel }, 0);
                const fnB = fn({ rootIndex: m.split.rootIndex, chordId: m.split.chordId, harmonicFunction: null, fnLabel: m.split.fnLabel }, 1);
                cellsHtml += `<div class="jam-print-cell${pm.cls}${fnA || fnB ? ' has-fn' : ''}"><div class="jam-print-split${v.bpb === 3 && !v.aksak ? ' jam-print-split-3' : ''}"><span class="jam-print-chord" data-symbol="${encodeURIComponent(v.chordSymbol(m))}"></span><span class="jam-print-chord" data-symbol="${encodeURIComponent(v.chordSymbol(m.split, m))}"></span></div>${fnA}${fnB}${pm.html}</div>`;
            } else {
                const displayChordSymbol = repeat ? '%' : v.chordSymbol(m);
                const f = fn(m, 0);
                cellsHtml += `<div class="jam-print-cell${pm.cls}${f ? ' has-fn' : ''}"><span class="jam-print-chord" data-symbol="${encodeURIComponent(displayChordSymbol)}"></span>${f}${pm.html}</div>`;
            }
        });
        for (let k = systemMeasures.length; k < 4; k++) {
            cellsHtml += `<div class="jam-print-cell jam-print-cell-empty"></div>`;
        }
        const rowPart = v.partLabelOf(systemMeasures[0]);
        const box = isBoxPart(rowPart);
        const gutterHtml = hasParts ? `<div class="jam-print-gutter">${box ? `<span class="jam-print-part${rowPart.length > 1 ? ' jam-part-long' : ''}${rowPart.length > 2 ? ' jam-part-l3' : ''}">${escPart(rowPart)}</span>` : ''}</div>` : '';
        const bannerHtml = (rowPart && !box) ? `<div class="jam-print-partname${hasParts ? ' with-gutter' : ''}">${escPart(rowPart)}</div>` : '';
        // Ligne enveloppée dans un bloc simple : Safari ne sait pas éviter de couper une ligne en grille / en flex entre deux pages
        const rowNav = cellsHtml.indexOf(' has-nav') >= 0; // place au-dessus de la ligne pour les renvois
        rowsHtml += `<div class="jam-print-line${rowNav ? ' has-nav' : ''}">${bannerHtml}<div class="jam-print-row">${gutterHtml}${cellsHtml}</div></div>`;
    });
    return `
                    <div class="jam-print-title"></div>
                    <div class="jam-print-info"><span class="jam-print-tempo"></span><span class="jam-print-key"></span></div>
                    <div class="jam-print-grid${hasParts ? ' has-parts' : ''}">${rowsHtml}</div>
                `;
}

// En-tête de la page d'impression / du PDF : tempo et swing (à gauche, comme sur une partition Real Book), tonalité (à droite).
// o : { keyName ('Bb'), qualityLabel ('Majeur'), bpm, ternary (mesure composée : le tempo compte des noires pointées),
//       swingAvailable (le swing a un sens dans cette mesure), swing (rapport 0.5 à 0.75) }.
function printInfoParts(o) {
    const pct = Math.round((Number(o.swing) || 0.5) * 100);
    const swung = !!o.swingAvailable && pct > 50;
    return {
        tempo: `${o.ternary ? '♩.' : '♩'} = ${Math.round(Number(o.bpm) || 0)}`,
        feel: swung ? 'Swing' : '', // « Swing » seulement si la grille swingue ; rien sinon
        key: `Tonalité : ${o.keyName} ${String(o.qualityLabel || '').toLowerCase()}`.trim()
    };
}

// Titre d'une annotation de mesure dans le PDF : « Mesure 5 » ou « Mesures 9–12 ». o : { startMeasure, endMeasure }.
function measureNoteTitle(o) {
    return o.endMeasure > o.startMeasure ? `Mesures ${o.startMeasure}–${o.endMeasure}` : `Mesure ${o.startMeasure}`;
}

// ---- Position, sélection et défilement de la grille ----

// Numéro (à partir de 1) de la mesure en cours de lecture ; 1 si aucun bloc n'est en cours.
function currentMeasureNumber(grid, currentStepIndex, currentBeat, bpb) {
    if (!(currentStepIndex >= 0 && currentStepIndex < grid.length)) return 1;
    let count = 0;
    for (let i = 0; i < currentStepIndex; i++) count += grid[i].measures;
    return count + Math.floor(currentBeat / bpb) + 1;
}

// La grille a raccourci : que faire de la sélection { from, to } et de l'ancre ? Renvoie
// { clearSel (sélection entièrement hors grille), newTo (fin ramenée à la dernière mesure, ou null), clearAnchor }.
function selectionFix(sel, anchor, total) {
    const fix = { clearSel: false, newTo: null, clearAnchor: false };
    if (sel && sel.from > total) fix.clearSel = true;
    else if (sel && sel.to > total) fix.newTo = total;
    if (anchor && anchor > total) fix.clearAnchor = true;
    return fix;
}

// Repère de partie dans la gouttière d'une ligne (lettre encadrée), ou null si la ligne n'ouvre pas de partie.
// Repère court (jusqu'à 3 caractères : A, B', in, out, A1, Bis…) : lettre encadrée dans la gouttière, façon Realbook.
// Nom plus long (« Couplet », « Refrain »…) : cadre posé au-dessus de la ligne (partBanner), la gouttière reste vide.
const PART_BOX_MAX = 3;
const isBoxPart = (p) => typeof p === 'string' && p.length > 0 && p.length <= PART_BOX_MAX;
function partTitle(p) { return p === 'in' ? 'Introduction' : p === 'out' ? 'Conclusion (outro)' : `Partie ${p}`; }
function partBanner(rowPart) {
    if (!rowPart || isBoxPart(rowPart)) return null;
    return { className: 'jam-part-banner', text: rowPart, title: partTitle(rowPart) };
}
const escPart = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function gutterMark(rowPart) {
    if (!isBoxPart(rowPart)) return null;
    return {
        className: 'jam-part-mark' + (rowPart.length > 1 ? ' jam-part-long' : '') + (rowPart.length > 2 ? ' jam-part-l3' : ''),
        text: rowPart,
        title: partTitle(rowPart),
    };
}

// Cases à ajouter pour compléter une ligne de 4 mesures : 'gap' (fin de partie, la suivante commence à la ligne),
// 'add' (bouton « + » en dernière ligne, en mode édition à l'arrêt) ou 'empty' (case vide en pointillés).
function rowFillers(count, rowIndex, rowCount, canAdd) {
    const out = [];
    for (let k = count; k < 4; k++) {
        if (rowIndex < rowCount - 1) out.push('gap');
        else if (k === count && rowIndex === rowCount - 1 && canAdd) out.push('add');
        else out.push('empty');
    }
    return out;
}

// Faut-il une ligne de plus pour le bouton « + » (dernière ligne pleine) ?
function needsAddRow(canAdd, lastRowLength) {
    return !!canAdd && lastRowLength === 4;
}

// Position de lecture après un clic sur la mesure m (moitié cliquée : 0 ou 1).
function clickPosition(m, half, bpb, splitBeat) {
    return { stepIndex: m.stepIndex, beat: (m.measureInStep - 1) * bpb + (half === 1 ? splitBeat : 0) };
}

// Pendant la lecture, un clic hors de la plage jouée l'abandonne.
function playRangeAfterClick(range, measureNumber) {
    return range && (measureNumber < range.from || measureNumber > range.to) ? null : range;
}

// Moitié à surligner dans une case à deux accords : -1 si la case n'est pas la mesure en cours, sinon 0 ou 1.
function halfToHighlight(isCurrentMeasure, currentBeat, bpb, splitBeat) {
    return isCurrentMeasure ? ((currentBeat % bpb) >= splitBeat ? 1 : 0) : -1;
}

// Navigation au clavier : numéro de la mesure voisine de n. rows : lignes de layoutRows ; key : 'ArrowLeft' | 'ArrowRight' |
// 'ArrowUp' | 'ArrowDown'. Gauche / droite : mesure précédente / suivante (d'une ligne à l'autre). Haut / bas : même colonne
// dans la ligne du dessus / du dessous (la dernière case si cette ligne est plus courte). Au bord de la grille : n inchangé.
function neighborMeasure(rows, n, key) {
    let r = -1, c = -1;
    rows.forEach((row, i) => {
        const j = row.findIndex((m) => m.measureNumber === n);
        if (j >= 0) { r = i; c = j; }
    });
    if (r < 0) return n;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const all = [].concat(...rows);
        const i = all.findIndex((m) => m.measureNumber === n) + (key === 'ArrowLeft' ? -1 : 1);
        return i >= 0 && i < all.length ? all[i].measureNumber : n;
    }
    const nr = r + (key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0);
    if (nr === r || nr < 0 || nr >= rows.length) return n;
    return rows[nr][Math.min(c, rows[nr].length - 1)].measureNumber;
}

// Navigation au clavier qui s'arrête sur chaque accord : dans une mesure à deux accords, → passe du premier au second avant
// la mesure suivante, et ← du second au premier ; en arrivant par ← sur une mesure à deux accords, on se pose sur le second
// (l'ordre de lecture est respecté dans les deux sens). ↑ ↓ changent de ligne et se posent sur le premier accord.
// cur = { n, half } ; hasTwo(n) : la mesure n porte-t-elle deux accords. Renvoie { n, half } (inchangé au bord de la grille).
function neighborStop(rows, cur, key, hasTwo) {
    const half = cur.half === 1 && hasTwo(cur.n) ? 1 : 0;
    if (key === 'ArrowRight' && half === 0 && hasTwo(cur.n)) return { n: cur.n, half: 1 };
    if (key === 'ArrowLeft' && half === 1) return { n: cur.n, half: 0 };
    const n = neighborMeasure(rows, cur.n, key);
    if (n === cur.n) return { n: cur.n, half };
    return { n, half: key === 'ArrowLeft' && hasTwo(n) ? 1 : 0 };
}

// Défilement de la grille pendant la lecture : la ligne de l'accord en cours doit rester entièrement visible.
// Renvoie la nouvelle position de défilement, ou null si la ligne est déjà visible.
function scrollTargetFor(containerTop, clientHeight, rowTop, rowHeight) {
    const rowBottom = rowTop + rowHeight;
    const above = rowTop < containerTop;
    const below = rowBottom > containerTop + clientHeight;
    if (!above && !below) return null;
    return Math.max(0, above ? rowTop : rowBottom - clientHeight);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        layoutRows, cellClassName, measureCellModel, cellExtraClasses, cellInnerHtml, cellMarksHtml, sequenceFingerprint, printMarks, printGridHtml, printInfoParts, measureNoteTitle,
        repeatPopHtml, navPopSection, navStartHtml, navEndHtml, navRowBreak, NAV_LABELS, NAV_SEGNO_SVG, NAV_CODA_SVG, marksHtml, marksText, tempoMarkText, tempoMarkHtml,
        currentMeasureNumber, selectionFix, gutterMark, partBanner, isBoxPart, rowFillers, needsAddRow, clickPosition, playRangeAfterClick, halfToHighlight, neighborMeasure, neighborStop, scrollTargetFor,
    };
}
