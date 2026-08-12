import '@/lib/sentry';
import '@/lib/stale-bundle';
import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { locale, onLocaleChange, syncProfileLocale } from '@/i18n';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import PublicPagesAdmin from '@/pages/PublicPagesAdmin';
import KundenPage from '@/pages/KundenPage';
import KundenDetailPage from '@/pages/KundenDetailPage';
import FahrzeugePage from '@/pages/FahrzeugePage';
import FahrzeugeDetailPage from '@/pages/FahrzeugeDetailPage';
import AuftraegePage from '@/pages/AuftraegePage';
import AuftraegeDetailPage from '@/pages/AuftraegeDetailPage';
import RechnungenPage from '@/pages/RechnungenPage';
import RechnungenDetailPage from '@/pages/RechnungenDetailPage';
import JahresinspektionPlanenPage from '@/pages/JahresinspektionPlanenPage';
import JahresinspektionPlanenDetailPage from '@/pages/JahresinspektionPlanenDetailPage';
import RechnungsPdfErstellenPage from '@/pages/RechnungsPdfErstellenPage';
import RechnungsPdfErstellenDetailPage from '@/pages/RechnungsPdfErstellenDetailPage';
// <custom:imports>
const AuftragAnlegenPage = lazy(() => import('@/pages/intents/AuftragAnlegenPage'));
const AuftragAbschliessenPage = lazy(() => import('@/pages/intents/AuftragAbschliessenPage'));
// </custom:imports>

// Lazy: public pages live outside <Layout> and only load on /#/public/:slug —
// dashboard users never pay for them, anonymous visitors skip the dashboard.
const PublicPage = lazy(() => import('@/pages/public/PublicPage'));

// Language switch = full remount below the router: every t()/label lookup
// re-evaluates, the la-* widgets re-read <html lang>. Sits INSIDE
// ActionsProvider so chat/drawer state survives a switch, and inside
// HashRouter so the current route survives (it re-reads the URL hash).
function LocaleGate({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState(locale);
  useEffect(() => onLocaleChange(() => setCurrent(locale)), []);
  // Adopt the LA profile language (SSOT) — but never on public routes,
  // where the visitor's browser language governs (initPublicLocale).
  useEffect(() => {
    if (!window.location.hash.startsWith('#/public')) void syncProfileLocale();
  }, []);
  return <Fragment key={current}>{children}</Fragment>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <LocaleGate>
            <Routes>
              <Route path="public/:slug" element={<Suspense fallback={null}><PublicPage /></Suspense>} />
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="kunden" element={<KundenPage />} />
                <Route path="kunden/:id" element={<KundenDetailPage />} />
                <Route path="fahrzeuge" element={<FahrzeugePage />} />
                <Route path="fahrzeuge/:id" element={<FahrzeugeDetailPage />} />
                <Route path="auftraege" element={<AuftraegePage />} />
                <Route path="auftraege/:id" element={<AuftraegeDetailPage />} />
                <Route path="rechnungen" element={<RechnungenPage />} />
                <Route path="rechnungen/:id" element={<RechnungenDetailPage />} />
                <Route path="jahresinspektion-planen" element={<JahresinspektionPlanenPage />} />
                <Route path="jahresinspektion-planen/:id" element={<JahresinspektionPlanenDetailPage />} />
                <Route path="rechnungs-pdf-erstellen" element={<RechnungsPdfErstellenPage />} />
                <Route path="rechnungs-pdf-erstellen/:id" element={<RechnungsPdfErstellenDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="verwaltung/oeffentliche-seiten" element={<PublicPagesAdmin />} />
                {/* <custom:routes> */}
                <Route path="intents/auftrag-anlegen" element={<Suspense fallback={null}><AuftragAnlegenPage /></Suspense>} />
                <Route path="intents/auftrag-abschliessen" element={<Suspense fallback={null}><AuftragAbschliessenPage /></Suspense>} />
                {/* </custom:routes> */}
              </Route>
            </Routes>
            </LocaleGate>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
