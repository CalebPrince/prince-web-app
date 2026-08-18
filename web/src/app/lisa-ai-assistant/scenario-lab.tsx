"use client";

import * as React from "react";

type ScenarioKey = "booking" | "lead" | "handoff" | "followup";

const TABS: { key: ScenarioKey; n: string; label: string }[] = [
  { key: "booking", n: "01", label: "Book an appointment" },
  { key: "lead", n: "02", label: "Qualify a new lead" },
  { key: "handoff", n: "03", label: "Escalate an urgent issue" },
  { key: "followup", n: "04", label: "Follow up automatically" },
];

// Ported from public/lisa-ai-assistant.html's #scenario-lab (originally
// driven by public/js/lisa-capabilities.js's tab-toggle). Each scenario's
// mockup markup is preserved verbatim per public.
export function ScenarioLab() {
  const [active, setActive] = React.useState<ScenarioKey>("booking");

  return (
    <>
      <div className="reveal scenario-switcher" role="tablist" aria-label="Lisa workflow scenarios">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} className={active === tab.key ? "active" : ""} onClick={() => setActive(tab.key)}>
            <span>{tab.n}</span> {tab.label}
          </button>
        ))}
      </div>

      {active === "booking" && (
        <div className="reveal scenario-stage">
          <div className="scenario-context">
            <span className="scenario-kicker">Clinic · Incoming call</span>
            <h3>A caller needs a Thursday appointment.</h3>
            <p>Lisa checks approved availability, confirms the caller&apos;s details, books the slot, and leaves a clean record for the front desk.</p>
            <ul>
              <li>
                <span>01</span> Understands the request
              </li>
              <li>
                <span>02</span> Checks live availability
              </li>
              <li>
                <span>03</span> Confirms and records the booking
              </li>
            </ul>
          </div>
          <div className="scenario-mockup">
            <header>
              <div>
                <i className="status-dot is-live" />
                <strong>Lisa workflow</strong>
              </div>
              <span>Call · 01:42</span>
            </header>
            <div className="mockup-workspace">
              <div className="mock-conversation">
                <div className="mock-contact">
                  <span>AM</span>
                  <div>
                    <strong>Ama Mensah</strong>
                    <small>Incoming call</small>
                  </div>
                  <em>Live</em>
                </div>
                <div className="speech customer">
                  <small>Caller</small>
                  <p>Can I book a consultation for Thursday morning?</p>
                </div>
                <div className="speech agent">
                  <small>Lisa</small>
                  <p>Yes. I have 10:30 available. Shall I reserve it for you?</p>
                </div>
                <div className="intent-line">
                  <span>Intent</span>
                  <strong>Appointment booking</strong>
                  <em>98% match</em>
                </div>
              </div>
              <div className="mock-tool-panel">
                <div className="tool-panel-title">
                  <span className="tool-g">31</span>
                  <div>
                    <strong>Google Calendar</strong>
                    <small>Thursday, 30 July</small>
                  </div>
                </div>
                <div className="time-slots">
                  <span>
                    09:00 <i>Busy</i>
                  </span>
                  <span className="selected">
                    10:30 <i>Selected</i>
                  </span>
                  <span>
                    11:45 <i>Free</i>
                  </span>
                </div>
                <div className="tool-success">
                  <b>✓</b>
                  <div>
                    <strong>Consultation booked</strong>
                    <small>Ama Mensah · 10:30 GMT</small>
                  </div>
                </div>
                <div className="mini-sync">
                  <span className="tool-c">C</span>
                  <div>
                    <strong>CRM record updated</strong>
                    <small>Appointment added to timeline</small>
                  </div>
                  <em>Done</em>
                </div>
              </div>
            </div>
            <footer>
              <span>
                <b>2</b> tools updated
              </span>
              <span>
                <b>0</b> manual entries
              </span>
              <strong>Completed</strong>
            </footer>
          </div>
        </div>
      )}

      {active === "lead" && (
        <div className="scenario-stage">
          <div className="scenario-context">
            <span className="scenario-kicker">Property business · WhatsApp</span>
            <h3>A new enquiry becomes a useful lead.</h3>
            <p>Lisa asks the questions your sales team needs, records the answers in your CRM, scores the opportunity, and gives the right person the context.</p>
            <ul>
              <li>
                <span>01</span> Captures budget and timeline
              </li>
              <li>
                <span>02</span> Creates the CRM contact
              </li>
              <li>
                <span>03</span> Assigns the best sales owner
              </li>
            </ul>
          </div>
          <div className="scenario-mockup">
            <header>
              <div>
                <i className="status-dot is-live" />
                <strong>Lisa workflow</strong>
              </div>
              <span>WhatsApp · Active</span>
            </header>
            <div className="mockup-workspace">
              <div className="mock-conversation">
                <div className="mock-contact">
                  <span>KO</span>
                  <div>
                    <strong>Kwame Owusu</strong>
                    <small>WhatsApp enquiry</small>
                  </div>
                  <em>New</em>
                </div>
                <div className="speech customer">
                  <small>Customer</small>
                  <p>I need a two-bedroom apartment in East Legon within three months.</p>
                </div>
                <div className="speech agent">
                  <small>Lisa</small>
                  <p>What budget range are you working with, and would you prefer furnished or unfurnished?</p>
                </div>
                <div className="intent-line">
                  <span>Lead status</span>
                  <strong>Qualified buyer</strong>
                  <em>High priority</em>
                </div>
              </div>
              <div className="mock-tool-panel">
                <div className="tool-panel-title">
                  <span className="tool-c">C</span>
                  <div>
                    <strong>CRM · New opportunity</strong>
                    <small>Property sales pipeline</small>
                  </div>
                </div>
                <div className="crm-fields">
                  <div>
                    <span>Area</span>
                    <strong>East Legon</strong>
                  </div>
                  <div>
                    <span>Timeline</span>
                    <strong>Within 3 months</strong>
                  </div>
                  <div>
                    <span>Property</span>
                    <strong>2 bedroom</strong>
                  </div>
                  <div>
                    <span>Stage</span>
                    <strong>Qualified</strong>
                  </div>
                </div>
                <div className="tool-success">
                  <b>✓</b>
                  <div>
                    <strong>Lead assigned to Nana</strong>
                    <small>Conversation summary attached</small>
                  </div>
                </div>
                <div className="mini-sync">
                  <span className="tool-s">S</span>
                  <div>
                    <strong>Posted in #new-leads</strong>
                    <small>Sales team notified with next action</small>
                  </div>
                  <em>Sent</em>
                </div>
              </div>
            </div>
            <footer>
              <span>
                <b>4</b> details captured
              </span>
              <span>
                <b>1</b> owner assigned
              </span>
              <strong>Qualified</strong>
            </footer>
          </div>
        </div>
      )}

      {active === "handoff" && (
        <div className="scenario-stage">
          <div className="scenario-context">
            <span className="scenario-kicker">Customer service · Phone</span>
            <h3>An urgent issue reaches a person with context.</h3>
            <p>Lisa recognizes when automation should stop. She alerts the right team, shares a concise summary, and tells the customer what will happen next.</p>
            <ul>
              <li>
                <span>01</span> Detects urgency and sentiment
              </li>
              <li>
                <span>02</span> Pauses automated replies
              </li>
              <li>
                <span>03</span> Alerts a person on priority channels
              </li>
            </ul>
          </div>
          <div className="scenario-mockup">
            <header>
              <div>
                <i className="status-dot is-warning" />
                <strong>Human handoff</strong>
              </div>
              <span>Priority · High</span>
            </header>
            <div className="mockup-workspace">
              <div className="mock-conversation">
                <div className="mock-contact">
                  <span>EA</span>
                  <div>
                    <strong>Esi Addo</strong>
                    <small>Existing customer · Phone</small>
                  </div>
                  <em>Urgent</em>
                </div>
                <div className="speech customer">
                  <small>Customer</small>
                  <p>My payment went through twice and I need someone to check it today.</p>
                </div>
                <div className="speech agent">
                  <small>Lisa</small>
                  <p>I have marked this as urgent and alerted the accounts team with your transaction details.</p>
                </div>
                <div className="intent-line warning">
                  <span>Decision</span>
                  <strong>Human review required</strong>
                  <em>Automation paused</em>
                </div>
              </div>
              <div className="mock-tool-panel">
                <div className="tool-panel-title">
                  <span className="tool-s">S</span>
                  <div>
                    <strong>Slack · #accounts-urgent</strong>
                    <small>Priority handoff</small>
                  </div>
                </div>
                <div className="slack-message">
                  <strong>Lisa</strong>
                  <time>Just now</time>
                  <p>
                    <b>Duplicate payment reported</b>
                    <br />
                    Esi Addo needs an accounts review today. Transaction reference and call summary are attached.
                  </p>
                  <span>@Kofi assigned</span>
                </div>
                <div className="tool-success amber">
                  <b>!</b>
                  <div>
                    <strong>Owner acknowledged</strong>
                    <small>Expected response within 15 minutes</small>
                  </div>
                </div>
                <div className="mini-sync">
                  <span className="tool-m">@</span>
                  <div>
                    <strong>Email alert delivered</strong>
                    <small>Backup notification sent to accounts</small>
                  </div>
                  <em>Sent</em>
                </div>
              </div>
            </div>
            <footer>
              <span>
                <b>1</b> owner assigned
              </span>
              <span>
                <b>2</b> alerts delivered
              </span>
              <strong className="status-review">In review</strong>
            </footer>
          </div>
        </div>
      )}

      {active === "followup" && (
        <div className="scenario-stage">
          <div className="scenario-context">
            <span className="scenario-kicker">Professional services · CRM</span>
            <h3>No reply does not mean the lead is forgotten.</h3>
            <p>Lisa follows the timing and tone you approve, personalizes the message from the CRM record, and stops immediately when the customer replies.</p>
            <ul>
              <li>
                <span>01</span> Watches the approved schedule
              </li>
              <li>
                <span>02</span> Sends a relevant message
              </li>
              <li>
                <span>03</span> Records replies and next actions
              </li>
            </ul>
          </div>
          <div className="scenario-mockup">
            <header>
              <div>
                <i className="status-dot is-live" />
                <strong>Follow-up sequence</strong>
              </div>
              <span>Day 3 · Step 2</span>
            </header>
            <div className="mockup-workspace">
              <div className="mock-conversation">
                <div className="mock-contact">
                  <span>YA</span>
                  <div>
                    <strong>Yaw Asante</strong>
                    <small>Website proposal</small>
                  </div>
                  <em>Open</em>
                </div>
                <div className="follow-timeline">
                  <div className="done">
                    <i>✓</i>
                    <span>
                      <strong>Proposal sent</strong>
                      <small>Monday · 09:15</small>
                    </span>
                  </div>
                  <div className="active">
                    <i>2</i>
                    <span>
                      <strong>Helpful follow-up</strong>
                      <small>Today · Ready</small>
                    </span>
                  </div>
                  <div>
                    <i>3</i>
                    <span>
                      <strong>Final check-in</strong>
                      <small>Only if no reply</small>
                    </span>
                  </div>
                </div>
              </div>
              <div className="mock-tool-panel">
                <div className="tool-panel-title">
                  <span className="tool-m">@</span>
                  <div>
                    <strong>Email draft</strong>
                    <small>Personalized from CRM context</small>
                  </div>
                </div>
                <div className="email-preview">
                  <span>To: Yaw Asante</span>
                  <strong>One detail that may help with your website decision</strong>
                  <p>Hi Yaw, I wanted to clarify the handover and support included in the proposal you received...</p>
                </div>
                <div className="tool-success">
                  <b>✓</b>
                  <div>
                    <strong>Scheduled for 09:30</strong>
                    <small>Sequence stops automatically on reply</small>
                  </div>
                </div>
                <div className="mini-sync">
                  <span className="tool-c">C</span>
                  <div>
                    <strong>CRM timeline updated</strong>
                    <small>Next action and message recorded</small>
                  </div>
                  <em>Done</em>
                </div>
              </div>
            </div>
            <footer>
              <span>
                <b>1</b> message ready
              </span>
              <span>
                <b>3</b> safeguards active
              </span>
              <strong>Scheduled</strong>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
