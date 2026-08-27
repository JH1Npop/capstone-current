import React, { useState, useEffect } from 'react';
import { FiSave, FiCheck, FiAward } from 'react-icons/fi';
import { api } from '../../api/api';

const fetchTurnoverAcceptance = async (ticketId) => {
  const response = await api.get(`/services/turnover-acceptances/?ticket=${ticketId}`);
  return response.data.length ? response.data[0] : null;
};

const saveTurnoverAcceptance = async (payload) => {
  if (payload.id) {
    const response = await api.put(`/services/turnover-acceptances/${payload.id}/`, payload);
    return response.data;
  }
  const response = await api.post(`/services/turnover-acceptances/`, payload);
  return response.data;
};

export default function TurnoverAcceptanceForm({ ticketId, userRole, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [turnover, setTurnover] = useState(null);
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState({
    turnover_date: '',
    accepted_by_client_name: '',
    accepted_by_client_contact: '',
    warranty_start_date: ''
  });

  useEffect(() => {
    loadTurnover();
  }, [ticketId]);

  const loadTurnover = async () => {
    try {
      setLoading(true);
      const data = await fetchTurnoverAcceptance(ticketId);
      if (data) {
        setTurnover(data);
        setFormData({
          turnover_date: data.turnover_date || '',
          accepted_by_client_name: data.accepted_by_client_name || '',
          accepted_by_client_contact: data.accepted_by_client_contact || '',
          warranty_start_date: data.warranty_start_date || ''
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      setSubmitting(true);
      setMessage('');
      const payload = { ticket: ticketId, ...formData, id: turnover?.id };
      const saved = await saveTurnoverAcceptance(payload);
      setTurnover(saved);
      setMessage('Turnover Record saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      setMessage(err.message || 'Error saving turnover record.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4">Loading Turnover details...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FiAward className="text-blue-500" />
          Turnover / Acceptance Form
        </h3>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Handover Details</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Turnover Date</label>
              <input type="date" name="turnover_date" value={formData.turnover_date} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Warranty Start Date</label>
              <input type="date" name="warranty_start_date" value={formData.warranty_start_date} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Client Acceptance</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Accepted By (Client Name)</label>
              <input type="text" name="accepted_by_client_name" value={formData.accepted_by_client_name} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="e.g. John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Contact Details</label>
              <input type="text" name="accepted_by_client_contact" value={formData.accepted_by_client_contact} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="e.g. 0917-123-4567" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
        >
          <FiSave />
          Save Turnover Record
        </button>
      </div>
    </div>
  );
}
