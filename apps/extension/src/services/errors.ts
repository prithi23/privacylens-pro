export class ScanError extends Error {
  constructor(
    public code:
      | 'UNSUPPORTED'
      | 'PERMISSION'
      | 'NAVIGATION'
      | 'INVALID_RESULT'
      | 'TIMEOUT',
    message: string,
  ) {
    super(message);
  }
}
