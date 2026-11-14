import { prisma } from '@/lib/prisma';
import { requirePageUser, canApprove } from '@/lib/session';
import NewPostForm from '@/components/NewPostForm';

export default async function NewPostPage() {
  const user = await requirePageUser();
  const [restaurant, accounts] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.socialAccount.findMany({
      where: { restaurantId: user.restaurantId, needsReconnect: false, platform: { in: ['FACEBOOK', 'INSTAGRAM'] } },
      select: { id: true, platform: true, accountName: true },
      orderBy: { platform: 'asc' },
    }),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-mm-ink">Nova objava</h1>
        <p className="text-sm text-mm-muted">Fotografija, jela i tekst. Ostatak radi sistem.</p>
      </div>
      <NewPostForm accounts={accounts} defaultTime={restaurant?.defaultPostTime ?? '11:00'} canApprove={canApprove(user.role)} />
    </div>
  );
}
