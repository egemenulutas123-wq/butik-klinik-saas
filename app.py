from datetime import datetime, date, time, timedelta
from functools import wraps
import csv
import io
import json
import math
import os
import re
import secrets
import shutil
import sqlite3
from urllib.parse import quote

from flask import (Flask, jsonify, render_template, request, session, redirect, url_for, g,
                   send_from_directory, Response, abort)
from sqlalchemy import inspect, text, func, case

from models import (db, Doktor, Hasta, Randevu, Muayene, Recete, ReceteKalemi, Vital, IslemKaydi, ROLLER,
                    Ayar, OnlineTalep, Tarife, KasaHareketi, VucutIsareti, Malzeme, StokHareketi, IslemMalzemesi)
from ilaclar import recete_kontrol, ilac_listesi, ilac_bul, UYARI_NOTU

app = Flask(__name__)

# Veri Tabanı Ayarları (dosya: instance/klinik.db)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///klinik.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # yedek yükleme sınırı

KLINIK_ADI = os.environ.get('KLINIK_ADI', 'Butik Klinik')
KILIT_DAKIKA = 10      # bu kadar hareketsizlikte ekran kilitlenir
OTURUM_DAKIKA = 30     # bu kadar hareketsizlikte oturum tamamen kapanır
OTOMATIK_YEDEK_SAKLA = 14


def gizli_anahtar():
    """Oturum çerezlerini imzalamak için kalıcı gizli anahtar (instance/gizli_anahtar.txt)."""
    if os.environ.get('KLINIK_GIZLI_ANAHTAR'):
        return os.environ['KLINIK_GIZLI_ANAHTAR']
    os.makedirs(app.instance_path, exist_ok=True)
    yol = os.path.join(app.instance_path, 'gizli_anahtar.txt')
    if not os.path.exists(yol):
        with open(yol, 'w', encoding='utf-8') as f:
            f.write(secrets.token_hex(32))
    with open(yol, encoding='utf-8') as f:
        return f.read().strip()


app.config['SECRET_KEY'] = gizli_anahtar()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)

db.init_app(app)


def semayi_guncelle():
    """
    Yeni tablolar oluşturulur; mevcut tablolara eklenen yeni sütunlar SQLite'a otomatik eklenir.
    Böylece yeni özelliklerde klinik.db dosyasını silmek gerekmez (veriler korunur).
    """
    db.create_all()
    denetci = inspect(db.engine)
    with db.engine.begin() as baglanti:
        for tablo in db.metadata.sorted_tables:
            mevcut = {s['name'] for s in denetci.get_columns(tablo.name)}
            for sutun in tablo.columns:
                if sutun.name in mevcut:
                    continue
                tur = sutun.type.compile(dialect=db.engine.dialect)
                varsayilan = ''
                if sutun.default is not None and getattr(sutun.default, 'is_scalar', False):
                    v = sutun.default.arg
                    v = int(v) if isinstance(v, bool) else v
                    varsayilan = f' DEFAULT {v!r}' if isinstance(v, str) else f' DEFAULT {v}'
                baglanti.execute(text(f'ALTER TABLE "{tablo.name}" ADD COLUMN "{sutun.name}" {tur}{varsayilan}'))


with app.app_context():
    semayi_guncelle()


# ------------------------------------------------------------------
# Sabitler ve yardımcılar
# ------------------------------------------------------------------
GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
         'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

SAAT_DILIMLERI = [f'{s:02d}:{d:02d}' for s in range(9, 18) for d in (0, 30)]
ISLEM_TURLERI = ['Genel Muayene', 'Kontrol Muayenesi', 'Kan Tahlili', 'Ultrason',
                 'Pansuman', 'Enjeksiyon', 'EKG', 'Konsültasyon']
DURUMLAR = ['Bekliyor', 'Onaylandı', 'Tamamlandı', 'Gelmedi', 'İptal']
KAN_GRUPLARI = ['A Rh+', 'A Rh−', 'B Rh+', 'B Rh−', 'AB Rh+', 'AB Rh−', '0 Rh+', '0 Rh−']
EMAIL_DESENI = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

ISLEM_ADLARI = {
    'giris': 'Giriş', 'giris_hatali': 'Hatalı giriş', 'cikis': 'Çıkış', 'kilit_acma': 'Kilit açma',
    'goruntuleme': 'Görüntüleme', 'olusturma': 'Oluşturma', 'guncelleme': 'Güncelleme', 'silme': 'Silme',
    'yazdirma': 'Yazdırma', 'disa_aktarma': 'Dışa aktarma', 'riza': 'Rıza', 'yedek': 'Yedekleme',
    'geri_yukleme': 'Geri yükleme', 'yetki': 'Yetki', 'tahsilat': 'Tahsilat', 'iptal': 'İptal',
    'online': 'Online talep', 'ayar': 'Ayar', 'hatirlatma': 'Hatırlatma', 'stok': 'Stok',
}
HEDEF_ADLARI = {'hasta': 'Hasta', 'randevu': 'Randevu', 'muayene': 'Muayene', 'recete': 'Reçete',
                'vital': 'Vital', 'kullanici': 'Kullanıcı', 'yedek': 'Yedek', 'oturum': 'Oturum', 'gunluk': 'Günlük',
                'kasa': 'Kasa', 'talep': 'Online talep', 'isaret': 'Vücut işareti', 'ayar': 'Ayar',
                'malzeme': 'Malzeme', 'rapor': 'Rapor'}
YONTEMLER = ['Nakit', 'Kart', 'Havale']


@app.template_filter('tr_tarih')
def tr_tarih(d):
    if not d:
        return '—'
    return f'{d.day} {AYLAR[d.month - 1]} {d.year}'


@app.template_filter('kisa_tarih')
def kisa_tarih(d):
    if not d:
        return '—'
    return d.strftime('%d.%m.%Y')


@app.template_filter('tr_gun')
def tr_gun(d):
    return GUNLER[d.weekday()] if d else ''


@app.template_filter('tl')
def tl(kurus, isaretli=False):
    """Kuruş cinsinden tutarı ₺1.250 / ₺1.250,50 biçiminde gösterir."""
    if kurus is None:
        return '—'
    k = abs(int(kurus))
    lira, kr = divmod(k, 100)
    metin = f'{lira:,}'.replace(',', '.') + (f',{kr:02d}' if kr else '')
    on = '−' if kurus < 0 else ('+' if isaretli and kurus > 0 else '')
    return f'{on}₺{metin}'


_BIRLER = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
_ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']


def _uc_basamak(n):
    parca = []
    yuz, on, bir = n // 100, (n % 100) // 10, n % 10
    if yuz:
        parca += ([] if yuz == 1 else [_BIRLER[yuz]]) + ['yüz']
    if on:
        parca.append(_ONLAR[on])
    if bir:
        parca.append(_BIRLER[bir])
    return parca


@app.template_filter('yaziyla')
def yaziyla(kurus):
    """125050 → 'bin iki yüz elli Türk lirası elli kuruş' (makbuz için)."""
    lira, kr = divmod(abs(int(kurus or 0)), 100)
    kelimeler = []
    for bolen, ad in ((10 ** 9, 'milyar'), (10 ** 6, 'milyon'), (1000, 'bin')):
        grup, lira = divmod(lira, bolen)
        if grup:
            kelimeler += ([] if (grup == 1 and ad == 'bin') else _uc_basamak(grup)) + [ad]
    kelimeler += _uc_basamak(lira)
    metin = (' '.join(kelimeler) or 'sıfır') + ' Türk lirası'
    if kr:
        metin += ' ' + ' '.join(_uc_basamak(kr)) + ' kuruş'
    return metin


def tutar_coz(deger):
    """'1.250,50', '1250.5' veya sayı → kuruş (int). Geçersizse None."""
    if deger is None or isinstance(deger, bool):
        return None
    if isinstance(deger, (int, float)):
        sayi = float(deger)
    else:
        m = str(deger).strip().replace('₺', '').replace('TL', '').replace(' ', '')
        if ',' in m:
            m = m.replace('.', '').replace(',', '.')
        try:
            sayi = float(m)
        except ValueError:
            return None
    if not math.isfinite(sayi):
        return None
    return int(round(sayi * 100))


@app.context_processor
def ortak_degiskenler():
    bekleyen_talep = kritik_stok = 0
    if g.get('kullanici'):
        bekleyen_talep = OnlineTalep.query.filter_by(durum='Bekliyor').count()
        kritik_stok = Malzeme.query.filter(Malzeme.aktif.is_(True), Malzeme.miktar <= Malzeme.kritik).count()
    return {
        'bekleyen_talep': bekleyen_talep,
        'kritik_stok': kritik_stok,
        'bugun': date.today(),
        'ISLEM_TURLERI': ISLEM_TURLERI,
        'KAN_GRUPLARI': KAN_GRUPLARI,
        'KLINIK_ADI': KLINIK_ADI,
        'KILIT_DAKIKA': KILIT_DAKIKA,
        'kullanici': g.get('kullanici'),
    }


def hata(mesaj, kod=400, **ek):
    govde = {'hata': mesaj}
    govde.update(ek)
    return jsonify(govde), kod


def hafta_baslangici(d):
    return d - timedelta(days=d.weekday())


def tarih_coz(deger):
    try:
        return datetime.strptime(deger or '', '%Y-%m-%d').date()
    except ValueError:
        return None


def istemci_ip():
    return (request.headers.get('X-Forwarded-For', request.remote_addr or '') or '').split(',')[0].strip()[:45]


def islem_kaydet(islem, hedef_tur=None, hedef_id=None, aciklama='', kullanici=None, ad=None):
    """KVKK işlem günlüğüne kayıt ekler (commit çağıranın sorumluluğundadır)."""
    k = kullanici or g.get('kullanici')
    db.session.add(IslemKaydi(
        kullanici_id=k.id if k else None,
        kullanici_adi=k.gorunen_ad if k else ad,
        islem=islem, hedef_tur=hedef_tur, hedef_id=hedef_id,
        aciklama=(aciklama or '')[:300], ip=istemci_ip(),
    ))


# ------------------------------------------------------------------
# Kimlik doğrulama, oturum zaman aşımı ve yetki
# ------------------------------------------------------------------
ACIK_UC_NOKTALAR = {'giris', 'kurulum', 'api_giris', 'api_kurulum', 'static',
                    # Hastaların girişsiz kullandığı online randevu sayfası
                    'online_randevu', 'online_aydinlatma', 'online_takvim', 'online_saatler', 'online_talep_olustur',
                    'online_takip', 'online_takip_ics', 'online_talep_iptal'}
_hatali_girisler = {}  # e-posta -> [deneme sayısı, kilit bitiş zamanı]


@app.before_request
def oturum_kontrolu():
    g.kullanici = None
    kid = session.get('kullanici_id')
    if kid:
        son = session.get('son_aktivite')
        simdi = datetime.utcnow().timestamp()
        if son and simdi - son > OTURUM_DAKIKA * 60:
            session.clear()
            g.oturum_doldu = True
        else:
            g.kullanici = db.session.get(Doktor, kid)
            if g.kullanici is None:
                session.clear()
            elif request.endpoint not in ('static',):
                session['son_aktivite'] = simdi

    if request.endpoint in ACIK_UC_NOKTALAR or request.endpoint is None:
        return None
    if g.kullanici is None:
        if request.path.startswith('/api/'):
            return hata('Güvenliğiniz için oturumunuz kapatıldı. Lütfen tekrar giriş yapın.', 401)
        if Doktor.query.count() == 0:
            return redirect(url_for('kurulum'))
        return redirect(url_for('giris', sonraki=request.full_path.rstrip('?'),
                                zaman_asimi=1 if g.get('oturum_doldu') else None))
    otomatik_yedek()
    return None


def doktor_gerekli(f):
    """Yalnızca doktor rolündeki kullanıcıların erişebileceği uç noktalar için."""
    @wraps(f)
    def sarmal(*args, **kwargs):
        if not g.kullanici or not g.kullanici.doktor_mu:
            if request.path.startswith('/api/'):
                return hata('Bu işlem için doktor yetkisi gerekiyor.', 403)
            return redirect(url_for('panel'))
        return f(*args, **kwargs)
    return sarmal


def oturum_ac(kullanici):
    session.clear()
    session.permanent = True
    session['kullanici_id'] = kullanici.id
    session['son_aktivite'] = datetime.utcnow().timestamp()
    kullanici.son_giris = datetime.utcnow()
    islem_kaydet('giris', 'oturum', kullanici.id, 'Başarılı giriş', kullanici=kullanici)
    db.session.commit()


def guvenli_yonlendirme(adres):
    if adres and adres.startswith('/') and not adres.startswith('//'):
        return adres
    return url_for('panel')


@app.route('/giris')
def giris():
    if Doktor.query.count() == 0:
        return redirect(url_for('kurulum'))
    if g.kullanici:
        return redirect(url_for('panel'))
    return render_template('giris.html', kurulum_modu=False, sonraki=request.args.get('sonraki', ''),
                           zaman_asimi=bool(request.args.get('zaman_asimi')))


@app.route('/kurulum')
def kurulum():
    if Doktor.query.count() > 0:
        return redirect(url_for('giris'))
    return render_template('giris.html', kurulum_modu=True, sonraki='', zaman_asimi=False)


@app.route('/cikis')
def cikis():
    if g.kullanici:
        islem_kaydet('cikis', 'oturum', g.kullanici.id, 'Çıkış yapıldı')
        db.session.commit()
    session.clear()
    return redirect(url_for('giris'))


