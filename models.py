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

    # Hekim çalışma planı (yalnızca doktor rolü için anlamlı)
    brans = db.Column(db.String(60))
    oda = db.Column(db.String(40))
    renk = db.Column(db.String(9))
    calisma = db.Column(db.Text)            # JSON: {"0": ["09:00", "18:00"], ..., "6": null}
    online_gorunur = db.Column(db.Boolean, default=True)

    randevular = db.relationship('Randevu', backref='doktor', lazy=True)
    izinler = db.relationship('HekimIzin', backref='doktor', lazy=True, order_by='HekimIzin.bas.asc()',
                              cascade='all, delete-orphan')
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
    dosyalar = db.relationship(
        'HastaDosyasi', backref='hasta', lazy=True,
        order_by='[HastaDosyasi.tarih.desc(), HastaDosyasi.id.desc()]',
        cascade='all, delete-orphan'
    )
    lab_sonuclari = db.relationship(
        'LabSonuc', backref='hasta', lazy=True,
        order_by='[LabSonuc.tarih.asc(), LabSonuc.id.asc()]',
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
    def gelmeme_sayisi(self):
        return sum(1 for r in self.randevular if r.durum == 'Gelmedi')

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
    durum = db.Column(db.String(20), default='Bekliyor')  # Bekliyor / Onaylandı / Tamamlandı / Gelmedi / İptal
    notlar = db.Column(db.Text)
    olusturma_tarihi = db.Column(db.DateTime, default=datetime.utcnow)
    hatirlatma = db.Column(db.DateTime)  # hatırlatma mesajının gönderildiği an
    geldi = db.Column(db.DateTime)       # hasta kliniğe geldi (bekleme salonuna alındı)
    sira_no = db.Column(db.Integer)      # o günkü sıra numarası
    cagrildi = db.Column(db.DateTime)    # bekleme salonundan muayeneye çağrıldı
    cagri_sayisi = db.Column(db.Integer, default=0)

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
            'hatirlatildi': self.hatirlatma is not None,
            'hasta_gelmeme': self.hasta.gelmeme_sayisi if self.hasta else 0,
            'doktor_id': self.doktor_id,
            'doktor_ad': self.doktor.gorunen_ad if self.doktor else '',
            'doktor_renk': (self.doktor.renk if self.doktor else None) or '#A78BFA',
            'geldi': self.geldi.strftime('%H:%M') if self.geldi else None,
            'sira_no': self.sira_no,
            'cagrildi': self.cagrildi.strftime('%H:%M') if self.cagrildi else None,
        }


class Muayene(db.Model):
    """Bir hastanın tek bir muayenesinde hekimin girdiği klinik kayıt."""
    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now)
    tani = db.Column(db.String(150), nullable=False)
    bulgular = db.Column(db.Text)
    tedavi = db.Column(db.Text)
    kontrol_tarihi = db.Column(db.Date)
    kontrol_durum = db.Column(db.String(12))      # None · 'hatirlatildi' · 'kapandi'
    kontrol_hatirlatma = db.Column(db.DateTime)
    sablon_id = db.Column(db.Integer, nullable=True)  # kullanılan muayene şablonu (istatistik için)

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
    doktor_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)  # istenen hekim
    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=True)
    randevu_id = db.Column(db.Integer, db.ForeignKey('randevu.id'), nullable=True)
    isleyen = db.relationship('Doktor', foreign_keys=[isleyen_id], lazy=True)
    doktor = db.relationship('Doktor', foreign_keys=[doktor_id], lazy=True)
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


# ------------------------------------------------------------------
# Stok ve malzeme takibi
# ------------------------------------------------------------------
class Malzeme(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(100), nullable=False)
    kategori = db.Column(db.String(40), nullable=False, default='Sarf malzemesi')
    birim = db.Column(db.String(20), nullable=False, default='adet')
    miktar = db.Column(db.Float, nullable=False, default=0)
    kritik = db.Column(db.Float, nullable=False, default=0)       # bu seviyeye inince uyarı
    son_kullanma = db.Column(db.Date)
    birim_fiyat = db.Column(db.Integer)                            # kuruş, isteğe bağlı
    notlar = db.Column(db.String(300))
    aktif = db.Column(db.Boolean, nullable=False, default=True)
    olusturma = db.Column(db.DateTime, nullable=False, default=datetime.now)

    hareketler = db.relationship('StokHareketi', backref='malzeme', lazy=True,
                                 order_by='StokHareketi.tarih.desc()', cascade='all, delete-orphan')

    @property
    def durum(self):
        if self.miktar <= 0:
            return 'tukendi'
        if self.miktar <= self.kritik:
            return 'kritik'
        return 'normal'

    @property
    def skt_gun(self):
        return (self.son_kullanma - date.today()).days if self.son_kullanma else None

    def sozluk(self):
        return {
            'id': self.id, 'ad': self.ad, 'kategori': self.kategori, 'birim': self.birim,
            'miktar': round(self.miktar, 2), 'kritik': round(self.kritik, 2), 'durum': self.durum,
            'son_kullanma': self.son_kullanma.isoformat() if self.son_kullanma else None, 'skt_gun': self.skt_gun,
            'birim_fiyat': self.birim_fiyat, 'notlar': self.notlar or '', 'aktif': bool(self.aktif),
        }


