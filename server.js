'use strict';

const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT           = process.env.PORT           || 3000;
const QB_HOST        = (process.env.QB_HOST        || 'http://localhost:8080').replace(/\/$/, '');
const QB_USER        = process.env.QB_USER        || 'admin';
const QB_PASS        = process.env.QB_PASS        || '';
const BITMAGNET_HOST = (process.env.BITMAGNET_HOST || 'http://localhost:3333').replace(/\/$/, '');

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.dler.org:6969/announce',
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

function buildMagnet(hash, name) {
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${TRACKERS}`;
}
function fmtSize(bytes) {
  if (!bytes || isNaN(bytes)) return '?';
  const b = Number(bytes);
  if (b < 1024)      return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
function pad(n) { return String(n).padStart(2, '0'); }

// ─── Content classifier ───────────────────────────────────────────────────────
// Returns { type, label, detail }
// type: 'movie' | 'episode' | 'multi_ep' | 'season' | 'series' | 'anime_ep' | 'anime_pack' | 'unknown'

function classifyTitle(title, opts = {}) {
  const { tpbCat, bmType, bmSeasons, bmEpisodes } = opts;
  const t = title || '';

  // ── Bitmagnet has authoritative metadata ──
  if (bmType) {
    if (bmType === 'movie') {
      return { type: 'movie', label: 'Movie', detail: '' };
    }
    if (bmType === 'tv_episode' || bmType === 'TvEpisode') {
      if (bmSeasons?.length && bmEpisodes?.length) {
        const s = pad(bmSeasons[0]);
        const e = pad(bmEpisodes[0]);
        const label = `S${s}E${e}`;
        return { type: 'episode', label, detail: `Season ${+bmSeasons[0]}, Episode ${+bmEpisodes[0]}` };
      }
      return { type: 'episode', label: 'Episode', detail: '' };
    }
    if (bmType === 'tv_show' || bmType === 'TvShow') {
      if (bmSeasons?.length === 1) {
        return { type: 'season', label: `S${pad(bmSeasons[0])}`, detail: `Full Season ${bmSeasons[0]}` };
      }
      if (bmSeasons?.length > 1) {
        return { type: 'series', label: 'Series', detail: `Seasons ${bmSeasons[0]}–${bmSeasons[bmSeasons.length-1]}` };
      }
      return { type: 'series', label: 'Series', detail: '' };
    }
  }

  // ── TPB category codes ──
  if (tpbCat) {
    const cat = String(tpbCat);
    const MOVIE_CATS = ['201','202','203','207','208','209','210'];
    const TV_CATS    = ['205','208'];
    if (MOVIE_CATS.includes(cat) && !TV_CATS.includes(cat)) {
      // Still run title parse — a movie cat can contain season packs
    }
  }

  // ── Title pattern matching ──

  // Complete series: "Complete Series", "Seasons 1-5", "All Seasons", "S01-S05"
  if (/\b(complete[.\s_-]*series|all[.\s_-]*seasons?|[Ss]\d{1,2}\s*[-–to]+\s*[Ss]\d{1,2})\b/i.test(t) ||
      /\bseasons?\s*\d+\s*[-–to]+\s*\d+\b/i.test(t)) {
    const rng = t.match(/[Ss](\d{1,2})\s*[-–to]+\s*[Ss](\d{1,2})/i) ||
                t.match(/seasons?\s*(\d+)\s*[-–to]+\s*(\d+)/i);
    const detail = rng ? `Seasons ${rng[1]}–${rng[2]}` : 'Complete series';
    return { type: 'series', label: 'Complete', detail };
  }

  // Anime batch: "[01-26]", "Batch", "Episodes 1-26", "01-26" at end of common patterns
  if (/\b(batch|ep(?:isodes?)?\s*\d+\s*[-–]\s*\d+)\b/i.test(t) ||
      /\[\d{2,3}\s*[-–]\s*\d{2,3}\]/.test(t)) {
    const rng = t.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})/);
    const detail = rng ? `Episodes ${+rng[1]}–${+rng[2]}` : 'Anime batch';
    return { type: 'anime_pack', label: 'Batch', detail };
  }

  // Multi-episode: S01E01-E03, S01E01+E02, S01E01E02
  const multiEp = t.match(/[Ss](\d{1,2})[Ee](\d{2,3})(?:[Ee+\-](\d{2,3}))+/);
  if (multiEp) {
    const s     = pad(multiEp[1]);
    const eFrom = multiEp[2];
    const eTo   = multiEp[3] || multiEp[2];
    return { type: 'multi_ep', label: `S${s}E${eFrom}-E${eTo}`, detail: `Season ${+multiEp[1]}, Eps ${+eFrom}–${+eTo}` };
  }

  // Single episode: S01E05, S1E5
  const ep = t.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
  if (ep) {
    const s = pad(ep[1]), e = pad(ep[2]);
    return { type: 'episode', label: `S${s}E${e}`, detail: `Season ${+ep[1]}, Episode ${+ep[2]}` };
  }

  // x-notation: 2x05, 02x05
  const xep = t.match(/\b(\d{1,2})x(\d{2,3})\b/i);
  if (xep) {
    return { type: 'episode', label: `S${pad(xep[1])}E${xep[2]}`, detail: `Season ${+xep[1]}, Episode ${+xep[2]}` };
  }

  // Full season pack: "Season 2", "S02" without episode, "S02 Complete"
  const seasonOnly = t.match(/\b[Ss]eason\s*(\d{1,2})\b(?!\s*[Ee]\d)/) ||
                     t.match(/\b[Ss](\d{1,2})\b(?!\s*[Ee]\d)(?=.*\b(complete|pack|full|all)\b)/i);
  if (seasonOnly) {
    const sn = seasonOnly[1];
    return { type: 'season', label: `S${pad(sn)}`, detail: `Full Season ${sn}` };
  }

  // Anime single episode (common group format): "Show - 05 [720p]" or "Show - 05v2"
  const animeEp = t.match(/(?:[\s\-–_]|^)(\d{2,3})(?:v\d)?(?:\s*[\[\(]|\s*$)/);
  // Only treat as anime ep if title looks like an anime release (has group tag or resolution tag)
  if (animeEp && /[\[\(][^\]]*(?:sub|dub|fansub|720|1080|480|raw)/i.test(t)) {
    return { type: 'anime_ep', label: `Ep ${+animeEp[1]}`, detail: `Episode ${+animeEp[1]}` };
  }

  // Movie indicators: has quality tag but no TV markers
  const hasQuality = /\b(1080p|2160p|4K|UHD|BluRay|BDRip|DVDRip|WEBRip|WEB-DL|HDTV|HDRip|CAMRip|REMUX)\b/i.test(t);
  const hasTV      = /\b([Ss]\d{1,2}[Ee]\d{2}|[Ss]eason|[Ee]pisode)\b/i.test(t);
  if (hasQuality && !hasTV) {
    // TPB movie categories confirm it
    const cat = String(tpbCat || '');
    if (['201','202','203','207','208','209'].includes(cat) || !cat) {
      return { type: 'movie', label: 'Movie', detail: '' };
    }
  }

  // TPB TV category without matched episode pattern → probably a season pack
  if (String(tpbCat) === '205') {
    return { type: 'season', label: 'TV Pack', detail: 'TV season or pack' };
  }

  return { type: 'unknown', label: '?', detail: '' };
}

// Apply classifier to a result object and return enriched copy
function annotate(result, opts = {}) {
  const media = classifyTitle(result.title, opts);
  return { ...result, media };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function httpGet(url, opts = {}) {
  const { referer, cookies, timeout = 20000, json = false } = opts;
  const r = await axios.get(url, {
    timeout, maxRedirects: 5,
    validateStatus: s => s < 500,
    responseType: json ? 'json' : 'text',
    headers: {
      'User-Agent':      UA,
      'Accept':          json ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection':      'keep-alive',
      ...(referer ? { 'Referer': referer } : {}),
      ...(cookies ? { 'Cookie':  cookies } : {}),
    },
  });
  const setCookies = [].concat(r.headers['set-cookie'] || []);
  return { data: r.data, status: r.status, cookies: setCookies.map(c => c.split(';')[0]).join('; ') };
}

// ─── The Pirate Bay ───────────────────────────────────────────────────────────

async function searchTPB(q) {
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=0`;
  const { data } = await httpGet(url, { json: true, timeout: 15000 });
  if (!Array.isArray(data) || data[0]?.name === 'No results returned') return [];
  const results = data.map(t => annotate({
    title:    t.name || 'Unknown',
    size:     fmtSize(t.size),
    seeders:  +t.seeders  || 0,
    leechers: +t.leechers || 0,
    magnet:   buildMagnet(t.info_hash, t.name),
    source:   'TPB',
    skey:     'tpb',
  }, { tpbCat: t.category })).filter(r => r.magnet);
  console.log(`[TPB] ${results.length} results for "${q}"`);
  return results.slice(0, 40);
}

