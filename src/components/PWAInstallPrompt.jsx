import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare, Download } from 'lucide-react';

const PWAInstallPrompt = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);

    useEffect(() => {
        // Check if already in standalone mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (isStandalone) return;

        // Check if dismissed previously
        const isDismissed = localStorage.getItem('pwa_prompt_dismissed');
        if (isDismissed) return;

        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIosDevice);

        if (isIosDevice) {
            // Show for iOS after small delay
            const timer = setTimeout(() => setIsVisible(true), 3000);
            return () => clearTimeout(timer);
        } else {
            // Listen for Android/Desktop prompt
            const handleBeforeInstallPrompt = (e) => {
                e.preventDefault();
                setDeferredPrompt(e);
                setIsVisible(true);
            };

            window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        }
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('pwa_prompt_dismissed', 'true');
    };

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsVisible(false);
            }
            setDeferredPrompt(null);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
            <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-900 rounded-lg p-2 border border-slate-700">
                            {/* Use a generic icon or the app logo if available */}
                            <Download className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm">Install BetalphaX</h3>
                            <p className="text-slate-400 text-xs">Add to home screen for the best experience</p>
                        </div>
                    </div>
                    <button onClick={handleDismiss} className="text-slate-400 hover:text-white p-1">
                        <X size={18} />
                    </button>
                </div>

                {isIOS ? (
                    <div className="space-y-2 text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                        <div className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-slate-700 rounded-full text-xs font-bold">1</span>
                            <span>Tap the <Share className="inline w-4 h-4 mx-1 text-blue-400" /> Share button below</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-slate-700 rounded-full text-xs font-bold">2</span>
                            <span>Select <PlusSquare className="inline w-4 h-4 mx-1 text-gray-400" /> Add to Home Screen</span>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={handleInstallClick}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Download size={16} />
                        Install App
                    </button>
                )}
            </div>
        </div>
    );
};

export default PWAInstallPrompt;
