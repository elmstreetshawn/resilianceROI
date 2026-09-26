"""
Test script for power bill analyzer - creates mock bill images for testing
"""
from PIL import Image, ImageDraw, ImageFont
import base64
import io
import json

def create_test_bill_image(supplier="GEXA", kwh=850, amount=105.50):
    """Create a simple mock power bill image for testing"""
    # Create image
    img = Image.new('RGB', (800, 600), color='white')
    draw = ImageDraw.Draw(img)

    # Simple text layout (no fancy fonts for compatibility)
    y_pos = 30
    line_height = 40

    # Bill header
    draw.text((50, y_pos), f"{supplier} ENERGY", fill='black')
    y_pos += line_height * 1.5

    # Billing period
    draw.text((50, y_pos), "Billing Period: 11/15/2024 - 12/14/2024", fill='black')
    y_pos += line_height

    # Account info
    draw.text((50, y_pos), "Account: 123456789", fill='black')
    y_pos += line_height

    # Address
    draw.text((50, y_pos), "1234 Main Street, Dallas, TX 75201", fill='black')
    y_pos += line_height * 1.5

    # Usage section
    draw.text((50, y_pos), "=== USAGE SUMMARY ===", fill='black')
    y_pos += line_height

    draw.text((50, y_pos), f"Total Usage: {kwh:,} kWh", fill='black')
    y_pos += line_height

    draw.text((50, y_pos), "Rate: $0.124/kWh", fill='black')
    y_pos += line_height * 1.5

    # Charges section
    draw.text((50, y_pos), "=== CHARGES ===", fill='black')
    y_pos += line_height

    draw.text((50, y_pos), f"Energy Charges: ${amount * 0.85:.2f}", fill='black')
    y_pos += line_height

    draw.text((50, y_pos), f"Taxes & Fees: ${amount * 0.15:.2f}", fill='black')
    y_pos += line_height * 1.5

    # Total due
    draw.text((50, y_pos), "=== AMOUNT DUE ===", fill='black')
    y_pos += line_height

    draw.text((50, y_pos), f"Total Amount Due: ${amount:.2f}", fill='red')

    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return img_base64

if __name__ == "__main__":
    # Create test bills
    test_cases = [
        ("GEXA", 850, 105.50),
        ("FRONTIER", 1200, 145.00),
        ("JUST ENERGY", 650, 85.25),
    ]

    print("Creating test power bill images...\n")

    for supplier, kwh, amount in test_cases:
        img_b64 = create_test_bill_image(supplier, kwh, amount)
        print(f"{supplier}:")
        print(f"  Expected: {kwh} kWh, ${amount:.2f}")
        print(f"  Image (b64): {img_b64[:50]}...")
        print()

    # Test with bill analyzer
    print("\nTesting bill analyzer with mock bills...\n")
    from bill_analyzer import PowerBillAnalyzer

    analyzer = PowerBillAnalyzer()

    for supplier, kwh, amount in test_cases:
        print(f"Analyzing {supplier} bill...")
        img_b64 = create_test_bill_image(supplier, kwh, amount)
        result = analyzer.analyze_bill_image(img_b64)

        print(f"  Extracted: {result.get('monthly_kwh')} kWh, ${result.get('bill_amount')}")
        print(f"  Provider: {result.get('provider')}")
        print(f"  Confidence: {result.get('confidence'):.2f}")
        print()
