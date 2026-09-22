# Çalıştırma ve son doğrulama

- Geliştirme: `npm run dev`
- Üretim derlemesi: `npm run build` → `frontend/dist`
- Tüm geometri / dışa aktarma testleri: `npm test`
- Tarayıcı testi: Chrome test profili 9223 CDP portunda ve dev sunucusu 5173 portunda açıkken `node tests/nesting/ui-export.mjs`.
- Uygulama DXF seçimiyle başlar; depo kökündeki `00.dxf` üretim derlemesine alınmaz.

## 21 Eylül 2026

Arayüzde Ayarlar, Parçalar ve Dışa aktar sekmeleri ve yan menü bağlantıları çalışır. Parça adetleri 0–100 arasında seçilir; 0 parçayı işten çıkarır. Her kopya ayrı bir kimlik taşır, yerleşir, çizilir ve dışa aktarılır. Ayar veya adet değişince eski sonuç temizlenir. Yerleşmemiş parçalar export ekranında belirtilir.

DXF, SVG ve JSON dosyaları indirilebilir. DXF spline/arc/circle/ellipse/polyline geometrisini, renklerini ve katmanlarını korur. SVG örneklenmiş çizgilerden önizleme üretir. Export öncesinde malzeme sınırı ve parça aralığı kontrol edilir; manuel taşıma sonrası geçersiz bir kesim dosyası oluşturulmaz. JSON konumları manuel taşımaları içerir.

10 kontrollü yerleşim denemesi ve son sıkıştırma aşaması uygulanır. Parça adedi ilk önceliktir; daha az yükseklik ve genişlik ikinci önceliktir. Sonuç bir sezgisel çözümdür, küresel optimum iddiası yoktur.

| 1400 × 1000 mm, kenar payı 1 mm | Yerleşen | Yükseklik | Minimum ölçülen aralık |
| --- | --- | --- | --- |
| 0.3 mm | 32/32 | 824.6575 mm | 0.300017 mm |
| 0.5 mm | 32/32 | 818.9445 mm | 0.500080 mm |
| 1 mm | 32/32 | 821.2538 mm | 1.000024 mm |

Tam plaka verimi %59.5076. Kullanılan yüksekliğin azalması aynı plakanın verimini değiştirmez; rulo malzemede gereken uzunluğu azaltır. Tüm aralıklar mevcut eğri motorunun örneklenmiş konturları üzerinden bağımsız kenar mesafeleri ile kontrol edildi. Yaklaşık 55–61 saniye süren optimizasyon Worker içinde çalışır; iptal edilebilir.

Doğrulamalar: dört başlangıç köşesi, 0° kısıtı, yön kilidi, allowedRotations, sheet/roll, çoklu adet, değişmeyen kaynak geometri, bağımsız minimum mesafe, DXF tekrar importu, 0/90/180/270° native geometri exportu, gerçek Chrome dosya indirmeleri, kopya çizimi, simülasyon duraklat/devam, yenileme ve sıfır runtime/ağ hatası.

SDK bağımlılığı, eski hosting giriş sayfaları, otomatik hosting iş akışı ve Data Connect dosyaları kaldırıldı. GitHub Pages iş akışı yalnızca `frontend/dist` yükler. `serula.site` CNAME dosyası derleme çıktısına dahildir. Uzak hesabın servis veya faturalandırma durumu bu yerel değişikliklerle değiştirilmedi.

DXF spline alanları için referans: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm
