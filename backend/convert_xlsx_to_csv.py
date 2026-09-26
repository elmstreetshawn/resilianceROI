"""
Convert Excel postal database to CSV using pure Python
"""
import csv
from pathlib import Path

def convert_xlsx_to_csv_openpyxl():
    """Convert using openpyxl"""
    try:
        import openpyxl
    except ImportError:
        return False

    xlsx_path = Path("./zip_codes/zip_codes.xlsx")
    csv_path = Path("./zip_codes/zip_codes.csv")

    if not xlsx_path.exists():
        return False

    print(f"Converting Excel to CSV: {xlsx_path}")

    try:
        wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
        ws = wb.active

        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='\t')

            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i % 100000 == 0 and i > 0:
                    print(f"  Converted {i:,} rows...")
                writer.writerow(row)

        print(f"✓ Conversion complete: {csv_path}")
        print(f"  File size: {csv_path.stat().st_size / 1e6:.1f}MB")
        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False

def convert_xlsx_to_csv_xlrd():
    """Fallback: use xlrd library"""
    try:
        import xlrd
    except ImportError:
        return False

    xlsx_path = Path("./zip_codes/zip_codes.xlsx")
    csv_path = Path("./zip_codes/zip_codes.csv")

    if not xlsx_path.exists():
        return False

    print(f"Converting Excel to CSV (xlrd): {xlsx_path}")

    try:
        wb = xlrd.open_workbook(str(xlsx_path))
        ws = wb.sheet_by_index(0)

        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='\t')

            for i in range(ws.nrows):
                if i % 100000 == 0 and i > 0:
                    print(f"  Converted {i:,} rows...")
                row = ws.row_values(i)
                writer.writerow(row)

        print(f"✓ Conversion complete: {csv_path}")
        print(f"  File size: {csv_path.stat().st_size / 1e6:.1f}MB")
        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False

if __name__ == "__main__":
    xlsx_path = Path("./zip_codes/zip_codes.xlsx")
    csv_path = Path("./zip_codes/zip_codes.csv")

    # Check if already converted
    if csv_path.exists():
        print(f"✓ CSV file already exists: {csv_path}")
    else:
        success = False

        # Try openpyxl first
        print("Attempting conversion with openpyxl...")
        success = convert_xlsx_to_csv_openpyxl()

        # Fall back to xlrd
        if not success:
            print("Attempting conversion with xlrd...")
            success = convert_xlsx_to_csv_xlrd()

        if not success:
            print("✗ Conversion failed - neither openpyxl nor xlrd available")
            print("  Install with: pip install openpyxl")
