import { IllRequest } from '@prisma/client';

export interface IllRequestResponse {
  readonly id: string;
  readonly memberId: string;
  readonly title: string;
  readonly author: string | null;
  readonly doiOrIsbn: string | null;
  readonly justification: string | null;
  readonly status: string;
  readonly requestedAt: string;
  readonly fulfilledAt: string | null;
  readonly returnDueAt: string | null;
}

export function toIllRequestResponse(request: IllRequest): IllRequestResponse {
  return {
    id: request.id.toString(),
    memberId: request.memberId.toString(),
    title: request.title,
    author: request.author,
    doiOrIsbn: request.doiOrIsbn,
    justification: request.justification,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    fulfilledAt: request.fulfilledAt ? request.fulfilledAt.toISOString() : null,
    returnDueAt: request.returnDueAt ? request.returnDueAt.toISOString() : null,
  };
}