// ─── YTS — official movie JSON API (no scraping, no key needed) ──────────────

async function searchYTS(q) {
  const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&sort_by=seeds&limit=50&with_rt_ratings=false`;
  const { data } = await httpGet(url, { json: true, timeout: 15000 });
  if (data?.status !== 'ok') throw new Error(`YTS status: ${data?.status}`);
  const movies = data?.data?.movies;
  if (!movies?.length) { console.log(`[YTS] No results for "${q}"`); return []; }
  const results = [];
  for (const movie of movies) {
    for (const t of (movie.torrents || [])) {
      const magnet = t.magnet_url || buildMagnet(t.hash, `${movie.title_long} ${t.quality}`);
      results.push(annotate({
        title:    `${movie.title_long} [${t.quality}] [${t.type||'web'}]`,
        size:     t.size || fmtSize(t.size_bytes),
        seeders:  t.seeds || 0,
        leechers: t.peers || 0,
        magnet, source: 'YTS', skey: 'yts',
      }, { tpbCat: '201' }));
    }
  }
  console.log(`[YTS] ${results.length} torrents from ${movies.length} movies for "${q}"`);
  return results;
}

// ─── EZTV — TV show JSON API ──────────────────────────────────────────────────

async function searchEZTV(q) {
  const terms = q.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results = [];
  for (const page of [1, 2]) {
    try {
      const { data } = await httpGet(`https://eztvx.to/api/get-torrents?limit=100&page=${page}`, { json: true, timeout: 12000 });
      for (const t of (data?.torrents || [])) {
        const tl = (t.title || t.filename || '').toLowerCase();
        if (!terms.every(term => tl.includes(term))) continue;
        if (!t.magnet_url) continue;
        results.push(annotate({
          title: t.title || t.filename || 'Unknown',
          size:  fmtSize(t.size_bytes),
          seeders: t.seeds || 0, leechers: t.peers || 0,
          magnet: t.magnet_url, source: 'EZTV', skey: 'eztv',
        }));
      }
    } catch (e) { console.warn(`[EZTV] page ${page}:`, e.message); }
  }
  console.log(`[EZTV] ${results.length} matches for "${q}"`);
  return results.slice(0, 40);
}

