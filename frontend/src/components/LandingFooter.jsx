import { Link } from 'react-router-dom';

export default function LandingFooter({
  title = 'Ready to Upgrade Your Home or Business?',
  description = 'Get a free consultation and discover the best solution.',
}) {
  return (
    <footer id="contact" className="scroll-mt-20 bg-blue-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 lg:flex-row lg:px-10">
        <div className="max-w-2xl text-center lg:text-left">
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="mt-2 text-blue-100">{description}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link to="/register" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-950 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Get a Free Quote
          </Link>
          <a href="mailto:afnsunenergyserv@gmail.com" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-300 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Email Us
          </a>
        </div>
      </div>
    </footer>
  );
}
