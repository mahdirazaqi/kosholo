# Deploying Kosholo on a server (VPS)

This guide walks you step by step through running Kosholo on an Ubuntu 24.04 server with Docker. Don't worry if you've never set up a server before; just run the commands in order.

The app is made of three Docker services:

| Service | Job | Reachable from outside |
|---|---|---|
| `caddy` | Gets HTTPS certificates automatically and forwards requests to the app | ports 80 and 443 |
| `app` | Kosholo itself (Next.js + Socket.IO + ffmpeg) | no (only through Caddy) |
| `db` | PostgreSQL database | no |

Data lives in Docker volumes and survives updates:
`pgdata` (database), `uploads` (photos, videos, voice messages and sent files; by far the largest), `caddy_data` (certificates).

> **Note:** every `docker compose` command in this guide must be run inside the project folder and always with
> `--env-file .env.production -f docker-compose.prod.yml`. To keep things short, section 6 creates an alias.

---

## 1. Server requirements

- **OS:** Ubuntu 24.04 LTS
- **CPU and memory:** at least 2 cores and 2 GB RAM (4 GB is more comfortable). Building the image needs memory, so section 3 also adds swap.
- **Disk:** at least 20 GB, and plan for growth: users can send files of up to 2 GB each (`MAX_FILE_SIZE_MB`), stored as they are. See section 11, "Managing disk space".
- **A domain** (e.g. `chat.example.com`) whose DNS records you can edit.
- Root access over SSH (your hosting provider usually gives you a password or key).

## 2. DNS setup

In your domain's control panel, create a record:

| Type | Name | Value |
|---|---|---|
| `A` | `chat` (or `@` for the bare domain) | the server's IP address |

If the server has IPv6, also create an `AAAA` record with the IPv6 address (if it doesn't, don't create an AAAA record).

> If you use Cloudflare or a similar service, **turn the proxy off** for this record (grey cloud, "DNS only"), otherwise Caddy can't get a certificate.

Wait a few minutes, then check from your own computer:

```bash
ping chat.example.com
```

It should show your server's IP.

## 3. Preparing the server

### Log in with SSH

```bash
ssh root@SERVER_IP
```

### Update the system

```bash
apt update && apt upgrade -y
apt install -y git curl ufw
```

### Create a non-root user

Working as root day to day is dangerous. Create a new user (here `deploy`):

```bash
adduser deploy            # pick a strong password; you can leave the other questions blank
usermod -aG sudo deploy
```

If you log in with an SSH key, copy it to the new user too:

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Now log out and log back in as the new user:

```bash
exit
ssh deploy@SERVER_IP
```

From here on, everything is done as the `deploy` user.

### Firewall (UFW)

Only SSH, HTTP and HTTPS stay open:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp    # HTTP/3
sudo ufw enable
sudo ufw status
```

> **Important:** allow `OpenSSH` before running `ufw enable`, or you'll lock yourself out.
> If you changed the SSH port, open that port instead (`sudo ufw allow 2222/tcp`).

### A 2 GB swap file

Prevents running out of memory while building the image or processing videos:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h     # the Swap row should show about 2.0Gi
```

## 4. Installing Docker

Run Docker's official install script:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Log out and back in once (`exit`, then `ssh deploy@SERVER_IP`) so the docker group membership applies, then check:

```bash
docker version
docker compose version
```

### Optional mirrors (if Docker Hub / npm are blocked or slow in your region)

If `get.docker.com` doesn't load, install Docker from your hosting provider's mirror (many providers document this) or try `sudo apt install -y docker.io docker-compose-v2`.

There are three places you can point at a mirror:

**A) A Docker Hub mirror for the whole server** — create `/etc/docker/daemon.json` (replace the address with a mirror you can reach):

```bash
sudo nano /etc/docker/daemon.json
```

```json
{
  "registry-mirrors": ["https://docker.example-mirror.com"]
}
```

```bash
sudo systemctl restart docker
docker pull hello-world     # test
```

This is enough for the official images (`node`, `postgres`, `caddy`); nothing else needs to change.

**B) Full image names in `.env.production`** — if the mirror works as a separate registry, prefix the image names with it:

