import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiCheck, FiCheckSquare, FiImage, FiSend, FiTrash2 } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import TechnicalDataSheetForm from '../../components/documents/TechnicalDataSheetForm';
import { fetchTechnicianJob, submitInspectionChecklist } from '../../api/technician';
import { formatTicketId } from '../../utils/roleIds';

const RECOMMENDATIONS = [
  { value: 'Approved', label: 'Ready for service', description: 'The work can proceed without site preparation.' },
  { value: 'Conditional', label: 'Proceed after setup', description: 'Resolve the recorded conditions before work starts.' },
  { value: 'Rejected', label: 'Cannot proceed', description: 'The site is currently unsuitable for the requested work.' },
];

const draftKey = (ticketId) => `technician-inspection-draft:${ticketId}`;

function AnswerButtons({ value, onChange, label }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={label}>
      {[
        { answer: true, text: 'Yes' },
        { answer: false, text: 'No' },
      ].map(({ answer, text }) => {
        const selected = value === answer;
        return (
          <button
            key={text}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(answer)}
            className={`min-h-11 rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${selected
              ? answer
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-rose-600 bg-rose-600 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            {selected && <FiCheck className="mr-1 inline" />} {text}
          </button>
        );
      })}
    </div>
  );
}

export default function TechnicianInspectionChecklist() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ticketId = searchParams.get('ticketId') || searchParams.get('jobId');
  const photoInputRef = useRef(null);

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(Boolean(ticketId));
  const [error, setError] = useState(ticketId ? '' : 'Open an inspection job first.');
  const [siteAccessible, setSiteAccessible] = useState(null);
  const [siteAccessibleNotes, setSiteAccessibleNotes] = useState('');
  const [electricalAdequate, setElectricalAdequate] = useState(null);
  const [electricalNotes, setElectricalNotes] = useState('');
  const [safetyEquipment, setSafetyEquipment] = useState(null);
  const [safetyHazards, setSafetyHazards] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [techNotes, setTechNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [activeTab, setActiveTab] = useState('inspection');
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    const loadJob = async () => {
      setLoading(true);
      try {
        const jobData = await fetchTechnicianJob(ticketId);
        setJob(jobData);
        setError('');
      } catch (loadError) {
        setError(loadError.message || 'Unable to load the inspection job.');
      } finally {
        setLoading(false);
      }
    };
    loadJob();
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    try {
      const savedDraft = JSON.parse(localStorage.getItem(draftKey(ticketId)) || 'null');
      if (savedDraft) {
        setSiteAccessible(savedDraft.siteAccessible ?? null);
        setSiteAccessibleNotes(savedDraft.siteAccessibleNotes || '');
        setElectricalAdequate(savedDraft.electricalAdequate ?? null);
        setElectricalNotes(savedDraft.electricalNotes || '');
        setSafetyEquipment(savedDraft.safetyEquipment ?? null);
        setSafetyHazards(savedDraft.safetyHazards || '');
        setRecommendation(savedDraft.recommendation || '');
        setTechNotes(savedDraft.techNotes || '');
      }
    } catch {
      localStorage.removeItem(draftKey(ticketId));
    }
    setDraftLoaded(true);
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId || !draftLoaded) return;
    localStorage.setItem(draftKey(ticketId), JSON.stringify({
      siteAccessible,
      siteAccessibleNotes,
      electricalAdequate,
      electricalNotes,
      safetyEquipment,
      safetyHazards,
      recommendation,
      techNotes,
    }));
  }, [ticketId, draftLoaded, siteAccessible, siteAccessibleNotes, electricalAdequate, electricalNotes, safetyEquipment, safetyHazards, recommendation, techNotes]);

  const answeredCount = [siteAccessible, electricalAdequate, safetyEquipment]
    .filter((value) => typeof value === 'boolean').length;
  const completionCount = answeredCount + (recommendation ? 1 : 0) + (photos.length > 0 ? 1 : 0);
  const completionPercent = (completionCount / 5) * 100;
  const photoSummary = useMemo(
    () => photos.length === 1 ? '1 site photo selected' : `${photos.length} site photos selected`,
    [photos.length],
  );

  const handlePhotoSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (selectedFiles.length > 0) {
      setPhotos((previous) => [...previous, ...selectedFiles]);
      setFieldErrors((previous) => ({ ...previous, photos: '' }));
      setMessage('');
    }
    event.target.value = '';
  };

  const chooseAnswer = (field, value) => {
    setFieldErrors((previous) => ({ ...previous, [field]: '' }));
    setMessage('');
    if (field === 'siteAccessible') {
      setSiteAccessible(value);
      if (value) setSiteAccessibleNotes('');
    } else if (field === 'electricalAdequate') {
      setElectricalAdequate(value);
      if (value) setElectricalNotes('');
    } else {
      setSafetyEquipment(value);
      if (value) setSafetyHazards('');
    }
  };

  const validate = () => {
    const errors = {};
    if (siteAccessible === null) errors.siteAccessible = 'Choose Yes or No.';
    if (siteAccessible === false && !siteAccessibleNotes.trim()) errors.siteAccessibleNotes = 'Explain the access problem.';
    if (electricalAdequate === null) errors.electricalAdequate = 'Choose Yes or No.';
    if (electricalAdequate === false && !electricalNotes.trim()) errors.electricalNotes = 'Describe the electrical issue.';
    if (safetyEquipment === null) errors.safetyEquipment = 'Choose Yes or No.';
    if (safetyEquipment === false && !safetyHazards.trim()) errors.safetyHazards = 'Describe the safety issue or missing equipment.';
    if (!recommendation) errors.recommendation = 'Choose an overall recommendation.';
    if (photos.length === 0) errors.photos = 'Add at least one site photo.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!ticketId || submitting) return;
    if (!validate()) {
      setMessage('Review the highlighted items before completing the inspection.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    setMessage('Submitting inspection and site evidence...');
    try {
      await submitInspectionChecklist(ticketId, {
        notes: techNotes.trim(),
        photos,
        siteAccessible,
        siteAccessibleNotes: siteAccessible ? '' : siteAccessibleNotes.trim(),
        electricalAdequate,
        electricalNotes: electricalAdequate ? '' : electricalNotes.trim(),
        safetyEquipmentPresent: safetyEquipment,
        safetyHazards: safetyEquipment ? '' : safetyHazards.trim(),
        recommendation,
      });
      localStorage.removeItem(draftKey(ticketId));
      setMessage('Inspection submitted successfully.');
      setTimeout(() => navigate('/technician/dashboard'), 1200);
    } catch (submitError) {
      setMessage(submitError.message || 'Failed to submit inspection.');
      setSubmitting(false);
    }
  };

  if (loading) return <Layout><PanelSkeleton rows={5} /></Layout>;

  if (!ticketId || error || !job) {
    return (
      <Layout>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-semibold">Unable to open inspection</h2>
          <p className="mt-2 text-sm">{error || 'Job not found.'}</p>
          <Link to="/technician/my-jobs" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-white">Back to My Jobs</Link>
        </div>
      </Layout>
    );
  }

  if (job?.checklistCompleted || job?.status === 'inspection_completed') {
    return (
      <Layout>
        <div className="max-w-2xl rounded-2xl border border-green-200 bg-green-50 p-6 text-green-900">
          <h2 className="flex items-center gap-2 text-xl font-semibold"><FiCheckSquare /> Inspection Already Completed</h2>
          <p className="mt-2 text-sm">The inspection checklist for this job has already been submitted.</p>
          <Link to="/technician/dashboard" className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800">Back to Dashboard</Link>
        </div>
      </Layout>
    );
  }

  const questions = [
    { key: 'siteAccessible', label: 'Is the site accessible?', hint: 'Confirm that the team and equipment can safely reach the work area.', value: siteAccessible, notes: siteAccessibleNotes, setNotes: setSiteAccessibleNotes, notesKey: 'siteAccessibleNotes', placeholder: 'Explain the access problem and what is needed...' },
    { key: 'electricalAdequate', label: 'Is the electrical supply adequate?', hint: 'Check the available supply against the expected service requirements.', value: electricalAdequate, notes: electricalNotes, setNotes: setElectricalNotes, notesKey: 'electricalNotes', placeholder: 'Describe the electrical issue and required correction...' },
    { key: 'safetyEquipment', label: 'Is required safety equipment present?', hint: 'Confirm PPE, barriers, isolation equipment, and site controls.', value: safetyEquipment, notes: safetyHazards, setNotes: setSafetyHazards, notesKey: 'safetyHazards', placeholder: 'Describe missing equipment or hazards...' },
  ];

  return (
    <Layout>
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelection} />
      <div className="mx-auto max-w-3xl pb-28 sm:pb-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-800"><FiCheckSquare className="text-purple-500" /> Site Inspection</h2>
            <p className="mt-1 text-slate-600">{formatTicketId(ticketId)} for {job.client?.full_name || job.client}</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">Answers save on this device</div>
        </div>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <span className="font-semibold">Draft reminder:</span> answers and notes are saved on this device.
          Selected site photos are not saved after a refresh, so attach them again before completing the inspection.
        </div>

        <div className="mb-6 flex gap-4 overflow-x-auto border-b border-slate-200">
          <button type="button" onClick={() => setActiveTab('inspection')} className={`whitespace-nowrap px-1 pb-3 text-sm font-medium ${activeTab === 'inspection' ? 'border-b-2 border-purple-500 text-purple-700' : 'text-slate-500'}`}>Site Inspection</button>
          <button type="button" onClick={() => setActiveTab('tds')} className={`whitespace-nowrap px-1 pb-3 text-sm font-medium ${activeTab === 'tds' ? 'border-b-2 border-purple-500 text-purple-700' : 'text-slate-500'}`}>TDS / Assessment</button>
        </div>

        {activeTab === 'tds' ? <TechnicalDataSheetForm ticketId={ticketId} userRole="technician" /> : (
          <>
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">Inspection readiness</span><span className="font-bold text-purple-700">{completionCount} of 5 required parts</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${completionPercent}%` }} /></div>
            </div>

            {message && <div role="alert" className={`mb-6 rounded-xl border p-4 text-sm font-medium ${message.includes('successfully') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{message}</div>}

            <section className="space-y-4" aria-labelledby="assessment-heading">
              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">1. Site checks</p><h3 id="assessment-heading" className="mt-1 text-xl font-semibold text-slate-900">Answer every check</h3><p className="mt-1 text-sm text-slate-600">Nothing is preselected. A “No” answer needs a short field note.</p></div>
              {questions.map((question, index) => (
                <div key={question.key} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${fieldErrors[question.key] || fieldErrors[question.notesKey] ? 'border-rose-300' : 'border-slate-200'}`}>
                  <div className="grid gap-4 sm:grid-cols-[1fr_190px] sm:items-center">
                    <div><p className="font-semibold text-slate-900">{index + 1}. {question.label}</p><p className="mt-1 text-sm leading-5 text-slate-500">{question.hint}</p></div>
                    <AnswerButtons value={question.value} onChange={(value) => chooseAnswer(question.key, value)} label={question.label} />
                  </div>
                  {fieldErrors[question.key] && <p className="mt-2 text-sm font-medium text-rose-700">{fieldErrors[question.key]}</p>}
                  {question.value === false && (
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold text-rose-900">Required explanation</label>
                      <textarea value={question.notes} onChange={(event) => { question.setNotes(event.target.value); setFieldErrors((previous) => ({ ...previous, [question.notesKey]: '' })); }} rows={3} placeholder={question.placeholder} className={`w-full rounded-xl border bg-rose-50 p-3 text-sm text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-300 ${fieldErrors[question.notesKey] ? 'border-rose-500' : 'border-rose-200'}`} />
                      {fieldErrors[question.notesKey] && <p className="mt-2 text-sm font-medium text-rose-700">{fieldErrors[question.notesKey]}</p>}
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section className="mt-8" aria-labelledby="recommendation-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">2. Decision</p><h3 id="recommendation-heading" className="mt-1 text-xl font-semibold text-slate-900">Overall recommendation</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {RECOMMENDATIONS.map((option) => (
                  <button key={option.value} type="button" aria-pressed={recommendation === option.value} onClick={() => { setRecommendation(option.value); setFieldErrors((previous) => ({ ...previous, recommendation: '' })); }} className={`rounded-2xl border p-4 text-left transition ${recommendation === option.value ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-100' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                    <span className="block text-sm font-semibold text-slate-900">{option.label}</span><span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
                  </button>
                ))}
              </div>
              {fieldErrors.recommendation && <p className="mt-2 text-sm font-medium text-rose-700">{fieldErrors.recommendation}</p>}
            </section>

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="evidence-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">3. Findings and evidence</p><h3 id="evidence-heading" className="mt-1 text-xl font-semibold text-slate-900">Record what the next team needs</h3>
              <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="inspection-notes">Inspection notes</label>
              <textarea id="inspection-notes" value={techNotes} onChange={(event) => setTechNotes(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="Describe site conditions, measurements, obstacles, and special requirements..." />
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold text-slate-800">Site photos <span className="text-rose-600">(required)</span></p><p className="mt-1 text-xs text-slate-500">{photoSummary}. You can add several angles.</p></div>
                <button type="button" onClick={() => photoInputRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50 px-5 py-2.5 text-sm font-semibold text-purple-800 hover:bg-purple-100"><FiImage /> Add site photos</button>
              </div>
              {fieldErrors.photos && <p className="mt-2 text-sm font-medium text-rose-700">{fieldErrors.photos}</p>}
              {photos.length > 0 && <div className="mt-4 space-y-2">{photos.map((photo, index) => (
                <div key={`${photo.name}-${photo.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200"><span className="min-w-0 truncate text-slate-700">{photo.name}</span><button type="button" aria-label={`Remove ${photo.name}`} onClick={() => setPhotos((previous) => previous.filter((_, photoIndex) => photoIndex !== index))} className="shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50"><FiTrash2 /></button></div>
              ))}</div>}
            </section>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
              <div className="mx-auto flex max-w-3xl gap-3">
                <Link to="/technician/my-jobs" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-700 hover:bg-slate-50">Cancel</Link>
                <button type="button" onClick={handleSubmit} disabled={submitting} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"><FiSend /> {submitting ? 'Submitting inspection...' : 'Review and complete inspection'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
