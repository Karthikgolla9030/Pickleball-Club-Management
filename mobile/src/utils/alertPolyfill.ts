/**
 * Aught2 Pickleball — React Native Web Alert Polyfill
 *
 * In React Native Web, Alert.alert is an empty no-op function:
 *   class Alert { static alert() {} }
 *
 * This caused all confirmation dialogs, delete actions, registration toggles,
 * and three-dot options menus to silently fail when clicked in web browsers.
 *
 * This polyfill provides a modern, responsive, accessible in-DOM dialog
 * with full support for:
 *   - Informational alerts (1 button: OK)
 *   - Confirmations (2 buttons: Cancel + Confirm / Destructive)
 *   - Action Menus (3+ buttons: stacked action list with styles)
 *   - Escape key dismiss & backdrop click handling
 *   - Proper execution of button.onPress callbacks
 */

import { Alert, Platform } from 'react-native';

export function setupAlertPolyfill(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: Array<{
      text?: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>,
    options?: { cancelable?: boolean; onDismiss?: () => void }
  ) => {
    // Clean up any previously opened alert
    const existing = document.getElementById('rn-web-alert-overlay');
    if (existing) {
      existing.remove();
    }

    const dialogButtons =
      buttons && buttons.length > 0
        ? buttons
        : [{ text: 'OK', style: 'default' as const }];

    const overlay = document.createElement('div');
    overlay.id = 'rn-web-alert-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'rn-web-alert-title');

    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '999999',
      padding: '16px',
      boxSizing: 'border-box',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      opacity: '0',
      transition: 'opacity 0.15s ease-out',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      backgroundColor: '#FFFFFF',
      borderRadius: '20px',
      padding: '24px',
      maxWidth: '380px',
      width: '100%',
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow:
        '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      transform: 'scale(0.96)',
      transition: 'transform 0.15s ease-out',
      boxSizing: 'border-box',
    });

    // Title
    const titleEl = document.createElement('h3');
    titleEl.id = 'rn-web-alert-title';
    titleEl.innerText = title || '';
    Object.assign(titleEl.style, {
      margin: '0 0 10px 0',
      fontSize: '18px',
      fontWeight: '700',
      color: '#0F172A',
      textAlign: 'center',
      lineHeight: '1.35',
      letterSpacing: '-0.2px',
    });
    card.appendChild(titleEl);

    // Message
    if (message) {
      const msgEl = document.createElement('div');
      msgEl.innerText = message;
      Object.assign(msgEl.style, {
        margin: '0 0 24px 0',
        fontSize: '14.5px',
        fontWeight: '400',
        color: '#475569',
        textAlign: 'center',
        lineHeight: '1.55',
        whiteSpace: 'pre-line',
      });
      card.appendChild(msgEl);
    } else {
      titleEl.style.marginBottom = '24px';
    }

    const closeOverlay = (callback?: () => void) => {
      document.removeEventListener('keydown', handleKeyDown);
      overlay.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        if (callback) {
          callback();
        }
      }, 150);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && options?.cancelable !== false) {
        e.preventDefault();
        const cancelBtn =
          dialogButtons.find((b) => b.style === 'cancel') ||
          dialogButtons[0];
        closeOverlay(cancelBtn?.onPress || options?.onDismiss);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Backdrop click
    overlay.addEventListener('click', (e: MouseEvent) => {
      if (e.target === overlay && options?.cancelable !== false) {
        const cancelBtn =
          dialogButtons.find((b) => b.style === 'cancel') ||
          dialogButtons[0];
        closeOverlay(cancelBtn?.onPress || options?.onDismiss);
      }
    });

    // Buttons Container
    const btnContainer = document.createElement('div');
    const isMultiButton = dialogButtons.length > 2;

    if (isMultiButton) {
      // Stacked column for action sheets / menus
      Object.assign(btnContainer.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        boxSizing: 'border-box',
      });
    } else if (dialogButtons.length === 1) {
      // Single button: informational alerts (Registration Closed, Success, etc.)
      Object.assign(btnContainer.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        width: '100%',
        boxSizing: 'border-box',
      });
    } else {
      // Side-by-side 2-button confirmations
      Object.assign(btnContainer.style, {
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box',
      });
    }

    // For 2-button confirmations, ensure Cancel is on the left
    let orderedButtons = [...dialogButtons];
    if (orderedButtons.length === 2) {
      const cancelIndex = orderedButtons.findIndex((b) => b.style === 'cancel');
      if (cancelIndex === 1) {
        orderedButtons = [orderedButtons[1], orderedButtons[0]];
      }
    }

    orderedButtons.forEach((btn, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerText = btn.text || 'OK';

      const isCancel = btn.style === 'cancel';
      const isDestructive = btn.style === 'destructive';

      let bg = '#087A60'; // Primary brand forest green
      let textCol = '#FFFFFF';
      let border = 'none';

      if (isMultiButton) {
        if (isCancel) {
          bg = '#F1F5F9';
          textCol = '#475569';
          border = '1px solid #E2E8F0';
        } else if (isDestructive) {
          bg = '#FEF2F2';
          textCol = '#DC2626';
          border = '1px solid #FEE2E2';
        } else {
          bg = '#F8FAFC';
          textCol = '#0F172A';
          border = '1px solid #E2E8F0';
        }
      } else {
        if (isCancel) {
          bg = '#F1F5F9';
          textCol = '#334155';
          border = '1px solid #E2E8F0';
        } else if (isDestructive) {
          bg = '#DC2626';
          textCol = '#FFFFFF';
        }
      }

      Object.assign(b.style, {
        flex: dialogButtons.length === 2 ? '1 1 0px' : '0 0 auto',
        flexShrink: '0',
        minHeight: '48px',
        height: '48px',
        lineHeight: '20px',
        borderRadius: '12px',
        backgroundColor: bg,
        color: textCol,
        border: border,
        fontSize: '15px',
        fontWeight: isCancel ? '600' : '700',
        letterSpacing: '0.2px',
        cursor: 'pointer',
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 20px',
        transition: 'background-color 0.1s, opacity 0.1s',
        boxSizing: 'border-box',
        width: dialogButtons.length === 2 ? 'auto' : '100%',
        minWidth: '0',
      });

      b.onmouseover = () => {
        b.style.opacity = '0.88';
      };
      b.onmouseout = () => {
        b.style.opacity = '1';
      };

      b.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        closeOverlay(btn.onPress);
      });

      btnContainer.appendChild(b);

      // Auto-focus primary/last button
      if (idx === orderedButtons.length - 1) {
        setTimeout(() => b.focus(), 50);
      }
    });

    card.appendChild(btnContainer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Trigger entrance transition
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
  };
}

// Automatically initialize when imported
setupAlertPolyfill();
