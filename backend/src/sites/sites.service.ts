import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { parseAddress } from '../common/address';
import { sanitizePage } from '../common/sanitize';
import { STORE, SiteRecord, Store } from '../store/types';

export const TITLE_MAX = 120;
export const HTML_MAX = 100_000;

export interface PageView {
  address: string;
  title: string;
  body: string; // sanitised
  links: string[];
  author: { id: string; name: string };
  revision: number;
  updatedAt: string;
}

@Injectable()
export class SitesService {
  constructor(@Inject(STORE) private readonly store: Store) {}

  /** Read a page for display. Not-found is a normal outcome with a reason, not an exception to hide. */
  async getPage(rawAddress: unknown): Promise<PageView> {
    const parsed = parseAddress(rawAddress);
    if (!parsed.ok) throw new NotFoundException({ found: false, reason: 'malformed', address: null });
    const site = await this.store.getSite(parsed.address);
    if (!site) throw new NotFoundException({ found: false, reason: 'unknown', address: parsed.address });
    const author = await this.store.getPerson(site.authorId);
    return {
      address: site.address,
      title: site.title,
      body: site.body,
      links: site.links,
      author: { id: site.authorId, name: author?.name ?? site.authorId },
      revision: site.revision,
      updatedAt: site.updatedAt.toISOString(),
    };
  }

  async publish(input: { personId: unknown; address: unknown; title: unknown; html: unknown }) {
    if (typeof input.personId !== 'string' || !(await this.store.getPerson(input.personId))) {
      throw new NotFoundException({ code: 'unknown_person', message: 'Pick who you are publishing as.' });
    }
    const authorId = input.personId;

    const addr = parseAddress(input.address);
    if (!addr.ok) {
      throw new BadRequestException({
        code: 'malformed_address',
        message: 'An address looks like tidepool.zz — letters, digits and hyphens, then a dot and a suffix.',
      });
    }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title.length < 1 || title.length > TITLE_MAX) {
      throw new BadRequestException({ code: 'bad_title', message: `Title must be 1–${TITLE_MAX} characters.` });
    }
    const html = typeof input.html === 'string' ? input.html : '';
    if (html.trim().length === 0 || html.length > HTML_MAX) {
      throw new BadRequestException({ code: 'bad_html', message: `Page must be 1–${HTML_MAX} characters of HTML.` });
    }

    const clean = sanitizePage(html);
    if (clean.text.length === 0) {
      throw new BadRequestException({
        code: 'empty_page',
        message: 'Nothing visible is left after cleaning the page. Add some text.',
      });
    }
    const fields = { title, source: html, body: clean.body, text: clean.text, links: clean.links };

    // Update path: only the owner may change an address.
    const updated = await this.store.updateSite(addr.address, authorId, fields);
    if (updated) return this.result(updated, false);

    // Create path. createSite is atomic, so two simultaneous publishers cannot both win.
    const now = new Date();
    const record: SiteRecord = { address: addr.address, authorId, ...fields, revision: 1, createdAt: now, updatedAt: now };
    if (await this.store.createSite(record)) return this.result(record, true);

    // Lost the race, or the address was already someone else's.
    throw new ConflictException({ code: 'address_taken', message: `${addr.address} belongs to someone else.` });
  }

  async recent(limit: number) {
    const sites = await this.store.recentSites(limit);
    const people = new Map((await this.store.listPeople()).map((p) => [p.id, p.name]));
    return sites.map((s) => ({
      address: s.address,
      title: s.title,
      author: { id: s.authorId, name: people.get(s.authorId) ?? s.authorId },
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  private result(s: SiteRecord, created: boolean) {
    return { address: s.address, title: s.title, revision: s.revision, created, links: s.links };
  }
}
