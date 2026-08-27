import { Link } from 'react-router-dom';

export default function LandingNavbar({ companyName = 'AFN' }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <img src="/logo1.png" alt="AFN Logo" className="h-12 w-auto sm:h-14" />
          <div className="hidden min-w-0 sm:block">
            <h1 className="max-w-64 truncate text-sm font-bold text-slate-900 lg:text-lg">{companyName}</h1>
            <p className="text-xs text-slate-500">Solar • CCTV • Aircon</p>
          </div>
        </Link>

        <div className="hidden items-center gap-7 font-medium text-slate-600 lg:flex">
          <Link to="/" className="transition hover:text-blue-600">Home</Link>
          <Link to="/about-us" className="transition hover:text-blue-600">About Us</Link>
          <a href="#services" className="transition hover:text-blue-600">Services</a>
          <a href="#solar-calculator" className="transition hover:text-blue-600">Solar Calculator</a>
          <a href="#contact" className="transition hover:text-blue-600">Contact Us</a>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 sm:px-5">Login</Link>
          <Link to="/register" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 sm:px-5">Register</Link>
        </div>
      </div>
    </nav>
  );
}
