// MoviesDrive Scraper — FIXED + TURBO
// Correct search endpoint · Safe domain handling · Full parallel · Timeout-guarded
// Domain: https://new2.moviesdrives.my

const cheerio = require('cheerio-without-node-native');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TMDB_API_KEY  = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Hardcoded working domain — NEVER overwritten if remote fetch fails
const DEFAULT_DOMAIN = 'https://new2.moviesdrives.my';
let   MAIN_URL       = DEFAULT_DOMAIN;

const HOSTER_RE = /hubcloud|gdflix|gdlink/i;

// ─── TIMEOUTS (ms) ───────────────────────────────────────────────────────────
const T_PAGE      = 10000;
const T_EXTRACTOR = 8000;
const T_TMDB      = 6000;
const T_DOMAIN    = 4000;

// ─── HEADERS ─────────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': (referer || MAIN_URL) + '/',
    };
}

// ─── PAGE CACHE (avoids double-fetching same intermediate page) ───────────────
var pageCache = {};
var PAGE_TTL  = 8 * 60 * 1000; // 8 minutes

function getCached(url) {
    var c = pageCache[url];
    return (c && (Date.now() - c.ts) < PAGE_TTL) ? c.html : null;
}
function setCached(url, html) {
    pageCache[url] = { html: html, ts: Date.now() };
}

// ─── DOMAIN CACHE (safe — never overwrites if fetch fails) ───────────────────
var domainCacheTs = 0;
var DOMAIN_TTL    = 4 * 60 * 60 * 1000;
var domainFetching = false;

// Tries to update MAIN_URL from remote JSON — completely non-blocking
// If it fails for any reason, MAIN_URL stays as DEFAULT_DOMAIN
function tryUpdateDomain() {
    var now = Date.now();
    if ((now - domainCacheTs) < DOMAIN_TTL) return Promise.resolve();
    if (domainFetching) return Promise.resolve();
    domainFetching = true;

    var urls = [
        'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json',
        'https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json',
    ];

    return Promise.all(urls.map(function(u) {
        return fetchT(u, { headers: { 'User-Agent': UA } }, T_DOMAIN)
            .then(function(r) { return r && r.ok ? r.json().catch(function() { return {}; }) : {}; })
            .catch(function() { return {}; });
    })).then(function(results) {
        var utils   = results[0] || {};
        var domains = results[1] || {};
        // Only update if we got a real non-empty value
        var nd = utils['moviesdrive'] || domains['Moviesdrive'];
        if (nd && nd.trim() && nd.startsWith('http')) {
            MAIN_URL = nd.trim();
        }
        domainCacheTs = Date.now();
        domainFetching = false;
    }).catch(function() {
        domainCacheTs = Date.now(); // mark as tried so we don't retry immediately
        domainFetching = false;
    });
}

// extractor base URL lookup — safe, cached, won't block on failure
var utilsData = null;
var utilsTs   = 0;

function getUtilsData() {
    if (utilsData && (Date.now() - utilsTs) < DOMAIN_TTL) return Promise.resolve(utilsData);
    return fetchT('https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json', { headers: { 'User-Agent': UA } }, T_DOMAIN)
        .then(function(r) { return r && r.ok ? r.json().catch(function() { return {}; }) : {}; })
        .catch(function() { return {}; })
        .then(function(d) {
            utilsData = d || {};
            utilsTs   = Date.now();
            return utilsData;
        });
}

function getLatestBaseUrl(fallback, key) {
    return getUtilsData().then(function(d) {
        var v = d && d[key];
        return (v && v.trim() && v.startsWith('http')) ? v.trim() : fallback;
    }).catch(function() { return fallback; });
}

// ─── FETCH WITH TIMEOUT ───────────────────────────────────────────────────────
function fetchT(url, opts, ms) {
    ms = ms || T_PAGE;
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, ms) : null;
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts)
        .finally(function() { if (timer) clearTimeout(timer); })
        .catch(function() { return null; });
}

function fetchText(url, opts, ms) {
    return fetchT(url, opts, ms || T_PAGE).then(function(r) {
        return (r && r.ok) ? r.text().catch(function() { return ''; }) : '';
    }).catch(function() { return ''; });
}

function cachedFetchText(url, opts, ms) {
    var cached = getCached(url);
    if (cached !== null) return Promise.resolve(cached);
    return fetchText(url, opts, ms || T_PAGE).then(function(html) {
        if (html) setCached(url, html);
        return html;
    });
}

