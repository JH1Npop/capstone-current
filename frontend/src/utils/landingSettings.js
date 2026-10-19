// Public landing-page content. Text values are edited in Admin > Landing Page; list values
// (highlights, testimonials, FAQs) render only when they have entries, so nothing unverified is
// shown publicly until the business enters it.
export const DEFAULT_LANDING_CONTENT = {
  eyebrow: 'Based in Pagbilao, Quezon',
  headline: 'Solar, aircon, CCTV, and fire safety',
  highlight: 'done right, from inspection to turnover.',
  description: 'AFN Solar Power Engineering Services installs and services solar, air-conditioning, refrigeration, CCTV, and fire detection systems for homes and businesses in Quezon Province.',
  primaryCtaLabel: 'Get a free solar estimate',
  secondaryCtaLabel: 'Book a site inspection',
  solarTitle: 'Solar Power Systems',
  solarDescription: 'Grid-tie and hybrid solar installations sized from your actual electricity use.',
  cctvTitle: 'CCTV Systems',
  cctvDescription: 'Camera and recording setups that keep your home or business in view.',
  airconTitle: 'Air-conditioning',
  airconDescription: 'Installation, cleaning, and repair of residential and commercial aircon units.',
  refrigerationTitle: 'Refrigeration',
  refrigerationDescription: 'Installation and servicing of refrigeration units for homes and businesses.',
  fireTitle: 'Fire Detection & Alarm',
  fireDescription: 'Fire detection and alarm system installation for safer buildings.',
  suppliesTitle: 'Supplies',
  suppliesDescription: 'Solar, electrical, cooling, and security equipment and parts.',
  trainingTitle: 'Training Services',
  trainingDescription: 'Hands-on technical training on the systems we install.',
  whyTitle: 'Why homeowners and businesses choose AFN',
  whySubtitle: 'A local team with a clear process, from the first visit to after-sales.',
  footerTitle: 'Ready to plan your project?',
  footerDescription: 'Get a free estimate online, or call us to talk to our team.',
  contactPhone: '0917 146 0224',
  contactPhoneAlt: '0938 241 1075',
  contactLandline: '(042) 911 1107',
  contactEmail: 'afnsunenergyserv@gmail.com',
  contactAddress: 'Brgy. Bigo, Pagbilao, Quezon 4302',
  facebookUrl: 'https://www.facebook.com/people/AFN-Solar-Power-Engineering-Services/100088800159579/',
  businessHours: '',
  // AFN's Google Maps listing (Brgy. Bigo, Pagbilao); the link opens the listing for directions.
  mapLatitude: '13.9908957',
  mapLongitude: '121.6553907',
  mapUrl: 'https://maps.app.goo.gl/5kZAKifwoJzRFkEg8',
  highlights: [],
  testimonials: [],
  faqs: [
    {
      question: 'How accurate is the online solar estimate?',
      answer: 'It is a free preliminary estimate. Our team confirms the final design, panel count, and price after a site inspection.',
    },
    {
      question: 'How do I book a service?',
      answer: 'Create a free account, choose your services, pin your location, and pick a preferred date. Our office reviews the request and confirms the schedule.',
    },
    {
      question: 'Do I pay before the work starts?',
      answer: 'Some services need a deposit before installation. The amount is shown on your quotation, and work only proceeds after you accept it.',
    },
    {
      question: 'Can I follow the progress of my job?',
      answer: 'Yes. Your client portal shows each step, your assigned technician, schedules, documents, and photos of the finished work.',
    },
    {
      question: 'Where are you located?',
      answer: 'We are based in Brgy. Bigo, Pagbilao, Quezon. Call or message us to confirm coverage for your area.',
    },
  ],
};

// Fields that must never be published blank. Contact details, hours, and lists are optional.
export const REQUIRED_LANDING_CONTENT_KEYS = [
  'eyebrow', 'headline', 'highlight', 'description', 'primaryCtaLabel', 'secondaryCtaLabel',
  'solarTitle', 'solarDescription', 'cctvTitle', 'cctvDescription', 'airconTitle', 'airconDescription',
  'refrigerationTitle', 'refrigerationDescription', 'fireTitle', 'fireDescription',
  'suppliesTitle', 'suppliesDescription', 'trainingTitle', 'trainingDescription',
  'whyTitle', 'whySubtitle', 'footerTitle', 'footerDescription',
];

export const LANDING_LIST_KEYS = ['highlights', 'testimonials', 'faqs'];

// Earlier releases saved these defaults into the database. A value that still matches its old default
// was never customised, so it is upgraded; anything an admin edited is kept as written.
const LEGACY_DEFAULTS = {
  eyebrow: 'Your Partner In',
  headline: 'Solar, CCTV & Aircon',
  highlight: 'Smart Solutions.',
  description: 'We provide reliable, high-quality, and energy-efficient solutions for your home and business.',
  primaryCtaLabel: 'Get Started',
  secondaryCtaLabel: 'Our Services',
  solarTitle: 'Solar Solutions',
  solarDescription: 'High-quality solar systems for homes and businesses.',
  cctvDescription: 'Advanced surveillance solutions for security.',
  airconTitle: 'Aircon Solutions',
  airconDescription: 'Energy-efficient cooling systems for comfort.',
  whyTitle: 'Why Choose Us',
  whySubtitle: 'Quality You Can Trust, Service You Can Rely On',
  footerTitle: 'Ready to Upgrade Your Home or Business?',
  footerDescription: 'Get a free consultation and discover the best solution.',
};

const mergeContent = (stored = {}) => {
  const merged = { ...DEFAULT_LANDING_CONTENT };
  Object.entries(stored || {}).forEach(([key, value]) => {
    if (LEGACY_DEFAULTS[key] !== undefined && value === LEGACY_DEFAULTS[key]) return;
    if (LANDING_LIST_KEYS.includes(key)) {
      if (Array.isArray(value)) merged[key] = value;
      return;
    }
    merged[key] = value;
  });
  return merged;
};

export const DEFAULT_SOLAR_CALCULATOR_SETTINGS = {
  enabled: true,
  title: 'Estimate Your Solar System',
  description: 'Get a preliminary panel and savings estimate based on your monthly electricity use.',
  // Same defaults as backend/users/models.py; about 3.6 kWh per kW of panels per day for Quezon.
  defaultPeakSunHours: 4.5,
  defaultPerformanceRatio: 0.8,
  defaultPanelWattage: 550,
  defaultElectricityRate: 12,
  defaultDesiredOffset: 100,
  defaultDaytimeUsage: 40,
  defaultExportCredit: 5.5,
};

export const mergeLandingSettings = (payload = {}) => ({
  companyName: payload.companyName || 'AFN Solar Power Engineering Services',
  landingPageContent: mergeContent(payload.landingPageContent),
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

// Turn "0917 146 0224" or "(042) 911 1107" into a dialable tel: link target.
export const toTelHref = (value) => {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
};
