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

  return (
    <View style={[styles.container, style]}>
      {/* ─── Background Photo ─── */}
      <Image
        source={imageSource}
        style={styles.bannerImage}
        resizeMode="cover"
        accessibilityLabel={`${currentSlide.tag} banner photo`}
      />

      {/* ─── Dark Forest Green Layer: Directional Gradient / Left Shade ─── */}
      <View
        style={[
          styles.gradientOverlay,
          Platform.OS === 'web'
            ? ({
                backgroundImage:
                  'linear-gradient(90deg, rgba(5, 34, 27, 0.94) 0%, rgba(6, 42, 33, 0.88) 36%, rgba(6, 42, 33, 0.5) 60%, rgba(6, 42, 33, 0.1) 82%, rgba(6, 42, 33, 0.0) 100%)',
                width: '100%',
                backgroundColor: 'transparent',
              } as any)
            : { width: '75%' },  // fixed overlay width — consistent on all mobile screens
        ]}
      />

      {/* ─── Content Layer ─── */}
      <View style={styles.contentLayer}>
        <View style={styles.topTextBlock}>
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
          <AppText
            style={styles.descriptionText}
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
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#062B23',
    height: 215, // Proportionate ~200-225px target
    position: 'relative',
    marginBottom: 18, // Gap between banner and tabs: 16-20px
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
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
  contentLayer: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 108,  // fixed right padding — consistent on all mobile screens (320px–430px)
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topTextBlock: {
    gap: 3,
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
    maxWidth: 250,
  },
  bottomBlock: {
    gap: 10,
    alignItems: 'flex-start',
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
