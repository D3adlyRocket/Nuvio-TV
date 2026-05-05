// MoviesDrive Scraper for Nuvio Local Scrapers
// Fully updated to match Kotlin source (MoviesDrive.kt, Extractors.kt, MoviesDriveProvider.kt)
// Domain updated: https://new2.moviesdrives.my

const cheerio = require('cheerio-without-node-native');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Primary domain — matches Kotlin's `mainUrl` default + new domain override
let MAIN_URL = 'https://new2.moviesdrives.my';

// Dynamic URL resolver (mirrors Kotlin's `getLatestBaseUrl`)
const UTILS_URL = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
// Fallback domain JSON used by the JS build
const DOMAINS_JSON_URL = 'https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json';

const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let domainCacheTimestamp = 0;

// Metadata API (mirrors Kotlin's `aiometa_url`)
const AIOMETA_URL = 'https://aiometadata.elfhosted.com/stremio/9197a4a9-2f5b-4911-845e-8704c520bdf7/meta';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Referer': `${MAIN_URL}/`,
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES  (mirrors Extractors.kt utils)
// ─────────────────────────────────────────────────────────────────────────────

/** Mirror of Kotlin's `getIndexQuality()` */
function getIndexQuality(str) {
    if (!str) return 0;
    const m = str.match(/(\d{3,4})[pP]/);
    if (m) return parseInt(m[1], 10);
    const l = str.toLowerCase();
    if (l.includes('8k'))  return 4320;
    if (l.includes('4k'))  return 2160;
    if (l.includes('2k'))  return 1440;
    return 0; // Qualities.Unknown
}

