/*
 * Klinik SaaS — Ortak kasa işlemi penceresi (tahsilat, hizmet ücreti, indirim, iade, iptal)
 * Kullanım: KasaIslem.ac({ hasta: {id, ad}, bakiye, tur, tarifeler, ucretlenebilir, doktor, hastalar, onKaydet })
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }

  function tl(kurus) {
    var k = Math.abs(Math.round(kurus || 0));
    var lira = Math.floor(k / 100), kr = k % 100;
    var metin = String(lira).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (kr ? ',' + String(kr).padStart(2, '0') : '');
    return (kurus < 0 ? '−' : '') + '₺' + metin;
  }

  function kurusCoz(metin) {
    var m = String(metin || '').replace(/[₺\s]/g, '').replace(/TL$/i, '');
    if (!m) return null;
    if (m.indexOf(',') !== -1) m = m.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(m)) m = m.replace(/\./g, '');
    var s = Number(m);
    if (!isFinite(s)) return null;
    return Math.round(s * 100);
  }

  var TURLER = {
    tahsilat: { etki: -1, kaydet: 'Tahsilatı kaydet', bos: 'Alınan tutarı girin' },
    ucret: { etki: 1, kaydet: 'Ücreti ekle', bos: 'Hizmet ücreti' },
    indirim: { etki: -1, kaydet: 'İndirimi uygula', bos: 'İndirim tutarı' },
    iade: { etki: 1, kaydet: 'İadeyi kaydet', bos: 'İade edilen tutar' }
  };

  var d = { hasta: null, bakiye: 0, tur: 'tahsilat', yontem: null, tarifeler: {}, ucretlenebilir: [], doktor: false, onKaydet: null };

  function sonYontem() {
    try { return localStorage.getItem('klinik_kasa_yontem') || 'Nakit'; } catch (e) { return 'Nakit'; }
  }

  function bakiyeKartiCiz() {
    var kart = $('kasaBakiyeKart');
    kart.innerHTML = '';
    if (!d.hasta) {
      kart.className = 'flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.03]';
      kart.appendChild(el('span', 'text-[13px] text-teal-50/70', 'Bakiye için hasta seçin.'));
      return;
    }
    var b = d.bakiye;
    var stil = b > 0 ? ['border-amber-300/35 bg-amber-400/10', 'text-amber-100', 'Açık borç']
      : b < 0 ? ['border-sky-300/35 bg-sky-400/10', 'text-sky-100', 'Hasta alacaklı']
        : ['border-emerald-300/30 bg-emerald-400/10', 'text-emerald-100', 'Hesap kapalı'];
    kart.className = 'flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-colors ' + stil[0];
    var sol = el('div');
    sol.appendChild(el('div', 'text-[12px] font-semibold ' + stil[1], stil[2]));
    sol.appendChild(el('div', 'text-[12px] text-teal-50/60', 'Güncel bakiye'));
    kart.appendChild(sol);
    kart.appendChild(el('div', 'font-sora text-2xl font-medium tabular-nums ' + stil[1], b === 0 ? '₺0' : tl(Math.abs(b))));
  }

  function tutarYaz(kurus, aciklama) {
    $('kasaTutar').value = (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: kurus % 100 ? 2 : 0, maximumFractionDigits: 2 });
    if (aciklama !== undefined) $('kasaAciklama').value = aciklama;
    sonrakiCiz();
    $('kasaTutar').focus();
  }

  function cip(metin, tik, vurgu) {
    var b = el('button', 'h-8 px-3 rounded-full text-[12px] font-semibold border transition-colors ' +
      (vurgu ? 'text-[#422006] bg-amber-200 border-amber-200 hover:bg-amber-100' : 'text-teal-50 bg-white/5 border-white/15 hover:bg-white/10'), metin);
    b.type = 'button';
    b.addEventListener('click', tik);
    return b;
  }

  function hizliCiz() {
    var kap = $('kasaHizli');
    kap.innerHTML = '';
    var b = d.bakiye;
    if (d.tur === 'tahsilat') {
      if (b > 0) {
        kap.appendChild(cip('Borcun tamamı · ' + tl(b), function () { tutarYaz(b); }, true));
        if (b >= 200) kap.appendChild(cip('Yarısı · ' + tl(Math.round(b / 2)), function () { tutarYaz(Math.round(b / 2), 'Kısmi ödeme'); }));
      }
      [10000, 25000, 50000, 100000].forEach(function (k) { kap.appendChild(cip(tl(k), function () { tutarYaz(k); })); });
    } else if (d.tur === 'ucret') {
      Object.keys(d.tarifeler).forEach(function (islem) {
        var u = d.tarifeler[islem];
        if (u > 0) kap.appendChild(cip(islem + ' · ' + tl(u), function () { tutarYaz(u, islem); }));
      });
      if (!kap.children.length) kap.appendChild(el('span', 'text-[12px] text-teal-50/60', 'Kasa sayfasındaki ücret tarifesinden hizmet fiyatlarını belirleyebilirsiniz.'));
    } else if (d.tur === 'indirim') {
      if (b > 0) [10, 20, 50, 100].forEach(function (y) {
        var k = Math.round(b * y / 100);
        kap.appendChild(cip((y === 100 ? 'Borcun tamamı' : '%' + y) + ' · ' + tl(k), function () { tutarYaz(k, y === 100 ? 'Borç silindi' : '%' + y + ' indirim'); }));
      });
    } else if (d.tur === 'iade' && b < 0) {
      kap.appendChild(cip('Alacağın tamamı · ' + tl(-b), function () { tutarYaz(-b, 'Fazla ödeme iadesi'); }, true));
    }
  }

  function sonrakiCiz() {
    var kap = $('kasaSonraki');
    kap.innerHTML = '';
    var k = kurusCoz($('kasaTutar').value);
    if (!d.hasta || !k || k <= 0) return;
    var yeni = d.bakiye + TURLER[d.tur].etki * k;
    kap.appendChild(el('span', '', 'İşlem sonrası'));
    var sag = el('span', 'flex items-center gap-2 font-semibold tabular-nums');
    sag.appendChild(el('span', 'text-teal-50/50 line-through', tl(Math.abs(d.bakiye))));
    sag.appendChild(el('span', 'text-teal-50/50', '→'));
    sag.appendChild(el('span', yeni > 0 ? 'text-amber-200' : yeni < 0 ? 'text-sky-200' : 'text-emerald-200',
      yeni > 0 ? tl(yeni) + ' borç' : yeni < 0 ? tl(-yeni) + ' alacak' : 'Hesap kapanır ✓'));
    kap.appendChild(sag);
  }

  function randevuCiz() {
    var kutu = $('kasaRandevuKutu'), sec = $('kasaRandevu');
    var goster = d.tur === 'ucret' && d.ucretlenebilir.length > 0;
    kutu.classList.toggle('hidden', !goster);
    kutu.classList.toggle('flex', goster);
    sec.innerHTML = '';
    sec.appendChild(el('option', '', 'Randevuya bağlama')).value = '';
    d.ucretlenebilir.forEach(function (r) {
      var o = el('option', '', r.etiket + (r.tutar ? ' · ' + tl(r.tutar) : ''));
      o.value = r.id;
      sec.appendChild(o);
    });
  }

  function yontemCiz() {
    document.querySelectorAll('.kasa-yontem').forEach(function (b) {
      var aktif = b.dataset.yontem === d.yontem;
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      b.className = 'kasa-yontem flex flex-col items-center justify-center gap-1 h-[68px] rounded-2xl border text-[13px] font-semibold transition-all ' +
        (aktif ? 'text-[#042F2E] border-teal-200 bg-gradient-to-b from-teal-100 to-teal-300 shadow-[0_10px_24px_-10px_rgba(45,212,191,0.9)] -translate-y-0.5'
          : 'text-teal-50 bg-white/[0.05] border-white/15 hover:bg-white/10');
    });
  }

  function turSec(tur) {
    d.tur = tur;
    document.querySelectorAll('.kasa-tur').forEach(function (b) {
      var aktif = b.dataset.kasaTur === tur;
      b.setAttribute('aria-selected', aktif ? 'true' : 'false');
      b.className = 'kasa-tur h-10 rounded-[12px] text-[13px] font-semibold transition-colors ' +
        (aktif ? 'bg-white text-[#042F2E]' : 'text-teal-50 hover:bg-white/10') + (b.hasAttribute('data-sadece-doktor') && !d.doktor ? ' hidden' : '');
    });
    var paraHareketi = tur === 'tahsilat' || tur === 'iade';
    $('kasaYontemKutu').classList.toggle('hidden', !paraHareketi);
    $('kasaMakbuzlu').classList.toggle('hidden', !paraHareketi);
    $('kasaMakbuzlu').textContent = tur === 'iade' ? 'Kaydet ve iade belgesi' : 'Kaydet ve makbuz';
    document.querySelector('.kasa-kaydet[data-belge="0"]').textContent = TURLER[tur].kaydet;
    $('kasaTutar').placeholder = '0';
    randevuCiz();
    hizliCiz();
    sonrakiCiz();
  }

  async function hastaYukle(id) {
    if (!id) { d.hasta = null; d.bakiye = 0; d.ucretlenebilir = []; bakiyeKartiCiz(); hizliCiz(); randevuCiz(); sonrakiCiz(); return; }
    try {
      var y = await fetch('/api/kasa/hasta/' + id);
      if (y.status === 401) { location.href = '/giris?zaman_asimi=1'; return; }
      var v = await y.json();
      d.hasta = { id: v.id, ad: v.ad_soyad };
      d.bakiye = v.bakiye;
      d.ucretlenebilir = v.ucretlenebilir || [];
      $('kasaHastaSatir').textContent = v.ad_soyad;
      bakiyeKartiCiz(); hizliCiz(); randevuCiz(); sonrakiCiz();
    } catch (e) { Klinik.bildir('Hasta bilgisi alınamadı.', 'hata'); }
  }

  function ac(s) {
    s = s || {};
    d.hasta = s.hasta || null;
    d.bakiye = s.bakiye || 0;
    d.tarifeler = s.tarifeler || {};
    d.ucretlenebilir = s.ucretlenebilir || [];
    d.doktor = !!s.doktor;
    d.onKaydet = s.onKaydet || null;
    d.yontem = sonYontem();
    $('kasaTutar').value = '';
    $('kasaAciklama').value = '';
    $('kasaHastaSatir').textContent = d.hasta ? d.hasta.ad : 'Hasta seçin';

    var secKutu = $('kasaHastaSecimKutu'), sec = $('kasaHastaSec');
    var secimli = Array.isArray(s.hastalar);
    secKutu.classList.toggle('hidden', !secimli);
    secKutu.classList.toggle('flex', secimli);
    if (secimli) {
      sec.innerHTML = '';
      sec.appendChild(el('option', '', 'Hasta seçin…')).value = '';
      s.hastalar.forEach(function (h) { var o = el('option', '', h.ad); o.value = h.id; sec.appendChild(o); });
      sec.value = d.hasta ? d.hasta.id : '';
    }
    bakiyeKartiCiz();
    yontemCiz();
    turSec(s.tur || 'tahsilat');
    Klinik.modalAcId('kasaModal', secimli && !d.hasta ? 'kasaHastaSec' : 'kasaTutar');
  }

  function baslat() {
    if (!$('kasaForm')) return;
    document.querySelectorAll('.kasa-tur').forEach(function (b) { b.addEventListener('click', function () { turSec(b.dataset.kasaTur); }); });
    document.querySelectorAll('.kasa-yontem').forEach(function (b) {
      b.addEventListener('click', function () {
        d.yontem = b.dataset.yontem;
        try { localStorage.setItem('klinik_kasa_yontem', d.yontem); } catch (e) { /* tarayıcı depolaması kapalı olabilir */ }
        yontemCiz();
      });
    });
    $('kasaTutar').addEventListener('input', sonrakiCiz);
    $('kasaHastaSec').addEventListener('change', function () { hastaYukle(this.value); });
    $('kasaRandevu').addEventListener('change', function () {
      var r = d.ucretlenebilir.find(function (x) { return String(x.id) === this.value; }, this);
      if (r) { if (r.tutar) tutarYaz(r.tutar, r.islem_turu); else $('kasaAciklama').value = r.islem_turu; }
    });

    $('kasaForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var belgeli = e.submitter && e.submitter.dataset.belge === '1';
      if (!d.hasta) { Klinik.bildir('Lütfen hasta seçin.', 'hata'); return; }
      var tutar = kurusCoz($('kasaTutar').value);
      if (!tutar || tutar <= 0) { Klinik.bildir('Geçerli bir tutar girin.', 'hata'); $('kasaTutar').focus(); return; }
      var paraHareketi = d.tur === 'tahsilat' || d.tur === 'iade';
      if (paraHareketi && !d.yontem) { Klinik.bildir('Ödeme yöntemini seçin.', 'hata'); return; }
      if (d.tur === 'tahsilat' && d.bakiye > 0 && tutar > d.bakiye) {
        if (!(await Klinik.onayla('Girilen tutar (' + tl(tutar) + ') borçtan (' + tl(d.bakiye) + ') fazla. Fark hastanın hesabına alacak olarak yazılacak. Devam edilsin mi?', 'Evet, kaydet'))) return;
      }
      var pencere = belgeli && paraHareketi ? window.open('about:blank', '_blank') : null;
      var dugmeler = document.querySelectorAll('.kasa-kaydet');
      dugmeler.forEach(function (b) { b.disabled = true; });
      try {
        var sonuc = await Klinik.jsonGonder('/api/kasa/hareket', {
          hasta_id: d.hasta.id, tur: d.tur, tutar: tutar / 100, yontem: paraHareketi ? d.yontem : null,
          aciklama: $('kasaAciklama').value, randevu_id: d.tur === 'ucret' ? ($('kasaRandevu').value || null) : null
        });
        if (pencere) {
          if (sonuc.belge) pencere.location.href = sonuc.belge + '?otomatik=1';
          else pencere.close();
        }
        Klinik.bildir(sonuc.mesaj);
        Klinik.modalKapatId('kasaModal');
        if (d.onKaydet) d.onKaydet(sonuc);
      } catch (h) {
        if (pencere) pencere.close();
        Klinik.bildir(h.message, 'hata');
      }
      dugmeler.forEach(function (b) { b.disabled = false; });
    });

    $('kasaIptalForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!iptalHedef) return;
      var neden = $('kasaIptalNeden').value.trim();
      if (!neden) { Klinik.bildir('İptal nedenini yazın.', 'hata'); $('kasaIptalNeden').focus(); return; }
      var b = this.querySelector('button[type=submit]');
      b.disabled = true;
      try {
        var s = await Klinik.jsonGonder('/api/kasa/hareket/' + iptalHedef.h.id + '/iptal', { neden: neden });
        Klinik.bildir(s.mesaj);
        Klinik.modalKapatId('kasaIptalModal');
        if (iptalHedef.bitti) iptalHedef.bitti(s);
      } catch (h) { Klinik.bildir(h.message, 'hata'); }
      b.disabled = false;
    });
  }

  var iptalHedef = null;
  function iptal(h, bitti) {
    iptalHedef = { h: h, bitti: bitti };
    $('kasaIptalMetin').textContent = h.hasta_ad + ' · ' + h.tur_adi + ' ' + h.tutar_metin + ' (' + h.tarih_metin + ') iptal edilecek.';
    $('kasaIptalNeden').value = '';
    Klinik.modalAcId('kasaIptalModal', 'kasaIptalNeden');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();

  window.KasaIslem = { ac: ac, iptal: iptal, tl: tl, kurusCoz: kurusCoz };
})();
