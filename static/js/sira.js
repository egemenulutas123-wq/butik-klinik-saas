/*
 * Klinik SaaS — Bekleme salonu sıra yönetimi (panel)
 * Geldi → salonda bekler → çağrılır → muayene / tamamlandı
 */
(function () {
  'use strict';

  var V = JSON.parse(document.getElementById('siraVeri').textContent);
  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }

  var liste = [], salonLink = '', ayar = {}, filtre = '';
  try { filtre = localStorage.getItem('klinik_sira_hekim') || ''; } catch (x) {}
  if (!filtre && V.doktor && V.hekimler.length > 1) filtre = String(V.kullanici_id);
  if (filtre && !V.hekimler.some(function (h) { return String(h.id) === filtre; })) filtre = '';
  var COK = V.hekimler.length > 1;

  function hekimCipleri() {
    var kap = $('siraHekimler');
    if (!COK) return;
    kap.classList.remove('hidden'); kap.classList.add('flex');
    kap.innerHTML = '';
    [{ id: '', ad: 'Tüm hekimler' }].concat(V.hekimler).forEach(function (h) {
      var aktif = String(h.id) === filtre;
      var b = el('button', 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border transition-colors ' +
        (aktif ? 'text-[#0C2A3F] bg-white border-white' : 'text-sky-50 bg-white/5 border-white/15 hover:bg-white/10'));
      b.type = 'button';
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      if (h.renk) { var n = el('span', 'w-2 h-2 rounded-full'); n.style.background = h.renk; b.appendChild(n); }
      b.appendChild(document.createTextNode(h.ad));
      b.addEventListener('click', function () {
        filtre = String(h.id);
        try { localStorage.setItem('klinik_sira_hekim', filtre); } catch (x) {}
        hekimCipleri(); ciz();
      });
      kap.appendChild(b);
    });
  }

  function dugme(metin, sinif, fn) {
    var b = el('button', 'h-9 px-3 rounded-[10px] text-xs font-bold transition-colors disabled:opacity-50 ' + sinif, metin);
    b.type = 'button';
    b.addEventListener('click', async function () { b.disabled = true; try { await fn(); } finally { b.disabled = false; } });
    return b;
  }

  async function islem(url, veri) {
    try {
      var s = await Klinik.jsonGonder(url, veri || {});
      Klinik.bildir(s.mesaj);
      await yukle();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  }

  function kart(r, tur) {
    var k = el('div', 'satir flex flex-col gap-2.5 p-3.5 rounded-2xl border ' +
      (tur === 'salon' ? 'bg-sky-400/[0.07] border-sky-300/20' : tur === 'cagri' ? 'bg-teal-400/[0.07] border-teal-300/20' : 'bg-white/[0.035] border-white/[0.07]'));
    var ust = el('div', 'flex items-center gap-3');
    if (r.sira_no) {
      ust.appendChild(el('span', 'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-sora text-lg font-semibold ' +
        (tur === 'cagri' ? 'bg-teal-300 text-[#042F2E]' : 'bg-sky-300 text-[#0C2A3F]'), String(r.sira_no)));
    } else {
      ust.appendChild(el('span', 'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-sora text-[13px] font-semibold text-white bg-white/[0.07] tabular-nums', r.saat));
    }
    var m = el('div', 'flex-1 min-w-0');
    var ad = el('a', 'block text-sm font-semibold text-white truncate hover:text-sky-200', r.hasta_ad);
    ad.href = '/hasta/' + r.hasta_id;
    m.appendChild(ad);
    var alt = [r.saat + ' randevu', r.islem_turu];
    if (COK && r.doktor_ad) alt.push(r.doktor_ad);
    m.appendChild(el('div', 'text-[12px] text-violet-200/70 truncate', alt.join(' · ')));
    ust.appendChild(m);
    if (tur === 'salon' && r.bekleme) {
      ust.appendChild(el('span', 'shrink-0 text-right text-[11px] leading-tight text-sky-100', r.bekleme.dk ? '~' + r.bekleme.dk + ' dk' : 'Sırada'));
    }
    if (tur === 'cagri') ust.appendChild(el('span', 'shrink-0 text-[11px] text-teal-100 tabular-nums', r.cagrildi + (r.cagri_sayisi > 1 ? ' · ' + r.cagri_sayisi + '×' : '')));
    if (COK && r.doktor_renk) { var cizgi = el('span', 'w-1 self-stretch rounded-full'); cizgi.style.background = r.doktor_renk; ust.insertBefore(cizgi, ust.firstChild); }
    k.appendChild(ust);

    var ak = el('div', 'flex flex-wrap gap-1.5');
    if (tur === 'beklenen') {
      ak.appendChild(dugme('Geldi', 'text-[#0C2A3F] bg-sky-200 hover:bg-sky-100', function () { return islem('/api/randevu/' + r.id + '/geldi'); }));
      if (r.saat < new Date().toTimeString().slice(0, 5)) {
        ak.appendChild(dugme('Gelmedi', 'text-orange-200 border border-orange-300/30 hover:bg-orange-500/15', async function () {
          if (!(await Klinik.onayla(r.hasta_ad + ' gelmedi olarak işaretlenecek.', 'Evet, gelmedi'))) return;
          await islem('/api/randevu_durum/' + r.id, { durum: 'Gelmedi' });
        }));
      }
    } else if (tur === 'salon') {
      ak.appendChild(dugme('Çağır', 'text-[#042F2E] bg-teal-200 hover:bg-teal-100', function () { return islem('/api/randevu/' + r.id + '/cagir'); }));
      ak.appendChild(dugme('Geri al', 'text-sky-50 border border-white/15 hover:bg-white/10', function () { return islem('/api/randevu/' + r.id + '/geldi', { geri_al: true }); }));
    } else if (tur === 'cagri') {
      if (r.durum !== 'Tamamlandı') {
        ak.appendChild(dugme('Tekrar çağır', 'text-teal-50 border border-teal-300/30 hover:bg-teal-400/15', function () { return islem('/api/randevu/' + r.id + '/cagir'); }));
        if (V.doktor && !r.muayene_var) {
          var mu = el('a', 'inline-flex items-center h-9 px-3 rounded-[10px] text-xs font-bold text-[#1E0B4B] bg-white hover:bg-violet-100', 'Muayene');
          mu.href = '/hasta/' + r.hasta_id + '?muayene=' + r.id;
          ak.appendChild(mu);
        }
        ak.appendChild(dugme('Tamamlandı', 'text-white border border-white/15 hover:bg-white/10', function () {
          return islem('/api/randevu_durum/' + r.id, { durum: 'Tamamlandı' });
        }));
      } else {
        ak.appendChild(el('span', 'inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-semibold text-violet-100 bg-white/10', 'Tamamlandı'));
      }
    }
    k.appendChild(ak);
    return k;
  }

  function kolon(id, sayId, kayitlar, tur, bosMetin) {
    var kap = $(id);
    kap.innerHTML = '';
    $(sayId).textContent = kayitlar.length ? kayitlar.length : '';
    if (!kayitlar.length) { kap.appendChild(el('div', 'py-6 px-3 text-center text-[13px] text-violet-300/70 rounded-2xl border border-dashed border-white/10', bosMetin)); return; }
    kayitlar.forEach(function (r, i) { var k = kart(r, tur); k.style.animationDelay = (i * 0.04) + 's'; kap.appendChild(k); });
  }

  function ciz() {
    var l = liste.filter(function (r) { return !filtre || String(r.doktor_id) === filtre; });
    var beklenen = l.filter(function (r) { return !r.geldi && r.durum !== 'Tamamlandı'; });
    var salon = l.filter(function (r) { return r.geldi && !r.cagrildi && r.durum !== 'Tamamlandı'; })
      .sort(function (a, b) { return ((a.bekleme || {}).dk || 0) - ((b.bekleme || {}).dk || 0) || a.sira_no - b.sira_no; });
    var cagri = l.filter(function (r) { return r.cagrildi; })
      .sort(function (a, b) { return (a.durum === 'Tamamlandı') - (b.durum === 'Tamamlandı') || (b.cagrildi > a.cagrildi ? 1 : -1); });
    kolon('kolonBeklenen', 'sayBeklenen', beklenen, 'beklenen', 'Bugün gelmesi beklenen hasta kalmadı.');
    kolon('kolonSalon', 'saySalon', salon, 'salon', 'Salonda bekleyen yok. Gelen hastayı “Geldi” ile ekleyin.');
    kolon('kolonCagrilan', 'sayCagrilan', cagri.slice(0, 8), 'cagri', 'Henüz çağrılan hasta yok.');
  }

  async function yukle() {
    try {
      var y = await fetch('/api/sira', { headers: { 'Accept': 'application/json' } });
      if (!y.ok) return;
      var v = await y.json();
      liste = v.liste; salonLink = v.salon_link; ayar = v.ayar;
      $('salonAc').href = salonLink;
      ciz();
    } catch (x) { /* bağlantı geçici olarak yok */ }
  }

  $('salonKopyala').addEventListener('click', async function () {
    try { await navigator.clipboard.writeText(salonLink); Klinik.bildir('Salon ekranı bağlantısı kopyalandı. TV veya tablette açın.'); }
    catch (x) { window.prompt('Bağlantıyı kopyalayın:', salonLink); }
  });

  if ($('salonAyarAc')) {
    $('salonAyarAc').addEventListener('click', function () {
      $('sa_sure').value = ayar.sure || 15;
      $('sa_mesaj').value = ayar.mesaj || '';
      document.querySelectorAll('[name=sa_isim]').forEach(function (r) { r.checked = r.value === (ayar.isim || 'kisalt'); });
      $('sa_yenile').checked = false;
      Klinik.modalAcId('salonAyarModal', 'sa_sure');
    });
    $('salonAyarForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var b = this.querySelector('[type=submit]');
      b.disabled = true;
      try {
        var s = await Klinik.jsonGonder('/api/salon/ayar', {
          sure: $('sa_sure').value, mesaj: $('sa_mesaj').value, anahtar_yenile: $('sa_yenile').checked,
          isim: (document.querySelector('[name=sa_isim]:checked') || {}).value
        });
        Klinik.bildir(s.mesaj);
        Klinik.modalKapatId('salonAyarModal');
        await yukle();
      } catch (h) { Klinik.bildir(h.message, 'hata'); }
      b.disabled = false;
    });
  }

  hekimCipleri();
  yukle();
  setInterval(function () { if (!document.hidden) yukle(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) yukle(); });
})();
