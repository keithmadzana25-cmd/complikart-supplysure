import { useMemo, useState, type FormEvent } from "react";
import "./supplysure.css";

type Plan = {
  id: string;
  ingredient: string;
  requested: number;
  estimate: number;
  confirmed: number;
  delivered: number;
  proposed: number;
  qualityNotes: string;
  unit: string;
  collective: string;
  needBy: string;
  stage: number;
};

const stages = ["Demand published", "Estimate shared", "Confirmed", "Harvested", "Dispatched", "Received"];
const initialPlans: Plan[] = [
  { id: "SS-104", ingredient: "Toor dal", requested: 1200, estimate: 980, confirmed: 760, delivered: 0, proposed: 980, qualityNotes: "Cleaned, food-grade", unit: "kg", collective: "Sahyadri Pulses FPO", needBy: "12 Nov 2026", stage: 1 },
  { id: "SS-103", ingredient: "Ragi flour", requested: 800, estimate: 500, confirmed: 0, delivered: 0, proposed: 500, qualityNotes: "Fine grind", unit: "kg", collective: "Green Mill Co-op", needBy: "18 Nov 2026", stage: 1 },
  { id: "SS-102", ingredient: "Groundnut", requested: 650, estimate: 700, confirmed: 650, delivered: 0, proposed: 650, qualityNotes: "Harvest lot with origin details", unit: "kg", collective: "Deccan Growers Collective", needBy: "22 Nov 2026", stage: 2 },
];

