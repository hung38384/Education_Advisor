import {
    PersonalityAnswer,
    PersonalityQuestion,
    PersonalityScores,
    PersonalitySubmission,
    SubmitPersonalityInput,
} from '../model/personality.model';
import { PersonalityRepository } from '../repository/personality.repository';

const QUESTIONS: PersonalityQuestion[] = [
    {
        id: 'q1',
        prompt: 'Sau một tuần làm việc hoặc học tập vất vả, bạn thường phục hồi năng lượng bằng cách:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Tham gia các buổi tiệc tùng, sự kiện sôi động có rất đông người tham dự.' },
            { value: 'B', label: 'Ra ngoài ăn uống, cà phê trò chuyện với một nhóm bạn bè quen thuộc.' },
            { value: 'C', label: 'Ở nhà nghỉ ngơi, thỉnh thoảng nhắn tin hoặc gọi điện cho một vài người thân thiết.' },
            { value: 'D', label: 'Tắt điện thoại, hoàn toàn thu mình lại trong không gian riêng (đọc sách, xem phim một mình) để nạp lại năng lượng.' },
        ],
    },
    {
        id: 'q2',
        prompt: 'Khi bước vào một sự kiện giao lưu (networking) có nhiều người lạ, bạn sẽ:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Hào hứng đi vòng quanh, chủ động bắt chuyện và làm quen với càng nhiều người càng tốt.' },
            { value: 'B', label: 'Quan sát một lúc rồi chọn một nhóm có vẻ thân thiện để bước tới làm quen.' },
            { value: 'C', label: 'Đứng cạnh những người mình đã quen từ trước và chỉ nói chuyện khi có người khác chủ động bắt lời.' },
            { value: 'D', label: 'Cảm thấy ngột ngạt, tìm một góc khuất yên tĩnh đứng một mình hoặc tìm lý do ra về sớm.' },
        ],
    },
    {
        id: 'q3',
        prompt: 'Khi giải quyết một vấn đề hóc búa, não bộ của bạn hoạt động tốt nhất khi:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Tổ chức một cuộc họp, nói ra thành tiếng và cùng động não (brainstorm) với nhiều người.' },
            { value: 'B', label: 'Trình bày ý tưởng nháp với 1-2 đồng nghiệp để nghe phản hồi rồi tự hoàn thiện.' },
            { value: 'C', label: 'Tự suy nghĩ phác thảo trong đầu, sau đó mới chia sẻ kết quả với người khác.' },
            { value: 'D', label: 'Hoàn toàn đóng cửa làm việc một mình trong không gian tĩnh lặng tuyệt đối.' },
        ],
    },
    {
        id: 'q4',
        prompt: 'Khi có một cảm xúc hoặc suy nghĩ mới nảy sinh:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Bạn ngay lập tức nói ra để chia sẻ và muốn mọi người cùng bàn luận.' },
            { value: 'B', label: 'Bạn sẽ chia sẻ nó nhưng chỉ với những người bạn cảm thấy phù hợp.' },
            { value: 'C', label: 'Bạn giữ lại trong lòng, chỉ nói ra khi có ai đó tinh tế nhận ra và gặng hỏi.' },
            { value: 'D', label: 'Bạn hiếm khi chia sẻ, thích tự mình phân tích và "tiêu hóa" cảm xúc đó.' },
        ],
    },
    {
        id: 'q5',
        prompt: 'Trong các cuộc họp hoặc làm việc nhóm, phong cách của bạn là:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Thường xuyên là người phát biểu đầu tiên, dẫn dắt và kiểm soát nhịp độ cuộc trò chuyện.' },
            { value: 'B', label: 'Đóng góp ý kiến đều đặn và sẵn sàng phản biện khi cần thiết.' },
            { value: 'C', label: 'Chỉ lên tiếng khi được chỉ định hoặc khi thấy vấn đề thực sự cần thiết phải can thiệp.' },
            { value: 'D', label: 'Chủ yếu ngồi nghe, ghi chép và gửi lại ý kiến tổng hợp qua email/tin nhắn sau cuộc họp.' },
        ],
    },
    {
        id: 'q6',
        prompt: 'Mạng lưới bạn bè của bạn thường được mô tả là:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Rất rộng, quen biết nhiều giới và dễ dàng gọi được một nhóm đông đi chơi bất cứ lúc nào.' },
            { value: 'B', label: 'Khá rộng, có nhiều nhóm bạn khác nhau (bạn đại học, đồng nghiệp, bạn chơi thể thao).' },
            { value: 'C', label: 'Nhỏ gọn, chủ yếu là một vài nhóm chơi thân với nhau nhiều năm.' },
            { value: 'D', label: 'Rất ít, chỉ có 1-2 người bạn "tri kỷ" thực sự có thể chia sẻ mọi thứ.' },
        ],
    },
    {
        id: 'q7',
        prompt: 'Môi trường làm việc lý tưởng đối với bạn là:',
        dimension: 'E/I',
        choices: [
            { value: 'A', label: 'Không gian mở hoàn toàn, ồn ào, năng động và mọi người có thể với tay qua bàn là nói chuyện được ngay.' },
            { value: 'B', label: 'Không gian mở nhưng vẫn có các khu vực thảo luận riêng để không ảnh hưởng toàn công ty.' },
            { value: 'C', label: 'Có vách ngăn riêng cho từng cá nhân, ưu tiên sự yên tĩnh.' },
            { value: 'D', label: 'Phòng làm việc riêng biệt, khép kín hoặc làm việc từ xa (remote) tại nhà.' },
        ],
    },
    {
        id: 'q8',
        prompt: 'Khi ai đó trình bày một ý tưởng kinh doanh mới với bạn, bạn muốn nghe điều gì đầu tiên?',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Số liệu tài chính thực tế, vốn đầu tư cần thiết và bằng chứng đã có ai làm thành công chưa.' },
            { value: 'B', label: 'Cách thức vận hành cụ thể và các bước thực hiện trong 3-6 tháng tới.' },
            { value: 'C', label: 'Ý nghĩa cốt lõi của dự án và nó sẽ mang lại giá trị gì cho thị trường.' },
            { value: 'D', label: 'Tầm nhìn chiến lược 5-10 năm tới và những khả năng mở rộng đột phá trong tương lai.' },
        ],
    },
    {
        id: 'q9',
        prompt: 'Cách bạn miêu tả một sự kiện (ví dụ: một vụ tai nạn trên đường) vừa chứng kiến:',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Tường thuật chính xác từng chi tiết: màu xe, biển số, góc đâm, thời gian, vị trí.' },
            { value: 'B', label: 'Tập trung kể lại diễn biến chính của sự việc theo đúng trình tự trước sau.' },
            { value: 'C', label: 'Bỏ qua tiểu tiết, tập trung vào hậu quả hoặc nguyên nhân cốt lõi gây ra vụ việc.' },
            { value: 'D', label: 'Tập trung vào cảm giác của bạn lúc đó và suy rộng ra về ý thức tham gia giao thông của xã hội.' },
        ],
    },
    {
        id: 'q10',
        prompt: 'Khi đọc một cuốn tiểu thuyết hoặc xem một bộ phim, bạn thích thể loại nào?',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Sách/Phim tài liệu, dựa trên sự kiện có thật, lịch sử hoặc những điều phản ánh sát thực tế đời sống.' },
            { value: 'B', label: 'Thể loại hành động, tâm lý xã hội với cốt truyện rõ ràng, dễ hiểu.' },
            { value: 'C', label: 'Thể loại có nhiều yếu tố biểu tượng, ẩn dụ, đòi hỏi người xem phải suy ngẫm sâu xa.' },
            { value: 'D', label: 'Khoa học viễn tưởng, kỳ ảo (fantasy), thế giới phép thuật không có thật trong thực tại.' },
        ],
    },
    {
        id: 'q11',
        prompt: 'Nếu được giao một công cụ hoặc phần mềm công nghệ hoàn toàn mới:',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Bạn mở sách hướng dẫn, đọc từng dòng và làm theo đúng thứ tự 1, 2, 3.' },
            { value: 'B', label: 'Bạn tìm các video hướng dẫn nhanh (tutorial) để nắm bắt các tính năng cơ bản rồi làm theo.' },
            { value: 'C', label: 'Bạn chỉ đọc lướt qua để biết phần mềm dùng làm gì rồi tự click thử để khám phá.' },
            { value: 'D', label: 'Bạn bỏ qua mọi hướng dẫn, trực tiếp vọc vạch hệ thống để xem nó có thể làm được những giới hạn nào.' },
        ],
    },
    {
        id: 'q12',
        prompt: 'Bạn thường bị thu hút và đánh giá cao những người:',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Có óc thực tế, đôi chân chạm đất và luôn nói chuyện dựa trên số liệu, bằng chứng.' },
            { value: 'B', label: 'Có kinh nghiệm dày dặn, làm việc bài bản và kỹ năng chuyên môn vững vàng.' },
            { value: 'C', label: 'Có tư duy nhạy bén, hay đưa ra những góc nhìn mới lạ và sâu sắc.' },
            { value: 'D', label: 'Có trí tưởng tượng bay bổng, liên tục sinh ra những ý tưởng táo bạo chưa ai nghĩ tới.' },
        ],
    },
    {
        id: 'q13',
        prompt: 'Trí nhớ của bạn thường hoạt động theo cơ chế nào?',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Ghi nhớ như một cỗ máy ảnh, nhớ rõ hình dáng, màu sắc, âm thanh của sự kiện.' },
            { value: 'B', label: 'Nhớ được những mốc sự kiện chính và những người liên quan.' },
            { value: 'C', label: 'Quên mất chi tiết cụ thể nhưng nhớ rất rõ cảm xúc của mình và bài học rút ra lúc đó.' },
            { value: 'D', label: 'Bộ não thường kết nối sự kiện đó với các quy luật hoặc hiện tượng tương tự khác.' },
        ],
    },
    {
        id: 'q14',
        prompt: 'Khi một quy trình đang hoạt động ổn định và đem lại kết quả tốt:',
        dimension: 'S/N',
        choices: [
            { value: 'A', label: 'Bạn nhất quyết duy trì, không muốn thay đổi vì "nó không hỏng thì đừng sửa".' },
            { value: 'B', label: 'Bạn sẽ giữ nguyên quy trình nhưng tìm cách tối ưu để nó chạy nhanh hơn một chút.' },
            { value: 'C', label: 'Bạn cảm thấy chán và thắc mắc liệu có cách tiếp cận nào tốt hơn không.' },
            { value: 'D', label: 'Bạn chủ động đập bỏ quy trình cũ để thử nghiệm một phương pháp hoàn toàn mới mẻ mang tính đột phá.' },
        ],
    },
    {
        id: 'q15',
        prompt: 'Khi phải phân xử một cuộc tranh cãi giữa hai người đồng nghiệp:',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: 'Bạn chỉ dựa vào các bằng chứng khách quan, luật lệ công ty để phân định đúng sai rõ ràng, ai sai phải chịu phạt.' },
            { value: 'B', label: 'Bạn dùng logic để phân tích nhưng cố gắng dùng từ ngữ trung lập để không làm tình hình căng thẳng thêm.' },
            { value: 'C', label: 'Bạn cố gắng hiểu hoàn cảnh của cả hai bên và đề xuất một giải pháp để cả hai cùng nhượng bộ một chút.' },
            { value: 'D', label: 'Bạn ưu tiên việc hòa giải, xoa dịu cảm xúc của cả hai trước tiên để duy trì hòa khí tập thể dù chưa biết ai đúng ai sai.' },
        ],
    },
    {
        id: 'q16',
        prompt: 'Nếu bạn là cấp trên, bạn sẽ quyết định sa thải nhân viên dựa trên:',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: 'Hoàn toàn vào KPI và dữ liệu hiệu suất, không quan tâm đến lý do cá nhân hay hoàn cảnh gia đình.' },
            { value: 'B', label: 'Đánh giá dựa trên hiệu suất là chính nhưng cho họ cơ hội giải trình nếu có lý do chính đáng.' },
            { value: 'C', label: 'Cân nhắc kỹ giữa năng lực công việc và sự cống hiến, thái độ của họ đối với tập thể.' },
            { value: 'D', label: 'Rất khó khăn để ra quyết định, luôn lo lắng việc sa thải sẽ ảnh hưởng nặng nề đến cuộc sống gia đình họ.' },
        ],
    },
    {
        id: 'q17',
        prompt: 'Trong các cuộc tranh luận, mục tiêu tối cao của bạn là:',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: 'Chiến thắng bằng lập luận sắc bén, chứng minh được chân lý và vạch trần lỗ hổng logic của đối phương.' },
            { value: 'B', label: 'Tranh luận để làm rõ vấn đề nhưng biết điểm dừng để không biến thành cãi vã cá nhân.' },
            { value: 'C', label: 'Tìm được điểm đồng thuận giữa hai bên để cả hai cùng cảm thấy được tôn trọng.' },
            { value: 'D', label: 'Bảo vệ các giá trị nhân văn, không bao giờ dùng từ ngữ gây tổn thương đối phương chỉ để giành phần thắng.' },
        ],
    },
    {
        id: 'q18',
        prompt: 'Khi bạn bè tìm đến bạn để kể về một rắc rối họ đang gặp phải:',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: 'Bạn ngắt lời họ để vạch ra các gạch đầu dòng giải pháp và bảo họ cần hành động ngay để sửa sai.' },
            { value: 'B', label: 'Bạn nghe hết câu chuyện rồi phân tích nguyên nhân - kết quả để khuyên họ cách xử lý.' },
            { value: 'C', label: 'Bạn lắng nghe, an ủi, sau đó nhẹ nhàng hỏi xem họ có muốn nghe lời khuyên của bạn không.' },
            { value: 'D', label: 'Bạn hoàn toàn tập trung vào việc ôm ấp, vỗ về, khóc cười cùng họ mà không cần đưa ra bất kỳ lời khuyên nào.' },
        ],
    },
    {
        id: 'q19',
        prompt: 'Lời nhận xét nào mô tả đúng nhất về bạn?',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: '"Người có cái đầu lạnh, luôn ra quyết định lý trí, đôi khi bị cho là khô khan hoặc cứng nhắc."' },
            { value: 'B', label: '"Người phân minh, công bằng, làm việc chuyên nghiệp và ít để tình cảm xen vào công việc."' },
            { value: 'C', label: '"Người khéo léo, tinh tế, biết cách cân bằng giữa nhiệm vụ và cảm xúc của người khác."' },
            { value: 'D', label: '"Người có trái tim ấm áp, giàu lòng trắc ẩn, luôn đặt tình người lên trên hết."' },
        ],
    },
    {
        id: 'q20',
        prompt: 'Đối với bạn, lời nói dối mang thiện ý (White lie - nói dối để người khác không buồn):',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: 'Là không thể chấp nhận được. Sự thật dù tàn nhẫn đến mấy vẫn phải được nói ra.' },
            { value: 'B', label: 'Chỉ nên dùng trong những trường hợp cực kỳ đặc biệt, bình thường vẫn nên nói thật.' },
            { value: 'C', label: 'Là cần thiết để bảo vệ cảm xúc của những người có tâm lý nhạy cảm.' },
            { value: 'D', label: 'Là điều tuyệt vời và thường xuyên nên làm để duy trì sự vui vẻ, hạnh phúc cho những người xung quanh.' },
        ],
    },
    {
        id: 'q21',
        prompt: 'Trong công ty, bạn khó chịu nhất với loại người nào?',
        dimension: 'T/F',
        choices: [
            { value: 'A', label: 'Người làm việc vô tổ chức, lập luận thiếu logic, luôn để cảm tính chi phối quyết định công việc.' },
            { value: 'B', label: 'Người không tuân thủ các nguyên tắc chuyên môn và làm việc không hiệu quả.' },
            { value: 'C', label: 'Người hay gây chia rẽ nội bộ, thiếu tinh thần đoàn kết và hay phán xét.' },
            { value: 'D', label: 'Người máu lạnh, cư xử vô tình, chà đạp lên cảm xúc của đồng nghiệp để thăng tiến.' },
        ],
    },
    {
        id: 'q22',
        prompt: 'Khi chuẩn bị cho một chuyến đi du lịch 4 ngày 3 đêm:',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Bạn phải lên file Excel/Word chi tiết: chuyến bay lúc mấy giờ, ở khách sạn nào, ăn quán gì, đi đâu từng buổi.' },
            { value: 'B', label: 'Bạn chốt vé máy bay, phòng khách sạn và lên danh sách một vài điểm muốn đến, phần còn lại tùy cơ ứng biến.' },
            { value: 'C', label: 'Bạn chỉ book vé chiều đi, đến nơi rồi mở điện thoại tìm phòng khách sạn và chỗ chơi quanh đó.' },
            { value: 'D', label: 'Bạn ra sân bay và mua vé chuyến bay gần nhất, hoàn toàn không có kế hoạch gì trong đầu, tới đâu hay tới đó.' },
        ],
    },
    {
        id: 'q23',
        prompt: 'Đối với các loại thời hạn (Deadline), phong cách của bạn là:',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Luôn hoàn thành công việc trước deadline vài ngày để có thời gian rà soát và thảnh thơi.' },
            { value: 'B', label: 'Lên lịch trình làm việc đều đặn mỗi ngày để đảm bảo nộp bài đúng hạn.' },
            { value: 'C', label: 'Bỏ bê công việc những ngày đầu, chỉ thực sự có hứng làm khi deadline sắp đến.' },
            { value: 'D', label: 'Nước đến cổ mới bơi, thức trắng đêm cuối cùng để làm và tin rằng áp lực tạo ra những ý tưởng tốt nhất.' },
        ],
    },
    {
        id: 'q24',
        prompt: 'Bàn làm việc và không gian sống của bạn thường:',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Cực kỳ ngăn nắp, giấy tờ được phân loại vào bìa còng, bút để đúng khay, không có đồ thừa.' },
            { value: 'B', label: 'Gọn gàng ở mức cơ bản, dọn dẹp định kỳ vào cuối tuần.' },
            { value: 'C', label: 'Hơi bừa bộn một chút với nhiều đồ đạc để trên bàn nhưng bạn luôn biết chính xác đồ cần tìm nằm ở đâu.' },
            { value: 'D', label: 'Rất lộn xộn, đồ đạc vứt ngẫu hứng mọi nơi và thỉnh thoảng bạn phải lật tung lên để tìm một món đồ.' },
        ],
    },
    {
        id: 'q25',
        prompt: 'Khi đang làm việc mà có sự cố bất ngờ làm thay đổi kế hoạch (ví dụ: cuộc họp đột xuất bị lùi lịch):',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Bạn cảm thấy bực bội, khó chịu vì nhịp độ làm việc và kế hoạch trong ngày bị phá vỡ hoàn toàn.' },
            { value: 'B', label: 'Bạn không vui lắm nhưng nhanh chóng mở lịch ra để sắp xếp lại thời gian.' },
            { value: 'C', label: 'Bạn thấy bình thường, coi đó là cơ hội để làm những việc lặt vặt khác đang dang dở.' },
            { value: 'D', label: 'Bạn cảm thấy vui vẻ, thích thú vì sự thay đổi này mang lại một khoảng thời gian trống tự do ngẫu hứng.' },
        ],
    },
    {
        id: 'q26',
        prompt: 'Cảm giác của bạn sau khi chốt xong một quyết định quan trọng (ví dụ: mua laptop mới, chọn trường đại học):',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Vô cùng nhẹ nhõm, gạch bỏ nó khỏi danh sách công việc và không bao giờ nhìn lại hay hối hận.' },
            { value: 'B', label: 'Hài lòng vì đã xong việc, bắt tay vào chuẩn bị cho các bước tiếp theo.' },
            { value: 'C', label: 'Thỉnh thoảng vẫn tự hỏi liệu mình có quyết định hơi vội vàng không.' },
            { value: 'D', label: 'Vẫn liên tục băn khoăn, tìm đọc thêm các review khác và muốn để ngỏ cửa thay đổi ý định phút chót nếu được.' },
        ],
    },
    {
        id: 'q27',
        prompt: 'Bạn thích nhận một công việc được giao theo cách nào?',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Sếp đưa ra một bản mô tả công việc (JD) rõ ràng, liệt kê từng bước phải làm và kết quả cần đạt.' },
            { value: 'B', label: 'Sếp đưa ra mục tiêu và một vài hướng dẫn cơ bản để theo dõi tiến độ.' },
            { value: 'C', label: 'Sếp đưa ra mục tiêu chung và cho bạn toàn quyền quyết định phương pháp thực hiện.' },
            { value: 'D', label: 'Sếp chỉ đưa ra một ý tưởng mơ hồ, không có quy trình gì cả, bạn thích tự mình định hình từ đầu đến cuối.' },
        ],
    },
    {
        id: 'q28',
        prompt: 'Quan điểm của bạn về các luật lệ và quy định:',
        dimension: 'J/P',
        choices: [
            { value: 'A', label: 'Luật lệ là thứ bắt buộc phải tuân thủ nghiêm ngặt để đảm bảo xã hội/tổ chức không bị hỗn loạn.' },
            { value: 'B', label: 'Cần tuân thủ quy định nhưng thỉnh thoảng có thể nới lỏng ở một số trường hợp đặc biệt.' },
            { value: 'C', label: 'Luật lệ chỉ là một bộ khung tham khảo, quan trọng là giải quyết được công việc linh hoạt.' },
            { value: 'D', label: 'Các luật lệ thường sinh ra để kìm hãm sự sáng tạo, hoàn toàn có thể lách luật hoặc bỏ qua nếu nó gây cản trở.' },
        ],
    },
];

