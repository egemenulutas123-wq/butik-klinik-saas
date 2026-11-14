/*
 * Klinik SaaS — Ctrl+K komut paleti
 * Hasta, randevu ve malzeme araması + sık kullanılan işlemler. Klavyeyle (↑ ↓ Enter Esc) veya dokunarak kullanılır.
 */
(function () {
  'use strict';

  var kok = document.getElementById('komutPaleti');
  if (!kok) return;
  var DOKTOR = kok.dataset.doktor === '1';
  var girdi = document.getElementById('komutGirdi'), liste = document.getElementById('komutListe');
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  function sade(m) {
    return (m || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
      .replace(/[çğıöşüâîû]/g, function (c) { return { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' }[c]; });
  }
  function git(url, yeniSekme) { if (yeniSekme) window.open(url, '_blank', 'noopener'); else window.location.href = url; }
  function tikla(sec) { var b = document.querySelector(sec); if (b) b.click(); }

  var IK = {
    arti: '<path d="M12 5v14M5 12h14"/>',
    takvim: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    para: '<path d="M6 3h12M6 8h12M14 21 6 13h3a5 5 0 0 0 0-10"/>',
    kutu: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    grafik: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    ekran: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    zil: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    kure: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    belge: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    ekip: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.6"/>',
    kalkan: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    kilit: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    anahtar: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    telefon: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    cikis: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    ev: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    kisi: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  };

  var KOMUTLAR = [
    { ad: 'Yeni hasta kaydı', ek: 'ekle kayıt oluştur', ik: 'arti', fn: function () { tikla('#komutHastaAc'); } },
    { ad: 'Yeni randevu', ek: 'randevu oluştur ver', ik: 'takvim', fn: function () { git('/randevular#yeni'); } },
    { ad: 'Tahsilat al', ek: 'ödeme para kasa', ik: 'para', fn: function () { git('/kasa#tahsilat'); } },
    { ad: 'Bekleme salonu ekranı', ek: 'tv sıra çağır salon', ik: 'ekran', fn: function () { git('/#siraBolum'); } },
    { ad: 'Hatırlatmalar', ek: 'whatsapp yarın mesaj', ik: 'zil', fn: function () { git('/randevular#hatirlatma'); } },
    { ad: 'Online randevu talepleri', ek: 'talep onay', ik: 'kure', fn: function () { git('/randevular#onlineBolum'); } },
    { ad: 'Stok', ek: 'malzeme depo giriş', ik: 'kutu', fn: function () { git('/stok'); } },
    { ad: 'Gün sonu raporu', ek: 'kasa günlük yazdır', ik: 'belge', fn: function () { git('/kasa/gun-sonu', true); } },
    { ad: 'Panel', ek: 'ana sayfa', ik: 'ev', fn: function () { git('/'); } },
    { ad: 'Hastalar', ek: 'liste', ik: 'kisi', fn: function () { git('/hastalar'); } },
    { ad: 'Randevular', ek: 'takvim', ik: 'takvim', fn: function () { git('/randevular'); } },
    { ad: 'Kasa', ek: 'tahsilat alacak', ik: 'para', fn: function () { git('/kasa'); } },
    { ad: 'Raporlar', ek: 'gelir tanı istatistik', ik: 'grafik', fn: function () { git('/raporlar'); }, doktor: true },
    { ad: 'Ekip ve hekim planları', ek: 'kullanıcı mesai izin çalışma', ik: 'ekip', fn: function () { git('/ekip'); }, doktor: true },
    { ad: 'Güvenlik ve yedek', ek: 'kvkk günlük yedekleme', ik: 'kalkan', fn: function () { git('/guvenlik'); }, doktor: true },
    { ad: 'Telefondan aç', ek: 'qr mobil tablet wifi', ik: 'telefon', fn: function () { telefonAc(); } },
    { ad: 'Şifremi değiştir', ek: 'parola', ik: 'anahtar', fn: function () { tikla('[data-sifre-modal-ac]'); } },
    { ad: 'Ekranı kilitle', ek: 'kilit', ik: 'kilit', fn: function () { if (Klinik.kilitle) Klinik.kilitle(); } },
    { ad: 'Çıkış yap', ek: 'oturum kapat', ik: 'cikis', fn: function () { git('/cikis'); } }
  ].filter(function (k) { return !k.doktor || DOKTOR; });

  var ogeler = [], secili = 0, istekNo = 0, zamanlayici = null, sonuc = null;

  function ikon(ad, renk) {
    var s = el('span', 'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ' + (renk || 'bg-white/[0.07] text-violet-100'));
    s.innerHTML = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IK[ad] || IK.belge) + '</svg>';
    return s;
  }

  function sonHastalar() {
    try { return JSON.parse(localStorage.getItem('klinik_son_hastalar') || '[]'); } catch (x) { return []; }
  }
  function hastaHatirla(h) {
    try {
      var l = sonHastalar().filter(function (x) { return x.id !== h.id; });
      l.unshift({ id: h.id, ad_soyad: h.ad_soyad, bas_harfler: h.bas_harfler });
      localStorage.setItem('klinik_son_hastalar', JSON.stringify(l.slice(0, 5)));
    } catch (x) {}
  }
  // Hasta dosyası açıldığında "son açılanlar"a ekle
  var profil = document.getElementById('profilVeri');
  if (profil) { try { var hp = JSON.parse(profil.textContent).hasta; hastaHatirla({ id: hp.id, ad_soyad: hp.ad_soyad, bas_harfler: (hp.ad_soyad || '').split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase() }); } catch (x) {} }

  function ciz() {
    var q = sade(girdi.value.trim());
    liste.innerHTML = '';
    ogeler = [];

    function baslik(m) { liste.appendChild(el('div', 'px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-400', m)); }
    function satir(o) {
      var i = ogeler.length;
      var b = el('button', 'komut-oge w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors');
      b.type = 'button';
      b.id = 'komut-' + i;
      b.setAttribute('role', 'option');
      b.appendChild(o.ikon);
      var m = el('span', 'flex-1 min-w-0');
      m.appendChild(el('span', 'block text-sm font-semibold text-white truncate', o.ad));
      if (o.alt) m.appendChild(el('span', 'block text-[12px] text-violet-300 truncate', o.alt));
      b.appendChild(m);
      if (o.yan) b.appendChild(o.yan);
      b.addEventListener('mousemove', function () { if (secili !== i) { secili = i; boya(); } });
      b.addEventListener('click', function (e) { calistir(i, e.altKey); });
      liste.appendChild(b);
      ogeler.push(o);
    }

    if (sonuc && q.length >= 2) {
      if (sonuc.hastalar.length) {
        baslik('Hastalar');
        sonuc.hastalar.forEach(function (h) {
          var yan = el('span', 'hidden sm:flex items-center gap-1');
          var rv = el('span', 'komut-ikincil inline-flex items-center h-7 px-2 rounded-lg text-[11px] font-semibold text-teal-100 bg-teal-400/10 border border-teal-300/20', 'Randevu ver');
          rv.addEventListener('click', function (e) { e.stopPropagation(); hastaHatirla(h); git('/randevular?hasta_id=' + h.id + '#yeni'); });
          yan.appendChild(rv);
          if (h.alerji) yan.insertBefore(el('span', 'inline-flex items-center h-6 px-1.5 rounded-md text-[10px] font-bold text-rose-100 bg-rose-500/25', 'Alerji'), rv);
          satir({ ad: h.ad_soyad, alt: h.alt, ikon: el('span', 'w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold text-white bg-violet-400/25', h.bas_harfler), yan: yan,
                  fn: function (alt) { hastaHatirla(h); git(alt ? '/randevular?hasta_id=' + h.id + '#yeni' : '/hasta/' + h.id); } });
        });
      }
      if (sonuc.randevular.length) {
        baslik('Randevular');
        sonuc.randevular.forEach(function (r) {
          satir({ ad: r.hasta_ad, alt: r.metin + (r.hekim ? ' · ' + r.hekim : '') + ' · ' + r.durum, ikon: ikon('takvim', 'bg-teal-400/15 text-teal-100'),
                  fn: function () { git('/randevular?tarih=' + r.tarih); } });
        });
      }
      if (sonuc.malzemeler.length) {
        baslik('Stok');
        sonuc.malzemeler.forEach(function (m) {
          satir({ ad: m.ad, alt: Number(m.miktar).toLocaleString('tr-TR') + ' ' + m.birim + (m.durum !== 'normal' ? ' · ' + (m.durum === 'tukendi' ? 'Tükendi' : 'Kritik') : ''),
                  ikon: ikon('kutu', m.durum === 'normal' ? 'bg-sky-400/15 text-sky-100' : 'bg-rose-500/20 text-rose-100'), fn: function () { git('/stok'); } });
        });
      }
    }

    var komutlar = KOMUTLAR.filter(function (k) { return !q || sade(k.ad + ' ' + k.ek).indexOf(q) !== -1; });
    if (!q) {
      var son = sonHastalar();
      if (son.length) {
        baslik('Son açılan hastalar');
        son.forEach(function (h) {
          satir({ ad: h.ad_soyad, alt: 'Hasta dosyası', ikon: el('span', 'w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold text-white bg-violet-400/25', h.bas_harfler || '•'),
                  fn: function (alt) { git(alt ? '/randevular?hasta_id=' + h.id + '#yeni' : '/hasta/' + h.id); } });
        });
      }
    }
    if (komutlar.length) {
      baslik(q ? 'İşlemler' : 'Hızlı işlemler');
      komutlar.slice(0, q ? 8 : 12).forEach(function (k) { satir({ ad: k.ad, ikon: ikon(k.ik), fn: k.fn }); });
    }
    if (!ogeler.length) {
      var bos = el('div', 'px-4 py-10 text-center');
      bos.appendChild(el('div', 'text-sm font-semibold text-white', q.length < 2 ? 'Aramak için en az 2 harf yazın' : '“' + girdi.value.trim() + '” için sonuç yok'));
      bos.appendChild(el('div', 'mt-1 text-[12px] text-violet-300', 'Hasta adı, TC, telefon, malzeme veya işlem adı yazabilirsiniz.'));
      liste.appendChild(bos);
    }
    secili = Math.min(secili, Math.max(0, ogeler.length - 1));
    boya();
  }

  function boya() {
    liste.querySelectorAll('.komut-oge').forEach(function (b, i) {
      var a = i === secili;
      b.classList.toggle('bg-white/[0.1]', a);
      b.setAttribute('aria-selected', a ? 'true' : 'false');
      if (a) { girdi.setAttribute('aria-activedescendant', b.id); b.scrollIntoView({ block: 'nearest' }); }
    });
  }

  function calistir(i, alt) {
    var o = ogeler[i];
    if (!o) return;
    kapat();
    setTimeout(function () { o.fn(alt); }, 30);
  }

  async function ara() {
    var q = girdi.value.trim(), no = ++istekNo;
    if (q.length < 2) { sonuc = null; ciz(); return; }
    try {
      var y = await fetch('/api/ara?q=' + encodeURIComponent(q));
      if (!y.ok) return;
      var v = await y.json();
      if (no !== istekNo) return;
      sonuc = v; secili = 0; ciz();
    } catch (x) { /* ağ hatası: yalnızca komutlar gösterilir */ }
  }

  var oncekiOdak = null;
  function ac() {
    if (!kok.classList.contains('kapali')) return;
    if (document.getElementById('kilitEkrani') && !document.getElementById('kilitEkrani').classList.contains('kapali')) return;
    oncekiOdak = document.activeElement;
    kok.classList.remove('kapali');
    kok.setAttribute('aria-hidden', 'false');
    girdi.value = ''; sonuc = null; secili = 0;
    ciz();
    setTimeout(function () { girdi.focus(); }, 20);
  }
  function kapat() {
    kok.classList.add('kapali');
    kok.setAttribute('aria-hidden', 'true');
    if (oncekiOdak && oncekiOdak.focus) oncekiOdak.focus();
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (kok.classList.contains('kapali')) ac(); else kapat();
    }
  });
  girdi.addEventListener('input', function () {
    secili = 0; ciz();
    clearTimeout(zamanlayici);
    zamanlayici = setTimeout(ara, 160);
  });
  girdi.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); secili = (secili + 1) % Math.max(1, ogeler.length); boya(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); secili = (secili - 1 + ogeler.length) % Math.max(1, ogeler.length); boya(); }
    else if (e.key === 'Enter') { e.preventDefault(); calistir(secili, e.altKey); }
    else if (e.key === 'Escape') { e.preventDefault(); kapat(); }
  });
  kok.addEventListener('mousedown', function (e) { if (e.target === kok) kapat(); });
  document.querySelectorAll('[data-komut-ac]').forEach(function (b) { b.addEventListener('click', ac); });
  document.querySelectorAll('[data-kisayol]').forEach(function (s) { s.textContent = MAC ? '⌘K' : 'Ctrl K'; });

  // ---------- Telefondan aç ----------
  var qrYuklendi = null;
  function qrKutuphane() {
    if (window.qrcode) return Promise.resolve();
    if (qrYuklendi) return qrYuklendi;
    qrYuklendi = new Promise(function (coz, red) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
      s.onload = coz; s.onerror = red;
      document.head.appendChild(s);
    });
    return qrYuklendi;
  }
  async function telefonAc() {
    var kutu = document.getElementById('telefonQr'), adresAlan = document.getElementById('telefonAdres');
    kutu.innerHTML = '<div class="text-[13px] text-violet-300">Hazırlanıyor…</div>';
    adresAlan.textContent = '';
    Klinik.modalAcId('telefonModal', 'telefonKopyala');
    try {
      var y = await fetch('/api/telefon_adresi');
      var v = await y.json();
      adresAlan.textContent = v.adres;
      document.getElementById('telefonUyari').classList.toggle('hidden', v.dis_erisim !== false);
      document.getElementById('telefonKopyala').onclick = async function () {
        try { await navigator.clipboard.writeText(v.adres); Klinik.bildir('Adres kopyalandı.'); } catch (x) { window.prompt('Adres:', v.adres); }
      };
      try {
        await qrKutuphane();
        var qr = window.qrcode(0, 'M');
        qr.addData(v.adres); qr.make();
        kutu.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
        var sv = kutu.querySelector('svg');
        if (sv) { sv.setAttribute('width', '220'); sv.setAttribute('height', '220'); sv.setAttribute('role', 'img'); sv.setAttribute('aria-label', 'Telefondan açmak için QR kod'); }
      } catch (x) {
        kutu.innerHTML = '<div class="px-4 text-center text-[13px] text-violet-300">QR kod oluşturulamadı (internet yok). Adresi telefon tarayıcısına yazın.</div>';
      }
    } catch (x) { kutu.innerHTML = '<div class="text-[13px] text-rose-200">Adres alınamadı.</div>'; }
  }
  document.querySelectorAll('[data-telefon-ac]').forEach(function (b) { b.addEventListener('click', telefonAc); });
  window.Klinik = window.Klinik || {};
  window.Klinik.komutAc = ac;
})();
