# Domain planı

Durum: Uygulanan domain sözleşmesi. Kaynak: [PLAN.md](../PLAN.md).
`Zorunlu` case'in açık talebi; `Öneri` bizim uygulama kararımızdır. K1'de tahmin/ayrılan tutar ayrımı, ilk onayda tam bütçe kontrolü ve sonraki artışın kalan bütçeyle sınırlandırılması kullanıcı tarafından kabul edildi. K2'de sunucunun submit sırasında sahte başlangıç ölçümü üretmesi kabul edildi. Kullanıcının uygulama yetkisiyle diğer öneriler ve K3 açık demo modu uygulandı; ayrıntılar NOTES.md içinde.

## 1. Model ve sorumluluklar

| Kavram | Sorumluluk |
| --- | --- |
| Campaign | Platformlar, ücret, tarih aralığı, durum ve ortak bütçe |
| Submission | Bir creator'ın bir kampanyaya gönderdiği tek platform paylaşımı ve inceleme kararı |
| SubmissionMetric | Paylaşımın belirli bir UTC gününde gözlenen kümülatif sayaçları |
| User | Sunucunun güvendiği kullanıcı kimliği ve admin/creator rolü |

Bütçe tutarlılığının sınırı kampanyadır. Farklı submission'lar aynı bütçeyi tüketir. Bu yüzden yalnızca submission satırını kilitlemek yeterli değildir. Ayrı mikroservislere veya bütün entity'leri belleğe yükleyen büyük bir aggregate sınıfına ihtiyaç yoktur.

## 2. Önce netleştirilecek kararlar

### K1 — Onay sonrasında görüntülenmeler artarsa bütçe nasıl korunacak?

**Kabul edilen karar:** Tahmin ve ayrılan tutar ayrı tutulur. İlk onayda bütçe tam tutarı karşılamalıdır; sonraki artışta en çok kalan bütçe kadar yeni tutar ayrılır. Aşağıdaki dağıtım sırası ve muhasebe alanları bu karara uygun uygulama önerileridir.

Zorunlu formül: `floor(latestViews / 1000) * payoutPer1kViewsCents`.

Örnek: Bütçe 1.000 cent, ücret 100 cent/1.000 views. Onaylanan gönderi önce 8.000 views ile 800 cent eder; sonraki gün 15.000 views ile 1.500 cent eder. Formüldeki tutarı koşulsuz ödeme taahhüdü sayarsak 1.000 cent tavanını koruyamayız. Sadece concurrent approval testini geçirmek bu sorunu çözmez.

| Seçenek | Sonuç |
| --- | --- |
| Onay anındaki tutarı dondurmak | Basit; ancak son metric üzerinden kazanç güncellemesi beklentisini daraltır. Varsayım olarak açıklanması gerekir. |
| Hesaplanan kazanç ile bütçeden ayrılan tutarı ayırmak | Son metric formülü korunur; gerçekten karşılanabilir tutar bütçeyle sınırlanır. Kullanıcının seçtiği yaklaşım. Artışın dağıtım sırası aşağıda öneri olarak tanımlıdır. |
| Metric artışını bütçeye göre kırpmak veya kaydetmemek | Gerçek görüntülenmeyi para hesabına göre değiştirir ya da günlük ingest beklentisini bozar. Önerilmiyor. |

**Önerilen ikinci seçenek için aday sözleşme:**

- `estimatedEarningsCents`: son metric'e uygulanan formül; bütçeyle kırpılmaz.
- `allocatedEarningsCents`: kampanya bütçesinden bu submission'a gerçekten ayrılan tutar; DB'de saklanır.
- `budgetAllocatedCents`: kampanyada ayrılan toplam. Bu case'te gerçek para transferi yoktur; ekranda “Budget spent” gösteriminin ayrılmış tutarı temsil ettiği açıklanır.
- `budgetLeftCents = totalBudgetCents - budgetAllocatedCents`.
- Muhasebe invariant'ı: `budgetAllocatedCents = SUM(submissions.allocatedEarningsCents)` ve `0 <= budgetAllocatedCents <= totalBudgetCents`. Toplam eşitliği servis transaction'larıyla korunur ve integration testlerinde doğrulanır; tablolar arası toplamı sıradan bir CHECK constraint doğrulamaz.
- İlk onayda hesaplanan tutarın tamamına bütçe yetmelidir. Kısmi ilk onay yoktur; yetersizse typed hata ve rollback.
- Sonraki ingest'te `delta = max(0, estimated - allocated)` ve `grant = min(delta, budgetLeft)`; yalnızca `grant` kadar yeni tutar ayrılır. Metric hiçbir zaman kırpılmaz.
- Bütçede son 50 cent kalmışsa 100 cent'lik kazanç artışının 50 cent'i karşılanır. Bu, brüt formülle karşılanabilir tutarın ayrılmasının bilinçli sonucudur; sessizce “formülün çıktısı” diye sunulmaz.
- Ingest'in bütçe dağıtım sırası, aynı kampanyada onay sırasıdır. Başarısız kaydın payı o turda tutulmaz; diğer kayıtlar devam eder. Yeni onay ve ingest birbirine rastlarsa kampanya kilidini önce alan işlem önceliklidir.
- Bütçe sıfıra ulaşınca aynı transaction'da kampanya `completed` olur. Tamamlanma yeni para ayırmayı durdurur; onaylı gönderilerin metric'leri yine kaydedilebilir.
- Bu politika altında “kazanç tahmini” ile “ayrılmış tutar” UI'da ayrı gösterilir. `NOTES.md` bu yorumu ve ilk onay/sonraki artış farkını açıklar.

