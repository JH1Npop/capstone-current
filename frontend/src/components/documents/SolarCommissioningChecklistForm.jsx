import React, { useState, useEffect } from 'react';
import { FiSave, FiCheck, FiSun } from 'react-icons/fi';
import { fetchSolarCommissioningChecklist, saveSolarCommissioningChecklist } from '../../api/services';

const COMMISSIONING_TEMPLATE_ITEMS = [
  { item_no: 1, section: 'Safety', description: 'AC & DC disconnects are in the open position.' },
  { item_no: 2, section: 'Safety', description: 'All combiner fuses holders are open.' },
  { item_no: 3, section: 'Safety', description: 'No voltage is present at either the AC or DC Disconnects.' },
  { item_no: 4, section: 'Safety', description: 'If disconnects are not in sight during testing use LOTO.' },
  { item_no: 5, section: 'Plan Review', description: 'Review "As Built" Plan changes.' },
  { item_no: 6, section: 'Plan Review', description: 'Equipment locations, model #s and specifications as per Plan.' },
  { item_no: 7, section: 'Plan Review', description: 'OCP amperage and voltage as per Plan.' },
  { item_no: 8, section: 'Plan Review', description: 'Conduit sizes and materials as per Plan.' },
  { item_no: 9, section: 'Plan Review', description: 'Current carrying conductor size and type as per Plan.' },
  { item_no: 10, section: 'Plan Review', description: 'Grounding and Bonding Conductor - Size and Type as per Plan.' },
  { item_no: 11, section: 'Plan Review', description: 'Equipment and Conduits Grounded or Bonded as per Plan.' },
  { item_no: 12, section: 'Inverter Output and AC Disconnects', description: 'Net Metered OCP is installed in the correct panel location and is properly labeled.' },
  { item_no: 13, section: 'Inverter Output and AC Disconnects', description: 'All Code and PSS required labels are on the AC disconnect cover.' },
  { item_no: 14, section: 'Inverter Output and AC Disconnects', description: 'AC disconnect terminations have been torqued and labeled.' },
  { item_no: 15, section: 'Inverter Output and AC Disconnects', description: 'The AC disconnect is wired as per Plan.' },
  { item_no: 16, section: 'Inverter Output and AC Disconnects', description: 'The AC disconnect is securely attached and neat.' },
  { item_no: 17, section: 'Inverter', description: "The inverter is properly sited and secured with all manufacturer's required clearances." },
  { item_no: 18, section: 'Inverter', description: "Isolation transformer terminations are as per manufacturer's instructions and torqued." },
  { item_no: 19, section: 'Inverter', description: "AC & DC terminations are as per manufacturer's instructions, torqued and labeled." },
  { item_no: 20, section: 'Inverter', description: 'Visually inspect the inverter enclosure for signs of damage in shipping or siting and that all doors open freely.' },
  { item_no: 21, section: 'Inverter', description: 'Visually inspect the interior of the inverter and check for loose sub-assemblies and connections.' },
  { item_no: 22, section: 'Inverter', description: 'Inverter ventilation fans move freely and filters are in-place.' },
  { item_no: 23, section: 'Inverter', description: 'All Code and PSS required labels are on the inverter doors.' },
  { item_no: 24, section: 'Inverter', description: "Bender RCMS Unit and combiner power supply is properly installed as per PSS's installation instructions." },
  { item_no: 25, section: 'PV Output to Inverter', description: 'Junction box terminations are torqued, cables are labeled and properly grounded.' },
  { item_no: 26, section: 'PV Output to Inverter', description: 'Cables routed through conduit bodies are neat and not damaging cable insulation.' },
  { item_no: 27, section: 'PV Output to Inverter', description: "Expansion joints are installed as per manufacturer's instructions and per Plans." },
  { item_no: 28, section: 'PV Output to Inverter', description: 'Conduit runs are per Plan, neat, supported properly and the conduit fittings are tight.' },
  { item_no: 29, section: 'PV Output to Inverter', description: 'The DC disconnect is securely attached and neat.' },
  { item_no: 30, section: 'PV Output to Inverter', description: "The DC disconnect is wired as per manufacturer's and PSS's instructions." },
  { item_no: 31, section: 'PV Output to Inverter', description: 'DC disconnect terminations have been torqued and labeled.' },
  { item_no: 32, section: 'PV Output to Inverter', description: 'All Code and PSS required labels are on the DC disconnect cover.' },
  { item_no: 33, section: 'PV Output to Inverter', description: "The module's nameplate specification is as per the Plans." },
  { item_no: 34, section: 'PV Output to Inverter', description: "Modules are installed and mounted as per the manufacturer's instructions." },
  { item_no: 35, section: 'PV Array', description: 'PV array layout matches the approved plan and string grouping.' },
  { item_no: 36, section: 'PV Array', description: 'There are no damaged or misaligned modules in the array.' },
  { item_no: 37, section: 'PV Array', description: "PV connectors are installed as per the manufacturer's instructions and fully engaged." },
  { item_no: 38, section: 'PV Array', description: 'PV Wiring is properly supported, neat and there are no points where the insulation could become damaged.' },
  { item_no: 39, section: 'PV Array', description: 'Array combiners are terminated as per Plans and are neat.' },
  { item_no: 40, section: 'PV Array', description: 'Combiner terminations have been torqued and labeled.' },
  { item_no: 41, section: 'PV Array', description: 'All Code and PSS required labels are on the combiner cover.' },
  { item_no: 42, section: 'PV Array', description: 'Review the String Open Circuit Voltage and Short Circuit Amperage Test Results.' },
  { item_no: 43, section: 'PV Array', description: 'Review DC Array Megger Test results.' },
  { item_no: 44, section: 'Inverter Start-up', description: 'Close the inverter AC disconnects and power-up the inverter AC side, record the line voltages.' },
  { item_no: 45, section: 'Inverter Start-up', description: 'Turn on the inverter and test all safety interlocks (door switches, Bender, Anti-Islanding, etc).' },
  { item_no: 46, section: 'Inverter Start-up', description: 'Close all combiner fuse holders and any manual disconnects.' },
  { item_no: 47, section: 'Inverter Start-up', description: 'Confirm DC voltage and polarity at the DC disconnect and at the inverter.' },
  { item_no: 48, section: 'Inverter Start-up', description: 'Confirm the AC and DC Surge Protection is operational.' },
  { item_no: 49, section: 'Inverter Start-up', description: 'Close the inverter DC disconnects and put the inverter on line.' },
  { item_no: 50, section: 'Inverter Start-up', description: 'Confirm inverter display voltages and check inverter output.' },
  { item_no: 51, section: 'Inverter Start-up', description: 'Complete Performance Testing.' },
  { item_no: 52, section: 'Monitoring Equipment', description: "Weather Station equipment is installed and wired as per the manufacturer's instructions." },
  { item_no: 53, section: 'Monitoring Equipment', description: "Power Monitoring equipment is installed and wired as per the manufacturer's instructions." },
  { item_no: 54, section: 'Monitoring Equipment', description: 'Monitoring from the inverter and the Gateway is complete and operational.' },
];

