import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { SupplySure } from "./SupplySure";
import "./demo-entry.css";
import "./style.css";

type Batch = { code: string; product: string; category: string; date: string; quantity: string; status: "On track" | "Review" | "Expiring soon" };
const seed: Batch[] = [
  { code: "CK-261021-7F3A92B1", product: "Ragi Millet Crisps", category: "Snacks", date: "21 Oct 2026", quantity: "240 packs", status: "On track" },
  { code: "CK-261020-2B8D114C", product: "Cold-Pressed Groundnut Oil", category: "Edible oils", date: "20 Oct 2026", quantity: "86 bottles", status: "Review" },
  { code: "CK-261018-A94C601D", product: "Mango Chutney", category: "Condiments", date: "18 Oct 2026", quantity: "120 jars", status: "On track" },
  { code: "CK-261015-66D0E193", product: "Ragi Millet Crisps", category: "Snacks", date: "15 Oct 2026", quantity: "180 packs", status: "Expiring soon" },
];
const navigation = ["Overview", "SupplySure", "Products & labels", "Traceability", "Suppliers", "Documents"];

type SessionUser = { id: string; name: string; email: string; licenseType: string };
type Session = { token: string; user: SessionUser };

function AuthScreen({ onAuthenticated, onDemo }: { onAuthenticated: (session: Session) => void; onDemo: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [license, setLicense] = useState("");
  const [licenseType, setLicenseType] = useState("Basic Registration");
  const [turnover, setTurnover] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const payload = mode === "login"
      ? { identifier, password }
      : { name, phone, email, password, fssai_license_number: license, license_type: licenseType, turnover: Number(turnover) };
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { data?: Session; error?: { message?: string } };
      if (!response.ok || !result.data?.token || !result.data.user) throw new Error(result.error?.message || "We couldn’t complete that request. Please try again.");
      onAuthenticated(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not connect to CompliKart. Check that the app services are running.");
    } finally { setBusy(false); }
  }

  return <div className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark">c<span>✓</span></span><span>complikart<small>FOOD COMPLIANCE, SIMPLIFIED</small></span></div>
      <div className="auth-kicker">YOUR COMPLIANCE WORKSPACE</div>
      <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="auth-intro">{mode === "login" ? "Sign in to continue to your food business workspace." : "Set up your account to organise your food business records."}</p>
      <div className="auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Sign in</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Create account</button></div>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && <>
          <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} placeholder="e.g. Ananya Kumar" /></label>
          <div className="auth-row"><label>Phone number<input autoComplete="tel" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={8} maxLength={20} placeholder="+91 98765 43210" /></label><label>Email address<input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@business.in" /></label></div>
          <label>FSSAI license or registration number<input value={license} onChange={(event) => setLicense(event.target.value)} required maxLength={100} placeholder="Enter your number" /></label>
          <div className="auth-row"><label>License type<select value={licenseType} onChange={(event) => setLicenseType(event.target.value)}><option>Basic Registration</option><option>State License</option><option>Central License</option></select></label><label>Annual turnover (₹)<input type="number" min="0" step="0.01" value={turnover} onChange={(event) => setTurnover(event.target.value)} required placeholder="e.g. 800000" /></label></div>
        </>}
        {mode === "login" && <label>Email or phone number<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required placeholder="you@business.in or phone" /></label>}
        <label>Password<input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 10 : 1} maxLength={128} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in to workspace" : "Create account"}<span>→</span></button>
      </form>
      <div className="demo-entry"><span>Just looking around?</span><button type="button" onClick={onDemo}>Enter the local sample workspace <span>→</span></button><small>No account needed. Demo changes stay in this browser tab.</small></div>
      <p className="auth-footnote">Your password is stored as a secure hash. Demo workspace records are illustrative sample data.</p>
    </section>
    <div className="auth-aside"><div className="auth-orbit orbit-one"/><div className="auth-orbit orbit-two"/><span className="auth-aside-mark">c✓</span><div className="auth-aside-copy"><div>MADE FOR INDIA’S FOOD BUSINESSES</div><h2>Good records make<br/>good food safer.</h2><p>Bring your production, traceability and compliance work into one calm workspace.</p></div><span className="auth-aside-note">COMPLIKART · LOCAL DEMO</span></div>
  </div>;
}

