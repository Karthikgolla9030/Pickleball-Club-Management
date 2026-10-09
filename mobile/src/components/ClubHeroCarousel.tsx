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
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react-native';

import { AppText } from './AppText';

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

export const HERO_SLIDES: HeroBannerSlide[] = [
  {
    id: 'court-booking',
    tag: 'AUGHT2 PICKLEBALL',
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

export function ClubHeroCarousel() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState<number>(Math.max(windowWidth - 32, 280));
  const [activeSlide, setActiveSlide] = useState<number>(0);

  const scrollRef = useRef<ScrollView>(null);
  const isInteractingRef = useRef<boolean>(false);
  const pauseCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep scroll position aligned on container width changes
  useEffect(() => {
    if (cardWidth > 0 && activeSlide > 0) {
      scrollRef.current?.scrollTo({
        x: activeSlide * cardWidth,
        animated: false,
      });
    }
  }, [cardWidth]);

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

  // Auto-play timer: rotate every 5s if user is not actively interacting
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isInteractingRef.current && cardWidth > 0) {
        setActiveSlide((prev) => {
          const next = (prev + 1) % HERO_SLIDES.length;
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
  }, [cardWidth]);

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
    if (activeSlide < HERO_SLIDES.length - 1) {
      scrollToSlide(activeSlide + 1);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    pauseAutoPlayTemporarily();
    const offsetX = event.nativeEvent.contentOffset.x;
    if (cardWidth > 0) {
      const nextIndex = Math.round(offsetX / cardWidth);
      if (nextIndex >= 0 && nextIndex < HERO_SLIDES.length && nextIndex !== activeSlide) {
        setActiveSlide(nextIndex);
      }
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (cardWidth > 0) {
      const nextIndex = Math.round(offsetX / cardWidth);
      if (nextIndex >= 0 && nextIndex < HERO_SLIDES.length) {
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
        {HERO_SLIDES.map((slide) => (
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
      <View style={styles.floatingDotsContainer} pointerEvents="box-none">
        {HERO_SLIDES.map((_, dotIndex) => {
          const isActive = activeSlide === dotIndex;
          return (
            <TouchableOpacity
              key={dotIndex}
              onPress={() => scrollToSlide(dotIndex)}
              activeOpacity={0.75}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityLabel={`Go to banner ${dotIndex + 1} of ${HERO_SLIDES.length}`}
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

      {/* ── Optional Navigation Chevrons ── */}
      {activeSlide > 0 && (
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

      {activeSlide < HERO_SLIDES.length - 1 && (
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
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  heroSupportingText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 16,
    fontWeight: '400',
    marginTop: 2,
  },
  heroCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  heroCtaText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#102F2B',
  },
  heroFooterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  footerDotsSpacer: {
    width: 70,
    height: 16,
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
  },
  scriptLine: {
    fontSize: 10.5,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.88)',
    lineHeight: 13,
    fontWeight: '500',
  },

  // ── Floating Pagination Dots ──
  floatingDotsContainer: {
    position: 'absolute',
    bottom: 16,
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
    width: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },

  // ── Navigation Arrows ──
  arrowButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(16, 47, 43, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowButtonLeft: {
    left: 10,
  },
  arrowButtonRight: {
    right: 10,
  },
});