```bash
NODE_IMAGE=docker.example-mirror.com/library/node:24.11-trixie-slim
POSTGRES_IMAGE=docker.example-mirror.com/library/postgres:17.6
CADDY_IMAGE=docker.example-mirror.com/library/caddy:2.10.2
```

> Don't change the versions; only add the mirror prefix.

**C) npm and Debian mirrors for the image build** — in `.env.production`:

```bash
NPM_REGISTRY=https://npm.example-mirror.com/
APT_MIRROR=http://debian.example-mirror.com/debian
```

`NPM_REGISTRY` is used to install JavaScript packages and `APT_MIRROR` to install ffmpeg. If they're empty or left at their defaults, the official sources are used.

## 5. Getting the code and configuring `.env.production`

```bash
cd ~
git clone https://github.com/YOUR_USER/kosholo.git
cd kosholo
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate two random values:

```bash
openssl rand -hex 24      # for the database password
openssl rand -base64 48   # for JWT_SECRET
```

Open the file:

```bash
nano .env.production
```

and fill in the following (each variable is also explained inside the file):

| Variable | Description |
|---|---|
| `DOMAIN` | The domain you set up in section 2, e.g. `chat.example.com` (without `https://`) |
| `ACME_EMAIL` | Your email; Let's Encrypt sends certificate warnings to it |
| `POSTGRES_USER` / `POSTGRES_DB` | Can stay `kosholo` |
| `POSTGRES_PASSWORD` | Output of `openssl rand -hex 24` |
| `DATABASE_URL` | Put the same password here too: `postgresql://kosholo:PASSWORD@db:5432/kosholo` |
| `JWT_SECRET` | Output of `openssl rand -base64 48` (at least 32 characters). Changing it signs every user out |
| `UPLOAD_DIR` | Leave as is (`/app/uploads`) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Leave as is |
| `FFMPEG_TIMEOUT_SECONDS` | Maximum processing time per video/audio file (default 120 seconds) |
| `MAX_FILE_SIZE_MB` | Largest file users can send, in MB (default `2048` = 2 GB). Files are stored byte-for-byte, so this is also the most disk one upload can take. Also baked into the image for the in-app check: rebuild after changing it (`scripts/deploy.sh` does) |
| `NEXT_PUBLIC_MAP_TILE_URL` | Map tile URL template for location messages, with `{z}/{x}/{y}` and optionally `{s}`. **Set this to your own provider in production** (see "Map tiles" below). Baked into the image: rebuild after changing |
| `NEXT_PUBLIC_MAP_SUBDOMAINS` | Letters/values that replace `{s}` (default `abc`) |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | The provider's required attribution text, shown on every map |
| `NEXT_PUBLIC_MAP_MAX_ZOOM` | The provider's maximum zoom (default `19`) |
| `NODE_IMAGE` / `POSTGRES_IMAGE` / `CADDY_IMAGE` | Images; change only for a mirror (section 4) |
| `NPM_REGISTRY` / `APT_MIRROR` | npm and Debian mirrors (section 4) |
| `HTTP_PORT` / `HTTPS_PORT` | Keep 80 and 443 on a real server |

> The database password should contain only letters and digits (the output of `openssl rand -hex` does); characters like `@` and `/` break the `DATABASE_URL`.

> `.env.production` contains secrets; never commit it or send it to anyone.

### Map tiles

