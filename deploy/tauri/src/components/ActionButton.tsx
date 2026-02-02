import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

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
      await invoke('main_window_open_browser');
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
        className="btn-primary"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
        <span>{label}</span>
      </button>
      {error && (
        <div className="error-message max-w-[360px]">
          {error}
        </div>
      )}
    </div>
  );
}
