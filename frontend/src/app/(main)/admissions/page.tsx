'use client';

import Link from 'next/link';
import { ChangeEvent, Fragment, useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useAddAdmissionCartItem, useAdmissionCart, useAdmissionCatalog } from '@/hooks/useAdmissions';
import { getApiErrorMessage } from '@/lib/api-error';
import type {
    AdmissionCatalogItem,
    AdmissionCatalogMethod,
    AdmissionSearchParams,
} from '@/services/admissionService';

type AdmissionFilters = {
    q: string;
    year: string;
    methodTag: string;
    universityCode: string;
    minScore: string;
    maxScore: string;
};

const INITIAL_FILTERS: AdmissionFilters = {
    q: '',
    year: '',
    methodTag: '',
    universityCode: '',
    minScore: '',
    maxScore: '',
};

const PAGE_SIZE = 15;
const INPUT_CLASS =
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

function toScoreText(method: AdmissionCatalogMethod): string {
    if (method.yearlyScores.length === 0) {
        return 'Chưa có dữ liệu';
    }

    return method.yearlyScores.map((entry) => `${entry.year}: ${entry.score}`).join(' | ');
}

function toSubjectText(method: AdmissionCatalogMethod): string {
    return method.subjectCombinations.length > 0 ? method.subjectCombinations.join(', ') : 'Chưa có dữ liệu';
}

