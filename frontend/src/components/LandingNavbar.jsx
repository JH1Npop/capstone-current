import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const publicLinks = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about-us' },
  { label: 'Services', to: '/#services' },
  { label: 'Solar Calculator', to: '/#solar-calculator' },
  { label: 'Contact Us', to: '/#contact' },
];

export default function LandingNavbar({ companyName = 'AFN' }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  return (
    <nav aria-label="Public navigation" className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" aria-label={`${companyName} home`} className="flex min-w-0 items-center gap-2">
          <img src="/logo1.png" alt="" className="h-10 w-auto sm:h-12" />
          <div className="hidden min-w-0 sm:block">
            <p className="max-w-64 truncate text-sm font-bold text-slate-900 lg:text-lg">{companyName}</p>
            <p className="text-xs text-slate-500">Solar &bull; CCTV &bull; Aircon</p>
          </div>
        </Link>

        <div className="hidden items-center gap-7 font-medium text-slate-600 lg:flex">
          {publicLinks.map((item) => (
            <Link key={item.label} to={item.to} className="transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 sm:px-5">Login</Link>
          <Link to="/register" className="hidden rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex sm:px-5">Register</Link>
          <button
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-controls="public-mobile-menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div id="public-mobile-menu" className="border-t border-slate-200 bg-white px-4 py-4 shadow-lg lg:hidden">
          <div className="mx-auto grid max-w-7xl gap-1">
            {publicLinks.map((item) => (
              <Link key={item.label} to={item.to} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                {item.label}
              </Link>
            ))}
            <Link to="/register" className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 sm:hidden">
              Create an account
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
