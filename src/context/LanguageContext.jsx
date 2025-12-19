import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../data/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState(() => localStorage.getItem('appLanguage') || 'en');

    // Load saved language from localStorage
    useEffect(() => {
        const savedLang = localStorage.getItem('appLanguage');
        if (savedLang && (savedLang === 'en' || savedLang === 'zh-TW')) {
            setLanguage(savedLang);
        }
    }, []);

    const changeLanguage = (lang) => {
        if (lang !== 'en' && lang !== 'zh-TW') return;

        setLanguage(lang);
        localStorage.setItem('appLanguage', lang);
    };

    const t = (key) => {
        const langData = translations[language];
        return langData[key] || key;
    };

    // Construct value object matching web version structure where possible
    const value = {
        language,
        changeLanguage,
        t
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};
