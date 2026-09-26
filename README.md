# Serula Nesting Pro

DXF dosyalarını görüntülemek, gerçek konturlarla yerleştirmek ve yerleşimi DXF olarak dışa aktarmak için React ve TypeScript uygulaması.

## Kurulum

Node.js 22 veya üzeri ve npm gerekir.

```sh
npm ci
npm run dev
```

## Doğrulama

```sh
npm test
npm --workspace frontend run lint
npm run build
```

Testler konturları, delikleri, dönüş kısıtlarını, parça mesafelerini, worker işlemlerini ve DXF dışa aktarımını denetler. Üretim çıktısı `frontend/dist` klasöründedir.

## Yayın

```sh
npm run deploy:site
```

Komut üretim derlemesini oluşturur ve `M93hasan/serula-pro2` deposunun `gh-pages` dalına gönderir. Depoya Git yazma erişimi gerekir. Yayın adresi: https://serula.site.

## Lisans

Proprietary — paket yapılandırmasında belirtildiği üzere özel mülkiyetli yazılım.
