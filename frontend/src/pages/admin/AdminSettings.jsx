import { useEffect, useMemo, useState } from 'react';
import {
  FiBell,
  FiMapPin,
  FiClock,
  FiMail,
  FiRefreshCw,
  FiSave,
  FiSettings,
  FiTruck,
  FiUsers,
} from 'react-icons/fi';
import { fetchAdminSettings, fetchSlaRules, updateAdminSettings, updateSlaRule } from '../../api/api';
import Layout from '../../components/layout/Layout';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
const tableInputClass = 'block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const hourOptions = Array.from({ length: 25 }, (_, index) => index);
const minuteOptions = Array.from({ length: 60 }, (_, index) => index);
const weekDays = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const initialSettings = {
  systemName: '',
  supportEmail: '',
  enableNotifications: false,
  enableInAppNotifications: true,
  enableEmailNotifications: true,
  autoDispatchEnabled: false,
  allowOvertimeDispatch: false,
  overtimeDailyCapacityMinutes: 600,
  defaultTimeZone: browserTimeZone,
  maxTechnicianAssignments: 5,
  businessDays: [1, 2, 3, 4, 5],
  businessOpenTime: '08:00',
  businessCloseTime: '17:00',
  holidayDates: [],
  maintenanceReminderDays: 7,
  companyName: 'AFN Solar Power Engineering Services',
  companyAddress: '',
  documentFooter: '',
  currencyCode: 'PHP',
  quotationValidityDays: 30,
  defaultWarrantyDays: 365,
  externalPaymentNotice: 'Payment is completed outside this system. Enter the confirmed amount before printing.',
  canManageOrganizationSettings: false,
  locationValidationEnabled: true,
  arrivalRadiusMeters: 30,
  locationValidationDisabledReason: '',
  locationValidationUpdatedAt: '',
  locationValidationUpdatedByName: '',
};

const formatCapacityHours = (minutes) => {
  const hours = Number(minutes || 480) / 60;
  return Number.isInteger(hours) ? `${hours} hours` : `${hours.toFixed(1)} hours`;
};

const splitDuration = (minutes) => {
  const totalMinutes = Math.max(0, Number(minutes) || 0);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
};

const combineDuration = (hours, minutes) => (Number(hours) * 60) + Number(minutes);

const formatDateTimeLabel = (value) => {
  if (!value) return 'Not updated yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not updated yet';
  return date.toLocaleString();
};

