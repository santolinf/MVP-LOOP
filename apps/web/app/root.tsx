import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { ReferralAttribution } from "./features/referrals/referral-attribution";
import { Providers } from "./providers";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#090c13" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <Providers>
      <ReferralAttribution />
      <a
        href="#app"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2 focus:font-semibold focus:text-bg"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="app" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </Providers>
  );
}
