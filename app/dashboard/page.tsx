import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/session';

export default async function DashboardHome() {
  const user = await requirePageUser();
  redirect(user.role === 'STAFF' ? '/dashboard/nova' : '/dashboard/odobrenje');
}
