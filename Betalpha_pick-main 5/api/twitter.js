export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

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
        // Get the path after /api/twitter
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
        const url = `https://api.twitterapi.io/${apiPath}${queryString ? '?' + queryString : ''}`;

        console.log('[Twitter Proxy] Request:', {
            path: apiPath,
            query: queryString,
            fullUrl: url
        });

        const apiKey = process.env.TWITTER_API_KEY;

        if (!apiKey) {
            console.error('[Twitter Proxy] Missing TWITTER_API_KEY environment variable');
            res.status(500).json({ error: 'Server configuration error' });
            return;
        }

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'X-API-Key': apiKey
            }
        });

        console.log('[Twitter Proxy] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Twitter Proxy] Error response:', errorText);
            // Forward the status code and error
            res.status(response.status).send(errorText);
            return;
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('[Twitter Proxy] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch data from Twitter API',
            message: error.message
        });
    }
}
