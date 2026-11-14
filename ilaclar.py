"""
Klinik SaaS — İlaç listesi ve reçete güvenlik motoru

Reçeteye eklenen ilaçları şunlara karşı kontrol eder:
  1. Hastanın alerjileri (çapraz reaksiyonlar dahil)
  2. Aynı reçetedeki ilaçlar arasındaki önemli etkileşimler
  3. Hastanın kronik hastalıkları / tanısı (ilaç–hastalık uyarıları)
  4. Aynı etken maddenin veya aynı grubun tekrar yazılması

Bu bir klinik karar DESTEK aracıdır; hekimin değerlendirmesinin yerine geçmez.
Liste, birinci basamakta sık kullanılan etken maddelerle sınırlıdır.
"""

UYARI_NOTU = ('Bu kontroller klinik karar desteği amaçlıdır ve hekimin değerlendirmesinin yerine geçmez. '
              'Liste sık kullanılan etken maddelerle sınırlıdır; tüm etkileşimleri kapsamaz.')

# ad, etken madde, gruplar, varsayılan doz, varsayılan kullanım
ILACLAR = [
    # Antibiyotikler
    ('Amoksisilin 500 mg kapsül', 'amoksisilin', ['penisilin', 'antibiyotik'], '500 mg', 'Günde 3 kez'),
    ('Amoksisilin + Klavulanik asit 1000 mg tablet', 'amoksisilin klavulanat', ['penisilin', 'antibiyotik'], '1000 mg', 'Günde 2 kez, tok karnına'),
    ('Ampisilin + Sulbaktam 375 mg tablet', 'ampisilin sulbaktam', ['penisilin', 'antibiyotik'], '375 mg', 'Günde 2 kez'),
    ('Fenoksimetilpenisilin 1.000.000 IU tablet', 'penisilin v', ['penisilin', 'antibiyotik'], '1.000.000 IU', 'Günde 3 kez'),
    ('Sefuroksim aksetil 500 mg tablet', 'sefuroksim', ['sefalosporin', 'antibiyotik'], '500 mg', 'Günde 2 kez, tok karnına'),
    ('Sefiksim 400 mg tablet', 'sefiksim', ['sefalosporin', 'antibiyotik'], '400 mg', 'Günde 1 kez'),
    ('Sefaleksin 500 mg kapsül', 'sefaleksin', ['sefalosporin', 'antibiyotik'], '500 mg', 'Günde 4 kez'),
    ('Azitromisin 500 mg tablet', 'azitromisin', ['makrolid', 'antibiyotik'], '500 mg', 'Günde 1 kez'),
    ('Klaritromisin 500 mg tablet', 'klaritromisin', ['makrolid', 'antibiyotik', 'cyp3a4_inhibitor'], '500 mg', 'Günde 2 kez'),
    ('Siprofloksasin 500 mg tablet', 'siprofloksasin', ['florokinolon', 'antibiyotik'], '500 mg', 'Günde 2 kez'),
    ('Levofloksasin 500 mg tablet', 'levofloksasin', ['florokinolon', 'antibiyotik'], '500 mg', 'Günde 1 kez'),
    ('Trimetoprim + Sülfametoksazol 160/800 mg tablet', 'trimetoprim sulfametoksazol', ['sulfonamid', 'antibiyotik'], '160/800 mg', 'Günde 2 kez'),
    ('Doksisiklin 100 mg kapsül', 'doksisiklin', ['tetrasiklin', 'antibiyotik'], '100 mg', 'Günde 2 kez, bol su ile'),
    ('Metronidazol 500 mg tablet', 'metronidazol', ['nitroimidazol', 'antibiyotik'], '500 mg', 'Günde 3 kez; alkol alınmamalı'),
    ('Nitrofurantoin 100 mg kapsül', 'nitrofurantoin', ['antibiyotik'], '100 mg', 'Günde 2 kez, tok karnına'),
    # Ağrı kesici / ateş düşürücü
    ('Parasetamol 500 mg tablet', 'parasetamol', ['parasetamol'], '500 mg', 'Gerektiğinde, günde en fazla 4 kez'),
    ('İbuprofen 400 mg tablet', 'ibuprofen', ['nsaid'], '400 mg', 'Günde 3 kez, tok karnına'),
    ('Naproksen sodyum 550 mg tablet', 'naproksen', ['nsaid'], '550 mg', 'Günde 2 kez, tok karnına'),
    ('Diklofenak sodyum 75 mg tablet', 'diklofenak', ['nsaid'], '75 mg', 'Günde 2 kez, tok karnına'),
    ('Deksketoprofen 25 mg tablet', 'deksketoprofen', ['nsaid'], '25 mg', 'Günde 3 kez, tok karnına'),
    ('Asetilsalisilik asit 100 mg tablet', 'asetilsalisilik asit', ['aspirin', 'antiplatelet'], '100 mg', 'Günde 1 kez, tok karnına'),
    ('Tramadol 50 mg kapsül', 'tramadol', ['opioid', 'serotonerjik'], '50 mg', 'Gerektiğinde, günde en fazla 4 kez'),
    ('Sumatriptan 50 mg tablet', 'sumatriptan', ['triptan', 'serotonerjik'], '50 mg', 'Migren atağında'),
    ('Gabapentin 300 mg kapsül', 'gabapentin', ['antiepileptik'], '300 mg', 'Günde 3 kez'),
    ('Kolşisin 0,5 mg tablet', 'kolsisin', ['kolsisin'], '0,5 mg', 'Günde 2 kez'),
    ('Allopurinol 300 mg tablet', 'allopurinol', ['urik_asit'], '300 mg', 'Günde 1 kez, tok karnına'),
    # Kardiyovasküler
    ('Ramipril 5 mg tablet', 'ramipril', ['ace'], '5 mg', 'Günde 1 kez'),
    ('Enalapril 10 mg tablet', 'enalapril', ['ace'], '10 mg', 'Günde 1 kez'),
    ('Losartan 50 mg tablet', 'losartan', ['arb'], '50 mg', 'Günde 1 kez'),
    ('Valsartan 160 mg tablet', 'valsartan', ['arb'], '160 mg', 'Günde 1 kez'),
    ('Amlodipin 5 mg tablet', 'amlodipin', ['kkb'], '5 mg', 'Günde 1 kez'),
    ('Metoprolol süksinat 50 mg tablet', 'metoprolol', ['beta_bloker', 'beta_selektif'], '50 mg', 'Günde 1 kez'),
    ('Propranolol 40 mg tablet', 'propranolol', ['beta_bloker', 'beta_nonselektif'], '40 mg', 'Günde 2 kez'),
    ('Hidroklorotiyazid 12,5 mg tablet', 'hidroklorotiyazid', ['tiazid', 'diuretik'], '12,5 mg', 'Günde 1 kez, sabah'),
    ('Furosemid 40 mg tablet', 'furosemid', ['loop', 'diuretik'], '40 mg', 'Günde 1 kez, sabah'),
    ('Spironolakton 25 mg tablet', 'spironolakton', ['potasyum_tutucu', 'diuretik'], '25 mg', 'Günde 1 kez'),
    ('Atorvastatin 20 mg tablet', 'atorvastatin', ['statin'], '20 mg', 'Günde 1 kez, akşam'),
    ('Simvastatin 20 mg tablet', 'simvastatin', ['statin', 'statin_cyp3a4'], '20 mg', 'Günde 1 kez, akşam'),
    ('Varfarin 5 mg tablet', 'varfarin', ['antikoagulan'], '5 mg', 'INR değerine göre'),
    ('Klopidogrel 75 mg tablet', 'klopidogrel', ['antiplatelet', 'klopidogrel'], '75 mg', 'Günde 1 kez'),
    ('Digoksin 0,25 mg tablet', 'digoksin', ['digoksin'], '0,25 mg', 'Günde 1 kez'),
    # Endokrin
    ('Metformin 1000 mg tablet', 'metformin', ['metformin', 'antidiyabetik'], '1000 mg', 'Günde 2 kez, yemekle'),
    ('Gliklazid 60 mg tablet', 'gliklazid', ['sulfonilure', 'antidiyabetik'], '60 mg', 'Günde 1 kez, kahvaltıyla'),
    ('Levotiroksin 50 mcg tablet', 'levotiroksin', ['tiroid'], '50 mcg', 'Sabah aç karnına, kahvaltıdan 30 dk önce'),
    ('Prednizolon 5 mg tablet', 'prednizolon', ['kortikosteroid'], '5 mg', 'Sabah, tok karnına'),
    ('Metilprednizolon 16 mg tablet', 'metilprednizolon', ['kortikosteroid'], '16 mg', 'Sabah, tok karnına'),
    # Sindirim
    ('Omeprazol 20 mg kapsül', 'omeprazol', ['ppi', 'omeprazol'], '20 mg', 'Sabah aç karnına'),
    ('Pantoprazol 40 mg tablet', 'pantoprazol', ['ppi'], '40 mg', 'Sabah aç karnına'),
    ('Metoklopramid 10 mg tablet', 'metoklopramid', ['antiemetik'], '10 mg', 'Yemeklerden önce, günde en fazla 3 kez'),
    # Psikiyatri / nöroloji
    ('Sertralin 50 mg tablet', 'sertralin', ['ssri', 'serotonerjik'], '50 mg', 'Günde 1 kez'),
    ('Essitalopram 10 mg tablet', 'essitalopram', ['ssri', 'serotonerjik'], '10 mg', 'Günde 1 kez'),
    ('Alprazolam 0,5 mg tablet', 'alprazolam', ['benzodiazepin'], '0,5 mg', 'Gerektiğinde'),
    # Solunum / alerji
    ('Salbutamol 100 mcg inhaler', 'salbutamol', ['bronkodilator'], '100 mcg', 'Gerektiğinde 1-2 puf'),
    ('Montelukast 10 mg tablet', 'montelukast', ['lokotrien'], '10 mg', 'Günde 1 kez, akşam'),
    ('Setirizin 10 mg tablet', 'setirizin', ['antihistaminik'], '10 mg', 'Günde 1 kez, akşam'),
    ('Desloratadin 5 mg tablet', 'desloratadin', ['antihistaminik'], '5 mg', 'Günde 1 kez'),
    # Takviyeler
    ('Ferröz sülfat 80 mg tablet', 'demir', ['demir'], '80 mg', 'Günde 1 kez, aç karnına'),
    ('Kalsiyum karbonat + D3 vitamini tablet', 'kalsiyum', ['kalsiyum'], '1000 mg / 880 IU', 'Günde 1 kez'),
    ('D3 vitamini 50.000 IU kapsül', 'kolekalsiferol', ['vitamin_d'], '50.000 IU', 'Haftada 1 kez'),
]

