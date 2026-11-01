// audio/wav-export.js — export du son de la jam : fusion des blocs enregistrés, coupe du silence de début et de fin,
// fichier WAV 16 bits stéréo. Fonctions pures (tableaux Int16Array en entrée), sans DOM ni audio.
// Chargé par index.html via <script src="audio/wav-export.js"> et testé par audio/wav-export.test.js.

// Réunit des blocs Int16Array en un seul tableau.
function wavJoinChunks(chunks) {
    let total = 0;
    chunks.forEach(c => { total += c.length; });
    const out = new Int16Array(total);
    let o = 0;
    chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
}

// Coupe le silence avant le premier son et après le dernier (seuil ≈ -80 dB), en gardant une courte marge :
// 3 ms avant l'attaque (le premier temps reste calé au début du fichier), 80 ms après la fin de la queue de réverbération.
// Renvoie { left, right } (vues sur les tableaux d'origine) ; un enregistrement muet est rendu tel quel.
function wavTrimSilence(left, right, rate, threshold = 3) {
    const n = Math.min(left.length, right.length);
    let first = -1, last = -1;
    for (let i = 0; i < n; i++) {
        if (Math.abs(left[i]) > threshold || Math.abs(right[i]) > threshold) { first = i; break; }
    }
    if (first < 0) return { left, right };
    for (let i = n - 1; i >= first; i--) {
        if (Math.abs(left[i]) > threshold || Math.abs(right[i]) > threshold) { last = i; break; }
    }
    const from = Math.max(0, first - Math.round(rate * 0.003));
    const to = Math.min(n, last + 1 + Math.round(rate * 0.08));
    return { left: left.subarray(from, to), right: right.subarray(from, to) };
}

// Fichier WAV PCM 16 bits stéréo (en-tête RIFF de 44 octets, échantillons entrelacés gauche / droite) ; renvoie un ArrayBuffer.
function wavEncode16(left, right, rate) {
    const n = Math.min(left.length, right.length);
    const dataBytes = n * 4;
    const buf = new ArrayBuffer(44 + dataBytes);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, dataBytes, true);
    let o = 44;
    for (let i = 0; i < n; i++) { v.setInt16(o, left[i], true); v.setInt16(o + 2, right[i], true); o += 4; }
    return buf;
}

// Durée lisible : 72 s → « 1 min 12 s ».
function wavDurationLabel(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { wavJoinChunks, wavTrimSilence, wavEncode16, wavDurationLabel };
}
