# راهنمای راه‌اندازی کوشولو روی سرور (VPS)

این راهنما قدم‌به‌قدم کوشولو را روی یک سرور Ubuntu 24.04 با Docker بالا می‌آورد. اگر تا حالا سرور راه نینداخته‌اید هم نگران نباشید؛ فقط دستورها را به ترتیب اجرا کنید.

اپ از سه سرویس Docker تشکیل شده است:

| سرویس | کار | دسترسی از بیرون |
|---|---|---|
| `caddy` | گرفتن خودکار گواهی HTTPS و رساندن درخواست‌ها به اپ | پورت‌های ۸۰ و ۴۴۳ |
| `app` | خود کوشولو (Next.js + Socket.IO + ffmpeg) | ندارد (فقط از طریق Caddy) |
| `db` | پایگاه داده PostgreSQL | ندارد |

داده‌ها در «volume»های Docker نگه داشته می‌شوند و با به‌روزرسانی پاک نمی‌شوند:
`pgdata` (پایگاه داده)، `uploads` (عکس‌ها، ویدیوها و پیام‌های صوتی)، `caddy_data` (گواهی‌ها).

> **نکته:** همهٔ دستورهای `docker compose` در این راهنما باید داخل پوشهٔ پروژه اجرا شوند و همیشه با
> `--env-file .env.production -f docker-compose.prod.yml` همراه باشند. برای راحتی، در بخش ۶ یک میان‌بر (alias) می‌سازیم.

---

## ۱. سرور مورد نیاز

- **سیستم‌عامل:** Ubuntu 24.04 LTS
- **پردازنده و حافظه:** حداقل ۲ هسته و ۲ گیگابایت RAM (۴ گیگابایت راحت‌تر است). ساخت image به حافظه نیاز دارد؛ برای همین در بخش ۳ «swap» هم اضافه می‌کنیم.
- **دیسک:** حداقل ۲۰ گیگابایت. فایل‌های آپلودی و نسخه‌های پشتیبان به مرور جا می‌گیرند؛ هر چه بیشتر، بهتر.
- **یک دامنه** (مثلاً `chat.example.com`) که بتوانید رکورد DNS آن را تنظیم کنید.
- دسترسی root از طریق SSH (معمولاً شرکت میزبانی رمز یا کلید آن را به شما می‌دهد).

## ۲. تنظیم DNS

در پنل دامنه‌تان یک رکورد بسازید:

| نوع | نام | مقدار |
|---|---|---|
| `A` | `chat` (یا `@` برای خود دامنه) | آدرس IP سرور |

اگر سرور IPv6 دارد، یک رکورد `AAAA` هم با آدرس IPv6 بسازید (اگر ندارد، رکورد AAAA نسازید).

> اگر از Cloudflare یا سرویس مشابه استفاده می‌کنید، برای این رکورد **پروکسی را خاموش کنید** (ابر خاکستری، «DNS only»)، وگرنه Caddy نمی‌تواند گواهی بگیرد.

چند دقیقه صبر کنید و روی کامپیوتر خودتان بررسی کنید:

```bash
ping chat.example.com
```

باید IP سرورتان را نشان دهد.

## ۳. آماده‌سازی سرور

### ورود با SSH

```bash
ssh root@SERVER_IP
```

### به‌روزرسانی سیستم

```bash
apt update && apt upgrade -y
apt install -y git curl ufw
```

### ساخت یک کاربر غیر root

کار روزمره با root خطرناک است. یک کاربر جدید (اینجا `deploy`) بسازید:

```bash
adduser deploy            # یک رمز قوی بدهید؛ بقیهٔ سؤال‌ها را می‌توانید خالی رد کنید
usermod -aG sudo deploy
```

اگر با کلید SSH وارد می‌شوید، کلید را برای کاربر جدید هم کپی کنید:

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

حالا از سرور خارج شوید و با کاربر جدید وارد شوید:

```bash
exit
ssh deploy@SERVER_IP
```

از این به بعد همه چیز با کاربر `deploy` انجام می‌شود.

### دیوار آتش (UFW)

فقط SSH، HTTP و HTTPS باز می‌مانند:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp    # HTTP/3
sudo ufw enable
sudo ufw status
```

> **مهم:** قبل از `ufw enable` حتماً `OpenSSH` را اجازه داده باشید، وگرنه دسترسی‌تان قطع می‌شود.
> اگر پورت SSH را عوض کرده‌اید، همان پورت را باز کنید (`sudo ufw allow 2222/tcp`).

### فایل swap دو گیگابایتی

جلوی کمبود حافظه در زمان ساخت image و پردازش ویدیو را می‌گیرد:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h     # باید سطر Swap حدود 2.0Gi نشان دهد
```

