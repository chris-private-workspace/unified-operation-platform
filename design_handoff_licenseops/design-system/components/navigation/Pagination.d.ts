import React from 'react';

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Optional totals to render an "N–M of T" range summary. */
  total?: number;
  pageSize?: number;
  onChange?: (page: number) => void;
}

/**
 * Table-footer pager — range summary + prev/next + up to 5 numbered pages.
 * Sits on the bottom hairline of an unpadded Card wrapping a data table
 * (Requests console, SKU Catalog).
 */
export function Pagination(props: PaginationProps): JSX.Element;
