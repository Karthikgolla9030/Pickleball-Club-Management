import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowRight } from 'lucide-react-native';

import { AppText } from './AppText';
import { useActiveClub, usePlatformBanner } from '@/hooks';
import { resolveMediaUrl, resolveOwnerBanner } from '@/utils';

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

export const DEFAULT_HERO_SLIDES: HeroBannerSlide[] = [
  {
    id: 'court-booking',
    tag: 'PICKLEBALL',
    title: 'Play Together\nGrow Stronger',
    supportingText: 'Great courts. Active members.\nA healthier, happier community.',
    ctaText: 'Book a Court',
    route: '/(club)/bookings',
    scriptLines: ['Same', 'Game', 'Bigger', 'Community'],
    image: require('../../assets/events/pickleball_hero.jpg'),
  },
  {
    id: 'tournaments',
    tag: 'CLUB TOURNAMENTS',
    title: 'Compete, Rally\n& Take The Crown',
    supportingText: 'Upcoming scrambles, round robins\n& championship brackets.',
    ctaText: 'View Tournaments',
    route: '/(club)/tournaments',
    scriptLines: ['Serve', 'Rally', 'Score', 'Win'],
    image: require('../../assets/tournaments/hero_discover_banner.jpg'),
  },
  {
    id: 'memberships',
    tag: 'MEMBER PERKS',
    title: 'Flexible Plans\nStronger Community',
    supportingText: 'Exclusive court access, priority slots\n& unlimited open play privileges.',
    ctaText: 'Explore Plans',
    route: '/(club)/memberships',
    scriptLines: ['Passion', 'Power', 'Pure', 'Fun'],
    image: require('../../assets/profile_hero_bg.jpg'),
  },
];

interface ClubHeroCarouselProps {
  clubId?: string | null;
  fallbackCoverUrl?: string | null;
  fallbackClubName?: string | null;
}

