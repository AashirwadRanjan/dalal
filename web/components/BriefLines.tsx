import { DirTag } from "./ui";

/** Today's brief: one line per fact, with an UP / FLAT / DOWN tag. Used on Today and /brief. */
export default function BriefLines({ lines }: { lines: { tone: "up" | "down" | "flat"; text: string }[] }) {
  return (
    <ul className="lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {lines.map((l) => (
        <li key={l.text} className="brief-line">
          <DirTag tone={l.tone} />
          <span style={{ fontSize: 18 }}>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
