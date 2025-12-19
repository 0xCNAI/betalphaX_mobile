import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Settings, Menu, X, Activity, LogOut, Trash2, Brain, Cpu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

const Layout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false); // Mobile state
  const [isCollapsed, setIsCollapsed] = React.useState(true); // Desktop state
  const location = useLocation();
  const { signOut } = useAuth();
  const { clearTransactions } = useTransactions();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Failed to sign out', error);
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const navItems = [
    { path: '/', label: t('portfolio'), icon: LayoutDashboard },
    { path: '/feeds', label: t('feeds'), icon: Activity },
    { path: '/journal', label: t('journal'), icon: Brain },
    { path: '/notebook', label: 'Notebook', icon: BookOpen }, // 'Notebook' key might not strictly exist in previously seen translations, defaulting to English string if needed, or I should check if it exists. Looking at step 72, I don't see 'notebook', so I'll leave it as string or use t('notebook') which defaults to key.
    { path: '/monitor', label: 'Monitor', icon: Cpu },
    // { path: '/settings', label: t('settings'), icon: Settings }, // Future implementation
  ];

  return (
    <div className="layout-container">
      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="logo">Betalpha</div>
        <button onClick={toggleSidebar} className="menu-btn">
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!isCollapsed && <h2>Betalpha</h2>}
          <button onClick={toggleCollapse} className="collapse-btn desktop-only">
            {isCollapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setIsSidebarOpen(false)}
                title={isCollapsed ? item.label : ''}
              >
                <Icon size={20} />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          <button
            className="nav-item"
            onClick={async () => {
              if (window.confirm('Are you sure you want to delete ALL transactions? This cannot be undone.')) {
                await clearTransactions();
                alert('All data has been reset.');
              }
            }}
            style={{ marginTop: 'auto', border: 'none', background: 'none', cursor: 'pointer', width: '100%', textAlign: isCollapsed ? 'center' : 'left', color: 'var(--accent-danger, #ef4444)' }}
            title={isCollapsed ? "Reset Data" : ""}
          >
            <Trash2 size={20} />
            {!isCollapsed && <span>Reset Data</span>}
          </button>

          <LanguageSwitcher isCollapsed={isCollapsed} />

          <button
            className="nav-item logout-btn"
            onClick={handleSignOut}
            style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', textAlign: isCollapsed ? 'center' : 'left' }}
            title={isCollapsed ? "Sign Out" : ""}
          >
            <LogOut size={20} />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <style>{`
        .layout-container {
          display: flex;
          min-height: 100vh;
          background-color: var(--bg-primary);
        }

        .mobile-header {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 60px;
          background-color: var(--bg-secondary);
          padding: 0 var(--spacing-md);
          align-items: center;
          justify-content: space-between;
          z-index: 50;
          border-bottom: 1px solid var(--bg-tertiary);
        }

        .sidebar {
          width: 260px;
          background-color: var(--bg-secondary);
          border-right: 1px solid var(--bg-tertiary);
          display: flex;
          flex-direction: column;
          position: fixed;
          height: 100vh;
          z-index: 40;
          transition: width 0.3s ease, transform 0.3s ease;
        }

        .sidebar.collapsed {
          width: 80px;
        }

        .sidebar-header {
          padding: var(--spacing-md);
          height: 60px;
          border-bottom: 1px solid var(--bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sidebar.collapsed .sidebar-header {
          justify-content: center;
          padding: var(--spacing-md) 0;
        }

        .collapse-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .collapse-btn:hover {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .sidebar-header h2 {
          font-size: 1.25rem;
          font-weight: 700;
          background: linear-gradient(to right, var(--accent-primary), var(--accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }

        .sidebar-nav {
          padding: var(--spacing-md);
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          color: var(--text-secondary);
          text-decoration: none;
          border-radius: var(--radius-md);
          transition: all 0.2s ease;
          white-space: nowrap;
          overflow: hidden;
        }

        .sidebar.collapsed .nav-item {
          justify-content: center;
          padding: var(--spacing-md) 0;
        }

        .nav-item:hover {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-item.active {
          background-color: rgba(99, 102, 241, 0.1);
          color: var(--accent-primary);
        }

        .main-content {
          flex: 1;
          margin-left: 260px;
          padding: var(--spacing-xl);
          max-width: 100%;
          transition: margin-left 0.3s ease;
        }

        .sidebar.collapsed + .main-content {
          margin-left: 80px;
        }

        .desktop-only {
          display: flex;
        }

        @media (max-width: 768px) {
          .mobile-header {
            display: flex;
          }

          .sidebar {
            transform: translateX(-100%);
          }

          .sidebar.open {
            transform: translateX(0);
          }

          .main-content {
            margin-left: 0;
            padding-top: 80px;
          }

          .sidebar-overlay {
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 30;
          }

          .desktop-only {
            display: none;
          }

          .sidebar.collapsed {
            width: 260px; /* Reset width on mobile */
          }

          .sidebar.collapsed .nav-item {
            justify-content: flex-start; /* Reset alignment */
            padding: var(--spacing-md);
          }
          
          .sidebar.collapsed .sidebar-header {
             justify-content: flex-start;
             padding: var(--spacing-xl);
          }

          .sidebar.collapsed .sidebar-header h2 {
              display: block;
          }
        }
      `}</style>
    </div>
  );
};

export default Layout;