Bu karar dokümandaki eksik ürün kuralını tamamlar; case'in açıkça belirttiği bir kuralmış gibi sunulmamalıdır. Kullanıcının seçtiği varsayım NOTES.md'ye yazılacaktır. Şirkete bu çalışma kapsamında mesaj gönderilmedi.

### K2 — Pending submission'ın ilk metric'i

**Kabul edilen karar:** Yeni clip gönderildiğinde sunucu sahte başlangıç ölçümü üretir. Aşağıdaki transaction ve tekrar çalıştırma davranışları bu kararı mevcut domain kurallarıyla tutarlı uygulamak içindir.

`pnpm ingest` yalnızca approved submission'ları işler. Yeni kayıtların hiç metric'i yoksa bütün ilk onayların maliyeti sıfır olur. Bu sonuç mümkün, fakat bütçe kontrolünün gerçek kullanıcı akışındaki anlamını zayıflatır.

Submit sırasında sunucudaki sahte metric sağlayıcısı bir başlangıç snapshot'ı üretir. Submission ve aynı UTC gününün metric'i tek transaction'da yazılır; ölçüm kaydı başarısızsa submission da oluşturulmaz. Creator `views`, `creatorId`, kazanç veya approval status gönderemez. Pending aşamasında bütçe ayrılmaz; başlangıç ölçümü ilk onayın maliyetini belirler. Bu başlangıç ölçümü günlük ingest'ten ayrı, belgelenmiş bir simülasyondur. Aynı gün ingest snapshot'ı değiştirmez. Seed'de bütçeye yeten/yetmeyen pending örnekleri de bulunur.

Seçilmeyen alternatif: Başlangıç metric'i oluşturulmaz, olmayan metric sıfır kabul edilir; ilk onay maliyeti sıfır olur. Kullanıcı başlangıç ölçümünü seçtiği için normal submit akışında bu yaklaşım uygulanmayacak. Eksik metric'in sıfır kabul edilmesi eski/fixture kayıtları için savunmacı hesaplama kuralı olarak kalabilir.

### K3 — Canlı demo ile “dev-only switcher”

Zorunlu: signed cookie ve development ortamına özel user switcher; gerçek auth sağlayıcısı yok.

Production build'de development switcher kapalı olursa değerlendiren kişinin admin ve creator rollerini nasıl deneyeceği belirsizdir. Öneri: yalnızca sahte verilerin bulunduğu sunum ortamında açıkça `DEMO_MODE=true` ile seed kullanıcıları arasında geçişe izin vermek. Bu, kelimesi kelimesine dev-only şartına bir demo istisnasıdır ve `NOTES.md`'de belirtilmelidir. Normal production'da hem procedure hem UI kapalı olur. Uygulama yetkisi kapsamında bu demo istisnası uygulandı ve NOTES.md içinde açıkça belirtildi.

## 3. Campaign kuralları

Zorunlu: başlık, bir veya daha fazla platform, cent cinsinden tamsayı ücret/bütçe, `draft | active | paused | completed`, başlangıç ve bitiş.

Öneriler:

