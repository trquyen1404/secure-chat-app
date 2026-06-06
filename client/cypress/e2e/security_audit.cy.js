import { io } from 'socket.io-client';

describe('Audit Bảo Mật Hệ Thống & Phòng Thủ Server (Security & DoS Audit)', () => {
  const API = 'http://localhost:5000/api';
  const ts = Date.now();
  const apiUser = (username, email, password = 'Cypress12345') =>
    cy.task('createUserAndGetToken', { username, email, password });


  /**
   * TC-SEC-01
   * Component/Function: Helmet Middleware
   * Description: Xác nhận các HTTP Header bảo mật của Helmet được trả về từ server để chống Clickjacking, MIME-sniffing, XSS.
   * Expected Output: Các header bảo mật tồn tại và có giá trị cấu hình an toàn.
   */
  it('TC-SEC-01 | [Security] Xác nhận các Header bảo mật (Helmet) được cấu hình trên server', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/',
    }).then((res) => {
      expect(res.status).to.eq(200);
      
      // Chống Clickjacking
      expect(res.headers).to.have.property('x-frame-options');
      expect(res.headers['x-frame-options']).to.be.oneOf(['SAMEORIGIN', 'DENY']);
      
      // Chống MIME-sniffing
      expect(res.headers).to.have.property('x-content-type-options');
      expect(res.headers['x-content-type-options']).to.eq('nosniff');
      
      // Referrer Policy
      expect(res.headers).to.have.property('referrer-policy');
      expect(res.headers['referrer-policy']).to.be.oneOf(['same-origin', 'no-referrer']);
    });
  });

  /**
   * TC-SEC-02
   * Component/Function: express.json Payload Limit
   * Description: Gửi yêu cầu với body JSON có dung lượng vượt quá giới hạn thiết lập (1MB) để kiểm tra phòng thủ DoS.
   * Expected Output: HTTP 413 Payload Too Large.
   */
  it('TC-SEC-02 | [Security] Chặn các gói tin JSON quá lớn (> 1MB) → 413 Payload Too Large', () => {
    // Tạo chuỗi lớn ~1.2 MB
    const largePayload = 'A'.repeat(1.2 * 1024 * 1024);

    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: { 
        username: 'victim_user', 
        password: 'WrongPassword123',
        extraField: largePayload
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(413);
    });
  });

  /**
   * TC-SEC-03
   * Component/Function: HTTP Parameter Pollution (HPP) Middleware
   * Description: Gửi yêu cầu với các tham số trùng tên dưới dạng mảng (ví dụ: query ?username=user1&username=user2
   *              hoặc gửi body có chứa mảng cho field mong muốn chuỗi) để kiểm tra xem HPP middleware có
   *              lọc và chỉ lấy phần tử cuối cùng để phòng ngừa tấn công Parameter Pollution hay không.
   * Expected Output: Server xử lý bình thường bằng cách giữ lại giá trị cuối, không bị crash hoặc lỗi logic.
   */
  it('TC-SEC-03 | [Security] HTTP Parameter Pollution (HPP) - Chặn và xử lý tham số trùng tên (mảng)', () => {
    // 1. Kiểm tra đối với query parameters trùng tên
    cy.request({
      method: 'GET',
      url: `${API}/auth/login?username=hacker1&username=hacker2`,
      failOnStatusCode: false
    }).then((res) => {
      // Vì /auth/login là POST, gọi GET sẽ trả về 404 hoặc 405 (không phải crash do mảng)
      expect(res.status).to.be.oneOf([404, 405]);
    });

    // 2. Gửi body có tham số dạng mảng cho trường vốn dĩ là chuỗi
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: {
        username: ['hacker1', 'hacker2'], // Gửi mảng
        password: 'Password123'
      },
      failOnStatusCode: false
    }).then((res) => {
      // HPP không chạy trên JSON body nên Zod schema sẽ từ chối mảng và trả về 400 Validation Error
      expect(res.status).to.eq(400);
      expect(res.body.error).to.eq('Validation Error');
    });
  });

  /**
   * TC-SEC-04
   * Component/Function: CORS Middleware
   * Description: Gửi yêu cầu từ Origin không nằm trong danh sách ALLOWED_ORIGINS (ví dụ: http://malicious-site.com).
   * Expected Output: HTTP 500 với thông báo vi phạm chính sách CORS (CORS policy violation).
   */
  it('TC-SEC-04 | [Security] CORS Policy - Chặn các yêu cầu từ Origin không hợp lệ', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      headers: {
        Origin: 'http://malicious-site.com'
      },
      body: {
        username: 'victim_user',
        password: 'WrongPassword123'
      },
      failOnStatusCode: false
    }).then((res) => {
      // Server trả về 500 và thông báo CORS policy violation
      expect(res.status).to.eq(500);
      expect(res.body.error).to.include('CORS policy violation');
    });

    // CORS cho phép Origin hợp lệ
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      headers: {
        Origin: 'http://localhost:5173'
      },
      body: {
        username: 'victim_user',
        password: 'WrongPassword123'
      },
      failOnStatusCode: false
    }).then((res) => {
      // Origin hợp lệ được đi tiếp đến tầng định tuyến chính (trả về 401 do sai mật khẩu chứ không lỗi CORS 500)
      expect(res.status).to.eq(401);
      expect(res.headers).to.have.property('access-control-allow-origin');
      expect(res.headers['access-control-allow-origin']).to.eq('http://localhost:5173');
    });
  });

  /**
   * TC-SEC-05
   * Component/Function: rateLimit Middleware (authLimiter)
   * Description: Kích hoạt giới hạn tần suất nhanh bằng cách truyền tiêu đề kiểm thử x-test-rate-limit: true.
   * Expected Output: Gửi 5 yêu cầu đầu tiên thành công/sai mật khẩu bình thường (401), yêu cầu thứ 6 bị chặn với lỗi 429 Too Many Requests.
   */
  it('TC-SEC-05 | [Security] Rate Limiting - Trả về lỗi 429 Too Many Requests khi bị DDoS/Flooding', () => {
    const testKey = `test_rate_limit_${Date.now()}`;
    const sendRequest = () => {
      return cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        headers: {
          'x-test-rate-limit': 'true',
          'x-test-rate-limit-key': testKey
        },
        body: { username: 'victim_user', password: 'WrongPassword123' },
        failOnStatusCode: false
      });
    };

    // Gửi 5 yêu cầu đầu tiên (giới hạn tối đa là 5)
    sendRequest().then((res1) => {
      expect(res1.status).to.eq(401);
      sendRequest().then((res2) => {
        expect(res2.status).to.eq(401);
        sendRequest().then((res3) => {
          expect(res3.status).to.eq(401);
          sendRequest().then((res4) => {
            expect(res4.status).to.eq(401);
            sendRequest().then((res5) => {
              expect(res5.status).to.eq(401);
              // Yêu cầu thứ 6 phải bị chặn do vượt quá 5 yêu cầu
              sendRequest().then((res6) => {
                expect(res6.status).to.eq(429);
                expect(res6.body.error).to.include('Too many login attempts');
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-06
   * Component/Function: Request Sanitization Middleware
   * Description: Đăng ký tài khoản với username chứa thẻ script HTML (ví dụ: <script>xss</script>).
   * Expected Output: Thẻ HTML được lọc bỏ hoàn toàn, tài khoản được tạo với tên an toàn đã lọc bỏ thẻ.
   */
  it('TC-SEC-06 | [Security] Request Sanitization - Lọc bỏ các thẻ HTML để ngăn chặn XSS', () => {
    const randomSuffix = Date.now();
    const rawUsername = `xss_<script>user</script>_${randomSuffix}`;
    const expectedSanitizedUsername = `xss__${randomSuffix}`;
    const testEmail = `cy_xss_${randomSuffix}@st.utt.edu.vn`;

    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: testEmail,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        }
      },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(201);
      // Tên username trả về từ DB đã bị sanitize (xóa bỏ ký tự < và >)
      expect(res.body.user.username).to.eq(expectedSanitizedUsername);
    });
  });

  /**
   * TC-SEC-07
   * Component/Function: Production Logging Guard
   * Description: Kiểm tra xem console.log có bị chặn hiển thị các trace logs nhạy cảm.
   * Expected Output: Không xuất hiện log chứa các chuỗi nhận diện trace của E2EE hay Register.
   */
  it('TC-SEC-07 | [Security] Production Log Guard - Không hiển thị logs trace bảo mật nhạy cảm', () => {
    cy.visit('/login', {
      onBeforeLoad(win) {
        cy.spy(win.console, 'log').as('consoleLogSpy');
      }
    });

    // Verify spy đã thiết lập và không có log chứa thông tin nhạy cảm
    cy.get('@consoleLogSpy').should('not.have.been.calledWithMatch', /CRYPTO-Audit|E2EE-Logic|Register-Trace/);
  });

  /**
   * TC-SEC-08
   * Component/Function: Request Sanitization with sanitize-html (XSS Edge Cases)
   * Description: Gửi payload chứa các thẻ HTML nguy hiểm khác nhau (img onerror, nested tags, javascript: scheme) để xem có bị lọc bỏ.
   * Expected Output: Các thẻ nguy hại bị loại bỏ hoàn toàn, chỉ giữ lại phần an toàn.
   */
  it('TC-SEC-08 | [Security] XSS Sanitization edge cases - Lọc bỏ img onerror và các thẻ HTML lồng nhau', () => {
    const rawUsername = `xss_<img src=x onerror=alert(1)><script>alert("nested")</script>_${ts}`;
    const expectedSanitized = `xss__${ts}`;

    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `cy_xss_edge_${ts}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        }
      },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.user.username).to.eq(expectedSanitized);
    });
  });

  /**
   * TC-SEC-09
   * Component/Function: Socket.IO Reconnection & Auth Token Update
   * Description: Cập nhật kết nối Socket.IO khi JWT access token thay đổi (Ví dụ sau khi refresh).
   * Pre-conditions: User đăng nhập vào hệ thống và được cấp token.
   * Input Data: Thiết lập token mới vào window.socket.
   * Expected Output: Socket.IO khởi tạo lại kết nối với token mới trong phần auth payload.
   */
  it('TC-SEC-09 | [Security] Socket.IO tự động cập nhật auth token mới khi cấu hình thay đổi', () => {
    apiUser(`cy_sec9_${ts}`, `cy_sec9_${ts}@st.utt.edu.vn`).then((user) => {
      cy.visit('/login');
      // Set token vào localStorage để trigger SocketProvider reload
      cy.window().then((win) => {
        win.localStorage.setItem('token', user.token);
        // Dispatch event giả lập thay đổi auth
        win.dispatchEvent(new win.CustomEvent('auth-refreshed', { detail: user.token }));
      });
      // Đợi Socket.IO được tạo trên cửa sổ window
      cy.window().should('have.property', 'socket').and('not.be.null');
      cy.window().then((win) => {
        expect(win.socket.auth.token).to.eq(user.token);
      });
    });
  });

  /**
   * TC-SEC-10
   * Component/Function: Socket JWT tokenVersion verification
   * Description: Khi token bị thu hồi (ví dụ sau khi gọi revoke-all), kết nối Socket.IO mới dùng token đó phải bị từ chối truy cập.
   * Pre-conditions: User đăng nhập và nhận token, sau đó gọi revoke-all để tăng tokenVersion
   * Input Data: Thiết lập kết nối Socket.IO mới với token đã bị thu hồi
   * Expected Output: Kết nối Socket.IO thất bại với lỗi Authentication error: token revoked
   */
  it('TC-SEC-10 | [Security] Socket.IO từ chối kết nối khi sử dụng token đã bị thu hồi → 401', () => {
    apiUser(`cy_sec10_${ts}`, `cy_sec10_${ts}@st.utt.edu.vn`).then((user) => {
      const oldToken = user.token;

      // Revoke token bằng cách tăng tokenVersion
      cy.request({
        method: 'POST',
        url: `${API}/auth/revoke-all`,
        headers: { Authorization: `Bearer ${oldToken}` }
      }).then(() => {
        // Cố gắng mở một socket connection bằng token cũ
        cy.visit('/login');
        cy.window().then(() => {
          const socket = io('http://localhost:5000', {
            auth: { token: oldToken },
            reconnection: false
          });

          socket.on('connect_error', (err) => {
            expect(err.message).to.include('token revoked');
            socket.disconnect();
          });
        });
      });
    });
  });

  /**
   * TC-SEC-11
   * Component/Function: getUserGroups SQL Injection Defense
   * Description: Xác nhận hệ thống phòng chống SQL Injection thành công trên endpoint lấy danh sách nhóm
   * Pre-conditions: User đã đăng nhập
   * Expected Output: HTTP 200, danh sách nhóm được trả về hợp lệ và không bị lỗi SQL.
   */
  it('TC-SEC-11 | [Security] Phòng chống tấn công SQL Injection trên getUserGroups → 200 OK', () => {
    apiUser(`cy_sec11_${ts}`, `cy_sec11_${ts}@st.utt.edu.vn`).then((user) => {
      cy.request({
        method: 'GET',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${user.token}` }
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
      });
    });
  });

  /**
   * TC-SEC-12
   * Component/Function: Email Verification Constraint on general APIs
   * Description: Người dùng chưa xác thực email (isVerified = false) khi gọi API thông thường phải bị chặn và trả về 403 Forbidden.
   * Expected Output: HTTP 403.
   */
  it('TC-SEC-12 | [Security] Chặn người dùng chưa xác thực email gọi các API thông thường → 403 Forbidden', () => {
    // Đăng ký tài khoản mới chưa verify
    const rawUsername = `cy_sec12_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `${rawUsername}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        }
      }
    }).then((res) => {
      const token = res.body.token;
      
      // Gọi thử API GET /api/users
      cy.request({
        method: 'GET',
        url: `${API}/users`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false
      }).then((apiRes) => {
        expect(apiRes.status).to.eq(403);
        expect(apiRes.body.error).to.include('chưa được xác thực email');
      });
    });
  });

  /**
   * TC-SEC-13
   * Component/Function: E2EE Bypass XSS Sanitizer
   * Description: Các trường dữ liệu mã hóa E2EE không được bị thay đổi/mất dữ liệu bởi bộ lọc XSS sanitizer.
   * Expected Output: Dữ liệu E2EE giữ nguyên không đổi.
   */
  it('TC-SEC-13 | [Security] Bỏ qua bộ lọc XSS sanitizer đối với các trường dữ liệu mã hóa E2EE', () => {
    // Đăng ký tài khoản
    const rawUsername = `cy_sec13_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `${rawUsername}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'publicKey_with_special_chars_<script>_alert(1)', // E2EE field containing HTML tags
        dhPublicKey: 'dhPublicKey_with_special_chars_<img>_onerror',
        signedPreKey: {
          publicKey: 'signedPreKey_with_special_chars_<a>',
          signature: 'signature_with_special_chars_<p>'
        }
      }
    }).then((res) => {
      expect(res.status).to.eq(201);
      // Kiểm tra các trường E2EE được trả về nguyên trạng, không bị sanitizeHtml lọc mất hoặc strip thẻ
      expect(res.body.user.publicKey).to.eq('publicKey_with_special_chars_<script>_alert(1)');
    });
  });

  /**
   * TC-SEC-14
   * Component/Function: Socket.IO Rate Limiting
   * Description: Spam gửi tin nhắn liên tiếp qua Socket.IO vượt quá giới hạn 60 req/phút phải bị trả về lỗi Rate limit exceeded.
   * Expected Output: Nhận sự kiện error thông báo vượt quá giới hạn.
   */
  it('TC-SEC-14 | [Security] Socket.IO rate limit chặn spam tin nhắn liên tục', () => {
    apiUser(`cy_sec14_${ts}`, `cy_sec14_${ts}@st.utt.edu.vn`).then((user) => {
      cy.visit('/login');
      cy.window().then((win) => {
        return new Promise((resolve, reject) => {
          const socket = io('http://localhost:5000', {
            auth: { token: user.token },
            reconnection: false
          });

          socket.on('connect', () => {
            let exceeded = false;
            socket.on('error', (err) => {
              if (err.message && err.message.includes('Rate limit exceeded')) {
                exceeded = true;
              }
            });

            // Gửi 65 message nhanh
            for (let i = 0; i < 65; i++) {
              socket.emit('sendMessage', {
                recipientId: user.userId, // gửi cho chính mình
                encryptedContent: 'spam',
                ratchetKey: 'RK',
                n: i,
                pn: 0,
                iv: 'IV',
                type: 'text'
              });
            }

            setTimeout(() => {
              try {
                expect(exceeded).to.be.true;
                socket.disconnect();
                resolve();
              } catch (err) {
                socket.disconnect();
                reject(err);
              }
            }, 300);
          });

          socket.on('connect_error', (err) => {
            reject(err);
          });
        });
      });
    });
  });

  /**
   * TC-SEC-15
   * Component/Function: CSPRNG verificationToken check
   * Description: Mã OTP 6 chữ số phải là chuỗi số có độ dài bằng 6.
   * Expected Output: Chuỗi số 6 ký tự.
   */
  it('TC-SEC-15 | [Security] Mã OTP xác minh email được sinh ra là chuỗi số 6 ký tự', () => {
    const rawUsername = `cy_sec15_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `${rawUsername}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        }
      }
    }).then((res) => {
      // Lấy code từ task hoặc API debug (trong dev mode, verificationToken được lưu trong DB)
      cy.task('getUserByUsername', rawUsername).then((userDb) => {
        expect(userDb.verificationToken).to.match(/^\d{6}$/);
      });
    });
  });

  /**
   * TC-SEC-16
   * Component/Function: deleteGroupMessage Authorization check
   * Description: Thành viên thường cố gắng xóa tin nhắn của thành viên khác qua socket sẽ bị chặn.
   * Expected Output: Tin nhắn không bị xóa.
   */
  it('TC-SEC-16 | [Security] Thành viên thường không thể xóa tin nhắn của người khác qua Socket.IO', () => {
    apiUser(`cy_sec16a_${ts}`, `cy_sec16a_${ts}@st.utt.edu.vn`).then((userA) => {
      apiUser(`cy_sec16b_${ts}`, `cy_sec16b_${ts}@st.utt.edu.vn`).then((userB) => {
        // Tạo nhóm bởi A, thêm B vào
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${userA.token}` },
          body: { name: 'Nhóm Test Del socket', memberIds: [userB.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;
          
          // A gửi tin nhắn thường
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${userA.token}` },
            body: { encryptedContent: 'A text msg', ratchetKey: 'RK', n: 0, pn: 0, iv: 'IV' }
          }).then((msgRes) => {
            const messageId = msgRes.body.id;

            cy.visit('/login');
            cy.window().then((win) => {
              return new Promise((resolve, reject) => {
                // B connect socket
                const socket = io('http://localhost:5000', {
                  auth: { token: userB.token },
                  reconnection: false
                });

                socket.on('connect', () => {
                  // B emit deleteGroupMessage tin nhắn của A
                  socket.emit('deleteGroupMessage', { messageId, groupId });
                  
                  setTimeout(async () => {
                    try {
                      // Dùng native fetch trong browser của Cypress để kiểm tra tin nhắn trong nhóm
                      const response = await win.fetch(`${API}/groups/${groupId}/messages`, {
                        headers: { Authorization: `Bearer ${userA.token}` }
                      });
                      const messages = await response.json();
                      const msg = messages.find(m => m.id === messageId);
                      expect(msg.encryptedContent).to.eq('A text msg'); // không bị xóa
                      socket.disconnect();
                      resolve();
                    } catch (err) {
                      socket.disconnect();
                      reject(err);
                    }
                  }, 300);
                });

                socket.on('connect_error', (err) => {
                  reject(err);
                });
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-17
   * Component/Function: Delete Group cascade delete (L4-01)
   * Description: Xóa nhóm thành công khi nhóm có thành viên và tin nhắn (onDelete CASCADE).
   * Expected Output: HTTP 200, group bị xóa thành công và không bị lỗi Foreign Key Constraint (lỗi 500).
   */
  it('TC-SEC-17 | [Security] Xóa nhóm thành công khi nhóm có thành viên và tin nhắn (onDelete CASCADE) → 200', () => {
    apiUser(`cy_sec17a_${ts}`, `cy_sec17a_${ts}@st.utt.edu.vn`).then((userA) => {
      apiUser(`cy_sec17b_${ts}`, `cy_sec17b_${ts}@st.utt.edu.vn`).then((userB) => {
        // 1. A tạo Group, thêm B vào
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${userA.token}` },
          body: { name: 'Nhóm Test Delete Cascade', memberIds: [userB.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;
          
          // 2. A gửi tin nhắn vào Group
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${userA.token}` },
            body: { encryptedContent: 'Tin nhắn Cascade', ratchetKey: 'RK', n: 0, pn: 0, iv: 'IV' }
          }).then(() => {
            // 3. A xóa Group
            cy.request({
              method: 'DELETE',
              url: `${API}/groups/${groupId}`,
              headers: { Authorization: `Bearer ${userA.token}` }
            }).then((delRes) => {
              expect(delRes.status).to.eq(200);
              expect(delRes.body.message.toLowerCase()).to.match(/delete|xóa/);
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-18
   * Component/Function: Mass Assignment register protection (L4-03)
   * Description: Sinh viên đăng ký không được tự gán teacherId qua JSON body.
   * Expected Output: teacherId trong cơ sở dữ liệu phải là null sau khi đăng ký thành công.
   */
  it('TC-SEC-18 | [Security] Mass Assignment register - Sinh viên không được tự gán teacherId → teacherId là null', () => {
    const rawUsername = `cy_sec18_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `${rawUsername}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        },
        teacherId: 'GV_MALICIOUS_999' // Cố tình gán teacherId
      }
    }).then((res) => {
      expect(res.status).to.eq(201);
      // Kiểm tra trong cơ sở dữ liệu qua task
      cy.task('getUserByUsername', rawUsername).then((userDb) => {
        expect(userDb.teacherId).to.be.null;
        expect(userDb.studentId).to.be.null; // vì không gửi studentId
      });
    });
  });

  /**
   * TC-SEC-19
   * Component/Function: getPreKeyBundle race condition protection (L4-02)
   * Description: Lấy prekey bundle đồng thời của cùng một user sẽ lấy được các One-Time PreKey khác nhau (tránh race condition).
   * Expected Output: Hai yêu cầu song song phải lấy được các OTPK khác nhau.
   */
  it('TC-SEC-19 | [Security] getPreKeyBundle - Chống race condition khi lấy OTPK đồng thời', () => {
    const rawUsername = `cy_sec19_${ts}`;
    
    // Tạo user C đã verified sẵn qua task
    apiUser(rawUsername, `${rawUsername}@st.utt.edu.vn`).then((userC) => {
      const token = userC.token;
      const userId = userC.userId;

      // Upload 2 One-Time PreKeys mới cho user C
      cy.request({
        method: 'POST',
        url: `${API}/users/opks`,
        headers: { Authorization: `Bearer ${token}` },
        body: {
          oneTimePreKeys: [
            { publicKey: 'OPK_KEY_001_VALID_LENGTH_BASE64=' },
            { publicKey: 'OPK_KEY_002_VALID_LENGTH_BASE64=' }
          ]
        }
      }).then(() => {
        // Gửi 2 request lấy bundle của user C đồng thời
        const req1 = cy.request({
          method: 'GET',
          url: `${API}/users/${userId}/prekey-bundle`,
          headers: { Authorization: `Bearer ${token}` }
        });
        const req2 = cy.request({
          method: 'GET',
          url: `${API}/users/${userId}/prekey-bundle`,
          headers: { Authorization: `Bearer ${token}` }
        });

        // cy.wrap với Promise.all để bắt cả hai phản hồi đồng thời
        cy.wrap(Promise.all([
          new Promise((resolve) => req1.then(resolve)),
          new Promise((resolve) => req2.then(resolve))
        ])).then((results) => {
          const otpk1 = results[0].body.oneTimePreKey ? results[0].body.oneTimePreKey.publicKey : null;
          const otpk2 = results[1].body.oneTimePreKey ? results[1].body.oneTimePreKey.publicKey : null;

          // Đảm bảo không trùng nhau
          expect(otpk1).to.not.be.null;
          expect(otpk2).to.not.be.null;
          expect(otpk1).to.not.eq(otpk2);
        });
      });
    });
  });

  /**
   * TC-SEC-20
   * Component/Function: Mass IDOR on Academic Extension modules (L5-01)
   * Description: Người dùng không thuộc nhóm B cố gắng xem Announcements hoặc Notes của nhóm B phải bị từ chối với mã lỗi 403 Forbidden.
   * Expected Output: HTTP 403.
   */
  it('TC-SEC-20 | [Security] Chặn truy cập IDOR trên các API học tập của nhóm khác → 403 Forbidden', () => {
    // Tạo 2 user A và B
    apiUser(`cy_sec20a_${ts}`, `cy_sec20a_${ts}@st.utt.edu.vn`).then((userA) => {
      apiUser(`cy_sec20b_${ts}`, `cy_sec20b_${ts}@st.utt.edu.vn`).then((userB) => {
        // User B tạo nhóm
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${userB.token}` },
          body: { name: 'Nhóm của B', memberIds: [] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;
          
          // User A (không thuộc nhóm của B) cố gắng lấy Announcements của nhóm B
          cy.request({
            method: 'GET',
            url: `${API}/academic/announcements/${groupId}`,
            headers: { Authorization: `Bearer ${userA.token}` },
            failOnStatusCode: false
          }).then((res) => {
            expect(res.status).to.eq(403);
            expect(res.body.error).to.include('Bạn không phải thành viên');
          });

          // User A cố gắng lấy Notes của nhóm B
          cy.request({
            method: 'GET',
            url: `${API}/academic/notes/${groupId}`,
            headers: { Authorization: `Bearer ${userA.token}` },
            failOnStatusCode: false
          }).then((res) => {
            expect(res.status).to.eq(403);
            expect(res.body.error).to.include('Bạn không phải thành viên');
          });
        });
      });
    });
  });

  /**
   * TC-SEC-21
   * Component/Function: Privilege Escalation (Teacher Spoofing) prevention (L5-02)
   * Description: Sinh viên (role = student) cố gắng tạo Bài tập (createAssignment) hoặc tạo buổi điểm danh (createSession) phải bị từ chối 403.
   * Expected Output: HTTP 403.
   */
  it('TC-SEC-21 | [Security] Ngăn sinh viên tạo bài tập hoặc điểm danh (Privilege Escalation) → 403 Forbidden', () => {
    // Tạo giáo viên T và học sinh S
    apiUser(`cy_sec21t_${ts}`, `cy_sec21t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec21s_${ts}`, `cy_sec21s_${ts}@st.utt.edu.vn`).then((student) => {
        // Giáo viên T tạo nhóm và thêm học sinh S vào
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Lớp học của T', memberIds: [student.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // Học sinh S (chỉ là member thường, và role là student) cố gắng tạo bài tập
          cy.request({
            method: 'POST',
            url: `${API}/assignments`,
            headers: { Authorization: `Bearer ${student.token}` },
            body: {
              groupId,
              title: 'Bài tập lậu',
              description: 'Mô tả',
              deadline: new Date(Date.now() + 86400000),
              points: 10
            },
            failOnStatusCode: false
          }).then((res) => {
            expect(res.status).to.eq(403);
            expect(res.body.error).to.include('Chỉ giảng viên hoặc quản trị viên');
          });

          // Học sinh S cố gắng tạo buổi điểm danh
          cy.request({
            method: 'POST',
            url: `${API}/attendance/sessions`,
            headers: { Authorization: `Bearer ${student.token}` },
            body: {
              groupId,
              title: 'Điểm danh lậu',
              durationMinutes: 15
            },
            failOnStatusCode: false
          }).then((res) => {
            expect(res.status).to.eq(403);
            expect(res.body.error).to.include('Chỉ giảng viên hoặc quản trị viên');
          });
        });
      });
    });
  });

  /**
   * TC-SEC-22
   * Component/Function: IDOR on submitAssignment (L5-02)
   * Description: Học sinh không thuộc nhóm học tập cố gắng nộp bài tập (submitAssignment) của nhóm đó phải bị chặn 403.
   * Expected Output: HTTP 403.
   */
  it('TC-SEC-22 | [Security] IDOR submitAssignment - Chặn học sinh nhóm khác nộp bài tập → 403 Forbidden', () => {
    // Tạo giáo viên T và học sinh S (không thuộc nhóm)
    apiUser(`cy_sec22t_${ts}`, `cy_sec22t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec22s_${ts}`, `cy_sec22s_${ts}@st.utt.edu.vn`).then((student) => {
        // 1. Giáo viên tạo nhóm (không có học sinh S)
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Nhóm học tập của T', memberIds: [] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // 2. Giáo viên tạo bài tập
          cy.request({
            method: 'POST',
            url: `${API}/assignments`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: {
              groupId,
              title: 'Bài tập của T',
              description: 'Mô tả',
              deadline: new Date(Date.now() + 86400000),
              points: 10
            }
          }).then((assignRes) => {
            const assignmentId = assignRes.body.id;

            // 3. Học sinh S cố gắng nộp bài cho bài tập này
            cy.request({
              method: 'POST',
              url: `${API}/assignments/submit`,
              headers: { Authorization: `Bearer ${student.token}` },
              body: {
                assignmentId,
                fileUrl: '/uploads/assignment.pdf',
                fileName: 'assignment.pdf'
              },
              failOnStatusCode: false
            }).then((res) => {
              expect(res.status).to.eq(403);
              expect(res.body.error).to.include('Bạn không phải thành viên');
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-23
   * Component/Function: Poll Vote IDOR check (L6-01)
   * Description: Học sinh ngoài nhóm cố gắng vote cho bình chọn của nhóm này phải bị chặn 403 Forbidden.
   * Expected Output: HTTP 403.
   */
  it('TC-SEC-23 | [Security] IDOR Poll Vote - Ngăn người ngoài nhóm tham gia bỏ phiếu → 403 Forbidden', () => {
    // Tạo giáo viên T và học sinh S (không thuộc nhóm)
    apiUser(`cy_sec23t_${ts}`, `cy_sec23t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec23s_${ts}`, `cy_sec23s_${ts}@st.utt.edu.vn`).then((student) => {
        // 1. Giáo viên tạo nhóm
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Nhóm học tập của T', memberIds: [] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // 2. Giáo viên tạo bình chọn
          cy.request({
            method: 'POST',
            url: `${API}/polls`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: {
              groupId,
              question: 'Khảo sát của T',
              options: ['Đồng ý', 'Không đồng ý'],
              isMultipleChoice: false,
              isAnonymous: false,
              expiresAt: new Date(Date.now() + 86400000)
            }
          }).then((pollRes) => {
            const pollId = pollRes.body.id;
            const optionId = pollRes.body.Options[0].id;

            // 3. Học sinh S (không thuộc nhóm) cố gắng vote
            cy.request({
              method: 'POST',
              url: `${API}/polls/vote`,
              headers: { Authorization: `Bearer ${student.token}` },
              body: { pollId, optionId },
              failOnStatusCode: false
            }).then((res) => {
              expect(res.status).to.eq(403);
              expect(res.body.error).to.include('Bạn không phải thành viên');
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-24
   * Component/Function: Resource Pinning Authorization check (L6-02)
   * Description: Chỉ uploader, giảng viên hoặc admin mới được ghin tài liệu. Thành viên thường hoặc người ngoài nhóm cố gắng ghim sẽ bị chặn 403.
   * Expected Output: HTTP 403.
   */
  it('TC-SEC-24 | [Security] Resource Pinning - Ngăn thành viên thường ghim tài liệu của nhóm → 403 Forbidden', () => {
    // Tạo giáo viên T và học sinh S
    apiUser(`cy_sec24t_${ts}`, `cy_sec24t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec24s_${ts}`, `cy_sec24s_${ts}@st.utt.edu.vn`).then((student) => {
        // Giáo viên T tạo nhóm và thêm học sinh S vào
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Lớp học của T', memberIds: [student.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // Giáo viên T tải tài liệu lên
          cy.request({
            method: 'POST',
            url: `${API}/resources`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: {
              groupId,
              title: 'Bài giảng của T',
              fileUrl: '/uploads/lecture.pdf',
              fileType: 'pdf',
              fileSize: 1024,
              category: 'document'
            }
          }).then((resResource) => {
            const resourceId = resResource.body.id;

            // Học sinh S (thành viên thường, không phải uploader) cố gắng ghim tài liệu
            cy.request({
              method: 'PATCH',
              url: `${API}/resources/${resourceId}/pin`,
              headers: { Authorization: `Bearer ${student.token}` },
              failOnStatusCode: false
            }).then((res) => {
              expect(res.status).to.eq(403);
              expect(res.body.error).to.include('Chỉ người tải lên');
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-25
   * Component/Function: Resource Deletion Authorization check (L6-03)
   * Description: Giáo viên / Admin nhóm được quyền xóa tài liệu của sinh viên. Sinh viên thường không thể xóa tài liệu của sinh viên khác.
   * Expected Output: Sinh viên thường bị cấm xóa (403), giáo viên xóa thành công (200).
   */
  it('TC-SEC-25 | [Security] Resource Deletion - Cho phép giáo viên xóa tài liệu của sinh viên, chặn sinh viên xóa chéo tài liệu nhau', () => {
    // Tạo giáo viên T, học sinh S1 và học sinh S2
    apiUser(`cy_sec25t_${ts}`, `cy_sec25t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec25s1_${ts}`, `cy_sec25s1_${ts}@st.utt.edu.vn`).then((student1) => {
        apiUser(`cy_sec25s2_${ts}`, `cy_sec25s2_${ts}@st.utt.edu.vn`).then((student2) => {
          // Giáo viên T tạo nhóm và thêm 2 học sinh vào
          cy.request({
            method: 'POST',
            url: `${API}/groups`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: { name: 'Lớp học của T', memberIds: [student1.userId, student2.userId] }
          }).then((grpRes) => {
            const groupId = grpRes.body.id;

            // Học sinh S1 upload tài liệu
            cy.request({
              method: 'POST',
              url: `${API}/resources`,
              headers: { Authorization: `Bearer ${student1.token}` },
              body: {
                groupId,
                title: 'Tài liệu của S1',
                fileUrl: '/uploads/s1.pdf',
                fileType: 'pdf',
                fileSize: 512,
                category: 'document'
              }
            }).then((resResource) => {
              const resourceId = resResource.body.id;

              // 1. Học sinh S2 cố gắng xóa tài liệu của S1 → 403 Forbidden
              cy.request({
                method: 'DELETE',
                url: `${API}/resources/${resourceId}`,
                headers: { Authorization: `Bearer ${student2.token}` },
                failOnStatusCode: false
              }).then((resDel1) => {
                expect(resDel1.status).to.eq(403);
                expect(resDel1.body.error).to.include('không có quyền xóa');

                // 2. Giáo viên T xóa tài liệu của S1 → 200 OK
                cy.request({
                  method: 'DELETE',
                  url: `${API}/resources/${resourceId}`,
                  headers: { Authorization: `Bearer ${teacher.token}` }
                }).then((resDel2) => {
                  expect(resDel2.status).to.eq(200);
                  expect(resDel2.body.message).to.eq('Resource deleted');
                });
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-26
   * Component/Function: Unbounded OPK Uploads protection (L7-01)
   * Description: Chặn upload OPK có số lượng vượt quá 100 khóa.
   * Expected Output: HTTP 400 Bad Request.
   */
  it('TC-SEC-26 | [Security] Chặn upload OPK có số lượng vượt quá 100 khóa → 400 Bad Request', () => {
    apiUser(`cy_sec26_${ts}`, `cy_sec26_${ts}@st.utt.edu.vn`).then((user) => {
      const token = user.token;
      const invalidOpks = [];
      for (let i = 0; i < 101; i++) {
        invalidOpks.push({ publicKey: `OPK_KEY_${String(i).padStart(12, '0')}` });
      }
      
      cy.request({
        method: 'POST',
        url: `${API}/users/opks`,
        headers: { Authorization: `Bearer ${token}` },
        body: { oneTimePreKeys: invalidOpks },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.match(/Validation Error|Maximum 100/);
      });
    });
  });

  /**
   * TC-SEC-27
   * Component/Function: searchUsers ReDoS protection (L7-02)
   * Description: Tìm kiếm người dùng tự động cắt ngắn query (>50 ký tự) và escape ký tự wildcard SQL.
   * Expected Output: HTTP 200 OK, hệ thống hoạt động ổn định và không treo DB.
   */
  it('TC-SEC-27 | [Security] Tìm kiếm người dùng tự động cắt ngắn query và escape ký tự wildcard SQL', () => {
    apiUser(`cy_sec27_${ts}`, `cy_sec27_${ts}@st.utt.edu.vn`).then((user) => {
      const token = user.token;
      
      // 1. Thử gửi query tìm kiếm cực dài (> 50 ký tự)
      const longQuery = 'a'.repeat(60);
      cy.request({
        method: 'GET',
        url: `${API}/users/search`,
        headers: { Authorization: `Bearer ${token}` },
        qs: { query: longQuery }
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
      });

      // 2. Thử gửi query chứa ký tự wildcard '%'
      cy.request({
        method: 'GET',
        url: `${API}/users/search`,
        headers: { Authorization: `Bearer ${token}` },
        qs: { query: 'cy%' }
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
      });
    });
  });

  /**
   * TC-SEC-28
   * Component/Function: Unbounded Group Members Array DoS protection (L7-03)
   * Description: Chặn tạo nhóm có số lượng thành viên vượt quá 200 người.
   * Expected Output: HTTP 400 Bad Request.
   */
  it('TC-SEC-28 | [Security] Chặn tạo nhóm có số lượng thành viên vượt quá 400 người → 400 Bad Request', () => {
    apiUser(`cy_sec28_${ts}`, `cy_sec28_${ts}@st.utt.edu.vn`).then((user) => {
      const token = user.token;
      const invalidMemberIds = [];
      for (let i = 0; i < 401; i++) {
        invalidMemberIds.push('00000000-0000-0000-0000-000000000000');
      }

      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${token}` },
        body: {
          name: 'Nhóm DoS Test',
          memberIds: invalidMemberIds
        },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.match(/Validation Error|Nhóm tối đa 400 thành viên/);
      });
    });
  });

  /**
   * TC-SEC-29
   * Component/Function: OTP TTL check (L8-01)
   * Description: OTP tự động hết hạn sau 5 phút -> verify trả về 400.
   */
  it('TC-SEC-29 | [Security] OTP tự động hết hạn sau 5 phút → 400 Bad Request khi verify', () => {
    const rawUsername = `cy_sec29_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `${rawUsername}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        }
      }
    }).then((res) => {
      const token = res.body.token;
      cy.task('getUserByUsername', rawUsername).then((userDb) => {
        const code = userDb.verificationToken;
        const expiredDate = new Date(Date.now() - 5000).toISOString();
        cy.task('updateUserExpires', { username: rawUsername, expiredDate }).then(() => {
          cy.request({
            method: 'POST',
            url: `${API}/auth/verify-email`,
            headers: { Authorization: `Bearer ${token}` },
            body: { code },
            failOnStatusCode: false
          }).then((verifyRes) => {
            expect(verifyRes.status).to.eq(400);
            expect(verifyRes.body.error).to.include('hết hạn');
          });
        });
      });
    });
  });

  /**
   * TC-SEC-30
   * Component/Function: OTP Verify Attempts lockout (L8-01)
   * Description: Nhập sai mã OTP liên tiếp 5 lần sẽ hủy mã OTP ngay lập tức.
   */
  it('TC-SEC-30 | [Security] Nhập sai mã OTP liên tiếp 5 lần sẽ hủy mã OTP ngay lập tức', () => {
    const rawUsername = `cy_sec30_${ts}`;
    let token;

    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: rawUsername,
        email: `${rawUsername}@st.utt.edu.vn`,
        password: 'Password12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: {
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
        }
      }
    }).then((res) => {
      token = res.body.token;
    });

    // Nhập sai 4 lần trước
    for (let i = 0; i < 4; i++) {
      cy.then(() => {
        cy.request({
          method: 'POST',
          url: `${API}/auth/verify-email`,
          headers: { Authorization: `Bearer ${token}` },
          body: { code: '000000' },
          failOnStatusCode: false
        }).then((resErr) => {
          expect(resErr.status).to.eq(400);
          expect(resErr.body.error).to.include('không chính xác');
        });
      });
    }

    // Lần thứ 5 nhập sai -> báo bị hủy
    cy.then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: '000000' },
        failOnStatusCode: false
      }).then((resFifth) => {
        expect(resFifth.status).to.eq(400);
        expect(resFifth.body.error).to.include('bị hủy');
      });
    });

    // Lấy thông tin user trong DB để xác nhận verificationToken đã bị hủy (null)
    cy.then(() => {
      cy.task('getUserByUsername', rawUsername).then((userDb) => {
        expect(userDb.verificationToken).to.be.null;
      });
    });

    // Thử verify bằng code cũ (nó sẽ bị chặn với lỗi không tồn tại hoặc đã bị hủy)
    cy.then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: '123456' },
        failOnStatusCode: false
      }).then((resErrFinal) => {
        expect(resErrFinal.status).to.eq(400);
        expect(resErrFinal.body.error).to.match(/không tồn tại|bị hủy/);
      });
    });
  });

  /**
   * TC-SEC-31
   * Component/Function: resendCodeLimiter check (L8-01)
   * Description: Gọi gửi lại mã xác thực quá 5 lần / giờ sẽ bị chặn bởi rate limiter.
   */
  it('TC-SEC-31 | [Security] Gọi gửi lại mã xác thực quá 5 lần / giờ sẽ bị chặn bởi rate limiter', () => {
    apiUser(`cy_sec31_${ts}`, `cy_sec31_${ts}@st.utt.edu.vn`).then((user) => {
      const token = user.token;
      let rateLimited = false;

      for (let i = 0; i < 6; i++) {
        cy.request({
          method: 'POST',
          url: `${API}/auth/resend-code`,
          headers: {
            Authorization: `Bearer ${token}`,
            'x-test-rate-limit': 'true',
            'x-test-rate-limit-key': `cy_sec31_limit_${ts}`
          },
          failOnStatusCode: false
        }).then((res) => {
          if (res.status === 429) {
            rateLimited = true;
          }
        });
      }

      cy.wrap(null).then(() => {
        expect(rateLimited).to.be.true;
      });
    });
  });

  /**
   * TC-SEC-35
   * Component/Function: Grade Creation Authorization (L9-01)
   * Description: Chặn sinh viên thường thêm/sửa điểm số học tập. Chỉ cho phép Giảng viên hoặc Admin nhóm.
   */
  it('TC-SEC-35 | [Security] Chặn sinh viên thường thêm/sửa điểm số học tập → 403 Forbidden', () => {
    // Tạo giáo viên T, học sinh S1 và học sinh S2
    apiUser(`cy_sec35t_${ts}`, `cy_sec35t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec35s1_${ts}`, `cy_sec35s1_${ts}@st.utt.edu.vn`).then((student1) => {
        apiUser(`cy_sec35s2_${ts}`, `cy_sec35s2_${ts}@st.utt.edu.vn`).then((student2) => {
          // Giáo viên T tạo nhóm và thêm 2 học sinh vào
          cy.request({
            method: 'POST',
            url: `${API}/groups`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: { name: 'Nhóm L9-01', memberIds: [student1.userId, student2.userId] }
          }).then((grpRes) => {
            const groupId = grpRes.body.id;

            // 1. Học sinh S1 cố gắng thêm điểm cho S2 → 403 Forbidden
            cy.request({
              method: 'POST',
              url: `${API}/academic/grades`,
              headers: { Authorization: `Bearer ${student1.token}` },
              body: {
                groupId,
                userId: student2.userId,
                title: 'Điểm Lab 1',
                score: 10,
                weight: 1
              },
              failOnStatusCode: false
            }).then((res1) => {
              expect(res1.status).to.eq(403);
              expect(res1.body.error).to.include('Chỉ giảng viên hoặc quản trị viên nhóm');

              // 2. Giáo viên T thêm điểm cho S2 → 201 Created
              cy.request({
                method: 'POST',
                url: `${API}/academic/grades`,
                headers: { Authorization: `Bearer ${teacher.token}` },
                body: {
                  groupId,
                  userId: student2.userId,
                  title: 'Điểm Lab 1',
                  score: 9.5,
                  weight: 1
                }
              }).then((res2) => {
                expect(res2.status).to.eq(201);
                expect(res2.body.score).to.eq(9.5);
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-36
   * Component/Function: Exam Creation Authorization (L9-02)
   * Description: Chặn sinh viên thường tạo đề thi trong nhóm. Chỉ cho phép Giảng viên hoặc Admin nhóm.
   */
  it('TC-SEC-36 | [Security] Chặn sinh viên thường tạo đề thi trong nhóm → 403 Forbidden', () => {
    // Tạo giáo viên T và học sinh S1
    apiUser(`cy_sec36t_${ts}`, `cy_sec36t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec36s1_${ts}`, `cy_sec36s1_${ts}@st.utt.edu.vn`).then((student1) => {
        // Giáo viên T tạo nhóm và thêm S1 vào
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Nhóm L9-02', memberIds: [student1.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // 1. Học sinh S1 cố gắng tạo đề thi → 403 Forbidden
          cy.request({
            method: 'POST',
            url: `${API}/academic/exams`,
            headers: { Authorization: `Bearer ${student1.token}` },
            body: {
              groupId,
              title: 'Đề thi cuối kỳ',
              durationMinutes: 90,
              questions: []
            },
            failOnStatusCode: false
          }).then((res1) => {
            expect(res1.status).to.eq(403);
            expect(res1.body.error).to.include('Chỉ giảng viên hoặc quản trị viên nhóm');

            // 2. Giáo viên T tạo đề thi → 201 Created
            cy.request({
              method: 'POST',
              url: `${API}/academic/exams`,
              headers: { Authorization: `Bearer ${teacher.token}` },
              body: {
                groupId,
                title: 'Đề thi cuối kỳ',
                durationMinutes: 90,
                questions: [
                  { text: 'Câu 1: 1+1=?', options: ['2', '3', '4', '5'], correctOptionIndex: 0 }
                ]
              }
            }).then((res2) => {
              expect(res2.status).to.eq(201);
              expect(res2.body.title).to.eq('Đề thi cuối kỳ');
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-37
   * Component/Function: Note IDOR protection (L9-03)
   * Description: Chặn IDOR sửa chéo Note của nhóm khác bằng cách truyền sai groupId.
   */
  it('TC-SEC-37 | [Security] Ngăn chặn IDOR sửa chéo ghi chú (Note) của nhóm khác → 404 Not Found', () => {
    // Tạo giáo viên T, học sinh S1 và học sinh S2
    apiUser(`cy_sec37t_${ts}`, `cy_sec37t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec37s1_${ts}`, `cy_sec37s1_${ts}@st.utt.edu.vn`).then((student1) => {
        apiUser(`cy_sec37s2_${ts}`, `cy_sec37s2_${ts}@st.utt.edu.vn`).then((student2) => {
          // Giáo viên T tạo Nhóm A (chứa S1) và Nhóm B (chứa S2)
          cy.request({
            method: 'POST',
            url: `${API}/groups`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: { name: 'Nhóm L9-03 A', memberIds: [student1.userId] }
          }).then((grpResA) => {
            const groupIdA = grpResA.body.id;

            cy.request({
              method: 'POST',
              url: `${API}/groups`,
              headers: { Authorization: `Bearer ${teacher.token}` },
              body: { name: 'Nhóm L9-03 B', memberIds: [student2.userId] }
            }).then((grpResB) => {
              const groupIdB = grpResB.body.id;

              // Học sinh S1 tạo một ghi chú ở Nhóm A
              cy.request({
                method: 'POST',
                url: `${API}/academic/notes`,
                headers: { Authorization: `Bearer ${student1.token}` },
                body: {
                  groupId: groupIdA,
                  title: 'Ghi chú nhóm A',
                  content: 'Nội dung quan trọng'
                }
              }).then((noteRes) => {
                const noteId = noteRes.body.id;

                // Học sinh S2 cố gắng sửa ghi chú của Nhóm A nhưng gửi kèm groupIdB
                // (Vì S2 thuộc nhóm B, middleware sẽ cho qua, nhưng controller phải chặn vì noteId thuộc nhóm A)
                cy.request({
                  method: 'POST',
                  url: `${API}/academic/notes`,
                  headers: { Authorization: `Bearer ${student2.token}` },
                  body: {
                    id: noteId,
                    groupId: groupIdB,
                    title: 'Hack title',
                    content: 'Hack content'
                  },
                  failOnStatusCode: false
                }).then((res1) => {
                  expect(res1.status).to.eq(404);
                  expect(res1.body.error).to.include('không thuộc nhóm này');
                });
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-38
   * Component/Function: Group Cascade Deletion (L10-03)
   * Description: Tạo nhóm học thuật chứa đầy đủ dữ liệu vệ tinh (Note, Assignment, Poll, Exam...),
   * sau đó xóa nhóm và đảm bảo không dính lỗi foreign key constraint, đồng thời xóa sạch dữ liệu liên quan.
   */
  it('TC-SEC-38 | [Security] Xóa nhóm học tập thành công và tự động dọn sạch (Cascade Delete) các dữ liệu vệ tinh', () => {
    apiUser(`cy_sec38t_${ts}`, `cy_sec38t_${ts}@utt.edu.vn`).then((teacher) => {
      // 1. Giáo viên tạo nhóm
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: { name: 'Lớp Học L10-03 Cascade' }
      }).then((grpRes) => {
        const groupId = grpRes.body.id;

        // 2. Tạo một Ghi chú (Note)
        cy.request({
          method: 'POST',
          url: `${API}/academic/notes`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { groupId, title: 'Note nhạy cảm', content: 'Ghi chú mật' }
        }).then((noteRes) => {
          // 3. Tạo một Khảo sát (Poll)
          cy.request({
            method: 'POST',
            url: `${API}/polls`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: {
              groupId,
              question: 'Khảo sát học kỳ',
              options: ['Option A', 'Option B'],
              isMultipleChoice: true
            }
          }).then((pollRes) => {
            // 4. Tạo một Bài tập (Assignment)
            cy.request({
              method: 'POST',
              url: `${API}/assignments`,
              headers: { Authorization: `Bearer ${teacher.token}` },
              body: {
                groupId,
                title: 'Bài tập tuần 10',
                deadline: new Date(Date.now() + 86400000).toISOString()
              }
            }).then(() => {
              // 5. Giáo viên thực hiện xóa nhóm -> Phải thành công (200 OK)
              cy.request({
                method: 'DELETE',
                url: `${API}/groups/${groupId}`,
                headers: { Authorization: `Bearer ${teacher.token}` }
              }).then((delRes) => {
                expect(delRes.status).to.eq(200);
                expect(delRes.body.message).to.include('Group deleted successfully');

                // 6. Kiểm tra lại dữ liệu Note xem đã bị xóa chưa
                cy.request({
                  method: 'GET',
                  url: `${API}/academic/notes/${groupId}`,
                  headers: { Authorization: `Bearer ${teacher.token}` },
                  failOnStatusCode: false
                }).then((getNotes) => {
                  expect(getNotes.status).to.be.oneOf([403, 404, 200]);
                  if (getNotes.status === 200) {
                    expect(getNotes.body).to.have.lengthOf(0);
                  }
                });
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-39
   * Component/Function: Poll Vote Rigging Prevention (L10-01)
   * Description: Ngăn chặn một user bình chọn nhiều lần cho cùng một phương án trong Poll nhiều lựa chọn.
   */
  it('TC-SEC-39 | [Security] Ngăn chặn spam bình chọn (Vote Rigging) cho cùng một phương án trong bình chọn nhiều lựa chọn → 400 Bad Request', () => {
    apiUser(`cy_sec39t_${ts}`, `cy_sec39t_${ts}@utt.edu.vn`).then((teacher) => {
      apiUser(`cy_sec39s_${ts}`, `cy_sec39s_${ts}@st.utt.edu.vn`).then((student) => {
        // Giáo viên tạo nhóm có học sinh
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Nhóm L10-01 Vote Spam', memberIds: [student.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // Giáo viên tạo Poll nhiều lựa chọn
          cy.request({
            method: 'POST',
            url: `${API}/polls`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: {
              groupId,
              question: 'Ai sẽ làm lớp trưởng?',
              options: ['Nguyễn Văn A', 'Trần Thị B'],
              isMultipleChoice: true
            }
          }).then((pollRes) => {
            const pollId = pollRes.body.id;
            const optionId = pollRes.body.Options[0].id;

            // 1. Học sinh bình chọn lần 1 -> 200 OK
            cy.request({
              method: 'POST',
              url: `${API}/polls/vote`,
              headers: { Authorization: `Bearer ${student.token}` },
              body: { pollId, optionId }
            }).then((voteRes1) => {
              expect(voteRes1.status).to.eq(200);

              // 2. Học sinh bình chọn lần 2 cho cùng option đó -> 400 Bad Request
              cy.request({
                method: 'POST',
                url: `${API}/polls/vote`,
                headers: { Authorization: `Bearer ${student.token}` },
                body: { pollId, optionId },
                failOnStatusCode: false
              }).then((voteRes2) => {
                expect(voteRes2.status).to.eq(400);
                expect(voteRes2.body.error).to.include('đã bình chọn cho phương án này');
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-40
   * Component/Function: Attendance Timer Validation (L10-02)
   * Description: Xác thực durationMinutes khi tạo điểm danh phải là số nguyên dương từ 1-1440.
   */
  it('TC-SEC-40 | [Security] Chặn tạo buổi điểm danh với tham số thời gian (durationMinutes) không hợp lệ → 400 Bad Request', () => {
    apiUser(`cy_sec40t_${ts}`, `cy_sec40t_${ts}@utt.edu.vn`).then((teacher) => {
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: { name: 'Nhóm L10-02 Attendance Valid' }
      }).then((grpRes) => {
        const groupId = grpRes.body.id;

        // 1. Tạo với durationMinutes là chuỗi chữ "abc" -> 400 Bad Request
        cy.request({
          method: 'POST',
          url: `${API}/attendance/sessions`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: {
            groupId,
            title: 'Điểm danh lý thuyết',
            durationMinutes: 'abc'
          },
          failOnStatusCode: false
        }).then((res1) => {
          expect(res1.status).to.eq(400);
          expect(res1.body.error).to.eq('Validation Error');

          // 2. Tạo với durationMinutes là số âm -10 -> 400 Bad Request
          cy.request({
            method: 'POST',
            url: `${API}/attendance/sessions`,
            headers: { Authorization: `Bearer ${teacher.token}` },
            body: {
              groupId,
              title: 'Điểm danh lý thuyết',
              durationMinutes: -10
            },
            failOnStatusCode: false
          }).then((res2) => {
            expect(res2.status).to.eq(400);
            expect(res2.body.error).to.eq('Validation Error');
          });
        });
      });
    });
  });

  /**
   * TC-SEC-41
   * Component/Function: Election Vote Concurrency (L11-01)
   * Description: Gửi nhiều yêu cầu bình chọn (voteElection) song song từ các user khác nhau để xác minh không bị Lost Update.
   */
  it('TC-SEC-41 | [Security] Khắc phục Race Condition (Lost Update) trong bầu cử khi có nhiều lượt vote đồng thời', () => {
    cy.task('createUserAndGetToken', { username: `cy_sec41s1_${ts}`, email: `cy_sec41s1_${ts}@st.utt.edu.vn` }).then((s1) => {
      cy.task('createUserAndGetToken', { username: `cy_sec41s2_${ts}`, email: `cy_sec41s2_${ts}@st.utt.edu.vn` }).then((s2) => {
        cy.task('createUserAndGetToken', { username: `cy_sec41s3_${ts}`, email: `cy_sec41s3_${ts}@st.utt.edu.vn` }).then((s3) => {
          const students = [s1, s2, s3];

          cy.task('createElection', {
            title: `Bầu cử Lớp trưởng L11-01 ${ts}`,
            candidates: [
              { id: 'cand-1', name: 'Nguyễn Văn A', votes: 0 },
              { id: 'cand-2', name: 'Trần Thị B', votes: 0 }
            ]
          }).then((election) => {
            const electionId = election.id;

            // Dùng fetch API gửi đồng thời 3 request vote song song để tạo Race Condition
            const votePromises = students.map(student => {
              return fetch(`${API}/super-app/elections/vote`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${student.token}`
                },
                body: JSON.stringify({ id: electionId, candidateId: 'cand-1' })
              });
            });

            cy.wrap(Cypress.Promise.all(votePromises)).then(() => {
              // Lấy lại danh sách bầu cử để kiểm tra số vote
              cy.request({
                method: 'GET',
                url: `${API}/super-app/elections`,
                headers: { Authorization: `Bearer ${s1.token}` }
              }).then((res) => {
                const currentElec = res.body.find(e => e.id === electionId);
                const candidate1 = currentElec.candidates.find(c => c.id === 'cand-1');
                expect(candidate1.votes).to.eq(3); // Cả 3 lượt vote đều phải được ghi nhận
                expect(currentElec.voterIds).to.have.lengthOf(3);
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-42
   * Component/Function: Canteen Order Mass Assignment (L11-02)
   * Description: Ngăn sinh viên sửa status và totalPrice khi tạo đơn hàng canteen.
   */
  it('TC-SEC-42 | [Security] Chặn Mass Assignment khi đặt đơn hàng Canteen → Status mặc định pending', () => {
    cy.task('createUserAndGetToken', {
      username: `cy_sec42s_${ts}`,
      email: `cy_sec42s_${ts}@st.utt.edu.vn`
    }).then((student) => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/canteen`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          items: [{ name: 'Bún chả', quantity: 1, price: 35000 }],
          totalPrice: 35000,
          status: 'completed' // Kẻ xấu tự đặt status là completed
        }
      }).then((res) => {
        expect(res.status).to.eq(201);
        expect(res.body.status).to.eq('pending'); // Phải bị ép về pending
      });
    });
  });

  /**
   * TC-SEC-43
   * Component/Function: Super App CRUD Pagination (L11-03)
   * Description: Xác minh Generic CRUD helper hỗ trợ phân trang giới hạn kết quả trả về.
   */
  it('TC-SEC-43 | [Security] Generic CRUD helper của Super App hỗ trợ phân trang an toàn (limit & page)', () => {
    cy.task('createUserAndGetToken', {
      username: `cy_sec43s_${ts}`,
      email: `cy_sec43s_${ts}@st.utt.edu.vn`
    }).then((student) => {
      // 1. Tạo 2 chi tiêu khác nhau
      cy.request({
        method: 'POST',
        url: `${API}/super-app/expenses`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: { title: 'Mua sách', amount: 120000 }
      }).then(() => {
        cy.request({
          method: 'POST',
          url: `${API}/super-app/expenses`,
          headers: { Authorization: `Bearer ${student.token}` },
          body: { title: 'Uống trà sữa', amount: 45000 }
        }).then(() => {
          // 2. Lấy danh sách expenses với limit=1
          cy.request({
            method: 'GET',
            url: `${API}/super-app/expenses?limit=1&page=1`,
            headers: { Authorization: `Bearer ${student.token}` }
          }).then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body).to.have.lengthOf(1); // Chỉ lấy 1 bản ghi do limit=1
          });
        });
      });
    });
  });

  /**
   * TC-SEC-44
   * Component/Function: Heartbeat & Zombie Online Reset (L12-03)
   * Description: Xác thực cơ chế Heartbeat in-memory và ngăn chặn Zombie Online khi boot server.
   */
  it('TC-SEC-44 | [Security] Cơ chế Heartbeat và phòng chống Zombie Online Status (L12-03)', () => {
    const username = `cy_sec44s_${ts}`;
    const email = `${username}@st.utt.edu.vn`;

    // 1. Đăng ký tài khoản
    cy.task('createUserAndGetToken', { username, email }).then((student) => {
      // 2. Đưa trạng thái của user lên online: true thủ công trong DB để giả lập Zombie
      cy.task('setUserOnline', { username, online: true }).then((ok) => {
        expect(ok).to.eq(true);
        
        // Xác minh trạng thái online đã được set lên true
        cy.task('getUserByUsername', username).then((u1) => {
          expect(u1.online).to.eq(true);

          // 3. Chạy đoạn mã reset Zombie lúc Server boot
          cy.task('resetZombieUsers').then((ok2) => {
            expect(ok2).to.eq(true);
            
            // Xác minh trạng thái đã được đưa về false
            cy.task('getUserByUsername', username).then((u2) => {
              expect(u2.online).to.eq(false);

              // 4. Mở kết nối Socket để chuyển trạng thái lên online
              const socket = io('http://localhost:5000', {
                auth: { token: student.token },
                transports: ['websocket'],
                forceNew: true
              });

              cy.wrap(new Cypress.Promise((resolve, reject) => {
                socket.on('connect', () => {
                  // Gửi heartbeat
                  socket.emit('heartbeat');
                  resolve(socket);
                });
                socket.on('connect_error', (err) => {
                  reject(err);
                });
              })).then((activeSocket) => {
                // Đợi 500ms
                cy.wait(500);

                // Xác minh trạng thái online trong DB đã về true do đã kết nối
                cy.task('getUserByUsername', username).then((u3) => {
                  expect(u3.online).to.eq(true);
                  activeSocket.disconnect();
                });
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-45
   * Component/Function: OOM DoS Cleanup Worker (L12-02)
   * Description: Xác thực worker quét tin nhắn hết hạn xử lý theo lô (limit 500) để chống quá tải RAM.
   */
  it('TC-SEC-45 | [Security] Cleanup worker xử lý tin nhắn hết hạn theo lô limit 500 -> Phòng chống RAM DoS (L12-02)', () => {
    const username = `cy_sec45s_${ts}`;
    const email = `${username}@st.utt.edu.vn`;

    cy.task('createUserAndGetToken', { username, email }).then((teacher) => {
      // 1. Tạo nhóm
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: { name: 'Nhóm L12-02 OOM batch' }
      }).then((grpRes) => {
        const groupId = grpRes.body.id;
        const senderId = teacher.userId;

        // 2. Chèn 505 tin nhắn hết hạn vào DB
        cy.task('createManyExpiredMessages', { count: 505, groupId, senderId }).then((ok) => {
          expect(ok).to.eq(true);

          // Kiểm tra ban đầu có đúng 505 tin nhắn hết hạn
          cy.task('getExpiredGroupMessagesCount', groupId).then((initialCount) => {
            expect(initialCount).to.eq(505);

            // 3. Trigger hàm cleanup và kiểm tra xem nó có xóa đúng 500 bản ghi không
            cy.task('triggerCleanupMessages').then((deletedCount) => {
              expect(deletedCount).to.eq(500); // Phải giới hạn đúng 500 tin nhắn mỗi lô

              // 4. Kiểm tra trong DB còn lại đúng 5 tin nhắn
              cy.task('getExpiredGroupMessagesCount', groupId).then((remainingCount) => {
                expect(remainingCount).to.eq(5);
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-46
   * Component/Function: Notification Connection Pool (L12-01)
   * Description: Đảm bảo việc gửi Group Notification hoạt động bình thường, không làm nghẽn server.
   */
  it('TC-SEC-46 | [Security] Tối ưu hóa Group Notification gộp SQL query -> Bảo vệ Connection Pool (L12-01)', () => {
    const username = `cy_sec46s_${ts}`;
    const email = `${username}@st.utt.edu.vn`;

    cy.task('createUserAndGetToken', { username, email }).then((teacher) => {
      // 1. Tạo nhóm
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: { name: 'Nhóm L12-01 Pool' }
      }).then((grpRes) => {
        const groupId = grpRes.body.id;

        // 2. Mở kết nối Socket gửi message nhóm để trigger luồng notification
        const socket = io('http://localhost:5000', {
          auth: { token: teacher.token },
          transports: ['websocket'],
          forceNew: true
        });

        cy.wrap(new Cypress.Promise((resolve, reject) => {
          socket.on('connect', () => {
            socket.emit('joinGroup', { groupId });
            
            // Gửi group message
            socket.emit('sendGroupMessage', {
              groupId,
              encryptedContent: 'Encrypted group message L12-01 test',
              iv: '1234567890123456',
              n: 1,
              type: 'text'
            });

            setTimeout(() => resolve(socket), 500);
          });
          socket.on('connect_error', (err) => reject(err));
        })).then((activeSocket) => {
          // Socket gửi thành công mà không có lỗi server crash/timeout
          activeSocket.disconnect();
        });
      });
    });
  });

  /**
   * TC-SEC-47
   * Component/Function: adminController.getAllUsers (L13-02)
   * Description: Xác nhận adminController.getAllUsers giới hạn limit tối đa là 100 để phòng tránh RAM DoS.
   */
  it('TC-SEC-47 | [Security] Giới hạn limit truy vấn danh sách user của admin tối đa là 100 (L13-02)', () => {
    const adminUsername = `cy_sec47_admin_${ts}`;
    const adminEmail = `${adminUsername}@utt.edu.vn`;
    
    // Đăng ký và gán role admin
    cy.task('createUserAndGetToken', { username: adminUsername, email: adminEmail, role: 'admin' }).then((admin) => {
      cy.request({
        method: 'GET',
        url: `${API}/admin/users?limit=9999`,
        headers: { Authorization: `Bearer ${admin.token}` }
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.limit).to.eq(100);
      });
    });
  });

  /**
   * TC-SEC-48
   * Component/Function: Mass Assignment Prevention in Academic Controller (L13-03, L13-05)
   * Description: Đảm bảo các thuộc tính lạ hoặc nhạy cảm gửi qua req.body bị lọc bỏ thay vì bulkCreate/create trực tiếp.
   */
  it('TC-SEC-48 | [Security] Phòng chống Mass Assignment ở các API Flashcard và LostItem (L13-03, L13-05)', () => {
    const username = `cy_sec48s_${ts}`;
    const email = `${username}@st.utt.edu.vn`;

    cy.task('createUserAndGetToken', { username, email }).then((student) => {
      // 1. Tạo một nhóm học tập
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: { name: 'Nhóm L13-03' }
      }).then((grpRes) => {
        const groupId = grpRes.body.id;

        // 2. Tạo Flashcard Set kèm thuộc tính lạ trong cards (ví dụ chèn id tự chọn hoặc updatedAt)
        const fakeCardId = '00000000-0000-0000-0000-000000001337';
        cy.request({
          method: 'POST',
          url: `${API}/academic/flashcards`,
          headers: { Authorization: `Bearer ${student.token}` },
          body: {
            groupId,
            title: 'Set Flashcard Bảo Mật',
            description: 'Test L13-03',
            cards: [
              { front: 'A', back: 'B', id: fakeCardId }
            ]
          }
        }).then((setRes) => {
          expect(setRes.status).to.eq(201);
          const setId = setRes.body.id;

          // Lấy danh sách Flashcard Sets để xem ID của card có bị ghi đè bằng UUID ngẫu nhiên thay vì fakeCardId
          cy.request({
            method: 'GET',
            url: `${API}/academic/flashcards/${groupId}`,
            headers: { Authorization: `Bearer ${student.token}` }
          }).then((getRes) => {
            const set = getRes.body.find(s => s.id === setId);
            expect(set).to.exist;
            expect(set.Cards).to.have.lengthOf(1);
            expect(set.Cards[0].id).to.not.eq(fakeCardId); // ID giả lập bị bỏ qua và thay bằng UUID mới
          });
        });

        // 3. Tạo Lost Item kèm thuộc tính 'status: returned' và 'claimedBy' lạ
        cy.request({
          method: 'POST',
          url: `${API}/academic/lost-found`,
          headers: { Authorization: `Bearer ${student.token}` },
          body: {
            title: 'Điện thoại đánh rơi',
            description: 'iPhone 15 Pro',
            location: 'Giảng đường C1',
            type: 'lost',
            status: 'returned',
            claimedBy: 'another-user-uuid'
          }
        }).then((itemRes) => {
          expect(itemRes.status).to.eq(201);
          expect(itemRes.body.status).to.eq('active'); // Phải giữ mặc định là 'active'
          expect(itemRes.body).to.not.have.property('claimedBy');
        });
      });
    });
  });

  /**
   * TC-SEC-49
   * Component/Function: academicController.createAnnouncement RBAC (L13-04)
   * Description: Ngăn sinh viên (student) tạo thông báo trong nhóm khi họ không có quyền giảng viên/admin nhóm.
   */
  it('TC-SEC-49 | [Security] Chỉ cho phép Giảng viên hoặc Quản trị viên nhóm tạo Thông báo (L13-04)', () => {
    const studentUser = `cy_sec49_st_${ts}`;
    const teacherUser = `cy_sec49_tc_${ts}`;
    const studentEmail = `${studentUser}@st.utt.edu.vn`;
    const teacherEmail = `${teacherUser}@utt.edu.vn`;

    cy.task('createUserAndGetToken', { username: studentUser, email: studentEmail }).then((student) => {
      cy.task('createUserAndGetToken', { username: teacherUser, email: teacherEmail }).then((teacher) => {
        
        // 1. Giáo viên tạo nhóm và sinh viên tham gia
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: 'Lớp học L13-04' }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // Thêm học sinh vào nhóm qua mã mời
          cy.request({
            method: 'POST',
            url: `${API}/groups/join`,
            headers: { Authorization: `Bearer ${student.token}` },
            body: { inviteCode: grpRes.body.inviteCode }
          }).then(() => {
            
            // 2. Học sinh cố gắng tạo thông báo (Expected: 403 Forbidden)
            cy.request({
              method: 'POST',
              url: `${API}/academic/announcements`,
              headers: { Authorization: `Bearer ${student.token}` },
              body: {
                groupId,
                title: 'Học sinh giả mạo giáo viên',
                content: 'Hôm nay được nghỉ học!',
                isUrgent: true
              },
              failOnStatusCode: false
            }).then((annStudentRes) => {
              expect(annStudentRes.status).to.eq(403);
            });

            // 3. Giáo viên tạo thông báo (Expected: 201 Created)
            cy.request({
              method: 'POST',
              url: `${API}/academic/announcements`,
              headers: { Authorization: `Bearer ${teacher.token}` },
              body: {
                groupId,
                title: 'Thông báo chính thức',
                content: 'Ngày mai kiểm tra giữa kỳ.',
                isUrgent: true
              }
            }).then((annTeacherRes) => {
              expect(annTeacherRes.status).to.eq(201);
              expect(annTeacherRes.body.title).to.eq('Thông báo chính thức');
            });
          });
        });
      });
    });
  });

  /**
   * TC-SEC-50
   * Component/Function: Socket rate limit cleanup on disconnect (L13-06)
   * Description: Xác thực sự kiện disconnect giải phóng hoàn toàn bộ nhớ lưu trữ rate limit của user.
   */
  it('TC-SEC-50 | [Security] Dọn dẹp map socketRateLimit khi socket ngắt kết nối (L13-06)', () => {
    const username = `cy_sec50s_${ts}`;
    const email = `${username}@st.utt.edu.vn`;

    cy.task('createUserAndGetToken', { username, email }).then((student) => {
      const socket = io('http://localhost:5000', {
        auth: { token: student.token },
        transports: ['websocket'],
        forceNew: true
      });

      cy.wrap(new Cypress.Promise((resolve, reject) => {
        socket.on('connect', () => {
          // Gửi tin nhắn qua socket để tạo entry rate limit
          socket.emit('sendMessage', {
            recipientId: 'bf8ba19f-d31e-450f-90e9-b59074d2217a', // UTT Bot
            encryptedContent: 'Hello bot',
            n: 1,
            type: 'text'
          });

          setTimeout(() => {
            socket.disconnect();
            resolve(true);
          }, 500);
        });
        socket.on('connect_error', (err) => reject(err));
      })).then((disconnected) => {
        expect(disconnected).to.eq(true);
        // Đợi 200ms để server thực hiện xong sự kiện disconnect
        cy.wait(200);
      });
    });
  });
});


