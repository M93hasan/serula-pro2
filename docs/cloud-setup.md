# Bulut kurulumu

1. Firebase projesinde Authentication > Google sağlayıcısını, Firestore ve Storage'ı etkinleştirin. Kullanılan alan adını Authentication > Authorized domains listesine ekleyin.
2. `frontend/.env.example` dosyasını `frontend/.env.local` olarak kopyalayıp Firebase web uygulaması değerlerini doldurun.
3. Proje kökünde `firebase deploy --only firestore:rules,storage` ile erişim kurallarını yayınlayın.
4. Storage bucket için `storage.cors.example.json` örneğini uygulama alan adlarınızla genişletip CORS olarak uygulayın (`gcloud storage buckets update gs://BUCKET --cors-file=storage.cors.example.json`). Tarayıcıdaki kimlik doğrulamalı DXF okuma bu ayarı gerektirir.

Kurallar kullanıcı UID'si dışındaki proje kayıtlarını ve DXF nesnelerini okumayı/yazmayı engeller. API anahtarları istemci yapılandırmasıdır; güvenlik kuralları yayınlanmadan bulut depolamayı kullanmayın.