- Boş başlık/platform listesi, sıfır veya negatif ücret/bütçe kabul edilmez; başlangıç bitişten küçüktür.
- Tarihler DB'de `timestamptz`; eligibility `startsAt <= now < endsAt`. Günlük metric anahtarı UTC `date` olur.
- Creator browse listesi yalnızca `active` ve tarih aralığı içindeki kampanyaları döndürür.
- Yeni submission ve ilk onay aynı active+tarih koşulunu arar. Pause, yeni onay/submission'ı durdurur; mevcut taahhüdü iptal etmez.
- `draft -> active`, `active -> paused`, `paused -> active`; bütçe sıfırsa sistem `completed` yapar. Manuel complete/reopen ilk sürümde yoktur.
- Bitiş tarihi geçen kampanya submit/onay kabul etmez; yalnızca tarih geçti diye otomatik `completed` yazılmaz. UI “Süresi doldu” bilgisini türetir.
- İlk submission'a kadar ücret/platform/tarih düzenlenebilir. Sonrasında bu şartlar sabitlenir; başlık değişebilir, bütçe artırılabilir. Bütçe azaltma yalnızca henüz submission yokken desteklenir.
- `completed` yeniden açılmaz ve bütçesi değiştirilmez. Düzenleme ile onay/ingest aynı kampanya kilidini kullanır.
- Bütçede pozitif bir bakiye kalıp sıradaki submission'a yetmezse hata verilir. Pozitif bakiye “sıfır” sayılıp kampanya tamamlanmaz.
- İki admin'in aynı formu düzenlemesinde eski verinin yeniyi ezmesini engellemek için edit input'unda `expectedVersion` bulunur; uyuşmazlık `STALE_CAMPAIGN` olur.

## 4. Submission ve erişim kuralları

- Zorunlu: `pending -> approved` veya `pending -> rejected`; rejection reason zorunlu ve trim sonrasında boş olamaz.
- Öneri: rejected kaydı yeniden onaylama, silme, URL/creator/campaign değiştirme ve gerçek payout işlemi kapsam dışı. `paid` şemada yer alır; ödeme UI/procedure'ı eklenmez.
- Aynı submission'ın ikinci onayı ikinci kez bütçe ayıramaz. Tekrarlanan veya başka kararla çelişen review çağrısı `SUBMISSION_ALREADY_REVIEWED` döndürür.
- Kimlik signed cookie'den çözülür; rol her istekte DB'den okunur. Input'tan role/creatorId alınmaz.
- Creator sorguları doğrudan `creator_id = session.user.id` koşulu içerir. Kayıt bulunamaması ile başka kullanıcıya ait olması aynı `NOT_FOUND` sonucunu verir.
- Admin review/list/overview yalnızca admin'dir. UI'da buton saklamak yetkilendirme değildir.
- User switcher mevcut değilken girişsiz app-data procedure'ları `UNAUTHORIZED` döndürür. Demo mekanizmasının erişim politikası K3'e bağlıdır.

### URL doğrulama ve benzersizlik

- Zorunlu: kampanyanın desteklediği platformda gerçek bir post'a benzeyen URL; aynı kampanyada aynı URL iki kere bulunamaz.
- Öneri: `https`, izin verilen tam hostname ve platforma özgü path/ID kontrolü. Kullanıcı adı/şifreli URL, profil/anasayfa linki, beklenmedik port ve `youtube.com.attacker.example` gibi host'lar reddedilir.
- Başlangıç kapsamı: TikTok `@user/video/id`, Instagram `p/code` ve `reel/code`, YouTube `watch?v=id`, `shorts/id`, `youtu.be/id`.
- Platform URL'den türetilir; varsa formdaki platformla eşleşmesi doğrulanır. Network isteği/scraping yapılmaz; paylaşımın gerçekten var olduğu iddia edilmez.
- Aynı video için YouTube URL çeşitleri ve takip parametreleri aynı `platform + externalPostId` kimliğine normalleştirilir. TikTok kısa yönlendirme linkleri ilk sürümde desteklenmez.
- DB'de `UNIQUE(campaign_id, platform, external_post_id)` bulunur. Önceden “var mı?” sorgusu kullanıcı deneyimi içindir; yarış durumundaki garanti unique constraint'tir.
- Reddedilmiş kaydın kimliği de tutulur; başka creator aynı kampanyaya aynı post'u gönderemez. Farklı kampanyaya gönderilebilir.

## 5. Şema taslağı

| Tablo | Minimuma ek önerilen alanlar / kısıtlar |
| --- | --- |
| `users` | UUID PK, unique email, role enum |
| `campaigns` | UUID PK, platform enum array, `budget_allocated_cents`, `version`, `next_approval_order`, created/updated timestamps; `0 <= allocated <= total` CHECK |
| `submissions` | UUID PK, FK campaign/creator, canonical URL, external post ID, `allocated_earnings_cents`, `approval_order`, reviewed_by/at; unique post identity; `allocated >= 0` ve rejected durumunda boş olmayan reason CHECK |
| `submission_metrics` | FK submission, UTC `captured_at` date, nonnegative views/likes/comments; `UNIQUE(submission_id, captured_at)` |

