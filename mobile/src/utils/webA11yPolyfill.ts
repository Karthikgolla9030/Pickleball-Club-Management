/**
 * Aught2 Pickleball — Web Accessibility & Focus Management Polyfill
 *
 * Resolves the browser WAI-ARIA violation:
 * "Blocked aria-hidden on an element because its descendant retained focus.
 *  The focus must not be hidden from assistive technology users."
 *
 * Root Cause in React Native Web & Expo Router / React Navigation:
 * When navigating between screens, changing tabs, or toggling modals, React Navigation
 * and React Native Web mark background/inactive screen containers with:
 *   style="display: none;" aria-hidden="true"
 * However, the button or interactive element that the user clicked to trigger the
 * navigation or modal transition still holds DOM focus (document.activeElement).
 * Modern Chromium/WebKit browsers strictly block aria-hidden when a descendant element
 * is focused because it creates "ghost focus" that breaks screen readers.
 *
 * Solution implemented here:
 * 1. Synchronously blur the focused element before `aria-hidden="true"` is set on its ancestor.
 * 2. Guard `HTMLElement.prototype.focus` against focusing elements inside `[aria-hidden="true"]` trees.
 * 3. Observe dynamic attribute mutations via MutationObserver as a fallback.
 * 4. Export `blurActiveElement()` utility for explicit button press handlers.
 */

import { Platform } from 'react-native';

export function blurActiveElement(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }
  try {
    const active = document.activeElement;
    if (active && active instanceof HTMLElement && typeof active.blur === 'function') {
      active.blur();
    }
  } catch {
    // Suppress any DOM access errors in non-standard environments
  }
}

export function setupWebA11yPolyfill(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // Prevent multiple initializations
  if ((window as unknown as { __a11yPolyfillInitialized?: boolean }).__a11yPolyfillInitialized) {
    return;
  }
  (window as unknown as { __a11yPolyfillInitialized?: boolean }).__a11yPolyfillInitialized = true;

  // 1. Intercept Element.prototype.setAttribute
  if (typeof Element !== 'undefined' && Element.prototype.setAttribute) {
    const originalSetAttribute = Element.prototype.setAttribute;

    Element.prototype.setAttribute = function (
      this: Element,
      name: string,
      value: string
    ): void {
      if (name === 'aria-hidden' && (value === 'true' || value === '')) {
        try {
          const active = document.activeElement;
          if (active && (this === active || this.contains(active))) {
            if (active instanceof HTMLElement && typeof active.blur === 'function') {
              active.blur();
            }
          }
        } catch {
          // Safeguard against detached DOM nodes
        }
      }
      return originalSetAttribute.call(this, name, value);
    };
  }

  // 2. Intercept Element.prototype.ariaHidden setter if defined
  if (typeof Element !== 'undefined') {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'ariaHidden');
      if (descriptor && descriptor.set) {
        const originalAriaHiddenSet = descriptor.set;
        Object.defineProperty(Element.prototype, 'ariaHidden', {
          ...descriptor,
          set(this: Element, value: unknown) {
            if (value === 'true' || value === true) {
              try {
                const active = document.activeElement;
                if (active && (this === active || this.contains(active))) {
                  if (active instanceof HTMLElement && typeof active.blur === 'function') {
                    active.blur();
                  }
                }
              } catch {
                // Safeguard against detached DOM nodes
              }
            }
            return originalAriaHiddenSet.call(this, value);
          },
        });
      }
    } catch {
      // Property descriptor modification not permitted in this runtime
    }
  }

  // 3. Guard HTMLElement.prototype.focus against focusing elements inside aria-hidden ancestors
  if (typeof HTMLElement !== 'undefined' && HTMLElement.prototype.focus) {
    const originalFocus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (
      this: HTMLElement,
      options?: FocusOptions
    ): void {
      try {
        const hiddenAncestor = this.closest ? this.closest('[aria-hidden="true"]') : null;
        if (hiddenAncestor) {
          // Element is inside an aria-hidden ancestor; focusing it would violate WAI-ARIA
          return;
        }
      } catch {
        // Fallback
      }
      return originalFocus.call(this, options);
    };
  }

  // 4. MutationObserver fallback to catch any mutations not routed through standard setters
  if (typeof MutationObserver !== 'undefined') {
    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'aria-hidden'
          ) {
            const target = mutation.target as HTMLElement;
            if (target && target.getAttribute && target.getAttribute('aria-hidden') === 'true') {
              const active = document.activeElement;
              if (active && (target === active || target.contains(active))) {
                if (active instanceof HTMLElement && typeof active.blur === 'function') {
                  active.blur();
                }
              }
            }
          }
        }
      });

      const startObserving = () => {
        const root = document.body || document.documentElement;
        if (root) {
          observer.observe(root, {
            attributes: true,
            subtree: true,
            attributeFilter: ['aria-hidden'],
          });
        }
      };

      if (document.body) {
        startObserving();
      } else {
        document.addEventListener('DOMContentLoaded', startObserving, { once: true });
      }
    } catch {
      // MutationObserver not available or blocked
    }
  }
}

// Automatically initialize when imported
setupWebA11yPolyfill();
