import { Link } from 'react-router-dom';
import LandingNavbar from './LandingNavbar';
import Footer from './LandingFooter';
import { PRIVACY_CONTACT } from '../policies';

/** Shared frame for the Privacy Policy and Terms of Service pages. `sections` is [{ id, title, body }]. */
export default function PolicyLayout({ title, intro, sections, otherPolicy }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <LandingNavbar />
      <main className="px-4 pb-16 pt-24 sm:px-6">
        <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{PRIVACY_CONTACT.company}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-5 leading-7 text-slate-700">{intro}</p>

          <nav aria-label="On this page" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {sections.map((section, index) => (
                <li key={section.id}><a href={`#${section.id}`} className="text-brand-700 hover:underline">{index + 1}. {section.title}</a></li>
              ))}
            </ol>
          </nav>

          {sections.map((section, index) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="mt-8 scroll-mt-24">
              <h2 id={`${section.id}-title`} className="text-xl font-semibold text-slate-900">{index + 1}. {section.title}</h2>
              <div className="mt-3 space-y-3 leading-7 text-slate-700">{section.body}</div>
            </section>
          ))}

          <div className="mt-10 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Questions or requests</p>
            <p className="mt-1">
              {PRIVACY_CONTACT.role}, {PRIVACY_CONTACT.company}<br />
              Email: <a className="text-brand-700 hover:underline" href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a><br />
              Phone: {PRIVACY_CONTACT.phone}<br />
              Address: {PRIVACY_CONTACT.address}
            </p>
            <p className="mt-3">See also our <Link className="font-semibold text-brand-700 hover:underline" to={otherPolicy.to}>{otherPolicy.label}</Link>.</p>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
