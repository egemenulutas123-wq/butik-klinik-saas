/*
 * Klinik SaaS — Muayene şablonları (hasta dosyası)
 * Sık tanılar için bulgu, tedavi, kontrol süresi ve reçeteyi tek tıkla doldurur.
 */
(function () {
  'use strict';
  var veriEl = document.getElementById('sablonVeri');
  if (!veriEl || !document.getElementById('sablonCipler')) return;
  var sablonlar = JSON.parse(veriEl.textContent) || [];
  var aktif = null;

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  function sade(m) { return (m || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().replace(/[çğıöşü]/g, function (c) { return { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c]; }); }
  function gunEkle(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------- Muayene ekranı: şablon çipleri ----------
  function cipleriCiz() {
    var kap = $('sablonCipler'), q = sade($('sablonAra').value.trim());
    kap.innerHTML = '';
    var l = sablonlar.filter(function (s) { return !q || sade(s.ad + ' ' + s.tani).indexOf(q) !== -1; });
    if (!sablonlar.length) {
      kap.appendChild(el('span', 'text-[12px] text-violet-300', 'Henüz şablon yok. Bir muayeneyi doldurup “Şablon olarak kaydet” ile ekleyin.'));
      return;
    }
    if (!l.length) { kap.appendChild(el('span', 'text-[12px] text-violet-300', 'Eşleşen şablon yok.')); return; }
    l.slice(0, q ? 12 : 8).forEach(function (s) {
      var secili = aktif && aktif.id === s.id;
      var b = el('button', 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-semibold border transition-colors ' +
        (secili ? 'text-[#1E0B4B] bg-white border-white' : 'text-white bg-white/[0.06] border-white/15 hover:bg-white/15'));
      b.type = 'button';
      b.setAttribute('aria-pressed', secili ? 'true' : 'false');
      b.title = s.tani + (s.kalemler.length ? ' · ' + s.kalemler.length + ' ilaç' : '') + (s.kontrol_gun ? ' · ' + s.kontrol_gun + ' gün sonra kontrol' : '');
      b.appendChild(document.createTextNode(s.ad));
      if (s.kalemler.length) b.appendChild(el('span', 'inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-bold ' + (secili ? 'bg-rose-200 text-[#3B0A1E]' : 'bg-rose-400/25 text-rose-100'), s.kalemler.length + ' ilaç'));
      b.addEventListener('click', function () { uygula(s); });
      kap.appendChild(b);
    });
  }

  function uygula(s) {
    var dolu = ['m_bulgular', 'm_tedavi'].some(function (id) { return $(id).value.trim(); });
    aktif = s;
    $('m_tani').value = s.tani;
    if (s.bulgular || !dolu) $('m_bulgular').value = s.bulgular;
    if (s.tedavi || !dolu) $('m_tedavi').value = s.tedavi;
    if (s.kontrol_gun) $('m_kontrol').value = gunEkle(s.kontrol_gun);
    var ip = $('sablonIpucu');
    var parcalar = ['“' + s.ad + '” uygulandı'];
    if (s.kontrol_gun) parcalar.push('kontrol ' + s.kontrol_gun + ' gün sonra');
    if (s.kalemler.length) parcalar.push(s.kalemler.length + ' ilaç “Kaydet ve reçete yaz” ile reçeteye hazır gelir');
    ip.textContent = parcalar.join(' · ') + '. Alanları hastaya göre düzenleyebilirsiniz.';
    ip.classList.remove('hidden');
    $('muayeneReceteli').classList.toggle('ring-2', !!s.kalemler.length);
    $('muayeneReceteli').classList.toggle('ring-rose-300', !!s.kalemler.length);
    cipleriCiz();
    $('m_bulgular').focus();
  }

  function sifirla() {
    aktif = null;
    $('sablonAra').value = '';
    $('sablonIpucu').classList.add('hidden');
    $('sablonYapKutu').classList.add('hidden');
    $('muayeneReceteli').classList.remove('ring-2', 'ring-rose-300');
    cipleriCiz();
  }

  $('sablonAra').addEventListener('input', cipleriCiz);
  $('sablonAra').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); var ilk = $('sablonCipler').querySelector('button'); if (ilk) ilk.click(); }
  });

  // ---------- Muayeneyi şablon olarak kaydet ----------
  $('sablonYapAc').addEventListener('click', function () {
    var tani = $('m_tani').value.trim();
    if (!tani) { Klinik.bildir('Önce tanıyı yazın.', 'hata'); $('m_tani').focus(); return; }
    $('sablonYapAd').value = aktif ? aktif.ad : tani;
    var gun = '';
    if ($('m_kontrol').value) {
      var fark = Math.round((new Date($('m_kontrol').value) - new Date(gunEkle(0))) / 864e5);
      if (fark > 0) gun = fark;
    }
    $('sablonYapKutu').dataset.gun = gun;
    $('sablonYapBilgi').textContent = 'Tanı, bulgular ve tedavi' + (gun ? ', kontrol süresi (' + gun + ' gün)' : '') +
      ' kaydedilir. İlaçları reçete ekranındaki “Şablona kaydet” ile ekleyebilirsiniz.';
    $('sablonYapKutu').classList.remove('hidden');
    $('sablonYapKutu').classList.add('flex');
    $('sablonYapAd').focus();
    $('sablonYapAd').select();
  });
  $('sablonYapIptal').addEventListener('click', function () { $('sablonYapKutu').classList.add('hidden'); $('sablonYapKutu').classList.remove('flex'); });

  async function sablonGonder(veri) {
    var y = await fetch('/api/sablon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(veri) });
    var s = await y.json().catch(function () { return {}; });
    if (y.status === 409 && s.var) {
      if (!(await Klinik.onayla(s.hata, 'Üzerine yaz'))) return null;
      veri.uzerine_yaz = true;
      return sablonGonder(veri);
    }
    if (!y.ok) throw new Error(s.hata || 'Şablon kaydedilemedi.');
    return s;
  }

  $('sablonYapKaydet').addEventListener('click', async function () {
    var b = this;
    b.disabled = true;
    try {
      var s = await sablonGonder({ ad: $('sablonYapAd').value, tani: $('m_tani').value, bulgular: $('m_bulgular').value,
        tedavi: $('m_tedavi').value, kontrol_gun: $('sablonYapKutu').dataset.gun || null });
      if (s) {
        sablonlar = s.sablonlar;
        aktif = s.sablon;
        $('sablonYapKutu').classList.add('hidden'); $('sablonYapKutu').classList.remove('flex');
        cipleriCiz();
        Klinik.bildir(s.mesaj);
      }
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });

  // ---------- Şablon yönetimi ----------
  function yonetCiz() {
    var kap = $('sablonYonetListe');
    kap.innerHTML = '';
    if (!sablonlar.length) { kap.appendChild(el('p', 'py-6 text-center text-[13px] text-violet-300', 'Henüz şablon yok.')); return; }
    sablonlar.forEach(function (s) {
      var k = el('div', 'flex flex-col gap-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]');
      var ust = el('div', 'flex items-start gap-3');
      var m = el('div', 'flex-1 min-w-0');
      m.appendChild(el('div', 'text-sm font-semibold text-white', s.ad));
      m.appendChild(el('div', 'text-[12px] text-violet-300', [s.tani, s.kontrol_gun ? s.kontrol_gun + ' gün sonra kontrol' : null,
        s.kullanim ? s.kullanim + ' kez kullanıldı' : 'Henüz kullanılmadı', s.olusturan].filter(Boolean).join(' · ')));
      ust.appendChild(m);
      var ad = el('button', 'h-8 px-2.5 rounded-lg text-[12px] font-semibold text-violet-100 hover:bg-white/10', 'Yeniden adlandır');
      ad.type = 'button';
      ad.addEventListener('click', async function () {
        var yeni = window.prompt('Şablonun yeni adı:', s.ad);
        if (!yeni || yeni.trim() === s.ad) return;
        try { var r = await Klinik.jsonGonder('/api/sablon/' + s.id, { ad: yeni }, 'PUT'); sablonlar = r.sablonlar; yonetCiz(); cipleriCiz(); Klinik.bildir(r.mesaj); }
        catch (h) { Klinik.bildir(h.message, 'hata'); }
      });
      ust.appendChild(ad);
      var sil = el('button', 'h-8 px-2.5 rounded-lg text-[12px] font-semibold text-rose-200 hover:bg-rose-500/15', 'Sil');
      sil.type = 'button';
      sil.addEventListener('click', async function () {
        if (!(await Klinik.onayla('“' + s.ad + '” şablonu silinecek. Daha önce kaydedilmiş muayeneler etkilenmez.', 'Evet, sil'))) return;
        try { var r = await Klinik.jsonGonder('/api/sablon/' + s.id, null, 'DELETE'); sablonlar = r.sablonlar; if (aktif && aktif.id === s.id) aktif = null; yonetCiz(); cipleriCiz(); Klinik.bildir(r.mesaj); }
        catch (h) { Klinik.bildir(h.message, 'hata'); }
      });
      ust.appendChild(sil);
      k.appendChild(ust);
      if (s.kalemler.length) {
        var il = el('div', 'flex flex-wrap items-center gap-1.5');
        s.kalemler.forEach(function (x) {
          il.appendChild(el('span', 'inline-flex items-center h-7 px-2.5 rounded-lg text-[11px] font-medium text-rose-50 bg-rose-400/15', x.ilac_adi + (x.kullanim ? ' · ' + x.kullanim : '')));
        });
        var temizle = el('button', 'h-7 px-2 rounded-lg text-[11px] font-semibold text-white/60 hover:text-white hover:bg-white/10', 'İlaçları kaldır');
        temizle.type = 'button';
        temizle.addEventListener('click', async function () {
          try { var r = await Klinik.jsonGonder('/api/sablon/' + s.id, { kalemler: [] }, 'PUT'); sablonlar = r.sablonlar; yonetCiz(); cipleriCiz(); }
          catch (h) { Klinik.bildir(h.message, 'hata'); }
        });
        il.appendChild(temizle);
        k.appendChild(il);
      }
      if (s.bulgular || s.tedavi) k.appendChild(el('p', 'text-[12px] leading-relaxed text-violet-100/70 line-clamp-2', [s.bulgular, s.tedavi].filter(Boolean).join(' — ')));
      kap.appendChild(k);
    });
  }
  $('sablonYonetAc').addEventListener('click', function () { yonetCiz(); Klinik.modalAcId('sablonYonetModal'); });

  // ---------- Reçeteyi şablona kaydet ----------
  $('receteSablonAc').addEventListener('click', function () {
    var kalemler = window.KlinikRecete ? KlinikRecete.kalemler() : [];
    if (!kalemler.length) { Klinik.bildir('Önce reçeteye ilaç ekleyin.', 'hata'); return; }
    $('receteSablonOzet').textContent = kalemler.map(function (k) { return k.ilac_adi; }).join(', ');
    var sec = $('rs_sablon');
    sec.innerHTML = '';
    var yeni = el('option', '', '+ Yeni şablon'); yeni.value = '';
    sec.appendChild(yeni);
    var tani = sade(document.getElementById('r_tani').value);
    sablonlar.forEach(function (s) {
      var o = el('option', '', s.ad + (s.kalemler.length ? ' (' + s.kalemler.length + ' ilaç — değiştirilir)' : ''));
      o.value = s.id;
      if (tani && sade(s.tani) === tani) o.selected = true;
      sec.appendChild(o);
    });
    $('rs_ad').value = document.getElementById('r_tani').value || '';
    $('rs_ad_kutu').classList.toggle('hidden', !!sec.value);
    Klinik.modalAcId('receteSablonModal', 'rs_sablon');
  });
  $('rs_sablon').addEventListener('change', function () { $('rs_ad_kutu').classList.toggle('hidden', !!this.value); });
  $('rs_kaydet').addEventListener('click', async function () {
    var secili = sablonlar.filter(function (s) { return String(s.id) === $('rs_sablon').value; })[0];
    var ad = secili ? secili.ad : $('rs_ad').value.trim();
    if (!ad) { Klinik.bildir('Şablon adı yazın.', 'hata'); return; }
    try {
      var r = await sablonGonder({ ad: ad, tani: document.getElementById('r_tani').value || ad, kalemler: KlinikRecete.kalemler(),
        recete_notu: document.getElementById('r_notlar').value, yalniz_recete: true });
      if (!r) return;
      sablonlar = r.sablonlar;
      Klinik.modalKapatId('receteSablonModal');
      Klinik.bildir(r.mesaj);
      cipleriCiz();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });

  // ---------- Muayene sonrası reçeteyi şablondan doldur (?recete=..&sablon=..) ----------
  var adres = new URLSearchParams(location.search);
  if (adres.get('recete') && adres.get('sablon')) {
    var sb = sablonlar.filter(function (s) { return String(s.id) === adres.get('sablon'); })[0];
    if (sb && window.KlinikRecete) {
      setTimeout(function () {
        KlinikRecete.sablonUygula(sb);
        Klinik.bildir('“' + sb.ad + '” şablonunun ilaçları eklendi; doz ve süreleri kontrol edin.');
        history.replaceState(null, '', location.pathname);
      }, 800);
    }
  }

  window.KlinikSablon = {
    sifirla: sifirla,
    aktifId: function () { return aktif ? aktif.id : null; },
    ilacliMi: function () { return !!(aktif && aktif.kalemler.length); }
  };
  cipleriCiz();
})();
