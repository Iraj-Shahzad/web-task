/**
 * The persistence boundary. Everything the app needs from a database is on this
 * interface, so business rules (publish, history, search) can be unit-tested
 * against MemoryStore and run in production against MongoStore.
 */

export interface Person {
  id: string; // stable slug, e.g. "mira"
  name: string;
}

export interface SiteRecord {
  address: string; // canonical, unique
  title: string;
  authorId: string;
  /** What the author wrote. Kept for audit/re-sanitising; NEVER rendered. */
  source: string;
  /** Sanitised HTML. The only thing ever sent to a browser for display. */
  body: string;
  /** Plain text of body, for search. */
  text: string;
  /** Canonical addresses this page links to. */
  links: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SiteFields = Pick<SiteRecord, 'title' | 'source' | 'body' | 'text' | 'links'>;

export interface Store {
  listPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
  upsertPerson(person: Person): Promise<void>;

  getSite(address: string): Promise<SiteRecord | null>;
  /** Atomic create. Returns false (instead of throwing) if the address is already taken. */
  createSite(site: SiteRecord): Promise<boolean>;
  /** Atomic update, only if `authorId` owns the address. Bumps revision. Null if no such owned site. */
  updateSite(address: string, authorId: string, fields: SiteFields): Promise<SiteRecord | null>;
  /** Newest first by updatedAt. */
  recentSites(limit: number): Promise<SiteRecord[]>;
}

export const STORE = Symbol('STORE');