// ─── PURE UTILS ──────────────────────────────────────────────────────────────
function getBaseUrl(url) {
    try { var u = new URL(url); return u.protocol + '//' + u.host; }
    catch(_) { return url; }
}

function getIndexQuality(str) {
    if (!str) return 0;
    var m = str.match(/(\d{3,4})[pP]/);
    if (m) return parseInt(m[1], 10);
    var l = str.toLowerCase();
    if (l.includes('8k')) return 4320;
    if (l.includes('4k')) return 2160;
    if (l.includes('2k')) return 1440;
    return 0;
}

function sizeToBytes(s) {
    if (!s) return 0;
    var m = s.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    var v = parseFloat(m[1]);
    return m[2].toUpperCase() === 'GB' ? v * 1073741824 :
           m[2].toUpperCase() === 'MB' ? v * 1048576 : v * 1024;
}

function formatBytes(b) {
    if (!b || b === 0) return 'Unknown';
    var k = 1024, s = ['B','KB','MB','GB','TB'], i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

function cleanTitle(title) {
    if (!title) return '';
    var parts = title.split(/[.\-_]/);
    var qualityTags = ['WEBRip','WEB-DL','WEB','BluRay','HDRip','DVDRip','HDTV','CAM','TS','BRRip','BDRip','DVD','PDTV','HD'];
    var otherTags   = ['AAC','AC3','DTS','MP3','ESub','ESubs','Subs','x264','x265','H264','HEVC','AVC'];
    var si = parts.findIndex(function(p) {
        return qualityTags.some(function(t) { return p.toLowerCase().includes(t.toLowerCase()); });
    });
    var ei = parts.findLastIndex ? parts.findLastIndex(function(p) {
        return otherTags.some(function(t) { return p.toLowerCase().includes(t.toLowerCase()); });
    }) : -1;
    if (si !== -1 && ei >= si) return parts.slice(si, ei + 1).join('.');
    if (si !== -1) return parts.slice(si).join('.');
    return parts.slice(-3).join('.');
}

function extractServerName(s) {
    if (!s) return 'Unknown';
    if (/HubCloud/i.test(s)) {
        if (/FSL\s*V2/i.test(s)) return 'HubCloud FSLv2';
        if (/FSL/i.test(s))      return 'HubCloud FSL';
        if (/Buzz/i.test(s))     return 'HubCloud Buzz';
        if (/10\s*Gbps/i.test(s)) return 'HubCloud 10Gbps';
        return 'HubCloud';
    }
    if (/GDFlix/i.test(s)) {
        if (/Direct/i.test(s))   return 'GDFlix Direct';
        if (/Instant/i.test(s))  return 'GDFlix Instant';
        if (/Cloud/i.test(s))    return 'GDFlix Cloud';
        return 'GDFlix';
    }
    if (/Pixeldrain/i.test(s)) return 'Pixeldrain';
    if (/StreamTape/i.test(s)) return 'StreamTape';
    return s.replace(/^www\./i, '').split(/[.\s]/)[0] || 'Server';
}

var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function safeAtob(v) {
    if (!v) return '';
    var input = String(v).replace(/=+$/, ''), out = '', bc = 0, bs, buf, idx = 0;
    while ((buf = input.charAt(idx++))) {
        buf = B64.indexOf(buf);
        if (~buf) {
            bs = bc % 4 ? bs * 64 + buf : buf;
            if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
        }
    }
    return out;
}

// ─── EXTRACTORS ──────────────────────────────────────────────────────────────

function pixelDrainExtractor(link) {
    try {
        var m = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
        var fileId = m ? m[1] : link.split('/').pop();
        if (!fileId) return Promise.resolve([]);
        var base = getBaseUrl(link);
        // Use correct pixeldrain domain regardless of variant
        var directUrl = link.toLowerCase().includes('download')
            ? link
            : (base + '/api/file/' + fileId + '?download');
        var quality = getIndexQuality(link);
        return Promise.resolve([{ source: 'Pixeldrain', quality: quality, url: directUrl }]);
    } catch(_) { return Promise.resolve([]); }
}

function streamTapeExtractor(link) {
    try {
        var u = new URL(link);
        u.hostname = 'streamtape.com';
        return fetchText(u.toString(), { headers: getHeaders() }, T_EXTRACTOR).then(function(html) {
            if (!html) return [];
            var m1 = html.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/);
            if (m1) {
                var p = m1[1].match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
                if (p) return [{ source: 'StreamTape', quality: 0, url: 'https:' + p[1] }];
            }
            var m2 = html.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
            if (m2) return [{ source: 'StreamTape', quality: 0, url: 'https:' + m2[1] }];
            return [];
        }).catch(function() { return []; });
    } catch(_) { return Promise.resolve([]); }
}

