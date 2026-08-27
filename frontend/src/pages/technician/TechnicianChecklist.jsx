import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchServiceTypes, fetchTechnicianJob, submitChecklist } from '../../api/api';
import { FiCheckSquare, FiImage, FiSend, FiVideo, FiTool } from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';
import { getLocalDateInputValue } from '../../utils/date';
import SolarCommissioningChecklistForm from '../../components/documents/SolarCommissioningChecklistForm';
import FieldServiceReportForm from '../../components/documents/FieldServiceReportForm';

// Fallback checklists when ServiceType has no procedures configured
const FALLBACK_CHECKLISTS = {
  'Solar Installation': [
    'Inspect installation area',
    'Install mounting brackets',
    'Connect solar panels',
    'Configure inverter',
    'Test system output'
  ],
  'CCTV Installation': [
    'Install cameras',
    'Configure recording device',
    'Test camera view',
    'Setup mobile monitoring'
  ],
  'Fire Detection Alarm Systems': [
    'Install sensors',
    'Wire control panel',
    'Test detection',
    'Configure alerts'
  ],
  'Air Conditioning Services': [
    'Inspect unit',
    'Check refrigerant levels',
    'Clean filters',
    'Test cooling performance'
  ]
};

const GENERIC_CHECKLIST = [
  'Review ticket scope',
  'Perform the assigned service work',
  'Verify results with the customer',
  'Capture proof of completion',
  'Record final technician notes'
];

const maintenanceProfiles = [
  {
    value: 'commercial_area',
    label: 'Commercial Area',
    intervalDays: 90,
    description: 'High-traffic or high-dust sites that should be reviewed every 3 months.'
  },
  {
    value: 'dust_free_area',
    label: 'Dust-Free Area',
    intervalDays: 180,
    description: 'Controlled or cleaner environments that can wait 6 months.'
  },
  {
    value: 'standard_area',
    label: 'Standard Area',
    intervalDays: 120,
    description: 'Balanced default for typical sites when the environment is neither extreme.'
  }
];

const followUpCaseOptions = [
  {
    value: 'follow_up',
    label: 'After-Sales Callback',
    description: 'Use this when the after-sales team should follow up with the client after completion.'
  },
  {
    value: 'warranty',
    label: 'Warranty Attention',
    description: 'Use this when the customer needs a warranty handoff immediately after the job closes.'
  },
  {
    value: 'complaint',
    label: 'Complaint Resolution',
    description: 'Use this when there is an unresolved issue that needs customer recovery.'
  },
  {
    value: 'revisit',
    label: 'Revisit Required',
    description: 'Use this when another site visit must be scheduled to finish or correct work.'
  },
  {
    value: 'feedback',
    label: 'Feedback Request',
    description: 'Use this when the team wants a structured post-service feedback touchpoint.'
  }
];

const afterSalesDecisionOptions = [
  {
    value: 'none',
    label: 'No warranty or follow-up',
    warrantyIncluded: false,
    followUpRequired: false
  },
  {
    value: 'warranty_only',
    label: 'Save warranty only',
    warrantyIncluded: true,
    followUpRequired: false
  },
  {
    value: 'create_case',
    label: 'Create follow-up task',
    warrantyIncluded: null,
    followUpRequired: true
  }
];

