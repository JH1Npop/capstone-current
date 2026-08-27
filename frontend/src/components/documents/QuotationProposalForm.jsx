import React, { useState, useEffect } from 'react';
import { FiSave, FiCheck, FiDollarSign } from 'react-icons/fi';
import { fetchQuotationRecord, saveQuotationRecord } from '../../api/services';

export default function QuotationProposalForm({ ticketId, userRole, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quotation, setQuotation] = useState(null);
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState({
    quotation_number: '',
    total_amount: '',
    validity_days: 30,
    payment_terms: '',
    warranty_terms: ''
  });

  useEffect(() => {
    loadQuotation();
  }, [ticketId]);

  const loadQuotation = async () => {
    try {
      setLoading(true);
      const data = await fetchQuotationRecord(ticketId);
      if (data) {
        setQuotation(data);
        setFormData({
          quotation_number: data.quotation_number || '',
          total_amount: data.total_amount || '',
          validity_days: data.validity_days || 30,
          payment_terms: data.payment_terms || '',
          warranty_terms: data.warranty_terms || ''
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
      const payload = { ticket: ticketId, ...formData, id: quotation?.id };
      const saved = await saveQuotationRecord(payload);
      setQuotation(saved);
      setMessage('Quotation draft saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      setMessage(err.message || 'Error saving quotation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4">Loading Quotation details...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FiDollarSign className="text-green-500" />
          Project Quotation & Terms
        </h3>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Pricing Details</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quotation Reference Number</label>
              <input type="text" name="quotation_number" value={formData.quotation_number} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border" placeholder="e.g. QUO-0001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount (PHP)</label>
              <input type="number" name="total_amount" value={formData.total_amount} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border" placeholder="e.g. 150000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Validity (Days)</label>
              <input type="number" name="validity_days" value={formData.validity_days} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-3 border-b pb-1">Contract Terms</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Terms</label>
              <textarea name="payment_terms" value={formData.payment_terms} onChange={handleInputChange} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border" placeholder="e.g. 50% Downpayment, 50% upon completion..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Warranty Terms</label>
              <textarea name="warranty_terms" value={formData.warranty_terms} onChange={handleInputChange} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border" placeholder="e.g. 1 Year Workmanship, 10 Years Panel..." />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
        >
          <FiSave />
          Save Quotation Record
        </button>
      </div>
    </div>
  );
}
