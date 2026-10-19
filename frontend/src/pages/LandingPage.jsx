import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BadgeCheck, CalendarDays, Camera, ChevronDown, ClipboardCheck, Clock, FileText, Flame,
  GraduationCap, Hammer, Mail, MapPin, MessageCircle, Navigation, Package, Phone, Quote, Search,
  ShieldCheck, Smartphone, Snowflake, Sun, Users, Wind,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LandingNavbar from '../components/LandingNavbar';
import Footer from '../components/LandingFooter';
import SolarCalculator from '../components/SolarCalculator';
import { fetchPublicLandingSettings } from '../api/site';
import { mergeLandingSettings, toTelHref } from '../utils/landingSettings';
import { useCountUp, useLandingReveal } from '../hooks/useLandingReveal';
import { estimateSolarSavings } from '../utils/solarSavings';

const LandingLocationMap = lazy(() => import('../components/LandingLocationMap'));

const SERVICES = [
  { key: 'solar', icon: Sun, accent: 'from-amber-400 to-orange-500' },
  { key: 'aircon', icon: Wind, accent: 'from-sky-400 to-brand-600' },
  { key: 'refrigeration', icon: Snowflake, accent: 'from-cyan-400 to-sky-600' },
  { key: 'cctv', icon: Camera, accent: 'from-slate-500 to-slate-800' },
  { key: 'fire', icon: Flame, accent: 'from-rose-400 to-red-600' },
  { key: 'supplies', icon: Package, accent: 'from-emerald-400 to-teal-600' },
  { key: 'training', icon: GraduationCap, accent: 'from-violet-400 to-indigo-600' },
];

// Mirrors the real workflow in the portal: request, inspection, quotation, installation, turnover.
const STEPS = [
  { icon: ClipboardCheck, title: 'Request online', text: 'Pick your services, pin your location, and choose a preferred date.' },
  { icon: Search, title: 'Site inspection', text: 'A technician checks the site before anything is quoted.' },
  { icon: FileText, title: 'Clear quotation', text: 'Review and accept your quotation in your client portal.' },
  { icon: Hammer, title: 'Installation', text: 'Our team installs and tests the work, with photos as proof.' },
  { icon: BadgeCheck, title: 'Turnover & support', text: 'Formal handover, warranty records, and maintenance reminders.' },
];

const REASONS = [
  { icon: Search, title: 'Inspection before quotation', text: 'Prices are based on what we actually see on site, not guesses.' },
  { icon: Smartphone, title: 'Track every step online', text: 'Schedules, technician, documents, and proof photos in one portal.' },
  { icon: ShieldCheck, title: 'Documented handover', text: 'Turnover forms, warranty details, and service history you can keep.' },
  { icon: Users, title: 'Local Quezon team', text: 'Based in Pagbilao and reachable by phone, email, or Facebook.' },
];

