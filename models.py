from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

ROLLER = {'doktor': 'Doktor', 'sekreter': 'Sekreter'}


class Doktor(db.Model):
    """Sisteme giriş yapan kullanıcı (doktor veya sekreter)."""
    id = db.Column(db.Integer, primary_key=True)
    ad_soyad = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    rol = db.Column(db.String(20), nullable=False, default='doktor')  # doktor / sekreter
    kayit_tarihi = db.Column(db.DateTime, default=datetime.utcnow)
    son_giris = db.Column(db.DateTime)

    randevular = db.relationship('Randevu', backref='doktor', lazy=True)
    muayeneler = db.relationship('Muayene', backref='doktor', lazy=True)

    def sifre_belirle(self, sifre):
        self.password_hash = generate_password_hash(sifre)

    def sifre_dogru_mu(self, sifre):
        return check_password_hash(self.password_hash, sifre)

    @property
    def doktor_mu(self):
        return self.rol == 'doktor'

    @property
    def rol_adi(self):
        return ROLLER.get(self.rol, self.rol)

    @property
    def gorunen_ad(self):
        return ('Dr. ' + self.ad_soyad) if self.doktor_mu else self.ad_soyad

    @property
    def bas_harfler(self):
        parcalar = (self.ad_soyad or '').split()
        if not parcalar:
            return '?'
        if len(parcalar) == 1:
            return parcalar[0][:2].upper()
        return (parcalar[0][0] + parcalar[-1][0]).upper()


class Hasta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tc_kimlik = db.Column(db.String(11))
    ad_soyad = db.Column(db.String(100), nullable=False)
    telefon = db.Column(db.String(20), nullable=False)
    dogum_tarihi = db.Column(db.String(20))
    cinsiyet = db.Column(db.String(10))
    kan_grubu = db.Column(db.String(10))

    # Tıbbi Geçmiş (EHR)
    hastalik_tanisi = db.Column(db.String(100))
    kronik_hastaliklar = db.Column(db.Text)
    gecmis_ameliyatlar = db.Column(db.Text)
    alerji_durumu = db.Column(db.Text)
    sikayet = db.Column(db.Text)

    kayit_tarihi = db.Column(db.DateTime, default=datetime.utcnow)

    # KVKK açık rıza
    kvkk_onay = db.Column(db.Boolean, default=False, nullable=False)
    kvkk_onay_tarihi = db.Column(db.DateTime)

    receteler = db.relationship(
        'Recete', backref='hasta', lazy=True,
        order_by='Recete.tarih.desc()',
        cascade='all, delete-orphan'
    )
    vitaller = db.relationship(
        'Vital', backref='hasta', lazy=True,
        order_by='Vital.tarih.asc()',
        cascade='all, delete-orphan'
    )
    randevular = db.relationship(
        'Randevu', backref='hasta', lazy=True,
        order_by='[Randevu.tarih.desc(), Randevu.saat.desc()]',
        cascade='all, delete-orphan'
    )
    muayeneler = db.relationship(
        'Muayene', backref='hasta', lazy=True,
        order_by='Muayene.tarih.desc()',
        cascade='all, delete-orphan'
    )
    kasa_hareketleri = db.relationship(
        'KasaHareketi', backref='hasta', lazy=True,
        order_by='KasaHareketi.tarih.desc()',
        cascade='all, delete-orphan'
    )
    isaretler = db.relationship(
        'VucutIsareti', backref='hasta', lazy=True,
        order_by='VucutIsareti.tarih.desc()',
        cascade='all, delete-orphan'
    )

    DUZENLENEBILIR = ('tc_kimlik', 'ad_soyad', 'telefon', 'dogum_tarihi', 'cinsiyet', 'kan_grubu',
                      'hastalik_tanisi', 'kronik_hastaliklar', 'gecmis_ameliyatlar', 'alerji_durumu', 'sikayet')

    # --- Arayüz yardımcıları ---
    @property
    def yas(self):
        if not self.dogum_tarihi:
            return None
        try:
            d = datetime.strptime(self.dogum_tarihi, '%Y-%m-%d').date()
        except ValueError:
            return None
        bugun = date.today()
        return bugun.year - d.year - ((bugun.month, bugun.day) < (d.month, d.day))

    @property
    def bas_harfler(self):
        parcalar = (self.ad_soyad or '').split()
        if not parcalar:
            return '?'
        if len(parcalar) == 1:
            return parcalar[0][:2].upper()
        return (parcalar[0][0] + parcalar[-1][0]).upper()

    @property
    def maskeli_tc(self):
        tc = self.tc_kimlik or ''
        if len(tc) < 5:
            return tc or '—'
        return tc[:3] + '•' * (len(tc) - 5) + tc[-2:]

    @property
    def alerjisi_var(self):
        a = (self.alerji_durumu or '').strip().lower()
        return bool(a) and a not in ('yok', '-', 'bilinmiyor')

    @property
    def bakiye(self):
        """Kuruş cinsinden açık bakiye: pozitif = hastanın borcu, negatif = hasta alacaklı."""
        return sum(h.bakiye_etkisi for h in self.kasa_hareketleri if not h.iptal)

    @property
    def kronik_liste(self):
        return [k.strip() for k in (self.kronik_hastaliklar or '').replace('\n', ',').split(',') if k.strip()]

    @property
    def ameliyat_liste(self):
        return [k.strip() for k in (self.gecmis_ameliyatlar or '').replace('\n', ',').split(',') if k.strip()]

    def sozluk(self, tam=False):
        veri = {
            'id': self.id,
            'ad_soyad': self.ad_soyad,
            'tc': self.maskeli_tc,
            'telefon': self.telefon,
        }
        if tam:
            for alan in self.DUZENLENEBILIR:
                veri[alan] = getattr(self, alan) or ''
            veri['kvkk_onay'] = bool(self.kvkk_onay)
        return veri


