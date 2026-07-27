# Project Memory

## Twilio voice and WhatsApp rollout

Status recorded on July 27, 2026:

- The Twilio WhatsApp sandbox has been tested successfully.
- A WhatsApp user was able to chat with Lisa end to end.
- This confirms that inbound WhatsApp messages reach the application, Lisa can
  generate a response, and Twilio can deliver the response back to WhatsApp.
- Twilio remains the preferred production provider for both the AI phone agent
  and the official WhatsApp integration.
- Whapi.Cloud may be useful for experiments with a separate number, but it is
  an unofficial linked-device integration and is not the production choice.
- Admin -> Voice Demo includes a production-readiness panel for the saved
  Twilio credentials, WhatsApp sender, external approvals, and voice activation.
- The approved Twilio voice number is for Lisa's inbound Prince Caleb customer
  service line. The clinic remains a separate browser demo.
- Admin Settings has a dedicated Owner voice number. Lisa recognizes matching
  inbound caller ID as Prince Caleb for conversational context only; caller ID
  never authorizes private information or sensitive actions.
- Marketing Leads prepares phone scripts and supports either a manual call or
  one Lisa AI call after an admin explicitly approves it and confirms that the
  recipient requested or consented. There is no cron or batch dialing.
- Lisa AI outreach calls have a separate limit of five per day. Phone-only
  generated leads are drafted into her approval queue; leads with a usable
  email remain in the email outreach path and its separate 50/day cap.

Remaining production steps:

1. Correct the complete physical address on the rejected Twilio Regulatory
   Bundle and resubmit the existing bundle for review.
2. Complete the production WhatsApp sender registration in Twilio and Meta.
3. Create and obtain approval for WhatsApp message templates used when Lisa
   initiates a conversation outside the 24-hour customer-service window.
4. Test customer opt-in, media messages, human escalation, delivery failures,
   webhook retries, and conversation logging.
5. After the Twilio voice number is approved, configure its incoming-call
   webhook and status callback using the endpoints documented in `README.md`.
6. Run an end-to-end production test for inbound calls before advertising the
   number publicly.

Security:

- Never commit or paste the Twilio Auth Token, API keys, webhook secrets, or
  Meta access tokens into project files.
- Account and Bundle SIDs may identify resources, but they are intentionally
  omitted from this memory file.
