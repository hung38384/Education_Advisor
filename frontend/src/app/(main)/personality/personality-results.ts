import type { PersonalityScores, PersonalitySubmission } from '@/services/personalityService';

const DIMENSION_RAW_MAX_SCORE = 14;
const TOTAL_RAW_MAX_SCORE = 56;
export const DISPLAY_MAX_SCORE = 100;

export type DimensionKey = 'E/I' | 'S/N' | 'T/F' | 'J/P';
export type ScoreLetter = keyof PersonalityScores;

export interface DimensionResult {
    key: DimensionKey;
    title: string;
    firstLetter: ScoreLetter;
    secondLetter: ScoreLetter;
    firstLabel: string;
    secondLabel: string;
    firstScore: number;
    secondScore: number;
    dominantLetter: ScoreLetter;
    dominantLabel: string;
    dominantScore: number;
    scoreText: string;
    evaluation: string;
}

export interface MbtiInsight {
    title: string;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
}

const DIMENSION_DEFINITIONS: Array<{
    key: DimensionKey;
    title: string;
    firstLetter: ScoreLetter;
    secondLetter: ScoreLetter;
    firstLabel: string;
    secondLabel: string;
    firstEvaluation: string;
    secondEvaluation: string;
}> = [
    {
        key: 'E/I',
        title: 'Năng lượng và tương tác',
        firstLetter: 'E',
        secondLetter: 'I',
        firstLabel: 'Hướng ngoại',
        secondLabel: 'Hướng nội',
        firstEvaluation: 'Bạn có xu hướng nạp năng lượng qua giao tiếp, hoạt động nhóm và môi trường có nhiều tương tác. Điều này giúp bạn chủ động kết nối, dễ trao đổi ý tưởng và phù hợp với các bối cảnh cần hợp tác thường xuyên.',
        secondEvaluation: 'Bạn có xu hướng nạp năng lượng qua không gian riêng, quan sát kỹ và suy nghĩ trước khi hành động. Điều này giúp bạn tập trung sâu, chuẩn bị cẩn thận và phù hợp với các nhiệm vụ cần phân tích độc lập.',
    },
    {
        key: 'S/N',
        title: 'Cách tiếp nhận thông tin',
        firstLetter: 'S',
        secondLetter: 'N',
        firstLabel: 'Thực tế',
        secondLabel: 'Trực giác',
        firstEvaluation: 'Bạn thường chú ý dữ kiện cụ thể, kinh nghiệm thực tế và các bước có thể kiểm chứng. Cách tiếp cận này giúp bạn giữ sự chắc chắn khi học tập, lập kế hoạch và đánh giá lựa chọn.',
        secondEvaluation: 'Bạn thường chú ý ý nghĩa tổng quát, khả năng mới và mối liên hệ giữa các ý tưởng. Cách tiếp cận này giúp bạn nhìn xa, sáng tạo và nhanh chóng hình dung các hướng phát triển khác nhau.',
    },
    {
        key: 'T/F',
        title: 'Cách ra quyết định',
        firstLetter: 'T',
        secondLetter: 'F',
        firstLabel: 'Lý trí',
        secondLabel: 'Cảm xúc',
        firstEvaluation: 'Bạn có xu hướng ưu tiên logic, tiêu chí rõ ràng và sự công bằng khi đưa ra lựa chọn. Điều này giúp bạn phân tích vấn đề mạch lạc và giữ quyết định nhất quán với mục tiêu.',
        secondEvaluation: 'Bạn có xu hướng cân nhắc tác động đến con người, giá trị cá nhân và sự hài hòa khi đưa ra lựa chọn. Điều này giúp bạn thấu hiểu bối cảnh, duy trì quan hệ và chọn hướng đi phù hợp với động lực bên trong.',
    },
    {
        key: 'J/P',
        title: 'Cách tổ chức cuộc sống',
        firstLetter: 'J',
        secondLetter: 'P',
        firstLabel: 'Nguyên tắc',
        secondLabel: 'Linh hoạt',
        firstEvaluation: 'Bạn thường thích kế hoạch rõ ràng, tiến độ ổn định và mục tiêu được xác định trước. Điều này giúp bạn quản lý thời gian tốt, hoàn thành việc đúng hạn và giảm rủi ro khi có nhiều đầu việc.',
        secondEvaluation: 'Bạn thường thích sự linh hoạt, thích nghi nhanh và để mở nhiều lựa chọn trước khi quyết định. Điều này giúp bạn phản ứng tốt với thay đổi, khám phá cơ hội mới và duy trì sự sáng tạo trong quá trình học tập.',
    },
];

