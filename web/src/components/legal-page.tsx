/** Readable long-form layout shared by /privacy and /terms: prose width, contents list, anchors. */
export function LegalPage({
  title,
  updated,
  contentsLabel,
  sections,
}: {
  title: string;
  updated: string;
  contentsLabel: string;
  sections: { id: string; title: string; body: string }[];
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{updated}</p>

      <nav aria-label={contentsLabel} className="mt-8 rounded-2xl border bg-card p-5">
        <p className="mb-2 text-sm font-semibold">{contentsLabel}</p>
        <ol className="list-decimal space-y-1 pl-5 text-[15px] marker:text-muted-foreground">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent-foreground underline-offset-4 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 flex max-w-prose flex-col gap-9">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold">
              <span className="mr-2 text-muted-foreground">{i + 1}.</span>
              {s.title}
            </h2>
            <p className="mt-3 text-[16px] leading-[1.8] whitespace-pre-line">{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
