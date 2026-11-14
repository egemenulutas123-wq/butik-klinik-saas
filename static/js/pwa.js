/*
 * Klinik SaaS — Uygulama olarak yükleme (PWA)
 */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  var bekleyen = null;
  var bagimsiz = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);

  function dugmeler() { return document.querySelectorAll('[data-pwa-yukle]'); }
  function goster(acik) { dugmeler().forEach(function (b) { b.classList.toggle('hidden', !acik); }); }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); bekleyen = e; goster(true); });
  window.addEventListener('appinstalled', function () {
    bekleyen = null; goster(false);
    if (window.Klinik && Klinik.bildir) Klinik.bildir('Uygulama yüklendi. Ana ekrandaki simgeden açabilirsiniz.');
  });

  function bilgi(m) { if (window.Klinik && Klinik.bildir) Klinik.bildir(m); else alert(m); }

  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-pwa-yukle]');
    if (!b) return;
    if (bekleyen) {
      bekleyen.prompt();
      try { await bekleyen.userChoice; } catch (x) {}
      bekleyen = null; goster(false);
    } else if (ios) {
      bilgi('Safari’de alttaki Paylaş düğmesine dokunup “Ana Ekrana Ekle”yi seçin.');
    } else if (!window.isSecureContext) {
      bilgi('Tam kurulum güvenli (https) bağlantı ister. Wi-Fi adresinde tarayıcı menüsünden “Ana ekrana ekle” ile kısayol oluşturabilirsiniz.');
    } else {
      bilgi('Tarayıcı menüsünden “Uygulamayı yükle” ya da “Ana ekrana ekle” seçeneğini kullanın.');
    }
  });

  // iOS ve güvenli olmayan bağlantıda da yönlendirme için düğmeyi göster (zaten yüklüyse gizle)
  document.addEventListener('DOMContentLoaded', function () { if (!bagimsiz && (ios || !window.isSecureContext)) goster(true); });
})();
