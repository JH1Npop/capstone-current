import { useEffect, useState } from 'react';
import { FiEye, FiPlus, FiSave, FiSun, FiTrash2, FiUploadCloud, FiX } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminSettings, updateAdminSettings, uploadLandingPageImage } from '../../api/admin';
import { mergeLandingSettings } from '../../utils/landingSettings';
import { PUBLIC_SITE_ASSET_UPLOAD_CAPABILITIES, PUBLIC_SITE_PUBLISH_CAPABILITIES, hasAnyCapability, isSuperadmin } from '../../rbac';

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const contentFields = [
  ['eyebrow', 'Hero eyebrow', 'Short text above the headline'],
  ['headline', 'Hero headline', 'Main landing-page headline'],
  ['highlight', 'Highlighted headline', 'Blue second line of the headline'],
  ['description', 'Hero description', 'Short value proposition'],
  ['primaryCtaLabel', 'Primary button', 'Button that opens the calculator'],
  ['secondaryCtaLabel', 'Secondary button', 'Button that jumps to services'],
  ['solarTitle', 'Solar service title', ''],
  ['solarDescription', 'Solar service description', ''],
  ['cctvTitle', 'CCTV service title', ''],
  ['cctvDescription', 'CCTV service description', ''],
  ['airconTitle', 'Aircon service title', ''],
  ['airconDescription', 'Aircon service description', ''],
  ['whyTitle', 'Why-us heading', ''],
  ['whySubtitle', 'Why-us subheading', ''],
  ['footerTitle', 'Footer call-to-action', ''],
  ['footerDescription', 'Footer description', ''],
];

