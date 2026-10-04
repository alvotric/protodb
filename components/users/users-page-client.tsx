"use client";

import { LiveUsersWorkspace } from "@/components/users/live-users-workspace";

/**
 * Production Users experience: live PostgreSQL-backed roster only.
 * The Phase 8 demo/reference workspace remains in the repository as
 * developer reference but is not linked from production navigation.
 */
export function UsersPageClient({ currentUserId }: { currentUserId: string }) {
  return <LiveUsersWorkspace currentUserId={currentUserId} />;
}