## ۴. نصب Docker

اسکریپت رسمی Docker را اجرا کنید:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

یک بار خارج و دوباره وارد شوید (`exit` و `ssh deploy@SERVER_IP`) تا عضویت در گروه docker اعمال شود، سپس بررسی کنید:

```bash
docker version
docker compose version
```

### اگر Docker Hub یا npm از سرور در دسترس نیست (سرورهای داخل ایران)

اگر `get.docker.com` باز نمی‌شود، Docker را از مخزن آینهٔ شرکت میزبانی‌تان نصب کنید (بیشتر دیتاسنترهای ایرانی راهنمای آن را دارند) یا `sudo apt install -y docker.io docker-compose-v2` را امتحان کنید.

سه جا را می‌توان به آینه (mirror) وصل کرد:

**الف) آینهٔ Docker Hub برای کل سرور** — فایل `/etc/docker/daemon.json` را بسازید (آدرس را با آینه‌ای که در دسترس دارید عوض کنید):

```bash
sudo nano /etc/docker/daemon.json
```

```json
{
  "registry-mirrors": ["https://docker.example-mirror.ir"]
}
```

```bash
sudo systemctl restart docker
docker pull hello-world     # آزمایش
```

این روش برای imageهای رسمی (`node`، `postgres`، `caddy`) کافی است و نیازی به تغییر دیگری نیست.

**ب) نام کامل image در `.env.production`** — اگر آینه به‌صورت registry جدا کار می‌کند، نام imageها را با پیشوند آن بنویسید:

```bash
NODE_IMAGE=docker.example-mirror.ir/library/node:24.11-trixie-slim
POSTGRES_IMAGE=docker.example-mirror.ir/library/postgres:17.6
CADDY_IMAGE=docker.example-mirror.ir/library/caddy:2.10.2
```

> نسخه‌ها را عوض نکنید؛ فقط پیشوند آینه را اضافه کنید.

**ج) آینهٔ npm و Debian برای ساخت image** — در `.env.production`:

```bash
NPM_REGISTRY=https://npm.example-mirror.ir/
APT_MIRROR=http://debian.example-mirror.ir/debian
```

`NPM_REGISTRY` برای نصب بسته‌های JavaScript و `APT_MIRROR` برای نصب ffmpeg استفاده می‌شود. اگر خالی یا پیش‌فرض بمانند، از منابع رسمی دانلود می‌شود.

## ۵. دریافت کد و تنظیم `.env.production`

```bash
cd ~
git clone https://github.com/YOUR_USER/kosholo.git
cd kosholo
cp .env.production.example .env.production
chmod 600 .env.production
```

دو مقدار تصادفی بسازید:

```bash
openssl rand -hex 24      # برای رمز پایگاه داده
openssl rand -base64 48   # برای JWT_SECRET
```

فایل را باز کنید:

```bash
nano .env.production
```

و این‌ها را پر کنید (توضیح هر متغیر داخل خود فایل هم آمده است):

| متغیر | توضیح |
|---|---|
| `DOMAIN` | دامنه‌ای که در بخش ۲ تنظیم کردید، مثلاً `chat.example.com` (بدون `https://`) |
| `ACME_EMAIL` | ایمیل شما؛ Let's Encrypt هشدارهای گواهی را به آن می‌فرستد |
| `POSTGRES_USER` / `POSTGRES_DB` | می‌توانند همان `kosholo` بمانند |
| `POSTGRES_PASSWORD` | خروجی `openssl rand -hex 24` |
| `DATABASE_URL` | همان رمز را اینجا هم بگذارید: `postgresql://kosholo:رمز@db:5432/kosholo` |
| `JWT_SECRET` | خروجی `openssl rand -base64 48` (حداقل ۳۲ نویسه). تغییر آن همهٔ کاربران را از حساب خارج می‌کند |
| `UPLOAD_DIR` | دست نزنید (`/app/uploads`) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | دست نزنید |
| `FFMPEG_TIMEOUT_SECONDS` | حداکثر زمان پردازش هر ویدیو/صدا (پیش‌فرض ۱۲۰ ثانیه) |
| `NODE_IMAGE` / `POSTGRES_IMAGE` / `CADDY_IMAGE` | imageها؛ فقط برای آینه تغییر دهید (بخش ۴) |
| `NPM_REGISTRY` / `APT_MIRROR` | آینهٔ npm و Debian (بخش ۴) |
| `HTTP_PORT` / `HTTPS_PORT` | روی سرور واقعی همان ۸۰ و ۴۴۳ بمانند |

