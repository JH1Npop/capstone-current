import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiSun, FiTrash2 } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import SolarCalculator from '../../components/SolarCalculator';
import { deleteSolarEstimate, fetchPublicLandingSettings, fetchSolarEstimates } from '../../api/api';
import { mergeLandingSettings } from '../../utils/landingSettings';
import { formatEstimateId } from '../../utils/roleIds';


const number = (value, digits = 1) => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

export default function ClientSolarEstimates() {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorSettings, setCalculatorSettings] = useState(() => mergeLandingSettings().solarCalculatorSettings);

  const loadEstimates = async () => {
    setLoading(true);
    try {
      setEstimates(await fetchSolarEstimates());
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load solar estimates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    loadEstimates();
    fetchPublicLandingSettings()
      .then((data) => {
        if (active) setCalculatorSettings(mergeLandingSettings(data).solarCalculatorSettings);
      })
      .catch(() => {
        // Bundled defaults keep the authenticated calculator usable if settings cannot be loaded.
      });
    return () => { active = false; };
  }, []);

  const openCalculator = () => {
    setShowCalculator(true);
    window.requestAnimationFrame(() => {
      document.getElementById('solar-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const addSavedEstimate = (estimate) => {
    setEstimates((current) => [estimate, ...current.filter((item) => item.id !== estimate.id)]);
  };

  const removeEstimate = async (estimate) => {
    if (!window.confirm(`Delete draft ${estimate.estimate_code || formatEstimateId(estimate.id)}?`)) return;
    try {
      await deleteSolarEstimate(estimate.id);
      setEstimates((current) => current.filter((item) => item.id !== estimate.id));
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete estimate.');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="mt-1 text-sm text-slate-500">Review saved calculations and request an on-site assessment.</p>
          </div>
          <button onClick={openCalculator} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300">
            <FiSun /> New calculation
          </button>
        </div>

        {showCalculator ? (
          calculatorSettings.enabled ? (
            <SolarCalculator
              settings={calculatorSettings}
              embedded
              onEstimateSaved={addSavedEstimate}
            />
          ) : (
            <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              New solar calculations are temporarily unavailable. Your saved estimates remain available below.
            </div>
          )
        ) : null}

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">Loading estimates…</div> : null}
        {!loading && estimates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <FiSun className="mx-auto h-8 w-8 text-amber-500" />
            <h2 className="mt-3 font-bold text-slate-900">No saved estimates yet</h2>
            <p className="mt-1 text-sm text-slate-500">Use the calculator to prepare your first preliminary solar estimate.</p>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {estimates.map((estimate) => {
            const result = estimate.result_snapshot || {};
            return (
              <article key={estimate.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">{estimate.estimate_code || formatEstimateId(estimate.id)}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{result.panelCount || 0} panels · {number(result.installedCapacity, 2)} kWp</h2>
                    <p className="mt-1 text-sm text-slate-500">{number(result.monthlyConsumption)} kWh/month · PHP {number(result.monthlySavings, 0)} estimated savings</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{estimate.status}</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {estimate.service_request ? (
                    <button onClick={() => navigate(`/client/requests/${estimate.service_request}`)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                      View request <FiArrowRight />
                    </button>
                  ) : (
                    <button onClick={() => navigate(`/client/service-requests?solarEstimate=${estimate.id}`)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                      Request assessment <FiArrowRight />
                    </button>
                  )}
                  {estimate.status === 'draft' ? (
                    <button onClick={() => removeEstimate(estimate)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                      <FiTrash2 /> Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
