import React, { useState, useEffect } from 'react';
import { Download, Zap, Monitor, ShieldCheck } from 'lucide-react';
import { usePwaInstall } from './usePwaInstall';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export const AutoInstallPrompt: React.FC = () => {
  const { canInstall, isDismissed, promptInstall, dismissPrompt } = usePwaInstall();
  const [isOpen, setIsOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Show automatic prompt if browser provides installation opportunity,
    // app is not installed/standalone, and user hasn't dismissed it this session.
    if (canInstall && !isDismissed) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1200); // 1.2s delay for smooth dashboard transition after login

      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
    }
  }, [canInstall, isDismissed]);

  const handleInstall = async () => {
    try {
      setIsInstalling(true);
      const installed = await promptInstall();
      if (installed) {
        setIsOpen(false);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    dismissPrompt();
  };

  if (!canInstall || isDismissed || !isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDismiss}
      title={
        <div className="flex items-center gap-3">
          <img
            src="/assets/scaro-logo.png"
            alt="SCARO ERP Logo"
            className="h-7 w-7 object-contain rounded-md border border-border/40 bg-[#fbf7f2] shadow-2xs shrink-0"
          />
          <div>
            <h3 className="text-base font-bold text-content leading-tight">Install SCARO ERP</h3>
            <p className="text-[11px] text-content-muted">Official Progressive Web Application</p>
          </div>
        </div>
      }
      className="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            disabled={isInstalling}
            className="text-xs"
          >
            Not Now
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleInstall}
            isLoading={isInstalling}
            disabled={isInstalling}
            className="text-xs font-semibold gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Install App</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <p className="text-xs text-content-muted leading-relaxed">
          Install <strong>SCARO ERP</strong> on your device for faster startup, desktop notifications, and a dedicated distraction-free workspace.
        </p>

        {/* Feature Highlights */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-muted/80 border border-border">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-content">Instant Access</p>
              <p className="text-[11px] text-content-muted">Launch with one click from your taskbar or home screen.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-muted/80 border border-border">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
              <Monitor className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-content">Full-Screen Workspace</p>
              <p className="text-[11px] text-content-muted">Dedicated app window without browser tabs or address bars.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-muted/80 border border-border">
            <div className="p-1.5 rounded-md bg-status-success/10 text-status-success shrink-0 mt-0.5">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-content">Secure Enterprise Environment</p>
              <p className="text-[11px] text-content-muted">Encrypted local session cache and real-time backend sync.</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
