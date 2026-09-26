"""
ERCOT data processor for battery ROI analysis
Converts raw ERCOT CSVs into risk scores by load zone
"""
from pathlib import Path
from typing import Dict, List, Tuple
from datetime import datetime, timedelta

ERCOT_DATA_DIR = Path("./ercot_data")

# ERCOT Load Zones (major areas for risk analysis)
LOAD_ZONES = {
    "NORTH": {"zip_range": (75000, 76000), "description": "North Dallas/Fort Worth"},
    "EAST": {"zip_range": (75200, 75300), "description": "East Texas"},
    "SOUTH": {"zip_range": (77000, 78000), "description": "Houston Metro"},
    "WEST": {"zip_range": (78700, 79000), "description": "West Texas"},
    "COAST": {"zip_range": (77500, 77600), "description": "Coastal"},
}

class ERCOTDataProcessor:
    def __init__(self, data_dir: str = str(ERCOT_DATA_DIR)):
        self.data_dir = Path(data_dir)
        self.outages_df = None
        self.load_df = None
        self.adequacy_df = None
        self.zone_metrics = {}

    def load_unplanned_outages(self, filepath: str) -> pd.DataFrame:
        """Load 'Unplanned Resource Outages Report' CSV"""
        try:
            df = pd.read_csv(filepath)
            # Parse outage data: Resource, Outage Start, Outage End, MW
            df['Outage Start'] = pd.to_datetime(df['Outage Start'])
            df['Outage End'] = pd.to_datetime(df['Outage End'])
            df['outage_duration_hours'] = (df['Outage End'] - df['Outage Start']).dt.total_seconds() / 3600
            self.outages_df = df
            return df
        except FileNotFoundError:
            print(f"Outages file not found: {filepath}")
            return None

    def load_real_time_load(self, filepath: str) -> pd.DataFrame:
        """Load 'Actual System Load by Study Area' for capacity analysis"""
        try:
            df = pd.read_csv(filepath)
            df['Time'] = pd.to_datetime(df['Time'])
            self.load_df = df
            return df
        except FileNotFoundError:
            print(f"Load file not found: {filepath}")
            return None

    def load_system_adequacy(self, filepath: str) -> pd.DataFrame:
        """Load 'Short-Term System Adequacy Report' for reserve margin"""
        try:
            df = pd.read_csv(filepath)
            df['Time'] = pd.to_datetime(df['Time'])
            self.adequacy_df = df
            return df
        except FileNotFoundError:
            print(f"Adequacy file not found: {filepath}")
            return None

    def calculate_zone_risk(self, zone: str, zip_code: str = None) -> Dict:
        """
        Calculate multi-factor risk score for a load zone
        Returns dict with: outage frequency, duration, peak demand stress, resource availability
        """

        # Factor 1: Unplanned outage hours in this zone
        outage_hours = self._calc_zone_outage_hours(zone)

        # Factor 2: Resource availability (how fragile is the grid)
        resource_avail = self._calc_resource_availability(zone)

        # Factor 3: Peak demand exceedance (how often we're near capacity)
        peak_exceedance = self._calc_peak_demand_exceedance(zone)

        # Composite risk score (0-100)
        risk_score = (
            (outage_hours / 48) * 30 +  # Max 30 points for >48 hours/year outages
            (100 - resource_avail) * 0.4 +  # 40 points for low availability
            peak_exceedance * 0.3  # 30 points for frequent peak demand
        )
        risk_score = min(100, max(0, risk_score))

        metrics = {
            "zone": zone,
            "outage_hours_per_year": outage_hours,
            "max_outage_hours": self._calc_max_single_outage(zone),
            "avg_outage_duration_hours": self._calc_avg_outage_duration(zone),
            "unplanned_outage_count": self._count_outages(zone),
            "resource_availability_pct": resource_avail,
            "peak_demand_exceedance_pct": peak_exceedance,
            "risk_score": risk_score
        }

        self.zone_metrics[zone] = metrics
        return metrics

    def _calc_zone_outage_hours(self, zone: str) -> float:
        """Total forced outage hours per year in zone"""
        if self.outages_df is None or self.outages_df.empty:
            return 0.0

        # Filter by zone (would need zone column in data)
        zone_outages = self.outages_df[self.outages_df.get('Load Zone', '').str.contains(zone, na=False)]
        return zone_outages['outage_duration_hours'].sum() if not zone_outages.empty else 0.0

    def _calc_max_single_outage(self, zone: str) -> float:
        """Longest single outage in zone"""
        if self.outages_df is None or self.outages_df.empty:
            return 0.0
        zone_outages = self.outages_df[self.outages_df.get('Load Zone', '').str.contains(zone, na=False)]
        return zone_outages['outage_duration_hours'].max() if not zone_outages.empty else 0.0

    def _calc_avg_outage_duration(self, zone: str) -> float:
        """Average outage duration"""
        if self.outages_df is None or self.outages_df.empty:
            return 0.0
        zone_outages = self.outages_df[self.outages_df.get('Load Zone', '').str.contains(zone, na=False)]
        return zone_outages['outage_duration_hours'].mean() if not zone_outages.empty else 0.0

    def _count_outages(self, zone: str) -> int:
        """Count of unplanned outages"""
        if self.outages_df is None:
            return 0
        zone_outages = self.outages_df[self.outages_df.get('Load Zone', '').str.contains(zone, na=False)]
        return len(zone_outages)

    def _calc_resource_availability(self, zone: str) -> float:
        """
        Resource availability % = (Total Capacity - Outaged Capacity) / Total Capacity
        Values 95-100% are healthy, <90% is risky
        """
        if self.adequacy_df is None or self.adequacy_df.empty:
            return 95.0  # Default to healthy

        # Would need capacity columns in data
        # For now, estimate from outage frequency
        outage_hours = self._calc_zone_outage_hours(zone)
        # If >100 outage hours/year, availability ~90%, if <20 hours, ~98%
        availability = 98.0 - (outage_hours / 10)
        return max(80.0, min(99.0, availability))

    def _calc_peak_demand_exceedance(self, zone: str) -> float:
        """
        Percentage of hours where demand exceeds 90% of zone capacity
        High = grid is tight, more prone to cascading failures
        """
        if self.load_df is None or self.load_df.empty:
            return 15.0  # Default moderate stress

        # Would need actual capacity data and demand data
        # For now, estimate based on general Texas patterns
        return 20.0

    def get_zone_by_zip(self, zip_code: str) -> str:
        """Map zip code to ERCOT load zone"""
        zip_int = int(zip_code[:5])
        for zone, config in LOAD_ZONES.items():
            if config["zip_range"][0] <= zip_int <= config["zip_range"][1]:
                return zone
        return "SOUTH"  # Default to Houston area

    def export_zone_metrics(self) -> Dict:
        """Export all computed metrics as dict"""
        return {
            zone: {
                "outage_hours_per_year": m.outage_hours_per_year,
                "avg_outage_hours": m.avg_outage_duration_hours,
                "total_outages": m.unplanned_outage_count,
                "resource_availability": m.resource_availability_pct,
                "peak_demand_stress": m.peak_demand_exceedance_pct,
                "risk_score": m.risk_score
            }
            for zone, m in self.zone_metrics.items()
        }
