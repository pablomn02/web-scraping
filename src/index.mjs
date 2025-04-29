import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join } from 'path';

const server = createServer(async (req, res) => {
    const { method, url } = req;

    // Servir index.html
    if (method === 'GET' && url === '/') {
        try {
            const content = await readFile(join(process.cwd(), 'public/index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        } catch (error) {
            console.error('Error al servir index.html:', error);
            res.writeHead(500);
            res.end('Error del servidor');
        }
        return;
    }

    // Servir styles.css
    if (method === 'GET' && url === '/styles.css') {
        try {
            const content = await readFile(join(process.cwd(), 'public/styles.css'));
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(content);
        } catch (error) {
            console.error('Error al servir styles.css:', error);
            res.writeHead(500);
            res.end('Error del servidor');
        }
        return;
    }

    // Manejar solicitud de scraping
    if (method === 'POST' && url === '/scrape') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { url: scrapeUrl } = JSON.parse(body);
                if (!scrapeUrl) throw new Error('Se requiere una URL');

                const browser = await chromium.launch({ headless: true });
                const context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
                });
                const page = await context.newPage();

                console.log('Navegando a:', scrapeUrl);
                await page.goto(scrapeUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2000); // Retraso para cargar contenido dinámico

                let products = [];
                // Intentar con selector para páginas de búsqueda
                try {
                    await page.waitForSelector('.s-card-container', { timeout: 10000 });
                    products = await page.$$eval(
                        '.s-card-container',
                        (results, baseUrl) =>
                            results
                                .map((el) => {
                                    const title = el.querySelector('h2')?.innerText;
                                    if (!title) return null;
                                    const image = el.querySelector('img')?.getAttribute('src');
                                    const price = el.querySelector('.a-price .a-offscreen')?.innerText;
                                    const link = el.querySelector('.a-link-normal')?.getAttribute('href');
                                    return { title, image, price, link: link ? new URL(link, baseUrl).href : null };
                                })
                                .filter((product) => product !== null),
                        scrapeUrl
                    );
                    console.log('Productos encontrados con .s-card-container:', products.length);
                } catch (e) {
                    console.log('Error con selector .s-card-container:', e.message);
                }

                // Intentar con selectores para páginas de ofertas
                if (products.length === 0) {
                    try {
                        await page.waitForSelector('.Grid-module__gridItem_3XqP6q1nG7pGxi4Lph4T', { timeout: 10000 });
                        products = await page.$$eval(
                            '.Grid-module__gridItem_3XqP6q1nG7pGxi4Lph4T',
                            (results, baseUrl) =>
                                results
                                    .map((el) => {
                                        const title = el.querySelector('.DealContent-module__truncate_2F5ZBA1CDGfSax9Y8g5h')?.innerText;
                                        if (!title) return null;
                                        const image = el.querySelector('img')?.getAttribute('src');
                                        const price = el.querySelector('.DealPrice-module__priceDisplay_1p8KnWJozc3nM6-keVVA')?.innerText;
                                        const link = el.querySelector('a')?.getAttribute('href');
                                        return { title, image, price, link: link ? new URL(link, baseUrl).href : null };
                                    })
                                    .filter((product) => product !== null),
                            scrapeUrl
                        );
                        console.log('Productos encontrados con selector de ofertas:', products.length);
                    } catch (e) {
                        console.log('Error con selector de ofertas:', e.message);
                    }
                }

                console.log('Productos scrapeados:', products);
                await browser.close();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(products));
            } catch (error) {
                console.error('Error en el scraping:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('No encontrado');
});

server.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});