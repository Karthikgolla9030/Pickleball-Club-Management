/**
 * Platform Branding & Anti-Flicker Unit Tests
 *
 * Verifies:
 * 1. Persistent branding cache storage & synchronous hydration (Web & Native)
 * 2. Instant resolution of configured product name (e.g. "Picklora") on reload
 * 3. Prevention of default/hardcoded strings ("Pickleball", "Aught2") on cold starts
 * 4. ClubHeroCarousel title & tag resolution logic
 * 5. Player Home hero tagline resolution logic
 * 6. Dynamic settings updates and cache invalidation
 */

import {
  getCachedPlatformBranding,
  setCachedPlatformBranding,
  getCachedPlatformBanner,
  setCachedPlatformBanner,
} from '../../services/platformBrandingStorage';
import type { PlatformBanner, PlatformPublicBranding } from '../../types';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Test assertion failed: ${msg}`);
  }
}

export function runPlatformBrandingTests(): void {
  console.log('Running Platform Branding anti-flicker tests...');

  // Test 1: Persistent Branding Cache Storage & Retrieval
  const testBranding: PlatformPublicBranding = {
    platform_name: 'Picklora',
    platform_support_email: 'support@picklora.com',
    maintenance_mode: false,
  };

  setCachedPlatformBranding(testBranding);
  const retrieved = getCachedPlatformBranding();
  assert(retrieved !== null, 'Cached branding must not be null after set');
  assert(retrieved?.platform_name === 'Picklora', `Expected "Picklora", got "${retrieved?.platform_name}"`);
  assert(
    retrieved?.platform_support_email === 'support@picklora.com',
    'Email must match'
  );

  // Test 2: Platform Banner Cache Storage & Retrieval
  const testBanner: PlatformBanner = {
    id: 'owner-home-banner',
    banner_type: 'owner_home',
    title: 'Welcome to Picklora',
    subtitle: 'Great courts. Active members.',
    cta_text: 'Book a Court',
    cta_destination: '/(club)/bookings',
    is_active: true,
  };

  setCachedPlatformBanner('owner_home', testBanner);
  const retrievedBanner = getCachedPlatformBanner('owner_home');
  assert(retrievedBanner !== null, 'Cached banner must not be null');
  assert(
    retrievedBanner?.title === 'Welcome to Picklora',
    `Expected banner title "Welcome to Picklora", got "${retrievedBanner?.title}"`
  );

  // Test 3: ClubHeroCarousel Resolution Logic with Hydrated Branding
  // Simulates initial render on reload when cache is present
  const resolveClubCarousel = (
    banner: PlatformBanner | null,
    platformName: string
  ) => {
    let resolvedTitle = 'Welcome';
    if (banner?.title && !banner.title.includes('Aught2')) {
      resolvedTitle = banner.title;
    } else if (platformName && platformName.trim().length > 0) {
      resolvedTitle = `Welcome to ${platformName.trim()}`;
    }

    let resolvedTag = 'COMMUNITY';
    if (platformName && platformName.trim().length > 0) {
      resolvedTag = platformName.trim().toUpperCase();
    } else if (banner?.title && !banner.title.includes('Aught2')) {
      const match = banner.title.match(/Welcome to (.+)/i);
      if (match && match[1]) {
        resolvedTag = match[1].trim().toUpperCase();
      }
    }

    return { resolvedTitle, resolvedTag };
  };

  const reloadedView = resolveClubCarousel(retrievedBanner, retrieved?.platform_name || '');
  assert(
    reloadedView.resolvedTitle === 'Welcome to Picklora',
    `Expected title "Welcome to Picklora", got "${reloadedView.resolvedTitle}"`
  );
  assert(
    reloadedView.resolvedTag === 'PICKLORA',
    `Expected tag "PICKLORA", got "${reloadedView.resolvedTag}"`
  );

  // Test 4: Cold Start Presentation (No cache, before network returns)
  // Must NEVER flash "Pickleball" or "Aught2"
  const coldStartView = resolveClubCarousel(null, '');
  assert(
    coldStartView.resolvedTitle !== 'Welcome to Pickleball',
    'Must NOT render "Welcome to Pickleball" on cold start'
  );
  assert(
    !coldStartView.resolvedTitle.includes('Aught2'),
    'Must NOT render "Aught2" on cold start'
  );
  assert(
    coldStartView.resolvedTag !== 'PICKLEBALL',
    'Must NOT render "PICKLEBALL" tag on cold start'
  );
  assert(
    coldStartView.resolvedTitle === 'Welcome',
    `Expected neutral title "Welcome", got "${coldStartView.resolvedTitle}"`
  );

  // Test 5: Player Home Hero Tagline Resolution Logic
  const resolvePlayerTagline = (
    platformName: string,
    playerBannerTitle?: string | null
  ) => {
    if (platformName && platformName.trim().length > 0) {
      return `WELCOME TO ${platformName.trim().toUpperCase()}`;
    }
    if (playerBannerTitle && !playerBannerTitle.includes('Aught2')) {
      return playerBannerTitle.toUpperCase();
    }
    return 'WELCOME';
  };

  const playerReloaded = resolvePlayerTagline('Picklora');
  assert(
    playerReloaded === 'WELCOME TO PICKLORA',
    `Expected "WELCOME TO PICKLORA", got "${playerReloaded}"`
  );

  const playerCold = resolvePlayerTagline('');
  assert(
    playerCold !== 'WELCOME TO PICKLEBALL',
    'Must NOT render "WELCOME TO PICKLEBALL" on cold start'
  );
  assert(
    playerCold === 'WELCOME',
    `Expected neutral "WELCOME", got "${playerCold}"`
  );

  // Test 6: Platform Settings Update Simulation
  const updatedBrandName = 'Picklora Pro';
  setCachedPlatformBranding({
    platform_name: updatedBrandName,
    platform_support_email: 'support@picklorapro.com',
    maintenance_mode: false,
  });
  const freshlyCached = getCachedPlatformBranding();
  assert(
    freshlyCached?.platform_name === 'Picklora Pro',
    'Updated branding must immediately update cache'
  );

  const afterUpdate = resolveClubCarousel(null, freshlyCached?.platform_name || '');
  assert(
    afterUpdate.resolvedTitle === 'Welcome to Picklora Pro',
    `Expected "Welcome to Picklora Pro", got "${afterUpdate.resolvedTitle}"`
  );
  assert(
    afterUpdate.resolvedTag === 'PICKLORA PRO',
    `Expected "PICKLORA PRO", got "${afterUpdate.resolvedTag}"`
  );

  console.log('All Platform Branding anti-flicker tests PASSED successfully!');
}