TR_HARF = str.maketrans('çğıöşüâîû', 'cgiosuaiu')


def norm(metin):
    """Türkçe karakterleri sadeleştirip küçük harfe çevirir (eşleştirme için)."""
    m = (metin or '').replace('İ', 'i').replace('I', 'ı').lower()
    return m.translate(TR_HARF)


def ilac_bul(ad):
    """Reçete satırındaki ilaç adını listeyle eşleştirir; bulunamazsa None."""
    n = norm(ad)
    for kayit in ILACLAR:
        if norm(kayit[0]) == n:
            return kayit
    for kayit in ILACLAR:
        if norm(kayit[1]) and norm(kayit[1]) in n:
            return kayit
    return None


def ilac_listesi():
    return [{'ad': a, 'etken': e, 'gruplar': g, 'doz': d, 'kullanim': k} for a, e, g, d, k in ILACLAR]


# --- 1) Alerji kuralları: hastanın alerji metnindeki anahtar kelime -> etkilenen gruplar ---
ALERJI_KURALLARI = [
    (['penisilin', 'amoksisilin', 'ampisilin'], [
        ('penisilin', 'yuksek', 'Hastanın penisilin grubu alerjisi var.'),
        ('sefalosporin', 'orta', 'Penisilin alerjisinde sefalosporinlerle çapraz reaksiyon olasılığı düşük ama mevcuttur; ağır reaksiyon öyküsü varsa kaçınılmalı.'),
    ]),
    (['sefalosporin', 'sefuroksim', 'seftriakson', 'sefaleksin', 'sefiksim', 'sefazolin'], [
        ('sefalosporin', 'yuksek', 'Hastanın sefalosporin alerjisi var.'),
        ('penisilin', 'orta', 'Sefalosporin alerjisinde penisilinlerle çapraz reaksiyon olabilir.'),
    ]),
    (['aspirin', 'asetilsalisilik'], [
        ('aspirin', 'yuksek', 'Hastanın aspirin alerjisi var.'),
        ('nsaid', 'orta', 'Aspirin duyarlılığında diğer NSAİİ’lerle çapraz reaksiyon sık görülür.'),
    ]),
    (['ibuprofen', 'nsaid', 'nsaii', 'diklofenak', 'naproksen', 'ketoprofen', 'deksketoprofen'], [
        ('nsaid', 'yuksek', 'Hastanın NSAİİ grubu alerjisi var.'),
        ('aspirin', 'orta', 'NSAİİ duyarlılığında aspirinle çapraz reaksiyon olabilir.'),
    ]),
    (['sulfonamid', 'sulfa'], [('sulfonamid', 'yuksek', 'Hastanın sülfonamid alerjisi var.')]),
    (['makrolid', 'eritromisin', 'klaritromisin', 'azitromisin'], [('makrolid', 'yuksek', 'Hastanın makrolid grubu alerjisi var.')]),
    (['kinolon', 'siprofloksasin', 'levofloksasin', 'moksifloksasin'], [('florokinolon', 'yuksek', 'Hastanın florokinolon alerjisi var.')]),
    (['tetrasiklin', 'doksisiklin'], [('tetrasiklin', 'yuksek', 'Hastanın tetrasiklin grubu alerjisi var.')]),
    (['parasetamol', 'asetaminofen'], [('parasetamol', 'yuksek', 'Hastanın parasetamol alerjisi var.')]),
    (['metronidazol'], [('nitroimidazol', 'yuksek', 'Hastanın metronidazol alerjisi var.')]),
    (['opioid', 'tramadol', 'morfin', 'kodein'], [('opioid', 'yuksek', 'Hastanın opioid alerjisi/intoleransı var.')]),
]

