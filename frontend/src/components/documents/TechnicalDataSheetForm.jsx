import React, { useState, useEffect } from 'react';
import { FiSave, FiCheck, FiFileText } from 'react-icons/fi';
import { fetchTechnicalDataSheet, saveTechnicalDataSheet, submitTechnicalDataSheet, reviewTechnicalDataSheet } from '../../api/services';

const PREMISE_TYPES = ['Residential', 'Commercial', 'Industrial'];
const OWNERSHIP_TYPES = ['Owned', 'Rented', 'Leased'];

export default function TechnicalDataSheetForm({ ticketId, userRole, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tds, setTds] = useState(null);
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState({
    premise_type: '',
    premise_category: '',
    ownership_type: '',
    private_or_government_type: '',
    primary_electric_supply: '',
    ac_phase_power_supply: '',
    solar_panel_installation_location: '',
    rooftop_type: '',
    average_monthly_electric_bill: '',
    electricity_required_hours_per_day: '',
    brownout_frequency: '',
    battery_preference: '',
    purpose_of_going_solar: ''
  });

  useEffect(() => {
    loadTDS();
  }, [ticketId]);

  const loadTDS = async () => {
    try {
      setLoading(true);
      const data = await fetchTechnicalDataSheet(ticketId);
      if (data) {
        setTds(data);
        setFormData({
          premise_type: data.premise_type || '',
          premise_category: data.premise_category || '',
          ownership_type: data.ownership_type || '',
          private_or_government_type: data.private_or_government_type || '',
          primary_electric_supply: data.primary_electric_supply || '',
          ac_phase_power_supply: data.ac_phase_power_supply || '',
          solar_panel_installation_location: data.solar_panel_installation_location || '',
          rooftop_type: data.rooftop_type || '',
          average_monthly_electric_bill: data.average_monthly_electric_bill || '',
          electricity_required_hours_per_day: data.electricity_required_hours_per_day || '',
          brownout_frequency: data.brownout_frequency || '',
          battery_preference: data.battery_preference || '',
          purpose_of_going_solar: data.purpose_of_going_solar || ''
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
      const payload = { ticket: ticketId, ...formData };
      const saved = await saveTechnicalDataSheet(payload, tds?.id);
      setTds(saved);
      setMessage('TDS draft saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      setMessage(err.message || 'Error saving TDS.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!tds?.id) return;
    if (!window.confirm("Are you sure you want to submit this TDS? It will become read-only for technicians.")) return;
    try {
      setSubmitting(true);
      setMessage('');
      await submitTechnicalDataSheet(tds.id);
      await loadTDS();
      setMessage('TDS submitted successfully.');
      if (onSuccess) onSuccess({ ...tds, status: 'submitted' });
    } catch (err) {
      setMessage(err.message || 'Error submitting TDS.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async () => {
    if (!tds?.id) return;
    try {
      setSubmitting(true);
      setMessage('');
      await reviewTechnicalDataSheet(tds.id);
      await loadTDS();
      setMessage('TDS marked as reviewed.');
      if (onSuccess) onSuccess({ ...tds, status: 'reviewed' });
    } catch (err) {
      setMessage(err.message || 'Error reviewing TDS.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4">Loading Technical Data Sheet...</div>;

  const isReadOnly = tds?.status === 'submitted' || tds?.status === 'reviewed';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FiFileText className="text-blue-500" />
          Technical Data Sheet
        </h3>
        {tds && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            tds.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
            tds.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {tds.status.toUpperCase()}
          </span>
        )}
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Premise Details</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Premise Type</label>
              <select name="premise_type" value={formData.premise_type} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border">
                <option value="">Select Type...</option>
                {PREMISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ownership Type</label>
              <select name="ownership_type" value={formData.ownership_type} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border">
                <option value="">Select Ownership...</option>
                {OWNERSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gov/Private</label>
              <input type="text" name="private_or_government_type" value={formData.private_or_government_type} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="e.g. Private" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Power Details</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Primary Supply</label>
              <input type="text" name="primary_electric_supply" value={formData.primary_electric_supply} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="e.g. Meralco" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">AC Phase</label>
              <input type="text" name="ac_phase_power_supply" value={formData.ac_phase_power_supply} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="e.g. Single Phase" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rooftop Type</label>
              <input type="text" name="rooftop_type" value={formData.rooftop_type} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="e.g. GI Sheet" />
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Electrical Consumption</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Avg Monthly Bill (PHP)</label>
              <input type="text" name="average_monthly_electric_bill" value={formData.average_monthly_electric_bill} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Required Hours/Day</label>
              <input type="text" name="electricity_required_hours_per_day" value={formData.electricity_required_hours_per_day} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Brownout Frequency</label>
              <input type="text" name="brownout_frequency" value={formData.brownout_frequency} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Battery Preference</label>
              <input type="text" name="battery_preference" value={formData.battery_preference} onChange={handleInputChange} disabled={isReadOnly} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition font-medium disabled:opacity-50"
          >
            <FiSave />
            Save Draft
          </button>
        )}
        
        {!isReadOnly && tds?.id && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
          >
            <FiCheck />
            Submit TDS
          </button>
        )}

        {tds?.status === 'submitted' && (userRole === 'admin' || userRole === 'supervisor') && (
          <button
            onClick={handleReview}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50"
          >
            <FiCheck />
            Mark as Reviewed
          </button>
        )}
      </div>
    </div>
  );
}
