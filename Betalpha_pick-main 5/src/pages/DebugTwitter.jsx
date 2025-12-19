import React, { useState } from 'react';

const DebugTwitter = () => {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const testApi = async (endpoint, name) => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch(endpoint);

            const status = response.status;
            const statusText = response.statusText;
            const headers = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });

            let body;
            const text = await response.text();
            try {
                body = JSON.parse(text);
            } catch (e) {
                body = text;
            }

            setResult({
                name,
                endpoint,
                status,
                statusText,
                headers,
                body
            });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px', color: 'white', background: '#1a1a1a', minHeight: '100vh' }}>
            <h1>API Routing Debugger</h1>
            <p>Test different API endpoints to diagnose routing issues.</p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                    onClick={() => testApi('/api/test', 'Simple Test')}
                    disabled={loading}
                    style={buttonStyle}
                >
                    Test /api/test
                </button>
                <button
                    onClick={() => testApi('/api/coingecko/simple/price?ids=bitcoin&vs_currencies=usd', 'CoinGecko')}
                    disabled={loading}
                    style={buttonStyle}
                >
                    Test CoinGecko
                </button>
                <button
                    onClick={() => testApi('/api/twitter/twitter/trends?woeid=1', 'Twitter')}
                    disabled={loading}
                    style={buttonStyle}
                >
                    Test Twitter
                </button>
            </div>

            {error && (
                <div style={{ color: '#ff4444', marginBottom: '20px', padding: '10px', border: '1px solid #ff4444' }}>
                    <strong>Error:</strong> {error}
                </div>
            )}

            {result && (
                <div style={{ background: '#2d2d2d', padding: '20px', borderRadius: '5px' }}>
                    <h3>Result: {result.name}</h3>
                    <p style={{ color: '#888' }}>Endpoint: {result.endpoint}</p>

                    <div style={{ marginBottom: '10px' }}>
                        <strong>Status:</strong>
                        <span style={{
                            color: result.status === 200 ? '#00cc00' : '#ff4444',
                            marginLeft: '10px',
                            fontWeight: 'bold'
                        }}>
                            {result.status} {result.statusText}
                        </span>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                        <strong>Headers:</strong>
                        <pre style={{ background: '#000', padding: '10px', overflowX: 'auto' }}>
                            {JSON.stringify(result.headers, null, 2)}
                        </pre>
                    </div>

                    <div>
                        <strong>Response Body:</strong>
                        <pre style={{ background: '#000', padding: '10px', overflowX: 'auto', maxHeight: '400px' }}>
                            {typeof result.body === 'object'
                                ? JSON.stringify(result.body, null, 2)
                                : result.body}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
};

const buttonStyle = {
    padding: '10px 20px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px'
};

export default DebugTwitter;
