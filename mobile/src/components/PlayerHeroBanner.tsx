/**
 * Aught2 Pickleball — PlayerHeroBanner
 *
 * Premium photographic hero banner for Player Events & Lessons pages.
 * Replicates the exact visual design from the reference mockup:
 *   - Dark forest green photographic treatment (#062B23)
 *   - Left-aligned high-contrast white & mint typography
 *   - Eyebrow tag in soft mint (#A7F3D0)
 *   - Compact 2-line heading with tight letter spacing
 *   - Supporting subtext
 *   - Pill CTA button (white background, deep forest green text & arrow)
 *   - Interactive carousel indicator dots for multi-slide browsing
 *   - Responsive 240-270px height matching mobile viewport guidelines
 *   - Clear visual boundary against light mint page background
 */

import React, { useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { ArrowRight } from 'lucide-react-native';

import { AppText } from './AppText';

export interface BannerSlide {
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  onCtaPress?: () => void;
}

interface PlayerHeroBannerProps {
  slides: BannerSlide[];
  imageSource: any;
  onCtaPress?: () => void;
  style?: any;
}

export function PlayerHeroBanner({
  slides,
  imageSource,
  onCtaPress,
  style,
}: PlayerHeroBannerProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();

  if (!slides || slides.length === 0) return null;

  const currentSlide = slides[activeSlideIndex] || slides[0];

  const handleCta = () => {
    if (currentSlide.onCtaPress) {
      currentSlide.onCtaPress();
    } else if (onCtaPress) {
      onCtaPress();
    }
  };

  const handleNextSlide = () => {
    setActiveSlideIndex((prev) => (prev + 1) % slides.length);
  };

  const isNarrowScreen = windowWidth < 380;
  const isTabletOrDesktop = windowWidth >= 768;

  return (
    <View style={[styles.container, style]}>
      {/* ─── Background Photo ─── */}
      <Image
        source={imageSource}
        style={styles.bannerImage}
        resizeMode="cover"
        accessibilityLabel={`${currentSlide.tag} banner photo`}
      />

      {/* ─── Dark Forest Green Layer 1: Ambient Tint ─── */}
      <View style={styles.ambientOverlay} />

      {/* ─── Dark Forest Green Layer 2: Directional Gradient / Left Shade ─── */}
      <View
        style={[
          styles.gradientOverlay,
          Platform.OS === 'web'
            ? ({
                backgroundImage:
                  'linear-gradient(90deg, #052820 0%, #062D24 45%, rgba(6, 45, 36, 0.85) 65%, rgba(6, 45, 36, 0.2) 95%, rgba(6, 45, 36, 0.05) 100%)',
                width: '100%',
              } as any)
            : { width: isNarrowScreen ? '85%' : '72%' },
        ]}
      />

      {/* ─── Content Layer ─── */}
      <View
        style={[
          styles.contentLayer,
          {
            paddingRight: isTabletOrDesktop ? 220 : isNarrowScreen ? 100 : 125,
          },
        ]}
      >
        <View style={styles.topTextBlock}>
          {/* Eyebrow Label */}
          <AppText style={styles.eyebrowText}>{currentSlide.tag}</AppText>

          {/* Main Heading (Max 2 lines, compact) */}
          <AppText
            style={[
              styles.headingText,
              isNarrowScreen && { fontSize: 19, lineHeight: 24 },
            ]}
            numberOfLines={2}
          >
            {currentSlide.title}
          </AppText>

          {/* Supporting Text */}
          <AppText
            style={[
              styles.descriptionText,
              isNarrowScreen && { fontSize: 12, lineHeight: 16 },
            ]}
            numberOfLines={2}
          >
            {currentSlide.description}
          </AppText>
        </View>

        {/* Bottom Area: CTA Button + Carousel Dots */}
        <View style={styles.bottomBlock}>
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

          {/* Carousel Dots */}
          {slides.length > 1 && (
            <View style={styles.dotsRow}>
              {slides.map((_, index) => {
                const isActive = index === activeSlideIndex;
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setActiveSlideIndex(index)}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#062B23', // Deep forest green
    height: 255, // Proportionate 240-270px on mobile
    position: 'relative',
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  bannerImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  ambientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 38, 30, 0.38)',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#062B23',
    opacity: 0.92,
  },
  contentLayer: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 16,
    paddingLeft: 20,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topTextBlock: {
    gap: 4,
  },
  eyebrowText: {
    color: '#A7F3D0', // Mint/light green
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headingText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  descriptionText: {
    color: '#E2ECE7',
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  bottomBlock: {
    gap: 12,
    alignItems: 'flex-start',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  ctaText: {
    color: '#072C24',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ctaArrow: {
    marginLeft: 6,
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
