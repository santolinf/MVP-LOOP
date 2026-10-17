import { COPY } from "../lib/copy";

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-5 text-xs text-muted">
      <div className="mx-auto w-[min(var(--container-page),calc(100%-30px))]">{COPY.footer}</div>
    </footer>
  );
}
