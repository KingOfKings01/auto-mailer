import { chromium } from 'playwright';
import crypto from 'crypto';

function generateId(title) {
  return crypto.createHash('sha256').update(title).digest('hex').substring(0, 12);
}

export async function scrape() {
  console.log('[GST Scraper] Starting Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://services.gst.gov.in/services/advisory/advisoryandreleases';
  console.log(`[GST Scraper] Navigating to ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Maintenance check
    const bodyText = await page.innerText('body');
    const textLower = bodyText.toLowerCase();
    if (textLower.includes('scheduled downtime') || textLower.includes('under maintenance') || textLower.includes('kindly come back later')) {
      console.warn('[GST Scraper] GST Website is down for maintenance.');
      await browser.close();
      return [];
    }

    // Wait for the news items selector to appear
    try {
      await page.waitForSelector('li.news-item--container', { timeout: 15000 });
    } catch (selectorErr) {
      console.warn('[GST Scraper] Selector li.news-item--container did not appear within timeout.');
    }

    const newsItems = await page.$$('li.news-item--container');
    console.log(`[GST Scraper] Found ${newsItems.length} news entries.`);

    const results = [];

    // Let's scrape the first page items
    for (const item of newsItems) {
      const headerEl = await item.$('h3.news-item--header');
      const dateEl = await item.$('p.news-item--date');
      const tagEl = await item.$('button.tag-btn');
      const textEl = await item.$('p.news-item--brieftext');

      if (headerEl && dateEl && tagEl) {
        const title = (await headerEl.innerText()).trim();
        const date = (await dateEl.innerText()).trim();
        const category = (await tagEl.innerText()).trim();
        
        let htmlContent = '';
        const pdfUrls = [];

        if (textEl) {
          htmlContent = await textEl.innerHTML();
          
          // Get links
          const links = await textEl.$$('a');
          for (const link of links) {
            const href = await link.getAttribute('href');
            if (href && href.toLowerCase().includes('.pdf')) {
              pdfUrls.push(href.trim());
            }
          }

          // Fallback parsing of plain text for pdf urls
          if (pdfUrls.length === 0) {
            const plainText = await textEl.innerText();
            for (const word of plainText.split(/\s+/)) {
              if (word.toLowerCase().includes('http') && word.toLowerCase().includes('.pdf')) {
                const cleanUrl = word.replace(/[()\[\]]/g, '').trim();
                pdfUrls.push(cleanUrl);
              }
            }
          }
        }

        if (!title) continue;

        results.push({
          id: generateId(title),
          title,
          date,
          category,
          htmlContent,
          pdfUrls: [...new Set(pdfUrls)]
        });
      }
    }

    await browser.close();
    return results;
  } catch (error) {
    console.error('[GST Scraper] Error during scraping:', error);
    try {
      await browser.close();
    } catch (e) {}
    return [];
  }
}