type DimensionPair = PersonalityQuestion['dimension'];

type ScoreTarget = keyof PersonalityScores;

const DIMENSION_LETTERS: Record<DimensionPair, [ScoreTarget, ScoreTarget]> = {
    'E/I': ['E', 'I'],
    'S/N': ['S', 'N'],
    'T/F': ['T', 'F'],
    'J/P': ['J', 'P'],
};

const ANSWER_WEIGHTS: Record<PersonalityAnswer, [number, number]> = {
    A: [2, 0],
    B: [1, 0],
    C: [0, 1],
    D: [0, 2],
};

export interface PersonalityQuestionsResult {
    questions: PersonalityQuestion[];
}

export interface PersonalityLatestResult {
    submission: PersonalitySubmission | null;
}

export interface SubmitPersonalityResult {
    submission: PersonalitySubmission;
}

export class PersonalityServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'PersonalityServiceError';
    }
}

export class PersonalityService {
    constructor(private repository: PersonalityRepository) { }

    getQuestions(): PersonalityQuestionsResult {
        return { questions: QUESTIONS };
    }

    submit(userId: number, input: SubmitPersonalityInput): SubmitPersonalityResult {
        const answers = this.validateAnswers(input.answers);
        const scores = this.calculateScores(answers);
        const mbtiType = this.buildMbtiType(scores);

        const submission = this.repository.create({
            userId,
            answers,
            mbtiType,
            scores,
        });

        if (!submission) {
            throw new PersonalityServiceError('Không thể lưu bài đánh giá tính cách', 500);
        }

        return { submission };
    }

