# TorrentDeck

A self-hosted torrent search and download manager that runs on your Unraid server. Search across multiple sources simultaneously, see content type and quality badges on every result, and send torrents directly to qBittorrent — all from one clean web UI.

---

## Features

- **Multi-source search** — queries several public torrent indexes at the same time and merges the results
- **Content type detection** — automatically labels every result as Movie, Episode (S01E05), Season Pack, Complete Series, Anime Ep, Anime Batch, etc.
- **Type filter** — after a search, filter results by content type with one click
- **Quality filter** — filter results by resolution/source (4K, 1080p, 720p, 480p, BluRay, WEB, HDTV, CAM) — only shows options that exist in the current results
- **Per-torrent save path** — choose exactly which folder a torrent downloads to, with configurable quick-fill shortcuts for your common folders
- **One-click add** — sends the magnet link straight to qBittorrent with a single click
- **Live queue** — shows your qBittorrent download queue with progress bars, speeds, and pause/resume/delete controls, refreshing every 4 seconds
- **Clickable titles** — click any torrent name to open its page on the source site in a new tab
- **Metadata popovers** — click the `i` button on any result to see the poster, rating, and synopsis (requires a free API key — see configuration)
- **9 themes** — dark and light colour themes selectable from the top-right menu, remembered across sessions
- **Persistent preferences** — source toggles and theme choice are saved and restored on every page load
- **Bitmagnet integration** — optional self-hosted DHT crawler that becomes an additional local search source
- **Prowlarr integration** — optional connection to your existing Prowlarr instance to search all of its configured indexers
- **Mobile-friendly** — responsive layout with a bottom tab bar on phones and tablets

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

Copy the files from the zip preserving the folder structure:

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

---

### Step 2 — Configure docker-compose.yml

Open the compose file and update it to match your setup:

```bash
nano /mnt/user/appdata/torrentdeck/docker-compose.yml
```

At minimum, set your qBittorrent credentials:

```yaml
- QB_HOST=http://localhost:8080   # change port if yours is different
- QB_USER=admin                    # your qBittorrent username
- QB_PASS=adminadmin               # ← your actual password
```

