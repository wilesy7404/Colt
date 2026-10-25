import { AppError } from './errors.ts';

export function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'A JSON object is required.', 'validation');
  }
  return body as Record<string, unknown>;
}

export function reqString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, `${key} is required.`, 'validation');
  }
  return value.trim();
}

export function optString(obj: Record<string, unknown>, key: string, fallback = ''): string {
  if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === undefined || obj[key] === null) return fallback;
  if (typeof obj[key] !== 'string') throw new AppError(400, `${key} must be a string.`, 'validation');
  return (obj[key] as string).trim();
}

export function readOptionalNumber(obj: Record<string, unknown>, key: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === undefined) return undefined;
  if (obj[key] === null) return null;
  if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key])) {
    throw new AppError(400, `${key} must be a number or null.`, 'validation');
  }
  return obj[key] as number;
}

export function reqNumber(obj: Record<string, unknown>, key: string): number {
  const value = readOptionalNumber(obj, key);
  if (value === undefined || value === null) throw new AppError(400, `${key} is required.`, 'validation');
  return value;
}

export function readBoolean(obj: Record<string, unknown>, key: string, fallback = false): boolean {
  if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === undefined) return fallback;
  if (typeof obj[key] !== 'boolean') throw new AppError(400, `${key} must be true or false.`, 'validation');
  return obj[key] as boolean;
}

export function nonNegative(value: number | null | undefined, key: string): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (value < 0) throw new AppError(400, `${key} cannot be negative.`, 'validation');
  return value;
}
