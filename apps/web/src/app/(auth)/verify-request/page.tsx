export default function VerifyRequestPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-[var(--color-card)] p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Verifiez votre boite mail</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Un lien magique vient de vous etre envoye. Cliquez sur le lien recu pour acceder a la
          plateforme. Le lien expire dans 15 minutes.
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          En developpement : consultez Mailhog sur{' '}
          <a
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[var(--color-primary)] underline"
          >
            http://localhost:8025
          </a>
        </p>
      </div>
    </main>
  );
}
