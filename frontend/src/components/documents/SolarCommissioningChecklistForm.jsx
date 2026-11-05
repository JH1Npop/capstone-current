import React, { useState, useEffect } from 'react';
import { FiSave, FiSun } from 'react-icons/fi';
import { fetchSolarCommissioningChecklist, saveSolarCommissioningChecklist } from '../../api/services';
import {
  adaptSolarCommissioningDraft,
  createSolarCommissioningDraft,
  serializeSolarCommissioningRecord,
  updateSolarCommissioningItem,
  updateSolarCommissioningNote,
} from '../../documents/solarCommissioningSchema';

export default function SolarCommissioningChecklistForm({ ticketId, userRole, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState(createSolarCommissioningDraft);

  useEffect(() => {
    loadChecklist();
  }, [ticketId]);

  const loadChecklist = async () => {
    try {
      setLoading(true);
      const data = await fetchSolarCommissioningChecklist(ticketId);
      if (data) {
        setChecklist(data);
        setFormData(adaptSolarCommissioningDraft(data));
      } else {
        setFormData(adaptSolarCommissioningDraft({ ticket: ticketId }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (index, checkType) => {
    const item = formData.checklist_items_json[index];
    setFormData((current) => updateSolarCommissioningItem(current, item.item_no, 'check_status', checkType));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      setSubmitting(true);
      setMessage('');
      const payload = serializeSolarCommissioningRecord({ ...formData, id: checklist?.id }, Number(ticketId));
      const saved = await saveSolarCommissioningChecklist(payload);
      setChecklist(saved);
      setFormData(adaptSolarCommissioningDraft(saved));
      setMessage('Commissioning checklist saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      setMessage(err.message || 'Error saving checklist.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4">Loading Commissioning Checklist...</div>;
  const locked = formData.status === 'finalized';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FiSun className="text-orange-500" />
          PV Solar Commissioning Checklist
        </h3>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Weather Condition</label>
          <input type="text" name="weather_condition" value={formData.readings_json?.weather_condition || ''} onChange={(event) => setFormData((current) => updateSolarCommissioningNote(current, 'weather_condition', event.target.value))} disabled={locked} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border disabled:bg-slate-100" placeholder="e.g. Sunny" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Ambient Temperature (°C)</label>
          <input type="text" name="ambient_temperature" value={formData.ambient_temperature} onChange={handleInputChange} disabled={locked} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border disabled:bg-slate-100" placeholder="e.g. 32" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Solar Irradiance (W/m²)</label>
          <input type="text" name="irradiance" value={formData.irradiance} onChange={handleInputChange} disabled={locked} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border disabled:bg-slate-100" placeholder="e.g. 800" />
        </div>
      </div>

      <div className="mb-6">
        <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Checklist Items</h4>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border p-2 text-left w-12">No.</th>
                <th className="border p-2 text-left w-48">Section</th>
                <th className="border p-2 text-left">Description</th>
                <th className="border p-2 text-center w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {formData.checklist_items_json.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="border p-2 text-center text-slate-500">{item.item_no}</td>
                  <td className="border p-2 font-medium text-slate-700">{item.section}</td>
                  <td className="border p-2 text-slate-600">{item.description}</td>
                  <td className="border p-2">
                    <select
                      value={item.check_status || ''}
                      onChange={(e) => handleItemChange(idx, e.target.value)}
                      disabled={locked}
                      className="w-full border-slate-300 rounded focus:ring-orange-500 focus:border-orange-500 text-xs p-1"
                    >
                      <option value="">--</option>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">General Remarks</label>
        <textarea name="remarks" value={formData.readings_json?.remarks || ''} onChange={(event) => setFormData((current) => updateSolarCommissioningNote(current, 'remarks', event.target.value))} disabled={locked} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border disabled:bg-slate-100" placeholder="Any additional notes..." />
      </div>

      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={handleSave}
          disabled={submitting || locked}
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium disabled:opacity-50"
        >
          <FiSave />
          {locked ? 'Checklist Finalized' : 'Save Checklist'}
        </button>
      </div>
    </div>
  );
}
