'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useAddAdmissionCartItem, useAdmissionCart, useAdmissionCatalog } from '@/hooks/useAdmissions';
import { getApiErrorMessage } from '@/lib/api-error';
import type { AdmissionMajor, AdmissionMajorField, AdmissionMethodType, AdmissionSchool } from '@/services/admissionService';

const METHOD_LABEL: Record<AdmissionMethodType, string> = {
    thpt: 'Thi THPT',
    transcript: 'Học bạ',
    competency: 'Đánh giá năng lực',
    direct: 'Tuyển thẳng',
};

const FIELD_LABEL: Record<AdmissionMajorField, string> = {
    engineering: 'Kỹ thuật - Công nghệ',
    business: 'Kinh tế - Quản trị',
    health: 'Sức khỏe',
    social: 'Xã hội - Nhân văn',
};

type CatalogRow = {
    key: string;
    school: AdmissionSchool;
    major: AdmissionMajor;
};

export default function AdmissionsPage() {
    const catalogQuery = useAdmissionCatalog();
    const cartQuery = useAdmissionCart();
    const addMutation = useAddAdmissionCartItem();

    const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const cartProfile = cartQuery.data?.profile;
    const cartItemsCount = cartQuery.data?.items.length ?? 0;
    const schools = catalogQuery.data?.schools;

    const rows = useMemo<CatalogRow[]>(
        () =>
            (schools ?? []).flatMap((school) =>
                school.majors.map((major) => ({
                    key: `${school.id}-${major.id}`,
                    school,
                    major,
                }))
            ),
        [schools]
    );

    const handleAdd = async (schoolId: string, majorId: string, methodId: string) => {
        setMessage(null);
        setErrorMessage(null);

        try {
            const result = await addMutation.mutateAsync({ schoolId, majorId, methodId });
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
                    Xem nhanh các trường và ngành học, sau đó mở phương thức xét tuyển phù hợp để thêm vào yêu thích.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900">Thông tin hồ sơ</h2>
                    {cartQuery.isLoading ? (
                        <p className="text-sm text-slate-700">Đang tải thông tin hồ sơ...</p>
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
                            {cartProfile?.averageGrade == null && (
                                <p className="text-amber-700">
                                    Cập nhật điểm lớp 10, 11, 12 trong Hồ sơ cá nhân để ước tính chính xác hơn.
                                </p>
                            )}
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
                    <h2 className="text-lg font-semibold text-slate-900">Danh sách trường và ngành</h2>
                    <p className="text-sm text-slate-600">{rows.length} ngành học</p>
                </div>

                {catalogQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Đang tải danh sách trường học...</p>
                ) : catalogQuery.isError ? (
                    <p className="text-sm text-red-700">Không tải được danh sách trường học.</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-slate-700">Chưa có dữ liệu trường học.</p>
                ) : (
                    <div className="overflow-x-auto rounded-md border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                                <tr>
                                    <th scope="col" className="px-4 py-3">Tên trường</th>
                                    <th scope="col" className="px-4 py-3">Thành phố</th>
                                    <th scope="col" className="px-4 py-3">Tên ngành</th>
                                    <th scope="col" className="px-4 py-3">Khối ngành</th>
                                    <th scope="col" className="px-4 py-3">Phương thức</th>
                                    <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {rows.map((row) => {
                                    const expanded = expandedRowKey === row.key;
                                    return (
                                        <Fragment key={row.key}>
                                            <tr>
                                                <td className="px-4 py-3 font-medium text-slate-900">{row.school.name}</td>
                                                <td className="px-4 py-3 text-slate-700">{row.school.city}</td>
                                                <td className="px-4 py-3 text-slate-900">{row.major.name}</td>
                                                <td className="px-4 py-3 text-slate-700">{FIELD_LABEL[row.major.field]}</td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {row.major.admissionMethods.length} phương thức
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        className="px-3 py-1.5 text-xs"
                                                        aria-expanded={expanded}
                                                        onClick={() => setExpandedRowKey(expanded ? null : row.key)}
                                                    >
                                                        {expanded ? 'Ẩn phương thức' : 'Xem phương thức'}
                                                    </Button>
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr>
                                                    <td colSpan={6} className="bg-slate-50 px-4 py-4">
                                                        <div className="grid gap-3 md:grid-cols-2">
                                                            {row.major.admissionMethods.map((method) => (
                                                                <div
                                                                    key={method.id}
                                                                    className="rounded-md border border-slate-200 bg-white p-3"
                                                                >
                                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                                        <div>
                                                                            <p className="text-sm font-semibold text-slate-900">
                                                                                {method.name}
                                                                            </p>
                                                                            <p className="mt-1 text-xs text-slate-600">
                                                                                {METHOD_LABEL[method.type]} · Điểm tham chiếu{' '}
                                                                                {method.requiredAverage.toFixed(1)}
                                                                            </p>
                                                                        </div>
                                                                        <Button
                                                                            type="button"
                                                                            className="px-3 py-1.5 text-xs"
                                                                            disabled={addMutation.isPending}
                                                                            onClick={() =>
                                                                                void handleAdd(row.school.id, row.major.id, method.id)
                                                                            }
                                                                        >
                                                                            {addMutation.isPending ? 'Đang thêm...' : 'Thêm vào yêu thích'}
                                                                        </Button>
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-slate-700">
                                                                        {method.personalizedComment ?? method.description}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
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
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        </main>
    );
}
