const cleanState = () => {
  cy.clearLocalStorage();
  cy.clearCookies();
  cy.window().then((win) => {
    win.sessionStorage.clear();
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

describe('Hệ thống Xác thực & Phân quyền (Authentication & Authorization)', () => {
  const uniqueId = Date.now();
  const username = `cy_user_${uniqueId}`;
  const email = `cy_${uniqueId}@st.utt.edu.vn`;
  const password = `Cypress12345`;
  const passphrase = `cypress_passphrase`;

  // 1. Luồng đăng ký & đăng nhập thành công (E2E)
  it('Cho phép người dùng đăng ký tài khoản mới, xác thực DB và đăng nhập thành công', () => {
    cleanState();
    // Truy cập trang đăng ký
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });

    // Kiểm tra giao diện đăng ký
    cy.contains('h2', 'Tạo khóa mới').should('be.visible');

    // Điền thông tin đăng ký hợp lệ
    cy.get('input#register-username').type(username);
    cy.get('input#register-email').type(email);
    cy.get('input#register-password').type(password);
    cy.get('input#register-passphrase').type(passphrase);

    // Kích hoạt đăng ký
    cy.get('button[type="submit"]').click();

    // Đợi chuyển hướng sang trang /login
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.contains('h2', 'Chào mừng trở lại').should('be.visible');

    // Điền thông tin đăng nhập
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input[type="text"]').type(username);
    cy.get('input[type="password"]').type(password);
    cy.get('button[type="submit"]').click();

    // Đợi hiển thị màn hình xác thực email
    cy.contains('h2', 'Xác thực Email UTT', { timeout: 15000 }).should('be.visible');

    // Lấy mã xác nhận từ DB qua Cypress task và điền vào UI
    cy.task('getVerificationCode', username).then((code) => {
      expect(code).to.not.be.null;
      const digits = code.split('');
      digits.forEach((digit, idx) => {
        cy.get(`#code-${idx}`).type(digit);
      });
      cy.get('button').contains('Xác thực tài khoản').click();
    });

    // Hiển thị RestoreKeyModal (Mở khóa Két sắt)
    cy.contains('h3', 'Mở khóa Két sắt', { timeout: 15000 }).should('be.visible');

    // Điền Passphrase bảo mật để khôi phục các khóa E2EE
    cy.get('input[placeholder*="khôi phục"]').type(passphrase);
    cy.get('button').contains('Kích hoạt Khôi phục').click();

    // Điều hướng vào màn hình chat chính thành công
    cy.url({ timeout: 20000 }).should('eq', Cypress.config().baseUrl + '/');
    cy.contains('h2', 'UTT SUPER APP', { timeout: 20000 }).should('be.visible');
  });

  // 2. Kiểm tra thông báo lỗi khi thông tin đăng nhập sai
  it('Hiển thị thông báo lỗi khi thông tin đăng nhập sai', () => {
    cleanState();
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input[type="text"]').type('wrong_user_xyz');
    cy.get('input[type="password"]').type('WrongPassword123');
    cy.get('button[type="submit"]').click();

    // Kiểm tra thông báo lỗi hiển thị trên giao diện
    cy.get('.text-red-500', { timeout: 15000 }).should('be.visible');
  });

  // 3. Kiểm tra validation của form đăng ký (Email & Mật khẩu & Passphrase)
  it('Kiểm tra validation form đăng ký (Email không hợp lệ & Mật khẩu yếu)', () => {
    cleanState();
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });

    // Điền Email không phải đuôi UTT
    cy.get('input#register-username').type('test_val_user');
    cy.get('input#register-email').type('test@gmail.com');
    cy.get('input#register-password').type('123'); // Mật khẩu quá ngắn, không viết hoa
    cy.get('input#register-passphrase').type('1234567'); // Khóa khôi phục quá ngắn (< 8)

    // Click submit
    cy.get('button[type="submit"]').click();

    // Giao diện phải chặn và báo lỗi email UTT
    cy.get('.text-red-500').scrollIntoView().should('be.visible')
      .and('contain', 'Vui lòng sử dụng Email UTT hợp lệ');

    // Sửa lại email đúng định dạng UTT, kiểm tra tiếp validation mật khẩu
    cy.get('input#register-email').clear().type('test_val@st.utt.edu.vn');
    cy.get('button[type="submit"]').click();
    cy.get('.text-red-500').should('contain', 'Mật khẩu chưa đáp ứng các yêu cầu bảo mật');

    // Kiểm tra hiển thị checklist độ mạnh mật khẩu
    cy.contains('Ít nhất 8 ký tự').should('be.visible');
    cy.contains('Có ít nhất 1 chữ cái viết HOA (A-Z)', { matchCase: false }).should('be.visible');
  });

  // 4. Kiểm tra phân quyền truy cập (Router Guard)
  it('Ngăn chặn người dùng không có vai trò Admin truy cập trang Dashboard Admin', () => {
    cleanState();
    // TH1: Chưa đăng nhập truy cập /admin -> chuyển hướng về /
    cy.visit('/admin', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.url().should('eq', Cypress.config().baseUrl + '/login');

    // TH2: Đăng nhập bằng tài khoản Student thường và truy cập /admin
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    // Sử dụng tài khoản student đã đăng ký thành công ở test case 1
    cy.get('input[type="text"]').type(username);
    cy.get('input[type="password"]').type(password);
    cy.get('button[type="submit"]').click();

    // Mở khóa Két sắt
    cy.get('input[placeholder*="khôi phục"]').type(passphrase);
    cy.get('button').contains('Kích hoạt Khôi phục').click();
    cy.url({ timeout: 15000 }).should('eq', Cypress.config().baseUrl + '/');

    // Cố tình gõ trực tiếp url /admin
    cy.visit('/admin', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    // Sẽ bị Router Guard của AdminRoute đẩy ngược lại trang chủ /
    cy.url({ timeout: 15000 }).should('eq', Cypress.config().baseUrl + '/');
  });

  // 5. Luồng kết bạn giữa 2 user mới (E2E Friendship Flow)
  it('Cho phép hai người dùng kết bạn và hiển thị trong danh sách chat', () => {
    const time = Date.now();
    const userA = `cy_user_a_${time}`;
    const userB = `cy_user_b_${time}`;
    const emailA = `cy_user_a_${time}@st.utt.edu.vn`;
    const emailB = `cy_user_b_${time}@st.utt.edu.vn`;
    const pw = `Cypress12345`;
    const pass = `cypress_passphrase`;

    // 1. Đăng ký User B (người nhận lời mời)
    cleanState();
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input#register-username').type(userB);
    cy.get('input#register-email').type(emailB);
    cy.get('input#register-password').type(pw);
    cy.get('input#register-passphrase').type(pass);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.task('verifyUser', userB).should('eq', true);

    // 2. Đăng ký User A (người gửi lời mời)
    cleanState();
    cy.visit('/register', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input#register-username').type(userA);
    cy.get('input#register-email').type(emailA);
    cy.get('input#register-password').type(pw);
    cy.get('input#register-passphrase').type(pass);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.task('verifyUser', userA).should('eq', true);

    // 3. Đăng nhập User A và gửi kết bạn cho User B
    cleanState();
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input[type="text"]').type(userA);
    cy.get('input[type="password"]').type(pw);
    cy.get('button[type="submit"]').click();

    cy.contains('h3', 'Mở khóa Két sắt', { timeout: 15000 }).should('be.visible');
    cy.get('input[placeholder*="khôi phục"]').type(pass);
    cy.get('button').contains('Kích hoạt Khôi phục').click();
    cy.url({ timeout: 20000 }).should('eq', Cypress.config().baseUrl + '/');

    // Chuyển sang tab Danh bạ
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();

    // Tìm kiếm User B
    cy.get('input[placeholder*="Tìm theo Tên"]').type(userB);
    cy.contains(userB, { timeout: 10000 }).should('be.visible');

    // Stub window alert để bắt thông báo thành công
    const alertStub = cy.stub();
    cy.on('window:alert', alertStub);

    // Click nút "Thêm bạn"
    cy.get('button[title="Thêm bạn"]').click().then(() => {
      expect(alertStub.getCall(0)).to.be.calledWith('Đã gửi lời mời kết bạn!');
    });

    // Đóng Modal tìm bạn
    cy.get('.lucide-x').click({ force: true });

    // 4. Đăng nhập User B và Chấp nhận lời mời kết bạn
    cleanState();
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('crypto_version', 'v19_1_deadlock_breaker');
      }
    });
    cy.get('input[type="text"]').type(userB);
    cy.get('input[type="password"]').type(pw);
    cy.get('button[type="submit"]').click();

    cy.contains('h3', 'Mở khóa Két sắt', { timeout: 15000 }).should('be.visible');
    cy.get('input[placeholder*="khôi phục"]').type(pass);
    cy.get('button').contains('Kích hoạt Khôi phục').click();
    cy.url({ timeout: 20000 }).should('eq', Cypress.config().baseUrl + '/');

    // Chuyển sang Danh bạ -> xem lời mời
    cy.contains('button', 'Danh bạ').click();
    cy.contains('button', 'Tìm bạn ngay').click();
    cy.contains('button', 'Lời mời').click();

    // Xác nhận thấy lời mời của User A và chấp nhận
    cy.contains(userA).should('be.visible');
    cy.get('button[title="Chấp nhận"]').click();

    // Đóng Modal kết bạn
    cy.get('.lucide-x').click({ force: true });

    // 5. Xác nhận hai người đã là bạn và hiển thị trong danh sách chat chính
    cy.contains('button', 'Tin nhắn').click();
    cy.contains(userA, { timeout: 10000 }).should('be.visible');
  });
});