@app.route('/api/giris', methods=['POST'])
def api_giris():
    veri = request.get_json(silent=True) or {}
    email = (veri.get('email') or '').strip().lower()
    simdi = datetime.utcnow()
    kayit = _hatali_girisler.get(email)
    if kayit and kayit[1] and kayit[1] > simdi:
        kalan = int((kayit[1] - simdi).total_seconds() // 60) + 1
        return hata(f'Çok sayıda hatalı deneme. Lütfen {kalan} dakika sonra tekrar deneyin.', 429)

    kullanici = Doktor.query.filter_by(email=email).first()
    if not kullanici or not kullanici.sifre_dogru_mu(veri.get('sifre') or ''):
        sayi = (kayit[0] if kayit else 0) + 1
        _hatali_girisler[email] = [sayi, simdi + timedelta(minutes=5) if sayi >= 5 else None]
        islem_kaydet('giris_hatali', 'oturum', kullanici.id if kullanici else None,
                     f'Hatalı giriş denemesi: {email}', kullanici=kullanici)
        db.session.commit()
        kalan = 5 - sayi
        ek = f' {kalan} deneme hakkınız kaldı.' if 0 < kalan <= 2 else ''
        return hata('E-posta veya şifre hatalı.' + ek, 401)

    _hatali_girisler.pop(email, None)
    oturum_ac(kullanici)
    return jsonify({'mesaj': f'Hoş geldiniz, {kullanici.gorunen_ad}.',
                    'yonlendir': guvenli_yonlendirme(veri.get('sonraki'))})


@app.route('/api/kilit_ac', methods=['POST'])
def kilit_ac():
    """Ekran kilidini şifre ile açar."""
    if not g.kullanici.sifre_dogru_mu((request.get_json(silent=True) or {}).get('sifre') or ''):
        islem_kaydet('giris_hatali', 'oturum', g.kullanici.id, 'Kilit ekranında hatalı şifre')
        db.session.commit()
        return hata('Şifre hatalı.')
    islem_kaydet('kilit_acma', 'oturum', g.kullanici.id, 'Ekran kilidi açıldı')
    db.session.commit()
    return jsonify({'mesaj': 'Kilit açıldı.'})


@app.route('/api/canli', methods=['POST'])
def canli():
    """Kullanıcı aktifken oturumu canlı tutar."""
    return jsonify({'ok': True})


def kullanici_dogrula(veri):
    ad = (veri.get('ad_soyad') or '').strip()
    email = (veri.get('email') or '').strip().lower()
    sifre = veri.get('sifre') or ''
    if not ad:
        return None, 'Ad soyad zorunludur.'
    if not EMAIL_DESENI.match(email):
        return None, 'Geçerli bir e-posta adresi girin.'
    if len(sifre) < 8:
        return None, 'Şifre en az 8 karakter olmalıdır.'
    if Doktor.query.filter_by(email=email).first():
        return None, 'Bu e-posta ile kayıtlı bir kullanıcı zaten var.'
    return {'ad_soyad': ad, 'email': email, 'sifre': sifre}, None


@app.route('/api/kurulum', methods=['POST'])
def api_kurulum():
    if Doktor.query.count() > 0:
        return hata('Kurulum zaten tamamlanmış.', 409)
    temiz, mesaj = kullanici_dogrula(request.get_json(silent=True) or {})
    if mesaj:
        return hata(mesaj)
    k = Doktor(ad_soyad=temiz['ad_soyad'], email=temiz['email'], rol='doktor')
    k.sifre_belirle(temiz['sifre'])
    db.session.add(k)
    db.session.commit()
    oturum_ac(k)
    return jsonify({'mesaj': 'Kurulum tamamlandı.', 'yonlendir': url_for('panel')}), 201


# ------------------------------------------------------------------
# Ekip yönetimi (yalnızca doktor)
# ------------------------------------------------------------------
@app.route('/ekip')
@doktor_gerekli
def ekip():
    uyeler = Doktor.query.order_by(Doktor.rol.asc(), Doktor.ad_soyad.asc()).all()
    return render_template('ekip.html', uyeler=uyeler, roller=ROLLER)


@app.route('/api/kullanici_ekle', methods=['POST'])
@doktor_gerekli
def kullanici_ekle():
    veri = request.get_json(silent=True) or {}
    temiz, mesaj = kullanici_dogrula(veri)
    if mesaj:
        return hata(mesaj)
    rol = veri.get('rol') if veri.get('rol') in ROLLER else 'sekreter'
    k = Doktor(ad_soyad=temiz['ad_soyad'], email=temiz['email'], rol=rol)
    k.sifre_belirle(temiz['sifre'])
    db.session.add(k)
    db.session.flush()
    islem_kaydet('yetki', 'kullanici', k.id, f'{k.gorunen_ad} ({k.rol_adi}) ekibe eklendi')
    db.session.commit()
    return jsonify({'mesaj': f'{k.gorunen_ad} ekibe eklendi.'}), 201


@app.route('/api/kullanici/<int:kid>', methods=['DELETE'])
@doktor_gerekli
def kullanici_sil(kid):
    k = db.get_or_404(Doktor, kid)
    if k.id == g.kullanici.id:
        return hata('Kendi hesabınızı silemezsiniz.')
    if k.doktor_mu and Doktor.query.filter_by(rol='doktor').count() <= 1:
        return hata('Sistemde en az bir doktor kalmalıdır.')
    for model, alan in ((Randevu, 'doktor_id'), (Muayene, 'doktor_id'), (Recete, 'doktor_id'),
                        (Vital, 'olcen_id'), (IslemKaydi, 'kullanici_id'), (KasaHareketi, 'kullanici_id'),
                        (KasaHareketi, 'iptal_eden_id'), (OnlineTalep, 'isleyen_id'), (VucutIsareti, 'doktor_id'),
                        (StokHareketi, 'kullanici_id')):
        model.query.filter(getattr(model, alan) == k.id).update({alan: None})
    islem_kaydet('yetki', 'kullanici', k.id, f'{k.gorunen_ad} ekipten kaldırıldı')
    db.session.delete(k)
    db.session.commit()
    return jsonify({'mesaj': 'Kullanıcı silindi.'})


@app.route('/api/sifre_degistir', methods=['POST'])
def sifre_degistir():
    veri = request.get_json(silent=True) or {}
    if not g.kullanici.sifre_dogru_mu(veri.get('mevcut') or ''):
        return hata('Mevcut şifre hatalı.')
    yeni = veri.get('yeni') or ''
    if len(yeni) < 8:
        return hata('Yeni şifre en az 8 karakter olmalıdır.')
    g.kullanici.sifre_belirle(yeni)
    islem_kaydet('guncelleme', 'kullanici', g.kullanici.id, 'Şifre değiştirildi')
    db.session.commit()
    return jsonify({'mesaj': 'Şifreniz güncellendi.'})


# ------------------------------------------------------------------
# Sayfalar
# ------------------------------------------------------------------
@app.route('/')
def panel():
    bugun = date.today()
    simdi = datetime.now()
    pazartesi = hafta_baslangici(bugun)

    bugun_randevular = (Randevu.query.filter_by(tarih=bugun)
                        .order_by(Randevu.saat.asc()).all())
    aktif = [r for r in bugun_randevular if r.durum in ('Bekliyor', 'Onaylandı')]
    siradaki = next((r for r in aktif if r.saat >= simdi.strftime('%H:%M')), None)

    hafta = []
    for i in range(7):
        gun = pazartesi + timedelta(days=i)
        sayi = Randevu.query.filter(Randevu.tarih == gun, Randevu.durum != 'İptal').count()
        hafta.append({'kisa': GUN_KISA[i], 'sayi': sayi, 'bugun': gun == bugun})
    hafta_max = max([h['sayi'] for h in hafta] + [1])
    for h in hafta:
        h['yukseklik'] = max(6, round(h['sayi'] / hafta_max * 130))

    ay_basi = datetime.combine(bugun.replace(day=1), time.min)
    hafta_basi = datetime.combine(pazartesi, time.min)

    saat = simdi.hour
    selamlama = 'Günaydın' if 5 <= saat < 12 else ('İyi günler' if saat < 18 else 'İyi akşamlar')

    istatistik = {
        'toplam_hasta': Hasta.query.count(),
        'hafta_yeni': Hasta.query.filter(Hasta.kayit_tarihi >= hafta_basi).count(),
        'bugun_randevu': len(bugun_randevular),
        'bugun_tamamlanan': len([r for r in bugun_randevular if r.durum == 'Tamamlandı']),
        'bekleyen': Randevu.query.filter(Randevu.durum == 'Bekliyor', Randevu.tarih >= bugun).count(),
        'ay_yeni': Hasta.query.filter(Hasta.kayit_tarihi >= ay_basi).count(),
        'hafta_toplam': sum(h['sayi'] for h in hafta),
    }
    en_yakin_bekleyen = (Randevu.query.filter(Randevu.durum == 'Bekliyor', Randevu.tarih >= bugun)
                         .order_by(Randevu.tarih.asc(), Randevu.saat.asc()).first())
    son_hastalar = Hasta.query.order_by(Hasta.kayit_tarihi.desc()).limit(4).all()

    return render_template(
        'dashboard.html',
        istatistik=istatistik,
        bugun_randevular=bugun_randevular,
        siradaki=siradaki,
        en_yakin_bekleyen=en_yakin_bekleyen,
        hafta=hafta,
        pazartesi=pazartesi,
        pazar=pazartesi + timedelta(days=6),
        son_hastalar=son_hastalar,
        selamlama=selamlama,
    )


@app.route('/hastalar')
def hastalar_listesi():
    tum_hastalar = Hasta.query.order_by(Hasta.kayit_tarihi.desc()).all()
    hafta_basi = datetime.combine(hafta_baslangici(date.today()), time.min)
    hafta_yeni = len([h for h in tum_hastalar if h.kayit_tarihi and h.kayit_tarihi >= hafta_basi])
    return render_template('hastalar.html', hastalar=tum_hastalar, hafta_yeni=hafta_yeni)


@app.route('/hasta/<int:hasta_id>')
def hasta_detay(hasta_id):
    hasta = db.get_or_404(Hasta, hasta_id)
    islem_kaydet('goruntuleme', 'hasta', hasta.id, f'{hasta.ad_soyad} hasta dosyası açıldı')
    db.session.commit()
    # Muayene kaydına bağlanabilecek randevular: iptal olmayan ve henüz muayenesi girilmemiş olanlar
    baglanabilir = [r for r in hasta.randevular if r.durum != 'İptal' and r.muayene is None]
    tarifeler = tarife_sozlugu()
    ucretlenebilir = ucretlenebilir_randevular(hasta, tarifeler)
    doktor = g.kullanici.doktor_mu
    return render_template(
        'hasta_profil.html',
        hasta=hasta,
        hasta_json=hasta.sozluk(tam=True),
        vitaller_json=[v.sozluk() for v in hasta.vitaller],
        baglanabilir_randevular=baglanabilir,
        acilacak_randevu=request.args.get('muayene', type=int),
        ilaclar_json=ilac_listesi(),
        uyari_notu=UYARI_NOTU,
        hesap_json={
            'bakiye': hasta.bakiye,
            'hareketler': [hareket_sozluk(h) for h in hasta.kasa_hareketleri],
            'tarifeler': tarifeler,
            'ucretlenebilir': ucretlenebilir,
            'yontemler': YONTEMLER,
            'ac': bool(request.args.get('tahsilat')),
            'kullanici_id': g.kullanici.id,
        },
        isaretler_json=[i.sozluk() for i in hasta.isaretler] if doktor else [],
        isaret_turleri=VucutIsareti.TURLER,
        muayeneler_json=[{'id': m.id, 'etiket': f'{kisa_tarih(m.tarih)} · {m.tani}', 'bugun': m.tarih.date() == date.today()}
                         for m in hasta.muayeneler] if doktor else [],
    )


@app.route('/randevular')
def randevular_sayfasi():
    secili = tarih_coz(request.args.get('tarih')) or date.today()
    pazartesi = hafta_baslangici(secili)
    pazar = pazartesi + timedelta(days=6)
    haftalik = (Randevu.query.filter(Randevu.tarih >= pazartesi, Randevu.tarih <= pazar)
                .order_by(Randevu.tarih.asc(), Randevu.saat.asc()).all())

    gunler = []
    for i in range(7):
        gun = pazartesi + timedelta(days=i)
        gunler.append({
            'iso': gun.isoformat(),
            'kisa': GUN_KISA[i],
            'uzun': GUNLER[i],
            'gun': gun.day,
            'ay': AYLAR[gun.month - 1],
            'sayi': len([r for r in haftalik if r.tarih == gun]),
        })

    tum_hastalar = Hasta.query.order_by(Hasta.ad_soyad.asc()).all()
    return render_template(
        'randevular.html',
        secili=secili,
        gunler=gunler,
        pazartesi=pazartesi,
        onceki_hafta=(pazartesi - timedelta(days=7)).isoformat(),
        sonraki_hafta=(pazartesi + timedelta(days=7)).isoformat(),
        randevular_json=[r.sozluk() for r in haftalik],
        hastalar=tum_hastalar,
        secili_hasta_id=request.args.get('hasta_id', type=int),
        saat_dilimleri=SAAT_DILIMLERI,
        hafta_toplam=len([r for r in haftalik if r.durum != 'İptal']),
        talepler_json=[talep_sozluk(t, tum_hastalar) for t in
                       OnlineTalep.query.filter_by(durum='Bekliyor').order_by(OnlineTalep.olusturma.asc()).all()],
        online_ayar=online_ayarlari(),
        online_link=url_for('online_randevu', _external=True),
        GUNLER=GUNLER,
    )


# ------------------------------------------------------------------
# API: Hastalar
# ------------------------------------------------------------------
def hasta_verisi_dogrula(veri, mevcut_id=None):
    ad_soyad = (veri.get('ad_soyad') or '').strip()
    telefon = (veri.get('telefon') or '').strip()
    tc = (veri.get('tc_kimlik') or '').strip()
    if not ad_soyad:
        return 'Ad soyad zorunludur.'
    if not telefon:
        return 'Telefon numarası zorunludur.'
    if tc and not re.fullmatch(r'\d{11}', tc):
        return 'TC kimlik numarası 11 haneli olmalıdır.'
    if tc:
        ayni = Hasta.query.filter(Hasta.tc_kimlik == tc)
        if mevcut_id:
            ayni = ayni.filter(Hasta.id != mevcut_id)
        if ayni.first():
            return 'Bu TC kimlik numarası ile kayıtlı başka bir hasta var.'
    if veri.get('dogum_tarihi') and not tarih_coz(veri.get('dogum_tarihi')):
        return 'Doğum tarihi geçersiz.'
    return None


def hasta_alanlarini_yaz(hasta, veri):
    for alan in Hasta.DUZENLENEBILIR:
        deger = veri.get(alan)
        deger = deger.strip() if isinstance(deger, str) else deger
        setattr(hasta, alan, deger or None)


@app.route('/api/hasta_ekle', methods=['POST'])
def hasta_ekle():
    veri = request.get_json(silent=True) or {}
    mesaj = hasta_verisi_dogrula(veri)
    if mesaj:
        return hata(mesaj, 409 if 'başka bir hasta' in mesaj else 400)
    yeni_hasta = Hasta()
    hasta_alanlarini_yaz(yeni_hasta, veri)
    if veri.get('kvkk_onay'):
        yeni_hasta.kvkk_onay = True
        yeni_hasta.kvkk_onay_tarihi = datetime.now()
    db.session.add(yeni_hasta)
    db.session.flush()
    islem_kaydet('olusturma', 'hasta', yeni_hasta.id, f'{yeni_hasta.ad_soyad} kaydedildi'
                 + (' (açık rıza alındı)' if yeni_hasta.kvkk_onay else ' (rıza bekliyor)'))
    db.session.commit()
    return jsonify({'mesaj': 'Hasta kaydı başarıyla oluşturuldu.', 'id': yeni_hasta.id}), 201


@app.route('/api/hasta/<int:hasta_id>', methods=['PUT'])
def hasta_guncelle(hasta_id):
    hasta = db.get_or_404(Hasta, hasta_id)
    veri = request.get_json(silent=True) or {}
    mesaj = hasta_verisi_dogrula(veri, mevcut_id=hasta.id)
    if mesaj:
        return hata(mesaj, 409 if 'başka bir hasta' in mesaj else 400)
    def yeni_deger(a):
        d = veri.get(a)
        d = d.strip() if isinstance(d, str) else d
        return d or None
    degisen = [a for a in Hasta.DUZENLENEBILIR if yeni_deger(a) != getattr(hasta, a)]
    hasta_alanlarini_yaz(hasta, veri)
    islem_kaydet('guncelleme', 'hasta', hasta.id, f'{hasta.ad_soyad} güncellendi: ' + ', '.join(degisen)[:200])
    db.session.commit()
    return jsonify({'mesaj': 'Hasta bilgileri güncellendi.', 'id': hasta.id})


@app.route('/api/hasta/<int:hasta_id>', methods=['DELETE'])
@doktor_gerekli
def hasta_sil(hasta_id):
    hasta = db.get_or_404(Hasta, hasta_id)
    ad = hasta.ad_soyad
    randevu_idleri = [r.id for r in hasta.randevular]
    OnlineTalep.query.filter(OnlineTalep.hasta_id == hasta.id).update({'hasta_id': None})
    if randevu_idleri:
        StokHareketi.query.filter(StokHareketi.randevu_id.in_(randevu_idleri)).update({'randevu_id': None}, synchronize_session=False)
        OnlineTalep.query.filter(OnlineTalep.randevu_id.in_(randevu_idleri)).update({'randevu_id': None}, synchronize_session=False)
    islem_kaydet('silme', 'hasta', hasta.id, f'{ad} ve tüm tıbbi kayıtları silindi')
    db.session.delete(hasta)
    db.session.commit()
    return jsonify({'mesaj': f'{ad} ve tüm kayıtları silindi.', 'yonlendir': url_for('hastalar_listesi')})


@app.route('/api/hasta/<int:hasta_id>/kvkk', methods=['POST'])
def hasta_kvkk(hasta_id):
    """Açık rızayı kaydeder veya geri alır."""
    hasta = db.get_or_404(Hasta, hasta_id)
    onay = bool((request.get_json(silent=True) or {}).get('onay'))
    hasta.kvkk_onay = onay
    hasta.kvkk_onay_tarihi = datetime.now()
    islem_kaydet('riza', 'hasta', hasta.id,
                 f'{hasta.ad_soyad}: açık rıza {"alındı" if onay else "geri çekildi"}')
    db.session.commit()
    return jsonify({'mesaj': 'Açık rıza kaydedildi.' if onay else 'Rızanın geri çekildiği kaydedildi.',
                    'kvkk_onay': onay})


@app.route('/hasta/<int:hasta_id>/veri')
@doktor_gerekli
def hasta_veri_indir(hasta_id):
    """KVKK m.11 kapsamında hastanın tüm verisinin makinece okunabilir dökümü."""
    hasta = db.get_or_404(Hasta, hasta_id)
    dokum = {
        'olusturma_zamani': datetime.now().isoformat(timespec='seconds'),
        'veri_sorumlusu': KLINIK_ADI,
        'hasta': {**{a: getattr(hasta, a) for a in Hasta.DUZENLENEBILIR},
                  'kayit_tarihi': hasta.kayit_tarihi.isoformat() if hasta.kayit_tarihi else None,
                  'kvkk_onay': hasta.kvkk_onay,
                  'kvkk_onay_tarihi': hasta.kvkk_onay_tarihi.isoformat() if hasta.kvkk_onay_tarihi else None},
        'randevular': [r.sozluk() for r in hasta.randevular],
        'muayeneler': [{'tarih': m.tarih.isoformat(), 'tani': m.tani, 'bulgular': m.bulgular, 'tedavi': m.tedavi,
                        'kontrol_tarihi': m.kontrol_tarihi.isoformat() if m.kontrol_tarihi else None,
                        'hekim': m.doktor.gorunen_ad if m.doktor else None} for m in hasta.muayeneler],
        'receteler': [{'no': r.recete_no, 'tarih': r.tarih.isoformat(), 'tani': r.tani, 'notlar': r.notlar,
                       'ilaclar': [{'ilac': k.ilac_adi, 'doz': k.doz, 'kullanim': k.kullanim, 'sure': k.sure,
                                    'adet': k.adet} for k in r.kalemler]} for r in hasta.receteler],
        'vital_bulgular': [v.sozluk() for v in hasta.vitaller],
        'vucut_haritasi': [i.sozluk() for i in hasta.isaretler],
        'hesap_hareketleri': [hareket_sozluk(h) for h in hasta.kasa_hareketleri],
    }
    islem_kaydet('disa_aktarma', 'hasta', hasta.id, f'{hasta.ad_soyad} verileri dışa aktarıldı')
    db.session.commit()
    ad = re.sub(r'[^A-Za-z0-9]+', '_', hasta.ad_soyad.translate(str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')))
    return Response(json.dumps(dokum, ensure_ascii=False, indent=2), mimetype='application/json',
                    headers={'Content-Disposition': f'attachment; filename=hasta_{hasta.id}_{ad}.json'})


@app.route('/kvkk/aydinlatma')
def kvkk_aydinlatma():
    return render_template('aydinlatma.html', hasta=db.session.get(Hasta, request.args.get('hasta', type=int) or 0))


# ------------------------------------------------------------------
# API: Randevular
# ------------------------------------------------------------------
def dolu_saat_kumesi(tarih, haric_randevu=None, haric_talep=None):
    """Randevular ve onay bekleyen online talepler o günün dolu saatleridir."""
    dolu = {r.saat for r in Randevu.query.filter(Randevu.tarih == tarih, Randevu.durum != 'İptal').all()
            if r.id != haric_randevu}
    dolu |= {t.saat for t in OnlineTalep.query.filter_by(tarih=tarih, durum='Bekliyor').all() if t.id != haric_talep}
    return dolu


def saat_cakisiyor_mu(tarih, saat, haric_id=None, haric_talep=None):
    return saat in dolu_saat_kumesi(tarih, haric_randevu=haric_id, haric_talep=haric_talep)


@app.route('/api/randevu_ekle', methods=['POST'])
def randevu_ekle():
    veri = request.get_json(silent=True) or {}
    tarih = tarih_coz(veri.get('tarih'))
    if not tarih:
        return hata('Geçerli bir tarih seçin.')
    saat = (veri.get('saat') or '').strip()
    if not re.fullmatch(r'\d{2}:\d{2}', saat):
        return hata('Geçerli bir saat seçin.')

    hasta = db.session.get(Hasta, veri.get('hasta_id') or 0)
    if not hasta:
        return hata('Lütfen bir hasta seçin.')
    if saat_cakisiyor_mu(tarih, saat):
        return hata(f'{saat} saati bu tarihte dolu.', 409)

    yeni_randevu = Randevu(
        hasta_id=hasta.id,
        tarih=tarih,
        saat=saat,
        islem_turu=veri.get('islem_turu') or 'Genel Muayene',
        notlar=(veri.get('notlar') or '').strip() or None,
        durum='Bekliyor',
        doktor_id=g.kullanici.id if g.kullanici.doktor_mu else None,
    )
    db.session.add(yeni_randevu)
    db.session.flush()
    islem_kaydet('olusturma', 'randevu', yeni_randevu.id, f'{hasta.ad_soyad} · {kisa_tarih(tarih)} {saat}')
    db.session.commit()
    return jsonify({'mesaj': 'Randevu başarıyla oluşturuldu.', 'randevu': yeni_randevu.sozluk()}), 201


@app.route('/api/randevu/<int:randevu_id>', methods=['PUT'])
def randevu_ertele(randevu_id):
    """Randevunun tarih/saatini değiştirir (erteleme)."""
    randevu = db.get_or_404(Randevu, randevu_id)
    if randevu.durum == 'Tamamlandı':
        return hata('Tamamlanmış bir randevu ertelenemez.')
    veri = request.get_json(silent=True) or {}
    tarih = tarih_coz(veri.get('tarih'))
    saat = (veri.get('saat') or '').strip()
    if not tarih:
        return hata('Geçerli bir tarih seçin.')
    if not re.fullmatch(r'\d{2}:\d{2}', saat):
        return hata('Geçerli bir saat seçin.')
    if tarih == randevu.tarih and saat == randevu.saat:
        return hata('Yeni tarih veya saat mevcut randevuyla aynı.')
    if saat_cakisiyor_mu(tarih, saat, haric_id=randevu.id):
        return hata(f'{saat} saati bu tarihte dolu.', 409)

    eski = f'{kisa_tarih(randevu.tarih)} {randevu.saat}'
    randevu.tarih = tarih
    randevu.saat = saat
    if randevu.durum == 'İptal':
        randevu.durum = 'Bekliyor'
    if veri.get('not_ekle'):
        ek = f'Ertelendi (önceki: {eski})'
        randevu.notlar = f'{randevu.notlar} · {ek}' if randevu.notlar else ek
    islem_kaydet('guncelleme', 'randevu', randevu.id, f'Ertelendi: {eski} → {kisa_tarih(tarih)} {saat}')
    db.session.commit()
    return jsonify({'mesaj': f'Randevu {kisa_tarih(tarih)} {saat} tarihine ertelendi.', 'randevu': randevu.sozluk()})


@app.route('/api/randevu_durum/<int:randevu_id>', methods=['POST'])
def randevu_durum(randevu_id):
    randevu = db.get_or_404(Randevu, randevu_id)
    durum = (request.get_json(silent=True) or {}).get('durum')
    if durum not in DURUMLAR:
        return hata('Geçersiz durum.')
    if durum == 'Gelmedi' and randevu.tarih > date.today():
        return hata('Henüz gelmemiş bir randevu "Gelmedi" olarak işaretlenemez.')
    eski = randevu.durum
    randevu.durum = durum
    islem_kaydet('guncelleme', 'randevu', randevu.id, f'Durum: {eski} → {durum}')
    ucret = randevu_ucretlendir(randevu) if durum == 'Tamamlandı' else None
    stok = stok_dus(randevu) if durum == 'Tamamlandı' else None
    db.session.commit()
    parcalar = []
    if durum == 'Tamamlandı':
        parcalar.append('Randevu tamamlandı')
        if ucret:
            parcalar.append(f'{tl(ucret.tutar)} hizmet ücreti hesaba eklendi')
        if stok and stok['adet']:
            parcalar.append(f"stoktan {stok['adet']} kalem düşüldü")
    mesaj = ' · '.join(parcalar) + '.' if parcalar else 'Randevu durumu güncellendi.'
    if durum == 'Gelmedi':
        mesaj = f'{randevu.hasta.ad_soyad} gelmedi olarak işaretlendi ({randevu.hasta.gelmeme_sayisi}. kez).'
    return jsonify({'mesaj': mesaj, 'randevu': randevu.sozluk(),
                    'kritik': stok['kritik'] if stok else []})


@app.route('/api/dolu_saatler')
def dolu_saatler():
    tarih = tarih_coz(request.args.get('tarih'))
    if not tarih:
        return hata('Geçerli bir tarih gönderin.')
    dolu = dolu_saat_kumesi(tarih, haric_randevu=request.args.get('haric', type=int),
                            haric_talep=request.args.get('haric_talep', type=int))
    return jsonify({'tarih': tarih.isoformat(), 'dolu': sorted(dolu)})


# ------------------------------------------------------------------
# API: Vital bulgular
# ------------------------------------------------------------------
VITAL_SINIRLARI = {
    'sistolik': (int, 50, 260, 'Sistolik tansiyon'), 'diastolik': (int, 30, 160, 'Diastolik tansiyon'),
    'nabiz': (int, 25, 250, 'Nabız'), 'ates': (float, 33, 43, 'Ateş'), 'seker': (int, 20, 700, 'Kan şekeri'),
    'spo2': (int, 50, 100, 'SpO₂'), 'kilo': (float, 1, 350, 'Kilo'), 'boy': (int, 40, 250, 'Boy'),
}


def vital_olustur(hasta, veri, muayene=None):
    """Doğrulanmış bir Vital nesnesi döndürür; değer yoksa None, hatalıysa ValueError."""
    degerler = {}
    for alan, (tip, alt, ust, ad) in VITAL_SINIRLARI.items():
        ham = veri.get(alan)
        if ham in (None, ''):
            continue
        try:
            sayi = tip(str(ham).replace(',', '.'))
        except ValueError:
            raise ValueError(f'{ad} için geçerli bir sayı girin.')
        if not alt <= sayi <= ust:
            raise ValueError(f'{ad} {alt}–{ust} aralığında olmalıdır.')
        degerler[alan] = sayi
    if not degerler:
        return None
    if ('sistolik' in degerler) != ('diastolik' in degerler):
        raise ValueError('Tansiyon için büyük ve küçük değerin ikisini de girin.')
    if 'sistolik' in degerler and degerler['sistolik'] <= degerler['diastolik']:
        raise ValueError('Büyük tansiyon küçük tansiyondan yüksek olmalıdır.')
    if 'kilo' in degerler and 'boy' not in degerler:
        onceki = next((v.boy for v in reversed(hasta.vitaller) if v.boy), None)
        if onceki:
            degerler['boy'] = onceki
    return Vital(hasta_id=hasta.id, muayene_id=muayene.id if muayene else None, olcen_id=g.kullanici.id,
                 seker_tok=bool(veri.get('seker_tok')), tarih=datetime.now(), **degerler)


@app.route('/api/vital_ekle', methods=['POST'])
def vital_ekle():
    veri = request.get_json(silent=True) or {}
    hasta = db.session.get(Hasta, veri.get('hasta_id') or 0)
    if not hasta:
        return hata('Hasta bulunamadı.', 404)
    try:
        v = vital_olustur(hasta, veri)
    except ValueError as e:
        return hata(str(e))
    if v is None:
        return hata('En az bir ölçüm değeri girin.')
    db.session.add(v)
    db.session.flush()
    islem_kaydet('olusturma', 'vital', v.id, f'{hasta.ad_soyad} vital bulgu girildi')
    db.session.commit()
    return jsonify({'mesaj': 'Ölçüm kaydedildi.', 'vital': v.sozluk()}), 201


@app.route('/api/vital/<int:vital_id>', methods=['DELETE'])
@doktor_gerekli
def vital_sil(vital_id):
    v = db.get_or_404(Vital, vital_id)
    islem_kaydet('silme', 'vital', v.id, f'{v.hasta.ad_soyad} ölçüm silindi')
    db.session.delete(v)
    db.session.commit()
    return jsonify({'mesaj': 'Ölçüm silindi.'})


# ------------------------------------------------------------------
# API: Muayene kayıtları (yalnızca doktor)
# ------------------------------------------------------------------
@app.route('/api/muayene_ekle', methods=['POST'])
@doktor_gerekli
def muayene_ekle():
    veri = request.get_json(silent=True) or {}
    hasta = db.session.get(Hasta, veri.get('hasta_id') or 0)
    if not hasta:
        return hata('Hasta bulunamadı.', 404)
    tani = (veri.get('tani') or '').strip()
    if not tani:
        return hata('Tanı alanı zorunludur.')

    randevu = None
    if veri.get('randevu_id'):
        randevu = db.session.get(Randevu, int(veri['randevu_id']))
        if not randevu or randevu.hasta_id != hasta.id:
            return hata('Seçilen randevu bu hastaya ait değil.')
        if randevu.muayene is not None:
            return hata('Bu randevu için zaten muayene kaydı girilmiş.', 409)

    kontrol = None
    if veri.get('kontrol_tarihi'):
        kontrol = tarih_coz(veri['kontrol_tarihi'])
        if not kontrol:
            return hata('Kontrol tarihi geçersiz.')
        if kontrol < date.today():
            return hata('Kontrol tarihi geçmiş bir gün olamaz.')

    muayene = Muayene(
        hasta_id=hasta.id,
        randevu_id=randevu.id if randevu else None,
        doktor_id=g.kullanici.id,
        tani=tani,
        bulgular=(veri.get('bulgular') or '').strip() or None,
        tedavi=(veri.get('tedavi') or '').strip() or None,
        kontrol_tarihi=kontrol,
        tarih=datetime.now(),
    )
    db.session.add(muayene)
    db.session.flush()

    if isinstance(veri.get('vital'), dict):
        try:
            v = vital_olustur(hasta, veri['vital'], muayene)
        except ValueError as e:
            db.session.rollback()
            return hata(str(e))
        if v:
            db.session.add(v)

    if randevu:
        randevu.durum = 'Tamamlandı'
        randevu_ucretlendir(randevu)
        stok_dus(randevu)
    if veri.get('guncel_tani'):
        hasta.hastalik_tanisi = tani[:100]
    islem_kaydet('olusturma', 'muayene', muayene.id, f'{hasta.ad_soyad}: {tani}')
    db.session.commit()
    return jsonify({'mesaj': 'Muayene kaydı eklendi.', 'id': muayene.id}), 201


@app.route('/api/muayene/<int:muayene_id>', methods=['DELETE'])
@doktor_gerekli
def muayene_sil(muayene_id):
    muayene = db.get_or_404(Muayene, muayene_id)
    Recete.query.filter_by(muayene_id=muayene.id).update({'muayene_id': None})
    Vital.query.filter_by(muayene_id=muayene.id).update({'muayene_id': None})
    VucutIsareti.query.filter_by(muayene_id=muayene.id).update({'muayene_id': None})
    islem_kaydet('silme', 'muayene', muayene.id, f'{muayene.hasta.ad_soyad}: {muayene.tani}')
    db.session.delete(muayene)
    db.session.commit()
    return jsonify({'mesaj': 'Muayene kaydı silindi.'})


# ------------------------------------------------------------------
# API: Reçete ve ilaç güvenliği (yalnızca doktor)
# ------------------------------------------------------------------
def hasta_hastalik_metni(hasta):
    return ' '.join(filter(None, [hasta.hastalik_tanisi, hasta.kronik_hastaliklar, hasta.sikayet]))


@app.route('/api/recete_kontrol', methods=['POST'])
@doktor_gerekli
def api_recete_kontrol():
    veri = request.get_json(silent=True) or {}
    hasta = db.session.get(Hasta, veri.get('hasta_id') or 0)
    if not hasta:
        return hata('Hasta bulunamadı.', 404)
    adlar = [a for a in (veri.get('ilaclar') or []) if isinstance(a, str) and a.strip()]
    ek_tani = (veri.get('tani') or '').strip()
    uyarilar = recete_kontrol(adlar, hasta.alerji_durumu, hasta_hastalik_metni(hasta) + ' ' + ek_tani)
    return jsonify({'uyarilar': uyarilar, 'taninmayan': [a for a in adlar if not ilac_bul(a)], 'not': UYARI_NOTU})


@app.route('/api/recete_ekle', methods=['POST'])
@doktor_gerekli
def recete_ekle():
    veri = request.get_json(silent=True) or {}
    hasta = db.session.get(Hasta, veri.get('hasta_id') or 0)
    if not hasta:
        return hata('Hasta bulunamadı.', 404)

    kalemler = []
    for i, k in enumerate(veri.get('kalemler') or []):
        ad = (k.get('ilac_adi') or '').strip()
        if not ad:
            continue
        try:
            adet = max(1, min(10, int(k.get('adet') or 1)))
        except (TypeError, ValueError):
            adet = 1
        eslesme = ilac_bul(ad)
        kalemler.append(ReceteKalemi(
            sira=i, ilac_adi=ad[:120], etken_madde=eslesme[1] if eslesme else None,
            doz=(k.get('doz') or '').strip()[:60] or None,
            kullanim=(k.get('kullanim') or '').strip()[:120] or None,
            sure=(k.get('sure') or '').strip()[:40] or None, adet=adet))
    if not kalemler:
        return hata('Reçeteye en az bir ilaç ekleyin.')

    muayene = None
    if veri.get('muayene_id'):
        muayene = db.session.get(Muayene, int(veri['muayene_id']))
        if not muayene or muayene.hasta_id != hasta.id:
            return hata('Seçilen muayene bu hastaya ait değil.')

    tani = (veri.get('tani') or (muayene.tani if muayene else '') or '').strip()
    uyarilar = recete_kontrol([k.ilac_adi for k in kalemler], hasta.alerji_durumu,
                              hasta_hastalik_metni(hasta) + ' ' + tani)
    ciddi = [u for u in uyarilar if u['seviye'] == 'yuksek']
    gerekce = (veri.get('gerekce') or '').strip()
    if ciddi and len(gerekce) < 5:
        return hata('Reçetede ciddi uyarı var. Devam etmek için gerekçe yazmalısınız.', 409,
                    uyarilar=uyarilar, gerekce_gerekli=True)

    recete = Recete(hasta_id=hasta.id, muayene_id=muayene.id if muayene else None, doktor_id=g.kullanici.id,
                    tani=tani[:150] or None, notlar=(veri.get('notlar') or '').strip() or None,
                    uyari_gerekcesi=gerekce or None,
                    uyari_ozeti=' | '.join(f"[{u['seviye']}] {u['mesaj']}" for u in uyarilar)[:2000] or None,
                    tarih=datetime.now())
    recete.kalemler = kalemler
    db.session.add(recete)
    db.session.flush()
    islem_kaydet('olusturma', 'recete', recete.id,
                 f'{hasta.ad_soyad}: {len(kalemler)} ilaç' + (f' · {len(ciddi)} ciddi uyarı gerekçeyle geçildi' if ciddi else ''))
    db.session.commit()
    return jsonify({'mesaj': 'Reçete kaydedildi.', 'id': recete.id,
                    'yazdir': url_for('recete_yazdir', recete_id=recete.id)}), 201


@app.route('/api/recete/<int:recete_id>', methods=['DELETE'])
@doktor_gerekli
def recete_sil(recete_id):
    recete = db.get_or_404(Recete, recete_id)
    islem_kaydet('silme', 'recete', recete.id, f'{recete.hasta.ad_soyad}: {recete.recete_no}')
    db.session.delete(recete)
    db.session.commit()
    return jsonify({'mesaj': 'Reçete silindi.'})


@app.route('/recete/<int:recete_id>/yazdir')
@doktor_gerekli
def recete_yazdir(recete_id):
    recete = db.get_or_404(Recete, recete_id)
    islem_kaydet('yazdirma', 'recete', recete.id, f'{recete.hasta.ad_soyad}: {recete.recete_no}')
    db.session.commit()
    return render_template('recete_yazdir.html', recete=recete, hasta=recete.hasta)


# ------------------------------------------------------------------
# Güvenlik ve KVKK sayfası, işlem günlüğü
# ------------------------------------------------------------------
def gunluk_sorgusu():
    s = IslemKaydi.query
    if request.args.get('kullanici', type=int):
        s = s.filter(IslemKaydi.kullanici_id == request.args.get('kullanici', type=int))
    if request.args.get('islem') in ISLEM_ADLARI:
        s = s.filter(IslemKaydi.islem == request.args.get('islem'))
    if request.args.get('hedef') in HEDEF_ADLARI:
        s = s.filter(IslemKaydi.hedef_tur == request.args.get('hedef'))
    bas, bit = tarih_coz(request.args.get('baslangic')), tarih_coz(request.args.get('bitis'))
    if bas:
        s = s.filter(IslemKaydi.zaman >= datetime.combine(bas, time.min))
    if bit:
        s = s.filter(IslemKaydi.zaman <= datetime.combine(bit, time.max))
    q = (request.args.get('q') or '').strip()
    if q:
        s = s.filter(db.or_(IslemKaydi.aciklama.ilike(f'%{q}%'), IslemKaydi.kullanici_adi.ilike(f'%{q}%')))
    return s.order_by(IslemKaydi.zaman.desc())


def gunluk_sozluk(k):
    return {'id': k.id, 'zaman': k.zaman.strftime('%d.%m.%Y %H:%M:%S'), 'kullanici': k.kullanici_adi or 'Sistem',
            'islem': k.islem, 'islem_adi': ISLEM_ADLARI.get(k.islem, k.islem),
            'hedef': HEDEF_ADLARI.get(k.hedef_tur, k.hedef_tur or ''), 'hedef_tur': k.hedef_tur,
            'hedef_id': k.hedef_id, 'aciklama': k.aciklama or '', 'ip': k.ip or ''}


@app.route('/guvenlik')
@doktor_gerekli
def guvenlik():
    simdi = datetime.now()
    toplam = Hasta.query.count()
    rizali = Hasta.query.filter_by(kvkk_onay=True).count()
    ozet = {
        'toplam_hasta': toplam,
        'rizali': rizali,
        'riza_orani': round(rizali / toplam * 100) if toplam else 100,
        'son24': IslemKaydi.query.filter(IslemKaydi.zaman >= simdi - timedelta(hours=24)).count(),
        'hatali_giris': IslemKaydi.query.filter(IslemKaydi.islem == 'giris_hatali',
                                                IslemKaydi.zaman >= simdi - timedelta(days=7)).count(),
        'goruntuleme': IslemKaydi.query.filter(IslemKaydi.islem == 'goruntuleme',
                                               IslemKaydi.zaman >= simdi - timedelta(hours=24)).count(),
    }
    yedekler = yedek_listesi()
    rizasiz = Hasta.query.filter_by(kvkk_onay=False).order_by(Hasta.kayit_tarihi.desc()).limit(50).all()
    kullanicilar = Doktor.query.order_by(Doktor.ad_soyad).all()
    return render_template('guvenlik.html', ozet=ozet, yedekler=yedekler, son_yedek=yedekler[0] if yedekler else None,
                           rizasiz=rizasiz, kullanicilar=kullanicilar, islem_adlari=ISLEM_ADLARI,
                           hedef_adlari=HEDEF_ADLARI, oturum_dakika=OTURUM_DAKIKA)


@app.route('/api/islem_kayitlari')
@doktor_gerekli
def islem_kayitlari():
    sayfa = max(1, request.args.get('sayfa', 1, type=int))
    s = gunluk_sorgusu()
    toplam = s.count()
    kayitlar = s.offset((sayfa - 1) * 25).limit(25).all()
    return jsonify({'kayitlar': [gunluk_sozluk(k) for k in kayitlar], 'toplam': toplam,
                    'sayfa': sayfa, 'sayfa_sayisi': max(1, -(-toplam // 25))})


@app.route('/guvenlik/gunluk.csv')
@doktor_gerekli
def gunluk_csv():
    cikti = io.StringIO()
    yazici = csv.writer(cikti, delimiter=';')
    yazici.writerow(['Zaman', 'Kullanıcı', 'İşlem', 'Kayıt türü', 'Kayıt no', 'Açıklama', 'IP'])
    for k in gunluk_sorgusu().limit(20000):
        d = gunluk_sozluk(k)
        yazici.writerow([d['zaman'], d['kullanici'], d['islem_adi'], d['hedef'], d['hedef_id'] or '', d['aciklama'], d['ip']])
    islem_kaydet('disa_aktarma', 'gunluk', None, 'İşlem günlüğü CSV olarak indirildi')
    db.session.commit()
    return Response('﻿' + cikti.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename=islem_gunlugu_{date.today().isoformat()}.csv'})


# ------------------------------------------------------------------
# Yedekleme ve geri yükleme
# ------------------------------------------------------------------
YEDEK_ADI = re.compile(r'^klinik_\d{8}_\d{6}_(manuel|otomatik|geri-yukleme-oncesi|yuklenen)\.db$')
YEDEK_TURLERI = {'manuel': 'Elle alınan', 'otomatik': 'Otomatik (günlük)',
                 'geri-yukleme-oncesi': 'Geri yükleme öncesi', 'yuklenen': 'Dışarıdan yüklenen'}


def veritabani_yolu():
    return db.engine.url.database


def yedek_klasoru():
    yol = os.path.join(app.instance_path, 'yedekler')
    os.makedirs(yol, exist_ok=True)
    return yol


def yedek_olustur(tur):
    """Çalışan veritabanının tutarlı bir kopyasını SQLite yedekleme API'si ile alır."""
    ad = f'klinik_{datetime.now().strftime("%Y%m%d_%H%M%S")}_{tur}.db'
    hedef_yol = os.path.join(yedek_klasoru(), ad)
    sayac = 1
    while os.path.exists(hedef_yol):
        ad = f'klinik_{(datetime.now() + timedelta(seconds=sayac)).strftime("%Y%m%d_%H%M%S")}_{tur}.db'
        hedef_yol = os.path.join(yedek_klasoru(), ad)
        sayac += 1
    kaynak = sqlite3.connect(veritabani_yolu())
    hedef = sqlite3.connect(hedef_yol)
    try:
        kaynak.backup(hedef)
    finally:
        hedef.close()
        kaynak.close()
    return ad


def yedek_listesi():
    liste = []
    for ad in os.listdir(yedek_klasoru()):
        if not YEDEK_ADI.match(ad):
            continue
        yol = os.path.join(yedek_klasoru(), ad)
        tur = ad[:-3].split('_', 3)[3]
        zaman = datetime.strptime(ad[7:22], '%Y%m%d_%H%M%S')
        liste.append({'ad': ad, 'tur': tur, 'tur_adi': YEDEK_TURLERI.get(tur, tur),
                      'zaman': zaman.strftime('%d.%m.%Y %H:%M'), 'zaman_iso': zaman.isoformat(),
                      'boyut': os.path.getsize(yol), 'boyut_metin': f'{os.path.getsize(yol) / 1024:.0f} KB'})
    liste.sort(key=lambda y: y['zaman_iso'], reverse=True)
    return liste


def otomatik_yedek():
    """Günün ilk isteğinde otomatik yedek alır; en yeni 14 otomatik yedeği saklar."""
    bugun_eki = f'klinik_{date.today().strftime("%Y%m%d")}_'
    if app.config.get('_son_otomatik_yedek') == date.today():
        return
    try:
        mevcut = os.listdir(yedek_klasoru())
        if not any(a.startswith(bugun_eki) and a.endswith('_otomatik.db') for a in mevcut):
            yedek_olustur('otomatik')
            otomatikler = sorted(a for a in os.listdir(yedek_klasoru()) if a.endswith('_otomatik.db'))
            for eski in otomatikler[:-OTOMATIK_YEDEK_SAKLA]:
                os.remove(os.path.join(yedek_klasoru(), eski))
        app.config['_son_otomatik_yedek'] = date.today()
    except (OSError, sqlite3.Error) as e:
        app.logger.warning('Otomatik yedek alınamadı: %s', e)


def yedek_gecerli_mi(yol):
    try:
        b = sqlite3.connect(f'file:{yol}?mode=ro', uri=True)
        try:
            tablolar = {r[0] for r in b.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            durum = b.execute('PRAGMA integrity_check').fetchone()[0]
        finally:
            b.close()
    except sqlite3.Error:
        return 'Dosya geçerli bir SQLite veritabanı değil.'
    if not {'hasta', 'randevu', 'doktor'} <= tablolar:
        return 'Bu dosya bir Klinik SaaS yedeği değil (gerekli tablolar yok).'
    if durum != 'ok':
        return 'Yedek dosyası bozuk görünüyor (bütünlük kontrolü başarısız).'
    return None


def yedekten_geri_yukle(kaynak_yol):
    """Önce mevcut durumu yedekler, sonra seçilen yedeği canlı veritabanına kopyalar."""
    onceki = yedek_olustur('geri-yukleme-oncesi')
    db.session.remove()
    db.engine.dispose()
    kaynak = sqlite3.connect(kaynak_yol)
    hedef = sqlite3.connect(veritabani_yolu())
    try:
        kaynak.backup(hedef)
    finally:
        hedef.close()
        kaynak.close()
    db.engine.dispose()
    semayi_guncelle()
    return onceki


@app.route('/api/yedek_al', methods=['POST'])
@doktor_gerekli
def yedek_al():
    try:
        ad = yedek_olustur('manuel')
    except (OSError, sqlite3.Error) as e:
        return hata(f'Yedek alınamadı: {e}', 500)
    islem_kaydet('yedek', 'yedek', None, f'Elle yedek alındı: {ad}')
    db.session.commit()
    return jsonify({'mesaj': 'Yedek başarıyla alındı.', 'yedekler': yedek_listesi()}), 201


@app.route('/api/yedekler')
@doktor_gerekli
def yedekler_api():
    return jsonify({'yedekler': yedek_listesi()})


@app.route('/yedek/<ad>/indir')
@doktor_gerekli
def yedek_indir(ad):
    if not YEDEK_ADI.match(ad) or not os.path.exists(os.path.join(yedek_klasoru(), ad)):
        abort(404)
    islem_kaydet('disa_aktarma', 'yedek', None, f'Yedek indirildi: {ad}')
    db.session.commit()
    return send_from_directory(yedek_klasoru(), ad, as_attachment=True)


@app.route('/api/yedek/<ad>', methods=['DELETE'])
@doktor_gerekli
def yedek_sil(ad):
    yol = os.path.join(yedek_klasoru(), ad)
    if not YEDEK_ADI.match(ad) or not os.path.exists(yol):
        return hata('Yedek bulunamadı.', 404)
    os.remove(yol)
    islem_kaydet('silme', 'yedek', None, f'Yedek silindi: {ad}')
    db.session.commit()
    return jsonify({'mesaj': 'Yedek silindi.', 'yedekler': yedek_listesi()})


@app.route('/api/yedek_geri_yukle', methods=['POST'])
@doktor_gerekli
def yedek_geri_yukle():
    kullanici_adi = g.kullanici.gorunen_ad
    gecici = None
    if 'dosya' in request.files:
        dosya = request.files['dosya']
        ad = f'klinik_{datetime.now().strftime("%Y%m%d_%H%M%S")}_yuklenen.db'
        gecici = os.path.join(yedek_klasoru(), ad)
        dosya.save(gecici)
        kaynak_yol, kaynak_ad = gecici, dosya.filename or ad
    else:
        ad = (request.get_json(silent=True) or {}).get('ad') or ''
        kaynak_yol = os.path.join(yedek_klasoru(), ad)
        if not YEDEK_ADI.match(ad) or not os.path.exists(kaynak_yol):
            return hata('Yedek bulunamadı.', 404)
        kaynak_ad = ad

    sorun = yedek_gecerli_mi(kaynak_yol)
    if sorun:
        if gecici and os.path.exists(gecici):
            os.remove(gecici)
        return hata(sorun)

    try:
        onceki = yedekten_geri_yukle(kaynak_yol)
    except (OSError, sqlite3.Error) as e:
        return hata(f'Geri yükleme başarısız: {e}', 500)

    # Geri yüklenen veritabanında oturum sahibinin hâlâ var olup olmadığını kontrol et
    kullanici = db.session.get(Doktor, session.get('kullanici_id') or 0)
    db.session.add(IslemKaydi(kullanici_id=kullanici.id if kullanici else None, kullanici_adi=kullanici_adi,
                              islem='geri_yukleme', hedef_tur='yedek',
                              aciklama=f'{kaynak_ad} geri yüklendi (önceki durum: {onceki})', ip=istemci_ip()))
    db.session.commit()
    if not kullanici:
        session.clear()
    return jsonify({'mesaj': f'Yedek geri yüklendi. Önceki durum “{onceki}” olarak saklandı.',
                    'yonlendir': url_for('guvenlik') if kullanici else url_for('giris')})


# ------------------------------------------------------------------
# Klinik ayarları
# ------------------------------------------------------------------
VARSAYILAN_AYARLAR = {
    'online_acik': '1',
    'online_gun': '14',
    'online_kapali_gunler': '6',
    'online_hizmetler': json.dumps(['Genel Muayene', 'Kontrol Muayenesi', 'Kan Tahlili', 'Konsültasyon'], ensure_ascii=False),
    'online_min_saat': '2',
    'online_mesaj': '',
    'online_fiyat_goster': '0',
}


def ayar(anahtar):
    a = db.session.get(Ayar, anahtar)
    return a.deger if a is not None and a.deger is not None else VARSAYILAN_AYARLAR.get(anahtar, '')


def ayar_yaz(anahtar, deger):
    a = db.session.get(Ayar, anahtar)
    if a is None:
        a = Ayar(anahtar=anahtar)
        db.session.add(a)
    a.deger = deger


def online_ayarlari():
    try:
        hizmetler = [h for h in json.loads(ayar('online_hizmetler')) if isinstance(h, str)]
    except (ValueError, TypeError):
        hizmetler = []
    kapali = [int(x) for x in ayar('online_kapali_gunler').split(',') if x.strip().isdigit() and int(x) < 7]
    return {
        'acik': ayar('online_acik') == '1',
        'gun': max(1, min(90, int(ayar('online_gun') or 14))),
        'kapali': kapali,
        'hizmetler': hizmetler or ['Genel Muayene'],
        'min_saat': max(0, min(72, int(ayar('online_min_saat') or 0))),
        'mesaj': ayar('online_mesaj'),
        'fiyat_goster': ayar('online_fiyat_goster') == '1',
    }


@app.route('/api/online/ayarlar', methods=['POST'])
@doktor_gerekli
def online_ayar_kaydet():
    v = request.get_json(silent=True) or {}
    hizmetler = [h for h in (v.get('hizmetler') or []) if h in ISLEM_TURLERI]
    if not hizmetler:
        return hata('Online randevuya açık en az bir hizmet seçin.')
    try:
        gun = int(v.get('gun') or 14)
        min_saat = int(v.get('min_saat') or 0)
    except (TypeError, ValueError):
        return hata('Gün ve saat değerleri sayı olmalıdır.')
    if not 1 <= gun <= 90:
        return hata('Kaç gün ileriye randevu alınabileceği 1–90 arasında olmalıdır.')
    if not 0 <= min_saat <= 72:
        return hata('En erken randevu süresi 0–72 saat arasında olmalıdır.')
    kapali = sorted({int(x) for x in (v.get('kapali') or []) if str(x).isdigit() and int(x) < 7})
    if len(kapali) == 7:
        return hata('En az bir gün açık olmalıdır.')
    ayar_yaz('online_acik', '1' if v.get('acik') else '0')
    ayar_yaz('online_gun', str(gun))
    ayar_yaz('online_min_saat', str(min_saat))
    ayar_yaz('online_kapali_gunler', ','.join(map(str, kapali)))
    ayar_yaz('online_hizmetler', json.dumps(hizmetler, ensure_ascii=False))
    ayar_yaz('online_mesaj', (v.get('mesaj') or '').strip()[:400])
    ayar_yaz('online_fiyat_goster', '1' if v.get('fiyat_goster') else '0')
    islem_kaydet('ayar', 'ayar', None, 'Online randevu ayarları güncellendi' + ('' if v.get('acik') else ' (kapatıldı)'))
    db.session.commit()
    return jsonify({'mesaj': 'Online randevu ayarları kaydedildi.', 'ayar': online_ayarlari()})


# ------------------------------------------------------------------
# Online randevu (hastaların girişsiz kullandığı sayfa)
# ------------------------------------------------------------------
TALEP_KOD_HARFLERI = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
_online_istekler = {}  # ip -> [zaman, ...]


def telefon_normal(telefon):
    """'0532 418 27 63', '+90 532…' → '5324182763'."""
    rakam = re.sub(r'\D', '', telefon or '')
    if rakam.startswith('90') and len(rakam) == 12:
        rakam = rakam[2:]
    if rakam.startswith('0'):
        rakam = rakam[1:]
    return rakam


def telefon_bicimle(telefon):
    n = telefon_normal(telefon)
    if len(n) != 10:
        return (telefon or '').strip()
    return f'0{n[:3]} {n[3:6]} {n[6:8]} {n[8:]}'


def whatsapp_link(telefon, mesaj):
    n = telefon_normal(telefon)
    return f'https://wa.me/90{n}?text={quote(mesaj)}' if len(n) == 10 else None


def online_saat_listesi(tarih, ayarlar, haric_talep=None):
    sinir = datetime.now() + timedelta(hours=ayarlar['min_saat'])
    dolu = dolu_saat_kumesi(tarih, haric_talep=haric_talep)
    liste = []
    for s in SAAT_DILIMLERI:
        an = datetime.combine(tarih, datetime.strptime(s, '%H:%M').time())
        liste.append({'saat': s, 'dolu': s in dolu or an < sinir})
    return liste


def online_gun_acik_mi(tarih, ayarlar):
    bugun = date.today()
    return bugun <= tarih <= bugun + timedelta(days=ayarlar['gun']) and tarih.weekday() not in ayarlar['kapali']


def tarife_sozlugu():
    return {t.islem_turu: t.ucret for t in Tarife.query.all()}


def talep_sozluk(t, hastalar=None):
    veri = {
        'id': t.id, 'kod': t.kod, 'ad_soyad': t.ad_soyad, 'telefon': t.telefon, 'tc': t.tc_kimlik or '',
        'tarih': t.tarih.isoformat(), 'tarih_metin': f'{t.tarih.day} {AYLAR[t.tarih.month - 1]} {GUNLER[t.tarih.weekday()]}',
        'saat': t.saat, 'islem_turu': t.islem_turu, 'notlar': t.notlar or '', 'kvkk_onay': bool(t.kvkk_onay),
        'durum': t.durum, 'olusturma': t.olusturma.isoformat(timespec='minutes'),
        'whatsapp': whatsapp_link(t.telefon, f'Merhaba {t.ad_soyad.split()[0]}, {KLINIK_ADI} online randevu talebiniz hakkında yazıyoruz.'),
        'saat_dolu': t.saat in dolu_saat_kumesi(t.tarih, haric_talep=t.id) if t.durum == 'Bekliyor' else False,
    }
    if hastalar is not None:
        tn = telefon_normal(t.telefon)
        eslesen = []
        for h in hastalar:
            if t.tc_kimlik and h.tc_kimlik == t.tc_kimlik:
                eslesen.append({'id': h.id, 'ad_soyad': h.ad_soyad, 'neden': 'TC kimlik eşleşti'})
            elif tn and telefon_normal(h.telefon) == tn:
                eslesen.append({'id': h.id, 'ad_soyad': h.ad_soyad, 'neden': 'Telefon eşleşti'})
        veri['eslesen'] = eslesen
    return veri


@app.route('/randevu-al')
def online_randevu():
    return render_template('online_randevu.html', ayarlar=online_ayarlari(), takip=None, takip_kod=None)


@app.route('/randevu-al/aydinlatma')
def online_aydinlatma():
    return render_template('aydinlatma.html', hasta=None, herkese_acik=True)


@app.route('/api/online/takvim')
def online_takvim():
    a = online_ayarlari()
    if not a['acik']:
        return jsonify({'acik': False, 'gunler': [], 'hizmetler': []})
    bugun = date.today()
    gunler = []
    for i in range(a['gun'] + 1):
        d = bugun + timedelta(days=i)
        kapali = d.weekday() in a['kapali']
        bos = 0 if kapali else sum(1 for x in online_saat_listesi(d, a) if not x['dolu'])
        gunler.append({'iso': d.isoformat(), 'gun': d.day, 'ay': AYLAR[d.month - 1][:3], 'kisa': GUN_KISA[d.weekday()],
                       'uzun': GUNLER[d.weekday()], 'kapali': kapali, 'bos': bos})
    tarifeler = tarife_sozlugu() if a['fiyat_goster'] else {}
    hizmetler = [{'ad': h, 'ucret': tl(tarifeler[h]) if tarifeler.get(h) else None} for h in a['hizmetler']]
    return jsonify({'acik': True, 'gunler': gunler, 'hizmetler': hizmetler})


@app.route('/api/online/saatler')
def online_saatler():
    a = online_ayarlari()
    tarih = tarih_coz(request.args.get('tarih'))
    if not a['acik'] or not tarih or not online_gun_acik_mi(tarih, a):
        return jsonify({'saatler': []})
    return jsonify({'saatler': online_saat_listesi(tarih, a)})


@app.route('/api/online/talep', methods=['POST'])
def online_talep_olustur():
    a = online_ayarlari()
    if not a['acik']:
        return hata('Online randevu şu anda kapalı. Lütfen kliniği arayın.', 403)
    v = request.get_json(silent=True) or {}
    if v.get('web_sitesi'):  # bot tuzağı (gizli alan)
        return hata('Talep alınamadı.')

    ip = istemci_ip()
    simdi = datetime.now()
    son = [z for z in _online_istekler.get(ip, []) if simdi - z < timedelta(hours=1)]
    if len(son) >= 5:
        return hata('Çok sayıda talep gönderildi. Lütfen bir süre sonra tekrar deneyin veya kliniği arayın.', 429)

    ad = re.sub(r'\s+', ' ', (v.get('ad_soyad') or '').strip())
    if len(ad) < 3 or len(ad) > 100 or not re.search(r'[A-Za-zÇĞİÖŞÜçğıöşü]', ad) or ' ' not in ad:
        return hata('Lütfen adınızı ve soyadınızı yazın.')
    tn = telefon_normal(v.get('telefon'))
    if len(tn) != 10 or not tn.startswith('5'):
        return hata('Lütfen geçerli bir cep telefonu numarası girin (05xx xxx xx xx).')
    tc = (v.get('tc_kimlik') or '').strip()
    if tc and not re.fullmatch(r'\d{11}', tc):
        return hata('TC kimlik numarası 11 haneli olmalıdır (isteğe bağlı).')
    islem = v.get('islem_turu')
    if islem not in a['hizmetler']:
        return hata('Lütfen bir hizmet seçin.')
    tarih = tarih_coz(v.get('tarih'))
    if not tarih or not online_gun_acik_mi(tarih, a):
        return hata('Seçilen gün online randevuya açık değil.')
    saat = v.get('saat')
    uygun = {x['saat'] for x in online_saat_listesi(tarih, a) if not x['dolu']}
    if saat not in uygun:
        return hata('Bu saat az önce doldu. Lütfen başka bir saat seçin.', 409)
    if not v.get('kvkk_onay'):
        return hata('Devam etmek için aydınlatma metnini onaylamanız gerekiyor.')
    notlar = (v.get('notlar') or '').strip()[:500] or None
    bekleyen = [t for t in OnlineTalep.query.filter_by(durum='Bekliyor').all() if telefon_normal(t.telefon) == tn]
    if len(bekleyen) >= 2:
        return hata('Bu telefon numarasıyla onay bekleyen talepleriniz var. Klinik size dönüş yapacaktır.', 429)

    kod = ''.join(secrets.choice(TALEP_KOD_HARFLERI) for _ in range(8))
    while OnlineTalep.query.filter_by(kod=kod).first():
        kod = ''.join(secrets.choice(TALEP_KOD_HARFLERI) for _ in range(8))
    t = OnlineTalep(kod=kod, ad_soyad=ad, telefon=telefon_bicimle(v.get('telefon')), tc_kimlik=tc or None, tarih=tarih,
                    saat=saat, islem_turu=islem, notlar=notlar, kvkk_onay=True, ip=ip, olusturma=simdi)
    db.session.add(t)
    db.session.flush()
    islem_kaydet('online', 'talep', t.id, f'{ad} · {kisa_tarih(tarih)} {saat} · {islem} (online talep)', ad='Online randevu sayfası')
    db.session.commit()
    son.append(simdi)
    _online_istekler[ip] = son
    return jsonify({'mesaj': 'Talebiniz alındı.', 'kod': kod, 'takip': url_for('online_takip', kod=kod),
                    'ozet': talep_sozluk(t)}), 201


def talep_bul(kod):
    return OnlineTalep.query.filter_by(kod=(kod or '').upper()).first()


@app.route('/randevu-al/takip/<kod>')
def online_takip(kod):
    t = talep_bul(kod)
    return render_template('online_randevu.html', ayarlar=online_ayarlari(), takip=t, takip_kod=kod,
                           takip_json=talep_sozluk(t) if t else None)


@app.route('/randevu-al/takip/<kod>/takvim.ics')
def online_takip_ics(kod):
    t = talep_bul(kod)
    if not t or t.durum not in ('Bekliyor', 'Onaylandı'):
        abort(404)
    bas = datetime.combine(t.tarih, datetime.strptime(t.saat, '%H:%M').time())
    bit = bas + timedelta(minutes=30)
    fmt = '%Y%m%dT%H%M%S'
    ics = '\r\n'.join([
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Klinik SaaS//TR', 'BEGIN:VEVENT',
        f'UID:{t.kod}@klinik', f'DTSTAMP:{datetime.utcnow().strftime(fmt)}Z',
        f'DTSTART:{bas.strftime(fmt)}', f'DTEND:{bit.strftime(fmt)}',
        f'SUMMARY:{KLINIK_ADI} · {t.islem_turu}',
        f'DESCRIPTION:Randevu kodu {t.kod}' + (' (onay bekliyor)' if t.durum == 'Bekliyor' else ''),
        'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Randevu hatırlatma', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR', ''])
    return Response(ics, mimetype='text/calendar',
                    headers={'Content-Disposition': f'attachment; filename=randevu_{t.kod}.ics'})


@app.route('/api/online/talep/<kod>/iptal', methods=['POST'])
def online_talep_iptal(kod):
    t = talep_bul(kod)
    if not t:
        return hata('Talep bulunamadı.', 404)
    if t.durum not in ('Bekliyor', 'Onaylandı'):
        return hata('Bu randevu zaten sonuçlanmış.')
    if datetime.combine(t.tarih, datetime.strptime(t.saat, '%H:%M').time()) < datetime.now():
        return hata('Geçmiş bir randevu iptal edilemez.')
    t.durum = 'İptal'
    t.islem_zamani = datetime.now()
    if t.randevu and t.randevu.durum in ('Bekliyor', 'Onaylandı'):
        t.randevu.durum = 'İptal'
        t.randevu.notlar = ((t.randevu.notlar + ' · ') if t.randevu.notlar else '') + 'Hasta online iptal etti'
    islem_kaydet('iptal', 'talep', t.id, f'{t.ad_soyad} online randevusunu iptal etti ({kisa_tarih(t.tarih)} {t.saat})',
                 ad='Online randevu sayfası')
    db.session.commit()
    return jsonify({'mesaj': 'Randevunuz iptal edildi.'})


@app.route('/api/online/talep/<int:talep_id>/onayla', methods=['POST'])
def online_talep_onayla(talep_id):
    t = db.get_or_404(OnlineTalep, talep_id)
    if t.durum != 'Bekliyor':
        return hata('Bu talep zaten işlenmiş.', 409)
    v = request.get_json(silent=True) or {}
    tarih = tarih_coz(v.get('tarih')) or t.tarih
    saat = v.get('saat') or t.saat
    if saat not in SAAT_DILIMLERI:
        return hata('Geçerli bir saat seçin.')
    if tarih < date.today():
        return hata('Geçmiş bir güne randevu verilemez.')
    if saat_cakisiyor_mu(tarih, saat, haric_talep=t.id):
        return hata(f'{kisa_tarih(tarih)} {saat} dolu. Lütfen başka bir saat seçin.', 409)

    if v.get('hasta_id'):
        hasta = db.session.get(Hasta, int(v['hasta_id']))
        if not hasta:
            return hata('Seçilen hasta bulunamadı.', 404)
        yeni = False
    else:
        if t.tc_kimlik and Hasta.query.filter_by(tc_kimlik=t.tc_kimlik).first():
            return hata('Bu TC kimlik numarasıyla kayıtlı bir hasta var; listeden onu seçin.', 409)
        hasta = Hasta(ad_soyad=t.ad_soyad, telefon=t.telefon, tc_kimlik=t.tc_kimlik, sikayet=t.notlar,
                      kvkk_onay=bool(t.kvkk_onay), kvkk_onay_tarihi=t.olusturma if t.kvkk_onay else None)
        db.session.add(hasta)
        db.session.flush()
        yeni = True
        islem_kaydet('olusturma', 'hasta', hasta.id, f'{hasta.ad_soyad} online talepten kaydedildi'
                     + (' (online aydınlatma onayı)' if t.kvkk_onay else ''))

    degisti = (tarih, saat) != (t.tarih, t.saat)
    r = Randevu(hasta_id=hasta.id, tarih=tarih, saat=saat, islem_turu=t.islem_turu, durum='Onaylandı',
                notlar='Online randevu' + (f' · {t.notlar}' if t.notlar else '')
                       + (f' · İstenen: {kisa_tarih(t.tarih)} {t.saat}' if degisti else ''),
                doktor_id=g.kullanici.id if g.kullanici.doktor_mu else None)
    db.session.add(r)
    db.session.flush()
    t.durum = 'Onaylandı'
    t.hasta_id, t.randevu_id = hasta.id, r.id
    t.isleyen_id, t.islem_zamani = g.kullanici.id, datetime.now()
    t.tarih, t.saat = tarih, saat
    if degisti:
        t.yanit_notu = 'Saat klinik tarafından değiştirildi.'
    islem_kaydet('guncelleme', 'talep', t.id, f'Online talep onaylandı: {hasta.ad_soyad} · {kisa_tarih(tarih)} {saat}')
    db.session.commit()

    gun_metin = f'{tarih.day} {AYLAR[tarih.month - 1]} {GUNLER[tarih.weekday()]}'
    mesaj = (f'Merhaba {t.ad_soyad.split()[0]}, {KLINIK_ADI} için {gun_metin} saat {saat} {t.islem_turu} randevunuz onaylandı'
             + (' (istediğiniz saat dolu olduğu için saatiniz güncellendi)' if degisti else '')
             + f'. Randevu kodunuz: {t.kod}. Randevunuzu görmek veya iptal etmek için: {url_for("online_takip", kod=t.kod, _external=True)}')
    return jsonify({'mesaj': f'{hasta.ad_soyad} için {kisa_tarih(tarih)} {saat} randevusu oluşturuldu.'
                             + (' Yeni hasta kaydı açıldı.' if yeni else ''),
                    'hasta_id': hasta.id, 'whatsapp': whatsapp_link(t.telefon, mesaj), 'bildirim_metni': mesaj})


@app.route('/api/online/talep/<int:talep_id>/reddet', methods=['POST'])
def online_talep_reddet(talep_id):
    t = db.get_or_404(OnlineTalep, talep_id)
    if t.durum != 'Bekliyor':
        return hata('Bu talep zaten işlenmiş.', 409)
    neden = ((request.get_json(silent=True) or {}).get('neden') or '').strip()[:300]
    if not neden:
        return hata('Hastaya iletilecek kısa bir neden yazın.')
    t.durum = 'Reddedildi'
    t.yanit_notu = neden
    t.isleyen_id, t.islem_zamani = g.kullanici.id, datetime.now()
    islem_kaydet('guncelleme', 'talep', t.id, f'Online talep reddedildi: {t.ad_soyad} · {neden}')
    db.session.commit()
    mesaj = (f'Merhaba {t.ad_soyad.split()[0]}, {KLINIK_ADI} için {kisa_tarih(t.tarih)} {t.saat} randevu talebiniz '
             f'maalesef onaylanamadı: {neden}. Size uygun başka bir saat seçmek için: {url_for("online_randevu", _external=True)}')
    return jsonify({'mesaj': 'Talep reddedildi.', 'whatsapp': whatsapp_link(t.telefon, mesaj), 'bildirim_metni': mesaj})


# ------------------------------------------------------------------
# Tahsilat ve kasa
# ------------------------------------------------------------------
def hareket_sozluk(h):
    return {
        'id': h.id, 'tarih': h.tarih.isoformat(timespec='minutes'), 'tarih_metin': h.tarih.strftime('%d.%m.%Y %H:%M'),
        'saat': h.tarih.strftime('%H:%M'),
        'tur': h.tur, 'tur_adi': h.tur_adi, 'tutar': h.tutar, 'tutar_metin': tl(h.tutar), 'etki': h.bakiye_etkisi,
        'yontem': h.yontem or '', 'aciklama': h.aciklama or '', 'iptal': bool(h.iptal), 'iptal_nedeni': h.iptal_nedeni or '',
        'kullanici': h.kullanici.gorunen_ad if h.kullanici else '', 'kullanici_id': h.kullanici_id,
        'belge_no': h.belge_no, 'hasta_id': h.hasta_id, 'hasta_ad': h.hasta.ad_soyad if h.hasta else '',
        'randevu_id': h.randevu_id, 'bugun': h.tarih.date() == date.today(),
    }


def ucretlenebilir_randevular(hasta, tarifeler=None):
    """Henüz ücreti hesaba eklenmemiş, iptal olmayan randevular (en yenisi önce)."""
    tarifeler = tarife_sozlugu() if tarifeler is None else tarifeler
    ucretli = {h.randevu_id for h in hasta.kasa_hareketleri if h.tur == 'ucret' and not h.iptal and h.randevu_id}
    return [{'id': r.id, 'etiket': f'{kisa_tarih(r.tarih)} {r.saat} · {r.islem_turu}',
             'islem_turu': r.islem_turu, 'tutar': tarifeler.get(r.islem_turu, 0)}
            for r in hasta.randevular if r.durum != 'İptal' and r.id not in ucretli]


@app.route('/api/kasa/hasta/<int:hasta_id>')
def kasa_hasta_bilgi(hasta_id):
    hasta = db.get_or_404(Hasta, hasta_id)
    return jsonify({'id': hasta.id, 'ad_soyad': hasta.ad_soyad, 'bakiye': hasta.bakiye,
                    'ucretlenebilir': ucretlenebilir_randevular(hasta)})


def randevu_ucretlendir(randevu):
    """Tamamlanan randevu için tarifedeki ücreti hastanın hesabına bir kez ekler."""
    if KasaHareketi.query.filter_by(randevu_id=randevu.id, tur='ucret', iptal=False).first():
        return None
    tarife = Tarife.query.filter_by(islem_turu=randevu.islem_turu).first()
    if not tarife or tarife.ucret <= 0:
        return None
    h = KasaHareketi(tur='ucret', tutar=tarife.ucret, hasta_id=randevu.hasta_id, randevu_id=randevu.id,
                     kullanici_id=g.kullanici.id if g.get('kullanici') else None, tarih=datetime.now(),
                     aciklama=f'{randevu.islem_turu} · {kisa_tarih(randevu.tarih)} {randevu.saat}')
    db.session.add(h)
    db.session.flush()
    islem_kaydet('olusturma', 'kasa', h.id, f'{randevu.hasta.ad_soyad}: {h.aciklama} ücreti {tl(h.tutar)} (otomatik)')
    return h


def kasa_ozeti(hareketler):
    oz = {'tahsilat': 0, 'iade': 0, 'ucret': 0, 'indirim': 0, 'adet': 0,
          'yontem': {y: 0 for y in YONTEMLER}}
    for h in hareketler:
        if h.iptal:
            continue
        oz[h.tur] = oz.get(h.tur, 0) + h.tutar
        if h.tur in ('tahsilat', 'iade'):
            oz['adet'] += 1
            if h.yontem in oz['yontem']:
                oz['yontem'][h.yontem] += h.tutar if h.tur == 'tahsilat' else -h.tutar
    oz['net'] = oz['tahsilat'] - oz['iade']
    return oz


def alacak_listesi():
    etki = case((KasaHareketi.tur.in_(['ucret', 'iade']), KasaHareketi.tutar), else_=-KasaHareketi.tutar)
    satirlar = (db.session.query(KasaHareketi.hasta_id, func.sum(etki), func.max(KasaHareketi.tarih))
                .filter(KasaHareketi.iptal.is_(False)).group_by(KasaHareketi.hasta_id)
                .having(func.sum(etki) != 0).all())
    hastalar = {h.id: h for h in Hasta.query.filter(Hasta.id.in_([s[0] for s in satirlar])).all()} if satirlar else {}
    liste = []
    for hid, bakiye, son in satirlar:
        h = hastalar.get(hid)
        if not h:
            continue
        liste.append({'hasta_id': hid, 'ad_soyad': h.ad_soyad, 'telefon': h.telefon, 'bas_harfler': h.bas_harfler,
                      'bakiye': int(bakiye), 'bakiye_metin': tl(int(bakiye)), 'son_hareket': son.strftime('%d.%m.%Y'),
                      'gun': (date.today() - son.date()).days,
                      'whatsapp': whatsapp_link(h.telefon, f'Merhaba {h.ad_soyad.split()[0]}, {KLINIK_ADI} hesabınızda '
                                                            f'{tl(int(bakiye))} tutarında açık bakiye bulunmaktadır. '
                                                            'Bir sonraki ziyaretinizde ödeyebilir veya bizi arayabilirsiniz. Sağlıklı günler dileriz.')
                                  if bakiye > 0 else None})
    liste.sort(key=lambda x: -x['bakiye'])
    return liste


def iptal_edebilir_mi(h):
    if g.kullanici.doktor_mu:
        return True
    return h.kullanici_id == g.kullanici.id and h.tarih.date() == date.today()


@app.route('/kasa')
def kasa():
    bugun = date.today()
    gun = tarih_coz(request.args.get('tarih')) or bugun
    gun_bas, gun_bit = datetime.combine(gun, time.min), datetime.combine(gun, time.max)
    gun_hareketleri = (KasaHareketi.query.filter(KasaHareketi.tarih >= gun_bas, KasaHareketi.tarih <= gun_bit)
                       .order_by(KasaHareketi.tarih.desc()).all())
    ay_bas = datetime.combine(gun.replace(day=1), time.min)
    sonraki_ay = (gun.replace(day=28) + timedelta(days=4)).replace(day=1)
    ay_hareketleri = KasaHareketi.query.filter(KasaHareketi.tarih >= ay_bas,
                                               KasaHareketi.tarih < datetime.combine(sonraki_ay, time.min)).all()

    # Son 30 günün günlük net tahsilatı
    seri_bas = gun - timedelta(days=29)
    seri_hareket = KasaHareketi.query.filter(KasaHareketi.tarih >= datetime.combine(seri_bas, time.min),
                                             KasaHareketi.tarih <= gun_bit, KasaHareketi.iptal.is_(False)).all()
    seri = {}
    for h in seri_hareket:
        if h.tur in ('tahsilat', 'iade'):
            k = h.tarih.date().isoformat()
            seri[k] = seri.get(k, 0) + (h.tutar if h.tur == 'tahsilat' else -h.tutar)
    seri_liste = []
    for i in range(30):
        d = seri_bas + timedelta(days=i)
        seri_liste.append({'iso': d.isoformat(), 'gun': d.day, 'kisa': GUN_KISA[d.weekday()], 'net': seri.get(d.isoformat(), 0),
                           'etiket': f'{d.day} {AYLAR[d.month - 1][:3]}'})

    alacaklar = alacak_listesi()
    tarifeler = tarife_sozlugu()
    tarife_satirlari = [{'islem_turu': i, 'ucret': tarifeler.get(i, 0)} for i in ISLEM_TURLERI]
    tarife_satirlari += [{'islem_turu': k, 'ucret': v} for k, v in tarifeler.items() if k not in ISLEM_TURLERI]
    return render_template(
        'kasa.html', aktif_sayfa='kasa', gun=gun, onceki_gun=(gun - timedelta(days=1)).isoformat(),
        sonraki_gun=(gun + timedelta(days=1)).isoformat() if gun < bugun else None,
        gun_ozet=kasa_ozeti(gun_hareketleri), ay_ozet=kasa_ozeti(ay_hareketleri), ay_adi=AYLAR[gun.month - 1],
        hareketler_json=[hareket_sozluk(h) for h in gun_hareketleri],
        seri=seri_liste, alacaklar=alacaklar,
        toplam_alacak=sum(a['bakiye'] for a in alacaklar if a['bakiye'] > 0),
        tarifeler=tarife_satirlari, yontemler=YONTEMLER,
        hastalar=Hasta.query.order_by(Hasta.ad_soyad.asc()).all(),
    )


@app.route('/api/kasa/hareket', methods=['POST'])
def kasa_hareket_ekle():
    v = request.get_json(silent=True) or {}
    hasta = db.session.get(Hasta, v.get('hasta_id') or 0)
    if not hasta:
        return hata('Hasta seçin.', 404)
    tur = v.get('tur')
    if tur not in KasaHareketi.TURLER:
        return hata('Geçersiz işlem türü.')
    if tur in ('indirim', 'iade') and not g.kullanici.doktor_mu:
        return hata('İndirim ve iade için doktor yetkisi gerekiyor.', 403)
    tutar = tutar_coz(v.get('tutar'))
    if tutar is None or tutar <= 0:
        return hata('Geçerli bir tutar girin.')
    if tutar > 10_000_000:
        return hata('Tutar çok yüksek görünüyor; lütfen kontrol edin.')
    yontem = v.get('yontem')
    if tur in ('tahsilat', 'iade'):
        if yontem not in YONTEMLER:
            return hata('Ödeme yöntemini seçin.')
    else:
        yontem = None
    randevu = None
    if v.get('randevu_id'):
        randevu = db.session.get(Randevu, int(v['randevu_id']))
        if not randevu or randevu.hasta_id != hasta.id:
            return hata('Seçilen randevu bu hastaya ait değil.')
        if tur == 'ucret' and KasaHareketi.query.filter_by(randevu_id=randevu.id, tur='ucret', iptal=False).first():
            return hata('Bu randevunun ücreti zaten hesaba eklenmiş.', 409)
    aciklama = (v.get('aciklama') or '').strip()[:200]
    if not aciklama:
        aciklama = (f'{randevu.islem_turu} · {kisa_tarih(randevu.tarih)} {randevu.saat}' if randevu
                    else {'tahsilat': 'Ödeme', 'ucret': 'Hizmet ücreti', 'indirim': 'İndirim', 'iade': 'Para iadesi'}[tur])
    h = KasaHareketi(tur=tur, tutar=tutar, yontem=yontem, aciklama=aciklama, hasta_id=hasta.id,
                     randevu_id=randevu.id if randevu else None, kullanici_id=g.kullanici.id, tarih=datetime.now())
    db.session.add(h)
    db.session.flush()
    islem_kaydet('tahsilat' if tur == 'tahsilat' else 'olusturma', 'kasa', h.id,
                 f'{hasta.ad_soyad}: {h.tur_adi} {tl(tutar)}' + (f' ({yontem})' if yontem else '') + f' · {aciklama}')
    db.session.commit()
    bakiye = hasta.bakiye
    return jsonify({'mesaj': f'{h.tur_adi} kaydedildi · {tl(tutar)}', 'hareket': hareket_sozluk(h), 'bakiye': bakiye,
                    'bakiye_metin': tl(abs(bakiye)),
                    'belge': url_for('kasa_belge', hareket_id=h.id) if tur in ('tahsilat', 'iade') else None}), 201


@app.route('/api/kasa/hareket/<int:hareket_id>/iptal', methods=['POST'])
def kasa_hareket_iptal(hareket_id):
    h = db.get_or_404(KasaHareketi, hareket_id)
    if h.iptal:
        return hata('Bu kayıt zaten iptal edilmiş.')
    if not iptal_edebilir_mi(h):
        return hata('Bu kaydı yalnızca doktor veya aynı gün kaydı giren kullanıcı iptal edebilir.', 403)
    neden = ((request.get_json(silent=True) or {}).get('neden') or '').strip()[:200]
    if not neden:
        return hata('İptal nedenini yazın.')
    h.iptal, h.iptal_nedeni, h.iptal_zamani, h.iptal_eden_id = True, neden, datetime.now(), g.kullanici.id
    islem_kaydet('iptal', 'kasa', h.id, f'{h.hasta.ad_soyad}: {h.tur_adi} {tl(h.tutar)} iptal edildi · {neden}')
    db.session.commit()
    return jsonify({'mesaj': 'Kayıt iptal edildi.', 'hareket': hareket_sozluk(h), 'bakiye': h.hasta.bakiye})


@app.route('/api/kasa/tarife', methods=['POST'])
@doktor_gerekli
def kasa_tarife_kaydet():
    gelen = (request.get_json(silent=True) or {}).get('tarifeler') or {}
    if not isinstance(gelen, dict):
        return hata('Geçersiz tarife verisi.')
    degisen = []
    for islem, deger in gelen.items():
        islem = (islem or '').strip()[:60]
        if not islem:
            continue
        tutar = tutar_coz(deger) if deger not in ('', None) else 0
        if tutar is None or tutar < 0 or tutar > 10_000_000:
            return hata(f'{islem} için geçerli bir ücret girin.')
        t = Tarife.query.filter_by(islem_turu=islem).first()
        if t is None:
            t = Tarife(islem_turu=islem, ucret=0)
            db.session.add(t)
        if t.ucret != tutar:
            degisen.append(f'{islem}: {tl(t.ucret)} → {tl(tutar)}')
            t.ucret = tutar
    if degisen:
        islem_kaydet('ayar', 'kasa', None, 'Ücret tarifesi: ' + '; '.join(degisen)[:250])
    db.session.commit()
    return jsonify({'mesaj': 'Ücret tarifesi kaydedildi.' if degisen else 'Değişiklik yok.', 'tarifeler': tarife_sozlugu()})


@app.route('/kasa/belge/<int:hareket_id>')
def kasa_belge(hareket_id):
    h = db.get_or_404(KasaHareketi, hareket_id)
    if h.tur not in ('tahsilat', 'iade'):
        abort(404)
    islem_kaydet('yazdirma', 'kasa', h.id, f'{h.hasta.ad_soyad}: {h.belge_no} makbuz')
    db.session.commit()
    return render_template('makbuz.html', h=h, hasta=h.hasta, bakiye=h.hasta.bakiye)


@app.route('/hasta/<int:hasta_id>/ekstre')
def hasta_ekstre(hasta_id):
    hasta = db.get_or_404(Hasta, hasta_id)
    satirlar, bakiye = [], 0
    for h in sorted(hasta.kasa_hareketleri, key=lambda x: (x.tarih, x.id)):
        if not h.iptal:
            bakiye += h.bakiye_etkisi
        satirlar.append({'h': h, 'bakiye': bakiye})
    islem_kaydet('yazdirma', 'kasa', None, f'{hasta.ad_soyad}: hesap ekstresi')
    db.session.commit()
    return render_template('ekstre.html', hasta=hasta, satirlar=satirlar, bakiye=bakiye)


@app.route('/kasa/gun-sonu')
def kasa_gun_sonu():
    gun = tarih_coz(request.args.get('tarih')) or date.today()
    hareketler = (KasaHareketi.query.filter(KasaHareketi.tarih >= datetime.combine(gun, time.min),
                                            KasaHareketi.tarih <= datetime.combine(gun, time.max))
                  .order_by(KasaHareketi.tarih.asc()).all())
    islem_kaydet('yazdirma', 'kasa', None, f'Gün sonu raporu: {kisa_tarih(gun)}')
    db.session.commit()
    return render_template('gun_sonu.html', gun=gun, gun_adi=GUNLER[gun.weekday()], hareketler=hareketler,
                           ozet=kasa_ozeti(hareketler), yontemler=YONTEMLER)


@app.route('/kasa/hareketler.csv')
@doktor_gerekli
def kasa_csv():
    bas = tarih_coz(request.args.get('baslangic')) or date.today().replace(day=1)
    bit = tarih_coz(request.args.get('bitis')) or date.today()
    hareketler = (KasaHareketi.query.filter(KasaHareketi.tarih >= datetime.combine(bas, time.min),
                                            KasaHareketi.tarih <= datetime.combine(bit, time.max))
                  .order_by(KasaHareketi.tarih.asc()).all())
    cikti = io.StringIO()
    y = csv.writer(cikti, delimiter=';')
    y.writerow(['Belge no', 'Tarih', 'Hasta', 'İşlem', 'Tutar (TL)', 'Yöntem', 'Açıklama', 'Kaydeden', 'Durum'])
    for h in hareketler:
        y.writerow([h.belge_no, h.tarih.strftime('%d.%m.%Y %H:%M'), h.hasta.ad_soyad, h.tur_adi,
                    f'{h.tutar / 100:.2f}'.replace('.', ','), h.yontem or '', h.aciklama or '',
                    h.kullanici.gorunen_ad if h.kullanici else '', f'İptal: {h.iptal_nedeni}' if h.iptal else 'Geçerli'])
    islem_kaydet('disa_aktarma', 'kasa', None, f'Kasa hareketleri CSV: {kisa_tarih(bas)} – {kisa_tarih(bit)}')
    db.session.commit()
    return Response('﻿' + cikti.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename=kasa_{bas.isoformat()}_{bit.isoformat()}.csv'})


# ------------------------------------------------------------------
# 3D vücut haritası (yalnızca doktor)
# ------------------------------------------------------------------
BOLGE_DESENI = re.compile(r'^[a-z_]{2,40}$')


def isaret_alanlari(isaret, v, yeni):
    if yeni or 'tur' in v:
        if v.get('tur') not in VucutIsareti.TURLER:
            raise ValueError('İşaret türünü seçin.')
        isaret.tur = v['tur']
    if yeni or 'siddet' in v:
        s = v.get('siddet')
        if s in (None, ''):
            isaret.siddet = None
        else:
            try:
                s = int(s)
            except (TypeError, ValueError):
                raise ValueError('Şiddet 0–10 arasında olmalıdır.')
            if not 0 <= s <= 10:
                raise ValueError('Şiddet 0–10 arasında olmalıdır.')
            isaret.siddet = s
    if yeni or 'notlar' in v:
        isaret.notlar = (v.get('notlar') or '').strip()[:1000] or None
    if yeni or 'muayene_id' in v:
        mid = v.get('muayene_id')
        if mid:
            m = db.session.get(Muayene, int(mid))
            if not m or m.hasta_id != isaret.hasta_id:
                raise ValueError('Seçilen muayene bu hastaya ait değil.')
            isaret.muayene_id = m.id
        else:
            isaret.muayene_id = None


@app.route('/api/vucut_isareti', methods=['POST'])
@doktor_gerekli
def vucut_isareti_ekle():
    v = request.get_json(silent=True) or {}
    hasta = db.session.get(Hasta, v.get('hasta_id') or 0)
    if not hasta:
        return hata('Hasta bulunamadı.', 404)
    bolge = v.get('bolge') or ''
    bolge_adi = (v.get('bolge_adi') or '').strip()[:60]
    if not BOLGE_DESENI.match(bolge) or not bolge_adi:
        return hata('Modelde bir bölgeye tıklayın.')
    try:
        koord = [float(v.get(k)) for k in ('x', 'y', 'z', 'nx', 'ny', 'nz')]
    except (TypeError, ValueError):
        return hata('Konum bilgisi geçersiz.')
    if not all(math.isfinite(c) and abs(c) < 10 for c in koord):
        return hata('Konum bilgisi geçersiz.')
    i = VucutIsareti(hasta_id=hasta.id, doktor_id=g.kullanici.id, bolge=bolge, bolge_adi=bolge_adi, tarih=datetime.now(),
                     x=koord[0], y=koord[1], z=koord[2], nx=koord[3], ny=koord[4], nz=koord[5])
    try:
        isaret_alanlari(i, v, True)
    except ValueError as e:
        return hata(str(e))
    db.session.add(i)
    db.session.flush()
    islem_kaydet('olusturma', 'isaret', i.id, f'{hasta.ad_soyad}: {bolge_adi} · {i.tur_adi}'
                 + (f' {i.siddet}/10' if i.siddet is not None else ''))
    db.session.commit()
    return jsonify({'mesaj': f'{bolge_adi} işaretlendi.', 'isaret': i.sozluk()}), 201


@app.route('/api/vucut_isareti/<int:isaret_id>', methods=['PUT'])
@doktor_gerekli
def vucut_isareti_guncelle(isaret_id):
    i = db.get_or_404(VucutIsareti, isaret_id)
    v = request.get_json(silent=True) or {}
    try:
        isaret_alanlari(i, v, False)
    except ValueError as e:
        return hata(str(e))
    mesaj = 'İşaret güncellendi.'
    if 'aktif' in v:
        aktif = bool(v['aktif'])
        if aktif != i.aktif:
            i.aktif = aktif
            i.iyilesme_tarihi = None if aktif else datetime.now()
            mesaj = 'İyileşti olarak işaretlendi.' if not aktif else 'Yeniden aktif edildi.'
    islem_kaydet('guncelleme', 'isaret', i.id, f'{i.hasta.ad_soyad}: {i.bolge_adi} · {mesaj}')
    db.session.commit()
    return jsonify({'mesaj': mesaj, 'isaret': i.sozluk()})


@app.route('/api/vucut_isareti/<int:isaret_id>', methods=['DELETE'])
@doktor_gerekli
def vucut_isareti_sil(isaret_id):
    i = db.get_or_404(VucutIsareti, isaret_id)
    islem_kaydet('silme', 'isaret', i.id, f'{i.hasta.ad_soyad}: {i.bolge_adi} işareti silindi')
    db.session.delete(i)
    db.session.commit()
    return jsonify({'mesaj': 'İşaret silindi.'})


# ------------------------------------------------------------------
# Randevu hatırlatmaları
# ------------------------------------------------------------------
VARSAYILAN_AYARLAR['hatirlatma_sablonu'] = (
    'Merhaba {ad}, {klinik} için {gun} {tarih} saat {saat} {islem} randevunuzu hatırlatırız. '
    'Gelemeyecekseniz lütfen bize haber verin. Sağlıklı günler dileriz.')


def hatirlatma_metni(r, sablon=None):
    sablon = sablon or ayar('hatirlatma_sablonu')
    degerler = {'ad': r.hasta.ad_soyad.split()[0], 'adsoyad': r.hasta.ad_soyad, 'klinik': KLINIK_ADI,
                'gun': GUNLER[r.tarih.weekday()], 'tarih': f'{r.tarih.day} {AYLAR[r.tarih.month - 1]}',
                'saat': r.saat, 'islem': r.islem_turu}
    try:
        return sablon.format(**degerler)
    except (KeyError, IndexError, ValueError):
        return VARSAYILAN_AYARLAR['hatirlatma_sablonu'].format(**degerler)


@app.route('/api/hatirlatmalar')
def hatirlatma_listesi():
    tarih = tarih_coz(request.args.get('tarih'))
    if not tarih:
        # Varsayılan: yarından itibaren aktif randevusu olan ilk gün (en fazla 7 gün ileri)
        tarih = date.today() + timedelta(days=1)
        ilk = (Randevu.query.filter(Randevu.tarih >= tarih, Randevu.tarih <= tarih + timedelta(days=6),
                                    Randevu.durum.in_(['Bekliyor', 'Onaylandı'])).order_by(Randevu.tarih.asc()).first())
        if ilk:
            tarih = ilk.tarih
    sablon = ayar('hatirlatma_sablonu')
    liste = []
    for r in (Randevu.query.filter(Randevu.tarih == tarih, Randevu.durum.in_(['Bekliyor', 'Onaylandı']))
              .order_by(Randevu.saat.asc()).all()):
        metin = hatirlatma_metni(r, sablon)
        liste.append({'id': r.id, 'saat': r.saat, 'hasta_id': r.hasta_id, 'ad_soyad': r.hasta.ad_soyad,
                      'telefon': r.hasta.telefon, 'islem_turu': r.islem_turu, 'durum': r.durum,
                      'gelmeme': r.hasta.gelmeme_sayisi, 'metin': metin,
                      'whatsapp': whatsapp_link(r.hasta.telefon, metin),
                      'hatirlatma': r.hatirlatma.strftime('%d.%m %H:%M') if r.hatirlatma else None})
    fark = (tarih - date.today()).days
    goreli = {0: 'Bugün', 1: 'Yarın'}.get(fark, f'{fark} gün sonra' if fark > 0 else f'{-fark} gün önce')
    return jsonify({'tarih': tarih.isoformat(), 'baslik': f'{tarih.day} {AYLAR[tarih.month - 1]} {GUNLER[tarih.weekday()]}',
                    'goreli': goreli, 'onceki': (tarih - timedelta(days=1)).isoformat(), 'sonraki': (tarih + timedelta(days=1)).isoformat(),
                    'sablon': sablon, 'liste': liste})


@app.route('/api/randevu/<int:randevu_id>/hatirlatma', methods=['POST'])
def hatirlatma_isaretle(randevu_id):
    r = db.get_or_404(Randevu, randevu_id)
    geri_al = bool((request.get_json(silent=True) or {}).get('geri_al'))
    r.hatirlatma = None if geri_al else datetime.now()
    if not geri_al:
        islem_kaydet('hatirlatma', 'randevu', r.id, f'{r.hasta.ad_soyad}: {kisa_tarih(r.tarih)} {r.saat} hatırlatması gönderildi')
    db.session.commit()
    return jsonify({'mesaj': 'Hatırlatma geri alındı.' if geri_al else 'Hatırlatıldı olarak işaretlendi.',
                    'hatirlatma': r.hatirlatma.strftime('%d.%m %H:%M') if r.hatirlatma else None})


@app.route('/api/hatirlatma_sablonu', methods=['POST'])
def hatirlatma_sablonu_kaydet():
    sablon = ((request.get_json(silent=True) or {}).get('sablon') or '').strip()
    if len(sablon) < 10 or len(sablon) > 600:
        return hata('Mesaj 10–600 karakter olmalıdır.')
    try:
        sablon.format(ad='', adsoyad='', klinik='', gun='', tarih='', saat='', islem='')
    except (KeyError, IndexError, ValueError):
        return hata('Mesajda yalnızca {ad}, {adsoyad}, {klinik}, {gun}, {tarih}, {saat}, {islem} kullanılabilir.')
    ayar_yaz('hatirlatma_sablonu', sablon)
    islem_kaydet('ayar', 'ayar', None, 'Hatırlatma mesajı güncellendi')
    db.session.commit()
    return jsonify({'mesaj': 'Hatırlatma mesajı kaydedildi.'})


# ------------------------------------------------------------------
# Stok ve malzeme takibi
# ------------------------------------------------------------------
BIRIMLER = ['adet', 'kutu', 'paket', 'şişe', 'ampul', 'flakon', 'çift', 'rulo', 'ml', 'gr']
MALZEME_KATEGORILERI = ['Sarf malzemesi', 'İlaç', 'Aşı', 'Pansuman', 'Laboratuvar', 'Koruyucu ekipman', 'Temizlik', 'Diğer']


def miktar_coz(deger, alan='Miktar', sifir_olabilir=True):
    try:
        m = float(str(deger).replace(',', '.'))
    except (TypeError, ValueError):
        raise ValueError(f'{alan} sayı olmalıdır.')
    if not math.isfinite(m) or m < 0 or m > 1_000_000 or (m == 0 and not sifir_olabilir):
        raise ValueError(f'{alan} geçerli değil.')
    return round(m, 2)


def stok_hareketi(m, tur, miktar, aciklama='', randevu=None):
    onceki = m.miktar
    m.miktar = round(max(0.0, onceki + miktar), 2)
    h = StokHareketi(malzeme_id=m.id, tur=tur, miktar=round(m.miktar - onceki, 2), onceki=onceki, sonraki=m.miktar,
                     aciklama=aciklama[:200] or None, kullanici_id=g.kullanici.id if g.get('kullanici') else None,
                     randevu_id=randevu.id if randevu else None, tarih=datetime.now())
    db.session.add(h)
    return h


def stok_dus(randevu):
    """Tamamlanan hizmetin malzemelerini stoktan bir kez düşer."""
    if StokHareketi.query.filter_by(randevu_id=randevu.id, tur='otomatik').first():
        return {'adet': 0, 'kritik': []}
    kalemler = IslemMalzemesi.query.filter_by(islem_turu=randevu.islem_turu).all()
    kritik = []
    adet = 0
    for k in kalemler:
        m = k.malzeme
        if not m or not m.aktif:
            continue
        eksik = max(0.0, k.miktar - m.miktar)
        aciklama = f'{randevu.islem_turu} · {randevu.hasta.ad_soyad}' + (f' · stok yetersizdi ({eksik:g} {m.birim} eksik)' if eksik else '')
        stok_hareketi(m, 'otomatik', -k.miktar, aciklama, randevu)
        adet += 1
        if m.durum != 'normal':
            kritik.append(f'{m.ad}: {m.miktar:g} {m.birim} kaldı')
    return {'adet': adet, 'kritik': kritik}


@app.route('/stok')
def stok_sayfasi():
    malzemeler = Malzeme.query.filter_by(aktif=True).order_by(Malzeme.ad.asc()).all()
    hareketler = StokHareketi.query.order_by(StokHareketi.tarih.desc()).limit(300).all()
    ay_bas = datetime.combine(date.today().replace(day=1), time.min)
    ay_tuketim = (StokHareketi.query.filter(StokHareketi.tarih >= ay_bas, StokHareketi.tur.in_(['otomatik', 'cikis'])).all())
    ay_tuketim_deger = sum(-h.miktar * (h.malzeme.birim_fiyat or 0) for h in ay_tuketim if h.malzeme)
    eslemeler = {}
    for e in IslemMalzemesi.query.all():
        if e.malzeme and e.malzeme.aktif:
            eslemeler.setdefault(e.islem_turu, []).append({'id': e.id, 'malzeme_id': e.malzeme_id, 'malzeme': e.malzeme.ad,
                                                           'birim': e.malzeme.birim, 'miktar': e.miktar})
    return render_template(
        'stok.html', aktif_sayfa='stok',
        malzemeler_json=[m.sozluk() for m in malzemeler],
        hareketler_json=[h.sozluk() for h in hareketler],
        eslemeler_json=eslemeler, islem_turleri=ISLEM_TURLERI, birimler=BIRIMLER, kategoriler=MALZEME_KATEGORILERI,
        ozet={
            'toplam': len(malzemeler),
            'kritik': len([m for m in malzemeler if m.durum == 'kritik']),
            'tukenen': len([m for m in malzemeler if m.durum == 'tukendi']),
            'skt': len([m for m in malzemeler if m.skt_gun is not None and m.skt_gun <= 30]),
            'deger': int(sum(m.miktar * (m.birim_fiyat or 0) for m in malzemeler)),
            'ay_tuketim_adet': len(ay_tuketim), 'ay_tuketim_deger': int(ay_tuketim_deger),
        },
    )


def malzeme_alanlari(m, v, yeni):
    ad = re.sub(r'\s+', ' ', (v.get('ad') or '').strip())
    if len(ad) < 2 or len(ad) > 100:
        raise ValueError('Malzeme adını yazın.')
    m.ad = ad
    m.kategori = (v.get('kategori') or 'Sarf malzemesi').strip()[:40] or 'Sarf malzemesi'
    birim = (v.get('birim') or 'adet').strip()
    if birim not in BIRIMLER:
        raise ValueError('Geçerli bir birim seçin.')
    m.birim = birim
    m.kritik = miktar_coz(v.get('kritik') or 0, 'Kritik seviye')
    skt = v.get('son_kullanma')
    m.son_kullanma = tarih_coz(skt) if skt else None
    if skt and not m.son_kullanma:
        raise ValueError('Son kullanma tarihi geçerli değil.')
    fiyat = v.get('birim_fiyat')
    if fiyat in (None, ''):
        m.birim_fiyat = None
    else:
        k = tutar_coz(fiyat)
        if k is None or k < 0 or k > 10_000_000:
            raise ValueError('Birim fiyat geçerli değil.')
        m.birim_fiyat = k
    m.notlar = (v.get('notlar') or '').strip()[:300] or None


@app.route('/api/malzeme', methods=['POST'])
def malzeme_ekle():
    v = request.get_json(silent=True) or {}
    m = Malzeme(miktar=0)
    try:
        malzeme_alanlari(m, v, True)
        baslangic = miktar_coz(v.get('miktar') or 0, 'Başlangıç miktarı')
    except ValueError as e:
        return hata(str(e))
    if Malzeme.query.filter(func.lower(Malzeme.ad) == m.ad.lower(), Malzeme.aktif.is_(True)).first():
        return hata('Bu adla bir malzeme zaten var.', 409)
    db.session.add(m)
    db.session.flush()
    if baslangic:
        stok_hareketi(m, 'giris', baslangic, 'Açılış stoku')
    islem_kaydet('olusturma', 'malzeme', m.id, f'{m.ad} stok kartı açıldı ({baslangic:g} {m.birim})')
    db.session.commit()
    return jsonify({'mesaj': f'{m.ad} eklendi.', 'malzeme': m.sozluk()}), 201


@app.route('/api/malzeme/<int:malzeme_id>', methods=['PUT'])
def malzeme_guncelle(malzeme_id):
    m = db.get_or_404(Malzeme, malzeme_id)
    try:
        malzeme_alanlari(m, request.get_json(silent=True) or {}, False)
    except ValueError as e:
        return hata(str(e))
    islem_kaydet('guncelleme', 'malzeme', m.id, f'{m.ad} stok kartı güncellendi')
    db.session.commit()
    return jsonify({'mesaj': 'Malzeme güncellendi.', 'malzeme': m.sozluk()})


@app.route('/api/malzeme/<int:malzeme_id>', methods=['DELETE'])
@doktor_gerekli
def malzeme_sil(malzeme_id):
    m = db.get_or_404(Malzeme, malzeme_id)
    m.aktif = False
    IslemMalzemesi.query.filter_by(malzeme_id=m.id).delete()
    islem_kaydet('silme', 'malzeme', m.id, f'{m.ad} stok kartı kaldırıldı (geçmiş hareketler saklandı)')
    db.session.commit()
    return jsonify({'mesaj': f'{m.ad} kaldırıldı.'})


@app.route('/api/malzeme/<int:malzeme_id>/hareket', methods=['POST'])
def malzeme_hareket(malzeme_id):
    m = db.get_or_404(Malzeme, malzeme_id)
    if not m.aktif:
        return hata('Bu malzeme kaldırılmış.', 404)
    v = request.get_json(silent=True) or {}
    tur = v.get('tur')
    if tur not in ('giris', 'cikis', 'sayim'):
        return hata('Geçersiz hareket türü.')
    try:
        miktar = miktar_coz(v.get('miktar'), 'Miktar', sifir_olabilir=(tur == 'sayim'))
    except ValueError as e:
        return hata(str(e))
    aciklama = (v.get('aciklama') or '').strip()[:200]
    if tur == 'cikis' and miktar > m.miktar:
        return hata(f'Stokta yalnızca {m.miktar:g} {m.birim} var.')
    if tur == 'sayim':
        fark = round(miktar - m.miktar, 2)
        if fark == 0:
            return hata('Sayılan miktar mevcut stokla aynı.')
        h = stok_hareketi(m, 'sayim', fark, aciklama or 'Sayım düzeltmesi')
    else:
        h = stok_hareketi(m, tur, miktar if tur == 'giris' else -miktar, aciklama)
    if tur == 'giris' and v.get('son_kullanma'):
        skt = tarih_coz(v.get('son_kullanma'))
        if skt:
            m.son_kullanma = skt
    islem_kaydet('stok', 'malzeme', m.id, f'{m.ad}: {StokHareketi.TURLER[tur]} {h.miktar:+g} {m.birim} → {m.miktar:g}')
    db.session.commit()
    adlar = {'giris': 'Stok girişi', 'cikis': 'Stok çıkışı', 'sayim': 'Sayım'}
    uyari = f' · {m.ad} kritik seviyede!' if m.durum != 'normal' else ''
    return jsonify({'mesaj': f'{adlar[tur]} kaydedildi: {m.ad} {m.miktar:g} {m.birim}{uyari}',
                    'malzeme': m.sozluk(), 'hareket': h.sozluk()})


@app.route('/api/islem_malzemesi', methods=['POST'])
def islem_malzemesi_kaydet():
    v = request.get_json(silent=True) or {}
    islem = v.get('islem_turu')
    if islem not in ISLEM_TURLERI:
        return hata('Geçersiz hizmet.')
    m = db.session.get(Malzeme, v.get('malzeme_id') or 0)
    if not m or not m.aktif:
        return hata('Malzeme seçin.')
    try:
        miktar = miktar_coz(v.get('miktar') or 1, 'Miktar', sifir_olabilir=False)
    except ValueError as e:
        return hata(str(e))
    e = IslemMalzemesi.query.filter_by(islem_turu=islem, malzeme_id=m.id).first()
    if e is None:
        e = IslemMalzemesi(islem_turu=islem, malzeme_id=m.id)
        db.session.add(e)
    e.miktar = miktar
    islem_kaydet('ayar', 'malzeme', m.id, f'{islem} hizmetinde {miktar:g} {m.birim} {m.ad} kullanılır')
    db.session.commit()
    return jsonify({'mesaj': f'{islem}: {miktar:g} {m.birim} {m.ad}', 'esleme': {
        'id': e.id, 'malzeme_id': m.id, 'malzeme': m.ad, 'birim': m.birim, 'miktar': e.miktar}})


@app.route('/api/islem_malzemesi/<int:esleme_id>', methods=['DELETE'])
def islem_malzemesi_sil(esleme_id):
    e = db.get_or_404(IslemMalzemesi, esleme_id)
    islem_kaydet('ayar', 'malzeme', e.malzeme_id, f'{e.islem_turu} hizmetinden {e.malzeme.ad if e.malzeme else ""} çıkarıldı')
    db.session.delete(e)
    db.session.commit()
    return jsonify({'mesaj': 'Hizmetten çıkarıldı.'})


# ------------------------------------------------------------------
# Raporlar (yalnızca doktor)
# ------------------------------------------------------------------
def rapor_araligi():
    bugun = date.today()
    tur = request.args.get('aralik', 'ay')
    if tur == 'ozel':
        bas, bit = tarih_coz(request.args.get('bas')), tarih_coz(request.args.get('bit'))
        if bas and bit and bas <= bit:
            return tur, bas, bit, f'{kisa_tarih(bas)} – {kisa_tarih(bit)}'
        tur = 'ay'
    if tur == '3ay':
        bas = (bugun.replace(day=1) - timedelta(days=62)).replace(day=1)
        return tur, bas, bugun, f'Son 3 ay ({AYLAR[bas.month - 1]} – {AYLAR[bugun.month - 1]})'
    if tur == 'yil':
        return tur, bugun.replace(month=1, day=1), bugun, f'{bugun.year} yılı'
    if tur == 'gecen_ay':
        bit = bugun.replace(day=1) - timedelta(days=1)
        return tur, bit.replace(day=1), bit, f'{AYLAR[bit.month - 1]} {bit.year}'
    return 'ay', bugun.replace(day=1), bugun, f'{AYLAR[bugun.month - 1]} {bugun.year}'


def yas_grubu(h):
    y = h.yas
    if y is None:
        return 'Bilinmiyor'
    for sinir, ad in ((18, '0–17'), (35, '18–34'), (50, '35–49'), (65, '50–64')):
        if y < sinir:
            return ad
    return '65+'


@app.route('/raporlar')
@doktor_gerekli
def raporlar():
    tur, bas, bit, etiket = rapor_araligi()
    bas_dt, bit_dt = datetime.combine(bas, time.min), datetime.combine(bit, time.max)
    randevular = Randevu.query.filter(Randevu.tarih >= bas, Randevu.tarih <= bit).all()
    durum_say = {d: 0 for d in DURUMLAR}
    for r in randevular:
        durum_say[r.durum] = durum_say.get(r.durum, 0) + 1
    sonuclanan = durum_say['Tamamlandı'] + durum_say['Gelmedi']
    hareketler = KasaHareketi.query.filter(KasaHareketi.tarih >= bas_dt, KasaHareketi.tarih <= bit_dt,
                                           KasaHareketi.iptal.is_(False)).all()
    oz = kasa_ozeti(hareketler)
    yeni_hasta = Hasta.query.filter(Hasta.kayit_tarihi >= bas_dt, Hasta.kayit_tarihi <= bit_dt).count()
    muayeneler = Muayene.query.filter(Muayene.tarih >= bas_dt, Muayene.tarih <= bit_dt).all()

    # Son 12 ay (bitiş ayına kadar)
    aylar = []
    y, a = bit.year, bit.month
    for _ in range(12):
        aylar.append((y, a))
        a -= 1
        if a == 0:
            y, a = y - 1, 12
    aylar.reverse()
    ay_bas = date(aylar[0][0], aylar[0][1], 1)
    ay_hareket = KasaHareketi.query.filter(KasaHareketi.tarih >= datetime.combine(ay_bas, time.min),
                                           KasaHareketi.tarih <= bit_dt, KasaHareketi.iptal.is_(False)).all()
    ay_randevu = Randevu.query.filter(Randevu.tarih >= ay_bas, Randevu.tarih <= bit).all()
    aylik = {k: {'gelir': 0, 'tamamlanan': 0, 'gelmedi': 0} for k in aylar}
    for h in ay_hareket:
        k = (h.tarih.year, h.tarih.month)
        if k in aylik and h.tur in ('tahsilat', 'iade'):
            aylik[k]['gelir'] += h.tutar if h.tur == 'tahsilat' else -h.tutar
    for r in ay_randevu:
        k = (r.tarih.year, r.tarih.month)
        if k in aylik:
            if r.durum == 'Tamamlandı':
                aylik[k]['tamamlanan'] += 1
            elif r.durum == 'Gelmedi':
                aylik[k]['gelmedi'] += 1
    aylik_liste = [{'etiket': f'{AYLAR[a - 1][:3]}', 'yil': y, **aylik[(y, a)]} for y, a in aylar]

    # Tanılar
    tanilar = {}
    for m in muayeneler:
        t = (m.tani or '').strip()
        if t:
            tanilar[t] = tanilar.get(t, 0) + 1
    tani_liste = sorted(tanilar.items(), key=lambda x: -x[1])[:8]

    # Hizmetler: sayı ve gelir
    hizmet = {}
    for r in randevular:
        if r.durum == 'Tamamlandı':
            hizmet.setdefault(r.islem_turu, {'adet': 0, 'ciro': 0})['adet'] += 1
    for h in hareketler:
        if h.tur == 'ucret' and h.randevu:
            hizmet.setdefault(h.randevu.islem_turu, {'adet': 0, 'ciro': 0})['ciro'] += h.tutar
    hizmet_liste = sorted(({'ad': k, **v} for k, v in hizmet.items()), key=lambda x: -x['adet'])

    # Yoğunluk: gün × saat
    saatler = list(range(9, 18))
    isi = [[0] * len(saatler) for _ in range(6)]
    gun_gelmeme = [[0, 0] for _ in range(7)]  # [gelmedi, sonuçlanan]
    for r in randevular:
        if r.durum == 'İptal':
            continue
        g_ = r.tarih.weekday()
        s_ = int(r.saat[:2])
        if g_ < 6 and s_ in saatler:
            isi[g_][saatler.index(s_)] += 1
        if r.durum in ('Tamamlandı', 'Gelmedi'):
            gun_gelmeme[g_][1] += 1
            if r.durum == 'Gelmedi':
                gun_gelmeme[g_][0] += 1

    # Hasta profili (aralıkta randevusu olan hastalar)
    hastalar = {r.hasta for r in randevular if r.hasta and r.durum != 'İptal'}
    cinsiyet, yas = {}, {}
    for h in hastalar:
        cinsiyet[h.cinsiyet or 'Belirtilmemiş'] = cinsiyet.get(h.cinsiyet or 'Belirtilmemiş', 0) + 1
        yas[yas_grubu(h)] = yas.get(yas_grubu(h), 0) + 1
    yas_sira = ['0–17', '18–34', '35–49', '50–64', '65+', 'Bilinmiyor']

    sadik = {}
    for r in randevular:
        if r.durum == 'Tamamlandı':
            sadik[r.hasta_id] = sadik.get(r.hasta_id, 0) + 1
    sadik_liste = [{'hasta_id': hid, 'ad_soyad': db.session.get(Hasta, hid).ad_soyad, 'ziyaret': n}
                   for hid, n in sorted(sadik.items(), key=lambda x: -x[1])[:5]]

    # Stok tüketimi
    tuketim = {}
    for h in StokHareketi.query.filter(StokHareketi.tarih >= bas_dt, StokHareketi.tarih <= bit_dt,
                                       StokHareketi.tur.in_(['otomatik', 'cikis'])).all():
        if h.malzeme:
            k = h.malzeme.ad
            t_ = tuketim.setdefault(k, {'miktar': 0, 'birim': h.malzeme.birim, 'deger': 0})
            t_['miktar'] += -h.miktar
            t_['deger'] += -h.miktar * (h.malzeme.birim_fiyat or 0)
    tuketim_liste = sorted(({'ad': k, **v} for k, v in tuketim.items()), key=lambda x: -x['miktar'])[:6]

    islem_kaydet('goruntuleme', 'rapor', None, f'Raporlar: {etiket}')
    db.session.commit()
    return render_template(
        'raporlar.html', aktif_sayfa='raporlar', aralik=tur, bas=bas, bit=bit, etiket=etiket,
        ozet={
            'randevu': len([r for r in randevular if r.durum != 'İptal']), 'tamamlanan': durum_say['Tamamlandı'],
            'gelmedi': durum_say['Gelmedi'], 'iptal': durum_say['İptal'],
            'gelmeme_orani': round(durum_say['Gelmedi'] / sonuclanan * 100, 1) if sonuclanan else 0,
            'yeni_hasta': yeni_hasta, 'muayene': len(muayeneler), 'gelir': oz['net'], 'hizmet': oz['ucret'],
            'indirim': oz['indirim'], 'ort_ucret': int(oz['ucret'] / durum_say['Tamamlandı']) if durum_say['Tamamlandı'] else 0,
            'tekil_hasta': len(hastalar), 'yontem': oz['yontem'],
        },
        rapor_json={
            'aylik': aylik_liste, 'tanilar': [{'ad': k, 'adet': v} for k, v in tani_liste], 'hizmetler': hizmet_liste,
            'isi': isi, 'saatler': [f'{s:02d}' for s in saatler], 'gunler': GUN_KISA[:6],
            'gun_gelmeme': [{'gun': GUN_KISA[i], 'gelmedi': g_[0], 'toplam': g_[1]} for i, g_ in enumerate(gun_gelmeme[:6])],
            'cinsiyet': cinsiyet, 'yas': [{'ad': k, 'adet': yas.get(k, 0)} for k in yas_sira if yas.get(k)],
            'sadik': sadik_liste, 'tuketim': tuketim_liste, 'durumlar': durum_say,
        },
    )


# ------------------------------------------------------------------
# İlaç listesi
# ------------------------------------------------------------------
@app.route('/api/ilaclar')
def ilaclar_api():
    return jsonify({'ilaclar': ilac_listesi()})


# ------------------------------------------------------------------
# Örnek veri: flask --app app ornek-veri
# ------------------------------------------------------------------
@app.cli.command('ornek-veri')
def ornek_veri():
    """Arayüzü denemek için örnek kullanıcı, hasta, randevu, muayene, vital ve reçete ekler."""
    if not Doktor.query.count():
        dr = Doktor(ad_soyad='Demo Hekim', email='doktor@klinik.local', rol='doktor')
        dr.sifre_belirle('klinik123')
        sk = Doktor(ad_soyad='Demo Sekreter', email='sekreter@klinik.local', rol='sekreter')
        sk.sifre_belirle('klinik123')
        db.session.add_all([dr, sk])
        db.session.commit()
        print('Kullanıcılar: doktor@klinik.local / klinik123  ·  sekreter@klinik.local / klinik123')

    if Hasta.query.count():
        print('Veritabanında zaten hasta var, örnek hasta eklenmedi.')
        ek_ornek_veri()
        return
    doktor = Doktor.query.filter_by(rol='doktor').first()
    did = doktor.id if doktor else None
    bugun = date.today()
    pazartesi = hafta_baslangici(bugun)
    ornekler = [
        ('Zeynep Demir', '12345678978', '0532 418 27 63', '1992-03-12', 'Kadın', 'A Rh+', 'Hipotiroidi', 'Hipotiroidi, Astım', 'Apendektomi (2014), Tiroid biyopsisi (2023)', 'İlaç: Penisilin, Solunum: Bahar Poleni', 'Son iki haftadır halsizlik, çabuk yorulma ve uyku düzensizliği.', True),
        ('Mehmet Kaya', '28456789015', '0541 207 33 90', '1968-07-02', 'Erkek', '0 Rh+', 'Diyabet (Tip 2)', 'Diyabet (Tip 2), Hipertansiyon', '', '', 'Kan şekeri takibi.', True),
        ('Ayşe Yılmaz', '37156789004', '0505 662 11 48', '1999-01-21', 'Kadın', 'B Rh+', 'Anemi (Kansızlık)', '', '', '', 'Baş dönmesi.', True),
        ('Ali Çelik', '40956789062', '0553 380 74 21', '1981-05-30', 'Erkek', 'A Rh−', 'Yara bakımı', '', '', 'Temas: Lateks', 'Sol el yarası.', False),
        ('Elif Şahin', '51256789037', '0536 914 02 55', '1995-10-09', 'Kadın', 'AB Rh+', 'Migren', 'Migren', '', '', 'Sık baş ağrısı.', True),
        ('Can Öztürk', '62756789080', '0542 125 67 09', '1964-02-17', 'Erkek', '0 Rh−', 'Hipertansiyon', 'Hipertansiyon, Kalp yetmezliği', 'Baypas (2019)', 'İlaç: Aspirin', 'Tansiyon kontrolü.', False),
    ]
    hastalar = []
    for o in ornekler:
        h = Hasta(ad_soyad=o[0], tc_kimlik=o[1], telefon=o[2], dogum_tarihi=o[3], cinsiyet=o[4],
                  kan_grubu=o[5], hastalik_tanisi=o[6], kronik_hastaliklar=o[7] or None,
                  gecmis_ameliyatlar=o[8] or None, alerji_durumu=o[9] or None, sikayet=o[10],
                  kvkk_onay=o[11], kvkk_onay_tarihi=datetime.now() if o[11] else None)
        db.session.add(h)
        hastalar.append(h)
    db.session.flush()

    plan = [
        (bugun, '09:00', 2, 'Genel Muayene', 'Tamamlandı', 'Yıllık kontrol'),
        (bugun, '09:30', 1, 'Kontrol Muayenesi', 'Tamamlandı', 'HbA1c sonucu'),
        (bugun, '10:30', 0, 'Kan Tahlili', 'Onaylandı', 'Aç karnına; TSH, T4'),
        (bugun, '11:00', 3, 'Pansuman', 'Bekliyor', 'Sol el yarası'),
        (bugun, '13:30', 4, 'Ultrason', 'Onaylandı', 'Batın USG'),
        (bugun, '15:00', 5, 'Genel Muayene', 'Bekliyor', 'Tansiyon takibi'),
    ]
    for i in range(7):
        gun = pazartesi + timedelta(days=i)
        if gun != bugun and i < 6:
            for j in range((i % 3) + 2):
                plan.append((gun, SAAT_DILIMLERI[(i * 3 + j * 4) % len(SAAT_DILIMLERI)], (i + j) % 6,
                             ISLEM_TURLERI[(i + j) % len(ISLEM_TURLERI)],
                             'Tamamlandı' if gun < bugun else 'Onaylandı', ''))
    randevular = []
    for p in plan:
        r = Randevu(tarih=p[0], saat=p[1], hasta_id=hastalar[p[2]].id, islem_turu=p[3],
                    durum=p[4], notlar=p[5] or None, doktor_id=did)
        db.session.add(r)
        randevular.append(r)
    db.session.flush()

    simdi = datetime.now()
    m1 = Muayene(hasta_id=hastalar[0].id, doktor_id=did, tarih=simdi - timedelta(days=17), tani='Hipotiroidi',
                 bulgular='TSH 6,8 mIU/L, sT4 düşük-normal. Halsizlik ve kilo artışı.',
                 tedavi='Levotiroksin 50 mcg sabah aç karnına başlandı.', kontrol_tarihi=bugun)
    m2 = Muayene(hasta_id=hastalar[0].id, doktor_id=did, tarih=simdi - timedelta(days=100),
                 tani='Astım (kontrol altında)', bulgular='Solunum fonksiyon testi normal sınırlarda.',
                 tedavi='Gerektiğinde salbutamol inhaler.')
    db.session.add_all([m1, m2])
    for r in randevular:
        if r.durum == 'Tamamlandı' and r.tarih == bugun and r.saat == '09:30':
            db.session.add(Muayene(hasta_id=r.hasta_id, randevu_id=r.id, doktor_id=did,
                                   tani='Diyabet (Tip 2)', bulgular='HbA1c %7,4.',
                                   tedavi='Metformin dozu 1000 mg x2 olarak sürdürüldü.',
                                   kontrol_tarihi=bugun + timedelta(days=90)))
    db.session.flush()

    # Vital bulgu serileri (grafikler için)
    seriler = {
        0: [(160, 118, 72, 78, 36.6, 92, 98, 64.0, 165), (120, 122, 78, 82, 36.7, 95, 98, 64.8, 165),
            (75, 126, 80, 80, 36.5, 97, 97, 65.6, 165), (45, 124, 79, 76, 36.6, 94, 98, 65.9, 165),
            (17, 128, 82, 84, 36.8, 101, 97, 66.4, 165), (2, 121, 77, 74, 36.6, 93, 99, 66.0, 165)],
        1: [(180, 148, 94, 88, 36.6, 168, 96, 92.0, 176), (120, 142, 90, 84, 36.7, 152, 97, 90.5, 176),
            (60, 136, 86, 82, 36.5, 138, 97, 89.2, 176), (0, 132, 84, 80, 36.6, 128, 97, 88.4, 176)],
        5: [(90, 162, 98, 92, 36.8, 104, 94, 84.0, 172), (30, 154, 94, 88, 36.7, 99, 95, 83.1, 172),
            (1, 146, 90, 86, 36.6, 97, 95, 82.5, 172)],
    }
    for hi, seri in seriler.items():
        for gun_once, sis, dia, nab, ates, seker, spo2, kilo, boy in seri:
            db.session.add(Vital(hasta_id=hastalar[hi].id, olcen_id=did, tarih=simdi - timedelta(days=gun_once, hours=2),
                                 sistolik=sis, diastolik=dia, nabiz=nab, ates=ates, seker=seker, spo2=spo2,
                                 kilo=kilo, boy=boy, muayene_id=m1.id if (hi == 0 and gun_once == 17) else None))

    rc = Recete(hasta_id=hastalar[0].id, muayene_id=m1.id, doktor_id=did, tarih=simdi - timedelta(days=17),
                tani='Hipotiroidi', notlar='6 hafta sonra TSH kontrolü.')
    rc.kalemler = [ReceteKalemi(sira=0, ilac_adi='Levotiroksin 50 mcg tablet', etken_madde='levotiroksin',
                                doz='50 mcg', kullanim='Sabah aç karnına, kahvaltıdan 30 dk önce', sure='3 ay', adet=3)]
    db.session.add(rc)
    db.session.commit()
    print(f'{len(hastalar)} hasta, {len(plan)} randevu, 3 muayene, vital serileri ve 1 reçete eklendi.')
    ek_ornek_veri()


def ek_ornek_veri():
    """Tarife, kasa hareketleri, online talepler ve vücut işaretleri (her biri yalnızca boşsa eklenir)."""
    doktor = Doktor.query.filter_by(rol='doktor').first()
    did = doktor.id if doktor else None
    simdi = datetime.now()
    bugun = date.today()

    if not Tarife.query.count():
        for islem, tl_ in [('Genel Muayene', 1200), ('Kontrol Muayenesi', 600), ('Kan Tahlili', 450), ('Ultrason', 1500),
                           ('Pansuman', 350), ('Enjeksiyon', 250), ('EKG', 500), ('Konsültasyon', 1000)]:
            db.session.add(Tarife(islem_turu=islem, ucret=tl_ * 100))
        db.session.commit()
        print('Ücret tarifesi eklendi.')

    if not KasaHareketi.query.count():
        tarifeler = tarife_sozlugu()
        tamamlanan = (Randevu.query.filter(Randevu.durum == 'Tamamlandı')
                      .order_by(Randevu.tarih.asc(), Randevu.saat.asc()).all())
        yontemler = ['Kart', 'Nakit', 'Kart', 'Havale', 'Kart', 'Nakit']
        for n, r in enumerate(tamamlanan):
            ucret = tarifeler.get(r.islem_turu, 0)
            if not ucret:
                continue
            an = datetime.combine(r.tarih, datetime.strptime(r.saat, '%H:%M').time()) + timedelta(minutes=35)
            an = min(an, simdi)
            db.session.add(KasaHareketi(tur='ucret', tutar=ucret, hasta_id=r.hasta_id, randevu_id=r.id, kullanici_id=did,
                                        tarih=an, aciklama=f'{r.islem_turu} · {kisa_tarih(r.tarih)} {r.saat}'))
            if r.hasta.ad_soyad.startswith('Mehmet'):
                continue  # Mehmet Kaya ödemedi: açık bakiye örneği
            tutar = ucret if n % 4 else ucret // 2   # bazıları kısmi ödeme
            db.session.add(KasaHareketi(tur='tahsilat', tutar=tutar, yontem=yontemler[n % len(yontemler)],
                                        hasta_id=r.hasta_id, kullanici_id=did, tarih=an + timedelta(minutes=2),
                                        aciklama='Ödeme' if tutar == ucret else 'Kısmi ödeme'))
        db.session.commit()
        print(f'{len(tamamlanan)} tamamlanmış randevu için kasa hareketleri eklendi.')

    if not OnlineTalep.query.count():
        a = online_ayarlari()
        eklenen = 0
        for ad, tel, islem, gun_ileri, not_ in [('Selin Arslan', '0533 271 64 18', 'Genel Muayene', 1, 'Üç gündür boğaz ağrısı ve ateş.'),
                                               ('Elif Şahin', '0536 914 02 55', 'Kontrol Muayenesi', 2, 'Migren ilacı kontrolü.')]:
            gun = bugun + timedelta(days=gun_ileri)
            while gun.weekday() in a['kapali']:
                gun += timedelta(days=1)
            bos = [x['saat'] for x in online_saat_listesi(gun, a) if not x['dolu']]
            if not bos:
                continue
            kod = ''.join(secrets.choice(TALEP_KOD_HARFLERI) for _ in range(8))
            db.session.add(OnlineTalep(kod=kod, ad_soyad=ad, telefon=tel, tarih=gun, saat=bos[min(3, len(bos) - 1)],
                                       islem_turu=islem, notlar=not_, kvkk_onay=True,
                                       olusturma=simdi - timedelta(minutes=25 + eklenen * 70)))
            db.session.flush()
            eklenen += 1
        db.session.commit()
        print(f'{eklenen} online randevu talebi eklendi.')

    if not VucutIsareti.query.count():
        zeynep = Hasta.query.filter_by(ad_soyad='Zeynep Demir').first()
        ali = Hasta.query.filter_by(ad_soyad='Ali Çelik').first()
        if zeynep:
            m = zeynep.muayeneler[0] if zeynep.muayeneler else None
            db.session.add(VucutIsareti(hasta_id=zeynep.id, doktor_id=did, muayene_id=m.id if m else None,
                                        tarih=simdi - timedelta(days=17), bolge='boyun_on', bolge_adi='Boyun (ön)',
                                        x=0.0, y=1.24, z=0.125, nx=0, ny=0, nz=1, tur='sislik', siddet=3,
                                        notlar='Tiroid bölgesinde hafif büyüme, ele gelen nodül yok.'))
            db.session.add(VucutIsareti(hasta_id=zeynep.id, doktor_id=did, tarih=simdi - timedelta(days=100),
                                        bolge='gogus_on', bolge_adi='Göğüs', x=0.0, y=0.8, z=0.258, nx=0, ny=0.05, nz=1,
                                        tur='agri', siddet=4, notlar='Eforla göğüste sıkışma hissi (astım atağı).',
                                        aktif=False, iyilesme_tarihi=simdi - timedelta(days=80)))
        if ali:
            db.session.add(VucutIsareti(hasta_id=ali.id, doktor_id=did, tarih=simdi - timedelta(days=2), bolge='el_sol',
                                        bolge_adi='Sol el / bilek', x=0.74, y=-0.4, z=0.085, nx=0.2, ny=0, nz=1,
                                        tur='yara', siddet=5, notlar='3 cm kesi, pansuman yapıldı.'))
        db.session.commit()
        print('Vücut haritası örnek işaretleri eklendi.')

    if not Malzeme.query.count():
        kalemler = [
            # ad, kategori, birim, miktar, kritik, birim fiyat (TL), SKT (gün sonra)
            ('Enjektör 5 ml', 'Sarf malzemesi', 'adet', 140, 40, 3, None),
            ('Enjektör 2 ml', 'Sarf malzemesi', 'adet', 18, 30, 2.5, None),
            ('Alkollü pamuk', 'Sarf malzemesi', 'paket', 22, 10, 1.5, None),
            ('Nitril eldiven', 'Koruyucu ekipman', 'çift', 160, 50, 2, None),
            ('Steril gazlı bez', 'Pansuman', 'paket', 34, 15, 4, 420),
            ('Flaster', 'Pansuman', 'rulo', 6, 5, 18, None),
            ('Batikon 100 ml', 'Pansuman', 'şişe', 4, 3, 65, 24),
            ('Vakumlu kan tüpü', 'Laboratuvar', 'adet', 90, 40, 6, 200),
            ('Kelebek iğne', 'Laboratuvar', 'adet', 0, 20, 5, None),
            ('EKG elektrodu', 'Sarf malzemesi', 'adet', 220, 60, 1.2, 300),
            ('Ultrason jeli', 'Sarf malzemesi', 'şişe', 3, 2, 90, None),
            ('Dil basacağı', 'Sarf malzemesi', 'adet', 260, 50, 0.5, None),
            ('Diklofenak 75 mg ampul', 'İlaç', 'ampul', 12, 10, 14, 19),
            ('Tetanoz aşısı', 'Aşı', 'flakon', 5, 3, 210, 75),
        ]
        bas = simdi - timedelta(days=40)
        nesne = {}
        for ad, kat, birim, miktar, kritik, fiyat, skt in kalemler:
            m = Malzeme(ad=ad, kategori=kat, birim=birim, miktar=0, kritik=kritik, birim_fiyat=int(fiyat * 100),
                        son_kullanma=(bugun + timedelta(days=skt)) if skt else None, olusturma=bas)
            db.session.add(m)
            db.session.flush()
            giris = miktar + (kritik if miktar < kritik * 1.2 else 0)
            m.miktar = giris
            db.session.add(StokHareketi(malzeme_id=m.id, tur='giris', miktar=giris, onceki=0, sonraki=giris,
                                        aciklama='Açılış stoku', kullanici_id=did, tarih=bas))
            if giris != miktar:
                db.session.add(StokHareketi(malzeme_id=m.id, tur='cikis', miktar=miktar - giris, onceki=giris, sonraki=miktar,
                                            aciklama='Kullanım', kullanici_id=did, tarih=simdi - timedelta(days=3)))
                m.miktar = miktar
            nesne[ad] = m
        recete = {
            'Genel Muayene': [('Dil basacağı', 1), ('Nitril eldiven', 1)],
            'Kontrol Muayenesi': [('Nitril eldiven', 1)],
            'Kan Tahlili': [('Vakumlu kan tüpü', 2), ('Kelebek iğne', 1), ('Alkollü pamuk', 1), ('Nitril eldiven', 1)],
            'Enjeksiyon': [('Enjektör 5 ml', 1), ('Alkollü pamuk', 1), ('Nitril eldiven', 1)],
            'Pansuman': [('Steril gazlı bez', 2), ('Batikon 100 ml', 0.1), ('Flaster', 0.05), ('Nitril eldiven', 1)],
            'EKG': [('EKG elektrodu', 10), ('Alkollü pamuk', 1)],
            'Ultrason': [('Ultrason jeli', 0.1), ('Nitril eldiven', 1)],
        }
        for islem, liste in recete.items():
            for ad, mk in liste:
                db.session.add(IslemMalzemesi(islem_turu=islem, malzeme_id=nesne[ad].id, miktar=mk))
        db.session.commit()
        print(f'{len(kalemler)} stok kalemi ve hizmet-malzeme eşlemeleri eklendi.')

    # Raporlar dolu görünsün: yalnızca demo veritabanında (demo hekim hesabı varsa) 6 aylık geçmiş üret
    if Doktor.query.filter_by(email='doktor@klinik.local').first() and ayar('demo_gecmis') != '1':
        import random
        rnd = random.Random(42)
        hastalar = Hasta.query.all()
        tarifeler = tarife_sozlugu()
        tanilar = ['Üst solunum yolu enfeksiyonu', 'Esansiyel hipertansiyon', 'Tip 2 diabetes mellitus', 'Migren',
                   'Akut gastrit', 'Bel ağrısı', 'Demir eksikliği anemisi', 'Hipotiroidi', 'Alerjik rinit', 'İdrar yolu enfeksiyonu']
        hizmetler = ['Genel Muayene'] * 5 + ['Kontrol Muayenesi'] * 4 + ['Kan Tahlili'] * 2 + ['Enjeksiyon', 'Pansuman', 'EKG', 'Ultrason', 'Konsültasyon']
        eklenen = 0
        for gun_geri in range(185, 2, -1):
            d = bugun - timedelta(days=gun_geri)
            if d.weekday() == 6:
                continue
            for _ in range(rnd.choice([1, 2, 2, 3, 3, 4] if d.weekday() < 5 else [0, 1, 1])):
                saat = rnd.choice(SAAT_DILIMLERI[:6] * 2 + SAAT_DILIMLERI)
                if Randevu.query.filter_by(tarih=d, saat=saat).first():
                    continue
                h = rnd.choice(hastalar)
                islem = rnd.choice(hizmetler)
                durum = rnd.choices(['Tamamlandı', 'Gelmedi', 'İptal'], [82, 9, 9])[0]
                r = Randevu(hasta_id=h.id, tarih=d, saat=saat, islem_turu=islem, durum=durum, doktor_id=did,
                            olusturma_tarihi=datetime.combine(d, time(8)) - timedelta(days=3))
                db.session.add(r)
                db.session.flush()
                eklenen += 1
                if durum != 'Tamamlandı':
                    continue
                an = datetime.combine(d, datetime.strptime(saat, '%H:%M').time()) + timedelta(minutes=30)
                if islem in ('Genel Muayene', 'Kontrol Muayenesi', 'Konsültasyon'):
                    db.session.add(Muayene(hasta_id=h.id, randevu_id=r.id, doktor_id=did, tarih=an, tani=rnd.choice(tanilar),
                                           bulgular='Rutin değerlendirme.'))
                ucret = tarifeler.get(islem, 0)
                if ucret:
                    db.session.add(KasaHareketi(tur='ucret', tutar=ucret, hasta_id=h.id, randevu_id=r.id, kullanici_id=did, tarih=an,
                                                aciklama=f'{islem} · {kisa_tarih(d)} {saat}'))
                    if rnd.random() < 0.93:
                        db.session.add(KasaHareketi(tur='tahsilat', tutar=ucret, hasta_id=h.id, kullanici_id=did,
                                                    yontem=rnd.choices(YONTEMLER, [3, 6, 1])[0],
                                                    tarih=an + timedelta(minutes=3), aciklama='Ödeme'))
                for e in IslemMalzemesi.query.filter_by(islem_turu=islem).all():
                    db.session.add(StokHareketi(malzeme_id=e.malzeme_id, tur='otomatik', miktar=-e.miktar, onceki=0, sonraki=0,
                                                aciklama=f'{islem} · {h.ad_soyad}', kullanici_id=did, randevu_id=r.id, tarih=an))
        ayar_yaz('demo_gecmis', '1')
        db.session.commit()
        print(f'Raporlar için {eklenen} geçmiş randevu (6 ay) eklendi.')


if __name__ == '__main__':
    app.run(debug=True)
