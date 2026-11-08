"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function metaValues(names) {
  const values = [];
  for (const name of names) {
    for (const element of document.querySelectorAll(`meta[name="${name}"], meta[property="${name}"]`)) {
      const value = clean(element.getAttribute("content"));
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

function firstMeta(names) {
  return metaValues(names)[0] || "";
}

function absoluteUrl(value) {
  try { return value ? new URL(value, window.location.href).href : ""; } catch { return ""; }
}

function urlsFromElementActions(element) {
  const values = [
    element.getAttribute("href"),
    element.getAttribute("data-href"),
    element.getAttribute("data-url"),
    element.getAttribute("data-download-url"),
    element.getAttribute("onclick"),
    element.getAttribute("onmousedown")
  ].filter(Boolean).join(" ");
  const urls = [];
  const pattern = /(?:https?:\/\/[^\s'"<>]+|\/[^\s'"<>]+)/gi;
  for (const match of values.match(pattern) || []) {
    const value = match.replace(/[),;]+$/, "");
    if (/\.pdf(?:$|[?#])|download|pdfdown|fulltext/i.test(value)) urls.push(value);
  }
  return urls;
}

function firstText(selectors, root = document) {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    const value = clean(element?.innerText || element?.textContent || "");
    if (value) return value;
  }
  return "";
}

function normalizedTitle(value) {
  return clean(value)
    .replace(/\s*-\s*中国知网\s*$/i, "")
    .replace(/\s*-\s*CNKI\s*$/i, "")
    .trim();
}

function extractElementTitle(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const clone = element.cloneNode(true);
    clone.querySelectorAll("sup, .type, .mt-trans, .en-title, .english-title, br + span, .icon, .iconfont").forEach(node => node.remove());
    const value = normalizedTitle(clone.innerText || clone.textContent || "");
    if (value) return value;
  }
  return "";
}

function extractAuthorsFromNode(node) {
  if (!node) return [];
  const values = [];
  for (const link of node.querySelectorAll("a")) {
    const clone = link.cloneNode(true);
    clone.querySelectorAll("sup, .icon, .iconfont, span[class*='author']").forEach(item => item.remove());
    const value = clean(clone.innerText || clone.textContent || "");
    if (value && value.length <= 100 && !values.includes(value)) values.push(value);
  }
  if (!values.length) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("sup, .icon, .iconfont").forEach(item => item.remove());
    clean(clone.innerText || clone.textContent || "").split(/[;；,，、]\s*/).forEach(value => {
      const author = clean(value);
      if (author && author.length <= 100 && !values.includes(author)) values.push(author);
    });
  }
  return values;
}

function firstJsonLdScholarlyArticle() {
  const roots = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      if (Array.isArray(parsed)) roots.push(...parsed);
      else if (parsed && typeof parsed === 'object') {
        roots.push(parsed);
        if (Array.isArray(parsed['@graph'])) roots.push(...parsed['@graph']);
      }
    } catch {}
  }
  const typeIsArticle = value => {
    const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
    return types.some(type => /(?:ScholarlyArticle|Article|NewsArticle|Report)/i.test(String(type || '')));
  };
  return roots.find(typeIsArticle) || null;
}

function jsonLdAuthors(value) {
  const raw = value?.author;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return rows.map(item => clean(typeof item === 'string' ? item : item?.name)).filter(Boolean);
}

function cleanPublicationName(value) {
  return clean(value)
    .replace(/^《|》$/g, '')
    .replace(/^来源\s*[:：]\s*/i, '')
    .replace(/\s*[（(]?\s*(?:19|20)\d{2}\s*年?(?:第?\s*\d+\s*期)?\s*[）)]?\s*$/g, '')
    .trim();
}

function normalizedComparable(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function textSimilarity(left, right) {
  const a = normalizedComparable(left)
  const b = normalizedComparable(right)
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 1
  const grams = value => {
    const size = value.length >= 8 ? 3 : 2
    const set = new Set()
    for (let index = 0; index <= value.length - size; index++) set.add(value.slice(index, index + size))
    return set
  }
  const ga = grams(a)
  const gb = grams(b)
  let intersection = 0
  for (const item of ga) if (gb.has(item)) intersection += 1
  return intersection / Math.max(1, Math.min(ga.size, gb.size))
}

function elementTextLength(node) {
  return clean(node?.innerText || node?.textContent || "").length
}

function selectBestContentRoot(title) {
  const candidates = new Set()
  document.querySelectorAll("article, main, [role='main'], .article-main, .article-content, .article-body, .fulltext, .full-text, .detail-content, .paper-content, #mainText, #content, section").forEach(node => candidates.add(node))
  document.querySelectorAll("div").forEach((node, index) => {
    if (index > 3500) return
    const length = elementTextLength(node)
    if (length >= 350 && length <= 500000) candidates.add(node)
  })
  const titleKey = normalizedComparable(title)
  let best = null
  let bestScore = -Infinity
  for (const node of candidates) {
    const text = clean(node.innerText || node.textContent || "")
    const length = text.length
    if (length < 180) continue
    const linkLength = Array.from(node.querySelectorAll("a")).reduce((sum, link) => sum + elementTextLength(link), 0)
    const linkDensity = linkLength / Math.max(1, length)
    const paragraphs = node.querySelectorAll("p").length
    const headings = node.querySelectorAll("h1, h2, h3").length
    const signature = `${node.id || ""} ${node.className || ""} ${node.getAttribute("role") || ""}`.toLowerCase()
    let score = Math.min(110, length / 35) + Math.min(60, paragraphs * 5) + Math.min(20, headings * 3)
    if (/article|content|main|detail|abstract|paper|full.?text|正文|全文|论文/.test(signature)) score += 75
    if (/nav|menu|footer|header|sidebar|recommend|related|search|list|comment|advert|catalog/.test(signature)) score -= 130
    if (linkDensity > 0.28) score -= (linkDensity - 0.28) * 360
    if (titleKey && normalizedComparable(text.slice(0, 5000)).includes(titleKey)) score += 55
    if (node.matches("article, main, [role='main']")) score += 35
    if (node.querySelector("nav, footer, .recommend, .related")) score -= 12
    if (score > bestScore) { bestScore = score; best = node }
  }
  return best
}

function pdfLinkScore(element, rawUrl, label, articleRoot, pageTitle) {
  const signature = `${element.id || ""} ${element.className || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase()
  const surrounding = clean(element.closest("section, article, div")?.innerText || "").slice(0, 3000)
  let score = 0
  if (element.matches("meta")) score += 260
  if (/citation_pdf_url|eprints.document_url|bepress_citation_pdf_url/i.test(signature)) score += 260
  if (/pdf|全文|下载|download|full.?text/i.test(label)) score += 65
  if (element.closest(".btn-dlpdf, .pdf-download, .download-pdf, .toolbar, .article-tools")) score += 95
  if (articleRoot?.contains(element)) score += 80
  if (/[?&](?:download|pdf|fulltext|filename)=/i.test(rawUrl)) score += 30
  if (/\.pdf(?:$|[?#])/i.test(rawUrl)) score += 35
  const contextSimilarity = textSimilarity(`${label} ${surrounding}`, pageTitle)
  score += Math.round(contextSimilarity * 80)
  const ancestor = element.closest("nav, aside, footer, .recommend, .related, .search, .list, .menu")
  if (ancestor) score -= 180
  if (/other|related|recommend|相关|推荐|下一篇|上一篇/i.test(`${label} ${signature}`)) score -= 90
  return score
}

function buildCitation(meta) {
  const authors = clean(meta.authors);
  const year = clean(meta.year);
  const title = clean(meta.title);
  const source = clean(meta.journal || meta.publisher || meta.source);
  const volumeIssue = [meta.volume && `第${meta.volume}卷`, meta.issue && `第${meta.issue}期`].filter(Boolean).join('，');
  const pages = clean(meta.pages);
  return [authors, year ? `(${year})` : '', title, source, volumeIssue, pages ? `第${pages}页` : ''].filter(Boolean).join('. ');
}

function extractCnkiMetadata() {
  const title = extractElementTitle([
    ".h1-scholar",
    ".wx-tit > h1",
    ".wx-tit h1",
    ".article-title",
    "h1.title",
    "#title"
  ]);
  const authorNode = document.querySelector("#authorpart") || document.querySelector(".author") || document.querySelector(".authors");
  const authors = extractAuthorsFromNode(authorNode);
  const abstractText = firstText(["#ChDivSummary", ".abstract-text", "#abstract_text", ".abstract", ".summary"])
    .replace(/^(摘要|Abstract)\s*[:：]?\s*/i, "");
  const publicationText = firstText([".journal-title", ".source-title", ".publication", ".top-tip"]);
  const journalFromMeta = firstMeta(["citation_journal_title", "prism.publicationName", "dc.source"]);
  const journalFromAngle = publicationText.match(/《([^》]+)》/)?.[1] || "";
  const yearMatch = `${firstMeta(["citation_publication_date", "citation_date", "dc.date"])} ${publicationText} ${document.body?.innerText?.slice(0, 20000) || ""}`.match(/(?:19|20)\d{2}/);
  const doiMatch = `${document.body?.innerText?.slice(0, 30000) || ""}`.match(/\bDOI\s*[:：]\s*(10\.\d{4,9}\/[^\s，,;；]+)/i);
  const journal = cleanPublicationName(journalFromMeta || journalFromAngle || publicationText.split(/[.。]\s*/)[0] || "");
  return {
    title,
    authors: authors.join("; "),
    year: yearMatch?.[0] || "",
    abstract: abstractText,
    publication: journal,
    doi: firstMeta(["citation_doi", "dc.identifier", "dc.identifier.doi"]) || doiMatch?.[1] || "",
    isDetailPage: Boolean(title || abstractText || authors.length || document.querySelector(".btn-dlpdf")),
    scholar: /scholar\.cnki\.net$/i.test(window.location.hostname)
  };
}

function collectPdfCandidates(title) {
  const candidates = [];
  const rankedUrls = new Map();
  const selectors = [];
  const seenSelectors = new Set();
  const articleRoot = selectBestContentRoot(title);
  let candidateIndex = 0;
  const addCandidate = (rawValue, score = 0) => {
    const url = absoluteUrl(rawValue);
    if (!/^https?:/i.test(url)) return;
    const previous = rankedUrls.get(url)?.score ?? -Infinity;
    if (score > previous) rankedUrls.set(url, { url, score });
  };
  for (const value of metaValues(["citation_pdf_url", "eprints.document_url", "bepress_citation_pdf_url"])) addCandidate(value, 300);
  if (document.contentType === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(window.location.href)) addCandidate(window.location.href, 360);

  document.querySelectorAll("[data-vocflow-pdf-candidate]").forEach(node => node.removeAttribute("data-vocflow-pdf-candidate"));
  const preferred = document.querySelectorAll("#pdfDown, a#pdfDown, .btn-dlpdf > a, .btn-dlpdf a, .btn-dlpdf, .pdf-download, a[href*='pdf'], a[href*='download'], a[onclick*='pdf'], a[onclick*='download'], a[download], iframe[src*='pdf'], embed[src*='pdf'], object[data*='pdf']");
  for (const element of preferred) {
    const rawUrl = element.getAttribute("href") || element.getAttribute("src") || element.getAttribute("data") || element.getAttribute("data-href") || element.getAttribute("data-url");
    const label = clean(element.innerText || element.textContent || element.getAttribute("title") || element.getAttribute("aria-label") || "");
    const isPdfLike = Boolean(
      element.closest(".btn-dlpdf, .pdf-download, .article-tools, .toolbar") ||
      /\.pdf(?:$|[?#])/i.test(rawUrl || "") ||
      /pdf|全文|下载|full.?text/i.test(`${label} ${rawUrl || ""}`)
    );
    if (!isPdfLike) continue;
    const score = pdfLinkScore(element, rawUrl || '', label, articleRoot, title);
    if (rawUrl && !/^javascript:/i.test(rawUrl)) addCandidate(rawUrl, score);
    for (const actionUrl of urlsFromElementActions(element)) addCandidate(actionUrl, score - 5);
    const marker = String(candidateIndex++);
    element.setAttribute("data-vocflow-pdf-candidate", marker);
    const selector = `[data-vocflow-pdf-candidate="${marker}"]`;
    if (!seenSelectors.has(selector)) {
      seenSelectors.add(selector);
      selectors.push({ selector, score });
    }
  }
  const orderedSelectors = selectors.sort((left, right) => right.score - left.score).map(item => item.selector);
  const orderedCandidates = [...rankedUrls.values()].sort((left, right) => right.score - left.score).map(item => item.url);
  return { candidates: orderedCandidates, selectors: orderedSelectors, articleRoot };
}

function collectContentText(title) {
  const root = selectBestContentRoot(title);
  if (!root) return "";
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, nav, footer, header, aside, form, button, .advertisement, .ads, .recommend, .related, .comments, .share, .toolbar").forEach(node => node.remove());
  return String(clone.innerText || clone.textContent || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 300000);
}

function collectPage() {
  const isCnki = /(^|\.)cnki\.net$/i.test(window.location.hostname);
  const looksLikeCnki = Boolean(document.querySelector('.wx-tit > h1, #authorpart, .btn-dlpdf, #pdfDown'));
  const cnki = (isCnki || looksLikeCnki) ? extractCnkiMetadata() : null;
  const ld = firstJsonLdScholarlyArticle();
  const metaTitle = firstMeta(["citation_title", "dc.title", "dcterms.title", "og:title"]);
  const metaAuthors = metaValues(["citation_author", "dc.creator", "dcterms.creator", "author"]).join("; ");
  const ldPart = ld?.isPartOf && !Array.isArray(ld.isPartOf) ? ld.isPartOf : null;
  const title = normalizedTitle(cnki?.title || metaTitle || clean(ld?.headline || ld?.name) || document.title);
  const authors = metaAuthors || cnki?.authors || jsonLdAuthors(ld).join("; ");
  const dateText = firstMeta(["citation_publication_date", "citation_date", "dc.date", "dcterms.issued"]) || clean(ld?.datePublished);
  const year = cnki?.year || dateText.match(/(?:19|20)\d{2}/)?.[0] || "";
  const abstract = cnki?.abstract || firstMeta(["citation_abstract", "dc.description", "description", "og:description"]) || clean(ld?.abstract || ld?.description);
  const metaJournal = firstMeta(["citation_journal_title", "citation_conference_title", "prism.publicationName", "dc.source"]);
  const publication = cleanPublicationName(cnki?.publication || metaJournal || ldPart?.name || firstMeta(["citation_publisher", "publisher"]) || "");
  const volume = firstMeta(["citation_volume", "prism.volume"]) || clean(ldPart?.volumeNumber);
  const issue = firstMeta(["citation_issue", "prism.issueIdentifier"]) || clean(ldPart?.issueNumber);
  const pages = firstMeta(["citation_firstpage", "citation_lastpage", "prism.startingPage"]) || clean(ld?.pagination);
  const doi = cnki?.doi || firstMeta(["citation_doi", "dc.identifier", "dc.identifier.doi"]) || clean(ld?.identifier && (typeof ld.identifier === 'string' ? ld.identifier : ''));
  const issn = firstMeta(["citation_issn", "prism.issn", "prism.eissn"]);
  const publisher = firstMeta(["citation_publisher", "dc.publisher", "publisher"]) || clean(ld?.publisher?.name || ld?.publisher);
  const pdf = collectPdfCandidates(title);
  let invalidReason = "";
  if (isCnki && /journalDetail/i.test(window.location.pathname) && !cnki?.isDetailPage) {
    invalidReason = "当前是期刊导航页，请先打开具体文献详情后再点击抓取。";
  } else if (/^(外文期刊导航详情|期刊导航详情|中国知网|检索结果|Search Results)$/i.test(title) && !authors && !abstract && !pdf.candidates.length) {
    invalidReason = "当前页面没有识别到具体文献，请打开文章详情页后再抓取。";
  }
  const meta = { title, authors, year, journal: publication, volume, issue, pages, doi, issn, publisher };
  return {
    title,
    authors,
    year,
    source: publication || publisher || window.location.hostname,
    sourceUrl: window.location.href,
    doi,
    abstract,
    volume,
    issue,
    pages,
    issn,
    publisher,
    citation: buildCitation(meta),
    itemType: /journal/i.test(String(ld?.['@type'] || '')) || isCnki ? 'journalArticle' : 'webpage',
    language: document.documentElement.lang || firstMeta(['citation_language', 'dc.language']) || 'zh-CN',
    contentText: collectContentText(title),
    selectedText: clean(window.getSelection()?.toString()),
    pdfUrl: pdf.candidates[0] || "",
    pdfCandidates: pdf.candidates,
    downloadSelectors: pdf.selectors,
    contentType: document.contentType || "",
    capturedAt: new Date().toISOString(),
    invalidReason
  };
}

contextBridge.exposeInMainWorld("vocflowCapture", {
  captureCurrent: function() {
    const page = collectPage();
    if (page.invalidReason) return Promise.resolve({ success: false, message: page.invalidReason });
    return ipcRenderer.invoke("literature:saveCapture", page);
  },
  goBack: function() { return ipcRenderer.invoke("literature:captureGoBack"); },
  historyState: function() { return ipcRenderer.invoke("literature:captureHistoryState"); },
  closeWindow: function() { return ipcRenderer.invoke("literature:closeCapture"); }
});