// ─── Nyaa ─────────────────────────────────────────────────────────────────────
// Nyaa RSS format:
//   <title> — torrent name (may be CDATA-wrapped)
//   <nyaa:infoHash> — hex info hash (NO magnetLink tag exists — must build from hash)
//   <nyaa:size>     — human-readable size e.g. "1.2 GiB"
//   <nyaa:seeders>  — seeder count
//   <nyaa:leechers> — leecher count
//   <enclosure>     — .torrent file download URL

async function searchNyaa(q) {
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q)}&c=0_0&f=0`;
  const { data, status } = await httpGet(url, { timeout: 15000 });
  if (status !== 200) throw new Error(`Nyaa HTTP ${status}`);

  const blocks  = data.match(/<item>([\s\S]*?)<\/item>/g) || [];
  const results = [];

  for (const block of blocks.slice(0, 40)) {
    // Plain <tag> — handles optional CDATA wrapper
    const getPlain = (tag) => {
      let m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
      if (m) return m[1].trim();
      m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`));
      return m ? m[1].trim() : '';
    };
    // <nyaa:TAG> — plain text, no CDATA
    const getNyaa = (tag) => {
      const m = block.match(new RegExp(`<nyaa:${tag}[^>]*>([^<]*)<\\/nyaa:${tag}>`));
      return m ? m[1].trim() : '';
    };

    const title = getPlain('title');
    if (!title || title.toLowerCase() === 'nyaa') continue;

    // Build magnet from infoHash — this is the only way, there is no magnetLink field
    const infoHash = getNyaa('infoHash');
    const encUrl   = block.match(/enclosure[^>]+url="([^"]+)"/)?.[1] || '';
    const magnet   = infoHash ? buildMagnet(infoHash, title) : '';

    // If somehow no hash, fall back to torrent file URL so at least the row is addable
    if (!magnet && !encUrl) continue;

    results.push(annotate({
      title,
      magnet,
      torrentUrl: encUrl,
      size:     getNyaa('size')     || '?',
      seeders:  parseInt(getNyaa('seeders'),  10) || 0,
      leechers: parseInt(getNyaa('leechers'), 10) || 0,
      source: 'Nyaa', skey: 'nyaa',
    }));
  }
  console.log(`[Nyaa] ${results.length} results for "${q}" (sample hash: ${results[0] ? results[0].magnet.slice(20,60) : 'none'})`);
  return results;
}