Location messages show maps drawn from a tile server. The default (`tile.openstreetmap.org`) is for development only: OpenStreetMap's public tile servers [don't allow heavy use](https://operations.osmfoundation.org/policies/tiles/) and may block your users.

For production, pick a tile provider, create an API key, and put its URL template and attribution in `.env.production`. Choose one that is fast and reachable for your users (for an audience in Iran, Neshan or Map.ir; elsewhere, providers like MapTiler, Stadia Maps or Thunderforest). For example:

```dotenv
NEXT_PUBLIC_MAP_TILE_URL=https://tiles.example-provider.com/{z}/{x}/{y}.png?key=YOUR_KEY
NEXT_PUBLIC_MAP_SUBDOMAINS=
NEXT_PUBLIC_MAP_ATTRIBUTION=© Example Provider © OpenStreetMap contributors
NEXT_PUBLIC_MAP_MAX_ZOOM=19
```

The key is visible to browsers (every tile request carries it), so restrict it to your domain in the provider's dashboard. The browser loads tiles directly from the provider; the app's service worker caches up to 500 tiles for 7 days on each device.

Then rebuild: `scripts/deploy.sh` (these values are compiled into the app).
## 6. First launch

Create an alias to keep commands short:

```bash
echo "alias dc='docker compose --env-file .env.production -f docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
```

Build and run (the first build can take 5 to 15 minutes):

```bash
dc build
dc up -d
scripts/wait-healthy.sh
```

When you see "✓ App is healthy", open `https://chat.example.com` in your browser. Getting the certificate takes a few seconds the first time. Create the first account from the sign-up page.

Database migrations run automatically every time the app starts; no manual step is needed.

Useful commands:

```bash
dc ps                    # service status (app should be healthy)
dc logs -f app           # live app logs (exit with Ctrl+C)
dc logs --tail=100 caddy # Caddy logs (certificate problems show up here)
dc restart app           # restart the app
dc down                  # stop everything (data is kept)
```

> **Never** run `dc down -v` unless you want to delete all data (messages, files, certificates).

> On the server, always use `dc` (or the full command with `-f docker-compose.prod.yml`). A bare `docker compose` runs `docker-compose.yml`, which is only for development on your own computer.

> If you edit the `Caddyfile` on the server by hand, run `dc restart caddy` afterwards. (`deploy.sh` does this itself when an update changed the Caddyfile.)

## 7. Updating

Whenever a new version is ready:

```bash
cd ~/kosholo
scripts/backup.sh     # just in case, before updating
scripts/deploy.sh
```

`deploy.sh` does the following: pulls the latest code (`git pull`), builds the new image, replaces the app, removes old images and waits until the app is healthy. If the app doesn't come up healthy, it prints its latest logs.

During the switch the app is unavailable for a few seconds; users reconnect automatically.

## 8. Backups

```bash
scripts/backup.sh
```

This creates a folder like `backups/2026-01-31_0400/` containing:

- `db.dump` — a full copy of the database
- `uploads.tar.gz` — all uploaded files (unfinished uploads in `tmp/` and `upload-sessions/` are skipped)
- `SHA256SUMS` — to verify the files are intact

Only the last 7 backups are kept (for more: `KEEP_BACKUPS=14 scripts/backup.sh`).

Sent files (documents, up to `MAX_FILE_SIZE_MB` each) can make `uploads.tar.gz` very large, and 7 copies of it may not fit on the server. To leave them out:

```bash
scripts/backup.sh --skip-files
```

This keeps photos, videos, voice messages, avatars and all thumbnails. A good routine: nightly backups with `--skip-files`, plus a full backup (without the flag) once a week, copied off the server and then deleted locally. See section 11.

### Automatic nightly backup at 4 AM

```bash
crontab -e
```

Add this line at the end of the file:

```cron
0 4 * * * cd /home/deploy/kosholo && scripts/backup.sh --skip-files >> backups/cron.log 2>&1
```

and, for a weekly full backup on Sunday nights (copy it off the server, see below):

```cron
0 5 * * 0 cd /home/deploy/kosholo && KEEP_BACKUPS=14 scripts/backup.sh >> backups/cron.log 2>&1
```

> The time follows the server's time zone. Check it with `timedatectl` and change it if you like, e.g. `sudo timedatectl set-timezone Europe/Berlin`. (This only affects cron and logs; the app shows dates in each viewer's own time zone.)

### Copying backups off the server

A backup that lives only on the server is lost along with the server. Run this on **your own computer** (not the server):

```bash
# all backups (only changes are transferred)
rsync -avz deploy@SERVER_IP:kosholo/backups/ ~/kosholo-backups/

# or a single one
scp -r deploy@SERVER_IP:kosholo/backups/2026-01-31_0400 ~/kosholo-backups/
```

Doing this once a week is a good idea.

## 9. Restoring from a backup

> Restoring **completely replaces** the current database and files.

```bash
cd ~/kosholo
ls backups/                              # list backups
scripts/restore.sh backups/2026-01-31_0400
```

The script asks for confirmation (type `yes`), stops the app, restores the database and files, and starts the app again.

### Restoring on a new server

