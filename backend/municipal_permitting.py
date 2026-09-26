"""
Battery install permitting requirements by jurisdiction - real, sourced
requirements for our covered metros, not a guess. This is exactly the kind of
site-logistics gap a customer (and an installer scheduling a truck roll) needs
answered before an install date can be set: does this address need a permit,
who issues it, and what's the typical turnaround.

Texas has no statewide permitting authority for residential electrical/battery
work - every city sets its own rules, and most unincorporated counties don't
require a permit at all (TDLR electrician licensing still applies, but there's
no local building department to file with). That split is real and worth
showing, not smoothing over.
"""

# city (as it appears in texas_zips.csv, upper-cased) -> permitting requirements
PERMITTING_BY_CITY = {
    "DALLAS": {
        "jurisdiction": "City of Dallas",
        "permit_required": True,
        "authority": "Dallas Dept. of Sustainable Development & Construction",
        "requirements": (
            "Electrical permit required for the install; stationary battery storage also needs a "
            "construction permit under the Dallas Fire Code (2021) Sec. 105.6.5 for energy storage systems."
        ),
        "typical_fee": "$100-$500",
        "typical_timeline": "1-2 weeks",
        "source": "Dallas Fire Code 2021 Ch. 12 (Energy Systems); City of Dallas electrical permit application",
    },
    "ARLINGTON": {
        "jurisdiction": "City of Arlington",
        "permit_required": True,
        "authority": "City of Arlington Office of Electrical Inspection",
        "requirements": (
            "Electrical permit required before any electrical equipment is installed or altered; "
            "Arlington has adopted the 2020 National Electrical Code."
        ),
        "typical_fee": "Not published",
        "typical_timeline": "Not published",
        "source": "City of Arlington electrical permitting requirements (arlingtontx.gov)",
    },
    "HOUSTON": {
        "jurisdiction": "City of Houston / Harris County",
        "permit_required": True,
        "authority": "Houston Permitting Center",
        "requirements": (
            "An operational permit is required for stationary energy storage systems under IFC Sec. 1207. "
            "Applications are electronic-only through the Houston Permitting Center."
        ),
        "typical_fee": "Not published",
        "typical_timeline": "Not published",
        "source": "Houston Permitting Center, \"IFC Electrical Storage Systems\" guidance",
    },
    "AUSTIN": {
        "jurisdiction": "City of Austin (Austin Energy territory)",
        "permit_required": True,
        "authority": "Austin Energy (utility-administered, not the city building dept.)",
        "requirements": (
            "All energy storage systems interconnecting to the Austin Energy grid require an Auxiliary "
            "Power Electrical Permit, filed through the AB+C portal, and must pass Austin Energy's final "
            "electrical inspection under your Interconnection Service Agreement. Note: Texas SB 1202 lets "
            "third parties expedite backup-power permitting in most cities, but Austin Energy is exempted - "
            "this permit still goes through AE's own review, not a 3-business-day fast path."
        ),
        "typical_fee": "Not published",
        "typical_timeline": "Not published",
        "source": "Austin Energy Solar Permitting Manual (2026)",
    },
}

UNINCORPORATED_DEFAULT = {
    "jurisdiction": "Unincorporated county",
    "permit_required": False,
    "authority": "None - most unincorporated Texas counties have no building permitting authority",
    "requirements": (
        "Outside city limits, most Texas counties don't issue building or electrical permits at all - "
        "counties have limited legal authority to adopt and enforce building codes. The installing "
        "electrician still needs a valid TDLR license, and the work must still meet the current adopted "
        "electrical code even with no permit filed."
    ),
    "typical_fee": "N/A",
    "typical_timeline": "N/A - no permit to wait on",
    "source": "Texas Dept. of Licensing & Regulation (TDLR) electrician compliance guide",
}


def get_permitting_for_city(city: str) -> dict:
    return PERMITTING_BY_CITY.get((city or "").strip().upper(), UNINCORPORATED_DEFAULT)