Kabul edilen K1 kararı için allocation alanları kullanılır. `approval_order`, kampanya kilidi altında artırılan sayaçtan atanır; ingest sırasını eşit timestamp'lere bağlı bırakmaz. `UNIQUE(campaign_id, approval_order)` uygulanır; pending kayıtlarda sıra null'dır.

İndeksler: campaign status+tarihler; submission campaign+status+createdAt+id; creator+createdAt+id; metric submission+capturedAt. Başlık araması ilk sürümde parametreli `ILIKE`; hacim gerektirmeden trigram/full-text altyapısı eklenmez. `%` ve `_` kullanıcı aramasında literal ele alınır.

Para cent cinsinden tamsayı tutulur, float ile hesaplanmaz. Uygulamada `number` kullanılacak alanlar için DB ve Zod aralıkları birlikte tanımlanır: ücret/bütçe en çok 1.000.000.000 cent, metric sayaçları en çok 1.000.000.000. Böylece tek payout çarpımı en çok 10^15 olup JS safe integer aralığında kalır. Bunlar önerilen teknik limitlerdir; limitsiz sayım iddiası yoktur. SQL toplamları daha geniş tiple hesaplanır ve API'ye dönüşte safe integer kontrolü yapılır.

Tüm migration'lar `drizzle-kit generate` ile üretilir, SQL gözden geçirilir ve repo'ya eklenir. Başka bir migration aracı aynı şemayı yönetmez.

## 6. Concurrency ve transaction sözleşmesi

Öneri: Postgres `READ COMMITTED` transaction + kampanya satırında `SELECT ... FOR UPDATE`. Başka bir transaction aynı kampanyayı kilitlemek istediğinde bekler; kilit commit/rollback'te bırakılır. [Postgres locking](https://www.postgresql.org/docs/current/explicit-locking.html)

Onay akışı:

1. Procedure admin rolünü doğrular; submission'dan değiştirilemeyen campaign ID bulunur.
2. Transaction başlar; campaign satırı kilitlenir.
3. Submission aynı transaction'da yeniden okunup kilitlenir. Her yazma yolu aynı sırayı kullanır: campaign, sonra submission.
4. Pending durumu, güncel campaign durumu/tarihleri ve en son metric yeniden kontrol edilir. İşlemden önce UI'ın gördüğü bakiye kullanılmaz.
5. Formül ve güncel bakiye karşılaştırılır. Yetmiyorsa tüm işlem geri alınır; `INSUFFICIENT_BUDGET` döner. Bütçe nedeniyle tamamlanmış kampanyadaki pozitif maliyetli onay da bu hatayı döndürür.
6. Yeterliyse submission approved yapılır, allocation ve approval order yazılır; campaign toplamı/sürümü güncellenir.
7. Bakiye sıfırsa campaign completed yapılır; birlikte commit edilir.

Örnek: Kalan 1.000 cent; A ve B'nin her biri 700 cent istiyor. A kilidi alıp 700 ayırır. B bekler, ardından kalan 300'ü okur ve reddedilir. A rollback yaparsa B 1.000'i görüp başarılı olabilir.

Bu örnekte “first come”, DB'de kritik bölüme giren işlem demektir. HTTP isteğinin geliş zamanına göre katı FIFO garantisi verilmiyor. Böyle bir garanti ayrıca kalıcı kuyruk/sıralama gerektirir; case için önerilmiyor.

Kilit protokolünü approval, rejection, submit başlangıç snapshot'ı, campaign edit/status change ve ingest paylaşır. Çok tablo güncellemesini transaction'a almak tek başına budget race'ini engellemez; okuma ve yazma arasında ortak kilit gerekir. Bütün kod yollarının buna uyması test edilir. [Postgres tutarlılık rehberi](https://www.postgresql.org/docs/current/applevel-consistency.html)

Alternatifler: Node içi mutex/.NET `lock` yalnızca tek process'i kapsar. EF Core concurrency token benzeri optimistic version+retry veya Serializable+retry uygulanabilir; bu dar ortak bütçe için satır kilidi daha az retry/kod gerektirir. Redis/distributed lock gerekmiyor. Bu alternatifler henüz deneysel olarak denenmedi; `NOTES.md`'de denenmiş gibi yazılmayacak.