export default function AdminSettings() {
  const [settings, setSettings] = useState(initialSettings);
  const [slaRules, setSlaRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSla, setSavingSla] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const activeRules = useMemo(
    () => slaRules.filter((rule) => rule.is_active).length,
    [slaRules]
  );

  const loadSettings = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const [settingsData, rulesData] = await Promise.all([fetchAdminSettings(), fetchSlaRules()]);
      setSettings((current) => ({ ...current, ...settingsData }));
      setSlaRules(Array.isArray(rulesData) ? rulesData : []);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to load settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    if (!settings.systemName?.trim()) {
      setMessage({ type: 'error', text: 'System name is required.' });
      return;
    }
    if (!settings.supportEmail?.trim()) {
      setMessage({ type: 'error', text: 'Support email is required.' });
      return;
    }
    const overtimeMinutes = Number(settings.overtimeDailyCapacityMinutes || 600);
    if (
      settings.allowOvertimeDispatch &&
      (!Number.isFinite(overtimeMinutes) || overtimeMinutes < 480 || overtimeMinutes > 960)
    ) {
      setMessage({ type: 'error', text: 'Overtime daily capacity must be between 8 and 16 hours.' });
      return;
    }
    if (!settings.locationValidationEnabled && !settings.locationValidationDisabledReason?.trim()) {
      setMessage({ type: 'error', text: 'A reason is required when location validation is turned off.' });
      return;
    }

    setSavingSettings(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        ...settings,
        overtimeDailyCapacityMinutes: overtimeMinutes,
      };
      if (!settings.canManageOrganizationSettings) {
        ['companyName', 'companyAddress', 'documentFooter', 'currencyCode', 'quotationValidityDays', 'defaultWarrantyDays', 'externalPaymentNotice']
          .forEach((key) => delete payload[key]);
      }
      delete payload.canManageOrganizationSettings;
      const response = await updateAdminSettings(payload);
      if (response?.settings) {
        setSettings((current) => ({ ...current, ...response.settings }));
      }
      setMessage({ type: 'success', text: 'System settings updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const updateLocalSlaRule = (id, updates) => {
    setSlaRules((rules) => rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const saveSlaRules = async () => {
    const invalidRule = slaRules.find((rule) => {
      const warning = Number(rule.warning_minutes);
      const overdue = Number(rule.overdue_minutes);
      return !Number.isFinite(warning) || !Number.isFinite(overdue) || warning < 1 || overdue < 1 || warning >= overdue;
    });

    if (invalidRule) {
      setMessage({
        type: 'error',
        text: `${invalidRule.label || invalidRule.key}: warning minutes must be positive and less than overdue minutes.`,
      });
      return;
    }

    setSavingSla(true);
    setMessage({ type: '', text: '' });

    try {
      await Promise.all(
        slaRules.map((rule) =>
          updateSlaRule(rule.id, {
            warning_minutes: Number(rule.warning_minutes),
            overdue_minutes: Number(rule.overdue_minutes),
            is_active: Boolean(rule.is_active),
            notes: rule.notes || '',
          })
        )
      );
      setMessage({ type: 'success', text: 'SLA rules updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update SLA rules.' });
    } finally {
      setSavingSla(false);
    }
  };

  return (
    <Layout>
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
          {message.text ? (
            <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {message.text}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <FiSettings />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">General Preferences</h3>
                    <p className="text-sm text-slate-500">Shown across admin screens and used as global defaults.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadSettings}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <FiRefreshCw className={loading ? 'animate-spin' : ''} size={16} />
                  Refresh
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">System Name</span>
                  <input
                    value={settings.systemName || ''}
                    onChange={(event) => updateSetting('systemName', event.target.value)}
                    className={inputClass}
                    disabled={loading}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Support Email</span>
                  <input
                    type="email"
                    value={settings.supportEmail || ''}
                    onChange={(event) => updateSetting('supportEmail', event.target.value)}
                    className={inputClass}
                    disabled={loading}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Default Time Zone</span>
                  <input
                    value={settings.defaultTimeZone || browserTimeZone}
                    onChange={(event) => updateSetting('defaultTimeZone', event.target.value)}
                    className={inputClass}
                    disabled={loading}
                  />
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">Technician Daily Capacity</span>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {settings.allowOvertimeDispatch
                      ? `${formatCapacityHours(settings.overtimeDailyCapacityMinutes)} with overtime`
                      : '8 hours by service duration'}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <SwitchCard
                  icon={FiBell}
                  title="Notifications"
                  description="Allow system notifications for service updates, reminders, and alerts."
                  checked={Boolean(settings.enableNotifications)}
                  onChange={(checked) => updateSetting('enableNotifications', checked)}
                  disabled={loading}
                />
                <SwitchCard
                  icon={FiBell}
                  title="In-app Alerts"
                  description="Show operational alerts inside the system."
                  checked={Boolean(settings.enableInAppNotifications)}
                  onChange={(checked) => updateSetting('enableInAppNotifications', checked)}
                  disabled={loading || !settings.enableNotifications}
                />
                <SwitchCard
                  icon={FiMail}
                  title="Email Alerts"
                  description="Send operational alerts through the configured Django email service."
                  checked={Boolean(settings.enableEmailNotifications)}
                  onChange={(checked) => updateSetting('enableEmailNotifications', checked)}
                  disabled={loading || !settings.enableNotifications}
                />
                <SwitchCard
                  icon={FiTruck}
                  title="Auto Dispatch"
                  description="Enable automatic technician assignment where service rules allow it."
                  checked={Boolean(settings.autoDispatchEnabled)}
                  onChange={(checked) => updateSetting('autoDispatchEnabled', checked)}
                  disabled={loading}
                />
                <SwitchCard
                  icon={FiClock}
                  title="Overtime Dispatch"
                  description="Allow technician capacity to exceed the normal 8-hour day up to the overtime limit."
                  checked={Boolean(settings.allowOvertimeDispatch)}
                  onChange={(checked) => updateSetting('allowOvertimeDispatch', checked)}
                  disabled={loading}
                />
                <label className="block rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <span className="text-sm font-semibold text-slate-900">Overtime Daily Limit</span>
                  <select
                    value={settings.overtimeDailyCapacityMinutes || 600}
                    onChange={(event) => updateSetting('overtimeDailyCapacityMinutes', Number(event.target.value))}
                    className={`${inputClass} bg-white`}
                    disabled={loading || !settings.allowOvertimeDispatch}
                  >
                    <option value={540}>9 hours</option>
                    <option value={600}>10 hours</option>
                    <option value={660}>11 hours</option>
                    <option value={720}>12 hours</option>
                  </select>
                </label>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-base font-semibold text-slate-900">Operating Calendar & Reminders</h3>
                <p className="mt-1 text-sm text-slate-600">Set normal working days and the first maintenance reminder window.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {weekDays.map((day) => {
                    const selected = (settings.businessDays || []).includes(day.value);
                    return (
                      <button key={day.value} type="button" disabled={loading}
                        onClick={() => updateSetting('businessDays', selected
                          ? settings.businessDays.filter((value) => value !== day.value)
                          : [...(settings.businessDays || []), day.value].sort())}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600'}`}>
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="block"><span className="text-sm font-medium text-slate-700">Opening Time</span><input type="time" className={inputClass} value={settings.businessOpenTime || '08:00'} onChange={(e) => updateSetting('businessOpenTime', e.target.value)} disabled={loading} /></label>
                  <label className="block"><span className="text-sm font-medium text-slate-700">Closing Time</span><input type="time" className={inputClass} value={settings.businessCloseTime || '17:00'} onChange={(e) => updateSetting('businessCloseTime', e.target.value)} disabled={loading} /></label>
                  <label className="block"><span className="text-sm font-medium text-slate-700">Maintenance Reminder</span><input type="number" min="3" max="30" className={inputClass} value={settings.maintenanceReminderDays || 7} onChange={(e) => updateSetting('maintenanceReminderDays', Number(e.target.value))} disabled={loading} /><span className="mt-1 block text-xs text-slate-500">Days before due date</span></label>
                </div>
                <label className="mt-4 block"><span className="text-sm font-medium text-slate-700">Holiday Dates</span><input className={inputClass} value={(settings.holidayDates || []).join(', ')} onChange={(e) => updateSetting('holidayDates', e.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="2026-12-25, 2027-01-01" disabled={loading} /><span className="mt-1 block text-xs text-slate-500">Use YYYY-MM-DD, separated by commas.</span></label>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold text-slate-900">Organization & Document Defaults</h3>
                <p className="mt-1 text-sm text-slate-600">Superadmin-controlled defaults used by document autofill and externally paid forms.</p>
                {!settings.canManageOrganizationSettings && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">View only. A superadmin must update these values.</p>}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block"><span className="text-sm font-medium text-slate-700">Company Name</span><input className={inputClass} value={settings.companyName || ''} onChange={(e) => updateSetting('companyName', e.target.value)} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                  <label className="block"><span className="text-sm font-medium text-slate-700">Currency</span><input className={inputClass} maxLength={3} value={settings.currencyCode || 'PHP'} onChange={(e) => updateSetting('currencyCode', e.target.value.toUpperCase())} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                  <label className="block md:col-span-2"><span className="text-sm font-medium text-slate-700">Company Address</span><textarea className={inputClass} rows={2} value={settings.companyAddress || ''} onChange={(e) => updateSetting('companyAddress', e.target.value)} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                  <label className="block"><span className="text-sm font-medium text-slate-700">Quotation Validity (days)</span><input type="number" min="1" max="365" className={inputClass} value={settings.quotationValidityDays || 30} onChange={(e) => updateSetting('quotationValidityDays', Number(e.target.value))} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                  <label className="block"><span className="text-sm font-medium text-slate-700">Default Warranty (days)</span><input type="number" min="1" max="3650" className={inputClass} value={settings.defaultWarrantyDays || 365} onChange={(e) => updateSetting('defaultWarrantyDays', Number(e.target.value))} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                  <label className="block md:col-span-2"><span className="text-sm font-medium text-slate-700">External Payment Notice</span><textarea className={inputClass} rows={2} value={settings.externalPaymentNotice || ''} onChange={(e) => updateSetting('externalPaymentNotice', e.target.value)} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                  <label className="block md:col-span-2"><span className="text-sm font-medium text-slate-700">Document Footer</span><textarea className={inputClass} rows={2} value={settings.documentFooter || ''} onChange={(e) => updateSetting('documentFooter', e.target.value)} disabled={loading || !settings.canManageOrganizationSettings} /></label>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                    <FiMapPin />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-slate-900">Technician Workflow Settings</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Control whether technicians must be inside the allowed site radius before they can mark arrival.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <SwitchCard
                    icon={FiMapPin}
                    title="Location Range Validation"
                    description="When enabled, technicians must be within the allowed radius before starting field work."
                    checked={Boolean(settings.locationValidationEnabled)}
                    onChange={(checked) => updateSetting('locationValidationEnabled', checked)}
                    disabled={loading}
                  />

                  <label className="block rounded-xl border border-slate-200 bg-white p-4">
                    <span className="text-sm font-semibold text-slate-900">Allowed Radius</span>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={settings.arrivalRadiusMeters ?? 30}
                      onChange={(event) => updateSetting('arrivalRadiusMeters', Number(event.target.value))}
                      className={inputClass}
                      disabled={loading}
                    />
                    <p className="mt-2 text-xs text-slate-500">Default is 30 meters.</p>
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700">Reason for Disabling</span>
                  <textarea
                    value={settings.locationValidationDisabledReason || ''}
                    onChange={(event) => updateSetting('locationValidationDisabledReason', event.target.value)}
                    rows={3}
                    className={inputClass}
                    disabled={loading}
                    placeholder="Required when validation is turned off."
                  />
                </label>

                <div className="mt-4 grid gap-3 rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-sm text-slate-600 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Updated By</p>
                    <p className="mt-1 font-medium text-slate-900">{settings.locationValidationUpdatedByName || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Updated</p>
                    <p className="mt-1 font-medium text-slate-900">{formatDateTimeLabel(settings.locationValidationUpdatedAt)}</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={saveSettings}
                disabled={loading || savingSettings}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
              >
                <FiSave size={16} />
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </section>

            <aside className="space-y-4">
              <SummaryCard icon={FiBell} label="Notifications" value={settings.enableNotifications ? 'On' : 'Off'} />
              <SummaryCard icon={FiTruck} label="Auto Dispatch" value={settings.autoDispatchEnabled ? 'On' : 'Off'} />
              <SummaryCard
                icon={FiUsers}
                label="Daily Capacity"
                value={settings.allowOvertimeDispatch ? formatCapacityHours(settings.overtimeDailyCapacityMinutes) : '8 hours'}
              />
              <SummaryCard
                icon={FiMapPin}
                label="Arrival Validation"
                value={settings.locationValidationEnabled ? `${settings.arrivalRadiusMeters || 30}m radius` : 'Bypassed'}
              />
              <SummaryCard icon={FiClock} label="Active SLA Rules" value={`${activeRules}/${slaRules.length || 0}`} />
              <SummaryCard icon={FiMail} label="Support" value={settings.supportEmail || 'Not set'} />
            </aside>
          </div>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">SLA Rules</h3>
                <p className="mt-1 text-sm text-slate-500">Warning time must be less than overdue time. These values feed dashboards, queues, and reports.</p>
              </div>
              <button
                type="button"
                onClick={saveSlaRules}
                disabled={loading || savingSla || slaRules.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                <FiSave size={16} />
                {savingSla ? 'Saving...' : 'Save SLA Rules'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Rule</th>
                    <th className="px-3 py-3">Warning</th>
                    <th className="px-3 py-3">Overdue</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {slaRules.length ? slaRules.map((rule) => (
                    <tr key={rule.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{rule.label || rule.key}</p>
                      </td>
                      <td className="px-3 py-3">
                        <DurationSelect
                          value={rule.warning_minutes}
                          onChange={(value) => updateLocalSlaRule(rule.id, { warning_minutes: value })}
                          disabled={loading}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <DurationSelect
                          value={rule.overdue_minutes}
                          onChange={(value) => updateLocalSlaRule(rule.id, { overdue_minutes: value })}
                          disabled={loading}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          <input
                            type="checkbox"
                            checked={Boolean(rule.is_active)}
                            onChange={(event) => updateLocalSlaRule(rule.id, { is_active: event.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            disabled={loading}
                          />
                          {rule.is_active ? 'Active' : 'Off'}
                        </label>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={rule.notes || ''}
                          onChange={(event) => updateLocalSlaRule(rule.id, { notes: event.target.value })}
                          className={tableInputClass}
                          disabled={loading}
                        />
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="px-0 py-0 text-sm text-slate-500">
                        {loading ? <TableSkeleton rows={4} columns={5} compact /> : <div className="px-3 py-10 text-center">No SLA rules configured.</div>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}

function SwitchCard({ icon: Icon, title, description, checked, onChange, disabled }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200">
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
    </label>
  );
}

function DurationSelect({ value, onChange, disabled }) {
  const { hours, minutes } = splitDuration(value);

  return (
    <div className="grid min-w-[12rem] grid-cols-2 gap-2">
      <label className="block">
        <span className="sr-only">Hours</span>
        <select
          value={hours}
          onChange={(event) => onChange(combineDuration(event.target.value, minutes))}
          className={tableInputClass}
          disabled={disabled}
        >
          {hourOptions.map((hour) => (
            <option key={hour} value={hour}>
              {hour} hr
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Minutes</span>
        <select
          value={minutes}
          onChange={(event) => onChange(combineDuration(hours, event.target.value))}
          className={tableInputClass}
          disabled={disabled}
        >
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute}>
              {minute} min
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