> رمز پایگاه داده بهتر است فقط حروف و عدد باشد (خروجی `openssl rand -hex` همین‌طور است)؛ نویسه‌هایی مثل `@` و `/` آدرس `DATABASE_URL` را خراب می‌کنند.

> `.env.production` رمزها را دارد؛ هرگز آن را commit یا برای کسی ارسال نکنید.

## ۶. اولین راه‌اندازی

یک میان‌بر بسازید تا دستورها کوتاه شوند:

```bash
echo "alias dc='docker compose --env-file .env.production -f docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
```

ساخت و اجرا (اولین ساخت ممکن است ۵ تا ۱۵ دقیقه طول بکشد):

```bash
dc build
dc up -d
scripts/wait-healthy.sh
```

وقتی «✓ App is healthy» را دیدید، `https://chat.example.com` را در مرورگر باز کنید. اولین بار گرفتن گواهی چند ثانیه طول می‌کشد. اولین حساب کاربری را از صفحهٔ ثبت‌نام بسازید.

مایگریشن‌های پایگاه داده هر بار که اپ بالا می‌آید خودکار اجرا می‌شوند؛ کار دستی لازم نیست.

دستورهای مفید:

```bash
dc ps                    # وضعیت سرویس‌ها (app باید healthy باشد)
dc logs -f app           # گزارش زندهٔ اپ (خروج با Ctrl+C)
dc logs --tail=100 caddy # گزارش Caddy (مشکلات گواهی اینجا دیده می‌شوند)
dc restart app           # راه‌اندازی دوبارهٔ اپ
dc down                  # خاموش کردن همه (داده‌ها حفظ می‌شوند)
```

> **هرگز** `dc down -v` اجرا نکنید مگر بخواهید همهٔ داده‌ها (پیام‌ها، فایل‌ها، گواهی‌ها) پاک شوند.

> روی سرور همیشه از `dc` (یا دستور کامل با `-f docker-compose.prod.yml`) استفاده کنید. `docker compose` خالی، فایل `docker-compose.yml` را اجرا می‌کند که فقط برای توسعه روی کامپیوتر خودتان است.

> اگر `Caddyfile` را روی سرور دستی ویرایش کردید، بعدش `dc restart caddy` بزنید. (`deploy.sh` اگر Caddyfile در به‌روزرسانی عوض شده باشد این کار را خودش می‌کند.)

## ۷. به‌روزرسانی

هر وقت نسخهٔ جدید آماده شد:

```bash
cd ~/kosholo
scripts/backup.sh     # احتیاطاً قبل از به‌روزرسانی
scripts/deploy.sh
```

`deploy.sh` این کارها را انجام می‌دهد: دریافت آخرین کد (`git pull`)، ساخت image جدید، جایگزینی اپ، پاک کردن imageهای قدیمی و صبر تا سالم شدن اپ. اگر اپ سالم بالا نیاید، آخرین گزارش‌هایش را نشان می‌دهد.

در هنگام جایگزینی، اپ چند ثانیه در دسترس نیست؛ کاربران خودکار دوباره وصل می‌شوند.

## ۸. پشتیبان‌گیری

```bash
scripts/backup.sh
```

یک پوشه مثل `backups/2026-01-31_0400/` می‌سازد با:

- `db.dump` — نسخهٔ کامل پایگاه داده
- `uploads.tar.gz` — همهٔ فایل‌های آپلودی
- `SHA256SUMS` — برای بررسی سالم بودن فایل‌ها

فقط ۷ نسخهٔ آخر نگه داشته می‌شوند (برای تعداد بیشتر: `KEEP_BACKUPS=14 scripts/backup.sh`).

### پشتیبان‌گیری خودکار هر شب ساعت ۴ صبح

```bash
crontab -e
```

این خط را به آخر فایل اضافه کنید:

```cron
0 4 * * * cd /home/deploy/kosholo && scripts/backup.sh >> backups/cron.log 2>&1
```

> ساعت بر اساس منطقهٔ زمانی سرور است. با `timedatectl` ببینید و اگر خواستید تنظیمش کنید: `sudo timedatectl set-timezone Asia/Tehran`

### کپی پشتیبان بیرون از سرور

پشتیبانی که فقط روی همان سرور باشد، با از دست رفتن سرور از دست می‌رود. روی **کامپیوتر خودتان** (نه سرور) اجرا کنید:

