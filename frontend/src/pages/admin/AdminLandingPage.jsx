import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertCircle, FiCheckCircle, FiExternalLink, FiEye, FiPlus, FiSave, FiSun, FiTrash2, FiUploadCloud, FiX } from 'react-icons/fi';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { getLocalDateInputValue } from '../../utils/date';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminSettings, updateAdminSettings, uploadLandingPageImage } from '../../api/admin';
import { REQUIRED_LANDING_CONTENT_KEYS, mergeLandingSettings } from '../../utils/landingSettings';

const LandingLocationMap = lazy(() => import('../../components/LandingLocationMap'));
import { PUBLIC_SITE_ASSET_UPLOAD_CAPABILITIES, PUBLIC_SITE_PUBLISH_CAPABILITIES, hasAnyCapability, isSuperadmin } from '../../rbac';

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

const contentFields = [
  ['eyebrow', 'Hero eyebrow', 'Short text above the headline'],
  ['headline', 'Hero headline', 'Main landing-page headline'],
  ['highlight', 'Highlighted headline', 'Blue second line of the headline'],
  ['description', 'Hero description', 'Short value proposition'],
  ['primaryCtaLabel', 'Primary button', 'Button that opens the calculator'],
  ['secondaryCtaLabel', 'Secondary button', 'Button that opens booking (registration)'],
  ['solarTitle', 'Solar service title', ''],
  ['solarDescription', 'Solar service description', ''],
  ['airconTitle', 'Aircon service title', ''],
  ['airconDescription', 'Aircon service description', ''],
  ['refrigerationTitle', 'Refrigeration service title', ''],
  ['refrigerationDescription', 'Refrigeration service description', ''],
  ['cctvTitle', 'CCTV service title', ''],
  ['cctvDescription', 'CCTV service description', ''],
  ['fireTitle', 'Fire detection service title', ''],
  ['fireDescription', 'Fire detection service description', ''],
  ['suppliesTitle', 'Supplies title', ''],
  ['suppliesDescription', 'Supplies description', ''],
  ['trainingTitle', 'Training title', ''],
  ['trainingDescription', 'Training description', ''],
  ['whyTitle', 'Why-us heading', ''],
  ['whySubtitle', 'Why-us subheading', ''],
  ['footerTitle', 'Footer call-to-action', ''],
  ['footerDescription', 'Footer description', ''],
];

// Optional contact details shown in the Contact section and footer; leave blank to hide a line.
const contactFields = [
  ['contactPhone', 'Main mobile number', 'Shown in the hero, contact section, and footer'],
  ['contactPhoneAlt', 'Second mobile number', ''],
  ['contactLandline', 'Landline', ''],
  ['contactEmail', 'Email', ''],
  ['contactAddress', 'Address', 'Also used for the Get directions link'],
  ['facebookUrl', 'Facebook page URL', ''],
  ['businessHours', 'Business hours', 'e.g. Monday to Saturday, 8:00 AM to 5:00 PM'],
  ['mapUrl', 'Google Maps link', 'Opened by the Get directions button; leave blank to search the address'],
  ['mapLatitude', 'Map pin latitude', 'Decimal degrees, e.g. 13.9908957'],
  ['mapLongitude', 'Map pin longitude', 'Decimal degrees, e.g. 121.6553907'],
];

// Optional lists; a section stays hidden on the public page until it has at least one entry.
const listEditors = [
  { key: 'highlights', title: 'Key numbers', itemLabel: 'Key number', max: 8, hint: 'Only real figures, e.g. "150+" / "Solar systems installed". Numbers count up when shown.', fields: [['value', 'Value'], ['label', 'Label']] },
  { key: 'testimonials', title: 'Client testimonials', itemLabel: 'Testimonial', max: 12, hint: "Publish only with the client's permission.", fields: [['quote', 'Quote', true], ['name', 'Client name'], ['location', 'Location (optional)']] },
  { key: 'faqs', title: 'Frequently asked questions', itemLabel: 'Question', max: 15, hint: 'Shown as an expandable list near the bottom of the page.', fields: [['question', 'Question'], ['answer', 'Answer', true]] },
];

// Tabs follow the public page from top to bottom; each says where its content appears.
const TABS = [
  { key: 'hero', label: 'Hero', where: 'The first screen visitors see: headline, description, and the two main buttons.', anchor: '' },
  { key: 'services', label: 'Services', where: 'The seven service cards under the hero, and the scrolling service strip.', anchor: '#services' },
  { key: 'proof', label: 'Numbers & testimonials', where: 'Key numbers appear after "How it works"; testimonials after the projects. Each section stays hidden until it has an entry.', anchor: '#how-it-works' },
  { key: 'projects', label: 'Projects', where: 'The "Our work" gallery of completed, client-approved projects.', anchor: '#our-work' },
  { key: 'promotions', label: 'Promotions', where: 'Scheduled product offers shown above the calculator while active.', anchor: '#promotions' },
  { key: 'calculator', label: 'Calculator', where: 'The solar estimate section and the hero "Quick solar check" both use these defaults.', anchor: '#solar-calculator' },
  { key: 'closing', label: 'Why AFN & footer', where: 'The "Why choose AFN" heading and the closing call-to-action band.', anchor: '#why-heading' },
  { key: 'faq', label: 'FAQ', where: 'The expandable questions near the bottom of the page.', anchor: '#faq' },
  { key: 'contact', label: 'Contact & map', where: 'The Contact section, map pin, directions link, and footer details.', anchor: '#contact' },
];

