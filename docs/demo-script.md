# Demo video script (target 4:25, hard max 5:00)

**Audience:** Base engineers judging the event, who also hire from it. They know
ERCOT and their own funnel better than we do. Lead with things they can check: live
screens, sources, and code. Avoid adjectives.

**Scoring we're aiming at:** technical depth (30), fit to the track (30), useful insight (20), creativity and polish (20).

**Speakers:** **B** = Brian (funnel, front end, go-to-market) · **S** = Shawn (data, backend, lead handling)

Read the lines at a normal pace: about 130 words per minute. The script is about 590 words, which comes to roughly 4:32.

---

## 0:00–0:25 · Why listen

**Screen:** before/after page, the "Pick a plan" tab. Keep this view as the visual anchor: come back to it at the end.

> **B:** The battery is Base's business, and every battery sale starts in a
> ten-step signup funnel. We walked every branch of it, homepage to address form,
> and found three places where it loses battery customers. In the next four minutes you'll
> see each one, a working rebuild that closes it, and where the leads Base can't
> serve should go instead. Our rule: **remove friction that makes people guess;
> add friction that informs.**

## 0:25–1:00 · Three leaks

**Screen:** before/after page, "ZIP & utility" tab: type **77096** into Base's empty homepage box and click "See available plans". Then the "Provider (asked again)" tab. Then the offline copy of Base's live funnel (`offline/base-funnel/index.html`) for leaks two and three.

> **B:** Leak one: making people guess. Signup starts with a ZIP, and from that
> ZIP Base already knows the utility. It's right there in the funnel's URL. Step 4
> asks anyway: can you choose your provider? Most people know the company on their
> bill, not the one that owns the wires, so they guess. Guess wrong and a
> customer Base can serve lands on a waitlist.
>
> Leak two: the battery costs extra steps. Pick energy-only and you jump to "Last
> step". Pick the battery and you're at step 8 of 10.
>
> Leak three: dead ends. Already own a battery? "Please email us." That lead is
> gone.

## 1:00–2:30 · One homeowner, three leaks closed

**Screen:** `#/after/zip` (the ZIP box starts empty). Type **77096** on camera. Go step by step.

> **B:** Follow one homeowner in Houston.
>
> Leak one, closed. They type 77096, and the answer is already there: you can
> choose your provider. No question to guess at. Six steps instead of ten.

*(risk screen)*

> **B:** Now the friction that informs. Before we ask why they're here, we show them
> their grid: in 2024, homes here averaged 72 hours without power. That's from
> federal EIA filings, and every number here is sourced. *Then* we ask the reason
> question.

*(usage screen: upload a bill)*

> **S:** Nobody knows their kWh. They photograph a bill, and OCR on our own server
> reads it. No typing, no guessing.

*(compare screen)*

> **B:** This is PowerToChoose, inside Base's funnel: 168 plans at this address,
> priced at their usage. The "cheapest" is $62 at 1,000 kWh. In a mild 600 kWh
> month it jumps to $100: less electricity, a bigger bill. Base, same month: $82.
> And on PowerToChoose itself, Base appears once, as a Spanish-language listing.

*(plan screen)*

> **B:** Leak two, closed. The battery is recommended, with outage hours at their
> address, backup hours at their usage and what an outage costs. And both plans
> take the same number of steps.
>
> Leak three, closed. Already own a battery? One click sends their details to
> enrollments.

## 2:30–3:20 · Under the hood

**Screen:** `GET /methodology/77096` JSON (or the "show your work" panel on the risk screen), then the site survey.

> **S:** This isn't a black-box score. `/methodology` returns the whole calculation:
> NOAA storm events for the county, weighted by how much each weather type moved
> ERCOT forced-outage megawatts across 364 daily reports, plus FERC–NERC figures
> for Uri.
>
> After the plan is chosen, there's an optional photo survey: a vision model places
> the battery in the customer's own garage. It runs locally, Qwen on Ollama,
> because photos of people's homes shouldn't leave the building and per-image API
> fees don't scale to lead volume.

## 3:20–4:00 · Leads Base can't serve yet

**Screen:** housepowerbackup.com.

> **B:** Some homes aren't a fit today, like renters or homes with a standby
> generator. Those leads shouldn't be dropped; they should be routed. We
> send them to housepowerbackup.com, a comparison site that recommends the right
> backup for each home, Base included where it fits. Its qualified visitors come
> back to Base with their answers pre-filled, with consent. Base can own it as a
> separate brand or partner as an affiliate, then repeat the pattern: one site
> per audience.

