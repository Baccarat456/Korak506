// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
// Crawlee - web scraping and browser automation library (Read more at https://crawlee.dev)
import { CheerioCrawler, Dataset } from 'crawlee';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Structure of input is defined in input_schema.json
const { startUrls = ['https://arxiv.org'], maxRequestsPerCrawl = 200 } = (await Actor.getInput()) ?? {};

// Proxy configuration to rotate IP addresses and prevent blocking (https://docs.apify.com/platform/proxy)
const proxyConfiguration = await Actor.createProxyConfiguration();

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler({ enqueueLinks, request, $, log }) {
        log.info('Processing', { url: request.loadedUrl });

        // Enqueue links found on listing pages (arXiv listing pages contain /abs/ and /pdf/ links)
        await enqueueLinks({
            globs: ['**/abs/*', '**/list/**']
        });

        // If the page is a paper abstract page (contains /abs/), extract metadata.
        const url = request.loadedUrl ?? request.url;
        if (url.includes('/abs/')) {
            // Typical arXiv abstract page structure:
            // - Title: h1.title
            // - Authors: div.authors
            // - Abstract: blockquote.abstract
            // - arXiv id: in the URL or element with meta
            // - Categories: div.subheader or meta tags
            const title = $('h1.title').text().replace('Title:', '').trim();
            const authors = $('div.authors').text().replace('Authors:', '').trim();
            const abstract = $('blockquote.abstract').text().replace('Abstract:', '').trim();
            // arXiv id from page or URL
            const arxivIdMatch = url.match(/abs\/([^\/?#]+)/);
            const arxiv_id = arxivIdMatch ? arxivIdMatch[1] : '';
            const primary_category = $('span.primary-subject').first().text().trim() || $('td.tablecell:eq(1) a').first().text().trim();
            const pdf_link = url.replace('/abs/', '/pdf/') + '.pdf';

            log.info('Extracted metadata', { arxiv_id, title });

            // Save structured metadata to dataset
            await Dataset.pushData({
                title,
                authors,
                abstract,
                arxiv_id,
                primary_category,
                pdf_link,
                url,
            });
        } else {
            log.debug('Not an abstract page; skipping metadata extraction', { url });
        }
    },
});

await crawler.run(startUrls);

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
