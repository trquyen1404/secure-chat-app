/**
 * MODULE: Academic & SuperApp Utilities
 * Controllers: academicController.js (V1 to V4), superAppController.js, notificationController.js
 * Routes covered:
 *   /api/academic/*
 *   /api/super-app/*
 *   /api/notifications/*
 */

const API = 'http://localhost:5000/api';

describe('[Module: Academic & SuperApp] Tính năng học tập & Siêu ứng dụng tiện ích', () => {
  const ts = Date.now();
  let teacher, student;
  let groupId, inviteCode;

  before(() => {
    // Đăng ký giáo viên & học sinh
    cy.task('createUserAndGetToken', { 
      username: `tea_acad_${ts}`, 
      email: `tea_acad_${ts}@utt.edu.vn`,
      role: 'teacher' 
    }).then(tRes => {
      teacher = tRes;

      cy.task('createUserAndGetToken', { 
        username: `stu_acad_${ts}`, 
        email: `stu_acad_${ts}@st.utt.edu.vn`,
        role: 'student' 
      }).then(sRes => {
        student = sRes;

        // Tạo nhóm học tập chung
        cy.request({
          method: 'POST',
          url: `${API}/groups`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: { name: `Lớp Học Học Thuật ${ts}`, description: 'Mô tả lớp học' }
        }).then(groupRes => {
          groupId = groupRes.body.id;
          inviteCode = groupRes.body.inviteCode;

          // Học sinh vào nhóm
          cy.request({
            method: 'POST',
            url: `${API}/groups/join`,
            headers: { Authorization: `Bearer ${student.token}` },
            body: { inviteCode }
          });
        });
      });
    });
  });

  // =========================================================================
  // 1. ACADEMIC V1: ANNOUNCEMENTS, NOTES, STUDY PARTNERS, GRADES
  // =========================================================================
  describe('Tính năng Học thuật V1', () => {
    it('TC-ACAD-ANN-01 | [Positive] Tạo và lấy thông báo lớp học (Announcements)', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/announcements`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: {
          groupId,
          title: 'Lịch thi kết thúc học phần',
          content: 'Lịch thi sẽ diễn ra vào tuần sau tại phòng thi A1.',
          isUrgent: true
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.title).to.eq('Lịch thi kết thúc học phần');

        cy.request({
          method: 'GET',
          url: `${API}/academic/announcements/${groupId}`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].title).to.eq('Lịch thi kết thúc học phần');
        });
      });
    });

    it('TC-ACAD-NTE-01 | [Positive] Tạo, cập nhật và lấy ghi chú nhóm (Notes)', () => {
      // Tạo mới note
      cy.request({
        method: 'POST',
        url: `${API}/academic/notes`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          groupId,
          title: 'Đề cương ôn tập Chương 1',
          content: 'Nội dung ôn tập gồm 3 phần chính...'
        }
      }).then(res => {
        expect(res.status).to.eq(200);
        const noteId = res.body.id;

        // Cập nhật note
        cy.request({
          method: 'POST',
          url: `${API}/academic/notes`,
          headers: { Authorization: `Bearer ${teacher.token}` },
          body: {
            id: noteId,
            groupId,
            title: 'Đề cương ôn tập Chương 1 (Đã chỉnh sửa)',
            content: 'Nội dung ôn tập cập nhật mới nhất từ giáo viên...'
          }
        }).then(updateRes => {
          expect(updateRes.status).to.eq(200);
          expect(updateRes.body.title).to.include('Đã chỉnh sửa');

          // Lấy tất cả notes của nhóm
          cy.request({
            method: 'GET',
            url: `${API}/academic/notes/${groupId}`,
            headers: { Authorization: `Bearer ${student.token}` }
          }).then(getRes => {
            expect(getRes.status).to.eq(200);
            expect(getRes.body.some(n => n.id === noteId)).to.be.true;
          });
        });
      });
    });

    it('TC-ACAD-STD-01 | [Positive] Đăng tuyển và lấy bài đăng tìm bạn học (Study Partners)', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/study-posts`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          subject: 'Lập trình Web nâng cao',
          description: 'Cần tìm 1 bạn nam/nữ ôn thi kết thúc học phần chung vào các buổi tối.'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.subject).to.eq('Lập trình Web nâng cao');

        cy.request({
          method: 'GET',
          url: `${API}/academic/study-posts`,
          headers: { Authorization: `Bearer ${teacher.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].subject).to.eq('Lập trình Web nâng cao');
        });
      });
    });

    it('TC-ACAD-GRD-01 | [Positive] Giáo viên thêm điểm và học sinh xem điểm của mình (Grades)', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/grades`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: {
          groupId,
          userId: student.userId,
          title: 'Điểm kiểm tra giữa kỳ',
          score: 8.5,
          weight: 0.3
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.score).to.eq(8.5);

        cy.request({
          method: 'GET',
          url: `${API}/academic/grades/${groupId}`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].title).to.eq('Điểm kiểm tra giữa kỳ');
        });
      });
    });
  });

  // =========================================================================
  // 2. ACADEMIC V2: FLASHCARDS, EXAMS, GAMIFICATION
  // =========================================================================
  describe('Tính năng Học thuật V2', () => {
    it('TC-ACAD-FC-01 | [Positive] Tạo bộ thẻ ghi nhớ (Flashcard Set) kèm danh sách thẻ thành công', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/flashcards`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          groupId,
          title: 'Từ vựng Tiếng Anh chuyên ngành CNTT',
          description: 'Học từ vựng cơ bản về mạng máy tính',
          cards: [
            { front: 'Protocol', back: 'Giao thức truyền thông tin' },
            { front: 'Bandwidth', back: 'Băng thông mạng' }
          ]
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.title).to.eq('Từ vựng Tiếng Anh chuyên ngành CNTT');

        cy.request({
          method: 'GET',
          url: `${API}/academic/flashcards/${groupId}`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].Cards).to.have.lengthOf(2);
        });
      });
    });

    it('TC-ACAD-EXM-01 | [Positive] Tạo kỳ thi thử (Exams) kèm câu hỏi trắc nghiệm thành công', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/exams`,
        headers: { Authorization: `Bearer ${teacher.token}` },
        body: {
          groupId,
          title: 'Kiểm tra trắc nghiệm thử nghiệm',
          durationMinutes: 15,
          questions: [
            { text: 'HTTP viết tắt của từ gì?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
            { text: 'Cơ sở dữ liệu quan hệ dùng ngôn ngữ gì?', options: ['SQL', 'NoSQL', 'HTML', 'CSS'], correctOptionIndex: 0 }
          ]
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.title).to.eq('Kiểm tra trắc nghiệm thử nghiệm');

        cy.request({
          method: 'GET',
          url: `${API}/academic/exams/${groupId}`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].Questions).to.have.lengthOf(2);
        });
      });
    });

    it('TC-ACAD-GM-01 | [Positive] Xem bảng xếp hạng điểm tích lũy (Leaderboard)', () => {
      cy.request({
        method: 'GET',
        url: `${API}/academic/leaderboard`,
        headers: { Authorization: `Bearer ${student.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.length.of.at.least(1);
        expect(res.body[0]).to.have.property('points');
      });
    });
  });

  // =========================================================================
  // 3. ACADEMIC V3 & V4: MARKETPLACE, CONFESSIONS, LOST & FOUND, JOBS, CLUBS
  // =========================================================================
  describe('Tính năng Học thuật V3 & V4', () => {
    it('TC-ACAD-MKT-01 | [Positive] Đăng tin mua bán giáo trình (Marketplace)', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/marketplace`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          title: 'Sách cấu trúc dữ liệu và giải thuật',
          price: 50000,
          type: 'sell',
          subject: 'Cấu trúc dữ liệu',
          imageUrl: 'http://example.com/book.jpg'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.title).to.eq('Sách cấu trúc dữ liệu và giải thuật');

        cy.request({
          method: 'GET',
          url: `${API}/academic/marketplace`,
          headers: { Authorization: `Bearer ${teacher.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].title).to.eq('Sách cấu trúc dữ liệu và giải thuật');
        });
      });
    });

    it('TC-ACAD-CF-01 | [Positive] Đăng confession ẩn danh và lấy danh sách', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/confessions`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          groupId,
          content: 'Ước gì được điểm A môn Lập trình mạng...'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.content).to.eq('Ước gì được điểm A môn Lập trình mạng...');

        cy.request({
          method: 'GET',
          url: `${API}/academic/confessions/${groupId}`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].content).to.eq('Ước gì được điểm A môn Lập trình mạng...');
        });
      });
    });

    it('TC-ACAD-LF-01 | [Positive] Báo mất đồ/nhặt được đồ (Lost & Found)', () => {
      cy.request({
        method: 'POST',
        url: `${API}/academic/lost-found`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          title: 'Mất chìa khóa xe máy',
          description: 'Rơi chìa khóa xe Honda màu xanh ở khu vực Canteen.',
          type: 'lost',
          location: 'Canteen'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.title).to.eq('Mất chìa khóa xe máy');

        cy.request({
          method: 'GET',
          url: `${API}/academic/lost-found`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
          expect(getRes.body[0].title).to.eq('Mất chìa khóa xe máy');
        });
      });
    });

    it('TC-ACAD-JB-01 | [Positive] Lấy danh sách tuyển dụng và CLB sinh viên', () => {
      cy.request({
        method: 'GET',
        url: `${API}/academic/jobs`,
        headers: { Authorization: `Bearer ${student.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
      });

      cy.request({
        method: 'GET',
        url: `${API}/academic/clubs`,
        headers: { Authorization: `Bearer ${student.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
      });
    });
  });

  // =========================================================================
  // 4. PUSH NOTIFICATION SUBSCRIPTIONS
  // =========================================================================
  describe('Push Notifications', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/fake-endpoint-id-123456';
    
    it('TC-NOTIF-SUB-01 | [Positive] Subscribe thông báo đẩy thành công', () => {
      cy.request({
        method: 'POST',
        url: `${API}/notifications/subscribe`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          subscription: {
            endpoint,
            keys: { p256dh: 'keys_p256dh', auth: 'keys_auth' }
          },
          deviceInfo: 'Cypress Chrome headless'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.message).to.eq('Subscribed successfully');
      });
    });

    it('TC-NOTIF-SUB-02 | [Negative] Subscribe thiếu thông tin subscription → 400', () => {
      cy.request({
        method: 'POST',
        url: `${API}/notifications/subscribe`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: { subscription: {}, deviceInfo: 'Cypress' },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(400);
      });
    });

    it('TC-NOTIF-UNSUB-01 | [Positive] Unsubscribe thông báo đẩy thành công', () => {
      cy.request({
        method: 'POST',
        url: `${API}/notifications/unsubscribe`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: { endpoint }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.message).to.eq('Unsubscribed successfully');
      });
    });
  });

  // =========================================================================
  // 5. SUPERAPP ENDPOINTS
  // =========================================================================
  describe('SuperApp Modules', () => {
    it('TC-SUP-TUT-01 | [Positive] Đăng ký làm gia sư và xem danh sách', () => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/tutors`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          subject: 'Toán cao cấp 1',
          ratePerHour: 100000,
          description: 'Hỗ trợ ôn tập toán cao cấp cho sinh viên năm nhất.'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.subject).to.eq('Toán cao cấp 1');

        cy.request({
          method: 'GET',
          url: `${API}/super-app/tutors`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
        });
      });
    });

    it('TC-SUP-REV-01 | [Positive] Tạo bài đánh giá môn học và lấy danh sách', () => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/reviews`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          courseName: 'Cơ sở dữ liệu',
          rating: 5,
          comment: 'Môn học thú vị, giảng viên dạy rất nhiệt tình.'
        }
      }).then(res => {
        expect(res.status).to.eq(201);
        expect(res.body.courseName).to.eq('Cơ sở dữ liệu');

        cy.request({
          method: 'GET',
          url: `${API}/super-app/reviews`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
        });
      });
    });

    it('TC-SUP-CNT-01 | [Positive] Đặt món ăn canteen và xem lịch sử', () => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/canteen`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          items: [{ name: 'Cơm rang dưa bò', quantity: 1, price: 35000 }],
          totalPrice: 35000
        }
      }).then(res => {
        expect(res.status).to.eq(201);

        cy.request({
          method: 'GET',
          url: `${API}/super-app/canteen`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
        });
      });
    });

    it('TC-SUP-LIB-01 | [Positive] Đặt phòng học thư viện và xem danh sách', () => {
      const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      cy.request({
        method: 'POST',
        url: `${API}/super-app/library`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          seatNumber: 'SEAT_42',
          startTime,
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        }
      }).then(res => {
        expect(res.status).to.eq(201);

        cy.request({
          method: 'GET',
          url: `${API}/super-app/library`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
        });
      });
    });

    it('TC-SUP-EXP-01 | [Positive] Thêm chi tiêu cá nhân và lấy danh sách', () => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/expenses`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          title: 'Ăn trưa',
          amount: 50000,
          category: 'Food'
        }
      }).then(res => {
        expect(res.status).to.eq(201);

        cy.request({
          method: 'GET',
          url: `${API}/super-app/expenses`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
        });
      });
    });

    it('TC-SUP-DRY-01 | [Positive] Viết nhật ký cá nhân và lấy danh sách', () => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/diary`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: {
          title: 'Ngày thi đầu tiên',
          content: 'Làm bài khá ổn, tự tin được 8+.'
        }
      }).then(res => {
        expect(res.status).to.eq(201);

        cy.request({
          method: 'GET',
          url: `${API}/super-app/diary`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.have.length.of.at.least(1);
        });
      });
    });

    it('TC-SUP-ELC-01 | [Positive] Lấy danh sách bầu cử (Elections) thành công', () => {
      cy.request({
        method: 'GET',
        url: `${API}/super-app/elections`,
        headers: { Authorization: `Bearer ${student.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
      });
    });

    it('TC-SUP-ELC-02 | [Negative] Bỏ phiếu bầu cử với id không tồn tại hoặc đã vote → 400', () => {
      cy.request({
        method: 'POST',
        url: `${API}/super-app/elections/vote`,
        headers: { Authorization: `Bearer ${student.token}` },
        body: { id: '00000000-0000-0000-0000-000000000000', candidateId: 1 },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(400);
        expect(res.body.message).to.eq('Already voted');
      });
    });

    it('TC-SUP-GEN-01 | [Positive] Lấy các tiện ích còn lại trả về status 200', () => {
      const endpoints = [
        'gym', 'tuition', 'green-points', 'blood-donations', 
        'resume', 'internship', 'group-buys', 'vault', 
        'secret-santa', 'wallet', 'accommodations', 'meals', 'campaigns'
      ];
      
      endpoints.forEach(ep => {
        cy.request({
          method: 'GET',
          url: `${API}/super-app/${ep}`,
          headers: { Authorization: `Bearer ${student.token}` }
        }).then(res => {
          expect(res.status).to.eq(200);
        });
      });
    });
  });
});
