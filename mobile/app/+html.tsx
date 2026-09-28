import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML template for Expo Router Web.
 * Configures Aught2 Pickleball as an installable Progressive Web App (PWA).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Mobile viewport with viewport-fit=cover, preserving accessible user zoom */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>Aught2 Pickleball</title>

        {/* PWA Web App Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme & Brand Colors */}
        <meta name="theme-color" content="#176B57" />
        <meta name="msapplication-TileColor" content="#176B57" />

        {/* Apple iOS PWA Capabilities & Icons */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Aught2" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

        {/* Standard Favicons */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />

        {/* General Meta */}
        <meta name="description" content="Aught2 Pickleball Club & Tournament Management Platform" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Expo web resets */}
        <ScrollViewStyleReset />

        {/* Responsive layout: prevent horizontal scroll while keeping body full-height */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                width: 100%;
                height: 100%;
                overflow-x: hidden;
                background-color: #F4F8F5;
                -webkit-tap-highlight-color: transparent;
              }
              #root {
                display: flex;
                min-height: 100%;
                width: 100%;
                overflow-x: hidden;
              }
            `,
          }}
        />
      </head>
      <body>
        <noscript>You need to enable JavaScript to run Aught2 Pickleball.</noscript>
        {children}

        {/* Service Worker Registration with Automatic Cache-Busting & Auto-Reload */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    reg.update();
                    reg.onupdatefound = function() {
                      var installingWorker = reg.installing;
                      if (installingWorker) {
                        installingWorker.onstatechange = function() {
                          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[PWA] New version available, reloading to apply latest code...');
                            installingWorker.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                          }
                        };
                      }
                    };
                  }).catch(function(err) {
                    console.warn('[PWA] ServiceWorker registration failed: ', err);
                  });
                });
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                  window.location.reload();
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
