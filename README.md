# Secure Chat App - End-to-End Encryption (E2EE) Upgrade Architecture

Chào mừng bạn đến với tài liệu tổng hợp về cấu trúc bảo mật mới nhất của dự án **Secure Chat App**. Hệ thống này vừa trải qua một đợt nâng cấp kỹ thuật toàn diện nhằm chống lại các rủi ro bảo mật khét tiếng nhất, đồng thời thay máu hàng loạt công nghệ lõi để đạt chuẩn Enterprise-level Security.

---

## 🚀 III. Cải tiến Hệ thống Toàn diện: Phiên bản v19.3 (Systemic Sweep)

Bản cập nhật này tập trung vào tính **Bền bỉ (Reliability)**, **Khả năng phục hồi (Recovery)** và **Bảo mật Đa lớp (Defense-in-Depth)**:

### 1. Khóa Bất đồng bộ (Async Mutex - FIFO Queue)
*   **Vấn đề:** Các thao tác ghi đè Session (Ratchet state) xảy ra đồng thời khi nhận/gửi tin nhắn dồn dập, dẫn đến hỏng "bánh răng" mã hóa.
*   **Giải pháp:** Triển khai cơ chế **Sequential Processing Queue** trong `ChatWindow.jsx`. Mọi hành động thay đổi trạng thái mật mã (Encrypt/Decrypt/Rotate) đều phải xếp hàng đợi, đảm bảo tính nguyên tử (Atomicity).

### 2. Thu hồi Token Tức thì (Global Revocation)
*   **Công nghệ:** **Token Versioning**.
*   **Giải pháp:** Middleware `auth.js` kiểm tra `tokenVersion` trong DB trên mỗi yêu cầu. Khi người dùng đổi mật khẩu hoặc thực hiện "Global Logout", version này tăng lên, lập tức vô hiệu hóa mọi Access Token cũ đang lưu hành.

### 3. Hệ thống Chặn "Tàng hình" (Stealth Blocking)
*   **Vấn đề:** Chặn ở Client chỉ là che mắt UI; hacker có thể dùng script tấn công trực tiếp.
*   **Giải pháp:** Thực thi chặn tại **Backend (Socket & Controller)**. Tin nhắn từ người bị chặn sẽ bị server âm thầm loại bỏ mà không báo lỗi cho kẻ gửi, tránh để lộ dấu vết trạng thái chặn.

### 4. Chống Tấn công Từ chối Dịch vụ (DoS Protection)
*   **Giới hạn Payload:** Cấu hình `express.json({ limit: '1mb' })` để ngăn chặn việc tải lên các khối dữ liệu khổng lồ phá hoại bộ nhớ server (đặc biệt là Vault Data).
*   **Validation Startup:** Hệ thống từ chối khởi động nếu thiếu bất kỳ biến môi trường mật mã nào (`JWT_SECRET`, `JWT_REFRESH_SECRET`, v.v.).

---

## 🛡️ I. Các Lỗ hổng Bảo mật Đã Được Khắc Phục (Defense-in-Depth)

### 1. Rò rỉ Dữ liệu trên Máy chủ (Zero-Knowledge Storage)
*   **Giải pháp:** Toàn bộ nội dung chat và khóa phiên được mã hóa **AES-256-GCM** trước khi rời khỏi trình duyệt. Máy chủ là "Zero-Knowledge", không thể đọc được nội dung dù có quyền truy cập Database.

### 2. Nguy cơ trộm Khóa từ lỗ hổng XSS (Non-Extractable Keys)
*   **Giải pháp:** Identity Keys được lưu vào **IndexedDB** dưới dạng `extractable: false`. Kịch bản XSS lén lút chạy script không thể trích xuất khóa thô ra khỏi bộ nhớ bảo mật của trình duyệt.

### 3. Forward Secrecy & Key Burning
*   **Giới hạn Khóa Skipped:** Chỉ lưu tối đa 100 khóa tin nhắn bị nhỡ để tránh tràn bộ nhớ và giới hạn rủi ro nếu một khóa cũ bị lộ.
*   **Key Burning:** Khóa tin nhắn được xóa sạch khỏi RAM ngay sau khi giải mã thành công (Ephemeral Message Keys).

