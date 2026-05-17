var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/vegamovies/index.js
var cheerio = require("cheerio-without-node-native");
var PROVIDER_NAME = "VegaMovies";
var BASE_URL = "https://vegamovies.market";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var DOMAINS_JSON_URL = "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
var REQUEST_TIMEOUT = 12e3;
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5"
};
var MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
var MOBILE_HEADERS = {
  "User-Agent": MOBILE_UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": BASE_URL + "/"
};
var EXCLUDED_BUTTONS = ["filepress", "gdtot", "dropgalaxy", "gdflix", "gdlink"];
function fetchSafe(_0) {
  return __async(this, arguments, function* (url, options = {}, timeout = REQUEST_TIMEOUT) {
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeout) : null;
      const merged = __spreadProps(__spreadValues({}, options), { headers: __spreadValues(__spreadValues({}, HEADERS), options.headers || {}) });
      if (signal)
        merged.signal = signal;
      return yield fetch(url, merged);
    } catch (e) {
      if (e.name === "AbortError") {
        console.error("[" + PROVIDER_NAME + "] Timeout: " + url.substring(0, 100));
      } else {
        console.error("[" + PROVIDER_NAME + "] fetchSafe: " + url.substring(0, 100) + " -> " + e.message);
      }
      return null;
    }
  });
}
function fetchJson(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const res = yield fetchSafe(url, options);
      if (!res || !res.ok)
        return null;
      return yield res.json();
    } catch (e) {
      return null;
    }
  });
}
function fetchHtml(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const res = yield fetchSafe(url, options);
      if (!res || !res.ok)
        return null;
      return cheerio.load(yield res.text());
    } catch (e) {
      return null;
    }
  });
}
function getOrigin(url) {
  try {
    const parts = url.split("//");
    if (parts.length < 2)
      return url;
    return parts[0] + "//" + parts[1].split("/")[0];
  } catch (e) {
    return url;
  }
}
function fixUrl(url) {
  if (!url)
    return "";
  if (url.startsWith("http://") || url.startsWith("https://"))
    return url;
  if (url.startsWith("//"))
    return "https:" + url;
  if (url.startsWith("/"))
    return baseUrl + url;
  return baseUrl + "/" + url;
}
function parseQuality(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("2160") || t.includes("4k") || t.includes("uhd"))
    return "2160p";
  if (t.includes("1440") || t.includes("2k"))
    return "1440p";
  if (t.includes("1080"))
    return "1080p";
  if (t.includes("720"))
    return "720p";
  if (t.includes("480"))
    return "480p";
  return "HD";
}
function makeStream(name, title, url, quality, headers) {
  return {
    name: PROVIDER_NAME + " | " + name,
    title: title || PROVIDER_NAME + " Stream",
    url: url || "",
    quality: quality || "HD",
    headers: headers || { "Referer": baseUrl + "/" }
  };
}
function dedupe(streams) {
  const seen = /* @__PURE__ */ new Set();
  return (streams || []).filter((s) => {
    if (!s || !s.url || seen.has(s.url))
      return false;
    seen.add(s.url);
    return true;
  });
}
function similarity(s1, s2, year, season) {
  if (!s1 || !s2)
    return 0;
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const w1 = clean(s1);
  const w2 = new Set(clean(s2));
  const intersection = w1.filter((x) => w2.has(x)).length;
  let score = intersection / Math.max(w1.length, 1);
  if (year && String(s2).includes(String(year)))
    score += 0.2;
  if (s2.toLowerCase().startsWith(s1.toLowerCase()))
    score += 0.1;
  if (season) {
    const sStr = String(season);
    const sRegex = new RegExp("(?:s|season|staffel|saison)\\s*0*" + sStr + "\\b", "i");
    const rangeRegex = new RegExp("(?:s|season)\\s*0*\\d+\\s*-\\s*0*\\d+", "i");
    if (sRegex.test(s2)) {
      score += 0.5;
    } else if (rangeRegex.test(s2)) {
      const match = s2.match(/(?:s|season)\s*0*(\d+)\s*-\s*0*(\d+)/i);
      if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        if (season >= start && season <= end)
          score += 0.4;
      }
    } else if (s2.toLowerCase().includes("complete") || s2.toLowerCase().includes("all seasons")) {
      score += 0.2;
    } else if (/(?:s|season)\s*0*\d+/i.test(s2)) {
      score -= 0.3;
    }
  }
  return Math.min(score, 1.5);
}
var cachedDomains = null;
var domainCacheTime = 0;
var DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1e3;
var baseUrl = BASE_URL;
var cachedHubDomain = "https://hubcloud.foo";
var cachedVcDomain = "https://vcloud.zip";
function refreshDomains() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (cachedDomains && now - domainCacheTime < DOMAIN_CACHE_TTL)
      return cachedDomains;
    try {
      const data = yield fetchJson(DOMAINS_JSON_URL, {}, 8e3);
      if (data) {
        cachedDomains = data;
        domainCacheTime = now;
        if (data.vegamovies)
          baseUrl = data.vegamovies;
        if (data.hubcloud)
          cachedHubDomain = data.hubcloud;
        if (data.vcloud)
          cachedVcDomain = data.vcloud;
        console.log("[" + PROVIDER_NAME + "] Domains updated: site=" + baseUrl + " hub=" + cachedHubDomain + " vc=" + cachedVcDomain);
      }
    } catch (e) {
      console.log("[" + PROVIDER_NAME + "] Domain refresh failed, using defaults");
    }
    return cachedDomains || {};
  });
}
function getLatestHubDomain() {
  return cachedHubDomain;
}
function getLatestVcDomain() {
  return cachedVcDomain;
}
function getTMDBInfo(id, type) {
  return __async(this, null, function* () {
    const idStr = String(id || "").trim();
    const isImdb = idStr.startsWith("tt");
    const tmdbType = type === "tv" || type === "series" ? "tv" : "movie";
    try {
      if (isImdb) {
        const data = yield fetchJson("https://api.themoviedb.org/3/find/" + idStr + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id");
        const list = data ? tmdbType === "tv" ? data.tv_results : data.movie_results : null;
        if (list && list.length > 0) {
          const item = list[0];
          return {
            title: tmdbType === "tv" ? item.name : item.title,
            year: (item.first_air_date || item.release_date || "").split("-")[0],
            imdbId: idStr,
            tmdbId: item.id
          };
        }
        return { title: idStr, year: null, imdbId: idStr, tmdbId: null };
      } else {
        const data = yield fetchJson("https://api.themoviedb.org/3/" + tmdbType + "/" + idStr + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids");
        if (data) {
          return {
            title: tmdbType === "tv" ? data.name : data.title,
            year: (data.first_air_date || data.release_date || "").split("-")[0],
            imdbId: data.imdb_id || data.external_ids && data.external_ids.imdb_id || null,
            tmdbId: data.id
          };
        }
      }
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] TMDB error: " + e.message);
    }
    return { title: idStr, year: null, imdbId: null, tmdbId: null };
  });
}
function searchByTitle(query, year) {
  return __async(this, null, function* () {
    if (!query)
      return [];
    const searchQuery = encodeURIComponent(query + (year ? " " + year : ""));
    const url = baseUrl + "/search.php?q=" + searchQuery + "&page=1&per_page=50";
    console.log("[" + PROVIDER_NAME + '] Search: "' + query.substring(0, 60) + '" -> ' + url.substring(0, 120));
    const data = yield fetchJson(url);
    if (!data || !data.hits || data.hits.length === 0) {
      console.log("[" + PROVIDER_NAME + "] Search: no results");
      return [];
    }
    console.log("[" + PROVIDER_NAME + "] Search: " + data.hits.length + " results");
    return data.hits.map((h) => {
      const doc = h.document || {};
      return {
        postId: String(doc.id || ""),
        title: (doc.post_title || "").replace(/Download\s*/gi, "").trim(),
        permalink: doc.permalink || "",
        imdbId: doc.imdb_id || "",
        year: ((doc.post_title || "").match(/\b(19|20)\d{2}\b/) || [null])[0]
      };
    });
  });
}
function fetchPostContent(postId) {
  return __async(this, null, function* () {
    if (!postId)
      return null;
    const apiUrl = baseUrl + "/wp-json/wp/v2/posts/" + postId;
    console.log("[" + PROVIDER_NAME + "] WP-JSON: fetching post " + postId);
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(15e3) : null;
      const res = yield fetch(apiUrl, {
        headers: MOBILE_HEADERS,
        signal: signal || void 0
      });
      if (!res || !res.ok) {
        console.log("[" + PROVIDER_NAME + "] WP-JSON: HTTP " + (res ? res.status : "null"));
        return null;
      }
      const json = yield res.json();
      if (!json || !json.content || !json.content.rendered) {
        console.log("[" + PROVIDER_NAME + "] WP-JSON: no content.rendered in response");
        return null;
      }
      const title = (json.title && json.title.rendered || "").replace(/Download\s*/gi, "").trim();
      console.log("[" + PROVIDER_NAME + '] WP-JSON: "' + title.substring(0, 80) + '" (content=' + json.content.rendered.length + " bytes)");
      return {
        title,
        html: json.content.rendered,
        slug: json.slug || "",
        link: json.link || ""
      };
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] WP-JSON error: " + e.message);
      return null;
    }
  });
}
function extractNexdriveLinks(contentHtml) {
  if (!contentHtml)
    return [];
  const links = [];
  const $ = cheerio.load(contentHtml);
  const seenUrls = /* @__PURE__ */ new Set();
  $('a[href*="nexdrive"], a[href*="genxfm"]').each((i, el) => {
    try {
      const href = $(el).attr("href");
      if (!href)
        return;
      const linkText = ($(el).text() || "").trim();
      if (EXCLUDED_BUTTONS.some((ex) => linkText.toLowerCase().includes(ex)))
        return;
      if (seenUrls.has(href))
        return;
      seenUrls.add(href);
      let quality = "HD";
      const hrefPos = contentHtml.indexOf(href);
      if (hrefPos > 0) {
        const beforeHref = contentHtml.substring(Math.max(0, hrefPos - 3e3), hrefPos);
        const qualityPattern = /(?:^|>|\s)(\d{3,4}p|4K|UHD|HDR)(?:<|\s|$)/gi;
        let qMatch;
        let lastMatch = null;
        let lastIndex = -1;
        while ((qMatch = qualityPattern.exec(beforeHref)) !== null) {
          if (qMatch.index > lastIndex) {
            lastIndex = qMatch.index;
            lastMatch = qMatch[1];
          }
        }
        if (lastMatch) {
          quality = parseQuality(lastMatch);
          if (!quality || quality === "HD")
            quality = parseQuality(lastMatch.toUpperCase());
        }
        if (!quality || quality === "HD") {
          const headingQ = beforeHref.match(/<(?:h[1-6]|strong|b)[^>]*>[^<]*?(\d{3,4}p|4K|UHD)[^<]*?<\//i);
          if (headingQ)
            quality = parseQuality(headingQ[1]);
        }
      }
      links.push({ href: fixUrl(href), quality: quality || "HD", label: linkText || "Download" });
    } catch (e) {
    }
  });
  console.log("[" + PROVIDER_NAME + "] Content: found " + links.length + " nexdrive links (quality from backwards scan)");
  if (links.length > 0) {
    const qCounts = {};
    links.forEach((l) => {
      const q = l.quality || "HD";
      qCounts[q] = (qCounts[q] || 0) + 1;
    });
    console.log("[" + PROVIDER_NAME + "]   Qualities: " + JSON.stringify(qCounts));
  }
  return links;
}
function capLinksForEfficiency(links, maxTotal) {
  maxTotal = maxTotal || 8;
  if (!links || links.length <= maxTotal)
    return links;
  const hasNonHdQuality = links.some((l) => l.quality && l.quality !== "HD");
  let cappedLinks = [];
  if (hasNonHdQuality) {
    const qualityPriority = ["2160p", "4K", "1440p", "1080p", "720p", "480p", "HD", "360p"];
    const maxPerQuality = 2;
    const filled = {};
    let count = 0;
    for (const q of qualityPriority) {
      if (count >= maxTotal)
        break;
      let qCount = 0;
      for (const link of links) {
        if (count >= maxTotal)
          break;
        if ((link.quality || "HD") === q && qCount < maxPerQuality) {
          if (q === "480p" && count > 0)
            continue;
          cappedLinks.push(link);
          qCount++;
          count++;
        }
      }
    }
    if (count < maxTotal) {
      for (const link of links) {
        if (count >= maxTotal)
          break;
        if (!cappedLinks.includes(link)) {
          cappedLinks.push(link);
          count++;
        }
      }
    }
  } else {
    const step = Math.max(1, Math.floor(links.length / maxTotal));
    for (let i = 0; i < maxTotal && i * step < links.length; i++) {
      cappedLinks.push(links[i * step]);
    }
    if (cappedLinks.length < maxTotal) {
      for (const link of links) {
        if (cappedLinks.length >= maxTotal)
          break;
        if (!cappedLinks.includes(link))
          cappedLinks.push(link);
      }
    }
  }
  const dropped = links.length - cappedLinks.length;
  console.log("[" + PROVIDER_NAME + "] Capped " + links.length + " links -> " + cappedLinks.length + " (" + dropped + " dropped, saves ~" + dropped * 3 + " HTTP requests)");
  return cappedLinks;
}
function extractSeasonFromContent(contentHtml, targetSeason, targetEpisode) {
  if (!contentHtml)
    return contentHtml;
  const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "u", "span"];
  const seasonTextRegex = /\b(?:Season|Saison|Staffel)\s+(\d+)\b/gi;
  const positions = [];
  let match;
  while ((match = seasonTextRegex.exec(contentHtml)) !== null) {
    const seasonNum = parseInt(match[1]);
    const pos = match.index;
    let openTagPos = -1;
    let depth = 0;
    for (let i2 = pos - 1; i2 >= Math.max(0, pos - 2e3); i2--) {
      const ch = contentHtml[i2];
      if (ch === ">") {
        depth++;
      } else if (ch === "<") {
        if (depth === 0) {
          if (contentHtml[i2 + 1] !== "/") {
            openTagPos = i2;
            break;
          }
        } else {
          depth--;
        }
      }
    }
    if (openTagPos === -1)
      continue;
    const tagEnd = contentHtml.indexOf(">", openTagPos);
    if (tagEnd === -1 || tagEnd >= pos)
      continue;
    const tagContent = contentHtml.substring(openTagPos + 1, tagEnd).trim().split(/\s+/)[0];
    if (!tagContent)
      continue;
    const tagName = tagContent.toLowerCase();
    if (headingTags.indexOf(tagName) === -1)
      continue;
    const voidElements = ["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"];
    if (voidElements.indexOf(tagName) !== -1)
      continue;
    const closeTag = "</" + tagName + ">";
    const closeTagPos = contentHtml.indexOf(closeTag, Math.max(pos, tagEnd));
    if (closeTagPos === -1)
      continue;
    const contentStart = closeTagPos + closeTag.length;
    positions.push({
      seasonNum,
      tagName,
      contentStart,
      matchPos: pos
    });
  }
  if (positions.length === 0) {
    console.log("[" + PROVIDER_NAME + "] extractSeason: no heading season markers found, treating as pack");
    return null;
  }
  positions.sort(function(a, b) {
    return a.matchPos - b.matchPos;
  });
  var collapsed = [];
  var i = 0;
  while (i < positions.length) {
    var j = i;
    while (j + 1 < positions.length && positions[j + 1].seasonNum === positions[i].seasonNum) {
      j++;
    }
    collapsed.push(positions[j]);
    i = j + 1;
  }
  for (var idx = 0; idx < collapsed.length; idx++) {
    if (collapsed[idx].seasonNum === targetSeason) {
      var start = collapsed[idx].contentStart;
      var end = idx + 1 < collapsed.length ? collapsed[idx + 1].matchPos : contentHtml.length;
      var sectionContent = contentHtml.substring(start, end);
      console.log("[" + PROVIDER_NAME + "] Season " + targetSeason + " section found (" + sectionContent.length + " chars, " + positions.length + " total)");
      return sectionContent;
    }
  }
  console.log("[" + PROVIDER_NAME + "] extractSeason: target season " + targetSeason + " not found among " + collapsed.length + " headings, treating as pack");
  return null;
}
function extractSingleVc(vcUrl, referer, targetSeason, targetEpisode, isSeasonSpecific) {
  return __async(this, null, function* () {
    const streams = [];
    const lower = vcUrl.toLowerCase();
    if (lower.includes("vcloud") || lower.includes("hubcloud") || lower.includes("nexdrive")) {
      const isHub = lower.includes("hubcloud");
      const latestBase = isHub ? getLatestHubDomain() : getLatestVcDomain();
      const curBase = getOrigin(vcUrl);
      let newUrl = vcUrl;
      if (curBase !== latestBase) {
        newUrl = vcUrl.replace(curBase, latestBase);
      }
      console.log("[" + PROVIDER_NAME + "] V-Cloud: fetching " + newUrl.substring(0, 100));
      const html = yield fetchHtml(newUrl, {
        headers: __spreadProps(__spreadValues({}, HEADERS), { "Referer": referer || baseUrl + "/", "Cookie": "xla=s4t" })
      });
      if (!html)
        return streams;
      const rawHtml = html.html();
      if ((targetSeason != null || targetEpisode != null) && isSeasonSpecific) {
        const pageTitle = html("title").text() || "";
        const seMatch = pageTitle.match(/[.\s_-]S(\d{1,2})E(\d{1,2})[.\s_-]/i);
        if (seMatch) {
          const vcSeason = parseInt(seMatch[1]);
          const vcEpisode = parseInt(seMatch[2]);
          if (targetSeason != null && vcSeason !== targetSeason) {
            console.log("[" + PROVIDER_NAME + "] V-Cloud title season mismatch: title=" + pageTitle.substring(0, 60) + " target=S" + targetSeason + "E" + (targetEpisode || "?"));
            return streams;
          }
          if (targetEpisode != null && vcEpisode !== targetEpisode) {
            console.log("[" + PROVIDER_NAME + "] V-Cloud title episode mismatch: title=" + pageTitle.substring(0, 60) + " target=S" + (targetSeason || "?") + "E" + targetEpisode);
            return streams;
          }
        }
      }
      let bridgeUrl = "";
      const varMatch = rawHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
      if (varMatch) {
        bridgeUrl = varMatch[1];
      }
      if (!bridgeUrl) {
        const downloadHref = html("#download").attr("href") || html("a").filter((i, el) => {
          const href = html(el).attr("href") || "";
          return href.includes("hubcloud.php") || href.includes("token") || href.includes("dl");
        }).first().attr("href");
        if (downloadHref) {
          bridgeUrl = downloadHref.startsWith("http") ? downloadHref : getOrigin(newUrl) + "/" + downloadHref.replace(/^\//, "");
        }
      }
      if (!bridgeUrl) {
        console.log("[" + PROVIDER_NAME + "] V-Cloud: no bridge URL found");
        return streams;
      }
      if (bridgeUrl.indexOf("://") < 0)
        bridgeUrl = getOrigin(newUrl) + bridgeUrl;
      console.log("[" + PROVIDER_NAME + "] V-Cloud: bridge URL -> " + bridgeUrl.substring(0, 100));
      const bridgeHtml = yield fetchHtml(bridgeUrl, {
        headers: __spreadProps(__spreadValues({}, HEADERS), { "Referer": newUrl, "Cookie": "xla=s4t" })
      });
      if (!bridgeHtml) {
        console.log("[" + PROVIDER_NAME + "] V-Cloud: bridge page fetch failed (null)");
        return streams;
      }
      const bridgeRaw = bridgeHtml.html();
      console.log("[" + PROVIDER_NAME + "] V-Cloud: bridge page size=" + bridgeRaw.length + " bytes");
      const headerText = bridgeHtml("div.card-header").text() || "";
      const quality = parseQuality(headerText) || "HD";
      if (targetSeason != null && isSeasonSpecific) {
        const sRegex = new RegExp("(?:s|season|staffel|saison)\\s*0*" + Number(targetSeason) + "(?![0-9])", "i");
        const anySRegex = /(?:s|season|staffel|saison)\s*0*\d+/i;
        if (anySRegex.test(headerText) && !sRegex.test(headerText)) {
          console.log("[" + PROVIDER_NAME + "] Bridge wrong season: " + headerText.substring(0, 60));
          return streams;
        }
      }
      if (targetEpisode != null && isSeasonSpecific) {
        const eRegex = new RegExp("(?:e|ep|episode)\\s*0*" + Number(targetEpisode) + "(?![0-9])", "i");
        const anyERegex = /(?:e|ep|episode)\s*0*\d+/i;
        if (anyERegex.test(headerText) && !eRegex.test(headerText)) {
          console.log("[" + PROVIDER_NAME + "] Bridge wrong episode: " + headerText.substring(0, 60));
          return streams;
        }
      }
      const serverTasks = [];
      let totalLinks = 0;
      bridgeHtml("a.btn, a").each((i, el) => {
        try {
          let href, text, lowerText;
          try {
            href = bridgeHtml(el).attr("href");
          } catch (e) {
            href = "";
          }
          try {
            text = (bridgeHtml(el).text() || "").trim();
          } catch (e) {
            text = "";
          }
          try {
            lowerText = (text || "").toLowerCase();
          } catch (e) {
            lowerText = "";
          }
          totalLinks++;
          if (i < 5 && href) {
            try {
              console.log("[" + PROVIDER_NAME + "] V-Cloud: link[" + i + "] href=" + (href || "").substring(0, 60) + " text=" + (text || "").substring(0, 40));
            } catch (e) {
            }
          }
          if (!href || href === "#")
            return;
          if (href.toLowerCase().includes(".zip"))
            return;
          if (lowerText && lowerText.includes("fsl")) {
            const synced = href + "?s=" + (1 + (/* @__PURE__ */ new Date()).getMinutes());
            serverTasks.push(() => {
              streams.push(makeStream("FSL | " + quality, (text || "") + " [" + (headerText || "") + "]", synced, quality, {
                "Referer": bridgeUrl
              }));
              return [];
            });
          }
          if (href.includes("pixeldra") || lowerText && lowerText.includes("pixel")) {
            let pxlUrl = "";
            try {
              const pxlMatch = bridgeRaw.match(/var\s+pxl\s*=\s*["']([^"']+)["']/);
              pxlUrl = pxlMatch ? pxlMatch[1] : href;
            } catch (e) {
              pxlUrl = href;
            }
            if (pxlUrl) {
              let finalUrl = pxlUrl;
              try {
                if (pxlUrl.toLowerCase().includes("download")) {
                  finalUrl = pxlUrl;
                } else {
                  const seg = pxlUrl.split("/").pop();
                  const base = getOrigin(pxlUrl);
                  finalUrl = base + "/api/file/" + seg + "?download";
                }
              } catch (e) {
                finalUrl = pxlUrl;
              }
              serverTasks.push(() => {
                streams.push(makeStream("PixelDrain | " + quality, (text || "") + " [" + (headerText || "") + "]", finalUrl, quality, {
                  "Referer": bridgeUrl
                }));
                return [];
              });
            }
          }
          try {
            const isFastCdn = href.includes("r2.dev") || href.includes("gofile") || href.includes("diskcdn") || href.includes("lotuscdn") || href.includes("workers.dev");
            if ((lowerText && lowerText.includes("download") || isFastCdn) && (!lowerText || !lowerText.includes("telegram") && !lowerText.includes("zip") && !lowerText.includes("10gbps") && !lowerText.includes("buzz")) && !href.includes("gpdl2") && !href.includes("hubcloud.foo/tg")) {
              serverTasks.push(() => {
                streams.push(makeStream("Download | " + quality, (text || "") + " [" + (headerText || "") + "]", href, quality, {
                  "Referer": bridgeUrl
                }));
                return [];
              });
            }
          } catch (e) {
          }
        } catch (eBridgeLink) {
          console.log("[" + PROVIDER_NAME + "] V-Cloud: link[" + i + "] parse error: " + eBridgeLink.message);
        }
      });
      console.log("[" + PROVIDER_NAME + "] V-Cloud: total link elements=" + totalLinks + " matching tasks=" + serverTasks.length);
      if (serverTasks.length === 0) {
        const fslHref = bridgeHtml("#fsl").attr("href");
        if (fslHref) {
          console.log("[" + PROVIDER_NAME + "] V-Cloud: #fsl fallback found -> " + fslHref.substring(0, 80));
          const synced = fslHref + "?s=" + (1 + (/* @__PURE__ */ new Date()).getMinutes());
          serverTasks.push(() => {
            streams.push(makeStream("FSL | " + quality, "FSL Server [" + headerText + "]", synced, quality, {
              "Referer": bridgeUrl
            }));
            return [];
          });
        } else {
          console.log("[" + PROVIDER_NAME + "] V-Cloud: no matching server links, bridge preview=" + bridgeRaw.substring(500, 800).replace(/\n/g, " "));
        }
      }
      if (serverTasks.length > 0) {
        yield Promise.all(serverTasks.map((fn) => __async(this, null, function* () {
          try {
            return yield fn();
          } catch (e) {
            return [];
          }
        })));
      }
      console.log("[" + PROVIDER_NAME + "] V-Cloud: found " + streams.length + " streams");
    }
    return streams;
  });
}
function loadStreamsFromUrl(url, label, quality, referer, targetSeason, targetEpisode, isSeasonSpecific) {
  return __async(this, null, function* () {
    const lower = url.toLowerCase();
    if (lower.includes("vcloud") || lower.includes("hubcloud")) {
      return yield extractSingleVc(url, referer || url, targetSeason, targetEpisode, isSeasonSpecific);
    }
    if (lower.includes("nexdrive") || lower.includes("genxfm")) {
      const $ = yield fetchHtml(url, { headers: __spreadProps(__spreadValues({}, HEADERS), { "Referer": referer || baseUrl + "/" }) });
      if (!$)
        return [];
      const tasks = [];
      $('a[href*="vcloud"], a[href*="hubcloud"]').each((i, el) => {
        const href = $(el).attr("href");
        if (href)
          tasks.push(() => extractSingleVc(fixUrl(href), url, targetSeason, targetEpisode, isSeasonSpecific));
      });
      if (tasks.length === 0) {
        $('a[href*="fastdl"]').each((i, el) => {
          const href = $(el).attr("href");
          if (href)
            tasks.push(() => extractSingleVc(fixUrl(href), url, targetSeason, targetEpisode, isSeasonSpecific));
        });
      }
      const results = yield Promise.all(tasks.map((fn) => (() => __async(this, null, function* () {
        try {
          return yield fn();
        } catch (e) {
          return [];
        }
      }))()));
      const streams = [];
      results.forEach((r) => {
        if (Array.isArray(r))
          r.forEach((s) => {
            if (s && s.url)
              streams.push(s);
          });
      });
      return streams;
    }
    return [];
  });
}
function extractFromPost(postId, label, isTv, targetSeason, targetEpisode) {
  return __async(this, null, function* () {
    try {
      const post = yield fetchPostContent(postId);
      if (!post || !post.html) {
        console.log("[" + PROVIDER_NAME + "] extractPost: failed to fetch post " + postId);
        return [];
      }
      let contentHtml = post.html;
      let seasonLabel = "";
      let isSeasonSpecific = false;
      if (isTv && targetSeason) {
        const filtered = extractSeasonFromContent(contentHtml, targetSeason, targetEpisode);
        if (filtered) {
          contentHtml = filtered;
          isSeasonSpecific = true;
          seasonLabel = " S" + targetSeason;
          if (targetEpisode)
            seasonLabel += "E" + targetEpisode;
        } else {
          isSeasonSpecific = false;
          seasonLabel = " S" + targetSeason;
          if (targetEpisode)
            seasonLabel += "E" + targetEpisode;
          console.log("[" + PROVIDER_NAME + "] extractPost: no season sections, treating as pack" + seasonLabel);
        }
      }
      const links = extractNexdriveLinks(contentHtml);
      const efficientLinks = capLinksForEfficiency(links);
      if (efficientLinks.length === 0) {
        console.log("[" + PROVIDER_NAME + "] extractPost: no nexdrive links found in content");
        return [];
      }
      const streams = [];
      const tasks = [];
      for (const link of efficientLinks) {
        const quality = link.quality || "HD";
        const displayLabel = label + seasonLabel + " [" + quality + "]";
        tasks.push(() => loadStreamsFromUrl(link.href, displayLabel, quality, baseUrl + "/", targetSeason, targetEpisode, isSeasonSpecific));
      }
      console.log("[" + PROVIDER_NAME + "] extractPost: resolving " + tasks.length + " nexdrive links (capped from " + links.length + ")...");
      const results = yield Promise.all(tasks.map((fn) => (() => __async(this, null, function* () {
        try {
          return yield fn();
        } catch (e) {
          return [];
        }
      }))()));
      results.forEach((r) => {
        if (Array.isArray(r))
          r.forEach((s) => {
            if (s && s.url)
              streams.push(s);
          });
      });
      console.log("[" + PROVIDER_NAME + "] extractPost: " + streams.length + " streams from " + links.length + " links");
      return streams;
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] extractPost Fatal: " + e.message);
      return [];
    }
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log("[" + PROVIDER_NAME + "] Request: ID=" + tmdbId + " Type=" + mediaType + " S=" + season + " E=" + episode);
      yield refreshDomains();
      const isTv = mediaType === "tv" || mediaType === "series";
      const media = yield getTMDBInfo(tmdbId, mediaType);
      let imdbId = media.imdbId;
      let mediaTitle = media.title;
      let mediaYear = media.year;
      console.log("[" + PROVIDER_NAME + '] Resolved: "' + mediaTitle + '" (' + (mediaYear || "N/A") + ") imdb=" + (imdbId || "none"));
      if ((!imdbId || !imdbId.startsWith("tt")) && String(tmdbId).startsWith("tt")) {
        imdbId = String(tmdbId);
        console.log("[" + PROVIDER_NAME + "] Using raw phone IMDB ID: " + imdbId);
      }
      let query = mediaTitle;
      const isRawNumericTitle = /^\d+$/.test(mediaTitle);
      if (isRawNumericTitle) {
        if (imdbId && imdbId.startsWith("tt")) {
          query = imdbId;
          console.log("[" + PROVIDER_NAME + "] TMDB failed, using imdb ID as query: " + imdbId);
        }
      } else if (isTv && season != null) {
        query += " season " + Number(season);
      } else if (mediaYear) {
        query += " " + mediaYear;
      }
      let searchResults = yield searchByTitle(query, mediaYear);
      if (searchResults.length === 0 && isTv && season != null) {
        console.log("[" + PROVIDER_NAME + "] No results with season query, trying title alone...");
        searchResults = yield searchByTitle(mediaTitle, mediaYear);
      }
      if (searchResults.length === 0) {
        console.log("[" + PROVIDER_NAME + "] No search results found");
        return [];
      }
      let bestMatch = null;
      let bestScore = 0;
      const targetImdb = imdbId && imdbId.startsWith("tt") ? imdbId : null;
      for (const r of searchResults) {
        if (targetImdb && r.imdbId === targetImdb) {
          const sMatch = !isTv || !season || new RegExp("(?:s|season|staffel|saison)\\s*0*" + Number(season) + "\\b", "i").test(r.title);
          if (sMatch) {
            bestMatch = r;
            bestScore = 2;
            console.log("[" + PROVIDER_NAME + '] IMDB exact + season match: "' + r.title.substring(0, 60) + '"');
            break;
          }
        }
        const score = similarity(mediaTitle, r.title, mediaYear, isTv && season != null ? Number(season) : null);
        const finalScore = targetImdb && r.imdbId === targetImdb ? score + 0.3 : score;
        if (finalScore > bestScore && finalScore > 0.4) {
          bestScore = finalScore;
          bestMatch = r;
        }
      }
      if (!bestMatch && searchResults.length > 0) {
        const firstWord = mediaTitle.toLowerCase().split(" ")[0];
        if (firstWord && searchResults[0].title.toLowerCase().includes(firstWord)) {
          bestMatch = searchResults[0];
          console.log("[" + PROVIDER_NAME + '] Fallback: first word match -> "' + bestMatch.title.substring(0, 60) + '"');
        }
      }
      if (!bestMatch || !bestMatch.postId) {
        console.log("[" + PROVIDER_NAME + "] No confident match (score=" + bestScore + ")");
        return [];
      }
      console.log("[" + PROVIDER_NAME + '] Matched: "' + bestMatch.title.substring(0, 80) + '" (id=' + bestMatch.postId + ", score=" + bestScore + ")");
      const streams = yield extractFromPost(
        bestMatch.postId,
        mediaTitle,
        isTv,
        season != null ? Number(season) : null,
        episode != null ? Number(episode) : null
      );
      const result = dedupe(streams);
      console.log("[" + PROVIDER_NAME + "] Total unique streams: " + result.length);
      return result;
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] Fatal: " + e.message);
      return [];
    }
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
