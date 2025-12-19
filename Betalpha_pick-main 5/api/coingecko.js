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
        // Get the path after /api/coingecko
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
        const url = `https://api.coingecko.com/api/v3/${apiPath}${queryString ? '?' + queryString : ''}`;

        console.log('[CoinGecko Proxy] Request:', {
            path: apiPath,
            query: queryString,
            fullUrl: url
        });

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'CryptoJournal/1.0'
            }
        });

        console.log('[CoinGecko Proxy] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[CoinGecko Proxy] Error response:', errorText);
            throw new Error(`CoinGecko API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[CoinGecko Proxy] Success, data keys:', Object.keys(data));

        res.status(200).json(data);

    } catch (error) {
        console.error('[CoinGecko Proxy] Error:', error);

        // Try to extract status code from error message
        const statusMatch = error.message.match(/(\d{3})/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : 500;

        res.status(statusCode).json({
            error: 'Failed to fetch data from CoinGecko',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
