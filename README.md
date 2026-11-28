# Asli Ya Nakli?

A free web app for Indian families after a UPI or impersonation scam: call 1930 first, prepare the 1930 call script, the cybercrime.gov.in complaint fields and a bank email from details the person confirms, check a suspicious message, and get help during a scary call. Runs on AWS in Mumbai (`ap-south-1`).

Not a government service.

## Privacy

- The case (payments, names, numbers, notes) is kept only in the open browser tab's memory. It is never saved in browser storage, the URL or on a server. Closing or refreshing the tab clears it.
- The browser stores only the chosen language and display settings (text size, contrast).
- The scam checker runs on the phone. Typed messages are not sent anywhere.
- A screenshot is sent only after the person ticks consent for that image. It goes to Amazon Textract in Mumbai to be read once; the app stores no image and no extracted text.
- "Translate to English" on the report page is optional and needs a tick each time: only the story the person wrote is sent to Amazon Translate in Mumbai, once, and the app stores neither the text nor the translation. The person reviews and edits the English before it is used.
- Server logs contain only a request ID, route, status and timings, and are kept for 7 days.
- Voice input uses the browser's built-in speech recognition, which may be processed by the browser vendor. Nothing is stored.
