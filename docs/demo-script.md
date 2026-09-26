# Demo video script (target 4:25, hard max 5:00)

**Audience:** Base engineers judging the event, who also hire from it. They know
ERCOT and their own funnel better than we do. Lead with things they can check: live
screens, sources, and code. Avoid adjectives.

**Scoring we're aiming at:** technical depth (30), fit to the track (30), useful insight (20), creativity and polish (20).

**Speakers:** **B** = Brian (funnel, front end, go-to-market) · **S** = Shawn (data, backend, lead handling)

Read the lines at a normal pace: about 130 words per minute. The script is about 615 words, which comes to roughly 4:43.

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

**Screen:** before/after page, "ZIP & utility" tab: type 78660 on Base's homepage, click "See available plans" to reach the utility question. Then the "Provider (asked again)" tab. Then the offline copy of Base's live funnel (`offline/base-funnel/index.html`) for leaks two and three.

> **B:** Leak one: asking twice, in the wrong words. Signup starts with a ZIP.
> Pflugerville is split, so the next screen asks: Austin Energy or Oncor? Most people have never seen the name
> of the company that owns their wires. Then step 4 asks again whether you can
> choose your provider. Answer wrong and you land on a waitlist.
>
> Leak two: the battery costs extra steps. Pick energy-only and you jump to "Last
> step". Pick the battery and you're at step 8 of 10.
>
> Leak three: dead ends. Already own a battery? "Please email us." That lead is
> gone.

## 1:00–2:30 · One homeowner, three leaks closed

**Screen:** `#/after/zip?postal_code=78660` (Pflugerville). Leave `utility` out of the URL so the bill question shows. Go step by step.

> **B:** Follow one homeowner in Pflugerville.
>
> Leak one, closed. They type 78660. It's a split ZIP, so we ask one question in
> words they know: who sends your electric bill? "Another company", so they can
> choose a provider. Nothing is asked twice. Six steps instead of ten.

*(risk screen)*

> **B:** Now the friction that informs. Before we ask why they're here, we show them
> their grid. In the Uri year the average customer here lost 9 hours, and that
> average hides the homes in the rolling blackouts, out for days. A Base battery
> covers 52 hours of essentials. Every number is sourced. *Then* we ask the reason
> question.

*(usage screen: upload a bill)*

> **S:** Nobody knows their kWh. They photograph a bill, and OCR on our own server
> reads it. No typing, no guessing.

*(compare screen)*

> **B:** This is PowerToChoose, inside Base's funnel: 167 plans at this address,
> priced at their usage. The "cheapest" is $52 at 1,000 kWh. In a mild 600 kWh
> month it jumps to $93: less electricity, a bigger bill. Base has no usage trap. And on PowerToChoose itself, Base isn't
> listed for this address at all.

*(plan screen)*

> **B:** Leak two, closed. The battery is recommended, with outage hours at their
> address, backup hours at their usage and what an outage costs. And both plans
> take the same number of steps.
>
> Leak three, closed. Already own a battery? One click sends their details to
> enrollments.

## 2:30–3:20 · Under the hood

**Screen:** `GET /methodology/78660` JSON (or the "show your work" panel on the risk screen), then the site survey.

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
- **Tell it as a story:** one Pflugerville homeowner, start to finish.
- **End by listing what you built.** Don't end on "thanks" or "questions?". The slogan is the last thing they hear.
- **If a timed run goes over 4:45, cut these first:** "Base isn't listed for this address at all" and "Six steps instead of ten."
- **Don't read the screen aloud.** Say the number, then pause for a beat so the viewer can find it on screen.

## Before you record

- [ ] **Record from Shawn's machine.** `backend/main.py` on `main` imports `weather_outage_correlation`, `municipal_permitting` and `install_visualizer`, which aren't committed. It won't start from a fresh clone. Commit them before submitting, since judges look at the repo.
- [ ] Backend running on `:8000`. Ollama running with the Qwen2.5-VL model pulled. Product image at `backend/assets/battery_product.png`.
- [ ] Front end: `cd frontend && npm run dev`. Test the whole path once with ZIP **78660**, with no `utility` in the URL. (Alternative: **77096** Houston has a stronger outage headline, 72 h in 2024, but no split-ZIP question.)
- [ ] Have a real bill photo and an install-area photo ready to upload.
- [ ] Offline copy of Base's funnel open in another tab (`offline/base-funnel/index.html`).
- [ ] Hide bookmarks and notifications. Use a 1280-wide browser window.

## Claims check (don't say more than this)

| Line | Backed by |
|------|-----------|
| 78660 is split between Austin Energy and Oncor | Base's own ZIP router (`account.basepowercompany.com/api/zip-router`) returns both, `isMultiple: true`; the homepage shows the same two options (`docs/funnel-audit/screenshots/homepage-utility-78660.png`) |
| Wrong step 4 answer → waitlist | Crawl of the live Oncor funnel: "My electricity provider is assigned" → "We can't serve your home yet… Join the Base waitlist" |
| Oncor: 9 h average in 2021 (Uri year); 52 h essentials backup | EIA-861 2021 (Oncor files under "Other Standard", 558.8 min); backup = 25 kWh ÷ (1,000 kWh/730 h × 35%), an assumption in `battery.ts` |
| Uri blackout homes "out for days" | FERC–NERC Winter Storm Uri report (Nov 2021): 4.5 million+ Texans lost power, some for as long as four days. Shawn's `/methodology` cites it |
| 167 Oncor plans; $52 at 1,000 kWh → $93 at 600 kWh | PowerToChoose CSV export, captured 2026-09-26 (AP Gas & Electric "Simple Saver 3") |
| Base not on PowerToChoose for 78660 | Same export: Base's only listing is CenterPoint (Spanish). There are no Oncor rows |
| Battery path longer than energy-only | Crawl of the live funnel: energy-only → "Last step"; battery → "Step 8 of 10" |
| Ours: 6 steps, same length for both plans | New funnel: both plan buttons go to the same confirmation screen. The photo survey comes after the choice and is optional |
| 364 ERCOT daily reports | `backend/ercot_data/` (Unplanned Resource Outages) |

These are **generator** outage reports, not customer outages. Say "forced-outage megawatts", not "outages in your area".

**Don't quote conversion or close-rate numbers.** We haven't measured any. Say "should" and "what we'd A/B test", not percentages.
