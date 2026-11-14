/*
 * Klinik SaaS — Sinematik 3D sahneler (Three.js r149)
 * Her sayfadaki <section class="sahne" data-sahne="..."> içindeki <canvas> için
 * ilgili sahneyi kurar: panel | hastalar | profil | randevular | guvenlik | kasa | online
 */
(function () {
  'use strict';

  var T = window.THREE;
  var azHareket = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Ortak yardımcılar ----------
  function isikDokusu(renk) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, renk);
    gr.addColorStop(0.35, renk.replace('1)', '0.45)'));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function camMalzeme(renk, zayiflama) {
    return new T.MeshPhysicalMaterial({
      color: renk, metalness: 0, roughness: 0.06, transmission: 1, thickness: 1.1, ior: 1.45,
      iridescence: 0.9, iridescenceIOR: 1.35, clearcoat: 1, clearcoatRoughness: 0.04,
      envMapIntensity: 1.6, attenuationColor: new T.Color(zayiflama), attenuationDistance: 1.4
    });
  }

  function parilti(scene, renk, x, y, z, s, o) {
    var sp = new T.Sprite(new T.SpriteMaterial({
      map: isikDokusu(renk), transparent: true, opacity: o,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    sp.position.set(x, y, z);
    sp.scale.set(s, s, 1);
    scene.add(sp);
    return sp;
  }

  function parcaciklar(scene, renk, adet, yayilim) {
    var pp = new Float32Array(adet * 3);
    for (var i = 0; i < adet; i++) {
      pp[i * 3] = (Math.random() - 0.3) * yayilim[0];
      pp[i * 3 + 1] = (Math.random() - 0.5) * yayilim[1];
      pp[i * 3 + 2] = (Math.random() - 0.6) * yayilim[2];
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pp, 3));
    var p = new T.Points(geo, new T.PointsMaterial({
      size: 0.11, map: isikDokusu(renk), transparent: true, opacity: 0.8,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    scene.add(p);
    return p;
  }

  function hazirla(canvas, arka, sis) {
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    var scene = new T.Scene();
    scene.background = new T.Color(arka);
    scene.fog = new T.FogExp2(sis, 0.035);

    // Cam malzemelerin gerçekçi yansıması için ortam sahnesi
    var ortam = new T.Scene();
    var kgeo = new T.SphereGeometry(30, 48, 24);
    var renkler = [];
    var ust = new T.Color('#A78BFA'), orta = new T.Color('#1E1150'), alt = new T.Color('#0D9488');
    var pos = kgeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 30;
      var c = y > 0 ? orta.clone().lerp(ust, y) : orta.clone().lerp(alt, -y);
      renkler.push(c.r, c.g, c.b);
    }
    kgeo.setAttribute('color', new T.Float32BufferAttribute(renkler, 3));
    ortam.add(new T.Mesh(kgeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    [[10, 12, 10, 14, 8, [5, 5, 5.5]], [-14, 4, 6, 6, 14, [2.2, 1.2, 4]], [8, -10, -6, 10, 6, [0.6, 3, 2.6]]].forEach(function (p) {
      var m = new T.Mesh(new T.PlaneGeometry(p[3], p[4]),
        new T.MeshBasicMaterial({ color: new T.Color(p[5][0], p[5][1], p[5][2]), side: T.DoubleSide }));
      m.position.set(p[0], p[1], p[2]);
      m.lookAt(0, 0, 0);
      ortam.add(m);
    });
    scene.environment = new T.PMREMGenerator(renderer).fromScene(ortam, 0.035).texture;

    scene.add(new T.HemisphereLight('#C4B5FD', '#0F766E', 0.6));
    var dl = new T.DirectionalLight('#FFFFFF', 1.6); dl.position.set(5, 8, 6); scene.add(dl);
    var p1 = new T.PointLight('#8B5CF6', 3, 30); p1.position.set(-3, 3, 5); scene.add(p1);
    var p2 = new T.PointLight('#2DD4BF', 2.6, 30); p2.position.set(7, -4, 4); scene.add(p2);

    return { renderer: renderer, scene: scene };
  }

  function calistir(alan, canvas, renderer, scene, camera, hedef, guncelle) {
    var saat = new T.Clock();
    var fare = { x: 0, y: 0 }, an = { x: 0, y: 0 };
    var sonW = 0, sonH = 0;
    var taban = camera.position.clone();
    var gorunur = true;

    alan.addEventListener('pointermove', function (e) {
      var r = alan.getBoundingClientRect();
      fare.x = (e.clientX - r.left) / r.width * 2 - 1;
      fare.y = (e.clientY - r.top) / r.height * 2 - 1;
    });
    alan.addEventListener('pointerleave', function () { fare.x = 0; fare.y = 0; });

    // Sahne ekranda değilken çizimi durdur (pil ve işlemci tasarrufu)
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (g) { gorunur = g[0].isIntersecting; }).observe(alan);
    }

    function dongu() {
      requestAnimationFrame(dongu);
      if (!gorunur || document.hidden) { saat.getDelta(); return; }
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (w !== sonW || h !== sonH) {
        sonW = w; sonH = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      var hiz = azHareket ? 0.2 : 1;
      var dt = Math.min(saat.getDelta(), 0.05) * hiz;
      an.x += (fare.x - an.x) * 0.05;
      an.y += (fare.y - an.y) * 0.05;
      guncelle(dt, saat.elapsedTime * hiz, an, camera.aspect, camera);
      camera.position.set(taban.x + an.x * 0.8, taban.y - an.y * 0.5, taban.z);
      camera.lookAt(hedef);
      renderer.render(scene, camera);
    }
    dongu();
  }

  // ---------- Sahne 1: Gösterge paneli — cam DNA sarmalı ----------
  function panelSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#150B38', '#1A0E42'), scene = o.scene;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 15);
    parilti(scene, 'rgba(139,92,246,1)', 3.5, 0.5, -6, 16, 0.55);
    parilti(scene, 'rgba(45,212,191,1)', 6.5, -3.5, -4, 10, 0.35);
    parilti(scene, 'rgba(244,114,182,1)', 0.5, 4, -8, 9, 0.25);

    var dunya = new T.Group(); scene.add(dunya);
    var turkuaz = camMalzeme('#99F6E4', '#14B8A6');
    var mor = camMalzeme('#DDD6FE', '#7C3AED');
    var inci = new T.MeshPhysicalMaterial({ color: '#F5F3FF', roughness: 0.22, metalness: 0.15, clearcoat: 1, sheen: 1, sheenColor: new T.Color('#C4B5FD'), envMapIntensity: 1.3 });

    var sarmal = new T.Group();
    var kure = new T.SphereGeometry(0.34, 40, 24);
    var N = 34, R = 1.7, boy = 11, yukari = new T.Vector3(0, 1, 0);
    for (var k = 0; k < N; k++) {
      var t = k / N * Math.PI * 4.2;
      var yy = -boy / 2 + k / (N - 1) * boy;
      var a = new T.Vector3(Math.cos(t) * R, yy, Math.sin(t) * R);
      var b = new T.Vector3(Math.cos(t + Math.PI) * R, yy, Math.sin(t + Math.PI) * R);
      var ka = new T.Mesh(kure, turkuaz); ka.position.copy(a); sarmal.add(ka);
      var kb = new T.Mesh(kure, mor); kb.position.copy(b); sarmal.add(kb);
      if (k % 2 === 0) {
        var yon = b.clone().sub(a);
        var bag = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, yon.length() - 0.5, 16), inci);
        bag.position.copy(a.clone().add(b).multiplyScalar(0.5));
        bag.quaternion.setFromUnitVectors(yukari, yon.normalize());
        sarmal.add(bag);
      }
    }
    sarmal.rotation.z = -0.42;
    dunya.add(sarmal);

    var yuzenler = [];
    var kapsulGeo = new T.CapsuleGeometry(0.32, 0.85, 10, 28);
    var kapsulMat = [camMalzeme('#FBCFE8', '#DB2777'), camMalzeme('#A5F3FC', '#0891B2'), mor, turkuaz];
    [[-0.5, 2.6, 1.5], [7.8, 2.8, -1.5], [6.4, -3.2, 2], [1.2, -3.4, -2.5], [9.5, -0.5, -3], [-2.5, -1.5, -4], [4.8, 4.2, -3.5]].forEach(function (p, i) {
      var m = new T.Mesh(kapsulGeo, kapsulMat[i % kapsulMat.length]);
      m.position.set(p[0], p[1], p[2]);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.userData = { y0: p[1], faz: Math.random() * 6.28, hiz: 0.4 + Math.random() * 0.5 };
      dunya.add(m); yuzenler.push(m);
    });
    var kopuk = new T.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0, transmission: 1, thickness: 0.05, ior: 1.2, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900], envMapIntensity: 2, transparent: true });
    [[0.8, 0.6, 3, 0.55], [8.6, 1.2, 1, 0.8], [5.4, -1.8, 4.5, 0.35], [2.2, 3.6, -1, 0.45]].forEach(function (p) {
      var m = new T.Mesh(new T.SphereGeometry(p[3], 48, 32), kopuk);
      m.position.set(p[0], p[1], p[2]);
      m.userData = { y0: p[1], faz: Math.random() * 6.28, hiz: 0.3 + Math.random() * 0.3 };
      dunya.add(m); yuzenler.push(m);
    });
    var parca = parcaciklar(scene, 'rgba(221,214,254,1)', 520, [26, 14, 18]);

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(1.2, 0, 0), function (dt, z, an, asp) {
      sarmal.position.x = asp < 1.1 ? 0.8 : 3.6;
      sarmal.rotation.y += dt * 0.32;
      yuzenler.forEach(function (m) {
        var u = m.userData;
        m.position.y = u.y0 + Math.sin(z * u.hiz + u.faz) * 0.35;
        m.rotation.x += dt * 0.25; m.rotation.y += dt * 0.18;
      });
      parca.rotation.y = z * 0.02;
      dunya.rotation.y = an.x * 0.18;
      dunya.rotation.x = an.y * 0.1;
    });
  }

  // ---------- Sahne 2: Hastalar — dönen hasta ağı ----------
  function hastalarSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#130A33', '#170C3D'), scene = o.scene;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 16);
    parilti(scene, 'rgba(139,92,246,1)', 5, 0, -5, 15, 0.55);
    parilti(scene, 'rgba(45,212,191,1)', 8, -3, -3, 8, 0.3);

    var ag = new T.Group(); ag.position.set(5, 0, 0); scene.add(ag);
    var mats = [camMalzeme('#DDD6FE', '#7C3AED'), camMalzeme('#99F6E4', '#14B8A6'), camMalzeme('#FBCFE8', '#DB2777')];
    var geo = new T.SphereGeometry(1, 32, 20);
    var N = 72, nokta = [], altin = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = altin * i, R = 4.3 * (0.78 + Math.random() * 0.3);
      var p = new T.Vector3(Math.cos(th) * r * R, y * R * 0.82, Math.sin(th) * r * R);
      var m = new T.Mesh(geo, mats[i % 9 === 0 ? 2 : (i % 3 === 0 ? 1 : 0)]);
      m.scale.setScalar(0.11 + Math.random() * 0.2);
      m.position.copy(p);
      ag.add(m); nokta.push(p);
    }
    var kenar = [], lp = [];
    for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) {
      if (nokta[a].distanceTo(nokta[b]) < 2.3) {
        kenar.push([a, b]);
        lp.push(nokta[a].x, nokta[a].y, nokta[a].z, nokta[b].x, nokta[b].y, nokta[b].z);
      }
    }
    var lgeo = new T.BufferGeometry();
    lgeo.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
    ag.add(new T.LineSegments(lgeo, new T.LineBasicMaterial({ color: '#B39DFF', transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false })));
    var merkez = new T.Mesh(new T.SphereGeometry(1, 64, 40), new T.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0, transmission: 1, thickness: 0.2, ior: 1.25, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900], envMapIntensity: 2 }));
    ag.add(merkez);
    var cekirdek = new T.Sprite(new T.SpriteMaterial({ map: isikDokusu('rgba(196,181,253,1)'), transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
    cekirdek.scale.set(3, 3, 1); ag.add(cekirdek);

    var darbeDokusu = isikDokusu('rgba(204,251,241,1)'), darbeler = [];
    for (var d = 0; d < 22 && kenar.length; d++) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: darbeDokusu, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      s.scale.set(0.5, 0.5, 1); ag.add(s);
      darbeler.push({ s: s, k: kenar[Math.floor(Math.random() * kenar.length)], t: Math.random(), v: 0.4 + Math.random() * 0.6 });
    }
    var parca = parcaciklar(scene, 'rgba(221,214,254,1)', 420, [26, 12, 16]);

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(2.5, 0, 0), function (dt, z, an, asp) {
      ag.position.x = asp < 1.2 ? 1.5 : 5;
      ag.rotation.y += dt * 0.16;
      ag.rotation.x = Math.sin(z * 0.2) * 0.15 + an.y * 0.12;
      merkez.scale.setScalar(0.85 + Math.sin(z * 1.5) * 0.05);
      darbeler.forEach(function (o2) {
        o2.t += dt * o2.v;
        if (o2.t > 1) { o2.t = 0; o2.k = kenar[Math.floor(Math.random() * kenar.length)]; }
        o2.s.position.copy(nokta[o2.k[0]]).lerp(nokta[o2.k[1]], o2.t);
        o2.s.material.opacity = Math.sin(o2.t * Math.PI);
      });
      parca.rotation.y = z * 0.02;
    });
  }

  // ---------- Sahne 3: Hasta profili — atan cam kalp ----------
  function profilSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#1A0A2E', '#1C0C36'), scene = o.scene;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 15);
    parilti(scene, 'rgba(244,63,94,1)', 4.5, 0, -4, 13, 0.5);
    parilti(scene, 'rgba(139,92,246,1)', 7, 3, -6, 12, 0.4);

    var sh = new T.Shape();
    sh.moveTo(5, 5);
    sh.bezierCurveTo(5, 5, 4, 0, 0, 0);
    sh.bezierCurveTo(-6, 0, -6, 7, -6, 7);
    sh.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
    sh.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
    sh.bezierCurveTo(16, 7, 16, 0, 10, 0);
    sh.bezierCurveTo(7, 0, 5, 5, 5, 5);
    var kgeo = new T.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelSegments: 12, steps: 1, bevelSize: 2, bevelThickness: 2.2, curveSegments: 64 });
    kgeo.center();
    kgeo.computeVertexNormals();

    var grup = new T.Group(); grup.position.set(4.6, 0.2, 0); scene.add(grup);
    var kalp = new T.Mesh(kgeo, camMalzeme('#FECDD3', '#E11D48'));
    kalp.rotation.z = Math.PI;
    grup.add(kalp);
    var ic = new T.Sprite(new T.SpriteMaterial({ map: isikDokusu('rgba(251,113,133,1)'), transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    ic.scale.set(4, 4, 1); grup.add(ic);
    var inci = new T.MeshPhysicalMaterial({ color: '#FFF1F2', roughness: 0.2, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.5 });
    var h1 = new T.Mesh(new T.TorusGeometry(2.7, 0.025, 16, 160), inci); h1.rotation.x = 1.2; grup.add(h1);
    var h2 = new T.Mesh(new T.TorusGeometry(3.2, 0.018, 16, 160), inci); h2.rotation.set(0.4, 0.9, 0); grup.add(h2);
    var uydu = new T.Mesh(new T.SphereGeometry(0.16, 32, 16), camMalzeme('#DDD6FE', '#7C3AED')); grup.add(uydu);
    var nabizIsik = new T.PointLight('#FB7185', 2, 12); nabizIsik.position.set(4.6, 0, 3); scene.add(nabizIsik);

    var halkalar = [];
    for (var i = 0; i < 3; i++) {
      var hm = new T.Mesh(new T.RingGeometry(1, 1.04, 96), new T.MeshBasicMaterial({ color: '#FDA4AF', transparent: true, opacity: 0, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false }));
      grup.add(hm); halkalar.push(hm);
    }
    var parca = parcaciklar(scene, 'rgba(254,205,211,1)', 360, [24, 12, 14]);
    var olcek = 0.13;

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(2.4, 0, 0), function (dt, z, an, asp, cam) {
      grup.position.x = asp < 1.2 ? 1.6 : 4.6;
      var f = (z * 1.1) % 1;
      var p = Math.exp(-Math.pow(f - 0.08, 2) / 0.0012) + 0.55 * Math.exp(-Math.pow(f - 0.28, 2) / 0.0016);
      kalp.scale.setScalar(olcek * (1 + 0.075 * p));
      kalp.rotation.y = Math.sin(z * 0.5) * 0.55 + an.x * 0.35;
      kalp.rotation.x = an.y * 0.2;
      ic.material.opacity = 0.35 + 0.45 * p;
      nabizIsik.intensity = 1.2 + 2.4 * p;
      h1.rotation.z += dt * 0.4;
      h2.rotation.z -= dt * 0.25;
      uydu.position.set(Math.cos(z * 0.9) * 2.7, Math.sin(z * 0.9) * 2.7 * Math.cos(1.2), Math.sin(z * 0.9) * 2.7 * Math.sin(1.2));
      halkalar.forEach(function (hm, k) {
        var g = ((z * 1.1) + k / 3) % 1;
        hm.scale.setScalar(1 + g * 3.2);
        hm.material.opacity = (1 - g) * 0.4;
        hm.lookAt(cam.position);
      });
      parca.rotation.y = z * 0.02;
    });
  }

  // ---------- Sahne 4: Randevular — dalgalanan cam küp takvim ----------
  function randevularSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#0A1030', '#0B1236'), scene = o.scene;
    scene.fog.density = 0.03;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 6.5, 15);
    parilti(scene, 'rgba(45,212,191,1)', 5, 0, -4, 14, 0.45);
    parilti(scene, 'rgba(139,92,246,1)', 8, 3, -7, 12, 0.35);

    // Gerçek doluluk verisi varsa (sayfadan gelen 7 günlük sayılar) küplere yansıt
    var doluluk = [];
    try { doluluk = JSON.parse(alan.getAttribute('data-doluluk') || '[]'); } catch (e) { doluluk = []; }

    var izgara = new T.Group(); izgara.position.set(4.6, -1.6, 0); izgara.rotation.y = -0.55; scene.add(izgara);
    var geo = new T.BoxGeometry(0.72, 1, 0.72); geo.translate(0, 0.5, 0);
    var buzlu = new T.MeshPhysicalMaterial({ color: '#C7D2FE', roughness: 0.28, transmission: 0.95, thickness: 0.9, ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.3, attenuationColor: new T.Color('#4F46E5'), attenuationDistance: 2.2 });
    var dolu = new T.MeshPhysicalMaterial({ color: '#99F6E4', emissive: '#0D9488', emissiveIntensity: 0.55, roughness: 0.12, transmission: 0.7, thickness: 1, ior: 1.45, clearcoat: 1, iridescence: 0.6, envMapIntensity: 1.5, attenuationColor: new T.Color('#14B8A6'), attenuationDistance: 1.4 });
    var bugunMat = new T.MeshPhysicalMaterial({ color: '#FFFFFF', emissive: '#5EEAD4', emissiveIntensity: 0.9, roughness: 0.08, transmission: 0.5, thickness: 1, clearcoat: 1, envMapIntensity: 1.6 });
    var bugunIndeks = (new Date().getDay() + 6) % 7;
    var kupler = [], C = 7, R = 6, ara = 0.98;
    for (var c = 0; c < C; c++) for (var r = 0; r < R; r++) {
      var doluMu = doluluk.length ? r < Math.min(R, Math.ceil((doluluk[c] || 0) / 2)) : ((c * 5 + r * 3) % 4 === 0);
      var m = new T.Mesh(geo, (c === bugunIndeks && r === 0) ? bugunMat : (doluMu ? dolu : buzlu));
      m.position.set((c - (C - 1) / 2) * ara, 0, (r - (R - 1) / 2) * ara);
      m.userData = { c: c, r: r, taban: doluMu ? 1.5 : 0.35 };
      izgara.add(m); kupler.push(m);
    }
    var zemin = new T.Mesh(new T.PlaneGeometry(9, 8), new T.MeshPhysicalMaterial({ color: '#1E1B4B', roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.55 }));
    zemin.rotation.x = -Math.PI / 2; zemin.position.y = -0.01; izgara.add(zemin);
    var tarayici = new T.Mesh(new T.PlaneGeometry(0.9, 6.2), new T.MeshBasicMaterial({ color: '#5EEAD4', transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    tarayici.rotation.x = -Math.PI / 2; tarayici.position.y = 0.02; izgara.add(tarayici);

    var halka = new T.Group(); halka.position.set(4.6, 2.6, -1.5); scene.add(halka);
    var inci = new T.MeshPhysicalMaterial({ color: '#F0FDFA', roughness: 0.2, metalness: 0.35, clearcoat: 1, envMapIntensity: 1.5 });
    halka.add(new T.Mesh(new T.TorusGeometry(1.5, 0.03, 16, 160), inci));
    var tikGeo = new T.SphereGeometry(0.08, 20, 12);
    for (var k = 0; k < 12; k++) {
      var tk = new T.Mesh(tikGeo, k % 3 === 0 ? dolu : inci);
      tk.position.set(Math.cos(k / 12 * Math.PI * 2) * 1.5, Math.sin(k / 12 * Math.PI * 2) * 1.5, 0);
      halka.add(tk);
    }
    var ibreGeo = new T.BoxGeometry(0.05, 1.15, 0.05); ibreGeo.translate(0, 0.55, 0);
    var ibre = new T.Mesh(ibreGeo, dolu); halka.add(ibre);
    halka.rotation.x = -0.35;
    var parca = parcaciklar(scene, 'rgba(204,251,241,1)', 360, [24, 12, 14]);

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(2.4, 0, 0), function (dt, z, an, asp) {
      var x = asp < 1.2 ? 1.4 : 4.6;
      izgara.position.x = x;
      halka.position.x = x + 0.2;
      izgara.rotation.y = -0.55 + Math.sin(z * 0.25) * 0.12 + an.x * 0.2;
      kupler.forEach(function (m) {
        var u = m.userData;
        var dalga = 0.5 + 0.5 * Math.sin(z * 1.6 - (u.c * 0.6 + u.r * 0.45));
        m.scale.y = u.taban + dalga * 0.9;
      });
      tarayici.position.x = ((z * 0.9) % 8) - 4;
      ibre.rotation.z = -z * 0.6;
      halka.rotation.y = Math.sin(z * 0.4) * 0.3;
      parca.rotation.y = z * 0.02;
    });
  }


  // ---------- Sahne 5: Güvenlik — cam çekirdekli koruma kalkanı ----------
  function guvenlikSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#081A2A', '#0A1C30'), scene = o.scene;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.6, 15);
    parilti(scene, 'rgba(45,212,191,1)', 4.6, 0, -4, 15, 0.5);
    parilti(scene, 'rgba(99,102,241,1)', 7.5, 2.5, -7, 12, 0.35);

    var grup = new T.Group(); grup.position.set(4.6, 0.1, 0); scene.add(grup);

    // Faset kesimli cam çekirdek
    var cekirdek = new T.Mesh(new T.IcosahedronGeometry(1.25, 0), camMalzeme('#CCFBF1', '#0D9488'));
    cekirdek.material.flatShading = true;
    grup.add(cekirdek);
    var ic = new T.Sprite(new T.SpriteMaterial({ map: isikDokusu('rgba(94,234,212,1)'), transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
    ic.scale.set(4.2, 4.2, 1); grup.add(ic);

    // Dış kalkan: ince, yanardöner cam küre
    var kalkan = new T.Mesh(new T.SphereGeometry(2.6, 64, 40), new T.MeshPhysicalMaterial({
      color: '#FFFFFF', roughness: 0.05, transmission: 1, thickness: 0.08, ior: 1.2, iridescence: 1, iridescenceIOR: 1.5,
      iridescenceThicknessRange: [180, 820], envMapIntensity: 1.8, transparent: true, opacity: 0.9
    }));
    grup.add(kalkan);

    // Altıgen ağ örgüsü (kalkan yüzeyi)
    var ag = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(2.65, 2)),
      new T.LineBasicMaterial({ color: '#5EEAD4', transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false }));
    grup.add(ag);

    // Jiroskop halkaları
    var inci = new T.MeshPhysicalMaterial({ color: '#E0F2FE', roughness: 0.18, metalness: 0.4, clearcoat: 1, envMapIntensity: 1.6 });
    var halkalar = [[1.9, 0.035, [1.1, 0, 0]], [2.15, 0.03, [0, 1.2, 0.4]], [3.2, 0.02, [1.4, 0.3, 0.8]]].map(function (h) {
      var m = new T.Mesh(new T.TorusGeometry(h[0], h[1], 16, 180), inci);
      m.rotation.set(h[2][0], h[2][1], h[2][2]);
      grup.add(m);
      return m;
    });

    // Yörüngedeki veri blokları
    var bloklar = [];
    var blokMat = [camMalzeme('#A5F3FC', '#0891B2'), camMalzeme('#DDD6FE', '#7C3AED')];
    for (var i = 0; i < 14; i++) {
      var b = new T.Mesh(new T.BoxGeometry(0.22, 0.22, 0.22), blokMat[i % 2]);
      b.userData = { r: 3.3 + Math.random() * 0.9, hiz: 0.25 + Math.random() * 0.35, faz: Math.random() * 6.28, egim: (Math.random() - 0.5) * 1.4 };
      grup.add(b); bloklar.push(b);
    }

    // Tarama halkası (yukarı aşağı gezen ışık)
    var tarama = new T.Mesh(new T.RingGeometry(2.55, 2.72, 120), new T.MeshBasicMaterial({ color: '#5EEAD4', transparent: true, opacity: 0.35, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false }));
    tarama.rotation.x = Math.PI / 2;
    grup.add(tarama);

    var parca = parcaciklar(scene, 'rgba(153,246,228,1)', 380, [24, 12, 14]);

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(2.4, 0, 0), function (dt, z, an, asp) {
      grup.position.x = asp < 1.2 ? 1.6 : 4.6;
      cekirdek.rotation.x += dt * 0.35; cekirdek.rotation.y += dt * 0.5;
      var nabiz = 0.5 + 0.5 * Math.sin(z * 2.2);
      ic.material.opacity = 0.45 + 0.35 * nabiz;
      cekirdek.scale.setScalar(1 + nabiz * 0.04);
      kalkan.rotation.y += dt * 0.08;
      ag.rotation.y -= dt * 0.05; ag.rotation.x = Math.sin(z * 0.2) * 0.1;
      halkalar[0].rotation.z += dt * 0.5;
      halkalar[1].rotation.x += dt * 0.35;
      halkalar[2].rotation.y += dt * 0.15;
      bloklar.forEach(function (b) {
        var u = b.userData, a = z * u.hiz + u.faz;
        b.position.set(Math.cos(a) * u.r, Math.sin(a * 1.3) * u.egim, Math.sin(a) * u.r);
        b.rotation.x += dt; b.rotation.y += dt * 0.7;
      });
      var ty = Math.sin(z * 0.8) * 2.4;
      tarama.position.y = ty;
      var olcek = Math.sqrt(Math.max(0.05, 1 - (ty / 2.65) * (ty / 2.65)));
      tarama.scale.setScalar(olcek);
      tarama.material.opacity = 0.15 + 0.25 * olcek;
      grup.rotation.y = an.x * 0.25;
      grup.rotation.x = an.y * 0.12;
      parca.rotation.y = z * 0.02;
    });
  }


  // ---------- Sahne 6: Kasa — dönen cam sikkeler ve kart ----------
  function liraDokusu() {
    var c = document.createElement('canvas');
    c.width = c.height = 512;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(200, 180, 20, 256, 256, 260);
    gr.addColorStop(0, '#FFF7D6'); gr.addColorStop(0.55, '#F5C451'); gr.addColorStop(1, '#B7791F');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(120,70,10,0.55)'; g.lineWidth = 10;
    g.beginPath(); g.arc(256, 256, 214, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 190, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(110,60,5,0.85)';
    g.font = '700 250px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('₺', 256, 270);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  function kasaSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#0B1A1A', '#0C1E20'), scene = o.scene;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.8, 15);
    parilti(scene, 'rgba(250,204,21,1)', 4.8, 0.4, -5, 14, 0.38);
    parilti(scene, 'rgba(45,212,191,1)', 7.5, -2.5, -4, 11, 0.4);
    parilti(scene, 'rgba(139,92,246,1)', 2, 3.5, -8, 10, 0.25);

    var grup = new T.Group(); grup.position.set(4.6, -0.2, 0); scene.add(grup);
    var altin = new T.MeshPhysicalMaterial({ color: '#F6C453', metalness: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.6 });
    var yuz = new T.MeshPhysicalMaterial({ map: liraDokusu(), metalness: 0.85, roughness: 0.28, clearcoat: 1, envMapIntensity: 1.4 });

    // Büyük, dönen lira sikkesi
    var buyuk = new T.Mesh(new T.CylinderGeometry(1.35, 1.35, 0.2, 96, 1), [altin, yuz, yuz]);
    buyuk.rotation.x = Math.PI / 2;
    var buyukTut = new T.Group(); buyukTut.add(buyuk); buyukTut.position.set(0.2, 1.35, 0.4); grup.add(buyukTut);
    var hale = new T.Sprite(new T.SpriteMaterial({ map: isikDokusu('rgba(253,224,71,1)'), transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false }));
    hale.scale.set(5, 5, 1); buyukTut.add(hale);

    // Cam sikke kuleleri
    var camAltin = camMalzeme('#FEF3C7', '#D97706');
    var camTurkuaz = camMalzeme('#CCFBF1', '#0D9488');
    var kuleler = [];
    [[-1.7, 6, camTurkuaz], [-0.4, 9, camAltin], [1.1, 4, camTurkuaz], [2.3, 7, camAltin]].forEach(function (k, i) {
      var kule = new T.Group(); kule.position.set(k[0], -2.3, -0.6 + (i % 2) * 0.9); grup.add(kule);
      for (var j = 0; j < k[1]; j++) {
        var m = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.12, 64), k[2]);
        m.position.y = j * 0.135;
        m.rotation.y = Math.random() * 3;
        m.position.x = (Math.random() - 0.5) * 0.05;
        kule.add(m);
      }
      kule.userData = { faz: i * 0.9, taban: kule.position.y };
      kuleler.push(kule);
    });

    // Cam ödeme kartı
    var kart = new T.Mesh(new T.BoxGeometry(2.3, 1.45, 0.06), new T.MeshPhysicalMaterial({
      color: '#FFFFFF', roughness: 0.08, transmission: 1, thickness: 0.4, ior: 1.4, iridescence: 1, iridescenceIOR: 1.4,
      iridescenceThicknessRange: [200, 900], clearcoat: 1, envMapIntensity: 1.8
    }));
    var cip = new T.Mesh(new T.BoxGeometry(0.36, 0.28, 0.07), altin);
    cip.position.set(-0.68, 0.18, 0.02); kart.add(cip);
    var serit = new T.Mesh(new T.BoxGeometry(2.3, 0.18, 0.065), new T.MeshPhysicalMaterial({ color: '#2DD4BF', roughness: 0.3, transmission: 0.6, transparent: true, opacity: 0.8 }));
    serit.position.set(0, -0.38, 0); kart.add(serit);
    kart.position.set(-2.4, 1.2, 1); kart.rotation.set(-0.25, 0.55, 0.15);
    grup.add(kart);

    // Yükselen altın kıvılcımlar
    var adet = 160, pp = new Float32Array(adet * 3), hiz = [];
    for (var i = 0; i < adet; i++) {
      pp[i * 3] = (Math.random() - 0.5) * 7; pp[i * 3 + 1] = Math.random() * 7 - 3.5; pp[i * 3 + 2] = (Math.random() - 0.5) * 4;
      hiz.push(0.2 + Math.random() * 0.5);
    }
    var kgeo = new T.BufferGeometry(); kgeo.setAttribute('position', new T.BufferAttribute(pp, 3));
    var kivilcim = new T.Points(kgeo, new T.PointsMaterial({ size: 0.12, map: isikDokusu('rgba(253,224,71,1)'), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
    grup.add(kivilcim);
    var parca = parcaciklar(scene, 'rgba(153,246,228,1)', 260, [24, 12, 14]);

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(2.4, 0, 0), function (dt, z, an, asp) {
      grup.position.x = asp < 1.2 ? 1.4 : 4.6;
      buyuk.rotation.z += dt * 0.9;
      buyukTut.position.y = 1.35 + Math.sin(z * 1.1) * 0.15;
      hale.material.opacity = 0.32 + 0.15 * Math.sin(z * 2);
      kuleler.forEach(function (k) {
        k.position.y = k.userData.taban + Math.sin(z * 0.9 + k.userData.faz) * 0.12;
        k.rotation.y += dt * 0.15;
      });
      kart.rotation.y = 0.55 + Math.sin(z * 0.5) * 0.25;
      kart.position.y = 1.2 + Math.sin(z * 0.8 + 1) * 0.18;
      var pos = kgeo.attributes.position;
      for (var i = 0; i < adet; i++) {
        var y = pos.getY(i) + hiz[i] * dt;
        if (y > 3.6) y = -3.5;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      grup.rotation.y = an.x * 0.22;
      grup.rotation.x = an.y * 0.1;
      parca.rotation.y = z * 0.02;
    });
  }

  // ---------- Sahne 7: Online randevu — cam saat ve takvim ----------
  function onlineSahnesi(alan, canvas) {
    var o = hazirla(canvas, '#120B33', '#160D3D'), scene = o.scene;
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.4, 15);
    parilti(scene, 'rgba(139,92,246,1)', 4.6, 0.5, -5, 15, 0.5);
    parilti(scene, 'rgba(45,212,191,1)', 7, -3, -4, 10, 0.35);
    parilti(scene, 'rgba(244,114,182,1)', 2, 3.6, -7, 8, 0.25);

    var grup = new T.Group(); grup.position.set(4.4, 0.2, 0); scene.add(grup);

    // Takvim karoları (arkada, dalgalanan)
    var takvim = new T.Group(); takvim.position.set(0.2, 0, -1.6); takvim.rotation.set(-0.12, -0.35, 0.05); grup.add(takvim);
    var karoCam = camMalzeme('#E9D5FF', '#7C3AED');
    var karoAcik = camMalzeme('#CCFBF1', '#14B8A6');
    var karolar = [];
    for (var sat = 0; sat < 5; sat++) {
      for (var sut = 0; sut < 7; sut++) {
        var acik = (sat * 7 + sut) % 5 === 1 || (sat === 2 && sut === 4);
        var k = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.1), acik ? karoAcik : karoCam);
        k.position.set((sut - 3) * 0.62, (2 - sat) * 0.62, 0);
        k.userData = { faz: sut * 0.5 + sat * 0.8, acik: acik };
        takvim.add(k); karolar.push(k);
      }
    }

    // Cam saat
    var saat = new T.Group(); saat.position.set(0.6, 0.1, 1.2); grup.add(saat);
    var cerceve = new T.Mesh(new T.TorusGeometry(1.75, 0.16, 32, 160), camMalzeme('#FFFFFF', '#8B5CF6'));
    saat.add(cerceve);
    var kadran = new T.Mesh(new T.CircleGeometry(1.62, 96), new T.MeshPhysicalMaterial({
      color: '#FFFFFF', roughness: 0.1, transmission: 1, thickness: 0.2, ior: 1.3, iridescence: 1, iridescenceIOR: 1.3,
      transparent: true, opacity: 0.55, envMapIntensity: 1.5, side: T.DoubleSide
    }));
    saat.add(kadran);
    var inci = new T.MeshPhysicalMaterial({ color: '#F5F3FF', roughness: 0.2, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.5 });
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      var buyukMi = i % 3 === 0;
      var nokta = new T.Mesh(new T.SphereGeometry(buyukMi ? 0.09 : 0.055, 20, 14), buyukMi ? new T.MeshBasicMaterial({ color: '#5EEAD4' }) : inci);
      nokta.position.set(Math.sin(a) * 1.38, Math.cos(a) * 1.38, 0.05);
      saat.add(nokta);
    }
    function ibre(uzunluk, kalinlik, renk) {
      var tut = new T.Group();
      var m = new T.Mesh(new T.BoxGeometry(kalinlik, uzunluk, 0.05), new T.MeshPhysicalMaterial({ color: renk, roughness: 0.2, metalness: 0.4, clearcoat: 1, emissive: renk, emissiveIntensity: 0.25 }));
      m.position.y = uzunluk / 2 - 0.1;
      tut.add(m); tut.position.z = 0.1;
      saat.add(tut);
      return tut;
    }
    var akrep = ibre(0.85, 0.09, '#F5F3FF'), yelkovan = ibre(1.25, 0.06, '#C4B5FD');
    var merkez = new T.Mesh(new T.SphereGeometry(0.12, 24, 16), new T.MeshBasicMaterial({ color: '#5EEAD4' }));
    merkez.position.z = 0.15; saat.add(merkez);

    // Onay rozeti (yörüngede dönen yeşil küre)
    var rozet = new T.Mesh(new T.SphereGeometry(0.32, 40, 28), camMalzeme('#A7F3D0', '#059669'));
    var rozetIsik = new T.Sprite(new T.SpriteMaterial({ map: isikDokusu('rgba(52,211,153,1)'), transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
    rozetIsik.scale.set(1.8, 1.8, 1); rozet.add(rozetIsik);
    grup.add(rozet);

    var parca = parcaciklar(scene, 'rgba(196,181,253,1)', 340, [24, 12, 14]);

    calistir(alan, canvas, o.renderer, scene, camera, new T.Vector3(2.4, 0, 0), function (dt, z, an, asp) {
      grup.position.x = asp < 1.2 ? 1.5 : 4.4;
      var d = new Date();
      var dk = d.getMinutes() + d.getSeconds() / 60 + z * 2;   // canlı ama akıcı
      yelkovan.rotation.z = -dk / 60 * Math.PI * 2;
      akrep.rotation.z = -((d.getHours() % 12) + dk / 60) / 12 * Math.PI * 2;
      saat.rotation.y = Math.sin(z * 0.4) * 0.25;
      saat.position.y = 0.1 + Math.sin(z * 0.9) * 0.12;
      cerceve.rotation.z += dt * 0.05;
      karolar.forEach(function (k) {
        k.position.z = Math.sin(z * 1.4 + k.userData.faz) * 0.12 + (k.userData.acik ? 0.12 : 0);
        k.rotation.x = Math.sin(z * 0.9 + k.userData.faz) * 0.12;
      });
      var ra = z * 0.6;
      rozet.position.set(Math.cos(ra) * 2.5 + 0.6, Math.sin(ra * 1.3) * 0.6 + 0.2, Math.sin(ra) * 1.6 + 0.6);
      rozetIsik.material.opacity = 0.5 + 0.3 * Math.sin(z * 2.4);
      grup.rotation.y = an.x * 0.25;
      grup.rotation.x = an.y * 0.12;
      parca.rotation.y = z * 0.02;
    });
  }

  var SAHNELER = { panel: panelSahnesi, hastalar: hastalarSahnesi, profil: profilSahnesi, randevular: randevularSahnesi,
                   guvenlik: guvenlikSahnesi, kasa: kasaSahnesi, online: onlineSahnesi };

  // Diğer modüllerin (ör. 3D vücut haritası) ortak malzeme ve ortamı kullanabilmesi için
  window.Klinik3D = { hazirla: hazirla, camMalzeme: camMalzeme, isikDokusu: isikDokusu, parilti: parilti, parcaciklar: parcaciklar, azHareket: azHareket };

  function baslat() {
    if (!T) { console.warn('Three.js yüklenemedi; 3D sahne atlandı.'); return; }
    document.querySelectorAll('.sahne[data-sahne]').forEach(function (alan) {
      var kur = SAHNELER[alan.getAttribute('data-sahne')];
      var canvas = alan.querySelector('canvas');
      if (!kur || !canvas) return;
      try { kur(alan, canvas); } catch (e) { console.warn('3D sahne başlatılamadı:', e); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();
})();
