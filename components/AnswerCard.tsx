import type { Citation } from "../lib/answer";

export default function AnswerCard({
  answer,
  citations,
}: {
  answer: string;
  citations: Citation[];
}) {
  return (
    <article>
      <p>{answer}</p>
      <ul>
        {citations.map((c) => (
          <li key={c.id}>
            [{c.score}] {c.text}
          </li>
        ))}
      </ul>
    </article>
  );
}
