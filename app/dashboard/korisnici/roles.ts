import type { AppRole } from '@/lib/session';

export const ROLE_LABEL: Record<AppRole, string> = {
  ADMIN: 'Administrator',
  OWNER: 'Vlasnik',
  STAFF: 'Osoblje',
};

export const ROLE_HINT: Record<AppRole, string> = {
  ADMIN: 'Norvel podrška, puni pristup',
  OWNER: 'Odobrava objave, povezuje naloge, upravlja korisnicima',
  STAFF: 'Pravi objave koje vlasnik odobrava',
};