const DEFAULT_INSIGHT: MbtiInsight = {
    title: 'Phong cách cá nhân đang được ghi nhận',
    summary: 'Kết quả cho thấy bạn có một tổ hợp xu hướng riêng trong cách học, giao tiếp và ra quyết định. Hãy xem từng nhóm điểm bên dưới để hiểu rõ phần nổi bật nhất của bản thân.',
    strengths: [
        'Có khả năng nhận diện sở thích và cách làm việc cá nhân qua từng nhóm điểm.',
        'Có cơ sở để chọn môi trường học tập phù hợp hơn với nhịp làm việc của mình.',
        'Có thể dùng kết quả này như điểm bắt đầu để trao đổi với cố vấn học tập.',
    ],
    weaknesses: [
        'Dễ diễn giải kết quả quá cứng nhắc nếu chỉ nhìn vào một nhãn MBTI.',
        'Một vài xu hướng có thể thay đổi theo môi trường học tập, áp lực và trải nghiệm mới.',
        'Cần kết hợp thêm năng lực học thuật, sở thích ngành nghề và mục tiêu cá nhân.',
    ],
    improvements: [
        'Đối chiếu kết quả với trải nghiệm học tập thực tế trong các môn bạn thích và không thích.',
        'Thử điều chỉnh cách học theo nhóm điểm nổi bật, sau đó ghi lại mức độ hiệu quả.',
        'Trao đổi với giáo viên, cố vấn hoặc bạn bè để có góc nhìn khách quan hơn.',
    ],
};