const prettyDate = (value: string) => {
  if (!value.includes("-")) return value;
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export function SupplySure({ inform }: { inform: (message: string) => void }): React.JSX.Element {
  const [plans, setPlans] = useState(initialPlans);
  const [selectedId, setSelectedId] = useState(initialPlans[0]!.id);
  const [showCreate, setShowCreate] = useState(false);
  const [ingredient, setIngredient] = useState("");
  const [requested, setRequested] = useState("");
  const [needBy, setNeedBy] = useState("");
  const [quality, setQuality] = useState("");
  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0]!;
  const totalRequested = plans.reduce((sum, plan) => sum + plan.requested, 0);
  const totalConfirmed = plans.reduce((sum, plan) => sum + plan.confirmed, 0);
  const coverage = totalRequested ? Math.round((totalConfirmed / totalRequested) * 100) : 0;
  const gapPlans = plans.filter((plan) => plan.requested > plan.confirmed).length;
  const shortfallRows = useMemo(() => plans.filter((plan) => plan.requested > plan.confirmed), [plans]);

  function advancePlan(id: string) {
    setPlans((current) => current.map((plan) => {
      if (plan.id !== id || plan.stage >= stages.length - 1) return plan;
      const stage = plan.stage + 1;
      return {
        ...plan,
        stage,
        estimate: stage >= 1 ? Math.max(plan.estimate, plan.proposed) : plan.estimate,
        confirmed: stage >= 2 ? Math.max(plan.confirmed, plan.proposed) : plan.confirmed,
        delivered: stage >= 5 ? plan.confirmed || plan.proposed : plan.delivered,
      };
    }));
    const next = Math.min(selected.stage + 1, stages.length - 1);
    inform(`Demo event recorded: ${stages[next]}. This did not notify a collective.`);
  }

  function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = `SS-${Math.floor(100 + Math.random() * 900)}`;
    const plan: Plan = { id, ingredient: ingredient.trim(), requested: Number(requested), estimate: 0, confirmed: 0, delivered: 0, proposed: 0, qualityNotes: quality.trim() || "No quality note added", unit: "kg", collective: "Awaiting collective response", needBy: prettyDate(needBy), stage: 0 };
    setPlans((current) => [plan, ...current]);
    setSelectedId(id);
    setShowCreate(false);
    setIngredient(""); setRequested(""); setNeedBy(""); setQuality("");
    inform("Demand plan added to this browser demo only.");
  }

  return <div className="ss-page">
    <div className="ss-demo-note"><span className="ss-demo-dot" /><div><b>Illustrative local demo</b><span>Sample supply plans are fictional. Changes stay in this browser; no collective is contacted and no AI forecast is running.</span></div></div>

    <section className="ss-intro">
      <div><div className="ss-eyebrow">SUPPLYSURE  /  DEMAND TO DELIVERY</div><h2>Know the gap before it reaches production.</h2><p>Track what you need, what a collective estimates, what gets confirmed, and what finally arrives.</p></div>
      <button className="primary" onClick={() => setShowCreate(true)}><span>＋</span> New demand plan</button>
    </section>

    <section className="ss-metrics" aria-label="Supply plan summary">
      <article className="ss-metric"><span>OPEN DEMAND PLANS</span><strong>{plans.length}</strong><small>Across this sample workspace</small></article>
      <article className="ss-metric"><span>CONFIRMED COVERAGE</span><strong>{coverage}<i>%</i></strong><div className="ss-progress"><span style={{ width: `${coverage}%` }} /></div><small>{totalConfirmed.toLocaleString("en-IN")} of {totalRequested.toLocaleString("en-IN")} kg requested</small></article>
      <article className="ss-metric ss-metric-alert"><span>PLANS WITH A GAP</span><strong>{gapPlans}</strong><small>Rule-based: requested exceeds confirmed</small></article>
    </section>

    <section className="ss-watch">
      <div className="ss-watch-mark">!</div><div className="ss-watch-copy"><span>SHORTFALL WATCH · RULE-BASED</span><b>{shortfallRows.length ? `${shortfallRows.length} plan${shortfallRows.length === 1 ? "" : "s"} still need confirmed supply` : "All sample demand is covered"}</b><small>{shortfallRows.slice(0, 2).map((plan) => `${plan.ingredient}: ${(plan.requested - plan.confirmed).toLocaleString("en-IN")} kg gap`).join("  ·  ") || "This is a transparent quantity comparison, not an AI prediction."}</small></div><button onClick={() => setSelectedId(shortfallRows[0]?.id ?? selectedId)}>Review gap <span>→</span></button>
    </section>

    <div className="ss-layout">
      <section className="ss-panel ss-plan-panel">
        <div className="ss-panel-heading"><div><span>PROCUREMENT BOARD</span><h3>Demand plans</h3></div><small>{plans.length} sample records</small></div>
        <div className="ss-table-wrap"><table className="ss-table"><thead><tr><th>INGREDIENT</th><th>REQUESTED</th><th>CONFIRMED</th><th>NEED BY</th><th>COVERAGE</th></tr></thead><tbody>
          {plans.map((plan) => {
            const gap = Math.max(0, plan.requested - plan.confirmed);
            const isSelected = selected.id === plan.id;
            return <tr key={plan.id} className={isSelected ? "ss-row-selected" : ""} onClick={() => setSelectedId(plan.id)}>
              <td><b>{plan.ingredient}</b><small>{plan.collective}</small></td><td>{plan.requested.toLocaleString("en-IN")} kg</td><td>{plan.confirmed.toLocaleString("en-IN")} kg</td><td>{plan.needBy}</td><td><span className={`ss-status ${gap ? "ss-status-gap" : "ss-status-covered"}`}>{gap ? `${gap.toLocaleString("en-IN")} kg gap` : "Covered"}</span></td>
            </tr>;
          })}
        </tbody></table></div>
        <div className="ss-board-foot"><span>Gap = requested quantity − confirmed quantity</span><span>Source: fictional demo records</span></div>
      </section>

      <aside className="ss-panel ss-detail">
        <div className="ss-panel-heading"><div><span>SELECTED COMMITMENT</span><h3>{selected.ingredient}</h3></div><code>{selected.id}</code></div>
        <div className="ss-detail-line"><span>Need by</span><b>{selected.needBy}</b></div>
        <div className="ss-detail-line"><span>Collective</span><b>{selected.collective}</b></div>
        <div className="ss-detail-line"><span>Quality notes</span><b>{selected.qualityNotes}</b></div>
        <div className="ss-qty-block"><div><span>Requested</span><b>{selected.requested.toLocaleString("en-IN")} kg</b></div><div><span>Confirmed</span><b>{selected.confirmed.toLocaleString("en-IN")} kg</b></div></div>
        <div className="ss-stage-head"><span>COMMITMENT TIMELINE</span><span>{selected.stage + 1} / {stages.length}</span></div>
        <ol className="ss-stages">{stages.map((stage, index) => <li key={stage} className={index < selected.stage ? "ss-stage-done" : index === selected.stage ? "ss-stage-current" : ""}><span>{index < selected.stage ? "✓" : index + 1}</span><div><b>{stage}</b>{index === selected.stage && <small>Current demo milestone</small>}</div></li>)}</ol>
        <button className="ss-advance" onClick={() => advancePlan(selected.id)} disabled={selected.stage >= stages.length - 1}>{selected.stage >= stages.length - 1 ? "Receipt recorded" : `Advance demo event · ${stages[Math.min(selected.stage + 1, stages.length - 1)]}`} <span>→</span></button>
        <p className="ss-detail-foot">Demo control only. Event changes are temporary and are not saved to the API.</p>
      </aside>
    </div>

    {showCreate && <div className="overlay" onClick={() => setShowCreate(false)}><form className="modal ss-modal" onSubmit={createPlan} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowCreate(false)} aria-label="Close">×</button><div className="modal-kicker">SUPPLYSURE · DEMO</div><h2>Create a demand plan</h2><p>Record what your business needs. This local demo does not publish it to a collective.</p><label>Ingredient<input value={ingredient} onChange={(event) => setIngredient(event.target.value)} required maxLength={80} placeholder="e.g. chickpeas" /></label><label>Required quantity<div className="input-unit"><input type="number" min="1" step="1" value={requested} onChange={(event) => setRequested(event.target.value)} required /><span>kg</span></div></label><label>Need by<input type="date" value={needBy} onChange={(event) => setNeedBy(event.target.value)} required /></label><label>Quality or grade notes <span className="ss-optional">optional</span><input value={quality} onChange={(event) => setQuality(event.target.value)} maxLength={160} placeholder="e.g. cleaned, food-grade" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary" type="submit">Add sample plan <span>→</span></button></div></form></div>}
  </div>;
}