    getLatest(userId: number): PersonalityLatestResult {
        const submission = this.repository.findLatestByUserId(userId) ?? null;
        return { submission };
    }

    private validateAnswers(input: Record<string, PersonalityAnswer> | undefined): Record<string, PersonalityAnswer> {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new PersonalityServiceError('Vui lòng trả lời đầy đủ câu hỏi', 400);
        }

        const answers: Record<string, PersonalityAnswer> = {};

        for (const question of QUESTIONS) {
            const answer = input[question.id];
            if (answer !== 'A' && answer !== 'B' && answer !== 'C' && answer !== 'D') {
                throw new PersonalityServiceError(`Thiếu hoặc sai câu trả lời cho ${question.id}`, 400);
            }

            answers[question.id] = answer;
        }

        return answers;
    }

    private calculateScores(answers: Record<string, PersonalityAnswer>): PersonalityScores {
        const scores: PersonalityScores = {
            E: 0,
            I: 0,
            S: 0,
            N: 0,
            T: 0,
            F: 0,
            J: 0,
            P: 0,
        };

        for (const question of QUESTIONS) {
            const [left, right] = DIMENSION_LETTERS[question.dimension];
            const answer = answers[question.id];
            const [leftWeight, rightWeight] = ANSWER_WEIGHTS[answer];
            scores[left] += leftWeight;
            scores[right] += rightWeight;
        }

        return scores;
    }

    private buildMbtiType(scores: PersonalityScores): string {
        const ei = scores.E > scores.I ? 'E' : 'I';
        const sn = scores.S > scores.N ? 'S' : 'N';
        const tf = scores.T > scores.F ? 'T' : 'F';
        const jp = scores.J > scores.P ? 'J' : 'P';
        return `${ei}${sn}${tf}${jp}`;
    }
}
