/*
 * Klinik SaaS — Hasta profili
 * Vital bulgu kartları ve grafikleri, ölçüm girişi, muayene kaydı,
 * reçete oluşturucu (canlı alerji/etkileşim kontrolü) ve KVKK rıza akışı.
 */
(function () {
  'use strict';

  var VERI = JSON.parse(document.getElementById('profilVeri').textContent);
  var HASTA = VERI.hasta;
  var DOKTOR = VERI.doktor;
  var VITALLER = VERI.vitaller || [];
  var ILACLAR = VERI.ilaclar || [];

  function $(id) { return document.getElementById(id); }
  function el(etiket, sinif, metin) {
    var e = document.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin !== undefined && metin !== null) e.textContent = metin;
    return e;
  }
  function norm(m) {
    return (m || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
  }
  function tarihMetni(iso, saatli) {
    var d = new Date(iso);
    var g = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    return saatli ? g + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) : g;
  }
  function sayi(v) { return v === null || v === undefined || v === '' ? null : Number(v); }
  function trSayi(v, ondalik) { return v === null ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: ondalik || 0, minimumFractionDigits: ondalik || 0 }); }

  // =====================================================================
  // 1) Vital bulgular: sınıflandırma
  // =====================================================================
  var SEVIYE = {
    normal: { renk: '#5EEAD4', sinif: 'text-teal-200 bg-teal-400/15' },
    sinirda: { renk: '#FCD34D', sinif: 'text-amber-200 bg-amber-400/15' },
    riskli: { renk: '#FB7185', sinif: 'text-rose-200 bg-rose-500/20' }
  };

  function siniflandir(tur, v, tok) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return null;
    switch (tur) {
      case 'tansiyon':
        if (v.s === null || v.d === null) return null;
        if (v.s >= 140 || v.d >= 90) return { s: 'riskli', e: 'Yüksek' };
        if (v.s < 90 || v.d < 60) return { s: 'riskli', e: 'Düşük' };
        if (v.s >= 120 || v.d >= 80) return { s: 'sinirda', e: 'Sınırda' };
        return { s: 'normal', e: 'Normal' };
      case 'nabiz':
        if (v < 50 || v > 120) return { s: 'riskli', e: v < 50 ? 'Düşük' : 'Yüksek' };
        if (v < 60 || v > 100) return { s: 'sinirda', e: v < 60 ? 'Düşük' : 'Yüksek' };
        return { s: 'normal', e: 'Normal' };
      case 'ates':
        if (v < 35.5) return { s: 'riskli', e: 'Düşük' };
        if (v <= 37.5) return { s: 'normal', e: 'Normal' };
        if (v <= 38) return { s: 'sinirda', e: 'Subfebril' };
        return { s: 'riskli', e: 'Ateş' };
      case 'seker':
        if (v < 70) return { s: 'riskli', e: 'Düşük' };
        if (tok) return v < 140 ? { s: 'normal', e: 'Normal (tok)' } : v < 200 ? { s: 'sinirda', e: 'Yüksek (tok)' } : { s: 'riskli', e: 'Çok yüksek' };
        return v < 100 ? { s: 'normal', e: 'Normal (açlık)' } : v < 126 ? { s: 'sinirda', e: 'Bozulmuş açlık' } : { s: 'riskli', e: 'Yüksek' };
      case 'spo2':
        if (v >= 95) return { s: 'normal', e: 'Normal' };
        if (v >= 92) return { s: 'sinirda', e: 'Sınırda' };
        return { s: 'riskli', e: 'Düşük' };
      case 'vki':
        if (v < 18.5) return { s: 'sinirda', e: 'Zayıf' };
        if (v < 25) return { s: 'normal', e: 'Normal' };
        if (v < 30) return { s: 'sinirda', e: 'Fazla kilolu' };
        return { s: 'riskli', e: 'Obez' };
    }
    return null;
  }

  var METRIKLER = [
    { k: 'tansiyon', ad: 'Tansiyon', birim: 'mmHg', seriler: [{ a: 'sistolik', ad: 'Büyük', renk: '#C4B5FD' }, { a: 'diastolik', ad: 'Küçük', renk: '#5EEAD4' }], bantlar: [[90, 120], [60, 80]] },
    { k: 'nabiz', ad: 'Nabız', birim: '/dk', seriler: [{ a: 'nabiz', ad: 'Nabız', renk: '#FDA4AF' }], bantlar: [[60, 100]] },
    { k: 'seker', ad: 'Kan şekeri', birim: 'mg/dL', seriler: [{ a: 'seker', ad: 'Şeker', renk: '#FCD34D' }], bantlar: [[70, 99]] },
    { k: 'kilo', ad: 'Kilo', birim: 'kg', seriler: [{ a: 'kilo', ad: 'Kilo', renk: '#7DD3FC' }], bantlar: [] },
    { k: 'ates', ad: 'Ateş', birim: '°C', seriler: [{ a: 'ates', ad: 'Ateş', renk: '#FDBA74' }], bantlar: [[36.1, 37.5]], ondalik: 1 },
    { k: 'spo2', ad: 'SpO₂', birim: '%', seriler: [{ a: 'spo2', ad: 'SpO₂', renk: '#99F6E4' }], bantlar: [[95, 100]] }
  ];

  function metrikDegeri(m, v) {
    if (m.k === 'tansiyon') return v.sistolik ? { s: v.sistolik, d: v.diastolik } : null;
    return sayi(v[m.k]);
  }
  function metrikDurumu(m, v) {
    var d = metrikDegeri(m, v);
    if (d === null) return null;
    if (m.k === 'kilo') return v.vki ? siniflandir('vki', v.vki) : null;
    return siniflandir(m.k, d, v.seker_tok);
  }
  function metrikMetni(m, v) {
    var d = metrikDegeri(m, v);
    if (d === null) return '—';
    if (m.k === 'tansiyon') return d.s + '/' + d.d;
    return trSayi(d, m.ondalik);
  }

  var seciliMetrik = 'tansiyon';
  var aralik = 'tum';

  function filtreliVitaller() {
    if (aralik === 'tum') return VITALLER;
    var gun = aralik === '3a' ? 92 : 366;
    var sinir = Date.now() - gun * 864e5;
    return VITALLER.filter(function (v) { return new Date(v.tarih).getTime() >= sinir; });
  }

  function vitalKartlariCiz() {
    var kap = $('vitalKartlar');
    kap.innerHTML = '';
    METRIKLER.forEach(function (m) {
      var olcumler = VITALLER.filter(function (v) { return metrikDegeri(m, v) !== null; });
      var son = olcumler[olcumler.length - 1];
      var onceki = olcumler[olcumler.length - 2];
      var aktif = m.k === seciliMetrik;
      var kart = el('button', 'kart text-left p-3.5 rounded-2xl border transition-all ' +
        (aktif ? 'bg-white/[0.12] border-white/30 shadow-[0_14px_30px_-16px_rgba(196,181,253,0.7)]' : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07]'));
      kart.type = 'button';
      kart.setAttribute('role', 'tab');
      kart.setAttribute('aria-selected', aktif ? 'true' : 'false');
      var ust = el('div', 'flex items-center justify-between gap-2');
      ust.appendChild(el('span', 'text-[12px] font-semibold text-violet-300', m.ad));
      var renkNokta = el('span', 'w-2 h-2 rounded-full');
      renkNokta.style.background = m.seriler[0].renk;
      renkNokta.style.boxShadow = '0 0 8px ' + m.seriler[0].renk;
      ust.appendChild(renkNokta);
      kart.appendChild(ust);

      var deger = el('div', 'mt-1.5 flex items-baseline gap-1');
      deger.appendChild(el('span', 'font-sora text-[22px] font-semibold tracking-tight text-white tabular-nums', son ? metrikMetni(m, son) : '—'));
      deger.appendChild(el('span', 'text-[11px] text-violet-300', m.birim));
      kart.appendChild(deger);

      var alt = el('div', 'mt-1.5 flex items-center justify-between gap-1 min-h-[22px]');
      var durum = son ? metrikDurumu(m, son) : null;
      if (durum) alt.appendChild(el('span', 'inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold ' + SEVIYE[durum.s].sinif, durum.e));
      else alt.appendChild(el('span', 'text-[11px] text-violet-400', son ? '' : 'Ölçüm yok'));
      if (son && onceki && m.k !== 'tansiyon') {
        var fark = metrikDegeri(m, son) - metrikDegeri(m, onceki);
        if (Math.abs(fark) > 0.001) alt.appendChild(el('span', 'text-[11px] font-semibold text-violet-200 tabular-nums', (fark > 0 ? '↑ ' : '↓ ') + trSayi(Math.abs(fark), m.ondalik)));
      } else if (son && onceki && m.k === 'tansiyon') {
        var fs = son.sistolik - onceki.sistolik;
        if (fs) alt.appendChild(el('span', 'text-[11px] font-semibold text-violet-200 tabular-nums', (fs > 0 ? '↑ ' : '↓ ') + Math.abs(fs)));
      }
      kart.appendChild(alt);
      kart.addEventListener('click', function () { seciliMetrik = m.k; vitalKartlariCiz(); grafikCiz(); });
      kap.appendChild(kart);
    });

    var son = VITALLER[VITALLER.length - 1];
    $('vitalAlt').textContent = son
      ? VITALLER.length + ' ölçüm · son ölçüm ' + tarihMetni(son.tarih, true) + (son.vki ? ' · VKİ ' + trSayi(son.vki, 1) : '')
      : 'Henüz ölçüm girilmedi';
  }

  function aralikSekmeleri() {
    var kap = $('vitalSekmeler');
    kap.innerHTML = '';
    [['3a', 'Son 3 ay'], ['1y', 'Son 1 yıl'], ['tum', 'Tümü']].forEach(function (a) {
      var b = el('button', 'h-8 px-3 rounded-[10px] text-xs font-semibold transition-colors ' +
        (aralik === a[0] ? 'bg-white text-[#1E0B4B]' : 'text-violet-200 hover:text-white hover:bg-white/10'), a[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', aralik === a[0] ? 'true' : 'false');
      b.addEventListener('click', function () { aralik = a[0]; aralikSekmeleri(); grafikCiz(); });
      kap.appendChild(b);
    });
  }

  // =====================================================================
  // 2) Vital grafiği (SVG)
  // =====================================================================
  var G = { W: 640, H: 240, L: 44, R: 16, T: 16, B: 30 };

  function grafikCiz() {
    var svg = $('vitalGrafik');
    var m = METRIKLER.filter(function (x) { return x.k === seciliMetrik; })[0];
    var veri = filtreliVitaller().filter(function (v) { return metrikDegeri(m, v) !== null; });
    $('vitalBos').classList.toggle('hidden', VITALLER.length > 0);
    svg.innerHTML = '';
    if (!veri.length) {
      if (VITALLER.length) {
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', G.W / 2); t.setAttribute('y', G.H / 2); t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', 'rgba(221,214,254,0.6)'); t.setAttribute('font-size', '13');
        t.textContent = 'Bu aralıkta ' + m.ad.toLocaleLowerCase('tr-TR') + ' ölçümü yok';
        svg.appendChild(t);
      }
      return;
    }

    var bantlar = m.bantlar.slice();
    if (m.k === 'kilo') {
      var boy = (veri.filter(function (v) { return v.boy; }).pop() || {}).boy;
      if (boy) { var h2 = Math.pow(boy / 100, 2); bantlar = [[+(18.5 * h2).toFixed(1), +(24.9 * h2).toFixed(1)]]; }
    }
    var tumDegerler = [];
    veri.forEach(function (v) { m.seriler.forEach(function (s) { if (v[s.a] !== null) tumDegerler.push(Number(v[s.a])); }); });
    bantlar.forEach(function (b) { tumDegerler.push(b[0], b[1]); });
    var min = Math.min.apply(null, tumDegerler), max = Math.max.apply(null, tumDegerler);
    var pay = (max - min) * 0.12 || Math.max(1, max * 0.05);
    min -= pay; max += pay;
    var genis = G.W - G.L - G.R, yuks = G.H - G.T - G.B;
    function x(i) { return veri.length === 1 ? G.L + genis / 2 : G.L + i * genis / (veri.length - 1); }
    function y(v) { return G.T + (1 - (v - min) / (max - min)) * yuks; }

    var p = [];
    p.push('<defs>');
    m.seriler.forEach(function (s, i) {
      p.push('<linearGradient id="vg' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.renk + '" stop-opacity="0.32"/><stop offset="1" stop-color="' + s.renk + '" stop-opacity="0"/></linearGradient>');
    });
    p.push('</defs>');
    for (var gi = 0; gi <= 4; gi++) {
      var gv = min + (max - min) * gi / 4, gy = y(gv);
      p.push('<line x1="' + G.L + '" x2="' + (G.W - G.R) + '" y1="' + gy + '" y2="' + gy + '" stroke="rgba(255,255,255,0.06)"/>');
      p.push('<text x="' + (G.L - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="rgba(196,181,253,0.7)">' + trSayi(gv, m.ondalik || (max - min < 10 ? 1 : 0)) + '</text>');
    }
    bantlar.forEach(function (b, i) {
      var renk = m.seriler[Math.min(i, m.seriler.length - 1)].renk;
      p.push('<rect x="' + G.L + '" width="' + genis + '" y="' + y(b[1]) + '" height="' + Math.max(1, y(b[0]) - y(b[1])) + '" fill="' + renk + '" opacity="0.07" rx="6"/>');
      p.push('<line x1="' + G.L + '" x2="' + (G.W - G.R) + '" y1="' + y(b[1]) + '" y2="' + y(b[1]) + '" stroke="' + renk + '" stroke-opacity="0.35" stroke-dasharray="4 5"/>');
      p.push('<line x1="' + G.L + '" x2="' + (G.W - G.R) + '" y1="' + y(b[0]) + '" y2="' + y(b[0]) + '" stroke="' + renk + '" stroke-opacity="0.35" stroke-dasharray="4 5"/>');
    });

    m.seriler.forEach(function (s, si) {
      var noktalar = veri.map(function (v, i) { return v[s.a] === null ? null : [x(i), y(Number(v[s.a]))]; }).filter(Boolean);
      if (!noktalar.length) return;
      var d = 'M' + noktalar.map(function (n) { return n[0].toFixed(1) + ' ' + n[1].toFixed(1); }).join(' L');
      if (si === 0 && noktalar.length > 1) {
        p.push('<path d="' + d + ' L' + noktalar[noktalar.length - 1][0].toFixed(1) + ' ' + (G.H - G.B) + ' L' + noktalar[0][0].toFixed(1) + ' ' + (G.H - G.B) + ' Z" fill="url(#vg' + si + ')" class="vital-alan"/>');
      }
      if (noktalar.length > 1) {
        p.push('<path d="' + d + '" fill="none" stroke="' + s.renk + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1000" class="vital-cizgi" style="filter: drop-shadow(0 0 6px ' + s.renk + '80); animation-delay:' + (si * 0.15) + 's"/>');
      }
      veri.forEach(function (v, i) {
        if (v[s.a] === null) return;
        var durum = metrikDurumu(m, v);
        var halka = durum ? SEVIYE[durum.s].renk : s.renk;
        p.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(Number(v[s.a])).toFixed(1) + '" r="4.5" fill="#120A2E" stroke="' + halka + '" stroke-width="2.5" class="vital-nokta" style="animation-delay:' + (0.5 + i * 0.05) + 's"/>');
      });
    });

    var adim = Math.max(1, Math.ceil(veri.length / 6));
    veri.forEach(function (v, i) {
      if (i % adim !== 0 && i !== veri.length - 1) return;
      p.push('<text x="' + x(i) + '" y="' + (G.H - 8) + '" text-anchor="middle" font-size="11" fill="rgba(196,181,253,0.7)">' + tarihMetni(v.tarih).slice(0, 5) + (veri.length > 1 && new Date(veri[0].tarih).getFullYear() !== new Date(veri[veri.length - 1].tarih).getFullYear() ? '.' + String(new Date(v.tarih).getFullYear()).slice(2) : '') + '</text>');
    });
    p.push('<line id="vitalKilavuz" x1="0" x2="0" y1="' + G.T + '" y2="' + (G.H - G.B) + '" stroke="rgba(255,255,255,0.25)" stroke-dasharray="3 4" opacity="0"/>');
    p.push('<rect id="vitalYakala" x="' + G.L + '" y="' + G.T + '" width="' + genis + '" height="' + yuks + '" fill="transparent"/>');
    svg.innerHTML = p.join('');

    var ipucu = $('vitalIpucu'), kilavuz = $('vitalKilavuz');
    var yakala = $('vitalYakala');
    yakala.addEventListener('mousemove', function (e) {
      var r = svg.getBoundingClientRect();
      var olcek = r.width / G.W;
      var gx = (e.clientX - r.left) / olcek;
      var i = veri.length === 1 ? 0 : Math.round((gx - G.L) / (genis / (veri.length - 1)));
      i = Math.max(0, Math.min(veri.length - 1, i));
      var v = veri[i];
      kilavuz.setAttribute('x1', x(i)); kilavuz.setAttribute('x2', x(i)); kilavuz.setAttribute('opacity', '1');
      var durum = metrikDurumu(m, v);
      ipucu.innerHTML = '';
      ipucu.appendChild(el('div', 'font-semibold text-violet-300', tarihMetni(v.tarih, true)));
      var satir = el('div', 'mt-0.5 flex items-baseline gap-1.5');
      satir.appendChild(el('span', 'font-sora text-base font-semibold text-white', metrikMetni(m, v)));
      satir.appendChild(el('span', 'text-violet-300', m.birim));
      ipucu.appendChild(satir);
      if (m.k === 'kilo' && v.vki) ipucu.appendChild(el('div', 'text-violet-200', 'VKİ ' + trSayi(v.vki, 1)));
      if (m.k === 'seker') ipucu.appendChild(el('div', 'text-violet-200', v.seker_tok ? 'Tok ölçüm' : 'Açlık ölçümü'));
      if (durum) ipucu.appendChild(el('div', 'mt-1 inline-flex px-2 py-0.5 rounded-full font-semibold ' + SEVIYE[durum.s].sinif, durum.e));
      if (v.olcen) ipucu.appendChild(el('div', 'mt-1 text-violet-400', v.olcen));
      ipucu.classList.remove('hidden');
      var px = x(i) * olcek;
      ipucu.style.left = Math.min(Math.max(8, px - ipucu.offsetWidth / 2), r.width - ipucu.offsetWidth - 8) + 'px';
      ipucu.style.top = Math.max(0, (Math.min.apply(null, m.seriler.map(function (s) { return v[s.a] === null ? 1e9 : y(Number(v[s.a])); })) * olcek) - ipucu.offsetHeight - 14) + 'px';
    });
    yakala.addEventListener('mouseleave', function () { ipucu.classList.add('hidden'); kilavuz.setAttribute('opacity', '0'); });
  }

  function vitalTablosuCiz() {
    var govde = $('vitalSatirlar');
    govde.innerHTML = '';
    VITALLER.slice().reverse().forEach(function (v) {
      var tr = el('tr', 'border-t border-white/[0.06]');
      function hucre(metin, durum) {
        var td = el('td', 'py-2.5 pr-3 tabular-nums ' + (durum ? (durum.s === 'normal' ? 'text-white' : durum.s === 'sinirda' ? 'text-amber-200' : 'text-rose-200 font-semibold') : 'text-violet-100'), metin);
        if (durum) td.title = durum.e;
        tr.appendChild(td);
      }
      hucre(tarihMetni(v.tarih, true));
      hucre(v.sistolik ? v.sistolik + '/' + v.diastolik : '—', v.sistolik ? siniflandir('tansiyon', { s: v.sistolik, d: v.diastolik }) : null);
      hucre(v.nabiz || '—', siniflandir('nabiz', sayi(v.nabiz)));
      hucre(v.ates ? trSayi(v.ates, 1) : '—', siniflandir('ates', sayi(v.ates)));
      hucre(v.seker ? v.seker + (v.seker_tok ? ' (tok)' : '') : '—', siniflandir('seker', sayi(v.seker), v.seker_tok));
      hucre(v.spo2 ? '%' + v.spo2 : '—', siniflandir('spo2', sayi(v.spo2)));
      hucre(v.kilo ? trSayi(v.kilo, 1) + (v.vki ? ' / ' + trSayi(v.vki, 1) : '') : '—', v.vki ? siniflandir('vki', v.vki) : null);
      hucre(v.olcen || '—');
      var son = el('td', 'text-right');
      if (DOKTOR) {
        var sil = el('button', 'h-8 px-2.5 rounded-lg text-xs font-semibold text-violet-300 hover:text-rose-200 hover:bg-rose-500/15 transition-colors', 'Sil');
        sil.type = 'button';
        sil.addEventListener('click', async function () {
          if (!(await Klinik.onayla(tarihMetni(v.tarih, true) + ' tarihli ölçüm silinecek.'))) return;
          try {
            var s = await Klinik.jsonGonder('/api/vital/' + v.id, null, 'DELETE');
            Klinik.bildir(s.mesaj);
            VITALLER = VITALLER.filter(function (x) { return x.id !== v.id; });
            vitalYenile();
          } catch (h) { Klinik.bildir(h.message, 'hata'); }
        });
        son.appendChild(sil);
      }
      tr.appendChild(son);
      govde.appendChild(tr);
    });
    $('vitalTablo').classList.toggle('hidden', !VITALLER.length);
  }

  function vitalYenile() { vitalKartlariCiz(); grafikCiz(); vitalTablosuCiz(); }

  // =====================================================================
  // 3) Vital giriş alanları (ölçüm modalı + muayene modalı)
  // =====================================================================
  function vitalGrubu(onek) {
    var kap = document.querySelector('[data-vital-grup="' + onek + '"]');
    if (!kap) return null;
    var tok = false;
    function alan(ad) { return $(onek + ad); }
    function ipucuYaz(anahtar, durum) {
      var hedef = kap.querySelector('[data-ipucu="' + anahtar + '"]');
      if (!hedef) return;
      hedef.textContent = durum ? '● ' + durum.e : '';
      hedef.className = 'text-[11px] font-semibold h-4 ' + (durum ? (durum.s === 'normal' ? 'text-teal-300' : durum.s === 'sinirda' ? 'text-amber-300' : 'text-rose-300') : '');
    }
    function guncelle() {
      var s = sayi(alan('sistolik').value), d = sayi(alan('diastolik').value);
      ipucuYaz('tansiyon', s && d ? siniflandir('tansiyon', { s: s, d: d }) : null);
      ipucuYaz('nabiz', siniflandir('nabiz', sayi(alan('nabiz').value)));
      ipucuYaz('ates', siniflandir('ates', sayi((alan('ates').value || '').replace(',', '.'))));
      ipucuYaz('seker', siniflandir('seker', sayi(alan('seker').value), tok));
      ipucuYaz('spo2', siniflandir('spo2', sayi(alan('spo2').value)));
      var kilo = sayi((alan('kilo').value || '').replace(',', '.')), boy = sayi(alan('boy').value);
      if (kilo && boy) {
        var vki = kilo / Math.pow(boy / 100, 2);
        var dv = siniflandir('vki', vki);
        ipucuYaz('vki', dv ? { s: dv.s, e: 'VKİ ' + trSayi(vki, 1) + ' · ' + dv.e } : null);
      } else ipucuYaz('vki', null);
    }
    function tokBoya() {
      kap.querySelectorAll('.seker-tur').forEach(function (b) {
        var aktif = (b.getAttribute('data-seker-tok') === '1') === tok;
        b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
        b.className = 'seker-tur h-10 px-2.5 rounded-[10px] text-[11px] font-semibold transition-colors ' + (aktif ? 'bg-white text-[#1E0B4B]' : 'text-violet-200 hover:text-white');
      });
    }
    kap.querySelectorAll('[data-vital]').forEach(function (i) { i.addEventListener('input', guncelle); });
    kap.querySelectorAll('.seker-tur').forEach(function (b) {
      b.addEventListener('click', function () { tok = b.getAttribute('data-seker-tok') === '1'; tokBoya(); guncelle(); });
    });
    tokBoya();
    return {
      sifirla: function () {
        kap.querySelectorAll('[data-vital]').forEach(function (i) { i.value = ''; });
        var sonBoy = (VITALLER.filter(function (v) { return v.boy; }).pop() || {}).boy;
        if (sonBoy) alan('boy').value = sonBoy;
        tok = false; tokBoya(); guncelle();
      },
      oku: function () {
        var veri = { seker_tok: tok };
        kap.querySelectorAll('[data-vital]').forEach(function (i) { if (i.value !== '') veri[i.getAttribute('data-vital')] = i.value.replace(',', '.'); });
        return veri;
      },
      doluMu: function () {
        return Array.prototype.some.call(kap.querySelectorAll('[data-vital]'), function (i) { return i.value !== '' && i.getAttribute('data-vital') !== 'boy'; });
      }
    };
  }

  var olcumGrubu = vitalGrubu('v_');
  $('vitalAc').addEventListener('click', function () { olcumGrubu.sifirla(); Klinik.modalAcId('vitalModal', 'v_sistolik'); });
  $('vitalForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!olcumGrubu.doluMu()) { Klinik.bildir('En az bir ölçüm değeri girin.', 'hata'); return; }
    var d = e.target.querySelector('[type=submit]');
    d.disabled = true;
    try {
      var veri = olcumGrubu.oku();
      veri.hasta_id = HASTA.id;
      var s = await Klinik.jsonGonder('/api/vital_ekle', veri);
      VITALLER.push(s.vital);
      Klinik.modalKapatId('vitalModal');
      Klinik.bildir(s.mesaj);
      vitalYenile();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    d.disabled = false;
  });

  // =====================================================================
  // 4) Hasta düzenle / sil, işlem menüsü, KVKK
  // =====================================================================
  $('hastaDuzenle').addEventListener('click', function () { Klinik.modalAc(HASTA); });

  var menuDugme = $('dahaFazla'), menu = $('dahaMenu');
  menuDugme.addEventListener('click', function (e) {
    e.stopPropagation();
    var acik = menu.classList.toggle('hidden') === false;
    menuDugme.setAttribute('aria-expanded', acik ? 'true' : 'false');
  });
  document.addEventListener('click', function (e) { if (!menu.contains(e.target)) { menu.classList.add('hidden'); menuDugme.setAttribute('aria-expanded', 'false'); } });

  var silDugme = $('hastaSil');
  if (silDugme) silDugme.addEventListener('click', async function () {
    var tamam = await Klinik.onayla(HASTA.ad_soyad + ' adlı hastanın kaydı ve tüm randevu, muayene, reçete ve ölçüm kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.');
    if (!tamam) return;
    try {
      var s = await Klinik.jsonGonder('/api/hasta/' + HASTA.id, null, 'DELETE');
      Klinik.bildir(s.mesaj);
      setTimeout(function () { location.href = s.yonlendir || '/hastalar'; }, 700);
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });

  var kvkkKutu = $('kvkkOnayKutu'), kvkkKaydet = $('kvkkKaydet');
  document.querySelectorAll('[data-kvkk-ac]').forEach(function (b) {
    b.addEventListener('click', function () { kvkkKutu.checked = false; kvkkKaydet.disabled = true; Klinik.modalAcId('kvkkModal', 'kvkkOnayKutu'); });
  });
  kvkkKutu.addEventListener('change', function () { kvkkKaydet.disabled = !kvkkKutu.checked; });
  kvkkKaydet.addEventListener('click', async function () {
    try {
      var s = await Klinik.jsonGonder('/api/hasta/' + HASTA.id + '/kvkk', { onay: true });
      Klinik.bildir(s.mesaj);
      setTimeout(function () { location.reload(); }, 600);
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });
  var geriCek = document.querySelector('[data-kvkk-geri]');
  if (geriCek) geriCek.addEventListener('click', async function () {
    if (!(await Klinik.onayla('Hastanın açık rızasını geri çektiği kaydedilecek. Bu işlem günlüğe işlenir.', 'Evet, kaydet'))) return;
    try {
      var s = await Klinik.jsonGonder('/api/hasta/' + HASTA.id + '/kvkk', { onay: false });
      Klinik.bildir(s.mesaj);
      setTimeout(function () { location.reload(); }, 600);
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });

  vitalYenile();
  aralikSekmeleri();
  if (!DOKTOR) return;

  // =====================================================================
  // 5) Muayene kaydı (doktor)
  // =====================================================================
  var muayeneVital = vitalGrubu('mv_');
  Klinik.otomatikTamamla('m_tani', 'm_tani_oneri', Klinik.HASTALIKLAR, false);

  function muayeneAc(randevuId) {
    $('muayeneForm').reset();
    $('m_guncel').checked = true;
    $('m_vital_kutu').open = false;
    muayeneVital.sifirla();
    if (randevuId) $('m_randevu').value = String(randevuId);
    Klinik.modalAcId('muayeneModal', 'm_tani');
  }
  $('muayeneAc').addEventListener('click', function () { muayeneAc(null); });
  document.querySelectorAll('[data-muayene-randevu]').forEach(function (b) {
    b.addEventListener('click', function () { muayeneAc(b.getAttribute('data-muayene-randevu')); });
  });

  async function muayeneKaydet(receteyeGec) {
    var tani = $('m_tani').value.trim();
    if (!tani) { Klinik.bildir('Tanı alanı zorunludur.', 'hata'); $('m_tani').focus(); return; }
    var dugmeler = [$('muayeneKaydet'), $('muayeneReceteli')];
    dugmeler.forEach(function (d) { d.disabled = true; });
    try {
      var s = await Klinik.jsonGonder('/api/muayene_ekle', {
        hasta_id: HASTA.id,
        randevu_id: $('m_randevu').value || null,
        tani: tani,
        bulgular: $('m_bulgular').value,
        tedavi: $('m_tedavi').value,
        kontrol_tarihi: $('m_kontrol').value || null,
        guncel_tani: $('m_guncel').checked,
        vital: muayeneVital.doluMu() ? muayeneVital.oku() : null
      });
      Klinik.bildir(s.mesaj);
      Klinik.modalKapatId('muayeneModal');
      setTimeout(function () { location.href = location.pathname + (receteyeGec ? '?recete=' + s.id : ''); }, 600);
    } catch (h) {
      Klinik.bildir(h.message, 'hata');
      dugmeler.forEach(function (d) { d.disabled = false; });
    }
  }
  $('muayeneForm').addEventListener('submit', function (e) { e.preventDefault(); muayeneKaydet(false); });
  $('muayeneReceteli').addEventListener('click', function () { muayeneKaydet(true); });

  document.querySelectorAll('[data-muayene-sil]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!(await Klinik.onayla('Bu muayene kaydı kalıcı olarak silinecek. Bağlı reçeteler ve ölçümler silinmez.'))) return;
      try {
        var s = await Klinik.jsonGonder('/api/muayene/' + b.getAttribute('data-muayene-sil'), null, 'DELETE');
        Klinik.bildir(s.mesaj);
        setTimeout(function () { location.reload(); }, 600);
      } catch (h) { Klinik.bildir(h.message, 'hata'); }
    });
  });

  // =====================================================================
  // 6) Reçete oluşturucu ve canlı güvenlik kontrolü (doktor)
  // =====================================================================
  var KULLANIM = ['Günde 1 kez', 'Günde 2 kez', 'Günde 3 kez', 'Günde 1 kez, sabah aç karnına', 'Günde 2 kez, tok karnına',
    'Günde 3 kez, tok karnına', 'Gerektiğinde', 'Haftada 1 kez', 'Akşam yatarken'];
  var SURE = ['3 gün', '5 gün', '7 gün', '10 gün', '14 gün', '1 ay', '3 ay', 'Sürekli'];
  ['kullanimOneri', 'sureOneri'].forEach(function (id, i) {
    var dl = el('datalist'); dl.id = id;
    (i ? SURE : KULLANIM).forEach(function (s) { var o = el('option'); o.value = s; dl.appendChild(o); });
    document.body.appendChild(dl);
  });

  var kalemler = [];
  var sonUyarilar = [];
  var kontrolZamani = null, kontrolSirasi = 0;
  var arama = $('ilacArama'), liste = $('ilacListe');
  var aktifOneri = -1, oneriler = [];
  var GRUP_ADI = {
    penisilin: 'Penisilin', sefalosporin: 'Sefalosporin', makrolid: 'Makrolid', florokinolon: 'Kinolon', sulfonamid: 'Sülfonamid',
    tetrasiklin: 'Tetrasiklin', nitroimidazol: 'Nitroimidazol', antibiyotik: 'Antibiyotik', nsaid: 'NSAİİ', aspirin: 'Aspirin',
    parasetamol: 'Analjezik', opioid: 'Opioid', ace: 'ACE inh.', arb: 'ARB', beta_bloker: 'Beta bloker', kkb: 'KKB', diuretik: 'Diüretik',
    statin: 'Statin', antikoagulan: 'Antikoagülan', antiplatelet: 'Antiplatelet', antidiyabetik: 'Antidiyabetik', tiroid: 'Tiroid',
    kortikosteroid: 'Kortikosteroid', ppi: 'PPI', ssri: 'SSRI', benzodiazepin: 'Benzodiazepin', antihistaminik: 'Antihistaminik',
    bronkodilator: 'Bronkodilatör', demir: 'Demir', kalsiyum: 'Kalsiyum', triptan: 'Triptan', vitamin_d: 'Vitamin D'
  };

  function oneriCiz() {
    var q = norm(arama.value.trim());
    liste.innerHTML = '';
    if (!q) { liste.classList.add('hidden'); arama.setAttribute('aria-expanded', 'false'); return; }
    oneriler = ILACLAR.filter(function (i) { return norm(i.ad + ' ' + i.etken).indexOf(q) !== -1; }).slice(0, 12);
    aktifOneri = oneriler.length ? 0 : -1;
    if (!oneriler.length) {
      var bos = el('li', 'px-4 py-3 text-sm text-violet-200');
      bos.appendChild(el('span', 'font-semibold text-white', '“' + arama.value.trim() + '”'));
      bos.appendChild(document.createTextNode(' listede yok. Enter ile serbest metin olarak ekleyebilirsiniz (otomatik kontrol yapılamaz).'));
      liste.appendChild(bos);
    }
    oneriler.forEach(function (ilac, n) {
      var li = el('li', 'oneri-ogesi mx-1.5 px-3 py-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-3');
      li.setAttribute('role', 'option');
      li.id = 'ilacOneri' + n;
      var sol = el('div', 'min-w-0');
      sol.appendChild(el('div', 'text-sm font-semibold text-white truncate', ilac.ad));
      sol.appendChild(el('div', 'text-xs text-violet-300 truncate', ilac.etken + ' · ' + ilac.kullanim));
      li.appendChild(sol);
      var etiketler = el('div', 'flex shrink-0 gap-1');
      ilac.gruplar.filter(function (g) { return GRUP_ADI[g] && g !== 'antibiyotik'; }).slice(0, 2).forEach(function (g) {
        etiketler.appendChild(el('span', 'px-2 py-0.5 rounded-md text-[10px] font-semibold text-violet-100 bg-white/10', GRUP_ADI[g]));
      });
      li.appendChild(etiketler);
      li.addEventListener('mousedown', function (e) { e.preventDefault(); ilacEkle(ilac); });
      li.addEventListener('mouseenter', function () { aktifOneri = n; oneriBoya(); });
      liste.appendChild(li);
    });
    oneriBoya();
    liste.classList.remove('hidden');
    arama.setAttribute('aria-expanded', 'true');
  }
  function oneriBoya() {
    liste.querySelectorAll('.oneri-ogesi').forEach(function (li, n) {
      li.classList.toggle('bg-white/10', n === aktifOneri);
      li.setAttribute('aria-selected', n === aktifOneri ? 'true' : 'false');
    });
    if (aktifOneri >= 0) arama.setAttribute('aria-activedescendant', 'ilacOneri' + aktifOneri);
  }
  arama.addEventListener('input', oneriCiz);
  arama.addEventListener('focus', function () { if (arama.value) oneriCiz(); });
  arama.addEventListener('blur', function () { setTimeout(function () { liste.classList.add('hidden'); arama.setAttribute('aria-expanded', 'false'); }, 120); });
  arama.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' && oneriler.length) { e.preventDefault(); aktifOneri = (aktifOneri + 1) % oneriler.length; oneriBoya(); }
    else if (e.key === 'ArrowUp' && oneriler.length) { e.preventDefault(); aktifOneri = (aktifOneri - 1 + oneriler.length) % oneriler.length; oneriBoya(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (aktifOneri >= 0 && oneriler[aktifOneri]) ilacEkle(oneriler[aktifOneri]);
      else if (arama.value.trim()) ilacEkle({ ad: arama.value.trim(), etken: '', gruplar: [], doz: '', kullanim: '' });
    } else if (e.key === 'Escape' && !liste.classList.contains('hidden')) { e.stopPropagation(); liste.classList.add('hidden'); }
  });

  function ilacEkle(ilac) {
    if (kalemler.some(function (k) { return norm(k.ilac_adi) === norm(ilac.ad); })) {
      Klinik.bildir('Bu ilaç zaten reçetede.', 'hata');
      return;
    }
    kalemler.push({ ilac_adi: ilac.ad, etken: ilac.etken, gruplar: ilac.gruplar || [], doz: ilac.doz || '', kullanim: ilac.kullanim || '',
      sure: ilac.gruplar && ilac.gruplar.indexOf('antibiyotik') !== -1 ? '7 gün' : '', adet: 1, yeni: true });
    arama.value = '';
    liste.classList.add('hidden');
    kalemleriCiz();
    kontrolEt();
    arama.focus();
  }

  function kalemSeviyesi(ad) {
    var sira = { yuksek: 3, orta: 2, dusuk: 1 };
    var en = 0;
    sonUyarilar.forEach(function (u) { if (u.ilaclar.indexOf(ad) !== -1) en = Math.max(en, sira[u.seviye]); });
    return en;
  }

  function kalemleriCiz() {
    var kap = $('kalemler');
    kap.innerHTML = '';
    $('kalemBos').classList.toggle('hidden', kalemler.length > 0);
    $('kalemSayac').textContent = kalemler.length + ' ilaç';
    document.querySelectorAll('.recete-kaydet').forEach(function (b) { b.disabled = !kalemler.length; });
    kalemler.forEach(function (k, i) {
      var seviye = kalemSeviyesi(k.ilac_adi);
      var cerceve = seviye === 3 ? 'border-rose-400/60 bg-rose-500/[0.08] shadow-[0_0_0_1px_rgba(251,113,133,0.25),0_18px_40px_-24px_rgba(251,113,133,0.8)]'
        : seviye === 2 ? 'border-amber-300/50 bg-amber-400/[0.06]' : 'border-white/10 bg-white/[0.04]';
      var kart = el('div', 'rounded-[20px] border p-4 flex flex-col gap-3 transition-all duration-300 ' + cerceve + (k.yeni ? ' giris' : ''));
      k.yeni = false;
      var ust = el('div', 'flex items-start justify-between gap-3');
      var sol = el('div', 'flex items-start gap-3 min-w-0');
      sol.appendChild(el('span', 'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-[#3B0A1E] bg-rose-100', String(i + 1)));
      var ad = el('div', 'min-w-0');
      ad.appendChild(el('div', 'text-[15px] font-semibold text-white', k.ilac_adi));
      ad.appendChild(el('div', 'text-xs ' + (k.etken ? 'text-violet-300' : 'text-amber-200'), k.etken ? k.etken : 'Listede yok · otomatik kontrol yapılamadı'));
      sol.appendChild(ad);
      ust.appendChild(sol);
      var cikar = el('button', 'shrink-0 w-9 h-9 rounded-xl text-violet-300 hover:text-rose-200 hover:bg-rose-500/15 flex items-center justify-center transition-colors');
      cikar.type = 'button';
      cikar.setAttribute('aria-label', k.ilac_adi + ' reçeteden çıkar');
      cikar.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      cikar.addEventListener('click', function () { kalemler.splice(i, 1); kalemleriCiz(); kontrolEt(); });
      ust.appendChild(cikar);
      kart.appendChild(ust);

      var izgara = el('div', 'grid grid-cols-2 sm:grid-cols-[1fr_1.6fr_1fr_80px] gap-2');
      [['doz', 'Doz', 'text', ''], ['kullanim', 'Kullanım', 'text', 'kullanimOneri'], ['sure', 'Süre', 'text', 'sureOneri'], ['adet', 'Kutu', 'number', '']].forEach(function (a) {
        var lab = el('label', 'flex flex-col gap-1 text-[11px] font-semibold text-violet-300 ' + (a[0] === 'kullanim' ? 'col-span-2 sm:col-span-1' : ''), a[1]);
        var inp = el('input', 'alan !h-10 !text-[13px]');
        inp.type = a[2];
        if (a[3]) inp.setAttribute('list', a[3]);
        if (a[0] === 'adet') { inp.min = 1; inp.max = 10; }
        inp.value = k[a[0]];
        inp.addEventListener('input', function () { k[a[0]] = a[0] === 'adet' ? Math.max(1, Math.min(10, parseInt(inp.value, 10) || 1)) : inp.value; });
        lab.appendChild(inp);
        izgara.appendChild(lab);
      });
      kart.appendChild(izgara);
      kap.appendChild(kart);
    });
  }

  function gostergeBoya(durum, sayac) {
    var g = $('kontrolGosterge');
    var ikon = {
      bos: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      temiz: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#042F2E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
      dikkat: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#451A03" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/></svg>',
      ciddi: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFF1F2" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
      bekle: '<svg aria-hidden="true" class="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>'
    };
    var stil = {
      bos: 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12)',
      bekle: 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12)',
      temiz: 'background: linear-gradient(145deg, #CCFBF1, #2DD4BF); box-shadow: 0 0 32px rgba(45,212,191,0.55)',
      dikkat: 'background: linear-gradient(145deg, #FEF3C7, #FBBF24); box-shadow: 0 0 32px rgba(251,191,36,0.5)',
      ciddi: 'background: linear-gradient(145deg, #FB7185, #E11D48); box-shadow: 0 0 40px rgba(244,63,94,0.7)'
    };
    g.innerHTML = ikon[durum];
    g.setAttribute('style', stil[durum]);
    g.classList.toggle('uyari', durum === 'ciddi');
    var ozet = $('kontrolOzet');
    ozet.textContent = {
      bos: 'İlaç eklendikçe kontrol edilir.',
      bekle: 'Kontrol ediliyor…',
      temiz: 'Alerji, etkileşim veya hastalık uyarısı bulunmadı.',
      dikkat: sayac + ' uyarı · dikkatle değerlendirin',
      ciddi: sayac + ' uyarı · ciddi risk içeriyor'
    }[durum];
    ozet.className = 'text-[13px] ' + (durum === 'ciddi' ? 'text-rose-200 font-semibold' : durum === 'dikkat' ? 'text-amber-200' : durum === 'temiz' ? 'text-teal-200' : 'text-violet-300');
  }

  function uyarilariCiz(veri) {
    var kap = $('kontrolKartlar');
    kap.innerHTML = '';
    var seviyeAdi = { yuksek: 'Ciddi', orta: 'Dikkat', dusuk: 'Bilgi' };
    var seviyeStil = {
      yuksek: ['border-rose-400/45 bg-rose-500/[0.12]', 'bg-rose-500 text-white'],
      orta: ['border-amber-300/40 bg-amber-400/[0.08]', 'bg-amber-300 text-[#451A03]'],
      dusuk: ['border-sky-300/30 bg-sky-400/[0.07]', 'bg-sky-300 text-[#082F49]']
    };
    veri.uyarilar.forEach(function (u, n) {
      var kart = el('div', 'giris rounded-2xl border p-3.5 flex flex-col gap-1.5 ' + seviyeStil[u.seviye][0]);
      kart.style.animationDelay = (n * 0.05) + 's';
      var ust = el('div', 'flex flex-wrap items-center gap-1.5');
      ust.appendChild(el('span', 'inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wide ' + seviyeStil[u.seviye][1], seviyeAdi[u.seviye]));
      ust.appendChild(el('span', 'text-[11px] font-semibold text-violet-200', u.tur));
      kart.appendChild(ust);
      kart.appendChild(el('div', 'text-[13px] font-semibold text-white', u.ilaclar.join(' + ')));
      kart.appendChild(el('p', 'text-[13px] leading-relaxed text-violet-100', u.mesaj));
      kap.appendChild(kart);
    });
    (veri.taninmayan || []).forEach(function (ad) {
      var kart = el('div', 'rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-[13px] text-violet-200');
      kart.appendChild(el('span', 'font-semibold text-white', ad));
      kart.appendChild(document.createTextNode(' ilaç listesinde yok; alerji ve etkileşim kontrolünü elle yapın.'));
      kap.appendChild(kart);
    });
    var ciddiVar = veri.uyarilar.some(function (u) { return u.seviye === 'yuksek'; });
    var gk = $('gerekceKutu');
    gk.classList.toggle('hidden', !ciddiVar);
    gk.classList.toggle('flex', ciddiVar);
    if (!kalemler.length) gostergeBoya('bos');
    else if (ciddiVar) gostergeBoya('ciddi', veri.uyarilar.length);
    else if (veri.uyarilar.length) gostergeBoya('dikkat', veri.uyarilar.length);
    else gostergeBoya('temiz');
  }

  function kontrolEt() {
    clearTimeout(kontrolZamani);
    if (!kalemler.length) { sonUyarilar = []; uyarilariCiz({ uyarilar: [], taninmayan: [] }); return; }
    gostergeBoya('bekle');
    kontrolZamani = setTimeout(async function () {
      var sira = ++kontrolSirasi;
      try {
        var s = await Klinik.jsonGonder('/api/recete_kontrol', {
          hasta_id: HASTA.id, tani: $('r_tani').value,
          ilaclar: kalemler.map(function (k) { return k.ilac_adi; })
        });
        if (sira !== kontrolSirasi) return;
        sonUyarilar = s.uyarilar;
        uyarilariCiz(s);
        kalemleriCiz();
      } catch (h) { Klinik.bildir(h.message, 'hata'); }
    }, 220);
  }
  $('r_tani').addEventListener('change', kontrolEt);

  function receteAc(muayeneId) {
    kalemler = [];
    sonUyarilar = [];
    $('receteForm').reset();
    var secim = $('r_muayene');
    if (muayeneId) secim.value = String(muayeneId);
    var opt = secim.options[secim.selectedIndex];
    $('r_tani').value = opt && opt.getAttribute('data-tani') ? opt.getAttribute('data-tani') : (HASTA.hastalik_tanisi || '');
    kalemleriCiz();
    uyarilariCiz({ uyarilar: [], taninmayan: [] });
    Klinik.modalAcId('receteModal', 'ilacArama');
  }
  $('r_muayene').addEventListener('change', function () {
    var opt = this.options[this.selectedIndex];
    if (opt.getAttribute('data-tani')) $('r_tani').value = opt.getAttribute('data-tani');
    kontrolEt();
  });
  $('receteAc').addEventListener('click', function () { receteAc(null); });
  document.querySelectorAll('[data-recete-yeni]').forEach(function (b) { b.addEventListener('click', function () { receteAc(null); }); });
  document.querySelectorAll('[data-recete-muayene]').forEach(function (b) {
    b.addEventListener('click', function () { receteAc(b.getAttribute('data-recete-muayene')); });
  });

  var yazdirSecildi = false;
  document.querySelectorAll('.recete-kaydet').forEach(function (b) {
    b.addEventListener('click', function () { yazdirSecildi = b.getAttribute('data-yazdir') === '1'; });
  });
  $('receteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!kalemler.length) { Klinik.bildir('Reçeteye en az bir ilaç ekleyin.', 'hata'); return; }
    var ciddi = sonUyarilar.some(function (u) { return u.seviye === 'yuksek'; });
    var gerekce = $('r_gerekce').value.trim();
    if (ciddi && gerekce.length < 5) {
      Klinik.bildir('Ciddi uyarı var: devam etmek için gerekçe yazın.', 'hata');
      $('r_gerekce').focus();
      return;
    }
    var yazdirPenceresi = yazdirSecildi ? window.open('about:blank', '_blank') : null;
    document.querySelectorAll('.recete-kaydet').forEach(function (b) { b.disabled = true; });
    try {
      var yanit = await fetch('/api/recete_ekle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hasta_id: HASTA.id, muayene_id: $('r_muayene').value || null, tani: $('r_tani').value,
          notlar: $('r_notlar').value, gerekce: gerekce,
          kalemler: kalemler.map(function (k) { return { ilac_adi: k.ilac_adi, doz: k.doz, kullanim: k.kullanim, sure: k.sure, adet: k.adet }; })
        })
      });
      var s = await yanit.json();
      if (yanit.status === 409 && s.gerekce_gerekli) {
        sonUyarilar = s.uyarilar;
        uyarilariCiz({ uyarilar: s.uyarilar, taninmayan: [] });
        kalemleriCiz();
        throw new Error(s.hata);
      }
      if (!yanit.ok) throw new Error(s.hata || 'Reçete kaydedilemedi.');
      Klinik.bildir(s.mesaj);
      Klinik.modalKapatId('receteModal');
      if (yazdirPenceresi) yazdirPenceresi.location.href = s.yazdir + '?otomatik=1';
      setTimeout(function () { location.href = location.pathname; }, 700);
    } catch (h) {
      if (yazdirPenceresi) yazdirPenceresi.close();
      Klinik.bildir(h.message, 'hata');
      document.querySelectorAll('.recete-kaydet').forEach(function (b) { b.disabled = !kalemler.length; });
    }
  });

  document.querySelectorAll('[data-recete-sil]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!(await Klinik.onayla('Bu reçete kalıcı olarak silinecek.'))) return;
      try {
        var s = await Klinik.jsonGonder('/api/recete/' + b.getAttribute('data-recete-sil'), null, 'DELETE');
        Klinik.bildir(s.mesaj);
        setTimeout(function () { location.reload(); }, 600);
      } catch (h) { Klinik.bildir(h.message, 'hata'); }
    });
  });

  // URL parametreleri: ?muayene=<randevu> veya ?recete=<muayene>
  var adres = new URLSearchParams(location.search);
  if (VERI.acilacak && document.querySelector('#m_randevu option[value="' + VERI.acilacak + '"]')) {
    setTimeout(function () { muayeneAc(VERI.acilacak); }, 500);
  } else if (adres.get('recete')) {
    setTimeout(function () { receteAc(adres.get('recete')); }, 500);
  }
})();
