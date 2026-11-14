import { prisma } from '@/lib/prisma';
import { requirePageUser, type AppRole } from '@/lib/session';
import { isPendingHash } from '@/lib/passwordToken';
import InviteForm from '@/components/InviteForm';
import UserRow from '@/components/UserRow';
import { ROLE_HINT, ROLE_LABEL } from './roles';

const ORDER: Record<AppRole, number> = { ADMIN: 0, OWNER: 1, STAFF: 2 };

export default async function UsersPage() {
  const me = await requirePageUser(['OWNER', 'ADMIN']);
  const users = await prisma.user.findMany({
    where: { restaurantId: me.restaurantId },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  users.sort((a, b) => ORDER[a.role as AppRole] - ORDER[b.role as AppRole]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-mm-ink">Korisnici</h1>
        <p className="text-sm text-mm-muted">
          Dodaj vlasnika ili osoblje. Dobiće email s linkom da sami postave lozinku.
        </p>
      </div>

      <InviteForm />

      <div className="card divide-y divide-mm-line p-0">
        {users.map((u) => {
          const role = u.role as AppRole;
          const locked = u.id === me.id || (role === 'ADMIN' && me.role !== 'ADMIN');
          return (
            <UserRow
              key={u.id}
              user={{
                id: u.id,
                name: u.name,
                email: u.email,
                role,
                roleLabel: ROLE_LABEL[role],
                roleHint: ROLE_HINT[role],
                pending: isPendingHash(u.passwordHash),
                isMe: u.id === me.id,
              }}
              locked={locked}
            />
          );
        })}
      </div>
    </div>
  );
}
