import { useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface BillData {
  monthly_kwh: number;
  bill_amount: number;
  provider?: string;
  address?: string;
  // /analyze-power-bill already computes the full ROI analysis in the same call -
  // pass it through instead of re-fetching /stage2/analyze with the extracted values.
  analysis?: {
    qualified: boolean;
    risk_score: number;
    risk_tier: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
    estimated_outage_hours_per_year: number;
    outage_protection_value_monthly: number;
    outage_protection_value_annual: number;
    recommended_capacity_kwh: number;
    confidence: number;
    qualification_reason: string;
    next_steps: string | null;
  };
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
            const body = await response.json().catch(() => null);
            // Surface the backend's actual reason (e.g. OCR not installed) instead of
            // always blaming the photo - that sent people looking for a clearer photo
            // when the real fix was "click Enter usage manually" instead.
            const notes = body?.ocr_result?.extraction_notes as string | undefined;
            setError(
              notes?.startsWith('Analysis failed: OCR reader not initialized')
                ? 'Photo scanning isn\'t available right now - enter your usage manually instead.'
                : (body?.hint ?? 'Failed to analyze bill. Make sure it\'s a clear photo.'),
            );
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
            analysis: {
              qualified: data.qualified,
              risk_score: data.risk_score,
              risk_tier: data.risk_tier,
              estimated_outage_hours_per_year: data.estimated_outage_hours_per_year,
              outage_protection_value_monthly: data.outage_protection_value_monthly,
              outage_protection_value_annual: data.outage_protection_value_annual,
              recommended_capacity_kwh: data.recommended_capacity_kwh,
              confidence: data.confidence,
              qualification_reason: data.qualification_reason,
              next_steps: data.next_steps,
            },
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