export default function LandingPage() {
  const location = useLocation();
  const pageRef = useRef(null);
  const [siteSettings, setSiteSettings] = useState(() => mergeLandingSettings());
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [presetUsage, setPresetUsage] = useState(null);

  useEffect(() => {
    let active = true;
    fetchPublicLandingSettings()
      .then((data) => {
        if (active) setSiteSettings(mergeLandingSettings(data));
      })
      .catch(() => {
        // Keep the landing page usable with bundled defaults when the API is unavailable.
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 });
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  const content = siteSettings.landingPageContent;
  const calculatorSettings = siteSettings.solarCalculatorSettings;
  const promotions = siteSettings.landingPagePromotions;
  const projects = siteSettings.landingPageProjects;
  const highlights = content.highlights || [];
  const testimonials = content.testimonials || [];
  const faqs = content.faqs || [];

  // Re-scan when optional sections appear after the settings load.
  useLandingReveal(pageRef, [highlights.length, testimonials.length, faqs.length, projects.length, promotions.length]);

  // The hero's quick check hands its monthly kWh to the full calculator and scrolls there.
  const showFullEstimate = (monthlyConsumption) => {
    setPresetUsage({ monthlyConsumption, nonce: Date.now() });
    window.requestAnimationFrame(() => document.getElementById('solar-calculator')?.scrollIntoView({ behavior: 'smooth' }));
  };

  const usePromotionInCalculator = (promotion) => {
    setSelectedPromotion(promotion);
    window.requestAnimationFrame(() => document.getElementById('solar-calculator')?.scrollIntoView({ behavior: 'smooth' }));
  };

  return (
    <div ref={pageRef} className="min-h-screen overflow-x-hidden bg-slate-50">
      <LandingNavbar companyName={siteSettings.companyName} />
      <main className="pt-[65px] sm:pt-[73px]">
        <section aria-labelledby="landing-heading" className="relative isolate overflow-hidden">
          {/* Same light gradient as the signed-in workspace (Layout.jsx), with soft drifting highlights. */}
          <div className="absolute inset-0 -z-20 bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200" aria-hidden="true" />
          <div className="landing-glow absolute -right-32 -top-40 -z-10 h-[32rem] w-[32rem] rounded-full bg-white/70 blur-3xl" aria-hidden="true" />
          <div className="landing-glow landing-glow-slow absolute -bottom-48 -left-32 -z-10 h-[30rem] w-[30rem] rounded-full bg-brand-300/30 blur-3xl" aria-hidden="true" />
          <div className="landing-dots absolute inset-0 -z-10 opacity-[0.35]" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14 lg:px-10 lg:pb-14 lg:pt-20">
            <div>
              <span className="landing-enter inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 shadow-sm" style={{ '--enter-delay': '0ms' }}>
                <MapPin className="h-3.5 w-3.5" /> {content.eyebrow}
              </span>
              <h1 id="landing-heading" className="landing-enter mt-5 text-3xl font-extrabold leading-tight text-slate-950 sm:text-5xl lg:text-6xl" style={{ '--enter-delay': '120ms' }}>
                {content.headline}
                <span className="landing-shine-text block">{content.highlight}</span>
              </h1>
              <p className="landing-enter mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg" style={{ '--enter-delay': '240ms' }}>{content.description}</p>
              <div className="landing-enter mt-8 flex flex-col gap-3 sm:flex-row" style={{ '--enter-delay': '360ms' }}>
                {calculatorSettings.enabled ? (
                  <a href="#solar-calculator" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
                    {content.primaryCtaLabel}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </a>
                ) : null}
                <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-6 py-3 text-sm font-semibold text-brand-800 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                  <CalendarDays className="h-4 w-4" />{content.secondaryCtaLabel}
                </Link>
              </div>
              {content.contactPhone ? (
                <a href={toTelHref(content.contactPhone)} className="landing-enter mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-700" style={{ '--enter-delay': '480ms' }}>
                  <Phone className="h-4 w-4 text-brand-600" /> Prefer to talk? Call {content.contactPhone}
                </a>
              ) : null}
            </div>
            {calculatorSettings.enabled ? (
              <QuickSolarCheck settings={calculatorSettings} onSeeEstimate={showFullEstimate} />
            ) : null}
          </div>
          <div className="border-t border-brand-200/70 bg-white/60 backdrop-blur">
            <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm font-medium text-slate-700 sm:px-6 lg:grid-cols-4 lg:px-10" aria-label="What you get">
              <HeroPoint icon={Sun}>Seven services, one team</HeroPoint>
              <HeroPoint icon={Search}>Inspection before quotation</HeroPoint>
              <HeroPoint icon={Smartphone}>Track your job online</HeroPoint>
              <HeroPoint icon={MapPin}>Based in Pagbilao, Quezon</HeroPoint>
            </ul>
          </div>
        </section>

        <ServiceTicker content={content} />

        <section id="services" aria-labelledby="services-heading" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-14 sm:px-6 lg:px-10">
          <div className="mb-8 max-w-2xl" data-reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">What we do</p>
            <h2 id="services-heading" className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">Seven services, one team</h2>
            <p className="mt-3 text-slate-600">From solar power to fire safety, request any of these online and our office takes it from there.</p>
          </div>
          {/* Two compact cards per row on phones keeps seven services from becoming a long scroll. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {SERVICES.map(({ key, icon: Icon, accent }, index) => (
              <article
                key={key}
                data-reveal
                style={{ '--reveal-delay': `${(index % 4) * 80}ms` }}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl sm:p-6"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md transition duration-300 group-hover:scale-110 group-hover:rotate-3 sm:h-12 sm:w-12`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <h3 className="mt-3 text-base font-semibold leading-snug text-slate-900 sm:mt-4 sm:text-lg">{content[`${key}Title`]}</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">{content[`${key}Description`]}</p>
                <div className="mt-auto pt-4 text-xs sm:pt-5 sm:text-sm">
                  {key === 'solar' && calculatorSettings.enabled ? (
                    <a href="#solar-calculator" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">Estimate my system <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                  ) : (
                    <Link to="/register" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">Request this service <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
                  )}
                </div>
              </article>
            ))}
            <article data-reveal style={{ '--reveal-delay': '240ms' }} className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-4 text-white shadow-lg sm:p-6">
              <div>
                <h3 className="text-lg font-semibold">Not sure what you need?</h3>
                <p className="mt-2 text-sm leading-6 text-brand-100">Tell us about your site and we will recommend the right setup.</p>
              </div>
              <a href="#contact" className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-800 transition hover:bg-brand-50">Talk to us <ArrowRight className="h-4 w-4" /></a>
            </article>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="steps-heading" className="scroll-mt-24 border-y border-slate-200 bg-white py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="max-w-2xl" data-reveal>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">How it works</p>
              <h2 id="steps-heading" className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">From request to turnover, step by step</h2>
            </div>
            <div className="relative mt-10" data-reveal>
              <div className="absolute left-0 right-0 top-7 hidden h-1 rounded-full bg-slate-100 lg:block" aria-hidden="true">
                <div className="landing-steps-line h-full rounded-full bg-gradient-to-r from-brand-500 to-amber-400" />
              </div>
              <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                {STEPS.map(({ icon: Icon, title, text }, index) => (
                  <li key={title} className="flex gap-4 lg:block">
                    <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-brand-600 text-white shadow-md">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="lg:mt-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Step {index + 1}</p>
                      <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {highlights.length > 0 ? (
          <section aria-label="AFN in numbers" className="border-y border-brand-200/70 bg-gradient-to-r from-brand-50 via-white to-brand-100 py-12">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4 lg:px-10">
              {highlights.map((highlight, index) => <HighlightStat key={`${highlight.label}-${index}`} highlight={highlight} />)}
            </div>
          </section>
        ) : null}

        {projects.length > 0 ? (
          <section id="our-work" aria-labelledby="our-work-heading" className="border-b border-slate-200 bg-white py-14">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end" data-reveal>
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">Our work</p>
                  <h2 id="our-work-heading" className="mt-2 text-3xl font-bold text-slate-950">Completed projects</h2>
                  <p className="mt-3 text-slate-600">A selection of real completed work published with client permission.</p>
                </div>
                <a href="#contact" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">Discuss your project <ArrowRight className="h-4 w-4" /></a>
              </div>
              <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project, index) => <ProjectCard key={project.id || project.title} project={project} delay={index * 80} />)}
              </div>
            </div>
          </section>
        ) : null}

        {testimonials.length > 0 ? (
          <section aria-labelledby="testimonials-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10">
            <div className="max-w-2xl" data-reveal>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">Client feedback</p>
              <h2 id="testimonials-heading" className="mt-2 text-3xl font-bold text-slate-950">What our clients say</h2>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <figure key={`${testimonial.name}-${index}`} data-reveal style={{ '--reveal-delay': `${(index % 3) * 80}ms` }} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <Quote className="h-7 w-7 text-amber-400" aria-hidden="true" />
                  <blockquote className="mt-3 text-sm leading-7 text-slate-700">{testimonial.quote}</blockquote>
                  <figcaption className="mt-4 text-sm font-semibold text-slate-900">
                    {testimonial.name}
                    {testimonial.location ? <span className="block text-xs font-medium text-slate-500">{testimonial.location}</span> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {promotions.length > 0 ? (
          <section id="promotions" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end" data-reveal>
              <div><p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Limited offers</p><h2 className="mt-1 text-3xl font-bold text-slate-950">Products and Promotions</h2></div>
              <p className="max-w-lg text-sm text-slate-500">Explore current offers selected by our solar and service team.</p>
            </div>
            <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[...promotions].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).map((promotion) => (
                <PromotionCard key={promotion.id || promotion.name} promotion={promotion} onUseInCalculator={usePromotionInCalculator} />
              ))}
            </div>
          </section>
        ) : null}

        {calculatorSettings.enabled ? <SolarCalculator settings={calculatorSettings} presetPanelWattage={selectedPromotion?.panelWattage} presetUsage={presetUsage} selectedPromotion={selectedPromotion} /> : null}

        <section aria-labelledby="why-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-2xl text-center" data-reveal>
            <h2 id="why-heading" className="text-3xl font-bold text-slate-950 sm:text-4xl">{content.whyTitle}</h2>
            <p className="mt-3 text-slate-600">{content.whySubtitle}</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map(({ icon: Icon, title, text }, index) => (
              <div key={title} data-reveal style={{ '--reveal-delay': `${index * 80}ms` }} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100"><Icon className="h-7 w-7 text-brand-700" /></span>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {faqs.length > 0 ? (
          <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 border-y border-slate-200 bg-white py-14">
            <div className="mx-auto max-w-3xl px-4 sm:px-6">
              <h2 id="faq-heading" className="text-center text-3xl font-bold text-slate-950" data-reveal>Frequently asked questions</h2>
              <div className="mt-8 space-y-3">
                {faqs.map((faq, index) => (
                  <details key={`${faq.question}-${index}`} data-reveal style={{ '--reveal-delay': `${index * 60}ms` }} className="group rounded-xl border border-slate-200 bg-slate-50 open:bg-white open:shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-slate-900">
                      {faq.question}
                      <ChevronDown className="h-5 w-5 shrink-0 text-brand-600 transition group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="px-5 pb-5 text-sm leading-7 text-slate-600">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <ContactSection content={content} />
      </main>
      <Footer title={content.footerTitle} description={content.footerDescription} content={content} />
    </div>
  );
}

function HeroPoint({ icon: Icon, children }) {
  return (
    <li className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />{children}
    </li>
  );
}

const toNumber = (value, fallback, allowZero = false) => {
  const parsed = Number(value);
  if (value == null || String(value).trim() === '') return fallback;
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : fallback;
};

// A one-field teaser of the full calculator, using the same formula and the published defaults.
function QuickSolarCheck({ settings, onSeeEstimate }) {
  const [bill, setBill] = useState('3000');
  const rate = toNumber(settings.defaultElectricityRate, 12);
  const sunHours = toNumber(settings.defaultPeakSunHours, 5);
  const performance = toNumber(settings.defaultPerformanceRatio, 0.8);
  const panelWattage = toNumber(settings.defaultPanelWattage, 550);
  const offset = toNumber(settings.defaultDesiredOffset, 100) / 100;
  const daytimeUsage = toNumber(settings.defaultDaytimeUsage, 40, true);
  const exportCredit = toNumber(settings.defaultExportCredit, 5.5, true);

  const monthlyBill = Math.max(0, Number(bill) || 0);
  const monthlyKwh = monthlyBill / rate;
  const requiredKw = ((monthlyKwh / 30) * offset) / (sunHours * performance);
  const panels = Math.ceil((requiredKw * 1000) / panelWattage);
  const systemKw = (panels * panelWattage) / 1000;
  const savings = estimateSolarSavings({
    monthlyConsumption: monthlyKwh,
    monthlyGeneration: systemKw * sunHours * performance * 30,
    electricityRate: rate,
    daytimeUsagePercent: daytimeUsage,
    exportCreditRate: exportCredit,
  });
  const hasEstimate = monthlyBill > 0 && panels > 0;
  const compactPeso = (value) => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  return (
    <div className="landing-enter rounded-3xl border border-brand-100 bg-white/90 p-6 text-slate-900 shadow-xl shadow-brand-900/10 backdrop-blur sm:p-7" style={{ '--enter-delay': '300ms' }}>
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-600"><Sun className="h-4 w-4 text-amber-500" /> Quick solar check</p>
      <label htmlFor="hero-monthly-bill" className="mt-4 block text-sm font-semibold text-slate-700">Your average monthly electric bill</label>
      <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-white px-4 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <span className="text-sm font-bold text-slate-500">PHP</span>
        <input
          id="hero-monthly-bill"
          type="number"
          inputMode="numeric"
          min="0"
          step="100"
          value={bill}
          onChange={(event) => setBill(event.target.value)}
          className="w-full bg-transparent px-3 py-3 text-lg font-bold text-slate-900 outline-none"
        />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-center" aria-live="polite">
        <div className="rounded-xl bg-brand-50 px-2 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Panels</dt>
          <dd className="mt-1 whitespace-nowrap text-xl font-extrabold text-brand-900 sm:text-2xl">{hasEstimate ? panels : '–'}</dd>
        </div>
        <div className="rounded-xl bg-brand-50 px-2 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">System</dt>
          <dd className="mt-1 whitespace-nowrap text-xl font-extrabold text-brand-900 sm:text-2xl">{hasEstimate ? `${systemKw.toFixed(1)} kW` : '–'}</dd>
        </div>
        <div className="rounded-xl bg-emerald-50 px-2 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Save / mo</dt>
          <dd className="mt-1 whitespace-nowrap text-sm font-extrabold text-emerald-700 sm:text-lg">{hasEstimate ? `₱${compactPeso(savings.withoutNetMetering)}–${compactPeso(savings.withNetMetering)}` : '–'}</dd>
        </div>
      </dl>
      <button
        type="button"
        disabled={!hasEstimate}
        onClick={() => onSeeEstimate(Math.round(monthlyKwh))}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        See my full estimate <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-3 text-xs leading-5 text-slate-500">Rough guide at PHP {rate}/kWh, assuming {daytimeUsage}% of your power is used in the daytime. The higher saving needs net metering; fixed charges still apply. Your final design and price come after a site inspection.</p>
    </div>
  );
}

function ServiceTicker({ content }) {
  const names = SERVICES.map(({ key }) => content[`${key}Title`]).filter(Boolean);
  // Two copies make the loop seamless; the second is hidden from assistive technology.
  return (
    <div className="landing-marquee overflow-hidden border-b border-brand-100 bg-white/70 py-3" aria-label="Services we offer">
      <div className="landing-marquee-track flex gap-10 whitespace-nowrap text-sm font-semibold uppercase tracking-[0.18em] text-brand-800">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-10" aria-hidden={copy === 1}>
            {names.map((name) => (
              <span key={`${copy}-${name}`} className="inline-flex items-center gap-10">{name}<Sun className="h-4 w-4 text-amber-400" aria-hidden="true" /></span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightStat({ highlight }) {
  const ref = useRef(null);
  const value = useCountUp(highlight.value, ref);
  return (
    <div className="text-center">
      <p ref={ref} className="text-4xl font-extrabold text-brand-700">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{highlight.label}</p>
    </div>
  );
}

function ContactSection({ content }) {
  const latitude = Number.parseFloat(content.mapLatitude);
  const longitude = Number.parseFloat(content.mapLongitude);
  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);
  const address = String(content.contactAddress || '').trim();
  const directionsQuery = address || (hasPin ? `${latitude},${longitude}` : '');
  const directionsUrl = String(content.mapUrl || '').trim()
    || (directionsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}` : '');
  const phones = [content.contactPhone, content.contactPhoneAlt, content.contactLandline].filter(Boolean);

  return (
    <section id="contact" aria-labelledby="contact-heading" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-14 sm:px-6 lg:px-10">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg" data-reveal>
        <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="p-7 sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">Contact us</p>
            <h2 id="contact-heading" className="mt-2 text-3xl font-bold text-slate-950">Visit, call, or message us</h2>
            <p className="mt-3 text-slate-600">
              {content.businessHours
                ? `Open ${content.businessHours}.`
                : 'Reach us during business hours, or send a message anytime and we will get back to you.'}
            </p>
            <ul className="mt-7 space-y-5 text-sm">
              {content.contactAddress ? (
                <ContactRow icon={MapPin} label="Address">{content.contactAddress}</ContactRow>
              ) : null}
              {phones.length > 0 ? (
                <ContactRow icon={Phone} label="Call or text">
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {phones.map((phone) => <a key={phone} href={toTelHref(phone)} className="font-semibold text-brand-700 hover:underline">{phone}</a>)}
                  </span>
                </ContactRow>
              ) : null}
              {content.contactEmail ? (
                <ContactRow icon={Mail} label="Email"><a href={`mailto:${content.contactEmail}`} className="font-semibold text-brand-700 hover:underline">{content.contactEmail}</a></ContactRow>
              ) : null}
              {content.facebookUrl ? (
                <ContactRow icon={MessageCircle} label="Facebook">
                  <a href={content.facebookUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">Send us a message on Facebook</a>
                </ContactRow>
              ) : null}
              {content.businessHours ? (
                <ContactRow icon={Clock} label="Business hours">{content.businessHours}</ContactRow>
              ) : null}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                <CalendarDays className="h-4 w-4" /> Book a site inspection
              </Link>
              {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Navigation className="h-4 w-4" /> Get directions
              </a>}
            </div>
          </div>
          <div className="relative min-h-80 bg-slate-100">
            {hasPin ? (
              <Suspense fallback={<div className="flex h-full min-h-80 items-center justify-center text-sm text-slate-500">Loading map…</div>}>
                <LandingLocationMap latitude={latitude} longitude={longitude} label="AFN Solar Power Engineering Services" />
              </Suspense>
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center p-6 text-center text-sm text-slate-500">Map location coming soon.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ icon: Icon, label, children }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50"><Icon className="h-5 w-5 text-brand-700" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="mt-0.5 text-slate-800">{children}</div>
      </div>
    </li>
  );
}

function ProjectCard({ project, delay = 0 }) {
  const serviceLabels = { solar: 'Solar', cctv: 'CCTV', aircon: 'Aircon' };
  const completedDate = new Date(`${project.completedDate}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short',
  });

  return (
    <article data-reveal style={{ '--reveal-delay': `${delay}ms` }} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <img src={project.imageUrl} alt={`${project.title} completed project`} className="h-56 w-full object-cover" loading="lazy" />
      <div className="p-5">
        <span className="inline-flex rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">{serviceLabels[project.serviceType] || project.serviceType}</span>
        <h3 className="mt-3 text-xl font-bold text-slate-950">{project.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{project.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-600" />{project.location}</span>
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-brand-600" />Completed {completedDate}</span>
        </div>
      </div>
    </article>
  );
}

function PromotionCard({ promotion, onUseInCalculator }) {
  const regularPrice = Number(promotion.regularPrice || 0);
  const promoPrice = Number(promotion.promoPrice || 0);
  const price = (value) => `PHP ${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value)}`;

  return (
    <article data-reveal className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${promotion.featured ? 'ring-2 ring-amber-400' : 'ring-slate-200'}`}>
      <div className="relative h-48 bg-gradient-to-br from-brand-100 to-slate-200">
        {promotion.imageUrl ? <img src={promotion.imageUrl} alt={promotion.name} className="h-full w-full object-cover" /> : <Sun className="absolute inset-0 m-auto h-16 w-16 text-brand-300" />}
        {promotion.featured ? <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">Featured</span> : null}
      </div>
      <div className="p-5">
        <h3 className="text-xl font-bold text-slate-950">{promotion.name}</h3>
        <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{promotion.description}</p>
        {promoPrice > 0 || regularPrice > 0 ? <div className="mt-4 flex items-baseline gap-2">{promoPrice > 0 ? <span className="text-2xl font-bold text-brand-700">{price(promoPrice)}</span> : null}{regularPrice > 0 ? <span className={promoPrice > 0 ? 'text-sm text-slate-400 line-through' : 'text-2xl font-bold text-brand-700'}>{price(regularPrice)}</span> : null}</div> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {Number(promotion.panelWattage) > 0 ? <button type="button" onClick={() => onUseInCalculator(promotion)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Use in calculator ({promotion.panelWattage} W)</button> : null}
          {promotion.ctaUrl ? <a href={promotion.ctaUrl} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{promotion.ctaLabel || 'Learn more'}</a> : null}
        </div>
        {promotion.endDate ? <p className="mt-4 text-xs text-slate-400">Offer ends {new Date(`${promotion.endDate}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p> : null}
      </div>
    </article>
  );
}
