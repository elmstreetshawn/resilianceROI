# Hackathon pitch script — for Base Power

Read time target: ~4–4.5 minutes at a natural pace (~620 words). Demo cues in brackets.

---

**[Have `#/before/reason` open in one tab, `#/after/...` ready in another, housepowerbackup.com open in a third.]**

## Opening (~20s)

Hey — we spent this hackathon on one question: why is Base's own signup funnel losing people, and what's actually possible if you fix it. Short version: your funnel isn't broken, it's asking for trust before it's earned any. We built the fix. We want to show you exactly how, end to end.

**[Click: `#/before/reason` — Base's live funnel]**

## The problem (~50s)

This is your real funnel, today. Step two asks "what's your main reason for considering Base" — before showing a single piece of evidence. Step four asks how you get your electricity, even though the URL already has your utility in it. Step seven puts two plans side by side with one line of copy each — no outage data, no market comparison, nothing that actually justifies the battery. And if someone already owns a battery, the whole thing dead-ends into "please email us." Every one of those is friction with no qualification behind it. That's exactly how you end up with noisy leads — people clicking through boredom or curiosity, not because they're actually a fit.

**[Click: `#/after/risk`]**

## What we built — the data (~55s)

So we rebuilt it on real data, not vibes. Backend's Flask and Python, frontend's React and TypeScript. We pulled all 364 daily ERCOT outage reports and deduplicated them down to about fifty thousand real, unique outages. We pulled NOAA's Storm Events Database — tornado, ice storm, hurricane — back to 2021, so Winter Storm Uri is actually in the data. We pulled EIA-861 utility reliability filings, so Oncor and CenterPoint aren't treated the same grid. Then we built a real correlation model: how much does each weather type actually move ERCOT-wide outage volume — and we show that math openly, right here.

**[Click "How we calculated this"]**

Every number a customer sees, they can click into and see exactly where it came from. That's not a demo number. That's a real risk score for their zip code.

## Qualification through real friction (~60s)

**[Click through to plan → battery → done → survey]**

Here's the part that matters to your sales team. Once someone picks the battery, we don't just say "thanks, we'll call you." We ask for two photos of their install area — validated for real, not rubber-stamped — and a locally-run vision model, Qwen 2.5 through Ollama, no API key, nothing leaves the machine, finds where the battery would actually sit.

**[Demo: drag the battery layer]**

They can drag it into place themselves. That's real commitment, not a form fill. We look up the actual permit requirements for their city, so there's no surprise later. And only *then* do we ask for name, phone, and email, tied to a preferred callback window.

**[Scroll to follow-up scheduler]**

By the time that lead hits your appointment setters, they've uploaded their own panel, seen their own real risk score, and voluntarily handed you a phone number. That's a warm lead, not noise.

## housepowerbackup.com (~30s)

**[Switch tab]**

One more piece: we also built housepowerbackup.com, live right now. It's a neutral comparison engine — enter your zip, and in under two minutes it ranks generators, solar-plus-battery, and portable options against your actual outage risk, using EIA, NOAA, and DOE data. Base isn't in it yet. It should be — this is exactly the kind of high-intent, already-educated traffic that should be landing in the funnel we just showed you.

## Close — the ask (~25s)

We're not pitching a mockup. Every piece of this — the risk model, the photo validation, the visualization, the scheduler — works, right now, end to end. We'd like to build this with you for real: wire it into your live funnel, connect housepowerbackup.com as a qualified front door, and make sure your team only ever talks to warm leads.

---

*(~620 words / ~4.5 min spoken)*
