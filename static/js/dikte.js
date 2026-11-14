/*
 * Klinik SaaS — Sesli not (Türkçe dikte)
 * data-dikte özniteliği olan her metin alanına mikrofon düğmesi ekler.
 * Tarayıcının Web Speech API'sini kullanır (Chrome / Edge). Sesli komutlar:
 *   "virgül" ,   "nokta" .   "iki nokta" :   "soru işareti" ?   "ünlem" !
 *   "yeni satır" / "alt satır" ↵   "parantez aç" (   "parantez kapat" )   "son kelimeyi sil"
 * Kısayol: alan seçiliyken Alt+D dikteyi başlatır / durdurur.
 */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var aktif = null;   // { alan, dugme, tanima, balon, durduruluyor }

  var MIC = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/></svg>';
  var DUR = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  function bildir(m, t) { if (window.Klinik) window.Klinik.bildir(m, t); }

  function komutlariIsle(metin) {
    var m = ' ' + metin.trim() + ' ';
    var kurallar = [
      [/\s(son kelimeyi sil)\s/gi, ' \u0000SIL\u0000 '],
      [/\s(yeni satır|alt satır|yeni satıra geç|alt satıra geç)\s/gi, '\n'],
      [/\s(iki nokta üst üste|iki nokta)\s/gi, ': '],
      [/\s(soru işareti)\s/gi, '? '],
      [/\s(ünlem işareti|ünlem)\s/gi, '! '],
      [/\s(noktalı virgül)\s/gi, '; '],
      [/\s(virgül)\s/gi, ', '],
      [/\s(nokta)\s/gi, '. '],
      [/\s(parantez aç)\s/gi, ' ('],
      [/\s(parantez kapat)\s/gi, ') '],
      [/\s(tire)\s/gi, ' - ']
    ];
    kurallar.forEach(function (k) { m = m.replace(k[0], k[1]); m = m.replace(k[0], k[1]); });
    return m.replace(/[ \t]+([,.;:?!)])/g, '$1').replace(/\( /g, '(').replace(/[ \t]{2,}/g, ' ').replace(/^ +| +$/g, '');
  }

  function buyukHarf(metin, oncesi) {
    var basta = !oncesi.trim() || /[.?!]\s*$|\n\s*$/.test(oncesi);
    metin = metin.replace(/([.?!]\s+|\n)(\p{Ll})/gu, function (t, a, h) { return a + h.toLocaleUpperCase('tr'); });
    if (basta) metin = metin.replace(/^(\s*)(\p{Ll})/u, function (t, a, h) { return a + h.toLocaleUpperCase('tr'); });
    return metin;
  }

  function ekle(alan, ham) {
    var parca = komutlariIsle(ham);
    if (!parca) return;
    var deger = alan.value;
    if (parca.indexOf('\u0000SIL\u0000') !== -1) {
      deger = deger.replace(/\s*\S+\s*$/, '');
      parca = parca.replace(/\s*\u0000SIL\u0000\s*/g, ' ').trim();
      if (!parca) { alan.value = deger; alan.dispatchEvent(new Event('input', { bubbles: true })); return; }
    }
    var ayrac = !deger || /[\s(]$/.test(deger) || /^[,.;:?!)\n]/.test(parca) ? '' : ' ';
    parca = buyukHarf(parca, deger);
    var yeni = deger + ayrac + parca;
    if (alan.maxLength > 0) yeni = yeni.slice(0, alan.maxLength);
    alan.value = yeni;
    alan.scrollTop = alan.scrollHeight;
    alan.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function durdur() {
    if (!aktif) return;
    var a = aktif;
    aktif = null;
    a.durduruluyor = true;
    try { a.tanima.stop(); } catch (e) { /* zaten durmuş */ }
    a.dugme.innerHTML = MIC;
    a.dugme.className = a.dugme.dataset.sinif;
    a.dugme.setAttribute('aria-pressed', 'false');
    a.dugme.setAttribute('aria-label', 'Sesle yaz');
    a.balon.classList.add('hidden');
    a.alan.classList.remove('dikte-aktif');
  }

  function baslat(alan, dugme, balon) {
    if (aktif && aktif.alan === alan) { durdur(); return; }
    durdur();
    var tanima = new SR();
    tanima.lang = 'tr-TR';
    tanima.continuous = true;
    tanima.interimResults = true;
    tanima.maxAlternatives = 1;
    var oturum = { alan: alan, dugme: dugme, tanima: tanima, balon: balon, durduruluyor: false };
    aktif = oturum;

    tanima.onresult = function (e) {
      var ara = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) ekle(alan, r[0].transcript);
        else ara += r[0].transcript;
      }
      balon.querySelector('[data-metin]').textContent = ara ? ara : 'Dinliyorum… konuşabilirsiniz';
    };
    tanima.onerror = function (e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      var mesaj = {
        'not-allowed': 'Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden mikrofona izin verin.',
        'service-not-allowed': 'Tarayıcı ses tanıma hizmetine izin vermiyor.',
        'audio-capture': 'Mikrofon bulunamadı.',
        'network': 'Ses tanıma için internet bağlantısı gerekiyor.'
      }[e.error] || 'Ses tanıma hatası: ' + e.error;
      bildir(mesaj, 'hata');
      oturum.durduruluyor = true;
      if (aktif === oturum) durdur();
    };
    tanima.onend = function () {
      // Chrome sessizlikte durur: kullanıcı durdurmadıysa kaldığı yerden devam et
      if (!oturum.durduruluyor && aktif === oturum) {
        try { tanima.start(); } catch (e) { durdur(); }
      }
    };
    try { tanima.start(); } catch (e) { bildir('Sesli yazma başlatılamadı.', 'hata'); aktif = null; return; }

    dugme.innerHTML = DUR;
    dugme.className = dugme.dataset.sinif.replace('text-violet-200 bg-white/[0.07] hover:bg-white/15', '') + ' dikte-kayit text-white bg-rose-500 hover:bg-rose-400';
    dugme.setAttribute('aria-pressed', 'true');
    dugme.setAttribute('aria-label', 'Sesle yazmayı durdur');
    balon.querySelector('[data-metin]').textContent = 'Dinliyorum… konuşabilirsiniz';
    balon.classList.remove('hidden');
    alan.classList.add('dikte-aktif');
    alan.focus();
  }

  function kur(alan) {
    if (alan.dataset.dikteKuruldu) return;
    alan.dataset.dikteKuruldu = '1';
    var sar = document.createElement('div');
    sar.className = 'relative';
    alan.parentNode.insertBefore(sar, alan);
    sar.appendChild(alan);
    alan.style.paddingRight = '48px';

    var dugme = document.createElement('button');
    dugme.type = 'button';
    dugme.dataset.sinif = 'dikte-dugme absolute right-2 ' + (alan.tagName === 'TEXTAREA' ? 'bottom-2' : 'top-1/2 -translate-y-1/2') +
      ' w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-violet-200 bg-white/[0.07] hover:bg-white/15 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed';
    dugme.className = dugme.dataset.sinif;
    dugme.innerHTML = MIC;
    dugme.setAttribute('aria-label', 'Sesle yaz');
    dugme.setAttribute('aria-pressed', 'false');
    if (!SR) {
      dugme.disabled = true;
      dugme.title = 'Bu tarayıcı sesli yazmayı desteklemiyor (Chrome veya Edge kullanın).';
    } else if (window.isSecureContext === false) {
      dugme.disabled = true;
      dugme.title = 'Sesli yazma mikrofon izni ister; tarayıcılar bunu yalnızca güvenli (https) bağlantıda verir. Telefondan Wi-Fi adresiyle açıldığında kullanılamaz.';
    } else {
      dugme.title = 'Sesle yaz (Alt+D) · “virgül”, “nokta”, “yeni satır” diyebilirsiniz. Ses, tarayıcının konuşma tanıma hizmetinde işlenir.';
    }
    sar.appendChild(dugme);

    var balon = document.createElement('div');
    balon.className = 'hidden pointer-events-none absolute left-0 right-0 top-full mt-1.5 z-30 flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-rose-50 border border-rose-300/30';
    balon.style.background = 'rgba(40,10,30,0.92)';
    balon.innerHTML = '<span class="dikte-dalga" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span data-metin class="truncate"></span>';
    balon.setAttribute('role', 'status');
    balon.setAttribute('aria-live', 'polite');
    sar.appendChild(balon);

    dugme.addEventListener('click', function () { if (SR) baslat(alan, dugme, balon); });
    alan.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'd' || e.key === 'D') && SR) { e.preventDefault(); baslat(alan, dugme, balon); }
    });
  }

  function hepsiniKur() { document.querySelectorAll('[data-dikte]').forEach(kur); }

  // Pencere kapanınca / Escape ile dikteyi durdur
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') durdur(); }, true);
  document.addEventListener('click', function (e) {
    if (aktif && e.target.closest && e.target.closest('[data-modal-kapat]')) durdur();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) durdur(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hepsiniKur);
  else hepsiniKur();

  window.KlinikDikte = { kur: kur, durdur: durdur, destekleniyor: !!SR };
})();
