import LandingNavbar from "../components/LandingNavbar";
import Footer from "../components/LandingFooter";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <LandingNavbar />

      <main className="pt-20">
        <section className="max-w-7xl mx-auto px-6">
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="grid lg:grid-cols-2 items-center">
              <div className="p-10 lg:p-14">
                <span className="text-xs font-semibold text-blue-600 uppercase">
                  About AFN
                </span>

                <h1 className="mt-3 text-4xl lg:text-5xl font-bold leading-tight">
                  Powering Homes.
                  <span className="block text-blue-600">
                    Protecting Businesses.
                  </span>
                </h1>

                <p className="mt-5 text-gray-600 text-lg">
                  AFN Solar Power Engineering Services is committed to delivering
                  reliable solar energy systems, advanced CCTV security solutions,
                  and efficient air conditioning services for residential,
                  commercial, and industrial clients.
                </p>
              </div>

              <div className="h-full min-h-80">
                <img
                  src="/hero-bg.png"
                  alt="About AFN"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="bg-white rounded-xl shadow p-10">
            <h2 className="text-3xl font-bold">Our Story</h2>

            <p className="mt-6 text-gray-600 leading-relaxed">
              AFN Solar Power Engineering Services began with a vision of helping
              Filipino homes and businesses embrace sustainable energy,
              dependable security systems, and modern climate-control solutions.
            </p>

            <p className="mt-4 text-gray-600 leading-relaxed">
              Through years of dedication, innovation, and customer-focused
              service, we have built a reputation for quality workmanship,
              professional installation, and long-term support.
            </p>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-8">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                M
              </div>

              <h3 className="text-2xl font-bold mt-5">Our Mission</h3>

              <p className="mt-4 text-gray-600">
                To provide innovative, reliable, and cost-effective engineering
                solutions that improve comfort, safety, and energy efficiency
                for every client we serve.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow p-8">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                V
              </div>

              <h3 className="text-2xl font-bold mt-5">Our Vision</h3>

              <p className="mt-4 text-gray-600">
                To become one of the most trusted engineering service providers
                in the Philippines through excellence, innovation, and customer
                satisfaction.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-14">
          <h2 className="text-3xl font-bold text-center">Why Choose AFN?</h2>

          <p className="text-center text-gray-500 mt-2">
            Delivering quality, reliability, and peace of mind.
          </p>

          <div className="grid md:grid-cols-4 gap-6 mt-10">
            {[
              ["E", "Energy Solutions"],
              ["S", "Security Systems"],
              ["A", "Aircon Services"],
              ["T", "Trusted Support"],
            ].map(([initial, label]) => (
              <div className="bg-white rounded-xl shadow p-6 text-center" key={label}>
                <div className="text-4xl font-bold text-blue-600">{initial}</div>
                <h3 className="font-semibold mt-4">{label}</h3>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-blue-900 text-white mt-10">
          <div className="max-w-7xl mx-auto px-6 py-12 text-center">
            <h2 className="text-4xl font-bold">
              Let's Build a Smarter Future Together
            </h2>

            <p className="mt-4 text-blue-100 max-w-3xl mx-auto">
              Whether you need solar installation, CCTV monitoring, or air
              conditioning solutions, AFN is ready to help.
            </p>

            <button className="mt-8 bg-white text-blue-900 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition">
              Contact Us
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
