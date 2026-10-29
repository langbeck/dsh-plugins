/** Deterministic structural risk analysis for tool inputs. */

const HARD_RULES = [
  { pattern: /\brm\s+(?:-[a-z]*[rf][a-z]*\s+)+(?:\/|~|\$HOME|\*)(?:\s|$)/i, reason: 'recursive removal of a root or home path' },
  { pattern: /--no-preserve-root\b/i, reason: 'removal with --no-preserve-root' },
  { pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/i, reason: 'filesystem formatting' },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\//i, reason: 'raw write to a device' },
  { pattern: /\b(?:curl|wget)\b[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba|z|k|fi|da)?sh\b/i, reason: 'downloaded content piped to a shell' },
  { pattern: /\/dev\/tcp\//i, reason: 'reverse-shell device redirection' },
  { pattern: /\bnc(?:at)?\b[^\n]*\s-e\s/i, reason: 'netcat command execution' },
  { pattern: /\bsocat\b[^\n]*\bexec:/i, reason: 'socat command execution' },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i, reason: 'fork bomb' },
  { pattern: /\bchmod\s+(?:-R\s+)?777\s+\/(?:\s|$)/i, reason: 'world-writable root path' },
  { pattern: /\bchown\s+-R\s+root\s+\/(?:\s|$)/i, reason: 'recursive root ownership change' },
  { pattern: /\b(?:systemctl|service)\s+(?:disable|mask)\s+(?:ssh|sshd|auditd)\b/i, reason: 'security-service disabling' },
]

const SCORE_RULES = [
  { pattern: /\|\s*(?:sudo\s+)?(?:ba|z|k|fi|da)?sh\b/i, weight: 0.45, reason: 'pipe to shell' },
  { pattern: /\beval\b/i, weight: 0.35, reason: 'eval execution' },
  { pattern: /\b(?:ba|z|k)?sh\s+-c\b/i, weight: 0.2, reason: 'nested shell invocation' },
  { pattern: /\b(?:base64|xxd)\b[^\n]*(?:-d|--decode|-r)\b/i, weight: 0.35, reason: 'decoded payload' },
  { pattern: /\b(?:curl|wget)\b/i, weight: 0.15, reason: 'network download' },
  { pattern: /\b(?:rm|unlink|shred)\b/i, weight: 0.3, reason: 'destructive file operation' },
  { pattern: /\b(?:sudo|doas|pkexec)\b/i, weight: 0.2, reason: 'privilege escalation' },
  { pattern: /\b(?:chmod|chown|setfacl)\b/i, weight: 0.15, reason: 'permission mutation' },
  { pattern: /\b(?:nc|ncat|socat|telnet)\b/i, weight: 0.3, reason: 'network shell utility' },
  { pattern: /\b(?:python[23]?|perl|ruby|node)\s+-[ce]\b/i, weight: 0.25, reason: 'inline interpreter execution' },
  { pattern: /\b(?:ssh|scp|rsync)\b/i, weight: 0.1, reason: 'remote transfer' },
  { pattern: /\b(?:\.ssh\/|\.aws\/|\.env\b|credentials|id_rsa)\b/i, weight: 0.25, reason: 'sensitive credential path' },
  { pattern: /\b(?:history\s+-c|unset\s+HISTFILE)\b/i, weight: 0.25, reason: 'history suppression' },
  { pattern: /(?:>>?|\btee\b)\s*(?:\/etc\/|\/root\/)/i, weight: 0.25, reason: 'write to a protected path' },
  { pattern: /\$\(|\`/i, weight: 0.1, reason: 'command substitution' },
  { pattern: /[;&|]{2,}/i, weight: 0.05, reason: 'chained command operators' },
  { pattern: /\b(?:curl|wget)\b[^\n]*\s-o\s+\S+/i, weight: 0.1, reason: 'download to disk' },
  { pattern: /\b(?:nc|ncat|socat)\b[^\n]*(?:-l|--listen)/i, weight: 0.25, reason: 'listening socket' },
  { pattern: /\b(?:kill|pkill|killall)\s+-9\b/i, weight: 0.15, reason: 'forced process termination' },
  { pattern: /\b(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+instructions\b/i, weight: 0.4, reason: 'instruction override text' },
]

/** Analyze one command or text payload. */
export function analyzeStructural(input, kind = 'shell') {
  const raw = typeof input === 'string' ? input : ''
  const text = raw.replaceAll('\u0000', '').slice(0, 65_536)
  const reasons = []
  let score = 0
  let hardBlock = false
  for (const rule of HARD_RULES) {
    if (!rule.pattern.test(text)) continue
    hardBlock = true
    reasons.push(rule.reason)
  }
  for (const rule of SCORE_RULES) {
    if (!rule.pattern.test(text)) continue
    score += rule.weight
    if (!reasons.includes(rule.reason)) reasons.push(rule.reason)
  }
  if (text.trim().length > 2048) score += 0.1
  if (kind !== 'shell' && text.trim().length > 8192) score += 0.1
  return {
    score: Math.min(1, Math.round(score * 1000) / 1000),
    hardBlock,
    reasons,
  }
}