const MBTI_INSIGHTS: Record<string, MbtiInsight> = {
    ISTJ: {
        title: 'Người trách nhiệm và thực tế',
        summary: 'Bạn thường học tốt khi mục tiêu rõ ràng, yêu cầu cụ thể và tiến độ được tổ chức ổn định. Bạn phù hợp với môi trường coi trọng sự chính xác, kỷ luật và kết quả có thể đo lường.',
        strengths: ['Đáng tin cậy và có trách nhiệm với cam kết học tập.', 'Giỏi theo dõi chi tiết, quy trình và tiêu chuẩn đánh giá.', 'Có khả năng duy trì tiến độ đều đặn trong thời gian dài.'],
        weaknesses: ['Có thể ngại thay đổi khi kế hoạch ban đầu không còn phù hợp.', 'Dễ tập trung vào chi tiết mà bỏ lỡ bức tranh tổng thể.', 'Có thể tự gây áp lực khi mọi việc chưa đạt chuẩn mong muốn.'],
        improvements: ['Dành thời gian nhìn lại mục tiêu dài hạn trước khi tối ưu từng bước nhỏ.', 'Tập thử các phương án học mới trong phạm vi an toàn để tăng độ linh hoạt.', 'Chia nhỏ tiêu chuẩn hoàn thành để tránh cầu toàn quá mức.'],
    },
    ISFJ: {
        title: 'Người tận tâm và hỗ trợ',
        summary: 'Bạn thường quan tâm đến sự ổn định, trách nhiệm và tác động của việc học đến những người xung quanh. Bạn phù hợp với môi trường có cấu trúc rõ, quan hệ tích cực và mục tiêu mang ý nghĩa thực tế.',
        strengths: ['Kiên trì, chu đáo và nghiêm túc với nhiệm vụ được giao.', 'Dễ tạo sự tin tưởng trong nhóm học tập hoặc dự án chung.', 'Có khả năng ghi nhớ chi tiết và chăm sóc chất lượng đầu ra.'],
        weaknesses: ['Có thể ngại nói ra nhu cầu cá nhân khi muốn giữ hòa khí.', 'Dễ nhận quá nhiều trách nhiệm thay cho người khác.', 'Có thể chậm thử hướng mới nếu chưa thấy đủ an toàn.'],
        improvements: ['Tập đặt ranh giới rõ khi tham gia nhóm hoặc nhận nhiệm vụ.', 'Chủ động hỏi phản hồi để tránh tự suy đoán kỳ vọng của người khác.', 'Thử các vai trò mới từng bước nhỏ để mở rộng vùng thoải mái.'],
    },
    INFJ: {
        title: 'Người định hướng ý nghĩa',
        summary: 'Bạn thường tìm kiếm ý nghĩa sâu xa trong việc học và muốn lựa chọn phù hợp với giá trị cá nhân. Bạn phù hợp với môi trường cho phép suy nghĩ độc lập, phát triển con người và theo đuổi mục tiêu dài hạn.',
        strengths: ['Có khả năng nhìn ra động lực và nhu cầu ẩn sau vấn đề.', 'Kiên định với mục tiêu có ý nghĩa cá nhân.', 'Biết kết nối ý tưởng thành định hướng phát triển dài hạn.'],
        weaknesses: ['Có thể đặt kỳ vọng quá cao vào bản thân hoặc môi trường.', 'Dễ quá tải khi phải xử lý nhiều xung đột cảm xúc.', 'Có thể mất thời gian ra quyết định vì muốn mọi thứ thật phù hợp.'],
        improvements: ['Biến mục tiêu lớn thành các bước thử nghiệm nhỏ và có hạn định.', 'Tách dữ kiện thực tế khỏi cảm nhận cá nhân khi đánh giá lựa chọn.', 'Trao đổi sớm với người tin cậy để tránh tự xử lý quá nhiều.'],
    },
    INTJ: {
        title: 'Người chiến lược và độc lập',
        summary: 'Bạn thường thích hệ thống rõ ràng, mục tiêu dài hạn và cơ hội tự tối ưu cách học. Bạn phù hợp với môi trường đề cao tư duy phân tích, năng lực tự chủ và các thử thách có chiều sâu.',
        strengths: ['Giỏi xây dựng chiến lược học tập và nhìn trước hệ quả.', 'Tự học tốt khi có mục tiêu đủ rõ và tài nguyên phù hợp.', 'Có khả năng phân tích điểm yếu của hệ thống để cải thiện.'],
        weaknesses: ['Có thể thiếu kiên nhẫn với quy trình kém hiệu quả.', 'Dễ đánh giá thấp yếu tố cảm xúc hoặc quan hệ trong nhóm.', 'Có thể giữ ý tưởng quá lâu trước khi kiểm chứng thực tế.'],
        improvements: ['Kiểm chứng kế hoạch bằng phản hồi sớm thay vì chỉ tối ưu trên giấy.', 'Luyện trình bày lý do quyết định theo cách dễ tiếp nhận với người khác.', 'Đặt mốc nghỉ và phục hồi để tránh làm việc quá căng trong thời gian dài.'],
    },
    ISTP: {
        title: 'Người phân tích linh hoạt',
        summary: 'Bạn thường học tốt qua thực hành, quan sát trực tiếp và tự khám phá cách hệ thống vận hành. Bạn phù hợp với môi trường có tính ứng dụng, cho phép thử nghiệm và giải quyết vấn đề cụ thể.',
        strengths: ['Bình tĩnh khi xử lý tình huống thực tế hoặc sự cố bất ngờ.', 'Giỏi phân tích cơ chế hoạt động và tìm cách làm hiệu quả.', 'Thích nghi nhanh khi có dữ kiện mới.'],
        weaknesses: ['Có thể mất hứng với lý thuyết dài nếu chưa thấy ứng dụng rõ.', 'Dễ trì hoãn phần lập kế hoạch hoặc ghi chép hệ thống.', 'Có thể ít chia sẻ suy nghĩ khiến người khác khó theo kịp.'],
        improvements: ['Liên hệ mỗi phần lý thuyết với một ví dụ hoặc bài tập thực hành.', 'Dùng checklist ngắn để giữ tiến độ mà không tạo cảm giác gò bó.', 'Tóm tắt quyết định chính cho nhóm sau mỗi lần phân tích.'],
    },
    ISFP: {
        title: 'Người tinh tế và thực hành',
        summary: 'Bạn thường học tốt khi được gắn kiến thức với trải nghiệm cá nhân, sản phẩm cụ thể và giá trị mình quan tâm. Bạn phù hợp với môi trường linh hoạt, tôn trọng cá tính và có không gian thể hiện qua hành động.',
        strengths: ['Nhạy cảm với chất lượng trải nghiệm và nhu cầu cá nhân.', 'Có gu thẩm mỹ, sự tinh tế và khả năng quan sát thực tế.', 'Làm việc tận tâm khi thấy nhiệm vụ có ý nghĩa.'],
        weaknesses: ['Có thể tránh xung đột dù vấn đề cần được nói rõ.', 'Dễ mất động lực với mục tiêu quá trừu tượng hoặc xa cảm xúc cá nhân.', 'Có thể thiếu cấu trúc khi phải xử lý nhiều hạn chót cùng lúc.'],
        improvements: ['Chuyển mục tiêu học tập thành sản phẩm hoặc ví dụ cụ thể.', 'Tập phản hồi ngắn gọn, trung thực khi có điều chưa phù hợp.', 'Dùng lịch nhắc mềm để giữ tiến độ nhưng vẫn còn không gian linh hoạt.'],
    },
    INFP: {
        title: 'Người lý tưởng và giàu cảm hứng',
        summary: 'Bạn thường học tốt khi nội dung gắn với giá trị, câu chuyện và khả năng tạo tác động tích cực. Bạn phù hợp với môi trường khuyến khích sự tự chủ, sáng tạo và phát triển bản sắc cá nhân.',
        strengths: ['Có khả năng đồng cảm và hiểu nhiều góc nhìn khác nhau.', 'Sáng tạo khi được theo đuổi chủ đề có ý nghĩa.', 'Kiên trì với mục tiêu phù hợp với giá trị cá nhân.'],
        weaknesses: ['Dễ nản nếu môi trường quá máy móc hoặc thiếu ý nghĩa.', 'Có thể trì hoãn khi tiêu chuẩn nội tâm chưa rõ ràng.', 'Dễ bị ảnh hưởng bởi phản hồi tiêu cực nếu chưa tách được việc và giá trị bản thân.'],
        improvements: ['Đặt tiêu chí hoàn thành tối thiểu trước khi tinh chỉnh thêm.', 'Kết nối môn học bắt buộc với một câu hỏi hoặc giá trị cá nhân.', 'Xin phản hồi cụ thể về sản phẩm thay vì diễn giải phản hồi như đánh giá con người.'],
    },
    INTP: {
        title: 'Người tư duy hệ thống',
        summary: 'Bạn thường thích hiểu nguyên lý, mô hình và logic bên trong vấn đề. Bạn phù hợp với môi trường cho phép đặt câu hỏi, nghiên cứu sâu và tự do thử các cách giải khác nhau.',
        strengths: ['Phân tích khái niệm tốt và nhanh nhận ra điểm chưa nhất quán.', 'Tò mò, độc lập và có khả năng tự học các chủ đề phức tạp.', 'Giỏi tạo mô hình hoặc cách giải thích mới cho vấn đề khó.'],
        weaknesses: ['Có thể phân tích quá lâu trước khi hoàn thành sản phẩm cuối.', 'Dễ chán với phần lặp lại hoặc thủ tục hành chính.', 'Có thể trình bày ý tưởng quá trừu tượng với người chưa có nền tảng.'],
        improvements: ['Đặt hạn chót cho giai đoạn khám phá để chuyển sang hoàn thiện.', 'Viết bản tóm tắt đơn giản trước khi trình bày phân tích sâu.', 'Ghép nhiệm vụ lặp lại với mục tiêu học thuật lớn hơn để giữ động lực.'],
    },
    ESTP: {
        title: 'Người hành động và ứng biến',
        summary: 'Bạn thường học tốt qua trải nghiệm trực tiếp, thử thách thực tế và phản hồi nhanh. Bạn phù hợp với môi trường năng động, có hoạt động tương tác và cơ hội giải quyết vấn đề ngay tại chỗ.',
        strengths: ['Nhanh nhạy với tình huống và cơ hội trước mắt.', 'Giao tiếp tự nhiên trong môi trường có nhiều tương tác.', 'Dám thử, dám điều chỉnh và không dễ bị kẹt trong lý thuyết.'],
        weaknesses: ['Có thể bỏ qua chuẩn bị dài hạn nếu nhiệm vụ chưa cấp bách.', 'Dễ mất kiên nhẫn với chi tiết hoặc quy định chậm chạp.', 'Có thể quyết định nhanh trước khi cân nhắc đủ hệ quả.'],
        improvements: ['Dùng kế hoạch ngắn theo tuần để giữ định hướng mà không quá gò bó.', 'Kiểm tra rủi ro chính trước khi hành động nhanh.', 'Kết hợp hoạt động thực hành với phần tổng kết sau trải nghiệm.'],
    },
    ESFP: {
        title: 'Người năng động và kết nối',
        summary: 'Bạn thường học tốt trong môi trường sinh động, có tương tác và có thể thấy tác động ngay. Bạn phù hợp với hoạt động nhóm, thuyết trình, trải nghiệm thực tế và các nhiệm vụ có yếu tố con người.',
        strengths: ['Dễ tạo bầu không khí tích cực trong nhóm.', 'Thích nghi nhanh với người mới và tình huống mới.', 'Học hiệu quả khi được trải nghiệm, trao đổi và phản hồi trực tiếp.'],
        weaknesses: ['Có thể khó duy trì tập trung với nhiệm vụ dài và ít tương tác.', 'Dễ ưu tiên cảm hứng hiện tại hơn kế hoạch dài hạn.', 'Có thể né các phần phân tích khô nếu chưa thấy liên quan cá nhân.'],
        improvements: ['Biến nhiệm vụ cá nhân thành phiên học có tương tác hoặc phản hồi.', 'Chia mục tiêu dài thành các mốc nhỏ có phần thưởng rõ.', 'Dành vài phút sau mỗi hoạt động để ghi lại bài học chính.'],
    },
    ENFP: {
        title: 'Người sáng tạo và truyền cảm hứng',
        summary: 'Bạn thường học tốt khi được khám phá ý tưởng mới, kết nối con người và tự chọn hướng tiếp cận. Bạn phù hợp với môi trường mở, nhiều dự án sáng tạo và có cơ hội tạo ảnh hưởng tích cực.',
        strengths: ['Nhiều ý tưởng, dễ nhìn thấy khả năng mới trong vấn đề quen thuộc.', 'Truyền năng lượng tốt cho nhóm và dễ kết nối người khác.', 'Linh hoạt khi đổi góc nhìn hoặc thử cách tiếp cận mới.'],
        weaknesses: ['Có thể bắt đầu nhiều ý tưởng hơn khả năng hoàn thành.', 'Dễ mất hứng khi bước vào giai đoạn chi tiết và lặp lại.', 'Có thể ra quyết định theo cảm hứng trước khi kiểm tra nguồn lực.'],
        improvements: ['Chọn ít ưu tiên chính và đóng băng phạm vi trước khi triển khai.', 'Làm việc cùng người giỏi cấu trúc để biến ý tưởng thành tiến độ.', 'Đặt tiêu chí hoàn thành rõ cho từng dự án sáng tạo.'],
    },
    ENTP: {
        title: 'Người khám phá và phản biện',
        summary: 'Bạn thường thích tranh luận ý tưởng, tìm phương án mới và thử thách giả định cũ. Bạn phù hợp với môi trường khuyến khích đổi mới, tư duy phản biện và giải quyết vấn đề mở.',
        strengths: ['Nhanh nhìn thấy lỗ hổng trong lập luận và cơ hội cải tiến.', 'Sáng tạo trong cách tiếp cận vấn đề chưa có lời giải cố định.', 'Tự tin trao đổi, thử nghiệm và điều chỉnh ý tưởng.'],
        weaknesses: ['Có thể tranh luận quá mạnh khiến người khác thấy bị phủ nhận.', 'Dễ bỏ dở khi vấn đề đã hết mới lạ.', 'Có thể xem nhẹ quy trình hoàn thiện chi tiết.'],
        improvements: ['Tách giai đoạn phản biện khỏi giai đoạn thống nhất để nhóm dễ theo kịp.', 'Cam kết mốc bàn giao nhỏ trước khi chuyển sang ý tưởng tiếp theo.', 'Giao hoặc tự đặt checklist hoàn thiện cho phần chi tiết cuối cùng.'],
    },
    ESTJ: {
        title: 'Người tổ chức và định hướng kết quả',
        summary: 'Bạn thường học tốt khi mục tiêu, vai trò và tiêu chuẩn đánh giá rõ ràng. Bạn phù hợp với môi trường có cấu trúc, yêu cầu hiệu suất và cơ hội điều phối nguồn lực để đạt kết quả.',
        strengths: ['Giỏi lập kế hoạch, phân công và theo dõi tiến độ.', 'Thực tế, quyết đoán và tập trung vào kết quả cụ thể.', 'Có khả năng duy trì kỷ luật trong nhóm hoặc dự án.'],
        weaknesses: ['Có thể thiếu kiên nhẫn với cách làm chậm hoặc thiếu rõ ràng.', 'Dễ ưu tiên hiệu quả hơn cảm nhận của người tham gia.', 'Có thể bám vào quy trình quen thuộc dù cần đổi mới.'],
        improvements: ['Dành thời gian lắng nghe rào cản cá nhân trước khi điều chỉnh kế hoạch.', 'Cho phép thử nghiệm nhỏ trước khi kết luận một cách làm mới không hiệu quả.', 'Cân bằng chỉ số kết quả với chất lượng hợp tác trong nhóm.'],
    },
    ESFJ: {
        title: 'Người hợp tác và trách nhiệm',
        summary: 'Bạn thường học tốt trong môi trường có quan hệ tích cực, vai trò rõ và mục tiêu chung. Bạn phù hợp với hoạt động nhóm, dịch vụ cộng đồng, cố vấn đồng đẳng và các ngành cần sự phối hợp con người.',
        strengths: ['Quan tâm đến nhu cầu người khác và duy trì tinh thần nhóm tốt.', 'Có trách nhiệm, đúng hẹn và đáng tin trong nhiệm vụ chung.', 'Dễ biến mục tiêu tập thể thành hành động cụ thể.'],
        weaknesses: ['Có thể phụ thuộc nhiều vào sự công nhận từ bên ngoài.', 'Dễ khó chịu khi nhóm thiếu cam kết hoặc thiếu hòa khí.', 'Có thể tránh quyết định gây xung đột dù cần thiết.'],
        improvements: ['Đặt tiêu chuẩn tự đánh giá bên cạnh phản hồi từ người khác.', 'Tập nói rõ kỳ vọng và giới hạn khi làm việc nhóm.', 'Nhìn xung đột như dữ liệu cần xử lý, không chỉ là dấu hiệu quan hệ xấu.'],
    },
    ENFJ: {
        title: 'Người dẫn dắt và phát triển con người',
        summary: 'Bạn thường học tốt khi được kết nối mục tiêu cá nhân với tác động đến cộng đồng hoặc nhóm. Bạn phù hợp với môi trường cần giao tiếp, định hướng, hỗ trợ người khác và xây dựng tầm nhìn chung.',
        strengths: ['Truyền cảm hứng và giúp người khác nhìn thấy khả năng phát triển.', 'Có khả năng tổ chức nhóm quanh mục tiêu có ý nghĩa.', 'Nhạy với động lực, cảm xúc và nhu cầu của người tham gia.'],
        weaknesses: ['Có thể ôm quá nhiều trách nhiệm vì muốn hỗ trợ mọi người.', 'Dễ bỏ qua nhu cầu riêng khi ưu tiên tập thể.', 'Có thể khó tiếp nhận phản hồi lạnh hoặc quá kỹ thuật.'],
        improvements: ['Đặt giới hạn thời gian cho vai trò hỗ trợ để bảo vệ năng lượng cá nhân.', 'Kết hợp cảm nhận về con người với dữ liệu khách quan khi ra quyết định.', 'Tìm người phản biện thẳng thắn để cân bằng góc nhìn.'],
    },
    ENTJ: {
        title: 'Người lãnh đạo chiến lược',
        summary: 'Bạn thường học tốt khi có thử thách lớn, mục tiêu tham vọng và quyền chủ động tổ chức cách đạt kết quả. Bạn phù hợp với môi trường cạnh tranh lành mạnh, quản trị, chiến lược và các dự án cần định hướng rõ.',
        strengths: ['Quyết đoán, có tầm nhìn và biết chuyển mục tiêu thành kế hoạch.', 'Giỏi nhận diện nguồn lực, ưu tiên và điểm nghẽn trong hệ thống.', 'Có khả năng dẫn dắt nhóm qua nhiệm vụ khó.'],
        weaknesses: ['Có thể tạo áp lực cao cho bản thân và người khác.', 'Dễ bỏ qua tín hiệu cảm xúc nếu quá tập trung vào mục tiêu.', 'Có thể quyết định nhanh trước khi nhóm kịp đồng thuận.'],
        improvements: ['Kiểm tra mức sẵn sàng của nhóm trước khi tăng tốc.', 'Dành không gian cho phản hồi cảm xúc bên cạnh phản hồi hiệu suất.', 'Xác định tiêu chí thành công bền vững thay vì chỉ tối ưu kết quả ngắn hạn.'],
    },
};

