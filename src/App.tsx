import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LoadingBlock } from '@/components/EmptyState';

/*
 * Route-level code splitting on every screen keeps chunks small (performance
 * budget: largest route chunk < 150KB). See docs/03-architecture.md.
 *
 * V1 ship gate 1 (Foundation + Shortlist) implements the public routes below.
 * Community / authed / admin routes land in later milestones.
 */

const LandingPage = lazy(() => import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
const ShortlistPage = lazy(() => import('@/features/shortlist/ShortlistPage').then((m) => ({ default: m.ShortlistPage })));
const ResultPage = lazy(() => import('@/features/shortlist/ResultPage').then((m) => ({ default: m.ResultPage })));
const CommissionsPage = lazy(() => import('@/features/commissions/CommissionsPage').then((m) => ({ default: m.CommissionsPage })));
const MethodologyPage = lazy(() => import('@/features/methodology/MethodologyPage').then((m) => ({ default: m.MethodologyPage })));
const ComingSoon = lazy(() => import('@/features/placeholder/ComingSoon').then((m) => ({ default: m.ComingSoon })));

export default function App() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-content p-s4"><LoadingBlock height={200} /></div>}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/shortlist" element={<ShortlistPage />} />
        <Route path="/s/:slug" element={<ResultPage />} />
        <Route path="/commissions" element={<CommissionsPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />

        {/* Community + authed + admin — implemented in later milestones. */}
        <Route path="/c" element={<ComingSoon routeName="Community" />} />
        <Route path="/c/:stage" element={<ComingSoon routeName="Stage room" />} />
        <Route path="/city/:slug" element={<ComingSoon routeName="City room" />} />
        <Route path="/p/:id" element={<ComingSoon routeName="Thread" />} />
        <Route path="/feed" element={<ComingSoon routeName="Feed" />} />
        <Route path="/ask" element={<ComingSoon routeName="Composer" />} />
        <Route path="/search" element={<ComingSoon routeName="Search" />} />
        <Route path="/verify" element={<ComingSoon routeName="Verification" />} />
        <Route path="*" element={<ComingSoon routeName="Not found" />} />
      </Routes>
    </Suspense>
  );
}