// ─── 1337x ────────────────────────────────────────────────────────────────────

const MIRRORS_1337X = [
  'https://1337x.to','https://1337x.st','https://1337xto.to',
  'https://x1337x.ws','https://x1337x.eu','https://1337x.gd',
];
let _mirror = null, _cookies = '', _mirrorExpiry = 0;

async function getWorkingMirror() {
  if (_mirror && Date.now() < _mirrorExpiry) return _mirror;
  for (const m of MIRRORS_1337X) {
    try {
      const { status, cookies } = await httpGet(`${m}/`, { timeout: 7000 });
      if (status === 200) {
        _mirror = m; _cookies = cookies;
        _mirrorExpiry = Date.now() + 10 * 60 * 1000;
        console.log(`[1337x] Mirror: ${m}`);
        return m;
      }
    } catch { /* next */ }
  }
  throw new Error('All 1337x mirrors unreachable');
}

async function search1337x(q) {
  const mirror = await getWorkingMirror();
  if (!_cookies) { const h = await httpGet(`${mirror}/`, { timeout: 10000 }); _cookies = h.cookies; }
  const url = `${mirror}/search/${encodeURIComponent(q)}/1/`;
  const { data, status } = await httpGet(url, { referer: `${mirror}/`, cookies: _cookies });
  if (status !== 200) { _mirror = null; _cookies = ''; throw new Error(`1337x HTTP ${status}`); }
  const $ = cheerio.load(data);
  const results = [];
  $('table.table-list tbody tr').each((_, row) => {
    const anchors  = $('td.name a', row).toArray();
    const a        = anchors.find(el => !$(el).attr('href')?.startsWith('/sub/')) || anchors[anchors.length - 1];
    if (!a) return;
    const title    = $(a).text().trim();
    const href     = $(a).attr('href') || '';
    const size     = $('td.size', row).clone().children().remove().end().text().trim() || '?';
    const seeders  = parseInt($('td.seeds',   row).text().trim(), 10) || 0;
    const leechers = parseInt($('td.leeches', row).text().trim(), 10) || 0;
    if (!title) return;
    results.push(annotate({ title, size, seeders, leechers, magnet: '', detailUrl: href ? `${mirror}${href}` : '', needsMagnet: true, source: '1337x', skey: '1337x' }));
  });
  if (results.length === 0) { _mirror = null; _cookies = ''; }
  console.log(`[1337x] ${results.length} results for "${q}"`);
  return results.slice(0, 30);
}

