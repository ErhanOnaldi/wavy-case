# tRPC procedure planı

Durum: Uygulanan procedure sözleşmesi. [Domain planındaki](DOMAIN_PLAN.md) K1 tahmin/ayrılan tutar ve K2 sunucunun başlangıç metric'i üretmesi kararları kabul edildi; K3 için açık DEMO_MODE seçeneği uygulandı.

## 1. İsimlendirme ve sınır

tRPC'de çağrılabilir işleme **procedure**, bunların grubuna **router** denir. Okuma `query`, değiştirme `mutation`dır. Subscription bu case'te gerekmiyor. Bunlar PostgreSQL stored procedure değildir. [tRPC procedures](https://trpc.io/docs/server/procedures)

Tarayıcı -> tRPC client -> Next.js içindeki `/api/trpc/[trpc]` HTTP adapter -> router -> servis -> Drizzle -> Postgres.

`app/api/trpc/[trpc]/route.ts` bir Next.js Route Handler dosyasıdır ama yalnızca tRPC transport'unu bağlar. Case'in yasakladığı ayrı REST app-data endpoint'leri eklenmez. Form mutation'ları Server Actions ile alternatif API oluşturmaz.

Frontend `import type { AppRouter }` ile input/output tiplerini sunucudan çıkarır; runtime'da DB kodunu import etmez. Tek repo ve birlikte deploy sayesinde ayrı OpenAPI dosyası/üretilmiş REST SDK gerekmiyor. Tipler ownership, status transition ve hata anlamını açıklamaz; bu kısa sözleşme yine tutulur. Runtime input validation için Zod gerekir.

## 2. Ortak sözleşme

- UUID kimlikler; timestamp'ler ISO-8601 UTC string, metric/chart günü `YYYY-MM-DD`.
- Para alanları `...Cents`, görüntülenmeler nonnegative safe integer number. Teknik sınırlar domain planında. Zod şemaları hem RHF hem procedure input'unda kullanılır.
- Pagination: `page` varsayılan 1, `pageSize` varsayılan 20, aralık 1–100. Sunucu `LIMIT/OFFSET`, arama ve filtre uygular.
- Liste cevabı `{ items, page, pageSize, totalItems, totalPages }`. Sıralama sabit: listelerde `createdAt DESC, id DESC`, review queue'da `createdAt ASC, id ASC`.
- `campaignId` input olarak alınabilir; `creatorId`, `role`, calculated earnings ve server status alanları creator input'unda yoktur. Mutation objeleri strict Zod şemasıyla bilinmeyen alanları reddeder.
- Client-side validation kullanıcı deneyimi içindir. Aynı schema sunucuda tekrar çalışır; DB'ye bağlı kurallar servis/transaction içinde kontrol edilir.
- Response'lar amaca özel projection'dır; Drizzle satırları rastgele bütün alanlarıyla frontend'e verilmez.

## 3. Procedure listesi

| Procedure | Tip | Yetki | Input | Output / davranış |
| --- | --- | --- | --- | --- |
| `session.me` | query | signed cookie varsa çöz; yoksa null | yok | `{ user: { id, email, role } \| null, canSwitchUser }` |
| `session.switchableUsers` | query | development; açık DEMO_MODE ortamı | yok | Yalnızca tanımlı seed kullanıcıları |
| `session.switchUser` | mutation | aynı development/demo kontrolü | `{ userId }` | Allowlist ve DB kontrolünden sonra signed cookie yazar; kullanıcı özeti döner |
| `campaign.list` | query | admin | pagination, `search?`, `status?` | Kampanya listesi; sunucuda arama/filtre/pagination |
| `campaign.get` | query | admin | `{ id }` | Edit/detail alanları, version, izin verilen düzenlemeler |
| `campaign.create` | mutation | admin | shared campaign form: title, platforms, payoutPer1kViewsCents, totalBudgetCents, startsAt, endsAt | Yeni draft campaign ve version |
| `campaign.update` | mutation | admin | `{ id, expectedVersion, ...sharedEditableFields }` | Domain'deki düzenleme koşullarıyla güncel campaign |
| `campaign.setStatus` | mutation | admin | `{ id, expectedVersion, status: 'active' \| 'paused' }` | İzin verilen transition; completed sunucu kontrolünde |
| `campaign.overview` | query | admin | `{ campaignId }` | totalApprovedViews, budgetAllocatedCents, budgetLeftCents, `dailyViews: { date, views }[]`, status |
| `campaign.browse` | query | creator | pagination | Şu an aktif kampanyaların creator projection'ı |
| `campaign.getAvailable` | query | creator | `{ id }` | Şu an katılınabilir campaign detayı; uygun değilse NOT_FOUND |
| `submission.create` | mutation | creator | `{ campaignId, postUrl }` | Creator session'dan atanır; pending submission ve sunucunun ürettiği başlangıç metric'i atomik kaydedilir; henüz bütçe ayrılmaz |
| `submission.listMine` | query | creator | pagination, `status?` | Kendi submission'ları; campaign özeti, status, rejectionReason, latestViews, estimatedEarningsCents, allocatedEarningsCents |
| `submission.reviewQueue` | query | admin | `{ campaignId, page, pageSize }` | Pending kayıtlar, creator özeti, latest views ve onay maliyeti |
| `submission.approve` | mutation | admin | `{ submissionId }` | Transaction'lı onay; status, ayrılan tutar, güncel campaign bakiye/status |
| `submission.reject` | mutation | admin | `{ submissionId, reason }` | Pending -> rejected; reason ve reviewer timestamp |

Kapsamı küçük tutmak için başlangıçta submission detail, delete, markPaid, metric CRUD, user CRUD ve HTTP ingest procedure'ı yoktur. My submissions satırı bütün gerekli bilgiyi içerir. Tarihi geçmiş kampanyaya ait kendi submission'ı campaign özetiyle listelenmeye devam eder; aktif browse görünürlüğü ownership'le karıştırılmaz.

`pnpm ingest`, sunucu servislerini çağıran CLI entrypoint'tir; client-server çağrısı olmadığı için tRPC endpoint'i gerekmez. Admin UI'a metric düzenleme eklenmez.

## 4. Yetki uygulaması

`publicProcedure`, `protectedProcedure`, `adminProcedure`, `creatorProcedure` tabanları kullanılır. Session bootstrap ve development/demo switcher açıkça sınırlanmış özel durumlardır. App-data procedure'ları authenticated rol kontrolü yapar. Middleware sadece ilk kapıdır; ownership sorgunun `WHERE` koşuluna da eklenir.

Cookie imzalı, HttpOnly, production HTTPS'te Secure ve SameSite=Lax olur. Rol cookie/input'tan alınmaz. Mutation transport'unda same-origin kontrolü uygulanır. Switcher kapatılınca yalnızca dropdown değil server procedure'ları da kapanır. Her tRPC çağrısı yeni context'te güncel kullanıcıyı çözer; paylaşılan singleton context kullanılmaz.

## 5. Typed hata sözleşmesi

Beklenen domain hataları `TRPCError`'a dönüştürülür. Standart transport koduna ek olarak `error.data.domainError` alanında discriminated union taşınır. UI mesaj metni parse etmez. Özel hata verisinin client tipine taşınması tRPC `errorFormatter` ile desteklenir. [tRPC error formatting](https://trpc.io/docs/server/error-formatting)

```ts
type DomainError =
  | { code: 'INSUFFICIENT_BUDGET'; requiredCents: number; availableCents: number }
  | { code: 'DUPLICATE_SUBMISSION' }
  | { code: 'SUBMISSION_ALREADY_REVIEWED' }
  | { code: 'CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS' }
  | { code: 'INVALID_STATUS_TRANSITION' }
  | { code: 'CAMPAIGN_TERMS_LOCKED' }
  | { code: 'PLATFORM_NOT_ALLOWED' }
  | { code: 'NOT_FOUND' }
  | { code: 'STALE_CAMPAIGN' };
```

| Durum | tRPC code | UI tepkisi |
| --- | --- | --- |
| Yetersiz bütçe | `CONFLICT` + `INSUFFICIENT_BUDGET` | Gerekli/kalan tutarı göster, queue/overview yenile |
| Duplicate URL | `CONFLICT` + `DUPLICATE_SUBMISSION` | URL alanında hata |
| Eski form / zaten incelenmiş kayıt | `CONFLICT` + domain code | Kaydı yenile, sessizce ezme |
| Yanlış kampanya durumu / kilitli koşullar | `CONFLICT` + domain code | Güncel durumu göster |
| Zod doğrulama | `BAD_REQUEST` + field errors | İlgili form alanına bağla |
| Oturum yok / yanlış rol | `UNAUTHORIZED` / `FORBIDDEN` | Oturum/erişim durumu |
| Kayıt yok veya creator'ın görünür alanında değil | `NOT_FOUND` | Genel bulunamadı mesajı |
| Beklenmeyen DB/uygulama hatası | `INTERNAL_SERVER_ERROR` | Genel hata; detay yalnızca server logunda |

Budget/domain hatasında otomatik retry yapılmaz. “Onayla” çift tıklamada disabled olur; doğruluk güvencesi yine sunucudadır. Lock timeout/deadlock gibi altyapı hataları bütçe yetersizmiş gibi gösterilmez.

## 6. Frontend kullanım şekli

Yeni kod için `@trpc/tanstack-react-query` + TanStack Query v5 önerilir; eski ve yeni tRPC React entegrasyonları aynı projede karıştırılmaz. [tRPC setup](https://trpc.io/docs/client/tanstack-react-query/setup)

```tsx
const trpc = useTRPC();
const campaignList = useQuery(
  trpc.campaign.list.queryOptions({ page: 1, pageSize: 20 }),
);
const approve = useMutation(trpc.submission.approve.mutationOptions());
```

Provider/router bu TanStack Query entegrasyonuyla uygulandı.

| Başarılı mutation | Yenilenecek cache |
| --- | --- |
| create/update/setStatus campaign | campaign list/get/browse/getAvailable/overview |
| create submission | listMine; varsa ilgili reviewQueue |
| approve/reject | reviewQueue, listMine, campaign overview/get/list/browse/getAvailable |
| switchUser | Devam eden query'leri iptal et, bütün eski kullanıcı cache'ini temizle, session ve sayfayı yeniden yükle |

Başka browser/admin veya CLI ingest sonrası anlık push yoktur. Window focus/refetch ve sayfadaki yenileme eylemi güncel veriyi alır. Para hareketlerinde optimistic başarı gösterilmez; sunucu sonucunu bekleriz.
