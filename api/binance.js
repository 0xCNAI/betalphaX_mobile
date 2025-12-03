export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        // Get the path after /api/binance
        const { path } = req.query;
        const apiPath = Array.isArray(path) ? path.join('/') : path || '';

        // Validate path
        if (!apiPath) {
            res.status(400).json({ error: 'API path is required' });
            return;
        }

        // Get query parameters
        const queryParams = new URLSearchParams();
        Object.keys(req.query).forEach(key => {
            if (key !== 'path') {
                queryParams.append(key, req.query[key]);
            }
        });

        const queryString = queryParams.toString();

        // Try multiple Binance API endpoints to bypass geo-restrictions
        const endpoints = [
            `https://data-api.binance.vision/${apiPath}`,  // Public data endpoint (no restrictions)
            `https://api.binance.com/${apiPath}`,          // Original endpoint
            `https://api1.binance.com/${apiPath}`,         // Alternative endpoint 1
            `https://api2.binance.com/${apiPath}`,         // Alternative endpoint 2
            `https://api3.binance.com/${apiPath}`          // Alternative endpoint 3
        ];

        let lastError = null;

        for (const baseUrl of endpoints) {
            try {
                const url = `${baseUrl}${queryString ? '?' + queryString : ''}`;

                console.log('[Binance Proxy] Trying:', url);

                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (compatible; CryptoJournal/1.0)'
                    }
                });

                console.log('[Binance Proxy] Response status:', response.status, 'from', baseUrl);

                if (response.ok) {
                    const data = await response.json();
                    console.log('[Binance Proxy] Success with:', baseUrl);
                    res.status(200).json(data);
                    return;
                }

                // If we get 451, try next endpoint
                if (response.status === 451) {
                    console.log('[Binance Proxy] Geo-restricted, trying next endpoint...');
                    continue;
                }

                // For other errors, store and continue
                const errorText = await response.text();
                lastError = new Error(`${response.status}: ${errorText}`);

            } catch (error) {
                console.error('[Binance Proxy] Error with endpoint:', baseUrl, error.message);
                lastError = error;
                continue;
            }
        }

        // If all endpoints failed, throw the last error
        throw lastError || new Error('All Binance endpoints failed');

    } catch (error) {
        console.error('[Binance Proxy] All endpoints failed:', error);

        // Try to extract status code from error message (e.g. "400: ...")
        const statusMatch = error.message.match(/^(\d{3}):/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : 500;

        res.status(statusCode).json({
            error: 'Failed to fetch data from Binance',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
