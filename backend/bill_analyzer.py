"""
Power bill analyzer using lightweight OCR to extract energy usage
Extracts monthly kWh, bill amount from bill images without LLM cost
"""
import base64
import re
from pathlib import Path
from typing import Dict, Optional
from PIL import Image
import io

class PowerBillAnalyzer:
    """Analyze power bill images using OCR to extract usage and cost data"""

    def __init__(self):
        self.extracted_data = None
        self.reader = None
        self._init_reader()

    def _init_reader(self):
        """Initialize OCR reader (lazy load)"""
        try:
            import easyocr
            self.reader = easyocr.Reader(['en'], gpu=False)
        except ImportError:
            print("[WARN] easyocr not installed - OCR features disabled")
            print("  Install with: pip install easyocr pillow")
            self.reader = None

    def analyze_bill_image(self, image_source: str) -> Dict:
        """
        Analyze power bill image (file path or base64)
        Returns: {monthly_kwh, average_bill, address, provider, confidence}
        """
        if not self.reader:
            return self._fallback_response("OCR reader not initialized")

        # Load image
        image = self._load_image(image_source)
        if image is None:
            return self._fallback_response("image load failed")

        try:
            # Convert PIL Image to numpy array for EasyOCR
            import numpy as np
            image_array = np.array(image)

            # Extract text from image
            results = self.reader.readtext(image_array)
            ocr_text = "\n".join([text[1] for text in results])

            # Parse extracted text for bill data
            parsed = self._parse_bill_text(ocr_text)
            self.extracted_data = parsed
            return parsed

        except Exception as e:
            print(f"[ERROR] OCR analysis failed: {e}")
            return self._fallback_response(str(e))

    def _load_image(self, image_source: str) -> Optional:
        """Load image from file path or base64"""
        try:
            # Check if it's base64 encoded
            if image_source.startswith("data:image/"):
                # Extract base64 part
                base64_str = image_source.split(",")[1]
                image_data = base64.b64decode(base64_str)
                return Image.open(io.BytesIO(image_data))
            elif len(image_source) > 100 and all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=" for c in image_source[:200]):
                # Looks like base64
                image_data = base64.b64decode(image_source)
                return Image.open(io.BytesIO(image_data))

            # Try as file path
            path = Path(image_source)
            if path.exists() and path.is_file():
                return Image.open(path)

            return None
        except Exception as e:
            print(f"[ERROR] Image load error: {e}")
            return None

    def _parse_bill_text(self, ocr_text: str) -> Dict:
        """Parse OCR text to extract kWh and bill amount (handles all TX retailers)"""
        text_upper = ocr_text.upper()
        text_lines = ocr_text.split('\n')

        # Extract kWh - look for patterns common across all retailers
        # (Gexa, Frontier, Just Energy, TXU, Reliant, etc. all show usage)
        kwh_patterns = [
            r'(\d{1,3}(?:,\d{3})*)\s*(?:kWh|KWH|kwh)',
            r'(?:total\s+)?usage[:\s]*(?:\(?\s*)?(\d{1,3}(?:,\d{3})*)',
            r'(\d{1,3}(?:,\d{3})*)\s+kwh\s+(?:used|consumed|delivered)',
            r'meter\s+reading.*?(\d{1,3}(?:,\d{3})*)\s*kwh',
            r'bill.*?(\d{1,3}(?:,\d{3})*)\s*kwh',
            r'energy\s+(?:usage|consumption)[:\s]*(\d{1,3}(?:,\d{3})*)',
        ]

        monthly_kwh = None
        for pattern in kwh_patterns:
            match = re.search(pattern, text_upper)
            if match:
                kwh_str = match.group(1).replace(",", "")
                try:
                    monthly_kwh = float(kwh_str)
                    if 100 <= monthly_kwh <= 5000:  # Sanity check (typical home usage)
                        break
                except ValueError:
                    continue

        # Extract bill amount - look for patterns common to all retailers
        # Look for "Amount Due", "Total Due", "Total Charges", etc.
        bill_patterns = [
            r'amount\s+(?:due|owing)[:\s]*\$?\s*(\d+(?:\.\d{2})?)',
            r'total\s+(?:amount|due|bill|charges)[:\s]*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',
            r'balance\s+(?:due|owing)[:\s]*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',
            r'(?:total|charge)[:\s]*\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',
            r'\$\s*(\d+(?:\.\d{2})?)\s*(?:due|total)',
        ]

        average_bill = None
        for pattern in bill_patterns:
            match = re.search(pattern, text_upper, re.IGNORECASE)
            if match:
                bill_str = match.group(1).replace(",", "")
                try:
                    average_bill = float(bill_str)
                    if 20 <= average_bill <= 500:  # Sanity check (typical monthly bill)
                        break
                except ValueError:
                    continue

        # If still no bill found, try to sum all dollar amounts
        if not average_bill:
            dollar_matches = re.findall(r'\$\s*(\d+(?:\.\d{2})?)', ocr_text)
            if dollar_matches:
                try:
                    amounts = [float(x) for x in dollar_matches if 20 <= float(x) <= 500]
                    if amounts:
                        average_bill = max(amounts)  # Take the largest reasonable amount
                except ValueError:
                    pass

        # Identify retailer/provider from common TX suppliers
        provider = None
        retailer_keywords = {
            'GEXA': 'Gexa',
            'FRONTIER': 'Frontier',
            'JUST ENERGY': 'Just Energy',
            'TXU': 'TXU Energy',
            'RELIANT': 'Reliant',
            'ONCOR': 'Oncor (Utility)',
            'CENTERPOINT': 'CenterPoint (Utility)',
            'XCEL': 'Xcel Energy',
            'AEP': 'AEP',
            'ENTERGY': 'Entergy',
        }

        for keyword, name in retailer_keywords.items():
            if keyword in text_upper:
                provider = name
                break

        # Extract address (customer service location on bill)
        address = None
        for i, line in enumerate(text_lines):
            # Look for address-like patterns (number + street address)
            if re.search(r'^\d+\s+[a-zA-Z]', line.strip()):
                address = line.strip()
                break

        # Extract billing period if available
        billing_period = None
        period_match = re.search(r'(?:billing|service)\s+(?:period|dates?).*?(\d{1,2}/\d{1,2}.*?\d{1,2}/\d{1,2})', ocr_text, re.IGNORECASE)
        if period_match:
            billing_period = period_match.group(1)

        # Calculate confidence
        confidence = 0.0
        if monthly_kwh:
            confidence += 0.5
        if average_bill:
            confidence += 0.5

        extraction_notes = []
        if monthly_kwh:
            extraction_notes.append(f"{monthly_kwh:.0f} kWh")
        if average_bill:
            extraction_notes.append(f"${average_bill:.2f}")
        if provider:
            extraction_notes.append(f"({provider})")

        return {
            "monthly_kwh": monthly_kwh,
            "bill_amount": average_bill,
            "address": address,
            "provider": provider,
            "billing_period": billing_period,
            "confidence": confidence,
            "extraction_notes": " - ".join(extraction_notes) if extraction_notes else "Incomplete extraction",
        }

    def _fallback_response(self, error_msg: str) -> Dict:
        """Return fallback response when analysis fails"""
        return {
            "monthly_kwh": None,
            "bill_amount": None,
            "address": None,
            "provider": None,
            "confidence": 0.0,
            "extraction_notes": f"Analysis failed: {error_msg}",
        }

    def validate_extraction(self) -> bool:
        """Check if extraction has valid energy/bill data"""
        if not self.extracted_data:
            return False
        return (
            self.extracted_data.get("monthly_kwh") is not None
            and self.extracted_data.get("bill_amount") is not None
            and self.extracted_data.get("confidence", 0) > 0.7
        )