const FIELD_TABS = {
  hero: ['eyebrow', 'headline', 'highlight', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
  services: [
    'solarTitle', 'solarDescription', 'airconTitle', 'airconDescription', 'refrigerationTitle', 'refrigerationDescription',
    'cctvTitle', 'cctvDescription', 'fireTitle', 'fireDescription', 'suppliesTitle', 'suppliesDescription',
    'trainingTitle', 'trainingDescription',
  ],
  closing: ['whyTitle', 'whySubtitle', 'footerTitle', 'footerDescription'],
};

const FIELD_META = Object.fromEntries([...contentFields, ...contactFields].map(([key, label, hint]) => [key, { label, hint }]));
const tabForField = (key) => Object.entries(FIELD_TABS).find(([, keys]) => keys.includes(key))?.[0] || 'contact';

const calculatorFields = [
  ['defaultPeakSunHours', 'Default peak sun hours', 1, 10, 0.1],
  ['defaultPerformanceRatio', 'Default performance ratio', 0.5, 1, 0.01],
  ['defaultPanelWattage', 'Default panel wattage', 100, 1000, 5],
  ['defaultElectricityRate', 'Default electricity rate (PHP/kWh)', 0.01, 100, 0.01],
  ['defaultDesiredOffset', 'Default desired offset (%)', 10, 100, 5],
  ['defaultDaytimeUsage', 'Default share used in daytime (%)', 0, 100, 5],
  ['defaultExportCredit', 'Net-metering export credit (PHP/kWh)', 0, 100, 0.1],
];

const MAX_PROMOTIONS = 24;
const MAX_PROJECTS = 12;
const isWebUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const isLinkTarget = (value) => /^(\/|#|https?:\/\/)/i.test(String(value || '').trim());
const isImageTarget = (value) => /^(\/|https?:\/\/)/i.test(String(value || '').trim());
const isBlankNumber = (value) => value === '' || value === null || value === undefined;

// What visitors see for a promotion today (same rules as the public endpoint).
const promotionStatus = (promotion, today) => {
  if (!promotion.active) return { label: 'Hidden (inactive)', tone: 'bg-slate-200 text-slate-700' };
  if (promotion.startDate && promotion.startDate > today) return { label: `Scheduled from ${promotion.startDate}`, tone: 'bg-amber-100 text-amber-800' };
  if (promotion.endDate && promotion.endDate < today) return { label: 'Expired', tone: 'bg-rose-100 text-rose-700' };
  return { label: 'Live now', tone: 'bg-emerald-100 text-emerald-800' };
};

// Checks the draft the same way the server does, so problems are shown on the right tab.
const findDraftProblem = ({ content, calculator, promotions, projects, today }) => {
  const blankKey = REQUIRED_LANDING_CONTENT_KEYS.find((key) => !String(content[key] || '').trim());
  if (blankKey) return { tab: tabForField(blankKey), text: `"${FIELD_META[blankKey]?.label || blankKey}" cannot be blank.` };

  for (const editor of listEditors) {
    const items = (Array.isArray(content[editor.key]) ? content[editor.key] : [])
      .filter((item) => editor.fields.some(([field]) => String(item[field] || '').trim()));
    if (items.length > editor.max) {
      return { tab: editor.key === 'faqs' ? 'faq' : 'proof', text: `${editor.title}: use at most ${editor.max} entries.` };
    }
  }

  for (const [key, min, max] of [['mapLatitude', -90, 90], ['mapLongitude', -180, 180]]) {
    const raw = String(content[key] || '').trim();
    if (!raw) continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min || number > max) {
      return { tab: 'contact', text: `${FIELD_META[key].label} must be a decimal number from ${min} to ${max}.` };
    }
  }
  for (const key of ['facebookUrl', 'mapUrl']) {
    const raw = String(content[key] || '').trim();
    if (raw && !isWebUrl(raw)) return { tab: 'contact', text: `${FIELD_META[key].label} must start with https://.` };
  }

  const invalidCalculatorField = calculatorFields.find(([key, , min, max]) => {
    const value = Number(calculator[key]);
    return calculator[key] === '' || !Number.isFinite(value) || value < min || value > max;
  });
  if (invalidCalculatorField) {
    const [, label, min, max] = invalidCalculatorField;
    return { tab: 'calculator', text: `${label} must be between ${min} and ${max}.` };
  }

  for (const [index, promotion] of promotions.entries()) {
    const name = `Promotion ${index + 1}${promotion.name?.trim() ? ` (${promotion.name.trim()})` : ''}`;
    if (!promotion.name?.trim()) return { tab: 'promotions', text: `${name} needs a name.` };
    for (const [key, label] of [['regularPrice', 'regular price'], ['promoPrice', 'promotional price']]) {
      if (!isBlankNumber(promotion[key]) && !(Number(promotion[key]) >= 0)) return { tab: 'promotions', text: `${name}: the ${label} must be 0 or more.` };
    }
    if (!isBlankNumber(promotion.regularPrice) && !isBlankNumber(promotion.promoPrice) && Number(promotion.promoPrice) > Number(promotion.regularPrice)) {
      return { tab: 'promotions', text: `${name}: the promotional price cannot be higher than the regular price.` };
    }
    if (!isBlankNumber(promotion.panelWattage) && Number(promotion.panelWattage) !== 0
      && !(Number(promotion.panelWattage) >= 100 && Number(promotion.panelWattage) <= 1000)) {
      return { tab: 'promotions', text: `${name}: panel wattage must be from 100 to 1000, or blank.` };
    }
    if (promotion.startDate && promotion.endDate && promotion.startDate > promotion.endDate) {
      return { tab: 'promotions', text: `${name}: the end date cannot be before the start date.` };
    }
    if (promotion.ctaUrl?.trim() && !isLinkTarget(promotion.ctaUrl)) {
      return { tab: 'promotions', text: `${name}: the call-to-action URL must start with #, /, or https://.` };
    }
    if (promotion.imageUrl?.trim() && !isImageTarget(promotion.imageUrl)) {
      return { tab: 'promotions', text: `${name}: the image URL must start with / or https://.` };
    }
  }

  for (const [index, project] of projects.entries()) {
    const name = `Project ${index + 1}${project.title?.trim() ? ` (${project.title.trim()})` : ''}`;
    if (project.completedDate && project.completedDate > today) {
      return { tab: 'projects', text: `${name}: the completion date cannot be in the future.` };
    }
    if (project.imageUrl?.trim() && !isImageTarget(project.imageUrl)) {
      return { tab: 'projects', text: `${name}: the image URL must start with / or https://.` };
    }
    if (project.published && (
      !project.title?.trim() || !project.serviceType || !project.location?.trim() || !project.completedDate
      || !project.description?.trim() || !project.imageUrl || !project.clientConsentConfirmed
    )) {
      return { tab: 'projects', text: `${name} needs complete details, a photo, and confirmed client permission before it can be published.` };
    }
  }
  return null;
};

const createPromotion = () => ({
  id: `promotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '', description: '', regularPrice: '', promoPrice: '', imageUrl: '',
  startDate: '', endDate: '', featured: false, active: true,
  ctaLabel: 'Learn more', ctaUrl: '#contact', panelWattage: '',
});

const createProject = () => ({
  id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: '', serviceType: 'solar', location: '', completedDate: '', description: '',
  imageUrl: '', imageAssetId: null, clientConsentConfirmed: false, published: false,
});

export default function AdminLandingPage() {
  const { user } = useAuth();
  const canPublishLandingPage = isSuperadmin(user) || hasAnyCapability(user, PUBLIC_SITE_PUBLISH_CAPABILITIES);
  const canUploadLandingAssets = isSuperadmin(user) || hasAnyCapability(user, PUBLIC_SITE_ASSET_UPLOAD_CAPABILITIES);
  const [content, setContent] = useState(() => mergeLandingSettings().landingPageContent);
  const [calculator, setCalculator] = useState(() => mergeLandingSettings().solarCalculatorSettings);
  const [promotions, setPromotions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPromotionId, setUploadingPromotionId] = useState(null);
  const [uploadingProjectId, setUploadingProjectId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Upload results are shown next to the photo they belong to, not at the top of the page.
  const [imageNotice, setImageNotice] = useState({ id: null, type: '', text: '' });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingLeave, setPendingLeave] = useState(null);
  const navigate = useNavigate();
  const today = getLocalDateInputValue();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((tab) => tab.key === searchParams.get('tab')) ? searchParams.get('tab') : 'hero';
  const currentTab = TABS.find((tab) => tab.key === activeTab);
  const openTab = (key) => setSearchParams((params) => { params.set('tab', key); return params; }, { replace: true });
  const [publishedSnapshot, setPublishedSnapshot] = useState('');
  const draftSnapshot = useMemo(
    () => JSON.stringify({ content, calculator, promotions, projects }),
    [content, calculator, promotions, projects],
  );
  const hasUnsavedChanges = Boolean(publishedSnapshot) && draftSnapshot !== publishedSnapshot;
  const updateContent = (key, value) => setContent((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    fetchAdminSettings()
      .then((data) => {
        if (!active) return;
        const merged = mergeLandingSettings(data);
        setContent(merged.landingPageContent);
        setCalculator(merged.solarCalculatorSettings);
        setPromotions(merged.landingPagePromotions);
        setProjects(merged.landingPageProjects);
        setPublishedSnapshot(JSON.stringify({
          content: merged.landingPageContent,
          calculator: merged.solarCalculatorSettings,
          promotions: merged.landingPagePromotions,
          projects: merged.landingPageProjects,
        }));
      })
      .catch((error) => active && setLoadError(error.message || 'Unable to load the landing page content.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadAttempt]);

  // Closing or reloading the tab warns while there are unpublished changes.
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  // Leaving through an in-app link (sidebar, top bar) asks first while there are unpublished changes.
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const guard = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingLeave(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [hasUnsavedChanges]);

  const showImageNotice = useCallback((id, type, text) => setImageNotice({ id, type, text }), []);

  const save = async () => {
    if (!canPublishLandingPage) {
      setMessage({ type: 'error', text: 'You have view-only access. Ask a superadmin for the Publish public site capability.' });
      return;
    }
    const problem = findDraftProblem({ content, calculator, promotions, projects, today });
    if (problem) {
      openTab(problem.tab);
      setMessage({ type: 'error', text: problem.text });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await updateAdminSettings({
        landingPageContent: content,
        solarCalculatorSettings: {
          ...calculator,
          ...Object.fromEntries(calculatorFields.map(([key]) => [key, Number(calculator[key])])),
        },
        landingPagePromotions: promotions,
        landingPageProjects: projects,
      });
      const saved = mergeLandingSettings(response?.settings || response);
      setContent(saved.landingPageContent);
      setCalculator(saved.solarCalculatorSettings);
      setPromotions(saved.landingPagePromotions);
      setProjects(saved.landingPageProjects);
      setPublishedSnapshot(JSON.stringify({
        content: saved.landingPageContent,
        calculator: saved.solarCalculatorSettings,
        promotions: saved.landingPagePromotions,
        projects: saved.landingPageProjects,
      }));
      setMessage({ type: 'success', text: 'Landing page published successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to publish landing page.' });
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (kind, itemId, file) => {
    if (!file) return;
    const setItems = kind === 'promotion' ? setPromotions : setProjects;
    const setUploading = kind === 'promotion' ? setUploadingPromotionId : setUploadingProjectId;
    if (!canUploadLandingAssets) {
      showImageNotice(itemId, 'error', 'You need the Upload public-site assets capability to add an image.');
      return;
    }
    if (!new Set(['image/jpeg', 'image/png', 'image/webp']).has(file.type)) {
      showImageNotice(itemId, 'error', `"${file.name}" is not a JPG, PNG, or WebP image.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showImageNotice(itemId, 'error', `"${file.name}" is larger than 5 MB.`);
      return;
    }

    setUploading(itemId);
    showImageNotice(itemId, '', '');
    try {
      const uploaded = await uploadLandingPageImage(file);
      setItems((items) => items.map((item) => item.id === itemId ? {
        ...item,
        imageUrl: uploaded.url,
        imageAssetId: uploaded.id,
      } : item));
      showImageNotice(itemId, 'success', 'Photo uploaded. Publish changes to show it publicly.');
    } catch (error) {
      showImageNotice(itemId, 'error', error.message || 'Unable to upload the image.');
    } finally {
      setUploading(null);
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const setItems = pendingDelete.kind === 'promotion' ? setPromotions : setProjects;
    setItems((items) => items.filter((item) => item.id !== pendingDelete.id));
    setMessage({ type: 'success', text: `Removed ${pendingDelete.name} from the draft. Publish changes to update the public site.` });
    setPendingDelete(null);
  };

  return (
    <Layout>
      <div className="py-2">
        <div className="mx-auto max-w-6xl">
          <div className="sticky top-0 z-20 -mx-1 mb-5 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Public website</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600" role="status" data-testid="landing-save-state">
                  {loading ? 'Loading published content…' : loadError ? (
                    <><FiAlertCircle className="text-rose-500" /> The content could not be loaded, so editing is paused.</>
                  ) : hasUnsavedChanges ? (
                    <><FiAlertCircle className="text-amber-500" /> Unsaved changes — publish to update the public site.</>
                  ) : (
                    <><FiCheckCircle className="text-emerald-500" /> Everything here is published.</>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <Link to={`/admin/landing-page/preview${currentTab?.anchor || ''}`} target="_blank" rel="noopener" title="Opens the published page in a new tab" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <FiEye /> Preview
                </Link>
                <button type="button" onClick={save} disabled={loading || saving || Boolean(loadError) || !canPublishLandingPage || !hasUnsavedChanges} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  <FiSave /> {saving ? 'Publishing…' : 'Publish changes'}
                </button>
              </div>
            </div>
          </div>

          {loadError ? (
            <div role="alert" className="mb-5 flex flex-col justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:flex-row sm:items-center">
              <span>{loadError}</span>
              <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-100">Retry</button>
            </div>
          ) : null}

          {message.text ? (
            <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              <span>{message.text}</span>
              <button type="button" onClick={() => setMessage({ type: '', text: '' })} className="shrink-0 font-semibold">Dismiss</button>
            </div>
          ) : null}

          {!canPublishLandingPage ? <div className="mb-5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">You have view-only access. Preview is available, but publishing requires the <strong>Publish public site</strong> capability.</div> : null}

          <nav aria-label="Landing page sections" className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => openTab(tab.key)}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-brand-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mb-5 flex flex-col justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-900 sm:flex-row sm:items-center">
            <p><strong>Where this appears:</strong> {currentTab?.where}</p>
            <Link to={`/admin/landing-page/preview${currentTab?.anchor || ''}`} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
              View on the published page <FiExternalLink />
            </Link>
          </div>

          <fieldset disabled={loading || Boolean(loadError) || !canPublishLandingPage} className="contents">
          {activeTab === 'hero' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <EditorPanel title="Hero" description="Keep the headline short; the highlighted line appears in brand blue underneath it.">
                <ContentFields keys={FIELD_TABS.hero} content={content} onChange={updateContent} />
              </EditorPanel>
              <HeroPreview content={content} />
            </div>
          ) : null}

          {activeTab === 'services' ? (
            <EditorPanel title="Service cards" description="Short titles and one-sentence descriptions read best on phones, where cards sit two per row.">
              <ContentFields keys={FIELD_TABS.services} content={content} onChange={updateContent} />
            </EditorPanel>
          ) : null}

          {activeTab === 'proof' ? (
            <div className="space-y-6">
              {listEditors.filter((editor) => editor.key !== 'faqs').map((editor) => (
                <ListEditor
                  key={editor.key}
                  editor={editor}
                  items={Array.isArray(content[editor.key]) ? content[editor.key] : []}
                  onChange={(items) => updateContent(editor.key, items)}
                />
              ))}
            </div>
          ) : null}

          {activeTab === 'faq' ? (
            <ListEditor
              editor={listEditors.find((editor) => editor.key === 'faqs')}
              items={Array.isArray(content.faqs) ? content.faqs : []}
              onChange={(items) => updateContent('faqs', items)}
            />
          ) : null}

          {activeTab === 'closing' ? (
            <EditorPanel title="Why AFN and closing call-to-action" description="Headings around the reasons section and the band above the footer.">
              <ContentFields keys={FIELD_TABS.closing} content={content} onChange={updateContent} />
            </EditorPanel>
          ) : null}

          {activeTab === 'contact' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <EditorPanel title="Contact and location" description="Blank lines are hidden on the public page. Paste your Google Maps link so Get directions opens your listing.">
                <ContentFields keys={contactFields.map(([key]) => key)} content={content} onChange={updateContent} columns={1} />
              </EditorPanel>
              <MapPreview content={content} />
            </div>
          ) : null}

          {activeTab === 'calculator' ? (
            <section className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2"><FiSun className="text-amber-500" /><h2 className="font-bold text-slate-900">Solar calculator</h2></div>
              <label className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
                Show calculator
                <input type="checkbox" checked={Boolean(calculator.enabled)} onChange={(event) => setCalculator((current) => ({ ...current, enabled: event.target.checked }))} />
              </label>
              <label className="mt-4 block"><span className="text-sm font-medium text-slate-700">Calculator heading</span><input className={inputClass} value={calculator.title || ''} onChange={(event) => setCalculator((current) => ({ ...current, title: event.target.value }))} /></label>
              <label className="mt-4 block"><span className="text-sm font-medium text-slate-700">Calculator description</span><textarea rows="3" className={inputClass} value={calculator.description || ''} onChange={(event) => setCalculator((current) => ({ ...current, description: event.target.value }))} /></label>
              <div className="mt-4 space-y-4">
                {calculatorFields.map(([key, label, min, max, step]) => (
                  <label key={key} className="block">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                    <input type="number" min={min} max={max} step={step} className={inputClass} value={calculator[key]} onChange={(event) => setCalculator((current) => ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
              </div>
              <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-900">
                Peak sun hours × performance ratio is the energy each kW of panels makes per day. For your exact site, divide the Global Solar Atlas &ldquo;PVOUT specific&rdquo; yearly value by 365. Update the electricity rate and export credit from your utility&rsquo;s monthly rate advisory; savings show as a range from daytime use only up to full net-metering credit.
              </p>
            </section>
          ) : null}

          {activeTab === 'promotions' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Products and promotions</h2>
                <p className="mt-1 text-sm text-slate-500">Schedule public offers. Expired, future, and inactive promotions stay hidden from visitors.</p>
              </div>
              <button type="button" onClick={() => setPromotions((items) => [...items, createPromotion()])} disabled={promotions.length >= MAX_PROMOTIONS} title={promotions.length >= MAX_PROMOTIONS ? `Up to ${MAX_PROMOTIONS} promotions` : undefined} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                <FiPlus /> Add promotion
              </button>
            </div>

            {promotions.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No promotions yet. Add one when you have a product or seasonal offer to feature.</div> : null}

            <div className="mt-5 space-y-5">
              {promotions.map((promotion, index) => {
                const updatePromotion = (changes) => setPromotions((items) => items.map((item) => item.id === promotion.id ? { ...item, ...changes } : item));
                const heading = `Promotion ${index + 1}${promotion.name ? `: ${promotion.name}` : ''}`;
                const status = promotionStatus(promotion, today);
                return (
                  <article key={promotion.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-800">{heading}</h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
                      </div>
                      <button type="button" onClick={() => setPendingDelete({ kind: 'promotion', id: promotion.id, name: promotion.name ? `"${promotion.name}"` : `promotion ${index + 1}` })} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete ${heading}`} title="Delete promotion"><FiTrash2 /></button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <EditorField label="Product or promotion name"><input className={inputClass} value={promotion.name} maxLength={120} onChange={(event) => updatePromotion({ name: event.target.value })} /></EditorField>
                      <EditorField label="Regular price (PHP)"><input type="number" min="0" className={inputClass} value={promotion.regularPrice} onChange={(event) => updatePromotion({ regularPrice: event.target.value })} /></EditorField>
                      <EditorField label="Promotional price (PHP)"><input type="number" min="0" className={inputClass} value={promotion.promoPrice} onChange={(event) => updatePromotion({ promoPrice: event.target.value })} /></EditorField>
                      <div className="md:col-span-2 lg:col-span-3">
                        <span className="text-sm font-medium text-slate-700">Promotion image</span>
                          <div className="mt-1 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                            <div className="grid h-28 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 sm:w-40">
                              {promotion.imageUrl ? <img src={promotion.imageUrl} alt="Promotion preview" className="h-full w-full object-cover" /> : <FiUploadCloud className="text-3xl text-slate-300" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-brand-300 hover:bg-brand-700">
                                  <FiUploadCloud /> {uploadingPromotionId === promotion.id ? 'Uploading…' : promotion.imageUrl ? 'Replace photo' : 'Upload photo'}
                                  <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload photo for ${heading}`} disabled={!canUploadLandingAssets || uploadingPromotionId === promotion.id} className="sr-only" onChange={(event) => { uploadImage('promotion', promotion.id, event.target.files?.[0]); event.target.value = ''; }} />
                                </label>
                                {promotion.imageUrl ? <button type="button" onClick={() => updatePromotion({ imageUrl: '', imageAssetId: null })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiX /> Remove photo</button> : null}
                              </div>
                              <p className="mt-2 text-xs text-slate-500">JPG, PNG, or WebP. Maximum file size: 5 MB.</p>
                              <ImageNotice notice={imageNotice} id={promotion.id} />
                              <input aria-label="Promotion image URL" className={`${inputClass} mt-3`} value={promotion.imageUrl || ''} onChange={(event) => updatePromotion({ imageUrl: event.target.value, imageAssetId: null })} placeholder="Or paste /image.jpg or https://…" />
                            </div>
                          </div>
                      </div>
                      <EditorField label="Start date"><input type="date" className={inputClass} value={promotion.startDate} max={promotion.endDate || undefined} onChange={(event) => updatePromotion({ startDate: event.target.value })} /></EditorField>
                      <EditorField label="End date"><input type="date" className={inputClass} value={promotion.endDate} min={promotion.startDate || undefined} onChange={(event) => updatePromotion({ endDate: event.target.value })} /></EditorField>
                      <EditorField label="Call-to-action label"><input className={inputClass} value={promotion.ctaLabel} maxLength={80} onChange={(event) => updatePromotion({ ctaLabel: event.target.value })} /></EditorField>
                      <EditorField label="Call-to-action URL"><input className={inputClass} value={promotion.ctaUrl} onChange={(event) => updatePromotion({ ctaUrl: event.target.value })} placeholder="#contact or https://…" /></EditorField>
                      <EditorField label="Panel wattage (optional)"><input type="number" min="100" max="1000" className={inputClass} value={promotion.panelWattage} onChange={(event) => updatePromotion({ panelWattage: event.target.value })} /><span className="mt-1 block text-xs text-slate-400">Enables “Use in calculator”.</span></EditorField>
                      <div className="md:col-span-2 lg:col-span-3"><EditorField label="Description"><textarea rows="3" maxLength={500} className={inputClass} value={promotion.description} onChange={(event) => updatePromotion({ description: event.target.value })} /></EditorField></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-5">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={promotion.active} onChange={(event) => updatePromotion({ active: event.target.checked })} /> Active</label>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={promotion.featured} onChange={(event) => updatePromotion({ featured: event.target.checked })} /> Featured</label>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          ) : null}

          {activeTab === 'projects' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Our Work</h2>
                <p className="mt-1 text-sm text-slate-500">Publish real completed projects only. Use a general location and confirm the client approved the photo for public use.</p>
              </div>
              <button type="button" onClick={() => setProjects((items) => [...items, createProject()])} disabled={projects.length >= MAX_PROJECTS} title={projects.length >= MAX_PROJECTS ? `Up to ${MAX_PROJECTS} projects` : undefined} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                <FiPlus /> Add completed project
              </button>
            </div>

            {projects.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No completed projects added yet. This section stays hidden from visitors until a permitted project is published.</div> : null}

            <div className="mt-5 space-y-5">
              {projects.map((project, index) => (
                <ProjectEditor
                  key={project.id}
                  project={project}
                  index={index}
                  uploading={uploadingProjectId === project.id}
                  canUpload={canUploadLandingAssets}
                  today={today}
                  imageNotice={imageNotice}
                  onUpload={(projectId, file) => uploadImage('project', projectId, file)}
                  onUpdate={(changes) => setProjects((items) => items.map((item) => item.id === project.id ? { ...item, ...changes } : item))}
                  onDelete={() => setPendingDelete({ kind: 'project', id: project.id, name: project.title ? `"${project.title}"` : `project ${index + 1}` })}
                />
              ))}
            </div>
          </section>
          ) : null}
          </fieldset>
        </div>
      </div>

      {pendingDelete ? (
        <ConfirmationDialog
          title={`Delete ${pendingDelete.name}?`}
          message="It is removed from the draft. Visitors still see it until you publish changes."
          tone="danger"
          icon="danger"
          confirmLabel="Delete"
          cancelLabel="Keep it"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}

      {pendingLeave ? (
        <ConfirmationDialog
          title="Leave without publishing?"
          message="Your landing page changes have not been published. Leaving this page discards them."
          tone="warning"
          icon="warning"
          confirmLabel="Leave and discard"
          cancelLabel="Stay on this page"
          onCancel={() => setPendingLeave(null)}
          onConfirm={() => {
            const target = pendingLeave;
            setPendingLeave(null);
            setPublishedSnapshot(draftSnapshot);
            navigate(target);
          }}
        />
      ) : null}
    </Layout>
  );
}

function EditorPanel({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ContentFields({ keys, content, onChange, columns = 2 }) {
  return (
    <div className={`grid gap-4 ${columns === 2 ? 'md:grid-cols-2' : ''}`}>
      {keys.map((key) => {
        const meta = FIELD_META[key] || { label: key, hint: '' };
        const longField = key.toLowerCase().includes('description');
        const value = typeof content[key] === 'string' ? content[key] : '';
        return (
          <label key={key} className={longField && columns === 2 ? 'md:col-span-2' : ''}>
            <span className="flex items-baseline justify-between gap-3 text-sm font-medium text-slate-700">
              {meta.label}
              <span className={`text-xs font-normal ${value.length > 450 ? 'text-amber-600' : 'text-slate-400'}`}>{value.length}/500</span>
            </span>
            {longField ? (
              <textarea rows="3" maxLength={500} className={inputClass} value={value} onChange={(event) => onChange(key, event.target.value)} />
            ) : (
              <input maxLength={500} className={inputClass} value={value} onChange={(event) => onChange(key, event.target.value)} />
            )}
            {meta.hint ? <span className="mt-1 block text-xs text-slate-400">{meta.hint}</span> : null}
          </label>
        );
      })}
    </div>
  );
}

// Live sketch of the public hero so wording and line breaks can be judged before publishing.
function HeroPreview({ content }) {
  return (
    <aside className="h-fit overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview (unsaved text)</p>
      <div className="bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200 p-5">
        <span className="inline-flex rounded-full border border-brand-200 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">{content.eyebrow}</span>
        <p className="mt-3 text-xl font-extrabold leading-tight text-slate-950">
          {content.headline}
          <span className="block text-brand-600">{content.highlight}</span>
        </p>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{content.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">{content.primaryCtaLabel}</span>
          <span className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-800">{content.secondaryCtaLabel}</span>
        </div>
      </div>
    </aside>
  );
}

// Shows exactly where the public map pin lands, and checks the directions link, before publishing.
function MapPreview({ content }) {
  const latitude = Number.parseFloat(content.mapLatitude);
  const longitude = Number.parseFloat(content.mapLongitude);
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return (
    <aside className="h-fit overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Map pin preview</p>
      <div className="h-80 bg-slate-100">
        {valid ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map…</div>}>
            <LandingLocationMap key={`${latitude},${longitude}`} latitude={latitude} longitude={longitude} label="AFN Solar Power Engineering Services" />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">Enter a valid latitude and longitude to place the pin.</div>
        )}
      </div>
      {content.mapUrl ? (
        <a href={content.mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-3 text-sm font-semibold text-brand-700 hover:text-brand-800">
          Test the Get directions link <FiExternalLink />
        </a>
      ) : null}
    </aside>
  );
}

function ListEditor({ editor, items, onChange }) {
  const emptyItem = Object.fromEntries(editor.fields.map(([field]) => [field, '']));
  const update = (index, field, value) => onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{editor.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{editor.hint} Up to {editor.max}.</p>
        </div>
        <button type="button" onClick={() => onChange([...items, { ...emptyItem }])} disabled={items.length >= editor.max} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          <FiPlus /> Add {editor.itemLabel.toLowerCase()}
        </button>
      </div>
      {items.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No entries yet. This section stays hidden on the public page until you add one.</div> : null}
      <div className="mt-5 space-y-4">
        {items.map((item, index) => (
          <article key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="font-bold text-slate-800">{editor.itemLabel} {index + 1}</h3>
              <button type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete ${editor.itemLabel.toLowerCase()} ${index + 1}`} title="Delete entry"><FiTrash2 /></button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {editor.fields.map(([field, label, long]) => (
                <label key={field} className={long ? 'md:col-span-2' : ''}>
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                  {long ? (
                    <textarea rows="3" maxLength={500} className={inputClass} value={item[field] || ''} onChange={(event) => update(index, field, event.target.value)} />
                  ) : (
                    <input maxLength={500} className={inputClass} value={item[field] || ''} onChange={(event) => update(index, field, event.target.value)} />
                  )}
                </label>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ImageNotice({ notice, id }) {
  if (notice.id !== id || !notice.text) return null;
  return (
    <p role={notice.type === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs font-medium ${notice.type === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
      {notice.text}
    </p>
  );
}

function EditorField({ label, children }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}

function ProjectEditor({ project, index, uploading, canUpload, today, imageNotice, onUpload, onUpdate, onDelete }) {
  const heading = `Project ${index + 1}${project.title ? `: ${project.title}` : ''}`;
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-800">{heading}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${project.published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{project.published ? 'Published' : 'Draft'}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Drafts remain private. Published entries appear in the public Our Work section.</p>
        </div>
        <button type="button" onClick={onDelete} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete ${heading}`} title="Delete project"><FiTrash2 /></button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EditorField label="Project title"><input className={inputClass} value={project.title} maxLength="120" onChange={(event) => onUpdate({ title: event.target.value })} /></EditorField>
        <EditorField label="Service type">
          <select className={inputClass} value={project.serviceType} onChange={(event) => onUpdate({ serviceType: event.target.value })}>
            <option value="solar">Solar</option>
            <option value="cctv">CCTV</option>
            <option value="aircon">Aircon</option>
          </select>
        </EditorField>
        <EditorField label="Completion date"><input type="date" className={inputClass} value={project.completedDate} max={today} onChange={(event) => onUpdate({ completedDate: event.target.value })} /></EditorField>
        <div className="md:col-span-2 lg:col-span-3">
          <EditorField label="General location only"><input className={inputClass} value={project.location} maxLength="120" onChange={(event) => onUpdate({ location: event.target.value })} placeholder="Example: Malolos, Bulacan (never a street address)" /><span className="mt-1 block text-xs text-slate-500">Do not enter a client name, exact address, or identifiable property details.</span></EditorField>
        </div>
        <div className="md:col-span-2 lg:col-span-3">
          <EditorField label="Project summary"><textarea rows="3" className={inputClass} value={project.description} maxLength="500" onChange={(event) => onUpdate({ description: event.target.value })} placeholder="Describe the completed scope and outcome without unsupported performance claims." /></EditorField>
        </div>
        <div className="md:col-span-2 lg:col-span-3">
          <span className="text-sm font-medium text-slate-700">Project photo</span>
          <div className="mt-1 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
            <div className="grid h-32 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 sm:w-48">
              {project.imageUrl ? <img src={project.imageUrl} alt="Project preview" className="h-full w-full object-cover" /> : <FiUploadCloud className="text-3xl text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-brand-300 hover:bg-brand-700">
                  <FiUploadCloud /> {uploading ? 'Uploading…' : project.imageUrl ? 'Replace photo' : 'Upload photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload photo for ${heading}`} disabled={!canUpload || uploading} className="sr-only" onChange={(event) => { onUpload(project.id, event.target.files?.[0]); event.target.value = ''; }} />
                </label>
                {project.imageUrl ? <button type="button" onClick={() => onUpdate({ imageUrl: '', imageAssetId: null, published: false })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiX /> Remove photo</button> : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">JPG, PNG, or WebP, up to 5 MB. Remove faces, address markers, plates, screens, and sensitive CCTV views.</p>
              <ImageNotice notice={imageNotice} id={project.id} />
              <input aria-label="Project image URL" className={`${inputClass} mt-3`} value={project.imageUrl || ''} onChange={(event) => onUpdate({ imageUrl: event.target.value, imageAssetId: null })} placeholder="Or paste /image.jpg or https://..." />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={Boolean(project.clientConsentConfirmed)} onChange={(event) => onUpdate(event.target.checked ? { clientConsentConfirmed: true } : { clientConsentConfirmed: false, published: false })} />
          <span><strong className="block text-slate-900">Client permission confirmed</strong>The client approved this photo and non-identifying project information for public use.</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={Boolean(project.published)} disabled={!project.clientConsentConfirmed} onChange={(event) => onUpdate({ published: event.target.checked })} />
          <span><strong className="block text-slate-900">Publish publicly</strong>Show this completed project in the landing page Our Work section.</span>
        </label>
      </div>
    </article>
  );
}
