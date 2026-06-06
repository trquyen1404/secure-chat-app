/**
 * MODULE: Direct Messaging (1-1 Messages)
 * Controller: messageController.js
 * Routes:
 *   GET   /api/messages/pending
 *   POST  /api/messages/ack
 *   GET   /api/messages/:userId
 *   GET   /api/messages/:userId/pinned
 *   POST  /api/messages/:messageId/pin
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * - getMessages:        !isBlocked → check blockers → get messages with cursor & limit
 * - getPendingMessages: recipientId=currentUserId, deliveredAt=null
 * - acknowledgeMessages: updates deliveredAt for given messageIds
 * - togglePinMessage:   checks sender/recipient, toggles isPinned
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiRegisterAndLogin = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

const createMessage = (args) =>
  cy.task('create1to1Message', args);

describe('[Module: Direct Messaging] Nhắn tin 1-1', () => {
  const ts = Date.now();
  let userA, userB, userC;
  let tokenA, tokenB, tokenC;

  before(() => {
    // Setup users B & C beforehand
    const nameB = `cy_msg_b_${ts}`;
    const nameC = `cy_msg_c_${ts}`;
    
    apiRegisterAndLogin(nameB, `${nameB}@st.utt.edu.vn`).then((resB) => {
      userB = resB;
      tokenB = resB.token;
    });

    apiRegisterAndLogin(nameC, `${nameC}@st.utt.edu.vn`).then((resC) => {
      userC = resC;
      tokenC = resC.token;
    });
  });

  beforeEach(() => {
    const nameA = `cy_msg_a_${ts}_${Math.random().toString(36).substring(7)}`;
    apiRegisterAndLogin(nameA, `${nameA}@st.utt.edu.vn`).then((resA) => {
      userA = resA;
      tokenA = resA.token;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-MSG-01
   * Component/Function: getMessages
   * Description: Lấy lịch sử tin nhắn 1-1 thành công giữa hai người bạn.
   * Expected Output: HTTP 200 + Array danh sách tin nhắn.
   */
  it('TC-MSG-01 | [Positive] Lấy lịch sử tin nhắn 1-1 thành công', () => {
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Hello B, from A'
    }).then((msg) => {
      expect(msg).to.not.be.null;
      cy.request({
        method: 'GET',
        url: `${API}/messages/${userB.userId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
        const found = res.body.find((m) => m.id === msg.id);
        expect(found).to.not.be.undefined;
        expect(found.encryptedContent).to.eq('Hello B, from A');
      });
    });
  });

  /**
   * TC-MSG-02
   * Component/Function: getPendingMessages
   * Description: Lấy danh sách tin nhắn chưa nhận (deliveredAt = null) thành công.
   * Expected Output: HTTP 200 + Array các tin nhắn chưa nhận.
   */
  it('TC-MSG-02 | [Positive] Lấy danh sách tin nhắn chưa nhận (pending) thành công', () => {
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Pending msg to B',
      deliveredAt: null
    }).then((msg) => {
      cy.request({
        method: 'GET',
        url: `${API}/messages/pending`,
        headers: { Authorization: `Bearer ${tokenB}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
        const found = res.body.find((m) => m.id === msg.id);
        expect(found).to.not.be.undefined;
      });
    });
  });

  /**
   * TC-MSG-03
   * Component/Function: acknowledgeMessages
   * Description: Xác nhận đã nhận tin nhắn (update deliveredAt) thành công.
   * Expected Output: HTTP 200 + { success: true }
   */
  it('TC-MSG-03 | [Positive] Xác nhận đã nhận tin nhắn thành công', () => {
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Ack target msg',
      deliveredAt: null
    }).then((msg) => {
      cy.request({
        method: 'POST',
        url: `${API}/messages/ack`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { messageIds: [msg.id] }
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.success).to.be.true;

        // Kiểm tra xem tin nhắn đã được update trong pending chưa
        cy.request({
          method: 'GET',
          url: `${API}/messages/pending`,
          headers: { Authorization: `Bearer ${tokenB}` },
        }).then((pendingRes) => {
          const found = pendingRes.body.find((m) => m.id === msg.id);
          expect(found).to.be.undefined;
        });
      });
    });
  });

  /**
   * TC-MSG-04
   * Component/Function: togglePinMessage & getPinnedMessages
   * Description: Ghim tin nhắn và lấy danh sách tin nhắn đã ghim thành công.
   * Expected Output: HTTP 200 + toggle state, HTTP 200 + pinned list
   */
  it('TC-MSG-04 | [Positive] Ghim tin nhắn và lấy danh sách tin nhắn đã ghim thành công', () => {
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Pin target msg'
    }).then((msg) => {
      // Toggle ghim tin nhắn
      cy.request({
        method: 'POST',
        url: `${API}/messages/${msg.id}/pin`,
        headers: { Authorization: `Bearer ${tokenA}` },
      }).then((pinRes) => {
        expect(pinRes.status).to.eq(200);
        expect(pinRes.body.isPinned).to.be.true;

        // Lấy danh sách tin nhắn đã ghim
        cy.request({
          method: 'GET',
          url: `${API}/messages/${userB.userId}/pinned`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((listRes) => {
          expect(listRes.status).to.eq(200);
          expect(listRes.body).to.be.an('array');
          const found = listRes.body.find((m) => m.id === msg.id);
          expect(found).to.not.be.undefined;
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-MSG-05
   * Component/Function: acknowledgeMessages
   * Description: Gửi body ack rỗng hoặc định dạng sai → 400 Bad Request.
   * Expected Output: HTTP 400 + { error: "Invalid messageIds" }
   */
  it('TC-MSG-05 | [Negative] Xác nhận tin nhắn với body rỗng hoặc sai định dạng → 400', () => {
    cy.request({
      method: 'POST',
      url: `${API}/messages/ack`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { messageIds: [] },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.include('messageIds');
    });

    cy.request({
      method: 'POST',
      url: `${API}/messages/ack`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { messageIds: "not-an-array" },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.include('messageIds');
    });
  });

  /**
   * TC-MSG-06
   * Component/Function: togglePinMessage
   * Description: Ghim tin nhắn không tồn tại → 404 Not Found.
   * Expected Output: HTTP 404 + { error: "Message not found" }
   */
  it('TC-MSG-06 | [Negative] Ghim tin nhắn không tồn tại → 404 Not Found', () => {
    cy.request({
      method: 'POST',
      url: `${API}/messages/00000000-0000-0000-0000-000000000000/pin`,
      headers: { Authorization: `Bearer ${tokenA}` },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(404);
      expect(res.body.error).to.include('not found');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-MSG-07
   * Component/Function: getMessages
   * Description: Gửi cursor phân trang không hợp lệ.
   * Expected Output: HTTP 500
   */
  it('TC-MSG-07 | [Boundary] Lấy tin nhắn với cursor phân trang không hợp lệ → 500', () => {
    cy.request({
      method: 'GET',
      url: `${API}/messages/${userB.userId}?cursor=invalid-date`,
      headers: { Authorization: `Bearer ${tokenA}` },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-MSG-08
   * Component/Function: getMessages & togglePinMessage (unauthorized access)
   * Description: Đọc hoặc ghim tin nhắn của cặp người dùng khác (không phải của mình) → 403 / 404.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-MSG-08 | [Security] Đọc hoặc ghim tin nhắn của người khác → 403 Forbidden', () => {
    // Tạo tin nhắn giữa A và B
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Secret between A and B'
    }).then((msg) => {
      // User C cố gắng ghim tin nhắn này
      cy.request({
        method: 'POST',
        url: `${API}/messages/${msg.id}/pin`,
        headers: { Authorization: `Bearer ${tokenC}` },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(403);
      });
    });
  });

  /**
   * TC-MSG-09
   * Component/Function: getMessages (blocked user check)
   * Description: Không thể lấy tin nhắn nếu một trong hai bên đã chặn người kia → 403 Forbidden.
   * Expected Output: HTTP 403 Forbidden
   */
  it('TC-MSG-09 | [Security] Không thể lấy lịch sử tin nhắn khi đang bị chặn → 403 Forbidden', () => {
    // A chặn B
    cy.request({
      method: 'POST',
      url: `${API}/users/block`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { userId: userB.userId }
    }).then(() => {
      // A cố gắng lấy tin nhắn với B
      cy.request({
        method: 'GET',
        url: `${API}/messages/${userB.userId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body.error).to.include('Truy cập bị từ chối');
      });

      // B cố gắng lấy tin nhắn với A
      cy.request({
        method: 'GET',
        url: `${API}/messages/${userA.userId}`,
        headers: { Authorization: `Bearer ${tokenB}` },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body.error).to.include('Truy cập bị từ chối');
      });
    });
  });

  /**
   * TC-MSG-10
   * Component/Function: getMessages / create1to1Message
   * Description: Nhắn tin qua lại liên tiếp giữa hai người dùng (A gửi cho B, B trả lời A) và lấy lịch sử tin nhắn đúng thứ tự thời gian.
   * Expected Output: HTTP 200 + danh sách tin nhắn theo đúng thứ tự.
   */
  it('TC-MSG-10 | [Positive] Nhắn tin qua lại liên tục giữa hai người và lấy lịch sử đúng thứ tự', () => {
    // A gửi tin nhắn cho B
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Hello B, how are you?'
    }).then((msg1) => {
      expect(msg1).to.not.be.null;

      // Chờ một chút để tạo độ trễ thời gian nhỏ
      cy.wait(100);

      // B trả lời A
      createMessage({
        senderId: userB.userId,
        recipientId: userA.userId,
        encryptedContent: 'Hi A, I am good! Thanks for asking.'
      }).then((msg2) => {
        expect(msg2).to.not.be.null;

        // A lấy lịch sử tin nhắn với B
        cy.request({
          method: 'GET',
          url: `${API}/messages/${userB.userId}`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body).to.be.an('array');
          
          // Lọc ra các tin nhắn test vừa tạo
          const testMsgs = res.body.filter(m => m.id === msg1.id || m.id === msg2.id);
          expect(testMsgs.length).to.eq(2);
          
          // Verify thứ tự: tin nhắn 1 từ A phải đứng trước tin nhắn 2 từ B
          expect(testMsgs[0].id).to.eq(msg1.id);
          expect(testMsgs[1].id).to.eq(msg2.id);
          expect(testMsgs[0].encryptedContent).to.eq('Hello B, how are you?');
          expect(testMsgs[1].encryptedContent).to.eq('Hi A, I am good! Thanks for asking.');
        });
      });
    });
  });

  /**
   * TC-MSG-11
   * Component/Function: create1to1Message
   * Description: Gửi và nhận tin nhắn chứa các ký tự Unicode tiếng Việt đặc biệt và emoji qua lại giữa hai người.
   * Expected Output: HTTP 200 + hiển thị đúng các ký tự đặc biệt.
   */
  it('TC-MSG-11 | [Boundary] Gửi và nhận tin nhắn chứa Unicode tiếng Việt đặc biệt và emoji', () => {
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: 'Xin chào B! 👋 Chúc một ngày tốt lành 🌟'
    }).then((msg1) => {
      expect(msg1).to.not.be.null;

      cy.wait(100);

      createMessage({
        senderId: userB.userId,
        recipientId: userA.userId,
        encryptedContent: 'Cảm ơn A nhé! 🍀 Hẹn gặp lại tối nay nha! ☕'
      }).then((msg2) => {
        expect(msg2).to.not.be.null;

        cy.request({
          method: 'GET',
          url: `${API}/messages/${userB.userId}`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          const m1 = res.body.find(m => m.id === msg1.id);
          const m2 = res.body.find(m => m.id === msg2.id);
          
          expect(m1).to.not.be.undefined;
          expect(m2).to.not.be.undefined;
          expect(m1.encryptedContent).to.eq('Xin chào B! 👋 Chúc một ngày tốt lành 🌟');
          expect(m2.encryptedContent).to.eq('Cảm ơn A nhé! 🍀 Hẹn gặp lại tối nay nha! ☕');
        });
      });
    });
  });

  /**
   * TC-MSG-12
   * Component/Function: getMessages
   * Description: Nhắn tin liên tục với tốc độ cao (Spam) giữa hai người để kiểm tra tính toàn vẹn thứ tự thời gian.
   * Expected Output: HTTP 200 + toàn bộ tin nhắn được trả về theo đúng thứ tự thời gian gửi.
   */
  it('TC-MSG-12 | [Boundary] Gửi liên tiếp tin nhắn tốc độ cao và kiểm tra thứ tự', () => {
    const contents = ['Spam 1', 'Spam 2', 'Spam 3', 'Spam 4', 'Spam 5'];
    let chain = cy.wrap(null);
    const createdIds = [];
    
    contents.forEach((text) => {
      chain = chain.then(() => {
        return createMessage({
          senderId: userA.userId,
          recipientId: userB.userId,
          encryptedContent: text
        }).then((msg) => {
          createdIds.push(msg.id);
          return cy.wait(50); // Đợi rất ngắn để đảm bảo timestamp khác biệt nhẹ
        });
      });
    });

    chain.then(() => {
      cy.request({
        method: 'GET',
        url: `${API}/messages/${userB.userId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        
        // Lọc các tin nhắn của test này
        const testMsgs = res.body.filter(m => createdIds.includes(m.id));
        expect(testMsgs.length).to.eq(5);
        
        // Kiểm tra thứ tự đúng
        for (let i = 0; i < 5; i++) {
          expect(testMsgs[i].id).to.eq(createdIds[i]);
          expect(testMsgs[i].encryptedContent).to.eq(contents[i]);
        }
      });
    });
  });

  /**
   * TC-MSG-14
   * Component/Function: create1to1Message
   * Description: Gửi tin nhắn chứa payload XSS độc hại và kiểm tra xem hệ thống có xử lý an toàn dưới dạng văn bản thuần túy.
   * Expected Output: HTTP 200/201 + Lưu và lấy ra thành công dưới dạng text thuần túy.
   */
  it('TC-MSG-14 | [Security] Gửi tin nhắn chứa mã độc XSS và kiểm tra xử lý an toàn', () => {
    const xssPayload = "<script>alert(1)</script><iframe src=javascript:alert(2)></iframe>";
    createMessage({
      senderId: userA.userId,
      recipientId: userB.userId,
      encryptedContent: xssPayload
    }).then((msg) => {
      expect(msg).to.not.be.null;

      // Lấy lịch sử tin nhắn và verify nội dung trả về là nguyên bản text (không bị thực thi hay phá vỡ cấu trúc)
      cy.request({
        method: 'GET',
        url: `${API}/messages/${userB.userId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        const found = res.body.find(m => m.id === msg.id);
        expect(found).to.not.be.undefined;
        expect(found.encryptedContent).to.eq(xssPayload);
      });
    });
  });

  /**
   * TC-MSG-15
   * Component/Function: getMessages
   * Description: Gửi payload SQL Injection vào tham số userId trên URL lấy tin nhắn.
   * Expected Output: HTTP 500 hoặc 400 và không rò rỉ dữ liệu hoặc gây lỗi cấu trúc SQL.
   */
  it('TC-MSG-15 | [Security] Tấn công SQL Injection vào tham số userId → 500 hoặc 400', () => {
    const sqliPayload = "00000000-0000-0000-0000-000000000000' OR '1'='1";
    cy.request({
      method: 'GET',
      url: `${API}/messages/${sqliPayload}`,
      headers: { Authorization: `Bearer ${tokenA}` },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 500]);
      if (res.status === 500) {
        expect(res.body.error).to.eq('Failed to fetch messages');
      }
    });
  });

  /**
   * TC-MSG-16
   * Component/Function: getPendingMessages
   * Description: Kẻ tấn công sử dụng token đánh cắp (Token B) để cố gắng lấy tin nhắn pending của User A.
   * Expected Output: Tin nhắn pending của A không xuất hiện trong kết quả trả về của B.
   */
  it('TC-MSG-16 | [Security] Tránh rò rỉ tin nhắn pending của người dùng khác khi sử dụng token B', () => {
    createMessage({
      senderId: userB.userId,
      recipientId: userA.userId,
      encryptedContent: 'Secret message for A',
      deliveredAt: null
    }).then((msg) => {
      cy.request({
        method: 'GET',
        url: `${API}/messages/pending`,
        headers: { Authorization: `Bearer ${tokenB}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        const found = res.body.find(m => m.id === msg.id);
        expect(found).to.be.undefined;
      });
    });
  });

  /**
   * TC-MSG-17
   * Component/Function: getMessages
   * Description: Kẻ tấn công sử dụng token đã hết hạn (Expired Token) để gọi API lấy lịch sử tin nhắn.
   * Expected Output: HTTP 401 Unauthorized.
   */
  it('TC-MSG-17 | [Security] Từ chối truy cập lịch sử tin nhắn bằng token hết hạn → 401', () => {
    cy.task('createExpiredToken').then((expiredToken) => {
      expect(expiredToken).to.not.be.null;
      cy.request({
        method: 'GET',
        url: `${API}/messages/${userB.userId}`,
        headers: { Authorization: `Bearer ${expiredToken}` },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(401);
      });
    });
  });

  /**
   * TC-MSG-18
   * Component/Function: getMessages
   * Description: Kẻ tấn công giả mạo token bằng cách thay đổi phần signature của JWT token hợp lệ.
   * Expected Output: HTTP 401 Unauthorized.
   */
  it('TC-MSG-18 | [Security] Từ chối truy cập bằng token bị sửa đổi chữ ký → 401', () => {
    const malformedToken = tokenA.substring(0, tokenA.length - 10) + 'abcdefghij';
    cy.request({
      method: 'GET',
      url: `${API}/messages/${userB.userId}`,
      headers: { Authorization: `Bearer ${malformedToken}` },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });
});