---

## ⚡ II. Danh mục Công nghệ Bảo mật (Security Tech Stack)

### 🔐 Mật mã học (Cryptography)
*   **X3DH (Extended Triple Diffie-Hellman)**: Thỏa thuận khóa ban đầu an toàn tuyệt đối.
*   **Double Ratchet Protocol**: Tự động xoay khóa sau mỗi tin nhắn gửi/nhận, đảm bảo lộ một khóa không làm lộ toàn bộ lịch sử.
*   **PBKDF2 (SHA-256)**: Phái sinh **Master Key** từ mã PIN người dùng với 100,000 vòng lặp.
*   **JWK (JSON Web Key)**: Chuẩn hóa việc đóng gói và lưu trữ `CryptoKey` lên Cloud Vault mà không mất metadata.

### 🌐 Mạng & Giao thức (Network & Protocols)
*   **JWT Access (15m) & Refresh Token (7d)**: Cơ chế xoay vòng phiên đăng nhập an toàn.
*   **HTTPOnly Cookies**: Chống trộm Refresh Token qua các cuộc tấn công script.
*   **Helmet & CORS**: Bảo vệ Header và kiểm soát nguồn gốc truy cập nghiêm ngặt.
*   **BCRYPT (10 rounds)**: Băm mật khẩu người dùng với muối (salt) ngẫu nhiên.

---

## 🔐 IV. Tuyến Mã hóa Mật mã Cốt lõi (Cryptography Pipeline)

1.  **ECDSA (P-256)**: Identity Key phục vụ ký số xác thực thực thể.
2.  **X25519 (ECDH)**: Trao đổi bí mật Diffie-Hellman trên đường cong Elliptic.
3.  **HKDF (SHA-256)**: Hàm phái sinh khóa để tinh chế Secret thành khóa đối xứng AES.
4.  **AES-256-GCM**: Mã hóa dữ liệu khối kèm AD (Associated Data) để bảo vệ toàn vẹn (Integrity).

---
*Tài liệu này được cập nhật vào ngày 07/04/2026 bởi hệ thống Antigravity - Systemic Sweep & Security Audit Phase.*
 lệ phá mã vô hiệu.
    *   **Điểm yếu:** Bản thân HKDF cũng chỉ là một "nhà máy máy tiện rèn chìa khóa", sức mạnh của nó dừng lại ở việc cấp chìa, chứ nó hoàn toàn không có túi lưu trữ nội dung và không trực tiếp đóng gói thay thế (Mã hóa) ổ khóa vào file văn bản được.
    *   **Công nghệ khắc phục:** **AES-GCM**.
*   **AES-GCM (Advanced Encryption Standard - Tiêu chuẩn GCM)**
    *   **Dùng ở đâu:** Điểm kết cuối đường ống, thao tác trực tiếp ngàm mã hóa Khối văn bản tin nhắn.
    *   **Điểm mạnh:** Mã hóa khóa đối xứng với tốc độ ánh sáng. Chế độ GCM (Galois/Counter Mode) cung cấp cùng lúc hai phép thuật vĩ đại: Mã hóa giấu nội dung (Confidentiality) VÀ Kẹp thêm Thẻ bảo toàn nguyên trạng (Authentication Tag - GMAC). Xóa bỏ hoàn toàn điểm yếu của thế hệ mã hóa cũ (như chuẩn AES-CBC kém cỏi dễ bị Padding Oracle Attack nắn đổi nội dung). Hễ hacker trên mạng tự ý chặn gói tin và sửa đổi mù dù chỉ 1 bit của tin nhắn, phép đo GMAC lập tức lệch trục, ngòi nổ kích hoạt và trình duyệt sẽ thẳng thừng ném bỏ file rác đó mà từ chối lệnh giải mã.
    *   *(Chuỗi mã hóa mật mã đóng tệp - Tuyến End-to-End Encryption tuyệt đối an toàn)*
