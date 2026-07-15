/**
 * Minimal member shape AccessPolicyResolver needs to make a decision — not the
 * full Member domain type (which the member/ module will define once it's
 * built out). Kept intentionally narrow so the resolver's dependency surface
 * stays honest about what it actually reads.
 */
export interface MemberContext {
  readonly id: bigint;
  readonly faculty: string | null;
}
