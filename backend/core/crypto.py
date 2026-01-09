import os
import base64
import hashlib
from loguru import logger
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding


def decrypt(encrypted: str, stored_secret: str) -> str:
    try:
        data = base64.b64decode(encrypted)
        iv, ciphertext = data[:16], data[16:]
        key = hashlib.sha256(stored_secret.encode()).digest()
        
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), default_backend())
        padded = cipher.decryptor().update(ciphertext) + cipher.decryptor().finalize()
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(padded) + unpadder.finalize()).decode()
    except Exception as e:
        logger.error(f"解密失败: {e}")
        raise ValueError("解密失败，密钥不正确") from e


def encrypt_for_test(raw: str, secret: str) -> str:
    iv = os.urandom(16)
    key = hashlib.sha256(secret.encode()).digest()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), default_backend())
    padder = padding.PKCS7(128).padder()
    padded = padder.update(raw.encode()) + padder.finalize()
    ciphertext = cipher.encryptor().update(padded) + cipher.encryptor().finalize()
    return base64.b64encode(iv + ciphertext).decode()
