# Secure Chat App - End-to-End Encryption (E2EE) Upgrade Architecture

Chào mừng bạn đến với tài liệu tổng hợp về cấu trúc bảo mật mới nhất của dự án **Secure Chat App**. Hệ thống này vừa trải qua một đợt nâng cấp kỹ thuật toàn diện nhằm chống lại các rủi ro bảo mật khét tiếng nhất, đồng thời thay máu hàng loạt công nghệ lõi để đạt chuẩn Enterprise-level Security.

---

## 🛡️ I. Các Lỗ hổng Bảo mật Đã Được Khắc Phục (Vulnerability Fixes)

### 1. Rò rỉ Dữ liệu trên Máy chủ (Server-side Data Breach)
*   **Lỗ hổng cũ:** Toàn bộ nội dung tin nhắn được lưu dưới dạng văn bản gốc (plaintext) trên PostgreSQL. Máy chủ hoàn toàn có thể đọc trộm mọi tin nhắn.
*   **Giải pháp (E2EE):** Tin nhắn được băm và mã hóa trực tiếp bằng thuật toán **AES-256-GCM** trên trình duyệt (Web Crypto API) trước khi gửi đi. Máy chủ hoàn toàn "mù" và chỉ nhận lại dữ liệu vô định hình.

### 2. Nguy cơ trộm Khóa từ lỗ hổng XSS (Cross-Site Scripting)
*   **Lỗ hổng cũ:** Khóa cá nhân (Private Key) được lưu dưới dạng chuỗi Text trong `localStorage`, mở ra rủi ro bị các extension mã độc móc nối lấy trộm (XSS attack).
*   **Giải pháp:** Mọi Private Key đều bị đánh dấu `extractable: false`, khóa cứng ở RAM và chỉ được đẩy trực tiếp vào **IndexedDB**. Không một kịch bản JavaScript nào có thể đọc biến nó thành dạng văn bản để gửi ra bên ngoài nền tảng.

### 3. Tự vệ trước Tấn công Padding Oracle
*   **Lỗ hổng cũ:** Các mã hóa thế hệ trước (như AES-CBC) dễ dãi khi thay đổi bit dẫn đến việc nội dung bị gián điệp mạng tiêm nhiễm mã sai lệch.
*   **Giải pháp:** Đổi sang **AES-GCM**. Chế độ Galois/Counter tự sinh kèm *Authentication Tag* (thẻ xác minh toàn vẹn). Một khi Hacker chỉnh sửa dù chỉ 1 bit, Message lập tức bị trình duyệt người nhận từ chối và báo lỗi giải mã.

### 4. Rủi ro Cướp Phiên đăng nhập (Session Hijacking)
*   **Lỗ hổng cũ:** Dùng 1 Token sống cực lâu tại `localStorage`.
*   **Giải pháp:** Tách quyền làm 2 bước:
    *   **Access Token (15 phút)**: Sống siêu ngắn để gánh chức năng API.
    *   **Refresh Token (7 ngày)**: Giấu kỹ trong **HTTP-Only, SameSite=Strict Cookies**. 

### 5. Cướp tài khoản & Mất thiết bị E2E
*   **Lỗ hổng cũ:** Chìa khóa E2EE chết theo thiết bị. Đổi máy tính = Mất lịch sử Chat hoặc buộc lòng giao nộp Private Key cho Server giữ không mã hoá. Khách vãng lai cầm chui vào điện thoại thì bị đọc trộm.
*   **Giải pháp E2EE x Messenger-Style:** 
    *   Sử dụng mã **PIN 6 số bí mật**. 
    *   Trình duyệt chạy **PBKDF2 (100.000 iterations)** để ép PIN thành siêu mã bọc Private Key lại và đẩy vỏ bọc lên Server lưu hộ.
    *   **UI Locking**: Khi nạn nhân đăng nhập ở một Máy tính/Môi trường lạ, ứng dụng tự động khóa màn hình đòi nhập đúng mã PIN nhằm tự động rã băng Private Key ở Local, tuyệt đối bảo vệ chat khỏi kẻ lạ.

### 6. Không thể Global Logout (Lỗ hổng của JWT)
*   **Lỗ hổng cũ:** JWT không cần hỏi Server, do đó kể cả có nhấp vào "Đăng xuất mọi thiết bị" thì hacker vẫn xài Token cũ bình thường.
*   **Giải pháp:** Cấy biến số **`tokenVersion`** vào DB PostgreSQL. Muốn khóa tất cả các thiết bị cùng lúc, chỉ cần đẩy Value này lên `+1`. Lập tức 100% Refresh Token trên toàn thế giới bị cấm cửa.

---

## ⚡ II. Nâng cấp Công nghệ (Tech Stack Overhaul)

Kiến trúc Bảo mật không thể bay cao nếu thiếu bệ phóng vững chãi của các Công nghệ mới này:

1.  **Web Crypto API (`window.crypto.subtle`)**
    *   **Sứ mệnh:** Thay thế hoàn toàn mọi thư viện mã hóa của bên thứ ba (third-party).
    *   **Lợi ích:** Sử dụng nguyên lý sức mạnh cốt lõi C++ của trình duyệt để đào tạo khóa RSA-4096 / AES-256 siêu tốc độ, miễn nhiễm với mã độc nhắm vào NPM Node modules của JavaScript.
2.  **Zod (Validation Engine)**
    *   **Sứ mệnh:** Tấm khiên ở Controller Server.
    *   **Lợi ích:** Type-Safe tuyệt đối. Zod chặn đứng và chỉ mặt vạch tên chính xác những chuỗi Request xấu (như gõ thiếu số ở Password, nhét nhầm link Avatar), đảm bảo Server hoàn toàn không bị crash hoặc nạp rác vào SQL.
3.  **IndexedDB (qua custom `keyStore.js`)**
    *   **Sứ mệnh:** Hộp đen của trình duyệt.
    *   **Lợi ích:** Nơi duy nhất đủ sức chứa nguyên vẹn một Object `CryptoKey` siêu cấp từ Web Crypto mà không cần phải xé nhỏ hay phân mảnh nó ra Base64 Text.
4.  **Axios Interceptors**
    *   **Sứ mệnh:** Điệp viên tái tạo Token.
    *   **Lợi ích:** Người dùng không bị đá văng ra màn hình Log in mỗi 15 phút. Luồng Axios tự động "hứng" lỗi hết hạn 401, thò tay xuống Cookie xin Refresh Token và chạy lại lệnh gọi API tin nhắn trong bóng tối mượt mà.
5.  **Cookie-Parser (`httpOnly`)**
    *   **Sứ mệnh:** Người vận chuyển an toàn qua lại giữa Frontend và Express. Tiễn `localStorage` cho những Token nhạy cảm vào dĩ vãng.
6.  **Bcryptjs (Cost Factor 12) & PostgreSQL Multi-Column Indexing**
    *   **Sứ mệnh:** Tăng độ lỳ cho Database và Password.
    *   **Lợi ích:** Thuật toán Hash ép cỗ máy Brute-force/VGA tốn thêm chục lần sức mạnh để giật pass. Trong khi đó, tính năng `Indexing` của DB gánh tốt lượng lớn Data mà vẫn thả "Infinite Scroll" (Cuộn lấy tin nhắn cũ) nhịp nhàng chuẩn O(logN).
