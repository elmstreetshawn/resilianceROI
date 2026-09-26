"""
NOAA weather data processor for risk awareness
Integrates severe weather events with ERCOT outage patterns
"""
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List
from dataclasses import dataclass

@dataclass
class WeatherEvent:
    date: datetime
    event_type: str  # TORNADO, HURRICANE, ICE_STORM, SEVERE_WIND, etc.
    severity: float  # 0-10 scale
    affected_zip_codes: List[str]
    description: str

@dataclass
class ZoneWeatherRisk:
    zone: str
    zip_code_sample: str
    events_past_5_years: int
    avg_events_per_year: float
    most_common_event_type: str
    avg_outage_hours_after_event: float
    max_outage_hours_after_event: float
    avg_home_damage_per_event: float  # $
    probability_event_this_year: float  # 0-1
    risk_narrative: str

class NOAAWeatherProcessor:
    """
    Process NOAA historical severe weather data
    Focus on events that cause grid outages
    """

    def __init__(self):
        self.weather_events = []
        self.zone_weather_map = {}

    def add_weather_data(self, zone: str, zip_code: str, events_df: pd.DataFrame = None):
        """
        Add historical weather events for a zone
        Events should have: date, event_type, severity, duration_hours
        """
        if events_df is None:
            events_df = self._get_default_texas_weather(zone, zip_code)

        risk = self._calculate_zone_weather_risk(zone, zip_code, events_df)
        self.zone_weather_map[zip_code] = risk
        return risk

    def _get_default_texas_weather(self, zone: str, zip_code: str) -> pd.DataFrame:
        """
        Default NOAA data for Texas zones (based on historical patterns)
        Real implementation would pull from NOAA API
        """
        historical_events = {
            "SOUTH": [  # Houston area - hurricanes + tropical storms
                {"date": "2023-07-15", "type": "SEVERE_WIND", "severity": 7, "outage_hours": 16},
                {"date": "2023-09-08", "type": "HURRICANE", "severity": 8, "outage_hours": 48},
                {"date": "2022-08-10", "type": "TROPICAL_STORM", "severity": 6, "outage_hours": 12},
                {"date": "2021-08-29", "type": "HURRICANE", "severity": 7, "outage_hours": 36},
                {"date": "2020-08-23", "type": "HURRICANE", "severity": 8, "outage_hours": 52},
            ],
            "NORTH": [  # Dallas area - ice storms, severe wind
                {"date": "2023-02-03", "type": "ICE_STORM", "severity": 7, "outage_hours": 24},
                {"date": "2022-05-28", "type": "SEVERE_THUNDERSTORM", "severity": 6, "outage_hours": 8},
                {"date": "2021-02-14", "type": "ICE_STORM", "severity": 9, "outage_hours": 72},
                {"date": "2020-10-20", "type": "SEVERE_WIND", "severity": 6, "outage_hours": 14},
                {"date": "2019-05-27", "type": "TORNADO", "severity": 8, "outage_hours": 48},
            ],
            "WEST": [  # West Texas - wind storms, heat waves
                {"date": "2023-06-15", "type": "EXTREME_HEAT", "severity": 7, "outage_hours": 6},
                {"date": "2022-05-15", "type": "SEVERE_WIND", "severity": 7, "outage_hours": 10},
                {"date": "2021-02-10", "type": "ICE_STORM", "severity": 6, "outage_hours": 18},
                {"date": "2020-09-15", "type": "DUST_STORM", "severity": 5, "outage_hours": 4},
            ],
            "EAST": [  # East Texas - thunderstorms, ice
                {"date": "2023-04-10", "type": "SEVERE_THUNDERSTORM", "severity": 6, "outage_hours": 10},
                {"date": "2022-06-20", "type": "SEVERE_THUNDERSTORM", "severity": 7, "outage_hours": 12},
                {"date": "2021-02-15", "type": "ICE_STORM", "severity": 8, "outage_hours": 48},
                {"date": "2020-08-05", "type": "TROPICAL_STORM", "severity": 5, "outage_hours": 8},
            ],
            "COAST": [  # Coastal - hurricanes, storm surge
                {"date": "2023-09-10", "type": "HURRICANE", "severity": 7, "outage_hours": 36},
                {"date": "2022-09-28", "type": "HURRICANE", "severity": 6, "outage_hours": 24},
                {"date": "2021-08-29", "type": "HURRICANE", "severity": 8, "outage_hours": 60},
                {"date": "2020-09-16", "type": "HURRICANE", "severity": 7, "outage_hours": 48},
            ],
        }

        events = historical_events.get(zone, [])
        return pd.DataFrame(events)

    def _calculate_zone_weather_risk(
        self, zone: str, zip_code: str, events_df: pd.DataFrame
    ) -> ZoneWeatherRisk:
        """
        Calculate weather risk metrics for a zone
        """
        if events_df.empty:
            return self._default_risk(zone, zip_code)

        events_df["date"] = pd.to_datetime(events_df["date"])
        cutoff = datetime.now() - timedelta(days=365 * 5)

        recent_events = events_df[events_df["date"] >= cutoff]

        event_count = len(recent_events)
        avg_events_per_year = event_count / 5.0
        avg_outage_hours = recent_events["outage_hours"].mean() if not recent_events.empty else 0
        max_outage_hours = recent_events["outage_hours"].max() if not recent_events.empty else 0

        most_common_event = (
            recent_events["type"].value_counts().index[0]
            if not recent_events.empty
            else "UNKNOWN"
        )

        # Financial impact calculation
        # Based on: https://www.iii.org/fact-statistic/facts-statistics-hurricanes
        avg_damage_per_event = self._estimate_damage(zone, avg_outage_hours)

        # Probability of event this year (Poisson distribution)
        prob_event_this_year = 1 - (2.71828 ** (-avg_events_per_year))

        narrative = self._generate_risk_narrative(
            zone, event_count, avg_events_per_year, most_common_event, avg_outage_hours
        )

        return ZoneWeatherRisk(
            zone=zone,
            zip_code_sample=zip_code,
            events_past_5_years=event_count,
            avg_events_per_year=avg_events_per_year,
            most_common_event_type=most_common_event,
            avg_outage_hours_after_event=avg_outage_hours,
            max_outage_hours_after_event=max_outage_hours,
            avg_home_damage_per_event=avg_damage_per_event,
            probability_event_this_year=prob_event_this_year,
            risk_narrative=narrative,
        )

    def _estimate_damage(self, zone: str, outage_hours: float) -> float:
        """
        Estimate financial impact of outage
        Factors: food spoilage, medication, business loss, hotel/relocation
        """
        if outage_hours < 4:
            return 50  # Minor impact
        elif outage_hours < 12:
            return 200  # Moderate (food spoilage, minor impact)
        elif outage_hours < 24:
            return 600  # Significant (hotel, business loss)
        elif outage_hours < 48:
            return 1200  # Severe (multiple days away, food loss)
        else:
            return 2500  # Catastrophic (major disruption)

    def _generate_risk_narrative(
        self,
        zone: str,
        event_count: int,
        avg_per_year: float,
        most_common: str,
        avg_hours: float,
    ) -> str:
        """Generate human-readable risk summary"""
        if event_count == 0:
            return f"No major severe weather events recorded in {zone} in past 5 years."

        event_name = most_common.replace("_", " ").title()

        if avg_per_year > 1.0:
            frequency = "frequently"
        elif avg_per_year > 0.5:
            frequency = "regularly"
        else:
            frequency = "occasionally"

        return (
            f"In the past 5 years, {zone} experienced {event_count} severe weather events "
            f"({frequency}, ~{avg_per_year:.1f}/year). "
            f"Most common: {event_name}. "
            f"Average outage duration: {avg_hours:.0f} hours. "
            f"This year, there's a {(self._probability_to_percent(avg_per_year)):.0f}% chance of another event."
        )

    def _probability_to_percent(self, avg_per_year: float) -> float:
        """Convert Poisson probability to percentage"""
        return (1 - (2.71828 ** (-avg_per_year))) * 100

    def _default_risk(self, zone: str, zip_code: str) -> ZoneWeatherRisk:
        """Return conservative default if no data available"""
        return ZoneWeatherRisk(
            zone=zone,
            zip_code_sample=zip_code,
            events_past_5_years=3,
            avg_events_per_year=0.6,
            most_common_event_type="SEVERE_WEATHER",
            avg_outage_hours_after_event=12,
            max_outage_hours_after_event=36,
            avg_home_damage_per_event=400,
            probability_event_this_year=0.45,
            risk_narrative="Typical weather risk for your area. Occasional outages expected.",
        )

    def get_risk_by_zip(self, zip_code: str) -> ZoneWeatherRisk:
        """Get cached risk for a zip code"""
        if zip_code not in self.zone_weather_map:
            # Load on first request
            zone = self._estimate_zone_from_zip(zip_code)
            self.add_weather_data(zone, zip_code)

        return self.zone_weather_map[zip_code]

    def _estimate_zone_from_zip(self, zip_code: str) -> str:
        """Map zip to ERCOT zone"""
        zip_int = int(zip_code[:5])
        if 75000 <= zip_int <= 76000:
            return "NORTH"
        elif 75200 <= zip_int <= 75300:
            return "EAST"
        elif 77000 <= zip_int <= 78000:
            return "SOUTH"
        elif 78700 <= zip_int <= 79000:
            return "WEST"
        elif 77500 <= zip_int <= 77600:
            return "COAST"
        else:
            return "SOUTH"
