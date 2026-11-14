import axios from 'axios';
import { GRAPH } from './meta';

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

/** Stranice kojima korisnik upravlja, s page tokenima i povezanim Instagram nalogom. */
export async function listManagedPages(userToken: string): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let next: string | null = `${GRAPH}/me/accounts`;
  let params: Record<string, string> | undefined = {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    limit: '50',
    access_token: userToken,
  };
  while (next) {
    const res: any = await axios.get(next, { params });
    pages.push(...(res.data.data || []));
    next = res.data.paging?.next || null;
    params = undefined; // "next" URL već sadrži parametre
  }
  return pages;
}
