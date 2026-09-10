import { Suspense, lazy, useEffect, useRef } from 'react';
import { Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import AppBackground from './components/common/AppBackground';
import { prefersReducedMotion } from './store/compositionStore';
import ShowcasePage from './pages/ShowcasePage';
import WorkstationPage from './pages/WorkstationPage';

const ResearchPage = lazy(() => import('./pages/ResearchPage'));

/**
 * Route-level transition. The host div is stable across navigations (only the
 * Outlet content swaps), so no page is remounted twice. `transform` is cleared
 * on completion so fixed-position children inside pages are never anchored to
 * this wrapper once the transition is done.
 */
function PageTransition(): JSX.Element {
  const location = useLocation();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      },
    );
    return () => {
      tween.kill();
    };
  }, [location.pathname]);

  return (
    <div ref={hostRef} className="page-shell">
      <Outlet />
    </div>
  );
}

/** App shell: one ambient background for all pages + route transitions. */
function RootLayout(): JSX.Element {
  return (
    <>
      <AppBackground />
      <PageTransition />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <ShowcasePage /> },
      {
        path: '/research',
        element: (
          <Suspense fallback={<div className="page-loading">加载中…</div>}>
            <ResearchPage />
          </Suspense>
        ),
      },
      { path: '/workspace', element: <WorkstationPage /> },
    ],
  },
]);

export default function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
