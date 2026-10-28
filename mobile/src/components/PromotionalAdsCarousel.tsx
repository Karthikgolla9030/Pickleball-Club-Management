/**
 * Aught2 Pickleball — Promotional Ads Carousel Component
 *
 * Professional, mobile-first advertising carousel used for:
 * 1. Player Home Page: Universal Promotional Ads Carousel (aggregating eligible ads from all active clubs)
 * 2. Player Club Details: Club-specific promotional ads carousel
 *
 * Features:
 * - Horizontal swipeable carousel with touch gestures & pagination dots
 * - Fixed aspect-ratio cards with high-contrast text overlays
 * - Club attribution badge ("📍 Austin Smash")
 * - Category tag pill (e.g. "SPECIAL OFFER", "TOURNAMENT")
 * - Safe destination routing on CTA button tap
 * - Omission or clean handling when no eligible ads exist (no fake ads)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, MapPin, Sparkles } from 'lucide-react-native';

import { AppText } from './AppText';
import { Radius, Shadows, Spacing } from '@/theme';
import type { ClubCarouselSlide, UniversalPromotionalAd } from '@/types';
import { resolveMediaUrl } from '@/utils';

type AdItem = UniversalPromotionalAd | ClubCarouselSlide;

interface PromotionalAdsCarouselProps {
  ads: AdItem[];
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  hideIfEmpty?: boolean;
}

export function PromotionalAdsCarousel({
  ads = [],
  title = 'Club Promotions & Special Offers',
  subtitle = 'Exclusive tournaments, clinics, and specials from participating clubs',
  isLoading = false,
  hideIfEmpty = true,
}: PromotionalAdsCarouselProps) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  // Responsive card width: ~84vw on mobile, capped at 400px
  const cardWidth = Math.min(Math.max(windowWidth - 48, 280), 400);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isInteracting = useRef(false);

  // Auto-scroll carousel every 5 seconds when multiple ads exist and user is not actively interacting
  useEffect(() => {
    if (ads.length <= 1) return;

    const interval = setInterval(() => {
      if (isInteracting.current) return;

      setActiveIndex((prev) => {
        const next = (prev + 1) % ads.length;
        scrollRef.current?.scrollTo({
          x: next * (cardWidth + 12),
          animated: true,
        });
        return next;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [ads.length, cardWidth]);

  // If no ads exist and hideIfEmpty is enabled, return null gracefully (no fake ads)
  if (!isLoading && ads.length === 0 && hideIfEmpty) {
    return null;
  }

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / (cardWidth + 12));
    if (nextIndex >= 0 && nextIndex < ads.length && nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }
  };

  const handleCtaPress = (ad: AdItem) => {
    if (ad.cta_route) {
      router.push(ad.cta_route as any);
    } else if ('club_id' in ad && ad.club_id) {
      router.push({
        pathname: '/(player)/club-details',
        params: { clubId: ad.club_id },
      } as any);
    }
  };

  return (
    <View style={styles.sectionContainer}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Sparkles size={16} color="#166534" />
            <AppText style={styles.sectionTitle}>{title}</AppText>
          </View>
          {subtitle ? <AppText style={styles.sectionSubtitle}>{subtitle}</AppText> : null}
        </View>
      </View>

      {/* Scroller */}
      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + 12}
        snapToAlignment="start"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          isInteracting.current = true;
        }}
        onScrollEndDrag={() => {
          setTimeout(() => {
            isInteracting.current = false;
          }, 2500);
        }}
        onTouchStart={() => {
          isInteracting.current = true;
        }}
        onTouchEnd={() => {
          setTimeout(() => {
            isInteracting.current = false;
          }, 2500);
        }}
        contentContainerStyle={styles.scrollContent}
      >
        {ads.map((ad, idx) => {
          const clubName = 'club_name' in ad ? ad.club_name : null;
          const imageUrl = resolveMediaUrl(ad.image_url);
          const displayTitle = ad.title || (clubName ? `${clubName} Special` : 'Featured Offer');

          return (
            <TouchableOpacity
              key={ad.id || idx}
              style={[styles.cardWrapper, { width: cardWidth }]}
              activeOpacity={0.92}
              onPress={() => handleCtaPress(ad)}
            >
              <ImageBackground
                source={{ uri: imageUrl }}
                style={styles.cardImageBg}
                imageStyle={styles.cardImage}
                resizeMode="cover"
              >
                {/* Contrast overlay */}
                <View style={styles.overlay} />

                <View style={styles.cardInner}>
                  {/* Top Row: Club Attribution and/or Tag */}
                  <View style={styles.topBadgeRow}>
                    {clubName ? (
                      <View style={styles.clubBadge}>
                        <MapPin size={11} color="#FFFFFF" />
                        <AppText style={styles.clubBadgeText} numberOfLines={1}>
                          {clubName}
                        </AppText>
                      </View>
                    ) : null}

                    {ad.tag ? (
                      <View style={styles.tagBadge}>
                        <AppText style={styles.tagBadgeText}>{ad.tag.toUpperCase()}</AppText>
                      </View>
                    ) : null}
                  </View>

                  {/* Middle / Bottom Content */}
                  <View style={styles.bottomContent}>
                    <AppText style={styles.adTitle} numberOfLines={2}>
                      {displayTitle}
                    </AppText>

                    {ad.subtitle ? (
                      <AppText style={styles.adSubtitle} numberOfLines={2}>
                        {ad.subtitle}
                      </AppText>
                    ) : null}

                    <View style={styles.ctaRow}>
                      <View style={styles.ctaButton}>
                        <AppText style={styles.ctaText} numberOfLines={1}>
                          {ad.cta_text || 'View Offer'}
                        </AppText>
                        <ArrowRight size={13} color="#102F2B" strokeWidth={2.4} />
                      </View>
                    </View>
                  </View>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Pagination Dots (only when multiple ads exist) */}
      {ads.length > 1 && (
        <View style={styles.dotsContainer}>
          {ads.map((_, dotIdx) => (
            <TouchableOpacity
              key={dotIdx}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={() => {
                setActiveIndex(dotIdx);
                scrollRef.current?.scrollTo({
                  x: dotIdx * (cardWidth + 12),
                  animated: true,
                });
              }}
              style={[
                styles.dot,
                dotIdx === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginVertical: Spacing[4],
  },
  headerRow: {
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
  },
  headerLeft: {
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    gap: 12,
  },
  cardWrapper: {
    height: 195,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.md,
  },
  cardImageBg: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'space-between',
  },
  cardImage: {
    borderRadius: Radius.xl,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  cardInner: {
    flex: 1,
    padding: Spacing[3.5],
    justifyContent: 'space-between',
  },
  topBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    flexWrap: 'wrap',
  },
  clubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(23, 107, 87, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  clubBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: 160,
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  bottomContent: {
    gap: 4,
  },
  adTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 21,
  },
  adSubtitle: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 16,
  },
  ctaRow: {
    marginTop: 4,
    flexDirection: 'row',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    ...Shadows.sm,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#102F2B',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing[3],
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: '#176B57',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
});
