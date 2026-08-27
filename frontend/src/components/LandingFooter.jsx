import { Link } from 'react-router-dom';

export default function LandingFooter({
  title = 'Ready to Upgrade Your Home or Business?',
  description = 'Get a free consultation and discover the best solution.',
}) {
  return (
    <footer id="contact" className="bg-blue-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 lg:flex-row lg:px-10">
        <div>
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="mt-2 text-blue-100">{description}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link to="/register" className="btn btn-primary">Get a Free Quote</Link>
          <a href="mailto:afnsunenergyserv@gmail.com" className="btn btn-outline border-white text-white hover:text-black">Contact Us</a>
        </div>
      </div>
    </footer>
  );
}
