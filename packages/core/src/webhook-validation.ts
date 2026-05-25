export const PRIVATE_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|::1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|fc00:|fe80:|0\.0\.0\.0)/i

export function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_REGEX.test(hostname)
}