function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [active, setActive] = useState("Overview");
  const [batches, setBatches] = useState(seed);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [product, setProduct] = useState("Ragi Millet Crisps");
  const [quantity, setQuantity] = useState("100");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState(seed[0]!.code);
  useEffect(() => {
    const token = localStorage.getItem("complikart-token");
    if (!token) { setAuthChecked(true); return; }
    fetch("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const result = await response.json() as { data?: { user: SessionUser } };
        if (!response.ok || !result.data?.user) throw new Error("Session expired");
        setSession({ token, user: result.data.user });
      })
      .catch(() => localStorage.removeItem("complikart-token"))
      .finally(() => setAuthChecked(true));
  }, []);
  function establishSession(next: Session) { localStorage.setItem("complikart-token", next.token); setSession(next); }
  function signOut() { localStorage.removeItem("complikart-token"); setSession(null); }
  const filtered = useMemo(() => batches.filter((b) => (b.code + b.product + b.category).toLowerCase().includes(query.toLowerCase())), [batches, query]);
  const current = batches.find((b) => b.code === selected) ?? batches[0]!;
  const title: Record<string, string> = { Overview: `Good morning, ${session?.user.name.split(/\s+/)[0] ?? "there"}`, SupplySure: "SupplySure · plan with confidence", "Products & labels": "Products & labels", Traceability: "Every batch. Every step.", Suppliers: "Your supply network", Documents: "Compliance documents" };
  const inform = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  function createBatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = "CK-261021-" + Math.random().toString(16).slice(2, 10).toUpperCase();
    const fresh: Batch = { code, product, category: product.includes("Oil") ? "Edible oils" : "Snacks", date: "21 Oct 2026", quantity: quantity + " units", status: "On track" };
    setBatches((all) => [fresh, ...all]); setSelected(code); setShowModal(false); setActive("Overview"); inform("Batch created and added to your traceability record.");
  }
  if (!authChecked) return <div className="auth-loading">Loading your workspace…</div>;
  if (!session) return <AuthScreen onAuthenticated={establishSession} onDemo={() => setSession({ token: "", user: { id: "local-demo", name: "Demo Processor", email: "demo@complikart.local", licenseType: "Sample workspace" } })} />;
  const initials = session.user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">c<span>✓</span></span><span>complikart<small>FOOD COMPLIANCE, SIMPLIFIED</small></span></div>
      <div className="workspace"><div className="workspace-avatar">{initials}</div><span><b>{session.user.name}'s workspace</b><small>{session.user.licenseType}</small></span><span className="chevron">⌄</span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{navigation.map((item, i) => <button key={item} className={"nav-item " + (active === item ? "selected" : "")} onClick={() => setActive(item)}><span className="nav-icon">{["▦", "↗", "▤", "⌘", "♧", "▧"][i]}</span>{item}{item === "Documents" && <span className="nav-count">3</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="upgrade"><span className="spark">✦</span><b>Stay ahead of every rule</b><p>Your next compliance review is ready to explore.</p><button onClick={() => inform("Your compliance review is up to date.")}>View compliance review <span>↗</span></button></div><button className="nav-item help" onClick={() => inform("Help centre: support@complikart.in")}><span className="nav-icon">?</span>Help &amp; support</button><div className="profile"><div className="profile-avatar">{initials}</div><span><b>{session.user.name}</b><small>Workspace owner</small></span><button className="signout-mini" onClick={signOut} aria-label="Sign out" title="Sign out">↪</button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{active}</b></div><div className="top-actions"><label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search batches, products..." /><kbd>⌘ K</kbd></label><button className="icon-button" onClick={() => inform("You’re all caught up.")}>♧<i /></button><div className="top-avatar">{initials}</div></div></header>
      <div className="content">
        <div className="headline"><div><div className="eyebrow">THURSDAY, 23 OCTOBER 2026 <span className="live-dot" /> DEMO WORKSPACE</div><h1>{title[active]}{active === "Overview" && <span className="wave">✳</span>}</h1><p>{active === "Overview" ? "A clearer view of what’s ready, and what needs your attention." : active === "SupplySure" ? "Connect processor demand to collective commitments and batch evidence." : "Your food business records, together in one place."}</p></div>{active !== "SupplySure" && <button className="primary" onClick={() => setShowModal(true)}><span>＋</span> Create batch</button>}</div>
        {active === "SupplySure" ? <SupplySure inform={inform} /> : <>
        <section className="status-banner"><div className="status-icon">✓</div><div className="status-copy"><b>Your business is building a strong compliance record</b><span>3 of 4 key areas are in good shape. One item needs a quick review.</span></div><button onClick={() => setActive("Documents")}>See what’s next <span>→</span></button><div className="banner-decoration">✳</div></section>
        <section className="metrics">
          <article className="metric-card"><div className="metric-top"><span>READINESS SCORE · SAMPLE</span><span className="metric-symbol green">◉</span></div><div className="score-line"><strong>82<span>%</span></strong><span className="trend">↗ 8% <i>this month</i></span></div><div className="progress"><span style={{ width: "82%" }} /></div><div className="metric-foot">Illustrative only <span>Based on 12 sample checks</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>ACTIVE PRODUCTS</span><span className="metric-symbol violet">◇</span></div><div className="score-line"><strong>6</strong><span className="trend">+2 <i>this month</i></span></div><div className="metric-foot">Across 4 categories <span className="tiny-link" onClick={() => setActive("Products & labels")}>View products →</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>TRACKED BATCHES</span><span className="metric-symbol blue">⌘</span></div><div className="score-line"><strong>{batches.length + 18}</strong><span className="trend">+4 <i>this week</i></span></div><div className="metric-foot">Full traceability records <span className="tiny-link" onClick={() => setActive("Traceability")}>Explore chain →</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>UPCOMING ACTIONS</span><span className="metric-symbol amber">◷</span></div><div className="score-line"><strong>2</strong><span className="due-chip">1 due soon</span></div><div className="metric-foot">Next due in 4 days <span className="tiny-link" onClick={() => setActive("Documents")}>Review actions →</span></div></article>
        </section>
        <div className="section-heading"><div><h2>{active === "Traceability" ? "Batch traceability" : active === "Suppliers" ? "Trusted suppliers" : active === "Documents" ? "Your documents" : active === "Products & labels" ? "Your products" : "Recent batches"}</h2><p>{active === "Traceability" ? "Follow product movement from source to shelf." : "Your latest production, with the details that matter."}</p></div><button className="text-button" onClick={() => setActive(active === "Traceability" ? "Overview" : "Traceability")}>{active === "Traceability" ? "← Back to overview" : "View traceability"} <span>→</span></button></div>
        <div className="dashboard-grid">
          <section className="panel batch-panel"><div className="panel-tabs"><button className="tab active" onClick={() => setQuery("")}>All batches <span>{batches.length}</span></button><button className="tab" onClick={() => setQuery("On track")}>On track</button><button className="tab" onClick={() => setQuery("Review")}>Needs review</button><button className="filter" onClick={() => setQuery("")}>☷ <span>Reset</span></button></div><div className="table-scroll"><table><thead><tr><th>PRODUCT / BATCH</th><th>PRODUCED</th><th>QUANTITY</th><th>STATUS</th><th /></tr></thead><tbody>{filtered.map((item) => <tr key={item.code} onClick={() => { setSelected(item.code); setActive("Traceability"); }}><td><div className="product-cell"><span className={"product-thumb " + (item.category === "Edible oils" ? "oil" : item.category === "Condiments" ? "mango" : "grain")}>{item.category === "Edible oils" ? "◉" : item.category === "Condiments" ? "◒" : "✦"}</span><span><b>{item.product}</b><small>{item.code}</small></span></div></td><td>{item.date}</td><td>{item.quantity}</td><td><span className={"badge " + (item.status === "On track" ? "good" : item.status === "Review" ? "review" : "expiring")}><i />{item.status}</span></td><td className="row-arrow">↗</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">No matching batches. Try another search.</div>}</div><div className="table-footer">Showing <b>{filtered.length}</b> of <b>{batches.length}</b> recent batches<button onClick={() => setActive("Traceability")}>See all batches <span>→</span></button></div></section>
          <section className="panel chain-panel"><div className="chain-header"><div><div className="chain-label"><span className="chain-live" /> LIVE TRACEABILITY</div><h3>Supply chain journey</h3></div><button className="more" onClick={() => inform("Batch " + current.code + " is selected.")}>···</button></div><div className="selected-product"><div className="product-thumb grain big">✦</div><div><b>{current.product}</b><small>{current.code}</small></div><span className="badge good compact"><i />Tracked</span></div><div className="timeline"><div className="event done"><span className="event-pin">✓</span><div><div className="event-top"><b>Harvested</b><time>18 Oct · 06:32</time></div><p>Sunrise Farms <span>·</span> Nashik, Maharashtra</p></div></div><div className="event done"><span className="event-pin">✓</span><div><div className="event-top"><b>First land receiving</b><time>19 Oct · 10:15</time></div><p>Ananya Foods <span>·</span> Pune, Maharashtra</p></div></div><div className="event done"><span className="event-pin">✓</span><div><div className="event-top"><b>Initial packing</b><time>21 Oct · 09:40</time></div><p>Production unit <span>·</span> Pune, Maharashtra</p></div></div><div className="event upcoming"><span className="event-pin">4</span><div><div className="event-top"><b>Ready for shipping</b><span className="next-chip">NEXT STEP</span></div><p>Record your first dispatch</p></div></div></div><button className="chain-cta" onClick={() => { setActive("Traceability"); inform("Full traceability record opened."); }}>Open full traceability record <span>→</span></button></section>
        </div>
        <section className="bottom-grid"><div className="panel actions-panel"><div className="section-heading inner"><div><h2>Needs your attention</h2><p>Two small steps to stay on track.</p></div><button className="text-button" onClick={() => setActive("Documents")}>See all <span>→</span></button></div><div className="action-row"><span className="action-icon amber-bg">!</span><div><b>Review oil label nutrition values</b><small>Cold-Pressed Groundnut Oil <span>·</span> 4 days left</small></div><button onClick={() => inform("Label review opened in this demo.")}>Review <span>→</span></button></div><div className="action-row"><span className="action-icon blue-bg">↻</span><div><b>Renew your FSSAI registration</b><small>Registration expires 14 Nov 2026 <span>·</span> 24 days left</small></div><button onClick={() => inform("Renewal checklist opened in this demo.")}>View checklist <span>→</span></button></div></div><div className="panel supplier-panel"><div className="supplier-title"><div><div className="chain-label">YOUR NETWORK</div><h3>Connected suppliers</h3></div><button className="text-button" onClick={() => setActive("Suppliers")}>See all →</button></div><div className="supplier-row"><span className="supplier-avatar farm">SF</span><span><b>Sunrise Farms</b><small>Produce · Nashik</small></span><span className="verified">✓ Verified</span></div><div className="supplier-row"><span className="supplier-avatar mill">GM</span><span><b>Green Mill Co-op</b><small>Grains · Satara</small></span><span className="verified">✓ Verified</span></div><button className="invite" onClick={() => inform("Supplier invitation link copied.")}>＋ Invite a supplier</button></div></section>
        <footer><span>CompliKart <i>·</i> Built for India’s food businesses</span><span>DEMO DATA <i>·</i> Illustrative, not an official FSSAI assessment</span></footer>
        </>}
      </div>
    </main>
    {showModal && <div className="overlay" onClick={() => setShowModal(false)}><form className="modal" onSubmit={createBatch} onClick={(e) => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowModal(false)}>×</button><div className="modal-kicker">PRODUCTION RECORD</div><h2>Create a batch</h2><p>Start a traceable record for your next production run.</p><label>Product<select value={product} onChange={(e) => setProduct(e.target.value)}><option>Ragi Millet Crisps</option><option>Cold-Pressed Groundnut Oil</option><option>Mango Chutney</option></select></label><label>Quantity produced<div className="input-unit"><input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required/><span>units</span></div></label><div className="batch-preview"><span>Auto-generated lot code</span><b>CK-261021-XXXXXXXX</b></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="primary" type="submit">Create batch <span>→</span></button></div></form></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
