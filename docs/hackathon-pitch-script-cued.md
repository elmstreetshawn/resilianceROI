# Hackathon pitch script, with click cues

A copy of `hackathon-pitch-script.md` with a cue before every click, so you know what to do
as you read. **The spoken words are Shawn's, unchanged.** Paragraphs are split where a click
belongs. Cues were checked against the running app and housepowerbackup.com on 2026-09-26.

How to read it:

- **▶** lines are actions. Don't read them aloud.
- **Bold names** are the exact text on the button or link.
- **⚠** lines are things to know before recording: a spoken line that doesn't match the screen, or a click that breaks the demo.

---

## Before you hit record

1. **Start the backend** (`cd backend && python main.py`). It needs `pandas`, which isn't in `requirements.txt` yet: run `pip install pandas` first.
2. **Start the local AI model** for the install visualizer: `ollama serve`, with the model pulled (`ollama pull qwen2.5vl:7b`). Without it, the survey shows *"Couldn't reach the local placement model"* on camera. That contradicts the line about the vision model finding the spot.
3. **Start the front end** (`cd frontend && npm run dev`). Use the address Vite prints, e.g. `http://localhost:5173`.
4. **Put three photos in one folder:** two of an install area (panel/meter wall, one close and one wide) and one of a backyard. JPG or PNG, at least 400×400 px.
5. **Open three browser tabs**, in this order:
   - **Tab 1:** `…/#/compare`, the before/after page. Leave it on the first tab.
   - **Tab 2:** `…/#/after/risk`. It opens on Houston (77096): *"In 2024, homes on your grid averaged 72 hours without power."* Reload it right before recording so it starts fresh.
   - **Tab 3:** `https://housepowerbackup.com`. **Click Accept or Decline on the cookie banner now**, so it doesn't pop up on camera.
6. **Have fake contact details ready to type:** e.g. *Jordan Lee · (512) 555-0100 · jordan@example.com*.

---

## Opening (~20s)

▶ **Tab 1** (before/after page). No clicks yet.

Hey — we spent this hackathon on one question: why is Base's own signup funnel losing people, and what's actually possible if you fix it. Short version: your funnel isn't broken, it's asking for trust before it's earned any. We built the fix. We want to show you exactly how, end to end.

## The problem (~50s)

▶ Stay on **Tab 1**. You'll click four tabs along the top. For each one, **point your cursor at the left column**: that's Base's live funnel. The right column is ours; save it for later.

▶ Click the tab **Why Base?** The left side shows *"What's your main reason for considering Base?"*

This is your real funnel, today. Step two asks "what's your main reason for considering Base" — before showing a single piece of evidence.

▶ Click the tab **Provider (asked again)**. Left side: *"How do you get your electricity today?"*

Step four asks how you get your electricity, even though the URL already has your utility in it.

> ⚠ No URL is visible on this page, so viewers can't see this. If you want to show it: for 77096, Base's own funnel address is `join.basepowercompany.com/join-now-zip?postal_code=77096&utility=CENTERPOINT`.

▶ Click the tab **Pick a plan**. Left side: two equal plan cards.

Step seven puts two plans side by side with one line of copy each — no outage data, no market comparison, nothing that actually justifies the battery.

▶ Click the tab **Already have a battery**. Left side ends with *"Please email us at enrollments@basepowercompany.com"*. Point at that line.

And if someone already owns a battery, the whole thing dead-ends into "please email us." Every one of those is friction with no qualification behind it. That's exactly how you end up with noisy leads — people clicking through boredom or curiosity, not because they're actually a fit.

## What we built — the data (~55s)

▶ Switch to **Tab 2**. The risk screen shows *"In 2024, homes on your grid averaged 72 hours without power."* and the bar chart.

So we rebuilt it on real data, not vibes. Backend's Flask and Python, frontend's React and TypeScript. We pulled all 364 daily ERCOT outage reports and deduplicated them down to about fifty thousand real, unique outages.

> ⚠ Those ERCOT reports are *power plant* (generator) outages, not outages at homes. If a judge asks, say "forced generator outages".

We pulled NOAA's Storm Events Database — tornado, ice storm, hurricane — back to 2021, so Winter Storm Uri is actually in the data. We pulled EIA-861 utility reliability filings, so Oncor and CenterPoint aren't treated the same grid. Then we built a real correlation model: how much does each weather type actually move ERCOT-wide outage volume — and we show that math openly, right here.

▶ Click **▸ How we calculated this**, the small grey line just below the orange *"Severe weather near you"* box, under the chart. It opens the Uri note and a bar chart of Harris County's storm types (Thunderstorm Wind first). Optional: click **▸ Show the full numbers** at the bottom of it.

Every number a customer sees, they can click into and see exactly where it came from. That's not a demo number. That's a real risk score for their zip code.

