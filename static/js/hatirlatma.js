/*
 * Klinik SaaS — Randevu hatırlatmaları (WhatsApp) ve mesaj şablonu
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  if (!$('hatirlatma')) return;

  var d = { tarih: null, liste: [], sablon: '', onceki: null, sonraki: null };
  var WA_SVG = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>';

  async function yukle(tarih) {
    try {
      var y = await fetch('/api/hatirlatmalar' + (tarih ? '?tarih=' + tarih : ''));
      if (y.status === 401) { location.href = '/giris?zaman_asimi=1'; return; }
      var v = await y.json();
      d.tarih = v.tarih; d.liste = v.liste; d.sablon = v.sablon; d.onceki = v.onceki; d.sonraki = v.sonraki;
      $('htGoreli').textContent = v.goreli;
      $('htTarih').textContent = v.baslik;
      ciz();
    } catch (e) { Klinik.bildir('Hatırlatmalar yüklenemedi.', 'hata'); }
  }

  async function isaretle(r, geriAl) {
    try {
      var s = await Klinik.jsonGonder('/api/randevu/' + r.id + '/hatirlatma', { geri_al: !!geriAl });
      r.hatirlatma = s.hatirlatma;
      ciz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  }

  function gonder(r) {
    if (!r.whatsapp) { Klinik.bildir(r.ad_soyad + ' için geçerli bir cep telefonu yok.', 'hata'); return; }
    window.open(r.whatsapp, '_blank', 'noopener');
    isaretle(r);
  }

  function ciz() {
    var toplam = d.liste.length;
    var yapilan = d.liste.filter(function (r) { return r.hatirlatma; }).length;
    $('htSayac').textContent = yapilan + ' / ' + toplam;
    $('htHalka').setAttribute('stroke-dasharray', (toplam ? yapilan / toplam * 100 : 0) + ' 100');
    var siradaki = d.liste.find(function (r) { return !r.hatirlatma && r.whatsapp; });
    $('htSiradaki').disabled = !siradaki;
    $('htSiradaki').title = siradaki ? siradaki.saat + ' · ' + siradaki.ad_soyad : 'Hatırlatılacak randevu kalmadı';

    var kap = $('htListe');
    kap.innerHTML = '';
    if (!toplam) {
      var bos = el('div', 'lg:col-span-2 py-8 text-center rounded-2xl border border-dashed border-white/15');
      bos.appendChild(el('div', 'text-[15px] font-semibold text-white', 'Bu gün için hatırlatılacak randevu yok'));
      bos.appendChild(el('div', 'mt-1 text-[13px] text-emerald-50/70', 'Oklarla başka bir güne geçebilirsiniz.'));
      kap.appendChild(bos);
      return;
    }
    d.liste.forEach(function (r, n) {
      var tamam = !!r.hatirlatma;
      var satir = el('div', 'satir flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ' +
        (tamam ? 'border-emerald-300/25 bg-emerald-400/[0.06]' : 'border-white/[0.08] bg-white/[0.04]'));
      satir.style.animationDelay = (n * 0.04) + 's';
      satir.appendChild(el('div', 'w-14 font-sora text-[17px] font-semibold text-white tabular-nums', r.saat));
      var orta = el('div', 'flex-1 min-w-0');
      var ust = el('div', 'flex items-center gap-2 min-w-0');
      var ad = el('a', 'text-[14px] font-semibold text-white truncate hover:text-emerald-200', r.ad_soyad);
      ad.href = '/hasta/' + r.hasta_id;
      ust.appendChild(ad);
      if (r.gelmeme) ust.appendChild(el('span', 'shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-200', r.gelmeme + ' kez gelmedi'));
      orta.appendChild(ust);
      orta.appendChild(el('div', 'text-[12px] text-emerald-50/65 truncate', r.islem_turu + ' · ' + r.telefon + (tamam ? ' · ✓ ' + r.hatirlatma : '')));
      satir.appendChild(orta);

      var wa = el('button', 'shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-xs font-bold transition-colors ' +
        (tamam ? 'text-emerald-100 border border-emerald-300/30 hover:bg-emerald-400/15' : 'text-[#052E16] bg-emerald-300 hover:bg-emerald-200'));
      wa.type = 'button';
      wa.innerHTML = WA_SVG;
      wa.appendChild(document.createTextNode(tamam ? 'Tekrar' : 'Gönder'));
      wa.disabled = !r.whatsapp;
      wa.title = r.whatsapp ? 'WhatsApp ile hatırlat' : 'Geçerli cep telefonu yok';
      wa.addEventListener('click', function () { gonder(r); });
      satir.appendChild(wa);

      var kp = el('button', 'shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white');
      kp.type = 'button'; kp.title = 'Mesajı kopyala'; kp.setAttribute('aria-label', 'Mesajı kopyala');
      kp.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      kp.addEventListener('click', async function () {
        try { await navigator.clipboard.writeText(r.metin); Klinik.bildir('Mesaj kopyalandı · SMS ile de gönderebilirsiniz.'); }
        catch (e) { Klinik.bildir('Kopyalanamadı.', 'hata'); }
      });
      satir.appendChild(kp);
      if (tamam) {
        var ga = el('button', 'shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white');
        ga.type = 'button'; ga.title = 'Hatırlatıldı işaretini kaldır'; ga.setAttribute('aria-label', 'İşareti kaldır');
        ga.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
        ga.addEventListener('click', function () { isaretle(r, true); });
        satir.appendChild(ga);
      }
      kap.appendChild(satir);
    });
  }

  $('htOnceki').addEventListener('click', function () { yukle(d.onceki); });
  $('htSonraki').addEventListener('click', function () { yukle(d.sonraki); });
  $('htSiradaki').addEventListener('click', function () {
    var r = d.liste.find(function (x) { return !x.hatirlatma && x.whatsapp; });
    if (r) gonder(r);
  });

  // ---------- Şablon ----------
  var ORNEK = { ad: 'Ayşe', adsoyad: 'Ayşe Yılmaz', klinik: document.title.split('|').pop().trim() || 'Klinik',
                gun: 'Pazartesi', tarih: '16 Kasım', saat: '10:30', islem: 'Genel Muayene', hekim: 'Dr. Demo Hekim' };
  function onizle() {
    $('htOnizleme').textContent = $('htSablon').value.replace(/\{(\w+)\}/g, function (m, k) { return ORNEK[k] !== undefined ? ORNEK[k] : m; });
  }
  $('htSablonAc').addEventListener('click', function () {
    $('htSablon').value = d.sablon;
    onizle();
    Klinik.modalAcId('htSablonModal', 'htSablon');
  });
  $('htSablon').addEventListener('input', onizle);
  document.querySelectorAll('[data-etiket]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $('htSablon'), bas = t.selectionStart, son = t.selectionEnd;
      t.value = t.value.slice(0, bas) + b.dataset.etiket + t.value.slice(son);
      t.focus();
      t.selectionStart = t.selectionEnd = bas + b.dataset.etiket.length;
      onizle();
    });
  });
  $('htSablonForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = this.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      var s = await Klinik.jsonGonder('/api/hatirlatma_sablonu', { sablon: $('htSablon').value });
      Klinik.bildir(s.mesaj);
      Klinik.modalKapatId('htSablonModal');
      yukle(d.tarih);
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });

  yukle();
})();
