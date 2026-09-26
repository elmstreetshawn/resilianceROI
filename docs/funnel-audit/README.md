# Base Power signup funnel audit

This is a walkthrough of the live signup funnel at
`join.basepowercompany.com/join-now-zip?postal_code=78660&utility=ONCOR`.
It is a 10-step React single-page app, captured 2026-09-26.

**Goal:** get more customers to pick **Base energy + battery** over the energy-only
plan. We do that by showing each customer, with real data, why the battery is worth
it at their address.

## Findings

| # | Step | What happens now | Gap | Fix |
|---|------|------------------|-----|-----|
| 1 | 2 of 10: "Main reason for considering Base?" | Three self-reported options: backup, fixed rate, or both | The customer is asked what they value but never shown any evidence. This is the first chance to make the battery case, and it goes unused. | Show a card for their ZIP: how often it loses power, how long outages last, and what grid prices do at peak |
| 2 | 4 of 10: "How do you get your electricity today?" | Customer picks deregulated, assigned (muni/co-op), or "not sure" | **Base already knows the answer.** The URL has `utility=ONCOR`, and the ZIP determines the utility. Asking adds friction, and "I'm not sure" leads to a worse path. | Work it out from the ZIP and utility, then remove the step or show it pre-filled as "confirm" |
| 3 | 7 of 10: plan choice | Two equal cards, one per plan. The battery card's only selling point is "covered when the grid goes down" | Nothing helps the customer choose. There is no data, no personal numbers, and no "help me decide" | Add a **"Help me decide"** panel, similar to powertochoose.org: outage history, hours of backup their home would get, peak-price exposure. Make the battery the visually recommended option. |
| 4 | Dead end: "Base battery isn't available" (customer already has a whole-home battery) | Tells them to email enrollments@basepowercompany.com manually | The funnel hands off to the customer's own email app, and many will never write that email | Replace it with a one-click **"Send my info to enrollments"** button that submits their details. Treat it as a lead, not an exit. |

Screenshots with notes: [`screenshots/`](screenshots/)

- `funnel-steps-2-and-4.png` covers findings 1 and 2
- `funnel-step-7-and-deadend.png` covers findings 3 and 4
- `homepage-hero.png`: the homepage ZIP box, the first step of signup
- `homepage-utility-78660.png`: the homepage's "Who's your local utility?" screen for a split ZIP. It comes before the funnel, and step 4 asks again

## Data to back the battery case

**Used in the build:** EIA-861 reliability and the PowerToChoose CSV export (see
`frontend/README.md`). The rest are candidates for next steps.

| Claim shown to the customer | Source | Notes |
|-----------------------------|--------|-------|
| "Your area lost power N times / H hours in the last few years" | DOE/ORNL **EAGLE-I**: county-level customers-out data every 15 minutes, 2014–2023, public on figshare | County level, so map ZIP → county |
| Utility reliability (SAIDI/SAIFI) | **EIA-861** reliability tables, and PUCT annual utility reliability reports | Utility level. Oncor, CenterPoint, AEP, and TNMP are all listed |
| Major events such as Uri (Feb 2021) and Beryl (Jul 2024, Houston) | EAGLE-I, ERCOT event reports | Works as a vivid headline: "In Uri, homes in your county were dark for X hours" |
| "Grid prices spike X× at peak" | ERCOT real-time settlement point prices by load zone, available without credentials | A Base customer's fixed rate shields them from this. Use it to explain *why* fixed rate plus battery matters |
| ZIP → utility, and whether the customer can choose a provider | PUCT TDU ZIP lists, HIFLD retail service territories | Powers finding 2 |

## Minimum-usage fees ("going under minimum")

Many Texas plans charge a fee, or withhold a bill credit, when monthly usage falls
below a threshold. In the PowerToChoose export, 174 of 1,884 offers are flagged. The
worst advertise about 5¢/kWh at 1,000 kWh but cost about 18¢ at 500 kWh. Base has no
minimum-usage fee, and the new compare step makes that visible.
