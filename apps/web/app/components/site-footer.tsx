import { COPY } from "../lib/copy";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#293441] py-[35px] text-[13px] text-[#98a7b9]">
      <div className="mx-auto max-w-page px-[26px]">{COPY.footer}</div>
    </footer>
  );
}