async function get1337xMagnet(detailUrl) {
  const base = new URL(detailUrl).origin;
  const home = await httpGet(`${base}/`, { timeout: 10000 });
  _cookies = home.cookies;
  const { data } = await httpGet(detailUrl, { referer: `${base}/`, cookies: _cookies });
  const $ = cheerio.load(data);
  const anchor = $('a[href^="magnet:"]').first().attr('href');
  if (anchor) return anchor;
  const raw = data.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/);
  if (raw) return raw[0];
  const hash = (data.match(/urn:btih:([a-fA-F0-9]{40})/i) || [])[1];
  if (hash) {
    const name = $('div.box-info-heading h1').text().trim() || $('title').text().replace(/ (Download|Torrent).*$/i,'').trim() || 'torrent';
    return buildMagnet(hash, name);
  }
  return '';
}

// ─── TorrentGalaxy ───────────────────────────────────────────────────────────

async function searchRarbg(q) {
  const url = `https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(q)}&lang=0&nox=2&sort=seeders&order=desc`;
  try {
    const { data } = await httpGet(url, { timeout: 18000 });
    const $ = cheerio.load(data);
    const results = [];
    $('.tgxtablerow').each((_, row) => {
      const title  = $('a.txlight', row).text().trim();
      const magnet = $('a[href^="magnet:"]', row).attr('href') || '';
      if (!title || !magnet) return;
      const cells = $('.tgxtablecell', row).toArray();
      const size  = $(cells[5] || cells[4] || cells[0]).text().trim() || '?';
      const seeds = parseInt($('.tgbseed',    row).text(), 10) || 0;
      const leech = parseInt($('.tgbleecher', row).text(), 10) || 0;
      results.push(annotate({ title, size, seeders: seeds, leechers: leech, magnet, source: 'TorrentGalaxy', skey: 'rarbg' }));
    });
    console.log(`[TGx] ${results.length} results for "${q}"`);
    if (results.length > 0) return results.slice(0, 30);
  } catch (e) { console.warn('[TGx] failed:', e.message); }

  // Fallback: solidtorrents
  try {
    const { data: d2 } = await httpGet(`https://solidtorrents.to/search?q=${encodeURIComponent(q)}&sort=seeders`, { timeout: 15000 });
    const $2 = cheerio.load(d2);
    const r2 = [];
    $2('.search-result').each((_, el) => {
      const title  = $2('h5', el).first().text().trim();
      const magnet = $2('a[href^="magnet:"]', el).attr('href') || '';
      if (!title || !magnet) return;
      const size  = $2('.stats .size', el).text().trim() || '?';
      const seeds = parseInt($2('.stats .seed',  el).text(), 10) || 0;
      const leech = parseInt($2('.stats .leech', el).text(), 10) || 0;
      r2.push(annotate({ title, size, seeders: seeds, leechers: leech, magnet, source: 'SolidTorrents', skey: 'rarbg' }));
    });
    console.log(`[SolidTorrents] ${r2.length} results for "${q}"`);
    return r2.slice(0, 30);
  } catch (e2) { console.warn('[SolidTorrents] failed:', e2.message); }
  return [];
}

// ─── Custom source ────────────────────────────────────────────────────────────

