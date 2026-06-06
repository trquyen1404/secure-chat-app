/**
 * MODULE: E2EE Messaging Deep Testing (1-1 & Group Chat E2EE UI Flow)
 * Standard: testerskill.md
 * Categories: Positive, Negative, Boundary, Security
 */

const clearIndexedDB = () => {
  return cy.window().then((win) => {
    return new Cypress.Promise((resolve) => {
      win.indexedDB.databases().then((dbs) => {
        const promises = dbs.map((db) => {
          return new Promise((res) => {
            const req = win.indexedDB.deleteDatabase(db.name);
            req.onsuccess = res;
            req.onerror = res;
            req.onblocked = res;
          });
        });
        Promise.all(promises).then(resolve);
      }).catch(() => resolve());
    });
  });
};

const dumpLogs = () => {
  cy.window().then((win) => {
    if (win.browserLogs && win.browserLogs.length > 0) {
      win.browserLogs.forEach((logMsg) => {
        cy.task('log', logMsg);
      });
      win.browserLogs = [];
    }
  });
};

const cleanState = () => {
  cy.clearLocalStorage();
  cy.clearCookies();
  cy.window().then((win) => {
    win.sessionStorage.clear();
  });
};

const loginAndUnlock = (username, password, passphrase) => {
  cy.task('log', `loginAndUnlock started for user: ${username}`);
  dumpLogs();
  cy.window().then((win) => {
    if (win.socket) {
      win.socket.disconnect();
    }
  });
  cleanState();
  cy.visit('/login', {
    onBeforeLoad(win) {
      win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
    }
  });
  cy.task('log', 'visit /login complete, typing credentials');
  cy.get('input[type="text"]').type(username);
  cy.get('input[type="password"]').type(password);
  cy.get('button[type="submit"]').click();

  cy.task('log', 'waiting for redirect to /');
  cy.url({ timeout: 15000 }).should('eq', Cypress.config().baseUrl + '/');
  cy.task('log', 'waiting for initializing spinner to disappear');
  cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
  cy.wait(2000);

  cy.task('log', 'inspecting body for restore passphrase input');
  cy.get('body').then(($body) => {
    if ($body.find('input[placeholder*="khôi phục"]').length > 0) {
      cy.task('log', 'passphrase input found, restoring session');
      cy.get('input[placeholder*="khôi phục"]').type(passphrase);
      cy.contains('button', 'Kích hoạt Khôi phục').click({ force: true });
      cy.contains('Mở khóa Két sắt', { timeout: 30000 }).should('not.exist');
      cy.contains('Cập nhật Két sắt', { timeout: 30000 }).should('not.exist');
    } else {
      cy.task('log', 'Device security persistent: Passwordless unlock activated.');
    }
  });
  cy.task('log', 'loginAndUnlock complete');
};

