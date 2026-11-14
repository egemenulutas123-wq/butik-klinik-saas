/*
 * Klinik SaaS — Randevular sayfası: online randevu talepleri (onay / ret / ayarlar)
 */
(function () {
  'use strict';

  var VERI = JSON.parse(document.getElementById('talepVeri').textContent);
  var TALEPLER = VERI.talepler, SAATLER = VERI.saatler, BUGUN = VERI.bugun;

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }

  function onceMetni(iso) {
    var fark = (Date.now() - new Date(iso).getTime()) / 60000;
    if (fark < 1) return 'az önce';
    if (fark < 60) return Math.round(fark) + ' dk önce';
    if (fark < 1440) return Math.round(fark / 60) + ' sa önce';
    return Math.round(fark / 1440) + ' gün önce';
  }
  function basHarf(ad) {
    var p = ad.trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toLocaleUpperCase('tr');
  }

  // ---------- Bağlantı kopyala ----------
  $('linkKopyala').addEventListener('click', async function () {
    var alan = $('onlineLink');
    try { await navigator.clipboard.writeText(alan.value); }
    catch (e) { alan.select(); document.execCommand('copy'); }
    this.textContent = 'Kopyalandı ✓';
    var b = this;
    setTimeout(function () { b.textContent = 'Kopyala'; }, 1600);
  });

  // ---------- Talep kartları ----------
  function kartlariCiz() {
    var kap = $('talepListe');
    kap.innerHTML = '';
    $('talepSayi').textContent = TALEPLER.length ? '(' + TALEPLER.length + ')' : '';
    if (!TALEPLER.length) {
      var bos = el('div', 'md:col-span-2 2xl:col-span-3 flex items-center gap-4 py-6 px-5 rounded-2xl border border-dashed border-white/15');
      bos.appendChild(el('span', 'text-2xl', '☕'));
      var m = el('div');
      m.appendChild(el('div', 'text-[15px] font-semibold text-white', 'Bekleyen talep yok'));
      m.appendChild(el('div', 'text-[13px] text-teal-50/70', 'Bağlantıyı web sitenize, Google profilinize veya WhatsApp durumunuza ekleyerek hastaların kendi randevusunu almasını sağlayın.'));
      bos.appendChild(m);
      kap.appendChild(bos);
      return;
    }
    TALEPLER.forEach(function (t, n) {
      var kart = el('article', 'satir relative flex flex-col gap-3 p-4 rounded-[20px] border ' + (t.saat_dolu ? 'border-amber-300/35 bg-amber-400/[0.06]' : 'border-white/[0.09] bg-white/[0.04]'));
      kart.style.animationDelay = (n * 0.06) + 's';

      var ust = el('div', 'flex items-start gap-3');
      ust.appendChild(el('div', 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-[#042F2E] bg-gradient-to-br from-teal-100 to-teal-300', basHarf(t.ad_soyad)));
      var kim = el('div', 'flex-1 min-w-0');
      kim.appendChild(el('div', 'text-[15px] font-semibold text-white truncate', t.ad_soyad));
      kim.appendChild(el('div', 'text-xs text-teal-50/70 tabular-nums', t.telefon + ' · ' + onceMetni(t.olusturma)));
      ust.appendChild(kim);
      if (t.whatsapp) {
        var wa = el('a', 'w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center text-emerald-200 border border-emerald-300/30 hover:bg-emerald-400/15');
        wa.href = t.whatsapp; wa.target = '_blank'; wa.rel = 'noopener'; wa.title = 'WhatsApp ile yaz'; wa.setAttribute('aria-label', 'WhatsApp ile yaz');
        wa.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>';
        ust.appendChild(wa);
      }
      kart.appendChild(ust);

      var zaman = el('div', 'flex flex-wrap items-center gap-2');
      var tz = el('span', 'inline-flex items-center gap-2 h-9 px-3 rounded-xl text-[13px] font-semibold text-white bg-white/[0.08] border border-white/10 tabular-nums');
      tz.innerHTML = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
      tz.appendChild(document.createTextNode(t.tarih_metin + ' · ' + t.saat));
      zaman.appendChild(tz);
      zaman.appendChild(el('span', 'inline-flex items-center h-9 px-3 rounded-xl text-[13px] text-teal-100 bg-teal-400/10', t.islem_turu));
      if (t.doktor_ad && (VERI.hekimler || []).length > 1) zaman.appendChild(el('span', 'inline-flex items-center h-9 px-3 rounded-xl text-[13px] text-violet-100 bg-violet-400/10', t.doktor_ad));
      kart.appendChild(zaman);

      if (t.notlar) kart.appendChild(el('p', 'text-[13px] leading-relaxed text-teal-50/85 line-clamp-2', '“' + t.notlar + '”'));

      var es = el('div', 'flex flex-wrap items-center gap-1.5 text-[12px]');
      if (t.eslesen && t.eslesen.length) {
        es.appendChild(el('span', 'inline-flex items-center h-6 px-2.5 rounded-full font-semibold text-violet-100 bg-violet-400/20', 'Kayıtlı hasta: ' + t.eslesen[0].ad_soyad));
        es.appendChild(el('span', 'text-teal-50/60', t.eslesen[0].neden));
      } else {
        es.appendChild(el('span', 'inline-flex items-center h-6 px-2.5 rounded-full font-semibold text-teal-100 bg-teal-400/15', 'Yeni hasta'));
        if (t.kvkk_onay) es.appendChild(el('span', 'text-teal-50/60', 'aydınlatma onaylı'));
      }
      kart.appendChild(es);

      if (t.saat_dolu) kart.appendChild(el('div', 'text-[12px] font-semibold text-amber-200', 'Bu saat artık dolu — onaylarken farklı bir saat seçin.'));

      var aks = el('div', 'flex flex-wrap gap-2 pt-1 mt-auto');
      var on = el('button', 'flex-1 h-10 px-4 rounded-xl text-[13px] font-bold text-[#042F2E] bg-teal-200 hover:bg-teal-100 transition-colors', t.saat_dolu ? 'Saat seç ve onayla' : 'Onayla');
      on.type = 'button';
      on.addEventListener('click', function () { talepAc(t, 'onay'); });
      var red = el('button', 'h-10 px-4 rounded-xl text-[13px] font-semibold text-rose-100 border border-rose-300/30 hover:bg-rose-500/15 transition-colors', 'Reddet');
      red.type = 'button';
      red.addEventListener('click', function () { talepAc(t, 'red'); });
      aks.appendChild(on); aks.appendChild(red);
      kart.appendChild(aks);
      kap.appendChild(kart);
    });
  }

  // ---------- Talep penceresi ----------
  var aktif = null, secHasta = '', secSaat = null, doluSaat = [], kapaliSaat = [], kapaliNeden = null, mod = 'onay';
  var HAZIR_NEDENLER = ['Hekimimiz o gün izinli', 'Bu saat dolu, lütfen başka bir saat seçin', 'Bu hizmet için önce telefonla görüşmemiz gerekiyor'];

  function hastaSecenekleri() {
    var kap = $('talepHastalar');
    kap.innerHTML = '';
    var secenekler = (aktif.eslesen || []).map(function (h) { return { deger: String(h.id), baslik: h.ad_soyad, alt: 'Mevcut kayıt · ' + h.neden }; });
    secenekler.push({ deger: '', baslik: 'Yeni hasta olarak kaydet', alt: aktif.ad_soyad + ' · ' + aktif.telefon + (aktif.kvkk_onay ? ' · aydınlatma metni online onaylandı' : '') });
    if (secHasta === null) secHasta = secenekler[0].deger;
    secenekler.forEach(function (s) {
      var etiket = el('label', 'flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-colors ' +
        (secHasta === s.deger ? 'border-teal-300/60 bg-teal-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'));
      var r = el('input', 'w-4 h-4 accent-teal-400');
      r.type = 'radio'; r.name = 't_hasta'; r.value = s.deger; r.checked = secHasta === s.deger;
      r.addEventListener('change', function () { secHasta = s.deger; hastaSecenekleri(); });
      etiket.appendChild(r);
      var m = el('span', 'min-w-0');
      m.appendChild(el('span', 'block text-sm font-semibold text-white', s.baslik));
      m.appendChild(el('span', 'block text-[12px] text-teal-50/70 truncate', s.alt));
      etiket.appendChild(m);
      kap.appendChild(etiket);
    });
  }

  function saatleriCiz() {
    var kap = $('t_saatler');
    kap.innerHTML = '';
    var bugunMu = $('t_tarih').value === BUGUN;
    var simdi = new Date().toTimeString().slice(0, 5);
    SAATLER.forEach(function (s) {
      if (kapaliSaat.indexOf(s) !== -1) { if (secSaat === s) secSaat = null; return; }
      var dolu = doluSaat.indexOf(s) !== -1 || (bugunMu && s <= simdi);
      if (dolu && secSaat === s) secSaat = null;
      var istenen = s === aktif.saat && $('t_tarih').value === aktif.tarih;
      var b = el('button', '', s);
      b.type = 'button';
      b.disabled = dolu;
      b.setAttribute('aria-pressed', secSaat === s ? 'true' : 'false');
      b.className = 'relative h-10 rounded-xl text-[13px] font-semibold tabular-nums border transition-all ' +
        (dolu ? 'text-teal-50/35 border-dashed border-white/15 line-through cursor-not-allowed'
          : secSaat === s ? 'text-[#042F2E] border-teal-300 bg-gradient-to-b from-teal-100 to-teal-300'
            : 'text-white bg-white/[0.07] border-white/15 hover:bg-white/10');
      if (istenen) b.appendChild(el('span', 'absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-amber-300 border-2 border-[#0A2028]'));
      b.addEventListener('click', function () { secSaat = s; saatleriCiz(); });
      kap.appendChild(b);
    });
    if (kapaliNeden && !kap.children.length) kap.appendChild(el('div', 'col-span-full px-3 py-2.5 rounded-xl text-[13px] text-amber-100 bg-amber-400/10 border border-amber-300/25', kapaliNeden));
    $('talepOnayla').textContent = secSaat ? 'Onayla · ' + $('t_tarih').value.split('-').reverse().join('.') + ' ' + secSaat : 'Saat seçin';
    $('talepOnayla').disabled = !secSaat;
  }

  async function doluGetir() {
    try {
      var hk = $('t_hekim') ? $('t_hekim').value : (aktif.doktor_id || '');
      var y = await fetch('/api/dolu_saatler?tarih=' + encodeURIComponent($('t_tarih').value) + '&haric_talep=' + aktif.id + '&doktor_id=' + encodeURIComponent(hk));
      var v = await y.json();
      doluSaat = v.dolu || []; kapaliSaat = v.kapali || []; kapaliNeden = v.neden || null;
    } catch (e) { doluSaat = []; kapaliSaat = []; kapaliNeden = null; }
    saatleriCiz();
  }

  function modAyarla(yeni) {
    mod = yeni;
    var red = mod === 'red';
    $('redKutu').classList.toggle('hidden', !red);
    $('redKutu').classList.toggle('flex', red);
    $('talepReddet').textContent = red ? 'Reddi gönder' : 'Reddet';
    $('talepReddet').className = 'h-12 px-5 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-60 ' +
      (red ? 'text-white bg-rose-500 hover:bg-rose-400' : 'text-rose-100 border border-rose-300/35 hover:bg-rose-500/15');
    if (red) setTimeout(function () { $('redNeden').focus(); }, 60);
  }

  function talepAc(t, ilkMod) {
    aktif = t;
    secHasta = null;
    secSaat = t.saat_dolu ? null : t.saat;
    $('talepBaslik').textContent = t.ad_soyad;
    $('talepAlt').textContent = t.telefon + ' · ' + t.islem_turu + ' · ' + t.tarih_metin + ' ' + t.saat + ' istedi' + (t.doktor_ad && $('t_hekim') ? ' · ' + t.doktor_ad : '');
    if ($('t_hekim') && t.doktor_id) $('t_hekim').value = String(t.doktor_id);
    $('talepNot').classList.toggle('hidden', !t.notlar);
    $('talepNot').textContent = t.notlar ? 'Hastanın notu: “' + t.notlar + '”' : '';
    $('t_tarih').value = t.tarih >= BUGUN ? t.tarih : BUGUN;
    $('redNeden').value = '';
    var hazir = $('redHazir');
    hazir.innerHTML = '';
    HAZIR_NEDENLER.forEach(function (n) {
      var c = el('button', 'h-8 px-3 rounded-full text-[12px] font-semibold text-rose-50 bg-white/5 border border-white/15 hover:bg-white/10', n);
      c.type = 'button';
      c.addEventListener('click', function () { $('redNeden').value = n; });
      hazir.appendChild(c);
    });
    $('talepIcerik').classList.remove('hidden');
    $('talepAlt2').classList.remove('hidden');
    $('talepSonuc').classList.add('hidden');
    $('talepSonuc').classList.remove('flex');
    hastaSecenekleri();
    modAyarla(ilkMod || 'onay');
    Klinik.modalAcId('talepModal', ilkMod === 'red' ? 'redNeden' : 'talepOnayla');
    doluGetir();
  }

  function sonucGoster(baslik, metin, s, hastaId) {
    $('talepIcerik').classList.add('hidden');
    $('talepAlt2').classList.add('hidden');
    var kap = $('talepSonuc');
    kap.classList.remove('hidden');
    kap.classList.add('flex');
    // Animasyonu yeniden başlat
    var svg = kap.querySelector('svg');
    var yeni = svg.cloneNode(true);
    svg.parentNode.replaceChild(yeni, svg);
    $('sonucBaslik').textContent = baslik;
    $('sonucMetin').textContent = metin;
    var wa = $('sonucWhatsapp');
    wa.classList.toggle('hidden', !s.whatsapp);
    wa.classList.toggle('inline-flex', !!s.whatsapp);
    if (s.whatsapp) wa.href = s.whatsapp;
    $('sonucKopyala').onclick = async function () {
      try { await navigator.clipboard.writeText(s.bildirim_metni); Klinik.bildir('Mesaj panoya kopyalandı.'); }
      catch (e) { Klinik.bildir('Kopyalanamadı.', 'hata'); }
    };
    var hl = $('sonucHasta');
    hl.classList.toggle('hidden', !hastaId);
    hl.classList.toggle('inline-flex', !!hastaId);
    if (hastaId) hl.href = '/hasta/' + hastaId;
  }

  $('t_tarih').addEventListener('change', function () { secSaat = null; doluGetir(); });
  if ($('t_hekim')) $('t_hekim').addEventListener('change', function () { secSaat = null; doluGetir(); });

  $('talepOnayla').addEventListener('click', async function () {
    if (!aktif || !secSaat) return;
    var b = this;
    b.disabled = true;
    try {
      var s = await Klinik.jsonGonder('/api/online/talep/' + aktif.id + '/onayla', {
        hasta_id: secHasta || null, tarih: $('t_tarih').value, saat: secSaat,
        doktor_id: $('t_hekim') ? Number($('t_hekim').value) : (aktif.doktor_id || null)
      });
      TALEPLER = TALEPLER.filter(function (x) { return x.id !== aktif.id; });
      kartlariCiz();
      sonucGoster('Randevu oluşturuldu', s.mesaj + ' Hastaya onay mesajı göndermeyi unutmayın.', s, s.hasta_id);
    } catch (h) {
      Klinik.bildir(h.message, 'hata');
      doluGetir();
    }
    b.disabled = false;
  });

  $('talepReddet').addEventListener('click', async function () {
    if (mod !== 'red') { modAyarla('red'); return; }
    var neden = $('redNeden').value.trim();
    if (!neden) { Klinik.bildir('Hastaya iletilecek nedeni yazın.', 'hata'); $('redNeden').focus(); return; }
    var b = this;
    b.disabled = true;
    try {
      var s = await Klinik.jsonGonder('/api/online/talep/' + aktif.id + '/reddet', { neden: neden });
      TALEPLER = TALEPLER.filter(function (x) { return x.id !== aktif.id; });
      kartlariCiz();
      sonucGoster('Talep reddedildi', 'Hastaya nedeni ve yeni saat seçebileceği bağlantıyı iletebilirsiniz.', s, null);
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });

  $('sonucKapat').addEventListener('click', function () {
    Klinik.modalKapatId('talepModal');
    setTimeout(function () { location.reload(); }, 300);
  });

  // ---------- Ayarlar ----------
  var ayarForm = $('onlineAyarForm');
  if (ayarForm) {
    $('onlineAyarAc').addEventListener('click', function () { Klinik.modalAcId('onlineAyarModal', 'a_acik'); });
    ayarForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var b = ayarForm.querySelector('button[type=submit]');
      b.disabled = true;
      try {
        var s = await Klinik.jsonGonder('/api/online/ayarlar', {
          acik: $('a_acik').checked,
          hizmetler: Array.prototype.map.call(ayarForm.querySelectorAll('[name=a_hizmet]:checked'), function (i) { return i.value; }),
          kapali: Array.prototype.map.call(ayarForm.querySelectorAll('[name=a_kapali]:checked'), function (i) { return Number(i.value); }),
          gun: Number($('a_gun').value), min_saat: Number($('a_min').value),
          fiyat_goster: $('a_fiyat').checked, mesaj: $('a_mesaj').value
        });
        Klinik.bildir(s.mesaj);
        Klinik.modalKapatId('onlineAyarModal');
        setTimeout(function () { location.reload(); }, 600);
      } catch (h) { Klinik.bildir(h.message, 'hata'); }
      b.disabled = false;
    });
  }

  kartlariCiz();
})();
