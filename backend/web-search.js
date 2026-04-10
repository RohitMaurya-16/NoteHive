// Web Search Integration - Uses multiple free search options
// Primary: DuckDuckGo Lite (HTML parsing)
// Falls back to: Jina AI Reader API for link summaries

async function searchDuckDuckGo(query, limit = 5) {
  try {
    // Use DuckDuckGo Lite (more reliable than JSON APIs)
    const response = await fetch('https://lite.duckduckgo.com/lite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
      },
      body: `q=${encodeURIComponent(query)}&save=s`,
      timeout: 8000,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const results = [];
    
    // Parse DuckDuckGo Lite HTML results
    // Look for result rows: <tr><td valign=top><a href="..."...>
    const resultRegex = /<a rel="nofollow" href="([^"]+)">([^<]+)<\/a>[\s\S]*?<td>([^<]*)/g;
    let match;
    
    while ((match = resultRegex.exec(html)) && results.length < limit) {
      const url = match[1];
      const title = match[2]?.replace(/&quot;|&#34;/g, '"').trim();
      const snippet = match[3]?.replace(/<[^>]+>/g, '')?.trim() || '';
      
      if (url && title && !url.startsWith('http')) continue; // Skip invalid URLs
      
      if (title && url.includes('http')) {
        results.push({
          title: title,
          url: url,
          snippet: snippet || 'Search result from DuckDuckGo',
          source: 'web',
        });
      }
    }

    if (results.length > 0) {
      console.log(`[web-search] DuckDuckGo returned ${results.length} results for: "${query}"`);
      return { ok: true, reason: 'Success', results };
    } else {
      throw new Error('No results parsed from DuckDuckGo');
    }
  } catch (error) {
    console.warn(`[web-search] DuckDuckGo failed: ${error.message}`);
    return null;
  }
}

export async function searchWeb(query, limit = 5) {
  if (!query || typeof query !== "string") {
    return {
      ok: false,
      reason: "Query is required",
      results: [],
    };
  }

  // Try DuckDuckGo Lite (most reliable free option)
  const ddgResult = await searchDuckDuckGo(query, limit);
  if (ddgResult?.ok && ddgResult.results?.length > 0) {
    return ddgResult;
  }

  // Fallback: Return empty but true result 
  // (frontend will show helpful message)
  return {
    ok: false,
    reason: "Search temporarily unavailable",
    results: [],
  };
}