# --- 2) İlaç–ilaç etkileşimleri: (grup/etken A, grup/etken B, seviye, mesaj) ---
ETKILESIMLER = [
    ('antikoagulan', 'nsaid', 'yuksek', 'Varfarin + NSAİİ: ciddi kanama riski artar.'),
    ('antikoagulan', 'aspirin', 'yuksek', 'Varfarin + aspirin: kanama riski belirgin artar.'),
    ('antikoagulan', 'antiplatelet', 'yuksek', 'Varfarin + antiplatelet: kanama riski artar; endikasyon dikkatle değerlendirilmeli.'),
    ('antikoagulan', 'makrolid', 'orta', 'Varfarin + makrolid: INR yükselebilir, yakın INR takibi önerilir.'),
    ('antikoagulan', 'florokinolon', 'orta', 'Varfarin + florokinolon: INR yükselebilir, yakın INR takibi önerilir.'),
    ('antikoagulan', 'sulfonamid', 'yuksek', 'Varfarin + trimetoprim-sülfametoksazol: INR belirgin yükselir.'),
    ('antikoagulan', 'nitroimidazol', 'yuksek', 'Varfarin + metronidazol: INR belirgin yükselir.'),
    ('klopidogrel', 'omeprazol', 'orta', 'Klopidogrel + omeprazol: klopidogrelin etkinliği azalabilir; pantoprazol tercih edilebilir.'),
    ('cyp3a4_inhibitor', 'statin_cyp3a4', 'yuksek', 'Klaritromisin + simvastatin: rabdomiyoliz riski; birlikte kullanım önerilmez.'),
    ('cyp3a4_inhibitor', 'atorvastatin', 'orta', 'Klaritromisin + atorvastatin: miyopati riski artar; statine ara verilmesi düşünülebilir.'),
    ('cyp3a4_inhibitor', 'kolsisin', 'yuksek', 'Klaritromisin + kolşisin: kolşisin toksisitesi riski.'),
    ('cyp3a4_inhibitor', 'digoksin', 'orta', 'Klaritromisin + digoksin: digoksin düzeyi yükselebilir.'),
    ('ssri', 'tramadol', 'yuksek', 'SSRI + tramadol: serotonin sendromu ve nöbet riski.'),
    ('ssri', 'triptan', 'orta', 'SSRI + triptan: serotonin sendromu açısından dikkat.'),
    ('ssri', 'nsaid', 'orta', 'SSRI + NSAİİ: gastrointestinal kanama riski artar.'),
    ('ssri', 'aspirin', 'orta', 'SSRI + aspirin: kanama riski artar.'),
    ('ssri', 'antikoagulan', 'orta', 'SSRI + varfarin: kanama riski artar.'),
    ('ace', 'potasyum_tutucu', 'yuksek', 'ACE inhibitörü + spironolakton: hiperkalemi riski; potasyum takibi gerekir.'),
    ('arb', 'potasyum_tutucu', 'yuksek', 'ARB + spironolakton: hiperkalemi riski; potasyum takibi gerekir.'),
    ('ace', 'arb', 'yuksek', 'ACE inhibitörü + ARB: çift RAAS blokajı önerilmez (hiperkalemi, böbrek hasarı).'),
    ('ace', 'nsaid', 'orta', 'ACE inhibitörü + NSAİİ: antihipertansif etki azalır, böbrek fonksiyonu bozulabilir.'),
    ('arb', 'nsaid', 'orta', 'ARB + NSAİİ: antihipertansif etki azalır, böbrek fonksiyonu bozulabilir.'),
    ('kortikosteroid', 'nsaid', 'orta', 'Kortikosteroid + NSAİİ: peptik ülser ve GİS kanama riski artar.'),
    ('opioid', 'benzodiazepin', 'yuksek', 'Opioid + benzodiazepin: solunum depresyonu ve aşırı sedasyon riski.'),
    ('tiroid', 'demir', 'dusuk', 'Levotiroksin + demir: emilim azalır; en az 4 saat arayla alınmalı.'),
    ('tiroid', 'kalsiyum', 'dusuk', 'Levotiroksin + kalsiyum: emilim azalır; en az 4 saat arayla alınmalı.'),
    ('tiroid', 'ppi', 'dusuk', 'Levotiroksin + PPI: levotiroksin emilimi azalabilir; TSH takibi önerilir.'),
    ('florokinolon', 'demir', 'orta', 'Florokinolon + demir: antibiyotik emilimi azalır; 2 saat önce veya 6 saat sonra alınmalı.'),
    ('florokinolon', 'kalsiyum', 'orta', 'Florokinolon + kalsiyum: antibiyotik emilimi azalır; 2 saat önce veya 6 saat sonra alınmalı.'),
    ('tetrasiklin', 'demir', 'orta', 'Doksisiklin + demir: emilim azalır; 2-3 saat arayla alınmalı.'),
    ('tetrasiklin', 'kalsiyum', 'orta', 'Doksisiklin + kalsiyum: emilim azalır; 2-3 saat arayla alınmalı.'),
    ('nsaid', 'aspirin', 'orta', 'NSAİİ + aspirin: GİS kanama riski artar; ibuprofen aspirinin kardiyoprotektif etkisini azaltabilir.'),
    ('loop', 'nsaid', 'dusuk', 'Furosemid + NSAİİ: diüretik etki azalabilir.'),
]

