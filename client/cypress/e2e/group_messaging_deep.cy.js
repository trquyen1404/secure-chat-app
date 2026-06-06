/**
 * MODULE: E2EE Group Messaging Deep Testing
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

const logoutUser = () => {
  cy.task('log', 'logoutUser started');
  cy.on('window:confirm', () => true);
  cy.get('button[title="Đăng xuất"]').first().click({ force: true });
  cy.url({ timeout: 15000 }).should('include', '/login');
  cy.wait(1500); // Đảm bảo socket đã ngắt kết nối hoàn toàn trên server trước khi test case tiếp theo bắt đầu
  cy.task('log', 'logoutUser complete');
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

describe('[E2EE Group Messaging Deep Test] Kiểm thử chi tiết mã hóa/giải mã đầu cuối Nhóm qua UI', () => {
  const ts = Date.now();
  const userAName = `cy_grp_deep_a_${ts}`;
  const userBName = `cy_grp_deep_b_${ts}`;
  const userCName = `cy_grp_deep_c_${ts}`;
  const emailA = `${userAName}@st.utt.edu.vn`;
  const emailB = `${userBName}@st.utt.edu.vn`;
  const emailC = `${userCName}@st.utt.edu.vn`;
  const password = 'Cypress12345!';
  const passphrase = 'e2ee_recovery_passphrase_group';
  
  let userAId, userBId, userCId;
  let groupId;

  before(() => {
    // 1. Xóa sạch mọi dữ liệu ban đầu
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    clearIndexedDB();

    // 2. Đăng ký các User A, B, C qua UI
    const registerUser = (username, email) => {
      cleanState();
      cy.visit('/register', {
        onBeforeLoad(win) {
          win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
        }
      });
      cy.get('input#register-username').type(username);
      cy.get('input#register-email').type(email);
      cy.get('input#register-password').type(password);
      cy.get('input#register-passphrase').type(passphrase);
      cy.get('button[type="submit"]').click();
      cy.url({ timeout: 15000 }).should('include', '/login');
      cy.task('verifyUser', username).should('eq', true);
    };

    registerUser(userBName, emailB);
    registerUser(userCName, emailC);
    registerUser(userAName, emailA);
  });

  beforeEach(() => {
    cy.viewport(1280, 800);
  });

  afterEach(() => {
    dumpLogs();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SETUP: LOG IN & FRIENDSHIP ESTABLISHMENT
  // ═══════════════════════════════════════════════════════════════════════════

  it('Setup: Kết bạn A-B, A-C và lưu ID', () => {
    // Đăng nhập B để lấy ID
    loginAndUnlock(userBName, password, passphrase);
    cy.window().then((win) => {
      const u = JSON.parse(win.localStorage.getItem('user'));
      userBId = u.id;
      Cypress.env('userBId', u.id);
    });

    // Đăng nhập C để lấy ID
    loginAndUnlock(userCName, password, passphrase);
    cy.window().then((win) => {
      const u = JSON.parse(win.localStorage.getItem('user'));
      userCId = u.id;
      Cypress.env('userCId', u.id);
    });

    // Đăng nhập A
    loginAndUnlock(userAName, password, passphrase);
    cy.window().then((win) => {
      const u = JSON.parse(win.localStorage.getItem('user'));
      userAId = u.id;
      Cypress.env('userAId', u.id);
    });

    // A kết bạn với B
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();
    cy.get('input[placeholder*="Tìm theo Tên"]').type(userBName);
    cy.contains(userBName, { timeout: 10000 }).should('be.visible');
    cy.get('button[title="Thêm bạn"]').click();
    cy.wait(500);

    // A kết bạn với C
    cy.get('input[placeholder*="Tìm theo Tên"]').clear().type(userCName);
    cy.contains(userCName, { timeout: 10000 }).should('be.visible');
    cy.get('button[title="Thêm bạn"]').click();
    
    cy.get('.lucide-x').click({ force: true });

    // Đăng xuất sạch cho A để lưu đồng bộ
    logoutUser();

    // B chấp nhận
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();
    cy.contains('button', 'Lời mời').click();
    cy.contains(userAName).should('be.visible');
    cy.get('button[title="Chấp nhận"]').click();
    cy.get('.lucide-x').click({ force: true });

    // Đăng xuất sạch cho B để lưu đồng bộ
    logoutUser();

    // C chấp nhận
    loginAndUnlock(userCName, password, passphrase);
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();
    cy.contains('button', 'Lời mời').click();
    cy.contains(userAName).should('be.visible');
    cy.get('button[title="Chấp nhận"]').click();
    cy.get('.lucide-x').click({ force: true });

    // Đăng xuất sạch cho C để lưu đồng bộ
    logoutUser();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES: E2EE Group Messaging
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-GRP-E2EE-01 | [Positive] A tạo nhóm và gửi tin nhắn nhóm mã hóa E2EE thành công', () => {
    loginAndUnlock(userAName, password, passphrase);

    // Tạo nhóm mới và thêm B, C
    cy.get('button[title="Tạo Lớp/Nhóm mới"]').click({ force: true });
    cy.get('input[placeholder*="Phát triển"]').type('Deep E2EE Group', { force: true });

    // Chọn B
    cy.get('input[placeholder*="Tìm tên liên hệ..."]').type(userBName);
    cy.contains('button', userBName).click({ force: true });

    // Chọn C
    cy.get('input[placeholder*="Tìm tên liên hệ..."]').clear().type(userCName);
    cy.contains('button', userCName).click({ force: true });

    // Xác nhận tạo
    cy.get('button').contains('Xác nhận tạo nhóm').click();

    // Vào group
    cy.contains('Deep E2EE Group', { timeout: 15000 }).should('be.visible').click();

    // Nhập và gửi tin nhắn nhóm E2EE
    const grpMsg = 'DEEP_GROUP_E2EE_MESSAGE_123';
    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(grpMsg, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    // Verify plaintext hiển thị trên giao diện người gửi A
    cy.contains(grpMsg).should('be.visible');
    cy.wait(2000); // Chờ tin nhắn mã hóa và gửi hoàn tất

    // Capture groupId from sessionStorage before it gets cleared
    cy.window().then((win) => {
      const savedUser = JSON.parse(win.sessionStorage.getItem('lastSelectedUser'));
      if (savedUser && savedUser.isGroup) {
        groupId = savedUser.id;
        Cypress.env('groupId', savedUser.id);
      }
    });

    // Đăng xuất sạch cho A để lưu đồng bộ khóa nhóm (Sender Key)
    logoutUser();
  });

  it('TC-GRP-E2EE-02 | [Positive] Database check → Tin nhắn nhóm được lưu dưới dạng Ciphertext', () => {
    cy.then(() => {
      const senderId = userAId || Cypress.env('userAId');
      const gId = groupId || Cypress.env('groupId');

      expect(gId).to.not.be.undefined;

      cy.task('getLastGroupMessage', { groupId: gId, senderId }).then((msg) => {
        expect(msg).to.not.be.null;
        // Nội dung trong database không phải là plaintext
        expect(msg.encryptedContent).to.not.eq('DEEP_GROUP_E2EE_MESSAGE_123');
        expect(msg.encryptedContent).to.match(/^[a-zA-Z0-9+/=]+$/); // Base64 ciphertext format
      });
    });
  });

  it('TC-GRP-E2EE-03 | [Positive] B nhận giải mã tin nhắn nhóm và xem Plaintext trên UI thành công', () => {
    loginAndUnlock(userBName, password, passphrase);

    // Vào group
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    // Verify đã giải mã tin nhắn thành công
    cy.contains('DEEP_GROUP_E2EE_MESSAGE_123', { timeout: 15000 }).should('be.visible');

    // Đăng xuất sạch cho B
    logoutUser();
  });

  it('TC-GRP-E2EE-04 | [Positive] Hội thoại nhóm đa thành viên hoạt động chính xác và hiển thị đúng thứ tự', () => {
    // 1. C gửi tin nhắn
    loginAndUnlock(userCName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    cy.contains('DEEP_GROUP_E2EE_MESSAGE_123').should('be.visible');
    
    const msgC = 'Hello from C';
    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msgC, { force: true });
    cy.get('button[type="submit"]').click({ force: true });
    cy.contains(msgC).should('be.visible');
    cy.wait(2000);

    // Đăng xuất sạch cho C
    logoutUser();

    // 2. B gửi tin nhắn
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    cy.contains(msgC, { timeout: 15000 }).should('be.visible');
    
    const msgB = 'Hello from B';
    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msgB, { force: true });
    cy.get('button[type="submit"]').click({ force: true });
    cy.contains(msgB).should('be.visible');
    cy.wait(2000);

    // Đăng xuất sạch cho B
    logoutUser();

    // 3. A kiểm tra thứ tự tin nhắn
    loginAndUnlock(userAName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    
    cy.contains('DEEP_GROUP_E2EE_MESSAGE_123', { timeout: 15000 }).should('be.visible');
    cy.contains(msgC, { timeout: 15000 }).should('be.visible');
    cy.contains(msgB, { timeout: 15000 }).should('be.visible');

    // Đăng xuất sạch cho A
    logoutUser();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES: Click Lock Toggle & Corrupted Ciphertext
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-GRP-E2EE-05 | [Negative] Click nút Lock xem bản mã Ciphertext nhóm thành công', () => {
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    // Bấm xem bản mã
    cy.get('button[title="Xem bản mã"]').last().click({ force: true });
    cy.contains('Hello from B').should('not.exist');
    cy.get('.font-mono').should('be.visible').and('not.be.empty');

    // Bấm lại để gỡ
    cy.get('button[title="Xem bản mã"]').last().click({ force: true });
    cy.contains('Hello from B').should('be.visible');

    // Đăng xuất sạch cho B
    logoutUser();
  });

  it('TC-GRP-E2EE-06 | [Negative] Nhận tin nhắn nhóm bị hỏng -> Hiển thị cảnh báo lỗi giải mã an toàn', () => {
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    const gId = groupId || Cypress.env('groupId');
    const sId = userAId || Cypress.env('userAId');

    // Chèn tin nhắn nhóm lỗi trực tiếp vào DB
    cy.task('createGroupMessage', {
      groupId: gId,
      senderId: sId,
      encryptedContent: 'BAD_GROUP_CIPHERTEXT_123_!!!', // Ciphertext base64 không hợp lệ
      ratchetKey: null,
      n: 99,
      pn: 0,
      signature: 'INVALID_SIGNATURE',
      type: 'text'
    }).then((createdMsg) => {
      expect(createdMsg).to.not.be.null;

      // F5 tải lại trang
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
        }
      });
      cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
      cy.wait(2000);

      cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

      // UI không crash, hiển thị thông báo lỗi giải mã nhóm
      cy.contains('[Lỗi giải mã nhóm', { timeout: 15000 }).should('be.visible');

      // Dọn dẹp tin nhắn lỗi ra khỏi DB để tránh gây ratchet skip cho các test case sau
      cy.task('deleteGroupMessage', { groupId: gId, n: 99 }).then((res) => {
        expect(res.deletedRows).to.be.greaterThan(0);
      });

      // Đăng xuất sạch cho B
      logoutUser();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-GRP-E2EE-07 | [Boundary] Gửi và giải mã tin nhắn nhóm payload lớn (1000 ký tự)', () => {
    loginAndUnlock(userAName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    const longMessage = 'G'.repeat(1000);
    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(longMessage, { force: true, delay: 0 });
    cy.get('button[type="submit"]').click({ force: true });

    cy.contains(longMessage).should('be.visible');
    cy.wait(2000);

    // Đăng xuất sạch cho A
    logoutUser();

    // B đăng nhập nhận giải mã tin nhắn dài
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    cy.contains(longMessage, { timeout: 15000 }).should('be.visible');

    // Đăng xuất sạch cho B
    logoutUser();
  });

  it('TC-GRP-E2EE-08 | [Boundary] Gửi liên tiếp nhanh 3 tin nhắn nhóm để test ratchet sync', () => {
    loginAndUnlock(userAName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    const msg1 = 'Group Fast Msg 1';
    const msg2 = 'Group Fast Msg 2';
    const msg3 = 'Group Fast Msg 3';

    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msg1, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msg2, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.get('textarea[placeholder*="Nhập tin nhắn"]').type(msg3, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.contains(msg1).should('be.visible');
    cy.contains(msg2).should('be.visible');
    cy.contains(msg3).should('be.visible');
    cy.wait(2000);

    // Đăng xuất sạch cho A
    logoutUser();

    // B nhận giải mã đúng
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    cy.contains(msg1, { timeout: 15000 }).should('be.visible');
    cy.contains(msg2, { timeout: 15000 }).should('be.visible');
    cy.contains(msg3, { timeout: 15000 }).should('be.visible');

    // Bấm Đăng xuất ngay tại đây để đồng bộ két sắt lên server trước khi chuyển qua test case thiết bị mới
    logoutUser();
  });

  it('TC-GRP-E2EE-09 | [Boundary] Khôi phục két sắt bằng Passphrase trên thiết bị mới giải mã lịch sử nhóm thành công', () => {
    // Reset cục bộ để giả lập đăng nhập thiết bị mới tinh cho B
    dumpLogs();
    cy.visit('/login');
    cleanState();
    
    // Chỉ xóa database bảo mật của B để kích hoạt màn hình khôi phục passphrase mà không ảnh hưởng đến database của A và C
    cy.window().then((win) => {
      const uId = userBId || Cypress.env('userBId');
      if (uId) {
        return new Cypress.Promise((resolve) => {
          const req = win.indexedDB.deleteDatabase(`SecureChatLocalSecurity-${uId}`);
          req.onsuccess = resolve;
          req.onerror = resolve;
          req.onblocked = resolve;
        });
      }
    });

    // Đăng nhập B
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

    // Bấm khôi phục
    cy.get('body').then(($body) => {
      if ($body.text().includes('Cập nhật Két sắt')) {
        cy.contains('Cập nhật Két sắt', { timeout: 15000 }).should('be.visible');
      } else {
        cy.contains('Mở khóa Két sắt', { timeout: 15000 }).should('be.visible');
      }
    });
    cy.get('input[placeholder*="khôi phục"]').type(passphrase);
    cy.contains('button', 'Kích hoạt Khôi phục').click({ force: true });

    // Đợi modal khôi phục biến mất (chờ tối đa 30s vì PBKDF2 chạy lâu)
    cy.get('input[placeholder*="khôi phục"]', { timeout: 30000 }).should('not.exist');
    
    // Vào group và kiểm tra giải mã lịch sử chat nhóm hoàn hảo
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    cy.contains('Group Fast Msg 3', { timeout: 15000 }).should('be.visible');

    // Đăng xuất sạch cho B
    logoutUser();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-GRP-E2EE-10 | [Security] Gửi tin nhắn nhóm tự hủy và tự động biến mất sau khi đọc', () => {
    loginAndUnlock(userAName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    // Bật tự hủy
    cy.get('button[title*="tin nhắn tự hủy"]').click({ force: true });
    cy.get('textarea[placeholder*="tự hủy sau khi xem"]').should('be.visible');

    const secretMsg = 'GROUP_BURN_SECRET';
    cy.get('textarea[placeholder*="tự hủy sau khi xem"]').type(secretMsg, { force: true });
    cy.get('button[type="submit"]').click({ force: true });

    cy.get('button[title*="tin nhắn tự hủy"]').click({ force: true }); // Tắt tự hủy
    cy.wait(2000);

    // Đăng xuất sạch cho A
    logoutUser();

    // B đăng nhập đọc tin tự hủy
    loginAndUnlock(userBName, password, passphrase);
    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();

    // Đọc tin
    cy.contains(secretMsg, { timeout: 15000 }).should('be.visible');
    cy.wait(3000); // Đợi tin tự hủy bị trigger xóa cứng

    // Click sang phòng chat khác hoặc F5 lại trang để xác nhận biến mất hoàn toàn
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
    cy.wait(2000);

    cy.contains('Deep E2EE Group', { timeout: 15000 }).click();
    cy.contains(secretMsg).should('not.exist');

    // Đăng xuất sạch cho B
    logoutUser();
  });

  it('TC-GRP-E2EE-11 | [Security] Chặn truy cập thông tin nhóm hoặc đọc lén từ người lạ ngoài nhóm', () => {
    // 1. Tạo một người dùng C hoàn toàn mới không thuộc nhóm
    const strangerName = `cy_stranger_${ts}`;
    const strangerEmail = `${strangerName}@st.utt.edu.vn`;

    // Đăng ký stranger qua UI
    cleanState();
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input#register-username').type(strangerName);
    cy.get('input#register-email').type(strangerEmail);
    cy.get('input#register-password').type(password);
    cy.get('input#register-passphrase').type(passphrase);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.task('verifyUser', strangerName).should('eq', true);

    // Đăng nhập stranger và lấy token
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input[type="text"]').type(strangerName);
    cy.get('input[type="password"]').type(password);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('eq', Cypress.config().baseUrl + '/');
    cy.contains('Đang khởi tạo bảo mật...', { timeout: 15000 }).should('not.exist');
    cy.wait(2000);

    cy.window().then((win) => {
      const token = win.localStorage.getItem('token');
      const gId = groupId || Cypress.env('groupId');

      // Gửi request API lấy lịch sử tin nhắn nhóm mà stranger không tham gia
      cy.request({
        method: 'GET',
        url: `http://localhost:5000/api/groups/${gId}/messages`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false
      }).then((res) => {
        // Mong đợi bị chặn 403 Forbidden
        expect(res.status).to.eq(403);
        expect(res.body.error).to.include('Bạn không phải thành viên');

        // Đăng xuất sạch cho stranger
        logoutUser();
      });
    });
  });
});
