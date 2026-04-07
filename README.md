🔬 GIẢI THÍCH CHI TIẾT CÔNG NGHỆ VÀ KIẾN TRÚC BẢO MẬT
Dự án này không đơn thuần là một ứng dụng chat qua WebSockets. Đây là một hệ thống được thiết kế theo nguyên tắc Zero-Knowledge Architecture (Kiến trúc Không lưu vết). Máy chủ (Server) chỉ đóng vai trò là "người đưa thư bị mù", nhiệm vụ duy nhất là chuyển phát các gói dữ liệu mà nó không tài nào đọc được.

Để làm được điều này, hệ thống áp dụng Kiến trúc Bảo mật 2 Lớp (Two-Layer Security Architecture):

🛡️ LỚP 1: BẢO VỆ ĐƯỜNG TRUYỀN (E2EE - Mã hoá Tin nhắn & Chìa khoá)
Mục tiêu của lớp này là đảm bảo: Chỉ người gửi và người nhận mới có thể đọc được tin nhắn khi chúng đang bay trên mạng Internet.

1. Giao thức X3DH (Extended Triple Diffie-Hellman)
Định nghĩa: Là một giao thức thỏa thuận khóa (Key Agreement). Nó cho phép hai người xa lạ (Alice và Bob) thống nhất chung một "Chìa khóa bí mật" một cách an toàn, ngay cả khi Bob đang Offline và không thể phản hồi ngay lập tức.

Cách hoạt động & Nơi áp dụng:

Khi Alice tạo tài khoản, cô ấy tạo ra một bộ khóa công khai (PreKeys) và gửi lên Server cất giữ.

Khi Bob muốn chat với Alice lần đầu, Bob lên Server "xin" bộ PreKeys của Alice.

Bob dùng hàm toán học kết hợp khóa của Alice và khóa của Bob để tính ra một chuỗi Bí mật chung (Shared Secret). Hệ thống dùng chuẩn ECDH (Đường cong Elliptic X25519) để thực hiện phép toán này.

Kết quả: Alice và Bob có chung một chìa khóa mà Server đứng giữa không thể biết được.

2. Thuật toán Double Ratchet (Bánh răng Kép)
Định nghĩa: Nếu X3DH giúp tạo ra chìa khóa đầu tiên, thì Double Ratchet giúp tạo ra các chìa khóa tiếp theo. Thuật toán này hoạt động như một chiếc bánh răng: chỉ có thể quay tiến lên chứ không thể quay lùi.

Cách hoạt động & Nơi áp dụng:

Thay vì dùng 1 chìa khóa để mã hóa tất cả tin nhắn, Double Ratchet sẽ sinh ra một chìa khóa mới (Message Key) cho MỖI MỘT tin nhắn.

Gửi tin nhắn 1 -> Dùng khóa 1. Gửi tin nhắn 2 -> Dùng khóa 2.

Khi gửi/nhận xong, chìa khóa lập tức bị xóa bỏ khỏi RAM (đốt khóa).

Bảo mật mang lại: * Forward Secrecy (Bảo mật hướng về trước): Nếu hôm nay hacker lấy trộm được laptop của bạn và moi được chìa khóa hiện tại, chúng cũng KHÔNG THỂ giải mã được các tin nhắn bạn đã nhắn ngày hôm qua (vì khóa cũ đã bị đốt).

Break-in Recovery (Phục hồi sau xâm nhập): Cứ mỗi lần bạn nhận được tin nhắn phản hồi từ đối phương, "bánh răng" sẽ xoay và thiết lập một chuỗi khóa hoàn toàn mới, đá văng hacker ra ngoài.

3. Các thuật toán Mật mã lõi (Sử dụng Web Crypto API)
Toàn bộ Lớp 1 được xử lý trực tiếp tại trình duyệt (Client-side) thông qua Web Crypto API (tích hợp sẵn trong JS, không dùng thư viện ngoài để đảm bảo không có backdoor):

HKDF (Nhà máy đúc khóa): Từ 1 bí mật chung của X3DH, HKDF giúp "đúc" ra hàng loạt các khóa con để dùng cho Bánh răng Kép.

AES-256-GCM: Thuật toán mã hóa đối xứng. Đây là hàm trực tiếp biến dòng chữ "Xin chào" thành chuỗi ký tự rác. Chế độ GCM giúp kiểm tra tính toàn vẹn, nếu Server cố tình sửa đổi 1 dấu chấm trong tin nhắn, hàm giải mã sẽ báo lỗi và từ chối.

ECDSA (P-256): Chữ ký số. Giúp hệ thống chống lại việc Server giả mạo khóa của người dùng (Man-in-the-Middle Attack).

🗄️ LỚP 2: BẢO VỆ LƯU TRỮ (Data-at-Rest & "Két sắt" Đám mây)
Mục tiêu của lớp này là: Bảo vệ dữ liệu cục bộ trên máy tính không bị đánh cắp, đồng thời cho phép người dùng đăng nhập trên máy tính mới mà vẫn khôi phục được toàn bộ lịch sử tin nhắn (Giống Zalo/Telegram Cloud Backup).