class Randevu(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.Date, nullable=False)
    saat = db.Column(db.String(5), nullable=False)  # "HH:MM"
    islem_turu = db.Column(db.String(60), default='Genel Muayene')
    durum = db.Column(db.String(20), default='Bekliyor')  # Bekliyor / Onaylandı / Tamamlandı / İptal
    notlar = db.Column(db.Text)
    olusturma_tarihi = db.Column(db.DateTime, default=datetime.utcnow)

    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    doktor_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)

    muayene = db.relationship('Muayene', backref='randevu', uselist=False, lazy=True)

    def sozluk(self):
        return {
            'id': self.id,
            'tarih': self.tarih.isoformat(),
            'saat': self.saat,
            'islem_turu': self.islem_turu,
            'durum': self.durum,
            'notlar': self.notlar or '',
            'hasta_id': self.hasta_id,
            'hasta_ad': self.hasta.ad_soyad if self.hasta else '',
            'muayene_var': self.muayene is not None,
        }


class Muayene(db.Model):
    """Bir hastanın tek bir muayenesinde hekimin girdiği klinik kayıt."""
    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now)
    tani = db.Column(db.String(150), nullable=False)
    bulgular = db.Column(db.Text)
    tedavi = db.Column(db.Text)
    kontrol_tarihi = db.Column(db.Date)

    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    randevu_id = db.Column(db.Integer, db.ForeignKey('randevu.id'), nullable=True, unique=True)
    doktor_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)

    receteler = db.relationship('Recete', backref='muayene', lazy=True)
    vital = db.relationship('Vital', backref='muayene', uselist=False, lazy=True)
    isaretler = db.relationship('VucutIsareti', backref='muayene', lazy=True)


class Recete(db.Model):
    """Hekimin yazdığı reçete; bir muayeneye bağlı olabilir."""
    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now)
    tani = db.Column(db.String(150))
    notlar = db.Column(db.Text)
    # Hekim bir uyarıyı bilerek geçtiyse gerekçesi saklanır
    uyari_gerekcesi = db.Column(db.Text)
    uyari_ozeti = db.Column(db.Text)

    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    muayene_id = db.Column(db.Integer, db.ForeignKey('muayene.id'), nullable=True)
    doktor_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    doktor = db.relationship('Doktor', lazy=True)

    kalemler = db.relationship('ReceteKalemi', backref='recete', lazy=True,
                               order_by='ReceteKalemi.sira.asc()', cascade='all, delete-orphan')

    @property
    def recete_no(self):
        return f'R-{self.tarih.strftime("%Y%m%d")}-{self.id:04d}'