class StokHareketi(db.Model):
    TURLER = {'giris': 'Giriş', 'cikis': 'Çıkış', 'sayim': 'Sayım', 'otomatik': 'Hizmette kullanıldı'}

    id = db.Column(db.Integer, primary_key=True)
    tarih = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    tur = db.Column(db.String(12), nullable=False)
    miktar = db.Column(db.Float, nullable=False)       # işaretli: + giriş, − çıkış
    onceki = db.Column(db.Float, nullable=False)
    sonraki = db.Column(db.Float, nullable=False)
    aciklama = db.Column(db.String(200))

    malzeme_id = db.Column(db.Integer, db.ForeignKey('malzeme.id'), nullable=False)
    kullanici_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    randevu_id = db.Column(db.Integer, db.ForeignKey('randevu.id'), nullable=True)
    kullanici = db.relationship('Doktor', lazy=True)
    randevu = db.relationship('Randevu', lazy=True)

    def sozluk(self):
        return {
            'id': self.id, 'tarih': self.tarih.isoformat(timespec='minutes'), 'tarih_metin': self.tarih.strftime('%d.%m.%Y %H:%M'),
            'tur': self.tur, 'tur_adi': self.TURLER.get(self.tur, self.tur), 'miktar': round(self.miktar, 2),
            'onceki': round(self.onceki, 2), 'sonraki': round(self.sonraki, 2), 'aciklama': self.aciklama or '',
            'malzeme_id': self.malzeme_id, 'malzeme': self.malzeme.ad if self.malzeme else '',
            'birim': self.malzeme.birim if self.malzeme else '',
            'kullanici': self.kullanici.gorunen_ad if self.kullanici else '',
            'hasta': self.randevu.hasta.ad_soyad if self.randevu and self.randevu.hasta else '',
        }


class IslemMalzemesi(db.Model):
    """Bir hizmet (randevu işlem türü) tamamlandığında stoktan otomatik düşülecek malzemeler."""
    __table_args__ = (db.UniqueConstraint('islem_turu', 'malzeme_id'),)
    id = db.Column(db.Integer, primary_key=True)
    islem_turu = db.Column(db.String(60), nullable=False, index=True)
    malzeme_id = db.Column(db.Integer, db.ForeignKey('malzeme.id'), nullable=False)
    miktar = db.Column(db.Float, nullable=False, default=1)
    malzeme = db.relationship('Malzeme', lazy=True)


# ------------------------------------------------------------------
# Hekim izinleri
# ------------------------------------------------------------------
class HekimIzin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doktor_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=False)
    bas = db.Column(db.Date, nullable=False)
    bit = db.Column(db.Date, nullable=False)
    aciklama = db.Column(db.String(120))

    def sozluk(self):
        return {'id': self.id, 'bas': self.bas.isoformat(), 'bit': self.bit.isoformat(), 'aciklama': self.aciklama or ''}


# ------------------------------------------------------------------
# Tahlil / görüntüleme dosyaları ve laboratuvar sonuçları
# ------------------------------------------------------------------
class HastaDosyasi(db.Model):
    TURLER = {'tahlil': 'Tahlil', 'goruntu': 'Görüntüleme', 'rapor': 'Rapor / epikriz', 'diger': 'Diğer'}

    id = db.Column(db.Integer, primary_key=True)
    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    tur = db.Column(db.String(12), nullable=False, default='tahlil')
    ad = db.Column(db.String(160), nullable=False)          # yüklenen dosyanın özgün adı
    dosya_adi = db.Column(db.String(80), nullable=False)    # diskteki rastgele ad
    mime = db.Column(db.String(60))
    boyut = db.Column(db.Integer, default=0)
    tarih = db.Column(db.Date, nullable=False)             # belgenin tarihi
    aciklama = db.Column(db.String(300))
    olusturma = db.Column(db.DateTime, default=datetime.now)
    yukleyen_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    yukleyen = db.relationship('Doktor', lazy=True)

    @property
    def gorsel_mi(self):
        return (self.mime or '').startswith('image/')

    def sozluk(self):
        return {'id': self.id, 'tur': self.tur, 'tur_adi': self.TURLER.get(self.tur, self.tur), 'ad': self.ad,
                'mime': self.mime, 'boyut': self.boyut, 'tarih': self.tarih.isoformat(), 'aciklama': self.aciklama or '',
                'gorsel': self.gorsel_mi, 'adres': f'/dosya/{self.id}',
                'yukleyen': self.yukleyen.gorunen_ad if self.yukleyen else '',
                'lab_sayisi': LabSonuc.query.filter_by(dosya_id=self.id).count()}


