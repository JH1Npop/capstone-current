import { Link } from 'react-router-dom';

const AuthShell = ({
  children,
  title,
  subtitle,
  panelTitle = 'AFN SERVE',
  panelSubtitle = 'AFN Solar Power Engineering Services',
  maxWidth = 'max-w-[430px]',
  variant = 'simple',
}) => {
  if (variant === 'solar') {
    return (
      <main className="min-h-screen bg-slate-50">
        <section className="flex min-h-screen flex-col overflow-hidden lg:flex-row">
          <div className="relative hidden min-h-screen overflow-hidden bg-slate-900 lg:flex lg:w-[70%]">
            <img
              src="/login-bg.png"
              alt="AFN Solar Power Engineering Services login background"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950/75 via-brand-950/55 to-slate-950/45" />
            <div className="relative z-10 flex min-h-screen w-full flex-col justify-between px-10 py-9 text-white xl:px-14">
              <Link to="/" className="inline-flex items-center gap-3 self-start">
                <img src="/logo1.png" alt="AFN Solar Power Engineering Services" className="h-20 w-auto object-contain" />
                <div>
                  <p className="text-xl font-extrabold tracking-wide">AFN SERVE</p>
                  <p className="text-sm font-semibold text-white/85">AFN Solar Power Engineering Services</p>
                </div>
              </Link>

              <div className="max-w-[620px]">
                <p className="mb-4 text-sm font-extrabold uppercase tracking-[0.22em] text-yellow-300">
                  AFN Solar Power Engineering Services
                </p>
                <h1 className="text-5xl font-extrabold uppercase leading-tight tracking-normal xl:text-6xl">
                  Powering the Future
                </h1>
              </div>

              <p className="text-sm font-medium text-white/80">2026 AFN Service Management. All rights reserved.</p>
            </div>
          </div>

          <div className="relative flex min-h-screen flex-1 items-center justify-center bg-gradient-to-br from-white via-slate-50 to-sky-100 px-4 py-8 sm:px-6 lg:w-[30%] lg:flex-none lg:px-6 xl:px-8">
            <div className={`relative z-10 w-full ${maxWidth}`}>
              <div className="mb-5 flex justify-center">
                <Link to="/" className="inline-flex items-center gap-3">
                  <img src="/logo1.png" alt="AFN Solar Power Engineering Services" className="h-20 w-auto object-contain" />
                  <div className="text-left">
                    <p className="text-lg font-extrabold tracking-wide text-brand-900">AFN SERVE</p>
                    <p className="text-xs font-medium text-slate-500">AFN Solar Power Engineering Services</p>
                  </div>
                </Link>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow sm:p-7">
                <div className="mb-7">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-9 w-1 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-lg font-extrabold tracking-wide text-brand-800">{panelTitle}</p>
                      <p className="text-xs font-medium text-slate-500">{panelSubtitle}</p>
                    </div>
                  </div>
                  <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
                  {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
                </div>

                {children}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
          <div className={`w-full ${maxWidth}`}>
            <div className="mb-5 flex justify-center">
              <Link to="/" className="inline-flex items-center gap-3">
                <img src="/logo1.png" alt="AFN Solar Power Engineering Services" className="h-20 w-auto object-contain" />
                <div className="text-left">
                  <p className="text-lg font-extrabold tracking-wide text-brand-900">AFN SERVE</p>
                  <p className="text-xs font-medium text-slate-500">AFN Solar Power Engineering Services</p>
                </div>
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow sm:p-7">
              <div className="mb-7">
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-9 w-1 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-lg font-extrabold tracking-wide text-brand-800">{panelTitle}</p>
                    <p className="text-xs font-medium text-slate-500">{panelSubtitle}</p>
                  </div>
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
                {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
              </div>

              {children}
            </div>
          </div>
      </section>
    </main>
  );
};

export default AuthShell;