class ReceteKalemi(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    recete_id = db.Column(db.Integer, db.ForeignKey('recete.id'), nullable=False)
    sira = db.Column(db.Integer, default=0)
    ilac_adi = db.Column(db.String(120), nullable=False)
    etken_madde = db.Column(db.String(120))
    doz = db.Column(db.String(60))          # Örn. 500 mg
    kullanim = db.Column(db.String(120))    # Örn. Günde 2 kez, tok karnına
    sure = db.Column(db.String(40))         # Örn. 7 gün
    adet = db.Column(db.Integer, default=1)  # Kutu


class Vital(db.Model):
    """Tansiyon, nabız, ateş, şeker, kilo vb. ölçümler."""
    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now)
    sistolik = db.Column(db.Integer)
    diastolik = db.Column(db.Integer)
    nabiz = db.Column(db.Integer)
    ates = db.Column(db.Float)
    seker = db.Column(db.Integer)       # mg/dL
    seker_tok = db.Column(db.Boolean, default=False)
    spo2 = db.Column(db.Integer)        # %
    kilo = db.Column(db.Float)          # kg
    boy = db.Column(db.Integer)         # cm

    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    muayene_id = db.Column(db.Integer, db.ForeignKey('muayene.id'), nullable=True)
    olcen_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    olcen = db.relationship('Doktor', lazy=True)

    @property
    def vki(self):
        if self.kilo and self.boy:
            return round(self.kilo / ((self.boy / 100) ** 2), 1)
        return None

    def sozluk(self):
        return {
            'id': self.id,
            'tarih': self.tarih.isoformat(timespec='minutes'),
            'sistolik': self.sistolik, 'diastolik': self.diastolik, 'nabiz': self.nabiz,
            'ates': self.ates, 'seker': self.seker, 'seker_tok': bool(self.seker_tok),
            'spo2': self.spo2, 'kilo': self.kilo, 'boy': self.boy, 'vki': self.vki,
            'olcen': self.olcen.gorunen_ad if self.olcen else '',
        }


class IslemKaydi(db.Model):
    """KVKK işlem günlüğü: kim, ne zaman, hangi kayıt üzerinde ne yaptı."""
    id = db.Column(db.Integer, primary_key=True)
    zaman = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    kullanici_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    kullanici_adi = db.Column(db.String(120))   # kullanıcı silinse de iz kalsın
    islem = db.Column(db.String(30), nullable=False, index=True)
    hedef_tur = db.Column(db.String(30))
    hedef_id = db.Column(db.Integer)
    aciklama = db.Column(db.String(300))
    ip = db.Column(db.String(45))

    kullanici = db.relationship('Doktor', lazy=True)


class Ayar(db.Model):
    """Klinik geneli ayarlar (anahtar / değer)."""
    anahtar = db.Column(db.String(60), primary_key=True)
    deger = db.Column(db.Text)


# ------------------------------------------------------------------
# Online randevu talepleri
# ------------------------------------------------------------------
class OnlineTalep(db.Model):
    """Hastanın girişsiz online randevu sayfasından gönderdiği talep."""
    id = db.Column(db.Integer, primary_key=True)
    kod = db.Column(db.String(12), unique=True, nullable=False, index=True)  # takip kodu
    olusturma = db.Column(db.DateTime, nullable=False, default=datetime.now)
    ad_soyad = db.Column(db.String(100), nullable=False)
    telefon = db.Column(db.String(20), nullable=False)
    tc_kimlik = db.Column(db.String(11))
    tarih = db.Column(db.Date, nullable=False)
    saat = db.Column(db.String(5), nullable=False)
    islem_turu = db.Column(db.String(60), nullable=False)
    notlar = db.Column(db.Text)
    kvkk_onay = db.Column(db.Boolean, default=False, nullable=False)
    durum = db.Column(db.String(20), nullable=False, default='Bekliyor')  # Bekliyor / Onaylandı / Reddedildi / İptal
    yanit_notu = db.Column(db.Text)
    islem_zamani = db.Column(db.DateTime)
    ip = db.Column(db.String(45))

    isleyen_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=True)
    randevu_id = db.Column(db.Integer, db.ForeignKey('randevu.id'), nullable=True)
    isleyen = db.relationship('Doktor', lazy=True)
    hasta = db.relationship('Hasta', lazy=True)
    randevu = db.relationship('Randevu', lazy=True)


