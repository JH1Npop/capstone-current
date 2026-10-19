import { Link } from 'react-router-dom';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { DEFAULT_LANDING_CONTENT, toTelHref } from '../utils/landingSettings';

// Light footer in the portal palette: the same pale brand gradient as the hero and signed-in workspace.
export default function LandingFooter({
  title = DEFAULT_LANDING_CONTENT.footerTitle,
  description = DEFAULT_LANDING_CONTENT.footerDescription,
  content = DEFAULT_LANDING_CONTENT,
}) {
  const phone = content.contactPhone || DEFAULT_LANDING_CONTENT.contactPhone;
  const email = content.contactEmail || DEFAULT_LANDING_CONTENT.contactEmail;

  return (
    <footer className="border-t border-brand-200/70 bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 lg:flex-row lg:px-10">
        <div className="max-w-2xl text-center lg:text-left">
          <h2 className="text-3xl font-bold text-slate-950">{title}</h2>
          <p className="mt-2 text-slate-600">{description}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link to="/register" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            Get a Free Quote
          </Link>
          {phone ? (
            <a href={toTelHref(phone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-5 py-3 text-sm font-semibold text-brand-800 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              <Phone className="h-4 w-4" /> Call {phone}
            </a>
          ) : null}
        </div>
      </div>
      <div className="border-t border-brand-200/70 bg-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {content.contactAddress ? <li className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" />{content.contactAddress}</li> : null}
            {email ? <li><a href={`mailto:${email}`} className="inline-flex items-center gap-2 hover:text-brand-700"><Mail className="h-4 w-4 text-brand-600" />{email}</a></li> : null}
            {content.facebookUrl ? <li><a href={content.facebookUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-brand-700"><MessageCircle className="h-4 w-4 text-brand-600" />Facebook</a></li> : null}
          </ul>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} AFN Solar Power Engineering Services</p>
        </div>
      </div>
    </footer>
  );
}