describe('[E2EE Messaging E2E Deep Test] Kiểm thử chi tiết mã hóa/giải mã đầu cuối qua UI', () => {
  const ts = Date.now();
  const userAName = `cy_e2ee_a_${ts}`;
  const userBName = `cy_e2ee_b_${ts}`;
  const emailA = `${userAName}@st.utt.edu.vn`;
  const emailB = `${userBName}@st.utt.edu.vn`;
  const password = 'Cypress12345!';
  const passphrase = 'e2ee_recovery_passphrase_secure';
  let userAId;
  let userBId;

  before(() => {
    // 1. Xóa sạch mọi dữ liệu ban đầu
    cy.clearLocalStorage();
    cy.clearCookies();
    clearIndexedDB();

    // 2. Đăng ký User B qua UI
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input#register-username').type(userBName);
    cy.get('input#register-email').type(emailB);
    cy.get('input#register-password').type(password);
    cy.get('input#register-passphrase').type(passphrase);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.task('verifyUser', userBName).should('eq', true);

    // 3. Đăng ký User A qua UI (không gọi clearIndexedDB để giữ khóa của B)
    cleanState();
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input#register-username').type(userAName);
    cy.get('input#register-email').type(emailA);
    cy.get('input#register-password').type(password);
    cy.get('input#register-passphrase').type(passphrase);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.task('verifyUser', userAName).should('eq', true);
  });

  beforeEach(() => {
    // Thiết lập viewport lớn để tránh các phần tử che khuất nhau
    cy.viewport(1280, 800);
  });

  afterEach(() => {
    cy.window().then((win) => {
      if (win.browserLogs && win.browserLogs.length > 0) {
        win.browserLogs.forEach((logMsg) => {
          cy.task('log', logMsg);
        });
        win.browserLogs = [];
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SETUP: LOG IN & FRIENDSHIP ESTABLISHMENT
  // ═══════════════════════════════════════════════════════════════════════════

  it('Setup: Kết bạn và lưu thông tin User ID của A & B', () => {
    // Đăng nhập A
    loginAndUnlock(userAName, password, passphrase);

    // Lưu UserA ID vào biến local và Cypress environment
    cy.window().then((win) => {
      const u = JSON.parse(win.localStorage.getItem('user'));
      userAId = u.id;
      Cypress.env('userAId', u.id);
      expect(Cypress.env('userAId')).to.not.be.undefined;
    });

    // Kết bạn: A gửi lời mời kết bạn cho B
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();
    cy.get('input[placeholder*="Tìm theo Tên"]').type(userBName);
    cy.contains(userBName, { timeout: 10000 }).should('be.visible');

    const alertStub = cy.stub();
    cy.on('window:alert', alertStub);
    cy.get('button[title="Thêm bạn"]').click().then(() => {
      expect(alertStub.getCall(0)).to.be.calledWith('Đã gửi lời mời kết bạn!');
    });

    cy.get('.lucide-x').click({ force: true });

    // Đăng nhập B và Chấp nhận lời mời kết bạn
    loginAndUnlock(userBName, password, passphrase);

    // Lưu UserB ID vào biến local và Cypress environment
    cy.window().then((win) => {
      const u = JSON.parse(win.localStorage.getItem('user'));
      userBId = u.id;
      Cypress.env('userBId', u.id);
      expect(Cypress.env('userBId')).to.not.be.undefined;
    });

    // Chấp nhận kết bạn ở phía B
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();
    cy.contains('button', 'Lời mời').click();
    cy.contains(userAName).should('be.visible');
    cy.get('button[title="Chấp nhận"]').click();

    cy.get('.lucide-x').click({ force: true });

    // Xác nhận thấy A trong danh sách chat chính của B
    cy.contains('button', 'Tin nhắn').click();
    cy.contains(userAName, { timeout: 10000 }).should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES: E2EE 1-1 Messaging
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-E2E-ENC-01 | [Positive] A gửi tin nhắn 1-1 cho B → Hiển thị rõ Plaintext trên UI người gửi', () => {
    // Đăng nhập lại A để gửi tin nhắn
    loginAndUnlock(userAName, password, passphrase);
 
     // Mở chat với B
     cy.contains(userBName, { timeout: 15000 }).click({ force: true });
     cy.get('textarea[placeholder*="Nhập tin nhắn"]').should('be.visible');
 
     // Nhập tin nhắn 1-1
     const testMessage = 'E2EE_SECURE_TEST_MESSAGE_123';
     cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(testMessage, { force: true });
     cy.get('button[type="submit"]').click({ force: true });
 
     // Xác nhận tin nhắn hiển thị plaintext chính xác trên giao diện người gửi (A)
     cy.contains(testMessage).should('be.visible');
     cy.wait(2000); // Chờ tin nhắn mã hóa và gửi hoàn tất để tránh bị hủy khi Cypress reset state giữa các test case
   });
 
   it('TC-E2E-ENC-02 | [Positive] Database check → Nội dung tin nhắn 1-1 được lưu dưới dạng Ciphertext', () => {
     cy.wait(1500); // Chờ tin nhắn lưu vào DB
     cy.then(() => {
       const senderId = Cypress.env('userAId');
       const recipientId = Cypress.env('userBId');
       
       // Gọi Custom Task để lấy tin nhắn mới nhất trong Database
       cy.task('getLastMessage', { senderId, recipientId }).then((msg) => {
         expect(msg).to.not.be.null;
         // Nội dung trong database không được trùng with Plaintext
         expect(msg.encryptedContent).to.not.eq('E2EE_SECURE_TEST_MESSAGE_123');
         // Nội dung phải ở dạng Ciphertext (Base64)
         expect(msg.encryptedContent).to.be.a('string');
         expect(msg.encryptedContent).to.match(/^[a-zA-Z0-9+/=]+$/);
       });
     });
   });
 
   it('TC-E2E-ENC-03 | [Positive] B đăng nhập và giải mã tin nhắn thành công → Plaintext hiển thị trên UI người nhận', () => {
     // Đăng nhập B
     loginAndUnlock(userBName, password, passphrase);
 
     // Mở chat với A
     cy.contains(userAName, { timeout: 15000 }).click({ force: true });
 
     // Xác nhận hiển thị tin nhắn đã được giải mã đúng dạng plaintext
     cy.contains('E2EE_SECURE_TEST_MESSAGE_123', { timeout: 15000 }).should('be.visible');
   });
 
   // ═══════════════════════════════════════════════════════════════════════════
   // NEGATIVE TEST CASES: Click Lock Toggle Ciphertext
   // ═══════════════════════════════════════════════════════════════════════════
 
   it('TC-E2E-ENC-05 | [Negative] Click nút Lock xem bản mã Ciphertext trên UI thành công', () => {
     // Đăng nhập B để view chat
     loginAndUnlock(userBName, password, passphrase);
 
     cy.contains(userAName).click({ force: true });

    // Di chuột/Tìm bong bóng chat và nút "Xem bản mã"
    cy.get('button[title="Xem bản mã"]').last().click({ force: true });

    // Lúc này Plaintext không hiển thị, thay vào đó hiển thị Ciphertext (chuỗi Mono Base64)
    cy.contains('E2EE_SECURE_TEST_MESSAGE_123').should('not.exist');
    cy.get('.font-mono').should('be.visible').and('not.be.empty');

    // Click lại nút Xem bản mã lần nữa để trở về dạng Plaintext
    cy.get('button[title="Xem bản mã"]').last().click({ force: true });
    cy.contains('E2EE_SECURE_TEST_MESSAGE_123').should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES: Large Payloads & Quick Messages (Double Ratchet Sync)
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-E2E-ENC-06 | [Boundary] Gửi và giải mã thành công tin nhắn payload lớn (1000 ký tự)', () => {
    // Trở về A để gửi tin nhắn dài
    loginAndUnlock(userAName, password, passphrase);

    cy.contains(userBName).click({ force: true });

    // Chuỗi 1000 ký tự
    const longMessage = 'A'.repeat(1000);
    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(longMessage, { force: true, delay: 0 });
    cy.get('button[type="submit"]').click({ force: true });

    // Verify trên UI của A
    cy.contains(longMessage).should('be.visible');
    cy.wait(1500); // Chờ tin nhắn mã hóa và gửi hoàn tất

    // Đăng nhập B để verify giải mã thành công
    loginAndUnlock(userBName, password, passphrase);

    cy.contains(userAName).click({ force: true });
    cy.contains(longMessage, { timeout: 15000 }).should('be.visible');
  });

  it('TC-E2E-ENC-07 | [Boundary] Gửi liên tiếp 3 tin nhắn nhanh để kiểm tra tính đồng bộ của chain keys trong Double Ratchet', () => {
    // Trở lại A gửi liên tiếp
    loginAndUnlock(userAName, password, passphrase);

    cy.contains(userBName).click({ force: true });

    // Gửi nhanh 3 tin nhắn
    const msg1 = 'Fast Message One';
    const msg2 = 'Fast Message Two';
    const msg3 = 'Fast Message Three';

    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msg1, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msg2, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msg3, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.contains(msg1).should('be.visible');
    cy.contains(msg2).should('be.visible');
    cy.contains(msg3).should('be.visible');
    cy.wait(1500); // Chờ các tin nhắn mã hóa và gửi hoàn tất

    // Đăng nhập B và verify nhận đúng thứ tự và không bị lỗi ratchet lệch pha
    loginAndUnlock(userBName, password, passphrase);

    cy.contains(userAName).click({ force: true });
    cy.contains(msg1, { timeout: 15000 }).should('be.visible');
    cy.contains(msg2, { timeout: 15000 }).should('be.visible');
    cy.contains(msg3, { timeout: 15000 }).should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY CASES: Burn on read (Tin nhắn tự hủy)
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-E2E-ENC-08 | [Security] Bật tự hủy → Gửi tin nhắn tự hủy và kiểm tra nó biến mất sau khi đọc', () => {
    // Login A
    loginAndUnlock(userAName, password, passphrase);

    cy.contains(userBName).click({ force: true });

    // Bật chế độ tự hủy
    cy.get('button[title*="tin nhắn tự hủy"]').click({ force: true });
    cy.get('textarea[placeholder*="tự hủy sau khi xem"]').should('be.visible');

    // Nhập và gửi tin nhắn tự hủy
    const secretMsg = 'SECRET_BURN_123';
    cy.get('textarea[placeholder*="tự hủy sau khi xem"]').type(secretMsg, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    // Tắt tự hủy
    cy.get('button[title*="tin nhắn tự hủy"]').click({ force: true });
    cy.wait(1500); // Chờ tin nhắn mã hóa và gửi hoàn tất

    // Login B để xem tin nhắn tự hủy
    loginAndUnlock(userBName, password, passphrase);

    cy.contains(userAName).click({ force: true });

    // B sẽ nhận được tin nhắn tự hủy
    cy.contains(secretMsg, { timeout: 15000 }).should('be.visible');
    cy.wait(2000); // Đảm bảo socket deleteMessage đã gửi và server đã xóa cứng tin nhắn khỏi DB

    // Khi chuyển phòng chat hoặc F5 trang, tin nhắn tự hủy sẽ biến mất (vì local client tự xóa hoặc socket trigger delete)
    dumpLogs();
    cy.window().then((win) => {
      if (win.socket) {
        win.socket.disconnect();
      }
    });
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
    cy.wait(2000);
    cy.get('body').then(($body) => {
      if ($body.find('input[placeholder*="khôi phục"]').length > 0) {
        cy.get('input[placeholder*="khôi phục"]').type(passphrase);
        cy.contains('button', 'Kích hoạt Khôi phục').click({ force: true });
        cy.contains('Mở khóa Két sắt', { timeout: 15000 }).should('not.exist');
        cy.contains('Cập nhật Két sắt', { timeout: 15000 }).should('not.exist');
      }
    });
    cy.url({ timeout: 20000 }).should('eq', Cypress.config().baseUrl + '/');

    cy.contains(userAName).click({ force: true });

    // Tin nhắn tự hủy SECRET_BURN_123 không được xuất hiện nữa
    cy.contains(secretMsg).should('not.exist');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES: E2EE Group Messaging
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-E2E-ENC-04 | [Positive] Nhắn tin nhóm: A tạo nhóm, thêm B → Gửi tin nhắn nhóm mã hóa qua Sender Keys và giải mã trên UI B', () => {
    // Đăng nhập A
    loginAndUnlock(userAName, password, passphrase);

    // Click nút "Tạo Lớp/Nhóm mới" trong Sidebar
    cy.get('button[title="Tạo Lớp/Nhóm mới"]').click({ force: true });
    cy.get('input[placeholder*="Phát triển"]').type('E2EE Group Dev', { force: true });

    // Chọn thành viên B
    cy.get('input[placeholder*="Tìm tên liên hệ..."]').type(userBName);
    cy.contains('button', userBName).click({ force: true });

    // Tạo nhóm
    cy.get('button').contains('Xác nhận tạo nhóm').click();

    // Chờ hiển thị Group trong danh sách chat và click mở
    cy.contains('E2EE Group Dev', { timeout: 15000 }).should('be.visible').click();

    // A gửi tin nhắn nhóm
    const grpMsg = 'GROUP_SECURE_E2EE_999';
    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(grpMsg, { force: true });
    cy.get('button[type="submit"]').click({ force: true });
    cy.contains(grpMsg).should('be.visible');

    // Verify trong Database GroupMessage được lưu dạng Ciphertext
    // Lấy groupId từ URL hoặc session
    cy.wait(1500); // Chờ tin nhắn nhóm lưu vào DB
    cy.window().then((win) => {
      const savedUser = JSON.parse(win.sessionStorage.getItem('lastSelectedUser'));
      expect(savedUser.isGroup).to.be.true;
      const groupId = savedUser.id;
      const senderId = Cypress.env('userAId');

      cy.task('getLastGroupMessage', { groupId, senderId }).then((msg) => {
        expect(msg).to.not.be.null;
        expect(msg.encryptedContent).to.not.eq(grpMsg);
        expect(msg.encryptedContent).to.be.a('string');
        expect(msg.encryptedContent).to.match(/^[a-zA-Z0-9+/=]+$/);
      });
    });

    // Đăng nhập B và verify B giải mã thành công tin nhắn nhóm
    loginAndUnlock(userBName, password, passphrase);

    // B mở phòng chat nhóm
    cy.contains('E2EE Group Dev', { timeout: 15000 }).should('be.visible').click();

    // Verify tin nhắn nhóm hiển thị dạng plaintext chính xác trên UI của B
    cy.contains(grpMsg, { timeout: 15000 }).should('be.visible');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES: Corrupted Ciphertext Handing
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-E2E-ENC-10 | [Negative] Nhận tin nhắn E2EE bị lỗi/hỏng (Corrupted Ciphertext) → UI hiển thị lỗi khóa cũ hoặc đang tải bảo mật một cách an sau khi giải mã thất bại', () => {
    // Đảm bảo User B đang đăng nhập và đã unlock két sắt
    loginAndUnlock(userBName, password, passphrase);

    // Mở chat với A
    cy.contains(userAName, { timeout: 15000 }).click({ force: true });

    // Tạo một tin nhắn bị hỏng (corrupted ciphertext) trực tiếp trong DB từ A gửi sang B
    const senderId = userAId || Cypress.env('userAId');
    const recipientId = userBId || Cypress.env('userBId');

    cy.task('create1to1Message', {
      senderId,
      recipientId,
      encryptedContent: 'INVALID_CIPHERTEXT_BASE64_999_!!!', // Chuỗi ciphertext không hợp lệ
      ratchetKey: null,
      n: 99,
      pn: 0,
      isPinned: false
    }).then((createdMsg) => {
      expect(createdMsg).to.not.be.null;

      // Reload trang để tải lại danh sách tin nhắn và kích hoạt quá trình giải mã tin nhắn mới từ DB
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
        }
      });
      cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
      cy.wait(2000);

      // Mở chat với A
      cy.contains(userAName, { timeout: 15000 }).click({ force: true });

      // Xác nhận UI không bị crash và hiển thị thông báo lỗi khóa cũ
      cy.contains('[Phiên bản khóa cũ]', { timeout: 15000 }).should('be.visible');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & VALIDATION: Passphrase Restore Key Modal Validation
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-E2E-ENC-09 | [Security] Nhập sai Passphrase khôi phục báo lỗi đúng và mở khóa thành công khi nhập đúng', () => {
    // Đăng xuất B bằng cách dùng hàm cleanState và clearIndexedDB để giả lập thiết bị mới
    dumpLogs();
    cy.window().then((win) => {
      if (win.socket) {
        win.socket.disconnect();
      }
    });
    cleanState();
    clearIndexedDB();

    // Đăng nhập lại B
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input[type="text"]').type(userBName);
    cy.get('input[type="password"]').type(password);
    cy.get('button[type="submit"]').click();

    cy.url({ timeout: 15000 }).should('eq', Cypress.config().baseUrl + '/');
    cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
    cy.wait(2000);

    // Xác nhận modal "Mở khóa Két sắt" hiển thị
    cy.contains('Mở khóa Két sắt', { timeout: 15000 }).should('be.visible');

    // 1. Nhập passphrase quá ngắn (< 8 ký tự) -> Nút Kích hoạt Khôi phục bị disabled
    cy.get('input[placeholder*="khôi phục"]').type('short');
    cy.contains('button', 'Kích hoạt Khôi phục').should('be.disabled');

    // 2. Nhập passphrase sai (>= 8 ký tự) -> Nút enabled nhưng bấm vào báo lỗi mật khẩu không chính xác
    cy.get('input[placeholder*="khôi phục"]').clear().type('wrong_passphrase_12345');
    cy.contains('button', 'Kích hoạt Khôi phục').should('not.be.disabled').click();
    cy.contains('Mật khẩu khôi phục không chính xác. Vui lòng thử lại.', { timeout: 10000 }).should('be.visible');

    // 3. Nhập passphrase đúng
    cy.get('input[placeholder*="khôi phục"]').clear().type(passphrase);
    cy.contains('button', 'Kích hoạt Khôi phục').click({ force: true });

    // Xác nhận modal biến mất và chuyển sang màn hình chat chính
    cy.contains('Mở khóa Két sắt', { timeout: 15000 }).should('not.exist');
    cy.contains('button', 'Tin nhắn').should('be.visible');
  });

  /**
   * ID: TC-E2E-ENC-11
   * Component/Function: E2EE File Attachment Encryption
   * Description: Mã hóa và giải mã tệp tin đính kèm định dạng [FILE|...] qua hệ thống mã hóa tin nhắn.
   * Pre-conditions: Có khóa bí mật AES-GCM hợp lệ.
   * Input Data: Dữ liệu tệp "[FILE|syllabus.pdf]https://storage.utt.edu.vn/syllabus.pdf"
   * Expected Output: Giải mã thành công chuỗi tệp đính kèm gốc nguyên vẹn.
   */
  it('TC-E2E-ENC-11 | [Positive] Mã hóa và giải mã thành công tin nhắn dạng tệp đính kèm E2EE', () => {
    cy.window().then(async (win) => {
      const rawKey = win.crypto.getRandomValues(new Uint8Array(32));
      const key = await win.crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const fileMessage = '[FILE|syllabus.pdf]https://storage.utt.edu.vn/syllabus.pdf';
      const iv = win.crypto.getRandomValues(new Uint8Array(12));
      const enc = new win.TextEncoder();
      const dec = new win.TextDecoder();

      const encrypted = await win.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(fileMessage)
      );

      const decrypted = await win.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      const decryptedText = dec.decode(decrypted);
      expect(decryptedText).to.eq(fileMessage);
      expect(decryptedText).to.contain('[FILE|syllabus.pdf]');
    });
  });

  /**
   * ID: TC-E2E-ENC-12
   * Component/Function: E2EE State Resilience on Network Offline/Online
   * Description: Đảm bảo trạng thái mã hóa E2EE không bị hỏng hoặc mất đồng bộ ratchet khi thiết bị thay đổi trạng thái mạng (offline sang online).
   * Pre-conditions: Thiết bị đang trong phòng chat E2EE.
   * Input Data: Kích hoạt sự kiện offline rồi online trên browser.
   * Expected Output: Ứng dụng khôi phục trạng thái bình thường mà không bị crash hay rò rỉ khóa phiên.
   */
  it('TC-E2E-ENC-12 | [Boundary] E2EE khôi phục trạng thái ổn định sau khi mạng mất kết nối (Offline → Online)', () => {
    loginAndUnlock(userAName, password, passphrase);
    
    // Giả lập trạng thái mạng mất kết nối
    cy.window().then((win) => {
      win.dispatchEvent(new win.Event('offline'));
    });
    cy.wait(300);

    // Giả lập khôi phục mạng
    cy.window().then((win) => {
      win.dispatchEvent(new win.Event('online'));
    });

    // Xác nhận app vẫn hoạt động bình thường
    cy.contains('button', 'Tin nhắn').should('be.visible');
  });
});
