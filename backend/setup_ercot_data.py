#!/usr/bin/env python3
"""
ERCOT data downloader and setup utility
Downloads key ERCOT reports and preprocesses them for the ML model
"""

import os
import json
from pathlib import Path
from ercot_processor import ERCOTDataProcessor

ERCOT_DATA_DIR = Path("./ercot_data")

def setup_data_dir():
    """Create data directory if missing"""
    ERCOT_DATA_DIR.mkdir(exist_ok=True)
    print(f"Data directory ready: {ERCOT_DATA_DIR}")

def download_instructions():
    """Print instructions for downloading ERCOT data"""
    print("""
╔════════════════════════════════════════════════════════════════╗
║         ERCOT Data Setup Instructions                          ║
╚════════════════════════════════════════════════════════════════╝

To build the battery recommendation model, download these ERCOT reports:

1. UNPLANNED OUTAGES (Essential - outage history)
   - Report: "Unplanned Resource Outages Report"
   - Download from: https://www.ercot.com/mp/data-products/data-product-details/NP4-680-CD
   - Save to: ercot_data/unplanned_outages.csv

2. REAL-TIME LOAD DATA (For capacity analysis)
   - Report: "Actual System Load by Study Area"
   - Download from: https://www.ercot.com/mp/data-products/data-product-details/NP3-233-CD
   - Save to: ercot_data/system_load.csv

3. SYSTEM ADEQUACY (For reserve margins)
   - Report: "Short-Term System Adequacy Report"
   - Download from: https://www.ercot.com/mp/data-products/data-product-details/NP3-380-CD
   - Save to: ercot_data/system_adequacy.csv

4. RESOURCE OUTAGES (For availability tracking)
   - Report: "Hourly Resource Outage Capacity"
   - Download from: https://www.ercot.com/mp/data-products/data-product-details/NP3-386-CD
   - Save to: ercot_data/resource_outages.csv

Once downloaded, run:
    python setup_ercot_data.py --process

This will parse the data and create a risk model by load zone.
    """)

def process_data():
    """Process downloaded CSV files into model"""
    processor = ERCOTDataProcessor(str(ERCOT_DATA_DIR))

    # Try loading each file
    files_found = 0

    outages_path = ERCOT_DATA_DIR / "unplanned_outages.csv"
    if outages_path.exists():
        print(f"✓ Loading {outages_path.name}...")
        processor.load_unplanned_outages(str(outages_path))
        files_found += 1
    else:
        print(f"✗ {outages_path.name} not found (optional)")

    load_path = ERCOT_DATA_DIR / "system_load.csv"
    if load_path.exists():
        print(f"✓ Loading {load_path.name}...")
        processor.load_real_time_load(str(load_path))
        files_found += 1
    else:
        print(f"✗ {load_path.name} not found (optional)")

    adequacy_path = ERCOT_DATA_DIR / "system_adequacy.csv"
    if adequacy_path.exists():
        print(f"✓ Loading {adequacy_path.name}...")
        processor.load_system_adequacy(str(adequacy_path))
        files_found += 1
    else:
        print(f"✗ {adequacy_path.name} not found (optional)")

    if files_found == 0:
        print("\n⚠ No ERCOT data files found. Download at least 'unplanned_outages.csv' to proceed.")
        return False

    # Calculate zone risk metrics
    print("\nCalculating zone risk metrics...")
    zones = ["NORTH", "EAST", "SOUTH", "WEST", "COAST"]
    for zone in zones:
        metrics = processor.calculate_zone_risk(zone)
        print(f"  {zone:6} → Risk {metrics.risk_score:5.1f} | "
              f"{metrics.outage_hours_per_year:5.1f} hrs/yr | "
              f"Availability {metrics.resource_availability_pct:.1f}%")

    # Save metrics to JSON for API to load
    metrics_file = ERCOT_DATA_DIR / "zone_metrics.json"
    with open(metrics_file, 'w') as f:
        json.dump(processor.export_zone_metrics(), f, indent=2)

    print(f"\n✓ Zone metrics saved to {metrics_file}")
    print("✓ Backend is ready to serve recommendations!")

    return True

if __name__ == "__main__":
    import sys

    setup_data_dir()

    if "--process" in sys.argv:
        process_data()
    else:
        download_instructions()
