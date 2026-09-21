# Site yayını

`npm run watch:site`, VS Code'daki `frontend` dosyaları kaydedildikçe uygulamayı derler ve `gh-pages` dalına gönderir. `serula.site` bu daldan yayımlanır. Bilgisayar açık ve internete bağlı olmalıdır; GitHub Pages'in güncellemeyi göstermesi birkaç dakika sürebilir.

Tek seferlik yayın için `npm run deploy:site` kullanılabilir. `main` dalı gönderildiğinde `.githooks/pre-push` aynı yayını yapar; bunun için yerel depoda `git config core.hooksPath .githooks` ayarlı olmalıdır.
