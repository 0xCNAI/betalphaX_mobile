import React, { createContext, useContext, useState, useEffect } from 'react';

const BuyThesisContext = createContext();

export const useBuyThesis = () => useContext(BuyThesisContext);

export const BuyThesisProvider = ({ children }) => {
    const [theses, setTheses] = useState([]);

    // Load from local storage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('buyTheses');
            if (saved) {
                setTheses(JSON.parse(saved));
            }
        } catch (error) {
            console.error('Error loading buy theses:', error);
        }
    }, []);

    const addThesis = (thesis) => {
        setTheses(prev => {
            // Avoid duplicates based on ID
            if (prev.some(t => t.id === thesis.id)) return prev;

            const newTheses = [thesis, ...prev];
            localStorage.setItem('buyTheses', JSON.stringify(newTheses));
            return newTheses;
        });
    };

    const removeThesis = (id) => {
        setTheses(prev => {
            const newTheses = prev.filter(t => t.id !== id);
            localStorage.setItem('buyTheses', JSON.stringify(newTheses));
            return newTheses;
        });
    };

    const isThesisSaved = (id) => {
        return theses.some(t => t.id === id);
    };

    return (
        <BuyThesisContext.Provider value={{ theses, addThesis, removeThesis, isThesisSaved }}>
            {children}
        </BuyThesisContext.Provider>
    );
};
