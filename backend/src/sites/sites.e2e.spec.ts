import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { PeopleController } from '../people/people.controller';
import { MemoryStore } from '../store/memory.store';
import { STORE } from '../store/types';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

describe('sites API (publish + read)', () => {
  let app: INestApplication;
  let store: MemoryStore;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    store = new MemoryStore();
    await store.upsertPerson({ id: 'mira', name: 'Mira Okafor' });
    await store.upsertPerson({ id: 'jonas', name: 'Jonas Lindqvist' });
    const mod = await Test.createTestingModule({
      controllers: [SitesController, PeopleController],
      providers: [SitesService, { provide: STORE, useValue: store }],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    app.use(json({ limit: '300kb' }));
    await app.init();
  });
  afterEach(() => app.close());

  const publish = (over: Record<string, unknown> = {}) =>
    http()
      .post('/api/sites')
      .send({ personId: 'mira', address: 'tidepool.zz', title: 'Tidepool', html: '<p>Tides come in.</p>', ...over });

  it('lists people', async () => {
    const r = await http().get('/api/people').expect(200);
    expect(r.body.map((p: any) => p.id)).toEqual(['jonas', 'mira']);
  });

  describe('publish', () => {
    it('creates a page (201) and serves it back', async () => {
      const r = await publish().expect(201);
      expect(r.body).toMatchObject({ address: 'tidepool.zz', revision: 1, created: true });
      const page = await http().get('/api/pages').query({ address: 'tidepool.zz' }).expect(200);
      expect(page.body.page).toMatchObject({
        address: 'tidepool.zz',
        title: 'Tidepool',
        body: '<p>Tides come in.</p>',
        author: { id: 'mira', name: 'Mira Okafor' },
        revision: 1,
      });
    });

    it('stores and serves only sanitised HTML', async () => {
      await publish({
        html: '<p>hi</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>',
      }).expect(201);
      const page = await http().get('/api/pages').query({ address: 'tidepool.zz' }).expect(200);
      expect(page.body.page.body).toBe('<p>hi</p><span>x</span>');
      expect(JSON.stringify(page.body)).not.toMatch(/script|onerror|javascript:/i);
    });

    it('records the links of the page, including ones that lead nowhere', async () => {
      const r = await publish({ html: '<a href="moonphase.zz">a</a> <a href="never-existed.zz">b</a>' }).expect(201);
      expect(r.body.links).toEqual(['moonphase.zz', 'never-existed.zz']);
    });

    it('normalises the address it is published at', async () => {
      await publish({ address: 'small://TidePool.ZZ/' }).expect(201);
      await http().get('/api/pages').query({ address: 'tidepool.zz' }).expect(200);
    });

    it('lets the owner update (200, revision bumps)', async () => {
      await publish().expect(201);
      const r = await publish({ html: '<p>Second edition</p>' }).expect(200);
      expect(r.body).toMatchObject({ revision: 2, created: false });
      const page = await http().get('/api/pages').query({ address: 'tidepool.zz' });
      expect(page.body.page.body).toBe('<p>Second edition</p>');
    });

    it('refuses someone else publishing at an owned address (409) and leaves the page alone', async () => {
      await publish().expect(201);
      const r = await publish({ personId: 'jonas', html: '<p>hijack</p>' }).expect(409);
      expect(r.body.code).toBe('address_taken');
      const page = await http().get('/api/pages').query({ address: 'tidepool.zz' });
      expect(page.body.page.body).toBe('<p>Tides come in.</p>');
      expect(page.body.page.author.id).toBe('mira');
    });

    it('lets exactly one of two simultaneous publishers win', async () => {
      const [a, b] = await Promise.all([publish({ personId: 'mira' }), publish({ personId: 'jonas' })]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    it.each([
      [{ address: 'not an address' }, 'malformed_address'],
      [{ address: 'https://evil.example' }, 'malformed_address'],
      [{ title: '   ' }, 'bad_title'],
      [{ title: 'x'.repeat(121) }, 'bad_title'],
      [{ html: '' }, 'bad_html'],
      [{ html: 123 }, 'bad_html'],
      [{ html: 'x'.repeat(100_001) }, 'bad_html'],
      [{ html: '<script>only()</script>' }, 'empty_page'],
    ])('rejects bad input %j with %s', async (over, code) => {
      const r = await publish(over).expect(400);
      expect(r.body.code).toBe(code);
    });

    it('rejects an unknown publisher (404)', async () => {
      const r = await publish({ personId: 'nobody' }).expect(404);
      expect(r.body.code).toBe('unknown_person');
    });

    it('rejects a body that is not an object without crashing', async () => {
      await http().post('/api/sites').send('nope').set('Content-Type', 'text/plain').expect(404);
    });
  });

  describe('read', () => {
    it('answers an address nobody published with 404 / unknown', async () => {
      const r = await http().get('/api/pages').query({ address: 'old-harbor.zz' }).expect(404);
      expect(r.body).toEqual({ found: false, reason: 'unknown', address: 'old-harbor.zz' });
    });

    it('answers a non-address with 404 / malformed', async () => {
      const r = await http().get('/api/pages').query({ address: 'hello world' }).expect(404);
      expect(r.body).toMatchObject({ found: false, reason: 'malformed' });
      await http().get('/api/pages').expect(404);
    });

    it('lists recently published sites, newest first', async () => {
      await publish({ address: 'a-one.zz' });
      await new Promise((r) => setTimeout(r, 5));
      await publish({ address: 'b-two.zz', personId: 'jonas' });
      const r = await http().get('/api/sites').query({ limit: 5 }).expect(200);
      expect(r.body.map((s: any) => s.address)).toEqual(['b-two.zz', 'a-one.zz']);
      expect(r.body[0].author).toEqual({ id: 'jonas', name: 'Jonas Lindqvist' });
    });
  });
});