async function searchCustom(q) {
  const { data } = await httpGet(`https://heartiveloves.pages.dev/?q=${encodeURIComponent(q)}`);
  const $ = cheerio.load(data);
  const results = [];
  $('a[href^="magnet:"]').each((_, a) => {
    const href = $(a).attr('href');
    const dn   = (href.match(/dn=([^&]+)/) || [])[1] || '';
    results.push(annotate({ title: $(a).text().trim() || decodeURIComponent(dn) || 'Unknown', size: '?', seeders: 0, leechers: 0, magnet: href, source: 'Custom', skey: 'custom' }));
  });
  $('a[href*=".torrent"]').each((_, a) => {
    results.push(annotate({ title: $(a).text().trim() || 'Unknown', size: '?', seeders: 0, leechers: 0, magnet: '', torrentUrl: $(a).attr('href'), source: 'Custom', skey: 'custom' }));
  });
  return results;
}

// ─── Bitmagnet — GraphQL with episode metadata ───────────────────────────────

async function searchBitmagnet(q) {
  const resp = await axios.post(
    `${BITMAGNET_HOST}/graphql`,
    {
      query: `query Search($input: TorrentContentSearchQueryInput!) {
        torrentContent(input: $input) {
          items {
            torrent { infoHash name size seeders leechers }
            content {
              type title releaseYear
              episodes { season episodes }
            }
          }
        }
      }`,
      variables: {
        input: { queryString: q, limit: 40, orderBy: [{ field: 'Seeders', descending: true }] },
      },
    },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 8000, validateStatus: s => s < 500 }
  );
  if (resp.status !== 200) throw new Error(`Bitmagnet HTTP ${resp.status}`);
  if (resp.data?.errors?.length) throw new Error(resp.data.errors[0]?.message || 'GraphQL error');

  const items = resp.data?.data?.torrentContent?.items || [];
  const results = items.map(item => {
    const t    = item.torrent || {};
    const c    = item.content || {};
    const hash = (t.infoHash || '').toLowerCase();
    const name = c.title ? `${c.title}${c.releaseYear ? ` (${c.releaseYear})` : ''}` : (t.name || '');
    if (!hash || !name) return null;

    // Extract season/episode arrays from Bitmagnet's episode groups
    const seasons  = [];
    const episodes = [];
    for (const eg of (c.episodes || [])) {
      if (eg.season != null) seasons.push(eg.season);
      for (const ep of (eg.episodes || [])) episodes.push(ep);
    }

    return annotate({
      title: name, size: fmtSize(t.size),
      seeders: t.seeders || 0, leechers: t.leechers || 0,
      magnet: buildMagnet(hash, t.name || name),
      source: 'Bitmagnet', skey: 'bitmagnet',
    }, { bmType: c.type, bmSeasons: seasons, bmEpisodes: episodes });
  }).filter(Boolean);

  console.log(`[Bitmagnet] ${results.length} results for "${q}"`);
  return results;
}

// ─── qBittorrent ──────────────────────────────────────────────────────────────

