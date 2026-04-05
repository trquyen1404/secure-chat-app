# Secure Chat App - End-to-End Encryption (E2EE) Upgrade Architecture

Chào mừng bạn đến với tài liệu tổng hợp về cấu trúc bảo mật mới nhất của dự án **Secure Chat App**. Hệ thống này vừa trải qua một đợt nâng cấp kỹ thuật toàn diện nhằm chống lại các rủi ro bảo mật khét tiếng nhất, đồng thời thay máu hàng loạt công nghệ lõi để đạt chuẩn Enterprise-level Security.

---

## 🚀 III. Cải tiến Mới nhất: Phiên bản v19.2 (Final Alignment)

Đây là bản cập nhật "Dứt điểm" để đảm bảo tính ổn định tuyệt đối trong mọi điều kiện mạng:

### 1. Chuẩn hóa AD (Associated Data) Toàn diện
*   **Vấn đề:** MAC Mismatch do lệch thứ tự String ID khi tạo lớp xác thực.
*   **Giải pháp:** Di chuyển logic tạo AD vào lõi `crypto.js`. Mọi chuỗi xác thực hiện nay đều được `sort()` trước khi nối, đảm bảo Alpha và Beta luôn có chung một "ngôn ngữ xác thực" duy nhất.

### 2. Đồng bộ Counter Nguyên tử (Atomic Ratchet Sync)
*   **Vấn đề:** Lệch chỉ số tin nhắn (index desync) khi một bên gửi dồn dập lúc khởi tạo.
*   **Giải pháp:** Khi bên ID thấp thực hiện "nhường" (Adopt), hệ thống tự động đồng bộ `nextRecvIndex` theo đúng số thứ tự tin nhắn (`msg.n`) của người gửi. Điều này triệt tiêu hoàn toàn lỗi "loạn nhịp" chuỗi băm.

### 3. Giải mã Tuần tự (Sequential Decryption)
*   **Vấn đề:** Giải mã song song (`Promise.all`) gây tranh chấp và hỏng trạng thái Session Store.
*   **Giải pháp:** Chuyển sang cơ chế giải mã tuần tự. Đảm bảo mỗi tin nhắn đều chờ tin nhắn trước đó xoay khóa xong mới bắt đầu xử lý, bảo vệ toàn vẹn chuỗi Double Ratchet.

---

## 🚀 II. Các Cải tiến của v19.1 (Recon Stability)

## 🛡️ I. Các Lỗ hổng Bảo mật Đã Được Khắc Phục (Vulnerability Fixes)
*(Nội dung giữ nguyên như cấu trúc cũ nhưng đã được tinh lọc)*

### 1. Rò rỉ Dữ liệu trên Máy chủ (Server-side Data Breach)
*   **Giải pháp (E2EE):** Tin nhắn được mã hóa trực tiếp bằng **AES-256-GCM** trên trình duyệt trước khi gửi. Máy chủ chỉ lưu trữ Ciphertext vô định hình.

### 2. Nguy cơ trộm Khóa từ lỗ hổng XSS
*   **Giải pháp:** Khóa cá nhân (Private Key) được lưu dưới dạng non-extractable CryptoKey trực tiếp vào **IndexedDB**. Kịch bản XSS không thể đọc trộm khóa dưới dạng văn bản.

### 3. Tấn công Padding Oracle & Toàn vẹn dữ liệu
*   **Giải pháp:** Sử dụng **AES-GCM** kèm Authentication Tag. Mọi thay đổi dù chỉ 1 bit trên đường truyền sẽ bị phát hiện và từ chối giải mã ngay lập tức.

---

## ⚡ II. Nâng cấp Công nghệ (Tech Stack Overhaul)

### Chuỗi 1: Lưu trữ & Xử lý Dữ liệu
*   **PostgreSQL**: Database ổn định, hiệu năng cao.
*   **Sequelize (ORM)**: Quản lý dữ liệu qua Object, chống SQL Injection tự động.
*   **Zod**: Validation Engine bắt chẹt từng kiểu dữ liệu đầu vào.

### Chuỗi 2: Giao tiếp & Mật mã học
*   **Socket.io**: Giao tiếp Real-time 2 chiều siêu tốc.
*   **Web Crypto API**: Sức mạnh mã hóa gốc của trình duyệt (ECDSA, X25519, AES-GCM, HKDF).
*   **IndexedDB**: Lưu trữ khóa mật mã bảo mật cao, chống extract.