function hubCloudExtractor(url, referer) {
    var base = getBaseUrl(url);
    var sourceKey = url.includes('hubcloud') ? 'hubcloud' : 'vcloud';

    return getLatestBaseUrl(base, sourceKey).then(function(latestBase) {
        var currentUrl = (base !== latestBase) ? url.replace(base, latestBase) : url;
        var resolvedBase = getBaseUrl(currentUrl);

        return cachedFetchText(currentUrl, { headers: getHeaders(referer || MAIN_URL) }).then(function(html) {
            if (!html) return [];
            var $ = cheerio.load(html);

            var link = '';
            if (/\/video\//i.test(currentUrl)) {
                link = $('div.vd > center > a').attr('href') || '';
            } else {
                var sm = html.match(/var url = '([^']*)'/);
                link = sm ? sm[1] : '';
            }
            if (!link) return [];
            if (!link.startsWith('http')) link = resolvedBase + link;

            return fetchText(link, { headers: getHeaders(currentUrl) }, T_EXTRACTOR).then(function(docHtml) {
                if (!docHtml) return [];
                var $d = cheerio.load(docHtml);

                var header  = $d('div.card-header').text().trim();
                var size    = $d('i#size').text().trim();
                var quality = getIndexQuality(header);
                var sizeB   = sizeToBytes(size);
                var extras  = [cleanTitle(header), size].filter(Boolean).map(function(x) { return '[' + x + ']'; }).join('');

                var links = [];
                var btns  = $d('h2 a.btn, a.btn[href]').get();

                var btnPromises = btns.map(function(el) {
                    var href = $d(el).attr('href') || '';
                    var text = $d(el).text().trim();
                    if (!href || /telegram/i.test(text) || /telegram/i.test(href)) return Promise.resolve();

                    function pushLink(server, u) {
                        links.push({
                            source: 'HubCloud' + (server || '') + ' ' + extras,
                            quality: quality, url: u || href, size: sizeB, fileName: header
                        });
                    }

                    if (text.includes('FSL Server'))                          { pushLink(' [FSL Server]'); return Promise.resolve(); }
                    if (text.includes('FSLv2') || text.includes('FSL V2'))    { pushLink(' [FSLv2]'); return Promise.resolve(); }
                    if (text.includes('Mega Server'))                         { pushLink(' [Mega]'); return Promise.resolve(); }
                    if (text.includes('Download File'))                       { pushLink(''); return Promise.resolve(); }

                    if (text.includes('BuzzServer')) {
                        return fetchT(href + '/download', { method: 'GET', headers: getHeaders(href), redirect: 'manual' }, 5000)
                            .then(function(r) {
                                if (!r) return;
                                var hx = r.headers.get('hx-redirect') || '';
                                if (hx) pushLink(' [BuzzServer]', getBaseUrl(href) + hx);
                            }).catch(function() {});
                    }

                    if (href.includes('pixeldra')) {
                        return pixelDrainExtractor(href).then(function(px) {
                            px.forEach(function(l) {
                                links.push(Object.assign({}, l, { quality: l.quality || quality, size: l.size || sizeB, fileName: header }));
                            });
                        });
                    }

                    if (text.includes('10Gbps') || text.includes('Server : 10Gbps')) {
                        var cur = href;
                        var walk = function(i) {
                            if (i >= 5) return Promise.resolve(cur);
                            return fetchT(cur, { redirect: 'manual' }, 3000).then(function(r) {
                                if (!r || r.status < 300 || r.status >= 400) return cur;
                                var loc = r.headers.get('location') || '';
                                if (!loc) return cur;
                                if (loc.includes('link=')) return loc.split('link=')[1];
                                cur = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
                                return walk(i + 1);
                            }).catch(function() { return cur; });
                        };
                        return walk(0).then(function(final) {
                            if (final && final !== href) pushLink(' [10Gbps]', final);
                        });
                    }

                    return Promise.resolve();
                });

                return Promise.all(btnPromises).then(function() { return links; });
            });
        });
    }).catch(function(e) {
        console.error('[HubCloud] error:', e.message);
        return [];
    });
}