/** Mirror of Kotlin's `getBaseUrl()` */
function getBaseUrl(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}`;
    } catch (_) {
        return url;
    }
}

/** Mirror of Kotlin's `resolveFinalUrl()` — follows redirects manually */
async function resolveFinalUrl(startUrl, maxRedirects = 7) {
    let currentUrl = startUrl;
    for (let i = 0; i < maxRedirects; i++) {
        try {
            const res = await fetch(currentUrl, {
                method: 'HEAD',
                redirect: 'manual',
                headers: HEADERS,
            });
            if (res.status === 200) return currentUrl;
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (!location) break;
                currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).toString();
            } else {
                return null;
            }
        } catch (_) {
            return null;
        }
    }
    return currentUrl;
}

/** Mirror of Kotlin's `getLatestBaseUrl()` for a given source key */
async function getLatestBaseUrl(fallback, sourceKey) {
    try {
        const res = await fetch(UTILS_URL, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
        if (res.ok) {
            const data = await res.json();
            const val_ = data[sourceKey];
            if (val_ && val_.trim()) return val_.trim();
        }
    } catch (_) {}
    return fallback;
}

/** Format bytes to human-readable string */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/** Extract a friendly server label from a source string */
function extractServerName(source) {
    if (!source) return 'Unknown';
    const s = source.trim();
    if (/HubCloud/i.test(s)) {
        if (/FSL\s*V2/i.test(s)) return 'HubCloud FSLv2';
        if (/FSL/i.test(s))     return 'HubCloud FSL';
        if (/S3/i.test(s))      return 'HubCloud S3';
        if (/Buzz/i.test(s))    return 'HubCloud BuzzServer';
        if (/10\s*Gbps/i.test(s)) return 'HubCloud 10Gbps';
        return 'HubCloud';
    }
    if (/GDFlix/i.test(s)) {
        if (/Direct/i.test(s))  return 'GDFlix Direct';
        if (/Instant/i.test(s)) return 'GDFlix Instant';
        if (/DriveBot/i.test(s)) return 'GDFlix DriveBot';
        if (/Cloud/i.test(s))   return 'GDFlix Cloud';
        if (/Index/i.test(s))   return 'GDFlix Index';
        return 'GDFlix';
    }
    if (/Pixeldrain/i.test(s)) return 'Pixeldrain';
    if (/StreamTape/i.test(s)) return 'StreamTape';
    if (/HubCdn/i.test(s))     return 'HubCdn';
    if (/HbLinks/i.test(s))    return 'HbLinks';
    if (/Hubstream/i.test(s))  return 'Hubstream';
    return s.replace(/^www\./i, '').split(/[.\s]/)[0];
}

/** ROT13 cipher (mirrors Kotlin pen()) */
function rot13(value) {
    return value.replace(/[a-zA-Z]/g, c => {
        return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

// Base64 helpers (React Native safe)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function atob(v) {
    if (!v) return '';
    let input = String(v).replace(/=+$/, ''), output = '', bc = 0, bs, buf, idx = 0;
    while ((buf = input.charAt(idx++))) {
        buf = B64.indexOf(buf);
        if (~buf) {
            bs = bc % 4 ? bs * 64 + buf : buf;
            if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
        }
    }
    return output;
}

/** cleanTitle — extracts quality/codec segment from a filename */
function cleanTitle(title) {
    const parts = title.split(/[.\-_]/);
    const qualityTags = ['WEBRip','WEB-DL','WEB','BluRay','HDRip','DVDRip','HDTV','CAM','TS','R5','DVDScr','BRRip','BDRip','DVD','PDTV','HD'];
    const audioTags   = ['AAC','AC3','DTS','MP3','FLAC','DD5','EAC3','Atmos'];
    const subTags     = ['ESub','ESubs','Subs','MultiSub','NoSub','EnglishSub','HindiSub'];
    const codecTags   = ['x264','x265','H264','HEVC','AVC'];
    const startIdx = parts.findIndex(p => qualityTags.some(t => p.toLowerCase().includes(t.toLowerCase())));
    const endIdx   = parts.findLastIndex(p =>
        subTags.some(t => p.toLowerCase().includes(t.toLowerCase())) ||
        audioTags.some(t => p.toLowerCase().includes(t.toLowerCase())) ||
        codecTags.some(t => p.toLowerCase().includes(t.toLowerCase()))
    );
    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) return parts.slice(startIdx, endIdx + 1).join('.');
    if (startIdx !== -1) return parts.slice(startIdx).join('.');
    return parts.slice(-3).join('.');
}

function sizeToBytes(size) {
    if (!size) return 0;
    const m = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    if (m[2].toUpperCase() === 'GB') return v * 1024 ** 3;
    if (m[2].toUpperCase() === 'MB') return v * 1024 ** 2;
    return v * 1024;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAndUpdateDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) return;
    try {
        // Try the SaurabhKaperwan utils.json first (mirrors Kotlin companion object)
        const res = await fetch(UTILS_URL, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
        if (res.ok) {
            const data = await res.json();
            const newDomain = data['moviesdrive'];
            if (newDomain && newDomain.trim() && newDomain.trim() !== MAIN_URL) {
                console.log(`[MoviesDrive] Domain updated → ${newDomain.trim()}`);
                MAIN_URL = newDomain.trim();
                HEADERS['Referer'] = `${MAIN_URL}/`;
                domainCacheTimestamp = now;
                return;
            }
        }
    } catch (_) {}
    // Fallback: phisher98 domains.json
    try {
        const res2 = await fetch(DOMAINS_JSON_URL, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
        if (res2.ok) {
            const data2 = await res2.json();
            const alt = data2['Moviesdrive'];
            if (alt && alt.trim() && alt.trim() !== MAIN_URL) {
                MAIN_URL = alt.trim();
                HEADERS['Referer'] = `${MAIN_URL}/`;
            }
        }
    } catch (_) {}
    domainCacheTimestamp = now;
}

async function getCurrentDomain() {
    await fetchAndUpdateDomain();
    return MAIN_URL;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTORS  (mirrors Extractors.kt — HubCloud, GDFlix, Pixeldrain, StreamTape)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HubCloud extractor — mirrors Kotlin HubCloud.getUrl()
 * Handles /video/ pages, hubcloud.php pages, and direct link pages.
 * Supports: FSL, FSLv2, Mega, BuzzServer, Pixeldrain, 10Gbps, Download File.
 */
async function hubCloudExtractor(url, referer) {
    try {
        let baseUrl = getBaseUrl(url);
        // Resolve latest HubCloud base domain (mirrors getLatestBaseUrl)
        const latestBase = await getLatestBaseUrl(baseUrl, url.includes('hubcloud') ? 'hubcloud' : 'vcloud');
        let currentUrl = url;
        if (baseUrl !== latestBase) {
            currentUrl = url.replace(baseUrl, latestBase);
            baseUrl = latestBase;
        }

        // Mirrors Kotlin: /video/ → select "div.vd > center > a"
        // else → parse script for `var url = '...'`
        let pageHtml = await fetch(currentUrl, { headers: { ...HEADERS, Referer: referer || MAIN_URL } }).then(r => r.text());
        let $ = cheerio.load(pageHtml);

        let link;
        if (/\/video\//i.test(currentUrl)) {
            link = $('div.vd > center > a').attr('href') || '';
        } else {
            const scriptTag = $('script:contains(url)').text();
            const m = scriptTag.match(/var url = '([^']*)'/);
            link = m ? m[1] : '';
        }

        if (link && !link.startsWith('https://')) link = baseUrl + link;
        if (!link) return [];

        const docHtml = await fetch(link, { headers: { ...HEADERS, Referer: currentUrl } }).then(r => r.text());
        const $d = cheerio.load(docHtml);

        const header = $d('div.card-header').text().trim();
        const size   = $d('i#size').text().trim();
        const quality = getIndexQuality(header);
        const labelExtras = [cleanTitle(header), size].filter(Boolean).map(s => `[${s}]`).join('');
        const sizeBytes = sizeToBytes(size);

        const links = [];
        const btnElements = $d('h2 a.btn, a.btn[href]').get();

        await Promise.all(btnElements.map(async el => {
            const elLink = $d(el).attr('href') || '';
            const text   = $d(el).text().trim();

            if (/telegram/i.test(text) || /telegram/i.test(elLink)) return;

            if (text.includes('FSL Server')) {
                links.push({ source: `HubCloud [FSL Server] ${labelExtras}`, quality, url: elLink, size: sizeBytes, fileName: header });
            } else if (text.includes('FSLv2') || text.includes('FSL V2')) {
                links.push({ source: `HubCloud [FSLv2 Server] ${labelExtras}`, quality, url: elLink, size: sizeBytes, fileName: header });
            } else if (text.includes('Mega Server')) {
                links.push({ source: `HubCloud [Mega Server] ${labelExtras}`, quality, url: elLink, size: sizeBytes, fileName: header });
            } else if (text.includes('Download File')) {
                links.push({ source: `HubCloud ${labelExtras}`, quality, url: elLink, size: sizeBytes, fileName: header });
            } else if (text.includes('BuzzServer')) {
                try {
                    const buzz = await fetch(`${elLink}/download`, {
                        method: 'GET',
                        headers: { ...HEADERS, Referer: elLink },
                        redirect: 'manual',
                    });
                    // Kotlin reads hx-redirect header
                    const hxRedirect = buzz.headers.get('hx-redirect') || '';
                    if (hxRedirect) {
                        const bBase = getBaseUrl(elLink);
                        links.push({ source: `HubCloud [BuzzServer] ${labelExtras}`, quality, url: bBase + hxRedirect, size: sizeBytes, fileName: header });
                    }
                } catch (_) {}
            } else if (elLink.includes('pixeldra')) {
                const extracted = await pixelDrainExtractor(elLink);
                extracted.forEach(l => links.push({ ...l, quality: l.quality || quality, size: l.size || sizeBytes, fileName: header }));
            } else if (text.includes('Server : 10Gbps') || text.includes('10Gbps')) {
                // mirrors: resolveFinalUrl then substringAfter("link=")
                let redirectUrl = await resolveFinalUrl(elLink);
                if (redirectUrl && redirectUrl.includes('link=')) {
                    redirectUrl = redirectUrl.split('link=')[1];
                }
                if (redirectUrl) {
                    links.push({ source: `HubCloud [10Gbps] ${labelExtras}`, quality, url: redirectUrl, size: sizeBytes, fileName: header });
                }
            }
            // No fallback for unknown buttons (matches Kotlin's `else { Log.d("Error", "No Server matched") }`)
        }));

        return links;
    } catch (e) {
        console.error('[HubCloud] extraction error:', e.message);
        return [];
    }
}

/**
 * GDFlix extractor — mirrors Kotlin GDFlix.getUrl()
 * Supports: FSL V2, Direct DL, Direct Server, Cloud Download R2, Fast Cloud,
 *           Pixeldrain, Instant DL, GoFile, CF backup links.
 */
async function gdFlixExtractor(url, referer) {
    const links = [];
    try {
        let baseUrl = getBaseUrl(url);
        const latestBase = await getLatestBaseUrl(baseUrl, 'gdflix');
        let currentUrl = url;
        if (baseUrl !== latestBase) {
            currentUrl = url.replace(baseUrl, latestBase);
            baseUrl = latestBase;
        }

        const pageHtml = await fetch(currentUrl, { headers: { ...HEADERS, Referer: referer || MAIN_URL } }).then(r => r.text());
        const $ = cheerio.load(pageHtml);

        // mirrors: `ul > li.list-group-item:contains(Name)` / `:contains(Size)`
        const fileName = $('ul > li.list-group-item:contains(Name)').text().replace('Name :', '').trim();
        const fileSize = $('ul > li.list-group-item:contains(Size)').text().replace('Size :', '').trim();
        const quality  = getIndexQuality(fileName);
        const sizeBytes = sizeToBytes(fileSize);

        const myCallback = (link, server = '') => {
            links.push({
                source: `GDFlix${server} ${fileName}[${fileSize}]`,
                quality,
                url: link,
                size: sizeBytes,
                fileName,
            });
        };

        const anchors = $('div.text-center a').get();
        for (const el of anchors) {
            const elLink = $(el).attr('href') || '';
            const text   = $(el).text().trim();

            if (text.includes('FSL V2')) {
                myCallback(elLink, ' [FSL V2]');
            } else if (text.includes('DIRECT DL') || text.includes('DIRECT SERVER')) {
                myCallback(elLink, ' [Direct]');
            } else if (text.includes('CLOUD DOWNLOAD [R2]')) {
                myCallback(elLink, ' [Cloud]');
            } else if (text.includes('FAST CLOUD')) {
                try {
                    const fastHtml = await fetch(baseUrl + elLink, { headers: HEADERS }).then(r => r.text());
                    const $f = cheerio.load(fastHtml);
                    const dlink = $f('div.card-body a').attr('href');
                    if (dlink) myCallback(dlink, ' [Fast Cloud]');
                } catch (_) {}
            } else if (elLink.includes('pixeldra')) {
                const px = await pixelDrainExtractor(elLink);
                px.forEach(l => links.push({ ...l, quality: l.quality || quality, size: l.size || sizeBytes, fileName }));
            } else if (text.includes('Instant DL')) {
                try {
                    const instantRes = await fetch(elLink, { redirect: 'manual', headers: HEADERS });
                    const loc = instantRes.headers.get('location') || '';
                    const finalUrl = loc.includes('url=') ? loc.split('url=')[1] : loc;
                    if (finalUrl) myCallback(finalUrl, ' [Instant Download]');
                } catch (_) {}
            } else if (text.includes('GoFile')) {
                try {
                    const goHtml = await fetch(elLink, { headers: HEADERS }).then(r => r.text());
                    const $g = cheerio.load(goHtml);
                    const goLinks = $g('.row .row a').map((_, a) => $g(a).attr('href')).get().filter(h => h && h.includes('gofile'));
                    for (const gl of goLinks) {
                        const gf = await goFileExtractor(gl);
                        gf.forEach(l => links.push({ ...l, quality: l.quality || quality, size: l.size || sizeBytes, fileName }));
                    }
                } catch (_) {}
            }
            // `else { Log.d("Error", "No Server matched") }` — skip silently
        }

        // CF backup links — mirrors: CFType(newUrl.replace("file","wfile"))
        try {
            const wfileUrl = currentUrl.replace('file', 'wfile');
            for (const t of ['1', '2']) {
                const cfHtml = await fetch(`${wfileUrl}?type=${t}`, { headers: HEADERS }).then(r => r.text());
                const $c = cheerio.load(cfHtml);
                const cfLinks = $c('a.btn-success').map((_, a) => $c(a).attr('href')).get().filter(Boolean);
                for (const src of cfLinks) {
                    const resolved = await resolveFinalUrl(src);
                    if (resolved) myCallback(resolved, ' [CF]');
                }
            }
        } catch (_) {}
    } catch (e) {
        console.error('[GDFlix] extraction error:', e.message);
    }
    return links;
}

/** Pixeldrain extractor */
async function pixelDrainExtractor(link) {
    try {
        const m = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
        const fileId = m ? m[1] : link.split('/').pop();
        if (!fileId) return [{ source: 'Pixeldrain', quality: 0, url: link }];

        const baseUrlLink = getBaseUrl(link);
        const directUrl = link.toLowerCase().includes('download')
            ? link
            : `${baseUrlLink}/api/file/${fileId}?download`;

        let quality = 0, name = '';
        try {
            const info = await fetch(`https://pixeldrain.com/api/file/${fileId}/info`, { headers: HEADERS }).then(r => r.json());
            if (info && info.name) {
                name = info.name;
                quality = getIndexQuality(info.name);
            }
        } catch (_) {}

        return [{ source: 'Pixeldrain', quality, url: directUrl, fileName: name, size: 0 }];
    } catch (e) {
        return [{ source: 'Pixeldrain', quality: 0, url: link }];
    }
}

