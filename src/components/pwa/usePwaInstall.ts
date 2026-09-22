import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level cache for beforeinstallprompt event so it is never missed
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    try {
      localStorage.setItem('scaro_pwa_installed', 'true');
    } catch {
      // Ignore storage errors
    }
    listeners.forEach((fn) => fn(null));
  });
}

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isStandalone, setIsStandalone] = useState<boolean>(checkIsStandalone());
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (checkIsStandalone()) return true;
    try {
      return localStorage.getItem('scaro_pwa_installed') === 'true';
    } catch {
      return false;
    }
  });
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('scaro_pwa_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handlePromptChange = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
      if (!prompt && checkIsStandalone()) {
        setIsInstalled(true);
        setIsStandalone(true);
      }
    };

    listeners.add(handlePromptChange);

    // Re-verify standalone mode
    const standalone = checkIsStandalone();
    setIsStandalone(standalone);
    if (standalone) {
      setIsInstalled(true);
    }

    return () => {
      listeners.delete(handlePromptChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        try {
          localStorage.setItem('scaro_pwa_installed', 'true');
        } catch {
          // Ignore
        }
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[PWA] Prompt installation error:', err);
      return false;
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('scaro_pwa_dismissed', 'true');
    } catch {
      // Ignore
    }
  }, []);

  const canInstall = Boolean(!isStandalone && !isInstalled && deferredPrompt !== null);

  return {
    isStandalone,
    isInstalled,
    canInstall,
    isDismissed,
    deferredPrompt,
    promptInstall,
    dismissPrompt,
  };
}
