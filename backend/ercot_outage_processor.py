"""
ERCOT outage data processor - correlates with NOAA weather events
Loads daily outage CSVs, aggregates by zip code and date
"""
import csv
import zipfile
from pathlib import Path
from datetime import datetime
from typing import Dict, List
from collections import defaultdict

class ERCOTOutageProcessor:
    """Process ERCOT unplanned outages and correlate with weather"""

    def __init__(self):
        self.outages_by_date_zip = defaultdict(list)
        self.outage_durations_by_date_zip = defaultdict(float)

    def load_all_outage_zips(self, data_dir: str = "./ercot_data") -> int:
        """Load all 365 daily outage zip files from directory"""
        data_path = Path(data_dir)
        total_records = 0

        if not data_path.exists():
            print(f"[ERROR] Directory not found: {data_dir}")
            return 0

        zip_files = sorted(data_path.glob("*.zip"))
        print(f"Found {len(zip_files)} daily outage zip files")

        for i, zip_file in enumerate(zip_files):
            count = self.load_outage_zip(str(zip_file))
            total_records += count

            if (i + 1) % 50 == 0:
                print(f"  Loaded {i + 1}/{len(zip_files)} zip files ({total_records} records)")

        print(f"[OK] Loaded all {len(zip_files)} daily zips ({total_records} total records)")
        return total_records

    def load_outage_zip(self, zip_file_path: str) -> int:
        """Load all daily CSV files from ERCOT outage zip"""
        total_records = 0

        try:
            with zipfile.ZipFile(zip_file_path, 'r') as zf:
                for filename in zf.namelist():
                    if filename.endswith('.csv'):
                        with zf.open(filename) as f:
                            total_records += self._parse_outage_csv(f, filename)

            return total_records

        except FileNotFoundError:
            print(f"[ERROR] Outage zip file not found: {zip_file_path}")
            return 0
        except Exception as e:
            return 0

    def _parse_outage_csv(self, file_obj, filename: str) -> int:
        """Parse individual daily outage CSV"""
        count = 0

        try:
            content = file_obj.read().decode('utf-8')
            lines = content.split('\n')
            reader = csv.DictReader(lines)

            for row in reader:
                try:
                    start_str = row.get('Actual Outage Start', '').strip()
                    end_str = row.get('Actual End Date', '').strip()
                    mw_reduction = row.get('Effective MW Reduction Due to Outage', '0').strip()

                    if not start_str or not end_str:
                        continue

                    # Parse dates
                    start = datetime.strptime(start_str, '%b %d, %Y %I:%M %p')
                    end = datetime.strptime(end_str, '%b %d, %Y %I:%M %p')

                    duration_hours = (end - start).total_seconds() / 3600

                    if duration_hours <= 0:
                        continue

                    date_key = start.strftime('%Y-%m-%d')
                    region = self._infer_region_from_resource(row.get('Resource Name', ''))

                    try:
                        mw = float(mw_reduction)
                    except ValueError:
                        mw = 0

                    key = (date_key, region)

                    self.outages_by_date_zip[key].append({
                        'resource': row.get('Resource Name', ''),
                        'duration_hours': duration_hours,
                        'mw_reduction': mw,
                        'start': start,
                        'end': end,
                    })

                    self.outage_durations_by_date_zip[key] += duration_hours
                    count += 1

                except (ValueError, KeyError):
                    continue

        except Exception as e:
            pass

        return count

    def _infer_region_from_resource(self, resource_name: str) -> str:
        """Infer ERCOT region from resource name"""
        name_upper = resource_name.upper()

        if any(x in name_upper for x in ['HOUSTON', 'COASTAL', 'CORPUS']):
            return 'SOUTH'
        elif any(x in name_upper for x in ['DALLAS', 'FORT', 'NORTH']):
            return 'NORTH'
        elif any(x in name_upper for x in ['AUSTIN', 'CENTRAL']):
            return 'CENTRAL'
        elif any(x in name_upper for x in ['EAST', 'TYLER']):
            return 'EAST'
        elif any(x in name_upper for x in ['WEST', 'ABILENE']):
            return 'WEST'

        return 'UNKNOWN'

    def get_outage_hours_for_date(self, date_str: str, region: str) -> float:
        """Get total outage hours for a date and region"""
        key = (date_str, region)
        return self.outage_durations_by_date_zip.get(key, 0.0)

    def correlate_with_weather(self, weather_events: List[Dict]) -> Dict:
        """Correlate NOAA weather events with ERCOT outages"""
        correlation = defaultdict(list)

        for weather in weather_events:
            date_str = weather.get('date', '')
            event_type = weather.get('event_type', 'UNKNOWN')
            severity = weather.get('severity_score', 0)
            region = weather.get('region', 'SOUTH')

            outage_hours = self.get_outage_hours_for_date(date_str, region)

            if outage_hours > 0:
                correlation[event_type].append({
                    'severity': severity,
                    'outage_hours': outage_hours,
                    'date': date_str,
                    'region': region,
                })

        return dict(correlation)

    def get_average_outage_by_event_type(self, correlation: Dict) -> Dict:
        """Calculate average outage hours by event type"""
        averages = {}

        for event_type, events in correlation.items():
            if not events:
                continue

            avg_hours = sum(e['outage_hours'] for e in events) / len(events)
            avg_severity = sum(e['severity'] for e in events) / len(events)

            averages[event_type] = {
                'avg_outage_hours': avg_hours,
                'avg_severity': avg_severity,
                'event_count': len(events),
                'max_outage_hours': max(e['outage_hours'] for e in events),
                'min_outage_hours': min(e['outage_hours'] for e in events),
            }

        return averages

    def export_summary(self) -> Dict:
        """Export all outage data as summary"""
        summary = {}

        for (date, region), duration in self.outage_durations_by_date_zip.items():
            if region not in summary:
                summary[region] = []

            summary[region].append({
                'date': date,
                'outage_hours': duration,
            })

        return summary
