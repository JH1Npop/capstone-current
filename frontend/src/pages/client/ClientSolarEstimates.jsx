import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiSun, FiTrash2, FiX } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import SolarCalculator from '../../components/SolarCalculator';
import { deleteSolarEstimate, fetchPublicLandingSettings, fetchSolarEstimates } from '../../api/api';
import { mergeLandingSettings } from '../../utils/landingSettings';
import { formatEstimateId } from '../../utils/roleIds';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';


const number = (value, digits = 1) => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

// What each stage means to the client.
const STATUS_LABELS = {
  draft: { label: 'Saved', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-sky-50 text-sky-700' },
  reviewed: { label: 'Reviewed', className: 'bg-violet-50 text-violet-700' },
  converted: { label: 'Assessment requested', className: 'bg-emerald-50 text-emerald-700' },
  expired: { label: 'Expired', className: 'bg-amber-50 text-amber-800' },
};
const savedOn = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
};

export default function ClientSolarEstimates() {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState([]);
  const [estimatePendingDelete, setEstimatePendingDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
    if (showCalculator) {
      setShowCalculator(false);
      return;
    }
    setShowCalculator(true);
    window.requestAnimationFrame(() => {
      document.getElementById('solar-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const addSavedEstimate = (estimate) => {
    setEstimates((current) => [estimate, ...current.filter((item) => item.id !== estimate.id)]);
  };

  const removeEstimate = (estimate) => {
    setEstimatePendingDelete(estimate);
  };

  const confirmRemoveEstimate = async () => {
    const estimate = estimatePendingDelete;
    setEstimatePendingDelete(null);
    if (!estimate) return;
    setNotice('');
    try {
      await deleteSolarEstimate(estimate.id);
      setEstimates((current) => current.filter((item) => item.id !== estimate.id));
      setError('');
      setNotice(`Deleted ${estimate.estimate_code || formatEstimateId(estimate.id)}.`);
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete estimate.');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={openCalculator}
            aria-expanded={showCalculator}
            aria-controls="solar-calculator"
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              showCalculator ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
            }`}
          >
            {showCalculator ? <><FiX /> Close calculator</> : <><FiSun /> New calculation</>}
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

        {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        {notice ? (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} className="min-h-11 px-2 font-semibold">Dismiss</button>
          </div>
        ) : null}
        {loading ? <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">Loading estimates…</div> : null}
        {!loading && estimates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <FiSun className="mx-auto h-8 w-8 text-amber-500" />
            <h2 className="mt-3 font-bold text-slate-900">No saved estimates yet</h2>
            <p className="mt-1 text-sm text-slate-500">Use the calculator to prepare your first preliminary solar estimate.</p>
            {!showCalculator ? (
              <button type="button" onClick={openCalculator} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300">
                <FiSun /> Start a calculation
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {estimates.map((estimate) => {
            const result = estimate.result_snapshot || {};
            const status = STATUS_LABELS[estimate.status] || { label: estimate.status, className: 'bg-slate-100 text-slate-700' };
            const code = estimate.estimate_code || formatEstimateId(estimate.id);
            return (
              <article key={estimate.id} aria-label={code} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                      {code}
                      {savedOn(estimate.created_at) ? <span className="ml-2 font-medium normal-case tracking-normal text-slate-400">Saved {savedOn(estimate.created_at)}</span> : null}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{result.panelCount || 0} panels · {number(result.installedCapacity, 2)} kWp</h2>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Monthly use</dt>
                    <dd className="font-semibold text-slate-900">{number(result.monthlyConsumption, 0)} kWh</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Estimated savings</dt>
                    <dd className="font-semibold text-slate-900">
                      PHP {result.monthlySavingsWithoutNetMetering !== undefined ? `${number(result.monthlySavingsWithoutNetMetering, 0)}–` : ''}{number(result.monthlySavings, 0)}/month
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {estimate.service_request ? (
                    <button type="button" onClick={() => navigate(`/client/requests/${estimate.service_request}?entity=request`)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                      View request <FiArrowRight />
                    </button>
                  ) : (
                    <button type="button" onClick={() => navigate(`/client/service-requests?solarEstimate=${estimate.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                      Request assessment <FiArrowRight />
                    </button>
                  )}
                  {estimate.status === 'draft' ? (
                    <button type="button" onClick={() => removeEstimate(estimate)} aria-label={`Delete ${code}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                      <FiTrash2 /> Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {estimatePendingDelete ? (
        <ConfirmationDialog
          title={`Delete draft ${estimatePendingDelete.estimate_code || formatEstimateId(estimatePendingDelete.id)}?`}
          message="This saved calculation will be removed. Submitted or converted estimates are kept."
          tone="danger"
          icon="danger"
          confirmLabel="Delete draft"
          onCancel={() => setEstimatePendingDelete(null)}
          onConfirm={confirmRemoveEstimate}
        />
      ) : null}
    </Layout>
  );
}