export function ClubHeroCarousel({
  clubId: propClubId,
  fallbackCoverUrl,
  fallbackClubName,
}: ClubHeroCarouselProps = {}) {
  const router = useRouter();
  const { clubId: activeClubId, clubName: activeClubName } = useActiveClub();
  const effectiveClubName = fallbackClubName ?? activeClubName;

  const { banner: platformBanner } = usePlatformBanner('owner_home');

  const { width: windowWidth } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState<number>(Math.max(windowWidth - 32, 280));
  const [activeSlide, setActiveSlide] = useState<number>(0);

  const scrollRef = useRef<ScrollView>(null);
  const isInteractingRef = useRef<boolean>(false);
  const pauseCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global Owner Home Banner configured by Platform Admin
  const slides = useMemo<HeroBannerSlide[]>(() => {
    const ownerBannerImage = resolveOwnerBanner(platformBanner);
    const ownerWelcomeSlide: HeroBannerSlide = {
      id: 'platform-owner-home-banner-slide',
      tag: 'WELCOME TO',
      title: platformBanner?.title || effectiveClubName || 'Pickleball Club',
      supportingText:
        platformBanner?.subtitle ||
        'Great courts. Active members.\nA healthier, happier community.',
      ctaText: platformBanner?.cta_text || 'Book a Court',
      route: platformBanner?.cta_destination || '/(club)/bookings',
      scriptLines: ['Play', 'Grow', 'Excel', 'Together'],
      image: ownerBannerImage,
    };

    return [ownerWelcomeSlide];
  }, [platformBanner, effectiveClubName]);

  // Keep scroll position aligned on container width changes
  useEffect(() => {
    if (cardWidth > 0 && activeSlide > 0) {
      scrollRef.current?.scrollTo({
        x: activeSlide * cardWidth,
        animated: false,
      });
    }
  }, [cardWidth]);

  // Ensure activeSlide stays within bounds if slides length changes
  useEffect(() => {
    if (activeSlide >= slides.length) {
      setActiveSlide(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [slides.length, activeSlide]);

  // Pause auto-sliding temporarily when user manually interacts
  const pauseAutoPlayTemporarily = () => {
    isInteractingRef.current = true;
    if (pauseCooldownTimer.current) {
      clearTimeout(pauseCooldownTimer.current);
    }
    pauseCooldownTimer.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 6000);
  };

  // Auto-play timer: rotate every 5s if user is not actively interacting and multiple slides exist
  useEffect(() => {
    if (slides.length <= 1) return;

    const interval = setInterval(() => {
      if (!isInteractingRef.current && cardWidth > 0) {
        setActiveSlide((prev) => {
          const next = (prev + 1) % slides.length;
          scrollRef.current?.scrollTo({
            x: next * cardWidth,
            animated: true,
          });
          return next;
        });
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      if (pauseCooldownTimer.current) {
        clearTimeout(pauseCooldownTimer.current);
      }
    };
  }, [cardWidth, slides.length]);

  const scrollToSlide = (index: number) => {
    pauseAutoPlayTemporarily();
    if (scrollRef.current && cardWidth > 0) {
      scrollRef.current.scrollTo({
        x: index * cardWidth,
        animated: true,
      });
      setActiveSlide(index);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    pauseAutoPlayTemporarily();
    const offsetX = event.nativeEvent.contentOffset.x;
    if (cardWidth > 0) {
      const nextIndex = Math.round(offsetX / cardWidth);
      if (nextIndex >= 0 && nextIndex < slides.length && nextIndex !== activeSlide) {
        setActiveSlide(nextIndex);
      }
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (cardWidth > 0) {
      const nextIndex = Math.round(offsetX / cardWidth);
      if (nextIndex >= 0 && nextIndex < slides.length) {
        setActiveSlide(nextIndex);
      }
    }
  };

  return (
    <View
      style={styles.heroWrapper}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0 && Math.abs(width - cardWidth) > 1) {
          setCardWidth(width);
        }
      }}
    >
      {/* Horizontal Carousel Scroller */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth}
        snapToAlignment="center"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollBeginDrag={() => {
          isInteractingRef.current = true;
          pauseAutoPlayTemporarily();
        }}
        contentContainerStyle={
          Platform.OS === 'web'
            ? ({ scrollSnapType: 'x mandatory' } as any)
            : undefined
        }
      >
        {slides.map((slide) => (
          <View
            key={slide.id}
            style={[
              styles.slideContainer,
              { width: cardWidth },
              Platform.OS === 'web' &&
                ({ scrollSnapAlign: 'start', WebkitScrollSnapAlign: 'start' } as any),
            ]}
          >
            <ImageBackground
              source={slide.image}
              style={styles.heroCard}
              imageStyle={styles.heroCardImage}
            >
              {/* Dark green overlay for high-contrast typography */}
              <View style={styles.heroOverlay} />

              <View style={styles.heroInner}>
                {/* 1. Upper portion: Category/Eyebrow, Main Heading, Supporting Description */}
                <View style={styles.heroUpperBlock}>
                  <AppText style={styles.heroTagText}>{slide.tag}</AppText>
                  <AppText
                    style={styles.heroHeading}
                    numberOfLines={2}
                  >
                    {slide.title}
                  </AppText>
                  <AppText style={styles.heroSupportingText} numberOfLines={2}>
                    {slide.supportingText}
                  </AppText>
                </View>

                {/* 2. Flexible spacing to keep CTA near the bottom */}
                <View style={styles.heroSpacer} />

                {/* 3. Lower portion: CTA button on the left, Decorative Script Motto on the right */}
                <View style={styles.heroBottomRow}>
                  <TouchableOpacity
                    style={styles.heroCtaButton}
                    onPress={() => router.push(slide.route as any)}
                    activeOpacity={0.88}
                    accessibilityLabel={slide.ctaText}
                    accessibilityRole="button"
                  >
                    <AppText style={styles.heroCtaText} numberOfLines={1}>
                      {slide.ctaText}
                    </AppText>
                    <ArrowRight size={13} color="#102F2B" strokeWidth={2.4} />
                  </TouchableOpacity>

                  {/* Decorative Script Motto (Right side) */}
                  {slide.scriptLines && slide.scriptLines.length > 0 && (
                    <View style={styles.heroScriptMotto}>
                      {slide.scriptLines.map((line, lIdx) => (
                        <AppText key={lIdx} style={styles.scriptLine}>
                          {line}
                        </AppText>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </ImageBackground>
          </View>
        ))}
      </ScrollView>

      {/* ── Fixed Interactive Pagination Dots (Bottom-Left Edge, below CTA) ── */}
      {slides.length > 1 && (
        <View style={styles.floatingDotsContainer} pointerEvents="box-none">
          {slides.map((_, dotIndex) => {
            const isActive = activeSlide === dotIndex;
            return (
              <TouchableOpacity
                key={dotIndex}
                onPress={() => scrollToSlide(dotIndex)}
                activeOpacity={0.75}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                accessibilityLabel={`Go to banner ${dotIndex + 1} of ${slides.length}`}
                accessibilityRole="button"
                style={[
                  styles.dotCircle,
                  isActive && styles.dotPill,
                  isActive && styles.dotActive,
                ]}
              />
            );
          })}
        </View>
      )}
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
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  slideContainer: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  heroCard: {
    width: '100%',
    minHeight: 220,
  },
  heroCardImage: {
    borderRadius: 20,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16, 47, 43, 0.46)',
    borderRadius: 20,
  },
  heroInner: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 30,
    justifyContent: 'space-between',
    flex: 1,
    minHeight: 220,
  },
  heroUpperBlock: {
    gap: 4,
    alignItems: 'flex-start',
    width: '100%',
  },
  heroTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroHeading: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 25,
    letterSpacing: -0.4,
  },
  heroSupportingText: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.88)',
    lineHeight: 15.5,
    maxWidth: '90%',
  },
  heroSpacer: {
    flex: 1,
    minHeight: 10,
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
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: '70%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  heroCtaText: {
    fontSize: 12,
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
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.82)',
    letterSpacing: 0.2,
    lineHeight: 13.5,
  },
  floatingDotsContainer: {
    position: 'absolute',
    bottom: 11,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  dotCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  dotPill: {
    width: 18,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
});