const calculatorFields = [
  ['defaultPeakSunHours', 'Default peak sun hours', 1, 10, 0.1],
  ['defaultPerformanceRatio', 'Default performance ratio', 0.5, 1, 0.01],
  ['defaultPanelWattage', 'Default panel wattage', 100, 1000, 5],
  ['defaultElectricityRate', 'Default electricity rate (PHP/kWh)', 0.01, 100, 0.01],
  ['defaultDesiredOffset', 'Default desired offset (%)', 10, 100, 5],
];

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

  useEffect(() => {
    let active = true;
    fetchAdminSettings()
      .then((data) => {
        if (!active) return;
        const merged = mergeLandingSettings(data);
        setContent(merged.landingPageContent);
        setCalculator(merged.solarCalculatorSettings);
        setPromotions(merged.landingPagePromotions);
        setProjects(merged.landingPageProjects);
      })
      .catch((error) => active && setMessage({ type: 'error', text: error.message }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!canPublishLandingPage) {
      setMessage({ type: 'error', text: 'You have view-only access. Ask a superadmin for the Publish public site capability.' });
      return;
    }
    const hasBlankContent = Object.values(content).some((value) => !String(value || '').trim());
    if (hasBlankContent) {
      setMessage({ type: 'error', text: 'Landing-page text fields cannot be blank.' });
      return;
    }
    const invalidPromotion = promotions.find((promotion) => !promotion.name.trim() || (promotion.startDate && promotion.endDate && promotion.startDate > promotion.endDate));
    if (invalidPromotion) {
      setMessage({ type: 'error', text: 'Each promotion needs a name and an end date that is not before its start date.' });
      return;
    }
    const invalidPublishedProject = projects.find((project) => project.published && (
      !project.title.trim()
      || !project.serviceType
      || !project.location.trim()
      || !project.completedDate
      || !project.description.trim()
      || !project.imageUrl
      || !project.clientConsentConfirmed
    ));
    if (invalidPublishedProject) {
      setMessage({ type: 'error', text: 'Every published project needs complete details, a photo, and confirmed client permission.' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await updateAdminSettings({
        landingPageContent: content,
        solarCalculatorSettings: calculator,
        landingPagePromotions: promotions,
        landingPageProjects: projects,
      });
      const saved = mergeLandingSettings(response?.settings || response);
      setContent(saved.landingPageContent);
      setCalculator(saved.solarCalculatorSettings);
      setPromotions(saved.landingPagePromotions);
      setProjects(saved.landingPageProjects);
      setMessage({ type: 'success', text: 'Landing page published successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to publish landing page.' });
    } finally {
      setSaving(false);
    }
  };

  const uploadPromotionImage = async (promotionId, file) => {
    if (!file) return;
    if (!canUploadLandingAssets) {
      setMessage({ type: 'error', text: 'You need the Upload public-site assets capability to add an image.' });
      return;
    }
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setMessage({ type: 'error', text: 'Upload a JPG, PNG, or WebP image.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Promotion image must be 5 MB or smaller.' });
      return;
    }

    setUploadingPromotionId(promotionId);
    setMessage({ type: '', text: '' });
    try {
      const uploaded = await uploadLandingPageImage(file);
      setPromotions((items) => items.map((item) => item.id === promotionId ? {
        ...item,
        imageUrl: uploaded.url,
        imageAssetId: uploaded.id,
      } : item));
      setMessage({ type: 'success', text: 'Image uploaded. Publish changes to show it publicly.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to upload image.' });
    } finally {
      setUploadingPromotionId(null);
    }
  };

  const uploadProjectImage = async (projectId, file) => {
    if (!file) return;
    if (!canUploadLandingAssets) {
      setMessage({ type: 'error', text: 'You need the Upload public-site assets capability to add an image.' });
      return;
    }
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setMessage({ type: 'error', text: 'Upload a JPG, PNG, or WebP image.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Project image must be 5 MB or smaller.' });
      return;
    }

    setUploadingProjectId(projectId);
    setMessage({ type: '', text: '' });
    try {
      const uploaded = await uploadLandingPageImage(file);
      setProjects((items) => items.map((item) => item.id === projectId ? {
        ...item,
        imageUrl: uploaded.url,
        imageAssetId: uploaded.id,
      } : item));
      setMessage({ type: 'success', text: 'Project photo uploaded. Publish changes when the entry is ready.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to upload project image.' });
    } finally {
      setUploadingProjectId(null);
    }
  };

  return (
    <Layout>
      <div className="py-2">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Public website</p>
              <p className="mt-1 text-sm text-slate-600">Changes are shared publicly after you publish them.</p>
            </div>
            <div className="flex gap-3">
              <Link to="/admin/landing-page/preview" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <FiEye /> Preview
              </Link>
              <button type="button" onClick={save} disabled={loading || saving || !canPublishLandingPage} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                <FiSave /> {saving ? 'Publishing…' : 'Publish changes'}
              </button>
            </div>
          </div>

          {message.text ? <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.text}</div> : null}

          {!canPublishLandingPage ? <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">You have view-only access. Preview is available, but publishing requires the <strong>Publish public site</strong> capability.</div> : null}

          <fieldset disabled={loading || !canPublishLandingPage} className="contents">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-slate-900">Page content</h2>
              <p className="mt-1 text-sm text-slate-500">Edit the main public-facing text. Images and brand styling remain controlled by the application.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {contentFields.map(([key, label, hint]) => {
                  const longField = key.toLowerCase().includes('description');
                  return (
                    <label key={key} className={longField ? 'md:col-span-2' : ''}>
                      <span className="text-sm font-medium text-slate-700">{label}</span>
                      {longField ? (
                        <textarea rows="3" className={inputClass} value={content[key] || ''} disabled={loading} onChange={(event) => setContent((current) => ({ ...current, [key]: event.target.value }))} />
                      ) : (
                        <input className={inputClass} value={content[key] || ''} disabled={loading} onChange={(event) => setContent((current) => ({ ...current, [key]: event.target.value }))} />
                      )}
                      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
                    </label>
                  );
                })}
              </div>
            </section>

            <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                    <input type="number" min={min} max={max} step={step} className={inputClass} value={calculator[key]} onChange={(event) => setCalculator((current) => ({ ...current, [key]: Number(event.target.value) }))} />
                  </label>
                ))}
              </div>
            </aside>
          </div>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Products and promotions</h2>
                <p className="mt-1 text-sm text-slate-500">Schedule public offers. Expired, future, and inactive promotions stay hidden from visitors.</p>
              </div>
              <button type="button" onClick={() => setPromotions((items) => [...items, createPromotion()])} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                <FiPlus /> Add promotion
              </button>
            </div>

            {promotions.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No promotions yet. Add one when you have a product or seasonal offer to feature.</div> : null}

            <div className="mt-5 space-y-5">
              {promotions.map((promotion, index) => {
                const updatePromotion = (key, value) => setPromotions((items) => items.map((item) => item.id === promotion.id ? { ...item, [key]: value } : item));
                return (
                  <article key={promotion.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <h3 className="font-bold text-slate-800">Promotion {index + 1}{promotion.name ? `: ${promotion.name}` : ''}</h3>
                      <button type="button" onClick={() => setPromotions((items) => items.filter((item) => item.id !== promotion.id))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Delete promotion"><FiTrash2 /></button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <EditorField label="Product or promotion name"><input className={inputClass} value={promotion.name} onChange={(event) => updatePromotion('name', event.target.value)} /></EditorField>
                      <EditorField label="Regular price (PHP)"><input type="number" min="0" className={inputClass} value={promotion.regularPrice} onChange={(event) => updatePromotion('regularPrice', event.target.value)} /></EditorField>
                      <EditorField label="Promotional price (PHP)"><input type="number" min="0" className={inputClass} value={promotion.promoPrice} onChange={(event) => updatePromotion('promoPrice', event.target.value)} /></EditorField>
                      <div className="md:col-span-2 lg:col-span-3">
                        <EditorField label="Promotion image">
                          <div className="mt-1 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                            <div className="grid h-28 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 sm:w-40">
                              {promotion.imageUrl ? <img src={promotion.imageUrl} alt="Promotion preview" className="h-full w-full object-cover" /> : <FiUploadCloud className="text-3xl text-slate-300" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                                  <FiUploadCloud /> {uploadingPromotionId === promotion.id ? 'Uploading…' : promotion.imageUrl ? 'Replace photo' : 'Upload photo'}
                                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canUploadLandingAssets || uploadingPromotionId === promotion.id} className="hidden" onChange={(event) => { uploadPromotionImage(promotion.id, event.target.files?.[0]); event.target.value = ''; }} />
                                </label>
                                {promotion.imageUrl ? <button type="button" onClick={() => { updatePromotion('imageUrl', ''); updatePromotion('imageAssetId', null); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiX /> Remove photo</button> : null}
                              </div>
                              <p className="mt-2 text-xs text-slate-500">JPG, PNG, or WebP. Maximum file size: 5 MB.</p>
                              <input className={`${inputClass} mt-3`} value={promotion.imageUrl || ''} onChange={(event) => { updatePromotion('imageUrl', event.target.value); updatePromotion('imageAssetId', null); }} placeholder="Or paste /image.jpg or https://…" />
                            </div>
                          </div>
                        </EditorField>
                      </div>
                      <EditorField label="Start date"><input type="date" className={inputClass} value={promotion.startDate} onChange={(event) => updatePromotion('startDate', event.target.value)} /></EditorField>
                      <EditorField label="End date"><input type="date" className={inputClass} value={promotion.endDate} onChange={(event) => updatePromotion('endDate', event.target.value)} /></EditorField>
                      <EditorField label="Call-to-action label"><input className={inputClass} value={promotion.ctaLabel} onChange={(event) => updatePromotion('ctaLabel', event.target.value)} /></EditorField>
                      <EditorField label="Call-to-action URL"><input className={inputClass} value={promotion.ctaUrl} onChange={(event) => updatePromotion('ctaUrl', event.target.value)} placeholder="#contact or https://…" /></EditorField>
                      <EditorField label="Panel wattage (optional)"><input type="number" min="100" max="1000" className={inputClass} value={promotion.panelWattage} onChange={(event) => updatePromotion('panelWattage', event.target.value)} /><span className="mt-1 block text-xs text-slate-400">Enables “Use in calculator”.</span></EditorField>
                      <div className="md:col-span-2 lg:col-span-3"><EditorField label="Description"><textarea rows="3" className={inputClass} value={promotion.description} onChange={(event) => updatePromotion('description', event.target.value)} /></EditorField></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-5">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={promotion.active} onChange={(event) => updatePromotion('active', event.target.checked)} /> Active</label>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={promotion.featured} onChange={(event) => updatePromotion('featured', event.target.checked)} /> Featured</label>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Our Work</h2>
                <p className="mt-1 text-sm text-slate-500">Publish real completed projects only. Use a general location and confirm the client approved the photo for public use.</p>
              </div>
              <button type="button" onClick={() => setProjects((items) => [...items, createProject()])} disabled={projects.length >= 12} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
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
                  onUpload={uploadProjectImage}
                  onUpdate={(key, value) => setProjects((items) => items.map((item) => item.id === project.id ? { ...item, [key]: value } : item))}
                  onDelete={() => setProjects((items) => items.filter((item) => item.id !== project.id))}
                />
              ))}
            </div>
          </section>
          </fieldset>
        </div>
      </div>
    </Layout>
  );
}

function EditorField({ label, children }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}

function ProjectEditor({ project, index, uploading, canUpload, onUpload, onUpdate, onDelete }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800">Project {index + 1}{project.title ? `: ${project.title}` : ''}</h3>
          <p className="mt-1 text-xs text-slate-500">Drafts remain private. Published entries appear in the public Our Work section.</p>
        </div>
        <button type="button" onClick={onDelete} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Delete project"><FiTrash2 /></button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EditorField label="Project title"><input className={inputClass} value={project.title} maxLength="120" onChange={(event) => onUpdate('title', event.target.value)} /></EditorField>
        <EditorField label="Service type">
          <select className={inputClass} value={project.serviceType} onChange={(event) => onUpdate('serviceType', event.target.value)}>
            <option value="solar">Solar</option>
            <option value="cctv">CCTV</option>
            <option value="aircon">Aircon</option>
          </select>
        </EditorField>
        <EditorField label="Completion date"><input type="date" className={inputClass} value={project.completedDate} onChange={(event) => onUpdate('completedDate', event.target.value)} /></EditorField>
        <div className="md:col-span-2 lg:col-span-3">
          <EditorField label="General location only"><input className={inputClass} value={project.location} maxLength="120" onChange={(event) => onUpdate('location', event.target.value)} placeholder="Example: Malolos, Bulacan (never a street address)" /><span className="mt-1 block text-xs text-slate-500">Do not enter a client name, exact address, or identifiable property details.</span></EditorField>
        </div>
        <div className="md:col-span-2 lg:col-span-3">
          <EditorField label="Project summary"><textarea rows="3" className={inputClass} value={project.description} maxLength="500" onChange={(event) => onUpdate('description', event.target.value)} placeholder="Describe the completed scope and outcome without unsupported performance claims." /></EditorField>
        </div>
        <div className="md:col-span-2 lg:col-span-3">
          <span className="text-sm font-medium text-slate-700">Project photo</span>
          <div className="mt-1 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
            <div className="grid h-32 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 sm:w-48">
              {project.imageUrl ? <img src={project.imageUrl} alt="Project preview" className="h-full w-full object-cover" /> : <FiUploadCloud className="text-3xl text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <FiUploadCloud /> {uploading ? 'Uploading...' : project.imageUrl ? 'Replace photo' : 'Upload photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canUpload || uploading} className="hidden" onChange={(event) => { onUpload(project.id, event.target.files?.[0]); event.target.value = ''; }} />
                </label>
                {project.imageUrl ? <button type="button" onClick={() => { onUpdate('imageUrl', ''); onUpdate('imageAssetId', null); onUpdate('published', false); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiX /> Remove photo</button> : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">JPG, PNG, or WebP, up to 5 MB. Remove faces, address markers, plates, screens, and sensitive CCTV views.</p>
              <input aria-label="Project image URL" className={`${inputClass} mt-3`} value={project.imageUrl || ''} onChange={(event) => { onUpdate('imageUrl', event.target.value); onUpdate('imageAssetId', null); }} placeholder="Or paste /image.jpg or https://..." />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={Boolean(project.clientConsentConfirmed)} onChange={(event) => { onUpdate('clientConsentConfirmed', event.target.checked); if (!event.target.checked) onUpdate('published', false); }} />
          <span><strong className="block text-slate-900">Client permission confirmed</strong>The client approved this photo and non-identifying project information for public use.</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={Boolean(project.published)} disabled={!project.clientConsentConfirmed} onChange={(event) => onUpdate('published', event.target.checked)} />
          <span><strong className="block text-slate-900">Publish publicly</strong>Show this completed project in the landing page Our Work section.</span>
        </label>
      </div>
    </article>
  );
}
