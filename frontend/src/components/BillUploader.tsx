import { useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface BillData {
  monthly_kwh: number;
  bill_amount: number;
  provider?: string;
  address?: string;
}

interface Props {
  zip: string;
  onSuccess: (data: BillData) => void;
  onCancel: () => void;
}

export function BillUploader({ zip, onSuccess, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = (e.target?.result as string).split(',')[1];

          const response = await fetch(`${API_URL}/analyze-power-bill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: base64,
              zip_code: zip,
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (!response.ok) {
            setError('Failed to analyze bill. Make sure it\'s a clear photo.');
            setLoading(false);
            return;
          }

          const data = await response.json();

          if (!data.extracted_monthly_kwh || !data.extracted_bill_amount) {
            setError('Could not extract usage from bill. Try a clearer photo.');
            setLoading(false);
            return;
          }

          onSuccess({
            monthly_kwh: data.extracted_monthly_kwh,
            bill_amount: data.extracted_bill_amount,
            provider: data.extraction?.provider,
            address: data.extraction?.address,
          });
        } catch (err) {
          setError('Error processing bill. Try again.');
          console.error(err);
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Error reading file.');
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="bill-uploader">
      <div className="bill-uploader__prompt">
        <p className="small" style={{ marginBottom: 8 }}>
          <strong>💡 Shortcut:</strong> Upload a photo of your power bill and we'll read it automatically.
        </p>
      </div>

      <div className="bill-uploader__input">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn--secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? '📸 Reading bill...' : '📸 Upload bill photo'}
        </button>
      </div>

      {error && (
        <div className="callout" style={{ marginTop: 12, color: 'var(--error-color, #d32f2f)' }}>
          {error}
        </div>
      )}

      <div className="bill-uploader__divider" style={{ margin: '16px 0', textAlign: 'center', color: '#999' }}>
        — or —
      </div>

      <button className="btn btn--ghost" onClick={onCancel} style={{ width: '100%' }}>
        Enter usage manually
      </button>
    </div>
  );
}
