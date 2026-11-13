import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchTechnicianInventoryItems,
  fetchTechnicianJobs,
  requestAdditionalEquipment,
  updateJobStatus
} from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatTicketId } from '../utils/roleIds';

// The server accepts these completion photos (services/views/helpers.py).
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 20;

export function useTechnicianJobs() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const techName = user?.username || '';
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [completionJob, setCompletionJob] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  // Errors from the job details dialog and the Finish Job dialog are shown inside that dialog.
  const [dialogError, setDialogError] = useState('');
  const [completionError, setCompletionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingJobId, setUpdatingJobId] = useState(null);
  const requestSequence = useRef(0);
  const successTimer = useRef(null);
  const showSuccess = (text) => {
    window.clearTimeout(successTimer.current);
    setActionMessage(text);
    successTimer.current = window.setTimeout(() => setActionMessage(''), 6000);
  };
  useEffect(() => () => window.clearTimeout(successTimer.current), []);
  const [proofImages, setProofImages] = useState([]);
  const proofPreviews = useRef(new Set());
  useEffect(() => {
    const currentPreviews = new Set(proofImages.map((image) => image.preview));
    for (const preview of proofPreviews.current) {
      if (!currentPreviews.has(preview)) URL.revokeObjectURL(preview);
    }
    proofPreviews.current = currentPreviews;
  }, [proofImages]);
  useEffect(() => () => {
    for (const preview of proofPreviews.current) URL.revokeObjectURL(preview);
    proofPreviews.current.clear();
  }, []);
  const [completionNotes, setCompletionNotes] = useState('');
  const [materialUsage, setMaterialUsage] = useState({});
  const [inventoryItems, setInventoryItems] = useState([]);
  const emptyEquipmentForm = { itemIds: [], quantities: {}, notes: '', pauseJob: false };
  const [equipmentForm, setEquipmentForm] = useState(emptyEquipmentForm);
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Only the newest load may update the list (a slow, older reply must not replace a newer one).
  // A failed refresh keeps the jobs already on screen.
  const loadJobs = async ({ silent = true } = {}) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    if (!silent) setLoading(true);
    try {
      const data = await fetchTechnicianJobs(techName);
      if (requestId !== requestSequence.current) return;
      setJobs(data);
      const active = data.find((job) => ['navigating', 'arrived_on_site', 'in_progress'].includes(job.status?.toLowerCase()));
      setActiveJob(active || null);
      setError('');
    } catch (loadError) {
      if (requestId !== requestSequence.current) return;
      setError(`${loadError.message || 'Unable to load jobs.'}${jobs.length ? ' Showing the last list we received.' : ''}`);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  };

  const loadInventoryItems = async () => {
    try {
      const data = await fetchTechnicianInventoryItems();
      setInventoryItems(data.filter((item) => item.availableQuantity > 0));
    } catch {
      setInventoryItems([]);
    }
  };

  useEffect(() => {
    loadJobs({ silent: false });
    loadInventoryItems();
  }, []);

  useEffect(() => {
    if (!completionJob) {
      setMaterialUsage({});
      return;
    }

    const usage = {};
    (completionJob.inventoryReservations || [])
      .filter((reservation) => reservation.status === 'pending')
      .forEach((reservation) => {
        usage[String(reservation.id)] = reservation.quantity;
      });
    setMaterialUsage(usage);
  }, [completionJob]);

  useEffect(() => {
    const requestedTicketId = searchParams.get('ticketId');
    if (!requestedTicketId) {
      setSelectedJob(null);
      return;
    }

    const matchingJob = jobs.find(
      (job) => String(job.ticketId || job.id) === String(requestedTicketId)
    );
    if (matchingJob) {
      setSelectedJob(matchingJob);
    }
  }, [jobs, searchParams]);

  const openJobDetails = (job) => {
    setDialogError('');
    setSelectedJob(job);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('ticketId', String(job.ticketId || job.id));
    setSearchParams(nextSearchParams, { replace: true });
  };

  const closeJobDetails = () => {
    setDialogError('');
    setSelectedJob(null);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('ticketId');
    setSearchParams(nextSearchParams, { replace: true });
  };

  // Keep the selected files themselves (uploaded on Finish Job) with lightweight local previews.
  // Photos the server would refuse are left out here, with the reason, instead of failing on Finish Job.
  const handleImageUpload = (event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    const refused = [];
    const accepted = [];
    chosen.forEach((file) => {
      if (!PHOTO_TYPES.has(file.type)) refused.push(`${file.name} is not a JPG, PNG or WebP photo`);
      else if (file.size > MAX_PHOTO_BYTES) refused.push(`${file.name} is larger than 10 MB`);
      else accepted.push(file);
    });
    const room = Math.max(0, MAX_PHOTOS - proofImages.length);
    if (accepted.length > room) refused.push(`only ${MAX_PHOTOS} photos can be attached`);
    const images = accepted.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setProofImages((currentImages) => [...currentImages, ...images]);
    setCompletionError(refused.length ? `Not added: ${refused.join('; ')}.` : '');
  };

  const removeImage = (index) => {
    setProofImages((currentImages) => currentImages.filter((image, imageIndex) => imageIndex !== index));
  };

  // A failure is shown where the person is: inside the job details dialog when it is open.
  const reportError = (text) => {
    if (selectedJob) setDialogError(text);
    else setError(text);
  };

  const handleStatusUpdate = async (jobId, newStatus) => {
    setDialogError('');
    if (newStatus === 'in_progress' && activeJob && activeJob.id !== jobId) {
      reportError(`You already have an active job (${formatTicketId(activeJob.ticketId || activeJob.id)}). Put it on hold or finish it first.`);
      return;
    }

    const job = jobs.find((entry) => entry.id === jobId);
    const code = formatTicketId(job?.ticketId || jobId);
    const resuming = job?.status === 'on_hold';
    try {
      setIsUpdatingStatus(true);
      setUpdatingJobId(jobId);
      const response = await updateJobStatus(jobId, newStatus, '', []);
      if (response?.error) {
        reportError(response.error);
        return;
      }
      await loadJobs();
      showSuccess(newStatus === 'in_progress' ? `${code} ${resuming ? 'resumed' : 'started'}. Work is now in progress.` : `${code} updated.`);
    } catch (statusError) {
      reportError(statusError.message || 'Unable to update job status.');
    } finally {
      setIsUpdatingStatus(false);
      setUpdatingJobId(null);
    }
  };

  const handleHoldJob = async (jobId, reason) => {
    const trimmedReason = String(reason || '').trim();
    setDialogError('');
    if (trimmedReason.length < 5) {
      reportError('Give a reason of at least 5 characters for putting the job on hold.');
      return false;
    }

    const job = jobs.find((entry) => entry.id === jobId);
    try {
      setIsUpdatingStatus(true);
      setUpdatingJobId(jobId);
      await updateJobStatus(jobId, 'on_hold', trimmedReason);
      await loadJobs();
      showSuccess(`${formatTicketId(job?.ticketId || jobId)} is on hold. Resume it when you are ready to continue.`);
      return true;
    } catch (holdError) {
      reportError(holdError.message || 'Unable to put the job on hold.');
      return false;
    } finally {
      setIsUpdatingStatus(false);
      setUpdatingJobId(null);
    }
  };

  const handleCompleteJob = async () => {
    if (!completionJob) {
      return;
    }

    setCompletionError('');
    if (completionJob.assignmentRole === 'crew') {
      setCompletionError('Only the lead technician can complete this job.');
      return;
    }

    if (!completionJob.checklistCompleted) {
      setCompletionError('Complete and submit the job checklist before closing this job.');
      return;
    }

    if (completionJob.ticketType !== 'inspection' && proofImages.length === 0) {
      setCompletionError('Add at least one photo of the finished work before completing the job.');
      return;
    }

    try {
      setIsCompleting(true);
      const inventoryUsage = (completionJob.inventoryReservations || [])
        .filter((reservation) => reservation.status === 'pending')
        .map((reservation) => ({
          reservation_id: reservation.id,
          item_id: reservation.itemId,
          quantity_used: Number(materialUsage[String(reservation.id)] || 0)
        }));

      await updateJobStatus(completionJob.id, 'completed', completionNotes, proofImages.map((image) => image.file), inventoryUsage);
      await loadJobs();
      setCompletionJob(null);
      setProofImages([]);
      setCompletionNotes('');
      setMaterialUsage({});
      showSuccess(`${formatTicketId(completionJob.ticketId || completionJob.id)} completed. It is now in Job History.`);
    } catch (completeError) {
      setCompletionError(completeError.message || 'Unable to complete job.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleRequestEquipment = async (event) => {
    event.preventDefault();
    if (!selectedJob) {
      return;
    }

    setDialogError('');
    if (equipmentForm.itemIds.length === 0) {
      reportError('Choose the equipment you need.');
      return;
    }

    const selectedItems = equipmentForm.itemIds.map((itemId) => {
      const inventoryItem = inventoryItems.find((item) => String(item.id) === String(itemId));
      return {
        itemId,
        quantity: Number(equipmentForm.quantities[itemId]),
        availableQuantity: inventoryItem?.availableQuantity || 0,
        name: inventoryItem?.name || 'Equipment'
      };
    });

    const invalidItem = selectedItems.find(
      (item) => !Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > item.availableQuantity
    );
    if (invalidItem) {
      reportError(`Enter a quantity between 1 and ${invalidItem.availableQuantity} for ${invalidItem.name}.`);
      return;
    }

    try {
      setEquipmentSubmitting(true);
      const pausedJob = Boolean(equipmentForm.pauseJob);
      await requestAdditionalEquipment(selectedJob.id, {
        items: selectedItems.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
        notes: equipmentForm.notes,
        pauseJob: pausedJob
      });
      setEquipmentForm(emptyEquipmentForm);
      setEquipmentDropdownOpen(false);
      await loadJobs();
      await loadInventoryItems();
      showSuccess(pausedJob
        ? 'Equipment requested and the job is on hold. Resume it when you are ready to continue.'
        : 'Equipment requested. You can keep working while the admin reviews it.');
    } catch (requestError) {
      reportError(requestError.message || 'Unable to request additional equipment.');
    } finally {
      setEquipmentSubmitting(false);
    }
  };

  const toggleEquipmentItem = (itemId) => {
    const normalizedItemId = String(itemId);
    setEquipmentForm((currentForm) => {
      const isSelected = currentForm.itemIds.includes(normalizedItemId);
      const nextItemIds = isSelected
        ? currentForm.itemIds.filter((selectedId) => selectedId !== normalizedItemId)
        : [...currentForm.itemIds, normalizedItemId];
      const nextQuantities = { ...currentForm.quantities };
      if (isSelected) {
        delete nextQuantities[normalizedItemId];
      } else {
        nextQuantities[normalizedItemId] = nextQuantities[normalizedItemId] || 1;
      }
      return { ...currentForm, itemIds: nextItemIds, quantities: nextQuantities };
    });
  };

  const updateEquipmentQuantity = (itemId, quantity) => {
    setEquipmentForm((currentForm) => ({
      ...currentForm,
      quantities: {
        ...currentForm.quantities,
        [String(itemId)]: quantity
      }
    }));
  };

  const selectedInventoryItems = equipmentForm.itemIds
    .map((itemId) => inventoryItems.find((item) => String(item.id) === String(itemId)))
    .filter(Boolean);

  return {
    activeJob,
    actionMessage,
    setActionMessage,
    setError,
    dialogError,
    setDialogError,
    completionError,
    setCompletionError,
    loading,
    updatingJobId,
    closeJobDetails,
    completionJob,
    completionNotes,
    equipmentDropdownOpen,
    equipmentForm,
    equipmentSubmitting,
    error,
    handleCompleteJob,
    handleHoldJob,
    handleImageUpload,
    handleRequestEquipment,
    handleStatusUpdate,
    inventoryItems,
    isCompleting,
    isUpdatingStatus,
    jobs,
    loadJobs,
    openJobDetails,
    proofImages,
    removeImage,
    searchParams,
    selectedInventoryItems,
    selectedJob,
    setCompletionJob,
    setCompletionNotes,
    setEquipmentDropdownOpen,
    setEquipmentForm,
    setProofImages,
    setSearchParams,
    toggleEquipmentItem,
    materialUsage,
    setMaterialUsage,
    updateEquipmentQuantity
  };
}
