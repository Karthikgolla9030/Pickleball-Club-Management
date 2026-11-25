/**
 * Aught2 Pickleball — PlayerHeroBanner
 *
 * Premium photographic hero banner and multi-slide carousel.
 * Used as the single source of truth for:
 *   1. Events & Lessons pages
 *   2. Player Side Home page (Slide 1: Welcome Banner; Slides 2+: Universal Promotional Ads)
 *   3. Club Side Home page (Slide 1: Club Welcome Banner; Slides 2+: Club Promotional Ads)
 *
 * Replicates the exact visual design from the approved reference:
 *   - Dark forest green photographic treatment (#062B23)
 *   - Left-aligned high-contrast white & mint typography
 *   - Eyebrow tag in soft mint (#A7F3D0, 10.5px bold uppercase)
 *   - Compact 2-line heading with tight letter spacing (19-21px bold)
 *   - Supporting subtext (#E2ECE7, 12px)
 *   - Pill CTA button (white background, deep forest green text & arrow)
 *   - Interactive carousel indicator dots (Active pill: 16x5.5; Inactive circle: 5.5x5.5)
 *   - When slides.length <= 1: pagination dots and auto-play are hidden
 *   - 5-second automatic sliding with touch gestures, interaction pause, and visibility pause
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowRight, MapPin } from 'lucide-react-native';

import { AppText } from './AppText';
import { resolveMediaUrl } from '@/utils';

export interface BannerSlide {
  id?: string;
  tag: string;
  title: string;
  description?: string;
  ctaText: string;
  onCtaPress?: () => void;
  imageUrl?: string | null;
  imageSource?: any | null;
  attribution?: string | null;
  topRightBadge?: {
    text: string;
  } | null;
  rightContent?: React.ReactNode;
  isWelcomeSlide?: boolean;
}

export interface PlayerHeroBannerProps {
  slides: BannerSlide[];
  imageSource?: any | null;
  onCtaPress?: () => void;
  style?: any;
  height?: number;
  autoPlayInterval?: number;
  enableAutoPlay?: boolean;
  resetKey?: any;
}

export function PlayerHeroBanner({
  slides,
  imageSource,
  onCtaPress,
  style,
  height = 215,
  autoPlayInterval = 5000,
  enableAutoPlay = true,
  resetKey,
}: PlayerHeroBannerProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isInteracting = useRef(false);
  const isHidden = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch gesture tracking for swipe left/right
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Reset to slide 0 when slides change or resetKey changes
  useEffect(() => {
    setActiveSlideIndex(0);
  }, [resetKey, slides?.length]);

  // Keep activeSlideIndex within bounds if slides list shrinks
  useEffect(() => {
    if (activeSlideIndex >= (slides?.length || 0) && (slides?.length || 0) > 0) {
      setActiveSlideIndex(0);
    }
  }, [slides?.length, activeSlideIndex]);

  // Handle user interaction: temporarily pause auto-slide
  const handleUserInteraction = () => {
    isInteracting.current = true;
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
    }
    pauseTimerRef.current = setTimeout(() => {
      isInteracting.current = false;
    }, 6500);
  };

  // Visibility change listener (pause auto-sliding when tab/app is backgrounded)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        isHidden.current = document.hidden;
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    } else {
      const subscription = AppState.addEventListener('change', (nextState) => {
        isHidden.current = nextState !== 'active';
      });
      return () => {
        subscription.remove();
      };
    }
  }, []);

  // Slide transition animation
  const goToSlide = (newIndex: number) => {
    handleUserInteraction();
    if (newIndex === activeSlideIndex) return;

    Animated.timing(fadeAnim, {
      toValue: 0.15,
      duration: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setActiveSlideIndex(newIndex);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  };

  // Auto-play interval
  useEffect(() => {
    if (!enableAutoPlay || !slides || slides.length <= 1) return;

    const interval = setInterval(() => {
      if (isInteracting.current || isHidden.current) return;

      setActiveSlideIndex((prev) => {
        const next = (prev + 1) % slides.length;
        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 0.2,
            duration: 140,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]).start();
        return next;
      });
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [enableAutoPlay, slides?.length, autoPlayInterval, fadeAnim]);

  if (!slides || slides.length === 0) return null;

  const currentSlide = slides[activeSlideIndex] || slides[0];

  const handleCta = () => {
    handleUserInteraction();
    if (currentSlide.onCtaPress) {
      currentSlide.onCtaPress();
    } else if (onCtaPress) {
      onCtaPress();
    }
  };

  // Touch event handlers for mobile/web swipe gestures
  const handleTouchStart = (e: any) => {
    handleUserInteraction();
    const touch = e.nativeEvent.touches ? e.nativeEvent.touches[0] : e.nativeEvent;
    touchStartX.current = touch.pageX || touch.clientX;
    touchStartY.current = touch.pageY || touch.clientY;
  };

  const handleTouchEnd = (e: any) => {
    if (touchStartX.current === null) return;
    const touch = e.nativeEvent.changedTouches ? e.nativeEvent.changedTouches[0] : e.nativeEvent;
    const endX = touch.pageX || touch.clientX;
    const endY = touch.pageY || touch.clientY;
    const deltaX = endX - touchStartX.current;
    const deltaY = endY - (touchStartY.current || 0);

    // If swipe horizontal distance is > 35px and dominant over vertical
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4 && slides.length > 1) {
      if (deltaX < 0) {
        // Swiped left -> next slide
        goToSlide((activeSlideIndex + 1) % slides.length);
      } else {
        // Swiped right -> prev slide
        goToSlide((activeSlideIndex - 1 + slides.length) % slides.length);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Independent image tracking with resilient fallback for advertisement slides
  const [slideImgError, setSlideImgError] = useState(false);

  useEffect(() => {
    setSlideImgError(false);
  }, [activeSlideIndex, currentSlide?.id, currentSlide?.imageUrl]);

  // Resolve background photo for current slide with strict separation between Welcome and Ad slides
  let resolvedImageSource: any = null;
  if (currentSlide.isWelcomeSlide) {
    // Welcome slide: Uses ONLY its own explicit image or banner. NEVER an ad image or club logo fallback.
    if (currentSlide.imageSource) {
      resolvedImageSource = currentSlide.imageSource;
    } else if (currentSlide.imageUrl && !slideImgError) {
      resolvedImageSource = { uri: resolveMediaUrl(currentSlide.imageUrl) };
    }
  } else {
    // Advertisement slide: Uses its own uploaded ad image URL.
    if (currentSlide.imageUrl && !slideImgError) {
      resolvedImageSource = { uri: resolveMediaUrl(currentSlide.imageUrl) };
    } else if (currentSlide.imageSource && !slideImgError) {
      resolvedImageSource = currentSlide.imageSource;
    } else {
      // Deliberate neutral fallback for promotional ads only (never Welcome banner image or club logo)
      resolvedImageSource = {
        uri: resolveMediaUrl('/static/defaults/tournaments/card_round_robin.jpg'),
      };
    }
  }

  const webHoverProps =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () => {
            isInteracting.current = true;
          },
          onMouseLeave: () => {
            handleUserInteraction();
          },
        }
      : {};

  return (
    <View
      style={[styles.container, height ? { height } : null, style]}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...(webHoverProps as any)}
    >
      {/* ─── Background Photo ─── */}
      {resolvedImageSource ? (
        <Animated.Image
          source={resolvedImageSource}
          style={[styles.bannerImage, { opacity: fadeAnim }]}
          resizeMode="cover"
          onError={() => setSlideImgError(true)}
          accessibilityLabel={`${currentSlide.tag} banner photo`}
        />
      ) : null}

      {/* ─── Dark Forest Green Layer: Directional Gradient / Left Shade ─── */}
      <View
        style={[
          styles.gradientOverlay,
          Platform.OS === 'web'
            ? ({
                backgroundImage:
                  'linear-gradient(90deg, rgba(5, 34, 27, 0.95) 0%, rgba(6, 42, 33, 0.90) 38%, rgba(6, 42, 33, 0.55) 62%, rgba(6, 42, 33, 0.15) 84%, rgba(6, 42, 33, 0.0) 100%)',
                width: '100%',
                backgroundColor: 'transparent',
              } as any)
            : { width: '80%' },
        ]}
      />

      {/* ─── Top Right Badge (Club affiliation or location) ─── */}
      {currentSlide.topRightBadge?.text ? (
        <View style={styles.topRightBadge}>
          <MapPin size={11} color="#062B23" strokeWidth={2.4} />
          <AppText style={styles.topRightBadgeText} numberOfLines={1}>
            {currentSlide.topRightBadge.text}
          </AppText>
        </View>
      ) : null}

      {/* ─── Content Layer ─── */}
      <Animated.View style={[styles.contentLayer, { opacity: fadeAnim }]}>
        <View
          style={[
            styles.topTextBlock,
            !currentSlide.topRightBadge && styles.topTextBlockFullWidth,
          ]}
        >
          {/* Eyebrow Label */}
          <AppText style={styles.eyebrowText}>{currentSlide.tag}</AppText>

          {/* Main Heading (Max 2 lines, compact) */}
          <AppText
            style={styles.headingText}
            numberOfLines={2}
          >
            {currentSlide.title}
          </AppText>

          {/* Supporting Text */}
          {currentSlide.description ? (
            <AppText
              style={[
                styles.descriptionText,
                !currentSlide.topRightBadge && styles.descriptionTextFullWidth,
              ]}
              numberOfLines={2}
            >
              {currentSlide.description}
            </AppText>
          ) : null}
        </View>

        {/* Bottom Area: CTA Button + Carousel Dots + Optional Right Content */}
        <View style={styles.bottomBlock}>
          <View style={styles.ctaRow}>
            {/* White Pill CTA Button */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleCta}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={currentSlide.ctaText}
            >
              <AppText style={styles.ctaText}>
                {currentSlide.ctaText.replace(' →', '')}
              </AppText>
              <ArrowRight
                size={14}
                color="#072C24"
                strokeWidth={2.4}
                style={styles.ctaArrow}
              />
            </TouchableOpacity>

            {/* Right-aligned decorative content (e.g. club motto script lines) */}
            {currentSlide.rightContent ? (
              <View style={styles.rightContentSlot}>
                {currentSlide.rightContent}
              </View>
            ) : null}
          </View>

          {/* Carousel Dots: Rendered ONLY when multiple slides exist */}
          {slides.length > 1 && (
            <View style={styles.dotsRow}>
              {slides.map((_, index) => {
                const isActive = index === activeSlideIndex;
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => goToSlide(index)}
                    hitSlop={8}
                    style={[
                      styles.dot,
                      isActive ? styles.dotActive : styles.dotInactive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to slide ${index + 1}`}
                  />
                );
              })}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#062B23',
    height: 215,
    position: 'relative',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  bannerImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 34, 27, 0.88)',
  },
  topRightBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    borderRadius: 999,
    zIndex: 10,
    maxWidth: 165,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  topRightBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#062B23',
  },
  contentLayer: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topTextBlock: {
    gap: 3,
    maxWidth: '78%',
  },
  topTextBlockFullWidth: {
    maxWidth: '100%',
  },
  eyebrowText: {
    color: '#A7F3D0', // Mint/light green
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headingText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  descriptionText: {
    color: '#E2ECE7',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    maxWidth: 260,
  },
  descriptionTextFullWidth: {
    maxWidth: 440,
  },
  bottomBlock: {
    gap: 10,
    alignItems: 'flex-start',
    width: '100%',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  ctaText: {
    color: '#072C24',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ctaArrow: {
    marginLeft: 5,
  },
  rightContentSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  dot: {
    height: 5.5,
    borderRadius: 3,
  },
  dotActive: {
    width: 16,
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    width: 5.5,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
});
