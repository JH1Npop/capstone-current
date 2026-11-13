import React, { useState, useEffect } from 'react';
import { FiSave, FiCheck, FiClipboard } from 'react-icons/fi';
import { api } from '../../api/api';

// The list is paged ({count, results}); the latest report for the job is the one being filled in.
// (Reading `.length` on the page object found nothing, so every save created another report.)
const fetchFieldServiceReport = async (ticketId) => {
  const response = await api.get(`/services/field-service-reports/?ticket=${ticketId}`);
  const rows = Array.isArray(response.data) ? response.data : (response.data?.results || []);
  return rows.length ? rows[rows.length - 1] : null;
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
      setMessage(err?.response?.data?.detail || err.message || 'Unable to load the field service report.');
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
      // An empty date is "not signed yet", not an invalid date; only the office records acknowledgement.
      payload.client_signature_date = payload.client_signature_date || null;
      if (userRole !== 'admin') {
        delete payload.client_acknowledged;
        delete payload.client_signature_date;
      }
      const saved = await saveFieldServiceReport(payload);
      setReport(saved);
      setMessage('Field Service Report saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      const detail = err?.response?.data;
      const firstFieldError = detail && typeof detail === 'object'
        ? Object.values(detail).flat().find((value) => typeof value === 'string')
        : '';
      setMessage(firstFieldError || err.message || 'Error saving report.');
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


      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Equipment Details</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Brand / Model
                <input type="text" name="brand_model" value={formData.brand_model} onChange={handleInputChange} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Serial Number
                <input type="text" name="serial_number" value={formData.serial_number} onChange={handleInputChange} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
              </label>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Readings</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Indoor Temp
                <input type="text" name="indoor_temp" value={formData.indoor_temp} onChange={handleInputChange} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Outdoor Temp
                <input type="text" name="outdoor_temp" value={formData.outdoor_temp} onChange={handleInputChange} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Ampere Reading
                <input type="text" name="ampere_reading" value={formData.ampere_reading} onChange={handleInputChange} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Voltage Reading
                <input type="text" name="voltage_reading" value={formData.voltage_reading} onChange={handleInputChange} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700">Before Service Notes
            <textarea name="before_service_readings" value={formData.before_service_readings} onChange={handleInputChange} rows={3} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm p-2 border" />
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">After Service Notes
            <textarea name="after_service_readings" value={formData.after_service_readings} onChange={handleInputChange} rows={3} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm p-2 border" />
          </label>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700">Recommendations / Remarks
          <textarea name="recommendation" value={formData.recommendation} onChange={handleInputChange} rows={3} className="mt-1 w-full border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm p-2 border" />
        </label>
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
            <label className="block text-sm font-medium text-slate-700">Signature / Acknowledgment Date
              <input type="date" name="client_signature_date" value={formData.client_signature_date} onChange={handleInputChange} className="mt-1 border-slate-300 rounded-lg shadow-sm focus:border-teal-500 focus:ring-teal-500 text-base sm:text-sm min-h-11 p-2 border" />
            </label>
          </div>
        </div>
      )}

      {message ? (
        <p role={message.includes('success') ? 'status' : 'alert'} className={`mt-6 rounded-lg p-3 text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="flex min-h-11 items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50"
        >
          <FiSave />
          Save Field Service Report
        </button>
      </div>
    </div>
  );
}
