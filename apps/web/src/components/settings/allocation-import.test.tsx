import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllocationImportPanel } from './allocation-import';
import { useCatalog, useLedger, useOpcos } from '@/hooks/queries';
import { useAllocationImport } from '@/hooks/mutations';
import type { AdminOpco, LedgerRow, SkuCatalog } from '@/lib/api-types';

// Mock the data hooks — what we exercise is the panel's own wiring (format copy,
// template download, the curation warning), not react-query. W35 F2.
vi.mock('@/hooks/queries', () => ({
  useCatalog: vi.fn(),
  useLedger: vi.fn(),
  useOpcos: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({ useAllocationImport: vi.fn() }));

function sku(p: Partial<SkuCatalog> & { skuPartNumber: string }): SkuCatalog {
  return {
    id: `id-${p.skuPartNumber}`,
    skuId: `guid-${p.skuPartNumber}`,
    skuPartNumber: p.skuPartNumber,
    displayName: p.skuPartNumber,
    businessAlias: p.businessAlias ?? null,
    category: null,
    isBaseLicense: false,
    active: p.active ?? true,
    lastSyncedAt: null,
    createdAt: '2026-07-25T00:00:00Z',
  };
}

function mockData(
  catalog: SkuCatalog[],
  opcos: AdminOpco[] = [{ id: 'rhk', code: 'RHK', displayName: 'RHK Co' }],
) {
  vi.mocked(useOpcos).mockReturnValue({
    data: opcos,
  } as ReturnType<typeof useOpcos>);
  vi.mocked(useCatalog).mockReturnValue({
    data: catalog,
  } as ReturnType<typeof useCatalog>);
  vi.mocked(useLedger).mockReturnValue({
    data: [] as LedgerRow[],
  } as ReturnType<typeof useLedger>);
}

// jsdom 冇實作 URL.createObjectURL / revokeObjectURL,所以直接注入 stub
// (spyOn 對唔存在嘅 property 會 throw)。
const createUrl = vi.fn<(blob: Blob | MediaSource) => string>(
  () => 'blob:stub',
);
const revokeUrl = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = revokeUrl;
  vi.mocked(useAllocationImport).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useAllocationImport>);
});

describe('AllocationImportPanel — format guidance + template (W35 F2)', () => {
  it('講明三條對映規則(header code / column A alias / cells)', () => {
    mockData([sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' })]);
    render(<AllocationImportPanel />);
    expect(screen.getByText('CSV format')).toBeInTheDocument();
    expect(screen.getByText('Row 1')).toBeInTheDocument();
    expect(screen.getByText('Column A')).toBeInTheDocument();
    expect(screen.getByText('Cells')).toBeInTheDocument();
    // Grand Total 會被忽略 —— 要講出嚟,唔可以留操作者自己試
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
  });

  it('可以下載範本;檔案由 live OpCo + curated alias 生成', () => {
    mockData([
      sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' }),
      sku({ skuPartNumber: 'POWER_BI_PRO', businessAlias: 'PBI Pro' }),
    ]);
    render(<AllocationImportPanel />);

    // 一個 OpCo、兩個 curated SKU —— 個數係由 live 資料算出,唔係寫死文案
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /download template/i }));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    // 生出嚟嘅係 CSV blob(唔係 JSON / 唔係空)
    const blob = createUrl.mock.calls[0]![0] as Blob;
    expect(blob.type).toContain('text/csv');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('一個 alias 都未 curate → 唔生檔,出提示叫人先 curate', () => {
    mockData([sku({ skuPartNumber: 'SPE_E3' })]); // 冇 alias
    render(<AllocationImportPanel />);

    fireEvent.click(screen.getByRole('button', { name: /download template/i }));
    // 關鍵:寧可唔生檔都唔生一個空範本(空範本上傳會 0 mapped,讀落似 import 壞咗)
    expect(createUrl).not.toHaveBeenCalled();
    expect(
      screen.getByText(/curate at least one in SKU Catalog/i),
    ).toBeInTheDocument();
  });

  it('未 curate 嘅 active SKU 喺 import 前就講明係 out of scope', () => {
    mockData([
      sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' }),
      sku({ skuPartNumber: 'FLOW_FREE' }),
      sku({ skuPartNumber: 'DATAVERSE' }),
    ]);
    render(<AllocationImportPanel />);
    expect(
      screen.getByText(/2 active SKUs have no business alias/i),
    ).toBeInTheDocument();
    expect(screen.getByText('FLOW_FREE')).toBeInTheDocument();
    expect(screen.getByText('DATAVERSE')).toBeInTheDocument();
  });

  it('資料未到齊時 Download 掣係 disabled(唔會生半截檔)', () => {
    vi.mocked(useOpcos).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useOpcos>);
    vi.mocked(useCatalog).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useCatalog>);
    vi.mocked(useLedger).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useLedger>);
    render(<AllocationImportPanel />);
    expect(
      screen.getByRole('button', { name: /download template/i }),
    ).toBeDisabled();
  });
});
