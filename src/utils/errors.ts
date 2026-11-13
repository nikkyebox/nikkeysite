/**
 * Texto legível de qualquer valor lançado em um `catch`.
 *
 * `catch` recebe `unknown`: o `Error` padrão é lido pela propriedade `message`;
 * objetos de erro de SDK (ex.: Firebase) também expõem `message` como string;
 * o resto vira texto. Não usa `as`: a checagem é feita em tempo de execução.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

/** Código do erro (ex.: `permission-denied` do Firestore), ou '' se não houver. */
export function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '';
}
