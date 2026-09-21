"use client";

import { useState } from "react";

export default function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q);
      }}
    >
      <input aria-label="Search" onChange={(e) => setQ(e.target.value)} value={q} />
      <button type="submit">Ask</button>
    </form>
  );
}
