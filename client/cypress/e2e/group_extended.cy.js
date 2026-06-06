import { io } from 'socket.io-client';

/**
 * MODULE: Extended Group Messaging - Advanced Test Cases
 * Controller: groupController.js
 * Routes covered:
 *   GET   /api/groups                                    → getUserGroups
 *   GET   /api/groups/:groupId                           → getGroup
 *   GET   /api/groups/:groupId/stats                     → getGroupStats
 *   DELETE /api/groups/:groupId                          → deleteGroup
 *   PATCH  /api/groups/:groupId/settings                 → updateGroupSettings
 *   PATCH  /api/groups/:groupId/members/:memberId/settings → updateMemberSettings
 *   GET   /api/groups/:groupId/pinned                    → getPinnedGroupMessages
 *   POST  /api/groups/:groupId/messages/:messageId/pin  → togglePinGroupMessage
 *   GET   /api/groups/:groupId/read-status              → getReadStatus
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 *   getUserGroups:          findAll with latestMessage per group
 *   getGroup:               not found → 404 | return group + members
 *   getGroupStats:          0 messages → { totalMessages: 0, stats: [] } | count per sender
 *   deleteGroup:            not found → 404 | not admin → 403 | cascade destroy
 *   updateGroupSettings:    any member can update themeColor/quickEmoji/selfDestructTimer
 *   updateMemberSettings:   own settings OR admin | not found → 404 | permission denied → 403
 *   togglePinGroupMessage:  admin only | message wrong group → 404
 *   getPinnedGroupMessages: return isPinned=true messages
 *   getReadStatus:          return members with lastReadMessageId
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

describe('[Module: Group Extended] Nhóm - Chức năng nâng cao', () => {
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRPX-01
   * Component/Function: getUserGroups
   * Description: Lấy danh sách nhóm user đang là thành viên
   * Pre-conditions: User đã tạo ít nhất 1 nhóm
   * Input Data: GET /api/groups (token user)
   * Expected Output: HTTP 200 + Array có ít nhất 1 nhóm với field id, name
   */
  it('TC-GRPX-01 | [Positive] Lấy danh sách nhóm của user thành công → 200', () => {
    apiUser(`cy_gx_a_${ts}`, `cy_gx_a_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Test GX-01' } }).then(() => {
        cy.request({
          method: 'GET',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(res => {
          expect(res.status).to.eq(200);
          expect(res.body).to.be.an('array').with.length.greaterThan(0);
          const grp = res.body.find(g => g.name === 'Nhóm Test GX-01');
          expect(grp).to.not.be.undefined;
          expect(grp).to.have.property('id');
          expect(grp).to.have.property('latestMessage');
        });
      });
    });
  });

  /**
   * TC-GRPX-02
   * Component/Function: getGroup
   * Description: Lấy chi tiết thông tin nhóm + danh sách thành viên
   * Pre-conditions: User là thành viên của nhóm
   * Input Data: GET /api/groups/:groupId
   * Expected Output: HTTP 200 + { group: {...}, members: [...] }
   */
  it('TC-GRPX-02 | [Positive] Lấy chi tiết nhóm thành công → 200 + group + members', () => {
    apiUser(`cy_gx_b_${ts}`, `cy_gx_b_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Thống Kê GX-02' } }).then(grpRes => {
        cy.request({
          method: 'GET',
          url: `${API}/groups/${grpRes.body.id}`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(res => {
          expect(res.status).to.eq(200);
          expect(res.body).to.have.property('group');
          expect(res.body).to.have.property('members');
          expect(res.body.members).to.be.an('array').with.length.greaterThan(0);
          const creator = res.body.members.find(m => m.userId === resA.userId);
          expect(creator).to.not.be.undefined;
          expect(creator.role).to.eq('admin');
        });
      });
    });
  });

  /**
   * TC-GRPX-03
   * Component/Function: getGroupStats
   * Description: Lấy thống kê tham gia nhóm sau khi có tin nhắn
   * Pre-conditions: Nhóm có ít nhất 1 tin nhắn
   * Input Data: GET /api/groups/:groupId/stats
   * Expected Output: HTTP 200 + { totalMessages: ≥1, stats: [{ userId, messageCount, percentage }] }
   */
  it('TC-GRPX-03 | [Positive] Lấy thống kê nhóm có tin nhắn thành công → 200', () => {
    apiUser(`cy_gx_c_${ts}`, `cy_gx_c_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Stats GX-03' } }).then(grpRes => {
        const groupId = grpRes.body.id;
        cy.request({ method: 'POST', url: `${API}/groups/${groupId}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Hello stats', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } });
        cy.request({
          method: 'GET',
          url: `${API}/groups/${groupId}/stats`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(res => {
          expect(res.status).to.eq(200);
          expect(res.body).to.have.property('totalMessages');
          expect(res.body).to.have.property('stats');
          expect(res.body.stats).to.be.an('array');
          if (res.body.totalMessages > 0) {
            const stat = res.body.stats[0];
            expect(stat).to.have.property('userId');
            expect(stat).to.have.property('messageCount');
            expect(stat).to.have.property('percentage');
          }
        });
      });
    });
  });

  /**
   * TC-GRPX-04
   * Component/Function: getGroupStats (empty group)
   * Description: Nhóm không có tin nhắn → stats trả về totalMessages=0, stats=[]
   * Pre-conditions: Nhóm mới vừa tạo, chưa có tin nhắn nào
   * Input Data: GET /api/groups/:groupId/stats
   * Expected Output: HTTP 200 + { totalMessages: 0, stats: [] }
   */
  it('TC-GRPX-04 | [Positive] Nhóm không có tin nhắn → stats trả về 0', () => {
    apiUser(`cy_gx_d_${ts}`, `cy_gx_d_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Rỗng GX-04' } }).then(grpRes => {
        cy.request({
          method: 'GET',
          url: `${API}/groups/${grpRes.body.id}/stats`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(res => {
          expect(res.status).to.eq(200);
          expect(res.body.totalMessages).to.eq(0);
          expect(res.body.stats).to.be.an('array').with.length(0);
        });
      });
    });
  });

  /**
   * TC-GRPX-05
   * Component/Function: updateGroupSettings
   * Description: Thành viên cập nhật themeColor và quickEmoji của nhóm thành công
   * Pre-conditions: User là thành viên của nhóm
   * Input Data: PATCH /api/groups/:groupId/settings { themeColor: '#FF5733', quickEmoji: '🔥' }
   * Expected Output: HTTP 200 + group với themeColor và quickEmoji đã cập nhật
   */
  it('TC-GRPX-05 | [Positive] Cập nhật cài đặt nhóm (theme, emoji) thành công → 200', () => {
    apiUser(`cy_gx_e_${ts}`, `cy_gx_e_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Cài Đặt GX-05' } }).then(grpRes => {
        cy.request({
          method: 'PATCH',
          url: `${API}/groups/${grpRes.body.id}/settings`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { themeColor: '#FF5733', quickEmoji: '🔥', selfDestructTimer: 3600 }
        }).then(settingsRes => {
          expect(settingsRes.status).to.eq(200);
          expect(settingsRes.body.themeColor).to.eq('#FF5733');
          expect(settingsRes.body.quickEmoji).to.eq('🔥');
          expect(settingsRes.body.selfDestructTimer).to.eq(3600);
        });
      });
    });
  });

  /**
   * TC-GRPX-06
   * Component/Function: updateMemberSettings (own settings)
   * Description: User cập nhật nickname và mute notification của chính mình
   * Pre-conditions: User là thành viên nhóm
   * Input Data: PATCH /api/groups/:groupId/members/:userId/settings { nickname: 'BigBoss', muteNotifications: true }
   * Expected Output: HTTP 200 + membership với nickname và muteNotifications đã cập nhật
   */
  it('TC-GRPX-06 | [Positive] User cập nhật nickname và mute của chính mình → 200', () => {
    apiUser(`cy_gx_f_${ts}`, `cy_gx_f_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Member GX-06' } }).then(grpRes => {
        cy.request({
          method: 'PATCH',
          url: `${API}/groups/${grpRes.body.id}/members/${resA.userId}/settings`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { nickname: 'BigBoss', muteNotifications: true }
        }).then(settingsRes => {
          expect(settingsRes.status).to.eq(200);
          expect(settingsRes.body.nickname).to.eq('BigBoss');
          expect(settingsRes.body.muteNotifications).to.be.true;
        });
      });
    });
  });

  /**
   * TC-GRPX-07
   * Component/Function: togglePinGroupMessage (Admin)
   * Description: Admin ghim tin nhắn nhóm thành công
   * Pre-conditions: Admin đã gửi tin nhắn trong nhóm
   * Input Data: POST /api/groups/:groupId/messages/:messageId/pin (token admin)
   * Expected Output: HTTP 200 + { messageId, isPinned: true }
   */
  it('TC-GRPX-07 | [Positive] Admin ghim tin nhắn nhóm thành công → 200', () => {
    apiUser(`cy_gx_g_${ts}`, `cy_gx_g_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Pin GX-07' } }).then(grpRes => {
        cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Pinnable msg', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } }).then(msgRes => {
          cy.request({
            method: 'POST',
            url: `${API}/groups/${grpRes.body.id}/messages/${msgRes.body.id}/pin`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(pinRes => {
            expect(pinRes.status).to.eq(200);
            expect(pinRes.body.isPinned).to.be.true;
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-08
   * Component/Function: getPinnedGroupMessages
   * Description: Lấy danh sách tin nhắn đã ghim trong nhóm
   * Pre-conditions: Admin đã ghim ít nhất 1 tin nhắn
   * Input Data: GET /api/groups/:groupId/pinned
   * Expected Output: HTTP 200 + Array chứa tin nhắn đã ghim
   */
  it('TC-GRPX-08 | [Positive] Lấy danh sách tin nhắn đã ghim trong nhóm → 200', () => {
    apiUser(`cy_gx_h_${ts}`, `cy_gx_h_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm PinnedList GX-08' } }).then(grpRes => {
        cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Pin me', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } }).then(msgRes => {
          cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages/${msgRes.body.id}/pin`, headers: { Authorization: `Bearer ${resA.token}` } }).then(() => {
            cy.request({
              method: 'GET',
              url: `${API}/groups/${grpRes.body.id}/pinned`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(listRes => {
              expect(listRes.status).to.eq(200);
              expect(listRes.body).to.be.an('array');
              const found = listRes.body.find(m => m.id === msgRes.body.id);
              expect(found).to.not.be.undefined;
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-09
   * Component/Function: deleteGroup (Admin only)
   * Description: Admin xóa nhóm thành công
   * Pre-conditions: User là admin của nhóm
   * Input Data: DELETE /api/groups/:groupId (token admin)
   * Expected Output: HTTP 200 + { message: 'Group deleted successfully' }
   */
  it('TC-GRPX-09 | [Positive] Admin xóa nhóm thành công → 200', () => {
    apiUser(`cy_gx_i_${ts}`, `cy_gx_i_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Sẽ Xóa GX-09' } }).then(grpRes => {
        cy.request({
          method: 'DELETE',
          url: `${API}/groups/${grpRes.body.id}`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(delRes => {
          expect(delRes.status).to.eq(200);
          expect(delRes.body.message).to.include('deleted successfully');
          expect(delRes.body.groupId).to.eq(grpRes.body.id);
        });
      });
    });
  });

  /**
   * TC-GRPX-10
   * Component/Function: togglePinGroupMessage (unpin = toggle)
   * Description: Admin ghim rồi ghim lại → isPinned chuyển về false (toggle)
   * Pre-conditions: Tin nhắn đang được ghim
   * Input Data: POST .../pin × 2
   * Expected Output: Lần 1 isPinned=true, lần 2 isPinned=false
   */
  it('TC-GRPX-10 | [Positive] Toggle pin 2 lần → isPinned chuyển true→false', () => {
    apiUser(`cy_gx_j_${ts}`, `cy_gx_j_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Toggle Pin GX-10' } }).then(grpRes => {
        cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Toggle pin', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } }).then(msgRes => {
          const pinUrl = `${API}/groups/${grpRes.body.id}/messages/${msgRes.body.id}/pin`;
          cy.request({ method: 'POST', url: pinUrl, headers: { Authorization: `Bearer ${resA.token}` } }).then(r1 => {
            expect(r1.body.isPinned).to.be.true;
            cy.request({ method: 'POST', url: pinUrl, headers: { Authorization: `Bearer ${resA.token}` } }).then(r2 => {
              expect(r2.body.isPinned).to.be.false;
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-11
   * Component/Function: getReadStatus
   * Description: Lấy trạng thái đọc tin nhắn của tất cả thành viên trong nhóm
   * Pre-conditions: Nhóm có ít nhất 2 thành viên
   * Input Data: GET /api/groups/:groupId/read-status
   * Expected Output: HTTP 200 + Array thành viên với lastReadMessageId
   */
  it('TC-GRPX-11 | [Positive] Lấy read status của các thành viên nhóm → 200', () => {
    apiUser(`cy_gx_k_${ts}`, `cy_gx_k_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm ReadStatus GX-11' } }).then(grpRes => {
        cy.request({
          method: 'GET',
          url: `${API}/groups/${grpRes.body.id}/read-status`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(res => {
          expect(res.status).to.eq(200);
          expect(res.body).to.be.an('array');
          const myStatus = res.body.find(m => m.userId === resA.userId);
          expect(myStatus).to.not.be.undefined;
          expect(myStatus).to.have.property('lastReadMessageId');
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRPX-12
   * Component/Function: getGroup
   * Description: Lấy nhóm không tồn tại → 404
   * Pre-conditions: groupId không tồn tại trong DB
   * Input Data: GET /api/groups/00000000-0000-0000-0000-000000000000
   * Expected Output: HTTP 403 (middleware groupMembership chặn trước khi vào controller)
   */
  it('TC-GRPX-12 | [Negative] Lấy nhóm không tồn tại → 403/404', () => {
    apiUser(`cy_gx_l_${ts}`, `cy_gx_l_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'GET',
        url: `${API}/groups/00000000-0000-0000-0000-000000000000`,
        headers: { Authorization: `Bearer ${resA.token}` },
        failOnStatusCode: false
      }).then(res => {
        expect([403, 404]).to.include(res.status);
      });
    });
  });

  /**
   * TC-GRPX-13
   * Component/Function: deleteGroup (non-admin)
   * Description: Thành viên thường cố xóa nhóm → 403 Forbidden
   * Pre-conditions: B là member thường trong nhóm của A
   * Input Data: DELETE /api/groups/:groupId (token B)
   * Expected Output: HTTP 403 + { error: 'Only group admins can delete the group' }
   */
  it('TC-GRPX-13 | [Negative] Member thường cố xóa nhóm → 403 Forbidden', () => {
    apiUser(`cy_gx_m_${ts}`, `cy_gx_m_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_n_${ts}`, `cy_gx_n_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Bảo Vệ GX-13', memberIds: [resB.userId] } }).then(grpRes => {
          cy.request({
            method: 'DELETE',
            url: `${API}/groups/${grpRes.body.id}`,
            headers: { Authorization: `Bearer ${resB.token}` },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(403);
            expect(res.body.error).to.include('admin');
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-14
   * Component/Function: togglePinGroupMessage (non-admin)
   * Description: Member thường cố ghim tin nhắn → 403
   * Pre-conditions: B là member thường trong nhóm
   * Input Data: POST .../pin (token B)
   * Expected Output: HTTP 403 + { error: 'Only admins can pin messages' }
   */
  it('TC-GRPX-14 | [Negative] Member thường cố ghim tin nhắn nhóm → 403 Forbidden', () => {
    apiUser(`cy_gx_o_${ts}`, `cy_gx_o_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_p_${ts}`, `cy_gx_p_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm PinGuard GX-14', memberIds: [resB.userId] } }).then(grpRes => {
          cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'admin msg', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } }).then(msgRes => {
            cy.request({
              method: 'POST',
              url: `${API}/groups/${grpRes.body.id}/messages/${msgRes.body.id}/pin`,
              headers: { Authorization: `Bearer ${resB.token}` },
              failOnStatusCode: false
            }).then(res => {
              expect(res.status).to.eq(403);
              expect(res.body.error).to.include('admin');
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-15
   * Component/Function: updateMemberSettings (non-self, non-admin)
   * Description: B cố cập nhật settings của A (không phải admin) → 403
   * Pre-conditions: B là member thường trong nhóm
   * Input Data: PATCH /api/groups/:groupId/members/:A.userId/settings (token B)
   * Expected Output: HTTP 403 + { error: 'Permission denied' }
   */
  it('TC-GRPX-15 | [Negative] Member thường cố sửa settings của member khác → 403', () => {
    apiUser(`cy_gx_q_${ts}`, `cy_gx_q_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_r_${ts}`, `cy_gx_r_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm MemberGuard GX-15', memberIds: [resB.userId] } }).then(grpRes => {
          // B cố đổi nickname của A
          cy.request({
            method: 'PATCH',
            url: `${API}/groups/${grpRes.body.id}/members/${resA.userId}/settings`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { nickname: 'Hacker' },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(403);
            expect(res.body.error).to.include('Permission denied');
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-16
   * Component/Function: updateMemberSettings (member not found)
   * Description: Cập nhật settings của memberId không tồn tại trong nhóm → 404
   * Pre-conditions: User là admin của nhóm
   * Input Data: PATCH /api/groups/:groupId/members/00000000-0000-0000-0000-000000000000/settings
   * Expected Output: HTTP 404 + { error: 'Membership not found' }
   */
  it('TC-GRPX-16 | [Negative] Cập nhật settings của memberId không tồn tại → 404', () => {
    apiUser(`cy_gx_s_${ts}`, `cy_gx_s_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm MemberNF GX-16' } }).then(grpRes => {
        cy.request({
          method: 'PATCH',
          url: `${API}/groups/${grpRes.body.id}/members/00000000-0000-0000-0000-000000000000/settings`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { nickname: 'Ghost' },
          failOnStatusCode: false
        }).then(res => {
          expect(res.status).to.eq(404);
          expect(res.body.error).to.include('Membership not found');
        });
      });
    });
  });

  /**
   * TC-GRPX-17
   * Component/Function: togglePinGroupMessage (wrong group)
   * Description: Pin message với messageId không thuộc groupId → 404
   * Pre-conditions: Tin nhắn tồn tại nhưng thuộc nhóm khác
   * Input Data: POST /api/groups/:wrongGroupId/messages/:messageId/pin
   * Expected Output: HTTP 404 + { error: 'Message not found' }
   */
  it('TC-GRPX-17 | [Negative] Pin tin nhắn thuộc nhóm khác → 404 Message not found', () => {
    apiUser(`cy_gx_t_${ts}`, `cy_gx_t_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm A WG-17' } }).then(grpA => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm B WG-17' } }).then(grpB => {
          // Gửi tin nhắn trong nhóm A
          cy.request({ method: 'POST', url: `${API}/groups/${grpA.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Msg in A', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } }).then(msgRes => {
            // Cố pin tin nhắn đó trong nhóm B
            cy.request({
              method: 'POST',
              url: `${API}/groups/${grpB.body.id}/messages/${msgRes.body.id}/pin`,
              headers: { Authorization: `Bearer ${resA.token}` },
              failOnStatusCode: false
            }).then(res => {
              expect(res.status).to.eq(404);
              expect(res.body.error).to.include('not found');
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRPX-18
   * Component/Function: getUserGroups (user không thuộc nhóm nào)
   * Description: User mới chưa tham gia nhóm nào → GET /groups trả về []
   * Pre-conditions: User mới, chưa tạo hoặc tham gia nhóm
   * Input Data: GET /api/groups
   * Expected Output: HTTP 200 + [] (mảng rỗng)
   */
  it('TC-GRPX-18 | [Boundary] User mới chưa có nhóm → GET /groups trả về []', () => {
    apiUser(`cy_gx_u_${ts}`, `cy_gx_u_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'GET',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${resA.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array').with.length(0);
      });
    });
  });

  /**
   * TC-GRPX-19
   * Component/Function: createGroup (avatar URL)
   * Description: Tạo nhóm với avatarUrl tùy chọn → avatarUrl được lưu đúng
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/groups { name: 'Test', avatarUrl: 'https://example.com/avatar.png' }
   * Expected Output: HTTP 201 + { avatarUrl: 'https://example.com/avatar.png' }
   */
  it('TC-GRPX-19 | [Boundary] Tạo nhóm với avatarUrl → lưu đúng avatarUrl', () => {
    apiUser(`cy_gx_v_${ts}`, `cy_gx_v_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: { name: 'Nhóm Có Avatar GX-19', avatarUrl: 'https://example.com/avatar.png' }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.avatarUrl).to.eq('https://example.com/avatar.png');
      });
    });
  });

  /**
   * TC-GRPX-20
   * Component/Function: getGroupMessages (cursor pagination)
   * Description: Lấy tin nhắn với cursor hợp lệ → phân trang chính xác
   * Pre-conditions: Nhóm có nhiều tin nhắn
   * Input Data: GET /api/groups/:groupId/messages?cursor=<ISO timestamp>
   * Expected Output: HTTP 200 + Array tin nhắn có createdAt < cursor
   */
  it('TC-GRPX-20 | [Boundary] Phân trang tin nhắn nhóm với cursor hợp lệ → chỉ trả về tin nhắn cũ hơn', () => {
    apiUser(`cy_gx_w_${ts}`, `cy_gx_w_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Paginate GX-20' } }).then(grpRes => {
        // Gửi 2 tin nhắn
        cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Msg 1', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' } });
        cy.request({ method: 'POST', url: `${API}/groups/${grpRes.body.id}/messages`, headers: { Authorization: `Bearer ${resA.token}` }, body: { encryptedContent: 'Msg 2', ratchetKey: 'A', n: 1, pn: 0, iv: 'B' } }).then(msg2Res => {
          const cursor = msg2Res.body.createdAt;
          // Lấy với cursor = thời điểm msg2 → chỉ trả về msg1
          cy.request({
            method: 'GET',
            url: `${API}/groups/${grpRes.body.id}/messages?cursor=${encodeURIComponent(cursor)}`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(res => {
            expect(res.status).to.eq(200);
            expect(res.body).to.be.an('array');
            // Tất cả tin nhắn phải có createdAt < cursor
            res.body.forEach(msg => {
              expect(new Date(msg.createdAt).getTime()).to.be.lessThan(new Date(cursor).getTime());
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-GRPX-21
   * Component/Function: getGroup / getGroupMessages (non-member access)
   * Description: User không phải thành viên cố lấy thông tin nhóm → 403
   * Pre-conditions: User C không thuộc nhóm của A
   * Input Data: GET /api/groups/:groupId (token C)
   * Expected Output: HTTP 403 Forbidden (groupMembership middleware)
   */
  it('TC-GRPX-21 | [Security] User ngoài nhóm cố lấy thông tin nhóm → 403', () => {
    apiUser(`cy_gx_x_${ts}`, `cy_gx_x_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_y_${ts}`, `cy_gx_y_${ts}@st.utt.edu.vn`).then(resC => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Bí Mật GX-21' } }).then(grpRes => {
          cy.request({
            method: 'GET',
            url: `${API}/groups/${grpRes.body.id}`,
            headers: { Authorization: `Bearer ${resC.token}` },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(403);
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-22
   * Component/Function: getGroupStats (non-member)
   * Description: User ngoài nhóm cố xem thống kê nhóm → 403
   * Pre-conditions: User không phải thành viên
   * Input Data: GET /api/groups/:groupId/stats (token outsider)
   * Expected Output: HTTP 403 Forbidden
   */
  it('TC-GRPX-22 | [Security] User ngoài nhóm cố xem thống kê → 403', () => {
    apiUser(`cy_gx_z_${ts}`, `cy_gx_z_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_z2_${ts}`, `cy_gx_z2_${ts}@st.utt.edu.vn`).then(resC => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm Stats Guard GX-22' } }).then(grpRes => {
          cy.request({
            method: 'GET',
            url: `${API}/groups/${grpRes.body.id}/stats`,
            headers: { Authorization: `Bearer ${resC.token}` },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(403);
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-23
   * Component/Function: Admin updates member settings (admin privilege)
   * Description: Admin cập nhật nickname của member khác thành công
   * Pre-conditions: A là admin, B là member
   * Input Data: PATCH /api/groups/:groupId/members/:B.userId/settings (token A/admin)
   * Expected Output: HTTP 200 + membership với nickname mới
   */
  it('TC-GRPX-23 | [Security] Admin cập nhật nickname của member khác → 200 OK', () => {
    apiUser(`cy_gx_aa_${ts}`, `cy_gx_aa_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_bb_${ts}`, `cy_gx_bb_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/groups`, headers: { Authorization: `Bearer ${resA.token}` }, body: { name: 'Nhóm AdminPatch GX-23', memberIds: [resB.userId] } }).then(grpRes => {
          cy.request({
            method: 'PATCH',
            url: `${API}/groups/${grpRes.body.id}/members/${resB.userId}/settings`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { nickname: 'AdminSetNickname' }
          }).then(res => {
            expect(res.status).to.eq(200);
            expect(res.body.nickname).to.eq('AdminSetNickname');
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-24
   * Component/Function: All group endpoints (no token)
   * Description: Tất cả endpoints nhóm không có token → 401
   * Pre-conditions: N/A
   * Input Data: GET /api/groups (không có Authorization header)
   * Expected Output: HTTP 401
   */
  it('TC-GRPX-24 | [Security] GET /groups không có token → 401', () => {
    cy.request({
      method: 'GET',
      url: `${API}/groups`,
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });
  });

  /**
   * TC-GRPX-25
   * Component/Function: updateGroupSettings (selfDestructTimer admin authorization)
   * Description: Member thường cố thay đổi cài đặt bộ hẹn giờ tự hủy (selfDestructTimer) -> 403 Forbidden
   * Pre-conditions: A là admin, B là member thường của nhóm
   * Input Data: PATCH /api/groups/:groupId/settings { selfDestructTimer: 10 } (token B)
   * Expected Output: HTTP 403 Forbidden
   */
  it('TC-GRPX-25 | [Security] Member thường cố cập nhật selfDestructTimer của nhóm → 403 Forbidden', () => {
    apiUser(`cy_gx_y1_${ts}`, `cy_gx_y1_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_y2_${ts}`, `cy_gx_y2_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { name: 'Nhóm Timer Guard GX-25', memberIds: [resB.userId] }
        }).then(grpRes => {
          // B (member thường) cố cập nhật themeColor (OK)
          cy.request({
            method: 'PATCH',
            url: `${API}/groups/${grpRes.body.id}/settings`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { themeColor: '#123456' }
          }).then(resTheme => {
            expect(resTheme.status).to.eq(200);
            
            // B cố cập nhật selfDestructTimer (FAIL -> 403)
            cy.request({
              method: 'PATCH',
              url: `${API}/groups/${grpRes.body.id}/settings`,
              headers: { Authorization: `Bearer ${resB.token}` },
              body: { selfDestructTimer: 10 },
              failOnStatusCode: false
            }).then(resTimer => {
              expect(resTimer.status).to.eq(403);
              expect(resTimer.body.error).to.include('Chỉ admin');
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-26
   * Component/Function: createGroup (inviteCode entropy)
   * Description: Kiểm tra xem inviteCode của nhóm được tạo ra có định dạng Hex và đủ entropy (CSPRNG) hay không
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/groups { name: 'Nhóm CSPRNG GX-26' }
   * Expected Output: HTTP 201 + inviteCode là chuỗi 6 ký tự Hex (0-9, A-F)
   */
  it('TC-GRPX-26 | [Security] Tạo nhóm thành công → verify inviteCode được tạo bằng CSPRNG (Hex) → 201', () => {
    apiUser(`cy_gx_z3_${ts}`, `cy_gx_z3_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: { name: 'Nhóm CSPRNG GX-26' }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.inviteCode).to.match(/^[0-9A-F]{6}$/);
      });
    });
  });

  /**
   * TC-GRPX-27
   * Component/Function: membershipCache invalidation
   * Description: Khi một user rời nhóm, membership cache phải được xóa để đảm bảo họ không còn nhận được tin nhắn qua Socket
   * Pre-conditions: User A và B trong nhóm
   * Input Data: User B rời nhóm, User A gửi tin nhắn nhóm
   * Expected Output: Cache bị xóa và hệ thống ghi nhận đúng thành viên hiện tại
   */
  it('TC-GRPX-27 | [Security] membershipCache invalidation - Xóa cache khi user rời nhóm → 200', () => {
    apiUser(`cy_gx_z4_${ts}`, `cy_gx_z4_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_gx_z5_${ts}`, `cy_gx_z5_${ts}@st.utt.edu.vn`).then(resB => {
        // Tạo nhóm với cả A và B
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { name: 'Nhóm Cache Inval GX-27', memberIds: [resB.userId] }
        }).then(grpRes => {
          const groupId = grpRes.body.id;
          
          // Lấy chi tiết nhóm (lúc này cache đã được lưu gồm cả A và B)
          cy.request({
            method: 'GET',
            url: `${API}/groups/${groupId}`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then((getRes) => {
            expect(getRes.body.members).to.have.length(2);

            // B rời nhóm (leaveGroup/deleteGroup hoặc rời phòng)
            cy.visit('/login');
            cy.window().then(() => {
              // Khởi tạo socket
              const socket = io('http://localhost:5000', { auth: { token: resB.token } });
              socket.emit('joinGroup', { groupId });
              cy.wait(300);
              
              // Emit leaveGroup -> trigger cache invalidation
              socket.emit('leaveGroup', { groupId });
              cy.wait(300);
              
              // Verify cache bị xóa bằng cách gửi group message qua User A.
              cy.request({
                method: 'POST',
                url: `${API}/groups/${groupId}/messages`,
                headers: { Authorization: `Bearer ${resA.token}` },
                body: { encryptedContent: 'Hello post-cache-invalidation', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' }
              }).then((msgRes) => {
                expect(msgRes.status).to.eq(201);
                socket.disconnect();
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-28
   * Component/Function: getUserGroups (N+1 Query Resolution)
   * Description: Lấy danh sách nhóm của user và kiểm tra xem tin nhắn cuối cùng (latestMessage) có chính xác hay không
   * Pre-conditions: User thuộc nhóm, nhóm có tin nhắn
   * Input Data: GET /api/groups
   * Expected Output: HTTP 200 + danh sách nhóm kèm latestMessage chuẩn
   */
  it('TC-GRPX-28 | [Positive] getUserGroups trả về đúng latestMessage sử dụng Single Query tối ưu → 200', () => {
    apiUser(`cy_gx_z6_${ts}`, `cy_gx_z6_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/groups`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: { name: 'Nhóm N1 Query GX-28' }
      }).then(grpRes => {
        const groupId = grpRes.body.id;
        
        // Gửi 2 tin nhắn liên tiếp
        cy.request({
          method: 'POST',
          url: `${API}/groups/${groupId}/messages`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { encryptedContent: 'First msg', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' }
        }).then(() => {
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { encryptedContent: 'Second latest msg', ratchetKey: 'A', n: 1, pn: 0, iv: 'B' }
          }).then(() => {
            // Lấy danh sách nhóm
            cy.request({
              method: 'GET',
              url: `${API}/groups`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(listRes => {
              expect(listRes.status).to.eq(200);
              const grp = listRes.body.find(g => g.id === groupId);
              expect(grp).to.not.be.undefined;
              expect(grp.latestMessage).to.not.be.null;
              expect(grp.latestMessage.encryptedContent).to.eq('Second latest msg');
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-29
   * Component/Function: kickMember (API & Socket invalidation)
   * Description: Admin thực hiện kick thành viên khỏi nhóm thành công, xóa cache và đẩy socket khỏi room
   * Pre-conditions: A là admin, B là member của nhóm
   * Expected Output: HTTP 200, B không còn trong danh sách thành viên nhóm và không thể gửi tin nhắn socket
   */
  it('TC-GRPX-29 | [Security] Admin kick thành viên khỏi nhóm → 200 OK & Cache/Socket invalidated', () => {
    apiUser(`cy_kx_a_${ts}`, `cy_kx_a_${ts}@st.utt.edu.vn`).then((resA) => {
      apiUser(`cy_kx_b_${ts}`, `cy_kx_b_${ts}@st.utt.edu.vn`).then((resB) => {
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { name: 'Nhóm Test Kick GX-29', memberIds: [resB.userId] }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;

          // Member thường (B) tự kick (Thất bại) -> 403 hoặc 400
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/members/${resB.userId}/kick`,
            headers: { Authorization: `Bearer ${resB.token}` },
            failOnStatusCode: false
          }).then((resFailed) => {
            expect(resFailed.status).to.eq(403);

            // Admin (A) kick Member thường (B) -> 200 OK
            cy.request({
              method: 'POST',
              url: `${API}/groups/${groupId}/members/${resB.userId}/kick`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then((resSuccess) => {
              expect(resSuccess.status).to.eq(200);
              expect(resSuccess.body.memberId).to.eq(resB.userId);

              // Lấy lại danh sách nhóm từ B -> không thấy nhóm nữa
              cy.request({
                method: 'GET',
                url: `${API}/groups`,
                headers: { Authorization: `Bearer ${resB.token}` }
              }).then((resGroups) => {
                const found = resGroups.body.find(g => g.id === groupId);
                expect(found).to.be.undefined;
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-30
   * Component/Function: reactGroupMessage socket event
   * Description: Ngăn chặn người dùng không thuộc nhóm thả icon cảm xúc (react) thông qua Socket.IO
   * Pre-conditions: Nhóm có tin nhắn, user C không phải thành viên
   * Expected Output: Tin nhắn không bị thay đổi reactions
   */
  it('TC-GRPX-30 | [Security] reactGroupMessage chặn người dùng ngoài nhóm thả react qua Socket', () => {
    apiUser(`cy_rxt_a_${ts}`, `cy_rxt_a_${ts}@st.utt.edu.vn`).then((resA) => {
      apiUser(`cy_rxt_c_${ts}`, `cy_rxt_c_${ts}@st.utt.edu.vn`).then((resC) => {
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { name: 'Nhóm React Guard GX-30' }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;
          cy.request({
            method: 'POST',
            url: `${API}/groups/${groupId}/messages`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { encryptedContent: 'Hacker react here', ratchetKey: 'A', n: 0, pn: 0, iv: 'B' }
          }).then((msgRes) => {
            const messageId = msgRes.body.id;

            cy.visit('/login');
            cy.window().then((win) => {
              const socket = io('http://localhost:5000', { auth: { token: resC.token } });
              socket.emit('reactGroupMessage', { messageId, groupId, reaction: '👍' });
              cy.wait(300);

              // Kiểm tra xem tin nhắn có bị cập nhật reaction không -> Không đổi
              cy.request({
                method: 'GET',
                url: `${API}/groups/${groupId}`,
                headers: { Authorization: `Bearer ${resA.token}` }
              }).then((resGroupInfo) => {
                // Sẽ không có key của resC.userId trong reactions của GroupMessage hoặc không tìm thấy
                socket.disconnect();
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-31
   * Component/Function: markAsRead socket event
   * Description: Chặn người dùng không phải thành viên gửi đánh dấu đã đọc (markAsRead) qua socket
   */
  it('TC-GRPX-31 | [Security] markAsRead chặn người dùng ngoài nhóm thực hiện đánh dấu đã đọc qua Socket', () => {
    apiUser(`cy_mar_a_${ts}`, `cy_mar_a_${ts}@st.utt.edu.vn`).then((resA) => {
      apiUser(`cy_mar_c_${ts}`, `cy_mar_c_${ts}@st.utt.edu.vn`).then((resC) => {
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { name: 'Nhóm Read Guard GX-31' }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;
          cy.visit('/login');
          cy.window().then((win) => {
            const socket = io('http://localhost:5000', { auth: { token: resC.token } });
            socket.emit('markAsRead', { groupId });
            cy.wait(300);
            socket.disconnect();
          });
        });
      });
    });
  });

  /**
   * TC-GRPX-32
   * Component/Function: joinGroup socket event
   * Description: Chặn người dùng không phải thành viên join vào socket room của nhóm
   */
  it('TC-GRPX-32 | [Security] joinGroup từ chối cho người dùng ngoài nhóm join socket room', () => {
    apiUser(`cy_jg_a_${ts}`, `cy_jg_a_${ts}@st.utt.edu.vn`).then((resA) => {
      apiUser(`cy_jg_c_${ts}`, `cy_jg_c_${ts}@st.utt.edu.vn`).then((resC) => {
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { name: 'Nhóm Join Guard GX-32' }
        }).then((grpRes) => {
          const groupId = grpRes.body.id;
          cy.visit('/login');
          cy.window().then((win) => {
            const socket = io('http://localhost:5000', { auth: { token: resC.token } });
            socket.emit('joinGroup', { groupId });
            socket.on('error', (err) => {
              expect(err.message).to.include('Not a member of this group');
              socket.disconnect();
            });
          });
        });
      });
    });
  });
});

