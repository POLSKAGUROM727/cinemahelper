# TorrentDeck

A self-hosted torrent search and download manager that runs on your Unraid server. Search across multiple sources simultaneously, see episode/season/movie type badges on every result, and send torrents directly to qBittorrent — all from one clean web UI.

---

## What it does

- **Multi-source search** — queries The Pirate Bay, YTS, EZTV, Nyaa, TorrentGalaxy, 1337x, and optionally Bitmagnet at the same time
- **Content type detection** — automatically labels every result as Movie, Episode (S01E05), Season Pack, Complete Series, Anime Ep, Anime Batch, etc.
- **Type filter** — after a search, filter results by type with one click (e.g. show only season packs)
- **One-click add** — sends the magnet link straight to qBittorrent; no copy/pasting
- **Live queue** — shows your qBittorrent download queue with progress bars, speeds, and pause/resume/delete controls, refreshing every 4 seconds
- **Clickable titles** — click any torrent name to open its page on the source site in a new tab
- **Bitmagnet integration** — if you run Bitmagnet locally it becomes an additional search source powered by DHT crawling

---

## Requirements

- Unraid server with Docker installed
- qBittorrent running with its Web UI enabled (the default Unraid community app works fine)
- SSH access to your Unraid server (or the Unraid terminal)

---

## Installation

### Step 1 — Copy the files to your server

SSH into your Unraid server and create the app directory:

```bash
mkdir -p /mnt/user/appdata/torrentdeck/public
cd /mnt/user/appdata/torrentdeck
```

Then copy these files from the zip into that directory, preserving the folder structure:

```
torrentdeck/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
└── public/
    └── index.html
```

You can do this via SCP from your computer:

```bash
scp -r ./torrentdeck/* root@YOUR-UNRAID-IP:/mnt/user/appdata/torrentdeck/
```

Or use the Unraid terminal to paste each file's contents directly.

---

### Step 2 — Set your qBittorrent password

Open `docker-compose.yml` and update the credentials to match your qBittorrent setup:

```bash
nano /mnt/user/appdata/torrentdeck/docker-compose.yml
```

Change these three lines:

```yaml
- QB_HOST=http://localhost:8080   # change port if yours is different
- QB_USER=admin                    # your qBittorrent username
- QB_PASS=adminadmin               # ← your actual password
```

If you don't know your qBittorrent port, open the Unraid Docker tab, click qBittorrent, and check the Web UI port mapping.

---

### Step 3 — Build and run

> **Note for Unraid users:** Unraid ships with an older Docker that uses `docker-compose` (with a hyphen) rather than the newer `docker compose` (with a space). Use whichever works on your system.

```bash
cd /mnt/user/appdata/torrentdeck

# Try this first (newer Docker):
docker compose up -d --build

# If that gives "unknown flag: --build", use this instead:
docker-compose up -d --build

# If neither works, build and run manually:
docker build -t torrentdeck .
docker run -d \
  --name torrentdeck \
  --restart unless-stopped \
  --network host \
  -e QB_HOST=http://localhost:8080 \
  -e QB_USER=admin \
  -e QB_PASS=yourpassword \
  -e BITMAGNET_HOST=http://localhost:3333 \
  -e PORT=3000 \
  torrentdeck
```

---

### Step 4 — Open in your browser

```
http://YOUR-UNRAID-IP:3000
```

Replace `YOUR-UNRAID-IP` with your server's local IP address (e.g. `192.168.1.100`). You can find this in Unraid under **Settings → Network Settings**.

---

## Environment variables

All configuration is done through environment variables in `docker-compose.yml`.

| Variable         | Default                   | Description                                      |
|------------------|---------------------------|--------------------------------------------------|
| `QB_HOST`        | `http://localhost:8080`   | Full URL to your qBittorrent Web UI              |
| `QB_USER`        | `admin`                   | qBittorrent username                             |
| `QB_PASS`        | *(empty)*                 | qBittorrent password                             |
| `BITMAGNET_HOST` | `http://localhost:3333`   | URL to your Bitmagnet instance (optional)        |
| `PORT`           | `3000`                    | Port TorrentDeck listens on                      |

---

## Search sources

| Source          | Type          | Method        | Notes                                                        |
|-----------------|---------------|---------------|--------------------------------------------------------------|
| The Pirate Bay  | General       | JSON API      | `apibay.org` — official TPB API, no scraping, very reliable |
| YTS             | Movies only   | JSON API      | `yts.mx` — clean API, includes magnet, seeds, and size      |
| EZTV            | TV shows only | JSON API      | `eztvx.to` — latest TV episodes, filters by your query      |
| Nyaa            | Anime         | RSS feed      | `nyaa.si` — parses `nyaa:infoHash` to build magnets         |
| TorrentGalaxy   | General       | HTML scraping | Falls back to SolidTorrents if TGx is unavailable            |
| 1337x           | General       | HTML scraping | Auto-tries 6 mirrors; magnet fetched on demand from detail page |
| Custom          | General       | HTML scraping | `heartiveloves.pages.dev` — your custom source               |
| Bitmagnet       | General       | GraphQL API   | Your local DHT crawler; see Bitmagnet section below          |

You can toggle any source on or off using the pill buttons in the search bar. Disabled sources are remembered for the session.

---

## Content type detection

Every result is automatically classified into one of these types:

