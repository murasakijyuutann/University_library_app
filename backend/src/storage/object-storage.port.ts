export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignedUpload {
  readonly key: string;
  readonly uploadUrl: string;
  /** Extra headers the client must send on the PUT (e.g. Content-Type). */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

/**
 * Object-store seam for owned documents (theses). Production uses S3
 * presigned PUT so Nest never sees file bytes; local driver mirrors that
 * contract with a short-lived signed PUT URL for dev/e2e.
 */
export interface ObjectStorage {
  createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload>;
}
