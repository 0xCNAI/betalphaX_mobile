import React from 'react';

const App = () => {
    return (
        <div style={{ padding: '2rem', color: 'white', background: '#1a1a1a', minHeight: '100vh' }}>
            <h1>🔧 Testing - App is loading!</h1>
            <p>If you see this, React is working.</p>
            <p>Current time: {new Date().toLocaleString()}</p>
        </div>
    );
};

export default App;
