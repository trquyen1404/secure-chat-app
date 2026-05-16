/**
 * Lightweight Client-Side Moderation for UTT Secure Chat
 */

const TOXIC_KEYWORDS = [
  'spam', 'scam', 'hack', 'phishing', 
  // Add common toxic words in Vietnamese/English
  'chửi', 'bậy', 'xấu' 
];

const MALICIOUS_LINKS = [
  'bit.ly', 'goo.gl', 't.co' // Example of link shorteners often used for spam
];

export const moderateMessage = (text) => {
  if (!text) return { isClean: true };

  const lowerText = text.toLowerCase();
  
  // 1. Basic Spam/Toxic Keyword Detection
  const foundKeywords = TOXIC_KEYWORDS.filter(word => lowerText.includes(word));
  if (foundKeywords.length > 0) {
    return {
      isClean: false,
      reason: 'Tin nhắn chứa từ ngữ không phù hợp hoặc có dấu hiệu spam.',
      type: 'TOXIC'
    };
  }

  // 2. Link Detection (Basic)
  const urlPattern = /https?:\/\/[^\s]+/g;
  const links = text.match(urlPattern);
  if (links) {
    for (const link of links) {
      if (MALICIOUS_LINKS.some(bad => link.includes(bad))) {
        return {
          isClean: false,
          reason: 'Tin nhắn chứa liên kết rút gọn tiềm ẩn nguy cơ bảo mật.',
          type: 'MALICIOUS_LINK'
        };
      }
    }
  }

  // 3. Flood Protection (Message length)
  if (text.length > 2000) {
    return {
      isClean: false,
      reason: 'Tin nhắn quá dài (giới hạn 2000 ký tự).',
      type: 'FLOOD'
    };
  }

  return { isClean: true };
};
