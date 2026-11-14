/*
 * Klinik SaaS — Kontrol takibi (Randevular sayfası)
 */
(function () {
  'use strict';
  var kap = document.getElementById('kontrolListe');
  if (!kap) return;
  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  var liste = [], sablon = '', filtre = 'hepsi';

  var DURUM = {
    gecikti: { sinif: 'bg-rose-500/20 text-rose-100', metin: function (k) { return -k.fark + ' gün gecikti'; } },
    bugun: { sinif: 'bg-amber-400/20 text-amber-100', metin: function () { return 'Bugün'; } },
    yaklasiyor: { sinif: 'bg-sky-400/15 text-sky-100', metin: function (k) { return k.fark + ' gün sonra'; } }
  };

  function cipler() {
    var say = { hepsi: liste.length, gecikti: 0, yaklasiyor: 0 };
    liste.forEach(function (k) { if (k.durum === 'gecikti') say.gecikti++; else say.yaklasiyor++; });
    document.querySelectorAll('.kontrol-cip').forEach(function (b) {
      var a = b.dataset.kontrolFiltre === filtre;
      b.className = 'kontrol-cip h-9 px-3 rounded-full text-xs font-semibold border transition-colors ' +
        (a ? 'text-[#4A0D2E] bg-white border-white' : 'text-pink-50 bg-white/5 border-white/15 hover:bg-white/10');
      b.setAttribute('aria-pressed', a ? 'true' : 'false');
      var s = b.querySelector('[data-sayi]');
      s.textContent = say[b.dataset.kontrolFiltre] ? '· ' + say[b.dataset.kontrolFiltre] : '';
    });
  }

  async function islem(k, tur) {
    try {
      var r = await Klinik.jsonGonder('/api/kontrol/' + k.muayene_id, { islem: tur });
      if (tur === 'kapat') {
        liste = liste.filter(function (x) { return x !== k; });
        Klinik.bildir(r.mesaj);
      } else if (tur === 'hatirlatildi') {
        k.hatirlatildi = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date().toTimeString().slice(0, 5);
      } else if (tur === 'geri_al') { k.hatirlatildi = null; }
      ciz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  }

  function ciz() {
    cipler();
    kap.innerHTML = '';
    var l = liste.filter(function (k) { return filtre === 'hepsi' || (filtre === 'gecikti' ? k.durum === 'gecikti' : k.durum !== 'gecikti'); });
    if (!l.length) {
      var b = el('div', 'col-span-full py-8 text-center rounded-2xl border border-dashed border-white/10');
      b.appendChild(el('div', 'text-sm font-semibold text-white', liste.length ? 'Bu filtrede hasta yok' : 'Takip edilecek kontrol yok'));
      b.appendChild(el('div', 'mt-1 text-[13px] text-pink-100/60', 'Muayenede “Kontrol tarihi” girilen hastalar, zamanı yaklaşınca burada listelenir.'));
      kap.appendChild(b);
      return;
    }
    l.forEach(function (k, i) {
      var kart = el('div', 'satir flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border ' + (k.durum === 'gecikti' ? 'border-rose-300/25' : 'border-white/[0.08]'));
      kart.style.animationDelay = (i * 0.03) + 's';
      var ust = el('div', 'flex items-center gap-3');
      ust.appendChild(el('span', 'w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white bg-pink-400/25', k.bas_harfler));
      var m = el('div', 'flex-1 min-w-0');
      var ad = el('a', 'block text-sm font-semibold text-white truncate hover:text-pink-200', k.ad_soyad);
      ad.href = '/hasta/' + k.hasta_id;
      m.appendChild(ad);
      m.appendChild(el('div', 'text-[12px] text-pink-100/60 truncate', [k.tani, 'Muayene ' + k.muayene_tarihi, k.hekim].filter(Boolean).join(' · ')));
      ust.appendChild(m);
      var d = DURUM[k.durum];
      var rz = el('span', 'shrink-0 flex flex-col items-end gap-0.5');
      rz.appendChild(el('span', 'inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold whitespace-nowrap ' + d.sinif, d.metin(k)));
      rz.appendChild(el('span', 'text-[11px] text-white/50 tabular-nums', k.kontrol_metin));
      ust.appendChild(rz);
      kart.appendChild(ust);

      var ak = el('div', 'flex flex-wrap items-center gap-1.5');
      if (k.whatsapp) {
        var wa = el('a', 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-xs font-bold text-[#052E16] bg-emerald-300 hover:bg-emerald-200', k.hatirlatildi ? 'Tekrar gönder' : 'WhatsApp');
        wa.href = k.whatsapp; wa.target = '_blank'; wa.rel = 'noopener';
        wa.addEventListener('click', function () { setTimeout(function () { islem(k, 'hatirlatildi'); }, 400); });
        ak.appendChild(wa);
      }
      var rv = el('a', 'inline-flex items-center h-9 px-3 rounded-[10px] text-xs font-bold text-[#4A0D2E] bg-pink-200 hover:bg-pink-100', 'Randevu ver');
      rv.href = '/randevular?hasta_id=' + k.hasta_id + '#yeni';
      ak.appendChild(rv);
      var kp = el('button', 'h-9 px-3 rounded-[10px] text-xs font-semibold text-pink-50 border border-white/15 hover:bg-white/10', 'Listeden çıkar');
      kp.type = 'button';
      kp.title = 'Hasta kontrole gelmeyecekse veya başka yolla randevu aldıysa';
      kp.addEventListener('click', function () { islem(k, 'kapat'); });
      ak.appendChild(kp);
      if (k.hatirlatildi) {
        var h = el('span', 'ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200', '✓ Hatırlatıldı ' + k.hatirlatildi);
        var g = el('button', 'text-[11px] text-white/50 underline underline-offset-2 hover:text-white', 'geri al');
        g.type = 'button';
        g.addEventListener('click', function () { islem(k, 'geri_al'); });
        h.appendChild(g);
        ak.appendChild(h);
      }
      kart.appendChild(ak);
      kap.appendChild(kart);
    });
  }

  async function yukle() {
    try {
      var y = await fetch('/api/kontroller');
      if (!y.ok) return;
      var v = await y.json();
      liste = v.liste; sablon = v.sablon;
      ciz();
    } catch (x) {}
  }

  document.querySelectorAll('.kontrol-cip').forEach(function (b) {
    b.addEventListener('click', function () { filtre = b.dataset.kontrolFiltre; ciz(); });
  });
  $('kontrolSablonAc').addEventListener('click', function () { $('kontrolSablon').value = sablon; Klinik.modalAcId('kontrolSablonModal', 'kontrolSablon'); });
  document.querySelectorAll('[data-kontrol-etiket]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $('kontrolSablon'), e = '{' + b.dataset.kontrolEtiket + '}', p = t.selectionStart || t.value.length;
      t.value = t.value.slice(0, p) + e + t.value.slice(t.selectionEnd || p);
      t.focus(); t.selectionStart = t.selectionEnd = p + e.length;
    });
  });
  $('kontrolSablonKaydet').addEventListener('click', async function () {
    try {
      var r = await Klinik.jsonGonder('/api/kontrol_sablonu', { sablon: $('kontrolSablon').value });
      sablon = $('kontrolSablon').value; liste = r.liste;
      Klinik.modalKapatId('kontrolSablonModal'); Klinik.bildir(r.mesaj); ciz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });
  yukle();
})();
