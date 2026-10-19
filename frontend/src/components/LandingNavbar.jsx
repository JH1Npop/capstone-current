import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

// Short labels keep the bar light; the logo already links home.
const publicLinks = [
  { label: 'Services', to: '/#services' },
  { label: 'How It Works', to: '/#how-it-works' },
  { label: 'Free Estimate', to: '/#solar-calculator' },
  { label: 'About', to: '/about-us' },
  { label: 'Contact', to: '/#contact' },
];

export default function LandingNavbar({ companyName = 'AFN Solar Power Engineering Services' }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  return (
    <nav aria-label="Public navigation" className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" aria-label={`${companyName} home`} className="flex shrink-0 items-center gap-2">
          <img src="/logo1.png" alt="" className="h-10 w-auto sm:h-12" />
          <p className="hidden max-w-[11rem] text-sm font-bold leading-tight text-slate-900 sm:block xl:max-w-[14rem] xl:text-base">{companyName}</p>
        </Link>

        <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 xl:flex">
          {publicLinks.map((item) => (
            <Link key={item.label} to={item.to} className="transition hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-brand-700">Log in</Link>
          <Link to="/register" className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:inline-flex">Book now</Link>
          <button
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-controls="public-mobile-menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 xl:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div id="public-mobile-menu" className="border-t border-slate-200 bg-white px-4 py-4 shadow-lg xl:hidden">
          <div className="mx-auto grid max-w-7xl gap-1">
            {publicLinks.map((item) => (
              <Link key={item.label} to={item.to} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700">
                {item.label}
              </Link>
            ))}
            <Link to="/register" className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:hidden">
              Create an account
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
