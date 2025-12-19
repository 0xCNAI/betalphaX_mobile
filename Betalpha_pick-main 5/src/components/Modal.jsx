import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, children, title }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Prevent scrolling on body when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end sm:items-center z-[9999] sm:p-4 animate-in fade-in duration-200">
      <div
        className="bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-3xl lg:max-w-4xl sm:rounded-2xl border border-slate-700/60 shadow-2xl relative animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 p-2 bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors z-50 backdrop-blur-sm"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {title && (
          <div className="px-6 py-4 border-b border-slate-700/60 bg-slate-900/95 backdrop-blur-sm shrink-0">
            <h2 className="text-xl font-bold text-slate-100">{title}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto bg-slate-900/50 p-6 space-y-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
