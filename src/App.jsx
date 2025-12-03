import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Portfolio from './pages/Portfolio';
import AssetDetails from './pages/AssetDetails';
import Journal from './pages/Journal';
import Feeds from './pages/Feeds';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import DebugTwitter from './pages/DebugTwitter';
import { TransactionProvider } from './context/TransactionContext';
import { PriceProvider } from './context/PriceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { prefetchTweetsForAssets } from './services/twitterService';
import { BuyThesisProvider } from './context/BuyThesisContext';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const App = () => {
  useEffect(() => {
    prefetchTweetsForAssets();
  }, []);

  return (
    <AuthProvider>
      <TransactionProvider>
        <PriceProvider>
          <BuyThesisProvider>
            <Router>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<SignUp />} />

                {/* Protected Routes */}
                <Route path="/*" element={
                  <PrivateRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Portfolio />} />
                        <Route path="/feeds" element={<Feeds />} />
                        <Route path="/asset/:symbol" element={<AssetDetails />} />
                        <Route path="/journal" element={<Journal />} />
                        <Route path="/debug-twitter" element={<DebugTwitter />} />
                      </Routes>
                    </Layout>
                  </PrivateRoute>
                } />
              </Routes>
            </Router>
          </BuyThesisProvider>
        </PriceProvider>
      </TransactionProvider>
    </AuthProvider>
  );
};

export default App;