function getDominantScore(scores: PersonalityScores, firstLetter: ScoreLetter, secondLetter: ScoreLetter): number {
    return Math.max(scores[firstLetter], scores[secondLetter]);
}

function toDisplayScore(score: number, maxScore: number): number {
    return Math.round((score / maxScore) * DISPLAY_MAX_SCORE);
}

export function getTotalScore(scores: PersonalityScores): number {
    return DIMENSION_DEFINITIONS.reduce((total, dimension) => {
        return total + getDominantScore(scores, dimension.firstLetter, dimension.secondLetter);
    }, 0);
}

export function getTotalDisplayScore(scores: PersonalityScores): number {
    return toDisplayScore(getTotalScore(scores), TOTAL_RAW_MAX_SCORE);
}

export function buildDimensionResults(scores: PersonalityScores): DimensionResult[] {
    return DIMENSION_DEFINITIONS.map((dimension) => {
        const firstScore = scores[dimension.firstLetter];
        const secondScore = scores[dimension.secondLetter];
        const firstIsDominant = firstScore > secondScore;
        const dominantLetter = firstIsDominant ? dimension.firstLetter : dimension.secondLetter;
        const dominantLabel = firstIsDominant ? dimension.firstLabel : dimension.secondLabel;
        const dominantScore = firstIsDominant ? firstScore : secondScore;
        const evaluation = firstIsDominant ? dimension.firstEvaluation : dimension.secondEvaluation;

        return {
            key: dimension.key,
            title: dimension.title,
            firstLetter: dimension.firstLetter,
            secondLetter: dimension.secondLetter,
            firstLabel: dimension.firstLabel,
            secondLabel: dimension.secondLabel,
            firstScore,
            secondScore,
            dominantLetter,
            dominantLabel,
            dominantScore,
            scoreText: `${toDisplayScore(dominantScore, DIMENSION_RAW_MAX_SCORE)}/${DISPLAY_MAX_SCORE} điểm`,
            evaluation,
        };
    });
}

export function getMbtiInsight(mbtiType: string): MbtiInsight {
    return MBTI_INSIGHTS[mbtiType.toUpperCase()] ?? DEFAULT_INSIGHT;
}

export function formatSubmissionDate(createdAt: string): string {
    return new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(createdAt));
}

export function getSubmissionTitle(submission: PersonalitySubmission): string {
    return `${submission.mbtiType} · ${getTotalDisplayScore(submission.scores)}/${DISPLAY_MAX_SCORE} điểm`;
}
