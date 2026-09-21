import type { Citation } from "../lib/answer";

// Template-styled answer block: .ablock > .atext + .cites + .ameta.
// Renders citations with visible score + answer latency in ms.
export default function AnswerCard({
  answer,
  citations,
  ms,
}: {
  answer: string;
  citations: Citation[];
  ms?: number;
}) {
  return (
    <div className="ablock" aria-label="Answer">
      <div className="atext">
        {answer.split("\n\n").map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {citations.length > 0 && (
        <div className="cites">
          {citations.map((c) => (
            <button className="cite" key={c.id} title={c.text} type="button">
              <span className="cid">{c.id}</span>
              <span className="cn">{c.text.slice(0, 80)}</span>
              <span className="sc" aria-label={`score ${c.score}`}>
                score {c.score.toFixed(3)}
              </span>
            </button>
          ))}
        </div>
      )}
      {typeof ms === "number" && (
        <div className="ameta">
          answered in <b>{ms}ms</b>
          <span>·</span>
          <span>
            {citations.length} citation{citations.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}