1. Follow sections 3 to 5 on the new server and use the **same** `.env.production` as before (especially `JWT_SECRET`; otherwise users have to sign in again).
2. Send the backup folder to the new server (from your own computer):
   ```bash
   scp -r ~/kosholo-backups/2026-01-31_0400 deploy@NEW_SERVER_IP:kosholo/backups/
   ```
3. On the new server:
   ```bash
   cd ~/kosholo
   dc build && dc up -d
   scripts/restore.sh backups/2026-01-31_0400
   ```
4. Point the DNS record at the new server's IP.

## 10. Troubleshooting

**The site doesn't load or shows a certificate error**
- Check `dc logs --tail=100 caddy`.
- Make sure the domain points to the right IP (`ping chat.example.com`) and the Cloudflare proxy is off.
- Ports 80 and 443 must be open (`sudo ufw status`) and not taken by another program (such as nginx or apache): `sudo ss -tlnp | grep -E ':80|:443'`.
- Let's Encrypt rate-limits repeated failed attempts; after fixing the problem, wait an hour.

**The app never becomes healthy**
- Check `dc logs --tail=100 app`. Common errors:
  - `JWT_SECRET must be at least 32 characters` → generate it with `openssl rand -base64 48`.
  - Database connection or password error → the password in `POSTGRES_PASSWORD` and `DATABASE_URL` must match. If you changed the password **after** the first run, Postgres still has the old one; put the old password back.
- After changing `.env.production`: `dc up -d` (the app is recreated with the new settings).

**The image build fails**
- Download errors (`timeout`, `ECONNRESET`, `pull access denied`) → set up mirrors (section 4).
- Memory errors (`Killed` or `JavaScript heap out of memory`) → check swap (`free -h`).
- Disk full → `df -h`, then `docker system prune` (removes unused images; data is kept).

**Messages don't arrive in real time (you have to refresh the page)**
- If you put another proxy or CDN in front of Caddy, it must support WebSockets.
- Check `dc logs app | grep -i socket`.

**Video uploads fail with a "processing took too long" error**
- The video is too heavy for the server. Raise `FFMPEG_TIMEOUT_SECONDS` in `.env.production` (e.g. 240) and run `dc up -d`, or get a more powerful server.

**The disk is full**
```bash
df -h
docker system df              # size of images and volumes
du -sh backups/*              # size of backups
docker system prune           # remove unused images and cache
```

**I want to look inside the database**
```bash
dc exec db psql -U kosholo -d kosholo
# \dt lists tables, \q quits
```

---

## 11. Managing disk space

The `uploads` volume is by far the biggest consumer of disk: every photo, video, voice message and sent file lives there. Files are stored exactly as uploaded (up to `MAX_FILE_SIZE_MB`, 2 GB by default), so **a handful of large files can fill a small VPS disk quickly**. When the disk is full, uploads fail, and the database can stop working too.

### Checking usage

```bash
df -h /                      # free space on the server's disk
docker system df             # space used by images, containers and volumes
docker system df -v | grep -E 'VOLUME|kosholo-prod'    # per volume (uploads, pgdata, …)
du -sh backups/              # local backups
```

Check this regularly, e.g. weekly, or set up an alert with your hosting provider.

### How the app protects the disk

- Before a file upload starts, the app checks the free space on the uploads disk and refuses with "Not enough space on the server" unless at least 2 GB would remain afterwards.
- Each user can have at most 3 uploads in progress and upload at most 10 GB per hour.
- Unfinished uploads (closed tab, lost connection) are deleted automatically after 24 hours, and unused uploads after a day.
- Deleted messages and chats remove their files from disk immediately.

### Freeing space

- `docker image prune -f` removes old app images (`scripts/deploy.sh` already does this after each update).
- Move old backups off the server (section 8) and delete them locally.
- Lower `MAX_FILE_SIZE_MB` and rebuild if large files are filling the disk too fast.
- If the server needs more room, the simplest fix is a bigger disk (or an extra volume) from your hosting provider.

### Backups of large uploads

A full `uploads.tar.gz` is about as large as the `uploads` volume itself. Use `scripts/backup.sh --skip-files` for daily backups and run a full backup less often (section 8), copying it off the server.

