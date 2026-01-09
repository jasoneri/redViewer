import CryptoJS from 'crypto-js'

export const encrypt = (raw) => {
  try {
    const iv = CryptoJS.lib.WordArray.random(16)
    const key = CryptoJS.SHA256(raw.split(':')[0])
    const encrypted = CryptoJS.AES.encrypt(raw, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    })
    
    const combined = iv.toString(CryptoJS.enc.Hex) + encrypted.ciphertext.toString(CryptoJS.enc.Hex)
    return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(combined))
  } catch (error) {
    console.error('fail:', error)
    throw new Error('process failed')
  }
}

export const passThroughEncrypt = encrypt