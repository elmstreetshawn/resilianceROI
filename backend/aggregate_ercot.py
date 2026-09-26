"""
ERCOT daily zip aggregator - combines 364 daily zips into single year CSV
Extracts Excel files from each daily zip and merges into one dataset
"""
import zipfile
import csv
from pathlib import Path
from datetime import datetime

def aggregate_ercot_zips(data_dir: str = "./ercot_data", output_file: str = "ercot_outages_year.csv") -> int:
    """
    Aggregate all daily ERCOT outage zips into a single CSV
    Returns: number of records written
    """
    data_path = Path(data_dir)

    if not data_path.exists():
        print(f"[ERROR] Directory not found: {data_dir}")
        return 0

    zip_files = sorted(data_path.glob("*.zip"))
    print(f"Found {len(zip_files)} daily outage zip files")
    print(f"Aggregating into: {output_file}")

    total_records = 0
    fieldnames = None

    with open(output_file, 'w', newline='', encoding='utf-8') as outf:
        writer = None

        for i, zip_file in enumerate(zip_files):
            try:
                with zipfile.ZipFile(zip_file, 'r') as zf:
                    # Find Excel file in this zip
                    xlsx_files = [f for f in zf.namelist() if f.endswith('.xlsx')]

                    if not xlsx_files:
                        continue

                    # Process each Excel file
                    for xlsx_file in xlsx_files:
                        try:
                            import openpyxl
                            with zf.open(xlsx_file) as f:
                                # Try loading with keep_vba=False to avoid relationship issues
                                try:
                                    wb = openpyxl.load_workbook(f, data_only=True, keep_vba=False)
                                except:
                                    # If that fails, try without data_only
                                    f.seek(0)
                                    wb = openpyxl.load_workbook(f, keep_vba=False)

                                # Try multiple sheet names
                                ws = None
                                for sheet_name in ['Detail', 'Details', 'Data', 'Outages', 'Sheet1', 'UnplannedResOutage']:
                                    if sheet_name in wb.sheetnames:
                                        ws = wb[sheet_name]
                                        break

                                # If no match, use first sheet
                                if ws is None:
                                    ws = wb.active

                                if not ws:
                                    continue

                                # Read header row
                                header_row = []
                                for row in ws.iter_rows(min_row=1, max_row=1):
                                    header_row = [cell.value for cell in row]
                                    break

                                # Initialize CSV writer with actual headers
                                if writer is None and header_row:
                                    fieldnames = [str(h) if h else f"col_{j}" for j, h in enumerate(header_row)]
                                    writer = csv.DictWriter(outf, fieldnames=fieldnames, extrasaction='ignore')
                                    writer.writeheader()

                                # Write data rows
                                if writer:
                                    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
                                        try:
                                            row_dict = {}
                                            for col_idx, cell in enumerate(row):
                                                if col_idx < len(fieldnames):
                                                    value = cell.value
                                                    # Convert datetime to string
                                                    if isinstance(value, datetime):
                                                        value = value.isoformat()
                                                    row_dict[fieldnames[col_idx]] = value

                                            writer.writerow(row_dict)
                                            total_records += 1
                                        except Exception as e:
                                            continue

                        except Exception as e:
                            pass

            except Exception as e:
                pass

            # Progress indicator
            if (i + 1) % 50 == 0:
                print(f"  Processed {i + 1}/{len(zip_files)} zips ({total_records} records)")

    print(f"[OK] Aggregated {total_records} records to {output_file}")
    return total_records

if __name__ == "__main__":
    import sys

    data_dir = sys.argv[1] if len(sys.argv) > 1 else "./ercot_data"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "ercot_outages_year.csv"

    count = aggregate_ercot_zips(data_dir, output_file)

    if count > 0:
        print(f"\n[OK] Successfully created {output_file}")
        print("Use this CSV for analysis and backend loading")
    else:
        print("[ERROR] No records extracted - check Excel file format")

