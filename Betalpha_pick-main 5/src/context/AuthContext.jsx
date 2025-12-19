import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signUp = (email, password) => {
        return createUserWithEmailAndPassword(auth, email, password);
    };

    const signIn = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            return result;
        } catch (error) {
            console.error('Google sign-in error:', error);
            throw error;
        }
    };

    const isPreviewEnv = () => {
        const envVar = process.env.NEXT_PUBLIC_VERCEL_ENV;
        const hostname = window.location.hostname;
        const isVercelUrl = hostname.endsWith('.vercel.app');
        // Exclude known production domains
        const isProdUrl = ['betalpha-pick.vercel.app', 'betalphapick.web.app', 'betalphax.vercel.app'].includes(hostname);

        // Check Env Var OR Hostname fallback
        const isPreview = envVar === 'preview' || (isVercelUrl && !isProdUrl);

        // console.log('[Auth] Environment Check:', { envVar, hostname, isPreview });
        return isPreview;
    };

    const signOut = () => {
        return firebaseSignOut(auth);
    };

    const STUB_USER = {
        uid: 'preview-user-123',
        email: 'preview@betalpha.io',
        displayName: 'Preview User',
        photoURL: null,
        isAnonymous: true
    };

    const loginAsPreviewUser = () => {
        console.log('[Auth] Logging in as Preview User');
        localStorage.setItem('preview_auth_session', JSON.stringify(STUB_USER));
        setUser(STUB_USER);
    };

    return (
        <AuthContext.Provider value={{ user, signUp, signIn, signInWithGoogle, loginAsPreviewUser, signOut, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