Overview, bütçe ve metric toplamlarını tek SQL statement'ta ya da tutarlı read snapshot'ında okur; birbirinden bağımsız sorgularla aynı response içinde eski/yeni veri karıştırılmaz. [Postgres isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

## 7. Ingest

- `pnpm ingest` başlangıcında tek UTC gün hesaplar; gece yarısı geçilse de o run'ın günü değişmez. Testlerde saat ve sahte sağlayıcı inject edilir.
- Campaign'ler ayrı işlenir. Aynı campaign'in approved submission'ları `approval_order` sırasında işlenir.
- Aynı campaign için iki script'in sırayı karıştırmaması adına kısa campaign transaction'ı kullanılır; sahte sağlayıcının deterministik artışları transaction öncesi hazırlanır. Nihai snapshot kilit altında tekrar okunan son metric'e göre hesaplanır; kilit öncesi eski sayaç üzerinden yazılmaz. Campaign kilidi altında her submission için savepoint açılır. Birinin DB/domain hatası yalnızca o savepoint'i geri alır. Sağlam kayıtlar campaign transaction sonunda commit olur.
- Başarılı sayacı commit sonrasında raporlanır. Tüm transaction/bağlantı hatasında o campaign başarısız sayılır; diğer campaign'lere devam edilir. DB bağlantısı tamamen yoksa kısmi başarı garanti edilemez.
- Her kayıt için mevcut aynı gün satırı önce kontrol edilir. Varsa **hiçbir şey değiştirilmez**, bütçe de yeniden ayrılmaz. DB unique constraint son güvence olur; `ON CONFLICT DO NOTHING` kullanılır, update/upsert ile sayaçlar değiştirilmez.
- Aynı gün sonradan onaylanan ve o gün metric'i olmayan yeni bir kayıt sonraki run'da eklenebilir; önceki başarılı kayıtlar değişmez. “İkinci run no-op” testi aynı eligible veri kümesiyle çalışır; önceki run'da hata alan eksik kayıtların tamamlanması engellenmez.
- Yeni snapshot'ın views'u önceki son snapshot'tan küçük olamaz. Sahte artış submission+gün üzerinden deterministik ve nonnegative olur; teknik limite ulaşıldığında sayaç sabit kalır.
- Metric insert ve K1'e bağlı bütçe artışı aynı savepoint/transaction'dadır. Insert gerçekleşmediyse yeni allocation yapılmaz.
- Geri tarihli eksik satır ekleme/backfill ilk sürümde yoktur. Mevcut eski gün yeniden çalıştırılırsa no-op; daha yeni metric varken araya eksik eski gün ekleme reddedilir. Normal komut bugünü işler.
- Approved kayıtlar campaign paused/completed olsa da izlenir; yalnızca K1 politikasına göre kalan bütçe kadar allocation yapılır. Paid/rejected/pending günlük ingest'e girmez.
- Sonuç: inserted/skipped/failed sayıları, güvenli hata nedenleri ve submission ID'leri. Hata varsa diğer işler bittikten sonra nonzero exit code. Secret/DB URL loglanmaz.

## 8. Overview ve chart

- Total approved views: approved kayıtların her birinin **son** metric'i toplanır; farklı günlerin kümülatif sayaçları toplanmaz. Paid fixture varsa tarihsel onaylı toplamda yer alır.
- Bütçe görünümü K1'deki allocated/left anlamını kullanır; pending/rejected kazancı ayrılan tutara katılmaz.
- Önerilen chart: UTC gün başına **gözlenen görüntülenme artışı**. Mevcut snapshot'tan önceki bilinen snapshot çıkarılır. İlk snapshot için önceki değer sıfırdır.
- Günlük zaman ekseni campaign döneminin kapsadığı bütün UTC günlerini içerir. Snapshot olmayan gün sıfır, gelecek günler de ölçüm yok olarak gösterilir.
- Örnek: Pazartesi 1.000, Salı metric yok, Çarşamba 1.600 -> 1.000, 0, 600. Son 600'ün gerçek hayatta hangi gün geldiği bilinmez; ölçüm gününe yazılır, eksik güne uydurulmuş dağıtım yapılmaz.
- Dönem öncesi snapshot varsa ilk günün fark hesabında baseline olarak kullanılır. Dönem sonrası metric güncel kartı etkileyebilir; dönem chart'ına eklenmez. Case tarih sonrası kazancın kesileceğini söylemediğinden öneri son metric formülünü sürdürmektir.
- Approval/rejection/ingest sonrası hangi query cache'lerinin yenileneceği [procedure planında](PROCEDURE_PLAN.md) tanımlıdır.

Uygulama sınırı: Kampanya dönemi en çok 366 gündür; tarih grafiğinin kontrolsüz büyümesini önler.
