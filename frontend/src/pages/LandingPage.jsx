import { useEffect, useState } from 'react';
import { ArrowRight, Award, CalendarDays, Camera, CheckCircle2, Headphones, MapPin, ShieldCheck, Sun, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LandingNavbar from '../components/LandingNavbar';
import Footer from '../components/LandingFooter';
import SolarCalculator from '../components/SolarCalculator';
import { fetchPublicLandingSettings } from '../api/site';
import { mergeLandingSettings } from '../utils/landingSettings';

const serviceCards = [
  { key: 'solar', icon: Sun },
  { key: 'cctv', icon: Camera },
  { key: 'aircon', icon: Wrench },
];

export default function LandingPage() {
  const location = useLocation();
  const [siteSettings, setSiteSettings] = useState(() => mergeLandingSettings());
  const [selectedPromotion, setSelectedPromotion] = useState(null);

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

  const usePromotionInCalculator = (promotion) => {
    setSelectedPromotion(promotion);
    window.requestAnimationFrame(() => document.getElementById('solar-calculator')?.scrollIntoView({ behavior: 'smooth' }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <LandingNavbar companyName={siteSettings.companyName} />
      <main className="pt-20 sm:pt-24">
        <section aria-labelledby="landing-heading" className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="grid items-stretch lg:grid-cols-2">
              <div className="p-7 sm:p-10 lg:p-14">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{content.eyebrow}</span>
                <h1 id="landing-heading" className="mt-3 text-4xl font-bold leading-tight text-slate-950 lg:text-5xl">
                  {content.headline}<span className="block text-blue-600">{content.highlight}</span>
                </h1>
                <p className="mt-5 max-w-xl text-slate-600">{content.description}</p>
                <div className="mt-8 flex flex-wrap gap-7 text-sm text-slate-700">
                  <HeroFeature icon={ShieldCheck} label="Energy Efficient" />
                  <HeroFeature icon={Award} label="Trusted Quality" />
                  <HeroFeature icon={Headphones} label="24/7 Support" />
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  {calculatorSettings.enabled ? (
                    <a href="#solar-calculator" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                      {content.primaryCtaLabel}<ArrowRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <Link to="/register" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
                      {content.primaryCtaLabel}<ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  <a href="#services" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    {content.secondaryCtaLabel}
                  </a>
                </div>
              </div>
              <div className="min-h-72 bg-slate-200 lg:min-h-full">
                <img src="/hero-bg.png" alt="Solar, CCTV, and air-conditioning solutions" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </section>

        <section id="services" aria-labelledby="services-heading" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-14 sm:px-6 lg:px-10">
          <div className="mb-7 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">What we do</p>
            <h2 id="services-heading" className="mt-2 text-3xl font-bold text-slate-950">Solutions for energy, security, and comfort</h2>
            <p className="mt-3 text-slate-600">Choose a service to estimate your solar needs or start a service request with our team.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {serviceCards.map(({ key, icon: Icon }) => (
              <article key={key} className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex gap-4">
                  <div className="h-fit rounded-lg bg-blue-100 p-3"><Icon className="text-blue-600" /></div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900">{content[`${key}Title`]}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{content[`${key}Description`]}</p>
                  </div>
                </div>
                <div className="mt-auto pt-5">
                  {key === 'solar' && calculatorSettings.enabled ? (
                    <a href="#solar-calculator" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">Calculate now <ArrowRight className="h-4 w-4" /></a>
                  ) : (
                    <Link to="/register" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">Request this service <ArrowRight className="h-4 w-4" /></Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {projects.length > 0 ? (
          <section id="our-work" aria-labelledby="our-work-heading" className="border-y border-slate-200 bg-white py-14">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">Our work</p>
                  <h2 id="our-work-heading" className="mt-2 text-3xl font-bold text-slate-950">Completed projects</h2>
                  <p className="mt-3 text-slate-600">A selection of real completed work published with client permission.</p>
                </div>
                <a href="#contact" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800">Discuss your project <ArrowRight className="h-4 w-4" /></a>
              </div>
              <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => <ProjectCard key={project.id || project.title} project={project} />)}
              </div>
            </div>
          </section>
        ) : null}

        {promotions.length > 0 ? (
          <section id="promotions" className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div><p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Limited offers</p><h2 className="mt-1 text-3xl font-bold text-slate-950">Products and Promotions</h2></div>
              <p className="max-w-lg text-sm text-slate-500">Explore current offers selected by our solar and service team.</p>
            </div>
            <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[...promotions].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).map((promotion) => (
                <PromotionCard key={promotion.id || promotion.name} promotion={promotion} onUseInCalculator={usePromotionInCalculator} />
              ))}
            </div>
          </section>
        ) : null}

        {calculatorSettings.enabled ? <SolarCalculator settings={calculatorSettings} presetPanelWattage={selectedPromotion?.panelWattage} selectedPromotion={selectedPromotion} /> : null}

        <section aria-labelledby="why-heading" className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
          <h2 id="why-heading" className="text-center text-3xl font-bold text-slate-950">{content.whyTitle}</h2>
          <p className="mt-2 text-center text-slate-500">{content.whySubtitle}</p>
          <div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4">
            <WhyItem icon={Award} label="Trusted Professionals" />
            <WhyItem icon={ShieldCheck} label="Quality Products" />
            <WhyItem icon={Sun} label="Cost Efficient" />
            <WhyItem icon={Headphones} label="24/7 Support" />
          </div>
        </section>
      </main>
      <Footer title={content.footerTitle} description={content.footerDescription} />
    </div>
  );
}

function HeroFeature({ icon: Icon, label }) {
  return <div><Icon className="mb-2 h-7 w-7 text-blue-600" /><p>{label}</p></div>;
}

function WhyItem({ icon: Icon, label }) {
  return <div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100"><Icon className="h-7 w-7 text-blue-700" /></span><h3 className="mt-3 font-semibold">{label}</h3><CheckCircle2 className="mx-auto mt-2 h-4 w-4 text-emerald-500" aria-hidden="true" /></div>;
}

function ProjectCard({ project }) {
  const serviceLabels = { solar: 'Solar', cctv: 'CCTV', aircon: 'Aircon' };
  const completedDate = new Date(`${project.completedDate}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short',
  });

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <img src={project.imageUrl} alt={`${project.title} completed project`} className="h-56 w-full object-cover" loading="lazy" />
      <div className="p-5">
        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">{serviceLabels[project.serviceType] || project.serviceType}</span>
        <h3 className="mt-3 text-xl font-bold text-slate-950">{project.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{project.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-blue-600" />{project.location}</span>
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-blue-600" />Completed {completedDate}</span>
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
    <article className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${promotion.featured ? 'ring-2 ring-amber-400' : 'ring-slate-200'}`}>
      <div className="relative h-48 bg-gradient-to-br from-blue-100 to-slate-200">
        {promotion.imageUrl ? <img src={promotion.imageUrl} alt={promotion.name} className="h-full w-full object-cover" /> : <Sun className="absolute inset-0 m-auto h-16 w-16 text-blue-300" />}
        {promotion.featured ? <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">Featured</span> : null}
      </div>
      <div className="p-5">
        <h3 className="text-xl font-bold text-slate-950">{promotion.name}</h3>
        <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{promotion.description}</p>
        {promoPrice > 0 || regularPrice > 0 ? <div className="mt-4 flex items-baseline gap-2">{promoPrice > 0 ? <span className="text-2xl font-bold text-blue-700">{price(promoPrice)}</span> : null}{regularPrice > 0 ? <span className={promoPrice > 0 ? 'text-sm text-slate-400 line-through' : 'text-2xl font-bold text-blue-700'}>{price(regularPrice)}</span> : null}</div> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {Number(promotion.panelWattage) > 0 ? <button type="button" onClick={() => onUseInCalculator(promotion)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Use in calculator ({promotion.panelWattage} W)</button> : null}
          {promotion.ctaUrl ? <a href={promotion.ctaUrl} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{promotion.ctaLabel || 'Learn more'}</a> : null}
        </div>
        {promotion.endDate ? <p className="mt-4 text-xs text-slate-400">Offer ends {new Date(`${promotion.endDate}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p> : null}
      </div>
    </article>
  );
}