## Qualification through real friction (~60s)

▶ Click through to the survey. Six clicks. Do them while you say the first sentence below, or pause talking until you reach the survey:

1. **Scroll down** past the open breakdown to *"Knowing this, what matters most to you?"*, then click **Having reliable backup power at an affordable price**
2. **1,000 kWh / month Average Texas home**
3. **Compare plans in my area**
4. **See my Base options** (bottom of the plan table)
5. **Select plan** on the **right** card, *Base energy + battery*: the one marked **Recommended for you**, with the dark green button. You land on *"You're getting Base energy + battery."*
6. **Continue to site survey**

> ⚠ Don't skip step 5 by typing a URL. Picking the battery on screen is what saves the lead. Without it, the callback-window buttons at the end stay grey ("Save your lead first").

Here's the part that matters to your sales team. Once someone picks the battery, we don't just say "thanks, we'll call you." We ask for two photos of their install area — validated for real, not rubber-stamped —

▶ Under **Install area (near your panel/meter)**, click **📸 Add photo**. Select **both** install-area photos (Ctrl-click, or Cmd-click on a Mac), then Open.
▶ Under **Backyard**, click **📸 Add photo** and pick the backyard photo.

and a locally-run vision model, Qwen 2.5 through Ollama, no API key, nothing leaves the machine, finds where the battery would actually sit.

▶ Click **👁 See it in your space**. It appears under the two install-area file names, but only once there are **two** install photos. The button changes to *"Placing your battery… can take up to a minute"*. Keep talking while it works.

**[Demo: drag the battery layer]**

▶ **Drag** the green battery box on the photo to a new spot. Then drag the **round handle at its bottom-right corner** to resize it.

They can drag it into place themselves. That's real commitment, not a form fill. We look up the actual permit requirements for their city, so there's no surprise later.

▶ **Scroll up** to the grey box at the top of the survey: *"A permit is required for this install… Houston Permitting Center."* Point at it.

And only *then* do we ask for name, phone, and email, tied to a preferred callback window.

▶ **Scroll down** past the green **Submit for installer review** button to **Request a sales follow-up**.

> ⚠ **Don't click Submit for installer review.** It replaces the page with its result, and the contact form and callback windows disappear.

▶ Type the fake name, phone and email into **Full name**, **Phone number** and **Email address**.

**[Scroll to follow-up scheduler]**

▶ Scroll to **Pick your preferred install window**. The four time buttons stay grey until all three contact fields are filled.

By the time that lead hits your appointment setters, they've uploaded their own panel, seen their own real risk score, and voluntarily handed you a phone number. That's a warm lead, not noise.

▶ On *"That's a warm lead"*, click **Monday, Sep 28 · Morning (8am-12pm)**, or any window. The page turns into a green confirmation: *"Sales follow-up request received."* This is your last click in the app; the survey is gone after it.

## housepowerbackup.com (~30s)

**[Switch tab]**

▶ Switch to **Tab 3** (housepowerbackup.com).

One more piece: we also built housepowerbackup.com, live right now. It's a neutral comparison engine — enter your zip,

▶ Type **77096** into the ZIP box in the top section. Click **Check My Risk**. That opens the tool page with the ZIP filled in. Click **Analyze My Outage Risk**.

and in under two minutes it ranks generators, solar-plus-battery, and portable options against your actual outage risk, using EIA, NOAA, and DOE data.

▶ Scroll slowly through the results: the risk score (81/100, "Severe Risk"), then **Recommended Systems for ZIP 77096**.

Base isn't in it yet. It should be — this is exactly the kind of high-intent, already-educated traffic that should be landing in the funnel we just showed you.

> ⚠ **"Base isn't in it yet" is no longer true.** The 77096 results list *"Base Power Home Battery / EcoFlow DELTA Pro"* third, under **Emerging Systems** (65% match). Change the line before recording. For example: *"Base is in it, but third, filed under 'emerging systems'. It should be ranking first for homes like this — …"*
>
> ⚠ This page shows **12.4 hrs** "avg annual outage" for 77096, while our funnel said **72 hours** in 2024. They're different measures (a multi-year average vs. the worst year), but don't read the 12.4 aloud, or a judge may ask why they disagree.

## Close — the ask (~25s)

▶ Switch back to **Tab 1** (before/after page) as the final picture. No clicks.

We're not pitching a mockup. Every piece of this — the risk model, the photo validation, the visualization, the scheduler — works, right now, end to end. We'd like to build this with you for real: wire it into your live funnel, connect housepowerbackup.com as a qualified front door, and make sure your team only ever talks to warm leads.

---

*(~620 words / ~4.5 min spoken, plus clicking time. Do one timed run with the clicks: the survey section takes longer on camera than it reads.)*
