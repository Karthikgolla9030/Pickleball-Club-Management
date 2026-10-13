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
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react-native';

import { AppText } from './AppText';
import { useActiveClub, useClubBranding, useClubCarouselSlides } from '@/hooks';
import { resolveMediaUrl } from '@/utils';

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
  const effectiveClubId = propClubId ?? activeClubId;
  const effectiveClubName = fallbackClubName ?? activeClubName;

  const { slides: dbSlides } = useClubCarouselSlides(effectiveClubId, true);
  const { branding } = useClubBranding(effectiveClubId);

  const { width: windowWidth } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState<number>(Math.max(windowWidth - 32, 280));
  const [activeSlide, setActiveSlide] = useState<number>(0);

  const scrollRef = useRef<ScrollView>(null);
  const isInteractingRef = useRef<boolean>(false);
  const pauseCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute active slides following 3-tier hierarchy:
  // 1. Club's configured custom carousel slides
  // 2. Club's cover banner image (if configured)
  // 3. Neutral product fallback slides
  const slides = useMemo<HeroBannerSlide[]>(() => {
    if (dbSlides && dbSlides.length > 0) {
      return dbSlides.map((s, idx) => ({
        id: s.id,
        tag: s.tag || 'PICKLEBALL',
        title: s.title || 'Play Together\nGrow Stronger',
        supportingText: s.subtitle || 'Great courts. Active members.',
        ctaText: s.cta_text || 'Book a Court',
        route: s.cta_route || '/(club)/bookings',
        scriptLines: idx === 0 ? ['Same', 'Game', 'Bigger', 'Community'] : ['Play', 'Grow', 'Excel'],
        image: { uri: resolveMediaUrl(s.image_url) },
      }));
    }

    const coverUrl = branding?.cover_image_url ?? fallbackCoverUrl;
    if (coverUrl) {
      return [
        {
          id: 'club-cover-slide',
          tag: 'WELCOME TO',
          title: effectiveClubName || 'Pickleball Club',
          supportingText: 'Great courts. Active members.\nA healthier, happier community.',
          ctaText: 'Book a Court',
          route: '/(club)/bookings',
          scriptLines: ['Play', 'Grow', 'Excel', 'Together'],
          image: { uri: resolveMediaUrl(coverUrl) },
        },
      ];
    }

    return DEFAULT_HERO_SLIDES;
  }, [dbSlides, branding, fallbackCoverUrl, effectiveClubName]);

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

  const handlePrev = () => {
    if (activeSlide > 0) {
      scrollToSlide(activeSlide - 1);
    }
  };

  const handleNext = () => {
    if (activeSlide < slides.length - 1) {
      scrollToSlide(activeSlide + 1);
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
                {/* Top content */}
                <View style={styles.heroContentBlock}>
                  <AppText style={styles.heroTagText}>{slide.tag}</AppText>
                  <AppText style={styles.heroHeading}>{slide.title}</AppText>
                  <AppText style={styles.heroSupportingText}>{slide.supportingText}</AppText>

                  <TouchableOpacity
                    style={styles.heroCtaButton}
                    onPress={() => router.push(slide.route as any)}
                    activeOpacity={0.88}
                    accessibilityLabel={slide.ctaText}
                    accessibilityRole="button"
                  >
                    <AppText style={styles.heroCtaText}>{slide.ctaText}</AppText>
                    <ArrowRight size={13} color="#102F2B" strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>

                {/* Bottom footer row */}
                <View style={styles.heroFooterRow}>
                  {/* Spacer for bottom-left pagination dots */}
                  <View style={styles.footerDotsSpacer} />

                  {/* Script Motto */}
                  <View style={styles.heroScriptMotto}>
                    {slide.scriptLines.map((line, lIdx) => (
                      <AppText key={lIdx} style={styles.scriptLine}>
                        {line}
                      </AppText>
                    ))}
                  </View>
                </View>
              </View>
            </ImageBackground>
          </View>
        ))}
      </ScrollView>

      {/* ── Fixed Interactive Pagination Dots (Bottom-Left) ── */}
      {slides.length > 1 && (
        <View style={styles.floatingDotsContainer} pointerEvents="box-none">
          {slides.map((_, dotIndex) => {
            const isActive = activeSlide === dotIndex;
            return (
              <TouchableOpacity
                key={dotIndex}
                onPress={() => scrollToSlide(dotIndex)}
                activeOpacity={0.75}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
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

      {/* ── Optional Navigation Chevrons ── */}
      {slides.length > 1 && activeSlide > 0 && (
        <TouchableOpacity
          style={[styles.arrowButton, styles.arrowButtonLeft]}
          onPress={handlePrev}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Previous banner"
          accessibilityRole="button"
        >
          <ChevronLeft size={16} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
      )}

      {slides.length > 1 && activeSlide < slides.length - 1 && (
        <TouchableOpacity
          style={[styles.arrowButton, styles.arrowButtonRight]}
          onPress={handleNext}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Next banner"
          accessibilityRole="button"
        >
          <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
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
    minHeight: 205,
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
    backgroundColor: 'rgba(16, 47, 43, 0.44)',
    borderRadius: 20,
  },
  heroInner: {
    padding: 16,
    justifyContent: 'space-between',
    flex: 1,
    minHeight: 205,
  },
  heroContentBlock: {
    gap: 6,
    alignItems: 'flex-start',
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
    maxWidth: 240,
    marginTop: 1,
  },
  heroCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 7.5,
    paddingHorizontal: 15,
    borderRadius: 999,
    marginTop: 6,
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
  heroFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  footerDotsSpacer: {
    width: 60,
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
    gap: -2,
  },
  scriptLine: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  floatingDotsContainer: {
    position: 'absolute',
    bottom: 14,
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
  arrowButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(16, 47, 43, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
  },
  arrowButtonLeft: {
    left: 8,
  },
  arrowButtonRight: {
    right: 8,
  },
});
