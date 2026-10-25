export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
