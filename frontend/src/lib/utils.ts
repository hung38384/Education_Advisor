export const replacePathParams = (path: string, params: Record<string, string | number>) => {
    let newPath = path;
    Object.keys(params).forEach((key) => {
        newPath = newPath.replace(`{${key}}`, String(params[key]));
    });
    return newPath;
};

const UNIVERSITY_FULL_NAMES: Record<string, string> = {
    BKA: 'Đại học Bách khoa Hà Nội',
    CTU: 'Trường Đại học Cần Thơ',
    DDT: 'Đại học Duy Tân',
    DKH: 'Đại học Dược Hà Nội',
    HQT: 'Học viện Ngoại giao',
    KHA: 'Đại học Kinh tế Quốc dân',
    LPH: 'Đại học Luật Hà Nội',
    NTH: 'Đại học Ngoại thương',
    QHF: 'Đại học Ngoại ngữ - ĐHQGHN',
    QHI: 'Đại học Công nghệ - ĐHQGHN',
    QHX: 'Đại học Khoa học Xã hội và Nhân văn - ĐHQGHN',
    SPH: 'Đại học Sư phạm Hà Nội',
    TCT: 'Đại học Cần Thơ',
    TMU: 'Đại học Thương mại',
    YDS: 'Đại học Y Dược TP.HCM',
    YHB: 'Đại học Y Hà Nội',
};

const METHOD_LABELS: Record<string, string> = {
    CHUNG_CHI_QUOC_TE: 'Chứng chỉ quốc tế',
    DGNL_APT: 'Đánh giá năng lực ĐH Sư phạm Hà Nội',
    DGNL_CHUNG: 'Đánh giá năng lực',
    DGNL_HSA: 'Đánh giá năng lực HSA',
    DGTD_TSA: 'Đánh giá tư duy TSA',
    HOC_BA: 'Xét học bạ',
    KY_THI_RIENG: 'Kỳ thi riêng',
    NGOAI_NGU_KET_HOP: 'Ngoại ngữ kết hợp',
    THPT_QG: 'Điểm thi THPT',
    TOT_NGHIEP_QUOC_TE: 'Tốt nghiệp quốc tế',
    XET_TUYEN_TAI_NANG: 'Xét tuyển tài năng',
    'chung-chi-quoc-te': 'Chứng chỉ quốc tế',
    'diem-dg-tu-duy-dhbkhn': 'Đánh giá tư duy TSA',
    'diem-hoc-ba': 'Xét học bạ',
    'diem-thi-danh-gia-dau-vao-v-sat': 'Đánh giá đầu vào V-SAT',
    'diem-thi-dgnl-dh-su-pham-hn': 'Đánh giá năng lực ĐH Sư phạm Hà Nội',
    'diem-thi-dgnl-hn': 'Đánh giá năng lực HSA',
    'diem-thi-dgnl-qg-hcm': 'Đánh giá năng lực ĐHQG TP.HCM',
    'diem-thi-rieng': 'Kỳ thi riêng',
    'diem-thi-thpt': 'Điểm thi THPT',
    'uu-tien-xet-tuyen-xet-tuyen-thang': 'Ưu tiên xét tuyển / xét tuyển thẳng',
};

const CODE_LIKE_PATTERN = /^[A-Z0-9]{2,}$/;
const MOJIBAKE_PATTERN = /(?:Ã|Æ|Ä|á»|áº|â€)/;

function toTrimmedText(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function formatUniversityName(universityName: string | null | undefined, universityCode: string | null | undefined): string {
    const name = toTrimmedText(universityName);
    const code = toTrimmedText(universityCode).toUpperCase();
    const mappedName = UNIVERSITY_FULL_NAMES[code];
    const nameIsCode = Boolean(code && name.toUpperCase() === code);
    const nameIsPlaceholder = /^trường đại học \(mã:/i.test(name);

    if (name && !nameIsCode && !nameIsPlaceholder && !MOJIBAKE_PATTERN.test(name)) {
        return name;
    }

    return mappedName ?? 'Chưa cập nhật tên trường';
}

function resolveMethodLabel(value: string | null | undefined): string | null {
    const text = toTrimmedText(value);
    if (!text) {
        return null;
    }

    const canonicalKey = text.toUpperCase().replace(/[\s-]+/g, '_');
    const slugKey = text.toLowerCase().replace(/_/g, '-');
    return METHOD_LABELS[text] ?? METHOD_LABELS[canonicalKey] ?? METHOD_LABELS[slugKey] ?? null;
}

export function formatAdmissionMethodName(methodAlias: string | null | undefined, methodTag: string | null | undefined): string {
    const alias = toTrimmedText(methodAlias);
    const aliasLabel = resolveMethodLabel(alias);
    if (aliasLabel) {
        return aliasLabel;
    }

    if (alias && !alias.includes('-') && !alias.includes('_') && !CODE_LIKE_PATTERN.test(alias)) {
        return alias;
    }

    const tag = toTrimmedText(methodTag);
    const tagLabel = resolveMethodLabel(tag);
    if (tagLabel) {
        return tagLabel;
    }

    const readableTag = tag.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return readableTag || 'Chưa cập nhật phương thức';
}
