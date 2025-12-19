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
        // Get the path after /api/gt
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
        const url = `https://api.geckoterminal.com/api/v2/${apiPath}${queryString ? '?' + queryString : ''}`;

        console.log('[GeckoTerminal Proxy] Request:', {
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

        console.log('[GeckoTerminal Proxy] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[GeckoTerminal Proxy] Error response:', errorText);
            throw new Error(`GeckoTerminal API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        // console.log('[GeckoTerminal Proxy] Success');

        res.status(200).json(data);

    } catch (error) {
        console.error('[GeckoTerminal Proxy] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch data from GeckoTerminal',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
