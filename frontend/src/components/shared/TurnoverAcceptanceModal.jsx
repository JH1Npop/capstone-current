import React from 'react';
import { FiX } from 'react-icons/fi';
import TurnoverAcceptanceForm from '../documents/TurnoverAcceptanceForm';
import { formatTicketId } from '../../utils/roleIds';

export default function TurnoverAcceptanceModal({ ticket, onClose, onSuccess }) {
  if (!ticket) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Turnover & Acceptance Form</h2>
            <p className="text-sm text-slate-500 mt-1">Ticket: <span className="font-semibold text-slate-700">{formatTicketId(ticket.id)}</span> - {ticket.clientFullname}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
          <TurnoverAcceptanceForm 
            ticketId={ticket.id} 
            userRole="admin" 
            onSuccess={(data) => {
              if (onSuccess) onSuccess(data);
              onClose();
            }} 
          />
        </div>
      </div>
    </div>
  );
}
