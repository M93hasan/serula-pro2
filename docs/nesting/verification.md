# Serula Nesting Pro – doğrulama

Çalıştırma: `npm run dev` (frontend). Derleme: `npm run build`.
Geometri testleri: `npm test` (Node 24 ile doğrulandı).
Backend klasörü henüz bir uygulama içermiyor; kök komutlar mevcut frontend'i çalıştırır.

2026-09-19 / 00.dxf, 1400 × 1000 mm, 1 mm kenar payı:

| Aralık | Yerleşen | Kullanılan yükseklik | Ölçülen minimum mesafe |
| --- | --- | --- | --- |
| 0.3 mm | 32/32 | 828.3438 mm | 0.300045 mm |
| 0.5 mm | 32/32 | 862.2934 mm | 0.500080 mm |
| 1 mm | 32/32 | 844.2948 mm | 1.000030 mm |

Plaka verimi %59.5076; net parça alanı 833105.8439 mm². Verim net parça alanının tam malzeme alanına oranıdır. Roll modunda malzeme yüksekliği kullanılan yükseklik + üst kenar payıdır. Kullanılan genişlik/yükseklik seçilen başlangıç kenarından ölçülen tüketimdir ve başlangıç kenar payını içerir.

Motor 8 deterministik sıralama kullanır: alan, yükseklik, genişlik, en büyük boyut, en-boy oranı, doluluk, boyut toplamı, en küçük boyut. Başlangıç köşesi operatörün seçimine göre korunur; parçalar aynalanmaz. Orijinal geometri veya alan değerleri sıralama için değiştirilmez. İlk deneme temel yerleşimdir; diğer denemeler boşluk taraması ve kontrollü kaydırma uygular. Test makinesinde tüm optimizasyon yaklaşık 36 saniye sürer ve Worker içinde çalışır. Bu bir sezgisel aramadır; matematiksel optimum garantisi yoktur.

Çarpışma testi, mevcut DXF eğri motorunun ürettiği tüm kontur noktalarını kullanır. Uzamsal ağaç yalnızca uzak kenarları eler; geometri sadeleştirilmez. Testlerde tüm kenar çiftleri bağımsız mesafe/kesişim hesabıyla yeniden kontrol edilir. Mesafe garantisi bu örneklenmiş konturlar içindir; analitik eğri yaklaşımı mevcut parser/curveEngine hassasiyetine bağlıdır.

Doğrulamalar: 0.3/0.5/1 mm aralık, dört başlangıç köşesi, yalnız 0° dönüş, parça yön kilidi, allowedRotations, çoklu adet, sheet sınırları, roll, girdilerin değişmemesi ve hatalı ayarlar. JSON sonuçları `storage/nesting-test-report.json` içinde.

Beyaz sayfa nedeni: temel motor dosyasının kendisini içe aktaran optimizasyon koduyla değiştirilmesi ve Worker sonuç alanlarının uyuşmaması. Projede Git geçmişi veya sağlam motor yedeği yoktu; temel API görüntüleyicinin mevcut kullanımına göre yeniden kuruldu. İşlem öncesi dosyalar `storage/backups/before-repair` içinde korundu.

Tarayıcı testi: yerel Chrome CDP (9223) ve `npm --workspace frontend run preview -- --host 127.0.0.1` açıkken `node tests/nesting/browser.mjs`. Teste ait ayrı Chrome profili `storage/browser-test` klasöründedir. Görsel: `storage/browser-nesting.png`; rapor: `storage/browser-test-report.json`.

Üretim tarayıcı doğrulaması tamamlandı: manuel DXF yükleme, hatalı ayar ve toparlanma, hesaplama iptali, sıfırlama, yenileme, simülasyon duraklat/devam, sıfır runtime/ağ hatası. Canvas testi seçme/sürükleme/sıfırlama, pan/fit ve zoom/fit davranışlarını piksel çıktısıyla doğruladı.
