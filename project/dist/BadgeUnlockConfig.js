// Seconds, CSS pixels and viewport fractions. All animation tuning lives here.
export const BADGE_UNLOCK_CONFIG = {
  theme: 'silver', // silver | gold | blue | black; shared effect tint, near cold white by default.
  opening: { videoSrc: './assets/intro-loop.mp4', cropScale: 1.15, preloadTimeoutMs: 12000 },
  labels: { collapse: 0, point: .12, warp: .28, star: .72, flash: 1.05, reveal: 1.16, settle: 1.48, lift: 1.70, ui: 1.98, ready: 2.48, end: 2.65 },
  duration: { charge: .035, collapse: .125, pointIn: .065, pointOut: .17, warpIn: .18, warpTravel: .54, warpOut: .28, starGrow: .36, flashIn: .07, flashHold: .04, flashOut: .14, reveal: .32, settle: .34, lift: .38, panel: .30, title: .32, text: .26, stagger: .05, buttons: .30, hideTrigger: .08, crystalFade: .04, starIn: .10, sheen: .26, restoreBloom: .24 },
  offsets: { warpOutAfterStar: .10, title: .04, details: .14, buttons: .24 },
  crystal: { minPx: 160, vw: .22, maxPx: 280, breathPeriod: 1.6, hoverPeriod: 1.22, minScale: .98, maxScale: 1.03, floatPx: 3, turnSpeed: .055, spreadHover: .94, ior: 1.46, transmission: .94, dispersion: .7, iridescence: .8 },
  particles: { desktop: 420, mobile: 180, mobileBreakpoint: 700, speedStart: .4, speedEnd: 4.8 },
  bloom: { idle: .18, breath: .10, collapse: .65, warp: .80, star: .95, reveal: .48, threshold: 1.3, radius: .25, mobileResolution: .5, desktopResolution: .75 },
  camera: { fovBoost: 6, push: .22 },
  badge: { birthScale: .2, peakScale: 1.06, revealPx: 250, finalVh: .1768, finalMinPx: 92, finalMaxPx: 190, mobileMaxVw: .40, finalAboveCenterVh: .25, landscapeAboveCenterVh: .25, rotationY: 22, rotationZ: -3, arcVw: .018, floatPx: 1.2, turnSpeed: .07 },
  star: { startPx: 12, endViewport: 2.8 },
  reduced: { fade: .12, reveal: .30, revealAt: .08, uiFade: .22, ui: .32, ready: .55, end: .65 },
  performance: { desktopDpr: 2, mobileDpr: 1.5, idleFps: 40, revealedFps: 30 },
};

export function screenLayout(width, height, config = BADGE_UNLOCK_CONFIG) {
  const mobile = Math.min(width, height) < config.particles.mobileBreakpoint;
  const landscape = width > height && height < 650;
  return {
    mobile, landscape,
    crystalPx: Math.min(config.crystal.maxPx, Math.max(config.crystal.minPx, width * config.crystal.vw)),
    badgePx: Math.min(config.badge.finalMaxPx, Math.max(config.badge.finalMinPx, height * config.badge.finalVh), width * config.badge.mobileMaxVw),
    aboveCenter: landscape ? config.badge.landscapeAboveCenterVh : config.badge.finalAboveCenterVh,
    particleCount: mobile ? config.particles.mobile : config.particles.desktop,
  };
}
