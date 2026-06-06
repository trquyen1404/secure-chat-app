import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    supportFile: "cypress/support/e2e.js",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    setupNodeEvents(on, config) {
      // Load environment variables from server/.env
      const fs = require("fs");
      const path = require("path");
      try {
        const envPath = path.resolve(config.projectRoot, "../server/.env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          envContent.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#")) {
              const parts = trimmed.split("=");
              if (parts.length >= 2) {
                const key = parts[0].trim();
                let val = parts.slice(1).join("=").trim();
                // strip quotes if any
                if (
                  (val.startsWith('"') && val.endsWith('"')) ||
                  (val.startsWith("'") && val.endsWith("'"))
                ) {
                  val = val.substring(1, val.length - 1);
                }
                process.env[key] = val;
              }
            }
          });
        }
      } catch (err) {
        console.error("Failed to load environment variables from server/.env:", err);
      }

      on("task", {
        log(message) {
          console.log("[BROWSER-LOG]", message);
          return null;
        },
        async setUserOnline({ username, online }) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.update({ online: ${online} }, { where: { username: '${username}' } })
              .then(() => { console.log('ok'); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            console.error("setUserOnline failed:", err);
            return false;
          }
        },
        async resetZombieUsers() {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.update({ online: false }, { where: { online: true } })
              .then(() => { console.log('ok'); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            console.error("resetZombieUsers failed:", err);
            return false;
          }
        },
        async createManyExpiredMessages({ count, groupId, senderId }) {
          const { execSync } = require("child_process");
          const script = `
            const { GroupMessage } = require('./models');
            (async () => {
              try {
                const arr = [];
                const expiredDate = new Date(Date.now() - 10000);
                for (let i = 0; i < ${count}; i++) {
                  arr.push({
                    groupId: '${groupId}',
                    senderId: '${senderId}',
                    encryptedContent: 'Expired ' + i,
                    n: 1000 + i,
                    expiresAt: expiredDate,
                    type: 'text'
                  });
                }
                await GroupMessage.bulkCreate(arr);
                console.log('created');
                process.exit(0);
              } catch (e) {
                console.error(e.message);
                process.exit(1);
              }
            })();
          `;
          try {
            execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            console.error("createManyExpiredMessages failed:", err);
            return false;
          }
        },
        async getExpiredGroupMessagesCount(groupId) {
          const { execSync } = require("child_process");
          const script = `
            const { GroupMessage } = require('./models');
            const { Op } = require('sequelize');
            GroupMessage.count({ where: { groupId: '${groupId}', expiresAt: { [Op.lte]: new Date() } } })
              .then(c => { console.log(c); process.exit(0); })
              .catch(() => process.exit(1));
          `;
          try {
            const res = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server", encoding: 'utf-8' });
            const lines = res.split('\n').map(l => l.trim());
            const numLine = lines.find(l => /^\d+$/.test(l));
            return numLine ? parseInt(numLine) : 0;
          } catch (err) {
            return 0;
          }
        },
        async triggerCleanupMessages() {
          const { execSync } = require("child_process");
          const script = `
            const { GroupMessage } = require('./models');
            const { Op } = require('sequelize');
            (async () => {
              const now = new Date();
              const expiredGroups = await GroupMessage.findAll({
                where: { expiresAt: { [Op.lte]: now } },
                attributes: ['id'],
                limit: 500
              });
              const expiredGroupIds = expiredGroups.map(m => m.id);
              if (expiredGroupIds.length > 0) {
                await GroupMessage.destroy({ where: { id: { [Op.in]: expiredGroupIds } } });
              }
              console.log(expiredGroupIds.length);
              process.exit(0);
            })();
          `;
          try {
            const res = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server", encoding: 'utf-8' });
            const lines = res.split('\n').map(l => l.trim());
            const numLine = lines.find(l => /^\d+$/.test(l));
            return numLine ? parseInt(numLine) : 0;
          } catch (err) {
            return 0;
          }
        },
        async createElection({ title, candidates }) {
          const { execSync } = require("child_process");
          const candidatesEscaped = JSON.stringify(candidates).replace(/"/g, '\\"');
          const script = `
            const { Election } = require('./models');
            (async () => {
              try {
                const elec = await Election.create({
                  title: '${title}',
                  candidates: JSON.parse('${candidatesEscaped}'),
                  voterIds: []
                });
                console.log(JSON.stringify(elec.toJSON()));
                process.exit(0);
              } catch (e) {
                console.error(e.message);
                process.exit(1);
              }
            })();
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
              env: { ...process.env },
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{'));
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[createElection] Error:", err.message);
            return null;
          }
        },
        // ─── Task 1: Xác thực user trong DB (isVerified = true) ───────────────
        verifyUser(username) {
          try {
            const { execSync } = require("child_process");
            execSync(
              `node -e "const { User } = require('./models'); User.update({ isVerified: true }, { where: { username: '${username}' } }).then(() => process.exit(0)).catch(() => process.exit(1));"`,
              { cwd: "../server" }
            );
            return true;
          } catch (err) {
            console.error("Failed to verify user in DB:", err);
            return false;
          }
        },

        // ─── Task 2: Đăng ký user mới + lấy JWT token (không qua UI) ─────────
        // Trả về: { token: string, userId: string }
        async createUserAndGetToken({ username, email, password = "Cypress12345", isVerified = true, role = null, publicKey = null }) {
          const { execSync } = require("child_process");
          // Determine role: explicit parameter overrides email-based detection
          const resolvedRole = role || ("'${email}'".includes('@st.') ? 'student' : 'teacher');
          const script = `
            const { User, PreKey } = require('./models');
            const bcrypt = require('bcryptjs');
            const jwt = require('jsonwebtoken');
            (async () => {
              try {
                let user = await User.findOne({ where: { username: '${username}' } });
                if (!user) {
                  const hashed = await bcrypt.hash('${password}', 10);
                  const roleVal = '${role || ''}' !== '' ? '${role}' : ('${email}'.includes('@st.') ? 'student' : 'teacher');
                  user = await User.create({
                    username: '${username}',
                    email: '${email}',
                    password: hashed,
                    role: roleVal,
                    publicKey: '${publicKey || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}',
                    dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                    isVerified: ${isVerified},
                    verificationToken: '123456',
                    verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
                  });
                  await PreKey.create({
                    userId: user.id,
                    keyId: 1,
                    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                    signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
                    type: 'signed',
                  });
                }
                const token = jwt.sign(
                  { userId: user.id, role: user.role, tokenVersion: user.tokenVersion },
                  process.env.JWT_SECRET,
                  { expiresIn: '15m' }
                );
                console.log(JSON.stringify({ token, userId: user.id }));
                process.exit(0);
              } catch(e) {
                console.error(e.message);
                process.exit(1);
              }
            })();
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`, {
              cwd: "../server",
              encoding: "utf-8",
              env: { ...process.env },
            });
            // Tìm dòng JSON trong output
            const jsonLine = result.split('\n').find(l => l.trim().startsWith('{'));
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[createUserAndGetToken] Error:", err.stderr || err.message);
            throw err;
          }
        },

        // ─── Task 3: Lấy verification code từ DB ──────────────────────────────
        async getVerificationCode(username) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.findOne({ where: { username: '${username}' }, attributes: ['verificationToken'] })
              .then(u => { console.log(u ? u.verificationToken : 'null'); process.exit(0); })
              .catch(() => process.exit(1));
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
            });
            const lines = result.split('\n').map(l => l.trim());
            const codeLine = lines.find(l => /^\d{6}$/.test(l) || l === 'null');
            return codeLine || null;
          } catch (err) {
            return null;
          }
        },

        async getUserByUsername(username) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.findOne({ where: { username: '${username}' } })
              .then(u => { console.log(JSON.stringify(u ? u.toJSON() : null)); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{') || l === 'null');
            return JSON.parse(jsonLine);
          } catch (err) {
            return null;
          }
        },

        async updateUserExpires({ username, expiredDate }) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.update({ verificationTokenExpires: new Date('${expiredDate}') }, { where: { username: '${username}' } })
              .then(() => { console.log('ok'); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            return false;
          }
        },

        async updateUserAttempts({ username, attempts }) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.update({ verificationAttempts: ${attempts} }, { where: { username: '${username}' } })
              .then(() => { console.log('ok'); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            return false;
          }
        },

        // ─── Task 4: Ban một user theo userId ────────────────────────────────
        async banUser(userId) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.update({ isBanned: true, banReason: 'Cypress E2E test ban' }, { where: { id: '${userId}' } })
              .then(() => { console.log('ok'); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            execSync(`node -e "${script.replace(/\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            return false;
          }
        },

        // ─── Task 5: Tạo expired JWT token ───────────────────────────────────
        async createExpiredToken() {
          const { execSync } = require("child_process");
          const script = `
            const jwt = require('jsonwebtoken');
            const token = jwt.sign(
              { userId: '00000000-0000-0000-0000-000000000001', role: 'student', tokenVersion: 0 },
              process.env.JWT_SECRET,
              { expiresIn: '-1s' }
            );
            console.log(token);
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
              env: { ...process.env },
            });
            return result.trim();
          } catch (err) {
            console.error("[createExpiredToken]", err.message);
            return null;
          }
        },

        // ─── Task 6: Tạo tin nhắn 1-1 giả lập ───────────────────────────────
        async create1to1Message({ senderId, recipientId, encryptedContent = "Encrypted Hello", ratchetKey = "AAAAA", iv = "AAAAAAAAAAAAAAAA", n = 0, pn = 0, isPinned = false, deliveredAt = null }) {
          const { execSync } = require("child_process");
          const script = `
            const { Message } = require('./models');
            (async () => {
              try {
                const msg = await Message.create({
                  senderId: '${senderId}',
                  recipientId: '${recipientId}',
                  encryptedContent: '${encryptedContent}',
                  ratchetKey: ${ratchetKey ? `'${ratchetKey}'` : 'null'},
                  iv: '${iv}',
                  n: ${n},
                  pn: ${pn},
                  isPinned: ${isPinned},
                  deliveredAt: ${deliveredAt ? `'${deliveredAt}'` : 'null'},
                  type: 'text',
                });
                console.log(JSON.stringify(msg.toJSON()));
                process.exit(0);
              } catch (e) {
                console.error(e.message);
                process.exit(1);
              }
            })();
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{'));
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[create1to1Message] Error:", err.message);
            return null;
          }
        },

        // ─── Task 7: Cập nhật role của user ──────────────────────────────────
        async setUserRole({ userId, role }) {
          const { execSync } = require("child_process");
          const script = `
            const { User } = require('./models');
            User.update({ role: '${role}' }, { where: { id: '${userId}' } })
              .then(() => { console.log('ok'); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            execSync(`node -e "${script.replace(/\\n/g, ' ')}"`, { cwd: "../server" });
            return true;
          } catch (err) {
            return false;
          }
        },

        // ─── Task 8: Lấy thông tin prekey trực tiếp từ DB ───────────────────
        async getUserPreKeyInfo(userId) {
          const { execSync } = require("child_process");
          const script = `
            const { PreKey } = require('./models');
            (async () => {
              const signed = await PreKey.findOne({ where: { userId: '${userId}', type: 'signed' }, order: [['createdAt', 'DESC']] });
              const opkCount = await PreKey.count({ where: { userId: '${userId}', type: 'one-time', isUsed: false } });
              console.log(JSON.stringify({ signedKeyId: signed ? signed.keyId : null, availableOpks: opkCount }));
              process.exit(0);
            })();
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\\n/g, ' ')}"`, { cwd: "../server", encoding: "utf-8" });
            const jsonLine = result.split('\\n').find(l => l.trim().startsWith('{'));
            return JSON.parse(jsonLine);
          } catch (err) {
            return null;
          }
        },

        // ─── Task 9: Tạo cặp khóa ECDSA P-256 ───────────────────────────────
        generateECDSAKeyPair() {
          const crypto = require('crypto');
          const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
          });
          return {
            publicKey: publicKey.toString('base64'),
            privateKeyPem: privateKey
          };
        },

        // ─── Task 10: Ký số ECDSA P-256 ─────────────────────────────────────
        signECDSA({ privateKeyPem, data }) {
          const crypto = require('crypto');
          const sign = crypto.sign(
            'sha256',
            Buffer.from(data),
            {
              key: privateKeyPem,
              dsaEncoding: 'ieee-p1363'
            }
          );
          return sign.toString('base64');
        },

        // ─── Task 11: Lấy tin nhắn mới nhất giữa hai user từ DB ───────────────
        async getLastMessage({ senderId, recipientId }) {
          console.log("[TASK] getLastMessage called with:", { senderId, recipientId });
          const { execSync } = require("child_process");
          const script = `
            const { Message } = require('./models');
            Message.findOne({
              where: { senderId: '${senderId}', recipientId: '${recipientId}' },
              order: [['createdAt', 'DESC']]
            }).then(msg => {
              console.log(JSON.stringify(msg ? msg.toJSON() : null));
              process.exit(0);
            }).catch(e => {
              console.error(e.message);
              process.exit(1);
            });
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
              env: { ...process.env }
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{') || l === 'null');
            console.log("[TASK] getLastMessage result line:", jsonLine);
            if (!jsonLine || jsonLine === 'null') {
              return null;
            }
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[getLastMessage] Error:", err.message, err.stderr);
            return null;
          }
        },

        // ─── Task 12: Lấy tin nhắn nhóm mới nhất từ DB ─────────────────────────
        async getLastGroupMessage({ groupId, senderId }) {
          console.log("[TASK] getLastGroupMessage called with:", { groupId, senderId });
          const { execSync } = require("child_process");
          const script = `
            const { GroupMessage } = require('./models');
            GroupMessage.findOne({
              where: { groupId: '${groupId}', senderId: '${senderId}' },
              order: [['createdAt', 'DESC']]
            }).then(msg => {
              console.log(JSON.stringify(msg ? msg.toJSON() : null));
              process.exit(0);
            }).catch(e => {
              console.error(e.message);
              process.exit(1);
            });
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
              env: { ...process.env }
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{') || l === 'null');
            console.log("[TASK] getLastGroupMessage result line:", jsonLine);
            if (!jsonLine || jsonLine === 'null') {
              return null;
            }
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[getLastGroupMessage] Error:", err.message, err.stderr);
            return null;
          }
        },

        // ─── Task 13: Tạo tin nhắn nhóm giả lập ──────────────────────────────
        async createGroupMessage({ groupId, senderId, encryptedContent = "Encrypted Group Hello", ratchetKey = null, iv = "AAAAAAAAAAAAAAAA", n = 0, pn = 0, signature = "AAAA", type = "text", localId = null }) {
          console.log("[TASK] createGroupMessage called with:", { groupId, senderId, n });
          const { execSync } = require("child_process");
          const script = `
            const { GroupMessage } = require('./models');
            (async () => {
              try {
                const msg = await GroupMessage.create({
                  groupId: '${groupId}',
                  senderId: '${senderId}',
                  encryptedContent: '${encryptedContent}',
                  ratchetKey: ${ratchetKey ? `'${ratchetKey}'` : 'null'},
                  iv: '${iv}',
                  n: ${n},
                  pn: ${pn},
                  signature: '${signature}',
                  type: '${type}',
                  localId: ${localId ? `'${localId}'` : 'null'},
                });
                console.log(JSON.stringify(msg.toJSON()));
                process.exit(0);
              } catch (e) {
                console.error(e.message);
                process.exit(1);
              }
            })();
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
              env: { ...process.env }
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{'));
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[createGroupMessage] Error:", err.message, err.stderr);
            return null;
          }
        },

        // ─── Task 14: Xóa tin nhắn nhóm theo groupId và index n ────────────────
        async deleteGroupMessage({ groupId, n }) {
          console.log("[TASK] deleteGroupMessage called with:", { groupId, n });
          const { execSync } = require("child_process");
          const script = `
            const { GroupMessage } = require('./models');
            GroupMessage.destroy({ where: { groupId: '${groupId}', n: ${n} } })
              .then(rows => { console.log(JSON.stringify({ deletedRows: rows })); process.exit(0); })
              .catch(e => { console.error(e.message); process.exit(1); });
          `;
          try {
            const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
              cwd: "../server",
              encoding: "utf-8",
            });
            const lines = result.split('\n').map(l => l.trim());
            const jsonLine = lines.find(l => l.startsWith('{'));
            return JSON.parse(jsonLine);
          } catch (err) {
            console.error("[deleteGroupMessage] Error:", err.message);
            return null;
          }
        }
      });
    },
  },

  component: {
    devServer: {
      framework: "react",
      bundler: "vite",
    },
  },
});
