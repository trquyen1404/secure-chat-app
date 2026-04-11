-- ============================================================
-- Secure Chat App -- Database Schema (v2: X3DH + Double Ratchet)
-- Generated: 2026-04-04
-- ============================================================

-- Users table: stores identity keys (Ed25519 public key as base64)
CREATE TABLE IF NOT EXISTS "Users" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "username"           VARCHAR(255) NOT NULL UNIQUE,
    "password"           VARCHAR(255) NOT NULL,
    "publicKey"          TEXT NOT NULL,         -- ECDSA P-256 identity signing public key (base64)
    "dhPublicKey"        TEXT NOT NULL,         -- X25519 identity DH public key (base64)
    "encryptedPrivateKey" TEXT,                 -- AES-GCM wrapped composite private keys (PIN backup)
    "keyBackupSalt"      VARCHAR(255),
    "keyBackupIv"        VARCHAR(255),
    "avatarUrl"          VARCHAR(255),
    "themeColor"         VARCHAR(255),
    "lastSeenAt"         TIMESTAMP WITH TIME ZONE,
    "online"             BOOLEAN DEFAULT FALSE,
    "tokenVersion"       INTEGER DEFAULT 0,
    "vaultVersion"       INTEGER DEFAULT 1,
    "vaultData"          TEXT,
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL
);

-- PreKeys table: stores Signed PreKeys (SPK) and One-Time PreKeys (OPK) for X3DH
CREATE TABLE IF NOT EXISTS "PreKeys" (
    "id"        UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId"    UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "publicKey" TEXT NOT NULL,          -- X25519 public key (base64)
    "type"      VARCHAR(255) NOT NULL,  -- 'signed' or 'one-time'
    "signature" TEXT,                   -- Ed25519 signature of SPK, signed by IK
    "isUsed"    BOOLEAN DEFAULT FALSE,  -- for one-time keys
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Groups table
CREATE TABLE IF NOT EXISTS "Groups" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "name"        VARCHAR(255) NOT NULL,
    "description" TEXT,
    "avatarUrl"   VARCHAR(255),
    "createdBy"   UUID REFERENCES "Users"("id"),
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL
);

-- GroupMembers table
CREATE TABLE IF NOT EXISTS "GroupMembers" (
    "id"        UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "groupId"   UUID NOT NULL REFERENCES "Groups"("id") ON DELETE CASCADE,
    "userId"    UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "role"      VARCHAR(255) DEFAULT 'member',
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Messages table: uses Double Ratchet headers instead of RSA-wrapped keys
CREATE TABLE IF NOT EXISTS "Messages" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "senderId"         UUID NOT NULL REFERENCES "Users"("id"),
    "recipientId"      UUID NOT NULL REFERENCES "Users"("id"),
    "encryptedContent" TEXT,               -- AES-256-GCM ciphertext (base64)
    "ratchetKey"       TEXT,               -- Sender's current DH ratchet public key (base64)
    "n"                INTEGER NOT NULL DEFAULT 0,   -- Message index in current chain
    "pn"               INTEGER NOT NULL DEFAULT 0,   -- Msg count in previous chain
    "iv"               VARCHAR(255),                 -- AES-GCM IV (base64)
    "senderEk"         TEXT,               -- Ephemeral Key (X25519 base64), ONLY in initial message for X3DH
    "usedOpk"          TEXT,               -- OPK public key (base64) used by sender, ONLY in initial message
    "isDeleted"        BOOLEAN DEFAULT FALSE,
    "replyToId"        UUID,
    "reactions"        JSONB NOT NULL DEFAULT '{}',
    "deliveredAt"      TIMESTAMP WITH TIME ZONE,
    "editedAt"         TIMESTAMP WITH TIME ZONE,
    "editedBy"         UUID,
    "readAt"           TIMESTAMP WITH TIME ZONE,
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for fast message lookup
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON "Messages"("senderId", "recipientId");
CREATE INDEX IF NOT EXISTS idx_messages_created ON "Messages"("createdAt");
