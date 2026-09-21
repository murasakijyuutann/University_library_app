import { Member } from '@prisma/client';

/** JSON-safe member profile — `id` (bigint) is stringified for the wire. */
export interface MemberProfileResponse {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly memberType: string;
  readonly faculty: string | null;
  readonly role: string;
}

export function toMemberProfileResponse(member: Member): MemberProfileResponse {
  return {
    id: member.id.toString(),
    fullName: member.fullName,
    email: member.email,
    memberType: member.memberType,
    faculty: member.faculty,
    role: member.role,
  };
}
