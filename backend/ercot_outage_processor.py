"""
ERCOT outage data processor - loads aggregated yearly CSV
Correlates outage dates with NOAA weather events
"""
import csv
from pathlib import Path
from datetime import datetime
from typing import Dict, List
from collections import defaultdict

class ERCOTOutageProcessor:
    """Process ERCOT unplanned outages and correlate with weather"""

    def __init__(self):
        self.outages_by_date_region = defaultdict(list)
        self.outage_hours_by_date_region = defaultdict(float)

    def load_outage_csv(self, csv_file: str = "ercot_outages_year.csv") -> int:
        """Load aggregated ERCOT outage CSV file"""
        csv_path = Path(csv_file)

        if not csv_path.exists():
            print(f"[ERROR] Outage CSV not found: {csv_file}")
            return 0

        print(f"Loading ERCOT outages from {csv_file}...")
        total_records = 0

        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)

                for row in reader:
                    try:
                        # Get date from various possible column names
                        start_str = (
                            row.get('Actual Outage Start') or
                            row.get('Actual Outage Start Date') or
                            row.get('Start Date') or
                            ''
                        ).strip()

                        if not start_str:
                            continue

                        # Parse date - handle ISO format
                        try:
                            if 'T' in start_str:
                                # ISO format with time
                                start = datetime.fromisoformat(start_str.split('+')[0].split('Z')[0])
                            else:
                                # Date only
                                start = datetime.fromisoformat(start_str)
                        except (ValueError, AttributeError):
                            continue

                        date_key = start.strftime('%Y-%m-%d')

                        # Get outage duration or end date
                        end_str = (
                            row.get('Actual End Date') or
                            row.get('End Date') or
                            ''
                        ).strip()

                        duration_hours = 1.0  # Default 1 hour if not specified

                        if end_str:
                            try:
                                if 'T' in end_str:
                                    end = datetime.fromisoformat(end_str.split('+')[0].split('Z')[0])
                                else:
                                    end = datetime.fromisoformat(end_str)

                                duration_hours = max((end - start).total_seconds() / 3600, 0.1)
                            except (ValueError, AttributeError):
                                pass

                        # Skip unrealistic durations
                        if duration_hours <= 0 or duration_hours > 8760:
                            continue

                        # MW reduction (optional)
                        mw_str = (
                            row.get('Effective MW Reduction Due to Outage') or
                            row.get('MW Reduction') or
                            '0'
                        ).strip()

                        try:
                            mw = float(mw_str.replace(',', ''))
                        except (ValueError, AttributeError):
                            mw = 0

                        # Region (default to SOUTH for ERCOT)
                        region = 'SOUTH'

                        key = (date_key, region)

                        self.outages_by_date_region[key].append({
                            'duration_hours': duration_hours,
                            'mw_reduction': mw,
                            'start': start,
                        })

                        self.outage_hours_by_date_region[key] += duration_hours
                        total_records += 1

                    except (KeyError, TypeError) as e:
                        continue

            print(f"[OK] Loaded {total_records} ERCOT outage records")
            return total_records

        except FileNotFoundError:
            print(f"[ERROR] File not found: {csv_file}")
            return 0
        except Exception as e:
            print(f"[ERROR] Error reading CSV: {e}")
            return 0

    def get_outage_hours_for_date(self, date_str: str, region: str) -> float:
        """Get total outage hours for a date and region"""
        key = (date_str, region)
        return self.outage_hours_by_date_region.get(key, 0.0)

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

        for (date, region), duration in self.outage_hours_by_date_region.items():
            if region not in summary:
                summary[region] = []

            summary[region].append({
                'date': date,
                'outage_hours': duration,
            })

        return summary
