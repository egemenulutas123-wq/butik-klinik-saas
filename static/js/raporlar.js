/*
 * Klinik SaaS — Raporlar paneli grafikleri (SVG, kütüphanesiz)
 */
(function () {
  'use strict';

  var R = JSON.parse(document.getElementById('raporVeri').textContent);
  var NS = 'http://www.w3.org/2000/svg';
  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  function svg(t, a) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function tl(k) {
    var a = Math.abs(Math.round(k || 0)), l = Math.floor(a / 100);
    return (k < 0 ? '−' : '') + '₺' + String(l).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function kisaTl(k) {
    var l = (k || 0) / 100;
    if (Math.abs(l) >= 1000000) return '₺' + (l / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mn';
    if (Math.abs(l) >= 1000) return '₺' + (l / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' b';
    return '₺' + Math.round(l);
  }
  function bos(kap, metin) { kap.innerHTML = ''; kap.appendChild(el('div', 'py-6 text-center text-[13px] text-white/50', metin)); }

  // ---------- 12 aylık gelir + randevu ----------
  (function () {
    var kap = $('aylikGrafik'), ipucu = $('ipucu');
    var W = 760, H = 260, sol = 54, sag = 40, ust = 14, alt = 30;
    var veri = R.aylik;
    var maxG = Math.max.apply(null, veri.map(function (a) { return a.gelir; }).concat([1]));
    var maxR = Math.max.apply(null, veri.map(function (a) { return a.tamamlanan + a.gelmedi; }).concat([1]));
    var gen = (W - sol - sag) / veri.length, yuk = H - ust - alt;
    var defs = svg('defs', {});
    var gr = svg('linearGradient', { id: 'gelirRenk', x1: 0, y1: 0, x2: 0, y2: 1 });
    gr.appendChild(svg('stop', { offset: '0%', 'stop-color': '#FDE68A' }));
    gr.appendChild(svg('stop', { offset: '100%', 'stop-color': '#F59E0B', 'stop-opacity': '0.5' }));
    defs.appendChild(gr); kap.appendChild(defs);
    [0, 0.25, 0.5, 0.75, 1].forEach(function (o) {
      var y = ust + yuk * (1 - o);
      kap.appendChild(svg('line', { x1: sol, x2: W - sag, y1: y, y2: y, stroke: 'rgba(255,255,255,0.07)', 'stroke-dasharray': o ? '3 5' : '' }));
      var t = svg('text', { x: sol - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'rgba(255,255,255,0.45)' });
      t.textContent = kisaTl(maxG * o); kap.appendChild(t);
      var t2 = svg('text', { x: W - sag + 8, y: y + 4, 'font-size': 10, fill: 'rgba(94,234,212,0.6)' });
      t2.textContent = Math.round(maxR * o); kap.appendChild(t2);
    });
    var noktalar = [];
    veri.forEach(function (a, i) {
      var x = sol + i * gen, w = gen * 0.56, cx = x + gen / 2;
      var h = a.gelir > 0 ? Math.max(2, yuk * a.gelir / maxG) : 0;
      var g = svg('g', {});
      g.appendChild(svg('rect', { x: x, y: ust, width: gen, height: yuk + alt, fill: 'transparent' }));
      var r = svg('rect', { x: cx - w / 2, y: ust + yuk - h, width: w, height: h, rx: 4, fill: 'url(#gelirRenk)', class: 'kasa-cubuk' });
      r.style.animationDelay = (i * 0.04) + 's';
      g.appendChild(r);
      var t = svg('text', { x: cx, y: H - 10, 'text-anchor': 'middle', 'font-size': 11, fill: 'rgba(255,255,255,0.55)' });
      t.textContent = a.etiket; g.appendChild(t);
      noktalar.push([cx, ust + yuk - yuk * a.tamamlanan / maxR]);
      if (a.gelmedi) {
        var gy = ust + yuk - yuk * (a.tamamlanan + a.gelmedi) / maxR;
        g.appendChild(svg('circle', { cx: cx, cy: gy, r: 3.5, fill: '#FB923C' }));
      }
      g.addEventListener('mouseenter', function () {
        r.setAttribute('opacity', '0.8');
        ipucu.innerHTML = '';
        ipucu.appendChild(el('div', 'font-semibold text-white', a.etiket + ' ' + a.yil));
        ipucu.appendChild(el('div', 'text-amber-200 tabular-nums', 'Gelir ' + tl(a.gelir)));
        ipucu.appendChild(el('div', 'text-teal-200', a.tamamlanan + ' tamamlanan randevu'));
        if (a.gelmedi) ipucu.appendChild(el('div', 'text-orange-200', a.gelmedi + ' hasta gelmedi'));
        ipucu.classList.remove('hidden');
        var oran = kap.getBoundingClientRect().width / W;
        ipucu.style.left = Math.min(Math.max(0, cx * oran - 70), kap.getBoundingClientRect().width - 160) + 'px';
        ipucu.style.top = Math.max(0, (ust + yuk - h) * oran - 80) + 'px';
      });
      g.addEventListener('mouseleave', function () { r.removeAttribute('opacity'); ipucu.classList.add('hidden'); });
      kap.appendChild(g);
    });
    var d = noktalar.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
    var cizgi = svg('path', { d: d, fill: 'none', stroke: '#5EEAD4', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'vital-cizgi' });
    cizgi.style.pointerEvents = 'none';
    kap.appendChild(cizgi);
    noktalar.forEach(function (p) { var c = svg('circle', { cx: p[0], cy: p[1], r: 3.5, fill: '#0B0720', stroke: '#5EEAD4', 'stroke-width': 2 }); c.style.pointerEvents = 'none'; kap.appendChild(c); });
  })();

  // ---------- Randevu sonuç halkası ----------
  (function () {
    var D = R.durumlar;
    var dilimler = [['Tamamlandı', D['Tamamlandı'] || 0, '#5EEAD4'], ['Gelmedi', D['Gelmedi'] || 0, '#FB923C'],
                    ['İptal', D['İptal'] || 0, '#FB7185'], ['Bekliyor / onaylı', (D['Bekliyor'] || 0) + (D['Onaylandı'] || 0), '#A78BFA']];
    var toplam = dilimler.reduce(function (a, d) { return a + d[1]; }, 0);
    var kap = $('sonucHalka'), lej = $('sonucLejant');
    kap.appendChild(svg('circle', { cx: 21, cy: 21, r: 15.9, fill: 'none', stroke: 'rgba(255,255,255,0.07)', 'stroke-width': 5 }));
    var ofs = 0;
    dilimler.forEach(function (d, i) {
      if (!toplam || !d[1]) return;
      var oran = d[1] / toplam * 100;
      var c = svg('circle', { cx: 21, cy: 21, r: 15.9, fill: 'none', stroke: d[2], 'stroke-width': 5, pathLength: 100,
                              'stroke-dasharray': Math.max(oran - 1, 0.5) + ' ' + (100 - Math.max(oran - 1, 0.5)), 'stroke-dashoffset': -ofs, class: 'halka-dilim' });
      c.style.animationDelay = (i * 0.15) + 's';
      kap.appendChild(c);
      ofs += oran;
    });
    dilimler.forEach(function (d) {
      var li = el('li', 'flex items-center justify-between gap-3');
      var s = el('span', 'flex items-center gap-2 text-sm text-white/80');
      var n = el('span', 'w-2.5 h-2.5 rounded-full'); n.style.background = d[2]; n.style.boxShadow = '0 0 10px ' + d[2];
      s.appendChild(n); s.appendChild(document.createTextNode(d[0]));
      li.appendChild(s);
      var sg = el('span', 'text-right');
      sg.appendChild(el('span', 'block text-sm font-semibold text-white tabular-nums', d[1]));
      sg.appendChild(el('span', 'block text-[11px] text-white/50 tabular-nums', '%' + (toplam ? Math.round(d[1] / toplam * 100) : 0)));
      li.appendChild(sg);
      lej.appendChild(li);
    });
  })();

  // ---------- Yatay çubuk listeleri ----------
  function cubukListe(kap, liste, deger, etiket, alt, renk) {
    kap.innerHTML = '';
    if (!liste.length) { bos(kap, 'Bu aralıkta veri yok.'); return; }
    var max = Math.max.apply(null, liste.map(deger).concat([1]));
    liste.forEach(function (x, i) {
      var satir = el('div', 'flex flex-col gap-1');
      var ust = el('div', 'flex items-center justify-between gap-3 text-[13px]');
      ust.appendChild(el('span', 'text-white truncate', etiket(x)));
      ust.appendChild(el('span', 'shrink-0 font-semibold text-white/85 tabular-nums', alt(x)));
      satir.appendChild(ust);
      var bar = el('div', 'h-2 rounded-full bg-white/[0.07] overflow-hidden');
      var d = el('div', 'yontem-serit h-full rounded-full');
      d.style.width = (deger(x) / max * 100) + '%';
      d.style.background = renk;
      d.style.animationDelay = (i * 0.06) + 's';
      bar.appendChild(d);
      satir.appendChild(bar);
      kap.appendChild(satir);
    });
  }
  cubukListe($('tanilar'), R.tanilar, function (x) { return x.adet; }, function (x) { return x.ad; },
    function (x) { return x.adet + ' muayene'; }, 'linear-gradient(90deg, #8B5CF6, #C4B5FD)');
  cubukListe($('hizmetler'), R.hizmetler, function (x) { return x.adet; }, function (x) { return x.ad; },
    function (x) { return x.adet + ' · ' + tl(x.ciro); }, 'linear-gradient(90deg, #14B8A6, #99F6E4)');
  cubukListe($('tuketim'), R.tuketim, function (x) { return x.miktar; }, function (x) { return x.ad; },
    function (x) { return Number(x.miktar).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' ' + x.birim + (x.deger ? ' · ' + tl(x.deger) : ''); },
    'linear-gradient(90deg, #0EA5E9, #BAE6FD)');

  // ---------- Isı haritası ----------
  (function () {
    var kap = $('isiHaritasi');
    var max = Math.max.apply(null, R.isi.reduce(function (a, s) { return a.concat(s); }, []).concat([1]));
    var tablo = el('div', 'inline-grid gap-1.5 min-w-full');
    tablo.style.gridTemplateColumns = '44px repeat(' + R.saatler.length + ', minmax(34px, 1fr))';
    tablo.appendChild(el('div'));
    R.saatler.forEach(function (s) { tablo.appendChild(el('div', 'text-center text-[11px] text-white/50 tabular-nums', s + ':00')); });
    var enYogun = { d: -1 };
    R.isi.forEach(function (satir, g) {
      tablo.appendChild(el('div', 'flex items-center text-[12px] font-semibold text-white/70', R.gunler[g]));
      satir.forEach(function (v, s) {
        var h = el('div', 'isi-hucre h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold tabular-nums');
        var o = v ? 0.12 + 0.88 * v / max : 0.04;
        h.style.background = v ? 'rgba(167,139,250,' + o + ')' : 'rgba(255,255,255,0.04)';
        h.style.color = o > 0.55 ? '#1E0B4B' : 'rgba(255,255,255,0.7)';
        h.textContent = v || '';
        h.title = R.gunler[g] + ' ' + R.saatler[s] + ':00 · ' + v + ' randevu';
        tablo.appendChild(h);
        if (v > enYogun.d) enYogun = { d: v, g: g, s: s };
      });
    });
    kap.appendChild(tablo);
    $('isiOzet').textContent = enYogun.d > 0 ? 'En yoğun zaman: ' + R.gunler[enYogun.g] + ' ' + R.saatler[enYogun.s] + ':00 – ' +
      (Number(R.saatler[enYogun.s]) + 1) + ':00 (' + enYogun.d + ' randevu). Personel planlamasında bu saatleri öne alabilirsiniz.' : 'Bu aralıkta randevu yok.';
  })();

  // ---------- Günlere göre gelmeme ----------
  (function () {
    var kap = $('gunGelmeme');
    var oranlar = R.gun_gelmeme.map(function (g) { return g.toplam ? g.gelmedi / g.toplam * 100 : 0; });
    var max = Math.max.apply(null, oranlar.concat([10]));
    R.gun_gelmeme.forEach(function (g, i) {
      var s = el('div', 'flex flex-col items-center justify-end gap-1.5 h-full');
      s.appendChild(el('div', 'text-[12px] font-semibold tabular-nums ' + (oranlar[i] >= 15 ? 'text-orange-200' : 'text-white/80'), '%' + Math.round(oranlar[i])));
      var b = el('div', 'w-full max-w-[38px] rounded-t-lg yontem-serit');
      b.style.height = Math.max(4, oranlar[i] / max * 110) + 'px';
      b.style.transformOrigin = 'bottom';
      b.style.background = oranlar[i] >= 15 ? 'linear-gradient(#FDBA74, #EA580C)' : 'linear-gradient(#C4B5FD, #7C3AED)';
      b.title = g.gelmedi + ' / ' + g.toplam + ' randevu';
      s.appendChild(b);
      s.appendChild(el('div', 'text-[12px] text-white/60', g.gun));
      kap.appendChild(s);
    });
  })();

  // ---------- Hasta profili ----------
  (function () {
    var kap = $('cinsiyet');
    var c = R.cinsiyet, toplam = Object.keys(c).reduce(function (a, k) { return a + c[k]; }, 0);
    if (!toplam) { bos(kap, 'Veri yok.'); return; }
    var RENK = { 'Kadın': '#F472B6', 'Erkek': '#38BDF8' };
    var bar = el('div', 'flex h-3 rounded-full overflow-hidden');
    var lej = el('div', 'flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/75');
    Object.keys(c).forEach(function (k) {
      var p = el('div', 'h-full'); p.style.width = (c[k] / toplam * 100) + '%'; p.style.background = RENK[k] || '#A78BFA';
      bar.appendChild(p);
      var l = el('span', 'inline-flex items-center gap-1.5');
      var n = el('span', 'w-2 h-2 rounded-full'); n.style.background = RENK[k] || '#A78BFA';
      l.appendChild(n); l.appendChild(document.createTextNode(k + ' %' + Math.round(c[k] / toplam * 100)));
      lej.appendChild(l);
    });
    kap.appendChild(bar); kap.appendChild(lej);
    var yk = $('yas');
    var max = Math.max.apply(null, R.yas.map(function (y) { return y.adet; }).concat([1]));
    R.yas.forEach(function (y) {
      var s = el('div', 'flex-1 flex flex-col items-center justify-end gap-1 h-full');
      s.appendChild(el('div', 'text-[11px] font-semibold text-white/80 tabular-nums', y.adet));
      var b = el('div', 'w-full rounded-t-md yontem-serit');
      b.style.height = Math.max(4, y.adet / max * 80) + 'px';
      b.style.transformOrigin = 'bottom';
      b.style.background = 'linear-gradient(#DDD6FE, #8B5CF6)';
      s.appendChild(b);
      s.appendChild(el('div', 'text-[10px] text-white/55 whitespace-nowrap', y.ad));
      yk.appendChild(s);
    });
  })();

  // ---------- Hekim kırılımı ----------
  (function () {
    var kap = $('hekimTablo');
    if (!kap) return;
    var max = Math.max.apply(null, R.hekimler.map(function (h) { return h.ciro; }).concat([1]));
    R.hekimler.forEach(function (h) {
      var k = el('div', 'flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08]');
      var ust = el('div', 'flex items-center gap-2.5');
      var n = el('span', 'w-3 h-3 rounded-full'); n.style.background = h.renk; n.style.boxShadow = '0 0 10px ' + h.renk;
      ust.appendChild(n);
      var ad = el('div', 'flex-1 min-w-0');
      ad.appendChild(el('div', 'text-[15px] font-semibold text-white truncate', h.ad));
      if (h.brans) ad.appendChild(el('div', 'text-[12px] text-white/55 truncate', h.brans));
      ust.appendChild(ad);
      ust.appendChild(el('div', 'font-sora text-lg font-medium text-amber-200 tabular-nums', tl(h.ciro)));
      k.appendChild(ust);
      var bar = el('div', 'h-2 rounded-full bg-white/[0.07] overflow-hidden');
      var d = el('div', 'yontem-serit h-full rounded-full'); d.style.width = (h.ciro / max * 100) + '%'; d.style.background = h.renk;
      bar.appendChild(d); k.appendChild(bar);
      var ist = el('div', 'grid grid-cols-4 gap-2 text-center');
      [['Randevu', h.randevu], ['Tamamlanan', h.tamamlanan], ['Hasta', h.hasta], ['Gelmeme', '%' + h.gelmeme_orani]].forEach(function (x) {
        var c = el('div', 'flex flex-col');
        c.appendChild(el('span', 'font-sora text-[17px] font-medium text-white tabular-nums', x[1]));
        c.appendChild(el('span', 'text-[10px] text-white/50', x[0]));
        ist.appendChild(c);
      });
      k.appendChild(ist);
      kap.appendChild(k);
    });
  })();

  // ---------- En çok gelen hastalar ----------
  (function () {
    var kap = $('sadik');
    if (!R.sadik.length) { bos(kap, 'Bu aralıkta tamamlanan randevu yok.'); return; }
    R.sadik.forEach(function (h, i) {
      var li = el('li', 'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04]');
      li.appendChild(el('span', 'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold ' +
        (i === 0 ? 'bg-amber-300 text-[#422006]' : 'bg-white/10 text-white'), String(i + 1)));
      var a = el('a', 'flex-1 min-w-0 text-sm font-semibold text-white truncate hover:text-violet-200', h.ad_soyad);
      a.href = '/hasta/' + h.hasta_id;
      li.appendChild(a);
      li.appendChild(el('span', 'text-[12px] text-white/60 tabular-nums', h.ziyaret + ' ziyaret'));
      kap.appendChild(li);
    });
  })();
})();