| Badge          | Meaning                                         |
|----------------|-------------------------------------------------|
| Movie          | Film release (detected from quality tags or category) |
| S01E05         | Single TV episode                               |
| S01E01-E03     | Multi-episode pack                              |
| S02            | Full single season                              |
| Complete       | Multiple seasons or complete series run         |
| Anime Ep       | Single anime episode (group-tagged release)     |
| Batch          | Multi-episode anime pack e.g. `[01-26]`         |
| ?              | Could not be determined                         |

Hover any badge to see the full detail (e.g. "Season 2, Episode 7").

After searching, a **Type** filter row appears letting you show only the type you want — click "Season Pack" to hide everything else.

---

## Bitmagnet (optional but recommended)

Bitmagnet is a self-hosted DHT crawler that builds its own torrent index over time. Once it has crawled for a day or two it becomes the most reliable source in TorrentDeck because it requires no external network requests and returns TMDB-enriched metadata.

### Installing Bitmagnet on Unraid

Create a folder and compose file for it separately from TorrentDeck:

```bash
mkdir -p /mnt/user/appdata/bitmagnet
cd /mnt/user/appdata/bitmagnet
```

Create a `docker-compose.yml`:

```yaml
version: "3.8"

services:
  bitmagnet:
    image: ghcr.io/bitmagnet-io/bitmagnet:latest
    container_name: bitmagnet
    ports:
      - "3333:3333"
      - "3334:3334/tcp"
      - "3334:3334/udp"
    restart: unless-stopped
    environment:
      - POSTGRES_HOST=bitmagnet-postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - ./config:/root/.config/bitmagnet
    command:
      - worker
      - run
      - --keys=http_server
      - --keys=queue_server
      - --keys=dht_crawler
    depends_on:
      bitmagnet-postgres:
        condition: service_healthy

  bitmagnet-postgres:
    image: postgres:16-alpine
    container_name: bitmagnet-postgres
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    restart: unless-stopped
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=bitmagnet
      - PGUSER=postgres
    shm_size: 1g
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      start_period: 20s
      interval: 10s
```

Start it:

```bash
docker-compose up -d
```

Access its own web UI at `http://YOUR-UNRAID-IP:3333`. It starts crawling immediately — give it a day to build up a useful index. TorrentDeck will connect to it automatically once it's running.

> **Note:** Bitmagnet's index starts empty. Results will be sparse at first and improve over time as the DHT crawler discovers more content.

---

## Updating TorrentDeck

Replace the files in `/mnt/user/appdata/torrentdeck/` with the new versions, then rebuild:

```bash
cd /mnt/user/appdata/torrentdeck
docker stop torrentdeck && docker rm torrentdeck
docker build -t torrentdeck .
docker run -d \
  --name torrentdeck \
  --restart unless-stopped \
  --network host \
  -e QB_HOST=http://localhost:8080 \
  -e QB_USER=admin \
  -e QB_PASS=yourpassword \
  -e BITMAGNET_HOST=http://localhost:3333 \
  -e PORT=3000 \
  torrentdeck
```

If you only changed `public/index.html` (frontend-only update), you can skip the rebuild and just copy the file into the running container:

```bash
docker cp public/index.html torrentdeck:/app/public/index.html
```

Then hard-refresh your browser with `Ctrl+Shift+R`.

---

## Checking logs

To see what the server is doing (search results, errors, qBittorrent connection status):

```bash
docker logs torrentdeck
docker logs torrentdeck -f   # follow live
```

On startup the logs will show which 1337x mirror was selected, whether qBittorrent connected successfully, and whether Bitmagnet is reachable. Every search logs the result count from each source so you can see immediately which ones are working.

---

## Troubleshooting

**qBittorrent shows as offline**
- Check that `QB_PASS` in your environment matches your actual qBittorrent password
- Verify the port — the default is `8080` but yours may differ
- If qBittorrent is set to only allow connections from specific IPs, add the Docker host IP to its whitelist under **Settings → Web UI → IP Filtering**

**A source shows a red dot / "failed" label**
- That source is temporarily unreachable or blocking the request — the other sources still work
- 1337x and TorrentGalaxy are scraped HTML and can go down or change layout; TPB, YTS, and EZTV are proper APIs and are much more stable
- Check `docker logs torrentdeck` for the specific error message

**Nyaa results show 0 seeds and ? size (old version)**
- This was a known bug in earlier versions where the code looked for a `<magnetLink>` tag that doesn't exist in Nyaa's RSS. The current version reads `<nyaa:infoHash>` and builds the magnet link correctly. Rebuild from the latest files.

**1337x magnet fetch fails**
- 1337x requires fetching the detail page to get the magnet link, which is an extra network request that can fail if the mirror is being blocked
- TPB, YTS, EZTV, Nyaa, and Bitmagnet all return magnets directly in their search results with no detail page needed — use those sources for reliability

**Container can't reach qBittorrent or Bitmagnet**
- TorrentDeck uses `--network host` by default which means `localhost` inside the container refers to the Unraid host
- If you switched to bridge networking, change `QB_HOST` to `http://host.docker.internal:8080` and add `--add-host=host.docker.internal:host-gateway` to your `docker run` command

---

## File structure

```
torrentdeck/
├── Dockerfile            # Node 20 Alpine image, copies server + public
├── docker-compose.yml    # Environment variables and networking config
├── package.json          # Dependencies: express, axios, cheerio
├── server.js             # Express server — all scrapers, qBT proxy, API routes
└── public/
    └── index.html        # Single-page frontend — all UI, no build step needed
```

No database, no build pipeline, no external state. Everything runs from a single Node process serving static HTML.
