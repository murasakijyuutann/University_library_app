import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

/**
 * Prisma's BigSerial ids come through route params as strings; Nest has no
 * built-in bigint pipe (only ParseIntPipe, which truncates to a JS number).
 * This converts and validates in one step so controllers never handle the
 * raw string.
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(`"${value}" is not a valid id.`);
    }
    return BigInt(value);
  }
}