```bash
# همهٔ پشتیبان‌ها (فقط تغییرات منتقل می‌شوند)
rsync -avz deploy@SERVER_IP:kosholo/backups/ ~/kosholo-backups/

# یا فقط یک نسخه
scp -r deploy@SERVER_IP:kosholo/backups/2026-01-31_0400 ~/kosholo-backups/
```

بهتر است هفته‌ای یک بار این کار را انجام دهید.

## ۹. بازگردانی از پشتیبان

> بازگردانی، پایگاه داده و فایل‌های فعلی را **کاملاً جایگزین** می‌کند.

```bash
cd ~/kosholo
ls backups/                              # فهرست نسخه‌ها
scripts/restore.sh backups/2026-01-31_0400
```

اسکریپت تأیید می‌خواهد (`yes` را تایپ کنید)، اپ را متوقف می‌کند، پایگاه داده و فایل‌ها را برمی‌گرداند و اپ را دوباره بالا می‌آورد.

### بازگردانی روی یک سرور جدید

1. بخش‌های ۳ تا ۵ را روی سرور جدید انجام دهید و **همان** `.env.production` قبلی را استفاده کنید (به‌خصوص `JWT_SECRET`؛ وگرنه کاربران باید دوباره وارد شوند).
2. پوشهٔ پشتیبان را به سرور جدید بفرستید (از کامپیوتر خودتان):
   ```bash
   scp -r ~/kosholo-backups/2026-01-31_0400 deploy@NEW_SERVER_IP:kosholo/backups/
   ```
3. روی سرور جدید:
   ```bash
   cd ~/kosholo
   dc build && dc up -d
   scripts/restore.sh backups/2026-01-31_0400
   ```
4. رکورد DNS را به IP سرور جدید تغییر دهید.

## ۱۰. رفع اشکال

**سایت باز نمی‌شود یا خطای گواهی می‌دهد**
- `dc logs --tail=100 caddy` را ببینید.
- بررسی کنید دامنه به IP درست اشاره می‌کند (`ping chat.example.com`) و پروکسی Cloudflare خاموش است.
- پورت‌های ۸۰ و ۴۴۳ باید باز باشند (`sudo ufw status`) و برنامهٔ دیگری (مثل nginx یا apache) آن‌ها را نگرفته باشد: `sudo ss -tlnp | grep -E ':80|:443'`.
- Let's Encrypt برای تلاش‌های ناموفق مکرر محدودیت دارد؛ پس از رفع مشکل، یک ساعت صبر کنید.

**اپ healthy نمی‌شود**
- `dc logs --tail=100 app` را ببینید. خطاهای رایج:
  - `JWT_SECRET must be at least 32 characters` → مقدار را با `openssl rand -base64 48` بسازید.
  - خطای اتصال یا رمز پایگاه داده → رمز در `POSTGRES_PASSWORD` و `DATABASE_URL` باید یکی باشد. اگر رمز را **بعد از** اولین اجرا عوض کرده‌اید، Postgres هنوز رمز قبلی را دارد؛ رمز قبلی را برگردانید.
- بعد از تغییر `.env.production`: `dc up -d` (اپ با تنظیمات جدید دوباره ساخته می‌شود).

**ساخت image شکست می‌خورد**
- خطای دانلود (`timeout`، `ECONNRESET`، `pull access denied`) → آینه‌ها را تنظیم کنید (بخش ۴).
- خطای حافظه (`Killed` یا `JavaScript heap out of memory`) → swap را بررسی کنید (`free -h`).
- دیسک پر است → `df -h` و سپس `docker system prune` (imageهای بلااستفاده را پاک می‌کند؛ داده‌ها حفظ می‌شوند).

**پیام‌ها لحظه‌ای نمی‌رسند (باید صفحه را تازه کرد)**
- اگر جلوی Caddy پروکسی یا CDN دیگری گذاشته‌اید، باید از WebSocket پشتیبانی کند.
- `dc logs app | grep -i socket` را ببینید.

**آپلود ویدیو خطای «پردازش فایل بیش از حد طول کشید» می‌دهد**
- ویدیو برای سرور سنگین است. `FFMPEG_TIMEOUT_SECONDS` را در `.env.production` بیشتر کنید (مثلاً ۲۴۰) و `dc up -d` بزنید، یا سرور قوی‌تری بگیرید.

**دیسک پر شده است**
```bash
df -h
docker system df              # حجم imageها و volumeها
du -sh backups/*              # حجم پشتیبان‌ها
docker system prune           # پاک کردن imageها و cache بلااستفاده
```

**می‌خواهم ببینم داخل پایگاه داده چه خبر است**
```bash
dc exec db psql -U kosholo -d kosholo
# \dt برای فهرست جدول‌ها، \q برای خروج
```
