/*
 * Klinik SaaS — ortak arayüz davranışları
 * Yeni hasta modalı, otomatik tamamlama, bildirim (toast) ve JSON fetch yardımcıları
 */
(function () {
  'use strict';

  var HASTALIKLAR = ["Akciğer Kanseri", "Akut Bronşit", "Akut Miyokard İnfarktüsü (Kalp Krizi)", "Akut Pankreatit", "Akut Romatizmal Ateş", "Alerjik Rinit", "Alzheimer Hastalığı", "Anemi (Kansızlık)", "Anksiyete Bozukluğu", "Aort Anevrizması", "Aritmi", "Astım", "Ateroskleroz", "Atopik Dermatit (Egzama)", "Bakteriyel Pnömoni", "Bel Fıtığı", "Bipolar Bozukluk", "Boyun Fıtığı", "Böbrek Taşı", "Böbrek Yetmezliği", "Bronşiolit", "Çölyak Hastalığı", "Demans (Bunama)", "Depresyon", "Derin Ven Trombozu", "Diyabet (Tip 1)", "Diyabet (Tip 2)", "Dizanteri", "Endometriozis", "Epilepsi (Sara)", "Farenjit", "Fibromiyalji", "Gastrit", "Gastroözofageal Reflü (GÖRH)", "Gestasyonel Diyabet", "Glokom", "Guatr", "Gut Hastalığı", "Hashimoto Tiroiditi", "Hemofili", "Hemoroid (Basur)", "Hepatit A", "Hepatit B", "Hepatit C", "Hipertansiyon", "Hipertiroidi", "Hipotiroidi", "İnsülin Direnci", "İrritabl Bağırsak Sendromu", "İskemik Kalp Hastalığı", "Kalp Yetmezliği", "Katarakt", "Kistik Fibrozis", "KOAH", "Kolelitiyazis (Safra Taşı)", "Kolera", "Kolon Kanseri", "Koroner Arter Hastalığı", "Kuduz", "Lenfoma", "Lösemi", "Lupus (SLE)", "Lyme Hastalığı", "Meme Kanseri", "Menenjit", "Mide Kanseri", "Mide Ülseri", "Migren", "Miyastenia Gravis", "Miyokardit", "Miyom", "Multipl Skleroz (MS)", "Nöropati", "Obezite", "Obsesif Kompulsif Bozukluk (OKB)", "Orta Kulak İltihabı", "Osteoartrit", "Osteoporoz", "Otizm Spektrum Bozukluğu", "Panik Atak", "Pankreas Kanseri", "Parkinson Hastalığı", "Perikardit", "Polikistik Over Sendromu", "Prostat Kanseri", "Pulmoner Emboli", "Romatoid Artrit", "Safra Kesesi İltihabı", "Sarkoidoz", "Sedef Hastalığı (Psoriazis)", "Sepsis", "Serebral Palsi", "Siroz", "Sıtma", "Şizofreni", "Skolyoz", "Tifo", "Tüberküloz (Verem)", "Uyku Apnesi", "Ülseratif Kolit", "Ürtiker", "Varis", "Vertigo", "Viral Pnömoni", "Yeme Bozukluğu (Anoreksiya)"];
  var ALERJILER = ["İlaç: Penisilin", "İlaç: Amoksisilin", "İlaç: Sefalosporin", "İlaç: Aspirin", "İlaç: İbuprofen", "İlaç: Lokal Anestezi", "İlaç: İyot", "İlaç: Sülfonamid", "İlaç: Kemoterapi İlaçları", "Gıda: İnek Sütü", "Gıda: Laktoz İntoleransı", "Gıda: Yumurta", "Gıda: Gluten", "Gıda: Çölyak", "Gıda: Kazein", "Gıda: Yer Fıstığı", "Gıda: Ceviz / Badem", "Gıda: Soya", "Gıda: Susam", "Gıda: Buğday", "Gıda: Deniz Ürünleri", "Gıda: Çilek", "Gıda: Kivi", "Gıda: Domates", "Gıda: Çikolata", "Solunum: Bahar Poleni", "Solunum: Ağaç Poleni", "Solunum: Çayır Poleni", "Solunum: Ev Tozu Akarı (Mite)", "Solunum: Kedi Tüyü", "Solunum: Köpek Tüyü", "Solunum: Kuş Tüyü", "Solunum: Küf Mantarı", "Solunum: Hamamböceği", "Temas: Lateks", "Temas: Nikel (Takı)", "Temas: Kozmetik", "Temas: Parfüm", "Temas: Saç Boyası", "Temas: Deterjan", "Temas: Yün", "Zehir: Arı Sokması", "Zehir: Yaban Arısı", "Zehir: Karınca", "Zehir: Sivrisinek"];

  // ---------- Bildirim ----------
  var bildirimZamani;
  function bildir(mesaj, tur) {
    var kutu = document.getElementById('bildirim');
    if (!kutu) return;
    var renk = tur === 'hata'
      ? 'background: rgba(244,63,94,0.22); border-color: rgba(253,164,175,0.45); color: #FFE4E6;'
      : 'background: rgba(45,212,191,0.2); border-color: rgba(94,234,212,0.45); color: #CCFBF1;';
    kutu.firstElementChild.setAttribute('style', renk + ' -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);');
    kutu.querySelector('[data-mesaj]').textContent = mesaj;
    kutu.classList.add('gorunur');
    clearTimeout(bildirimZamani);
    bildirimZamani = setTimeout(function () { kutu.classList.remove('gorunur'); }, 3400);
  }

  // ---------- Sunucu istekleri ----------
  async function jsonGonder(url, veri, yontem) {
    var secenek = { method: yontem || 'POST', headers: { 'Content-Type': 'application/json' } };
    if (veri !== undefined && veri !== null) secenek.body = JSON.stringify(veri);
    var yanit = await fetch(url, secenek);
    var govde = {};
    try { govde = await yanit.json(); } catch (e) { govde = {}; }
    if (yanit.status === 401) {
      bildir(govde.hata || 'Oturumunuz sona erdi.', 'hata');
      setTimeout(function () { window.location.href = '/giris?sonraki=' + encodeURIComponent(location.pathname + location.search); }, 900);
    }
    if (!yanit.ok) throw new Error(govde.hata || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    return govde;
  }

  // ---------- Genel modal yönetimi ----------
  var acikModallar = [];
  function modalAcId(id, odak) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('kapali');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (acikModallar.indexOf(id) === -1) acikModallar.push(id);
    setTimeout(function () {
      var hedef = odak ? document.getElementById(odak) : m.querySelector('input:not([type=hidden]), select, textarea, button');
      if (hedef) hedef.focus();
    }, 60);
  }
  function modalKapatId(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.add('kapali');
    m.setAttribute('aria-hidden', 'true');
    acikModallar = acikModallar.filter(function (x) { return x !== id; });
    if (!acikModallar.length) document.body.style.overflow = '';
  }

  // ---------- Onay penceresi ----------
  function onayla(metin, evetMetni) {
    return new Promise(function (coz) {
      var m = document.getElementById('onayModal');
      if (!m) { coz(window.confirm(metin)); return; }
      document.getElementById('onayMetin').textContent = metin;
      var evet = document.getElementById('onayEvet');
      var hayir = document.getElementById('onayVazgec');
      evet.textContent = evetMetni || 'Evet, sil';
      function bitir(sonuc) {
        evet.removeEventListener('click', e1);
        hayir.removeEventListener('click', e2);
        modalKapatId('onayModal');
        coz(sonuc);
      }
      function e1() { bitir(true); }
      function e2() { bitir(false); }
      evet.addEventListener('click', e1);
      hayir.addEventListener('click', e2);
      modalAcId('onayModal', 'onayVazgec');
    });
  }

  // ---------- Hasta modalı (yeni kayıt + düzenleme) ----------
  var HASTA_ALANLARI = ['ad_soyad', 'tc_kimlik', 'telefon', 'dogum_tarihi', 'cinsiyet', 'kan_grubu',
    'hastalik_tanisi', 'kronik_hastaliklar', 'gecmis_ameliyatlar', 'alerji_durumu', 'sikayet'];
  var duzenlenenId = null;

  function modalAc(hasta) {
    var form = document.getElementById('hastaForm');
    if (!form) return;
    form.reset();
    duzenlenenId = hasta && hasta.id ? hasta.id : null;
    if (duzenlenenId) {
      HASTA_ALANLARI.forEach(function (a) {
        var el = document.getElementById(a);
        if (el) el.value = hasta[a] || '';
      });
    }
    document.getElementById('hastaModalBaslik').textContent = duzenlenenId ? 'Hasta bilgilerini düzenle' : 'Yeni hasta kaydı';
    document.getElementById('hastaModalAciklama').textContent = duzenlenenId
      ? 'Değiştirmek istediğiniz alanları güncelleyip kaydedin.'
      : 'Kimlik, iletişim ve tıbbi geçmiş bilgilerini girin. Yıldızlı alanlar zorunludur.';
    document.getElementById('hastaKaydetDugme').textContent = duzenlenenId ? 'Değişiklikleri kaydet' : 'Hastayı kaydet';
    var kvkk = document.getElementById('kvkkSatiri');
    if (kvkk) kvkk.classList.toggle('hidden', !!duzenlenenId);
    modalAcId('hastaModal', 'ad_soyad');
  }
  function modalKapat() { modalKapatId('hastaModal'); }

  async function hastaKaydet(e) {
    e.preventDefault();
    var dugme = document.getElementById('hastaKaydetDugme');
    var veri = {};
    HASTA_ALANLARI.forEach(function (a) {
      var el = document.getElementById(a);
      veri[a] = el ? el.value.trim().replace(/,\s*$/, '') : '';
    });
    var kvkkKutu = document.getElementById('kvkk_onay');
    if (!duzenlenenId && kvkkKutu) veri.kvkk_onay = kvkkKutu.checked;
    if (!veri.ad_soyad) { bildir('Ad soyad zorunludur.', 'hata'); return; }
    if (!veri.telefon) { bildir('Telefon numarası zorunludur.', 'hata'); return; }
    var metin = dugme.textContent;
    dugme.disabled = true;
    dugme.textContent = 'Kaydediliyor…';
    try {
      var sonuc = duzenlenenId
        ? await jsonGonder('/api/hasta/' + duzenlenenId, veri, 'PUT')
        : await jsonGonder('/api/hasta_ekle', veri);
      bildir(sonuc.mesaj || 'Kaydedildi.');
      modalKapat();
      var hedef = '/hasta/' + sonuc.id;
      setTimeout(function () {
        if (location.pathname === hedef) location.reload(); else location.href = hedef;
      }, 650);
    } catch (hata) {
      bildir(hata.message, 'hata');
    } finally {
      dugme.disabled = false;
      dugme.textContent = metin;
    }
  }

  // ---------- Şifre değiştirme ----------
  async function sifreKaydet(e) {
    e.preventDefault();
    try {
      var sonuc = await jsonGonder('/api/sifre_degistir', {
        mevcut: document.getElementById('sifre_mevcut').value,
        yeni: document.getElementById('sifre_yeni').value
      });
      bildir(sonuc.mesaj);
      e.target.reset();
      modalKapatId('sifreModal');
    } catch (h) { bildir(h.message, 'hata'); }
  }

  // ---------- Ekran kilidi (hareketsizlik) ----------
  function kilitSistemi() {
    var ekran = document.getElementById('kilitEkrani');
    if (!ekran) return;
    var limit = (parseInt(ekran.getAttribute('data-kilit-dk'), 10) || 10) * 60 * 1000;
    var sonHareket = Date.now(), sonPing = Date.now(), kilitli = false;
    var depo = { al: function () { try { return localStorage.getItem('klinik_kilit') === '1'; } catch (e) { return false; } },
                 yaz: function (v) { try { if (v) localStorage.setItem('klinik_kilit', '1'); else localStorage.removeItem('klinik_kilit'); } catch (e) {} } };

    function kilitle() {
      if (kilitli) return;
      kilitli = true;
      depo.yaz(true);
      document.querySelectorAll('.modal:not(#kilitEkrani):not(.kapali)').forEach(function (m) { modalKapatId(m.id); });
      document.getElementById('kilitSifre').value = '';
      modalAcId('kilitEkrani', 'kilitSifre');
    }
    function hareket() {
      if (kilitli) return;
      sonHareket = Date.now();
      if (Date.now() - sonPing > 4 * 60 * 1000) {
        sonPing = Date.now();
        fetch('/api/canli', { method: 'POST' }).then(function (y) {
          if (y.status === 401) window.location.href = '/giris?zaman_asimi=1';
        }).catch(function () {});
      }
    }
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach(function (o) {
      window.addEventListener(o, hareket, { passive: true });
    });
    setInterval(function () { if (!kilitli && Date.now() - sonHareket > limit) kilitle(); }, 15000);
    window.addEventListener('storage', function (e) { if (e.key === 'klinik_kilit' && e.newValue === '1') kilitle(); });

    document.getElementById('kilitForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await jsonGonder('/api/kilit_ac', { sifre: document.getElementById('kilitSifre').value });
        kilitli = false;
        depo.yaz(false);
        sonHareket = sonPing = Date.now();
        modalKapatId('kilitEkrani');
        bildir('Tekrar hoş geldiniz.');
      } catch (h) {
        bildir(h.message, 'hata');
        var alan = document.getElementById('kilitSifre');
        alan.value = '';
        alan.focus();
      }
    });
    if (depo.al()) kilitle();
    window.Klinik.kilitle = kilitle;
  }

  // ---------- Otomatik tamamlama ----------
  function otomatikTamamla(inputId, listeId, kaynak, coklu) {
    var input = document.getElementById(inputId);
    var liste = document.getElementById(listeId);
    if (!input || !liste) return;
    var sirali = kaynak.slice().sort(function (a, b) { return a.localeCompare(b, 'tr'); });

    function aktifParca() {
      if (!coklu) return input.value;
      var parcalar = input.value.split(',');
      return parcalar[parcalar.length - 1].trim();
    }
    function sec(oge) {
      if (coklu) {
        var parcalar = input.value.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
        if (input.value.trim() && !/,\s*$/.test(input.value)) parcalar.pop();
        parcalar.push(oge);
        input.value = parcalar.join(', ') + ', ';
      } else {
        input.value = oge;
      }
      liste.classList.add('hidden');
      input.focus();
    }
    function ciz() {
      var aranan = aktifParca().toLocaleLowerCase('tr-TR');
      var sonuc = sirali.filter(function (o) { return o.toLocaleLowerCase('tr-TR').indexOf(aranan) !== -1; }).slice(0, 40);
      liste.innerHTML = '';
      if (!sonuc.length) {
        var bos = document.createElement('div');
        bos.className = 'px-4 py-3 text-sm text-violet-200/70 italic';
        bos.textContent = 'Sonuç bulunamadı — yazdığınız değer kaydedilecek.';
        liste.appendChild(bos);
        return;
      }
      sonuc.forEach(function (oge) {
        var satir = document.createElement('button');
        satir.type = 'button';
        satir.className = 'block w-full text-left px-4 py-2.5 text-sm font-medium text-violet-50 hover:bg-white/10 focus:bg-white/10 outline-none transition-colors';
        satir.textContent = oge;
        satir.addEventListener('mousedown', function (e) { e.preventDefault(); sec(oge); });
        liste.appendChild(satir);
      });
    }
    input.addEventListener('focus', function () { ciz(); liste.classList.remove('hidden'); });
    input.addEventListener('input', function () { ciz(); liste.classList.remove('hidden'); });
    input.addEventListener('blur', function () { setTimeout(function () { liste.classList.add('hidden'); }, 120); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); liste.classList.add('hidden'); } });
  }

  // ---------- Başlatma ----------
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-hasta-modal-ac]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); modalAc(null); });
    });
    document.querySelectorAll('[data-hasta-modal-kapat]').forEach(function (b) {
      b.addEventListener('click', modalKapat);
    });
    document.querySelectorAll('[data-modal-kapat]').forEach(function (b) {
      b.addEventListener('click', function () { modalKapatId(b.getAttribute('data-modal-kapat')); });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('mousedown', function (e) {
        if (e.target === m && m.id !== 'onayModal' && m.id !== 'kilitEkrani') modalKapatId(m.id);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !acikModallar.length) return;
      var son = acikModallar[acikModallar.length - 1];
      if (son === 'kilitEkrani') return;
      if (son === 'onayModal') document.getElementById('onayVazgec').click();
      else modalKapatId(son);
    });

    var form = document.getElementById('hastaForm');
    if (form) form.addEventListener('submit', hastaKaydet);
    var sifreForm = document.getElementById('sifreForm');
    if (sifreForm) sifreForm.addEventListener('submit', sifreKaydet);
    document.querySelectorAll('[data-sifre-modal-ac]').forEach(function (b) {
      b.addEventListener('click', function () { menuKapat(); modalAcId('sifreModal', 'sifre_mevcut'); });
    });

    // Kullanıcı menüsü
    var kDugme = document.getElementById('kullaniciDugme');
    var kMenu = document.getElementById('kullaniciMenu');
    function menuKapat() { if (kMenu) { kMenu.classList.add('hidden'); kDugme.setAttribute('aria-expanded', 'false'); } }
    if (kDugme && kMenu) {
      kDugme.addEventListener('click', function (e) {
        e.stopPropagation();
        var acik = kMenu.classList.toggle('hidden') === false;
        kDugme.setAttribute('aria-expanded', acik ? 'true' : 'false');
      });
      document.addEventListener('click', function (e) { if (!kMenu.contains(e.target)) menuKapat(); });
    }

    otomatikTamamla('hastalik_tanisi', 'hastalik_oneri', HASTALIKLAR, false);
    otomatikTamamla('kronik_hastaliklar', 'kronik_oneri', HASTALIKLAR, true);
    otomatikTamamla('alerji_durumu', 'alerji_oneri', ALERJILER, true);

    if (window.location.hash === '#yeni-hasta') modalAc(null);
    kilitSistemi();
  });

  window.Klinik = {
    bildir: bildir, jsonGonder: jsonGonder, onayla: onayla,
    modalAc: modalAc, modalKapat: modalKapat, modalAcId: modalAcId, modalKapatId: modalKapatId,
    otomatikTamamla: otomatikTamamla, HASTALIKLAR: HASTALIKLAR
  };
})();
