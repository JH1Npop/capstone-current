import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchTechnicianInventoryItems,
  fetchTechnicianJobs,
  requestAdditionalEquipment,
  markTechnicianArrival,
  updateJobStatus
} from '../api/api';
import { useAuth } from '../context/AuthContext';

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
  const [proofImages, setProofImages] = useState([]);
  const [completionNotes, setCompletionNotes] = useState('');
  const [materialUsage, setMaterialUsage] = useState({});
  const [inventoryItems, setInventoryItems] = useState([]);
  const [equipmentForm, setEquipmentForm] = useState({ itemIds: [], quantities: {}, notes: '' });
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const loadJobs = async () => {
    try {
      const data = await fetchTechnicianJobs(techName);
      setJobs(data);
      const active = data.find((job) => ['navigating', 'arrived_on_site', 'in_progress', 'on_hold'].includes(job.status?.toLowerCase()));
      setActiveJob(active || null);
      setError('');
    } catch (loadError) {
      setJobs([]);
      setActiveJob(null);
      setError(loadError.message || 'Unable to load jobs.');
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
    loadJobs();
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
    setSelectedJob(job);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('ticketId', String(job.ticketId || job.id));
    setSearchParams(nextSearchParams, { replace: true });
  };

  const closeJobDetails = () => {
    setSelectedJob(null);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('ticketId');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        setProofImages((currentImages) => [...currentImages, readerEvent.target.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setProofImages((currentImages) => currentImages.filter((_, imageIndex) => imageIndex !== index));
  };

  const handleStatusUpdate = async (jobId, newStatus) => {
    if (newStatus === 'arrived') {
      try {
        setIsUpdatingStatus(true);
        setActionMessage('Marking arrival...');
        const response = await markTechnicianArrival(jobId);
        if (response.error) {
          setError(response.error);
          setTimeout(() => setError(''), 5000);
          return;
        }
        await loadJobs();
        setActionMessage('Arrival confirmed.');
        setTimeout(() => setActionMessage(''), 3000);
      } catch (statusError) {
        setError(statusError.message || 'Unable to mark arrival.');
        setTimeout(() => setError(''), 5000);
      } finally {
        setIsUpdatingStatus(false);
      }
      return;
    }

    if (newStatus === 'in_progress' && activeJob && activeJob.id !== jobId) {
      setError(`You already have an active job (Ticket #${activeJob.id}). Please complete or hold it first.`);
      setTimeout(() => setError(''), 5000);
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setActionMessage(`Updating job status to ${newStatus}...`);
      const response = await updateJobStatus(jobId, newStatus, '', []);
      if (response.error) {
        setError(response.error);
        setTimeout(() => setError(''), 5000);
        return;
      }
      await loadJobs();
      setActionMessage(`Job status updated to ${newStatus}.`);
      setTimeout(() => setActionMessage(''), 3000);
    } catch (statusError) {
      setError(statusError.message || 'Unable to update job status.');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCompleteJob = async () => {
    if (!completionJob) {
      return;
    }

    if (completionJob.assignmentRole === 'crew') {
      setActionMessage('Only the lead technician can complete this job.');
      return;
    }

    if (!completionJob.checklistCompleted) {
      setActionMessage('Complete and submit the job checklist before closing this job.');
      return;
    }

    if (completionJob.ticketType !== 'inspection' && proofImages.length === 0) {
      setActionMessage('Please upload at least one proof image before completing the job.');
      return;
    }

    try {
      setIsCompleting(true);
      setActionMessage('Finishing job...');
      const inventoryUsage = (completionJob.inventoryReservations || [])
        .filter((reservation) => reservation.status === 'pending')
        .map((reservation) => ({
          reservation_id: reservation.id,
          item_id: reservation.itemId,
          quantity_used: Number(materialUsage[String(reservation.id)] || 0)
        }));

      await updateJobStatus(completionJob.id, 'completed', completionNotes, proofImages, inventoryUsage);
      await loadJobs();
      setCompletionJob(null);
      setProofImages([]);
      setCompletionNotes('');
      setMaterialUsage({});
      setActionMessage(`Job ${completionJob.id} completed successfully.`);
      setTimeout(() => setActionMessage(''), 4000);
    } catch (completeError) {
      setActionMessage(completeError.message || 'Unable to complete job.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleRequestEquipment = async (event) => {
    event.preventDefault();
    if (!selectedJob) {
      return;
    }

    if (equipmentForm.itemIds.length === 0) {
      setError('Please choose the equipment you need.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    const selectedItems = equipmentForm.itemIds.map((itemId) => {
      const inventoryItem = inventoryItems.find((item) => String(item.id) === String(itemId));
      return {
        itemId,
        quantity: Number(equipmentForm.quantities[itemId] || 1),
        availableQuantity: inventoryItem?.availableQuantity || 0,
        name: inventoryItem?.name || 'Equipment'
      };
    });

    const invalidItem = selectedItems.find(
      (item) => !Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > item.availableQuantity
    );
    if (invalidItem) {
      setError(`Enter a quantity between 1 and ${invalidItem.availableQuantity} for ${invalidItem.name}.`);
      setTimeout(() => setError(''), 4000);
      return;
    }

    try {
      setEquipmentSubmitting(true);
      await requestAdditionalEquipment(selectedJob.id, {
        items: selectedItems.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
        notes: equipmentForm.notes
      });
      setEquipmentForm({ itemIds: [], quantities: {}, notes: '' });
      setEquipmentDropdownOpen(false);
      await loadJobs();
      await loadInventoryItems();
      setActionMessage('Additional equipment request saved and sent to admin.');
      setTimeout(() => setActionMessage(''), 4000);
    } catch (requestError) {
      setError(requestError.message || 'Unable to request additional equipment.');
      setTimeout(() => setError(''), 5000);
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
    closeJobDetails,
    completionJob,
    completionNotes,
    equipmentDropdownOpen,
    equipmentForm,
    equipmentSubmitting,
    error,
    handleCompleteJob,
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
