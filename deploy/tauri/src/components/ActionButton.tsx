import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

interface ActionButtonProps {
  label: string;
  onClick?: () => void;
}

export function ActionButton({ label }: ActionButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    try {
      await invoke('guide_open_browser');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="
          flex items-center gap-2 px-6 py-3 rounded-xl
          bg-blue-500 hover:bg-blue-600 active:bg-blue-700
          text-white font-medium text-base
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          shadow-lg shadow-blue-500/25
          dark:bg-blue-600 dark:hover:bg-blue-500
        "
      >
        <ExternalLinkIcon />
        <span>{label}</span>
      </button>
      {error && (
        <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg max-w-[360px] text-center">
          {error}
        </div>
      )}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
