export interface ApiErrorPayload {
  message?: string;
  title?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PagedResponse<TItem> {
  items: TItem[];
  totalItems: number;
  page: number;
  pageSize: number;
}

