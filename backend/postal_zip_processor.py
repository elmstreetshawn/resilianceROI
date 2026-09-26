"""
US Postal Database processor - filters Texas ZIPs and maps to ERCOT zones
Handles 4.2M line database efficiently
"""
import csv
from pathlib import Path
from typing import Dict, Tuple
from collections import defaultdict

class PostalZipProcessor:
    """Process US postal database and map Texas ZIPs to ERCOT zones"""

    # City to ERCOT zone mapping
    ZONE_MAPPING = {
        # North (Dallas/Fort Worth area)
        'DALLAS': 'NORTH',
        'FORT WORTH': 'NORTH',
        'ARLINGTON': 'NORTH',
        'IRVING': 'NORTH',
        'PLANO': 'NORTH',
        'FRISCO': 'NORTH',
        'GARLAND': 'NORTH',
        'MESQUITE': 'NORTH',
        'DENTON': 'NORTH',
        'MCKINNEY': 'NORTH',
        'CARROLTON': 'NORTH',
        'ADDISON': 'NORTH',
        'COPPELL': 'NORTH',
        'FLOWER MOUND': 'NORTH',
        'LEWISVILLE': 'NORTH',
        'LITTLE ELM': 'NORTH',
        'HIGHLAND PARK': 'NORTH',
        'UNIVERSITY PARK': 'NORTH',
        'RICHARDSON': 'NORTH',

        # South (Houston area)
        'HOUSTON': 'SOUTH',
        'SPRING': 'SOUTH',
        'KATY': 'SOUTH',
        'PEARLAND': 'SOUTH',
        'SUGAR LAND': 'SOUTH',
        'PASADENA': 'SOUTH',
        'BAYTOWN': 'SOUTH',
        'LAPORTE': 'SOUTH',
        'LEAGUE CITY': 'SOUTH',
        'FRIENDSWOOD': 'SOUTH',
        'MISSOURI CITY': 'SOUTH',
        'STAFFORD': 'SOUTH',
        'FULSHEAR': 'SOUTH',
        'SEABROOK': 'SOUTH',
        'CLEAR LAKE': 'SOUTH',
        'TOMBALL': 'SOUTH',
        'WOODLANDS': 'SOUTH',
        'HUMBLE': 'SOUTH',
        'KINGWOOD': 'SOUTH',

        # Central (Austin area)
        'AUSTIN': 'CENTRAL',
        'ROUND ROCK': 'CENTRAL',
        'CEDAR PARK': 'CENTRAL',
        'PFLUGERVILLE': 'CENTRAL',
        'GEORGETOWN': 'CENTRAL',
        'WESTLAKE': 'CENTRAL',
        'LAGO': 'CENTRAL',
        'LEANDER': 'CENTRAL',

        # East Texas
        'TYLER': 'EAST',
        'LONGVIEW': 'EAST',
        'MARSHALL': 'EAST',
        'JEFFERSON': 'EAST',
        'GLADEWATER': 'EAST',
        'KILGORE': 'EAST',

        # West Texas
        'MIDLAND': 'WEST',
        'ODESSA': 'WEST',
        'ABILENE': 'WEST',
        'LUBBOCK': 'WEST',
        'AMARILLO': 'WEST',
        'EL PASO': 'WEST',

        # Coastal
        'CORPUS CHRISTI': 'COAST',
        'KINGSVILLE': 'COAST',
        'ROCKPORT': 'COAST',
        'PORT ARANSAS': 'COAST',
        'TEXAS CITY': 'COAST',
        'GALVESTON': 'COAST',
        'FREEPORT': 'COAST',
    }

    def __init__(self):
        self.tx_zips = {}  # zip_code → {city, zone}
        self.city_zones = defaultdict(list)  # city → [zip_codes]

    def process_postal_database(self, db_file: str, output_file: str = None) -> int:
        """
        Filter US postal database for Texas ZIPs only
        Supports both CSV and Excel formats
        Returns count of TX zips processed
        """
        db_path = Path(db_file)

        # Handle Excel files
        if db_file.endswith('.xlsx'):
            return self._process_from_excel(db_file, output_file)

        # Handle CSV files
        return self._process_from_csv(db_file, output_file)

    def _process_from_csv(self, db_file: str, output_file: str = None) -> int:
        """Load and process from CSV file"""
        count = 0
        processed_count = 0

        print(f"Processing postal database: {db_file}")
        print("Filtering for Texas zips only...")

        try:
            with open(db_file, 'r', encoding='utf-8') as f:
                # Try tab-delimited first
                reader = csv.DictReader(f, delimiter='\t')

                for row in reader:
                    count += 1

                    # Show progress
                    if count % 100000 == 0:
                        print(f"  Processed {count:,} rows...")

                    # Filter for Texas
                    state = row.get('PHYSICAL STATE', '').strip()
                    if state != 'TX':
                        continue

                    zip_code = row.get('DELIVERY ZIPCODE', '').strip()
                    city = row.get('PHYSICAL CITY', '').strip()

                    if not zip_code or not city:
                        continue

                    # Map to ERCOT zone
                    zone = self._get_zone_for_city(city, zip_code)

                    # Store
                    if zip_code not in self.tx_zips:
                        self.tx_zips[zip_code] = {
                            'city': city,
                            'zone': zone
                        }
                        self.city_zones[city].append(zip_code)
                        processed_count += 1

            print(f"[OK] Processed {count:,} total rows")
            print(f"[OK] Found {len(self.tx_zips)} unique Texas ZIP codes")

            # Save to output file if specified
            if output_file:
                self._save_to_csv(output_file)

            return len(self.tx_zips)

        except FileNotFoundError:
            print(f"[ERROR] Database file not found: {db_file}")
            return 0

    def _process_from_excel(self, db_file: str, output_file: str = None) -> int:
        """Load and process from Excel file"""
        try:
            import openpyxl
        except ImportError:
            print("[ERROR] openpyxl not installed - cannot read Excel files")
            print("  Install with: pip install openpyxl")
            return 0

        print(f"Processing postal database: {db_file}")
        print("Filtering for Texas zips only...")
        print("(Reading from Excel - this will take 2-3 minutes)")

        try:
            wb = openpyxl.load_workbook(db_file, data_only=True, read_only=True)
            ws = wb.active

            # Get header row
            header_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
            headers = {v: i for i, v in enumerate(header_row)}

            state_idx = headers.get('PHYSICAL STATE')
            zip_idx = headers.get('DELIVERY ZIPCODE')
            city_idx = headers.get('PHYSICAL CITY')

            if None in [state_idx, zip_idx, city_idx]:
                print(f"[ERROR] Required columns not found in Excel file")
                return 0

            count = 0
            for row in ws.iter_rows(min_row=2, values_only=True):
                count += 1

                if count % 100000 == 0:
                    print(f"  Processed {count:,} rows...")

                state = (row[state_idx] or '').strip()
                if state != 'TX':
                    continue

                zip_code = (row[zip_idx] or '').strip()
                city = (row[city_idx] or '').strip()

                if not zip_code or not city:
                    continue

                # Map to ERCOT zone
                zone = self._get_zone_for_city(city, zip_code)

                # Store
                if zip_code not in self.tx_zips:
                    self.tx_zips[zip_code] = {
                        'city': city,
                        'zone': zone
                    }
                    self.city_zones[city].append(zip_code)

            print(f"[OK] Processed {count:,} total rows")
            print(f"[OK] Found {len(self.tx_zips)} unique Texas ZIP codes")

            # Save to output file if specified
            if output_file:
                self._save_to_csv(output_file)

            return len(self.tx_zips)

        except Exception as e:
            print(f"[ERROR] Error reading Excel file: {e}")
            return 0

    def _get_zone_for_city(self, city: str, zip_code: str) -> str:
        """Determine ERCOT zone from city name or ZIP code"""
        city_upper = city.upper()

        # Try exact city match first
        for mapped_city, zone in self.ZONE_MAPPING.items():
            if mapped_city in city_upper:
                return zone

        # Fallback to ZIP-based routing
        zip_int = int(zip_code[:2])

        if 75000 <= zip_int < 76000:
            return 'NORTH'
        elif 77000 <= zip_int < 78000:
            return 'SOUTH'
        elif 78000 <= zip_int < 79000:
            return 'COAST'
        elif 79000 <= zip_int < 80000:
            return 'WEST'
        elif 75700 <= zip_int < 75800:
            return 'EAST'

        return 'UNKNOWN'

    def _save_to_csv(self, output_file: str):
        """Save Texas ZIPs to CSV for future use"""
        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['zip_code', 'city', 'ercot_zone'])
            writer.writeheader()

            for zip_code, data in sorted(self.tx_zips.items()):
                writer.writerow({
                    'zip_code': zip_code,
                    'city': data['city'],
                    'ercot_zone': data['zone']
                })

        print(f"[OK] Saved to {output_file}")

    def get_zone_for_zip(self, zip_code: str) -> str:
        """Get ERCOT zone for a zip code"""
        if zip_code in self.tx_zips:
            return self.tx_zips[zip_code]['zone']
        return 'UNKNOWN'

    def get_city_for_zip(self, zip_code: str) -> str:
        """Get city for a zip code"""
        if zip_code in self.tx_zips:
            return self.tx_zips[zip_code]['city']
        return 'Unknown'

    def export_summary(self) -> Dict:
        """Export zone distribution summary"""
        zones = defaultdict(int)
        for data in self.tx_zips.values():
            zones[data['zone']] += 1

        return dict(zones)


if __name__ == "__main__":
    processor = PostalZipProcessor()

    # Try multiple paths for the 4.2M line database
    db_paths = [
        Path("../zip_codes/zip_codes.csv"),
        Path("./zip_codes/zip_codes.csv"),
        Path("./zip_codes.csv"),
    ]

    db_path = None
    for path in db_paths:
        if path.exists():
            db_path = path
            break

    output_path = Path("texas_zips_processed.csv")

    if db_path:
        print(f"Found database at: {db_path}")
        tx_count = processor.process_postal_database(str(db_path), str(output_path))

        print("\nZone distribution:")
        summary = processor.export_summary()
        for zone, count in sorted(summary.items()):
            print(f"  {zone}: {count} zips")
    else:
        print("[ERROR] Database file not found")
        print("  Checked paths:")
        for path in db_paths:
            print(f"    - {path.absolute()}")
        print("\n  Usage: Place zip_codes.csv in one of these locations")