1. Passphrase & Trình Phái sinh Khóa (PBKDF2)
Vấn đề: Trình duyệt lưu lịch sử chat ở IndexedDB. Nếu bị trộm máy tính, kẻ gian chỉ cần mở F12 (DevTools) là đọc được hết.

Cách giải quyết: * Khi đăng ký, người dùng tạo một Mật khẩu khôi phục (Passphrase) (Tối thiểu 8 ký tự).

Ứng dụng dùng thuật toán PBKDF2-HMAC-SHA256 trộn Passphrase này với một chuỗi ngẫu nhiên (Salt) và lặp lại phép toán 100.000 lần (Vòng lặp này giúp chống lại sự tấn công dò mật khẩu - Brute-force của siêu máy tính).

Kết quả tạo ra một Master Key (Khóa chủ). Khóa chủ này chỉ sống trên RAM và chết đi khi F5 hoặc đóng Tab.

2. Két sắt Toàn năng (Omnipotent Vault) và Đồng bộ Đa thiết bị
Đây là kỹ thuật đỉnh cao để giúp dữ liệu vừa đồng bộ lên Đám mây, vừa ẩn danh tuyệt đối:

Giai đoạn Đóng Két (Lưu trữ): * Bất cứ khi nào bạn có tin nhắn mới, hệ thống sẽ gom toàn bộ Lịch sử chat (decrypted_messages) và Tọa độ chìa khóa (ratchetStore) lại thành một khối.

Dùng Master Key khóa chặt khối này lại (bằng AES-GCM), biến nó thành một "Cục Két sắt" (Vault Blob) không thể đọc được.

Đẩy Cục Két sắt này lên lưu trữ tại Database của Backend. (Lúc này Backend có giữ lịch sử chat của bạn, nhưng nó vĩnh viễn không thể đọc được vì Backend không có Master Key).

Giai đoạn Mở Két (Khôi phục trên máy mới):

Bạn sang máy tính mới đăng nhập. Backend trả về cho bạn Cục Két sắt vô nghĩa.

Ứng dụng bật hộp thoại: "Vui lòng nhập Mật khẩu khôi phục".

Bạn nhập đúng Mật khẩu -> Thuật toán rèn lại Master Key trên RAM -> Dùng Master Key mở khóa Cục Két sắt -> Toàn bộ tin nhắn và chìa khóa cũ hiện ra y như cũ.

🌐 HẠ TẦNG VÀ CÔNG NGHỆ BỔ TRỢ (Infrastructure)
Để 2 lớp bảo mật trên hoạt động trơn tru, dự án sử dụng các công nghệ tiêu chuẩn công nghiệp:

Frontend: ReactJS, Vite & Tailwind CSS

Quản lý State phức tạp (ví dụ: các Khóa đang nằm trên RAM) thông qua React Context (AuthContext).

Sử dụng IndexedDB làm kho lưu trữ cục bộ cho các tin nhắn đã giải mã (đã được bọc lại bằng Master Key).

Cơ chế Async Mutex Queue (Hàng đợi bất đồng bộ): Đảm bảo khi nhận 10 tin nhắn cùng lúc, các bánh răng mật mã sẽ xoay tuần tự (FIFO) mà không bị kẹt hay gãy khóa.

Giao tiếp Thời gian thực: Socket.IO

Hoạt động như một đường ống tốc độ cao. Dữ liệu chạy qua Socket.IO không phải là chữ rõ, mà là những khối dữ liệu đã bị mã hóa AES từ Lớp 1 (Ciphertext Payloads).

Backend: Node.js, Express & PostgreSQL (Sequelize ORM)

Node.js/Express: Xử lý xác thực đăng nhập (JWT). JWT được thiết kế có tokenVersion trong Database để thu hồi quyền truy cập (Global Logout) ngay lập tức khi phát hiện nghi ngờ.

PostgreSQL: Lưu trữ tài khoản, các khóa công khai PreKeys, và đặc biệt là lưu trữ Cục Két sắt Đám mây (VaultData) với cấu trúc dữ liệu khổng lồ (được cấu hình chống tấn công DoS với limit hợp lý).

Stealth Blocking (Chặn tàng hình): Logic Backend kiểm tra trực tiếp quan hệ Block trong Database trước khi đẩy gói tin Socket. Kẻ bị chặn không hề hay biết gói tin của mình đã bị ném vào sọt rác, giúp bảo vệ quyền riêng tư tuyệt đối.

⚙️ HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY DỰ ÁN
Yêu cầu hệ thống:
Node.js (v18+ khuyến nghị)

PostgreSQL (Đang chạy và có một Database trống)

1. Cài đặt Backend
Bash
cd server
npm install
Tạo file .env trong thư mục server:

Đoạn mã
PORT=5000
DATABASE_URL=postgres://username:password@localhost:5432/secure_chat_db
JWT_SECRET=your_super_secret_jwt_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
ALLOWED_ORIGINS=http://localhost:5173
NODE_ENV=development
Chạy Server:

Bash
npm run dev
2. Cài đặt Frontend
Bash
cd client
npm install
Chạy Client:

Bash
npm run dev
Truy cập ứng dụng tại: http://localhost:5173

Dự án nghiên cứu: Xây dựng ứng dụng chat an toàn với X3DH và Double Ratchet.