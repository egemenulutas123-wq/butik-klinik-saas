/*
 * Klinik SaaS — Hasta dosyasındaki hesap kartı (bakiye, hareketler, tahsilat)
 */
(function () {
  'use strict';

  var veri = JSON.parse(document.getElementById('profilVeri').textContent);
  var HASTA = veri.hasta, HESAP = veri.hesap, DOKTOR = veri.doktor;
  if (!HESAP || !document.getElementById('hesapKart')) return;

  var tl = KasaIslem.tl;
  var tumunuGoster = false;
  var TUR_RENK = { tahsilat: 'text-teal-200', ucret: 'text-white', indirim: 'text-sky-200', iade: 'text-amber-200' };
  var TUR_NOKTA = { tahsilat: '#5EEAD4', ucret: '#C4B5FD', indirim: '#7DD3FC', iade: '#FCD34D' };

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }

  function bakiyeCiz() {
    var kap = $('hesapBakiye');
    kap.innerHTML = '';
    var b = HESAP.bakiye;
    var durum = b > 0 ? ['Ödenmemiş bakiye', 'text-amber-200', 'bg-amber-300']
      : b < 0 ? ['Hasta alacaklı (ön ödeme)', 'text-sky-200', 'bg-sky-300']
        : ['Hesap kapalı', 'text-emerald-200', 'bg-emerald-300'];
    var ust = el('div', 'flex items-center gap-2 text-[12px] font-semibold ' + durum[1]);
    ust.appendChild(el('span', 'w-2 h-2 rounded-full ' + durum[2]));
    ust.appendChild(document.createTextNode(durum[0]));
    kap.appendChild(ust);
    var tutar = el('div', 'mt-1 font-sora text-[40px] font-medium leading-none tracking-[-0.03em] tabular-nums ' + (b === 0 ? 'text-white' : durum[1]), tl(Math.abs(b)));
    kap.appendChild(tutar);
    var gecerli = HESAP.hareketler.filter(function (h) { return !h.iptal; });
    var hizmet = gecerli.filter(function (h) { return h.tur === 'ucret'; }).reduce(function (a, h) { return a + h.tutar; }, 0);
    var odenen = gecerli.filter(function (h) { return h.tur === 'tahsilat'; }).reduce(function (a, h) { return a + h.tutar; }, 0);
    if (hizmet || odenen) {
      kap.appendChild(el('div', 'mt-2 text-[12px] text-white/55', 'Toplam hizmet ' + tl(hizmet) + ' · ödenen ' + tl(odenen)));
      if (hizmet > 0) {
        var cubuk = el('div', 'mt-2.5 h-1.5 rounded-full bg-white/[0.08] overflow-hidden');
        var dolu = el('div', 'yontem-serit h-full rounded-full');
        dolu.style.width = Math.min(100, odenen / hizmet * 100) + '%';
        dolu.style.background = 'linear-gradient(90deg, #2DD4BF, #FDE68A)';
        cubuk.appendChild(dolu);
        kap.appendChild(cubuk);
      }
    }
  }

  function listeCiz() {
    var kap = $('hesapListe');
    kap.innerHTML = '';
    var liste = HESAP.hareketler;
    if (!liste.length) {
      kap.appendChild(el('div', 'py-5 text-center rounded-2xl border border-dashed border-white/15 text-[13px] text-white/55', 'Henüz hesap hareketi yok. Tamamlanan randevuların ücreti otomatik eklenir.'));
      $('hesapTumu').classList.add('hidden');
      return;
    }
    var gosterilen = tumunuGoster ? liste : liste.slice(0, 5);
    gosterilen.forEach(function (h, n) {
      var satir = el('div', 'satir group flex items-center gap-3 px-3 py-2.5 rounded-xl ' + (h.iptal ? 'opacity-50' : 'bg-white/[0.03]'));
      satir.style.animationDelay = (n * 0.04) + 's';
      var nokta = el('span', 'w-2 h-2 shrink-0 rounded-full');
      nokta.style.background = TUR_NOKTA[h.tur] || '#fff';
      satir.appendChild(nokta);
      var orta = el('div', 'flex-1 min-w-0');
      orta.appendChild(el('div', 'text-[13px] font-semibold text-white truncate' + (h.iptal ? ' line-through' : ''), h.tur_adi + (h.yontem ? ' · ' + h.yontem : '')));
      orta.appendChild(el('div', 'text-[11px] text-white/50 truncate', h.tarih_metin.slice(0, 10) + ' · ' + (h.iptal ? 'İptal: ' + h.iptal_nedeni : h.aciklama)));
      satir.appendChild(orta);
      var isaret = h.tur === 'tahsilat' || h.tur === 'indirim' ? '−' : '+';
      satir.appendChild(el('span', 'text-[13px] font-semibold tabular-nums whitespace-nowrap ' + (h.iptal ? 'line-through text-white/40' : TUR_RENK[h.tur]), isaret + h.tutar_metin));
      var aks = el('div', 'flex gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity');
      if (h.tur === 'tahsilat' || h.tur === 'iade') {
        var mk = el('a', 'w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white');
        mk.href = '/kasa/belge/' + h.id; mk.target = '_blank'; mk.rel = 'noopener'; mk.title = 'Makbuz'; mk.setAttribute('aria-label', 'Makbuz');
        mk.innerHTML = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7L16 1l-3 2-3-2-3 2-3-1z"/><path d="M8 8h8M8 12h8"/></svg>';
        aks.appendChild(mk);
      }
      if (!h.iptal && (DOKTOR || (h.kullanici_id === HESAP.kullanici_id && h.bugun))) {
        var ip = el('button', 'w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-rose-200 hover:bg-rose-500/15');
        ip.type = 'button'; ip.title = 'İptal et'; ip.setAttribute('aria-label', 'Kaydı iptal et');
        ip.innerHTML = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>';
        ip.addEventListener('click', function () {
          h.hasta_ad = HASTA.ad_soyad;
          KasaIslem.iptal(h, function (s) {
            Object.assign(h, s.hareket);
            HESAP.bakiye = s.bakiye;
            ciz();
          });
        });
        aks.appendChild(ip);
      }
      satir.appendChild(aks);
      kap.appendChild(satir);
    });
    var tumu = $('hesapTumu');
    tumu.classList.toggle('hidden', liste.length <= 5);
    tumu.textContent = tumunuGoster ? 'Daha az göster' : 'Tüm hareketler (' + liste.length + ')';
  }

  function ciz() { bakiyeCiz(); listeCiz(); }

  function islemAc(tur) {
    KasaIslem.ac({
      hasta: { id: HASTA.id, ad: HASTA.ad_soyad }, bakiye: HESAP.bakiye, tur: tur, tarifeler: HESAP.tarifeler,
      ucretlenebilir: HESAP.ucretlenebilir, doktor: DOKTOR,
      onKaydet: function (s) {
        HESAP.hareketler.unshift(s.hareket);
        HESAP.bakiye = s.bakiye;
        if (s.hareket.randevu_id) HESAP.ucretlenebilir = HESAP.ucretlenebilir.filter(function (r) { return r.id !== s.hareket.randevu_id; });
        ciz();
        var kart = $('hesapKart');
        kart.animate([{ boxShadow: '0 0 0 0 rgba(250,204,21,0.55)' }, { boxShadow: '0 0 0 14px rgba(250,204,21,0)' }], { duration: 900 });
      }
    });
  }

  document.querySelectorAll('[data-hesap-islem]').forEach(function (b) { b.addEventListener('click', function () { islemAc(b.dataset.hesapIslem); }); });
  $('hesapTumu').addEventListener('click', function () { tumunuGoster = !tumunuGoster; listeCiz(); });
  ciz();

  if (HESAP.ac) {
    setTimeout(function () {
      islemAc('tahsilat');
      history.replaceState(null, '', location.pathname);
    }, 350);
  }
})();