let qbSid = null;
async function qbLogin() {
  try {
    const r = await axios.post(`${QB_HOST}/api/v2/auth/login`,
      `username=${encodeURIComponent(QB_USER)}&password=${encodeURIComponent(QB_PASS)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
    const sid = [].concat(r.headers['set-cookie'] || []).find(c => c.startsWith('SID='));
    if (sid) { qbSid = sid.split(';')[0]; return true; }
    if (r.data === 'Ok.') return true;
    console.error('[QB] login response:', r.data); return false;
  } catch (e) { console.error('[QB] login error:', e.message); return false; }
}
async function qbGet(p, retry = true) {
  if (!qbSid) await qbLogin();
  const r = await axios.get(`${QB_HOST}/api/v2${p}`, { headers: { Cookie: qbSid || '' }, validateStatus: () => true });
  if (r.status === 403 && retry) { qbSid = null; await qbLogin(); return qbGet(p, false); }
  return r.data;
}
async function qbPost(p, body, retry = true) {
  if (!qbSid) await qbLogin();
  const r = await axios.post(`${QB_HOST}/api/v2${p}`, body, {
    headers: { Cookie: qbSid || '', 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
  if (r.status === 403 && retry) { qbSid = null; await qbLogin(); return qbPost(p, body, false); }
  return r.data;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const scrapers = { tpb: searchTPB, yts: searchYTS, eztv: searchEZTV, '1337x': search1337x, rarbg: searchRarbg, nyaa: searchNyaa, custom: searchCustom, bitmagnet: searchBitmagnet };

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [], errors: {} });
  const sources = (req.query.sources || 'tpb,nyaa,rarbg').split(',').filter(Boolean);
  console.log(`\n[SEARCH] "${q}"  sources: ${sources.join(', ')}`);
  const results = [], errors = {};
  await Promise.all(sources.map(async s => {
    if (!scrapers[s]) return;
    try {
      const r = await scrapers[s](q);
      r.forEach(x => results.push({ ...x, id: Math.random().toString(36).slice(2, 9) }));
    } catch (e) { console.error(`[SEARCH][${s}] FAILED:`, e.message); errors[s] = e.message; }
  }));
  console.log(`[SEARCH] total: ${results.length}, errors: ${JSON.stringify(errors)}`);
  res.json({ results, errors });
});

app.get('/api/magnet', async (req, res) => {
  const url = (req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'No URL' });
  try {
    const magnet = await get1337xMagnet(url);
    if (!magnet) return res.status(404).json({ error: 'Magnet not found — try TPB, Nyaa or Bitmagnet result.' });
    res.json({ magnet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/qbt/status',   async (req, res) => { try { res.json({ ok: await qbLogin() }); } catch { res.json({ ok: false }); } });
app.get('/api/torrents',     async (req, res) => { try { res.json(await qbGet('/torrents/info')); }  catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/transferinfo', async (req, res) => { try { res.json(await qbGet('/transfer/info')); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/add', async (req, res) => {
  const { magnet, torrentUrl } = req.body;
  if (!magnet && !torrentUrl) return res.status(400).json({ error: 'No magnet or URL' });
  try { console.log('[ADD]', (magnet||torrentUrl).slice(0,100)); await qbPost('/torrents/add', `urls=${encodeURIComponent(magnet||torrentUrl)}`); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/torrent/pause',  async (req, res) => { try { await qbPost('/torrents/pause',  `hashes=${req.body.hash}`); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/torrent/resume', async (req, res) => { try { await qbPost('/torrents/resume', `hashes=${req.body.hash}`); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/torrent/delete', async (req, res) => {
  const { hash, deleteFiles = false } = req.body;
  try { await qbPost('/torrents/delete', `hashes=${hash}&deleteFiles=${deleteFiles}`); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
Promise.all([
  getWorkingMirror().catch(e => console.warn('[1337x] startup probe:', e.message)),
  qbLogin().then(ok => console.log(`[QB] ${ok?'Connected ✓':'FAILED'} → ${QB_HOST}`)).catch(()=>{}),
  axios.get(`${BITMAGNET_HOST}/status`, { timeout: 3000, validateStatus: ()=>true })
    .then(r => console.log(`[Bitmagnet] ${r.status===200?'Available ✓':`Not running (HTTP ${r.status})`} → ${BITMAGNET_HOST}`))
    .catch(() => console.log(`[Bitmagnet] Not reachable → ${BITMAGNET_HOST}`)),
  axios.get('https://apibay.org/q.php?q=test&cat=0', { timeout: 8000, validateStatus: ()=>true })
    .then(r => console.log(`[TPB] API ${r.status===200?'reachable ✓':`HTTP ${r.status}`}`))
    .catch(e => console.warn('[TPB] unreachable:', e.message)),
]);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  TorrentDeck  →  http://0.0.0.0:${PORT}`);
  console.log(`  QB_HOST:        ${QB_HOST}`);
  console.log(`  BITMAGNET_HOST: ${BITMAGNET_HOST}\n`);
});
