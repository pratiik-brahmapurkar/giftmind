import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    // Track visit count
    const visits = parseInt(localStorage.getItem('gm_visits') || '0') + 1;
    localStorage.setItem('gm_visits', visits.toString());
    
    // Don't show if already dismissed or installed
    if (localStorage.getItem('gm_install_dismissed')) return;
    if (visits < 2) return;  // Show only after 2nd visit

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
      localStorage.setItem('gm_install_dismissed', 'true');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('gm_install_dismissed', 'true');
  };

  useEffect(() => {
    const scrollHandler = () => {
      if (window.scrollY > 200) {
        setHasScrolled(true);
        window.removeEventListener('scroll', scrollHandler);
      }
    };
    window.addEventListener('scroll', scrollHandler);
    return () => window.removeEventListener('scroll', scrollHandler);
  }, []);

  if (!showPrompt || !hasScrolled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-white rounded-xl 
                    shadow-lg border border-gray-200 p-4 flex items-center gap-3
                    animate-in slide-in-from-bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">Add GiftMind to Home Screen</p>
        <p className="text-xs text-gray-500 mt-0.5">Quick access to gift recommendations</p>
      </div>
      <button onClick={handleInstall}
        className="px-3 py-1.5 bg-primary text-white text-sm font-medium 
                   rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap">
        Install
      </button>
      <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
