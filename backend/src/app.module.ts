import { Module } from '@nestjs/common';
import { PeopleController } from './people/people.controller';
import { SitesController } from './sites/sites.controller';
import { SitesService } from './sites/sites.service';
import { MemoryStore } from './store/memory.store';
import { MongoStore } from './store/mongo.store';
import { STORE } from './store/types';

@Module({
  controllers: [SitesController, PeopleController],
  providers: [
    SitesService,
    {
      provide: STORE,
      // STORE=memory runs everything in-process (handy for a quick look); default is MongoDB.
      useFactory: async () =>
        process.env.STORE === 'memory'
          ? new MemoryStore()
          : MongoStore.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/small-web'),
    },
  ],
})
export class AppModule {}