export default function AdmissionsPage() {
    const [filters, setFilters] = useState<AdmissionFilters>(INITIAL_FILTERS);
    const [page, setPage] = useState(1);
    const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const queryParams = useMemo<AdmissionSearchParams>(() => {
        const params: AdmissionSearchParams = {
            page,
            pageSize: PAGE_SIZE,
        };

        if (filters.q.trim()) {
            params.q = filters.q.trim();
        }
        if (filters.year) {
            params.year = Number(filters.year);
        }
        if (filters.methodTag) {
            params.methodTag = filters.methodTag;
        }
        if (filters.universityCode) {
            params.universityCode = filters.universityCode;
        }
        if (filters.minScore) {
            params.minScore = Number(filters.minScore);
        }
        if (filters.maxScore) {
            params.maxScore = Number(filters.maxScore);
        }

        return params;
    }, [filters, page]);

    const catalogQuery = useAdmissionCatalog(queryParams);
    const cartQuery = useAdmissionCart();
    const addMutation = useAddAdmissionCartItem();

    const catalog = catalogQuery.data;
    const rows = catalog?.items ?? [];
    const cartProfile = cartQuery.data?.profile;
    const cartItemsCount = cartQuery.data?.items.length ?? 0;

    const handleFilterChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = event.target;
        setFilters((current) => ({
            ...current,
            [name]: value,
        }));
        setPage(1);
        setExpandedRowKey(null);
    };

    const handleResetFilters = () => {
        setFilters(INITIAL_FILTERS);
        setPage(1);
        setExpandedRowKey(null);
    };

    const handleAdd = async (item: AdmissionCatalogItem, method: AdmissionCatalogMethod) => {
        const schoolName = item.universityName || item.universityCode;
        const methodName = method.methodAlias || method.methodTag;
        const latestScore = method.yearlyScores[0]?.score ?? 0;
        const description = method.shortComment || 'Chưa có dữ liệu';

        setMessage(null);
        setErrorMessage(null);

        try {
            const result = await addMutation.mutateAsync({
                schoolId: item.universityCode,
                majorId: item.majorCode,
                methodId: method.methodTag,
                snapshot: {
                    schoolName,
                    majorName: item.majorName,
                    methodName,
                    requiredAverage: latestScore,
                    description,
                },
            });
            setMessage(`Đã thêm vào mục yêu thích: ${result.item.school.name} - ${result.item.major.name}.`);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không thể thêm lựa chọn này vào yêu thích'));
        }
    };

    return (
        <main className="space-y-5">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-slate-900">Trường học</h1>
                <p className="text-sm text-slate-600">
                    Tra cứu catalog xét tuyển theo trường, ngành, phương thức và điểm chuẩn từng năm.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900">Thông tin hồ sơ</h2>
                    {cartQuery.isLoading ? (
                        <p className="text-sm text-slate-700">Đang tải thông tin hồ sơ...</p>
                    ) : cartQuery.isError ? (
                        <p className="text-sm text-red-700">Không tải được thông tin hồ sơ xét tuyển.</p>
                    ) : (
                        <div className="grid gap-1 text-sm text-slate-700">
                            <p>
                                Học sinh: <strong>{cartProfile?.fullName ?? 'Chưa cập nhật'}</strong>
                            </p>
                            <p>
                                Điểm trung bình: <strong>{cartProfile?.averageGrade?.toFixed(2) ?? 'Chưa có'}</strong>
                            </p>
                            <p>
                                Môn yêu thích:{' '}
                                <strong>{cartProfile?.favoriteSubjects.join(', ') || 'Chưa cập nhật'}</strong>
                            </p>
                        </div>
                    )}
                </Card>

                <Card className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900">Yêu thích xét tuyển</h2>
                    <p className="text-sm text-slate-700">
                        Bạn đang có <strong>{cartItemsCount}</strong> lựa chọn trong mục yêu thích.
                    </p>
                    <Link className="text-sm font-medium text-slate-900 underline" href="/admissions/favorites">
                        Mở mục yêu thích để xem đánh giá và kế hoạch học tập
                    </Link>
                </Card>
            </div>

            <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Danh sách trường và ngành</h2>
                        <p className="text-sm text-slate-600">
                            {catalog ? `${catalog.total} kết quả` : 'Đang chuẩn bị dữ liệu'} · 15 dòng/trang
                        </p>
                    </div>
                    {catalogQuery.isFetching && !catalogQuery.isLoading && (
                        <span className="text-sm text-slate-500">Đang cập nhật...</span>
                    )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="space-y-1 xl:col-span-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Tìm kiếm</span>
                        <input
                            className={INPUT_CLASS}
                            name="q"
                            value={filters.q}
                            onChange={handleFilterChange}
                            placeholder="Tên trường, mã ngành..."
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Năm</span>
                        <select className={INPUT_CLASS} name="year" value={filters.year} onChange={handleFilterChange}>
                            <option value="">Tất cả</option>
                            {catalog?.filters.years.map((year) => (
                                <option key={year} value={year}>
                                    {year}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Phương thức</span>
                        <select
                            className={INPUT_CLASS}
                            name="methodTag"
                            value={filters.methodTag}
                            onChange={handleFilterChange}
                        >
                            <option value="">Tất cả</option>
                            {catalog?.filters.methodTags.map((methodTag) => (
                                <option key={methodTag} value={methodTag}>
                                    {methodTag}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Trường</span>
                        <select
                            className={INPUT_CLASS}
                            name="universityCode"
                            value={filters.universityCode}
                            onChange={handleFilterChange}
                        >
                            <option value="">Tất cả</option>
                            {catalog?.filters.universities.map((university) => (
                                <option key={university.code} value={university.code}>
                                    {university.name ? `${university.code} - ${university.name}` : university.code}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Điểm từ</span>
                            <input
                                className={INPUT_CLASS}
                                name="minScore"
                                value={filters.minScore}
                                onChange={handleFilterChange}
                                type="number"
                                min="0"
                                step="0.1"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Đến</span>
                            <input
                                className={INPUT_CLASS}
                                name="maxScore"
                                value={filters.maxScore}
                                onChange={handleFilterChange}
                                type="number"
                                min="0"
                                step="0.1"
                            />
                        </label>
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={handleResetFilters}>
                        Xóa bộ lọc
                    </Button>
                </div>

                {catalogQuery.isLoading ? (
                    <p className="rounded-md bg-slate-50 px-4 py-6 text-sm text-slate-700">Đang tải danh sách xét tuyển...</p>
                ) : catalogQuery.isError ? (
                    <p className="rounded-md bg-red-50 px-4 py-6 text-sm text-red-700">
                        Không tải được danh sách xét tuyển. Vui lòng thử lại sau.
                    </p>
                ) : rows.length === 0 ? (
                    <p className="rounded-md bg-slate-50 px-4 py-6 text-sm text-slate-700">
                        Không có trường-ngành phù hợp với bộ lọc hiện tại.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-md border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                                <tr>
                                    <th scope="col" className="px-4 py-3">Mã trường</th>
                                    <th scope="col" className="px-4 py-3">Tên trường</th>
                                    <th scope="col" className="px-4 py-3">Mã ngành</th>
                                    <th scope="col" className="px-4 py-3">Tên ngành</th>
                                    <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {rows.map((item) => {
                                    const rowKey = `${item.universityCode}:${item.majorCode}`;
                                    const expanded = expandedRowKey === rowKey;
                                    return (
                                        <Fragment key={rowKey}>
                                            <tr>
                                                <td className="px-4 py-3 font-medium text-slate-900">{item.universityCode}</td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {item.universityName || item.universityCode}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">{item.majorCode}</td>
                                                <td className="px-4 py-3 text-slate-900">{item.majorName}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        className="px-3 py-1.5 text-xs"
                                                        aria-expanded={expanded}
                                                        onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                                                    >
                                                        {expanded ? 'Ẩn phương thức' : 'Xem phương thức'}
                                                    </Button>
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr>
                                                    <td colSpan={5} className="bg-slate-50 px-4 py-4">
                                                        {item.methods.length === 0 ? (
                                                            <p className="text-sm text-slate-700">Chưa có dữ liệu phương thức xét tuyển.</p>
                                                        ) : (
                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                {item.methods.map((method) => {
                                                                    const methodName = method.methodAlias || method.methodTag;
                                                                    return (
                                                                        <div
                                                                            key={method.methodTag}
                                                                            className="rounded-md border border-slate-200 bg-white p-3"
                                                                        >
                                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                                <div className="space-y-1">
                                                                                    <p className="text-sm font-semibold text-slate-900">
                                                                                        {methodName}
                                                                                    </p>
                                                                                    <p className="text-xs text-slate-500">{method.methodTag}</p>
                                                                                </div>
                                                                                <Button
                                                                                    type="button"
                                                                                    className="px-3 py-1.5 text-xs"
                                                                                    disabled={addMutation.isPending}
                                                                                    onClick={() => void handleAdd(item, method)}
                                                                                >
                                                                                    {addMutation.isPending
                                                                                        ? 'Đang thêm...'
                                                                                        : 'Thêm vào yêu thích'}
                                                                                </Button>
                                                                            </div>
                                                                            <div className="mt-3 grid gap-2 text-sm text-slate-700">
                                                                                <p>
                                                                                    <span className="font-medium text-slate-900">Tổ hợp: </span>
                                                                                    {toSubjectText(method)}
                                                                                </p>
                                                                                <p>
                                                                                    <span className="font-medium text-slate-900">Điểm theo năm: </span>
                                                                                    {toScoreText(method)}
                                                                                </p>
                                                                                <p>
                                                                                    <span className="font-medium text-slate-900">Ghi chú: </span>
                                                                                    {method.shortComment || 'Chưa có dữ liệu'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {catalog && catalog.totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                        <span>
                            Trang {catalog.page} / {catalog.totalPages}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                className="px-3 py-1.5 text-xs"
                                disabled={page <= 1 || catalogQuery.isFetching}
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                            >
                                Trang trước
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                className="px-3 py-1.5 text-xs"
                                disabled={page >= catalog.totalPages || catalogQuery.isFetching}
                                onClick={() => setPage((current) => Math.min(catalog.totalPages, current + 1))}
                            >
                                Trang sau
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        </main>
    );
}
