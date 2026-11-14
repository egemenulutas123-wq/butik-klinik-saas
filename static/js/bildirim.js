/*
 * Klinik SaaS — Bildirim merkezi (üst bardaki zil)
 * Dakikada bir yenilenir; panel açılınca görülen bildirimler okunmuş sayılır.
 */
(function () {
  'use strict';
  var dugme = document.getElementById('bildirimDugme');
  if (!dugme) return;
  var panel = document.getElementById('bildirimPanel'), liste = document.getElementById('bildirimListe');
  var sayac = document.getElementById('bildirimSayi'), ikon = document.getElementById('bildirimIkon');
  var veriler = [], sonGuncelleme = null, oncekiYeni = 0;

  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  function gorulenler() { try { return JSON.parse(localStorage.getItem('klinik_bildirim_goruldu') || '[]'); } catch (x) { return []; } }
  function kaydet(l) { try { localStorage.setItem('klinik_bildirim_goruldu', JSON.stringify(l.slice(-80))); } catch (x) {} }

  var IK = {
    anahtar: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    kure: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    saat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ekran: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    zil: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    yenile: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
    kutu: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    takvim: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    para: '<path d="M6 3h12M6 8h12M14 21 6 13h3a5 5 0 0 0 0-10"/>',
    tup: '<path d="M9 3h6M10 3v7l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7 15h10"/>'
  };
  var RENK = {
    acil: 'bg-rose-500/20 text-rose-100', uyari: 'bg-amber-400/15 text-amber-100', bilgi: 'bg-sky-400/15 text-sky-100'
  };

  function ciz() {
    var gor = gorulenler();
    liste.innerHTML = '';
    if (!veriler.length) {
      var bos = el('div', 'px-4 py-10 text-center');
      bos.innerHTML = '<div class="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center bg-teal-400/15 text-teal-200"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>';
      bos.appendChild(el('div', 'text-sm font-semibold text-white', 'Her şey yolunda'));
      bos.appendChild(el('div', 'mt-1 text-[12px] text-violet-300', 'Bekleyen talep, hatırlatma veya uyarı yok.'));
      liste.appendChild(bos);
    }
    veriler.forEach(function (b) {
      var yeni = gor.indexOf(b.anahtar) === -1;
      var a = el('a', 'flex items-start gap-3 px-3 py-3 rounded-2xl hover:bg-white/[0.07] transition-colors');
      a.href = b.url;
      var i = el('span', 'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ' + RENK[b.seviye]);
      i.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + (IK[b.ikon] || IK.zil) + '</svg>';
      a.appendChild(i);
      var m = el('span', 'flex-1 min-w-0');
      m.appendChild(el('span', 'block text-[13px] font-semibold text-white leading-snug', b.baslik));
      m.appendChild(el('span', 'block mt-0.5 text-[12px] text-violet-300 leading-snug', b.metin));
      a.appendChild(m);
      if (yeni) a.appendChild(el('span', 'mt-1.5 w-2 h-2 shrink-0 rounded-full bg-rose-400'));
      liste.appendChild(a);
    });
    var yeniSayi = veriler.filter(function (b) { return gor.indexOf(b.anahtar) === -1; }).length;
    sayac.textContent = yeniSayi > 9 ? '9+' : String(yeniSayi);
    sayac.classList.toggle('hidden', !yeniSayi);
    dugme.setAttribute('aria-label', yeniSayi ? yeniSayi + ' yeni bildirim' : 'Bildirimler');
    if (yeniSayi > oncekiYeni) { ikon.classList.remove('zil-salla'); void ikon.offsetWidth; ikon.classList.add('zil-salla'); }
    oncekiYeni = yeniSayi;
    document.getElementById('bildirimZaman').textContent = sonGuncelleme ? 'Güncellendi ' + sonGuncelleme : '';
  }

  async function yukle() {
    try {
      var y = await fetch('/api/bildirimler', { headers: { 'Accept': 'application/json' } });
      if (!y.ok) return;
      veriler = (await y.json()).bildirimler || [];
      sonGuncelleme = new Date().toTimeString().slice(0, 5);
      ciz();
    } catch (x) { /* bağlantı yok */ }
  }

  function konumla() {
    var r = dugme.getBoundingClientRect(), st = panel.style;
    if (window.innerWidth < 640) {
      st.position = 'fixed'; st.left = '12px'; st.right = '12px'; st.top = (r.bottom + 8) + 'px'; st.width = 'auto';
    } else {
      st.position = ''; st.top = ''; st.width = '';
      var solda = r.left + r.width / 2 < window.innerWidth / 2;
      st.left = solda ? '0' : 'auto'; st.right = solda ? 'auto' : '0';
    }
  }
  window.addEventListener('resize', function () { if (!panel.classList.contains('hidden')) konumla(); });

  function ac() {
    konumla();
    panel.classList.remove('hidden');
    dugme.setAttribute('aria-expanded', 'true');
    var gor = gorulenler();
    veriler.forEach(function (b) { if (gor.indexOf(b.anahtar) === -1) gor.push(b.anahtar); });
    // Panel açıkken yeni işaretleri göster, sayacı sıfırla
    ciz();
    kaydet(gor);
    sayac.classList.add('hidden');
    oncekiYeni = 0;
  }
  function kapat() { panel.classList.add('hidden'); dugme.setAttribute('aria-expanded', 'false'); }

  dugme.addEventListener('click', function (e) {
    e.stopPropagation();
    if (panel.classList.contains('hidden')) { ac(); yukle(); } else kapat();
  });
  document.addEventListener('click', function (e) { if (!document.getElementById('bildirimKap').contains(e.target)) kapat(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.classList.contains('hidden')) { kapat(); dugme.focus(); } });

  yukle();
  setInterval(function () { if (!document.hidden) yukle(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) yukle(); });
})();
