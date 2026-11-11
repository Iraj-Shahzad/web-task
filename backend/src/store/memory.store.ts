import { Person, SiteFields, SiteRecord, Store } from './types';

/** In-process Store for tests and for running without MongoDB. Same contract as MongoStore. */
export class MemoryStore implements Store {
  private people = new Map<string, Person>();
  private sites = new Map<string, SiteRecord>();

  async listPeople() {
    return [...this.people.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async getPerson(id: string) {
    return this.people.get(id) ?? null;
  }
  async upsertPerson(person: Person) {
    this.people.set(person.id, { ...person });
  }

  async getSite(address: string) {
    const s = this.sites.get(address);
    return s ? { ...s } : null;
  }
  async createSite(site: SiteRecord) {
    if (this.sites.has(site.address)) return false;
    this.sites.set(site.address, { ...site });
    return true;
  }
  async updateSite(address: string, authorId: string, fields: SiteFields) {
    const cur = this.sites.get(address);
    if (!cur || cur.authorId !== authorId) return null;
    const next: SiteRecord = { ...cur, ...fields, revision: cur.revision + 1, updatedAt: new Date() };
    this.sites.set(address, next);
    return { ...next };
  }
  async recentSites(limit: number) {
    return [...this.sites.values()]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.address.localeCompare(b.address))
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }
}