function gdFlixExtractor(url, referer) {
    var base = getBaseUrl(url);

    return getLatestBaseUrl(base, 'gdflix').then(function(latestBase) {
        var currentUrl = (base !== latestBase) ? url.replace(base, latestBase) : url;
        var resolvedBase = getBaseUrl(currentUrl);

        return cachedFetchText(currentUrl, { headers: getHeaders(referer || MAIN_URL) }).then(function(html) {
            if (!html) return [];
            var $ = cheerio.load(html);

            var fileName = $('ul > li.list-group-item:contains(Name)').text().replace('Name :', '').trim();
            var fileSize = $('ul > li.list-group-item:contains(Size)').text().replace('Size :', '').trim();
            var quality  = getIndexQuality(fileName);
            var sizeB    = sizeToBytes(fileSize);
            var links    = [];

            function pushLink(server, u) {
                if (!u) return;
                links.push({
                    source: 'GDFlix' + (server || '') + ' ' + fileName + '[' + fileSize + ']',
                    quality: quality, url: u, size: sizeB, fileName: fileName
                });
            }

            var anchors = $('div.text-center a').get();
            var anchorPromises = anchors.map(function(el) {
                var href = $(el).attr('href') || '';
                var text = $(el).text().trim();
                if (!href) return Promise.resolve();

                if (text.includes('FSL V2'))                                        { pushLink(' [FSL V2]', href); return Promise.resolve(); }
                if (text.includes('DIRECT DL') || text.includes('DIRECT SERVER'))  { pushLink(' [Direct]', href); return Promise.resolve(); }
                if (text.includes('CLOUD DOWNLOAD'))                                { pushLink(' [Cloud]', href); return Promise.resolve(); }

                if (text.includes('FAST CLOUD')) {
                    return fetchText(resolvedBase + href, { headers: getHeaders() }, T_EXTRACTOR).then(function(fh) {
                        if (!fh) return;
                        var $f = cheerio.load(fh);
                        var dl = $f('div.card-body a').attr('href');
                        if (dl) pushLink(' [Fast Cloud]', dl);
                    }).catch(function() {});
                }

                if (href.includes('pixeldra')) {
                    return pixelDrainExtractor(href).then(function(px) {
                        px.forEach(function(l) {
                            links.push(Object.assign({}, l, { quality: quality, size: sizeB, fileName: fileName }));
                        });
                    });
                }

                if (text.includes('Instant DL')) {
                    return fetchT(href, { redirect: 'manual', headers: getHeaders() }, 4000).then(function(ir) {
                        if (!ir) return;
                        var loc = ir.headers.get('location') || '';
                        var fu  = loc.includes('url=') ? loc.split('url=')[1] : loc;
                        if (fu) pushLink(' [Instant]', fu);
                    }).catch(function() {});
                }

                if (text.includes('GoFile')) {
                    return fetchText(href, { headers: getHeaders() }, T_EXTRACTOR).then(function(gh) {
                        if (!gh) return;
                        var $g = cheerio.load(gh);
                        var gls = $g('.row .row a').map(function(_, a) { return $g(a).attr('href'); }).get()
                            .filter(function(h) { return h && h.includes('gofile'); });
                        return Promise.all(gls.map(function(gl) {
                            return goFileExtractor(gl).catch(function() { return []; });
                        })).then(function(gf) {
                            gf.forEach(function(arr) {
                                arr.forEach(function(l) {
                                    links.push(Object.assign({}, l, { quality: l.quality || quality, size: l.size || sizeB, fileName: fileName }));
                                });
                            });
                        });
                    }).catch(function() {});
                }

                return Promise.resolve();
            });

            // CF backup links — both types in parallel
            var cfPromise = (function() {
                try {
                    var wfile = currentUrl.replace('file', 'wfile');
                    return Promise.all(['1','2'].map(function(t) {
                        return fetchText(wfile + '?type=' + t, { headers: getHeaders() }, 4000).then(function(ch) {
                            var $c = cheerio.load(ch || '');
                            return $c('a.btn-success').map(function(_, a) { return $c(a).attr('href'); }).get().filter(Boolean);
                        }).catch(function() { return []; });
                    })).then(function(cfSets) {
                        var cfLinks = cfSets[0].concat(cfSets[1]);
                        return Promise.all(cfLinks.map(function(src) {
                            var cur = src;
                            var walk = function(i) {
                                if (i >= 5) return Promise.resolve(cur);
                                return fetchT(cur, { redirect: 'manual' }, 3000).then(function(r) {
                                    if (!r || r.status < 300 || r.status >= 400) return cur;
                                    var loc = r.headers.get('location') || '';
                                    if (!loc) return cur;
                                    cur = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
                                    return walk(i + 1);
                                }).catch(function() { return cur; });
                            };
                            return walk(0).then(function(final) {
                                if (final) pushLink(' [CF]', final);
                            });
                        }));
                    });
                } catch(_) { return Promise.resolve(); }
            })();

            return Promise.all(anchorPromises.concat([cfPromise])).then(function() { return links; });
        });
    }).catch(function(e) {
        console.error('[GDFlix] error:', e.message);
        return [];
    });
}