### Chuỗi 3: Quản lý Phiên (Session) & UI
*   **JWT & Http-Only Cookies**: Tách biệt Access Token và Refresh Token để bảo vệ phiên đăng nhập khỏi XSS.
*   **Axios Interceptor**: Tự động làm mới Token âm thầm, không ngắt quãng trải nghiệm.
*   **React + Vite + TailwindCSS**: Bộ ba công nghệ giao diện hiện đại nhất giúp UI/UX mượt mà, sang trọng.

---

## 🔐 IV. Tuyến Mã hóa Mật mã Cốt lõi (Cryptography Pipeline)

1.  **ECDSA (P-256)**: Tạo Identity Key để ký điện tử, xác thực thân phận.
2.  **X25519 (ECDH)**: Trao đổi khóa Diffie-Hellman bí mật mà không cần gửi Private Key.
3.  **HKDF (SHA-256)**: Tinh chế Secret từ ECDH thành khóa 256-bit chuẩn mật mã hỗn loạn cao.
4.  **AES-GCM (v19.1 AD Sync)**: Đóng gói tin nhắn kèm ID người tham gia (Associated Data) để bảo vệ toàn vẹn tuyệt đối.

---
*Tài liệu này được cập nhật vào ngày 04/04/2026 bởi hệ thống Antigravity - E2EE Absolute Stability Phase.*
 B lấy (Private B + Public A), cuối cùng cả màn hình tính toán của 2 người đều sẽ ra CÙNG MỘT SỐ GIỐNG HỆT NHAU (Shared Secret) mà hoàn toàn không bao giờ phải gửi lọt lộ Private key của riêng họ lên internet tĩnh.
    *   **Điểm yếu:** Điểm yếu chí mạng của Diffie-Hellman là con số "Shared Secret" sinh ra vốn dĩ là một tọa độ hình học điểm giao nhau trên đường cong Elliptic. Vì thế chuỗi bit của nó bị thiên lệch, không đủ tính hỗn loạn ngẫu nhiên hoàn hảo để nạp thẳng trực tiếp vào hệ thống mã hóa dữ liệu cơ sở.
    *   **Công nghệ khắc phục:** **HKDF**.
*   **HKDF (HMAC-based Key Derivation Function)**
    *   **Dùng ở đâu:** Trạm tinh chế khóa trung gian giữa bước Trao đổi ECDH và bộ mã hóa dữ liệu văn bản.
    *   **Điểm mạnh:** Cỗ máy ép xung hỗn loạn cực độ. Nó "Chiết xuất" (Extract) phần bit tinh túy trút bỏ cấu trúc hình học lộn xộn của Secret gốc. Sau đó "Giãn nở" (Expand) dòng dữ phễu đó ra thành một chuỗi bit (VD: 256-bit) chuẩn độ dài siêu ngẫu nhiên đanh thép và không thể dịch ngược bằng toán học được, tỷ lệ phá mã vô hiệu.
    *   **Điểm yếu:** Bản thân HKDF cũng chỉ là một "nhà máy máy tiện rèn chìa khóa", sức mạnh của nó dừng lại ở việc cấp chìa, chứ nó hoàn toàn không có túi lưu trữ nội dung và không trực tiếp đóng gói thay thế (Mã hóa) ổ khóa vào file văn bản được.
    *   **Công nghệ khắc phục:** **AES-GCM**.
*   **AES-GCM (Advanced Encryption Standard - Tiêu chuẩn GCM)**
    *   **Dùng ở đâu:** Điểm kết cuối đường ống, thao tác trực tiếp ngàm mã hóa Khối văn bản tin nhắn.
    *   **Điểm mạnh:** Mã hóa khóa đối xứng với tốc độ ánh sáng. Chế độ GCM (Galois/Counter Mode) cung cấp cùng lúc hai phép thuật vĩ đại: Mã hóa giấu nội dung (Confidentiality) VÀ Kẹp thêm Thẻ bảo toàn nguyên trạng (Authentication Tag - GMAC). Xóa bỏ hoàn toàn điểm yếu của thế hệ mã hóa cũ (như chuẩn AES-CBC kém cỏi dễ bị Padding Oracle Attack nắn đổi nội dung). Hễ hacker trên mạng tự ý chặn gói tin và sửa đổi mù dù chỉ 1 bit của tin nhắn, phép đo GMAC lập tức lệch trục, ngòi nổ kích hoạt và trình duyệt sẽ thẳng thừng ném bỏ file rác đó mà từ chối lệnh giải mã.
    *   *(Chuỗi mã hóa mật mã đóng tệp - Tuyến End-to-End Encryption tuyệt đối an toàn)*
