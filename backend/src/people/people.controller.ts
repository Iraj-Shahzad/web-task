import { Controller, Get, Inject } from '@nestjs/common';
import { STORE, Store } from '../store/types';

@Controller('api')
export class PeopleController {
  constructor(@Inject(STORE) private readonly store: Store) {}

  @Get('people')
  people() {
    return this.store.listPeople();
  }
}
