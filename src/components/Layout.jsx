import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Activity, Settings, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionContext';

const Layout = ({ children }) => {
  const location = useLocation();
  const { signOut } = useAuth();
  const { clearTransactions } = useTransactions();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Failed to sign out', error);
    }
  };

  const navItems = [
    { path: '/', label: 'Portfolio', icon: LayoutDashboard },
    { path: '/feeds', label: 'Feeds', icon: Activity },
    { path: '/journal', label: 'Journal', icon: BookOpen },
    // { path: '/settings', label: 'Settings', icon: Settings }, // Future
  ];

  return (
    <div className="layout-container">
      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="bottom-tab-bar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`tab-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="tab-label">{item.label}</span>
            </Link>
          );
        })}

        {/* Temporary Settings/Reset Actions (Long Press or separate tab in future) */}
        {/* For now, we'll put a small logout button in the top right of pages, or keep it simple */}
      </nav>

      <style>{`
        .layout-container {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background-color: var(--bg-primary);
        }

        .main-content {
          flex: 1;
          padding: var(--spacing-md);
          padding-bottom: 80px; /* Space for bottom tab bar */
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .bottom-tab-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 64px;
          background-color: var(--bg-secondary);
          border-top: 1px solid var(--bg-tertiary);
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 50;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: var(--text-secondary);
          text-decoration: none;
          flex: 1;
          height: 100%;
          transition: all 0.2s ease;
        }

        .tab-item.active {
          color: var(--accent-primary);
        }

        .tab-label {
          font-size: 0.7rem;
          font-weight: 500;
        }

        /* Safe Area Support */
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .bottom-tab-bar {
            height: calc(64px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
};

export default Layout;
