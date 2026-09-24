export const DEFAULT_LANDING_CONTENT = {
  eyebrow: 'Your Partner In',
  headline: 'Solar, CCTV & Aircon',
  highlight: 'Smart Solutions.',
  description: 'We provide reliable, high-quality, and energy-efficient solutions for your home and business.',
  primaryCtaLabel: 'Get Started',
  secondaryCtaLabel: 'Our Services',
  solarTitle: 'Solar Solutions',
  solarDescription: 'High-quality solar systems for homes and businesses.',
  cctvTitle: 'CCTV Systems',
  cctvDescription: 'Advanced surveillance solutions for security.',
  airconTitle: 'Aircon Solutions',
  airconDescription: 'Energy-efficient cooling systems for comfort.',
  whyTitle: 'Why Choose Us',
  whySubtitle: 'Quality You Can Trust, Service You Can Rely On',
  footerTitle: 'Ready to Upgrade Your Home or Business?',
  footerDescription: 'Get a free consultation and discover the best solution.',
};

export const DEFAULT_SOLAR_CALCULATOR_SETTINGS = {
  enabled: true,
  title: 'Estimate Your Solar System',
  description: 'Get a preliminary panel and savings estimate based on your monthly electricity use.',
  defaultPeakSunHours: 5,
  defaultPerformanceRatio: 0.8,
  defaultPanelWattage: 550,
  defaultElectricityRate: 12,
  defaultDesiredOffset: 100,
};

export const mergeLandingSettings = (payload = {}) => ({
  companyName: payload.companyName || 'AFN Solar Power Engineering Services',
  landingPageContent: {
    ...DEFAULT_LANDING_CONTENT,
    ...(payload.landingPageContent || {}),
  },
  solarCalculatorSettings: {
    ...DEFAULT_SOLAR_CALCULATOR_SETTINGS,
    ...(payload.solarCalculatorSettings || {}),
  },
  landingPagePromotions: Array.isArray(payload.landingPagePromotions)
    ? payload.landingPagePromotions
    : [],
  landingPageProjects: Array.isArray(payload.landingPageProjects)
    ? payload.landingPageProjects
    : [],
});
