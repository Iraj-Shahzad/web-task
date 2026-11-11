import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SitesService } from './sites.service';

@Controller('api')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  /** GET /api/pages?address=tidepool.zz  → 200 page | 404 {found:false, reason:'unknown'|'malformed'} */
  @Get('pages')
  async page(@Query('address') address: string) {
    return { found: true, page: await this.sites.getPage(address) };
  }

  @Get('sites')
  recent(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(parseInt(limit ?? '8', 10) || 8, 1), 50);
    return this.sites.recent(n);
  }

  /** 201 when a new address is created, 200 when the owner updates their own page. */
  @Post('sites')
  @HttpCode(200)
  async publish(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const r = await this.sites.publish({
      personId: body?.personId,
      address: body?.address,
      title: body?.title,
      html: body?.html,
    });
    if (r.created) res.status(201);
    return r;
  }
}
