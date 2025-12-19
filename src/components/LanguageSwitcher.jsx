import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const LanguageSwitcher = () => {
    const { language, changeLanguage } = useLanguage();

    const toggleLanguage = () => {
        const newLang = language === 'en' ? 'zh-TW' : 'en';
        changeLanguage(newLang);
    };

    return (
        <button
            onClick={toggleLanguage}
            className="language-switcher-fab"
            aria-label="Switch Language"
        >
            <Globe size={24} />
            <span className="lang-text">{language === 'en' ? 'EN' : '繁'}</span>

            <style>{`
                .language-switcher-fab {
                    position: fixed;
                    right: 20px;
                    bottom: 90px; /* Above the bottom tab bar (64px + safe area) */
                    width: 48px;
                    height: 48px;
                    border-radius: 24px;
                    background-color: var(--bg-secondary);
                    color: var(--text-primary);
                    border: 1px solid var(--border-primary);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    z-index: 100;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-size: 12px;
                    font-weight: 600;
                }

                .language-switcher-fab:active {
                    transform: scale(0.95);
                    background-color: var(--bg-tertiary);
                }

                @supports (padding-bottom: env(safe-area-inset-bottom)) {
                    .language-switcher-fab {
                        bottom: calc(90px + env(safe-area-inset-bottom));
                    }
                }
            `}</style>
        </button>
    );
};

export default LanguageSwitcher;
