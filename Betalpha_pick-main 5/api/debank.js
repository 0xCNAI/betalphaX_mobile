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
        // Get the path after /api/debank
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
        // Default to Pro API since user has a key
        const baseUrl = 'https://pro-openapi.debank.com/v1';
        // Remove leading slash from apiPath if present to avoid double slashes
        const cleanPath = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
        const url = `${baseUrl}/${cleanPath}${queryString ? '?' + queryString : ''}`;

        console.log('[DeBank Proxy] Request:', {
            path: apiPath,
            query: queryString,
            fullUrl: url
        });

        const apiKey = process.env.DEBANK_API_KEY;

        if (!apiKey) {
            console.error('[DeBank Proxy] Missing DEBANK_API_KEY environment variable');
            res.status(500).json({ error: 'Server configuration error: Missing API Key' });
            return;
        }

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'AccessKey': apiKey, // DeBank Pro API Header
                'User-Agent': 'CryptoJournal/1.0'
            }
        });

        console.log('[DeBank Proxy] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[DeBank Proxy] Error response:', errorText);

            // Handle 401 specifically
            if (response.status === 401) {
                throw new Error('DeBank API Unauthorized: Invalid or expired API Key');
            }

            throw new Error(`DeBank API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('[DeBank Proxy] Error:', error);

        // Try to extract status code from error message
        const statusMatch = error.message.match(/(\d{3})/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : 500;

        res.status(statusCode).json({
            error: 'Failed to fetch data from DeBank',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