## 4:00–4:25 · What we built

**Screen:** back to the before/after page, clicking through the tabs.

> **B:** We found three leaks by mapping every branch of the live funnel. We built a working rebuild that closes each one, where every
> number has a source. And we made a path for the leads Base can't serve yet, so
> none are wasted.
>
> **S:** The code, data and sources are all in the repo.
>
> **B:** Remove friction that makes people guess. Add friction that informs.

---

## Delivery notes (from Winston's "How to Speak")

- **Open with the promise.** The first 25 seconds tell the judges what they'll get for listening. No greeting, no joke, no "hi, we're team…".
- **Keep the slogan word for word:** "remove friction that makes people guess; add friction that informs". It comes three times: opening, risk screen, last line. Don't paraphrase it.
- **Say the numbers out loud:** "leak one… leak two… leak three", then "leak one, closed…". Each fix is announced against its problem, so viewers can check them off.
- **Say what it isn't:** not a new look (it's Base's own design), not a black-box score, not a filter that throws leads away.
- **Tell it as a story:** one Houston homeowner, start to finish.
- **End by listing what you built.** Don't end on "thanks" or "questions?". The slogan is the last thing they hear.
- **If a timed run goes over 4:45, cut these first:** "And on PowerToChoose itself, Base appears once…" and "Six steps instead of ten."
- **Don't read the screen aloud.** Say the number, then pause for a beat so the viewer can find it on screen.

## Before you record

- [ ] **Record from Shawn's machine.** `backend/main.py` on `main` imports `weather_outage_correlation`, `municipal_permitting` and `install_visualizer`, which aren't committed. It won't start from a fresh clone. Commit them before submitting, since judges look at the repo.
- [ ] Backend running on `:8000`. Ollama running with the Qwen2.5-VL model pulled. Product image at `backend/assets/battery_product.png`.
- [ ] Front end: `cd frontend && npm run dev`. Test the whole path once with ZIP **77096**. Both ZIP boxes (ours and Base's homepage copy) start empty, so type it on camera. Ours looks it up as soon as the fifth digit is typed.
- [ ] Split-ZIP backup: if a judge asks about ZIPs with two utilities, type **78660** in ours to show the one "who sends your bill?" question.
- [ ] Have a real bill photo and an install-area photo ready to upload.
- [ ] Offline copy of Base's funnel open in another tab (`offline/base-funnel/index.html`).
- [ ] Hide bookmarks and notifications. Use a 1280-wide browser window.

## Claims check (don't say more than this)

| Line | Backed by |
|------|-----------|
| Base's funnel URL already carries the utility | Base's ZIP router sends 77096 to `join-now-zip?postal_code=77096&utility=CENTERPOINT` |
| Wrong step 4 answer → waitlist | Live CenterPoint funnel, checked 2026-09-26: "My electricity provider is assigned" → "We can't serve your home yet… Join the Base waitlist" |
| 72 h without power, CenterPoint 2024 | EIA-861 2024 Reliability, SAIDI with major events (4,316 min) |
| 168 plans; "cheapest" $62 at 1,000 kWh → $100 at 600 kWh; Base $82 at 600 | PowerToChoose CSV export, captured 2026-09-26 (AP Gas & Electric "Simple Saver 3"; Base "Base Plan Energia 36") |
| Base is **not** the cheapest at 1,000 kWh here | Base lists 13.2¢ against a 13.0¢ market median. Don't say "cheapest" or "below market" on this screen. The win is no usage trap, plus the battery |
| Base appears once on PowerToChoose | Same export: one "Base Power" row, CenterPoint, Spanish |
| Battery path longer than energy-only | Crawl of the live funnel: energy-only → "Last step"; battery → "Step 8 of 10" |
| Ours: 6 steps, same length for both plans | New funnel: both plan buttons go to the same confirmation screen. The photo survey comes after the choice and is optional |
| 364 ERCOT daily reports | `backend/ercot_data/` (Unplanned Resource Outages) |

These are **generator** outage reports, not customer outages. Say "forced-outage megawatts", not "outages in your area".

**Don't quote conversion or close-rate numbers.** We haven't measured any. Say "should" and "what we'd A/B test", not percentages.