# --- 3) İlaç–hastalık uyarıları: (hastalık anahtar kelimeleri, grup, seviye, mesaj) ---
HASTALIK_UYARILARI = [
    (['astim', 'koah'], 'beta_nonselektif', 'yuksek', 'Astım/KOAH’ta nonselektif beta bloker bronkospazma yol açabilir.'),
    (['astim'], 'aspirin', 'orta', 'Astımlı hastalarda aspirin ile alevlenen solunum yolu hastalığı olabilir.'),
    (['astim'], 'nsaid', 'orta', 'Astımlı hastalarda NSAİİ ile bronkospazm görülebilir.'),
    (['bobrek yetmezligi', 'kronik bobrek'], 'nsaid', 'yuksek', 'Böbrek yetmezliğinde NSAİİ’lerden kaçınılmalıdır.'),
    (['bobrek yetmezligi', 'kronik bobrek'], 'metformin', 'orta', 'Böbrek yetmezliğinde metformin dozu eGFR’ye göre ayarlanmalı veya kesilmelidir.'),
    (['bobrek yetmezligi', 'kronik bobrek'], 'potasyum_tutucu', 'yuksek', 'Böbrek yetmezliğinde spironolakton hiperkalemi riskini artırır.'),
    (['kalp yetmezligi'], 'nsaid', 'yuksek', 'Kalp yetmezliğinde NSAİİ sıvı tutulumu ve dekompansasyona yol açabilir.'),
    (['hipertansiyon'], 'nsaid', 'dusuk', 'Hipertansiyonda NSAİİ kan basıncını yükseltebilir; kısa süreli kullanım önerilir.'),
    (['ulser', 'gastrit', 'reflu'], 'nsaid', 'orta', 'Peptik ülser/gastrit öyküsünde NSAİİ GİS kanama riskini artırır; gastroproteksiyon düşünülmeli.'),
    (['ulser', 'gastrit'], 'aspirin', 'orta', 'Peptik ülser/gastrit öyküsünde aspirin GİS kanama riskini artırır.'),
    (['diyabet'], 'kortikosteroid', 'orta', 'Diyabette kortikosteroid kan şekerini yükseltir; glisemi takibi gerekir.'),
    (['epilepsi'], 'tramadol', 'orta', 'Epilepside tramadol nöbet eşiğini düşürebilir.'),
    (['gut'], 'tiazid', 'orta', 'Gut hastalığında tiyazid diüretikler ürik asidi yükseltebilir.'),
    (['miyastenia'], 'makrolid', 'yuksek', 'Myastenia gravis’te makrolidler kas güçsüzlüğünü artırabilir.'),
    (['miyastenia'], 'florokinolon', 'yuksek', 'Myastenia gravis’te florokinolonlar kas güçsüzlüğünü artırabilir.'),
    (['gebe', 'hamile', 'gebelik'], 'ace', 'yuksek', 'Gebelikte ACE inhibitörleri kontrendikedir.'),
    (['gebe', 'hamile', 'gebelik'], 'arb', 'yuksek', 'Gebelikte ARB’ler kontrendikedir.'),
    (['gebe', 'hamile', 'gebelik'], 'statin', 'yuksek', 'Gebelikte statinler kontrendikedir.'),
    (['gebe', 'hamile', 'gebelik'], 'antikoagulan', 'yuksek', 'Gebelikte varfarin teratojeniktir.'),
    (['gebe', 'hamile', 'gebelik'], 'tetrasiklin', 'yuksek', 'Gebelikte tetrasiklinler önerilmez.'),
    (['gebe', 'hamile', 'gebelik'], 'florokinolon', 'orta', 'Gebelikte florokinolonlardan genellikle kaçınılır.'),
    (['siroz', 'karaciger yetmezligi'], 'parasetamol', 'orta', 'Karaciğer hastalığında parasetamol günlük dozu azaltılmalıdır.'),
]


