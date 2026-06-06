/**
 * MODULE: Group Messaging
 * Controller: groupController.js
 * Routes:
 *   POST   /api/groups
 *   POST   /api/groups/join
 *   GET    /api/groups
 *   GET    /api/groups/:groupId
 *   GET    /api/groups/:groupId/messages
 *   POST   /api/groups/:groupId/messages
 *   POST   /api/groups/:groupId/messages/:messageId/react
 *   DELETE /api/groups/:groupId/messages/:messageId
 *   GET    /api/groups/:groupId/stats
 *   DELETE /api/groups/:groupId
 *   PATCH  /api/groups/:groupId/settings
 *   PATCH  /api/groups/:groupId/members/:memberId/settings
 *   POST   /api/groups/:groupId/mute
 *   GET    /api/groups/:groupId/pinned
 *   POST   /api/groups/:groupId/messages/:messageId/pin
 *   GET    /api/groups/:groupId/read-status
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * - createGroup: Creator is automatically added as admin.
 * - joinByCode: Joins via inviteCode, checks duplicate.
 * - sendGroupMessage: Saves group message.
 * - reactGroupMessage: Saves reactions.
 * - deleteGroupMessage: Deletes message (ownership check).
 * - muteGroup: Only admins can mute.
 * - groupMembership: Middleware ensures only members can read/write group data.
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiRegisterAndLogin = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

describe('[Module: Group Messaging] Nhắn tin Nhóm', () => {
  const ts = Date.now();
  let userA, userB, userC;
  let tokenA, tokenB, tokenC;

  before(() => {
    // Setup users A, B & C
    const nameA = `cy_grp_a_${ts}`;
    const nameB = `cy_grp_b_${ts}`;
    const nameC = `cy_grp_c_${ts}`;

    apiRegisterAndLogin(nameA, `${nameA}@st.utt.edu.vn`).then((resA) => {
      userA = resA;
      tokenA = resA.token;
    });

    apiRegisterAndLogin(nameB, `${nameB}@st.utt.edu.vn`).then((resB) => {
      userB = resB;
      tokenB = resB.token;
    });

    apiRegisterAndLogin(nameC, `${nameC}@st.utt.edu.vn`).then((resC) => {
      userC = resC;
      tokenC = resC.token;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-01
   * Component/Function: createGroup
   * Description: Tạo nhóm mới thành công với danh sách thành viên hợp lệ.
   * Expected Output: HTTP 201 + Group info.
   */
  it('TC-GRP-01 | [Positive] Tạo nhóm mới thành công', () => {
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        name: 'Nhóm học tập UTT',
        memberIds: [userB.userId]
      }
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('inviteCode');
      expect(res.body.name).to.eq('Nhóm học tập UTT');
      expect(res.body.createdBy).to.eq(userA.userId);
    });
  });

  /**
   * TC-GRP-02
   * Component/Function: sendGroupMessage & getGroupMessages
   * Description: Gửi tin nhắn vào nhóm và lấy lịch sử tin nhắn nhóm thành công.
   * Expected Output: HTTP 201 + message data, HTTP 200 + message array
   */
  it('TC-GRP-02 | [Positive] Gửi và lấy tin nhắn nhóm thành công', () => {
    // A tạo nhóm trước
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Tin Học 1' }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // A gửi tin nhắn vào nhóm
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          encryptedContent: 'Hello Group!',
          ratchetKey: 'AAAAA',
          n: 0,
          pn: 0,
          iv: 'BBBBB'
        }
      }).then((msgRes) => {
        expect(msgRes.status).to.eq(201);
        expect(msgRes.body.encryptedContent).to.eq('Hello Group!');

        // Lấy lịch sử tin nhắn nhóm
        cy.request({
          method: 'GET',
          url: `${API}/groups/${groupId}/messages`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((historyRes) => {
          expect(historyRes.status).to.eq(200);
          expect(historyRes.body).to.be.an('array');
          const found = historyRes.body.find((m) => m.id === msgRes.body.id);
          expect(found).to.not.be.undefined;
        });
      });
    });
  });

  /**
   * TC-GRP-03
   * Component/Function: joinByCode
   * Description: Tham gia nhóm thành công bằng mã mời.
   * Expected Output: HTTP 200 + success message.
   */
  it('TC-GRP-03 | [Positive] Tham gia nhóm bằng mã mời thành công', () => {
    // A tạo nhóm
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Cơ Sở Dữ Liệu' }
    }).then((groupRes) => {
      const inviteCode = groupRes.body.inviteCode;

      // B dùng inviteCode để tham gia
      cy.request({
        method: 'POST',
        url: `${API}/groups/join`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { inviteCode }
      }).then((joinRes) => {
        expect(joinRes.status).to.eq(200);
        expect(joinRes.body.message).to.include('thành công');
        expect(joinRes.body.group.id).to.eq(groupRes.body.id);
      });
    });
  });

  /**
   * TC-GRP-04
   * Component/Function: reactGroupMessage & deleteGroupMessage
   * Description: Thả cảm xúc và thu hồi (xóa) tin nhắn nhóm thành công.
   * Expected Output: HTTP 200 + updated reactions, HTTP 200 + isDeleted=true
   */
  it('TC-GRP-04 | [Positive] Thả cảm xúc và xóa tin nhắn nhóm thành công', () => {
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Mạng Máy Tính' }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // Gửi tin nhắn
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { encryptedContent: 'Target group message', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' }
      }).then((msgRes) => {
        const messageId = msgRes.body.id;

        // Thả cảm xúc (reaction)
        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/messages/${messageId}/react`,
          headers: { Authorization: `Bearer ${tokenA}` },
          body: { reaction: '👍' }
        }).then((reactRes) => {
          expect(reactRes.status).to.eq(200);
          expect(reactRes.body.reactions[userA.userId]).to.eq('👍');

          // Xóa (thu hồi) tin nhắn
          cy.request({
            method: 'DELETE',
            url: `${API}/groups/${groupId}/messages/${messageId}`,
            headers: { Authorization: `Bearer ${tokenA}` },
          }).then((deleteRes) => {
            expect(deleteRes.status).to.eq(200);
            expect(deleteRes.body.isDeleted).to.be.true;
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-05
   * Component/Function: createGroup
   * Description: Tạo nhóm không có tên -> 400 Bad Request.
   * Expected Output: HTTP 400 + { error: "Group name required" }
   */
  it('TC-GRP-05 | [Negative] Tạo nhóm không có tên → 400 Bad Request', () => {
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: '' },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.eq('Validation Error');
    });
  });

  /**
   * TC-GRP-06
   * Component/Function: joinByCode
   * Description: Tham gia nhóm bằng mã mời không tồn tại -> 404 Not Found.
   * Expected Output: HTTP 404 + error.
   */
  it('TC-GRP-06 | [Negative] Tham gia nhóm bằng mã mời sai → 404 Not Found', () => {
    cy.request({
      method: 'POST',
      url: `${API}/groups/join`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { inviteCode: 'NOTEXS' },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(404);
      expect(res.body.error).to.include('không hợp lệ');
    });
  });

  /**
   * TC-GRP-07
   * Component/Function: deleteGroupMessage
   * Description: Thành viên thường cố xóa tin nhắn của người khác -> 403 Forbidden.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-GRP-07 | [Negative] Thành viên thường xóa tin nhắn của người khác → 403 Forbidden', () => {
    // A tạo nhóm, thêm B
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm An Toàn Thông Tin', memberIds: [userB.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // A gửi tin nhắn
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { encryptedContent: 'A msg', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' }
      }).then((msgRes) => {
        const messageId = msgRes.body.id;

        // B (member thường) cố tình xóa tin nhắn của A
        cy.request({
          method: 'DELETE',
          url: `${API}/groups/${groupId}/messages/${messageId}`,
          headers: { Authorization: `Bearer ${tokenB}` },
          failOnStatusCode: false
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('Not allowed');
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-08
   * Component/Function: joinByCode
   * Description: Tham gia nhóm bằng mã mời khi đã là thành viên -> 400 Bad Request.
   * Expected Output: HTTP 400 + { error: "Bạn đã là thành viên của nhóm này" }
   */
  it('TC-GRP-08 | [Boundary] Tham gia nhóm khi đã là thành viên → 400 Bad Request', () => {
    // A tạo nhóm
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Hệ Điều Hành' }
    }).then((groupRes) => {
      const inviteCode = groupRes.body.inviteCode;

      // A (đã là thành viên/admin) dùng inviteCode để tham gia tiếp
      cy.request({
        method: 'POST',
        url: `${API}/groups/join`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { inviteCode },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.include('đã là thành viên');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-09
   * Component/Function: getGroupMessages & sendGroupMessage
   * Description: Đọc hoặc gửi tin nhắn vào nhóm mà mình không phải là thành viên -> 403 Forbidden.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-GRP-09 | [Security] Đọc hoặc gửi tin nhắn vào nhóm không thuộc về → 403 Forbidden', () => {
    // A tạo nhóm
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Lập Trình Web' }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // C (không phải member) cố gắng đọc tin nhắn nhóm
      cy.request({
        method: 'GET',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenC}` },
        failOnStatusCode: false
      }).then((readRes) => {
        expect(readRes.status).to.eq(403);
      });

      // C cố gắng gửi tin nhắn vào nhóm
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenC}` },
        body: { encryptedContent: 'Spam', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' },
        failOnStatusCode: false
      }).then((writeRes) => {
        expect(writeRes.status).to.eq(403);
      });
    });
  });

  /**
   * TC-GRP-10
   * Component/Function: toggleMute
   * Description: Chỉ Admin nhóm mới có quyền khóa/mở khóa tính năng chat của sinh viên -> 403 Forbidden.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-GRP-10 | [Security] Thành viên thường cố gắng khóa chat của nhóm → 403 Forbidden', () => {
    // A tạo nhóm, thêm B
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Kỹ Thuật Phần Mềm', memberIds: [userB.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // B (member thường) cố gắng khóa chat của nhóm
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/mute`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { isMuted: true },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body.error).to.include('Quản trị viên');
      });
    });
  });

  /**
   * TC-GRP-11
   * Component/Function: sendGroupMessage & getGroupMessages
   * Description: Nhiều thành viên trong nhóm (A, B, C) nhắn tin qua lại với nhau, xác nhận tất cả tin nhắn đều được hiển thị đầy đủ và đúng thứ tự trong lịch sử trò chuyện nhóm.
   * Expected Output: HTTP 201 cho mỗi lượt gửi, HTTP 200 + danh sách tin nhắn đầy đủ và đúng thứ tự thời gian.
   */
  it('TC-GRP-11 | [Positive] Các thành viên nhóm nhắn tin qua lại với nhau và hiển thị đúng thứ tự', () => {
    // A tạo nhóm, thêm B và C
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Chat Tổng Hợp', memberIds: [userB.userId, userC.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // A gửi tin nhắn
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { encryptedContent: 'A: Chào cả nhóm!', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' }
      }).then((msgA) => {
        expect(msgA.status).to.eq(201);
        cy.wait(50);

        // B gửi tin nhắn
        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/messages`,
          headers: { Authorization: `Bearer ${tokenB}` },
          body: { encryptedContent: 'B: Chào thầy và các bạn!', ratchetKey: 'BBBBB', n: 0, pn: 0, iv: 'CCCCC' }
        }).then((msgB) => {
          expect(msgB.status).to.eq(201);
          cy.wait(50);

          // C gửi tin nhắn
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${tokenC}` },
            body: { encryptedContent: 'C: Hello mọi người!', ratchetKey: 'CCCCC', n: 0, pn: 0, iv: 'DDDDD' }
          }).then((msgC) => {
            expect(msgC.status).to.eq(201);

            // Lấy lịch sử tin nhắn nhóm từ phía A
            cy.request({
              method: 'GET',
              url: `${API}/groups/${groupId}/messages`,
              headers: { Authorization: `Bearer ${tokenA}` },
            }).then((historyRes) => {
              expect(historyRes.status).to.eq(200);
              expect(historyRes.body).to.be.an('array');

              // Lọc ra 3 tin nhắn vừa gửi
              const testMsgs = historyRes.body.filter(m => m.id === msgA.body.id || m.id === msgB.body.id || m.id === msgC.body.id);
              expect(testMsgs.length).to.eq(3);

              // Xác nhận đúng thứ tự: A -> B -> C
              expect(testMsgs[0].id).to.eq(msgA.body.id);
              expect(testMsgs[1].id).to.eq(msgB.body.id);
              expect(testMsgs[2].id).to.eq(msgC.body.id);

              expect(testMsgs[0].encryptedContent).to.eq('A: Chào cả nhóm!');
              expect(testMsgs[1].encryptedContent).to.eq('B: Chào thầy và các bạn!');
              expect(testMsgs[2].encryptedContent).to.eq('C: Hello mọi người!');
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRP-12
   * Component/Function: sendGroupMessage
   * Description: Các thành viên gửi tin nhắn nhóm chứa các ký tự Unicode tiếng Việt đặc biệt và emoji qua lại trong nhóm.
   * Expected Output: HTTP 201 gửi tin nhắn thành công, lịch sử tin nhắn hiển thị chuẩn xác các ký tự Unicode và emoji.
   */
  it('TC-GRP-12 | [Boundary] Gửi tin nhắn nhóm chứa Unicode tiếng Việt và emoji qua lại', () => {
    // A tạo nhóm, thêm B
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Học Tập 2', memberIds: [userB.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { encryptedContent: 'Tài liệu học tập ở đây nhé: https://utt.edu.vn/ 🚀', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' }
      }).then((msgA) => {
        expect(msgA.status).to.eq(201);
        cy.wait(50);

        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/messages`,
          headers: { Authorization: `Bearer ${tokenB}` },
          body: { encryptedContent: 'Tuyệt vời quá! Cảm ơn bạn rất nhiều! 🎉💯', ratchetKey: 'BBBBB', n: 0, pn: 0, iv: 'CCCCC' }
        }).then((msgB) => {
          expect(msgB.status).to.eq(201);

          cy.request({
            method: 'GET',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${tokenA}` },
          }).then((res) => {
            expect(res.status).to.eq(200);
            const mA = res.body.find(m => m.id === msgA.body.id);
            const mB = res.body.find(m => m.id === msgB.body.id);

            expect(mA).to.not.be.undefined;
            expect(mB).to.not.be.undefined;
            expect(mA.encryptedContent).to.eq('Tài liệu học tập ở đây nhé: https://utt.edu.vn/ 🚀');
            expect(mB.encryptedContent).to.eq('Tuyệt vời quá! Cảm ơn bạn rất nhiều! 🎉💯');
          });
        });
      });
    });
  });

  /**
   * TC-GRP-13
   * Component/Function: sendGroupMessage
   * Description: Nhắn tin nhóm liên tiếp với tốc độ cao từ nhiều thành viên khác nhau để kiểm tra tính đồng bộ.
   * Expected Output: HTTP 201 cho toàn bộ tin nhắn gửi đi, được phân phối đúng thứ tự thời gian.
   */
  it('TC-GRP-13 | [Boundary] Gửi nhanh tin nhắn nhóm liên tiếp từ các thành viên khác nhau', () => {
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Spam Test', memberIds: [userB.userId, userC.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;
      const createdIds = [];

      let chain = cy.wrap(null);
      
      const senders = [
        { token: tokenA, text: 'A1: Spam tin nhắn nhanh' },
        { token: tokenB, text: 'B1: Spam tin nhắn nhanh' },
        { token: tokenC, text: 'C1: Spam tin nhắn nhanh' },
        { token: tokenA, text: 'A2: Spam tin nhắn nhanh' },
        { token: tokenB, text: 'B2: Spam tin nhắn nhanh' }
      ];

      senders.forEach((sender, i) => {
        chain = chain.then(() => {
          return cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${sender.token}` },
            body: { encryptedContent: sender.text, ratchetKey: 'AAAAA', n: i, pn: 0, iv: 'BBBBB' }
          }).then((res) => {
            expect(res.status).to.eq(201);
            createdIds.push(res.body.id);
            return cy.wait(50);
          });
        });
      });

      chain.then(() => {
        cy.request({
          method: 'GET',
          url: `${API}/groups/${groupId}/messages`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          const testMsgs = res.body.filter(m => createdIds.includes(m.id));
          expect(testMsgs.length).to.eq(5);
          
          for (let i = 0; i < 5; i++) {
            expect(testMsgs[i].id).to.eq(createdIds[i]);
            expect(testMsgs[i].encryptedContent).to.eq(senders[i].text);
          }
        });
      });
    });
  });

  /**
   * TC-GRP-14
   * Component/Function: togglePinGroupMessage
   * Description: Thành viên thường cố gắng ghim tin nhắn nhóm của người khác (chỉ Admin mới được ghim) -> Mong đợi 403 Forbidden.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-GRP-14 | [Security] Thành viên thường cố gắng ghim tin nhắn nhóm → 403 Forbidden', () => {
    // A tạo nhóm, thêm B
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Test Pin', memberIds: [userB.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // A gửi tin nhắn
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { encryptedContent: 'Pin target msg', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' }
      }).then((msgRes) => {
        const messageId = msgRes.body.id;

        // B (thành viên thường) cố ghim tin nhắn của A
        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/messages/${messageId}/pin`,
          headers: { Authorization: `Bearer ${tokenB}` },
          failOnStatusCode: false
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('admins can pin');
        });
      });
    });
  });

  /**
   * TC-GRP-15
   * Component/Function: joinByCode
   * Description: Thử nghiệm chèn mã SQL Injection vào tham số inviteCode khi gửi yêu cầu tham gia nhóm.
   * Expected Output: HTTP 404 Not Found (Mã mời không hợp lệ) mà không xảy ra lỗi cơ sở dữ liệu nội bộ.
   */
  it('TC-GRP-15 | [Security] Tấn công SQL Injection qua inviteCode → 404 Not Found', () => {
    const sqliPayload = "' OR '1'='1";
    cy.request({
      method: 'POST',
      url: `${API}/groups/join`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { inviteCode: sqliPayload },
      failOnStatusCode: false
    }).then((res) => {
      expect(res.status).to.eq(404);
      expect(res.body.error).to.include('không hợp lệ');
    });
  });

  /**
   * TC-GRP-16
   * Component/Function: reactGroupMessage (Access Control Bypass)
   * Description: Một người dùng không thuộc nhóm cố gắng gửi yêu cầu API để thả cảm xúc (react) vào tin nhắn của nhóm đó.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-GRP-16 | [Security] Người lạ cố gắng react tin nhắn nhóm → 403 Forbidden', () => {
    // A tạo nhóm, thêm B (C không thuộc nhóm)
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Kín', memberIds: [userB.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // A gửi tin nhắn
      cy.request({
        method: 'POST',
        url: `${API}/groups/${groupId}/messages`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { encryptedContent: 'A secret msg', ratchetKey: 'AAAAA', n: 0, pn: 0, iv: 'BBBBB' }
      }).then((msgRes) => {
        const messageId = msgRes.body.id;

        // C (không phải thành viên) cố gắng react tin nhắn của A
        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/messages/${messageId}/react`,
          headers: { Authorization: `Bearer ${tokenC}` },
          body: { reaction: '👍' },
          failOnStatusCode: false
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('Bạn không phải thành viên');
        });
      });
    });
  });

  /**
   * TC-GRP-17
   * Component/Function: getPinnedGroupMessages (Access Control Bypass)
   * Description: Người dùng C (không thuộc nhóm) sử dụng token hợp lệ của mình để cố gắng lấy danh sách tin nhắn đã ghim (pinned messages) của nhóm.
   * Expected Output: HTTP 403 Forbidden.
   */
  it('TC-GRP-17 | [Security] Người dùng không phải thành viên cố lấy tin nhắn đã ghim → 403 Forbidden', () => {
    // A tạo nhóm, thêm B
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Bảo Mật Cao', memberIds: [userB.userId] }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // C (không phải thành viên) cố gắng gọi API lấy tin nhắn ghim của nhóm
      cy.request({
        method: 'GET',
        url: `${API}/groups/${groupId}/pinned`,
        headers: { Authorization: `Bearer ${tokenC}` },
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body.error).to.include('Bạn không phải thành viên');
      });
    });
  });

  /**
   * TC-GRP-18
   * Component/Function: getGroupMessages & getGroupStats
   * Description: Kẻ tấn công gọi API lấy lịch sử tin nhắn nhóm hoặc thống kê nhóm mà không gửi kèm token Authorization.
   * Expected Output: HTTP 401 Unauthorized.
   */
  it('TC-GRP-18 | [Security] Từ chối truy cập thông tin nhóm khi không có token Authorization → 401', () => {
    // A tạo nhóm
    cy.request({
      method: 'POST',
      url: `${API}/groups`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Nhóm Công Khai' }
    }).then((groupRes) => {
      const groupId = groupRes.body.id;

      // Không gửi headers Authorization
      cy.request({
        method: 'GET',
        url: `${API}/groups/${groupId}/messages`,
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(401);
      });

      cy.request({
        method: 'GET',
        url: `${API}/groups/${groupId}/stats`,
        failOnStatusCode: false
      }).then((res) => {
        expect(res.status).to.eq(401);
      });
    });
  });
});