# ------------------------------------------------------------------
# Tahsilat ve kasa (tutarlar kuruş cinsinden tamsayı)
# ------------------------------------------------------------------
class Tarife(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    islem_turu = db.Column(db.String(60), unique=True, nullable=False)
    ucret = db.Column(db.Integer, nullable=False, default=0)


class KasaHareketi(db.Model):
    """Hasta hesabındaki her hareket. Kayıtlar silinmez; gerekirse gerekçeyle iptal edilir."""
    TURLER = {'ucret': 'Hizmet ücreti', 'tahsilat': 'Tahsilat', 'indirim': 'İndirim', 'iade': 'İade'}
    # Hareketin hasta bakiyesine etkisi (+ borç artırır, − azaltır)
    ETKI = {'ucret': 1, 'tahsilat': -1, 'indirim': -1, 'iade': 1}

    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    tur = db.Column(db.String(12), nullable=False)
    tutar = db.Column(db.Integer, nullable=False)          # kuruş, her zaman pozitif
    yontem = db.Column(db.String(12))                       # Nakit / Kart / Havale (tahsilat ve iadede)
    aciklama = db.Column(db.String(200))
    iptal = db.Column(db.Boolean, default=False, nullable=False)
    iptal_nedeni = db.Column(db.String(200))
    iptal_zamani = db.Column(db.DateTime)

    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    randevu_id = db.Column(db.Integer, db.ForeignKey('randevu.id'), nullable=True)
    kullanici_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    iptal_eden_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    kullanici = db.relationship('Doktor', foreign_keys=[kullanici_id], lazy=True)
    iptal_eden = db.relationship('Doktor', foreign_keys=[iptal_eden_id], lazy=True)
    randevu = db.relationship('Randevu', lazy=True)

    @property
    def bakiye_etkisi(self):
        return self.ETKI.get(self.tur, 0) * self.tutar

    @property
    def tur_adi(self):
        return self.TURLER.get(self.tur, self.tur)

    @property
    def belge_no(self):
        on_ek = {'tahsilat': 'M', 'iade': 'I'}.get(self.tur, 'H')
        return f'{on_ek}-{self.tarih.strftime("%Y%m%d")}-{self.id:04d}'


# ------------------------------------------------------------------
# 3D vücut haritası işaretleri
# ------------------------------------------------------------------
class VucutIsareti(db.Model):
    TURLER = {'agri': 'Ağrı', 'yara': 'Yara / kesi', 'dokuntu': 'Döküntü / kaşıntı', 'sislik': 'Şişlik / ödem',
              'kitle': 'Kitle / ele gelen', 'morluk': 'Morluk / travma', 'diger': 'Diğer'}

    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now)
    bolge = db.Column(db.String(40), nullable=False)       # makine anahtarı, ör. karin_sag_alt_on
    bolge_adi = db.Column(db.String(60), nullable=False)   # ör. Sağ alt karın
    x = db.Column(db.Float, nullable=False)
    y = db.Column(db.Float, nullable=False)
    z = db.Column(db.Float, nullable=False)
    nx = db.Column(db.Float, default=0)
    ny = db.Column(db.Float, default=0)
    nz = db.Column(db.Float, default=1)
    tur = db.Column(db.String(12), nullable=False, default='agri')
    siddet = db.Column(db.Integer)                          # 0–10
    notlar = db.Column(db.Text)
    aktif = db.Column(db.Boolean, default=True, nullable=False)
    iyilesme_tarihi = db.Column(db.DateTime)

    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    muayene_id = db.Column(db.Integer, db.ForeignKey('muayene.id'), nullable=True)
    doktor_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    doktor = db.relationship('Doktor', lazy=True)

    @property
    def tur_adi(self):
        return self.TURLER.get(self.tur, self.tur)

    def sozluk(self):
        return {
            'id': self.id, 'tarih': self.tarih.isoformat(timespec='minutes'),
            'bolge': self.bolge, 'bolge_adi': self.bolge_adi,
            'x': self.x, 'y': self.y, 'z': self.z, 'nx': self.nx or 0, 'ny': self.ny or 0, 'nz': self.nz if self.nz is not None else 1,
            'tur': self.tur, 'tur_adi': self.tur_adi, 'siddet': self.siddet, 'notlar': self.notlar or '',
            'aktif': bool(self.aktif), 'iyilesme_tarihi': self.iyilesme_tarihi.isoformat(timespec='minutes') if self.iyilesme_tarihi else None,
            'muayene_id': self.muayene_id, 'muayene_tani': self.muayene.tani if self.muayene else None,
            'doktor': self.doktor.gorunen_ad if self.doktor else '',
        }
