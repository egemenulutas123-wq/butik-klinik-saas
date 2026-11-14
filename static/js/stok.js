/*
 * Klinik SaaS — Stok ve malzeme takibi
 */
(function () {
  'use strict';

  var V = JSON.parse(document.getElementById('stokVeri').textContent);
  var MALZEMELER = V.malzemeler, HAREKETLER = V.hareketler, ESLEMELER = V.eslemeler, ISLEMLER = V.islemler, DOKTOR = V.doktor;
  var tl = function (k) {
    var a = Math.abs(Math.round(k || 0)), l = Math.floor(a / 100), kr = a % 100;
    return '₺' + String(l).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (kr ? ',' + String(kr).padStart(2, '0') : '');
  };
  var sayi = function (n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 }); };

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }

  // ---------- Sekmeler ----------
  var SEKMELER = ['malzeme', 'hareket', 'esleme'];
  function sekmeGoster(ad) {
    if (SEKMELER.indexOf(ad) === -1) ad = 'malzeme';
    document.querySelectorAll('.sekme').forEach(function (b) {
      var aktif = b.dataset.sekme === ad;
      b.setAttribute('aria-selected', aktif ? 'true' : 'false');
      b.className = 'sekme h-11 px-5 rounded-2xl text-sm font-semibold transition-colors ' + (aktif ? 'bg-white text-[#0A1A2E]' : 'text-white/85 hover:bg-white/10');
    });
    SEKMELER.forEach(function (p) { $('panel-' + p).classList.toggle('hidden', p !== ad); $('panel-' + p).classList.toggle('flex', p === ad); });
    history.replaceState(null, '', '#' + ad);
  }
  document.querySelectorAll('.sekme').forEach(function (b) { b.addEventListener('click', function () { sekmeGoster(b.dataset.sekme); }); });
  document.querySelectorAll('[data-sekme-git]').forEach(function (b) {
    b.addEventListener('click', function () {
      sekmeGoster('malzeme');
      $('yalnizUyari').checked = true;
      malzemeleriCiz();
      $('panel-malzeme').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ---------- Malzemeler ----------
  var kategori = 'Tümü';
  function uyariVar(m) { return m.durum !== 'normal' || (m.skt_gun !== null && m.skt_gun <= 30); }

  function kategorileriCiz() {
    var kap = $('kategoriFiltre');
    kap.innerHTML = '';
    var liste = ['Tümü'].concat(Array.from(new Set(MALZEMELER.map(function (m) { return m.kategori; }))).sort(function (a, b) { return a.localeCompare(b, 'tr'); }));
    liste.forEach(function (k) {
      var aktif = k === kategori;
      var b = el('button', 'h-9 px-3 rounded-full text-xs font-semibold border transition-all ' +
        (aktif ? 'text-[#0A1A2E] bg-white border-white' : 'text-white/85 bg-white/5 border-white/15 hover:bg-white/10'), k);
      b.type = 'button';
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      b.addEventListener('click', function () { kategori = k; kategorileriCiz(); malzemeleriCiz(); });
      kap.appendChild(b);
    });
  }

  function rozet(metin, sinif) { return el('span', 'inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap ' + sinif, metin); }

  function malzemeleriCiz() {
    var q = $('malzemeAra').value.trim().toLocaleLowerCase('tr');
    var yalniz = $('yalnizUyari').checked;
    var liste = MALZEMELER.filter(function (m) {
      return (kategori === 'Tümü' || m.kategori === kategori) && (!q || m.ad.toLocaleLowerCase('tr').indexOf(q) !== -1) && (!yalniz || uyariVar(m));
    }).sort(function (a, b) {
      var s = { tukendi: 0, kritik: 1, normal: 2 };
      return (s[a.durum] - s[b.durum]) || a.ad.localeCompare(b.ad, 'tr');
    });
    var kap = $('malzemeListe');
    kap.innerHTML = '';
    if (!liste.length) {
      var bos = el('div', 'md:col-span-2 2xl:col-span-3 py-12 text-center rounded-2xl border border-dashed border-white/15');
      bos.appendChild(el('div', 'text-base font-semibold text-white', MALZEMELER.length ? 'Bu filtreye uyan malzeme yok' : 'Henüz malzeme eklenmedi'));
      bos.appendChild(el('div', 'mt-1.5 text-[13px] text-white/60', MALZEMELER.length ? 'Filtreleri temizleyin.' : '“Yeni malzeme” ile stok kartı açın.'));
      kap.appendChild(bos);
      return;
    }
    liste.forEach(function (m, n) {
      var renk = m.durum === 'tukendi' ? ['border-rose-400/45', 'bg-rose-500/[0.08]', '#FB7185'] : m.durum === 'kritik' ? ['border-amber-300/40', 'bg-amber-400/[0.06]', '#FBBF24'] : ['border-white/[0.09]', 'bg-white/[0.04]', '#38BDF8'];
      var kart = el('article', 'satir relative flex flex-col gap-3 p-4 rounded-[20px] border ' + renk[0] + ' ' + renk[1]);
      kart.style.animationDelay = Math.min(n * 0.03, 0.5) + 's';
      var ust = el('div', 'flex items-start justify-between gap-2');
      var ad = el('div', 'min-w-0');
      ad.appendChild(el('div', 'text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45', m.kategori));
      ad.appendChild(el('div', 'text-[15px] font-semibold text-white truncate', m.ad));
      ust.appendChild(ad);
      var rz = el('div', 'flex flex-wrap justify-end gap-1');
      if (m.durum === 'tukendi') rz.appendChild(rozet('Tükendi', 'bg-rose-500/25 text-rose-100'));
      else if (m.durum === 'kritik') rz.appendChild(rozet('Kritik', 'bg-amber-400/25 text-amber-100'));
      if (m.skt_gun !== null) {
        if (m.skt_gun < 0) rz.appendChild(rozet('SKT geçti', 'bg-rose-500/25 text-rose-100'));
        else if (m.skt_gun <= 30) rz.appendChild(rozet('SKT ' + m.skt_gun + ' gün', 'bg-amber-400/20 text-amber-100'));
      }
      ust.appendChild(rz);
      kart.appendChild(ust);

      var orta = el('div', 'flex items-end justify-between gap-3');
      var mk = el('div', 'flex items-baseline gap-1.5');
      mk.appendChild(el('span', 'font-sora text-[34px] font-medium leading-none tabular-nums text-white', sayi(m.miktar)));
      mk.appendChild(el('span', 'text-sm text-white/60', m.birim));
      orta.appendChild(mk);
      orta.appendChild(el('div', 'text-right text-[11px] text-white/50 leading-tight', 'kritik ' + sayi(m.kritik) + (m.birim_fiyat ? '\n' + tl(m.birim_fiyat) + ' / ' + m.birim : '')));
      orta.lastChild.style.whiteSpace = 'pre-line';
      kart.appendChild(orta);

      var ust_sinir = Math.max(m.kritik * 3, m.miktar, 1);
      var bar = el('div', 'relative h-2 rounded-full bg-white/[0.08] overflow-hidden');
      var dolu = el('div', 'yontem-serit h-full rounded-full');
      dolu.style.width = Math.min(100, m.miktar / ust_sinir * 100) + '%';
      dolu.style.background = 'linear-gradient(90deg, ' + renk[2] + ', ' + renk[2] + 'AA)';
      bar.appendChild(dolu);
      if (m.kritik > 0) {
        var cizgi = el('div', 'absolute top-0 bottom-0 w-[2px] bg-white/70');
        cizgi.style.left = Math.min(100, m.kritik / ust_sinir * 100) + '%';
        cizgi.title = 'Kritik seviye';
        bar.appendChild(cizgi);
      }
      kart.appendChild(bar);
      if (m.son_kullanma || m.notlar) {
        kart.appendChild(el('div', 'text-[12px] text-white/55 truncate',
          [m.son_kullanma ? 'SKT ' + m.son_kullanma.split('-').reverse().join('.') : '', m.notlar].filter(Boolean).join(' · ')));
      }
      var aks = el('div', 'flex flex-wrap gap-1.5 pt-0.5');
      [['giris', '+ Giriş', 'text-[#082F49] bg-sky-200 hover:bg-sky-100'], ['cikis', '− Çıkış', 'text-white border border-white/15 hover:bg-white/10'],
       ['sayim', 'Sayım', 'text-white border border-white/15 hover:bg-white/10']].forEach(function (a) {
        var b = el('button', 'h-9 px-3 rounded-[10px] text-xs font-bold transition-colors ' + a[2], a[1]);
        b.type = 'button';
        b.disabled = a[0] === 'cikis' && m.miktar <= 0;
        b.addEventListener('click', function () { hareketAc(m, a[0]); });
        aks.appendChild(b);
      });
      var dz = el('button', 'ml-auto h-9 w-9 rounded-[10px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10');
      dz.type = 'button'; dz.title = 'Düzenle'; dz.setAttribute('aria-label', m.ad + ' düzenle');
      dz.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      dz.addEventListener('click', function () { malzemeAc(m); });
      aks.appendChild(dz);
      kart.appendChild(aks);
      kap.appendChild(kart);
    });
  }
  $('malzemeAra').addEventListener('input', malzemeleriCiz);
  $('yalnizUyari').addEventListener('change', malzemeleriCiz);

  // ---------- Malzeme penceresi ----------
  var duzenlenen = null;
  function malzemeAc(m) {
    duzenlenen = m || null;
    $('malzemeBaslik').textContent = m ? m.ad : 'Yeni malzeme';
    $('mz_ad').value = m ? m.ad : '';
    $('mz_kategori').value = m ? m.kategori : '';
    $('mz_birim').value = m ? m.birim : 'adet';
    $('mz_miktar').value = '';
    $('mz_miktar_kutu').classList.toggle('hidden', !!m);
    $('mz_kritik').value = m ? m.kritik : '';
    $('mz_skt').value = m && m.son_kullanma ? m.son_kullanma : '';
    $('mz_fiyat').value = m && m.birim_fiyat ? (m.birim_fiyat / 100).toLocaleString('tr-TR') : '';
    $('mz_not').value = m ? m.notlar : '';
    $('mz_sil').classList.toggle('hidden', !(m && DOKTOR));
    Klinik.modalAcId('malzemeModal', 'mz_ad');
  }
  document.querySelectorAll('[data-malzeme-yeni]').forEach(function (b) { b.addEventListener('click', function () { malzemeAc(null); }); });

  $('malzemeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var veri = { ad: $('mz_ad').value, kategori: $('mz_kategori').value, birim: $('mz_birim').value, kritik: $('mz_kritik').value || 0,
                 son_kullanma: $('mz_skt').value || null, birim_fiyat: $('mz_fiyat').value || null, notlar: $('mz_not').value };
    if (!duzenlenen) veri.miktar = $('mz_miktar').value || 0;
    var b = this.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      var s = duzenlenen ? await Klinik.jsonGonder('/api/malzeme/' + duzenlenen.id, veri, 'PUT') : await Klinik.jsonGonder('/api/malzeme', veri);
      if (duzenlenen) Object.assign(duzenlenen, s.malzeme); else MALZEMELER.push(s.malzeme);
      Klinik.bildir(s.mesaj);
      Klinik.modalKapatId('malzemeModal');
      kategorileriCiz(); malzemeleriCiz(); eslemeleriCiz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });
  $('mz_sil').addEventListener('click', async function () {
    if (!duzenlenen) return;
    var m = duzenlenen;
    if (!(await Klinik.onayla(m.ad + ' stok kartı kaldırılacak. Geçmiş hareketler raporlarda kalır.', 'Kaldır'))) return;
    try {
      var s = await Klinik.jsonGonder('/api/malzeme/' + m.id, null, 'DELETE');
      MALZEMELER = MALZEMELER.filter(function (x) { return x.id !== m.id; });
      Object.keys(ESLEMELER).forEach(function (k) { ESLEMELER[k] = ESLEMELER[k].filter(function (e) { return e.malzeme_id !== m.id; }); });
      Klinik.bildir(s.mesaj);
      Klinik.modalKapatId('malzemeModal');
      kategorileriCiz(); malzemeleriCiz(); eslemeleriCiz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });

  // ---------- Hareket penceresi ----------
  var hr = { m: null, tur: 'giris' };
  function hrTurSec(tur) {
    hr.tur = tur;
    document.querySelectorAll('.hr-tur').forEach(function (b) {
      var aktif = b.dataset.hrTur === tur;
      b.setAttribute('aria-selected', aktif ? 'true' : 'false');
      b.className = 'hr-tur h-10 rounded-[12px] text-[13px] font-semibold transition-colors ' + (aktif ? 'bg-white text-[#0A1A2E]' : 'text-sky-50 hover:bg-white/10');
    });
    $('hrBaslik').textContent = { giris: 'Stok girişi', cikis: 'Stok çıkışı', sayim: 'Sayım' }[tur];
    $('hrMiktarEtiket').textContent = tur === 'sayim' ? 'Sayılan (raftaki) miktar' : 'Miktar';
    $('hrSktKutu').classList.toggle('hidden', tur !== 'giris');
    $('hr_aciklama').placeholder = { giris: 'Ör. Tedarikçi faturası 2026/118', cikis: 'Ör. Kırıldı / iade / bağış', sayim: 'Ör. Ay sonu sayımı' }[tur];
    var hizli = $('hrHizli');
    hizli.innerHTML = '';
    (tur === 'sayim' ? [] : [1, 5, 10, 50, 100]).forEach(function (n) {
      var c = el('button', 'h-8 px-3 rounded-full text-[12px] font-semibold text-sky-50 bg-white/5 border border-white/15 hover:bg-white/10', (tur === 'giris' ? '+' : '−') + n);
      c.type = 'button';
      c.addEventListener('click', function () { $('hr_miktar').value = n; sonucGoster(); });
      hizli.appendChild(c);
    });
    if (tur === 'sayim') $('hr_miktar').value = hr.m.miktar;
    sonucGoster();
  }
  function sonucGoster() {
    var m = hr.m, v = parseFloat(String($('hr_miktar').value).replace(',', '.'));
    if (!m || isNaN(v)) { $('hrSonuc').textContent = ''; return; }
    var yeni = hr.tur === 'giris' ? m.miktar + v : hr.tur === 'cikis' ? m.miktar - v : v;
    var uyari = yeni < 0 ? ' · stokta bu kadar yok' : yeni <= m.kritik ? ' · kritik seviyede kalacak' : '';
    $('hrSonuc').textContent = 'İşlem sonrası: ' + sayi(Math.max(0, yeni)) + ' ' + m.birim + uyari;
    $('hrSonuc').className = 'text-[13px] ' + (uyari ? 'text-amber-200' : 'text-sky-50/80');
  }
  function hareketAc(m, tur) {
    hr.m = m;
    $('hrMalzeme').textContent = m.kategori + ' · ' + m.ad;
    $('hrMevcut').textContent = 'Mevcut stok: ' + sayi(m.miktar) + ' ' + m.birim + (m.kritik ? ' · kritik seviye ' + sayi(m.kritik) : '');
    $('hrBirim').textContent = m.birim;
    $('hr_miktar').value = '';
    $('hr_aciklama').value = '';
    $('hr_skt').value = '';
    hrTurSec(tur);
    Klinik.modalAcId('hareketModal', 'hr_miktar');
  }
  document.querySelectorAll('.hr-tur').forEach(function (b) { b.addEventListener('click', function () { hrTurSec(b.dataset.hrTur); }); });
  $('hr_miktar').addEventListener('input', sonucGoster);
  $('hareketForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = this.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      var s = await Klinik.jsonGonder('/api/malzeme/' + hr.m.id + '/hareket', {
        tur: hr.tur, miktar: $('hr_miktar').value, aciklama: $('hr_aciklama').value, son_kullanma: $('hr_skt').value || null });
      Object.assign(hr.m, s.malzeme);
      HAREKETLER.unshift(s.hareket);
      Klinik.bildir(s.mesaj, s.malzeme.durum !== 'normal' ? 'hata' : undefined);
      Klinik.modalKapatId('hareketModal');
      malzemeleriCiz(); hareketleriCiz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });

  // ---------- Hareketler ----------
  var hfiltre = 'hepsi';
  var TUR_RENK = { giris: 'bg-teal-400/20 text-teal-100', cikis: 'bg-rose-500/20 text-rose-100', otomatik: 'bg-violet-400/20 text-violet-100', sayim: 'bg-amber-400/20 text-amber-100' };
  function hareketleriCiz() {
    document.querySelectorAll('.hfiltre').forEach(function (b) {
      var aktif = b.dataset.hfiltre === hfiltre;
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      b.className = 'hfiltre h-9 px-3 rounded-full text-xs font-semibold border transition-all ' + (aktif ? 'text-[#0A1A2E] bg-white border-white' : 'text-white/85 bg-white/5 border-white/15 hover:bg-white/10');
    });
    var q = $('hareketAra').value.trim().toLocaleLowerCase('tr');
    var liste = HAREKETLER.filter(function (h) {
      return (hfiltre === 'hepsi' || h.tur === hfiltre) && (!q || (h.malzeme + ' ' + h.hasta + ' ' + h.aciklama).toLocaleLowerCase('tr').indexOf(q) !== -1);
    }).slice(0, 150);
    var kap = $('hareketListe');
    kap.innerHTML = '';
    if (!liste.length) { kap.appendChild(el('div', 'py-10 text-center rounded-2xl border border-dashed border-white/15 text-sm text-white/60', 'Hareket yok.')); return; }
    liste.forEach(function (h) {
      var satir = el('div', 'flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 rounded-xl bg-white/[0.035] border border-white/[0.06]');
      satir.appendChild(el('div', 'w-[118px] text-[12px] text-white/55 tabular-nums', h.tarih_metin));
      var orta = el('div', 'flex-[1_1_200px] min-w-0');
      orta.appendChild(el('div', 'text-sm font-semibold text-white truncate', h.malzeme));
      orta.appendChild(el('div', 'text-[12px] text-white/55 truncate', [h.aciklama, h.kullanici].filter(Boolean).join(' · ')));
      satir.appendChild(orta);
      satir.appendChild(el('span', 'inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold ' + (TUR_RENK[h.tur] || 'bg-white/10'), h.tur_adi));
      satir.appendChild(el('div', 'w-24 text-right font-sora text-[15px] font-medium tabular-nums ' + (h.miktar >= 0 ? 'text-teal-200' : 'text-rose-200'),
        (h.miktar > 0 ? '+' : '') + sayi(h.miktar) + ' ' + h.birim));
      if (h.onceki || h.sonraki) satir.appendChild(el('div', 'w-24 text-right text-[12px] text-white/45 tabular-nums', sayi(h.onceki) + ' → ' + sayi(h.sonraki)));
      kap.appendChild(satir);
    });
  }
  document.querySelectorAll('.hfiltre').forEach(function (b) { b.addEventListener('click', function () { hfiltre = b.dataset.hfiltre; hareketleriCiz(); }); });
  $('hareketAra').addEventListener('input', hareketleriCiz);

  // ---------- Hizmet malzemeleri ----------
  function eslemeleriCiz() {
    var kap = $('eslemeListe');
    kap.innerHTML = '';
    ISLEMLER.forEach(function (islem) {
      var liste = ESLEMELER[islem] || [];
      var kart = el('div', 'flex flex-col gap-3 p-4 rounded-[20px] bg-white/[0.04] border border-white/[0.08]');
      var ust = el('div', 'flex items-center justify-between gap-2');
      ust.appendChild(el('div', 'text-[15px] font-semibold text-white', islem));
      ust.appendChild(el('span', 'text-[11px] text-white/45', liste.length ? liste.length + ' kalem' : 'malzeme yok'));
      kart.appendChild(ust);
      var ul = el('div', 'flex flex-col gap-1.5');
      liste.forEach(function (e) {
        var s = el('div', 'flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05]');
        s.appendChild(el('span', 'flex-1 min-w-0 text-[13px] text-white truncate', e.malzeme));
        s.appendChild(el('span', 'text-[12px] font-semibold text-sky-200 tabular-nums', sayi(e.miktar) + ' ' + e.birim));
        var x = el('button', 'w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-rose-200 hover:bg-rose-500/15', '×');
        x.type = 'button'; x.setAttribute('aria-label', e.malzeme + ' hizmetten çıkar');
        x.addEventListener('click', async function () {
          try {
            await Klinik.jsonGonder('/api/islem_malzemesi/' + e.id, null, 'DELETE');
            ESLEMELER[islem] = liste.filter(function (y) { return y.id !== e.id; });
            eslemeleriCiz();
          } catch (h) { Klinik.bildir(h.message, 'hata'); }
        });
        s.appendChild(x);
        ul.appendChild(s);
      });
      kart.appendChild(ul);
      var form = el('form', 'flex gap-1.5');
      var sec = el('select', 'alan !h-10 !text-[13px] flex-1 min-w-0');
      sec.appendChild(el('option', '', 'Malzeme ekle…')).value = '';
      MALZEMELER.slice().sort(function (a, b) { return a.ad.localeCompare(b.ad, 'tr'); }).forEach(function (m) {
        if (liste.some(function (e) { return e.malzeme_id === m.id; })) return;
        var o = el('option', '', m.ad + ' (' + m.birim + ')'); o.value = m.id; sec.appendChild(o);
      });
      sec.setAttribute('aria-label', islem + ' için malzeme');
      var mk = el('input', 'alan !h-10 !w-[72px] !text-[13px] tabular-nums');
      mk.type = 'number'; mk.min = '0'; mk.step = 'any'; mk.value = '1'; mk.setAttribute('aria-label', 'Miktar');
      var ek = el('button', 'h-10 px-3 rounded-xl text-[13px] font-bold text-[#082F49] bg-sky-200 hover:bg-sky-100', 'Ekle');
      ek.type = 'submit';
      form.appendChild(sec); form.appendChild(mk); form.appendChild(ek);
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (!sec.value) { Klinik.bildir('Malzeme seçin.', 'hata'); return; }
        try {
          var s = await Klinik.jsonGonder('/api/islem_malzemesi', { islem_turu: islem, malzeme_id: Number(sec.value), miktar: mk.value });
          ESLEMELER[islem] = liste.concat([s.esleme]);
          Klinik.bildir(s.mesaj);
          eslemeleriCiz();
        } catch (h) { Klinik.bildir(h.message, 'hata'); }
      });
      kart.appendChild(form);
      kap.appendChild(kart);
    });
  }

  kategorileriCiz();
  malzemeleriCiz();
  hareketleriCiz();
  eslemeleriCiz();
  sekmeGoster(location.hash.replace('#', ''));
})();