def _gruplar(kayit):
    """Bir ilaç kaydının eşleştirmede kullanılacak tüm etiketleri (gruplar + etken madde adı)."""
    return set(kayit[2]) | {norm(kayit[1]).split()[0]}


def recete_kontrol(ilac_adlari, alerji_metni='', hastalik_metni=''):
    """
    ilac_adlari: reçetedeki ilaç adları listesi
    Dönüş: seviyeye göre sıralı uyarı listesi.
    """
    uyarilar = []
    eslesen = []
    for ad in ilac_adlari:
        kayit = ilac_bul(ad)
        if kayit:
            eslesen.append((ad, kayit))

    # 1) Alerji
    alerji = norm(alerji_metni)
    if alerji.strip() and alerji.strip() not in ('yok', '-'):
        for anahtarlar, etkiler in ALERJI_KURALLARI:
            if not any(a in alerji for a in anahtarlar):
                continue
            for grup, seviye, mesaj in etkiler:
                for ad, kayit in eslesen:
                    if grup in kayit[2]:
                        uyarilar.append({'seviye': seviye, 'tur': 'Alerji', 'ilaclar': [ad], 'mesaj': mesaj})
        # Etken madde adı doğrudan alerji metninde geçiyorsa
        for ad, kayit in eslesen:
            etken = norm(kayit[1]).split()[0]
            if len(etken) > 4 and etken in alerji and not any(u['ilaclar'] == [ad] and u['seviye'] == 'yuksek' for u in uyarilar):
                uyarilar.append({'seviye': 'yuksek', 'tur': 'Alerji', 'ilaclar': [ad],
                                 'mesaj': f'Hastanın alerji kaydında “{kayit[1]}” geçiyor.'})

    # 2) İlaç–ilaç etkileşimi
    for i in range(len(eslesen)):
        for j in range(i + 1, len(eslesen)):
            ad1, k1 = eslesen[i]
            ad2, k2 = eslesen[j]
            g1, g2 = _gruplar(k1), _gruplar(k2)
            if norm(k1[1]) == norm(k2[1]):
                uyarilar.append({'seviye': 'orta', 'tur': 'Tekrar', 'ilaclar': [ad1, ad2],
                                 'mesaj': 'Aynı etken madde iki kez yazılmış.'})
                continue
            for a, b, seviye, mesaj in ETKILESIMLER:
                if (a in g1 and b in g2) or (a in g2 and b in g1):
                    uyarilar.append({'seviye': seviye, 'tur': 'Etkileşim', 'ilaclar': [ad1, ad2], 'mesaj': mesaj})
            if 'nsaid' in k1[2] and 'nsaid' in k2[2]:
                uyarilar.append({'seviye': 'orta', 'tur': 'Tekrar', 'ilaclar': [ad1, ad2],
                                 'mesaj': 'Aynı anda iki NSAİİ: yan etki riski artar, ek fayda sağlamaz.'})

    # 3) İlaç–hastalık
    hastalik = norm(hastalik_metni)
    if hastalik.strip():
        for anahtarlar, grup, seviye, mesaj in HASTALIK_UYARILARI:
            if not any(a in hastalik for a in anahtarlar):
                continue
            for ad, kayit in eslesen:
                if grup in _gruplar(kayit):
                    uyarilar.append({'seviye': seviye, 'tur': 'Hastalık', 'ilaclar': [ad], 'mesaj': mesaj})

    # Tekilleştir ve sırala
    sira = {'yuksek': 0, 'orta': 1, 'dusuk': 2}
    tekil, gorulen = [], set()
    for u in uyarilar:
        anahtar = (u['tur'], tuple(sorted(u['ilaclar'])), u['mesaj'])
        if anahtar not in gorulen:
            gorulen.add(anahtar)
            tekil.append(u)
    tekil.sort(key=lambda u: sira[u['seviye']])
    return tekil
