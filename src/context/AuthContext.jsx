import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
} from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Handle redirect result (for mobile auth flow)
    useEffect(() => {
        getRedirectResult(auth)
            .then((result) => {
                if (result) {
                    // User signed in via redirect
                    console.log("Redirect sign-in successful", result.user);
                }
            })
            .catch((error) => {
                console.error("Redirect sign-in error:", error);
                // Debug: Alert on mobile to see the error
                if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                    alert(`Login Error: ${error.message}`);
                }
            });
    }, []);

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

    const isMobile = () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    };

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            // Use popup for both mobile and desktop.
            // Redirect flow (signInWithRedirect) often fails on mobile due to
            // storage access policies or state loss during full page reload.
            // Modern mobile browsers handle popups (as new tabs) well.
            const result = await signInWithPopup(auth, provider);
            return result;
        } catch (error) {
            console.error('Google sign-in error:', error);
            alert(`Sign-in Error: ${error.message}`);
            throw error;
        }
    };

    const signOut = () => {
        return firebaseSignOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, signUp, signIn, signInWithGoogle, signOut, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