function goFileExtractor(url) {
    try {
        var idM = url.match(/(?:\?c=|\/d\/)([a-zA-Z0-9-]+)/);
        var id  = idM ? idM[1] : null;
        if (!id) return Promise.resolve([]);

        return Promise.all([
            fetchT('https://api.gofile.io/accounts', { method: 'POST' }, 4000)
                .then(function(r) { return r && r.ok ? r.json().catch(function() { return null; }) : null; })
                .catch(function() { return null; }),
            fetchText('https://gofile.io/dist/js/global.js', {}, 4000),
        ]).then(function(results) {
            var acc = results[0], js = results[1] || '';
            var token = acc && acc.data && acc.data.token;
            var wtm   = js.match(/appdata\.wt\s*=\s*["']([^"']+)/);
            var wt    = wtm ? wtm[1] : null;
            if (!token || !wt) return [];

            return fetchT('https://api.gofile.io/contents/' + id + '?wt=' + wt,
                { headers: { Authorization: 'Bearer ' + token } }, 4000)
                .then(function(r) { return r && r.ok ? r.json().catch(function() { return null; }) : null; })
                .then(function(data) {
                    var files = Object.values((data && data.data && data.data.children) || {});
                    if (!files.length) return [];
                    var file = files[0];
                    return [{ source: 'GoFile', quality: getIndexQuality(file.name), url: file.link, size: file.size || 0, fileName: file.name, headers: { Cookie: 'accountToken=' + token } }];
                }).catch(function() { return []; });
        }).catch(function() { return []; });
    } catch(_) { return Promise.resolve([]); }
}

function loadExtractor(url, referer) {
    referer = referer || MAIN_URL;
    var host;
    try { host = new URL(url).hostname; } catch(_) { return Promise.resolve([]); }
    if (!host) return Promise.resolve([]);
    if (/google\.|ampproject\.org|gstatic\.|doubleclick\.|ddl2|linkrit/i.test(host)) return Promise.resolve([]);

    if (host.includes('hubcloud') || host.includes('vcloud')) return hubCloudExtractor(url, referer);
    if (host.includes('gdflix')   || host.includes('gdlink')) return gdFlixExtractor(url, referer);
    if (host.includes('gofile'))     return goFileExtractor(url);
    if (host.includes('pixeldrain')) return pixelDrainExtractor(url);
    if (host.includes('streamtape')) return streamTapeExtractor(url);
    // Pass through unknown hosts
    return Promise.resolve([{ source: host.replace(/^www\./, ''), quality: 0, url: url }]);
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
// Tries both /searchapi.php (original JS) and /search.php (Kotlin) in parallel
// Returns whichever gives results first

function searchEndpoint(endpoint, query, page) {
    var url = MAIN_URL + endpoint + '?q=' + encodeURIComponent(query) + '&page=' + (page || 1);
    return fetchT(url, { headers: getHeaders() }, T_PAGE).then(function(res) {
        if (!res || !res.ok) return [];
        return res.json().then(function(json) {
            if (!json || !json.hits || !json.hits.length) return [];
            return json.hits.map(function(h) { return h.document; }).map(function(doc) {
                var m = doc.post_title ? doc.post_title.match(/\b(19|20)\d{2}\b/) : null;
                // EXACT Kotlin behavior: mainUrl + doc.permalink (always relative)
                var permalink = doc.permalink || '';
                var fullUrl = permalink.startsWith('http')
                    ? permalink
                    : MAIN_URL + (permalink.startsWith('/') ? '' : '/') + permalink;
                return {
                    title:  doc.post_title || '',
                    url:    fullUrl,
                    poster: doc.post_thumbnail || null,
                    year:   m ? +m[0] : null,
                    imdbId: doc.imdb_id || null,
                };
            });
        }).catch(function() { return []; });
    }).catch(function() { return []; });
}

function search(query, page) {
    // Try both endpoints simultaneously — use whichever returns results
    return Promise.all([
        searchEndpoint('/searchapi.php', query, page),
        searchEndpoint('/search.php', query, page),
    ]).then(function(results) {
        var a = results[0], b = results[1];
        if (a && a.length) return a;
        if (b && b.length) return b;
        return [];
    });
}

// ─── HOSTER LINK EXTRACTOR FROM INTERMEDIATE PAGES ───────────────────────────
function extractHosterLinks(pageUrl) {
    return cachedFetchText(pageUrl, { headers: { 'User-Agent': UA } }, T_PAGE).then(function(html) {
        if (!html) return [];
        var $ = cheerio.load(html);
        var hrefs = [];
        $('a[href]').each(function(_, el) {
            var h = $(el).attr('href');
            if (h && HOSTER_RE.test(h)) hrefs.push(h);
        });
        return hrefs;
    }).catch(function() { return []; });
}

// ─── MAIN DOWNLOAD LINK FETCHER ───────────────────────────────────────────────
function getDownloadLinks(mediaUrl, season, episode) {
    return fetchText(mediaUrl, { headers: getHeaders() }, T_PAGE).then(function(html) {
        if (!html) return { finalLinks: [], isMovie: true };
        var $ = cheerio.load(html);

        var rawTitle = $('title').text() + ' ' + $('h1').first().text();
        var isMovie  = !(/Episode|season\s*\d+|series/i.test(rawTitle));

        function dedup(flat) {
            var seen = {};
            return flat.filter(function(l) {
                if (!l || !l.url || seen[l.url]) return false;
                seen[l.url] = true;
                return true;
            });
        }

        if (isMovie) {
            // Kotlin: document.select("h5 > a") — filter out Zip
            var h5Links = [];
            $('h5 > a').each(function(_, el) {
                var href = $(el).attr('href');
                var text = $(el).text();
                if (href && !/zip/i.test(text)) h5Links.push(href);
            });

            if (!h5Links.length) {
                // fallback: any a[href] matching hoster pattern directly on page
                $('a[href]').each(function(_, el) {
                    var h = $(el).attr('href');
                    if (h && HOSTER_RE.test(h)) h5Links.push(h);
                });
            }

            // Fetch all intermediate pages in parallel
            return Promise.all(h5Links.map(extractHosterLinks)).then(function(nested) {
                var serverUrls = [];
                var seen = {};
                nested.forEach(function(arr) {
                    arr.forEach(function(u) {
                        if (u && !seen[u]) { seen[u] = true; serverUrls.push(u); }
                    });
                });

                // Also check if any h5Links are directly hoster URLs
                h5Links.forEach(function(u) {
                    if (HOSTER_RE.test(u) && !seen[u]) { seen[u] = true; serverUrls.push(u); }
                });

                return Promise.all(serverUrls.map(function(u) {
                    return loadExtractor(u, mediaUrl).catch(function() { return []; });
                })).then(function(extracted) {
                    return {
                        finalLinks: dedup(extracted.reduce(function(a, b) { return a.concat(b); }, [])),
                        isMovie: true
                    };
                });
            });
        }

        // ── TV SERIES ──
        var seasonRE  = new RegExp('(?:Season|S)\\s*0?' + season + '\\b', 'i');

        var singleEpUrls = [];
        $('h5').each(function(_, h5el) {
            if (!seasonRE.test($(h5el).text())) return;
            $(h5el).nextAll('h5').each(function(_, nx) {
                var a = $(nx).find('a[href]');
                var txt = a.text();
                var href = a.attr('href');
                if (href && /single\s*episode/i.test(txt) && !/zip/i.test(txt)) {
                    if (!singleEpUrls.includes(href)) singleEpUrls.push(href);
                }
            });
        });

        if (!singleEpUrls.length) return Promise.resolve({ finalLinks: [], isMovie: false });

        // Fetch all single-episode pages in parallel
        return Promise.all(singleEpUrls.map(function(u) {
            return cachedFetchText(u, { headers: getHeaders() }, T_PAGE);
        })).then(function(epHtmls) {
            var episodeHosterUrls = {};

            epHtmls.forEach(function(epHtml) {
                if (!epHtml) return;
                var $e = cheerio.load(epHtml);

                // Try span-based episode detection first (Kotlin primary)
                var spans = $e('span').filter(function(_, el) { return /\bEp\b/i.test($e(el).text()); }).get();

                if (spans.length) {
                    var e = 1;
                    spans.forEach(function(el) {
                        var epM = /Ep(\d{1,2})/i.exec($e(el).toString());
                        if (epM) e = parseInt(epM[1], 10);
                        if (e !== episode) { e++; return; }
                        // Walk siblings until HR
                        var next = $e(el).parent().next();
                        var safety = 0;
                        while (next && next.length && next.prop('tagName') !== 'HR' && safety++ < 30) {
                            next.find('a[href]').each(function(_, a) {
                                var href = $e(a).attr('href') || '';
                                if (HOSTER_RE.test(href)) episodeHosterUrls[href] = true;
                            });
                            next = next.next();
                        }
                        e++;
                    });
                } else {
                    // Fallback: find all hoster anchors (Kotlin secondary)
                    $e('a[href]').each(function(_, el) {
                        var href = $e(el).attr('href') || '';
                        if (HOSTER_RE.test(href)) episodeHosterUrls[href] = true;
                    });
                }
            });

            var hosterUrls = Object.keys(episodeHosterUrls);
            if (!hosterUrls.length) return { finalLinks: [], isMovie: false };

            return Promise.all(hosterUrls.map(function(u) {
                return loadExtractor(u, singleEpUrls[0]).catch(function() { return []; });
            })).then(function(tvResults) {
                return {
                    finalLinks: dedup(tvResults.reduce(function(a, b) { return a.concat(b); }, [])),
                    isMovie: false
                };
            });
        });
    }).catch(function(e) {
        console.error('[MoviesDrive] getDownloadLinks error:', e.message);
        return { finalLinks: [], isMovie: true };
    });
}

// ─── TMDB ─────────────────────────────────────────────────────────────────────
function getTMDBDetails(tmdbId, mediaType) {
    var ep  = mediaType === 'tv' ? 'tv' : 'movie';
    var url = TMDB_BASE_URL + '/' + ep + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
    return fetchT(url, { headers: { Accept: 'application/json', 'User-Agent': UA } }, T_TMDB).then(function(res) {
        if (!res || !res.ok) throw new Error('TMDB HTTP ' + (res && res.status));
        return res.json();
    }).then(function(d) {
        var title = mediaType === 'tv' ? d.name : d.title;
        var rd    = mediaType === 'tv' ? d.first_air_date : d.release_date;
        return {
            title:  title || '',
            year:   rd ? parseInt(rd.split('-')[0], 10) : null,
            imdbId: (d.external_ids && d.external_ids.imdb_id) || null,
        };
    });
}

// ─── TITLE MATCHING ───────────────────────────────────────────────────────────
function normalizeTitle(t) {
    if (!t) return '';
    return t.toLowerCase()
        .replace(/\b(the|a|an)\b/g, '')
        .replace(/[:\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

function titleSimilarity(a, b) {
    var n1 = normalizeTitle(a), n2 = normalizeTitle(b);
    if (n1 === n2) return 1;
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;
    var w1 = n1.split(/\s+/).filter(function(w) { return w.length > 2; });
    var w2 = n2.split(/\s+/).filter(function(w) { return w.length > 2; });
    var set1 = {}, set2 = {};
    w1.forEach(function(w) { set1[w] = true; });
    w2.forEach(function(w) { set2[w] = true; });
    var inter = w1.filter(function(w) { return set2[w]; }).length;
    var union  = Object.keys(Object.assign({}, set1, set2)).length;
    return union === 0 ? 0 : inter / union;
}

function findBestMatch(info, results, mediaType, season) {
    var best = null, bestScore = 0;
    results.forEach(function(r) {
        var s = titleSimilarity(info.title, r.title);
        if (info.year && r.year) {
            var d = Math.abs(info.year - r.year);
            s += d === 0 ? 0.2 : d <= 1 ? 0.1 : d > 5 ? -0.3 : 0;
        }
        if (mediaType === 'tv' && season) {
            var tl = r.title.toLowerCase();
            s += (tl.includes('season ' + season) || tl.includes('s' + season)) ? 0.3 : -0.2;
        }
        if (s > bestScore && s > 0.3) { bestScore = s; best = r; }
    });
    return best;
}

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
    mediaType = mediaType || 'movie';
    console.log('[MoviesDrive] tmdbId=' + tmdbId + ' ' + mediaType + (mediaType === 'tv' ? ' S' + season + 'E' + episode : ''));

    // Kick off domain update in background — doesn't block anything
    tryUpdateDomain().catch(function() {});

    return getTMDBDetails(tmdbId, mediaType).then(function(mediaInfo) {
        if (!mediaInfo.title) throw new Error('No TMDB title');
        console.log('[MoviesDrive] "' + mediaInfo.title + '" (' + mediaInfo.year + ') imdb=' + mediaInfo.imdbId);

        // Build search queries — try IMDB ID + title simultaneously
        var queries = [];
        if (mediaInfo.imdbId) queries.push(mediaInfo.imdbId);
        queries.push(mediaInfo.title);
        // For TV, also try "Title Season N"
        if (mediaType === 'tv' && season) queries.push(mediaInfo.title + ' Season ' + season);

        return Promise.all(queries.map(function(q) { return search(q).catch(function() { return []; }); }))
        .then(function(allResults) {
            // Flatten all results, deduplicate by URL
            var seen = {}, combined = [];
            allResults.forEach(function(arr) {
                (arr || []).forEach(function(r) {
                    if (r && r.url && !seen[r.url]) { seen[r.url] = true; combined.push(r); }
                });
            });

            // Prefer exact IMDB match
            if (mediaInfo.imdbId) {
                var exact = combined.filter(function(r) { return r.imdbId === mediaInfo.imdbId; });
                if (exact.length) combined = exact;
            }

            if (!combined.length) {
                console.log('[MoviesDrive] No search results');
                return [];
            }

            var selected = findBestMatch(mediaInfo, combined, mediaType, season) || combined[0];
            console.log('[MoviesDrive] Selected: "' + selected.title + '" -> ' + selected.url);

            return getDownloadLinks(selected.url, season, episode).then(function(result) {
                var finalLinks = result.finalLinks;
                if (!finalLinks.length) {
                    console.log('[MoviesDrive] No download links found');
                    return [];
                }

                var QORD = { '2160p':6,'1440p':5,'1080p':4,'720p':3,'480p':2,'360p':1,'240p':0,'Unknown':-1 };

                var streams = finalLinks
                    .filter(function(l) { return l && l.url; })
                    .map(function(l) {
                        var q  = l.quality || 0;
                        var qs = q >= 2160 ? '2160p' : q >= 1440 ? '1440p' : q >= 1080 ? '1080p' :
                                 q >= 720  ? '720p'  : q >= 480  ? '480p'  : q >= 360  ? '360p'  :
                                 q > 0     ? '240p'  : 'Unknown';

                        var title = '';
                        if (l.fileName && l.fileName !== 'Unknown' && l.fileName.length > 3) {
                            title = l.fileName;
                        } else if (mediaType === 'tv' && season && episode) {
                            title = mediaInfo.title + ' S' + String(season).padStart(2,'0') + 'E' + String(episode).padStart(2,'0');
                        } else {
                            title = mediaInfo.year ? (mediaInfo.title + ' (' + mediaInfo.year + ')') : mediaInfo.title;
                        }

                        return {
                            name:     'MoviesDrive ' + extractServerName(l.source),
                            title:    title,
                            url:      l.url,
                            quality:  qs,
                            size:     formatBytes(l.size),
                            headers:  l.headers || getHeaders(),
                            provider: 'MoviesDrive',
                        };
                    })
                    .sort(function(a, b) {
                        return (QORD[b.quality] !== undefined ? QORD[b.quality] : -2) -
                               (QORD[a.quality] !== undefined ? QORD[a.quality] : -2);
                    });

                console.log('[MoviesDrive] Returning ' + streams.length + ' streams');
                return streams;
            });
        });
    }).catch(function(e) {
        console.error('[MoviesDrive] Fatal error: ' + e.message);
        return [];
    });
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    global.getStreams = getStreams;
}