const addDaysToLocalDate = (days) => {
  const numericDays = Number(days);
  if (!Number.isFinite(numericDays) || numericDays <= 0) return '';
  const date = new Date();
  date.setDate(date.getDate() + numericDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDaysUntilLocalDate = (value) => {
  if (!value) return '';
  const today = new Date(`${getLocalDateInputValue()}T00:00:00`);
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return '';
  const days = Math.ceil((target - today) / 86400000);
  return days > 0 ? String(days) : '';
};

const formatDateLabel = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getStepTitle = (step, index) =>
  typeof step === 'string' ? step : step?.title || step?.name || `Step ${index + 1}`;

const getStepDescription = (step) =>
  typeof step === 'string' ? '' : step?.description || '';

const isStepPhotoRequired = (step) => Boolean(
  typeof step === 'object' && step && (
    step.requires_photo ||
    step.requiresPhoto ||
    step.requires_image ||
    step.photo_required
  )
);

const getEquipmentLabel = (item) => {
  if (typeof item === 'string') return item;
  const name = item?.name || 'Equipment';
  const quantity = Number(item?.quantity || 0);
  return quantity > 1 ? `${name} x${quantity}` : name;
};

export default function TechnicianChecklist() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ticketId = searchParams.get('ticketId') || searchParams.get('jobId');
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(Boolean(ticketId));
  const [error, setError] = useState(ticketId ? '' : 'Open a job from My Jobs before completing a checklist.');
  const [completed, setCompleted] = useState({});
  const [techNotes, setTechNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [stepPhotos, setStepPhotos] = useState({});
  const [videos, setVideos] = useState([]);
  const [maintenanceRequired, setMaintenanceRequired] = useState(true);
  const [maintenanceProfile, setMaintenanceProfile] = useState('');
  const [maintenanceIntervalDays, setMaintenanceIntervalDays] = useState('');
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [afterSalesDecision, setAfterSalesDecision] = useState('');
  const [warrantyProvided, setWarrantyProvided] = useState(true);
  const [warrantyPeriodDays, setWarrantyPeriodDays] = useState('30');
  const [warrantyNotes, setWarrantyNotes] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpCaseType, setFollowUpCaseType] = useState('follow_up');
  const [followUpDueDate, setFollowUpDueDate] = useState('');
  const [followUpSummary, setFollowUpSummary] = useState('');
  const [followUpDetails, setFollowUpDetails] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('standard');
  const [submitting, setSubmitting] = useState(false);
  const [currentWizardStep, setCurrentWizardStep] = useState(0);

  // Dynamic data from ServiceType
  const [dynamicProcedures, setDynamicProcedures] = useState(null);
  const [requiredEquipment, setRequiredEquipment] = useState([]);
  const [procedureSource, setProcedureSource] = useState('generic'); // 'dynamic', 'fallback', 'generic'

  const serviceType = job?.serviceType || job?.service || '';
  const jobStatus = String(job?.status || '').toLowerCase().replace(/\s+/g, '_');
  const checklistLocked = ['completed', 'cancelled'].includes(jobStatus);

  // Resolve steps: dynamic procedures > fallback > generic
  const steps = (() => {
    if (dynamicProcedures && dynamicProcedures.length > 0) return dynamicProcedures;
    if (FALLBACK_CHECKLISTS[serviceType]) return FALLBACK_CHECKLISTS[serviceType];
    return GENERIC_CHECKLIST;
  })();

  const selectedMaintenanceProfile = maintenanceProfiles.find((item) => item.value === maintenanceProfile);
  const resolvedIntervalDays = maintenanceRequired
    ? Number(maintenanceIntervalDays || selectedMaintenanceProfile?.intervalDays || 0)
    : 0;
  const automaticWarrantyDueDate = warrantyProvided ? addDaysToLocalDate(warrantyPeriodDays) : '';
  const isWarrantyFollowUp = followUpRequired && followUpCaseType === 'warranty';
  const selectedFollowUpCase = followUpCaseOptions.find((item) => item.value === followUpCaseType);
  const maintenancePreview = maintenanceRequired
    ? (resolvedIntervalDays > 0
      ? `${selectedMaintenanceProfile?.label || 'Selected profile'} reminder, due about ${resolvedIntervalDays} days after completion`
      : 'Maintenance reminder will be created after a profile or interval is selected')
    : 'No future maintenance reminder';
  const warrantyPreview = warrantyProvided
    ? `${warrantyPeriodDays || 0} days coverage${automaticWarrantyDueDate ? `, estimated through ${formatDateLabel(automaticWarrantyDueDate)}` : ''}`
    : 'No warranty coverage';
  const followUpPreview = followUpRequired
    ? `${selectedFollowUpCase?.label || 'Follow-up task'}${isWarrantyFollowUp && automaticWarrantyDueDate ? `, due around ${formatDateLabel(automaticWarrantyDueDate)}` : followUpDueDate ? `, due ${formatDateLabel(followUpDueDate)}` : ', default due date'}`
    : 'No immediate after-sales follow-up task';
  const procedureStepCount = steps.length;
  const maintenanceWizardStep = procedureStepCount;
  const warrantyWizardStep = procedureStepCount + 1;
  const followUpWizardStep = procedureStepCount + 2;
  const proofWizardStep = procedureStepCount + 3;
  const reviewWizardStep = procedureStepCount + 4;
  const totalWizardSteps = procedureStepCount + 5;
  const activeProcedureStep = currentWizardStep < procedureStepCount ? steps[currentWizardStep] : null;
  const activeStepPhotos = currentWizardStep < procedureStepCount ? (stepPhotos[currentWizardStep] || []) : [];
  const activeStepRequiresPhoto = activeProcedureStep ? isStepPhotoRequired(activeProcedureStep) : false;
  const getWizardStepLabel = (stepIndex) => {
    if (stepIndex < procedureStepCount) return `Procedure ${stepIndex + 1}`;
    if (stepIndex === maintenanceWizardStep) return 'Maintenance';
    if (stepIndex === warrantyWizardStep) return 'Warranty';
    if (stepIndex === followUpWizardStep) return 'After-Sales';
    if (stepIndex === proofWizardStep) return 'Proof & Notes';
    return 'Review';
  };
  const currentWizardLabel = getWizardStepLabel(currentWizardStep);
  const nextWizardLabel = currentWizardStep < reviewWizardStep
    ? getWizardStepLabel(currentWizardStep + 1)
    : '';

  const handleAfterSalesDecision = (decision) => {
    const option = afterSalesDecisionOptions.find((item) => item.value === decision);
    if (!option) return;

    setAfterSalesDecision(decision);
    setFollowUpRequired(option.followUpRequired);

    if (typeof option.warrantyIncluded === 'boolean') {
      setWarrantyProvided(option.warrantyIncluded);
    }

    if (option.warrantyIncluded === false) {
      setWarrantyNotes('');
      setWarrantyPeriodDays('');
      if (followUpCaseType === 'warranty') {
        setFollowUpCaseType('follow_up');
      }
    } else if (option.warrantyIncluded !== false && !warrantyPeriodDays) {
      setWarrantyPeriodDays('30');
    }

    if (!option.followUpRequired) {
      setFollowUpDueDate('');
      setFollowUpSummary('');
      setFollowUpDetails('');
    }
  };

  useEffect(() => {
    if (!ticketId) {
      setJob(null);
      setLoading(false);
      return;
    }

    const loadJob = async () => {
      setLoading(true);
      try {
        const jobData = await fetchTechnicianJob(ticketId);
        setJob(jobData);
        setError('');

        // Load dynamic procedures from ServiceType
        try {
          const stName = jobData?.serviceType || jobData?.service || '';
          if (stName) {
            const serviceTypes = await fetchServiceTypes();
            const match = serviceTypes.find(st => st.name === stName);
            if (match) {
              const procs = Array.isArray(match.procedures) ? match.procedures : [];
              const equip = Array.isArray(match.required_equipment) ? match.required_equipment : [];
              if (procs.length > 0) {
                setDynamicProcedures(procs);
                setProcedureSource('dynamic');
              } else if (FALLBACK_CHECKLISTS[stName]) {
                setProcedureSource('fallback');
              } else {
                setProcedureSource('generic');
              }
              setRequiredEquipment(equip);
            }
          }
        } catch { /* non-critical, will use fallback */ }
      } catch (loadError) {
        setJob(null);
        setError(loadError.message || 'Unable to load the selected job.');
      } finally {
        setLoading(false);
      }
    };

    loadJob();
  }, [ticketId]);

  useEffect(() => {
    setCurrentWizardStep((step) => Math.min(step, Math.max(totalWizardSteps - 1, 0)));
  }, [totalWizardSteps]);

  const toggleStep = (index) => {
    setCompleted((previousState) => ({
      ...previousState,
      [index]: !previousState[index]
    }));
  };

  const addPhoto = () => {
    photoInputRef.current?.click();
  };

  const addVideo = () => {
    videoInputRef.current?.click();
  };

  const handlePhotoSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      setPhotos((previousState) => [...previousState, ...selectedFiles]);
      if (currentWizardStep < procedureStepCount) {
        setStepPhotos((previousState) => ({
          ...previousState,
          [currentWizardStep]: [
            ...(previousState[currentWizardStep] || []),
            ...selectedFiles
          ]
        }));
      }
    }
    event.target.value = '';
  };

  const removeStepPhoto = (stepIndex, photoIndex) => {
    const targetPhoto = stepPhotos[stepIndex]?.[photoIndex];
    setStepPhotos((previousState) => {
      const nextStepPhotos = (previousState[stepIndex] || []).filter((_, index) => index !== photoIndex);
      const nextState = { ...previousState };
      if (nextStepPhotos.length > 0) {
        nextState[stepIndex] = nextStepPhotos;
      } else {
        delete nextState[stepIndex];
      }
      return nextState;
    });
    if (targetPhoto) {
      setPhotos((previousState) => {
        const removeIndex = previousState.findIndex((photo) => photo === targetPhoto);
        return removeIndex >= 0
          ? previousState.filter((_, index) => index !== removeIndex)
          : previousState;
      });
    }
  };

  const handleVideoSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      setVideos((previousState) => [...previousState, ...selectedFiles]);
    }
    event.target.value = '';
  };

  const validateCurrentWizardStep = () => {
    if (currentWizardStep < procedureStepCount && !completed[currentWizardStep]) {
      setMessage('Mark this checklist step as completed before continuing.');
      return false;
    }
    if (
      currentWizardStep < procedureStepCount &&
      isStepPhotoRequired(steps[currentWizardStep]) &&
      (stepPhotos[currentWizardStep] || []).length === 0
    ) {
      setMessage('Upload a photo for this required-photo step before continuing.');
      return false;
    }
    if (currentWizardStep === maintenanceWizardStep && maintenanceRequired && !maintenanceProfile) {
      setMessage('Select a maintenance profile before continuing.');
      return false;
    }
    if (currentWizardStep === warrantyWizardStep && !afterSalesDecision) {
      setMessage('Choose the after-sales result before continuing.');
      return false;
    }
    if (currentWizardStep === warrantyWizardStep && warrantyProvided && (!warrantyPeriodDays || Number(warrantyPeriodDays) <= 0)) {
      setMessage('Enter a valid warranty coverage period before continuing.');
      return false;
    }
    if (currentWizardStep === followUpWizardStep && followUpRequired && !followUpSummary.trim()) {
      setMessage('Add a short follow-up summary before continuing.');
      return false;
    }
    if (currentWizardStep === followUpWizardStep && followUpRequired && followUpCaseType === 'warranty' && !warrantyProvided) {
      setMessage('Enable warranty coverage before creating a warranty handoff.');
      return false;
    }
    setMessage('');
    return true;
  };

  const goToNextWizardStep = () => {
    if (!validateCurrentWizardStep()) return;
    setMessage('');
    setCurrentWizardStep((step) => Math.min(step + 1, totalWizardSteps - 1));
  };

  const goToPreviousWizardStep = () => {
    setMessage('');
    setCurrentWizardStep((step) => Math.max(step - 1, 0));
  };

  const handleSubmit = async () => {
    if (!ticketId) {
      setMessage('Select a ticket before submitting a checklist.');
      return;
    }
    if (checklistLocked) {
      setMessage('This job is already closed, so its checklist can no longer be edited.');
      return;
    }
    if (steps.some((_, index) => !completed[index])) {
      setMessage('Please complete all checklist items.');
      return;
    }
    const missingPhotoStepIndex = steps.findIndex((step, index) => (
      isStepPhotoRequired(step) && (stepPhotos[index] || []).length === 0
    ));
    if (missingPhotoStepIndex >= 0) {
      setCurrentWizardStep(missingPhotoStepIndex);
      setMessage(`Upload a photo for procedure ${missingPhotoStepIndex + 1} before submitting.`);
      return;
    }
    if (maintenanceRequired && !maintenanceProfile) {
      setMessage('Select a maintenance profile so management can schedule the next service.');
      return;
    }
    if (!afterSalesDecision) {
      setMessage('Choose the after-sales result before submitting the checklist.');
      return;
    }
    if (warrantyProvided && (!warrantyPeriodDays || Number(warrantyPeriodDays) <= 0)) {
      setMessage('Enter a valid warranty coverage period.');
      return;
    }
    if (followUpRequired && !followUpSummary.trim()) {
      setMessage('Add a short follow-up summary so after-sales knows what to do next.');
      return;
    }
    if (followUpRequired && followUpCaseType === 'warranty' && !warrantyProvided) {
      setMessage('Enable warranty coverage before creating a warranty handoff.');
      return;
    }

    setSubmitting(true);
    setMessage('Submitting checklist...');

    try {
      await submitChecklist({
        jobId: ticketId,
        ticketId,
        serviceType,
        procedure_source: procedureSource,
        required_equipment_snapshot: requiredEquipment,
        checklist_items: steps.map((step, index) => ({
          index,
          label: getStepTitle(step, index),
          description: getStepDescription(step),
          requires_photo: isStepPhotoRequired(step),
          photo_count: stepPhotos[index]?.length || 0,
          completed: Boolean(completed[index])
        })),
        completed,
        notes: techNotes,
        photos,
        videos,
        maintenance_required: maintenanceRequired,
        maintenance_profile: maintenanceRequired ? maintenanceProfile : null,
        maintenance_interval_days: maintenanceRequired ? resolvedIntervalDays : null,
        maintenance_notes: maintenanceNotes,
        warranty_provided: warrantyProvided,
        warranty_period_days: warrantyProvided ? Number(warrantyPeriodDays) : null,
        warranty_notes: warrantyNotes,
        after_sales_decision: afterSalesDecision,
        follow_up_required: followUpRequired,
        follow_up_case_type: followUpRequired ? followUpCaseType : null,
        follow_up_due_date: followUpRequired && !isWarrantyFollowUp && followUpDueDate ? followUpDueDate : null,
        follow_up_summary: followUpRequired ? followUpSummary.trim() : null,
        follow_up_details: followUpRequired ? followUpDetails.trim() : null
      });

      setMessage(
        followUpRequired
          ? 'Checklist submitted. The after-sales team will receive a handoff when this ticket completes.'
          : 'Checklist submitted successfully!'
      );
      setPhotos([]);
      setVideos([]);
      setTimeout(() => {
        navigate('/technician/my-jobs');
      }, 2000);
    } catch (submitError) {
      setMessage(submitError.message || 'Failed to submit checklist.');
    }

    setSubmitting(false);
  };

  const progress = steps.length > 0
    ? (Object.keys(completed).filter((key) => completed[key]).length / steps.length) * 100
    : 0;

  if (!ticketId) {
    return (
      <Layout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h2 className="text-xl font-semibold">Checklist needs a selected ticket</h2>
          <p className="mt-2 text-sm">
            Open a job first so the checklist can use the actual service type and completion record.
          </p>
          <Link
            to="/technician/my-jobs"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to My Jobs
          </Link>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <PanelSkeleton rows={8} />
      </Layout>
    );
  }

  if (error || !job) {
    return (
      <Layout>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-semibold">Unable to open checklist</h2>
          <p className="mt-2 text-sm">{error || 'The selected ticket could not be loaded.'}</p>
          <Link
            to="/technician/my-jobs"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Back to My Jobs
          </Link>
        </div>
      </Layout>
    );
  }

  if (checklistLocked) {
    return (
      <Layout>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            {jobStatus === 'completed' ? 'Completed job' : 'Closed job'}
          </div>
          <h2 className="text-xl font-semibold text-slate-900">
            Checklist locked for {formatTicketId(ticketId)}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This job has already been closed, so the checklist is preserved as part of the service record.
            Use Job History to review the submitted checklist, proof, warranty, and maintenance details.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/technician/job-history"
              className="rounded-xl bg-brand-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-600"
            >
              Open Job History
            </Link>
            <Link
              to="/technician/my-jobs"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to My Jobs
            </Link>
          </div>
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
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={handleVideoSelection}
      />
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold text-slate-800">
          <FiCheckSquare className="text-emerald-500" size={28} />
          Checklist - {formatTicketId(ticketId)}
        </h2>
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <div className="rounded-full bg-emerald-50 px-4 py-2 font-medium text-emerald-900">
            {serviceType || 'Service'}
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-slate-700">
            {job.address || 'Location pending'}
          </div>
        </div>
        {procedureSource === 'dynamic' ? (
          <p className="text-sm text-emerald-700">
            ✅ Using <strong>admin-configured procedures</strong> for {serviceType}.
          </p>
        ) : procedureSource === 'fallback' ? (
          <p className="text-sm text-blue-700">
            Using built-in template checklist for {serviceType}.
          </p>
        ) : (
          <p className="text-sm text-amber-700">
            This ticket does not have a custom checklist template yet, so the general completion checklist is being used.
          </p>
        )}
      </div>

            <div className="mb-6 flex space-x-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('standard')}
          className={`pb-3 px-1 font-medium text-sm transition ${
            activeTab === 'standard' 
              ? 'border-b-2 border-emerald-500 text-emerald-700' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Standard Checklist
        </button>
        {(serviceType || '').toLowerCase().includes('solar') && ['in_progress', 'pending_completion', 'completed'].includes(jobStatus) && (
          <button
            onClick={() => setActiveTab('commissioning')}
            className={`pb-3 px-1 font-medium text-sm transition ${
              activeTab === 'commissioning' 
                ? 'border-b-2 border-emerald-500 text-emerald-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Solar Commissioning Form
          </button>
        )}
        {['repair', 'maintenance', 'warranty', 'after-sales', 'after sales', 'follow-up', 'follow up'].some(kw => (serviceType || '').toLowerCase().includes(kw)) && (
          <button
            onClick={() => setActiveTab('fsr')}
            className={`pb-3 px-1 font-medium text-sm transition ${
              activeTab === 'fsr' 
                ? 'border-b-2 border-emerald-500 text-emerald-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Field Service Report
          </button>
        )}
      </div>

      {activeTab === 'commissioning' ? (
        <SolarCommissioningChecklistForm ticketId={ticketId} userRole="technician" />
      ) : activeTab === 'fsr' ? (
        <FieldServiceReportForm ticketId={ticketId} userRole="technician" />
      ) : (
        <>
      {/* Required Equipment */}
      {requiredEquipment.length > 0 && (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-900">
            <FiTool size={16} /> Required Equipment ({requiredEquipment.length})
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {requiredEquipment.map((item, idx) => (
              <span
                key={idx}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-800 shadow-sm border border-sky-200"
              >
                {getEquipmentLabel(item)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Completion progress</span>
          <span className="font-bold text-emerald-700">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100">
          <div
            className="h-3 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Step {Math.min(currentWizardStep + 1, totalWizardSteps)} of {totalWizardSteps}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{currentWizardLabel}</h3>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-56">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${((currentWizardStep + 1) / totalWizardSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {currentWizardStep < procedureStepCount && activeProcedureStep && (
        <div className="mb-6 rounded-xl border bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h3 className="text-lg font-semibold">Service Procedure</h3>
          </div>
          <div className="p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Procedure {currentWizardStep + 1} of {procedureStepCount}
              </div>
              <h4 className="text-xl font-semibold text-slate-950">
                {getStepTitle(activeProcedureStep, currentWizardStep)}
              </h4>
              {getStepDescription(activeProcedureStep) && (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {getStepDescription(activeProcedureStep)}
                </p>
              )}
              {activeStepRequiresPhoto && (
                <div className={`mt-5 rounded-xl border p-4 ${activeStepPhotos.length > 0
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                  }`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${activeStepPhotos.length > 0 ? 'text-emerald-900' : 'text-amber-900'
                        }`}>
                        Photo required for this step
                      </p>
                      <p className={`mt-1 text-xs ${activeStepPhotos.length > 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}>
                        Upload at least one image before moving to the next procedure.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addPhoto}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <FiImage /> Insert Image
                    </button>
                  </div>
                  {activeStepPhotos.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {activeStepPhotos.map((photo, index) => (
                        <div key={`${photo.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-emerald-100">
                          <span className="min-w-0 truncate">{photo.name}</span>
                          <button
                            type="button"
                            onClick={() => removeStepPhoto(currentWizardStep, index)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => toggleStep(currentWizardStep)}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${completed[currentWizardStep]
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
              >
                <FiCheckSquare size={18} />
                {completed[currentWizardStep] ? 'Marked Complete' : 'Mark This Step Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {currentWizardStep === maintenanceWizardStep && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Future Maintenance Reminder</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">Should this site be checked again later?</h3>
            </div>
            <label className="inline-flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              <input
                type="checkbox"
                checked={maintenanceRequired}
                onChange={(event) => setMaintenanceRequired(event.target.checked)}
              />
              Create future maintenance reminder
            </label>
          </div>

          <div className={`mt-5 ${maintenanceRequired ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>
            <div className="grid gap-4 lg:grid-cols-3">
              {maintenanceProfiles.map((profile) => {
                const active = maintenanceProfile === profile.value;
                return (
                  <button
                    key={profile.value}
                    type="button"
                    onClick={() => setMaintenanceProfile(profile.value)}
                    className={`rounded-xl border p-4 text-left transition ${active
                        ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{profile.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                          {profile.intervalDays} days cadence
                        </div>
                      </div>
                      <div className={`h-3 w-3 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-500">{profile.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Override Interval</label>
                <input
                  type="number"
                  min="1"
                  value={maintenanceIntervalDays}
                  onChange={(event) => setMaintenanceIntervalDays(event.target.value)}
                  placeholder={selectedMaintenanceProfile ? String(selectedMaintenanceProfile.intervalDays) : 'Days'}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Maintenance Notes</label>
                <textarea
                  value={maintenanceNotes}
                  onChange={(event) => setMaintenanceNotes(event.target.value)}
                  placeholder="Add why this cadence fits the site, seasonal concerns, dust level, customer constraints, or access notes."
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-sm text-slate-200">
              {maintenanceRequired ? (
                resolvedIntervalDays > 0 ? (
                  <>
                    Management will be alerted roughly <span className="font-semibold text-white">14 days before</span> the
                    next maintenance target, currently set to <span className="font-semibold text-white">{resolvedIntervalDays} days</span>
                    {' '}after completion.
                  </>
                ) : (
                  'Choose a site profile to calculate the next maintenance window.'
                )
              ) : (
                'No planned maintenance reminder will be created for this job.'
              )}
            </div>
          </div>
        </div>
      )}

      {currentWizardStep === warrantyWizardStep && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Warranty Coverage</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">Is this completed job covered by warranty?</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {afterSalesDecisionOptions.map((option) => {
              const active = afterSalesDecision === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleAfterSalesDecision(option.value)}
                  className={`rounded-xl border p-4 text-left transition ${active
                      ? 'border-sky-500 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                    <div className={`h-3 w-3 rounded-full ${active ? 'bg-sky-500' : 'bg-slate-300'}`}></div>
                  </div>
                </button>
              );
            })}
          </div>

          {afterSalesDecision === 'create_case' && (
            <label className="mt-5 inline-flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
              <input
                type="checkbox"
                checked={warrantyProvided}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setWarrantyProvided(checked);
                  if (!checked) {
                    setWarrantyNotes('');
                    setWarrantyPeriodDays('');
                    if (followUpCaseType === 'warranty') {
                      setFollowUpCaseType('follow_up');
                    }
                  } else if (!warrantyPeriodDays) {
                    setWarrantyPeriodDays('30');
                  }
                }}
              />
              Include warranty coverage
            </label>
          )}

          <div className={`mt-5 grid gap-4 lg:grid-cols-[220px_220px_1fr] ${warrantyProvided ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Warranty End Date</label>
              <input
                type="date"
                min={addDaysToLocalDate(1)}
                value={automaticWarrantyDueDate}
                onChange={(event) => setWarrantyPeriodDays(getDaysUntilLocalDate(event.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Coverage Days</label>
              <input
                type="number"
                min="1"
                value={warrantyPeriodDays}
                onChange={(event) => setWarrantyPeriodDays(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="mt-2 text-xs text-slate-500">
                {automaticWarrantyDueDate ? formatDateLabel(automaticWarrantyDueDate) : 'Select date'}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Warranty Notes</label>
              <textarea
                value={warrantyNotes}
                onChange={(event) => setWarrantyNotes(event.target.value)}
                rows={3}
                placeholder="State coverage scope, exclusions, and anything the after-sales team should know."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
          </div>
        </div>
      )}

      {currentWizardStep === followUpWizardStep && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">After-Sales Follow-up Task</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">Does management need to follow up with the client?</h3>
            </div>
          </div>

          <div className={`mt-5 ${followUpRequired ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {followUpCaseOptions.map((option) => {
                const active = followUpCaseType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFollowUpCaseType(option.value)}
                    className={`rounded-xl border p-4 text-left transition ${active
                        ? 'border-amber-500 bg-amber-50 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                      <div className={`h-3 w-3 rounded-full ${active ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-500">{option.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr]">
              {isWarrantyFollowUp ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <label className="mb-2 block text-sm font-semibold text-slate-900">Due Date</label>
                  <p className="text-sm font-semibold text-sky-900">
                    {automaticWarrantyDueDate ? formatDateLabel(automaticWarrantyDueDate) : 'Generated from warranty days'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-sky-800">
                    The final warranty case due date is generated by the backend from the ticket completion date plus the warranty days.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900">Due Date</label>
                  <input
                    type="date"
                    value={followUpDueDate}
                    onChange={(event) => setFollowUpDueDate(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <p className="mt-2 text-xs text-slate-500">Leave blank to let the system set the default urgency.</p>
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Handoff Summary</label>
                <input
                  value={followUpSummary}
                  onChange={(event) => setFollowUpSummary(event.target.value)}
                  placeholder="Example: Client requested a callback to confirm system performance."
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-900">After-Sales Details</label>
              <textarea
                value={followUpDetails}
                onChange={(event) => setFollowUpDetails(event.target.value)}
                rows={4}
                placeholder="Share what the after-sales agent should know before contacting the customer."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
            </div>

            <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-sm text-slate-200">
              {followUpRequired ? (
                <>
                  This ticket will hand off to <span className="font-semibold text-white">{followUpCaseType.replace('_', ' ')}</span>
                  {' '}work after completion. Make sure the summary clearly tells the after-sales team what outcome the
                  customer is expecting.
                </>
              ) : (
                warrantyProvided
                  ? 'Warranty coverage will be saved, but no immediate after-sales follow-up task will be created.'
                  : 'No warranty coverage or immediate after-sales follow-up task will be created.'
              )}
            </div>
          </div>
        </div>
      )}

      {currentWizardStep === proofWizardStep && (
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <div>
            <label className="mb-3 block text-sm font-semibold text-slate-900">Technician Notes</label>
            <textarea
              value={techNotes}
              onChange={(event) => setTechNotes(event.target.value)}
              placeholder="Describe work performed, issues found, materials used..."
              rows={5}
              className="w-full resize-vertical rounded-xl border border-slate-300 p-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-3 block text-sm font-semibold text-slate-900">
              Proof Uploads ({photos.length + videos.length})
            </label>
            <div className="mb-4 space-y-2">
              {photos.map((photo, index) => (
                <div key={`${photo.name}-${index}`} className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 px-4 text-sm text-slate-500">
                  <span className="text-center">{photo.name}</span>
                </div>
              ))}
              {videos.map((video, index) => (
                <div key={`${video.name}-${index}`} className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-sky-100 to-slate-200 px-4 text-sm text-slate-600">
                  <span className="text-center">{video.name}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={addPhoto}
                className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 px-4 py-3 font-medium transition hover:border-slate-400 hover:bg-slate-200"
              >
                <FiImage /> Add Photo
              </button>
              <button
                type="button"
                onClick={addVideo}
                className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 px-4 py-3 font-medium transition hover:border-sky-400 hover:bg-sky-100"
              >
                <FiVideo /> Add Video
              </button>
            </div>
          </div>
        </div>
      )}

      {currentWizardStep === reviewWizardStep && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Completion Summary</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">Review before submit.</h3>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Future Maintenance</div>
              <p className="mt-2 text-sm leading-6 text-emerald-950">{maintenancePreview}</p>
              {maintenanceRequired && maintenanceNotes.trim() && (
                <p className="mt-2 text-xs leading-5 text-emerald-800">{maintenanceNotes.trim()}</p>
              )}
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Warranty</div>
              <p className="mt-2 text-sm leading-6 text-sky-950">{warrantyPreview}</p>
              {warrantyProvided && warrantyNotes.trim() && (
                <p className="mt-2 text-xs leading-5 text-sky-800">{warrantyNotes.trim()}</p>
              )}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">After-Sales Follow-up</div>
              <p className="mt-2 text-sm leading-6 text-amber-950">{followUpPreview}</p>
              {followUpRequired && followUpSummary.trim() && (
                <p className="mt-2 text-xs leading-5 text-amber-800">{followUpSummary.trim()}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row">
        <button
          type="button"
          onClick={goToPreviousWizardStep}
          disabled={currentWizardStep === 0 || submitting}
          className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>
        {currentWizardStep < reviewWizardStep && (
          <button
            type="button"
            onClick={goToNextWizardStep}
            disabled={submitting}
            className="flex flex-1 items-center justify-center rounded-xl bg-brand-500 px-8 py-4 font-semibold text-white shadow-lg transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue to {nextWizardLabel}
          </button>
        )}
        {currentWizardStep === reviewWizardStep && (
          <button
            onClick={handleSubmit}
            disabled={submitting || steps.some((_, index) => !completed[index])}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-8 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:from-emerald-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
                Submitting...
              </>
            ) : (
              <>
                <FiSend size={20} />
                Submit Completed Checklist
              </>
            )}
          </button>
        )}
        {message && (
          <div
            className={`flex flex-1 items-center justify-center rounded-xl p-4 text-sm font-medium ${message.toLowerCase().includes('success') || message.toLowerCase().includes('submitted')
                ? 'border border-emerald-300 bg-emerald-100 text-emerald-800'
                : 'border border-red-300 bg-red-100 text-red-800'
              }`}
          >
            {message}
          </div>
        )}
      </div>
          </>
        )}
    </Layout>
  );
}
