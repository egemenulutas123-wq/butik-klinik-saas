/*
 * Klinik SaaS — 3D vücut haritası (Three.js r149)
 * Cam görünümlü insan modeli; tıklanan noktaya ağrı/yara/şişlik vb. işaret konur,
 * işaretler muayeneye bağlanabilir, iyileşti olarak kapatılabilir.
 * Koordinatlar modelin kendi (yerel) uzayında saklanır; hastanın solu = +x, yüzü = +z.
 */
(function () {
  'use strict';

  var VERI = JSON.parse(document.getElementById('profilVeri').textContent);
  if (!VERI.doktor || !document.getElementById('vucutAlan')) return;

  var HASTA = VERI.hasta;
  var ISARETLER = VERI.isaretler || [];
  var TURLER = VERI.isaret_turleri || {};
  var MUAYENELER = VERI.muayeneler || [];
  var RENK = { agri: '#FB7185', yara: '#F59E0B', dokuntu: '#E879F9', sislik: '#38BDF8', kitle: '#A78BFA', morluk: '#818CF8', diger: '#5EEAD4' };

  function $(id) { return document.getElementById(id); }
  function el(t, c, m) { var e = document.createElement(t); if (c) e.className = c; if (m !== undefined && m !== null) e.textContent = m; return e; }
  function tarihMetni(iso) { var d = new Date(iso); return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }); }

  var alan = $('vucutAlan'), tuval = $('vucutTuval');
  var filtre = 'aktif';
  var secili = null;        // seçili işaret (kayıt) ya da { yeni: true, ... }
  var gorunur3d = false;

  // =====================================================================
  // Liste (3D olmasa da çalışır)
  // =====================================================================
  function filtreUygun(i) { return filtre === 'tum' || (filtre === 'aktif' ? i.aktif : !i.aktif); }

  function siddetCubugu(s) {
    var kap = el('span', 'inline-flex gap-[2px]');
    for (var k = 1; k <= 10; k++) {
      var c = el('span', 'w-[5px] h-2.5 rounded-[2px]');
      c.style.background = s !== null && k <= s ? 'hsl(' + (130 - k * 13) + ' 85% 62%)' : 'rgba(255,255,255,0.1)';
      kap.appendChild(c);
    }
    return kap;
  }

  function listeyiCiz() {
    document.querySelectorAll('.isaret-filtre').forEach(function (b) {
      var aktif = b.dataset.isaretFiltre === filtre;
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      b.className = 'isaret-filtre h-8 px-2.5 rounded-lg text-[12px] font-semibold transition-colors ' + (aktif ? 'bg-white text-[#1E0B4B]' : 'text-violet-100 hover:bg-white/10');
    });
    var kap = $('isaretListe');
    kap.innerHTML = '';
    var liste = ISARETLER.filter(filtreUygun);
    if (!liste.length) {
      var bos = el('div', 'md:col-span-2 2xl:col-span-1 py-10 px-4 text-center rounded-2xl border border-dashed border-white/15');
      bos.appendChild(el('div', 'text-[15px] font-semibold text-white', ISARETLER.length ? 'Bu filtrede işaret yok' : 'Henüz işaret yok'));
      bos.appendChild(el('div', 'mt-1 text-[13px] text-violet-300', 'Modelde ağrı, yara, şişlik gibi bulguların yerini tıklayarak işaretleyin.'));
      kap.appendChild(bos);
      return;
    }
    liste.forEach(function (i, n) {
      var aktif = secili && secili.id === i.id;
      var b = el('button', 'satir w-full text-left flex gap-3 p-3 rounded-2xl border transition-colors ' +
        (aktif ? 'border-white/40 bg-white/[0.1]' : 'border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.07]') + (i.aktif ? '' : ' opacity-70'));
      b.type = 'button';
      b.style.animationDelay = Math.min(n * 0.04, 0.5) + 's';
      var nokta = el('span', 'mt-1 w-3 h-3 shrink-0 rounded-full');
      nokta.style.background = i.aktif ? RENK[i.tur] : 'rgba(255,255,255,0.35)';
      if (i.aktif) nokta.style.boxShadow = '0 0 12px ' + RENK[i.tur];
      b.appendChild(nokta);
      var m = el('span', 'flex-1 min-w-0 flex flex-col gap-1');
      var ust = el('span', 'flex items-center justify-between gap-2');
      ust.appendChild(el('span', 'text-sm font-semibold text-white truncate', i.bolge_adi));
      ust.appendChild(el('span', 'shrink-0 text-[11px] text-violet-300 tabular-nums', tarihMetni(i.tarih)));
      m.appendChild(ust);
      var orta = el('span', 'flex items-center gap-2 text-[12px] text-violet-100');
      orta.appendChild(el('span', 'font-semibold', i.tur_adi));
      if (i.siddet !== null && i.siddet !== undefined) { orta.appendChild(siddetCubugu(i.siddet)); orta.appendChild(el('span', 'tabular-nums text-violet-300', i.siddet + '/10')); }
      m.appendChild(orta);
      if (i.notlar) m.appendChild(el('span', 'text-[12px] text-violet-300 line-clamp-2', i.notlar));
      var alt = [];
      if (i.muayene_tani) alt.push('Muayene: ' + i.muayene_tani);
      if (!i.aktif && i.iyilesme_tarihi) alt.push('İyileşti · ' + tarihMetni(i.iyilesme_tarihi));
      if (alt.length) m.appendChild(el('span', 'text-[11px] ' + (i.aktif ? 'text-teal-300' : 'text-emerald-300'), alt.join(' · ')));
      b.appendChild(m);
      b.addEventListener('click', function () { isaretSec(i, true); });
      kap.appendChild(b);
    });
  }

  document.querySelectorAll('.isaret-filtre').forEach(function (b) {
    b.addEventListener('click', function () { filtre = b.dataset.isaretFiltre; panelKapat(); listeyiCiz(); isaretleriGuncelle(); });
  });

  // Lejant
  (function () {
    var kap = $('vucutLejant');
    Object.keys(TURLER).forEach(function (k) {
      var s = el('span', 'inline-flex items-center gap-1.5');
      var n = el('span', 'w-2 h-2 rounded-full'); n.style.background = RENK[k]; n.style.boxShadow = '0 0 8px ' + RENK[k];
      s.appendChild(n); s.appendChild(document.createTextNode(TURLER[k]));
      kap.appendChild(s);
    });
  })();

  // =====================================================================
  // İşaret paneli
  // =====================================================================
  var panel = $('isaretPanel');
  var form = { tur: 'agri' };

  (function () {
    var sec = $('ipMuayene');
    MUAYENELER.forEach(function (m) { var o = el('option', '', m.etiket); o.value = m.id; sec.appendChild(o); });
  })();

  function turleriCiz() {
    var kap = $('ipTurler');
    kap.innerHTML = '';
    Object.keys(TURLER).forEach(function (k) {
      var aktif = form.tur === k;
      var b = el('button', 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all ' +
        (aktif ? 'text-[#1E0B4B] bg-white border-white' : 'text-violet-100 bg-white/5 border-white/15 hover:bg-white/10'));
      b.type = 'button';
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      var n = el('span', 'w-2 h-2 rounded-full'); n.style.background = RENK[k];
      b.appendChild(n); b.appendChild(document.createTextNode(TURLER[k]));
      b.addEventListener('click', function () { form.tur = k; turleriCiz(); hayaletRenk(); });
      kap.appendChild(b);
    });
  }

  function siddetGoster() {
    var v = Number($('ipSiddet').value);
    var etiket = v === 0 ? 'Yok' : v <= 3 ? 'Hafif' : v <= 6 ? 'Orta' : v <= 8 ? 'Şiddetli' : 'Çok şiddetli';
    var d = $('ipSiddetDeger');
    d.textContent = v + '/10 · ' + etiket;
    d.style.color = 'hsl(' + (130 - v * 13) + ' 85% 70%)';
  }
  $('ipSiddet').addEventListener('input', siddetGoster);

  function panelAc(kayit, ekranNokta) {
    var yeni = !!kayit.yeni;
    $('ipDurum').textContent = yeni ? 'Yeni işaret' : (kayit.aktif ? 'Aktif bulgu' : 'İyileşmiş bulgu');
    $('ipDurum').className = 'text-[11px] font-semibold uppercase tracking-[0.1em] ' + (yeni ? 'text-teal-300' : kayit.aktif ? 'text-rose-300' : 'text-emerald-300');
    $('ipBolge').textContent = kayit.bolge_adi;
    form.tur = kayit.tur || 'agri';
    $('ipSiddet').value = kayit.siddet === null || kayit.siddet === undefined ? (yeni ? 5 : 0) : kayit.siddet;
    $('ipNot').value = kayit.notlar || '';
    var bugunku = MUAYENELER.find(function (m) { return m.bugun; });
    $('ipMuayene').value = yeni ? (bugunku ? bugunku.id : '') : (kayit.muayene_id || '');
    $('ipSil').classList.toggle('hidden', yeni);
    var iy = $('ipIyilesti');
    iy.classList.toggle('hidden', yeni);
    iy.textContent = kayit.aktif ? 'İyileşti ✓' : 'Yeniden aktif et';
    $('ipKaydet').textContent = yeni ? 'İşaretle' : 'Güncelle';
    var bilgi = $('ipBilgi');
    bilgi.classList.toggle('hidden', yeni);
    if (!yeni) bilgi.textContent = tarihMetni(kayit.tarih) + (kayit.doktor ? ' · ' + kayit.doktor : '');
    turleriCiz();
    siddetGoster();

    panel.classList.remove('hidden');
    panel.classList.add('flex');
    konumla(ekranNokta);
    setTimeout(function () { $('ipNot').focus({ preventScroll: true }); }, 50);
  }

  function konumla(p) {
    var kutu = alan.getBoundingClientRect();
    var g = panel.offsetWidth || 300, y = panel.offsetHeight || 380;
    if (kutu.width < 620 || !p) {
      panel.style.left = '12px'; panel.style.right = '12px'; panel.style.top = 'auto'; panel.style.bottom = '12px'; panel.style.width = 'auto';
      return;
    }
    panel.style.width = ''; panel.style.right = 'auto'; panel.style.bottom = 'auto';
    var x = p.x + 24 + g < kutu.width - 12 ? p.x + 24 : p.x - 24 - g;
    x = Math.max(12, Math.min(x, kutu.width - g - 12));
    var top = Math.max(12, Math.min(p.y - y / 2, kutu.height - y - 12));
    panel.style.left = x + 'px';
    panel.style.top = top + 'px';
  }

  function panelKapat() {
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    if (secili && secili.yeni) hayaletGizle();
    secili = null;
    isaretleriGuncelle();
    listeyiCiz();
  }
  $('ipKapat').addEventListener('click', panelKapat);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.classList.contains('hidden')) panelKapat(); });

  panel.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!secili) return;
    var b = $('ipKaydet');
    b.disabled = true;
    var veri = { tur: form.tur, siddet: Number($('ipSiddet').value), notlar: $('ipNot').value, muayene_id: $('ipMuayene').value || null };
    try {
      if (secili.yeni) {
        var s = await Klinik.jsonGonder('/api/vucut_isareti', Object.assign({
          hasta_id: HASTA.id, bolge: secili.bolge, bolge_adi: secili.bolge_adi,
          x: secili.x, y: secili.y, z: secili.z, nx: secili.nx, ny: secili.ny, nz: secili.nz
        }, veri));
        ISARETLER.unshift(s.isaret);
        hayaletGizle();
        Klinik.bildir(s.mesaj);
        secili = null;
        panel.classList.add('hidden'); panel.classList.remove('flex');
        if (filtre === 'gecmis') filtre = 'aktif';
        isaretEkle3d(s.isaret, true);
      } else {
        var s2 = await Klinik.jsonGonder('/api/vucut_isareti/' + secili.id, veri, 'PUT');
        Object.assign(secili, s2.isaret);
        Klinik.bildir(s2.mesaj);
        panelKapat();
      }
      listeyiCiz();
      isaretleriGuncelle();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
    b.disabled = false;
  });

  $('ipIyilesti').addEventListener('click', async function () {
    if (!secili || secili.yeni) return;
    try {
      var s = await Klinik.jsonGonder('/api/vucut_isareti/' + secili.id, { aktif: !secili.aktif }, 'PUT');
      Object.assign(secili, s.isaret);
      Klinik.bildir(s.mesaj);
      panelKapat();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });

  $('ipSil').addEventListener('click', async function () {
    if (!secili || secili.yeni) return;
    var hedef = secili;
    if (!(await Klinik.onayla(hedef.bolge_adi + ' işareti kalıcı olarak silinecek.'))) return;
    try {
      var s = await Klinik.jsonGonder('/api/vucut_isareti/' + hedef.id, null, 'DELETE');
      ISARETLER = ISARETLER.filter(function (x) { return x.id !== hedef.id; });
      isaretKaldir3d(hedef.id);
      Klinik.bildir(s.mesaj);
      panelKapat();
    } catch (h) { Klinik.bildir(h.message, 'hata'); }
  });

  // Muayene geçmişindeki işaret çiplerinden haritaya git
  document.querySelectorAll('[data-isaret-git]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = ISARETLER.find(function (x) { return String(x.id) === b.dataset.isaretGit; });
      if (!i) return;
      if (!filtreUygun(i)) { filtre = 'tum'; listeyiCiz(); isaretleriGuncelle(); }
      $('vucutBolum').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { isaretSec(i, true); }, 450);
    });
  });

  // =====================================================================
  // 3D sahne
  // =====================================================================
  var T = window.THREE, K3 = window.Klinik3D;
  var renderer, scene, camera, govde, isaretGrubu, hayalet, raycaster, isaretNesneleri = {};
  var MODEL_ADRESI = (document.getElementById('vucutAlan').dataset.model) || '/static/models/insan.bin';
  var durum = { rotY: 0, rotX: 0.04, hedefY: 0, hedefX: 0.04, mesafe: 9.2, hedefMesafe: 9.2, odakY: 0, hedefOdakY: 0 };
  var saat;

  function yedekGoster() {
    var y = $('vucutYedek');
    y.classList.remove('hidden'); y.classList.add('flex');
    tuval.style.display = 'none';
    ['vucutIpucu', 'vucutLejant'].forEach(function (id) { $(id).style.display = 'none'; });
    document.querySelectorAll('[data-yakinlas],[data-sifirla],.gorunum-dugme').forEach(function (b) { b.disabled = true; b.style.opacity = 0.4; });
  }

  function modelCoz(ab) {
    var dv = new DataView(ab);
    var uz = dv.getUint32(0, true);
    var b = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, uz)));
    var ofs = Math.ceil((4 + uz) / 4) * 4;
    var ham = new Int16Array(ab, ofs, b.n * 3);
    var nh = new Int8Array(ab, ofs + b.n * 6, b.n * 3);
    var indOfs = Math.ceil((ofs + b.n * 9) / 4) * 4;
    var ind = new Uint16Array(ab, indOfs, b.ic);
    var poz = new Float32Array(b.n * 3), nor = new Float32Array(b.n * 3);
    for (var i = 0; i < b.n * 3; i++) {
      var k = i % 3;
      poz[i] = b.min[k] + (ham[i] + 32767) / 65534 * b.boyut[k];
      nor[i] = nh[i] / 127;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(poz, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setIndex(new T.BufferAttribute(ind, 1));
    geo.computeBoundingSphere();
    return { geo: geo, nokta: b.nokta };
  }

  var N = null;           // iskelet noktaları (modelden)
  var govdeMesh = null, imlecHalka = null, kalp = null, kalpIsik = null, akcigerler = [];

  async function kur() {
    if (!T || !K3) { yedekGoster(); return false; }
    var yukleniyor = el('div', 'pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-violet-300', 'Anatomik model yükleniyor…');
    alan.appendChild(yukleniyor);
    var model;
    try {
      var y = await fetch(MODEL_ADRESI);
      if (!y.ok) throw new Error('model');
      model = modelCoz(await y.arrayBuffer());
      var o = K3.hazirla(tuval, '#0D0824', '#120A2E');
      renderer = o.renderer; scene = o.scene;
    } catch (e) { yukleniyor.remove(); yedekGoster(); return false; }
    yukleniyor.remove();
    N = model.nokta;
    scene.fog.density = 0.02;
    scene.background = new T.Color('#110A2B');
    camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    raycaster = new T.Raycaster();

    var arkaIsik = new T.PointLight('#5EEAD4', 2.2, 20); arkaIsik.position.set(0, 2, -5); scene.add(arkaIsik);
    var onIsik = new T.PointLight('#C4B5FD', 1.2, 20); onIsik.position.set(-3, 1, 6); scene.add(onIsik);

    govde = new T.Group();
    scene.add(govde);

    // --- Cam deri ---
    var deri = new T.MeshPhysicalMaterial({
      color: '#A99BF7', roughness: 0.22, metalness: 0, transmission: 0.95, thickness: 0.6, ior: 1.3,
      clearcoat: 0.8, clearcoatRoughness: 0.12, iridescence: 0.35, iridescenceIOR: 1.3, envMapIntensity: 0.9,
      attenuationColor: new T.Color('#6D28D9'), attenuationDistance: 1.6, emissive: new T.Color('#1E0F52'), emissiveIntensity: 0.3
    });
    govdeMesh = new T.Mesh(model.geo, deri);
    govde.add(govdeMesh);

    // Hologram kenar parlaması (Fresnel)
    var kenar = new T.Mesh(model.geo, new T.ShaderMaterial({
      uniforms: { renk: { value: new T.Color('#7DD3FC') }, guc: { value: 2.6 }, yogunluk: { value: 1.1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 renk; uniform float guc; uniform float yogunluk; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), guc) * yogunluk; gl_FragColor = vec4(renk * f, f); }',
      transparent: true, blending: T.AdditiveBlending, depthWrite: false
    }));
    kenar.scale.setScalar(1.004);
    kenar.raycast = function () {};
    govde.add(kenar);

    // --- İç anatomi: iskelet, kaburgalar, kalp, akciğerler ---
    var ic = new T.Group();
    govde.add(ic);
    function ustte(o) { o.renderOrder = 5; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } }
    var v3 = function (a) { return new T.Vector3(a[0], a[1], a[2]); };
    var kemikMat = new T.LineBasicMaterial({ color: '#99F6E4', transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
    var cizgiler = [];
    function hat(a, b) { cizgiler.push(v3(a), v3(b)); }
    var omurga = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
    for (var i = 0; i < omurga.length - 1; i++) hat(N[omurga[i]], N[omurga[i + 1]]);
    ['Left', 'Right'].forEach(function (t) {
      hat(N.Spine2, N[t + 'Shoulder']); hat(N[t + 'Shoulder'], N[t + 'Arm']);
      hat(N[t + 'Arm'], N[t + 'ForeArm']); hat(N[t + 'ForeArm'], N[t + 'Hand']); hat(N[t + 'Hand'], N[t + 'HandMiddle4']);
      hat(N.Hips, N[t + 'UpLeg']); hat(N[t + 'UpLeg'], N[t + 'Leg']); hat(N[t + 'Leg'], N[t + 'Foot']); hat(N[t + 'Foot'], N[t + 'Toe_End']);
    });
    var iskelet = new T.LineSegments(new T.BufferGeometry().setFromPoints(cizgiler), kemikMat);
    iskelet.raycast = function () {};
    ic.add(iskelet);
    // Eklemler
    var eklemGeo = new T.SphereGeometry(0.025, 14, 10);
    var eklemMat = new T.MeshBasicMaterial({ color: '#CCFBF1', transparent: true, opacity: 0.85, toneMapped: false });
    ['Neck', 'Spine2', 'Spine1', 'Spine', 'Hips', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand',
     'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'].forEach(function (ad) {
      var e = new T.Mesh(eklemGeo, eklemMat); e.position.copy(v3(N[ad])); e.raycast = function () {}; ic.add(e);
    });
    // Kaburgalar (göğüs kafesi) ve leğen kemiği halkası
    var kaburgaMat = new T.LineBasicMaterial({ color: '#C4B5FD', transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false });
    var gUst = N.Neck[1] - 0.12, gAlt = N.Spine1[1] + 0.02;
    var gz = N.GogusMerkez ? N.GogusMerkez[2] : N.Spine2[2] + 0.02;
    var gDerin = N.GogusMerkez ? N.GogusMerkez[3] : 0.3;
    for (var r = 0; r < 7; r++) {
      var oran = r / 6, yy = gUst - (gUst - gAlt) * oran;
      var rx = 0.13 + Math.sin(oran * Math.PI * 0.85) * 0.11, rz = gDerin * (0.3 + Math.sin(oran * Math.PI * 0.8) * 0.1);
      var egri = new T.EllipseCurve(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
      var pts = egri.getPoints(48).map(function (p) { return new T.Vector3(p.x, yy - Math.abs(p.x) * 0.25, p.y + gz); });
      ic.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), kaburgaMat));
    }
    var legen = new T.EllipseCurve(0, 0, 0.22, 0.11, 0, Math.PI * 2, false, 0);
    var legenZ = (N.LeftUpLeg[2] + N.RightUpLeg[2]) / 2;
    ic.add(new T.Line(new T.BufferGeometry().setFromPoints(legen.getPoints(48).map(function (p) { return new T.Vector3(p.x, N.Hips[1] + 0.02 + Math.abs(p.x) * 0.15, p.y + legenZ); })), kaburgaMat));
    var kafa = new T.EllipseCurve(0, 0, 0.17, 0.2, 0, Math.PI * 2, false, 0);
    var kafaY = (N.Head[1] + N.HeadTop_End[1]) / 2;
    var kafaZ = N.Head[2];
    ic.add(new T.Line(new T.BufferGeometry().setFromPoints(kafa.getPoints(48).map(function (p) { return new T.Vector3(0, p.y + kafaY, kafaZ + p.x * 1.05); })), kaburgaMat));
    ic.add(new T.Line(new T.BufferGeometry().setFromPoints(kafa.getPoints(48).map(function (p) { return new T.Vector3(p.x * 0.85, p.y + kafaY, kafaZ); })), kaburgaMat));
    // Akciğerler (nefesle parlayan iki yumuşak ışık)
    [-1, 1].forEach(function (yon) {
      var a = new T.Sprite(new T.SpriteMaterial({ map: K3.isikDokusu('rgba(125,211,252,1)'), transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false }));
      a.position.set(yon * 0.12, (gUst + gAlt) / 2 + 0.03, gz);
      a.scale.set(0.42, 0.62, 1);
      ic.add(a); akcigerler.push(a);
    });
    // Kalp: hastanın solu (+x), göğüs ortası
    kalp = new T.Mesh(new T.SphereGeometry(0.055, 24, 18), new T.MeshBasicMaterial({ color: '#FB7185', toneMapped: false }));
    kalp.position.set(0.05, (gUst + gAlt) / 2 + 0.02, gz + gDerin * 0.12);
    kalp.scale.set(1, 1.15, 0.9);
    kalp.raycast = function () {};
    ic.add(kalp);
    kalpIsik = new T.Sprite(new T.SpriteMaterial({ map: K3.isikDokusu('rgba(251,113,133,1)'), transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
    kalpIsik.scale.set(0.5, 0.5, 1);
    kalpIsik.position.copy(kalp.position);
    ic.add(kalpIsik);
    ic.traverse(function (o) { if (o !== ic) { ustte(o); o.raycast = function () {}; } });

    // Fare imleci halkası
    imlecHalka = new T.Mesh(new T.RingGeometry(0.035, 0.05, 40), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    imlecHalka.visible = false;
    imlecHalka.raycast = function () {};
    govde.add(imlecHalka);

    // Zemin platformu ve tarama halkası
    var platform = new T.Mesh(new T.RingGeometry(0.55, 0.62, 96), new T.MeshBasicMaterial({ color: '#5EEAD4', transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    platform.rotation.x = -Math.PI / 2; platform.position.y = -2.08; scene.add(platform);
    var platform2 = new T.Mesh(new T.CircleGeometry(0.9, 64), new T.MeshBasicMaterial({ map: K3.isikDokusu('rgba(139,92,246,1)'), transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    platform2.rotation.x = -Math.PI / 2; platform2.position.y = -2.09; scene.add(platform2);
    var tarama = new T.Mesh(new T.RingGeometry(0.62, 0.66, 96), new T.MeshBasicMaterial({ color: '#A78BFA', transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    tarama.rotation.x = -Math.PI / 2; scene.add(tarama);
    var parca2 = K3.parcaciklar(scene, 'rgba(196,181,253,1)', 160, [8, 6, 6]);
    parca2.position.set(-1.5, 0, 0);

    isaretGrubu = new T.Group();
    govde.add(isaretGrubu);
    ISARETLER.forEach(function (i) { isaretEkle3d(i, false); });
    hayaletKur();

    saat = new T.Clock();
    var sonW = 0, sonH = 0;
    function dongu() {
      requestAnimationFrame(dongu);
      if (!gorunur3d || document.hidden) { saat.getDelta(); return; }
      var w = tuval.clientWidth, h = tuval.clientHeight;
      if (!w || !h) return;
      if (w !== sonW || h !== sonH) {
        sonW = w; sonH = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      var dt = Math.min(saat.getDelta(), 0.05), z = saat.elapsedTime;
      var yumus = 1 - Math.pow(0.0015, dt);
      durum.rotY += (durum.hedefY - durum.rotY) * yumus;
      durum.rotX += (durum.hedefX - durum.rotX) * yumus;
      durum.mesafe += (durum.hedefMesafe - durum.mesafe) * yumus;
      durum.odakY += (durum.hedefOdakY - durum.odakY) * yumus;
      govde.rotation.y = durum.rotY;
      govde.rotation.x = durum.rotX;
      camera.position.set(0, durum.odakY + 0.15, durum.mesafe);
      camera.lookAt(0, durum.odakY, 0);

      if (!K3.azHareket) {
        // Kalp atışı (~72/dk, çift vuruş) ve nefes (~14/dk)
        var f = (z * 1.2) % 1;
        var vurus = Math.exp(-Math.pow((f - 0.08) / 0.045, 2)) + 0.6 * Math.exp(-Math.pow((f - 0.3) / 0.05, 2));
        kalp.scale.set(1 + vurus * 0.28, 1.15 + vurus * 0.3, 0.9 + vurus * 0.25);
        kalpIsik.material.opacity = 0.45 + vurus * 0.55;
        kalpIsik.scale.setScalar(0.45 + vurus * 0.25);
        var nefes = 0.5 + 0.5 * Math.sin(z * 1.47);
        akcigerler.forEach(function (a) { a.material.opacity = 0.16 + nefes * 0.2; a.scale.set(0.4 + nefes * 0.05, 0.6 + nefes * 0.06, 1); });
      }

      var ty = ((z * 0.35) % 1) * 4.2 - 2.1;
      tarama.position.y = ty;
      tarama.material.opacity = 0.35 * Math.sin(((ty + 2.1) / 4.2) * Math.PI);
      platform.rotation.z += dt * 0.3;
      parca2.rotation.y = z * 0.03;

      Object.keys(isaretNesneleri).forEach(function (id) {
        var n = isaretNesneleri[id], k = n.userData.kayit;
        if (!n.visible) return;
        var seciliMi = secili && secili.id === k.id;
        var faz = (z * (k.aktif ? 0.9 : 0) + n.userData.faz) % 1;
        n.userData.halka.scale.setScalar(1 + faz * 2.4);
        n.userData.halka.material.opacity = k.aktif ? (1 - faz) * 0.8 : 0;
        var hedefOlcek = (seciliMi ? 1.6 : 1) * n.userData.taban;
        n.userData.cekirdek.scale.lerp(new T.Vector3(hedefOlcek, hedefOlcek, hedefOlcek), 0.2);
        n.userData.parilti.material.opacity = k.aktif ? 0.55 + 0.25 * Math.sin(z * 3 + n.userData.faz * 6) : 0.18;
        n.userData.cerceve.visible = seciliMi;
      });
      if (hayalet.visible) {
        var hf = (z * 1.4) % 1;
        hayalet.userData.halka.scale.setScalar(1 + hf * 2.2);
        hayalet.userData.halka.material.opacity = (1 - hf) * 0.9;
      }

      renderer.render(scene, camera);
      if (!panel.classList.contains('hidden') && secili) panelTakip();
    }
    dongu();

    if ('IntersectionObserver' in window) new IntersectionObserver(function (g) { gorunur3d = g[0].isIntersecting; }).observe(alan);
    else gorunur3d = true;
    etkilesimKur();
    return true;
  }

  // Kaydedilmiş işareti, kendi bölgesindeki en yakın yüzey noktasına oturt
  // (model değişse bile eski kayıtlar doğru bölgede görünür)
  var PARCA_ADLARI = ['ust_kol', 'on_kol', 'baldir', 'pelvis', 'dirsek', 'boyun', 'gogus', 'karin', 'uyluk', 'omuz', 'ayak', 'bas', 'diz', 'el'];
  var tepeParcalari = null;
  function anahtarCoz(a) {
    a = a || '';
    var parca = PARCA_ADLARI.find(function (p) { return a === p || a.indexOf(p + '_') === 0; }) || '';
    var taraf = /_sol(_|$)/.test(a) ? 'sol' : /_sag(_|$)/.test(a) ? 'sag' : '';
    return { parca: parca, taraf: taraf };
  }
  function tepeleriSiniflandir() {
    if (tepeParcalari) return tepeParcalari;
    var p = govdeMesh.geometry.attributes.position.array, nr = govdeMesh.geometry.attributes.normal.array;
    var v = new T.Vector3(), n = new T.Vector3();
    tepeParcalari = [];
    for (var i = 0; i < p.length; i += 3) {
      v.set(p[i], p[i + 1], p[i + 2]); n.set(nr[i], nr[i + 1], nr[i + 2]);
      tepeParcalari.push(anahtarCoz(bolgeBul(null, v, n).anahtar));
    }
    return tepeParcalari;
  }
  function yuzeyeOturt(k) {
    if (!govdeMesh) return k;
    var p = govdeMesh.geometry.attributes.position.array, nr = govdeMesh.geometry.attributes.normal.array;
    var hedef = anahtarCoz(k.bolge);
    var sinif = hedef.parca ? tepeleriSiniflandir() : null;
    function ara(filtreli) {
      var enIyi = -1, enKisa = Infinity;
      for (var i = 0, j = 0; i < p.length; i += 3, j++) {
        if (filtreli) {
          var c = sinif[j];
          if (c.parca !== hedef.parca || (hedef.taraf && c.taraf && c.taraf !== hedef.taraf)) continue;
        }
        var dx = p[i] - k.x, dy = p[i + 1] - k.y, dz = p[i + 2] - k.z;
        var d = dx * dx + dy * dy + dz * dz;
        if (d < enKisa) { enKisa = d; enIyi = i; }
      }
      return enIyi;
    }
    var i = sinif ? ara(true) : -1;
    if (i < 0) i = ara(false);
    if (i < 0) return k;
    return { x: p[i], y: p[i + 1], z: p[i + 2], nx: nr[i], ny: nr[i + 1], nz: nr[i + 2] };
  }

  // ---------- İşaret nesneleri ----------
  function isaretNesnesi(renk) {
    var g = new T.Group();
    var cekirdek = new T.Mesh(new T.SphereGeometry(0.045, 20, 14), new T.MeshBasicMaterial({ color: renk, toneMapped: false }));
    var parilti = new T.Sprite(new T.SpriteMaterial({ map: K3.isikDokusu('rgba(255,255,255,1)'), color: renk, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
    parilti.scale.set(0.38, 0.38, 1);
    var halka = new T.Mesh(new T.RingGeometry(0.06, 0.074, 48), new T.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    var cerceve = new T.Mesh(new T.RingGeometry(0.1, 0.115, 48), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide }));
    cerceve.visible = false;
    var vurus = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshBasicMaterial({ visible: false }));
    g.add(cekirdek); g.add(parilti); g.add(halka); g.add(cerceve); g.add(vurus);
    g.userData = { cekirdek: cekirdek, parilti: parilti, halka: halka, cerceve: cerceve, vurus: vurus, faz: Math.random(), taban: 1 };
    return g;
  }

  function yonlendir(g, k) {
    g.position.set(k.x, k.y, k.z);
    var n = new T.Vector3(k.nx || 0, k.ny || 0, k.nz || 1);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    g.position.addScaledVector(n, 0.02);
    var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n);
    g.userData.halka.quaternion.copy(q);
    g.userData.cerceve.quaternion.copy(q);
  }

  function isaretRenkle(g, k) {
    var renk = new T.Color(k.aktif ? RENK[k.tur] || '#fff' : '#9CA3AF');
    g.userData.cekirdek.material.color.copy(renk);
    g.userData.parilti.material.color.copy(renk);
    g.userData.halka.material.color.copy(renk);
    g.userData.taban = k.aktif ? 0.8 + (k.siddet || 0) * 0.07 : 0.7;
  }

  function isaretEkle3d(k, canli) {
    if (!isaretGrubu) return;
    var g = isaretNesnesi(RENK[k.tur] || '#fff');
    g.userData.kayit = k;
    g.userData.konum = yuzeyeOturt(k);
    yonlendir(g, g.userData.konum);
    isaretRenkle(g, k);
    if (canli) { g.userData.cekirdek.scale.setScalar(0.01); }
    isaretGrubu.add(g);
    isaretNesneleri[k.id] = g;
    g.visible = filtreUygun(k);
  }

  function isaretKaldir3d(id) {
    var g = isaretNesneleri[id];
    if (g) { isaretGrubu.remove(g); delete isaretNesneleri[id]; }
  }

  function isaretleriGuncelle() {
    if (!isaretGrubu) return;
    Object.keys(isaretNesneleri).forEach(function (id) {
      var g = isaretNesneleri[id], k = g.userData.kayit;
      isaretRenkle(g, k);
      g.visible = filtreUygun(k);
    });
  }

  // ---------- Yeni işaret önizlemesi ----------
  function hayaletKur() {
    hayalet = isaretNesnesi('#FFFFFF');
    hayalet.visible = false;
    isaretGrubu.add(hayalet);
  }
  function hayaletRenk() {
    if (!hayalet) return;
    var r = new T.Color(RENK[form.tur]);
    hayalet.userData.cekirdek.material.color.copy(r);
    hayalet.userData.parilti.material.color.copy(r);
    hayalet.userData.halka.material.color.copy(r);
  }
  function hayaletGizle() { if (hayalet) hayalet.visible = false; }

  // ---------- Bölge adlandırma (en yakın iskelet parçasına göre) ----------
  var TARAF = { sol: 'Sol', sag: 'Sağ', '': '' };
  var SEGMENTLER = null;
  function segmentler() {
    if (SEGMENTLER) return SEGMENTLER;
    var L = [];
    function ek(ad, a, b, r, taraf) { L.push({ ad: ad, a: new T.Vector3().fromArray(a), b: new T.Vector3().fromArray(b), r: r, taraf: taraf || '' }); }
    ek('bas', N.Head, N.HeadTop_End, 0.3);
    ek('boyun', N.Neck, N.Head, 0.13);
    ek('gogus', N.Spine2, N.Neck, 0.34);
    ek('karin', [N.Spine[0], N.Hips[1] + 0.14, N.Spine[2]], N.Spine2, 0.32);
    ek('pelvis', [N.Hips[0], N.Hips[1] - 0.3, N.Hips[2]], [N.Hips[0], N.Hips[1] + 0.1, N.Hips[2]], 0.33);
    [['Left', 'sol'], ['Right', 'sag']].forEach(function (t) {
      var b = t[0], k = t[1];
      ek('omuz', N[b + 'Shoulder'], N[b + 'Arm'], 0.15, k);
      ek('ust_kol', N[b + 'Arm'], N[b + 'ForeArm'], 0.1, k);
      ek('on_kol', N[b + 'ForeArm'], N[b + 'Hand'], 0.08, k);
      ek('el', N[b + 'Hand'], N[b + 'HandMiddle4'], 0.07, k);
      ek('uyluk', N[b + 'UpLeg'], N[b + 'Leg'], 0.16, k);
      ek('baldir', N[b + 'Leg'], N[b + 'Foot'], 0.11, k);
      ek('ayak', N[b + 'Foot'], N[b + 'Toe_End'], 0.08, k);
    });
    SEGMENTLER = L;
    return L;
  }
  function segmentUzaklik(p, s) {
    var ab = s.b.clone().sub(s.a), ap = p.clone().sub(s.a);
    var t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
    return s.a.clone().addScaledVector(ab, t).distanceTo(p);
  }
  function bolgeBul(m, p, n) {
    var enIyi = null, puan = Infinity;
    segmentler().forEach(function (s) {
      var d = segmentUzaklik(p, s) / s.r;
      if (d < puan) { puan = d; enIyi = s; }
    });
    var ad = enIyi.ad, taraf = enIyi.taraf;
    var gTaraf = taraf || (p.x > 0.07 ? 'sol' : p.x < -0.07 ? 'sag' : '');
    var arka = n.z < -0.25;
    var Tr = TARAF[gTaraf];
    var Bt = taraf === 'sol' ? 'Left' : 'Right';
    // Eklemler
    if ((ad === 'uyluk' || ad === 'baldir') && p.distanceTo(new T.Vector3().fromArray(N[Bt + 'Leg'])) < 0.17) ad = 'diz';
    if ((ad === 'ust_kol' || ad === 'on_kol') && p.distanceTo(new T.Vector3().fromArray(N[Bt + 'ForeArm'])) < 0.11) ad = 'dirsek';
    if (ad === 'on_kol' && p.distanceTo(new T.Vector3().fromArray(N[Bt + 'Hand'])) < 0.06) ad = 'el';
    var anahtar = ad + (gTaraf ? '_' + gTaraf : '');
    var isim;
    switch (ad) {
      case 'bas':
        var yuzY = (N.Head[1] + N.HeadTop_End[1]) / 2;
        if (Math.abs(n.x) > 0.75) { isim = Tr + ' şakak / kulak'; anahtar += '_yan'; }
        else if (arka) { isim = 'Başın arkası'; anahtar = 'bas_arka'; }
        else if (p.y > yuzY + 0.1) { isim = 'Alın'; anahtar = 'bas_alin'; }
        else { isim = 'Yüz'; anahtar = 'bas_yuz'; }
        break;
      case 'boyun': isim = arka ? 'Ense' : (Tr && Math.abs(n.x) > 0.6 ? 'Boyun (' + Tr.toLowerCase() + ')' : 'Boyun (ön)'); anahtar = arka ? 'boyun_arka' : 'boyun_on'; break;
      case 'gogus': isim = arka ? (Tr ? Tr + ' sırt (üst)' : 'Sırt (üst)') : (Tr ? Tr + ' göğüs' : 'Göğüs'); break;
      case 'karin':
        var ust = p.y > (N.Spine1[1] + N.Spine[1]) / 2 + 0.05;
        if (arka) isim = Tr ? Tr + ' bel' : 'Bel';
        else if (Tr) isim = Tr + (ust ? ' üst' : ' alt') + ' karın';
        else isim = ust ? 'Mide bölgesi (epigastrik)' : 'Göbek çevresi';
        anahtar += ust ? '_ust' : '_alt';
        break;
      case 'pelvis': isim = arka ? (Tr ? Tr + ' kalça' : 'Kuyruk sokumu') : (Tr ? Tr + ' kasık' : 'Kasık / pelvis'); break;
      case 'omuz': isim = Tr + ' omuz'; break;
      case 'ust_kol': isim = Tr + ' üst kol'; break;
      case 'dirsek': isim = Tr + ' dirsek'; break;
      case 'on_kol': isim = Tr + ' ön kol'; break;
      case 'el': isim = Tr + ' el / bilek'; break;
      case 'uyluk': isim = Tr + ' uyluk' + (arka ? ' (arka)' : ''); break;
      case 'diz': isim = arka ? Tr + ' diz arkası' : Tr + ' diz'; break;
      case 'baldir': isim = arka ? Tr + ' baldır' : Tr + ' kaval kemiği'; break;
      case 'ayak': isim = Tr + ' ayak / ayak bileği'; break;
      default: isim = 'Bölge';
    }
    if (['bas', 'boyun'].indexOf(ad) === -1) anahtar += arka ? '_arka' : '_on';
    return { anahtar: anahtar.slice(0, 40), ad: isim.trim() };
  }

  // ---------- Etkileşim ----------
  var imlecler = {}, surukle = null, tutamUzaklik = 0, ustundeki = null, ekranNokta = null;

  function ndc(e) {
    var r = tuval.getBoundingClientRect();
    return new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function isaretVurusu(v) {
    raycaster.setFromCamera(v, camera);
    var hedefler = [];
    Object.keys(isaretNesneleri).forEach(function (id) { var g = isaretNesneleri[id]; if (g.visible) hedefler.push(g.userData.vurus); });
    var s = raycaster.intersectObjects(hedefler, false);
    if (!s.length) return null;
    var bulunan = null;
    Object.keys(isaretNesneleri).forEach(function (id) { if (isaretNesneleri[id].userData.vurus === s[0].object) bulunan = isaretNesneleri[id]; });
    // Modelin arkasında kalan işaretler gövdenin içinden tıklanamasın
    var g = govdeVurusu(v);
    if (bulunan && g && g.distance + 0.12 < s[0].distance) return null;
    return bulunan;
  }

  function govdeVurusu(v) {
    raycaster.setFromCamera(v, camera);
    var s = govdeMesh ? raycaster.intersectObject(govdeMesh, false) : [];
    return s.length ? s[0] : null;
  }

  function vurgula(vurus) {
    if (!imlecHalka) return;
    if (!vurus) { imlecHalka.visible = false; return; }
    var yb = yerelBilgi(vurus);
    imlecHalka.position.copy(yb.p).addScaledVector(yb.n, 0.015);
    imlecHalka.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), yb.n.clone().normalize());
    imlecHalka.visible = true;
  }

  function etiketGoster(metin) {
    var e = $('vucutEtiket');
    if (metin) { e.querySelector('[data-metin]').textContent = metin; e.style.opacity = 1; }
    else e.style.opacity = 0;
  }

  function yerelBilgi(vurus) {
    var p = govde.worldToLocal(vurus.point.clone());
    var nDunya = vurus.face.normal.clone().transformDirection(vurus.object.matrixWorld);
    var ters = new T.Matrix4().copy(govde.matrixWorld).invert();
    var n = nDunya.transformDirection(ters);
    return { p: p, n: n };
  }

  function ekranKonumu(yerel) {
    var v = govde.localToWorld(yerel.clone()).project(camera);
    var r = tuval.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }

  function panelTakip() {
    if (!secili) return;
    var kutu = alan.getBoundingClientRect();
    if (kutu.width < 620) return;
    var kp = konumu(secili); var nokta = ekranKonumu(new T.Vector3(kp.x, kp.y, kp.z));
    if (!ekranNokta || Math.abs(nokta.x - ekranNokta.x) > 1 || Math.abs(nokta.y - ekranNokta.y) > 1) {
      ekranNokta = nokta;
      konumla(nokta);
    }
  }

  function enYakinAci(hedef) {
    var fark = ((hedef - durum.hedefY) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return durum.hedefY + fark;
  }

  function konumu(k) {
    var g = k && k.id && isaretNesneleri[k.id];
    return g && g.userData.konum ? g.userData.konum : k;
  }

  function odaklan(k) {
    k = konumu(k);
    durum.hedefY = enYakinAci(Math.atan2(-k.x, k.z));
    durum.hedefX = 0.04;
    durum.hedefOdakY = Math.max(-1.4, Math.min(1.3, k.y * 0.75));
    durum.hedefMesafe = 6.4;
  }

  function isaretSec(k, odak) {
    if (secili && secili.yeni) hayaletGizle();
    secili = k;
    listeyiCiz();
    isaretleriGuncelle();
    if (renderer && odak) {
      odaklan(k);
      setTimeout(function () { var kp = konumu(k); ekranNokta = ekranKonumu(new T.Vector3(kp.x, kp.y, kp.z)); panelAc(k, ekranNokta); }, 520);
    } else { var kp2 = konumu(k); panelAc(k, renderer ? ekranKonumu(new T.Vector3(kp2.x, kp2.y, kp2.z)) : null); }
  }

  function tikla(e) {
    var v = ndc(e);
    var im = isaretVurusu(v);
    if (im) { isaretSec(im.userData.kayit, false); return; }
    var vurus = govdeVurusu(v);
    if (!vurus) { if (!panel.classList.contains('hidden')) panelKapat(); return; }
    var yb = yerelBilgi(vurus);
    var b = bolgeBul(vurus.object, yb.p, yb.n);
    var yeni = { yeni: true, bolge: b.anahtar, bolge_adi: b.ad, x: +yb.p.x.toFixed(4), y: +yb.p.y.toFixed(4), z: +yb.p.z.toFixed(4),
                 nx: +yb.n.x.toFixed(4), ny: +yb.n.y.toFixed(4), nz: +yb.n.z.toFixed(4), tur: form.tur || 'agri', siddet: 5 };
    secili = yeni;
    yonlendir(hayalet, yeni);
    hayalet.visible = true;
    hayaletRenk();
    listeyiCiz();
    isaretleriGuncelle();
    $('vucutIpucu').style.opacity = 0;
    ekranNokta = ekranKonumu(yb.p);
    panelAc(yeni, ekranNokta);
  }

  function etkilesimKur() {
    tuval.addEventListener('pointerdown', function (e) {
      imlecler[e.pointerId] = { x: e.clientX, y: e.clientY };
      tuval.setPointerCapture(e.pointerId);
      var ids = Object.keys(imlecler);
      if (ids.length === 1) surukle = { x: e.clientX, y: e.clientY, bx: e.clientX, by: e.clientY, hareket: 0 };
      else if (ids.length === 2) {
        var a = imlecler[ids[0]], b = imlecler[ids[1]];
        tutamUzaklik = Math.hypot(a.x - b.x, a.y - b.y);
        surukle = null;
      }
    });
    tuval.addEventListener('pointermove', function (e) {
      if (imlecler[e.pointerId]) imlecler[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(imlecler);
      if (ids.length === 2) {
        var a = imlecler[ids[0]], b = imlecler[ids[1]];
        var u = Math.hypot(a.x - b.x, a.y - b.y);
        if (tutamUzaklik) durum.hedefMesafe = Math.max(4.5, Math.min(12, durum.hedefMesafe * tutamUzaklik / u));
        tutamUzaklik = u;
        return;
      }
      if (surukle) {
        var dx = e.clientX - surukle.x, dy = e.clientY - surukle.y;
        surukle.hareket += Math.abs(dx) + Math.abs(dy);
        surukle.x = e.clientX; surukle.y = e.clientY;
        if (surukle.hareket > 6) {
          alan.classList.add('surukleniyor');
          durum.hedefY += dx * 0.011;
          durum.hedefX = Math.max(-0.5, Math.min(0.6, durum.hedefX + dy * 0.006));
          $('vucutIpucu').style.opacity = 0;
        }
        return;
      }
      // Üzerine gelinen bölgeyi göster
      var v = ndc(e);
      var im = isaretVurusu(v);
      if (im) { vurgula(null); etiketGoster(im.userData.kayit.bolge_adi + ' · ' + im.userData.kayit.tur_adi); alan.classList.add('uzerinde'); return; }
      var vurus = govdeVurusu(v);
      if (vurus) {
        vurgula(vurus);
        var yb = yerelBilgi(vurus);
        etiketGoster(bolgeBul(vurus.object, yb.p, yb.n).ad);
        alan.classList.add('uzerinde');
      } else { vurgula(null); etiketGoster(null); alan.classList.remove('uzerinde'); }
    });
    function birak(e) {
      var tik = surukle && surukle.hareket <= 6 && Object.keys(imlecler).length === 1;
      delete imlecler[e.pointerId];
      if (Object.keys(imlecler).length < 2) tutamUzaklik = 0;
      alan.classList.remove('surukleniyor');
      if (tik && e.type === 'pointerup') tikla(e);
      surukle = null;
    }
    tuval.addEventListener('pointerup', birak);
    tuval.addEventListener('pointercancel', birak);
    tuval.addEventListener('pointerleave', function () { if (!surukle) { vurgula(null); etiketGoster(null); } });
    tuval.addEventListener('wheel', function (e) {
      e.preventDefault();
      durum.hedefMesafe = Math.max(4.5, Math.min(12, durum.hedefMesafe * (1 + Math.sign(e.deltaY) * 0.1)));
    }, { passive: false });

    var GORUNUM = { on: 0, arka: Math.PI, sol: -Math.PI / 2, sag: Math.PI / 2 };
    document.querySelectorAll('.gorunum-dugme').forEach(function (b) {
      b.addEventListener('click', function () {
        durum.hedefY = enYakinAci(GORUNUM[b.dataset.gorunum]);
        durum.hedefX = 0.04;
        if (!panel.classList.contains('hidden')) panelKapat();
      });
    });
    document.querySelectorAll('[data-yakinlas]').forEach(function (b) {
      b.addEventListener('click', function () { durum.hedefMesafe = Math.max(4.5, Math.min(12, durum.hedefMesafe * (b.dataset.yakinlas === '1' ? 0.82 : 1.2))); });
    });
    document.querySelector('[data-sifirla]').addEventListener('click', function () {
      durum.hedefY = enYakinAci(0); durum.hedefX = 0.04; durum.hedefMesafe = 9.2; durum.hedefOdakY = 0;
      if (!panel.classList.contains('hidden')) panelKapat();
    });
    window.addEventListener('resize', function () { if (secili) { ekranNokta = null; panelTakip(); } });

    // İpucu birkaç saniye sonra kaybolsun
    setTimeout(function () { $('vucutIpucu').style.opacity = 0; }, 6000);
  }

  listeyiCiz();
  kur();
})();
