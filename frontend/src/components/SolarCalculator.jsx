import { useEffect, useMemo, useState } from 'react';
import { Calculator, Leaf, PanelsTopLeft, PhilippinePeso, Plus, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createSolarEstimate } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_SOLAR_CALCULATOR_SETTINGS } from '../utils/landingSettings';

const APPLIANCE_PRESETS = [
  ['Air conditioner', 1200, 1.5],
  ['Refrigerator', 150, 1.5],
  ['Electric fan', 75, 1],
  ['LED light', 10, 1],
  ['Television', 100, 1],
  ['Desktop computer', 250, 1],
  ['Water pump', 750, 2],
  ['Rice cooker', 700, 1],
  ['Washing machine', 500, 1.5],
];

let applianceSequence = 1;
const createAppliance = () => ({
  id: `appliance-${applianceSequence++}`,
  name: '', quantity: 1, wattage: '', dayHours: '', nightHours: '', surgeFactor: 1,
});

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value, digits = 1) => new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value);

const InputField = ({ label, suffix, ...inputProps }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
    <div className="relative">
      <input {...inputProps} type="number" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-14 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">{suffix}</span>
    </div>
  </label>
);

const PENDING_ESTIMATE_KEY = 'afn_pending_solar_estimate';

export default function SolarCalculator({ settings = DEFAULT_SOLAR_CALCULATOR_SETTINGS, presetPanelWattage = null, selectedPromotion = null }) {
  const configured = { ...DEFAULT_SOLAR_CALCULATOR_SETTINGS, ...settings };
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [mode, setMode] = useState('monthly');
  const [appliances, setAppliances] = useState([createAppliance()]);
  const [form, setForm] = useState({
    monthlyConsumption: 450,
    peakSunHours: configured.defaultPeakSunHours,
    systemLoss: Math.round((1 - configured.defaultPerformanceRatio) * 100),
    panelWattage: configured.defaultPanelWattage,
    electricityRate: configured.defaultElectricityRate,
    desiredOffset: configured.defaultDesiredOffset,
    availableRoofArea: '',
  });
  const [saveState, setSaveState] = useState({ loading: false, error: '', message: '', estimateId: null });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      peakSunHours: configured.defaultPeakSunHours,
      systemLoss: Math.round((1 - configured.defaultPerformanceRatio) * 100),
      panelWattage: configured.defaultPanelWattage,
      electricityRate: configured.defaultElectricityRate,
      desiredOffset: configured.defaultDesiredOffset,
    }));
  }, [configured.defaultPeakSunHours, configured.defaultPerformanceRatio, configured.defaultPanelWattage, configured.defaultElectricityRate, configured.defaultDesiredOffset]);

  useEffect(() => {
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_ESTIMATE_KEY) || 'null');
      if (!pending) return;
      if (pending.mode) setMode(pending.mode);
      if (pending.form) setForm((current) => ({ ...current, ...pending.form }));
      if (Array.isArray(pending.appliances) && pending.appliances.length > 0) {
        setAppliances(pending.appliances.map((item) => ({ ...createAppliance(), ...item })));
      }
      if (isAuthenticated && user?.role === 'client') {
        setSaveState((current) => ({ ...current, message: 'Your calculation was restored. Save it when ready.' }));
      }
    } catch {
      sessionStorage.removeItem(PENDING_ESTIMATE_KEY);
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    if (numberValue(presetPanelWattage) > 0) {
      setForm((current) => ({ ...current, panelWattage: numberValue(presetPanelWattage) }));
    }
  }, [presetPanelWattage]);

  const applianceTotals = useMemo(() => appliances.reduce((totals, appliance) => {
    const quantity = Math.max(0, numberValue(appliance.quantity));
    const watts = Math.max(0, numberValue(appliance.wattage));
    const dayHours = Math.min(24, Math.max(0, numberValue(appliance.dayHours)));
    const nightHours = Math.min(24 - dayHours, Math.max(0, numberValue(appliance.nightHours)));
    const connectedWatts = quantity * watts;
    const surgeWatts = connectedWatts * Math.max(1, numberValue(appliance.surgeFactor, 1));
    return {
      dayEnergy: totals.dayEnergy + (connectedWatts * dayHours) / 1000,
      nightEnergy: totals.nightEnergy + (connectedWatts * nightHours) / 1000,
      connectedWatts: totals.connectedWatts + connectedWatts,
      largestSurgeExtra: Math.max(totals.largestSurgeExtra, surgeWatts - connectedWatts),
    };
  }, { dayEnergy: 0, nightEnergy: 0, connectedWatts: 0, largestSurgeExtra: 0 }), [appliances]);

  const results = useMemo(() => {
    const applianceDailyConsumption = applianceTotals.dayEnergy + applianceTotals.nightEnergy;
    const monthlyConsumption = mode === 'appliances'
      ? applianceDailyConsumption * 30
      : Math.max(0, numberValue(form.monthlyConsumption));
    const peakSunHours = Math.max(0.1, numberValue(form.peakSunHours, 5));
    const performanceRatio = Math.min(1, Math.max(0.01, 1 - numberValue(form.systemLoss, 20) / 100));
    const desiredOffset = Math.min(1, Math.max(0.1, numberValue(form.desiredOffset, 100) / 100));
    const panelWattage = Math.max(1, numberValue(form.panelWattage, 550));
    const dailyConsumption = monthlyConsumption / 30;
    const requiredCapacity = (dailyConsumption * desiredOffset) / (peakSunHours * performanceRatio);
    const panelCount = Math.max(0, Math.ceil((requiredCapacity * 1000) / panelWattage));
    const installedCapacity = (panelCount * panelWattage) / 1000;
    const dailyGeneration = installedCapacity * peakSunHours * performanceRatio;
    const monthlyGeneration = dailyGeneration * 30;
    const usableEnergy = Math.min(monthlyGeneration, monthlyConsumption);
    const monthlySavings = usableEnergy * Math.max(0, numberValue(form.electricityRate));
    const roofAreaRequired = panelCount * 2.6;
    const availableRoofArea = numberValue(form.availableRoofArea, 0);
    const inverterCapacity = ((applianceTotals.connectedWatts + applianceTotals.largestSurgeExtra) / 1000) * 1.2;
    const batteryCapacity = applianceTotals.nightEnergy / 0.8 / 0.92;

    return {
      monthlyConsumption, dailyConsumption, requiredCapacity, panelCount, installedCapacity,
      dailyGeneration, monthlyGeneration, monthlySavings, roofAreaRequired, inverterCapacity,
      batteryCapacity, roofFits: availableRoofArea > 0 ? availableRoofArea >= roofAreaRequired : null,
    };
  }, [applianceTotals, form, mode]);

  const updateForm = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const updateAppliance = (id, key, value) => setAppliances((rows) => rows.map((row) => row.id === id ? { ...row, [key]: value } : row));
  const selectPreset = (id, name) => {
    const preset = APPLIANCE_PRESETS.find(([presetName]) => presetName === name);
    setAppliances((rows) => rows.map((row) => row.id === id ? {
      ...row, name, wattage: preset?.[1] || '', surgeFactor: preset?.[2] || 1,
    } : row));
  };

  const buildEstimatePayload = () => ({
    calculation_mode: mode,
    monthly_consumption: results.monthlyConsumption,
    appliances: mode === 'appliances' ? appliances.map(({ id, ...item }) => item) : [],
    peak_sun_hours: numberValue(form.peakSunHours),
    system_loss_percent: numberValue(form.systemLoss),
    panel_wattage: numberValue(form.panelWattage),
    electricity_rate: numberValue(form.electricityRate),
    desired_offset_percent: numberValue(form.desiredOffset),
    available_roof_area: form.availableRoofArea === '' ? null : numberValue(form.availableRoofArea),
    selected_promotion: selectedPromotion ? {
      id: selectedPromotion.id || '',
      title: selectedPromotion.title || selectedPromotion.name || '',
      panelWattage: numberValue(selectedPromotion.panelWattage),
    } : {},
  });

  const saveEstimate = async () => {
    setSaveState((current) => ({ ...current, error: '', message: '' }));
    if (!isAuthenticated) {
      sessionStorage.setItem(PENDING_ESTIMATE_KEY, JSON.stringify({ mode, form, appliances }));
      navigate(`/login?next=${encodeURIComponent('/solar-calculator#solar-calculator')}`);
      return;
    }
    if (user?.role !== 'client') {
      setSaveState((current) => ({ ...current, error: 'Only client accounts can save estimates.' }));
      return;
    }

    setSaveState((current) => ({ ...current, loading: true }));
    try {
      const estimate = await createSolarEstimate(buildEstimatePayload());
      sessionStorage.removeItem(PENDING_ESTIMATE_KEY);
      setSaveState({
        loading: false,
        error: '',
        message: `Estimate #${estimate.id} saved to your account.`,
        estimateId: estimate.id,
      });
    } catch (error) {
      setSaveState((current) => ({ ...current, loading: false, error: error.message || 'Unable to save estimate.' }));
    }
  };

  return (
    <section id="solar-calculator" className="scroll-mt-24 bg-slate-950 py-16 text-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-8 max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300"><Calculator className="h-4 w-4" /> Free preliminary estimate</span>
          <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{configured.title}</h2>
          <p className="mt-3 text-slate-300">{configured.description}</p>
        </div>

        <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          <ModeButton active={mode === 'monthly'} onClick={() => setMode('monthly')}>Monthly kWh</ModeButton>
          <ModeButton active={mode === 'appliances'} onClick={() => setMode('appliances')}>Per appliance</ModeButton>
        </div>

        {mode === 'appliances' ? (
          <div className="mb-6 rounded-2xl bg-white p-5 text-slate-900 shadow-xl sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h3 className="font-bold">Appliance load schedule</h3><p className="text-sm text-slate-500">Day and night hours are calculated separately for solar and battery estimates.</p></div>
              <button type="button" onClick={() => setAppliances((rows) => [...rows, createAppliance()])} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add appliance</button>
            </div>
            <div className="mt-4 space-y-3">
              {appliances.map((appliance) => (
                <div key={appliance.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.4fr_.55fr_.7fr_.7fr_.7fr_.65fr_auto] md:items-end">
                  <label className="text-xs font-semibold text-slate-600">Appliance<select value={appliance.name} onChange={(event) => selectPreset(appliance.id, event.target.value)} className={compactInputClass}><option value="">Select…</option>{APPLIANCE_PRESETS.map(([name]) => <option key={name}>{name}</option>)}</select></label>
                  <ApplianceInput label="Qty" value={appliance.quantity} min="1" onChange={(value) => updateAppliance(appliance.id, 'quantity', value)} />
                  <ApplianceInput label="Wattage" value={appliance.wattage} min="1" onChange={(value) => updateAppliance(appliance.id, 'wattage', value)} />
                  <ApplianceInput label="Day hours" value={appliance.dayHours} min="0" max="24" step="0.5" onChange={(value) => updateAppliance(appliance.id, 'dayHours', value)} />
                  <ApplianceInput label="Night hours" value={appliance.nightHours} min="0" max="24" step="0.5" onChange={(value) => updateAppliance(appliance.id, 'nightHours', value)} />
                  <ApplianceInput label="Surge ×" value={appliance.surgeFactor} min="1" max="5" step="0.1" onChange={(value) => updateAppliance(appliance.id, 'surgeFactor', value)} />
                  <button type="button" title="Remove appliance" disabled={appliances.length === 1} onClick={() => setAppliances((rows) => rows.filter((row) => row.id !== appliance.id))} className="rounded-lg p-2.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 rounded-xl bg-blue-50 p-4 text-sm sm:grid-cols-3">
              <LoadSummary label="Calculated monthly use" value={`${formatNumber(results.monthlyConsumption)} kWh`} />
              <LoadSummary label="Daytime energy" value={`${formatNumber(applianceTotals.dayEnergy)} kWh/day`} />
              <LoadSummary label="Nighttime energy" value={`${formatNumber(applianceTotals.nightEnergy)} kWh/day`} />
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-xl sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === 'monthly' ? <InputField label="Monthly consumption" suffix="kWh" min="1" step="1" value={form.monthlyConsumption} onChange={updateForm('monthlyConsumption')} /> : null}
              <InputField label="Electricity rate" suffix="PHP/kWh" min="0.01" step="0.01" value={form.electricityRate} onChange={updateForm('electricityRate')} />
              <InputField label="Peak sun hours" suffix="hours" min="1" max="10" step="0.1" value={form.peakSunHours} onChange={updateForm('peakSunHours')} />
              <InputField label="System loss" suffix="%" min="0" max="50" step="1" value={form.systemLoss} onChange={updateForm('systemLoss')} />
              <InputField label="Panel wattage" suffix="W" min="100" max="1000" step="5" value={form.panelWattage} onChange={updateForm('panelWattage')} />
              <InputField label="Desired bill offset" suffix="%" min="10" max="100" step="5" value={form.desiredOffset} onChange={updateForm('desiredOffset')} />
              <InputField label="Available roof area (optional)" suffix="m²" min="0" step="1" value={form.availableRoofArea} onChange={updateForm('availableRoofArea')} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur sm:p-7">
            <div className="grid gap-3 sm:grid-cols-2">
              <ResultCard icon={PanelsTopLeft} label="Recommended panels" value={`${results.panelCount} panels`} detail={`${formatNumber(results.installedCapacity, 2)} kWp installed`} />
              <ResultCard icon={Zap} label="Required PV size" value={`${formatNumber(results.requiredCapacity, 2)} kWp`} detail={`${formatNumber(results.dailyConsumption)} kWh daily use`} />
              <ResultCard icon={Leaf} label="Estimated generation" value={`${formatNumber(results.monthlyGeneration, 0)} kWh/mo`} detail={`${formatNumber(results.dailyGeneration)} kWh per day`} />
              <ResultCard icon={PhilippinePeso} label="Estimated savings" value={`PHP ${formatNumber(results.monthlySavings, 0)}/mo`} detail="Before fixed charges and export adjustments" />
            </div>
            {mode === 'appliances' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><LoadEstimate label="Preliminary inverter size" value={`${formatNumber(results.inverterCapacity, 2)} kW`} /><LoadEstimate label="Preliminary battery size" value={`${formatNumber(results.batteryCapacity, 2)} kWh`} /></div> : null}
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${results.roofFits === false ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'}`}>
              Approximate roof area required: <strong>{formatNumber(results.roofAreaRequired)} m²</strong>.{results.roofFits === false ? ' The entered roof area may not fit this estimate.' : ''}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">This is a preliminary estimate, not a final engineering design. Appliance duty cycles, motor starting current, shading, roof orientation, weather, equipment compatibility, and net-metering arrangements can change the final design.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={saveState.loading} onClick={saveEstimate} className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60">
                {saveState.loading ? 'Saving…' : isAuthenticated ? 'Save estimate' : 'Sign in to save'}
              </button>
              {saveState.estimateId ? (
                <button type="button" onClick={() => navigate(`/client/service-requests?solarEstimate=${saveState.estimateId}`)} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
                  Request site assessment
                </button>
              ) : null}
            </div>
            {saveState.message ? <p className="mt-3 text-sm font-medium text-emerald-300">{saveState.message}</p> : null}
            {saveState.error ? <p className="mt-3 text-sm font-medium text-rose-300">{saveState.error}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

const compactInputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500';

function ApplianceInput({ label, value, onChange, ...props }) {
  return <label className="text-xs font-semibold text-slate-600">{label}<input {...props} type="number" value={value} onChange={(event) => onChange(event.target.value)} className={compactInputClass} /></label>;
}

function ModeButton({ active, children, onClick }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'}`}>{children}</button>;
}

function LoadSummary({ label, value }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{label}</p><p className="mt-1 font-bold text-slate-900">{value}</p></div>;
}

function LoadEstimate({ label, value }) {
  return <div className="rounded-xl border border-blue-300/20 bg-blue-300/10 p-3"><p className="text-xs text-blue-100">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}

function ResultCard({ icon: Icon, label, value, detail }) {
  return <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4"><Icon className="h-5 w-5 text-amber-300" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
}
