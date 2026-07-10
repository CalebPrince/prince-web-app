---
title: "How I connected an LLM-powered live chat to Gmail, Slack, Google Sheets, and WhatsApp with Composio"
slug: "composio-llm-live-chat-gmail-slack-sheets-whatsapp"
type: "case-study-draft"
category: "AI & Automation"
status: "draft"
excerpt: "A practical case study on turning a website live chat from a simple conversation widget into an action-taking assistant that can qualify leads, book calls, and notify the right channels through Composio."
suggested_tags:
  - Composio
  - LLM
  - Live Chat
  - Gmail
  - Slack
  - Google Sheets
  - WhatsApp
  - Automation
---

# How I connected an LLM-powered live chat to Gmail, Slack, Google Sheets, and WhatsApp with Composio

Most website chat widgets stop at conversation. They answer a question, collect a name and email, and then leave the actual work for a human to pick up later.

For my own web app, I wanted something more useful: a live chat that could understand what a visitor needed, qualify the lead, help them book a call, and then push the right information into the tools I already use. The goal was not to build a chatbot for the sake of it. The goal was to make the chat operational.

That is where Composio fit in.

Instead of wiring every integration by hand, I used Composio as the action layer between the LLM-driven chat experience and external tools like Gmail, Slack, Google Sheets, Google Calendar, and WhatsApp. The LLM handles the conversation. The backend decides what actions are allowed. Composio executes those actions against connected accounts.

## The problem

The live chat on my website already had a clear job: help visitors describe what they want to build.

But once a good lead came in, the handoff still needed several manual steps:

- Send myself or the client an email summary.
- Notify Slack so the lead is visible immediately.
- Log the lead into a Google Sheet for tracking.
- Send a WhatsApp follow-up or booking confirmation.
- Create a calendar event when the visitor books a call.

Doing that manually is not difficult once. It becomes messy when the same workflow repeats across different types of leads, booking requests, and project inquiries.

I wanted the system to behave like a lightweight operations assistant:

1. Understand the visitor's intent.
2. Ask for missing details.
3. Confirm before taking important actions.
4. Save the booking or inquiry inside my app.
5. Send the right updates to the right external tools.

## The architecture

The setup has three main layers.

The first layer is the live chat experience on the website. Visitors type naturally, and the chat can answer questions about my services, pricing direction, case studies, and booking availability.

The second layer is the LLM orchestration. The app uses an LLM to interpret the conversation, but the model does not directly get unlimited access to outside systems. It can suggest tool calls, but the backend validates the request before anything happens.

The third layer is Composio. Once the backend decides an action is valid, Composio sends the request to the connected app: Gmail, Slack, Google Sheets, Google Calendar, or WhatsApp.

In simple terms:

```text
Visitor message
  -> Live Chat backend
  -> LLM reasoning and tool selection
  -> backend validation
  -> Composio action
  -> Gmail / Slack / Google Sheets / WhatsApp / Calendar
```

That separation matters. The LLM is good at conversation and interpretation. The backend is responsible for rules, validation, rate limiting, and data safety. Composio is responsible for authenticated third-party actions.

## Connecting the accounts

For each external tool, I created a Composio auth config and connected the account through the admin settings area.

The backend stores the Composio API key, the auth config IDs, the connected account IDs, and optional tool overrides. That gives me flexibility because Composio tool names can vary depending on the connected app or action version.

For example, the booking workflow can use default actions like:

- `GMAIL_SEND_EMAIL`
- `SLACK_SEND_MESSAGE`
- `GOOGLECALENDAR_CREATE_EVENT`
- `WHATSAPP_SEND_MESSAGE`

If a specific Composio dashboard shows a different tool slug, I can override it from settings instead of editing code.

## Making the LLM useful without making it dangerous

The most important design decision was not giving the LLM direct control.

The live chat can collect details and decide that a booking or lead action is appropriate, but the backend still checks the data before the action runs.

For bookings, the backend validates:

- The visitor gave a real name and email.
- The date is in the expected format.
- The time is in the expected format.
- The slot is still available.
- The booking is not a duplicate.

This avoids a common problem with LLM tools: the model may try to be helpful by filling in missing fields. A booking system cannot accept `your@email.com` or `Your Name` just because the model wanted to complete the tool call. The backend blocks obvious placeholder values and tells the chat to ask the visitor for the real information.

## The booking workflow

When the visitor wants to book a call, the chat guides them through the flow:

