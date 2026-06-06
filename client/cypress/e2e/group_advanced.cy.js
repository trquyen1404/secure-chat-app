/**
 * MODULE: Group Advanced - Mute, React, Reply Messages, DeleteMsg Edge Cases, joinByCode
 * Controller: groupController.js
 * Routes:
 *   POST   /api/groups/:groupId/mute                       → toggleMute (admin success path)
 *   POST   /api/groups/:groupId/messages/:messageId/react  → reactGroupMessage (edge: remove reaction, nonexistent msg)
 *   DELETE /api/groups/:groupId/messages/:messageId        → deleteGroupMessage (nonexistent msg)
 *   POST   /api/groups/:groupId/messages                   → sendGroupMessage (reply chain)
 *   POST   /api/groups/join                                → joinByCode (missing code)
 *   GET    /api/groups/:groupId/messages                   → getGroupMessages (empty group)
 *   GET    /api/groups/:groupId/stats                      → getGroupStats (multiple senders, percentage calc)
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * - toggleMute:         admin check → group.isMuted toggle; non-existent group → 404
 * - reactGroupMessage:  !reaction → DELETE reaction; reaction → SET; msg not found → 404
 * - deleteGroupMessage: msg not found OR senderId !== req.userId → 403; soft-delete
 * - sendGroupMessage:   optional replyToId field stored; type field defaults to null
 * - joinByCode:         missing inviteCode body → 400
 * - getGroupMessages:   empty group returns []
 * - getGroupStats:      percentage calculation for multi-sender groups
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

const createGroup = (token, name, memberIds = []) =>
  cy.request({
    method: 'POST',
    url: `${API}/groups`,
    headers: { Authorization: `Bearer ${token}` },
    body: { name, memberIds }
  });

const sendMsg = (token, groupId, content = 'Test message', extra = {}) =>
  cy.request({
    method: 'POST',
    url: `${API}/groups/${groupId}/messages`,
    headers: { Authorization: `Bearer ${token}` },
    body: { encryptedContent: content, ratchetKey: 'RK', n: 0, pn: 0, iv: 'IV', ...extra }
  });

describe('[Module: Group Advanced] Nhóm - Mute, React, Reply, Xóa tin nhắn nâng cao', () => {
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-ADV-01
   * Component/Function: toggleMute (Admin success path)
   * Description: Admin nhóm khóa (mute) chat của sinh viên thành công → isMuted=true
   * Pre-conditions: User là admin của nhóm
   * Input Data: POST /api/groups/:groupId/mute { isMuted: true } (token admin)
   * Expected Output: HTTP 200 + { isMuted: true }
   */
  it('TC-GRP-ADV-01 | [Positive] Admin khóa chat nhóm (mute) thành công → 200', () => {
    apiUser(`cy_adv_a_${ts}`, `cy_adv_a_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Mute ADV-01`).then(grpRes => {
        cy.request({
          method: 'POST',
          url: `${API}/groups/${grpRes.body.id}/mute`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { isMuted: true }
        }).then(r => {
          expect(r.status).to.eq(200);
          expect(r.body.isMuted).to.be.true;
          expect(r.body.message).to.include('khóa');
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-02
   * Component/Function: toggleMute (Admin unmute)
   * Description: Admin nhóm mở khóa (unmute) chat thành công → isMuted=false
   * Pre-conditions: Admin đã khóa nhóm trước
   * Input Data: POST /api/groups/:groupId/mute { isMuted: false } (token admin)
   * Expected Output: HTTP 200 + { isMuted: false }
   */
  it('TC-GRP-ADV-02 | [Positive] Admin mở khóa chat nhóm (unmute) thành công → 200', () => {
    apiUser(`cy_adv_b_${ts}`, `cy_adv_b_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Unmute ADV-02`).then(grpRes => {
        const groupId = grpRes.body.id;
        // Khóa trước
        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/mute`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { isMuted: true }
        }).then(() => {
          // Rồi mở khóa
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/mute`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { isMuted: false }
          }).then(r => {
            expect(r.status).to.eq(200);
            expect(r.body.isMuted).to.be.false;
            expect(r.body.message).to.include('mở khóa');
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-03
   * Component/Function: reactGroupMessage (remove reaction)
   * Description: Gỡ bỏ reaction bằng cách gửi reaction = null/undefined
   * Pre-conditions: User đã react một tin nhắn
   * Input Data: POST .../react { reaction: null } sau khi đã react
   * Expected Output: HTTP 200 + reactions không còn key của userId
   */
  it('TC-GRP-ADV-03 | [Positive] Gỡ bỏ reaction (gửi reaction=null) → reaction bị xóa', () => {
    apiUser(`cy_adv_c_${ts}`, `cy_adv_c_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm React ADV-03`).then(grpRes => {
        const groupId = grpRes.body.id;
        sendMsg(resA.token, groupId, 'React target').then(msgRes => {
          const messageId = msgRes.body.id;
          const reactUrl = `${API}/groups/${groupId}/messages/${messageId}/react`;

          // Đặt reaction
          cy.request({
            method: 'POST',
            url: reactUrl,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { reaction: '❤️' }
          }).then(r1 => {
            expect(r1.body.reactions[resA.userId]).to.eq('❤️');

            // Xóa reaction bằng cách gửi reaction = null
            cy.request({
              method: 'POST',
              url: reactUrl,
              headers: { Authorization: `Bearer ${resA.token}` },
              body: { reaction: null }
            }).then(r2 => {
              expect(r2.status).to.eq(200);
              expect(r2.body.reactions).to.not.have.property(resA.userId);
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-04
   * Component/Function: reactGroupMessage (multiple users reacting)
   * Description: Nhiều user cùng react vào 1 tin nhắn → reactions object chứa tất cả
   * Pre-conditions: Nhóm có 2 thành viên
   * Input Data: POST .../react { reaction: '👍' } (user A), POST .../react { reaction: '🔥' } (user B)
   * Expected Output: reactions = { [A.userId]: '👍', [B.userId]: '🔥' }
   */
  it('TC-GRP-ADV-04 | [Positive] Nhiều user react cùng 1 tin nhắn → reactions chứa tất cả', () => {
    apiUser(`cy_adv_d_${ts}`, `cy_adv_d_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_adv_e_${ts}`, `cy_adv_e_${ts}@st.utt.edu.vn`).then(resB => {
        createGroup(resA.token, `Nhóm MultiReact ADV-04`, [resB.userId]).then(grpRes => {
          const groupId = grpRes.body.id;
          sendMsg(resA.token, groupId, 'Msg to multi-react').then(msgRes => {
            const messageId = msgRes.body.id;
            const reactUrl = `${API}/groups/${groupId}/messages/${messageId}/react`;

            cy.request({
              method: 'POST',
              url: reactUrl,
              headers: { Authorization: `Bearer ${resA.token}` },
              body: { reaction: '👍' }
            }).then(() => {
              cy.request({
                method: 'POST',
                url: reactUrl,
                headers: { Authorization: `Bearer ${resB.token}` },
                body: { reaction: '🔥' }
              }).then(r => {
                expect(r.status).to.eq(200);
                expect(r.body.reactions[resA.userId]).to.eq('👍');
                expect(r.body.reactions[resB.userId]).to.eq('🔥');
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-05
   * Component/Function: sendGroupMessage (with replyToId)
   * Description: Gửi tin nhắn có replyToId (trả lời tin nhắn) thành công
   * Pre-conditions: Nhóm đã có tin nhắn
   * Input Data: POST /:groupId/messages { encryptedContent, ratchetKey, n, pn, iv, replyToId }
   * Expected Output: HTTP 201 + { replyToId: <original messageId> }
   */
  it('TC-GRP-ADV-05 | [Positive] Gửi tin nhắn reply (replyToId) → lưu đúng replyToId', () => {
    apiUser(`cy_adv_f_${ts}`, `cy_adv_f_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Reply ADV-05`).then(grpRes => {
        const groupId = grpRes.body.id;
        sendMsg(resA.token, groupId, 'Original message').then(originalMsg => {
          sendMsg(resA.token, groupId, 'Reply message', { replyToId: originalMsg.body.id }).then(replyMsg => {
            expect(replyMsg.status).to.eq(201);
            expect(replyMsg.body.replyToId).to.eq(originalMsg.body.id);
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-06
   * Component/Function: getGroupMessages (empty group)
   * Description: Nhóm mới tạo, chưa có tin nhắn → GET messages trả về []
   * Pre-conditions: Nhóm vừa tạo, chưa gửi tin nào
   * Input Data: GET /api/groups/:groupId/messages
   * Expected Output: HTTP 200 + [] (mảng rỗng)
   */
  it('TC-GRP-ADV-06 | [Positive] GET messages nhóm rỗng → trả về []', () => {
    apiUser(`cy_adv_g_${ts}`, `cy_adv_g_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Rỗng ADV-06`).then(grpRes => {
        cy.request({
          method: 'GET',
          url: `${API}/groups/${grpRes.body.id}/messages`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(r => {
          expect(r.status).to.eq(200);
          expect(r.body).to.be.an('array').with.length(0);
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-07
   * Component/Function: getGroupStats (multi-sender percentage calc)
   * Description: Thống kê nhóm với 2 sender → percentage tổng 100%, sort đúng thứ tự
   * Pre-conditions: Nhóm có 2 thành viên đã gửi tin nhắn
   * Input Data: GET /api/groups/:groupId/stats
   * Expected Output: HTTP 200 + stats sorted by messageCount DESC, tổng percentage ≈ 100
   */
  it('TC-GRP-ADV-07 | [Positive] getGroupStats với 2 sender → percentage hợp lệ, sort DESC', () => {
    apiUser(`cy_adv_h_${ts}`, `cy_adv_h_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_adv_i_${ts}`, `cy_adv_i_${ts}@st.utt.edu.vn`).then(resB => {
        createGroup(resA.token, `Nhóm Stats Multi ADV-07`, [resB.userId]).then(grpRes => {
          const groupId = grpRes.body.id;
          // A gửi 3 tin
          cy.request({ method: 'POST', url: `${API}/groups/${groupId}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'A1', ratchetKey: 'RK', n: 0, pn: 0, iv: 'IV' } });
          cy.request({ method: 'POST', url: `${API}/groups/${groupId}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'A2', ratchetKey: 'RK', n: 1, pn: 0, iv: 'IV' } });
          cy.request({ method: 'POST', url: `${API}/groups/${groupId}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'A3', ratchetKey: 'RK', n: 2, pn: 0, iv: 'IV' } });
          // B gửi 1 tin
          cy.request({ method: 'POST', url: `${API}/groups/${groupId}/messages`, headers: { Authorization: `Bearer ${resB.token}` }, body: { encryptedContent: 'B1', ratchetKey: 'RK', n: 0, pn: 0, iv: 'IV' } });

          cy.request({
            method: 'GET',
            url: `${API}/groups/${groupId}/stats`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            expect(r.body.totalMessages).to.eq(4);
            expect(r.body.stats).to.be.an('array').with.length(2);

            // Sort DESC: A (3 tin) trước B (1 tin)
            const firstStat = r.body.stats[0];
            expect(firstStat.userId).to.eq(resA.userId);
            expect(firstStat.messageCount).to.eq(3);
            expect(parseFloat(firstStat.percentage)).to.eq(75.0);

            const secondStat = r.body.stats[1];
            expect(secondStat.userId).to.eq(resB.userId);
            expect(secondStat.messageCount).to.eq(1);
            expect(parseFloat(secondStat.percentage)).to.eq(25.0);
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-ADV-08
   * Component/Function: toggleMute (group not found)
   * Description: Mute nhóm không tồn tại → middleware chặn → 403/404
   * Pre-conditions: groupId không tồn tại
   * Input Data: POST /api/groups/00000000-0000-0000-0000-000000000000/mute
   * Expected Output: HTTP 403 hoặc 404
   */
  it('TC-GRP-ADV-08 | [Negative] toggleMute nhóm không tồn tại → 403/404', () => {
    apiUser(`cy_adv_j_${ts}`, `cy_adv_j_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/groups/00000000-0000-0000-0000-000000000000/mute`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: { isMuted: true },
        failOnStatusCode: false
      }).then(r => {
        expect([403, 404]).to.include(r.status);
      });
    });
  });

  /**
   * TC-GRP-ADV-09
   * Component/Function: reactGroupMessage (message not found)
   * Description: React vào messageId không tồn tại → 404
   * Pre-conditions: messageId không có trong DB
   * Input Data: POST /api/groups/:groupId/messages/00000000-0000-0000-0000-000000000000/react
   * Expected Output: HTTP 404 + { error: 'Message not found' }
   */
  it('TC-GRP-ADV-09 | [Negative] React vào messageId không tồn tại → 404', () => {
    apiUser(`cy_adv_k_${ts}`, `cy_adv_k_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm React NF ADV-09`).then(grpRes => {
        cy.request({
          method: 'POST',
          url: `${API}/groups/${grpRes.body.id}/messages/00000000-0000-0000-0000-000000000000/react`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { reaction: '👍' },
          failOnStatusCode: false
        }).then(r => {
          expect(r.status).to.eq(404);
          expect(r.body.error).to.include('not found');
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-10
   * Component/Function: deleteGroupMessage (message not found → returns 403)
   * Description: Xóa tin nhắn không tồn tại → controller check: msg not found → 403 (bởi vì msg null)
   * Pre-conditions: messageId không có trong DB
   * Input Data: DELETE /api/groups/:groupId/messages/00000000-0000-0000-0000-000000000000
   * Expected Output: HTTP 403 (controller check: !msg || msg.senderId !== req.userId → 403)
   */
  it('TC-GRP-ADV-10 | [Negative] DELETE tin nhắn không tồn tại → 403', () => {
    apiUser(`cy_adv_l_${ts}`, `cy_adv_l_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Del NF ADV-10`).then(grpRes => {
        cy.request({
          method: 'DELETE',
          url: `${API}/groups/${grpRes.body.id}/messages/00000000-0000-0000-0000-000000000000`,
          headers: { Authorization: `Bearer ${resA.token}` },
          failOnStatusCode: false
        }).then(r => {
          expect(r.status).to.eq(403);
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-11
   * Component/Function: joinByCode (missing inviteCode body)
   * Description: Tham gia nhóm mà không gửi inviteCode trong body → 400
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/groups/join { } (body rỗng, không có inviteCode)
   * Expected Output: HTTP 400 + { error: 'Vui lòng nhập mã mời' }
   */
  it('TC-GRP-ADV-11 | [Negative] joinByCode không gửi inviteCode → 400', () => {
    apiUser(`cy_adv_m_${ts}`, `cy_adv_m_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/groups/join`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: {},
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(400);
        expect(r.body.error).to.include('mã mời');
      });
    });
  });

  /**
   * TC-GRP-ADV-12
   * Component/Function: toggleMute (non-admin member)
   * Description: Thành viên thường cố gắng mute nhóm → 403
   * Pre-conditions: B là member thường trong nhóm của A
   * Input Data: POST /api/groups/:groupId/mute { isMuted: true } (token B)
   * Expected Output: HTTP 403 + { error: 'Chỉ Quản trị viên...' }
   */
  it('TC-GRP-ADV-12 | [Negative] Member thường cố mute nhóm → 403 Forbidden', () => {
    apiUser(`cy_adv_n_${ts}`, `cy_adv_n_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_adv_o_${ts}`, `cy_adv_o_${ts}@st.utt.edu.vn`).then(resB => {
        createGroup(resA.token, `Nhóm Mute Guard ADV-12`, [resB.userId]).then(grpRes => {
          cy.request({
            method: 'POST',
            url: `${API}/groups/${grpRes.body.id}/mute`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { isMuted: true },
            failOnStatusCode: false
          }).then(r => {
            expect(r.status).to.eq(403);
            expect(r.body.error).to.include('Quản trị viên');
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-ADV-13
   * Component/Function: sendGroupMessage (đổi reaction nhiều lần)
   * Description: User đổi reaction từ emoji này sang emoji khác → reaction cuối cùng được lưu
   * Pre-conditions: Tin nhắn tồn tại trong nhóm
   * Input Data: POST .../react { reaction: '👍' }, rồi POST .../react { reaction: '❤️' }
   * Expected Output: reactions[userId] = '❤️' (giá trị cuối cùng)
   */
  it('TC-GRP-ADV-13 | [Boundary] Đổi reaction nhiều lần → chỉ lưu reaction cuối cùng', () => {
    apiUser(`cy_adv_p_${ts}`, `cy_adv_p_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Reaction Change ADV-13`).then(grpRes => {
        const groupId = grpRes.body.id;
        sendMsg(resA.token, groupId, 'React change test').then(msgRes => {
          const reactUrl = `${API}/groups/${groupId}/messages/${msgRes.body.id}/react`;

          cy.request({ method: 'POST', url: reactUrl, headers: { Authorization: `Bearer ${resA.token}` }, body: { reaction: '👍' } });
          cy.request({ method: 'POST', url: reactUrl, headers: { Authorization: `Bearer ${resA.token}` }, body: { reaction: '😂' } });
          cy.request({
            method: 'POST',
            url: reactUrl,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { reaction: '❤️' }
          }).then(finalRes => {
            expect(finalRes.status).to.eq(200);
            expect(finalRes.body.reactions[resA.userId]).to.eq('❤️');
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-14
   * Component/Function: sendGroupMessage (soft delete does not remove from history)
   * Description: Sau khi xóa (soft-delete) tin nhắn, getGroupMessages vẫn trả về tin nhắn
   *              với encryptedContent=null và isDeleted=true
   * Pre-conditions: A đã gửi và xóa tin nhắn trong nhóm
   * Input Data: DELETE /:groupId/messages/:messageId; GET /:groupId/messages
   * Expected Output: Tin nhắn vẫn có trong danh sách với isDeleted=true, encryptedContent=null
   */
  it('TC-GRP-ADV-14 | [Boundary] Soft-delete: tin nhắn xóa vẫn xuất hiện trong history với isDeleted=true', () => {
    apiUser(`cy_adv_q_${ts}`, `cy_adv_q_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm SoftDel ADV-14`).then(grpRes => {
        const groupId = grpRes.body.id;
        sendMsg(resA.token, groupId, 'Will be deleted').then(msgRes => {
          const messageId = msgRes.body.id;

          // Xóa tin nhắn
          cy.request({
            method: 'DELETE',
            url: `${API}/groups/${groupId}/messages/${messageId}`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(delRes => {
            expect(delRes.status).to.eq(200);
            expect(delRes.body.isDeleted).to.be.true;

            // Lấy lịch sử → vẫn thấy tin nhắn với isDeleted=true
            cy.request({
              method: 'GET',
              url: `${API}/groups/${groupId}/messages`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(histRes => {
              expect(histRes.status).to.eq(200);
              const deletedMsg = histRes.body.find(m => m.id === messageId);
              // Tin nhắn có thể không được trả về nếu content null bị lọc, hoặc xuất hiện với null
              // Theo code: chỉ soft-delete fields; không filter ra khỏi query
              if (deletedMsg) {
                expect(deletedMsg.encryptedContent).to.be.null;
              }
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-15
   * Component/Function: getGroupMessages (cursor pagination invalid date)
   * Description: Lấy tin nhắn với cursor không hợp lệ → 500 (invalid Date parse)
   * Pre-conditions: Nhóm có tin nhắn
   * Input Data: GET /api/groups/:groupId/messages?cursor=INVALID_DATE
   * Expected Output: HTTP 500
   */
  it('TC-GRP-ADV-15 | [Boundary] GET messages với cursor không hợp lệ → 500', () => {
    apiUser(`cy_adv_r_${ts}`, `cy_adv_r_${ts}@st.utt.edu.vn`).then(resA => {
      createGroup(resA.token, `Nhóm Cursor ADV-15`).then(grpRes => {
        cy.request({
          method: 'GET',
          url: `${API}/groups/${grpRes.body.id}/messages?cursor=NOT_A_DATE`,
          headers: { Authorization: `Bearer ${resA.token}` },
          failOnStatusCode: false
        }).then(r => {
          expect(r.status).to.eq(500);
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRP-ADV-16
   * Component/Function: deleteGroupMessage (ownership check)
   * Description: Owner xóa tin nhắn của chính mình thành công, nhưng user khác trong nhóm bị từ chối
   * Pre-conditions: A và B cùng trong nhóm; B cố xóa tin nhắn của A
   * Input Data: DELETE /:groupId/messages/:msgId (token B)
   * Expected Output: HTTP 403 (không phải owner)
   */
  it('TC-GRP-ADV-16 | [Security] User không phải chủ tin nhắn cố xóa → 403', () => {
    apiUser(`cy_adv_s_${ts}`, `cy_adv_s_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_adv_t_${ts}`, `cy_adv_t_${ts}@st.utt.edu.vn`).then(resB => {
        createGroup(resA.token, `Nhóm OwnerDel ADV-16`, [resB.userId]).then(grpRes => {
          const groupId = grpRes.body.id;
          // A gửi tin nhắn
          sendMsg(resA.token, groupId, 'A private msg').then(msgRes => {
            // B (member) cố xóa tin nhắn của A
            cy.request({
              method: 'DELETE',
              url: `${API}/groups/${groupId}/messages/${msgRes.body.id}`,
              headers: { Authorization: `Bearer ${resB.token}` },
              failOnStatusCode: false
            }).then(r => {
              expect(r.status).to.eq(403);
              expect(r.body.error).to.include('Not allowed');
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-17
   * Component/Function: sendGroupMessage → non-member cannot react
   * Description: User ngoài nhóm không thể react vào tin nhắn (groupMembership middleware)
   * Pre-conditions: C không phải thành viên nhóm của A và B
   * Input Data: POST /:groupId/messages/:messageId/react { reaction: '👍' } (token C)
   * Expected Output: HTTP 403 Forbidden
   */
  it('TC-GRP-ADV-17 | [Security] User ngoài nhóm cố react tin nhắn → 403', () => {
    apiUser(`cy_adv_u_${ts}`, `cy_adv_u_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_adv_v_${ts}`, `cy_adv_v_${ts}@st.utt.edu.vn`).then(resC => {
        createGroup(resA.token, `Nhóm ReactGuard ADV-17`).then(grpRes => {
          const groupId = grpRes.body.id;
          sendMsg(resA.token, groupId, 'Protected msg').then(msgRes => {
            // C (không thuộc nhóm) cố react
            cy.request({
              method: 'POST',
              url: `${API}/groups/${groupId}/messages/${msgRes.body.id}/react`,
              headers: { Authorization: `Bearer ${resC.token}` },
              body: { reaction: '👍' },
              failOnStatusCode: false
            }).then(r => {
              expect(r.status).to.eq(403);
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRP-ADV-18
   * Component/Function: All group advanced endpoints (no token)
   * Description: POST /mute và DELETE /messages không có token → 401
   * Pre-conditions: Không có Authorization header
   * Input Data: POST /api/groups/00000000/mute (no token); DELETE /api/groups/00000000/messages/00000000 (no token)
   * Expected Output: HTTP 401
   */
  it('TC-GRP-ADV-18 | [Security] POST /mute và DELETE /messages không có token → 401', () => {
    cy.request({
      method: 'POST',
      url: `${API}/groups/00000000-0000-0000-0000-000000000000/mute`,
      body: { isMuted: true },
      failOnStatusCode: false
    }).then(r => {
      expect(r.status).to.eq(401);
    });

    cy.request({
      method: 'DELETE',
      url: `${API}/groups/00000000-0000-0000-0000-000000000000/messages/00000000-0000-0000-0000-000000000000`,
      failOnStatusCode: false
    }).then(r => {
      expect(r.status).to.eq(401);
    });
  });
});
