export function Welcome({ app, title, description }: { app: string; title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-12">
      <header className="flex items-center justify-between border-b border-ink/20 pb-6">
        <span className="text-lg font-bold tracking-tight">BARBER / PLATFORM</span>
        <span className="rounded-full border border-ink/20 px-4 py-2 text-sm">{app}</span>
      </header>
      <section className="flex flex-1 flex-col justify-center py-20">
        <p className="mb-6 text-xs font-bold uppercase tracking-[0.25em]">Built around your barbershop</p>
        <h1 className="max-w-3xl font-serif text-6xl leading-tight sm:text-8xl">{title}</h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink/75">{description}</p>
        <div className="mt-12 max-w-xl border-s-2 border-accent ps-5">
          <p className="font-semibold">Getting ready</p>
          <p className="mt-2 text-sm leading-relaxed text-ink/75">This app is under development. Accounts and appointment booking are not available yet.</p>
        </div>
      </section>
      <footer className="border-t border-ink/20 pt-6 text-sm text-ink/65">A personal space for every shop.</footer>
    </main>
  );
}
