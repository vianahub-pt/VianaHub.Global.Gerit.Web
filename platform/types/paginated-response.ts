/**
 * PaginatedResponse<T>
 *
 * Type genérico para respostas paginadas do Backend API.
 * Compatível com o formato padrão de paginação do VianaHub.Global.
 *
 * Referência:
 * - Backend: VianaHub.Global/src/ - Formato de paginação padrão
 * - Frontend: src/platform/types/paginated-response.ts
 */

export interface PaginatedResponse<T> {
  /** Array de itens da página atual */
  items: T[];

  /** Total de itens na consulta (sem paginação) */
  totalItems: number;

  /** Número da página atual (1-indexed) */
  pageNumber: number;

  /** Tamanho da página (itens por página) */
  pageSize: number;

  /** Total de páginas disponíveis */
  totalPages: number;
}

/**
 * Tipo auxiliar para extrair o tipo dos itens de uma PaginatedResponse
 */
export type PaginatedItems<T> = PaginatedResponse<T>['items'];

/**
 * Tipo auxiliar para metadados de paginação (sem os items)
 */
export type PaginationMeta = Omit<PaginatedResponse<unknown>, 'items'>;

/**
 * Query params comuns para requisições paginadas
 */
export interface PaginationParams {
  /** Número da página (1-indexed) */
  pageNumber?: number;

  /** Tamanho da página */
  pageSize?: number;

  /** Campo para ordenação */
  sortBy?: string;

  /** Direção da ordenação (asc ou desc) */
  sortDirection?: 'asc' | 'desc';

  /** Texto de busca/filtro */
  search?: string;

  /** Filtro por status ativo/inativo */
  isActive?: boolean;
}
