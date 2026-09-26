"""
NOAA Daily Summaries parser - processes real GHCN-Daily CSV data
Uses only standard library (no pandas dependency)
"""
import csv
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

class NOAADailyProcessor:
    """Parse NOAA Daily Summaries (GHCN-Daily CSV format)"""

    def __init__(self):
        self.weather_data = []
        self.zone_profiles = {}

    def load_csv(self, filepath: str) -> List[Dict]:
        """Load and parse NOAA Daily Summaries CSV"""
        print(f"Loading CSV: {filepath}")
        rows = []

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f, skipinitialspace=True)
                for row in reader:
                    try:
                        # Parse date
                        date_str = row.get('DATE', '').strip()
                        if date_str:
                            row['DATE'] = datetime.strptime(date_str, '%Y-%m-%d')

                        # Parse numeric fields
                        for field in ['PRCP', 'SNOW', 'SNWD', 'WESD']:
                            if field in row and row[field].strip():
                                try:
                                    row[field] = float(row[field])
                                except ValueError:
                                    row[field] = None
                            else:
                                row[field] = None

                        rows.append(row)
                    except Exception as e:
                        continue

            self.weather_data = rows
            print(f"✓ Loaded {len(rows)} weather records")
            return rows

        except FileNotFoundError:
            print(f"✗ File not found: {filepath}")
            return []

    def identify_severe_weather_days(self) -> List[Dict]:
        """Identify days with severe weather"""
        severe = []

        for row in self.weather_data:
            if row.get('DATE') is None:
                continue

            prcp = row.get('PRCP')
            snow = row.get('SNOW')
            snwd = row.get('SNWD')
            wesd = row.get('WESD')

            # Criteria for severe weather
            is_severe = (
                (prcp and prcp > 1.5) or  # Heavy rain
                (snow and snow > 2) or  # Heavy snow
                (snwd and snwd > 4) or  # Deep snow
                (wesd and wesd > 0)  # Weather event
            )

            if is_severe:
                severity = self._calculate_severity(row)
                if severity >= 3.0:
                    row['severity_score'] = severity
                    severe.append(row)

        return sorted(severe, key=lambda x: x.get('DATE', datetime.now()))

    def _calculate_severity(self, row: Dict) -> float:
        """Calculate severity 0-10"""
        score = 0.0

        prcp = row.get('PRCP')
        if prcp:
            if prcp > 3.0:
                score += 4.0
            elif prcp > 2.0:
                score += 3.5
            elif prcp > 1.5:
                score += 3.0
            elif prcp > 1.0:
                score += 2.0

        snow = row.get('SNOW')
        if snow and snow > 0:
            if snow > 6:
                score += 4.0
            elif snow > 4:
                score += 3.5
            elif snow > 2:
                score += 3.0

        snwd = row.get('SNWD')
        if snwd and snwd > 0:
            if snwd > 8:
                score += 3.5
            elif snwd > 4:
                score += 2.5

        wesd = row.get('WESD')
        if wesd and wesd > 0:
            if wesd > 24:
                score += 2.0
            elif wesd > 12:
                score += 1.5
            else:
                score += 1.0

        return min(10.0, score)

    def get_event_type(self, row: Dict) -> str:
        """Determine event type"""
        prcp = row.get('PRCP') or 0
        snow = row.get('SNOW') or 0

        if snow > 2:
            return "ICE_STORM"
        elif prcp > 2.5:
            return "HEAVY_RAIN"
        elif prcp > 1.5:
            return "SEVERE_THUNDERSTORM"
        else:
            return "WEATHER_EVENT"

    def build_zone_profile(self, zip_code: str, zone: str, station_name: str = None) -> Dict:
        """Build weather risk profile for a zone - returns dict"""
        if not self.weather_data:
            return self._default_profile(zip_code, zone)

        severe_days = self.identify_severe_weather_days()

        if not severe_days:
            return self._default_profile(zip_code, zone)

        # Filter to past 5 years
        cutoff = datetime.now() - timedelta(days=365 * 5)
        recent_severe = [r for r in severe_days if r.get('DATE') and r['DATE'] >= cutoff]

        if not recent_severe:
            return self._default_profile(zip_code, zone)

        # Extract metadata
        first_row = recent_severe[0]
        station_name = station_name or first_row.get('NAME', 'Unknown Station')

        try:
            lat = float(first_row.get('LATITUDE', 0))
            lon = float(first_row.get('LONGITUDE', 0))
        except (ValueError, TypeError):
            lat, lon = 0, 0

        # Calculate metrics
        event_count = len(recent_severe)
        avg_per_year = event_count / 5.0

        # Most common event type
        event_types = [self.get_event_type(r) for r in recent_severe]
        most_common = max(set(event_types), key=event_types.count) if event_types else "UNKNOWN"

        # Average severity
        severities = [r.get('severity_score', 0) for r in recent_severe]
        avg_severity = sum(severities) / len(severities) if severities else 0

        narrative = self._generate_narrative(zone, event_count, avg_per_year, most_common, avg_severity)

        profile = {
            "zone": zone,
            "zip_code": zip_code,
            "station_name": station_name,
            "lat_lon": (lat, lon),
            "severe_events_5yr": recent_severe,
            "total_event_count": event_count,
            "avg_events_per_year": avg_per_year,
            "most_common_event_type": most_common,
            "avg_event_severity": avg_severity,
            "risk_narrative": narrative,
        }

        self.zone_profiles[zip_code] = profile
        return profile

    def _generate_narrative(self, zone: str, count: int, per_year: float, event_type: str, avg_severity: float) -> str:
        """Generate risk summary"""
        if count == 0:
            return f"No significant weather events detected in past 5 years."

        event_name = event_type.replace("_", " ").title()

        if per_year > 1.5:
            frequency = "frequently"
            risk_level = "HIGH"
        elif per_year > 0.8:
            frequency = "regularly"
            risk_level = "MODERATE"
        else:
            frequency = "occasionally"
            risk_level = "LOW"

        severity_desc = "severe" if avg_severity > 7 else "moderate" if avg_severity > 5 else "mild"

        return (
            f"{zone} experiences severe weather {frequency}: "
            f"{count} events in 5 years (~{per_year:.1f}/year). "
            f"Most common: {event_name} ({severity_desc}). "
            f"Risk Level: {risk_level}."
        )

    def _default_profile(self, zip_code: str, zone: str) -> Dict:
        """Return default if no data"""
        return {
            "zone": zone,
            "zip_code": zip_code,
            "station_name": "Data Unavailable",
            "lat_lon": (0, 0),
            "severe_events_5yr": [],
            "total_event_count": 0,
            "avg_events_per_year": 0.5,
            "most_common_event_type": "UNKNOWN",
            "avg_event_severity": 0,
            "risk_narrative": "Weather data not available for this location.",
        }

    def export_summary(self) -> Dict:
        """Export all profiles as dict"""
        return {
            zip_code: {
                "zone": profile.zone,
                "station": profile.station_name,
                "events_5yr": profile.total_event_count,
                "avg_events_per_year": profile.avg_events_per_year,
                "most_common_event": profile.most_common_event_type,
                "avg_severity": profile.avg_event_severity,
                "narrative": profile.risk_narrative,
            }
            for zip_code, profile in self.zone_profiles.items()
        }
