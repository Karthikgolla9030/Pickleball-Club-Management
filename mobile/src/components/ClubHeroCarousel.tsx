/**
 * Aught2 Pickleball — ClubHeroCarousel
 *
 * Events-style hero carousel for the Club Side Home page.
 * Implements the approved Events reference design:
 * - Slide 1: ALWAYS the Club Welcome banner (greetings, title, description, CTA button, motto)
 * - Slides 2+: Club-specific promotional advertisements (belonging strictly to the selected club)
 * - Multi-tenant isolated: switching active clubs resets the carousel to Slide 1 and fetches the new club's ads
 * - When no ads exist: displays only the single Welcome banner without pagination controls or empty boxes
 * - Automatic sliding every 5 seconds, swipe gestures, pause on user interaction and tab blur
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from './AppText';
import { BannerSlide, PlayerHeroBanner } from './PlayerHeroBanner';
import {
  useActiveClub,
  useClubCarouselSlides,
  usePlatformBanner,
  usePlatformBranding,
} from '@/hooks';
import { resolveOwnerBanner } from '@/utils';

interface ClubHeroCarouselProps {
  clubId?: string | null;
  fallbackCoverUrl?: string | null;
  fallbackClubName?: string | null;
}

export function ClubHeroCarousel({
  clubId: propClubId,
  fallbackClubName,
}: ClubHeroCarouselProps = {}) {
  const router = useRouter();
  const { clubId: activeClubId, clubName: activeClubName } = useActiveClub();
  const { platformName } = usePlatformBranding();
  const effectiveClubId = propClubId ?? activeClubId;
  const effectiveClubName = fallbackClubName ?? activeClubName;

  // Platform Admin Global Banner for owner home fallback
  const { banner: platformBanner } = usePlatformBanner('owner_home');

  // Club-specific promotional ads (only active, scheduled ads belonging strictly to this club)
  const { slides: clubAds = [] } = useClubCarouselSlides(effectiveClubId, true);

  // Default welcome content
  const welcomeData = useMemo(() => {
    const ownerBannerImage = resolveOwnerBanner(platformBanner);

    let resolvedTitle = 'Play Together\nGrow Stronger';
    if (platformBanner?.title && !platformBanner.title.includes('Aught2')) {
      resolvedTitle = platformBanner.title;
    } else if (effectiveClubName) {
      resolvedTitle = `Welcome to\n${effectiveClubName}`;
    }

    let resolvedTag = 'COMMUNITY';
    if (platformName && platformName.trim().length > 0) {
      resolvedTag = platformName.trim().toUpperCase();
    } else if (platformBanner?.title && !platformBanner.title.includes('Aught2')) {
      const match = platformBanner.title.match(/Welcome to (.+)/i);
      if (match && match[1]) {
        resolvedTag = match[1].trim().toUpperCase();
      }
    }

    return {
      tag: resolvedTag,
      title: resolvedTitle,
      supportingText:
        platformBanner?.subtitle ||
        'Great courts. Active members.\nA healthier, happier community.',
      ctaText: platformBanner?.cta_text || 'Book a Court',
      route: platformBanner?.cta_destination || '/(club)/bookings',
      scriptLines: ['Play', 'Grow', 'Excel', 'Together'],
      image: ownerBannerImage,
    };
  }, [platformBanner, platformName, effectiveClubName]);

  // Construct Slides: Slide 1 is ALWAYS the Club Welcome banner!
  const clubHeroSlides = useMemo<BannerSlide[]>(() => {
    // 1. First slide is ALWAYS the Club Welcome banner
    const welcomeSlide: BannerSlide = {
      id: `club-welcome-${effectiveClubId || 'default'}`,
      tag: welcomeData.tag,
      title: welcomeData.title,
      description: welcomeData.supportingText,
      ctaText: welcomeData.ctaText,
      onCtaPress: () => router.push(welcomeData.route as any),
      imageSource: welcomeData.image,
      rightContent: (
        <View style={styles.heroScriptMotto}>
          {welcomeData.scriptLines.map((line, lIdx) => (
            <AppText key={lIdx} style={styles.scriptLine}>
              {line}
            </AppText>
          ))}
        </View>
      ),
    };

    // 2. Subsequent slides are the active club's promotional advertisements
    const adSlides: BannerSlide[] = (clubAds || []).map((ad) => {
      const isDistinctSubtitle =
        ad.subtitle &&
        ad.subtitle.trim().length > 0 &&
        ad.subtitle.trim().toLowerCase() !== (ad.title || '').trim().toLowerCase();

      return {
        id: `club-ad-${ad.id}`,
        tag: (ad.tag || 'CLUB PROMOTION').toUpperCase(),
        title: ad.title || 'Club Promotion',
        description: isDistinctSubtitle ? ad.subtitle! : undefined,
        ctaText: ad.cta_text || 'View Details',
        imageUrl: ad.image_url,
        onCtaPress: () => {
          if (ad.cta_route) {
            router.push(ad.cta_route as any);
          }
        },
      };
    });

    return [welcomeSlide, ...adSlides];
  }, [effectiveClubId, welcomeData, clubAds, router]);

  return (
    <View style={styles.heroWrapper}>
      <PlayerHeroBanner
        slides={clubHeroSlides}
        resetKey={effectiveClubId}
        style={{ marginBottom: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 1.5,
  },
  scriptLine: {
    fontSize: 10.5,
    fontStyle: 'italic',
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
});
