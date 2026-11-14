/*
 * Klinik SaaS — Tahlil / görüntüleme dosyaları ve laboratuvar değerleri (hasta dosyası)
 */
(function () {
  'use strict';

  var P = JSON.parse(document.getElementById('profilVeri').textContent);
  var T = P.tahlil;
  if (!T || !document.getElementById('tahlilBolum')) return;
  var HASTA = P.hasta;
  var NS = 'http://www.w3.org/2000/svg';

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  function svg(t, a) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function tarihTr(iso) { return iso ? iso.split('-').reverse().join('.') : ''; }
  function sayi(x) { return Number(x).toLocaleString('tr-TR', { maximumFractionDigits: 2 }); }
  function boyut(b) { return b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function sade(m) { return (m || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().replace(/[çğıöşü]/g, function (c) { return { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c]; }); }
  function refMetin(mn, mx, birim) {
    if (mn != null && mx != null) return sayi(mn) + ' – ' + sayi(mx) + (birim ? ' ' + birim : '');
    if (mn != null) return '≥ ' + sayi(mn) + (birim ? ' ' + birim : '');
    if (mx != null) return '≤ ' + sayi(mx) + (birim ? ' ' + birim : '');
    return 'Referans yok';
  }
  function durumBul(d, mn, mx) { return mn != null && d < mn ? 'dusuk' : mx != null && d > mx ? 'yuksek' : 'normal'; }
  var DURUM = {
    dusuk: { ad: 'Düşük', ok: '↓', renk: '#7DD3FC', sinif: 'text-sky-200 bg-sky-400/15' },
    yuksek: { ad: 'Yüksek', ok: '↑', renk: '#FB7185', sinif: 'text-rose-100 bg-rose-500/20' },
    normal: { ad: 'Normal', ok: '', renk: '#5EEAD4', sinif: 'text-teal-100 bg-teal-400/15' }
  };
  var PANELLER = [
    ['Hemogram', ['hgb', 'wbc', 'plt']], ['Tiroid', ['tsh', 'st4']], ['Lipid', ['kol', 'ldl', 'hdl', 'tg']],
    ['Diyabet', ['glu', 'hba1c']], ['Böbrek / karaciğer', ['kre', 'ure', 'alt', 'ast']], ['Vitamin', ['d3', 'b12', 'fer']]
  ];
  var testHarita = {};
  T.testler.forEach(function (t) { testHarita[t.test] = t; });

  var dosyalar = T.dosyalar, lab = T.lab, seciliTest = null;

  // ---------- Özet kartları ----------
  function gruplar() {
    var g = {};
    lab.forEach(function (l) { (g[l.test] = g[l.test] || []).push(l); });
    Object.keys(g).forEach(function (k) { g[k].sort(function (a, b) { return a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.id - b.id; }); });
    return g;
  }

  function ozetCiz() {
    var g = gruplar(), kap = $('labOzet');
    kap.innerHTML = '';
    var anahtarlar = Object.keys(g).sort(function (a, b) {
      var sa = g[a][g[a].length - 1], sb = g[b][g[b].length - 1];
      var oa = sa.durum === 'normal' ? 1 : 0, ob = sb.durum === 'normal' ? 1 : 0;
      return oa - ob || (sb.tarih > sa.tarih ? 1 : sb.tarih < sa.tarih ? -1 : 0);
    });
    var disari = anahtarlar.filter(function (k) { return g[k][g[k].length - 1].durum !== 'normal'; }).length;
    $('tahlilAlt').textContent = (anahtarlar.length ? anahtarlar.length + ' test takipte' + (disari ? ' · ' + disari + ' tanesi son ölçümde referans dışı' : ' · son değerler normal') : 'Henüz tahlil değeri yok') +
      ' · ' + dosyalar.length + ' belge';
    if (!anahtarlar.length) {
      var b = el('div', 'col-span-full py-6 px-4 text-center rounded-2xl border border-dashed border-white/15');
      b.appendChild(el('div', 'text-sm font-semibold text-white', 'Tahlil değerleri burada izlenir'));
      b.appendChild(el('div', 'mt-1 text-[13px] text-violet-300', '“Sonuç gir” ile TSH, hemoglobin, LDL gibi değerleri ekleyin; değişim grafikte görünür, referans dışı olanlar işaretlenir.'));
      kap.appendChild(b);
      $('labGrafikKap').classList.add('hidden');
      $('labGrafikKap').classList.remove('flex');
      return;
    }
    if (!seciliTest || !g[seciliTest]) seciliTest = anahtarlar[0];
    anahtarlar.forEach(function (k) {
      var seri = g[k], son = seri[seri.length - 1], once = seri[seri.length - 2];
      var d = DURUM[son.durum];
      var kart = el('button', 'text-left flex flex-col gap-1 p-3 rounded-2xl border transition-all ' +
        (k === seciliTest ? 'bg-white/[0.12] border-white/40' : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08]'));
      kart.type = 'button';
      kart.setAttribute('aria-pressed', k === seciliTest ? 'true' : 'false');
      var ust = el('div', 'flex items-center justify-between gap-2');
      ust.appendChild(el('span', 'text-[12px] font-medium text-violet-200 truncate', son.ad));
      if (son.durum !== 'normal') ust.appendChild(el('span', 'shrink-0 inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-bold ' + d.sinif, d.ok + ' ' + d.ad));
      kart.appendChild(ust);
      var deger = el('div', 'flex items-baseline gap-1.5');
      var dv = el('span', 'font-sora text-[22px] font-medium tabular-nums', sayi(son.deger));
      dv.style.color = son.durum === 'normal' ? '#FFFFFF' : d.renk;
      deger.appendChild(dv);
      deger.appendChild(el('span', 'text-[11px] text-violet-300', son.birim));
      if (once) {
        var fark = son.deger - once.deger;
        if (Math.abs(fark) > 1e-9) deger.appendChild(el('span', 'ml-auto text-[11px] font-semibold text-white/60 tabular-nums', (fark > 0 ? '▲ ' : '▼ ') + sayi(Math.abs(fark))));
      }
      kart.appendChild(deger);
      kart.appendChild(el('span', 'text-[11px] text-violet-300/80', tarihTr(son.tarih) + (seri.length > 1 ? ' · ' + seri.length + ' ölçüm' : '')));
      kart.addEventListener('click', function () { seciliTest = k; ozetCiz(); });
      kap.appendChild(kart);
    });
    grafikCiz(g[seciliTest]);
  }

  // ---------- Zaman grafiği (referans bandı ile) ----------
  function grafikCiz(seri) {
    var kap = $('labGrafikKap');
    kap.classList.remove('hidden'); kap.classList.add('flex');
    var son = seri[seri.length - 1];
    $('labGrafikBaslik').textContent = son.ad + ' · ' + seri.length + ' ölçüm';
    $('labGrafikRef').textContent = 'Referans: ' + refMetin(son.ref_min, son.ref_max, son.birim);
    var g = $('labGrafik'), ip = $('labIpucu');
    g.innerHTML = '';
    var W = 640, H = 220, sol = 46, sag = 18, ust = 14, alt = 30;
    var degerler = seri.map(function (l) { return l.deger; });
    var alanlar = degerler.concat([son.ref_min, son.ref_max].filter(function (x) { return x != null; }));
    var mn = Math.min.apply(null, alanlar), mx = Math.max.apply(null, alanlar);
    if (mx === mn) { mx += 1; mn -= 1; }
    var pay = (mx - mn) * 0.15; mn -= pay; mx += pay;
    if (mn < 0 || (Math.min.apply(null, alanlar) >= 0 && mn < (mx - mn) * 0.25)) mn = Math.max(0, Math.min(mn, 0));
    function y(v) { return ust + (H - ust - alt) * (1 - (v - mn) / (mx - mn)); }
    var zaman = seri.map(function (l) { return new Date(l.tarih).getTime(); });
    var t0 = Math.min.apply(null, zaman), t1 = Math.max.apply(null, zaman);
    function x(t) { return seri.length === 1 ? (sol + W - sag) / 2 : sol + (W - sol - sag) * (t - t0) / (t1 - t0); }

    if (son.ref_min != null || son.ref_max != null) {
      var y1 = y(son.ref_max != null ? son.ref_max : mx), y2 = y(son.ref_min != null ? son.ref_min : mn);
      g.appendChild(svg('rect', { x: sol, y: y1, width: W - sol - sag, height: Math.max(1, y2 - y1), fill: 'rgba(94,234,212,0.08)', stroke: 'rgba(94,234,212,0.25)', 'stroke-dasharray': '4 4' }));
    }
    for (var i = 0; i <= 4; i++) {
      var v = mn + (mx - mn) * i / 4, yy = y(v);
      g.appendChild(svg('line', { x1: sol, x2: W - sag, y1: yy, y2: yy, stroke: 'rgba(255,255,255,0.06)' }));
      var tt = svg('text', { x: sol - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'rgba(255,255,255,0.45)' });
      var ond = mx - mn >= 20 ? 0 : mx - mn >= 2 ? 1 : 2;
      tt.textContent = v.toLocaleString('tr-TR', { maximumFractionDigits: ond }); g.appendChild(tt);
    }
    var d = seri.map(function (l, i) { return (i ? 'L' : 'M') + x(zaman[i]) + ' ' + y(l.deger); }).join(' ');
    g.appendChild(svg('path', { d: d, fill: 'none', stroke: '#C4B5FD', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'vital-cizgi' }));
    seri.forEach(function (l, i) {
      var cx = x(zaman[i]), cy = y(l.deger), renk = DURUM[l.durum].renk;
      var grp = svg('g', { style: 'cursor: default' });
      grp.appendChild(svg('circle', { cx: cx, cy: cy, r: 14, fill: 'transparent' }));
      grp.appendChild(svg('circle', { cx: cx, cy: cy, r: 5, fill: '#0B0720', stroke: renk, 'stroke-width': 2.5 }));
      var etk = svg('text', { x: cx, y: H - 10, 'text-anchor': 'middle', 'font-size': 10, fill: 'rgba(255,255,255,0.5)' });
      etk.textContent = tarihTr(l.tarih).slice(0, 5) + (seri.length < 8 ? '.' + l.tarih.slice(2, 4) : '');
      if (seri.length <= 10 || i % Math.ceil(seri.length / 8) === 0 || i === seri.length - 1) g.appendChild(etk);
      grp.addEventListener('mouseenter', function () {
        ip.innerHTML = '';
        ip.appendChild(el('div', 'font-semibold text-white', sayi(l.deger) + ' ' + l.birim));
        ip.appendChild(el('div', 'text-violet-200', tarihTr(l.tarih) + ' · ' + DURUM[l.durum].ad));
        ip.classList.remove('hidden');
        var oran = g.getBoundingClientRect().width / W;
        ip.style.left = Math.max(0, cx * oran - 60) + 'px';
        ip.style.top = Math.max(0, cy * oran - 58) + 'px';
      });
      grp.addEventListener('mouseleave', function () { ip.classList.add('hidden'); });
      g.appendChild(grp);
    });

    var gec = $('labGecmis');
    gec.innerHTML = '';
    seri.slice().reverse().forEach(function (l) {
      var c = el('span', 'group inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1 rounded-lg text-[12px] bg-white/[0.05] border border-white/[0.08]');
      var n = el('span', 'w-1.5 h-1.5 rounded-full'); n.style.background = DURUM[l.durum].renk;
      c.appendChild(n);
      c.appendChild(el('span', 'text-white/85 tabular-nums', tarihTr(l.tarih) + ' · ' + sayi(l.deger)));
      if (l.dosya_id) {
        var bd = el('button', 'h-6 px-1.5 rounded-md text-[11px] font-semibold text-violet-200 hover:bg-white/10', 'Belge');
        bd.type = 'button';
        bd.addEventListener('click', function () { var d = dosyalar.find(function (x) { return x.id === l.dosya_id; }); if (d) goruntule(d); });
        c.appendChild(bd);
      }
      var sil = el('button', 'w-6 h-6 rounded-md text-[13px] text-rose-200/70 hover:text-rose-100 hover:bg-rose-500/15', '×');
      sil.type = 'button';
      sil.setAttribute('aria-label', tarihTr(l.tarih) + ' tarihli değeri sil');
      sil.addEventListener('click', async function () {
        if (!(await Klinik.onayla(l.ad + ' · ' + tarihTr(l.tarih) + ' (' + sayi(l.deger) + ' ' + l.birim + ') silinecek.', 'Evet, sil'))) return;
        try { var r = await Klinik.jsonGonder('/api/lab/' + l.id, null, 'DELETE'); lab = lab.filter(function (x) { return x.id !== l.id; }); Klinik.bildir(r.mesaj); ozetCiz(); }
        catch (h) { Klinik.bildir(h.message, 'hata'); }
      });
      c.appendChild(sil);
      gec.appendChild(c);
    });
  }

  // ---------- Belgeler ----------
  function dosyalariCiz() {
    var kap = $('dosyaListe');
    kap.innerHTML = '';
    if (!dosyalar.length) {
      var b = el('label', 'col-span-full flex flex-col items-center gap-1 py-6 px-4 text-center rounded-2xl border border-dashed border-white/15 cursor-pointer hover:bg-white/[0.03]');
      b.setAttribute('for', 'dosyaSec');
      b.appendChild(el('div', 'text-sm font-semibold text-white', 'Henüz belge yok'));
      b.appendChild(el('div', 'text-[13px] text-violet-300', 'Tahlil PDF’i, röntgen görüntüsü veya rapor fotoğrafı yükleyin — sürükleyip bırakabilir, telefonda kamerayla çekebilirsiniz.'));
      kap.appendChild(b);
      return;
    }
    dosyalar.forEach(function (d) {
      var k = el('button', 'group text-left flex flex-col rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-white/30 transition-colors');
      k.type = 'button';
      var on = el('div', 'relative h-24 flex items-center justify-center bg-black/30 overflow-hidden');
      if (d.gorsel) {
        var img = el('img', 'w-full h-full object-cover transition-transform duration-500 group-hover:scale-105');
        img.src = d.adres; img.alt = ''; img.loading = 'lazy';
        on.appendChild(img);
      } else {
        on.innerHTML = '<svg aria-hidden="true" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';
      }
      on.appendChild(el('span', 'absolute top-1.5 left-1.5 inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-bold text-[#1E0B4B] bg-white/90', d.tur_adi));
      if (d.lab_sayisi) on.appendChild(el('span', 'absolute top-1.5 right-1.5 inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-bold text-[#042F2E] bg-teal-200', d.lab_sayisi + ' değer'));
      k.appendChild(on);
      var alt = el('div', 'p-2.5 min-w-0');
      alt.appendChild(el('div', 'text-[12px] font-semibold text-white truncate', d.aciklama || d.ad));
      alt.appendChild(el('div', 'text-[11px] text-violet-300 truncate', tarihTr(d.tarih) + ' · ' + boyut(d.boyut)));
      k.appendChild(alt);
      k.addEventListener('click', function () { goruntule(d); });
      kap.appendChild(k);
    });
  }

  var aktifDosya = null;
  function goruntule(d) {
    aktifDosya = d;
    $('gorBaslik').textContent = d.aciklama || d.ad;
    $('gorAlt').textContent = d.tur_adi + ' · ' + tarihTr(d.tarih) + ' · ' + d.ad + ' · ' + boyut(d.boyut) + (d.yukleyen ? ' · ' + d.yukleyen : '');
    $('gorIndir').href = d.adres + '?indir=1';
    $('gorYeniSekme').href = d.adres;
    var ic = $('gorIcerik');
    ic.innerHTML = '';
    if (d.gorsel) {
      var img = el('img', 'max-w-full max-h-full object-contain');
      img.src = d.adres; img.alt = d.aciklama || d.ad;
      ic.appendChild(img);
    } else {
      var fr = el('iframe', 'w-full h-full bg-white');
      fr.src = d.adres; fr.title = d.ad;
      ic.appendChild(fr);
    }
    Klinik.modalAcId('goruntuleyici', 'gorSonuc');
  }
  $('gorSil').addEventListener('click', async function () {
    var d = aktifDosya;
    if (!d || !(await Klinik.onayla(d.ad + ' kalıcı olarak silinecek. Bu belgeden girilen tahlil değerleri korunur.', 'Evet, sil'))) return;
    try {
      var r = await Klinik.jsonGonder('/api/dosya/' + d.id, null, 'DELETE');
      dosyalar = dosyalar.filter(function (x) { return x.id !== d.id; });
      lab.forEach(function (l) { if (l.dosya_id === d.id) l.dosya_id = null; });
      Klinik.modalKapatId('goruntuleyici');
      $('gorIcerik').innerHTML = '';
      Klinik.bildir(r.mesaj);
      dosyalariCiz(); ozetCiz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });
  $('gorSonuc').addEventListener('click', function () {
    var d = aktifDosya;
    Klinik.modalKapatId('goruntuleyici');
    $('gorIcerik').innerHTML = '';
    labAc(d);
  });
  document.querySelectorAll('[data-modal-kapat="goruntuleyici"]').forEach(function (b) {
    b.addEventListener('click', function () { $('gorIcerik').innerHTML = ''; });
  });

  // ---------- Yükleme ----------
  var bekleyen = [], seciliTur = 'tahlil';
  function turleriCiz() {
    var kap = $('yuklemeTurler');
    kap.innerHTML = '';
    Object.keys(T.turler).forEach(function (k) {
      var b = el('button', 'h-11 rounded-xl text-[13px] font-semibold border transition-colors ' +
        (k === seciliTur ? 'text-[#1E0B4B] bg-white border-white' : 'text-white bg-white/[0.05] border-white/15 hover:bg-white/10'), T.turler[k]);
      b.type = 'button';
      b.setAttribute('aria-pressed', k === seciliTur ? 'true' : 'false');
      b.addEventListener('click', function () { seciliTur = k; turleriCiz(); });
      kap.appendChild(b);
    });
  }
  function yuklemeBaslat(liste) {
    bekleyen = Array.prototype.filter.call(liste, function (f) { return /\.(pdf|jpe?g|png|webp)$/i.test(f.name); });
    if (!bekleyen.length) { Klinik.bildir('Yalnızca PDF, JPG, PNG veya WEBP yükleyebilirsiniz.', 'hata'); return; }
    var buyuk = bekleyen.filter(function (f) { return f.size > 20 * 1048576; });
    if (buyuk.length) { Klinik.bildir(buyuk[0].name + ' 20 MB sınırını aşıyor.', 'hata'); return; }
    seciliTur = bekleyen.every(function (f) { return /^image\//.test(f.type); }) ? 'goruntu' : 'tahlil';
    turleriCiz();
    $('yuklemeDosyalar').textContent = bekleyen.map(function (f) { return f.name + ' (' + boyut(f.size) + ')'; }).join(', ');
    $('y_tarih').value = T.bugun; $('y_tarih').max = T.bugun;
    $('y_aciklama').value = '';
    $('y_sonuc').checked = seciliTur === 'tahlil';
    $('yuklemeIlerleme').classList.add('hidden');
    Klinik.modalAcId('yuklemeModal', 'y_aciklama');
  }
  $('dosyaSec').addEventListener('change', function () { if (this.files.length) yuklemeBaslat(this.files); this.value = ''; });
  $('yuklemeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = this.querySelector('[type=submit]'), ilerleme = $('yuklemeIlerleme');
    b.disabled = true;
    ilerleme.classList.remove('hidden');
    var yuklenen = [];
    for (var i = 0; i < bekleyen.length; i++) {
      var fd = new FormData();
      fd.append('dosya', bekleyen[i]);
      fd.append('tur', seciliTur);
      fd.append('tarih', $('y_tarih').value);
      fd.append('aciklama', $('y_aciklama').value);
      try {
        var y = await fetch('/api/hasta/' + HASTA.id + '/dosya', { method: 'POST', body: fd });
        var v = {}; try { v = await y.json(); } catch (x) {}
        if (!y.ok) throw new Error(v.hata || (y.status === 413 ? 'Dosya çok büyük.' : 'Yükleme başarısız.'));
        yuklenen.push(v.dosya);
      } catch (h) { Klinik.bildir(bekleyen[i].name + ': ' + h.message, 'hata'); }
      ilerleme.firstElementChild.style.width = ((i + 1) / bekleyen.length * 100) + '%';
    }
    b.disabled = false;
    if (!yuklenen.length) return;
    dosyalar = yuklenen.reverse().concat(dosyalar).sort(function (a, c) { return a.tarih < c.tarih ? 1 : a.tarih > c.tarih ? -1 : c.id - a.id; });
    dosyalariCiz(); ozetCiz();
    Klinik.modalKapatId('yuklemeModal');
    Klinik.bildir(yuklenen.length + ' belge yüklendi.');
    if ($('y_sonuc').checked) setTimeout(function () { labAc(yuklenen[0]); }, 250);
  });

  // Sürükle-bırak
  var bolum = $('tahlilBolum'), sayac = 0;
  bolum.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) { sayac++; $('birakAlani').classList.remove('hidden'); $('birakAlani').classList.add('flex'); } });
  bolum.addEventListener('dragleave', function () { if (--sayac <= 0) { sayac = 0; $('birakAlani').classList.add('hidden'); $('birakAlani').classList.remove('flex'); } });
  bolum.addEventListener('dragover', function (e) { e.preventDefault(); });
  bolum.addEventListener('drop', function (e) {
    e.preventDefault(); sayac = 0;
    $('birakAlani').classList.add('hidden'); $('birakAlani').classList.remove('flex');
    if (e.dataTransfer.files.length) yuklemeBaslat(e.dataTransfer.files);
  });

  // ---------- Sonuç girişi ----------
  var satirlar = [];
  function labAc(dosya) {
    satirlar = [];
    $('l_tarih').value = dosya ? dosya.tarih : T.bugun;
    $('l_tarih').max = T.bugun;
    var sec = $('l_dosya');
    sec.innerHTML = '';
    var o = el('option', '', 'Belge bağlama'); o.value = ''; sec.appendChild(o);
    dosyalar.forEach(function (d) {
      var x = el('option', '', tarihTr(d.tarih) + ' · ' + (d.aciklama || d.ad)); x.value = d.id;
      if (dosya && dosya.id === d.id) x.selected = true;
      sec.appendChild(x);
    });
    $('labAra').value = '';
    satirlariCiz();
    Klinik.modalAcId('labModal', 'labAra');
  }
  $('labAc').addEventListener('click', function () { labAc(null); });
  $('l_dosya').addEventListener('change', function () {
    var d = dosyalar.find(function (x) { return String(x.id) === $('l_dosya').value; });
    if (d) $('l_tarih').value = d.tarih;
  });

  function satirEkle(t) {
    if (t.test && satirlar.some(function (s) { return s.test === t.test; })) return false;
    var onceki = lab.filter(function (l) { return t.test ? l.test === t.test : sade(l.ad) === sade(t.ad); });
    var son = onceki[onceki.length - 1];
    satirlar.push({ test: t.test || null, ad: t.ad, birim: t.birim || (son && son.birim) || '',
                    ref_min: t.ref_min != null ? t.ref_min : son ? son.ref_min : null,
                    ref_max: t.ref_max != null ? t.ref_max : son ? son.ref_max : null,
                    deger: '', ozel: !t.test, onceki: son || null });
    return true;
  }

  function satirlariCiz(odakSon) {
    var tb = $('labSatirlar');
    tb.innerHTML = '';
    $('labBos').classList.toggle('hidden', satirlar.length > 0);
    satirlar.forEach(function (s, i) {
      var tr = el('tr', 'border-t border-white/[0.07] align-middle');
      var ad = el('td', 'py-2 pr-2');
      if (s.ozel) {
        var ai = el('input', 'alan !h-10 !text-[13px]'); ai.value = s.ad; ai.placeholder = 'Test adı';
        ai.addEventListener('input', function () { s.ad = ai.value; });
        ad.appendChild(ai);
      } else {
        ad.appendChild(el('div', 'text-[13px] font-semibold text-white', s.ad));
      }
      if (s.onceki) ad.appendChild(el('div', 'text-[11px] text-violet-300', 'Önceki: ' + sayi(s.onceki.deger) + ' · ' + tarihTr(s.onceki.tarih)));
      tr.appendChild(ad);
      var dg = el('td', 'py-2 pr-2');
      var di = el('input', 'alan !h-10 !text-[14px] font-semibold tabular-nums');
      di.inputMode = 'decimal'; di.value = s.deger; di.setAttribute('aria-label', s.ad + ' değeri');
      dg.appendChild(di); tr.appendChild(dg);
      var bt = el('td', 'py-2 pr-2');
      if (s.ozel) {
        var bi = el('input', 'alan !h-10 !text-[13px]'); bi.value = s.birim; bi.placeholder = 'Birim';
        bi.addEventListener('input', function () { s.birim = bi.value; });
        bt.appendChild(bi);
      } else bt.appendChild(el('span', 'text-[12px] text-violet-200', s.birim));
      tr.appendChild(bt);
      var rf = el('td', 'py-2 pr-2');
      var rk = el('div', 'flex items-center gap-1');
      var r1 = el('input', 'alan !h-10 !text-[12px] !px-2 tabular-nums'); r1.inputMode = 'decimal'; r1.placeholder = 'alt'; r1.value = s.ref_min != null ? String(s.ref_min).replace('.', ',') : '';
      var r2 = el('input', 'alan !h-10 !text-[12px] !px-2 tabular-nums'); r2.inputMode = 'decimal'; r2.placeholder = 'üst'; r2.value = s.ref_max != null ? String(s.ref_max).replace('.', ',') : '';
      r1.setAttribute('aria-label', s.ad + ' referans alt'); r2.setAttribute('aria-label', s.ad + ' referans üst');
      rk.appendChild(r1); rk.appendChild(el('span', 'text-violet-400', '–')); rk.appendChild(r2);
      rf.appendChild(rk); tr.appendChild(rf);
      var dd = el('td', 'py-2 pr-2');
      var rozet = el('span', 'inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold');
      dd.appendChild(rozet); tr.appendChild(dd);
      function num(v) { v = String(v).replace(',', '.').trim(); return v === '' || isNaN(Number(v)) ? null : Number(v); }
      function guncelle() {
        s.deger = di.value; s.ref_min = num(r1.value); s.ref_max = num(r2.value);
        var v = num(di.value);
        if (v == null) { rozet.className = 'hidden'; di.style.color = ''; return; }
        var d = DURUM[durumBul(v, s.ref_min, s.ref_max)];
        rozet.className = 'inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold whitespace-nowrap ' + d.sinif;
        rozet.textContent = (d.ok ? d.ok + ' ' : '') + d.ad;
        di.style.color = d === DURUM.normal ? '' : d.renk;
      }
      [di, r1, r2].forEach(function (x) { x.addEventListener('input', guncelle); });
      di.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); var sonraki = tb.querySelectorAll('tr')[i + 1]; if (sonraki) sonraki.querySelectorAll('input')[s.ozel ? 1 : 0].focus(); else $('labAra').focus(); }
      });
      guncelle();
      var sl = el('td', 'py-2 text-right');
      var x = el('button', 'w-9 h-9 rounded-lg text-rose-200/70 hover:text-rose-100 hover:bg-rose-500/15', '×');
      x.type = 'button'; x.setAttribute('aria-label', s.ad + ' satırını kaldır');
      x.addEventListener('click', function () { satirlar.splice(i, 1); satirlariCiz(); });
      sl.appendChild(x); tr.appendChild(sl);
      tb.appendChild(tr);
      if (odakSon && i === satirlar.length - 1) setTimeout(function () { (s.ozel && !s.ad ? ad.querySelector('input') : di).focus(); }, 30);
    });
  }

  // Hızlı paneller
  PANELLER.forEach(function (p) {
    var b = el('button', 'h-8 px-3 rounded-full text-[12px] font-semibold text-violet-100 bg-white/[0.06] border border-white/15 hover:bg-white/15', p[0]);
    b.type = 'button';
    b.addEventListener('click', function () { p[1].forEach(function (k) { satirEkle(testHarita[k]); }); satirlariCiz(true); });
    $('labPaneller').appendChild(b);
  });

  // Test arama
  var oneriIdx = -1, oneriler = [];
  function oneriCiz() {
    var q = sade($('labAra').value.trim()), kap = $('labOneri');
    kap.innerHTML = '';
    oneriler = !q ? [] : T.testler.filter(function (t) { return sade(t.ad).indexOf(q) !== -1 || t.test.indexOf(q) === 0 || sade(t.grup).indexOf(q) === 0; });
    var ozelAdlar = {};
    lab.forEach(function (l) { if (l.test.indexOf('ozel:') === 0 && sade(l.ad).indexOf(q) !== -1) ozelAdlar[l.ad] = l; });
    Object.keys(ozelAdlar).forEach(function (a) { oneriler.push({ ad: a, birim: ozelAdlar[a].birim, ref_min: ozelAdlar[a].ref_min, ref_max: ozelAdlar[a].ref_max, grup: 'Daha önce girilen', ozelKayit: true }); });
    if (!q) { kap.classList.add('hidden'); return; }
    oneriler.push({ ad: $('labAra').value.trim(), grup: 'Özel test olarak ekle', yeniOzel: true });
    oneriIdx = 0;
    oneriler.forEach(function (t, i) {
      var b = el('button', 'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-[13px] ' + (i === oneriIdx ? 'bg-white/10' : 'hover:bg-white/[0.06]'));
      b.type = 'button';
      b.appendChild(el('span', 'text-white', (t.yeniOzel ? '+ “' + t.ad + '”' : t.ad)));
      b.appendChild(el('span', 'text-[11px] text-violet-300', t.grup + (t.birim ? ' · ' + t.birim : '')));
      b.addEventListener('mousedown', function (e) { e.preventDefault(); oneriSec(i); });
      kap.appendChild(b);
    });
    kap.classList.remove('hidden');
  }
  function oneriSec(i) {
    var t = oneriler[i];
    if (!t) return;
    var eklendi = t.yeniOzel ? satirEkle({ ad: t.ad, birim: '' }) : satirEkle(t.ozelKayit ? { ad: t.ad, birim: t.birim, ref_min: t.ref_min, ref_max: t.ref_max } : t);
    if (!eklendi) Klinik.bildir(t.ad + ' zaten listede.');
    $('labAra').value = '';
    $('labOneri').classList.add('hidden');
    satirlariCiz(true);
  }
  $('labAra').addEventListener('input', oneriCiz);
  $('labAra').addEventListener('blur', function () { setTimeout(function () { $('labOneri').classList.add('hidden'); }, 120); });
  $('labAra').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (oneriler.length && $('labAra').value.trim()) oneriSec(Math.max(0, oneriIdx)); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      oneriIdx = Math.max(0, Math.min(oneriler.length - 1, oneriIdx + (e.key === 'ArrowDown' ? 1 : -1)));
      Array.prototype.forEach.call($('labOneri').children, function (c, i) { c.classList.toggle('bg-white/10', i === oneriIdx); });
    }
  });

  $('labForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var dolu = satirlar.filter(function (s) { return String(s.deger).trim() !== ''; });
    if (!dolu.length) { Klinik.bildir('En az bir test için değer girin.', 'hata'); return; }
    var b = $('labKaydet');
    b.disabled = true;
    try {
      var r = await Klinik.jsonGonder('/api/hasta/' + HASTA.id + '/lab', {
        tarih: $('l_tarih').value, dosya_id: $('l_dosya').value ? Number($('l_dosya').value) : null,
        sonuclar: dolu.map(function (s) { return { test: s.test, ad: s.ad, birim: s.birim, deger: s.deger, ref_min: s.ref_min, ref_max: s.ref_max }; })
      });
      lab = lab.concat(r.sonuclar);
      if (r.sonuclar.length) seciliTest = r.sonuclar[0].test;
      var df = dosyalar.find(function (x) { return String(x.id) === $('l_dosya').value; });
      if (df) df.lab_sayisi = (df.lab_sayisi || 0) + r.sonuclar.length;
      Klinik.modalKapatId('labModal');
      Klinik.bildir(r.mesaj, r.referans_disi ? 'hata' : undefined);
      ozetCiz(); dosyalariCiz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });

  ozetCiz();
  dosyalariCiz();
})();
