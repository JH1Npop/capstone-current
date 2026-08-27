import React, { useState, useEffect } from 'react';
import { FiSave, FiCheck, FiClipboard } from 'react-icons/fi';
import { api } from '../../api/api';

const fetchFieldServiceReport = async (ticketId) => {
  const response = await api.get(`/services/field-service-reports/?ticket=${ticketId}`);
  return response.data.length ? response.data[0] : null;
};

const saveFieldServiceReport = async (payload) => {
  if (payload.id) {
    const response = await api.put(`/services/field-service-reports/${payload.id}/`, payload);
    return response.data;
  }
  const response = await api.post(`/services/field-service-reports/`, payload);
  return response.data;
};

export default function FieldServiceReportForm({ ticketId, userRole, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState({
    indoor_temp: '',
    outdoor_temp: '',
    ampere_reading: '',
    voltage_reading: '',
    before_service_readings: '',
    after_service_readings: '',
    brand_model: '',
    serial_number: '',
    recommendation: '',
    client_acknowledged: false,
    client_signature_date: ''
  });

  useEffect(() => {
    loadReport();
  }, [ticketId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await fetchFieldServiceReport(ticketId);
      if (data) {
        setReport(data);
        setFormData({
          indoor_temp: data.indoor_temp || '',
          outdoor_temp: data.outdoor_temp || '',
          ampere_reading: data.ampere_reading || '',
          voltage_reading: data.voltage_reading || '',
          before_service_readings: data.before_service_readings || '',
          after_service_readings: data.after_service_readings || '',
          brand_model: data.brand_model || '',
          serial_number: data.serial_number || '',
          recommendation: data.recommendation || '',
          client_acknowledged: data.client_acknowledged || false,
          client_signature_date: data.client_signature_date || ''
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleSave = async () => {
    try {
      setSubmitting(true);
      setMessage('');
      const payload = { ticket: ticketId, ...formData, id: report?.id };
      const saved = await saveFieldServiceReport(payload);
      setReport(saved);
      setMessage('Field Service Report saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      setMessage(err.message || 'Error saving report.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4">Loading Field Service Report details...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FiClipboard className="text-teal-500" />
          Field Service Report
        </h3>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Equipment Details</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Brand / Model</label>
              <input type="text" name="brand_model" value={formData.brand_model} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
              <input type="text" name="serial_number" value={formData.serial_number} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Readings</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Indoor Temp</label>
              <input type="text" name="indoor_temp" value={formData.indoor_temp} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Outdoor Temp</label>
              <input type="text" name="outdoor_temp" value={formData.outdoor_temp} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ampere Reading</label>
              <input type="text" name="ampere_reading" value={formData.ampere_reading} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Voltage Reading</label>
              <input type="text" name="voltage_reading" value={formData.voltage_reading} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Before Service Notes</label>
          <textarea name="before_service_readings" value={formData.before_service_readings} onChange={handleInputChange} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">After Service Notes</label>
          <textarea name="after_service_readings" value={formData.after_service_readings} onChange={handleInputChange} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">Recommendations / Remarks</label>
        <textarea name="recommendation" value={formData.recommendation} onChange={handleInputChange} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
      </div>
      
      {userRole === 'admin' && (
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <input 
              type="checkbox" 
              id="client_acknowledged" 
              name="client_acknowledged" 
              checked={formData.client_acknowledged} 
              onChange={handleInputChange}
              className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
            />
            <label htmlFor="client_acknowledged" className="text-sm font-medium text-slate-700">Client Acknowledged Work</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Signature / Acknowledgment Date</label>
            <input type="date" name="client_signature_date" value={formData.client_signature_date} onChange={handleInputChange} className="border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border" />
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50"
        >
          <FiSave />
          Save Field Service Report
        </button>
      </div>
    </div>
  );
}
