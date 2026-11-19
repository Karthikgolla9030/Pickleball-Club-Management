/**
 * Aught2 Pickleball — ClubHeroCarousel
 *
 * Layered Club Side Welcome Hero Banner with automatically sliding promotional
 * advertisement carousel in the background:
 * - When the club has active promotional advertisements:
 *     * Displays promotional images belonging exclusively to the currently selected club.
 *     * Automatically transitions with a smooth crossfade every 5 seconds behind the Welcome banner.
 *     * Multi-tenant isolated: switching active clubs refreshes ads so previous club ads are never shown.
 * - When the club has no active advertisements:
 *     * Seamlessly displays the default Club Welcome banner without pagination controls or empty boxes.
 * - The Welcome banner (greetings, title, supporting text, CTA button, motto) remains
 *   visibly prominent, readable, and interactive in the foreground at all times.
 */

import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';

import { AppText } from './AppText';
import { LayeredHeroAdBackground } from './LayeredHeroAdBackground';
import {
  useActiveClub,
  useClubCarouselSlides,
  usePlatformBanner,
  usePlatformBranding,
} from '@/hooks';
import { resolveOwnerBanner } from '@/utils';

export interface HeroBannerSlide {
  id: string;
  tag: string;
  title: string;
  supportingText: string;
  ctaText: string;
  route: string;
  scriptLines: string[];
  image: any;
}

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

    let resolvedTitle = 'Welcome';
    if (platformBanner?.title && !platformBanner.title.includes('Aught2')) {
      resolvedTitle = platformBanner.title;
    } else if (platformName && platformName.trim().length > 0) {
      resolvedTitle = `Welcome to ${platformName.trim()}`;
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

  return (
    <View style={styles.heroWrapper}>
      <LayeredHeroAdBackground
        ads={clubAds}
        fallbackImageSource={welcomeData.image}
        overlayVariant="dark-emerald"
        minHeight={215}
        attributionPosition="none"
        onAdPress={(ad) => {
          if (ad.cta_route) {
            router.push(ad.cta_route as any);
          }
        }}
      >
        <View style={styles.heroInner}>
          {/* Upper portion: Category/Eyebrow, Main Heading, Supporting Description */}
          <View style={styles.heroUpperBlock}>
            <AppText style={styles.heroTagText}>{welcomeData.tag}</AppText>
            <AppText style={styles.heroHeading} numberOfLines={2}>
              {welcomeData.title}
            </AppText>
            <AppText style={styles.heroSupportingText} numberOfLines={2}>
              {welcomeData.supportingText}
            </AppText>
          </View>

          {/* Spacer */}
          <View style={styles.heroSpacer} />

          {/* Lower portion: CTA button on the left, Decorative Script Motto on the right */}
          <View style={styles.heroBottomRow}>
            <TouchableOpacity
              style={styles.heroCtaButton}
              onPress={() => router.push(welcomeData.route as any)}
              activeOpacity={0.88}
              accessibilityLabel={welcomeData.ctaText}
              accessibilityRole="button"
            >
              <AppText style={styles.heroCtaText} numberOfLines={1}>
                {welcomeData.ctaText}
              </AppText>
              <ArrowRight size={13} color="#102F2B" strokeWidth={2.4} />
            </TouchableOpacity>

            {/* Decorative Script Motto (Right side) */}
            {welcomeData.scriptLines && welcomeData.scriptLines.length > 0 && (
              <View style={styles.heroScriptMotto}>
                {welcomeData.scriptLines.map((line, lIdx) => (
                  <AppText key={lIdx} style={styles.scriptLine}>
                    {line}
                  </AppText>
                ))}
              </View>
            )}
          </View>
        </View>
      </LayeredHeroAdBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrapper: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  heroInner: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 22,
    justifyContent: 'space-between',
    minHeight: 215,
  },
  heroUpperBlock: {
    gap: 4,
    alignItems: 'flex-start',
    width: '100%',
  },
  heroTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#6EE7B7',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  heroSupportingText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.90)',
    lineHeight: 16.5,
    maxWidth: '85%',
  },
  heroSpacer: {
    minHeight: 14,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    gap: 10,
  },
  heroCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    maxWidth: '70%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  heroCtaText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#102F2B',
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
    gap: -2,
    flexShrink: 0,
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
