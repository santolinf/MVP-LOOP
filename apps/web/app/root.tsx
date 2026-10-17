import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#061526" />
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
    <>
      <SiteHeader />
      <main id="app" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