export default function SolarCommissioningChecklistForm({ ticketId, userRole, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState({
    items: COMMISSIONING_TEMPLATE_ITEMS.map(item => ({ ...item, check_type: '' })),
    weather_condition: '',
    ambient_temperature: '',
    solar_irradiance: '',
    remarks: '',
  });

  useEffect(() => {
    loadChecklist();
  }, [ticketId]);

  const loadChecklist = async () => {
    try {
      setLoading(true);
      const data = await fetchSolarCommissioningChecklist(ticketId);
      if (data) {
        setChecklist(data);
        
        let loadedItems = data.items || [];
        if (loadedItems.length === 0) {
          loadedItems = COMMISSIONING_TEMPLATE_ITEMS.map(item => ({ ...item, check_type: '' }));
        }

        setFormData({
          items: loadedItems,
          weather_condition: data.weather_condition || '',
          ambient_temperature: data.ambient_temperature || '',
          solar_irradiance: data.solar_irradiance || '',
          remarks: data.remarks || ''
        });
      } else {
        setFormData(prev => ({
          ...prev,
          items: COMMISSIONING_TEMPLATE_ITEMS.map(item => ({ ...item, check_type: '' }))
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (index, checkType) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], check_type: checkType };
    setFormData({ ...formData, items: newItems });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      setSubmitting(true);
      setMessage('');
      const payload = { ticket: ticketId, ...formData, id: checklist?.id };
      const saved = await saveSolarCommissioningChecklist(payload);
      setChecklist(saved);
      setMessage('Commissioning checklist saved successfully.');
      if (onSuccess) onSuccess(saved);
    } catch (err) {
      setMessage(err.message || 'Error saving checklist.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4">Loading Commissioning Checklist...</div>;

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
          <input type="text" name="weather_condition" value={formData.weather_condition} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border" placeholder="e.g. Sunny" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Ambient Temperature (°C)</label>
          <input type="text" name="ambient_temperature" value={formData.ambient_temperature} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border" placeholder="e.g. 32" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Solar Irradiance (W/m²)</label>
          <input type="text" name="solar_irradiance" value={formData.solar_irradiance} onChange={handleInputChange} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border" placeholder="e.g. 800" />
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
              {formData.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="border p-2 text-center text-slate-500">{item.item_no}</td>
                  <td className="border p-2 font-medium text-slate-700">{item.section}</td>
                  <td className="border p-2 text-slate-600">{item.description}</td>
                  <td className="border p-2">
                    <select
                      value={item.check_type || ''}
                      onChange={(e) => handleItemChange(idx, e.target.value)}
                      className="w-full border-slate-300 rounded focus:ring-orange-500 focus:border-orange-500 text-xs p-1"
                    >
                      <option value="">--</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
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
        <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className="w-full border-slate-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border" placeholder="Any additional notes..." />
      </div>

      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium disabled:opacity-50"
        >
          <FiSave />
          Save Checklist
        </button>
      </div>
    </div>
  );
}
