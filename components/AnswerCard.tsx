"use client";

import { useState } from "react";

import type { Citation } from "../lib/answer";

export default function AnswerCard({
  answer,
  citations,
  ms,
}: {
  answer: string;
  citations: Citation[];
  ms?: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="ablock" aria-label="Answer">
      <div className="atext">
        {answer.split("\n\n").map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {citations.length > 0 && (
        <div className="cites">
          {citations.map((c) => {
            const open = expanded === c.id;
            return (
              <div key={c.id}>
                <button
                  className="cite"
                  title={c.text}
                  type="button"
                  aria-expanded={open ? "true" : "false"}
                  onClick={() => setExpanded(open ? null : c.id)}
                >
                  <span className="cid">{c.id}</span>
                  <span className="cn">{c.text.slice(0, 80)}</span>
                  <span className="sc" aria-label={`score ${c.score}`}>
                    score {c.score.toFixed(3)}
                  </span>
                </button>
                {open && (
                  <div
                    className="cite-detail"
                    data-testid={`cite-detail-${c.id}`}
                    role="dialog"
                    aria-label={`Citation ${c.id} source`}
                  >
                    <div className="cite-detail-head">
                      <b className="cid">{c.id}</b>
                      <span className="sc">score {c.score.toFixed(3)}</span>
                    </div>
                    <p className="cite-detail-text">{c.text}</p>
                  </div>
                )}
              </div>
            );
          })}
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
