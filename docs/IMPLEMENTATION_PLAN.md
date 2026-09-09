# Mimari, teknoloji ve uygulama planı

Durum: Yerel uygulama, migration, seed, domain/DB testleri ve tarayıcı kontrolleri uygulandı. Kullanıcı planın uygulanmasına yetki verdi. K1/K2 ve açık DEMO_MODE kararı kodda mevcut. Canlı yayın Render + Supabase üzerinde tamamlandı: https://wavy-case.onrender.com. Canlı tRPC akışlarında yetki, ownership, submit, duplicate ve eşzamanlı onay/bütçe hatası doğrulandı; kurulum ve teslim notları NOTES.md içindedir.

## 1. Yaklaşım

Domain odaklı düşünmek Next.js/React'te mantıklıdır. Bu case için öneri, **feature bazlı modüler tek uygulama**: framework'ten bağımsız küçük domain fonksiyonları, transaction'ları yöneten servisler ve ince tRPC router'ları.

Bu, dilin tek “best practice” klasör yapısı olduğu iddiası değildir. Next.js route dosyaları için konvansiyon tanımlar; domain kodunun organizasyonunu büyük ölçüde uygulamaya bırakır. [Next.js 15 project structure](https://nextjs.org/docs/15/app/getting-started/project-structure)

```text
src/
  app/
    api/trpc/[trpc]/route.ts
    admin/campaigns/...
    campaigns/...
    my-submissions/...
  features/
    campaigns/
      schemas.ts          # client + server ortak Zod
      rules.ts            # saf domain fonksiyonları
      service.server.ts   # Drizzle transaction / use case
      queries.server.ts   # okuma sorguları, gerektiğinde ayrılır
      router.ts           # tRPC input + role + servis çağrısı
      components/
    submissions/...
    metrics/...
  server/
    db/                   # schema, connection
    auth/                 # signed cookie
    trpc/                 # context, base procedures, root router
  lib/trpc/               # client provider
  components/ui/          # shadcn
scripts/
  ingest.ts
  seed.ts
drizzle/                  # üretilmiş migration'lar
tests/integration/
compose.yaml
```

Payout hesabı DB/React/tRPC bilmez. Servis transaction'a karar verir. Router input ve yetkiyi doğrulayıp servise çağrı yapar. UI sunucu verisini gösterir, form state'ini yönetir. Server modülleri `server-only` sınırıyla client bundle'dan korunur. Bu guard'ın standalone CLI/Vitest import'larıyla uyumu kurulumda ayrıca doğrulanır; Next request context'i ingest servisinin bağımlılığı yapılmaz.

Generic repository, her entity için interface/class, DI container, MediatR eşleniği, event bus, ayrı Domain/Application/Infrastructure paketleri başlangıçta eklenmez. Clock/fake metric provider gibi gerçekten değişen bağımlılıklar fonksiyon parametresiyle verilir. Shared schema modülü server DB import etmez.

React tarafında component composition, hooks ve yerel form state'i kullanılır. API cache'i TanStack Query'dedir; aynı server verisini Redux/Zustand store'una kopyalamaya ihtiyaç yoktur. App Router layout/page kabuğu server component olabilir; etkileşimli ekran parçaları client component'tir. App-data işlemleri tRPC'den geçer.

## 2. Teknoloji kararları

| Teknoloji | Karar / gerekçe |
| --- | --- |
| Next.js 15 App Router, React, strict TypeScript | Case zorunluluğu. Kurulumda güncel yamalı 15.x ve uyumlu React sürümü pinlenecek; otomatik latest major kullanılmayacak. |
| tRPC v11 | Case zorunluluğu; Next.js Node runtime içinde tek backend. |
| Drizzle ORM + drizzle-kit + `pg` | Case zorunluluğu; PostgreSQL driver olarak node-postgres. Generated migrations repo'da. |
| Postgres | Local Docker Compose; canlı Supabase Postgres adayı. Local major canlı seçilen major ile eşleştirilecek. |
| Tailwind CSS + shadcn/ui | Case zorunluluğu; sade, erişilebilir formlar/dialog/table durumları. |
| react-hook-form + Zod + `@hookform/resolvers` | Case zorunluluğu; aynı doğrulama şemasını form ve procedure paylaşır. |
| Vitest | Case zorunluluğu; saf fonksiyon testleri ve gerçek Postgres integration testleri. |
| TanStack Query v5 + `@trpc/tanstack-react-query` | Query cache, loading/error ve invalidation; tRPC'nin belgelenmiş entegrasyonu. |
| pnpm | Case komutlarıyla uyumlu; package manager sürümü ve lockfile repo'da. |
| Node.js | Kurulumda desteklenen LTS ve paket uyumluluğu doğrulanıp pinlenecek. Local/CI/Render aynı major. |
| Chart | shadcn chart/Recharts adayı; tek günlük seri. Eklenirse NOTES'ta gerekçesi yazılacak. |
| CLI çalıştırma | `tsx` adayı; ingest/seed TypeScript script'leri için. |

Kesin patch sürümleri uygulama başlangıcında engine/peer dependency kontrolleriyle seçilecek. “Latest” etiketiyle Next.js 15 şartı aşılmayacak. Ek paketler sınırlı tutulacak.

## 3. .NET karşılıkları

| Kavram | .NET'ten yaklaşım | Fark |
| --- | --- | --- |
| Next.js | ASP.NET Core host + routing + UI rendering sorumluluklarının bir bölümü | React component modeliyle çalışır; Razor/MVC'nin birebir karşılığı değildir. |
| TypeScript | C# compiler'ın tip denetimi | Tipler runtime'da silinir; gelen JSON'u tek başına doğrulamaz. |
| tRPC procedure | Tipli endpoint/controller action | AppRouter tipi üzerinden TypeScript client sözleşmesi çıkar; HTTP hâlâ vardır. |
| tRPC middleware/context | ASP.NET middleware/authorization + request scoped context | Context request'in kullanıcı/DB erişimini taşır; DI container şart değildir. |
| Drizzle ORM | EF Core'un SQL erişimi, tipli sorgu ve mapping görevleri | SQL'e daha yakın; EF change tracker ve `SaveChanges()` mental modelini taşımaz. Insert/update açıkça çağrılır. |
| drizzle-kit | `dotnet ef migrations add` / `database update` | `generate` SQL üretir; `migrate` uygular. |
| Zod | FluentValidation/DataAnnotations + DTO tipini çıkarma | `z.infer<typeof schema>` ile aynı runtime schema'dan compile-time tip çıkar. Client/server aynı TypeScript şemasını paylaşır. |
| react-hook-form | Blazor EditForm/EditContext'e yakın form sorumlulukları | React hook'larıyla değer, dirty/touched, submit ve alan hatalarını yönetir; birebir karşılık değildir. |
| Vitest | xUnit/NUnit + assertion + mock araçları | `test/describe/expect`; gerçek Postgres'i ayrıca kurarız, Vitest onu taklit ederek concurrency kanıtlamaz. |
| TanStack Query | Doğrudan tek .NET karşılığı yok | Tarayıcıda server state cache, refetch, loading/error, invalidation yöneticisi. ORM veya global domain store değildir. |
| pnpm / package.json | NuGet, proje bağımlılıkları ve komut görevlerinin bir bölümü | JS paket yöneticisi ve script tanımlarıdır; `pnpm test` tanımlı test script'ini çalıştırır. |
| Postgres row lock | DB transaction + pessimistic concurrency | .NET `lock`/SemaphoreSlim process içidir; DB kilidi farklı uygulama instance'larını da koordine eder. |

Drizzle ve migration davranışı: [ORM overview](https://orm.drizzle.team/docs/overview), [migration workflow](https://orm.drizzle.team/docs/migrations). Ortak form validation: [Zod](https://zod.dev/), [RHF resolvers](https://github.com/react-hook-form/resolvers). Test aracı: [Vitest](https://vitest.dev/guide/).

Örnek akış: `campaignFormSchema` form alanlarını doğrular; aynı schema `campaign.create.input(...)` için kullanılır. Bütçenin başka admin tarafından tüketilmesi Zod'un işi değildir; transaction içindeki domain kontrolüdür.

## 4. Test stratejisi

Kullanıcının yaklaşımı korunur: adım adım manuel kontrol, önemli hata bulununca o hatayı tekrar üreten regression testi, case'in özellikle istediği riskli kurallara baştan otomatik test. Coverage hedefi veya her component'e snapshot testi yoktur.

| Zorunlu alan | Anlamlı test |
| --- | --- |
| Payout math | 0/999/1000/1999/2000 views; örneğin 125 cent ücretle 0/0/125/125/250; metric yok; son metric'in seçilmesi; integer sınırları |
| Budget ceiling | Tam yeterli, bir cent eksik, yetersiz approval'ın hiçbir değişiklik bırakmaması; sıfır bakiyede completed; pozitif küçük bakiyede completed olmaması |
| Concurrent approvals | Gerçek Postgres, en az iki bağımsız bağlantı, aynı bütçeye karşı iki farklı submission; tam bir başarı, bir typed bütçe hatası |
| Access control | Her admin mutation'ına creator çağrısı; own-list izolasyonu; elle creatorId/status eklenmesi; değişmiş/bozuk cookie; dev switcher kapalıyken erişim |
| Repeated ingest | Aynı gün ikinci çalıştırma bütün metric ve bütçe değerlerini değiştirmiyor; sonraki gün nondecreasing views |

Ek domain testleri: URL normalizasyonu + aynı URL'nin eşzamanlı submission'ları; boş rejection reason; aynı submission'ın çift onayı; approve/reject yarışı; approval/ingest ve edit/approval yarışı; ingest sırasında tek kayıt hatası ve diğerlerinin commit'i; eşzamanlı iki ingest; chart'ta boş gün ve kümülatif sayaçların iki kez sayılmaması.

K2 testleri: Başlangıç ölçümü ilk onay maliyetine yansır; creator input'una eklenen sayaçlar reddedilir; metric insert hatasında submission da rollback olur; pending oluşturmak bütçe ayırmaz; onaydan sonra aynı gün ingest başlangıç ölçümünü ve ayrılan tutarı değiştirmez.

Concurrency testi sadece `Promise.all` yazıp rastlantısal çakışma beklemez: testte kontrollü bariyerle ilk transaction'ın kampanya kilidini tuttuğu an yakalanır, ikinci gerçek DB bağlantısının kilitte beklediği doğrulanır, sonra birinci serbest bırakılır. Sabit sleep sürelerine veya fake DB/SQLite'a dayanılmaz. Test pool'u iki eşzamanlı transaction'ı destekler; tek outer test transaction'ı altında serialize edilmez.

tRPC `createCaller` ile procedure+yetki integration testleri yapılır; imzalı cookie ve HTTP hata verisinin client'a taşınması ayrıca transport seviyesinde doğrulanır. Bu ayrım context'i elle enjekte edip cookie doğrulamayı test etmiş sanmayı engeller.

`pnpm test` -> `vitest run`: unit ve integration birlikte çalışır. Ayrı test DB zorunlu; bağlantı yoksa sessiz skip/yalancı yeşil yerine açık setup hatası verir. Compose test servisi ve CI Postgres service aynı migration'ları uygular. Testler demo/live DB'ye dokunmaz; production connection'a düşen fallback yoktur.

## 5. Uygulama sırası ve bitiş koşulları

| Aşama | İş | Bitti sayma koşulu |
| --- | --- | --- |
| 0 | Kabul edilen K1/K2 kararlarının uygulama ayrıntılarını gözden geçir, K3 demo erişimini kesinleştir; bu planları güncelle | Domain sözleşmesinde çelişki/açık para kararı kalmadı |
| 1 | Next.js 15 scaffold, strict TS, pnpm, Compose, env validation, Vitest | Local app açılıyor, DB healthcheck var, typecheck/build çalışıyor |
| 2 | Drizzle schema, generate edilen migration'lar, seed | Boş DB'ye migrate+seed; 2 admin/2 creator, aktif/draft/paused ve budget örnekleri |
| 3 | Saf payout/URL/status kuralları; shared Zod | İlgili sınır testleri geçiyor |
| 4 | Cookie/context/role/ownership; tRPC router iskeleti | Access-control ve cookie testleri geçiyor |
| 5 | Campaign create/edit/list; submission create/review + bütçe transaction'ı | Budget/concurrent approval/duplicate/review yarış testleri geçiyor |
| 6 | Ingest CLI ve overview aggregation | Aynı gün no-op, hata izolasyonu, artış, sıfır gün ve K1 testleri geçiyor |
| 7 | Admin ve creator ekranları, RHF/Zod, typed hatalar, chart | Akışlar browser'da adım adım; loading/empty/error ve klavye/dialog erişimi kontrol edildi |
| 8 | CI, temiz checkout provası, NOTES.md | Belgelenen setup ile test/typecheck/build; AI kullanım notları gerçek çalışmayı yansıtıyor |
| 9 | GitHub public repo + Render + Supabase | Live URL'de iki rol, form, review, bütçe hatası ve veri kalıcılığı doğrulandı |

Her feature'da ilgili ekran kontrolü yapılır; son aşama ilk manuel deneme değildir. Önce test/servis/API ile para akışı doğrulanır, ardından ekranlar tamamlanır. Ağır UI tasarımı ve gereksiz özellikler eklenmez.

NOTES.md en sonda kısa İngilizce teslim notuna dönüşecek: çalışan setup, concurrency kararı, gerçekten denenen/eliminasyon yapılan yaklaşımlar, varsayımlar, bilerek dışarıda kalanlar, bir gün daha olsa yapılacak ilk iş, AI kullanımı ve düzeltilen hatalar. Bu taslaklar planlama rehberidir; tamamlanmış iş kanıtı değildir.

## 6. Local ve canlı ortam

Önerilen yerleşim:

```text
GitHub public repo
       |
       v
Render Node Web Service
  Next.js UI + tRPC (aynı origin)
       |
       v
Supabase Postgres

Local: Next.js process + Docker Compose Postgres
CI:    build/test + ayrı Postgres service
```

Case “live URL” istiyor; statik export şartı yok. GitHub repo barındırmak ile GitHub Pages'te statik site barındırmak farklıdır. Next.js static export, request'e bağlı cookie ve dinamik server route davranışını çalıştırmaz. Pages+ayrı backend kurulabilir, fakat bu case'te cookie/CORS, route dağıtımı ve iki deploy yükü getirir. [Next.js 15 static export sınırları](https://nextjs.org/docs/15/app/guides/static-exports)

Render, server mantığı içeren Next.js uygulamasını Node Web Service olarak çalıştırmayı belgeler. Tek URL altında UI ve `/api/trpc` sunulur. [Render Next.js](https://render.com/docs/deploy-nextjs-app)

9 Eylül 2026'da kontrol edilen ücretsiz planlar: Supabase Free 500 MB DB ve bir hafta kullanılmayınca pause; Render Free web service 15 dakika trafik olmayınca durur, sonraki istekte açılması yaklaşık bir dakika sürebilir. Demo için kapasite yeterli olabilir; teslim URL'inin ilk açılış davranışı NOTES'ta belirtilir ve görüşme öncesi kontrol edilir. [Supabase pricing](https://supabase.com/pricing), [Render Free](https://render.com/docs/free)

Supabase yalnızca Postgres host'u olarak kullanılacak; client'tan Supabase REST/Auth erişimi açılmayacak. Drizzle normal Postgres bağlantısı kullanır. Kalıcı Node servisinde doğrudan bağlantı; IPv4 kısıtı varsa session pooler değerlendirilir. Migration için uygun direct/session bağlantısı ayrıca doğrulanır. [Supabase bağlantı seçenekleri](https://supabase.com/docs/guides/database/connecting-to-postgres)

Uygulama tabloları Data API'ye açılmayan özel `app` schema'sında tutulması önerilir; server DB rolü erişir. Supabase'in otomatik tablo erişim davranışı 2026'da değiştiğinden varsayılanlara güvenmeden exposed schema/grant ayarı kontrol edilir. Public/exposed tablo oluşursa RLS ayrıca etkinleştirilir. [Supabase Data API değişikliği](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

Build, migration ve seed ayrı adımlardır. Build/render sırasında DB mutation yapılmaz. Migration tek deployment adımında, seed bilinçli olarak bir kez çalışır; her restart veriyi sıfırlamaz. `.env.example` yalnızca placeholder içerir; DATABASE_URL ve cookie secret server ortamındadır. Ingest ilk sürümde belgelenmiş CLI ile çalışır; otomatik scheduler case'in talebi değildir.

Docker volume local veriyi korur. Temiz kurulum denemesi ayrı geçici DB/volume ile yapılır; mevcut kullanıcının DB'si resetlenmez.

## 7. Manuel kontrol senaryosu

1. Admin campaign oluşturur, form hatalarını görür, edit eder ve aktive eder.
2. Creator A aktif kampanyaları server pagination ile görür; platform/URL hataları ve başarılı submit denenir.
3. Creator B, A'nın kayıtlarını listede veya elle hazırlanmış input ile göremez.
4. Admin reason olmadan reddedemez; doğru reason creator listesine yansır.
5. Admin yeterli bütçeli submission'ı onaylar; yetmeyen submission typed hata gösterir.
6. İki ayrı browser session'ında iki admin ile yarışın kullanıcı görünümü kontrol edilir; doğruluk kanıtı otomatik DB testidir.
7. Ingest çalışır, ikinci çalıştırma veriyi değiştirmez; chart boş günleri ve güncel toplamları gösterir.
8. Son bütçe kullanıldığında completed durumu ve browse'dan kalkma doğrulanır.
9. User switch sonrası eski kullanıcının cache'i görünmez; ekranların loading/empty/error halleri kontrol edilir.
10. Aynı akış deploy edilmiş URL'de smoke test edilir; fake içerik/hesaplar kullanılır.

Takvim notu: Case metninde “Saturday 5 September” teslim tarihi var. Çalışma ortamının tarihi 9 Eylül 2026; bunun halen geçerli deadline mı yoksa eski case metni mi olduğu bilinmiyor. Uygulama planı geçmiş tarihe göre teslim sözü vermez.
