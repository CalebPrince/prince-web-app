/**
 * The Elon POS hero slide's right-hand panel: a laptop showing the Elon POS
 * dashboard and a phone beside it showing a customer chat, both drawn in
 * code. Every figure is sample content in cedis: each business sets up its
 * own dashboard, so this is a mockup of the product, not anyone's real
 * account.
 *
 * The whole scene is sized in em off its own width (`.epx` sets
 * `container-type: inline-size`, `.epx-stage` sets 1em to 1/64 of it), so it
 * scales as one picture from a phone to a wide screen. Styles live in
 * globals.css under "Elon POS hero mockup".
 */
const STATS = [
  { label: "Total sales", value: "GH¢ 42,560.00", change: "+12.5%" },
  { label: "Orders", value: "128", change: "+8.3%" },
  { label: "Profit", value: "GH¢ 15,230.00", change: "+15.2%" },
  { label: "Paid by MoMo", value: "GH¢ 8,940.00", change: "+9.1%" },
];

const CHATS = [
  { name: "Ama O.", text: "2 bags of rice, delivery to Tema", amount: "GH¢ 1,640.00", time: "10:42" },
  { name: "Kwesi B.", text: "Is cooking oil 5 L in stock?", amount: "", time: "10:38" },
  { name: "Efua M.", text: "Paid for order #231, thank you", amount: "GH¢ 780.00", time: "10:15" },
];

const SALES = [
  { item: "Rice, 50 kg bag", who: "Cash", amount: "GH¢ 820.00" },
  { item: "Cooking oil, 5 L", who: "Mobile Money", amount: "GH¢ 560.00" },
  { item: "Sugar, 1 kg x 12", who: "Card", amount: "GH¢ 210.00" },
];

// a smooth rising sales line for the chart, in the chart's own 100 x 40 box
const LINE = "M0 34 C8 31 12 33 18 28 S28 27 34 22 S44 24 50 18 S62 17 68 13 S80 12 86 8 S96 5 100 3";

export function ElonPosHeroMockup() {
  return (
    <div className="epx rise" style={{ animationDelay: "0.3s" }} role="img"
      aria-label="Elon POS on a laptop and a phone: the sales dashboard in cedis, WhatsApp orders, and a customer chat with a payment alert">
      <div className="epx-stage" aria-hidden="true">
        {/* the laptop */}
        <div className="epx-laptop">
          <div className="epx-lid">
            <div className="epx-screen">
              <div className="epx-top">
                <img src="/images/elonpos-mark.png" alt="" className="epx-mark" />
                <span className="epx-brand">Elon POS</span>
                <span className="epx-top-title">Dashboard</span>
                <span className="epx-date">Today</span>
              </div>
              <div className="epx-body">
                <div className="epx-side">
                  {["Dashboard", "Sales", "Stock", "Staff", "Reports"].map((n, i) => (
                    <span key={n} className={i === 0 ? "epx-nav epx-nav-on" : "epx-nav"}><i />{n}</span>
                  ))}
                </div>
                <div className="epx-main">
                  <div className="epx-stats">
                    {STATS.map((s) => (
                      <div key={s.label} className="epx-card epx-stat">
                        <span className="epx-k">{s.label}</span>
                        <span className="epx-v">{s.value}</span>
                        <span className="epx-up">{s.change}</span>
                      </div>
                    ))}
                  </div>
                  <div className="epx-row">
                    <div className="epx-card epx-chart">
                      <span className="epx-h">Sales overview</span>
                      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="epx-svg">
                        <defs>
                          <linearGradient id="epx-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#055EED" stopOpacity=".28" />
                            <stop offset="1" stopColor="#055EED" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {[10, 20, 30].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#E3E8F2" strokeWidth=".4" />)}
                        <path d={`${LINE} L100 40 L0 40 Z`} fill="url(#epx-fill)" />
                        <path d={LINE} fill="none" stroke="#055EED" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                      </svg>
                      <div className="epx-sales">
                        {SALES.map((s) => (
                          <span key={s.item} className="epx-sale"><b>{s.item}</b><em>{s.who}</em><strong>{s.amount}</strong></span>
                        ))}
                      </div>
                    </div>
                    <div className="epx-card epx-chats">
                      <span className="epx-h">WhatsApp orders <em className="epx-live">3 new</em></span>
                      {CHATS.map((c) => (
                        <span key={c.name} className="epx-chat">
                          <i className="epx-av">{c.name[0]}</i>
                          <span className="epx-chat-t"><b>{c.name}</b><em>{c.text}</em></span>
                          <span className="epx-chat-r"><em>{c.time}</em>{c.amount && <strong>{c.amount}</strong>}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="epx-base" />
        </div>

        {/* the phone: a customer chat that ends in a payment */}
        <div className="epx-phone">
          <div className="epx-pscreen">
            <div className="epx-island" />
            <div className="epx-phead">
              <img src="/images/elonpos-mark.png" alt="" className="epx-pmark" />
              <span><b>Elon POS Assistant</b><em>online</em></span>
            </div>
            <div className="epx-thread">
              <span className="epx-msg epx-in">Hello, do you have rice in stock?</span>
              <span className="epx-msg epx-out">Yes, 24 bags left. GH¢ 820.00 each. Shall I reserve 2 for you?</span>
              <span className="epx-msg epx-in">Yes please, I&rsquo;ll pay by MoMo</span>
              <span className="epx-pay">
                <i>&#10003;</i>
                <span><b>Payment received</b><strong>GH¢ 1,640.00</strong><em>Mobile Money · Order #232</em></span>
              </span>
              <span className="epx-msg epx-out">Thank you! Your order is on its way.</span>
            </div>
            <div className="epx-compose">
              <span className="epx-input">Type a message</span>
              <span className="epx-send">
                <svg viewBox="0 0 24 24"><path d="M3 11.5 20 4l-6.5 17-2.8-7.2z" fill="#fff" /></svg>
              </span>
            </div>
          </div>
        </div>

        {/* the alerts, popping up over the devices one after another */}
        <div className="epx-toast epx-toast-1">
          <img src="/images/elonpos-mark.png" alt="" />
          <span><em>Elon POS · now</em><b>Payment received</b><strong>GH¢ 1,250.00</strong></span>
        </div>
        <div className="epx-toast epx-toast-2">
          <img src="/images/whatsapp-logo.svg" alt="" />
          <span><em>WhatsApp · now</em><b>New order from Ama O.</b><strong>GH¢ 1,640.00</strong></span>
        </div>
        <div className="epx-toast epx-toast-3">
          <i>!</i>
          <span><em>Elon POS · stock</em><b>Low stock: Sugar, 1 kg</b><strong>6 left, reorder now</strong></span>
        </div>
      </div>
    </div>
  );
}
