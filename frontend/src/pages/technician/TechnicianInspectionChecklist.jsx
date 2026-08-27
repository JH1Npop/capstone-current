import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchTechnicianJob, submitInspectionChecklist } from '../../api/technician';
import { FiCheckSquare, FiImage, FiSend } from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';
import TechnicalDataSheetForm from '../../components/documents/TechnicalDataSheetForm';

export default function TechnicianInspectionChecklist() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ticketId = searchParams.get('ticketId') || searchParams.get('jobId');
  const photoInputRef = useRef(null);
  
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(Boolean(ticketId));
  const [error, setError] = useState(ticketId ? '' : 'Open an inspection job first.');
  const [siteAccessible, setSiteAccessible] = useState(false);
  const [siteAccessibleNotes, setSiteAccessibleNotes] = useState('');
  const [electricalAdequate, setElectricalAdequate] = useState(false);
  const [electricalNotes, setElectricalNotes] = useState('');
  const [safetyEquipment, setSafetyEquipment] = useState(false);
  const [safetyHazards, setSafetyHazards] = useState('');
  const [recommendation, setRecommendation] = useState('Pending');
  const [techNotes, setTechNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('inspection');

  useEffect(() => {
    if (!ticketId) return;

    const loadJob = async () => {
      setLoading(true);
      try {
        const jobData = await fetchTechnicianJob(ticketId);
        setJob(jobData);
      } catch (loadError) {
        setError(loadError.message || 'Unable to load the inspection job.');
      } finally {
        setLoading(false);
      }
    };
    loadJob();
  }, [ticketId]);

  const handlePhotoSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      setPhotos((prev) => [...prev, ...selectedFiles]);
    }
    event.target.value = '';
  };

  const removePhoto = (indexToRemove) => {
    setPhotos((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    if (!ticketId) return;
    if (photos.length === 0) {
      setMessage('At least one photo of the site is required.');
      return;
    }

    setSubmitting(true);
    setMessage('Submitting inspection...');

    try {
      await submitInspectionChecklist(ticketId, {
        notes: techNotes,
        photos: photos,
        siteAccessible,
        siteAccessibleNotes,
        electricalAdequate,
        electricalNotes,
        safetyEquipmentPresent: safetyEquipment,
        safetyHazards,
        recommendation
      });
      setMessage('Inspection submitted successfully!');
      setTimeout(() => {
        navigate('/technician/dashboard');
      }, 2000);
    } catch (submitError) {
      setMessage(submitError.message || 'Failed to submit inspection.');
      setSubmitting(false);
    }
  };

  if (!ticketId || error || !job) {
    return (
      <Layout>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-semibold">Unable to open inspection</h2>
          <p className="mt-2 text-sm">{error || 'Job not found.'}</p>
          <Link to="/technician/my-jobs" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-white">
            Back to My Jobs
          </Link>
        </div>
      </Layout>
    );
  }

  if (loading) return <Layout><PanelSkeleton rows={5} /></Layout>;

  if (job?.checklistCompleted || job?.status === 'inspection_completed') {
    return (
      <Layout>
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-green-900 max-w-2xl">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FiCheckSquare /> Inspection Already Completed
          </h2>
          <p className="mt-2 text-sm">The inspection checklist for this job has already been submitted.</p>
          <Link to="/technician/dashboard" className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 transition">
            Back to Dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoSelection}
      />
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <FiCheckSquare className="text-purple-500" />
            Site Inspection
          </h2>
          <p className="text-slate-600 mt-1">{formatTicketId(ticketId)} for {job.client?.full_name || job.client}</p>
        </div>

        <div className="mb-6 flex gap-4 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('inspection')}
            className={`pb-3 px-1 font-medium text-sm transition ${
              activeTab === 'inspection' 
                ? 'border-b-2 border-purple-500 text-purple-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Site Inspection
          </button>
          <button
            onClick={() => setActiveTab('tds')}
            className={`pb-3 px-1 font-medium text-sm transition ${
              activeTab === 'tds' 
                ? 'border-b-2 border-purple-500 text-purple-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            TDS / Assessment
          </button>
        </div>

        {activeTab === 'tds' ? (
          <TechnicalDataSheetForm ticketId={ticketId} userRole="technician" />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {message && (
            <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">General Assessment</h3>
            
            <div className="space-y-6">
              {/* Site Accessible */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Is the site accessible?</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSiteAccessible(true)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${siteAccessible ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Yes</button>
                    <button onClick={() => setSiteAccessible(false)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${!siteAccessible ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>No</button>
                  </div>
                </div>
                {!siteAccessible && (
                  <input type="text" placeholder="Explain why site is not accessible..." value={siteAccessibleNotes} onChange={e => setSiteAccessibleNotes(e.target.value)} className="w-full border border-red-200 bg-red-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-red-900" />
                )}
              </div>

              {/* Electrical Adequate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Is electrical supply adequate?</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setElectricalAdequate(true)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${electricalAdequate ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Yes</button>
                    <button onClick={() => setElectricalAdequate(false)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${!electricalAdequate ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>No</button>
                  </div>
                </div>
                {!electricalAdequate && (
                  <input type="text" placeholder="Describe electrical issues..." value={electricalNotes} onChange={e => setElectricalNotes(e.target.value)} className="w-full border border-red-200 bg-red-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-red-900" />
                )}
              </div>

              {/* Safety Equipment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Is safety equipment present?</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSafetyEquipment(true)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${safetyEquipment ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Yes</button>
                    <button onClick={() => setSafetyEquipment(false)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${!safetyEquipment ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>No</button>
                  </div>
                </div>
                {!safetyEquipment && (
                  <input type="text" placeholder="Describe safety hazards..." value={safetyHazards} onChange={e => setSafetyHazards(e.target.value)} className="w-full border border-red-200 bg-red-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-red-900" />
                )}
              </div>

              {/* Recommendation */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Overall Recommendation</label>
                <select value={recommendation} onChange={e => setRecommendation(e.target.value)} className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="Pending">Pending (Needs Review)</option>
                  <option value="Approved">Approved (Ready for Service)</option>
                  <option value="Conditional">Conditional (Needs Setup First)</option>
                  <option value="Rejected">Rejected (Cannot Proceed)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-800 mb-2">Inspection Notes & Findings</label>
            <textarea
              value={techNotes}
              onChange={(e) => setTechNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none min-h-[120px]"
              placeholder="Describe the site conditions, any obstacles, or special requirements for the installation team..."
            />
          </div>

          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-800 mb-2">Site Photos (Required)</label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition cursor-pointer" onClick={() => photoInputRef.current?.click()}>
              <FiImage className="mx-auto text-slate-400 mb-2" size={32} />
              <p className="text-sm font-medium text-slate-700">Click to upload photos</p>
            </div>
            
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative rounded-lg overflow-hidden border border-slate-200">
                    <div className="aspect-square bg-slate-100 flex items-center justify-center text-xs text-slate-500 p-2 text-center">
                      {photo.name}
                    </div>
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || photos.length === 0}
              className="flex-1 bg-purple-600 text-white rounded-xl py-3 px-4 font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FiSend /> {submitting ? 'Submitting...' : 'Complete Inspection'}
            </button>
            <Link to="/technician/my-jobs" className="bg-slate-100 text-slate-700 rounded-xl py-3 px-6 font-semibold hover:bg-slate-200 flex items-center justify-center">
              Cancel
            </Link>
          </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
