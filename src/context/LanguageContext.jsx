import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../data/translations';
import { useAuth } from './AuthContext';
import { getUserSettings, updateUserLanguage } from '../services/userService';

const LanguageContext = createContext();

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState('en'); // Default to English
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);

    // Load language from local storage on mount
    useEffect(() => {
        const storedLang = localStorage.getItem('app_language');
        if (storedLang && (storedLang === 'en' || storedLang === 'zh-TW')) {
            setLanguage(storedLang);
        }
        setLoading(false);
    }, []);

    // Sync with user profile when user logs in
    useEffect(() => {
        const fetchUserLanguage = async () => {
            if (user) {
                try {
                    const settings = await getUserSettings(user.uid);
                    if (settings && settings.language) {
                        setLanguage(settings.language);
                        localStorage.setItem('app_language', settings.language);
                    }
                } catch (error) {
                    console.error('Error fetching user language:', error);
                }
            }
        };

        if (user) {
            fetchUserLanguage();
        }
    }, [user]);

    const changeLanguage = async (newLang) => {
        if (newLang !== 'en' && newLang !== 'zh-TW') return;

        setLanguage(newLang);
        localStorage.setItem('app_language', newLang);

        if (user) {
            try {
                await updateUserLanguage(user.uid, newLang);
            } catch (error) {
                console.error('Error updating user language preference:', error);
            }
        }
    };

    const t = (key) => {
        const langData = translations[language];
        return langData[key] || key;
    };

    const value = {
        language,
        changeLanguage,
        t,
        loading
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};