1. Ask what they want to discuss.
2. Check available dates and times.
3. Ask for name, email, and optional phone number.
4. Confirm the selected slot.
5. Create the booking in the app database.
6. Trigger Composio actions after the booking succeeds.

The key detail is that the booking is saved locally first.

External actions should never be the source of truth. If Slack or Gmail fails for a moment, the booking should still exist. The app treats Composio fan-out as best-effort after the core booking has already been confirmed.

After a successful booking, the system can:

- Send a Gmail notification with the booking summary.
- Post the booking to Slack.
- Create a Google Calendar event.
- Send a WhatsApp message.
- Append the lead or booking details to Google Sheets.

## Gmail notifications

Gmail is useful for rich summaries and client-facing follow-up.

For internal notifications, the email includes the visitor's name, email, phone number, topic, selected date, selected time, and timezone. For client-facing messages, the system can send a branded confirmation email with the call details and rescheduling instructions.

This means a booking is not just stored in the app. It also lands in the inbox in a format that is easy to search, forward, and reply to.

## Slack notifications

Slack is the fast alert channel.

When a booking or strong lead comes in, I want to see it immediately without checking the admin panel. The Slack message is intentionally concise:

- Who contacted me.
- What they need.
- When the call is booked.
- How to contact them.

Slack is not the database. It is the signal.

## Google Sheets logging

Google Sheets is useful as a lightweight pipeline view.

Even when the app has its own database, a sheet gives me a simple way to review leads, filter by source, and share a pipeline view without building a full CRM dashboard.

The live chat can send structured rows through Composio with fields like:

- Date created
- Name
- Email
- Phone
- Project type
- Budget range
- Timeline
- Lead source
- Booking date
- Booking time
- Conversation summary
- Status

The important part is that the LLM does not invent the row structure each time. The backend maps known fields into a predictable payload before Composio sends it to Google Sheets.

## WhatsApp follow-up

WhatsApp is useful because many clients respond faster there than by email.

For bookings, WhatsApp can receive a short confirmation or internal alert. For leads, it can send a quick follow-up prompt, depending on the workflow. I keep WhatsApp messages short because the channel is more personal and immediate than email.

The same rule applies here: the system should only send WhatsApp messages after the visitor has provided the required contact details and the backend has validated the action.

## Why Composio helped

Without Composio, each integration would need its own OAuth setup, token handling, refresh logic, API quirks, and error handling. That is a lot of plumbing for a portfolio/business website.

Composio let me treat external apps as connected tools:

- Gmail for email.
- Slack for team alerts.
- Google Calendar for events.
- Google Sheets for lead tracking.
- WhatsApp for faster follow-up.

My app still owns the business logic, but Composio reduces the integration overhead.

## Error handling

The integration is designed so external failures do not break the user experience.

If a visitor books a call, the booking should succeed as long as the local validation and database write succeed. If a Slack or Gmail action fails afterward, the app logs the error and stores the last failure message in settings so I can debug it from the admin side.

That makes the system more reliable because the visitor-facing workflow is not dependent on every third-party tool being online at that exact moment.

## What I learned

The biggest lesson was that an LLM-powered workflow needs boundaries more than it needs cleverness.

The model is helpful for conversation, summarization, and deciding which workflow fits the visitor's intent. But the app still needs deterministic rules for:

- Required fields
- Date and time formats
- Booking availability
- Duplicate prevention
- Placeholder detection
- Which tools are allowed
- What payload each tool receives

Composio works best when it is part of that controlled system. The LLM should not be treated as an admin user with unlimited access. It should be treated as a reasoning layer that asks the backend to perform specific approved actions.

## The result

The final setup turns the live chat into an action-taking assistant:

- Visitors can ask questions and get relevant answers.
- Qualified leads can be captured from the conversation.
- Bookings can be created directly from chat.
- Gmail receives structured booking or lead summaries.
- Slack gets instant alerts.
- Google Sheets can track leads in a simple pipeline.
- WhatsApp can send fast follow-up messages.

The result is a live chat that does more than talk. It moves work forward.

## Migration notes

Suggested category: `AI & Chatbots` or `Automation`

Suggested excerpt:

> A practical case study on turning a website live chat from a simple conversation widget into an action-taking assistant that can qualify leads, book calls, and notify Gmail, Slack, Google Sheets, and WhatsApp through Composio.

Suggested CTA:

> Want a live chat that can qualify leads, book calls, and push updates into your actual tools? Book a discovery call and I can help you design the workflow.

Potential internal links:

- `/book.html`
- `/contact.html`
- `/projects.html`

