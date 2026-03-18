# TorrentDeck — Unraid Setup Guide

A self-hosted torrent search + qBittorrent dashboard. Searches 1337x, RARBG/TGx, Nyaa, and your custom source — all from one UI.

---

## Quick Start (SSH into Unraid)

```bash
# 1. Create a folder for the app (use your Unraid appdata share)
mkdir -p /mnt/user/appdata/torrentdeck
cd /mnt/user/appdata/torrentdeck

# 2. Upload these files here (SCP, or paste via terminal):
#    server.js, package.json, Dockerfile, docker-compose.yml, public/index.html

# 3. Edit docker-compose.yml — set your qBittorrent password:
nano docker-compose.yml
#    Change QB_HOST if qBittorrent is on a different port
#    Change QB_PASS to your actual password

# 4. Build and start
docker compose up -d --build

# 5. Open in browser
# http://YOUR-UNRAID-IP:3000
```

---

## Environment Variables

| Variable  | Default                    | Description                           |
|-----------|----------------------------|---------------------------------------|
| QB_HOST   | http://localhost:8080      | qBittorrent Web UI URL                |
| QB_USER   | admin                      | qBittorrent username                  |
| QB_PASS   | (empty)                    | qBittorrent password                  |
| PORT      | 3000                       | TorrentDeck's HTTP port               |

---

## Adding via Unraid Docker UI (no SSH needed)

If you prefer Unraid's Docker tab:

1. Go to **Docker → Add Container**
2. Set **Repository** to `node:20-alpine` (you'll override the command)
3. Easier: just use the SSH method above with `docker compose up`

---

## Tips

- **No CORS setup needed** — the Node server talks to qBittorrent directly, no browser CORS issues
- **No login screen** — it's meant to run inside your LAN only
- **1337x magnet fetch** — for 1337x results, clicking "+ ADD" auto-fetches the magnet from the detail page server-side
- **Auto-refresh** — queue updates every 3.5 seconds automatically

---

## Updating

```bash
cd /mnt/user/appdata/torrentdeck
docker compose down
docker compose up -d --build
```
