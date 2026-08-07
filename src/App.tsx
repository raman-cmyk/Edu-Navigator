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
const CommunityPage = lazy(() => import('@/features/community/CommunityPage').then((m) => ({ default: m.CommunityPage })));
const StageRoomPage = lazy(() => import('@/features/community/StageRoomPage').then((m) => ({ default: m.StageRoomPage })));
const CityRoomPage = lazy(() => import('@/features/city/CityRoomPage').then((m) => ({ default: m.CityRoomPage })));
const FeedPage = lazy(() => import('@/features/feed/FeedPage').then((m) => ({ default: m.FeedPage })));
const ThreadPage = lazy(() => import('@/features/thread/ThreadPage').then((m) => ({ default: m.ThreadPage })));
const ComposePage = lazy(() => import('@/features/compose/ComposePage').then((m) => ({ default: m.ComposePage })));
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

        {/* Community core (M3) */}
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/c" element={<CommunityPage />} />
        <Route path="/c/:stage" element={<StageRoomPage />} />
        <Route path="/city/:slug" element={<CityRoomPage />} />

        <Route path="/p/:id" element={<ThreadPage />} />
        <Route path="/ask" element={<ComposePage />} />

        {/* Later milestones. */}
        <Route path="/search" element={<ComingSoon routeName="Search" />} />
        <Route path="/verify" element={<ComingSoon routeName="Verification" />} />
        <Route path="*" element={<ComingSoon routeName="Not found" />} />
      </Routes>
    </Suspense>
  );
}