class LabSonuc(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    dosya_id = db.Column(db.Integer, db.ForeignKey('hasta_dosyasi.id'), nullable=True)
    tarih = db.Column(db.Date, nullable=False)
    test = db.Column(db.String(40), nullable=False)    # anahtar (hgb, tsh…) veya "ozel:<ad>"
    ad = db.Column(db.String(80), nullable=False)
    deger = db.Column(db.Float, nullable=False)
    birim = db.Column(db.String(20))
    ref_min = db.Column(db.Float)
    ref_max = db.Column(db.Float)
    notlar = db.Column(db.String(200))
    giren_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    giren = db.relationship('Doktor', lazy=True)

    @property
    def durum(self):
        if self.ref_min is not None and self.deger < self.ref_min:
            return 'dusuk'
        if self.ref_max is not None and self.deger > self.ref_max:
            return 'yuksek'
        return 'normal'

    def sozluk(self):
        return {'id': self.id, 'tarih': self.tarih.isoformat(), 'test': self.test, 'ad': self.ad, 'deger': self.deger,
                'birim': self.birim or '', 'ref_min': self.ref_min, 'ref_max': self.ref_max, 'durum': self.durum,
                'notlar': self.notlar or '', 'dosya_id': self.dosya_id,
                'giren': self.giren.gorunen_ad if self.giren else ''}


# ------------------------------------------------------------------
# Muayene şablonları (sık tanılar için hazır bulgu / tedavi / reçete)
# ------------------------------------------------------------------
class MuayeneSablonu(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(80), nullable=False)
    tani = db.Column(db.String(150), nullable=False)
    bulgular = db.Column(db.Text)
    tedavi = db.Column(db.Text)
    kontrol_gun = db.Column(db.Integer)               # muayeneden kaç gün sonra kontrol
    recete_notu = db.Column(db.String(300))
    kalemler = db.Column(db.Text)                     # JSON: [{ilac_adi, doz, kullanim, sure, adet}]
    kullanim = db.Column(db.Integer, default=0)
    son_kullanim = db.Column(db.DateTime)
    olusturma = db.Column(db.DateTime, default=datetime.now)
    olusturan_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    olusturan = db.relationship('Doktor', lazy=True)

    def kalem_listesi(self):
        import json
        try:
            v = json.loads(self.kalemler) if self.kalemler else []
        except ValueError:
            v = []
        return v if isinstance(v, list) else []

    def sozluk(self):
        return {'id': self.id, 'ad': self.ad, 'tani': self.tani, 'bulgular': self.bulgular or '', 'tedavi': self.tedavi or '',
                'kontrol_gun': self.kontrol_gun, 'recete_notu': self.recete_notu or '', 'kalemler': self.kalem_listesi(),
                'kullanim': self.kullanim or 0, 'olusturan': self.olusturan.gorunen_ad if self.olusturan else ''}


# ------------------------------------------------------------------
# Hasta portalı: tek kullanımlık giriş kodları ve kod istekleri
# ------------------------------------------------------------------
class PortalKodu(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    kod_ozeti = db.Column(db.String(64), nullable=False)    # SHA-256 (kodun kendisi saklanmaz)
    olusturma = db.Column(db.DateTime, default=datetime.now)
    son_kullanma = db.Column(db.DateTime, nullable=False)
    deneme = db.Column(db.Integer, default=0)
    kullanildi = db.Column(db.DateTime)
    olusturan_id = db.Column(db.Integer, db.ForeignKey('doktor.id'), nullable=True)
    hasta = db.relationship('Hasta', lazy=True, backref=db.backref('portal_kodlari', cascade='all, delete-orphan'))


class PortalIstegi(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hasta_id = db.Column(db.Integer, db.ForeignKey('hasta.id'), nullable=False)
    olusturma = db.Column(db.DateTime, default=datetime.now)
    durum = db.Column(db.String(12), default='Bekliyor')    # Bekliyor · Gönderildi · Kapandı
    ip = db.Column(db.String(45))
    hasta = db.relationship('Hasta', lazy=True, backref=db.backref('portal_istekleri', cascade='all, delete-orphan'))
