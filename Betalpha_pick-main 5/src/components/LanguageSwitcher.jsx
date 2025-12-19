import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const LanguageSwitcher = ({ isCollapsed }) => {
    const { language, changeLanguage } = useLanguage();

    const toggleLanguage = () => {
        changeLanguage(language === 'en' ? 'zh-TW' : 'en');
    };

    return (
        <button
            onClick={toggleLanguage}
            className={`nav-item language-switcher ${isCollapsed ? 'collapsed' : ''}`}
            title={isCollapsed ? (language === 'en' ? 'Switch to Chinese' : 'Switch to English') : ''}
            style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: isCollapsed ? 'center' : 'left',
                marginTop: 0,
                marginBottom: 'auto' // Helps position it if needed, though layout handles this
            }}
        >
            <Globe size={20} />
            {!isCollapsed && (
                <span>{language === 'en' ? 'English' : '繁體中文'}</span>
            )}
        </button>
    );
};

export default LanguageSwitcher;