/** StreamTape extractor */
async function streamTapeExtractor(link) {
    try {
        const u = new URL(link);
        u.hostname = 'streamtape.com';
        const html = await fetch(u.toString(), { headers: HEADERS }).then(r => r.text());
        const m1 = html.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/);
        if (m1) {
            const partial = m1[1].match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
            if (partial) return [{ source: 'StreamTape', quality: 0, url: 'https:' + partial[1] }];
        }
        const m2 = html.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
        if (m2) return [{ source: 'StreamTape', quality: 0, url: 'https:' + m2[1] }];
        return [];
    } catch (_) {
        return [];
    }
}

/** GoFile extractor */
async function goFileExtractor(url) {
    const links = [];
    try {
        const idM = url.match(/(?:\?c=|\/d\/)([a-zA-Z0-9-]+)/);
        const id = idM ? idM[1] : null;
        if (!id) return [];

        const acc = await fetch('https://api.gofile.io/accounts', { method: 'POST' }).then(r => r.json());
        const token = acc?.data?.token;
        if (!token) return [];

        const js = await fetch('https://gofile.io/dist/js/global.js').then(r => r.text());
        const wt = js.match(/appdata\.wt\s*=\s*["']([^"']+)/)?.[1];
        if (!wt) return [];

        const data = await fetch(`https://api.gofile.io/contents/${id}?wt=${wt}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json());

        const files = Object.values(data.data?.children || {});
        if (!files.length) return [];
        const file = files[0];
        const size = file.size || 0;
        links.push({
            source: 'GoFile',
            quality: getIndexQuality(file.name),
            url: file.link,
            size,
            fileName: file.name,
            headers: { Cookie: `accountToken=${token}` },
        });
    } catch (_) {}
    return links;
}

/** HubStream extractor */
async function hubStreamExtractor(url, referer) {
    return [{ source: 'Hubstream', quality: 0, url }];
}

/** HbLinks extractor */
async function hbLinksExtractor(url, referer) {
    try {
        const html = await fetch(url, { headers: { ...HEADERS, Referer: referer } }).then(r => r.text());
        const $ = cheerio.load(html);
        const hrefs = $('h3 a, div.entry-content p a').map((_, el) => $(el).attr('href')).get().filter(Boolean);
        const results = await Promise.all(hrefs.map(h => loadExtractor(h, url)));
        return results.flat();
    } catch (_) {
        return [];
    }
}

/** HubCdn extractor */
async function hubCdnExtractor(url, referer) {
    try {
        const html = await fetch(url, { headers: { ...HEADERS, Referer: referer } }).then(r => r.text());
        const m = html.match(/r=([A-Za-z0-9+/=]+)/);
        if (m) {
            const decoded = atob(m[1]);
            const m3u8 = decoded.substring(decoded.lastIndexOf('link=') + 5);
            return [{ source: 'HubCdn', quality: 0, url: m3u8 }];
        }
    } catch (_) {}
    return [];
}

/**
 * Main extractor dispatcher — mirrors Kotlin's loadExtractor() routing.
 * Routes by hostname to the correct extractor function.
 */
async function loadExtractor(url, referer = MAIN_URL) {
    let hostname;
    try { hostname = new URL(url).hostname; } catch (_) { return []; }

    // Blocked hosts (mirrors Kotlin filter)
    if (/google\.|ampproject\.org|gstatic\.|doubleclick\.|ddl2|linkrit/i.test(hostname)) return [];

    if (hostname.includes('hubcloud') || hostname.includes('vcloud'))
        return hubCloudExtractor(url, referer);
    if (hostname.includes('gdflix') || hostname.includes('gdlink'))
        return gdFlixExtractor(url, referer);
    if (hostname.includes('gofile'))
        return goFileExtractor(url);
    if (hostname.includes('pixeldrain'))
        return pixelDrainExtractor(url);
    if (hostname.includes('streamtape'))
        return streamTapeExtractor(url);
    if (hostname.includes('hubstream'))
        return hubStreamExtractor(url, referer);
    if (hostname.includes('hblinks'))
        return hbLinksExtractor(url, referer);
    if (hostname.includes('hubcdn'))
        return hubCdnExtractor(url, referer);

    // Unknown host — pass through
    return [{ source: hostname.replace(/^www\./, ''), quality: 0, url }];
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER  (mirrors MoviesDriveProvider.kt)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search — mirrors Kotlin `search()`.
 * Uses `/search.php?q=...&page=...` and maps hits to results.
 * When imdbId is available, filters by exact imdb_id match.
 */
async function search(query, page = 1) {
    const domain = await getCurrentDomain();
    const apiUrl = `${domain}/search.php?q=${encodeURIComponent(query)}&page=${page}`;
    console.log(`[MoviesDrive] Search: ${apiUrl}`);
    try {
        const res  = await fetch(apiUrl, { headers: HEADERS });
        const json = await res.json();
        if (!json?.hits?.length) return [];

        return json.hits.map(hit => hit.document).map(doc => ({
            title: doc.post_title,
            url: doc.permalink.startsWith('http')
                ? doc.permalink
                : `${domain}${doc.permalink.startsWith('/') ? '' : '/'}${doc.permalink}`,
            poster: doc.post_thumbnail || null,
            year: (() => { const m = doc.post_title.match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : null; })(),
            imdbId: doc.imdb_id || null,
        }));
    } catch (e) {
        console.error('[MoviesDrive] Search error:', e.message);
        return [];
    }
}

/**
 * Load + LoadLinks — mirrors Kotlin `load()` + `loadLinks()`.
 *
 * Movie flow:
 *   h5 > a  →  intermediate page  →  filter hubcloud|gdflix|gdlink  →  loadExtractor
 *
 * TV flow:
 *   Find season h5 → find "single episode" link → fetch that page →
 *   find episode span/link → collect hubcloud|gdflix hrefs → loadExtractor
 */
async function getDownloadLinks(mediaUrl, season, episode) {
    const domain = await getCurrentDomain();
    HEADERS.Referer = `${domain}/`;

    const html = await fetch(mediaUrl, { headers: HEADERS }).then(r => r.text());
    const $ = cheerio.load(html);

    // Detect type (mirrors Kotlin: title contains Episode / Season regex / series)
    const rawTitle = $('title').text();
    const seasonRegex = /(?:Season|S)\s*\d+/i;
    const isMovie = !(
        rawTitle.toLowerCase().includes('episode') ||
        seasonRegex.test(rawTitle) ||
        rawTitle.toLowerCase().includes('series')
    );

    const hosterRegex = /hubcloud|gdflix|gdlink/i;

    // Helper: fetch an intermediate page and extract hoster links (mirrors Kotlin movie inner buttons)
    async function extractHosterLinksFromPage(pageUrl) {
        try {
            const pageHtml = await fetch(pageUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } }).then(r => r.text());
            const $p = cheerio.load(pageHtml);
            return $p('a[href]').map((_, el) => $p(el).attr('href')).get().filter(h => h && hosterRegex.test(h));
        } catch (_) {
            return [];
        }
    }

    if (isMovie) {
        // Mirrors Kotlin movie load: `document.select("h5 > a")`
        const h5Links = $('h5 > a').map((_, el) => $(el).attr('href')).get().filter(Boolean);
        console.log(`[MoviesDrive] Movie: ${h5Links.length} h5 links`);

        const allServerUrls = (await Promise.all(h5Links.map(extractHosterLinksFromPage))).flat();
        const uniqueServerUrls = [...new Set(allServerUrls)];

        const results = await Promise.all(uniqueServerUrls.map(u => loadExtractor(u, mediaUrl).catch(() => [])));
        const flat = results.flat();
        const seen = new Set();
        return {
            finalLinks: flat.filter(l => l?.url && !seen.has(l.url) && seen.add(l.url)),
            isMovie: true,
        };
    }

    // TV SERIES — mirrors Kotlin series load
    const seasonPattern  = new RegExp(`(?:Season|S)\\s*0?${season}\\b`, 'i');
    const episodePattern = new RegExp(`Ep\\s*0?${episode}\\b`, 'i');

    // Step 1: find "Single Episode" links under the matching season h5
    const singleEpUrls = [];
    $('h5').each((_, h5El) => {
        if (!seasonPattern.test($(h5El).text())) return;
        $(h5El).nextAll('h5').each((_, nextH5) => {
            const a = $(nextH5).find('a[href]');
            if (a.length && /single\s*episode/i.test(a.text()) && !/zip/i.test(a.text())) {
                const href = a.attr('href');
                if (href && !singleEpUrls.includes(href)) singleEpUrls.push(href);
            }
        });
    });

    if (!singleEpUrls.length) {
        console.error('[MoviesDrive] No single-episode pages for season', season);
        return { finalLinks: [], isMovie: false };
    }

    // Step 2: from each single-ep page, find episode-specific hoster links
    const episodeHosterUrls = (await Promise.all(singleEpUrls.map(async pageUrl => {
        try {
            const pageHtml = await fetch(pageUrl, { headers: HEADERS }).then(r => r.text());
            const $e = cheerio.load(pageHtml);
            const found = [];

            // mirrors Kotlin: `span:matches((?i)(Ep))` or `a:matches(hubcloud|gdflix)`
            let elements = $e('span').filter((_, el) => /\bEp\b/i.test($e(el).text())).get();
            if (!elements.length) {
                elements = $e('a').filter((_, el) => hosterRegex.test($e(el).attr('href') || '')).get();
            }

            let e = 1;
            elements.forEach(el => {
                if ($e(el).prop('tagName') === 'SPAN') {
                    const epM = /Ep(\d{2})/i.exec($e(el).toString());
                    if (epM) e = parseInt(epM[1], 10);
                    if (e !== episode) { e++; return; }
                    let next = $e(el).parent().nextElementSibling?.() || $e(el).parent().next();
                    while (next && next.length && next.prop('tagName') !== 'HR') {
                        const a = next.find('a');
                        const href = a.attr('href') || '';
                        if (hosterRegex.test(href)) found.push(href);
                        next = next.next();
                    }
                    e++;
                } else {
                    if (e === episode) {
                        const href = $e(el).attr('href') || '';
                        if (hosterRegex.test(href)) found.push(href);
                    }
                    e++;
                }
            });

            return found;
        } catch (_) {
            return [];
        }
    }))).flat();

    if (!episodeHosterUrls.length) {
        console.error('[MoviesDrive] No hoster links for episode', episode);
        return { finalLinks: [], isMovie: false };
    }

    const tvResults = await Promise.all(episodeHosterUrls.map(u => loadExtractor(u, singleEpUrls[0]).catch(() => [])));
    const tvFlat = tvResults.flat();
    const seenTv = new Set();
    return {
        finalLinks: tvFlat.filter(l => l?.url && !seenTv.has(l.url) && seenTv.add(l.url)),
        isMovie: false,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    const res  = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': HEADERS['User-Agent'] } });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    const title       = mediaType === 'tv' ? data.name : data.title;
    const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
    return {
        title,
        year: releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null,
        imdbId: data.external_ids?.imdb_id || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TITLE MATCHING
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/\b(the|a|an)\b/g, '')
        .replace(/[:\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

function titleSimilarity(t1, t2) {
    const n1 = normalizeTitle(t1), n2 = normalizeTitle(t2);
    if (n1 === n2) return 1.0;
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;
    const w1 = new Set(n1.split(/\s+/).filter(w => w.length > 2));
    const w2 = new Set(n2.split(/\s+/).filter(w => w.length > 2));
    if (!w1.size || !w2.size) return 0;
    const inter = [...w1].filter(w => w2.has(w)).length;
    const union = new Set([...w1, ...w2]).size;
    return inter / union;
}

function findBestMatch(mediaInfo, results, mediaType, season) {
    let best = null, bestScore = 0;
    for (const r of results) {
        let score = titleSimilarity(mediaInfo.title, r.title);
        if (mediaInfo.year && r.year) {
            const diff = Math.abs(mediaInfo.year - r.year);
            if (diff === 0) score += 0.2;
            else if (diff <= 1) score += 0.1;
            else if (diff > 5) score -= 0.3;
        }
        if (mediaType === 'tv' && season) {
            const tl = r.title.toLowerCase();
            if (tl.includes(`season ${season}`) || tl.includes(`s${season}`)) score += 0.3;
            else score -= 0.2;
        }
        if (score > bestScore && score > 0.3) { bestScore = score; best = r; }
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getStreams — primary Nuvio integration function.
 * @param {string} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {Promise<Array>} Array of stream objects
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[MoviesDrive] getStreams tmdbId=${tmdbId} type=${mediaType}${mediaType === 'tv' ? ` S${season}E${episode}` : ''}`);
    try {
        const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
        if (!mediaInfo.title) throw new Error('No title from TMDB');
        console.log(`[MoviesDrive] TMDB: "${mediaInfo.title}" (${mediaInfo.year}), imdb=${mediaInfo.imdbId}`);

        // Search by IMDB ID when available (most precise), else by title
        const searchQuery = mediaInfo.imdbId || mediaInfo.title;
        let results = await search(searchQuery);

        // If imdb search returned nothing, fall back to title search
        if (!results.length && mediaInfo.imdbId) {
            results = await search(mediaInfo.title);
        }

        // Filter by exact IMDB ID if available
        if (mediaInfo.imdbId && results.length) {
            const filtered = results.filter(r => r.imdbId === mediaInfo.imdbId);
            if (filtered.length) results = filtered;
        }

        if (!results.length) {
            console.log('[MoviesDrive] No results');
            return [];
        }

        const selected = findBestMatch(mediaInfo, results, mediaType, season) || results[0];
        console.log(`[MoviesDrive] Selected: "${selected.title}" → ${selected.url}`);

        const { finalLinks } = await getDownloadLinks(selected.url, season, episode);

        const qualityOrder = { '2160p': 6, '1440p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, '240p': 0, 'Unknown': -1 };

        const streams = finalLinks
            .filter(l => l?.url)
            .map(l => {
                const q = l.quality;
                let qualityStr =
                    q >= 2160 ? '2160p' :
                    q >= 1440 ? '1440p' :
                    q >= 1080 ? '1080p' :
                    q >= 720  ? '720p'  :
                    q >= 480  ? '480p'  :
                    q >= 360  ? '360p'  :
                    q > 0     ? '240p'  : 'Unknown';

                let mediaTitle;
                if (l.fileName && l.fileName !== 'Unknown') {
                    mediaTitle = l.fileName;
                } else if (mediaType === 'tv' && season && episode) {
                    mediaTitle = `${mediaInfo.title} S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`;
                } else {
                    mediaTitle = mediaInfo.year ? `${mediaInfo.title} (${mediaInfo.year})` : mediaInfo.title;
                }

                return {
                    name: `MoviesDrive ${extractServerName(l.source)}`,
                    title: mediaTitle,
                    url: l.url,
                    quality: qualityStr,
                    size: formatBytes(l.size),
                    headers: l.headers || HEADERS,
                    provider: 'MoviesDrive',
                };
            })
            .sort((a, b) => (qualityOrder[b.quality] ?? -2) - (qualityOrder[a.quality] ?? -2));

        console.log(`[MoviesDrive] Returning ${streams.length} streams`);
        return streams;
    } catch (e) {
        console.error('[MoviesDrive] Error:', e.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
