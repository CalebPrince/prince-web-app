export function SectionLabel({ index, children }: { index?: string; children: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="label text-accent">{"//"}</span>
      {index && <span className="label text-muted">{index}</span>}
      <span className="label text-text-2">{children}</span>
    </div>
  );
}
