const UTT_KNOWLEDGE = [
  { keywords: ['học phí', 'nộp tiền', 'ngân hàng'], answer: 'Học phí UTT nộp qua cổng thanh toán trực tuyến hoặc chuyển khoản ngân hàng BIDV/Agribank theo mã định danh sinh viên. Hạn nộp thường vào tuần thứ 4 của học kỳ.' },
  { keywords: ['học bổng', 'khuyến khích', 'tiêu chuẩn'], answer: 'Học bổng KKHT được xét dựa trên Điểm trung bình học kỳ (>= 2.5) và Điểm rèn luyện (>= 70). Có 3 mức: Khá, Giỏi, Xuất sắc.' },
  { keywords: ['địa chỉ', 'cơ sở', 'vị trí'], answer: 'UTT có 3 cơ sở: \n- CS1: 54 Triều Khúc, Thanh Xuân, Hà Nội.\n- CS2: Vĩnh Yên, Vĩnh Phúc.\n- CS3: Thái Nguyên.' },
  { keywords: ['quy chế', 'thi', 'cấm thi'], answer: 'Sinh viên nghỉ quá 20% số tiết sẽ bị cấm thi. Điểm thi kết thúc học phần chiếm 60% tổng điểm môn học.' },
  { keywords: ['liên hệ', 'số điện thoại', 'hotline'], answer: 'Phòng Đào tạo: 024.3854 7536. Phòng Công tác SV: 024.3552 0974.' },
  { keywords: ['hello', 'hi', 'chào', 'xin chào'], answer: 'Xin chào! Tôi là Trợ lý ảo UTT. Bạn có thể hỏi tôi về học phí, học bổng, quy chế thi hoặc thông tin các cơ sở của trường.' }
];

exports.getResponse = (text) => {
  const input = text.toLowerCase();
  for (const item of UTT_KNOWLEDGE) {
    if (item.keywords.some(k => input.includes(k))) {
      return item.answer;
    }
  }
  return "Xin lỗi, tôi chưa rõ thông tin này. Bạn có thể liên hệ Văn phòng Đoàn hoặc Phòng Đào tạo để được hỗ trợ chính xác nhất nhé!";
};
