We spent this hackathon on one question. Why is Base's own sign-up funnel missing out on conversions and what's actually possible if you fix it?
The short version is that the funnel isn't broken, it's just asking for trust before it's earned any. We built the fix, and we want to show you exactly how, end to end.

The battery is Base's business and any part of the funnel that might lose battery customers is an area that needs attention. We focused on a few of the existing steps.

The funnel starts out with inputting a zip code, which is good.
But one of the first potential leaks is right here with "what's your main reason for considering base?". There's nothing here to help demonstrate why customer may want backup power. This is unnecessary friction.

The next issue is on this step, "How do you get your electricity today?" 
Because the very first step was entering your zip code, it's asking a question that we should know the answer to. 
This is unnecessary friction.

Another issue is on this step, stating that you have two options seems contradictory relative to a previous step and still doesn't help demonstrate why customer may want a battery.
Worse, they may be asking, "How would I know?"

Finally, if they are not eligible for service, the whole thing dead-ends into "please email us." That's a missed opportunity for an affiliate recommendation and demonstration of goodwill.

All of these are leaks. Here is our solution, rebuilt on real data. The backend is Flask and Python, frontend is React and TypeScript.

You start the same way by entering your zip code. It automatically recognizes your provider option and you can continue. Thats less friction.

The next thing that it shows you is your worst case scenario of being without power. This is helping to answer the question, "Why would I want a battery?"
Its real data, from unique ERCOT outage reports, NOAA's Storm Events Database, and federal EIA filings. Its a real correlation model: how much does each weather type actually move ERCOT-wide outage volume — and we show details of that data openly, right here.
Every number a customer sees, they can click into and see exactly where it came from. That's not a demo number. That's a real risk score for their zip code.

This slows them down, but for the right reason. They know that weather is going to keep happening, and they need a plan for how to deal with it.

Next, here is an option to take a picture of their bill and upload it with their phone. We run OCR on our own server to read it. No typing, no guessing.

Next, this is PowerToChoose.org, inside Base's funnel: 168 plans in this example area, priced at their usage. Showing Base's estimated price and a reminder of what all other options lack: none would provide backup power.

Now we show the same choice as the existing funnel, but with data driven context, personalization, and trust.
Selecting the plan with the battery naturally takes you to a preliminary virtual survey. You can add photos showing your meter and a locally-run vision model, Qwen 2.5 through Ollama, no API key, nothing leaves the machine, finds where the battery would actually sit. 

housepowerbackup.com (~30s)
[Switch tab]
One more piece: we also built housepowerbackup.com, live right now. It's a neutral comparison engine — enter your zip, and in under two minutes it ranks generators, solar-plus-battery, and portable options against your actual outage risk, using EIA, NOAA, and DOE data. This should handoff data to Base, and that should work the other way around as well.

We're not pitching a mockup. Every piece of this — the risk model, the photo validation, the visualization, the scheduler — works, right now, end to end. We'd like to build this with you for real: wire it into your live funnel, A/B test it, connect housepowerbackup.com as a qualified front door, and make sure your team only ever talks to warm leads.

Thank you
