import mongoose, { Connection, Model, Schema } from 'mongoose';
import { Person, SiteFields, SiteRecord, Store } from './types';

interface PersonDoc {
  _id: string;
  name: string;
}

export class MongoStore implements Store {
  private People: Model<PersonDoc>;
  private Sites: Model<SiteRecord>;

  private constructor(private readonly conn: Connection) {
    this.People = conn.model<PersonDoc>(
      'Person',
      new Schema({ _id: { type: String, required: true }, name: { type: String, required: true } }, { versionKey: false }),
    );
    this.Sites = conn.model<SiteRecord>(
      'Site',
      new Schema(
        {
          address: { type: String, required: true, unique: true }, // the uniqueness rule lives in the database
          title: { type: String, required: true },
          authorId: { type: String, required: true, index: true },
          source: { type: String, required: true },
          body: { type: String, required: true },
          text: { type: String, required: true },
          links: { type: [String], default: [] },
          revision: { type: Number, required: true },
          createdAt: { type: Date, required: true },
          updatedAt: { type: Date, required: true, index: true },
        },
        { versionKey: false },
      ),
    );
  }

  static async connect(uri: string): Promise<MongoStore> {
    const conn = await mongoose.createConnection(uri).asPromise();
    const store = new MongoStore(conn);
    await store.Sites.init(); // builds indexes, including the unique one, before we serve traffic
    return store;
  }

  async close() {
    await this.conn.close();
  }

  async listPeople() {
    const docs = await this.People.find().sort({ name: 1 }).lean();
    return docs.map((d) => ({ id: d._id, name: d.name }));
  }
  async getPerson(id: string) {
    const d = await this.People.findById(id).lean();
    return d ? { id: d._id, name: d.name } : null;
  }
  async upsertPerson(p: Person) {
    await this.People.replaceOne({ _id: p.id }, { _id: p.id, name: p.name }, { upsert: true });
  }

  async getSite(address: string) {
    return this.toRecord(await this.Sites.findOne({ address }).lean());
  }
  async createSite(site: SiteRecord) {
    try {
      await this.Sites.create(site);
      return true;
    } catch (e: any) {
      if (e?.code === 11000) return false; // duplicate key: someone else got the address first
      throw e;
    }
  }
  async updateSite(address: string, authorId: string, fields: SiteFields) {
    const doc = await this.Sites.findOneAndUpdate(
      { address, authorId }, // ownership is part of the filter, so check-and-write is one atomic step
      { $set: { ...fields, updatedAt: new Date() }, $inc: { revision: 1 } },
      { new: true },
    ).lean();
    return this.toRecord(doc);
  }
  async recentSites(limit: number) {
    const docs = await this.Sites.find().sort({ updatedAt: -1, address: 1 }).limit(limit).lean();
    return docs.map((d) => this.toRecord(d)!);
  }

  private toRecord(d: any): SiteRecord | null {
    if (!d) return null;
    const { _id, ...rest } = d;
    return rest as SiteRecord;
  }
}
