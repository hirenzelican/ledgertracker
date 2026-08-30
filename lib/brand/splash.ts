/**
 * The launch screen's animation.
 *
 * Four styles are implemented; one is active. Switching is a single word here, and the
 * keyframes live in globals.css next to the rest of the animation definitions.
 *
 * The splash exists because the app has nothing to show until Supabase confirms who you
 * are and hands back your transactions. Without it the first thing you see is an empty
 * dashboard reading ₹0, which is a lie for the half-second before the real number
 * arrives - worse than showing nothing at all.
 */

export const SPLASH_VARIANTS = ['pulse', 'rise', 'ripple', 'shimmer'] as const;
export type SplashVariant = (typeof SPLASH_VARIANTS)[number];

export const SPLASH_VARIANT_NOTES: Record<SplashVariant, string> = {
  pulse: 'The mark breathes - zooms gently in and out, continuously.',
  rise: 'The mark rises into place with a settle, then breathes.',
  ripple: 'Rings spread outward from the mark, like a coin dropped in water.',
  shimmer: 'A light sweeps across the bag, the way metal catches the sun.',
};

/** The style in use. Change this one word to switch. */
export const ACTIVE_SPLASH_VARIANT: SplashVariant = 'shimmer';

/**
 * How long the splash stays even when everything is already loaded. Below roughly this,
 * a splash reads as a flash of colour rather than a moment of branding; much above it and
 * it is just delay.
 */
export const SPLASH_MINIMUM_MS = 900;

/** Never hold the app hostage to a slow network: show what we have after this. */
export const SPLASH_MAXIMUM_MS = 4000;