If you use a mapped download path (e.g. qBittorrent's `/downloads` maps to `/mnt/user/Share/Jellyfin/`), also configure your folder shortcuts — see the [Save path configuration](#save-path-configuration) section below.

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
  -e PORT=3000 \
  torrentdeck
```

---

### Step 4 — Open in your browser

```
http://YOUR-UNRAID-IP:3000
```

Find your Unraid IP under **Settings → Network Settings**.

---

## Environment variables

| Variable              | Default                                                                        | Description                                                                    |
|-----------------------|--------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `QB_HOST`             | `http://localhost:8080`                                                        | Full URL to your qBittorrent Web UI                                            |
| `QB_USER`             | `admin`                                                                        | qBittorrent username                                                           |
| `QB_PASS`             | *(empty)*                                                                      | qBittorrent password                                                           |
| `QB_DOWNLOAD_PATHS`   | `Movies:/downloads/Movies,Shows:/downloads/Shows,Downloads:/downloads`        | Comma-separated folder shortcuts for the save path modal (see below)           |
| `BITMAGNET_HOST`      | `http://localhost:3333`                                                        | URL to your Bitmagnet instance (optional)                                      |
| `TMDB_API_KEY`        | *(empty)*                                                                      | API key for metadata popovers (optional)                                       |
| `PROWLARR_HOST`       | *(empty)*                                                                      | URL to your Prowlarr instance (optional)                                       |
| `PROWLARR_KEY`        | *(empty)*                                                                      | Prowlarr API key — found in Prowlarr → Settings → General (optional)          |
| `PORT`                | `3000`                                                                         | Port TorrentDeck listens on                                                    |

---

## Save path configuration

Every time you click `+ Add`, a modal appears showing the torrent name and a path input. You can type any path, or click a quick-fill button to instantly fill a common folder.

These buttons are driven by the `QB_DOWNLOAD_PATHS` environment variable. The format is:

```
Label:containerPath,Label:containerPath,...
```

Where `containerPath` is the path **qBittorrent sees inside its container** — not the Unraid host path.

**Example:** if qBittorrent has `/downloads` mapped to `/mnt/user/Share/Jellyfin/`, and you have `Movies` and `Shows` folders inside that:

```yaml
- QB_DOWNLOAD_PATHS=Movies:/downloads/Movies,Shows:/downloads/Shows,Downloads:/downloads
```

This shows three buttons — **Movies**, **Shows**, and **Downloads** — that fill `/downloads/Movies`, `/downloads/Shows`, and `/downloads` respectively.

The last path you used is remembered and pre-filled next time. Leave the field blank to use qBittorrent's default download directory.

---

## Themes

Click the **🎨 Theme** button in the top-right corner of the header to open the theme picker. Nine themes are available:

| Theme       | Type  | Description                              |
|-------------|-------|------------------------------------------|
| 🌙 Midnight | Dark  | Deep navy blue — the default             |
| ⚫ Abyss    | Dark  | Pure black with high-contrast accents    |
| 🌲 Forest   | Dark  | Dark earthy green                        |
| 🌅 Sunset   | Dark  | Deep warm dark with orange/amber tones   |
| 🩶 Slate    | Dark  | Cool muted grey-blue                     |
| 🌸 Rose     | Dark  | Dark mauve with pink/violet accents      |
| ⚡ Neon     | Dark  | Near-black with vivid electric accents — good for low-brightness screens |
| 🧊 Arctic   | Light | Clean white and light blue               |
| ☕ Latte    | Light | Warm off-white with coffee tones         |

Your choice is saved to the browser and restored on every page load. The two light themes (Arctic and Latte) and the Neon theme are especially useful on low-brightness screens.

---

## Search sources

TorrentDeck searches several indexes simultaneously. Toggle any source on or off with the pill buttons in the search bar — your selection is saved and restored across page refreshes.

| Category       | Description                                                               |
|----------------|---------------------------------------------------------------------------|
| General        | Broad indexes covering movies, TV, software, games, and more              |
| Movies         | Dedicated movie index with quality metadata included in results           |
| TV             | Dedicated TV episode index, works best for recently aired shows           |
| Anime          | Anime-focused index via RSS feed                                          |
| Bitmagnet      | Your local self-hosted DHT crawler — no external requests needed          |
| Prowlarr       | Fans out to every indexer configured in your Prowlarr instance            |

---

## Content type detection

Every result is automatically classified:

| Badge        | Meaning                                           |
|--------------|---------------------------------------------------|
| Movie        | Film (detected from quality tags or category)     |
| S01E05       | Single TV episode                                 |
| S01E01-E03   | Multiple episodes bundled in one torrent          |
| S02          | Full single season                                |
| Complete     | Multiple seasons or complete series run           |
| Anime Ep     | Single anime episode (group-tagged release)       |
| Batch        | Multi-episode anime pack e.g. [01-26]             |
| ?            | Could not be determined                           |

Hover any badge to see the full detail (e.g. "Season 2, Episode 7").

---

## Filters

After searching, two filter rows appear above the results:

**Type filter** — shows only content matching the selected type (Movie, Episode, Season Pack, etc.). Only types that appear in the current results are shown. Displays the count for each.

**Quality filter** — shows only results matching the selected quality. Detected from the torrent title:

| Filter  | Matches                              |
|---------|--------------------------------------|
| 4K      | 2160p, 4K UHD, UHD                   |
| 1080p   | 1080p, 1080i                         |
| 720p    | 720p, 720i                           |
| 480p    | 480p, 480i                           |
| BluRay  | BluRay, BDRip, BD Remux, REMUX       |
| WEB     | WEB-DL, WEBRip, AMZN, NF, HULU      |
| HDTV    | HDTV                                 |
| CAM     | CAMRip, HDCAM, TS, TeleSync, DVDSCR  |

Both filters can be active at the same time — e.g. you can show only 1080p Season Packs. Click a filter again or click "All" to clear it.

---

## Metadata popovers (optional)

Click the `i` button next to any result title to see a popover with the poster image, rating, vote count, and synopsis from a movie/TV metadata service. Requires a free API key.

To enable, add your key to `docker-compose.yml`:

```yaml
- TMDB_API_KEY=your_key_here
```

If no key is set, clicking `i` will show instructions explaining how to get one.

---

## Bitmagnet (optional but recommended)

Bitmagnet is a self-hosted DHT crawler that builds its own torrent index over time. Once it has crawled for a day or two it becomes the most reliable source in TorrentDeck — it requires no external network requests and returns enriched metadata.

### Installing Bitmagnet on Unraid

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

```bash
docker-compose up -d
```

Access its web UI at `http://YOUR-UNRAID-IP:3333`. TorrentDeck connects to it automatically once it's running.

> **Note:** The index starts empty and fills up over time as the DHT crawler discovers content.

---

## Prowlarr (optional)

If you already run Prowlarr, TorrentDeck can search through all of its configured indexers in one go. Add your credentials to `docker-compose.yml`:

```yaml
- PROWLARR_HOST=http://localhost:9696
- PROWLARR_KEY=your_prowlarr_api_key
```

Your API key is in Prowlarr under **Settings → General**. The Prowlarr source pill appears in the filter bar automatically once both values are set.

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
  -e QB_DOWNLOAD_PATHS=Movies:/downloads/Movies,Shows:/downloads/Shows,Downloads:/downloads \
  -e BITMAGNET_HOST=http://localhost:3333 \
  -e PORT=3000 \
  torrentdeck
```

**Frontend-only update** (changed `index.html` only — no server changes):

```bash
docker cp public/index.html torrentdeck:/app/public/index.html
```

Then hard-refresh with `Ctrl+Shift+R`.

---

## Checking logs

```bash
docker logs torrentdeck          # last output
docker logs torrentdeck -f       # follow live
```

On startup the logs confirm the qBittorrent connection status, Bitmagnet availability, and which sources are reachable. Every search logs the result count per source so you can immediately see what's working.

---

## Troubleshooting

**qBittorrent shows as offline**
- Check that `QB_PASS` matches your actual qBittorrent password
- Verify the port — check the Web UI port mapping in the Unraid Docker tab
- If qBittorrent restricts access by IP, add the Docker host IP to its whitelist under **Settings → Web UI → IP Filtering**

**A source shows as failed**
- That source is temporarily unreachable — the other sources continue to work
- Sources using direct APIs are more stable than those relying on HTML scraping
- Run `docker logs torrentdeck` to see the specific error

**Torrents are downloading to the wrong folder**
- Make sure you're using the **container path** in `QB_DOWNLOAD_PATHS`, not the Unraid host path
- Example: if `/downloads` maps to `/mnt/user/Share/Jellyfin/`, use `/downloads/Movies` not `/mnt/user/Share/Jellyfin/Movies`
- Check qBittorrent's path mapping under **Settings → Downloads** in its web UI

**Metadata popovers not working**
- Confirm `TMDB_API_KEY` is set correctly in your environment
- Click the `i` button — if the key isn't configured it will show setup instructions

**Quality filter not showing**
- The quality filter row only appears when results contain recognisable quality tags (1080p, BluRay, etc.) in the torrent titles
- Results from sources that don't include quality info in the title will not be filterable by quality

**Container can't reach qBittorrent or Bitmagnet**
- TorrentDeck uses `--network host` by default, so `localhost` inside the container refers to the Unraid host
- If you switched to bridge networking, change `QB_HOST` to `http://host.docker.internal:8080` and add `--add-host=host.docker.internal:host-gateway` to your run command

---

## File structure

```
torrentdeck/
├── Dockerfile            # Node 20 Alpine image
├── docker-compose.yml    # All environment variables and networking config
├── package.json          # Dependencies
├── server.js             # Express server — sources, qBT proxy, TMDB proxy, API routes
└── public/
    └── index.html        # Single-page frontend — all UI, themes, filters, and state
```

No database, no build pipeline, no external state. Everything runs from a single Node process serving static HTML.
